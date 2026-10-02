import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DJ_SET_SITES, djSetTitle, parseDjSetUrl, partyVolume, sameDjSet, type DjSet, type DjSetState } from '../shared/djset.js';
import { validTap, type DjBeats, type DjTap } from '../shared/djbeats.js';
import { DjBeatsJobs, type Hear } from './djbeats/index.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import { CHANGE_EVERY, LinkPlayer, oembed, type TitleLookup as LookupOf } from './embeds.js';

/*
 * DJ sets on the roof (flrnoh fork, see FORK.md). The roof has no Floor of its own, so the office
 * keeps one booth for the whole building, saved in its data folder as dj.json. Like the jukebox it
 * only says what's on and since when; every browser on the roof plays it in the site's own player.
 * What's kept and how is embeds.ts's, shared with the office TV (tv.ts).
 */

/** Asks the site what a set is called; undefined when it won't say. */
export type TitleLookup = LookupOf<DjSet>;

/** The least time between two changes by one person (ms): enough for a tap on Play, not for a flood. */
export const DJ_CHANGE_EVERY = CHANGE_EVERY;

const OEMBED: Record<DjSet['kind'], string> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
  mixcloud: 'https://app.mixcloud.com/oembed/?format=json&url=',
};

/** The site's oEmbed answer for the set's own (tidied) link, from these three hosts only; a few seconds at most. */
export const oembedTitle: TitleLookup = (set) => oembed(OEMBED[set.kind], set.url);

export class DjBooth extends LinkPlayer<DjSet> {
  /** Hearing the sets, for the lights (djbeats/). */
  private beats: DjBeatsJobs;
  /** A tempo tapped for the set that's on. */
  private tapped: DjTap | null = null;
  /** How hearing the set that's on is going changed: the office tells the roof (fork/office.ts). */
  onBeats: () => void = () => {};
  /** The party's volume for everyone on the roof, and who set it (kept in dj-volume.json). */
  private level = 1;
  private levelBy = '';
  private levelFile: string;

  constructor(dataDir: string, lookup: TitleLookup = oembedTitle, hear?: Hear) {
    super({ file: path.join(dataDir, 'dj.json'), parse: parseDjSetUrl, same: sameDjSet, lookup });
    this.levelFile = path.join(dataDir, 'dj-volume.json');
    try {
      const saved = JSON.parse(readFileSync(this.levelFile, 'utf8')) as { volume?: unknown; by?: unknown };
      this.level = partyVolume(saved.volume) ?? 1;
      this.levelBy = typeof saved.by === 'string' ? saved.by.slice(0, 24) : '';
    } catch {
      // none yet: full volume
    }
    this.beats = new DjBeatsJobs(dataDir, (url) => url === super.state().set?.url && this.onBeats(), hear);
    // A set still on from before a restart is heard again (or read back).
    this.beats.want(super.state().set);
  }

  override state(): DjSetState {
    const s = super.state();
    const beats = s.set ? this.beats.statusOf(s.set.url) : undefined;
    return {
      ...s,
      ...(beats ? { beats } : {}),
      ...(s.set && this.tapped ? { tap: this.tapped } : {}),
      ...(this.level !== 1 || this.levelBy ? { volume: this.level, ...(this.levelBy ? { volumeBy: this.levelBy } : {}) } : {}),
    };
  }

  /** Sets the party's volume for everyone on the roof; false when it's no volume or already that. */
  setVolume(v: unknown, by: string): boolean {
    const level = partyVolume(v);
    if (level === null || (level === this.level && by === this.levelBy)) return false;
    this.level = level;
    this.levelBy = by;
    try {
      writeFileSync(this.levelFile, JSON.stringify({ volume: level, by }), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
    return true;
  }

  override play(raw: unknown, by: string) {
    const r = super.play(raw, by);
    if ('changed' in r && r.changed) {
      this.tapped = null;
      this.beats.want(super.state().set);
    }
    return r;
  }

  override stop(by: string): boolean {
    this.tapped = null;
    this.beats.want(null);
    return super.stop(by);
  }

  /** What was heard in the set that's on, once it has been. */
  heard(): DjBeats | null {
    const set = super.state().set;
    return set && this.beats.statusOf(set.url)?.status === 'ready' ? this.beats.get(set.url) : null;
  }

  /** A tempo tapped at the booth (0: back to what was heard). False when nothing's on or it's no tempo. */
  tap(bpm: number, at: number): boolean {
    if (!super.state().set) return false;
    if (bpm === 0) {
      const had = !!this.tapped;
      this.tapped = null;
      return had;
    }
    if (!validTap(bpm, at)) return false;
    this.tapped = { bpm: Math.round(bpm * 10) / 10, at: Math.round(at) };
    return true;
  }
}

export interface DjHooks {
  /** The sender's client id, name, and whether they're on the roof now. */
  id: string;
  who: string;
  onRoof: boolean;
  /** To everyone on the roof. */
  toRoof(msg: ServerMsg): void;
  /** Just to the sender, when it didn't happen. */
  warn(text: string): void;
}

/**
 * dj.play, dj.stop and dj.tap, from someone's page: only from up on the roof, not too often. dj.volume
 * (the party's volume, the team's to set: guests.ts) from anywhere, as often as a slider sends it.
 */
export function djMessage(booth: DjBooth, msg: Extract<ClientMsg, { t: 'dj.play' | 'dj.stop' | 'dj.tap' | 'dj.volume' }>, c: DjHooks) {
  if (msg.t === 'dj.volume') {
    if (booth.setVolume(msg.volume, c.who)) c.toRoof({ t: 'dj', state: booth.state() });
    return;
  }
  if (!c.onRoof) return c.warn('Head up to the roof to pick what the DJ plays');
  if (msg.t === 'dj.tap') {
    if (!booth.state().set) return c.warn('Tap the tempo once a set is on');
    if (!booth.allow(`tap:${c.id}`)) return c.warn('Easy there, give the DJ a moment');
    if (!booth.tap(msg.bpm, msg.at)) return;
    c.toRoof({ t: 'dj', state: booth.state() });
    return c.toRoof({ t: 'toast', text: msg.bpm ? `🥁 ${c.who} tapped the tempo: ${Math.round(msg.bpm)} BPM` : `🥁 ${c.who} put the lights back on the set's own beat`, level: 'info' });
  }
  if (msg.t === 'dj.stop') {
    if (!booth.allow(c.id)) return c.warn('Easy there, give the DJ a moment');
    if (!booth.stop(c.who)) return;
    c.toRoof({ t: 'dj', state: booth.state() });
    return c.toRoof({ t: 'toast', text: `🎧 ${c.who} gave the decks back to the house DJ`, level: 'info' });
  }
  const parsed = parseDjSetUrl(msg.url);
  if ('error' in parsed) return c.warn(parsed.error);
  if (sameDjSet(booth.state().set, parsed)) return c.warn('That set is already on');
  if (!booth.allow(c.id)) return c.warn('Easy there, give the DJ a moment');
  const r = booth.play(msg.url, c.who);
  if ('error' in r) return c.warn(r.error);
  if (!r.changed) return c.warn('That set is already on');
  const { startedAt } = booth.state();
  c.toRoof({ t: 'dj', state: booth.state() });
  void r.titled.then(() => {
    const now = booth.state();
    // Only if it's still the one they put on.
    if (!now.set || now.startedAt !== startedAt) return;
    if (now.set.title) c.toRoof({ t: 'dj', state: now });
    c.toRoof({ t: 'toast', text: `🎧 ${c.who} put on a set: ${now.set.title ? djSetTitle(now.set) : `from ${DJ_SET_SITES[now.set.kind]}`}`, level: 'info' });
  });
}

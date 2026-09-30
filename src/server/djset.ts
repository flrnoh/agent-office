import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DJ_SET_SITES, djSetTitle, parseDjSetUrl, sameDjSet, type DjSet, type DjSetState } from '../shared/djset.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';

/*
 * DJ sets on the roof (flrnoh fork, see FORK.md). The roof has no Floor of its own, so the office
 * keeps one booth for the whole building, saved in its data folder as dj.json. Like the jukebox it
 * only says what's on and since when; every browser on the roof plays it in the site's own player.
 */

interface Saved {
  set: DjSet | null;
  by?: string;
  startedAt: number;
}

/** Asks the site what a set is called; undefined when it won't say. */
export type TitleLookup = (set: DjSet) => Promise<string | undefined>;

/** The least time between two changes by one person (ms): enough for a tap on Play, not for a flood. */
export const DJ_CHANGE_EVERY = 3000;

const OEMBED: Record<DjSet['kind'], string> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
  mixcloud: 'https://app.mixcloud.com/oembed/?format=json&url=',
};

/** The site's oEmbed answer for the set's own (tidied) link, from these three hosts only; a few seconds at most. */
export const oembedTitle: TitleLookup = async (set) => {
  try {
    const res = await fetch(OEMBED[set.kind] + encodeURIComponent(set.url), { signal: AbortSignal.timeout(4000), redirect: 'follow' });
    if (!res.ok) return undefined;
    const text = await res.text();
    if (text.length > 200_000) return undefined;
    const title = (JSON.parse(text) as { title?: unknown }).title;
    return typeof title === 'string' ? cleanTitle(title) : undefined;
  } catch {
    return undefined;
  }
};

const cleanTitle = (t: string): string | undefined => t.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined;

export class DjBooth {
  private s: Saved = { set: null, startedAt: Date.now() };
  private file: string;
  /** When each person last changed the set (by client id), for DJ_CHANGE_EVERY. */
  private lastChange = new Map<string, number>();

  constructor(
    dataDir: string,
    private lookup: TitleLookup = oembedTitle,
  ) {
    this.file = path.join(dataDir, 'dj.json');
    this.load();
  }

  state(): DjSetState {
    const { set, by, startedAt } = this.s;
    return { set, ...(by ? { by } : {}), startedAt, elapsed: Math.max(0, Date.now() - startedAt) };
  }

  /**
   * Puts on the set a link points to. The same set again changes nothing (it plays on); a link it
   * can't play says why. `titled` resolves once the site has said what it's called (or wouldn't).
   */
  play(raw: unknown, by: string): { changed: false } | { changed: true; titled: Promise<void> } | { error: string } {
    const set = parseDjSetUrl(raw);
    if ('error' in set) return set;
    if (sameDjSet(this.s.set, set)) return { changed: false };
    this.s = { set, by, startedAt: Date.now() };
    this.save();
    return { changed: true, titled: this.fetchTitle(set) };
  }

  /** The house DJ back on; false when it already was. */
  stop(by: string): boolean {
    if (!this.s.set) return false;
    this.s = { set: null, by, startedAt: Date.now() };
    this.save();
    return true;
  }

  /** Whether `who` may change the set now (and, if so, counts it). */
  allow(who: string, now = Date.now()): boolean {
    const last = this.lastChange.get(who) ?? -Infinity;
    if (now - last < DJ_CHANGE_EVERY) return false;
    this.lastChange.set(who, now);
    for (const [k, t] of this.lastChange) if (now - t > 60_000) this.lastChange.delete(k);
    return true;
  }

  private async fetchTitle(set: DjSet): Promise<void> {
    const title = await this.lookup(set).catch(() => undefined);
    // Someone may have put another one on while the site was answering.
    if (!title || this.s.set !== set) return;
    this.s = { ...this.s, set: { ...set, title } };
    this.save();
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>;
      const startedAt = typeof s.startedAt === 'number' && Number.isFinite(s.startedAt) ? s.startedAt : Date.now();
      const by = typeof s.by === 'string' ? s.by.slice(0, 24) : undefined;
      // Read back through the same check as a pasted link, so a hand-edited file can't smuggle anything in.
      const parsed = s.set && typeof s.set === 'object' ? parseDjSetUrl(s.set.url) : null;
      const set = parsed && !('error' in parsed) ? { ...parsed, ...(typeof s.set?.title === 'string' && cleanTitle(s.set.title) ? { title: cleanTitle(s.set.title) } : {}) } : null;
      this.s = { set, ...(by ? { by } : {}), startedAt };
    } catch {
      // a broken file just means the house DJ plays
    }
  }

  private save() {
    try {
      writeFileSync(this.file, JSON.stringify(this.s, null, 2), { mode: 0o600 });
    } catch {
      // disk issues shouldn't take the office down
    }
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

/** dj.play and dj.stop, from someone's page: only from up on the roof, not too often. */
export function djMessage(booth: DjBooth, msg: Extract<ClientMsg, { t: 'dj.play' | 'dj.stop' }>, c: DjHooks) {
  if (!c.onRoof) return c.warn('Head up to the roof to pick what the DJ plays');
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

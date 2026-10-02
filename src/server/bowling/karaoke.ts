import { SONG_BY_ID } from '../../shared/karaoke-songs.js';
import { songSeconds } from '../../shared/karaoke-music.js';
import {
  CHEER_GAP,
  LEAD_MS,
  MIN_RATED_MS,
  PER_PERSON,
  QUEUE_MAX,
  RATE_MS,
  UP_MS,
  VIDEO_MAX_MS,
  parseKaraokeLink,
  pickTitle,
  singersOf,
  type KaraokeClientMsg,
  type KaraokeEntry,
  type KaraokePick,
  type KaraokeServerMsg,
  type KaraokeState,
  type KaraokeTurn,
} from '../../shared/karaoke.js';
import type { TvStream } from '../../shared/tv.js';
import type { TitleLookup } from '../embeds.js';
import { KaraokeCharts } from './karaoke-board.js';

/*
 * The karaoke bar in the bowling centre (flrnoh fork, see FORK.md "Karaoke"), on the server: the
 * song list (one of the bar's own songs or a YouTube karaoke video, a couple each), whose turn it is,
 * who holds the two mics, the rating after each song and the week's board (karaoke-board.ts).
 *
 * A turn goes: `up` (the first in the queue is called to the stage and has UP_MS to take a mic, else
 * they're skipped), `singing` (from taking the mic: the band starts LEAD_MS later on everyone's page,
 * from the office's clock; one of the bar's songs ends when it's over, a video when the singer's page
 * says so or after VIDEO_MAX_MS), `rating` (everyone else in the centre gives it 1–5 🔥 for RATE_MS),
 * then the next. Putting the mic back, or leaving, ends your song. Everything here goes to everyone
 * in the centre: the page draws the queue, the screen, the lights and the PA from it.
 */

export interface KaraokeMember {
  id: string;
  name: string;
  /** Who they are for the board: `account:<id>` or `name:<name>`. */
  owner: string;
}

type Toast = { t: 'toast'; text: string; level: 'info' | 'warn' };

export interface KaraokeDeps {
  /** To everyone in the bowling centre (but `except`). */
  toAll(m: KaraokeServerMsg | Toast, except?: string): void;
  /** To one of them. */
  toOne(id: string, m: KaraokeServerMsg | Toast): void;
  /** Who's in the centre now (client ids). */
  present(): string[];
  now?: () => number;
  /** Runs its own timer (the default); tests call `tick`. */
  timer?: boolean;
  /** Where the board is kept (karaoke.json); none: in memory only. */
  dataDir?: string;
  /** A video's title (YouTube's oEmbed). */
  lookup?: TitleLookup<TvStream>;
}

const warn = (text: string): Toast => ({ t: 'toast', text, level: 'warn' });
const info = (text: string): Toast => ({ t: 'toast', text, level: 'info' });

export class Karaoke {
  private queue: KaraokeEntry[] = [];
  private turn: KaraokeTurn | null = null;
  private mics: [string | null, string | null] = [null, null];
  /** The rating's votes, by voter. */
  private votes = new Map<string, number>();
  /** Who sang the turn being rated (for the board), worked out when the singing ends. */
  private sang: KaraokeMember[] = [];
  private members = new Map<string, KaraokeMember>();
  private nextId = 1;
  private lastCheer = new Map<string, number>();
  private lastQueue = new Map<string, number>();
  readonly charts: KaraokeCharts;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: KaraokeDeps) {
    this.now = deps.now ?? Date.now;
    this.charts = new KaraokeCharts(deps.dataDir, this.now);
  }

  state(): KaraokeState {
    return {
      queue: this.queue.map((e) => ({ ...e })),
      turn: this.turn ? { ...this.turn } : null,
      mics: [...this.mics],
      board: this.charts.board(),
    };
  }

  /** A message from someone in the centre. */
  message(m: KaraokeMember, msg: KaraokeClientMsg) {
    this.members.set(m.id, m);
    switch (msg.t) {
      case 'karaoke.hello':
        return this.deps.toOne(m.id, { t: 'karaoke', state: this.state() });
      case 'karaoke.queue':
        return this.enqueue(m, msg);
      case 'karaoke.unqueue': {
        const i = this.queue.findIndex((e) => e.id === msg.id && e.who === m.id);
        if (i < 0) return;
        this.queue.splice(i, 1);
        return this.changed();
      }
      case 'karaoke.mic':
        return this.mic(m, msg.mic, msg.take);
      case 'karaoke.stop': {
        const t = this.turn;
        if (!t || t.who !== m.id || t.phase === 'rating') return;
        if (t.phase === 'up') {
          this.turn = null;
          this.deps.toAll(info(`🎤 ${m.name} lässt diesmal aus`));
          return this.next();
        }
        return this.endSong(true);
      }
      case 'karaoke.done': {
        const t = this.turn;
        if (!t || t.who !== m.id || t.phase !== 'singing' || t.pick.kind !== 'video') return;
        if (msg.failed) this.deps.toAll(warn(`🎤 Das Video von ${m.name} spielt hier nicht: weiter geht's`));
        return this.endSong(!msg.failed);
      }
      case 'karaoke.rate':
        return this.rate(m, msg.stars);
      case 'karaoke.cheer': {
        const now = this.now();
        if (now - (this.lastCheer.get(m.id) ?? -Infinity) < CHEER_GAP) return;
        this.lastCheer.set(m.id, now);
        return this.deps.toAll({ t: 'karaoke.cheer', id: m.id, kind: msg.kind === 'whoo' ? 'whoo' : 'clap' }, m.id);
      }
    }
  }

  /** Someone left the centre (or the office): their songs out of the queue, their mic back, their turn over. */
  leave(id: string) {
    try {
      this.letGo(id);
    } finally {
      this.members.delete(id);
      this.lastCheer.delete(id);
      this.lastQueue.delete(id);
    }
  }

  private letGo(id: string) {
    let changed = false;
    const before = this.queue.length;
    this.queue = this.queue.filter((e) => e.who !== id);
    if (this.queue.length !== before) changed = true;
    const lead = this.turn && this.turn.who === id && this.turn.phase !== 'rating';
    for (let i = 0; i < 2; i++) {
      if (this.mics[i] === id) {
        this.mics[i] = null;
        changed = true;
      }
    }
    if (lead && this.turn) {
      if (this.turn.phase === 'up') this.turn = null;
      else return this.endSong(false);
      return this.next();
    }
    if (changed) this.changed();
  }

  /** Moves things on that are due (the timer calls it; tests call it with their own clock). */
  tick() {
    const t = this.turn;
    if (!t || this.now() < t.until) return this.schedule();
    if (t.phase === 'up') {
      this.turn = null;
      this.deps.toAll(info(`🎤 ${t.name} ist nicht aufgetaucht: weiter geht's`));
      return this.next();
    }
    if (t.phase === 'singing') return this.endSong(true);
    this.finishRating();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ---- The queue --------------------------------------------------------------------------------------

  private enqueue(m: KaraokeMember, msg: Extract<KaraokeClientMsg, { t: 'karaoke.queue' }>) {
    let pick: KaraokePick;
    if (typeof msg.song === 'string' && msg.song) {
      if (!SONG_BY_ID.has(msg.song)) return this.deps.toOne(m.id, warn('Den Song gibt es hier nicht'));
      pick = { kind: 'song', id: msg.song };
    } else {
      const v = parseKaraokeLink(msg.url);
      if ('error' in v) return this.deps.toOne(m.id, warn(v.error));
      pick = { kind: 'video', video: v };
    }
    if (this.queue.filter((e) => e.who === m.id).length >= PER_PERSON) return this.deps.toOne(m.id, warn(`Höchstens ${PER_PERSON} Songs pro Person in der Liste`));
    if (this.queue.length >= QUEUE_MAX) return this.deps.toOne(m.id, warn('Die Liste ist voll: erst mal zuhören'));
    const now = this.now();
    if (now - (this.lastQueue.get(m.id) ?? -Infinity) < 1500) return this.deps.toOne(m.id, warn('Langsam, einer nach dem anderen'));
    this.lastQueue.set(m.id, now);
    const entry: KaraokeEntry = { id: this.nextId++, who: m.id, name: m.name.slice(0, 40), pick };
    this.queue.push(entry);
    this.deps.toAll(info(`🎤 ${entry.name} hat sich eingetragen: ${pickTitle(pick)}`));
    if (pick.kind === 'video' && this.deps.lookup) void this.title(entry.id, pick.video);
    if (!this.turn) return this.next();
    this.changed();
  }

  /** The video's title, once YouTube says, wherever its entry is by then. */
  private async title(id: number, video: TvStream) {
    const title = await this.deps.lookup!(video).catch(() => undefined);
    if (!title) return;
    const entry = this.queue.find((e) => e.id === id) ?? (this.turn?.id === id ? this.turn : null);
    if (!entry || entry.pick.kind !== 'video') return;
    entry.pick = { kind: 'video', video: { ...entry.pick.video, title } };
    this.changed();
  }

  /** The next in the queue is called up (if nobody's on). */
  private next() {
    if (this.turn || !this.queue.length) return this.changed();
    const e = this.queue.shift()!;
    const now = this.now();
    this.turn = { ...e, phase: 'up', startedAt: now, until: now + UP_MS };
    this.votes.clear();
    this.sang = [];
    this.deps.toOne(e.who, info(`🎤 Du bist dran mit ${pickTitle(e.pick)}! Ab auf die Bühne und ein Mikro nehmen`));
    // Already up there with a mic: off they go.
    if (this.mics.includes(e.who)) return this.startSong();
    this.changed();
  }

  // ---- Mics and songs -------------------------------------------------------------------------------

  private mic(m: KaraokeMember, i: number, take: boolean) {
    if (i !== 0 && i !== 1) return;
    if (!take) {
      if (this.mics[i] !== m.id) return;
      this.mics[i] = null;
      const t = this.turn;
      // The lead putting their mic down ends their song.
      if (t && t.phase === 'singing' && t.who === m.id && !this.mics.includes(m.id)) return this.endSong(true);
      return this.changed();
    }
    const holder = this.mics[i];
    if (holder === m.id) return;
    if (holder) return this.deps.toOne(m.id, warn(`Das Mikro hat gerade ${this.members.get(holder)?.name ?? 'jemand'}`));
    // One mic at a time: taking the other puts yours back.
    const other = 1 - i;
    if (this.mics[other] === m.id) this.mics[other] = null;
    this.mics[i] = m.id;
    if (this.turn?.phase === 'up' && this.turn.who === m.id) return this.startSong();
    this.changed();
  }

  private startSong() {
    const t = this.turn!;
    const at = this.now() + LEAD_MS;
    const song = t.pick.kind === 'song' ? SONG_BY_ID.get(t.pick.id) : undefined;
    const len = song ? Math.ceil(songSeconds(song) * 1000) + 800 : VIDEO_MAX_MS;
    this.turn = { ...t, phase: 'singing', startedAt: at, until: at + len };
    this.deps.toAll(info(`🎤 Bühne frei für ${t.name}: ${pickTitle(t.pick)}`));
    this.changed();
  }

  /** The singing's over: to the rating if it went on long enough and there's anyone to rate it, else the next. */
  private endSong(rate: boolean) {
    const t = this.turn;
    if (!t || t.phase !== 'singing') return;
    const now = this.now();
    this.sang = singersOf({ turn: t, mics: this.mics })
      .map((id) => this.members.get(id) ?? (id === t.who ? { id, name: t.name, owner: `name:${t.name}` } : null))
      .filter((m): m is KaraokeMember => !!m);
    const sung = now - t.startedAt;
    const listeners = this.deps.present().filter((id) => !this.sang.some((s) => s.id === id));
    if (rate && sung >= MIN_RATED_MS && listeners.length > 0) {
      this.votes.clear();
      this.turn = { ...t, phase: 'rating', startedAt: now, until: now + RATE_MS, votes: 0, avg: 0 };
      return this.changed();
    }
    if (sung >= MIN_RATED_MS) for (const s of this.sang) this.charts.record(s.owner, s.name, 0, 0);
    this.turn = null;
    this.next();
  }

  private rate(m: KaraokeMember, stars: number) {
    const t = this.turn;
    if (!t || t.phase !== 'rating' || this.sang.some((s) => s.id === m.id)) return;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return;
    this.votes.set(m.id, stars);
    const all = [...this.votes.values()];
    this.turn = { ...t, votes: all.length, avg: Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 };
    // Everyone who can has voted: no need to wait.
    const can = this.deps.present().filter((id) => !this.sang.some((s) => s.id === id));
    if (can.every((id) => this.votes.has(id))) return this.finishRating();
    this.changed();
  }

  private finishRating() {
    const t = this.turn;
    if (!t || t.phase !== 'rating') return;
    const votes = this.votes.size;
    const avg = votes ? [...this.votes.values()].reduce((a, b) => a + b, 0) / votes : 0;
    for (const s of this.sang) this.charts.record(s.owner, s.name, avg, votes);
    const lead = this.sang[0];
    const king = !!lead && votes > 0 && this.charts.leads(lead.owner);
    this.deps.toAll({ t: 'karaoke.rated', name: this.sang.map((s) => s.name).join(' & ') || t.name, title: pickTitle(t.pick), avg: Math.round(avg * 10) / 10, votes, king });
    this.turn = null;
    this.votes.clear();
    this.sang = [];
    this.next();
  }

  private changed() {
    this.deps.toAll({ t: 'karaoke', state: this.state() });
    this.schedule();
  }

  private schedule() {
    if (this.deps.timer === false) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.turn) return;
    this.timer = setTimeout(() => this.tick(), Math.max(0, this.turn.until - this.now()) + 20);
    this.timer.unref?.();
  }
}

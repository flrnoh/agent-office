import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BOARD_SIZE, weekKey, type KaraokeBoard, type KaraokeLeader } from '../../shared/karaoke.js';

/*
 * The karaoke bar's "Karaoke-König(in) der Woche" (flrnoh fork, see FORK.md "Karaoke"): per person
 * (`account:<id>`, or `name:<name>` on the shared password, like the soccer hall's stats) the songs
 * they sang this ISO week and the 🔥 the room gave them. A new week starts the board afresh, and the
 * old week's best is kept as last week's king or queen. Saved in the office's data folder as
 * karaoke.json (0600, written beside it and moved over it); without a folder (the tests) in memory only.
 */

interface Singer {
  name: string;
  songs: number;
  /** Songs that got votes, their averages added up, and the best one. */
  rated: number;
  points: number;
  best: number;
}

/** People kept at most in a week (the oldest go first). */
const KEPT = 2000;

const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The board's order: points, then the best song, then more songs, then name. */
export function rankSingers(a: KaraokeLeader, b: KaraokeLeader): number {
  return b.points - a.points || b.best - a.best || b.songs - a.songs || a.name.localeCompare(b.name);
}

export class KaraokeCharts {
  private week: string;
  private singers = new Map<string, Singer>();
  private last: KaraokeBoard['last'];
  private file: string | null;
  private cache: KaraokeBoard | null = null;

  constructor(
    dataDir?: string,
    private now: () => number = Date.now,
  ) {
    this.file = dataDir ? path.join(dataDir, 'karaoke.json') : null;
    this.week = weekKey(this.now());
    this.load();
    this.roll();
  }

  /** A song is over: `owner` sang it, and the room gave it `avg` 🔥 from `votes` votes (0 votes: not rated). */
  record(owner: string, name: string, avg: number, votes: number) {
    this.roll();
    const s = this.singers.get(owner) ?? { name, songs: 0, rated: 0, points: 0, best: 0 };
    s.name = name.slice(0, 40);
    s.songs += 1;
    if (votes > 0) {
      const a = Math.max(1, Math.min(5, avg));
      s.rated += 1;
      s.points = round1(s.points + a);
      s.best = Math.max(s.best, round1(a));
    }
    // Most recent to the back, so the oldest are the ones trimmed.
    this.singers.delete(owner);
    this.singers.set(owner, s);
    for (const k of this.singers.keys()) {
      if (this.singers.size <= KEPT) break;
      this.singers.delete(k);
    }
    this.cache = null;
    this.save();
  }

  /** Whether `owner` leads the week now. */
  leads(owner: string): boolean {
    const top = this.ranked()[0];
    return !!top && top[0] === owner;
  }

  board(): KaraokeBoard {
    this.roll();
    if (!this.cache) {
      const top = this.ranked()
        .slice(0, BOARD_SIZE)
        .map(([, l]) => l);
      this.cache = { week: this.week, top, ...(this.last ? { last: this.last } : {}) };
    }
    return { ...this.cache, top: this.cache.top.map((l) => ({ ...l })) };
  }

  private ranked(): [string, KaraokeLeader][] {
    return [...this.singers]
      .filter(([, s]) => s.songs > 0)
      .map(([owner, s]): [string, KaraokeLeader] => [owner, { name: s.name, songs: s.songs, avg: s.rated ? round1(s.points / s.rated) : 0, points: s.points, best: s.best }])
      .sort((a, b) => rankSingers(a[1], b[1]));
  }

  /** A new week: last week's best is remembered, the board starts afresh. */
  private roll() {
    const week = weekKey(this.now());
    if (week === this.week) return;
    const best = this.ranked()[0];
    if (best && best[1].points > 0) this.last = { week: this.week, name: best[1].name, points: best[1].points };
    this.week = week;
    this.singers.clear();
    this.cache = null;
    this.save();
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { week?: unknown; singers?: unknown; last?: unknown };
      if (typeof saved.week === 'string' && /^\d{4}-W\d{2}$/.test(saved.week)) this.week = saved.week;
      for (const [owner, v] of Object.entries((saved.singers ?? {}) as { [k: string]: unknown })) {
        if (owner.length > 200 || !v || typeof v !== 'object') continue;
        const o = v as { [k: string]: unknown };
        if (typeof o.name !== 'string') continue;
        this.singers.set(owner, { name: o.name.slice(0, 40), songs: Math.floor(num(o.songs, 1e6)), rated: Math.floor(num(o.rated, 1e6)), points: round1(num(o.points, 5e6)), best: round1(num(o.best, 5)) });
      }
      const l = saved.last as { [k: string]: unknown } | undefined;
      if (l && typeof l.week === 'string' && typeof l.name === 'string') this.last = { week: l.week.slice(0, 10), name: l.name.slice(0, 40), points: round1(num(l.points, 5e6)) };
    } catch {
      // a broken file: the week starts over
    }
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ week: this.week, singers: Object.fromEntries(this.singers), ...(this.last ? { last: this.last } : {}) }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk trouble shouldn't take the office down
    }
  }
}

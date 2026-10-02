import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { weekOf, type MgLeader, type MgMine } from '../../shared/minigolf.js';

/*
 * The black-light mini golf's records (flrnoh fork, see FORK.md "Black-light mini golf"): per person
 * (`account:<id>`, or `name:<name>` on the shared password, like the soccer stats) the rounds played,
 * their best round and when, their best this week, and their holes in one. Saved in the office's data
 * folder as minigolf.json (0600, written beside it and moved over it). Without a folder (the tests)
 * it's kept in memory only.
 */

interface Record {
  name: string;
  rounds: number;
  best: number | null;
  bestAt: number;
  week: string;
  weekBest: number | null;
  weekAt: number;
  aces: number;
}

/** People kept at most (the oldest go first). */
const KEPT = 5000;
/** A full round can't come to less than nine, nor more than nine "+"s. */
const LOWEST = 9;
const HIGHEST = 9 * 8;

const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, 1e9) : 0);
const score = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= LOWEST && v <= HIGHEST ? v : null);
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export class MinigolfRecords {
  private all = new Map<string, Record>();
  private file: string | null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'minigolf.json') : null;
    this.load();
  }

  /** `owner` finished a round of `total` at `now`: whether it's their best ever, and their best this week. */
  round(owner: string, name: string, total: number, now: number): { best: boolean; week: boolean } {
    const r = this.touch(owner, name);
    const week = weekOf(now);
    r.rounds += 1;
    const best = r.best === null || total < r.best;
    if (best) {
      r.best = total;
      r.bestAt = now;
    }
    if (r.week !== week) {
      r.week = week;
      r.weekBest = null;
    }
    const weekly = r.weekBest === null || total < r.weekBest;
    if (weekly) {
      r.weekBest = total;
      r.weekAt = now;
    }
    this.save();
    return { best, week: weekly };
  }

  /** A hole in one. */
  ace(owner: string, name: string) {
    this.touch(owner, name).aces += 1;
    this.save();
  }

  /** What `owner` has to show, this week as of `now`. */
  mine(owner: string, now: number): MgMine {
    const r = this.all.get(owner);
    if (!r) return { rounds: 0, best: null, aces: 0, weekBest: null };
    return { rounds: r.rounds, best: r.best, aces: r.aces, weekBest: r.week === weekOf(now) ? r.weekBest : null };
  }

  /** The best `n` rounds ever (a person's best each), lowest first, the earlier on a tie. */
  best(n = 5): MgLeader[] {
    return [...this.all.values()]
      .filter((r) => r.best !== null)
      .map((r) => ({ name: r.name, total: r.best!, at: r.bestAt }))
      .sort((a, b) => a.total - b.total || a.at - b.at)
      .slice(0, n);
  }

  /** The week's best `n` (as of `now`). */
  week(now: number, n = 5): MgLeader[] {
    const week = weekOf(now);
    return [...this.all.values()]
      .filter((r) => r.week === week && r.weekBest !== null)
      .map((r) => ({ name: r.name, total: r.weekBest!, at: r.weekAt }))
      .sort((a, b) => a.total - b.total || a.at - b.at)
      .slice(0, n);
  }

  /** Holes in one, everyone's. */
  aces(): number {
    let n = 0;
    for (const r of this.all.values()) n += r.aces;
    return n;
  }

  private touch(owner: string, name: string): Record {
    const r = this.all.get(owner) ?? { name, rounds: 0, best: null, bestAt: 0, week: '', weekBest: null, weekAt: 0, aces: 0 };
    r.name = name.slice(0, 40);
    // The most recent to the back, so the oldest are the ones trimmed.
    this.all.delete(owner);
    this.all.set(owner, r);
    for (const k of this.all.keys()) {
      if (this.all.size <= KEPT) break;
      this.all.delete(k);
    }
    return r;
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { players?: unknown };
      for (const [owner, v] of Object.entries((saved?.players ?? {}) as { [k: string]: unknown })) {
        if (owner.length > 200 || !v || typeof v !== 'object') continue;
        const o = v as { [k: string]: unknown };
        if (typeof o.name !== 'string') continue;
        this.all.set(owner, {
          name: o.name.slice(0, 40),
          rounds: count(o.rounds),
          best: score(o.best),
          bestAt: time(o.bestAt),
          week: typeof o.week === 'string' ? o.week.slice(0, 10) : '',
          weekBest: score(o.weekBest),
          weekAt: time(o.weekAt),
          aces: count(o.aces),
        });
        if (this.all.size >= KEPT) break;
      }
    } catch {
      // a broken file: everyone starts over
    }
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ players: Object.fromEntries(this.all) }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // can't write: kept in memory till the next try
    }
  }
}

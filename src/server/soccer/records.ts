import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_NUMBER, assignNumber, type SoccerLeader } from '../../shared/soccer-stats.js';
import type { MatchResult } from './stats.js';

/*
 * The soccer hall's all-time leaderboard (flrnoh fork, see FORK.md "The soccer hall"): per person
 * (`account:<id>`, or `name:<name>` on the shared password, like the casino's chips) their matches,
 * wins, goals, assists and man-of-the-match awards, and the shirt number they wear (the same one
 * every match, unless someone on the pitch already has it). Saved in the office's data folder as
 * soccer.json (0600, written beside it and moved over it). Without a folder (the tests) it's kept in
 * memory only.
 */

interface Record {
  name: string;
  number?: number;
  matches: number;
  wins: number;
  goals: number;
  assists: number;
  mvp: number;
}

/** People kept at most (the oldest go first). */
const KEPT = 5000;

const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, 1e9) : 0);

/** The leaderboard's order: goals, then assists, then wins, then man-of-the-match awards, then fewer matches. */
export function rankLeaders(a: SoccerLeader, b: SoccerLeader): number {
  return b.goals - a.goals || b.assists - a.assists || b.wins - a.wins || b.mvp - a.mvp || a.matches - b.matches || a.name.localeCompare(b.name);
}

export class SoccerRecords {
  private all = new Map<string, Record>();
  private file: string | null;
  private topCache: SoccerLeader[] | null = null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'soccer.json') : null;
    this.load();
  }

  /** `owner`'s shirt number: theirs from before if nobody in `taken` wears it, else the next free one (theirs stays theirs). */
  numberFor(owner: string, name: string, taken: ReadonlySet<number>): number {
    const r = this.all.get(owner);
    const n = assignNumber(r?.number, taken, owner);
    if (!r) {
      this.all.set(owner, { name, number: n, matches: 0, wins: 0, goals: 0, assists: 0, mvp: 0 });
      this.trim();
      this.save();
    } else if (r.number === undefined) {
      r.number = n;
      this.save();
    }
    return n;
  }

  /** A match is over: everyone who played gets it on their record. */
  record(results: MatchResult[]) {
    if (!results.length) return;
    for (const m of results) {
      const r = this.all.get(m.owner) ?? { name: m.name, matches: 0, wins: 0, goals: 0, assists: 0, mvp: 0 };
      r.name = m.name;
      r.matches += 1;
      if (m.won) r.wins += 1;
      r.goals += m.goals;
      r.assists += m.assists;
      if (m.mvp) r.mvp += 1;
      // Most recent to the back, so the oldest are the ones trimmed.
      this.all.delete(m.owner);
      this.all.set(m.owner, r);
    }
    this.trim();
    this.topCache = null;
    this.save();
  }

  get(owner: string): SoccerLeader | undefined {
    const r = this.all.get(owner);
    return r ? { ...r } : undefined;
  }

  /** The best `n` who've played at least one match. */
  top(n = 5): SoccerLeader[] {
    if (!this.topCache) this.topCache = [...this.all.values()].filter((r) => r.matches > 0).map((r) => ({ ...r })).sort(rankLeaders).slice(0, 10);
    return this.topCache.slice(0, n).map((r) => ({ ...r }));
  }

  private trim() {
    for (const k of this.all.keys()) {
      if (this.all.size <= KEPT) break;
      this.all.delete(k);
    }
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { players?: unknown };
      for (const [owner, v] of Object.entries((saved?.players ?? {}) as { [k: string]: unknown })) {
        if (owner.length > 200 || !v || typeof v !== 'object') continue;
        const o = v as { [k: string]: unknown };
        if (typeof o.name !== 'string') continue;
        const number = typeof o.number === 'number' && Number.isInteger(o.number) && o.number >= 1 && o.number <= MAX_NUMBER ? o.number : undefined;
        this.all.set(owner, { name: o.name.slice(0, 40), ...(number ? { number } : {}), matches: count(o.matches), wins: count(o.wins), goals: count(o.goals), assists: count(o.assists), mvp: count(o.mvp) });
      }
      this.trim();
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
      // disk trouble shouldn't take the office down
    }
  }
}

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LeagueBoard, MyGames } from '../../shared/bowling-game.js';
import { leagueBoard, myGames, type LeagueGame } from '../../shared/bowling-league.js';

/*
 * The bowling league's book (flrnoh fork, see FORK.md "Bowling lanes"): every finished game, by who
 * bowled it (`account:<id>`, or `name:<name>` on the shared password, like the soccer hall's), saved
 * in the office's data folder as bowling.json (0600, written beside it and moved over it). The tables
 * are worked out from it (shared/bowling-league.ts). Without a folder (the tests) it's kept in memory.
 */

/** Games kept at most (the oldest go first): years of an office's evenings. */
const KEPT = 20000;

export class BowlingLeague {
  private games: LeagueGame[] = [];
  private file: string | null;
  private cache: { at: number; board: Omit<LeagueBoard, 'crowned'>; champion: string | null } | null = null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'bowling.json') : null;
    this.load();
  }

  /** A game's done: it goes in the book. */
  record(g: LeagueGame) {
    this.games.push({ owner: g.owner.slice(0, 200), name: g.name.slice(0, 40), score: g.score, strikes: g.strikes, spares: g.spares, at: g.at });
    if (this.games.length > KEPT) this.games.splice(0, this.games.length - KEPT);
    this.cache = null;
    this.save();
  }

  /** The board as it stands at `now` (kept for a minute: the week can turn over), and who last week's champion is. */
  board(now: number): { board: Omit<LeagueBoard, 'crowned'>; champion: string | null } {
    if (!this.cache || now - this.cache.at > 60_000) {
      const { board, championOwner } = leagueBoard(this.games, now);
      this.cache = { at: now, board, champion: championOwner };
    }
    return { board: this.cache.board, champion: this.cache.champion };
  }

  mine(owner: string, name: string): MyGames {
    return myGames(this.games, owner, name);
  }

  get size(): number {
    return this.games.length;
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { games?: unknown };
      const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);
      for (const v of Array.isArray(saved?.games) ? saved.games : []) {
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        const score = n(o.score, 300);
        const strikes = n(o.strikes, 12);
        const spares = n(o.spares, 10);
        const at = n(o.at, 1e15);
        if (typeof o.owner !== 'string' || typeof o.name !== 'string' || score === null || strikes === null || spares === null || at === null) continue;
        this.games.push({ owner: o.owner.slice(0, 200), name: o.name.slice(0, 40), score, strikes, spares, at });
      }
      this.games.sort((a, b) => a.at - b.at);
      if (this.games.length > KEPT) this.games.splice(0, this.games.length - KEPT);
    } catch {
      // a broken file: the league starts over
    }
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ games: this.games }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk trouble shouldn't take the office down
    }
  }
}

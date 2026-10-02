// The bowling league (flrnoh fork, see FORK.md "Bowling lanes"): every finished game counts. The
// week runs Monday to Sunday on Berlin's clock; its table ranks people by the average of their best
// three games that week (a game short counts 0), and last week's winner wears the crown. All time:
// the high games, the best averages (from MIN_GAMES games), the most strikes and the perfect games.
// Pure: server/bowling/league.ts keeps the games and saves them.

import type { GameLine, LeagueBoard, LeagueRow, MyGames } from './bowling-game.js';

/** A row with who it is (the office's own; the wire leaves `owner` out). */
export type OwnedRow = LeagueRow & { owner: string };

/** A finished game, as the league keeps it. */
export interface LeagueGame {
  owner: string;
  name: string;
  score: number;
  strikes: number;
  spares: number;
  /** When it finished (ms). */
  at: number;
}

/** Games counted toward the best averages. */
export const MIN_GAMES = 5;
/** The week's table counts this many of each person's best games. */
export const WEEK_BEST = 3;

const ZONE = 'Europe/Berlin';
let fmt: Intl.DateTimeFormat | null = null;

/** The date in Berlin at `ms`: year, month (1–12), day, and the weekday (0 Monday … 6 Sunday). */
export function berlinDate(ms: number): { y: number; m: number; d: number; wd: number } {
  fmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), wd };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A calendar day `delta` days from y-m-d (no clocks: a plain date). */
function shift(y: number, m: number, d: number, delta: number): string {
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The league week `ms` falls in: its Monday in Berlin, as YYYY-MM-DD. */
export function weekOf(ms: number): string {
  const { y, m, d, wd } = berlinDate(ms);
  return shift(y, m, d, -wd);
}

/** The week before `week` (a Monday, YYYY-MM-DD). */
export function weekBefore(week: string): string {
  const [y, m, d] = week.split('-').map(Number);
  return shift(y, m, d, -7);
}

/** The week's table: everyone who bowled in it, by the average of their best three (missing ones count 0). */
export function weekTable(games: readonly LeagueGame[], week: string): OwnedRow[] {
  const by = new Map<string, { name: string; scores: number[] }>();
  for (const g of games) {
    if (weekOf(g.at) !== week) continue;
    const r = by.get(g.owner) ?? { name: g.name, scores: [] };
    r.name = g.name;
    r.scores.push(g.score);
    by.set(g.owner, r);
  }
  const rows: OwnedRow[] = [];
  for (const [owner, r] of by) {
    const best = [...r.scores].sort((a, b) => b - a);
    const counted = best.slice(0, WEEK_BEST);
    rows.push({ owner, name: r.name, avg: round1(counted.reduce((s, v) => s + v, 0) / WEEK_BEST), games: r.scores.length, best: best[0] });
  }
  return rows.sort(byAvg);
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const byAvg = (a: LeagueRow, b: LeagueRow) => b.avg - a.avg || b.best - a.best || b.games - a.games || a.name.localeCompare(b.name);

/** Last week's winner: the top of its table, if anyone bowled. */
export function champion(games: readonly LeagueGame[], now: number): { name: string; owner: string; avg: number } | null {
  const top = weekTable(games, weekBefore(weekOf(now)))[0];
  return top ? { name: top.name, owner: top.owner, avg: top.avg } : null;
}

/** Each person's all-time numbers. */
function people(games: readonly LeagueGame[]) {
  const by = new Map<string, { name: string; games: number; pins: number; strikes: number; spares: number; best: number; perfect: number }>();
  for (const g of games) {
    const r = by.get(g.owner) ?? { name: g.name, games: 0, pins: 0, strikes: 0, spares: 0, best: 0, perfect: 0 };
    r.name = g.name;
    r.games++;
    r.pins += g.score;
    r.strikes += g.strikes;
    r.spares += g.spares;
    r.best = Math.max(r.best, g.score);
    if (g.score === 300) r.perfect++;
    by.set(g.owner, r);
  }
  return by;
}

const line = (g: LeagueGame): GameLine => ({ name: g.name, score: g.score, at: g.at, strikes: g.strikes, spares: g.spares });

const bare = ({ owner: _owner, ...row }: OwnedRow): LeagueRow => row;

/** The board: this week's table, last week's champion, and the all-time lists (`n` long each); and who the champion is. */
export function leagueBoard(games: readonly LeagueGame[], now: number, n = 10): { board: Omit<LeagueBoard, 'crowned'>; championOwner: string | null } {
  const week = weekOf(now);
  const all = people(games);
  const high = [...games].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, n).map(line);
  const average: OwnedRow[] = [...all]
    .filter(([, r]) => r.games >= MIN_GAMES)
    .map(([owner, r]) => ({ owner, name: r.name, avg: round1(r.pins / r.games), games: r.games, best: r.best }))
    .sort(byAvg)
    .slice(0, n);
  const strikes = [...all.values()].filter((r) => r.strikes > 0).sort((a, b) => b.strikes - a.strikes || a.name.localeCompare(b.name)).slice(0, n).map((r) => ({ name: r.name, strikes: r.strikes }));
  const perfect = [...all.values()].filter((r) => r.perfect > 0).sort((a, b) => b.perfect - a.perfect || a.name.localeCompare(b.name)).slice(0, n).map((r) => ({ name: r.name, count: r.perfect }));
  const champ = champion(games, now);
  return {
    board: { week, table: weekTable(games, week).slice(0, n).map(bare), champion: champ && { name: champ.name, avg: champ.avg }, high, average: average.map(bare), strikes, perfect },
    championOwner: champ?.owner ?? null,
  };
}

/** One person's own games, newest first, and their numbers. */
export function myGames(games: readonly LeagueGame[], owner: string, name: string, n = 20): MyGames {
  const mine = games.filter((g) => g.owner === owner);
  const count = mine.length;
  const sum = mine.reduce((s, g) => s + g.score, 0);
  return {
    name,
    games: [...mine].sort((a, b) => b.at - a.at).slice(0, n).map(line),
    count,
    average: count ? round1(sum / count) : 0,
    high: mine.reduce((m, g) => Math.max(m, g.score), 0),
    strikes: mine.reduce((s, g) => s + g.strikes, 0),
    spares: mine.reduce((s, g) => s + g.spares, 0),
  };
}

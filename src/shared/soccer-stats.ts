import type { Team } from './soccer.js';

// The soccer hall's numbers (flrnoh fork, see FORK.md "The soccer hall"): what a match's statistics
// look like on the wire (the office keeps them, server/soccer/stats.ts, and sends them with the match),
// the all-time leaderboard's rows (server/soccer/records.ts), and the small pure rules both sides
// share: who's the man of the match, which shirt number someone gets, which way a scorer celebrates,
// and how long the instant replay after a goal takes (the goal's pause covers it: GOAL_MS).

/** A goal as the scoreboard lists it: for which team, who (the name; an own goal's is the unlucky one), who laid it on, in which minute. */
export interface SoccerGoalRec {
  team: Team;
  scorer?: string;
  assist?: string;
  /** The match minute it went in (1 for the first minute: "3'"). */
  minute: number;
  own?: boolean;
}

/** One player's match. */
export interface SoccerLine {
  name: string;
  team: Team;
  number?: number;
  goals: number;
  assists: number;
  shots: number;
  onTarget: number;
  passes: number;
  saves: number;
}

export interface SoccerTeamStats {
  shots: number;
  onTarget: number;
  passes: number;
  saves: number;
  /** Share of the playing time the team last touched the ball, 0..100 (the two add up to 100; 50 each before anyone has). */
  possession: number;
}

/** The match's statistics (in the `soccer` message's state). */
export interface SoccerStats {
  goals: SoccerGoalRec[];
  teams: Record<Team, SoccerTeamStats>;
  players: SoccerLine[];
  /** The man of the match, once it's over (the best mvpScore; nobody when nobody did anything). */
  mvp?: { name: string; team: Team; score: number };
}

/** A row of the all-time leaderboard (the Hall of Fame). */
export interface SoccerLeader {
  name: string;
  number?: number;
  matches: number;
  wins: number;
  goals: number;
  assists: number;
  mvp: number;
}

/** How the man of the match is found: goals count 3, assists 2, shots on target and saves 1 each. */
export function mvpScore(l: Pick<SoccerLine, 'goals' | 'assists' | 'onTarget' | 'saves'>): number {
  return l.goals * 3 + l.assists * 2 + l.onTarget + l.saves;
}

/** The man of the match among `lines`: the best score, then more goals, then the winning side, then by name. Nobody when nobody scored a point. */
export function pickMvp(lines: SoccerLine[], winner?: Team | 'draw'): SoccerStats['mvp'] {
  let best: SoccerLine | undefined;
  for (const l of lines) {
    if (mvpScore(l) <= 0) continue;
    if (!best) {
      best = l;
      continue;
    }
    const d = mvpScore(l) - mvpScore(best) || l.goals - best.goals || (l.team === winner ? 1 : 0) - (best.team === winner ? 1 : 0) || (l.name < best.name ? 1 : -1);
    if (d > 0) best = l;
  }
  return best ? { name: best.name, team: best.team, score: mvpScore(best) } : undefined;
}

/** A small, steady hash of a string (FNV-1a): the same on every page and the office. */
export function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Shirt numbers go 1..99. */
export const MAX_NUMBER = 99;

/**
 * A shirt number for someone who'd like `want` (theirs from before; else one from their name's hash),
 * not one of `taken` (the others on the pitch): the next free one up from it, round past 99 to 1.
 */
export function assignNumber(want: number | undefined, taken: ReadonlySet<number>, seed = ''): number {
  let n = want && Number.isInteger(want) && want >= 1 && want <= MAX_NUMBER ? want : (hashOf(seed) % MAX_NUMBER) + 1;
  for (let i = 0; i < MAX_NUMBER && taken.has(n); i++) n = (n % MAX_NUMBER) + 1;
  return n;
}

/** The ways a scorer celebrates (client/soccer/kit.ts poses them). */
export const CELEBRATIONS = ['arms', 'slide', 'plane', 'jump'] as const;
export type Celebration = (typeof CELEBRATIONS)[number];

/** Which celebration a goal gets: from who scored and how many goals there are, so every page shows the same one. */
export function pickCelebration(scorer: string, goalNo: number): Celebration {
  return CELEBRATIONS[hashOf(`${scorer}#${goalNo}`) % CELEBRATIONS.length];
}

/** The match minute at `playedMs` of playing time: 1 in the first minute, like "1'". */
export const minuteOf = (playedMs: number) => Math.floor(Math.max(0, playedMs) / 60_000) + 1;

/**
 * The instant replay after a goal (client/soccer/replay.ts): it starts `startAfterMs` after the goal
 * (the scorer's celebration first), shows the `backMs` before it and `afterMs` after it, the last
 * `slowMs` of that at `slowRate` (slow motion). GOAL_MS (the goal's pause) is long enough for all of it.
 */
export const REPLAY = { startAfterMs: 1800, backMs: 3200, afterMs: 200, slowMs: 800, slowRate: 0.5 } as const;

/** How long the replay plays (ms of real time). */
export function replayPlaybackMs(r: { backMs: number; afterMs: number; slowMs: number; slowRate: number } = REPLAY): number {
  const span = r.backMs + r.afterMs;
  return span - r.slowMs + r.slowMs / r.slowRate;
}

/** Where in the replayed span (ms from its start) the replay is after `elapsedMs` of playing; null when it's done. */
export function replayContentAt(elapsedMs: number, r: { backMs: number; afterMs: number; slowMs: number; slowRate: number } = REPLAY): number | null {
  if (elapsedMs < 0) return 0;
  const span = r.backMs + r.afterMs;
  const fast = span - r.slowMs;
  if (elapsedMs <= fast) return elapsedMs;
  const slow = (elapsedMs - fast) * r.slowRate;
  if (slow > r.slowMs) return null;
  return fast + slow;
}

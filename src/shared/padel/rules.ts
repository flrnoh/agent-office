// Padel's scoring (flrnoh fork, see FORK.md "Padel"): 15, 30, 40, game, with a golden point at
// deuce (40–40: the next point takes the game, no advantage). A match is the first to four games,
// which with the computer on court takes five to eight minutes. Who serves: the teams take turns a
// game each (team 0 first), and within a team the two players do; each point is served from the
// right (as the server faces the net) when the points so far in the game add up even, else the left,
// diagonally to the receiver across.

import { type Slot, type Team } from './court.js';

export const GAMES_TO_WIN = 4;

export interface PadelScore {
  /** Games won this match. */
  games: [number, number];
  /** Points this game: 0, 1, 2, 3 are 0, 15, 30, 40. */
  points: [number, number];
  win: -1 | Team;
}

export function newScore(): PadelScore {
  return { games: [0, 0], points: [0, 0], win: -1 };
}

/** What a point did: nothing more, a game, or the match. */
export type PointResult = 'point' | 'game' | 'match';

/** A point to `team`. At 40 (golden point included) it's the game; the fourth game is the match. */
export function awardPoint(sc: PadelScore, team: Team): PointResult {
  if (sc.win !== -1) return 'match';
  sc.points[team]++;
  if (sc.points[team] < 4) return 'point';
  sc.points = [0, 0];
  sc.games[team]++;
  if (sc.games[team] >= GAMES_TO_WIN) {
    sc.win = team;
    return 'match';
  }
  return 'game';
}

/** Deuce: the next point is the golden point. */
export const golden = (sc: Pick<PadelScore, 'points'>): boolean => sc.points[0] === 3 && sc.points[1] === 3;

const CALL = ['0', '15', '30', '40'];
/** How a side's points are called: 0, 15, 30, 40. */
export const pointCall = (p: number): string => CALL[Math.max(0, Math.min(3, p))];

/** The points as the umpire says them: "15–30", "Golden point". */
export function pointsLine(sc: Pick<PadelScore, 'points'>): string {
  return golden(sc) ? 'Golden point' : `${pointCall(sc.points[0])}–${pointCall(sc.points[1])}`;
}

/** Who serves this game: the teams by turns, and within a team the players by turns. */
export function serverFor(games: readonly [number, number]): Slot {
  const n = games[0] + games[1];
  const team = n % 2;
  const k = Math.floor(n / 2) % 2;
  return (team * 2 + k) as Slot;
}

/** Which side the serve comes from: the right when the points played this game are even. */
export const serveFromRight = (points: readonly [number, number]): boolean => (points[0] + points[1]) % 2 === 0;

/** Who takes the serve: the other team's player on the diagonal, the right one when served from the right. */
export function receiverFor(server: Slot, points: readonly [number, number]): Slot {
  const other = server < 2 ? 2 : 0;
  return (other + (serveFromRight(points) ? 0 : 1)) as Slot;
}

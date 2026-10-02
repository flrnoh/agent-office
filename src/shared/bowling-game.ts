// The bowling game in the bowling centre (flrnoh fork, see FORK.md "Bowling lanes"): the lanes' own
// measures, where the pins stand, the house balls, the furniture behind the approaches, and the
// messages. Pure: the office (server/bowling/lanes.ts) and the page (features/bowlinggame/) both use it.
//
// A lane has its own frame: `u` across it (metres from its middle, + toward +x, the bowler's right as
// they face the pins) and `d` down it (metres past the foul line, + toward the pins). Interior
// coordinates are x = LANE_X[lane] + u, z = FOUL_LINE_Z - d.

import { FOUL_LINE_Z, HEAD_PIN_Z, LANE_COUNT, LANE_X, ZONES } from './bowling.js';

// ---- The lane ------------------------------------------------------------------------------------

/** 41.5 inches of maple and pine, 39 boards. */
export const LANE_WIDTH = 1.0541;
export const BOARDS = 39;
export const BOARD = LANE_WIDTH / BOARDS;
export const LANE_HALF = LANE_WIDTH / 2;
/** Each gutter, 9.25 inches. */
export const GUTTER = 0.235;
/** Foul line to the head pin, 60 feet. */
export const HEAD_PIN_D = FOUL_LINE_Z - HEAD_PIN_Z;
/** The pins stand a foot apart, rows 10.39 inches behind each other. */
export const PIN_SPACING = 0.3048;
export const ROW_SPACING = PIN_SPACING * Math.sqrt(3) / 2;
/** Where the pin deck starts (the lane's last few feet), and where it drops into the pit. */
export const DECK_D = HEAD_PIN_D - 0.08;
export const PIT_D = HEAD_PIN_D + 3 * ROW_SPACING + 0.075 + 0.0254 + 0.04;
/** The approach behind the foul line (15 feet and a bit, to the end of ZONES.lanes). */
export const APPROACH = ZONES.lanes.maxZ - FOUL_LINE_Z;
/** The oil on the lane: the first 40 feet are slick, the back end dry (that's where the ball hooks). */
export const OIL_D = 12.19;
/** The arrows (15 feet out, a V pointing at the pins: the middle one furthest) and the dots. */
export const ARROWS = [5, 10, 15, 20, 25, 30, 35].map((board) => ({ board, d: 3.66 + (4 - Math.abs(board - 20) / 5) * 0.3 }));
export const APPROACH_DOTS = [
  { d: -0.15, boards: [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37] },
  { d: -3.66, boards: [5, 10, 15, 20, 25, 30, 35] },
  { d: -4.57, boards: [5, 10, 15, 20, 25, 30, 35] },
];
export const LANE_DOTS = [{ d: 2.13, boards: [3, 5, 8, 11, 14, 26, 29, 32, 35, 37] }];

/** Board `b` (1 at the right edge for a right-hander, 20 the middle, 39 the left edge) across the lane. */
export const boardU = (b: number) => LANE_HALF - (b - 0.5) * BOARD;
/** Which board `u` is on (fractional), the other way round. */
export const uBoard = (u: number) => (LANE_HALF - u) / BOARD + 0.5;

/** Interior x, z of a spot on lane `lane`. */
export const laneToRoom = (lane: number, u: number, d: number) => ({ x: LANE_X[lane] + u, z: FOUL_LINE_Z - d });
/** Lane `lane`'s frame for an interior spot. */
export const roomToLane = (lane: number, x: number, z: number) => ({ u: x - LANE_X[lane], d: FOUL_LINE_Z - z });
/** The lane whose approach, lane or gutters `x` is over (or -1). */
export function laneAt(x: number): number {
  for (let i = 0; i < LANE_COUNT; i++) if (Math.abs(x - LANE_X[i]) <= LANE_HALF + GUTTER) return i;
  return -1;
}
/** Lane numbers as the signs show them: 1 to 6, west to east. */
export const laneName = (lane: number) => `${lane + 1}`;

// ---- The pins ------------------------------------------------------------------------------------

export const PIN_COUNT = 10;
/** A pin: 15 inches tall, 4.77 inches at its belly, 1.53 kg. */
export const PIN_HEIGHT = 0.381;
export const PIN_BELLY = 0.0605;
export const PIN_MASS = 1.53;

/** Pin `n` (0 is the head pin, the 1-pin; 9 is the 10-pin): where it's spotted, in the lane's frame. Rows go 1 / 2 3 / 4 5 6 / 7 8 9 10 from left to right. */
export const PIN_SPOTS: readonly { u: number; d: number; row: number; col: number }[] = (() => {
  const out: { u: number; d: number; row: number; col: number }[] = [];
  for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) out.push({ u: (k - row / 2) * PIN_SPACING, d: HEAD_PIN_D + row * ROW_SPACING, row, col: 2 * k - row });
  return out;
})();
export const FULL_RACK = (1 << PIN_COUNT) - 1;
export const pinCount = (mask: number) => {
  let n = 0;
  for (let i = 0; i < PIN_COUNT; i++) if (mask & (1 << i)) n++;
  return n;
};

// ---- The balls -----------------------------------------------------------------------------------

export type BallFinish = 'glitter' | 'marble' | 'pearl' | 'swirl';
export interface HouseBall {
  id: number;
  lbs: number;
  name: string;
  /** Two colours, the finish mixes them. */
  colors: [string, string];
  finish: BallFinish;
}
/** The house balls on the racks: 8 to 16 pounds, a colour each. */
export const BALLS: readonly HouseBall[] = [
  { id: 0, lbs: 8, name: 'Bubblegum', colors: ['#ff6fb5', '#ffd1ea'], finish: 'glitter' },
  { id: 1, lbs: 9, name: 'Limette', colors: ['#7ee04a', '#e9ff7a'], finish: 'swirl' },
  { id: 2, lbs: 10, name: 'Ozean', colors: ['#1d7fe0', '#7fe3ff'], finish: 'marble' },
  { id: 3, lbs: 11, name: 'Mandarine', colors: ['#ff8a1d', '#ffe07a'], finish: 'pearl' },
  { id: 4, lbs: 12, name: 'Galaxie', colors: ['#3a1d7a', '#d27aff'], finish: 'glitter' },
  { id: 5, lbs: 13, name: 'Kirsche', colors: ['#c1121f', '#ff8fa3'], finish: 'marble' },
  { id: 6, lbs: 14, name: 'Smaragd', colors: ['#0b7a4b', '#7affc8'], finish: 'pearl' },
  { id: 7, lbs: 15, name: 'Gold', colors: ['#b8860b', '#fff1a8'], finish: 'glitter' },
  { id: 8, lbs: 16, name: 'Nachtschwarz', colors: ['#14141c', '#5a6a8a'], finish: 'swirl' },
];
export const BALL_RADIUS = 0.1085;
export const ballKg = (lbs: number) => lbs * 0.4536;
export const isBallId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < BALLS.length;

// ---- Behind the approaches: returns, consoles, benches, monitors, the leaderboard ---------------

/** The lane pairs (0+1, 2+3, 4+5): each shares a ball return, a console and a monitor. */
export const PAIRS = [0, 1, 2].map((p) => ({ lanes: [2 * p, 2 * p + 1] as const, x: (LANE_X[2 * p] + LANE_X[2 * p + 1]) / 2 }));
export const pairOf = (lane: number) => Math.floor(lane / 2);
/** Each ball return's hood, on the capping between its pair, its front just behind the approach. */
export const RETURN_Z = ZONES.bowlers.minZ + 0.55;
/** The scoring consoles: one desk per pair, a screen for each of its lanes (E at it joins that lane). */
export const CONSOLE_Z = ZONES.bowlers.minZ + 2.15;
export const consoleSpot = (lane: number) => ({ x: PAIRS[pairOf(lane)].x + (lane % 2 ? 0.42 : -0.42), z: CONSOLE_Z });
/** The curved benches behind each console: the middle of their arc (they curve round it on its south side, facing the lanes), its radius, the seat's depth. */
export const BENCH = { z: ZONES.bowlers.minZ + 2.1, radius: 1.45, depth: 0.45 } as const;
/** The overhead monitors: one per pair, two screens, hung over the end of the approaches. */
export const MONITOR = { z: 3.4, y: 3.5, w: 1.5, h: 0.92 } as const;
/** The league's big board, on the west wall behind the approaches. */
export const LEAGUE_BOARD = { x: ZONES.bowlers.minX + 0.06, z: (ZONES.bowlers.minZ + ZONES.bowlers.maxZ) / 2 + 0.2, y: 2.3, w: 3.0, h: 1.9 } as const;

// ---- A throw -------------------------------------------------------------------------------------

/** What the bowler's page sends when they let go: where they stood, how hard, which way, how much hook. */
export interface ThrowParams {
  /** Across the approach where they stand (m from the lane's middle). */
  u: number;
  /** How far behind the foul line they start their steps (m). */
  back: number;
  /** How hard (0 to 1). */
  power: number;
  /** Which way, as a slope: metres across per metre down the lane (+ to the right). */
  line: number;
  /** Hook: -1 (back-up ball, curls right) to 1 (a big hook to the left, a right-hander's). */
  spin: number;
}
export const LIMITS = { u: LANE_HALF - 0.05, backMin: 0.6, backMax: APPROACH - 0.3, line: 0.09 } as const;

/** A four-step approach: how far it carries you (m), more with more pace. */
export const stepsLength = (power: number) => 2.35 + 1.25 * power;
/** Where the slide ends (m past the foul line: over 0 is a foul) for a start `back` behind it. */
export const slideEnd = (back: number, power: number) => stepsLength(power) - back;
/** The ball leaves the hand this far behind the slide foot, at this speed (m/s). */
export const ballSpeed = (power: number, lbs: number) => (4.6 + 4.6 * power) * (1 - (lbs - 12) * 0.012);
/** From the start of the steps to the ball on the lane (s). */
export const RELEASE_S = 1.15;

/** The page's numbers made safe: anything off is null. */
export function cleanThrow(t: unknown): ThrowParams | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const u = num(o.u);
  const back = num(o.back);
  const power = num(o.power);
  const line = num(o.line);
  const spin = num(o.spin);
  if ([u, back, power, line, spin].some(Number.isNaN)) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return {
    u: r(clamp(u, -LIMITS.u, LIMITS.u)),
    back: r(clamp(back, LIMITS.backMin, LIMITS.backMax)),
    power: r(clamp(power, 0, 1)),
    line: r(clamp(line, -LIMITS.line, LIMITS.line)),
    spin: r(clamp(spin, -1, 1)),
  };
}

// ---- What everyone sees --------------------------------------------------------------------------

/** A roll on the score sheet. */
export interface Roll {
  /** Pins it counted (0 on a foul). */
  pins: number;
  /** Over the foul line: no pins count. */
  foul?: boolean;
  /** What stood after it (bit `n` is pin n+1), for the split marks and the sheet. */
  left?: number;
}

/** Someone on a lane. */
export interface LanePlayer {
  id: string;
  name: string;
  color: string;
  /** Their house ball (BALLS). */
  ball: number;
  rolls: Roll[];
}

/** A pin that's standing after the last ball: which, and where it stands (moved, it stays moved). */
export interface StandingPin {
  n: number;
  u: number;
  d: number;
}

export interface LaneView {
  lane: number;
  players: LanePlayer[];
  /** Whose ball it is (an id in players), or null (nobody on, or the game's over). */
  up: string | null;
  /** Since when (office time, ms) they've been up: the others may skip someone who keeps them waiting. */
  upSince: number;
  /** The pins standing for the next ball. */
  pins: StandingPin[];
  /** The game's number on this lane (a new game, a new number). */
  game: number;
  /** Every player has bowled ten frames. */
  over: boolean;
}

/** A ball down a lane, for everyone in the centre to play back (the same throw gives the same pins). */
export interface BowlingRoll {
  lane: number;
  by: string;
  name: string;
  ball: number;
  params: ThrowParams;
  /** The pins as they stood before it. */
  pins: StandingPin[];
  /** What it counted, as the office worked it out. */
  roll: Roll;
  /** What's standing afterwards, where (deadwood swept). */
  after: StandingPin[];
  foul: boolean;
  /** How long the ball and pins take to settle (s, from the release). */
  secs: number;
  /** The lane once this ball is done (applied when it's played back). */
  view: LaneView;
}

// ---- The league --------------------------------------------------------------------------------

export interface LeagueRow {
  name: string;
  /** Average of the week's best three (missing games count 0), or the all-time average. */
  avg: number;
  games: number;
  best: number;
}
export interface GameLine {
  name: string;
  score: number;
  at: number;
  strikes: number;
  spares: number;
}
export interface LeagueBoard {
  /** The week (its Monday, YYYY-MM-DD, Europe/Berlin). */
  week: string;
  table: LeagueRow[];
  /** Last week's winner. */
  champion: { name: string; avg: number } | null;
  /** People in the centre right now who are last week's champion: they wear the crown. */
  crowned: string[];
  high: GameLine[];
  average: LeagueRow[];
  strikes: { name: string; strikes: number }[];
  perfect: { name: string; count: number }[];
}
export interface MyGames {
  name: string;
  games: GameLine[];
  count: number;
  average: number;
  high: number;
  strikes: number;
  spares: number;
}

// ---- Messages ------------------------------------------------------------------------------------

export type BowlingGameClientMsg =
  /** Just came in: the lanes and the board, please. */
  | { t: 'bowl.look' }
  /** Onto a lane's game (up to six), off it, a house ball, a new game, a ball down the lane. */
  | { t: 'bowl.join'; lane: number }
  | { t: 'bowl.leave' }
  | { t: 'bowl.ball'; ball: number }
  | { t: 'bowl.new'; lane: number }
  /** Skip whoever's up on your lane and has kept everyone waiting a minute and a half: off the lane they go. */
  | { t: 'bowl.skip' }
  | { t: 'bowl.throw'; lane: number; params: ThrowParams }
  /** The leaderboard's window: the week, all time and your own games. */
  | { t: 'bowl.stats' };

export type BowlingGameServerMsg =
  | { t: 'bowl.lanes'; lanes: LaneView[] }
  | { t: 'bowl.lane'; lane: LaneView }
  | { t: 'bowl.roll'; roll: BowlingRoll }
  | { t: 'bowl.board'; board: LeagueBoard }
  | { t: 'bowl.stats'; board: LeagueBoard; mine: MyGames }
  /** A game on a lane is over: everyone's score, best first. */
  | { t: 'bowl.over'; lane: number; scores: { name: string; score: number }[] };

/** At most six on a lane. */
export const MAX_PLAYERS = 6;
export const isLane = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LANE_COUNT;

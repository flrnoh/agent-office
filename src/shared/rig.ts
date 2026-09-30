// The racing rig in the lounge (flrnoh fork, see FORK.md): where it stands, what its screen shows
// while someone races (the driver's page sends it, the office passes it on to everyone else on the
// floor), and its high-score tables, which are the whole building's (see server/rig.ts). The race
// itself is in shared/racing.ts.

import { BOOST_SPEED, COUNTDOWN_MS, LAPS, MIN_LAP_MS, RIVALS, TRACK, WALL, type RaceFrame } from './racing.js';

/** The game on the rig. */
export const RIG_GAME = 'OFFICE GP';

/**
 * The rig: between the lounge and the meeting room's glass, a couple of meters in from the arcade
 * cabinet, facing the glass (+z) so the lounge sees its screen over the driver's shoulder. A bucket
 * seat at `seatZ`, the wheel and pedals in front of it, and the TV on its stand at `screen`, facing
 * back at the seat. `minX`..`maxZ` is all of it, for colliders and the nav grid. (Numbers, not
 * layout.ts's constants: layout.ts takes the seat from here. The meeting room's glass is at z 8.15,
 * the cabinet's front at x 17.13, the overflow bean bag's lap desk out to x 13.3.)
 */
export const RIG = {
  x: 14.9,
  minX: 14.18,
  maxX: 15.62,
  minZ: 5.85,
  maxZ: 7.98,
  seatZ: 6.2,
  wheel: { z: 6.78, y: 0.72 },
  screen: { z: 7.72, y: 1.22, width: 1.36, height: 0.765 },
  height: 1.62,
} as const;

/** The rig's seat, in SEATING (shared/layout.ts): sitting there is how everyone sees you at the wheel. */
export const RIG_SEAT = 'racing-rig';

/** Whether a peer's `seat` is the rig's. */
export function onRig(seat: string | undefined): boolean {
  return !!seat && seat.startsWith(`${RIG_SEAT}:`);
}

/** How many races and laps each table keeps. */
export const RIG_KEPT = 10;

/** A time on the tables. */
export interface RigScore {
  name: string;
  color: string;
  /** The race (all LAPS laps) or the lap, in ms. */
  ms: number;
  at: number;
}

/** The building's fastest races and fastest laps, quickest first, one of each per driver. */
export interface RigScores {
  races: RigScore[];
  laps: RigScore[];
}

/** Who's at the wheel on your floor, and the tables. */
export interface RigState {
  driver: { id: string; name: string; color: string } | null;
  scores: RigScores;
}

/** The rig for someone walking onto the floor: its screen too, when a race is on. */
export interface RigView extends RigState {
  frame: RigFrame | null;
}

/** The race on the rig's screen at one moment (see Race.frame). */
export type RigFrame = RaceFrame;

/** What a driver's page says when the flag drops: each lap's time, in ms. */
export interface RigResult {
  laps: number[];
}

export const EMPTY_RIG: RigView = { driver: null, scores: { races: [], laps: [] }, frame: null };

/** Quickest first; of two the same, the one that got there first. */
const byTime = (a: RigScore, b: RigScore) => a.ms - b.ms || a.at - b.at;

/**
 * `s` on `list`, if it makes it: one time per driver (by name), so a quicker one replaces theirs and a
 * slower one leaves the table alone. The new list, and where on it `s` went (1 is first; 0 for not on it).
 */
export function insertScore(list: readonly RigScore[], s: RigScore, kept = RIG_KEPT): { list: RigScore[]; rank: number } {
  const was = list.find((e) => e.name === s.name);
  if (!(s.ms > 0) || (was && was.ms <= s.ms)) return { list: [...list], rank: 0 };
  const next = [...list.filter((e) => e !== was), s].sort(byTime).slice(0, kept);
  return { list: next, rank: next.indexOf(s) + 1 };
}

const fin = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const int = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

/** The furthest a race gets: all its laps and then some, with the rivals driving on after the flag. */
const MAX_DIST = TRACK.length * (LAPS + 20);
/** The longest a race is kept going (ms): an hour. */
const MAX_T = 3_600_000;

/** A frame a page sent, if it is one. */
export function checkRigFrame(raw: unknown): RigFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const phase = f.phase === 'count' || f.phase === 'race' || f.phase === 'done' ? f.phase : null;
  const t = fin(f.t, -COUNTDOWN_MS, MAX_T);
  const dist = fin(f.dist, -TRACK.length, MAX_DIST);
  const x = fin(f.x, -WALL, WALL);
  const speed = fin(f.speed, 0, BOOST_SPEED * 1.01);
  const steer = fin(f.steer, -1, 1);
  const boost = fin(f.boost, 0, 1);
  const boosting = typeof f.boosting === 'boolean' ? f.boosting : null;
  const place = int(f.place, 1, RIVALS.length + 1);
  const laps = Array.isArray(f.laps) && f.laps.length <= LAPS && f.laps.every((l) => int(l, 0, MAX_T) !== null) ? (f.laps as number[]) : null;
  const cars =
    Array.isArray(f.cars) && f.cars.length === RIVALS.length * 3 && f.cars.every((v, i) => (i % 3 === 0 ? fin(v, -TRACK.length, MAX_DIST) : i % 3 === 1 ? fin(v, -1, 1) : fin(v, 0, BOOST_SPEED)) !== null) ? (f.cars as number[]) : null;
  if (!phase || t === null || dist === null || x === null || speed === null || steer === null || boost === null || boosting === null || place === null || !laps || !cars) return null;
  return { phase, t, dist, x, speed, steer, boost, boosting, laps: [...laps], place, cars: [...cars] };
}

/** A result a page sent, if it is one that could have been driven: LAPS laps, none quicker than the quickest there can be. */
export function checkRigResult(raw: unknown): RigResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const laps = (raw as { laps?: unknown }).laps;
  if (!Array.isArray(laps) || laps.length !== LAPS || !laps.every((l) => int(l, MIN_LAP_MS, MAX_T) !== null)) return null;
  return { laps: [...(laps as number[])] };
}

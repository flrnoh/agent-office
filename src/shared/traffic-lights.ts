import { CITY_ROAD, CITY_WALK, CROSSINGS, type Crossing } from './city.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the traffic lights at the busier
// crossings round the office. Nothing goes over the wire: every light's phase is a function of the
// office's clock (seconds, store.officeNow / 1000) alone, so every page shows the same red at the same
// moment, the city's cars (client/world/town/traffic.ts) stop at the same line, the passers-by
// (shared/passersby.ts) wait for the same green man and the bus (shared/citybus.ts) keeps the same
// timetable. A crossing's two roads take turns: the one along x, then the one along z, each with
// green, amber, and a moment of red both ways between; the last second before green shows red and
// amber together, as here. The people crossing a road get the green man while that road's cars stand.

/** Which road at a crossing: the one along x or the one along z. */
export type Axis = 'x' | 'z';
export type Lamp = 'green' | 'amber' | 'red' | 'redamber';

/** One turn round the lights (s): x green, x amber, both red, z green, z amber, both red. */
export const CYCLE = 40;
export const GREEN = 15;
export const AMBER = 3;
export const ALL_RED = 2;
/** The green man: from the moment the road's cars stop, this long; after it, nobody starts across. */
export const WALK = 11;
/** How long a crossing takes on foot, at the slowest (8.7 m at 1.1 m/s), so nobody's left out there at red. */
export const WALK_CLEAR = 8;
/** Where the cars stop: this far from the crossing's middle, just before its zebra (world/town/ground.ts). */
export const STOP_AT = CITY_ROAD / 2 + CITY_WALK + 0.7;
/** Which crossings have lights: at least three ways and within this of the office. */
export const LIGHT_RADIUS = 175;

/** A crossing with lights, and how far its cycle is offset (so the city isn't all in step). */
export interface LitCrossing {
  id: number;
  c: Crossing;
  offset: number;
}

const ways = (c: Crossing) => [c.north, c.south, c.east, c.west].filter(Boolean).length;

/** Every crossing with traffic lights, close by. */
export const LIT: readonly LitCrossing[] = CROSSINGS.filter((c) => ways(c) >= 3 && Math.hypot(c.x, c.z) < LIGHT_RADIUS).map((c, id) => ({
  id,
  c,
  // A green wave of sorts: each street further on, a few seconds later.
  offset: (((c.a * 7 + c.b * 13) % 8) + 8) % 8 * 5,
}));
const LIT_AT = new Map(LIT.map((l) => [`${l.c.a},${l.c.b}`, l]));

/** The crossing with lights at (a, b), if it has them. */
export const litAt = (a: number, b: number): LitCrossing | undefined => LIT_AT.get(`${a},${b}`);

/** Where `t` is in `l`'s cycle (0..CYCLE). */
export const cycleAt = (l: LitCrossing, t: number) => (((t + l.offset) % CYCLE) + CYCLE) % CYCLE;

/** When the road along `axis` turns green, in the cycle. */
const greenFrom = (axis: Axis) => (axis === 'x' ? 0 : GREEN + AMBER + ALL_RED);

/** What the cars' lights on the road along `axis` show at `t`. */
export function lampAt(l: LitCrossing, axis: Axis, t: number): Lamp {
  const u = (cycleAt(l, t) - greenFrom(axis) + CYCLE) % CYCLE;
  if (u < GREEN) return 'green';
  if (u < GREEN + AMBER) return 'amber';
  return u >= CYCLE - 1 ? 'redamber' : 'red';
}

/** How long the cars' light on `axis` has left of what it shows now (s). */
export function lampLeft(l: LitCrossing, axis: Axis, t: number): number {
  const u = (cycleAt(l, t) - greenFrom(axis) + CYCLE) % CYCLE;
  if (u < GREEN) return GREEN - u;
  if (u < GREEN + AMBER) return GREEN + AMBER - u;
  return CYCLE - u;
}

/**
 * The green man for crossing the road along `road`: on while that road's cars stand and the other
 * road's go, from their green on for WALK seconds.
 */
export function walkAt(l: LitCrossing, road: Axis, t: number): boolean {
  const u = (cycleAt(l, t) - greenFrom(road === 'x' ? 'z' : 'x') + CYCLE) % CYCLE;
  return u < WALK;
}

/** The first moment from `t` on that someone may set off across the road along `road` and be over by the end of the green man. */
export function walkStart(l: LitCrossing, road: Axis, t: number): number {
  const u = (cycleAt(l, t) - greenFrom(road === 'x' ? 'z' : 'x') + CYCLE) % CYCLE;
  if (u <= WALK - WALK_CLEAR) return t;
  return t + CYCLE - u;
}

/**
 * Whether something on the road along `axis`, `dist` from the stop line at `speed`, goes on past it
 * now: on green, and on amber only when it couldn't stop in time and is over before the red. Turning
 * (`exitWalk`: the road whose zebra it crosses on the way out) it also waits for the green man there
 * to go off, so nobody on that zebra is in its way.
 */
export function mayPass(l: LitCrossing, axis: Axis, t: number, dist: number, speed: number, brake: number, exitWalk?: Axis): boolean {
  if (exitWalk && walkAt(l, exitWalk, t)) return false;
  const lamp = lampAt(l, axis, t);
  if (lamp === 'green') return true;
  if (lamp !== 'amber') return false;
  const stopping = (speed * speed) / (2 * brake);
  return dist < stopping && dist < speed * lampLeft(l, axis, t) - 0.3;
}

/** The lit crossing on a road along `alongX` at `line` whose stop line comes next going `dir` from `at`, and how far that is (or null within `look`). */
export function nextLight(alongX: boolean, line: number, dir: number, at: number, look: number): { l: LitCrossing; dist: number } | null {
  let best: { l: LitCrossing; dist: number } | null = null;
  for (const l of LIT) {
    const c = l.c;
    if (Math.abs((alongX ? c.z : c.x) - line) > 0.5) continue;
    if (!(alongX ? c.east || c.west : c.north || c.south)) continue;
    const mid = alongX ? c.x : c.z;
    const dist = (mid - dir * STOP_AT - at) * dir;
    if (dist < -0.01 || dist > look) continue;
    if (!best || dist < best.dist) best = { l, dist };
  }
  return best;
}

/**
 * How far the front of something on the road along `alongX` at `line`, going `dir` from `front` at
 * `speed`, may still go before a light stops it (Infinity when none does within `look`). The city's
 * cars and the bus both drive by this, and never put their front past a stop line at red.
 */
export function lightLimit(alongX: boolean, line: number, dir: number, front: number, speed: number, t: number, brake = 9, look = 60): number {
  const next = nextLight(alongX, line, dir, front, look);
  if (!next) return Infinity;
  return mayPass(next.l, alongX ? 'x' : 'z', t, next.dist, speed, brake) ? Infinity : next.dist;
}

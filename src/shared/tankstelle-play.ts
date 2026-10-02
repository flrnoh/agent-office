import { CARS, carPoint, type CarPose } from './garage.js';
import { FUELS, PUMPS, WASH, onWashBay, type Fuel } from './tankstelle.js';

// flrnoh fork (see FORK.md "The petrol station"): what happens at FLOGGE OIL (shared/tankstelle.ts
// lays it out): filling up a garage car at a pump, and the car wash's programme. The office keeps
// the clock (server/tankstelle.ts), so everyone on the floor sees the same litres on the pump and
// the same phase of the wash; it's all fun, there's no money in the office.

// ---- Filling up ------------------------------------------------------------------------------------

/** How long filling up takes (ms). */
export const FILL_MS = 7000;
/** How slow a car must be going to count as standing at a pump or on the wash's marking (m/s). */
export const STILL = 0.6;

/** Which fuel a car takes: the supercars Super Plus, the Bulli plain old Super. */
export function fuelOf(car: number): Fuel {
  return CARS[car]?.kind === 'bulli' ? FUELS[1] : FUELS[2];
}

/** The pump a car standing at `p` is alongside (its index in PUMPS), if it's beside one: nose along the island, a lane over. */
export function pumpFor(p: { x: number; z: number; rotY: number }): number | undefined {
  // Along the islands, which run north-south (either way round).
  if (Math.abs(Math.sin(p.rotY)) > 0.45) return undefined;
  let best: number | undefined;
  let bestD = Infinity;
  for (const [i, q] of PUMPS.entries()) {
    const across = Math.abs(p.x - q.x);
    const along = Math.abs(p.z - q.z);
    if (across < 1.4 || across > 4.6 || along > 2.4) continue;
    const d = across + along;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Where a car's filler flap is (on the side toward pump `pump`), at about its height. */
export function fillerOf(p: { x: number; z: number; rotY: number }, pump: number): { x: number; z: number } {
  const q = PUMPS[pump];
  const left = carPoint(p, 1, -1.25);
  const right = carPoint(p, -1, -1.25);
  return Math.hypot(left.x - q.x, left.z - q.z) < Math.hypot(right.x - q.x, right.z - q.z) ? left : right;
}

/** How many litres have gone in after `ms` of a fill of `liters` (it starts slow and tops off gently). */
export function litersAt(liters: number, ms: number): number {
  const k = Math.max(0, Math.min(1, ms / FILL_MS));
  return liters * (0.7 * k + 0.3 * k * k * (3 - 2 * k));
}

/** How much a fill of `liters` of a car's fuel would cost, in euros. */
export const priceOf = (car: number, liters: number) => liters * fuelOf(car).price;

// ---- The car wash ------------------------------------------------------------------------------------

export type WashPhase = 'prewash' | 'foam' | 'brush' | 'rinse' | 'dry' | 'done';

/** The programme, one step after another (ms), and which way the gantry goes along the car meanwhile. */
export const PROGRAMME: readonly { phase: Exclude<WashPhase, 'done'>; ms: number; name: string; forward: boolean }[] = [
  { phase: 'prewash', ms: 3500, name: 'Vorwäsche', forward: true },
  { phase: 'foam', ms: 5000, name: 'Aktivschaum', forward: false },
  { phase: 'brush', ms: 9000, name: 'Bürstenwäsche', forward: true },
  { phase: 'rinse', ms: 4000, name: 'Klarspülen', forward: false },
  { phase: 'dry', ms: 5500, name: 'Trocknen', forward: true },
];
/** The whole programme (ms). */
export const WASH_MS = PROGRAMME.reduce((s, p) => s + p.ms, 0);
/** How long a washed car stays extra shiny (ms). */
export const SHINE_MS = 10 * 60_000;

export interface WashMoment {
  phase: WashPhase;
  /** How far into this phase (0–1). */
  k: number;
  /** Where the gantry is between WASH.from (0) and WASH.to (1). */
  gantry: number;
  name: string;
}

const ease = (k: number) => k * k * (3 - 2 * k);

/** Where the programme is `ms` after it started. */
export function washAt(ms: number): WashMoment {
  let t = Math.max(0, ms);
  for (const p of PROGRAMME) {
    if (t < p.ms) {
      const k = t / p.ms;
      // The brushes go along the car and back again; the rest pass once.
      const run = p.phase === 'brush' ? (k < 0.5 ? ease(k * 2) : 1 - ease((k - 0.5) * 2)) : ease(k);
      return { phase: p.phase, k, gantry: p.forward ? run : 1 - run, name: p.name };
    }
    t -= p.ms;
  }
  return { phase: 'done', k: 1, gantry: 0, name: 'Fertig' };
}

/** The gantry's z for a moment of the programme. */
export const gantryZ = (m: WashMoment) => WASH.from + (WASH.to - WASH.from) * m.gantry;

// ---- What the office keeps, and the messages ------------------------------------------------------------

export interface FillState {
  pump: number;
  car: number;
  /** How many litres it'll take in all. */
  liters: number;
  /** How long it's been going (ms), as the office sent it. */
  elapsed: number;
  /** Who started it (a PeerInfo id). */
  by: string;
}

export interface WashState {
  car: number;
  elapsed: number;
  by: string;
}

/** A floor's station: the pumps going, the car in the wash, and the cars still shiny from one (ms of shine left). */
export interface TankState {
  fills: FillState[];
  wash: WashState | null;
  shine: { car: number; left: number }[];
}

export const emptyTank = (): TankState => ({ fills: [], wash: null, shine: [] });

export type TankClientMsg =
  /** Fill up car `car` at pump `pump` (from behind its wheel, or standing at the pump). */
  | { t: 'tank.fill'; pump: number; car: number }
  /** Start the car wash for car `car`, standing on its marking. */
  | { t: 'tank.wash'; car: number };

export type TankServerMsg = { t: 'tankstelle'; state: TankState };

/** Whether car `p` stands still enough on the wash's marking to be washed. */
export const readyToWash = (p: CarPose) => Math.abs(p.speed) < STILL && onWashBay(p);
/** Whether car `p` stands still enough beside pump `pump` to be filled. */
export const readyToFill = (p: CarPose, pump: number) => Math.abs(p.speed) < STILL && pumpFor(p) === pump;

/** The lane through the wash, for the tests: where a car drives in and out. */
export const WASH_LANE = { x: WASH.lane, from: WASH.hall.maxZ + 6, to: WASH.hall.minZ - 4 } as const;

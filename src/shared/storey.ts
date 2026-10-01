// Each storey's own cut (flrnoh fork, see FORK.md). Every floor of the building is a project, and in
// the real world no two would have the same layout. `storeyPlan(index)` is where each floor's lies:
// the same seats and fixtures (same ids, same counts, so the server's seating doesn't care which floor
// it is), laid out its own way. It's a pure function of the floor's index in the stack (0 is the bottom
// one), so the client and the server, and every player's screen, work out the same plan for a floor,
// and its deterministic play (golf, the basketball) stays in step. Floor 0's plan is layout.ts's
// constants; the floors above vary from them. Each is worked out once and kept.
//
// Not to be confused with shared/floorplan.ts (a floor's desk signs and how far its back office is
// built out, which people change) or world/office/build.ts's list of fixtures: this is the bare cut.

import { ASHTRAY, BALCONY, BALCONY_DOOR, DESK_BY_ID, DESK_CLUSTERS_X, DESK_PODS, DESKS, GOLF_TEE, PARACHUTE, WINDOWS, WING_DESKS, buildDesks, deskBuilt, type DeskDef, type Opening } from './layout.js';

/** A balcony's footprint off the south wall. */
export interface BalconyRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** One storey's layout: its desks and its balcony vary, the rest is the same on every floor. */
export interface StoreyPlan {
  /** The room's worker desks, `desk-1`..`desk-16`: the same ids on every floor, laid out per floor. */
  desks: DeskDef[];
  /** Any place a worker can be by id (seats, the back office's, kiosks, meeting chairs, the boss desk), with this floor's desks. */
  deskById: Map<string, DeskDef>;
  /** The smoking balcony: its depth is fixed, it reaches its own way along the south wall. */
  balcony: BalconyRect;
  /** The glass doors out to it, in the south wall (they don't move: the wall above doesn't). */
  balconyDoor: Opening;
  /** The ashtray on the balcony, where a smoke break starts. */
  ashtray: { x: number; z: number };
  /** The golf tee on the balcony, its ball and the bag behind it. */
  golfTee: typeof GOLF_TEE;
  /** Leaving off the balcony by parachute (see PARACHUTE). */
  parachute: typeof PARACHUTE;
  /** The windows in the outside walls. */
  windows: Opening[];
}

const PLANS = new Map<number, StoreyPlan>();

/**
 * A little deterministic randomness for floor `index`, seeded from it alone (the same LCG the tower
 * uses): every page, and the server, works out the same numbers for a floor.
 */
function storeyRandom(index: number): () => number {
  let seed = (Math.imul(index + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  seed = seed % 2147483647 || 1;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Puts a plan together from a floor's desks and balcony; everything else is the same on every floor. */
function makePlan(desks: DeskDef[], balcony: BalconyRect): StoreyPlan {
  const deskById = new Map(DESK_BY_ID);
  for (const d of desks) deskById.set(d.id, d);
  return { desks, deskById, balcony, balconyDoor: BALCONY_DOOR, ashtray: ASHTRAY, golfTee: GOLF_TEE, parachute: PARACHUTE, windows: WINDOWS };
}

/**
 * How floor `key` (1 and up) differs from floor 0: the desk pods sit a little differently, and the
 * balcony reaches further (or less far) along the south wall. The balcony always covers its doors and
 * what stands on it (the bench, the stools, the tee, the ashtray), and its doors, windows and depth
 * don't move, so no two floors have the same cut without disturbing how you get out onto it.
 */
function variedPlan(key: number): StoreyPlan {
  const rnd = storeyRandom(key);
  const span = (mid: number, half: number) => mid + (rnd() * 2 - 1) * half;
  // The clusters slide a little across, and each pod up or down the room; the 2×2 pods and the way
  // each row faces stay as they are, so it still reads as an office of desks.
  const clusterX = DESK_CLUSTERS_X.map((x) => span(x, 1.2));
  const pods = DESK_PODS.map((p) => {
    const c = span((p.back + p.front) / 2, 0.8);
    return { back: c - 0.55, front: c + 0.55 };
  });
  // It only ever reaches further than the bottom floor's, so everything standing out there (the bench,
  // the table and stools, the tee, the ashtray, the lamp poles and their string lights) is on every
  // storey's deck where the bottom floor has it (see world/office/balcony.ts).
  const balcony = { minX: BALCONY.minX - rnd() * 1.8, maxX: BALCONY.maxX + rnd() * 1.4, minZ: BALCONY.minZ, maxZ: BALCONY.maxZ };
  return makePlan(buildDesks(clusterX, pods), balcony);
}

/** The plan of floor `index` (0 is the bottom one), worked out once and kept. Floor 0 is layout.ts's constants. */
export function storeyPlan(index: number): StoreyPlan {
  const key = Math.max(0, Math.trunc(index) || 0);
  let plan = PLANS.get(key);
  if (!plan) {
    plan = key === 0 ? makePlan(DESKS, BALCONY) : variedPlan(key);
    PLANS.set(key, plan);
  }
  return plan;
}

/** Every desk on floor `index`, built out `wing` rows: the room's (as this floor lays them out), then the back office's. */
export function storeyDesks(index: number, wing: number): DeskDef[] {
  return [...storeyPlan(index).desks, ...WING_DESKS.filter((d) => deskBuilt(d, wing))];
}

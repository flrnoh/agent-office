// The pool on the roof (flrnoh fork, see FORK.md "Pool party on the roof"): a raised pool on a wooden
// deck in the north-east corner of the terrace (clear of the elevator, where the sky bar once stood),
// for an afterwork pool party, with a water slide and a diving tower. Shared by the
// page (which builds it and swims in it) and the tests (which check it stands clear of everything else
// up there). Nobody tells the office they're swimming: like the sea, every page works it out from where
// someone is (their `move`).
import { POOL_DEFAULTS, type PoolDef } from './swim.js';

/** The water, inside the basin's walls: x and z on the roof, its surface `surface` up, its floor the roof. */
export const POOL = { minX: 11.4, maxX: 16.2, minZ: -11.8, maxZ: -6.6, surface: 0.85 } as const;

/** The deck round it, its top `top` up, and the steps up to it on its south side (toward the tables). */
export const POOL_DECK = { minX: 10.6, maxX: 17.0, minZ: -12.6, maxZ: -5.8, top: 1.0 } as const;

/** The steps up onto the deck from the south: each `rise` high and `run` deep, from x0 to x1. */
export const POOL_STEPS = { x0: 11.4, x1: 14.4, rise: 0.25, run: 0.3, count: 3 } as const;

/** How far below the surface a swimmer's feet are (the sea's SWIM_SINK). */
export const POOL_SINK = 1.25;

/** Whether (x, z) is over the water, `slack` in from its walls. */
export function overPool(x: number, z: number, slack = 0): boolean {
  return x > POOL.minX + slack && x < POOL.maxX - slack && z > POOL.minZ + slack && z < POOL.maxZ - slack;
}

/** Whether someone with their feet at `y` (the roof is 0) at (x, z) is in the pool. */
export function inPoolAt(x: number, y: number, z: number): boolean {
  return overPool(x, z) && y < POOL.surface - 0.3 && y > POOL.surface - POOL_SINK - 0.6;
}

/** The steps up to the deck, as boxes on the roof: the lowest first. */
export function poolSteps(): { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] {
  const s = POOL_STEPS;
  return Array.from({ length: s.count }, (_, i) => {
    const top = s.rise * (i + 1);
    // The top step against the deck, the lowest furthest out.
    const maxZ = POOL_DECK.maxZ + s.run * (s.count - i);
    return { minX: s.x0, maxX: s.x1, minZ: maxZ - s.run, maxZ, top };
  });
}

/** The deck as four boxes round the water (what you stand on, and what keeps a swimmer in). */
export function poolDeck(): { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] {
  const d = POOL_DECK;
  const p = POOL;
  return [
    { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: p.minZ, top: d.top },
    { minX: d.minX, maxX: d.maxX, minZ: p.maxZ, maxZ: d.maxZ, top: d.top },
    { minX: d.minX, maxX: p.minX, minZ: p.minZ, maxZ: p.maxZ, top: d.top },
    { minX: p.maxX, maxX: d.maxX, minZ: p.minZ, maxZ: p.maxZ, top: d.top },
  ];
}

/** Where on the deck someone climbing out at (x, z) comes up: straight out over the nearest wall. */
export function climbOutAt(x: number, z: number): { x: number; z: number } {
  const p = POOL;
  const ways = [
    { d: x - p.minX, at: { x: p.minX - 0.45, z } },
    { d: p.maxX - x, at: { x: p.maxX + 0.45, z } },
    { d: z - p.minZ, at: { x, z: p.minZ - 0.45 } },
    { d: p.maxZ - z, at: { x, z: p.maxZ + 0.45 } },
  ];
  // Not up where the water slide runs low over the deck, or into its tower,
  const free = (at: { x: number; z: number }) =>
    !(at.x > SLIDE_ZONE.minX && at.x < SLIDE.x + SLIDE.half + 0.1 && at.z > SLIDE_ZONE.minZ && at.z < SLIDE_ZONE.maxZ) &&
    // Nor into the diving tower's legs.
    !(at.x > DIVE.minX - 0.4 && at.x < DIVE.maxX + 0.4 && at.z < POOL.minZ);
  return [...ways].sort((a, b) => a.d - b.d).find((w) => free(w.at))!.at;
}

/** Whether a swimmer at (x, z) is near enough a wall to climb out. */
export function atPoolEdge(x: number, z: number): boolean {
  return overPool(x, z) && !overPool(x, z, 0.75);
}

/** The floats drifting on the water, and where each is at `t` seconds of the office's clock: the same on every page. */
export const FLOATS = ['flamingo', 'donut', 'ball', 'unicorn'] as const;
export type FloatKind = (typeof FLOATS)[number];
export function floatAt(i: number, t: number): { x: number; z: number; turn: number } {
  const cx = (POOL.minX + POOL.maxX) / 2;
  const cz = (POOL.minZ + POOL.maxZ) / 2;
  const rx = (POOL.maxX - POOL.minX) / 2 - 0.8;
  const rz = (POOL.maxZ - POOL.minZ) / 2 - 0.8;
  const w = 0.05 + i * 0.013;
  const a = t * w + i * 1.7;
  return { x: cx + Math.cos(a) * rx * (0.55 + 0.4 * Math.sin(i + t * 0.02)), z: cz + Math.sin(a * 1.3) * rz * 0.8, turn: a * 0.6 + i };
}

// ---- The water slide (flrnoh fork, see FORK.md "Pool party on the roof") ---------------------------

/**
 * The slide's tower on the deck's south-east corner, its platform `top` up, its ladder up its north
 * face from the deck's east side (you stand at `foot` to climb), and the tube from the platform once
 * round the tower and down into the water, as points along its bottom (the first leaving the platform,
 * the last in the water).
 */
export const SLIDE = (() => {
  const x = POOL_DECK.maxX - 0.4;
  const z = POOL_DECK.maxZ - 0.4;
  // From the tower's middle: once round it clockwise from the north, then off north-west into the water.
  const round: [number, number, number][] = [
    [0, 3.6, 0],
    [0, 3.5, -0.75],
    [0.6, 3.3, -0.6],
    [0.85, 3.05, 0],
    [0.6, 2.85, 0.6],
    [0, 2.65, 0.85],
    [-0.6, 2.4, 0.6],
    [-0.85, 2.05, 0],
    [-1.1, 1.65, -0.7],
    [-1.7, 1.2, -1.3],
    [-2.6, 0.9, -1.8],
  ];
  return {
    x,
    z,
    half: 0.4,
    top: 3.6,
    foot: { x, z: z - 0.95 },
    path: round.map(([dx, y, dz]) => [x + dx, y, z + dz] as const) as readonly (readonly [number, number, number])[],
  };
})();

/** Where the slide runs low over the deck: nobody stands there (its colliders keep them off). */
export const SLIDE_ZONE = { minX: SLIDE.x - 1.6, maxX: SLIDE.x - SLIDE.half, minZ: POOL.maxZ, maxZ: POOL_DECK.maxZ } as const;

/** A point `s` (0 the platform … 1 the water) along the slide, straight between its points. */
export function slideAt(s: number): { x: number; y: number; z: number } {
  const pts = SLIDE.path;
  const f = Math.max(0, Math.min(1, s)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const [a, b] = [pts[i], pts[i + 1]];
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k };
}

/** Whether someone with their feet at (x, y, z) is on the way down the slide (not on its platform). */
export function slidingAt(x: number, y: number, z: number): boolean {
  if (y < POOL.surface + 0.15 || y > SLIDE.top - 0.05) return false;
  for (let s = 0.05; s <= 1; s += 0.025) {
    const p = slideAt(s);
    if (Math.abs(p.y - y) < 0.5 && Math.hypot(p.x - x, p.z - z) < 0.55) return true;
  }
  return false;
}

// ---- The diving tower (flrnoh fork, see FORK.md "Pool party on the roof") -------------------------

/**
 * The diving tower on the deck's north side: its legs on the deck, its platform `top` up reaching out
 * over the water to `front`, a board on out from it to `board`, a ladder up its west side (you stand at
 * `foot` to climb; up top you come out at `up`).
 */
export const DIVE = {
  minX: 13.0,
  maxX: 14.6,
  minZ: POOL_DECK.minZ,
  front: POOL.minZ + 0.8,
  board: { minX: 13.5, maxX: 14.1, to: POOL.minZ + 1.6 },
  top: 4.5,
  foot: { x: 12.4, z: POOL_DECK.minZ + 0.4 },
  up: { x: 13.8, z: POOL_DECK.minZ + 0.5 },
} as const;

/** What you walk on up the diving tower: its platform and its board, as boxes, tops `top` up. */
export function diveFloors(): { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom: number }[] {
  const d = DIVE;
  return [
    { minX: d.minX, maxX: d.maxX, minZ: d.minZ, maxZ: d.front, top: d.top, bottom: d.top - 0.2 },
    { minX: d.board.minX, maxX: d.board.maxX, minZ: d.front, maxZ: d.board.to, top: d.top + 0.05, bottom: d.top - 0.1 },
  ];
}

/** The pool as a pool to swim in (shared/swim.ts, client/swim/): its feet down in the deck's slab, so the walls are tried just over the roof's floor. */
export const ROOF_SWIM: PoolDef = {
  ...POOL_DEFAULTS,
  id: 'roof-pool',
  rects: [POOL],
  surface: POOL.surface,
  floor: POOL.surface - POOL_SINK - 0.4,
  sink: POOL_SINK,
  deck: POOL_DECK.top,
  wallsAt: 0.05,
  speed: 1.8,
  fast: 2.8,
  jumpScale: 2,
  dunk: { base: 0.1, extra: 0.3 },
  strokeEvery: 0.75,
  climbOut: (x, z) => climbOutAt(x, z),
};

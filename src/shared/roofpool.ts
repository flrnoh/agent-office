// The pool on the roof (flrnoh fork, see FORK.md "Pool party on the roof"): a raised pool on a wooden
// deck between the dance floor, the elevator and the bar, for an afterwork pool party. Shared by the
// page (which builds it and swims in it) and the tests (which check it stands clear of everything else
// up there). Nobody tells the office they're swimming: like the sea, every page works it out from where
// someone is (their `move`).

/** The water, inside the basin's walls: x and z on the roof, its surface `surface` up, its floor the roof. */
export const POOL = { minX: 4.4, maxX: 9.8, minZ: -8.2, maxZ: -4.2, surface: 0.85 } as const;

/** The deck round it, its top `top` up, and the steps up to it on its south side (toward the tables). */
export const POOL_DECK = { minX: 3.6, maxX: 10.6, minZ: -9.0, maxZ: -3.4, top: 1.0 } as const;

/** The steps up onto the deck from the south: each `rise` high and `run` deep, from x0 to x1. */
export const POOL_STEPS = { x0: 5.2, x1: 8.8, rise: 0.25, run: 0.3, count: 3 } as const;

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
  return ways.reduce((a, b) => (b.d < a.d ? b : a)).at;
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

/*
 * Pools as data (flrnoh fork, see FORK.md "Swimming"): what every pool the office has to swim in is,
 * and the pure maths of being in one, shared by the page (client/swim/, the one controller for all
 * of them) and the tests. A pool is the water over one or more rectangles (a freeform basin is
 * several), how high its surface is, how deep, the deck you climb out onto, and how it swims. The gym
 * basement's lap pool and the roof's pool are pools like this; the thermal baths' basins will be too.
 */

/** A rectangle on the floor. */
export interface SwimRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Timing wall to wall along `axis`: a length of `meters`, your best kept in this browser under `key`. */
export interface SwimLengths {
  axis: 'x' | 'z';
  meters: number;
  /** How near a wall counts as touching it. */
  touch: number;
  /** localStorage key for your best. */
  key: string;
  /** A word on where you swam it (the lane), or nothing. */
  where?(x: number, z: number): string;
}

export interface PoolDef {
  id: string;
  /** The water: the union of these (they may touch or overlap). */
  rects: readonly SwimRect[];
  /** The water's surface (y), and its floor. */
  surface: number;
  floor: number;
  /** How far below the surface a swimmer's feet are: their head bobs at it. */
  sink: number;
  /** What you climb out onto (y). */
  deck: number;
  /** How near a wall (inside the water) is near enough to climb out. */
  edge: number;
  /** Swimming speed, and with Shift. */
  speed: number;
  fast: number;
  /** How far above the surface a jump has to start to go in as hard as it gets. */
  jumpScale: number;
  /** How far under you go going in: `base` plus `extra` × how hard you jumped. */
  dunk: { base: number; extra: number };
  /** Seconds between strokes' sounds. */
  strokeEvery: number;
  /** The height the walls are tried at while you swim: your own (undefined; the deck reaches down past your feet) or this one (the deck's a slab you're down in). */
  wallsAt?: number;
  /** Where someone climbing out at (x, z) comes up, when the pool has its own say (blocks, a slide); else straight out over the nearest wall. */
  climbOut?(x: number, z: number): { x: number; z: number };
  lengths?: SwimLengths;
  /** How far the surface is lifted at (x, z) at `now` (office ms): waves. */
  swell?(x: number, z: number, now: number): number;
  /** Which way the water carries you at (x, z) at `now`, in m/s: a current. */
  flow?(x: number, z: number, now: number): { x: number; z: number };
}

/** The defaults a pool has unless it says otherwise. */
export const POOL_DEFAULTS = { edge: 0.75, speed: 1.6, fast: 2.4, jumpScale: 1.5, dunk: { base: 0.15, extra: 0.35 }, strokeEvery: 0.7 } as const;

const inRect = (r: SwimRect, x: number, z: number, slack: number) => x > r.minX + slack && x < r.maxX - slack && z > r.minZ + slack && z < r.maxZ - slack;

/** Whether (x, z) is over the water, `slack` in from its walls: in from every wall, where the rectangles meet too (a point near where two meet is inside the other). */
export function overPool(def: PoolDef, x: number, z: number, slack = 0): boolean {
  if (slack <= 0) return def.rects.some((r) => inRect(r, x, z, slack));
  // In by `slack` from the union's edge: the square round (x, z) is all water.
  return [-slack, slack].every((dx) => [-slack, slack].every((dz) => def.rects.some((r) => inRect(r, x + dx, z + dz, 0)))) && def.rects.some((r) => inRect(r, x, z, -1e-9));
}

/** The surface at (x, z) at `now`: waves lift it. */
export const surfaceAt = (def: PoolDef, x: number, z: number, now: number) => def.surface + (def.swell?.(x, z, now) ?? 0);

/** Whether someone with feet at `y` at (x, z) is swimming in it. */
export function inPoolAt(def: PoolDef, x: number, y: number, z: number): boolean {
  return overPool(def, x, z) && y < def.surface - 0.3 && y > def.floor - 0.2;
}

/** Whether a swimmer at (x, z) is near enough a wall to climb out. */
export function atEdge(def: PoolDef, x: number, z: number): boolean {
  return overPool(def, x, z) && !overPool(def, x, z, def.edge);
}

/** Where someone climbing out at (x, z) could come up, best first: the pool's own say, else straight out over each wall that has deck behind it (not into more water), nearest first. */
export function climbOutWays(def: PoolDef, x: number, z: number): { x: number; z: number }[] {
  if (def.climbOut) return [def.climbOut(x, z)];
  const OUT = 0.45;
  const ways: { d: number; at: { x: number; z: number } }[] = [];
  for (const r of def.rects) {
    if (!inRect(r, x, z, 0)) continue;
    ways.push({ d: x - r.minX, at: { x: r.minX - OUT, z } }, { d: r.maxX - x, at: { x: r.maxX + OUT, z } }, { d: z - r.minZ, at: { x, z: r.minZ - OUT } }, { d: r.maxZ - z, at: { x, z: r.maxZ + OUT } });
  }
  ways.sort((a, b) => a.d - b.d);
  const dry = ways.filter((w) => !overPool(def, w.at.x, w.at.z));
  return (dry.length ? dry : ways.slice(0, 1)).map((w) => w.at);
}

/** Where someone climbing out at (x, z) comes up (the first of climbOutWays; the page also skips any with something standing there). */
export function climbOutAt(def: PoolDef, x: number, z: number): { x: number; z: number } {
  return climbOutWays(def, x, z)[0] ?? { x, z };
}

/** The pool (x, z) is over, of `pools`, if any. */
export function poolAt(pools: readonly PoolDef[], x: number, z: number, slack = 0): PoolDef | undefined {
  return pools.find((p) => overPool(p, x, z, slack));
}

/** Which wall of the lengths' axis (x, z) is touching: the low end, the high end, or neither. */
export function wallTouched(def: PoolDef, x: number, z: number): 'lo' | 'hi' | null {
  const L = def.lengths;
  if (!L) return null;
  const v = L.axis === 'x' ? x : z;
  const lo = Math.min(...def.rects.map((r) => (L.axis === 'x' ? r.minX : r.minZ)));
  const hi = Math.max(...def.rects.map((r) => (L.axis === 'x' ? r.maxX : r.maxZ)));
  return v < lo + L.touch ? 'lo' : v > hi - L.touch ? 'hi' : null;
}

/** A stretch of a pool's wall: along `axis` at `at` from `from` to `to`; `out` is the way to the deck (+1 or -1 along the other axis). */
export interface PoolEdge {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  out: 1 | -1;
}

/** Where a pool's water meets the deck: each rectangle's sides, less where they meet another's water (a seam is no wall). */
export function poolEdges(def: PoolDef): PoolEdge[] {
  const out: PoolEdge[] = [];
  const E = 0.01;
  for (const r of def.rects) {
    const sides: [PoolEdge['axis'], number, number, number, 1 | -1][] = [
      ['x', r.minZ, r.minX, r.maxX, -1],
      ['x', r.maxZ, r.minX, r.maxX, 1],
      ['z', r.minX, r.minZ, r.maxZ, -1],
      ['z', r.maxX, r.minZ, r.maxZ, 1],
    ];
    for (const [axis, at, from, to, dir] of sides) {
      // Split where the other rectangles' sides cross it, and keep the pieces with no water past them.
      const cuts = [from, to, ...def.rects.flatMap((o) => (axis === 'x' ? [o.minX, o.maxX] : [o.minZ, o.maxZ])).filter((v) => v > from && v < to)].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        if (b - a < 1e-6) continue;
        const m = (a + b) / 2;
        const wet = axis === 'x' ? overPool(def, m, at + dir * E) : overPool(def, at + dir * E, m);
        if (wet) continue;
        const last = out[out.length - 1];
        if (last && last.axis === axis && last.at === at && last.out === dir && Math.abs(last.to - a) < 1e-6) last.to = b;
        else out.push({ axis, at, from: a, to: b, out: dir });
      }
    }
  }
  return out;
}

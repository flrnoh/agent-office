import { BLOCKS, BLOCK_INNER, PARK_TREES, type Block } from './city.js';
import { FURNITURE } from './streetside.js';

// flrnoh fork (see FORK.md, "Sounds of the city"): a small church with a bell tower, standing on one
// of the city's parks a short walk from the office, whose bells strike the office's hours
// (shared/citysound.ts, sound/city.ts). It's laid out here, once, so the page that draws it
// (world/church/), the bells and the tests agree on where it stands. It doesn't change the park: it
// takes a clear patch of grass between the park's trees.

/** How far from the office (the origin) the church's park may be, in metres. */
export const CHURCH_RANGE = { min: 80, max: 200 } as const;
/** The nave: long and narrow, its gable roof's ridge this high. */
export const NAVE = { len: 15, w: 8.5, eaves: 6.5, ridge: 10 } as const;
/** The tower at the nave's west end: square, its belfry under a pointed spire. */
export const TOWER = { w: 5, h: 17, spire: 9, belfry: 14 } as const;
/** How far the church keeps from the park's trees' trunks, and from the park's edge. */
const TREE_CLEAR = 4.5;
const EDGE_CLEAR = 4;

/** A box, its bottom and top above the street. */
export interface ChurchSolid {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottom: number;
  top: number;
}

export interface Church {
  /** The park it stands on. */
  block: Block;
  /** The middle of its whole footprint, nave and tower. */
  x: number;
  z: number;
  /** Whether it's long along x (else along z); `dir` is the way from the tower to the altar (±1). */
  alongX: boolean;
  dir: 1 | -1;
  /** The tower's middle. */
  tower: { x: number; z: number };
  /** The nave's middle. */
  nave: { x: number; z: number };
  /** Where the bells hang, above the street. */
  bell: { x: number; y: number; z: number };
  /** What's in the way: the nave and the tower. */
  solids: ChurchSolid[];
}

/** The footprint's half sizes, along and across its length. */
const HALF_LONG = (NAVE.len + TOWER.w) / 2;
const HALF_WIDE = NAVE.w / 2;

/** Every tree near `b`: the park's own and the street trees round it. */
function treesBy(b: Block): { x: number; z: number }[] {
  const near = (t: { x: number; z: number }) => Math.abs(t.x - b.x) < 40 && Math.abs(t.z - b.z) < 40;
  return [...PARK_TREES.filter(near), ...FURNITURE.filter((f) => f.kind === 'tree' && near(f))];
}

/** Lays the church out at (x, z) on `b`, long along x or z, the tower at the `dir` end's opposite. */
function build(b: Block, x: number, z: number, alongX: boolean, dir: 1 | -1): Church {
  const at = (along: number) => (alongX ? { x: x + along, z } : { x, z: z + along });
  const tower = at(-dir * (HALF_LONG - TOWER.w / 2));
  const nave = at(dir * (HALF_LONG - NAVE.len / 2));
  const box = (c: { x: number; z: number }, long: number, wide: number, top: number): ChurchSolid => {
    const hx = (alongX ? long : wide) / 2;
    const hz = (alongX ? wide : long) / 2;
    return { minX: c.x - hx, maxX: c.x + hx, minZ: c.z - hz, maxZ: c.z + hz, bottom: 0, top };
  };
  return {
    block: b,
    x,
    z,
    alongX,
    dir,
    tower,
    nave,
    bell: { x: tower.x, y: TOWER.belfry, z: tower.z },
    solids: [box(nave, NAVE.len, NAVE.w, NAVE.ridge), box(tower, TOWER.w, TOWER.w, TOWER.h)],
  };
}

/** Whether a footprint at (x, z) keeps clear of `trees`. */
function clear(x: number, z: number, alongX: boolean, trees: { x: number; z: number }[]): boolean {
  const hx = alongX ? HALF_LONG : HALF_WIDE;
  const hz = alongX ? HALF_WIDE : HALF_LONG;
  return trees.every((t) => Math.max(Math.abs(t.x - x) - hx, 0) ** 2 + Math.max(Math.abs(t.z - z) - hz, 0) ** 2 >= TREE_CLEAR ** 2);
}

/**
 * The park nearest the office that's CHURCH_RANGE away and has a clear patch of grass big enough,
 * and on it the clear spot nearest its middle: the tower toward the office, so you see it first.
 */
function layChurch(): Church | null {
  const parks = BLOCKS.filter((b) => b.kind === 'park' && Math.hypot(b.x, b.z) >= CHURCH_RANGE.min && Math.hypot(b.x, b.z) <= CHURCH_RANGE.max).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z));
  for (const b of parks) {
    const trees = treesBy(b);
    let best: Church | null = null;
    let bestD = Infinity;
    for (const alongX of [true, false]) {
      const hx = (alongX ? HALF_LONG : HALF_WIDE) + EDGE_CLEAR;
      const hz = (alongX ? HALF_WIDE : HALF_LONG) + EDGE_CLEAR;
      for (let x = b.x - BLOCK_INNER / 2 + hx; x <= b.x + BLOCK_INNER / 2 - hx; x += 0.5) {
        for (let z = b.z - BLOCK_INNER / 2 + hz; z <= b.z + BLOCK_INNER / 2 - hz; z += 0.5) {
          const d = Math.hypot(x - b.x, z - b.z);
          if (d >= bestD || !clear(x, z, alongX, trees)) continue;
          // The tower at the end nearer the office.
          const toOffice = alongX ? -x : -z;
          best = build(b, x, z, alongX, toOffice > 0 ? -1 : 1);
          bestD = d;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** The church, or null if no park in range has room for it (tests/citysound.test.ts says there is). */
export const CHURCH: Church | null = layChurch();

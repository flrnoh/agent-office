import { CITY_ROAD, CITY_WALK, CITY_X, CITY_Z, CROSSINGS, PERIOD, STREETS, onCityStreet, type Crossing } from './city.js';
import { LOT, SIDE_LOT } from './garage.js';
import { FLOOR, ROAD, WALL_T } from './layout.js';
import { STREET_END, STREET_Z } from './scenic.js';
import { BOLLARD_IN, BOLLARD_OFF, FURNITURE, LAMPS, LAMP_OFF, stretchSpan } from './streetside.js';
import { POLE_OFF } from './busnet.js'; // fork: the bus stops that are only a pole
import { SHOPS, shopPoint, type Shop } from './shops.js';

// flrnoh fork (see FORK.md): where the city's passers-by may walk (shared/passersby.ts plans their
// walks, client/world/town/people.ts draws them). It's a graph laid over the sidewalks: a Walk is one
// sidewalk, one side of a stretch of street from crossing to crossing (or of the office's own street,
// out to its ends), and a Corner is where a walk comes round a block's corner at a crossing. Corners
// are joined by the walks, by the zebras across the streets, and straight on where no street comes
// in. Off the sidewalks there are only the spots by them: the benches and bus stops on the strip past
// the sidewalk, and the shop windows and doors of the buildings that face it. Nothing goes on the
// road except across it at a crossing, nothing into a lot, the office's own lot or its garage's.

/** Half the road, from its middle line to the curb. */
const H = CITY_ROAD / 2;
/** The two lanes along a sidewalk (from the street's middle): by the curb and by the lots. */
export const INNER = H + 0.55;
export const OUTER = H + 1.85;
/** How far from the street's middle someone may step aside to: the curb, and the far edge (city / the office's street). */
export const BAND_MIN = H + 0.3;
const BAND_MAX_CITY = H + CITY_WALK + 0.2;
const BAND_MAX_MAIN = H + CITY_WALK - 0.25;
/** Where along a walk its legs end, from the crossing's middle: past the bollards. */
export const END_IN = BOLLARD_IN + 0.6;
/** A block's corner at a crossing: this far out both ways from its middle. */
export const CORNER = H + 1.6;
/** Where a crossing's zebra crosses a street (from the crossing's middle), and where you wait at its curb. */
export const ZEBRA_AT = H + 1.25;
export const CURB_AT = H + 0.35;
/** How far out the passers-by go: past this nobody's near enough to see them. */
export const WALK_RADIUS = 240;

/** Something standing on a walk to go round: along it, how far from the street's middle, how big. */
export interface Post {
  at: number;
  off: number;
  r: number;
}

export type SpotKind = 'bench' | 'bus' | 'stop' | 'window' | 'door' | 'cafe';

/**
 * Somewhere by a walk to go to: a seat on a bench or in a bus stop, a place to stand and wait for the
 * bus, a shop window to look into, a shop door. `x, z` is where they sit or stand, facing `yaw`; they
 * get there from `along` on the walk, straight across. A door's `inside` is behind it, where they go.
 */
export interface Spot {
  kind: SpotKind;
  walk: number;
  along: number;
  x: number;
  z: number;
  yaw: number;
  /** How far apart two people side by side are here (a bench's two seats). */
  spread: number;
  inside?: { x: number; z: number };
  /** A door's or a café table's shop (by its place in SHOPS): nobody goes there while it's shut (shared/shopfronts.ts). */
  shop?: number;
  /** A café table (shared/shop-outside.ts adds those): where someone alone sits, the two of a pair `spread` either side of `x, z`. */
  solo?: [number, number];
}

export interface Walk {
  id: number;
  alongX: boolean;
  /** The street's middle line (z for a walk along x), and which side of it the walk is on (±1). */
  line: number;
  side: -1 | 1;
  from: number;
  to: number;
  /** The corner at either end (`from`, `to`), or -1 where the sidewalk just stops. */
  ends: [number, number];
  /** On the office's own street. */
  main: boolean;
  /** The far edge of where someone may step to (see BAND_MIN). */
  bandMax: number;
  posts: Post[];
  spots: Spot[];
}

export type Link = { kind: 'walk'; walk: number; end: 0 | 1 } | { kind: 'cross' | 'straight'; to: number; path: [number, number][]; road: boolean };

export interface Corner {
  id: number;
  /** The crossing it's a corner of, and which one (±1 in x and z from its middle). */
  a: number;
  b: number;
  sx: -1 | 1;
  sz: -1 | 1;
  x: number;
  z: number;
  links: Link[];
}

/** Where `along`, `off` on a walk is in the world. */
export function walkPoint(w: Walk, along: number, off: number): [number, number] {
  return w.alongX ? [along, w.line + w.side * off] : [w.line + w.side * off, along];
}

/** Where (x, z) is on a walk: how far along and how far from the street's middle (on its side). */
export function walkCoords(w: Walk, x: number, z: number): [number, number] {
  return w.alongX ? [x, (z - w.line) * w.side] : [z, (x - w.line) * w.side];
}

/**
 * How far from the street's middle someone at `along` on `w` walks who'd like to be at `off`: round
 * anything standing in the way (`clear` their own size), within the sidewalk.
 */
export function detour(w: Walk, along: number, off: number, clear = 0.25): number {
  let q = off;
  for (const p of w.posts) {
    const d = Math.abs(along - p.at);
    const reach = p.r + clear;
    if (d > reach + 0.7) continue;
    if (Math.abs(q - p.off) >= reach) continue;
    // Past it on the side they're on, unless there's no room there.
    let to = q < p.off ? p.off - reach : p.off + reach;
    if (to < BAND_MIN) to = p.off + reach;
    else if (to > w.bandMax) to = p.off - reach;
    const k = d < reach ? 1 : 1 - (d - reach) / 0.7;
    q += (to - q) * k * k * (3 - 2 * k);
  }
  return Math.min(w.bandMax, Math.max(BAND_MIN, q));
}

// ---- Laying it out ---------------------------------------------------------------------------------

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const inRect = (r: Rect, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
const BUILDING: Rect = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };
/** The office's own: its building, the lot in front of the garage and the one down its side. */
const OFFICE_GROUND: Rect[] = [BUILDING, LOT, SIDE_LOT];
const main = ROAD.maxZ - ROAD.minZ;

/** What stands on the office's street's sidewalks (world/outside.ts): its trees and its lamps. */
const MAIN_POSTS: [number, number, number][] = [
  // [x, z, radius]: the trees,
  [-37, 22, 0.29],
  [-20.5, 22, 0.26],
  [20.5, 22, 0.27],
  [37, 22, 0.25],
  [-40, 32.5, 0.29],
  [-12, 32.5, 0.26],
  [42, 32.5, 0.26],
  // and the lamps.
  ...[-62, -40, -19, -4, 8, 19, 40, 62].map((x): [number, number, number] => [x, 22.2, 0.15]),
  ...[-37, -22, -4, 1.5, 26, 46, 62, 82].map((x): [number, number, number] => [x, 31.8, 0.15]),
];

function layOut() {
  if (Math.abs(main - CITY_ROAD) > 1e-6) throw new Error("the office's street is as wide as the city's");
  const walks: Walk[] = [];
  const corners: Corner[] = [];
  const cornerAt = new Map<string, Corner>();
  const crossingAt = new Map(CROSSINGS.map((c) => [`${c.a},${c.b}`, c]));
  const corner = (c: Crossing, sx: -1 | 1, sz: -1 | 1): Corner => {
    const k = `${c.a},${c.b},${sx},${sz}`;
    let k0 = cornerAt.get(k);
    if (!k0) {
      k0 = { id: corners.length, a: c.a, b: c.b, sx, sz, x: c.x + sx * CORNER, z: c.z + sz * CORNER, links: [] };
      corners.push(k0);
      cornerAt.set(k, k0);
    }
    return k0;
  };
  type Ends = [(() => Corner) | null, (() => Corner) | null];
  const addWalk = (w: Omit<Walk, 'id' | 'posts' | 'spots' | 'ends' | 'bandMax'>, ends: Ends) => {
    const mid = (w.from + w.to) / 2;
    const [mx, mz] = w.alongX ? [mid, w.line] : [w.line, mid];
    if (Math.hypot(mx, mz) > WALK_RADIUS) return;
    const full: Walk = { ...w, id: walks.length, ends: [-1, -1], bandMax: w.main ? BAND_MAX_MAIN : BAND_MAX_CITY, posts: [], spots: [] };
    // Not where the office's own ground is (its lots, where the garage's cars come and go).
    for (let a = w.from + END_IN; a <= w.to - END_IN; a += 1) {
      const [x, z] = walkPoint(full, a, H + 1);
      if (OFFICE_GROUND.some((r) => inRect(r, x, z))) return;
    }
    walks.push(full);
    ends.forEach((make, i) => {
      if (!make) return;
      const c = make();
      full.ends[i] = c.id;
      c.links.push({ kind: 'walk', walk: full.id, end: i as 0 | 1 });
    });
  };

  // The city's streets: a walk down each side of each stretch.
  for (const s of STREETS) {
    const { from, to, line } = stretchSpan(s);
    const c0 = crossingAt.get(`${s.a},${s.b}`)!;
    const c1 = crossingAt.get(s.alongX ? `${s.a + 1},${s.b}` : `${s.a},${s.b + 1}`)!;
    for (const side of [-1, 1] as const) {
      const ends: Ends = s.alongX ? [() => corner(c0, 1, side), () => corner(c1, -1, side)] : [() => corner(c0, side, 1), () => corner(c1, side, -1)];
      addWalk({ alongX: s.alongX, line, side, from, to, main: false }, ends);
    }
  }
  // The office's street, out to where its sidewalks stop, broken where a street comes in on that side.
  for (const side of [-1, 1] as const) {
    const stops = CROSSINGS.filter((c) => c.b === 0 && Math.abs(c.x) < STREET_END - 2 && (side < 0 ? c.north : c.south)).sort((p, q) => p.x - q.x);
    const xs: (Crossing | null)[] = [null, ...stops, null];
    for (let k = 0; k < xs.length - 1; k++) {
      const p = xs[k];
      const q = xs[k + 1];
      const from = p ? p.x : -(STREET_END - 2) - END_IN;
      const to = q ? q.x : STREET_END - 2 + END_IN;
      addWalk({ alongX: true, line: STREET_Z, side, from, to, main: true }, [p ? () => corner(p, 1, side) : null, q ? () => corner(q, -1, side) : null]);
    }
  }

  // Round the corners: across each street at a crossing (on the office's street only across the side
  // streets, never the office's street itself), and straight on where no street comes in.
  for (const c of CROSSINGS) {
    const has = (sx: -1 | 1, sz: -1 | 1) => cornerAt.get(`${c.a},${c.b},${sx},${sz}`);
    const join = (p: Corner | undefined, q: Corner | undefined, kind: 'cross' | 'straight', path: [number, number][]) => {
      if (!p || !q || !p.links.length || !q.links.length) return;
      p.links.push({ kind, to: q.id, path, road: kind === 'cross' });
      q.links.push({ kind, to: p.id, path: [...path].reverse(), road: kind === 'cross' });
    };
    for (const sx of [-1, 1] as const) {
      // Across the street going east (sx 1) or west, from its north corner to its south one.
      const street = sx > 0 ? c.east : c.west;
      const zebra = c.x + sx * ZEBRA_AT;
      if (street && c.b !== 0) join(has(sx, -1), has(sx, 1), 'cross', [[zebra, c.z - CURB_AT], [zebra, c.z + CURB_AT]]);
      else if (!street) join(has(sx, -1), has(sx, 1), 'straight', []);
    }
    for (const sz of [-1, 1] as const) {
      const street = sz > 0 ? c.south : c.north;
      const zebra = c.z + sz * ZEBRA_AT;
      if (street) join(has(-1, sz), has(1, sz), 'cross', [[c.x - CURB_AT, zebra], [c.x + CURB_AT, zebra]]);
      else join(has(-1, sz), has(1, sz), 'straight', []);
    }
  }
  return { walks, corners };
}

const NET = layOut();
/** Every sidewalk the passers-by walk. */
export const WALKS: readonly Walk[] = NET.walks;
/** Every block's corner at a crossing they come round. */
export const CORNERS: readonly Corner[] = NET.corners;

/** The walk along `alongX` on `side` of the street at `line` that has `along` on it, if any. */
export function walkAt(alongX: boolean, line: number, side: number, along: number): Walk | undefined {
  return WALKS.find((w) => w.alongX === alongX && Math.abs(w.line - line) < 0.01 && w.side === side && along > w.from && along < w.to);
}

// ---- What stands on them, and the spots beside them --------------------------------------------------

function furnish() {
  for (const w of WALKS) {
    // The bollards at both ends, where it meets a crossing.
    if (!w.main) for (const at of [w.from + BOLLARD_IN, w.to - BOLLARD_IN]) w.posts.push({ at, off: BOLLARD_OFF, r: 0.12 });
  }
  for (const l of LAMPS) {
    const w = walkAt(l.street.alongX, stretchSpan(l.street).line, l.side, l.along);
    if (w) w.posts.push({ at: l.along, off: LAMP_OFF, r: 0.15 });
  }
  for (const [x, z, r] of MAIN_POSTS) {
    const side = z < STREET_Z ? -1 : 1;
    const w = walkAt(true, STREET_Z, side, x);
    if (w) w.posts.push({ at: x, off: Math.abs(z - STREET_Z), r });
  }
  // The benches and bus stops: a seat or two, and somewhere to stand and wait by the sign.
  const local = (f: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [f.x + lx * Math.cos(f.yaw) + lz * Math.sin(f.yaw), f.z - lx * Math.sin(f.yaw) + lz * Math.cos(f.yaw)];
  /** How far along each walk the furniture on its strip takes up, either side of where it stands. */
  const taken = new Map<number, [number, number][]>();
  const WIDE = { tree: 0.6, bench: 1.9, bikes: 1.4, bus: 2.3, bin: 1.2, pillar: 1.6, papers: 1.6 } as const;
  for (const f of FURNITURE) {
    const w = walkAt(f.street.alongX, stretchSpan(f.street).line, f.side, f.along);
    if (!w) continue;
    taken.set(w.id, [...(taken.get(w.id) ?? []), [f.along, WIDE[f.kind]]]);
    if (f.kind === 'bench') {
      const [x, z] = local(f, 0, 0.08);
      w.spots.push({ kind: 'bench', walk: w.id, along: f.along, x, z, yaw: f.yaw, spread: 0.45 });
    } else if (f.kind === 'bus' && f.stop?.pole) {
      // fork: a stop that's only its pole at the curb (shared/busnet.ts): wait beside it, on the sidewalk.
      w.posts.push({ at: f.along, off: POLE_OFF, r: 0.06 });
      // On the side the bus pulls up to (ahead of the pole, -x in its frame), so nobody walks round it to the doors.
      const [sx, sz] = local(f, -0.75, -0.8);
      w.spots.push({ kind: 'stop', walk: w.id, along: walkCoords(w, sx, sz)[0], x: sx, z: sz, yaw: f.yaw, spread: 0.5 });
    } else if (f.kind === 'bus') {
      const [x, z] = local(f, 0, -0.22);
      w.spots.push({ kind: 'bus', walk: w.id, along: f.along, x, z, yaw: f.yaw, spread: 0.45 });
      const [sx, sz] = local(f, 1.5, 0.95);
      w.spots.push({ kind: 'stop', walk: w.id, along: walkCoords(w, sx, sz)[0], x: sx, z: sz, yaw: f.yaw, spread: 0.6 });
    }
  }
  // The shops facing a walk (shared/shops.ts): in front of each one's window, and its door.
  for (const shop of SHOPS) {
    const face = shopFace(shop);
    if (!face) continue;
    const { w } = face;
    const n: [number, number] = [shop.nx, shop.nz];
    // The window takes the part of the front the door doesn't.
    const windowU = shop.doorU < shop.len / 2 ? (shop.doorU + shop.len) / 2 : shop.doorU / 2;
    for (const [kind, u] of [
      ['window', windowU],
      ['door', shop.doorU],
    ] as const) {
      const { x: fx, z: fz } = shopPoint(shop, u, 0);
      const along = walkCoords(w, fx, fz)[0];
      if (along < w.from + END_IN + 2 || along > w.to - END_IN - 2) continue;
      // Straight across from the walk, clear of the trees, benches and stops on the strip, and the lamps.
      if ((taken.get(w.id) ?? []).some(([at, half]) => Math.abs(at - along) < half + 0.6)) continue;
      if (w.posts.some((p) => Math.abs(p.at - along) < p.r + 0.6)) continue;
      const out = kind === 'door' ? 0.55 : 0.75;
      w.spots.push({
        kind,
        walk: w.id,
        along,
        x: fx + n[0] * out,
        z: fz + n[1] * out,
        yaw: Math.atan2(-n[0], -n[1]),
        spread: 0.42,
        inside: kind === 'door' ? { x: fx - n[0] * 0.9, z: fz - n[1] * 0.9 } : undefined,
        shop: kind === 'door' ? shop.i : undefined,
      });
    }
  }
  for (const w of WALKS) {
    w.posts.sort((p, q) => p.at - q.at);
    w.spots.sort((p, q) => p.along - q.along);
  }
}

/** The walk in front of `shop` (shared/shops.ts), if its whole front faces one. */
export function shopFace(shop: Shop): { w: Walk } | undefined {
  const a = shopPoint(shop, 0, 0);
  const b = shopPoint(shop, shop.len, 0);
  const mid = shopPoint(shop, shop.len / 2, 0.5);
  // Its block, from a point just inside its front.
  const bi = Math.round((mid.x - CITY_X + PERIOD / 2) / PERIOD);
  const bj = Math.round((mid.z - CITY_Z + PERIOD / 2) / PERIOD);
  const bx = CITY_X - PERIOD / 2 + bi * PERIOD;
  const bz = CITY_Z - PERIOD / 2 + bj * PERIOD;
  const alongX = shop.nz !== 0;
  // The street it faces: the next line out from the block.
  const line = alongX ? (shop.nz > 0 ? bz + PERIOD / 2 : bz - PERIOD / 2) : shop.nx > 0 ? bx + PERIOD / 2 : bx - PERIOD / 2;
  const side = -(alongX ? shop.nz : shop.nx);
  const w = walkAt(alongX, line, side, alongX ? mid.x : mid.z);
  const lo = alongX ? Math.min(a.x, b.x) : Math.min(a.z, b.z);
  const hi = alongX ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
  return w && w.from <= lo && w.to >= hi ? { w } : undefined;
}

furnish();

/** Whether (x, z) is out on a road (a city street, or the office's), where the cars have to stop for someone. */
export function onRoad(x: number, z: number): boolean {
  return onCityStreet(x, z) || (z > ROAD.minZ && z < ROAD.maxZ && Math.abs(x) < STREET_END);
}

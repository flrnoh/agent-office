// What holds DER BRECHER up (flrnoh fork, see FORK.md "Der Brecher"), calm and deliberate rather than a
// forest of towers:
//
// - Up along the building (the station, the brake run, the lift hill, the crest round the south-east
//   corner): angled brackets off the TOP storey, whatever storey that is. Each is a pair of steel
//   struts from the top storey's wall (just under the roof's slab, between its fins, over its windows,
//   clear of its balcony) up and out to the track, a triangle in plan, like a cantilevered mount.
// - Where the track runs straight up or down the facade (the first drop, the vertical lift): a tie back
//   to the facade at every storey's slab it passes.
// - Down on the street, where it runs low (the pull-out, the way in to the tube): single round columns
//   on the plaza's edge, straight under the spine with a Y head. Where the track's over the road (the
//   U-turn, the launch, the loop's way out) nothing can stand under it, so there a plain portal: a post
//   on the plaza, one past the far sidewalk, and ONE beam between them right under the track, nothing
//   else. Never on a sidewalk, never in the road; every piece carries track.
//
// Pure, from the track alone, so the page draws it and the tests check it the same.

import { HEART } from './coaster-route.js';
import { DS, poseAt, type CoasterTrack } from './coaster-track.js';
import { ROAD_Z, SIDEWALKS_Z, TOWER, levels, outsideKeepouts, roofKeepouts, type Box3 } from './coaster-keepout.js';
import { FLOOR, STOREY, WALL_HEIGHT, WALL_T, type Side } from './layout.js';
import { FIN, storeyFins, storeyHoles } from './facade-fins.js';

export type P3 = [number, number, number];

/** An upright round column, `w` across, from `y0` up to `y1`. */
export interface Column {
  x: number;
  z: number;
  y0: number;
  y1: number;
  w: number;
}

/** A round strut or beam from `a` to `b`, `w` thick. */
export interface Strut {
  a: P3;
  b: P3;
  w: number;
}

/** A bracket's strut: from `a` on wall `wall` of the top storey up and out to the track at `b`. */
export interface Bracket extends Strut {
  wall: Side;
}

export interface Supports {
  columns: Column[];
  struts: Strut[];
  brackets: Bracket[];
}

/** How far below the heartline the track's spine is, and the bottom of it. */
const SPINE = HEART + 0.45;
const UNDER = HEART + 0.62;
/** A bracket every this many metres along the track, and the farthest out from the wall it reaches. */
const BRACKET_EVERY = 6;
const BRACKET_REACH = 7.6;
/** Its two struts' feet this far either side along the wall, under the roof's slab. */
const BRACKET_SPREAD = 1.1;
/** Down on the street: a column this often, at most. */
const COLUMN_EVERY = 9;
/**
 * Where the track's over the road a column can't stand under it: a portal at x, its near post on the
 * plaza (NEAR_Z) and its far one just past the far sidewalk (clear of the lamps, the tree there and the
 * golf), one beam between them under the track. The U-turn's (both its arms), the launch's (with the
 * pull-out on the near side) and the loop's way out.
 */
const PORTALS: readonly (readonly [number, number])[] = [
  [-18, 33.6],
  [-12, 34.6],
  [1, 33.6],
];
const NEAR_Z = 20.4;
const BEAM_W = 0.5;

const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T } as const;

const cache = new Map<CoasterTrack, Supports>();

export function coasterSupports(track: CoasterTrack): Supports {
  let s = cache.get(track);
  if (!s) {
    s = build(track);
    cache.set(track, s);
  }
  return s;
}

/** The track's underside (the spine's bottom) at `s`. */
export const undersideAt = (track: CoasterTrack, s: number): P3 => under(track, s);

/** Whether point `q` is in the track (its spine, its rails and the train over them), anywhere along it. */
export function inTrack(track: CoasterTrack, q: P3): boolean {
  for (let s = 0; s < track.length; s += 0.25) {
    const p = poseAt(track, s);
    const d = [q[0] - p.x, q[1] - p.y, q[2] - p.z];
    if (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] > 9) continue;
    const dot = (v: readonly number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
    if (Math.abs(dot(p.t)) > 0.15) continue;
    // The spine down the middle at the bottom, the rails and ties and the train over it.
    const up = dot(p.n);
    const lat = Math.abs(dot(p.b));
    if (up > -UNDER + 0.02 && up < 2 && lat < (up < -HEART - 0.2 ? 0.32 : 0.85)) return true;
  }
  return false;
}

function under(track: CoasterTrack, s: number): P3 {
  const p = poseAt(track, s);
  return [p.x - p.n[0] * UNDER, p.y - p.n[1] * UNDER, p.z - p.n[2] * UNDER];
}

/** How far (x, z) is out from the building's walls, seen from above (0 inside). */
const outFrom = (x: number, z: number) => Math.hypot(Math.max(0, B.minX - x, x - B.maxX), Math.max(0, B.minZ - z, z - B.maxZ));

/** The top storey's floor in the roof's frame (the roof's deck is a storey over it). */
export const topFloor = () => -STOREY;

/** Everything a bracket's strut keeps clear of: what's outside, the roof's things, the top storey's fins. */
export function bracketKeepouts(storeys: number): Box3[] {
  const top = topFloor();
  const fins = storeyFins(storeys - 1).map((x): Box3 => ({ name: 'fin', minX: x - FIN.width / 2, maxX: x + FIN.width / 2, minY: top, maxY: top + WALL_HEIGHT, minZ: B.maxZ - 0.01, maxZ: B.maxZ + FIN.depth + 0.03 }));
  return [...outsideKeepouts(storeys), ...roofKeepouts(), ...fins];
}

function build(track: CoasterTrack): Supports {
  const N = track.storeys;
  const { street: S, ground } = levels(N);
  const top = topFloor();
  const keep = outsideKeepouts(N);
  const strutKeep = bracketKeepouts(N);
  const columns: Column[] = [];
  const struts: Strut[] = [];
  const brackets: Bracket[] = [];
  const tunnel = track.zones.find((z) => z.kind === 'tunnel')!;
  // The track's own points, to keep a support out of another bit of it.
  const pts: P3[] = [];
  for (let s = 0; s < track.length; s += 1) pts.push(under(track, s));
  const nearTrack = (x: number, y: number, z: number, sAt: number, r: number) =>
    pts.some((p, i) => Math.min(Math.abs(i - sAt), track.length - Math.abs(i - sAt)) > 5 && Math.abs(p[0] - x) < r && Math.abs(p[2] - z) < r && Math.abs(p[1] - y) < r + 0.9);
  const inKeep = (x: number, y: number, z: number, boxes: readonly Box3[], pad: number) => boxes.some((k) => x > k.minX - pad && x < k.maxX + pad && y > k.minY - pad && y < k.maxY + pad && z > k.minZ - pad && z < k.maxZ + pad);

  /** Whether a strut from the wall at `a` to the track at `b` (track point `sAt`) is clear all the way. */
  const strutClear = (a: P3, b: P3, sAt: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (let d = 0.2; d < len - 0.6; d += 0.25) {
      const k = d / len;
      const x = a[0] + (b[0] - a[0]) * k;
      const y = a[1] + (b[1] - a[1]) * k;
      const z = a[2] + (b[2] - a[2]) * k;
      if (x > B.minX + 0.05 && x < B.maxX - 0.05 && z > B.minZ + 0.05 && z < B.maxZ - 0.05) return false;
      if (inKeep(x, y, z, strutKeep, 0.12)) return false;
      if (nearTrack(x, y, z, sAt, 1.1)) return false;
    }
    return true;
  };

  /** A wall foot for a strut at `u` along wall `wall`, `y` up, if the wall's there and nothing's open there. */
  const foot = (wall: Side, u: number, y: number): P3 | null => {
    const along = wall === 'north' || wall === 'south';
    const [lo, hi] = along ? [B.minX + 0.6, B.maxX - 0.6] : [B.minZ + 0.6, B.maxZ - 0.6];
    if (u < lo || u > hi) return null;
    // Not in the back office's way (a floor can be built out behind the north wall's east end).
    if (wall === 'north' && u > 12.6) return null;
    // Not over a window, a door or the tube's hole.
    for (const o of storeyHoles(N - 1, wall)) if (Math.abs(u - o.u) < o.width / 2 + 0.4 && y > top + o.y0 - 0.3 && y < top + o.y1 + 0.3) return null;
    // On the street side, between two fins.
    if (wall === 'south') {
      const fins = storeyFins(N - 1);
      if (fins.some((x) => Math.abs(x - u) < FIN.width / 2 + 0.16)) return null;
    }
    return wall === 'north' ? [u, y, B.minZ] : wall === 'south' ? [u, y, B.maxZ] : wall === 'west' ? [B.minX, y, u] : [B.maxX, y, u];
  };
  /** The two feet either side of `u` on `wall`, nudged into the gaps between the fins on the street side. */
  const feet = (wall: Side, u: number, y: number): [P3, P3] | null => {
    const pick = (want: number): P3 | null => {
      for (const d of [0, 0.2, -0.2, 0.4, -0.4]) {
        const f = foot(wall, want + d, y);
        if (f) return f;
      }
      return null;
    };
    const a = pick(u - BRACKET_SPREAD);
    const b = pick(u + BRACKET_SPREAD);
    return a && b ? [a, b] : null;
  };

  // ---- Ties back to the facade, where the track runs straight up or down it ---------------------------
  const tied: number[] = [];
  const steep: [number, number][] = [];
  for (const [from, to] of [
    [track.marks.dropFrom, track.marks.photo],
    [track.marks.tunnelEnd, track.marks.vlift],
  ]) {
    const up: { spine: P3; heart: P3; n: P3 }[] = [];
    for (let s = from; s < to; s += DS) {
      const p = poseAt(track, s);
      if (Math.abs(p.t[1]) >= 0.97) up.push({ spine: [p.x - p.n[0] * SPINE, p.y - p.n[1] * SPINE, p.z - p.n[2] * SPINE], heart: [p.x, p.y, p.z], n: [p.n[0], p.n[1], p.n[2]] });
    }
    if (!up.length) continue;
    steep.push([from, to]);
    const clearOf = (a: P3, b: P3) => {
      for (let d = 0.04; d < 0.97; d += 0.03) if (inTrack(track, [a[0] + (b[0] - a[0]) * d, a[1], a[2] + (b[2] - a[2]) * d])) return false;
      return true;
    };
    for (let k = 1; k <= N; k++) {
      // Level from the slab's edge to the spine where the track passes it (it turns on the way up).
      const y = ground + k * STOREY - 0.15;
      const at = up.reduce((a, b) => (Math.abs(b.spine[1] - y) < Math.abs(a.spine[1] - y) ? b : a));
      if (Math.abs(at.spine[1] - y) > 0.3) continue;
      const [x, , z] = at.spine;
      const wallZ = z > 0 ? B.maxZ + FIN.depth + 0.05 : B.minZ;
      // Straight back to the wall where the spine's on the wall's side or off to one side of the track…
      if (clearOf([x, y, wallZ], [x, y, z])) {
        struts.push({ a: [x, y, wallZ], b: [x, y, z], w: 0.26 });
        tied.push(y);
        continue;
      }
      // …or, where it's round the back (the riders face the wall), a yoke: a bar across behind the
      // spine, its ends tied back to the wall either side of the train.
      const nl = Math.hypot(at.n[0], at.n[2]);
      const nx = at.n[0] / nl;
      const nz = at.n[2] / nl;
      const back: P3 = [at.heart[0] - nx * (UNDER + 0.15), y, at.heart[2] - nz * (UNDER + 0.15)];
      const ends: P3[] = [-1, 1].map((side) => [back[0] - nz * side * 1.3, y, back[2] + nx * side * 1.3]);
      // (as the track turns on the way up, one of them would run through it: then just the other)
      const arms = ends.map((e): [P3, P3] => [[e[0], y, wallZ], e]).filter(([a, e]) => clearOf(a, e));
      if (!arms.length || !clearOf(ends[0], ends[1])) continue;
      struts.push({ a: ends[0], b: ends[1], w: 0.26 });
      for (const [a, e] of arms) struts.push({ a, b: e, w: 0.22 });
      tied.push(y);
    }
  }

  // ---- Brackets off the top storey, along the building where the track runs high -------------------
  const braced = new Set<number>();
  let last = -1e9;
  for (let s = 0; s < track.length; s += 0.5) {
    if (s > tunnel.from - 2 && s < tunnel.to + 2) continue;
    const p = poseAt(track, s);
    const u = under(track, s);
    // Straight up or down (the drop, the vertical lift): only where no slab's tie holds it already.
    const vertical = Math.abs(p.t[1]) > 0.9;
    if (vertical ? !steep.some(([a, b]) => s > a && s < b) || tied.some((y) => Math.abs(y - u[1]) < 3.5) : p.n[1] < 0.3) continue;
    const out = outFrom(u[0], u[2]);
    // Off the wall under the roof's slab, or lower for a track that's itself low (the station), but over
    // the windows; and up to the track from there, never level with it or down.
    const y = Math.max(top + 3.6, Math.min(top + WALL_HEIGHT - 0.55, u[1] - 1.6));
    if (out > BRACKET_REACH || u[1] < y + 1.5) continue;
    braced.add(Math.round(s));
    if (s - last < BRACKET_EVERY) continue;
    // The wall it's off: the one it's furthest out from (round a corner, the side it's going along),
    // else the other one round the corner.
    const dx = Math.max(B.minX - u[0], u[0] - B.maxX);
    const dz = Math.max(B.minZ - u[2], u[2] - B.maxZ);
    const xWall: Side = u[0] > 0 ? 'east' : 'west';
    const zWall: Side = u[2] > 0 ? 'south' : 'north';
    let f: [P3, P3] | null = null;
    let wall: Side = xWall;
    for (const w of dx > dz ? [xWall, zWall] : [zWall, xWall]) {
      const along = w === 'north' || w === 'south' ? u[0] : u[2];
      const [lo, hi] = w === 'north' || w === 'south' ? [B.minX + 0.6 + BRACKET_SPREAD, B.maxX - 0.6 - BRACKET_SPREAD] : [B.minZ + 0.6 + BRACKET_SPREAD, B.maxZ - 0.6 - BRACKET_SPREAD];
      // Not too far round the corner (the struts would lie along the wall), though further the higher it is.
      const round = 3 + Math.max(0, u[1] - y - 6) * 0.5;
      if (along < lo - round || along > hi + round) continue;
      // Right behind it, or slid along the wall a little to get past what's in the way (the bungee's jetty).
      const at = Math.max(lo, Math.min(hi, along));
      for (const shift of [0, -1.5, 1.5, -3, 3, -4.5, 4.5]) {
        if (at + shift < lo || at + shift > hi) continue;
        const g = feet(w, at + shift, y);
        if (g && g.every((a) => strutClear(a, u, s))) {
          f = g;
          break;
        }
      }
      if (f) {
        wall = w;
        break;
      }
    }
    if (!f) continue;
    for (const a of f) brackets.push({ a, b: u, wall, w: 0.2 });
    last = s;
  }

  // ---- Down on the street: round columns in an even rhythm where it runs low -------------------------
  const clearColumn = (c: Column, sAt: number) => {
    const b: Box3 = { name: 'column', minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minY: c.y0, maxY: c.y1, minZ: c.z - c.w / 2, maxZ: c.z + c.w / 2 };
    if (keep.some((k) => b.minX < k.maxX && b.maxX > k.minX && b.minY < k.maxY && b.maxY > k.minY && b.minZ < k.maxZ && b.maxZ > k.minZ)) return false;
    if (b.maxX > TOWER.minX && b.minX < TOWER.maxX && b.maxZ > TOWER.minZ && b.minZ < TOWER.maxZ) return false;
    if (SIDEWALKS_Z.some((w) => b.maxZ > w.min - 0.2 && b.minZ < w.max + 0.2) || (b.maxZ > ROAD_Z.min && b.minZ < ROAD_Z.max)) return false;
    if (sAt < 0) {
      // A portal's post: nothing of the track in its way below the beam (the ring round it, too).
      for (let y = c.y0 + 0.5; y < c.y1 - 0.1; y += 0.25) for (const [dx, dz] of [[0, 0], [c.w / 2, 0], [-c.w / 2, 0], [0, c.w / 2], [0, -c.w / 2]]) if (inTrack(track, [c.x + dx, y, c.z + dz])) return false;
      return true;
    }
    for (let y = c.y0 + 0.5; y < c.y1 - 0.6; y += 0.5) if (nearTrack(c.x, y, c.z, sAt, c.w / 2 + 1)) return false;
    return true;
  };
  // ---- Portals where the track's over the road: two posts and one beam right under it ----------------
  for (const [x, far] of PORTALS) {
    // As high as the lowest bit of the track over the beam's line (a banked rail, or the spine).
    let top = Infinity;
    for (let s = 0; s < track.length; s += 0.25) {
      if (s > tunnel.from - 2 && s < tunnel.to + 2) continue;
      const p = poseAt(track, s);
      const u = under(track, s);
      if (Math.abs(u[0] - x) > 0.4 || u[2] < NEAR_Z - 0.4 || u[2] > far) continue;
      top = Math.min(top, u[1]);
      for (const side of [-1, 1]) top = Math.min(top, p.y - p.n[1] * HEART + p.b[1] * side * 0.6 - 0.12);
    }
    if (!Number.isFinite(top)) continue;
    // …and down a bit more wherever the beam would touch the track anywhere but on top.
    const beamClear = (y: number) => {
      for (let z = NEAR_Z; z <= far; z += 0.1) for (const dx of [-BEAM_W / 2, 0, BEAM_W / 2]) if (inTrack(track, [x + dx, y, z])) return false;
      return true;
    };
    while (!beamClear(top - 0.01) && top > S + 5.5 + BEAM_W) top -= 0.05;
    const posts: Column[] = [NEAR_Z, far].map((z) => ({ x, z, y0: S, y1: top, w: 0.56 }));
    if (!posts.every((c) => clearColumn(c, -1))) continue;
    columns.push(...posts);
    struts.push({ a: [x, top - BEAM_W / 2, NEAR_Z], b: [x, top - BEAM_W / 2, far], w: BEAM_W });
  }

  last = -1e9;
  for (let s = 6; s < track.length - 1; s += 0.5) {
    if (s > tunnel.from - 2 && s < tunnel.to + 2) continue;
    if (braced.has(Math.round(s)) || s - last < COLUMN_EVERY) continue;
    const p = poseAt(track, s);
    if (Math.abs(p.t[1]) > 0.3 || p.n[1] < 0.6) continue;
    const u = under(track, s);
    // Only where it runs low: no towers up to the roof.
    if (u[1] - S > 13 || u[1] - S < 1.2) continue;
    if (u[2] < B.minZ) continue; // behind the building it's the brackets' and the vertical lift's
    // Not next to a portal's post (that's holding it already).
    if (columns.some((c) => Math.hypot(c.x - u[0], c.z - u[2]) < COLUMN_EVERY * 0.5)) continue;
    const c: Column = { x: u[0], z: u[2], y0: S, y1: u[1], w: 0.46 };
    if (!clearColumn(c, s)) continue;
    columns.push(c);
    // The Y head under the spine.
    for (const side of [-1, 1]) struts.push({ a: [u[0], u[1] - 0.9, u[2]], b: [u[0] + p.b[0] * side * 0.55, u[1] + 0.12, u[2] + p.b[2] * side * 0.55], w: 0.16 });
    last = s;
  }

  return { columns, struts, brackets };
}

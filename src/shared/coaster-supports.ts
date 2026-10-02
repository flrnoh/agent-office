// What holds DER BRECHER up (flrnoh fork, see FORK.md "Der Brecher"): lattice columns down to the plaza
// and the lots round the building, wherever nothing stands (coaster-keepout.ts) and nobody walks (not
// on the sidewalks, never in the road), portals striding over the street with their legs either side of
// it, a gantry framing the loop, the vertical drop braced back to the facade storey by storey, the
// vertical lift's tower behind the building, brackets off the roof's edge for the lift hill, and the
// station's legs. Inside the ground floor nothing stands: the tube hangs from the ceiling. Pure, from
// the track alone, so the page draws it and the tests check it the same.

import { HEART } from './coaster-route.js';
import { DS, poseAt, type CoasterTrack } from './coaster-track.js';
import { STATION } from './coaster.js';
import { ROAD_Z, SIDEWALKS_Z, TOWER, levels, outsideKeepouts, type Box3 } from './coaster-keepout.js';
import { FLOOR, STOREY, WALL_T } from './layout.js';

export type P3 = [number, number, number];

/** An upright lattice column, `w` square, from `y0` up to `y1`. */
export interface Column {
  x: number;
  z: number;
  y0: number;
  y1: number;
  w: number;
}

/** A beam or brace from `a` to `b`, `w` thick. */
export interface Strut {
  a: P3;
  b: P3;
  w: number;
}

export interface Supports {
  columns: Column[];
  struts: Strut[];
}

/** How far below the heartline the track's spine is, and the bottom of it. */
const SPINE = HEART + 0.45;
const UNDER = HEART + 0.62;
/** A column every this many metres along the track, at most. */
const EVERY = 7.5;
/** The portals over the street: where they stand (x), their legs either side of the road. */
const PORTALS = [-19.4, -15, 1];
const LEG_NEAR = 19.4;
const LEG_FAR = 33.6;
/** Brackets off the roof's edge for the lift hill: a column on the deck at (x, z), out to the track. */
const ROOF_BRACKETS: readonly [number, number][] = [
  [17.6, -9.0],
  [17.6, 6.2],
  [17.6, 11.4],
];

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
function under(track: CoasterTrack, s: number): P3 {
  const p = poseAt(track, s);
  return [p.x - p.n[0] * UNDER, p.y - p.n[1] * UNDER, p.z - p.n[2] * UNDER];
}

function build(track: CoasterTrack): Supports {
  const N = track.storeys;
  const { street: S, ground } = levels(N);
  const keep = outsideKeepouts(N);
  const columns: Column[] = [];
  const struts: Strut[] = [];
  const tunnel = track.zones.find((z) => z.kind === 'tunnel')!;
  // The track's own points, to keep a column from going up through another bit of it.
  const pts: P3[] = [];
  for (let s = 0; s < track.length; s += 1) pts.push(under(track, s));
  const clearOf = (c: Column, sAt: number) => {
    const b: Box3 = { name: 'column', minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minY: c.y0, maxY: c.y1, minZ: c.z - c.w / 2, maxZ: c.z + c.w / 2 };
    if (keep.some((k) => b.minX < k.maxX && b.maxX > k.minX && b.minY < k.maxY && b.maxY > k.minY && b.minZ < k.maxZ && b.maxZ > k.minZ)) return false;
    if (b.maxX > TOWER.minX && b.minX < TOWER.maxX && b.maxZ > TOWER.minZ && b.minZ < TOWER.maxZ) return false;
    if (SIDEWALKS_Z.some((w) => b.maxZ > w.min - 0.2 && b.minZ < w.max + 0.2) || (b.maxZ > ROAD_Z.min && b.minZ < ROAD_Z.max)) return false;
    // Nothing of the track itself in the way below the top (but the bit it holds).
    return !pts.some((p, i) => Math.abs(i - sAt) > 4 && Math.abs(i - sAt - track.length) > 4 && Math.abs(p[0] - c.x) < c.w / 2 + 1 && Math.abs(p[2] - c.z) < c.w / 2 + 1 && p[1] < c.y1 + 0.5 && p[1] > c.y0);
  };

  // Columns down from the track to the ground, every so often where it's upright and nothing's in the way.
  let last = -1e9;
  for (let s = 6; s < track.length - 1; s += 0.5) {
    if (s > tunnel.from - 2 && s < tunnel.to + 2) continue;
    const p = poseAt(track, s);
    if (Math.abs(p.t[1]) > 0.35 || p.n[1] < 0.55) continue;
    if (s - last < EVERY) continue;
    const u = under(track, s);
    const c: Column = { x: u[0], z: u[2], y0: S, y1: u[1], w: 0.5 };
    // On the station's side the station has legs of its own.
    if (u[2] < STATION.wallZ && u[0] > STATION.x0 - 1 && u[0] < STATION.x1 + 1) continue;
    if (c.y1 - c.y0 < 1.2 || !clearOf(c, s)) continue;
    columns.push(c);
    last = s;
  }

  // The station's legs, at its far edge, and its brackets back to the facade.
  for (const x of [STATION.x0 + 0.6, STATION.stopX, STATION.x1 - 0.6]) {
    columns.push({ x, z: STATION.farZ + 0.25, y0: S, y1: -0.35, w: 0.45 });
    struts.push({ a: [x, -0.35, STATION.farZ + 0.25], b: [x, -2.6, STATION.wallZ - 0.05], w: 0.22 });
  }

  // The loop's top, which a gate over the street holds from above.
  const loopFrom = track.marks.loop;
  const loopTo = track.marks.loopEnd;
  let topS = loopFrom;
  for (let s = loopFrom; s < loopTo; s += 0.25) if (poseAt(track, s).y > poseAt(track, topS).y) topS = s;
  const loopTop = poseAt(track, topS);
  const spineTop: P3 = [loopTop.x - loopTop.n[0] * SPINE, loopTop.y - loopTop.n[1] * SPINE, loopTop.z - loopTop.n[2] * SPINE];
  const gateY = spineTop[1] + 1.6;
  // Portals over the street: legs either side of the road, a beam under the track where it crosses;
  // the two either side of the loop go on up into its gate.
  PORTALS.forEach((x, i) => {
    const over = pts.filter((q) => Math.abs(q[0] - x) < 1.2 && q[2] > ROAD_Z.min - 2 && q[2] < ROAD_Z.max + 1.5);
    if (!over.length) return;
    const low = Math.min(...over.map((q) => q[1])) - 0.15;
    const gate = i > 0;
    for (const z of [LEG_NEAR, LEG_FAR]) columns.push({ x, z, y0: S, y1: gate ? gateY : low, w: gate ? 0.6 : 0.55 });
    struts.push({ a: [x, low, LEG_NEAR], b: [x, low, LEG_FAR], w: 0.42 });
    if (gate) struts.push({ a: [x, gateY, LEG_NEAR], b: [x, gateY, LEG_FAR], w: 0.42 });
  });
  // The gate's beams along the street over the loop, one across over its top, and a hanger down to it.
  for (const z of [LEG_NEAR, LEG_FAR]) struts.push({ a: [PORTALS[1], gateY, z], b: [PORTALS[2], gateY, z], w: 0.42 });
  struts.push({ a: [spineTop[0], gateY, LEG_NEAR], b: [spineTop[0], gateY, LEG_FAR], w: 0.4 });
  struts.push({ a: [spineTop[0], gateY, spineTop[2]], b: spineTop, w: 0.18 });

  // The vertical drop braced back to the facade at every storey's slab it passes.
  const dropFrom = track.marks.dropFrom;
  const photo = track.marks.photo;
  let vx = 0;
  let vz = 0;
  let vTop = -1e9;
  let vBottom = 1e9;
  let vn = 0;
  for (let s = dropFrom; s < photo; s += DS) {
    const p = poseAt(track, s);
    if (p.t[1] > -0.97) continue;
    vx += p.x - p.n[0] * SPINE;
    vz += p.z - p.n[2] * SPINE;
    vTop = Math.max(vTop, p.y);
    vBottom = Math.min(vBottom, p.y);
    vn++;
  }
  if (vn) {
    vx /= vn;
    vz /= vn;
    for (let k = 1; k <= N; k++) {
      const y = ground + k * STOREY - 0.2;
      if (y > vTop + 1 || y < vBottom - 1) continue;
      struts.push({ a: [vx, y, FLOOR.maxZ + WALL_T + 0.75], b: [vx, y, vz], w: 0.3 });
    }
  }

  // The vertical lift's tower behind the building, its spine side.
  const vliftAt = track.marks.vlift - 4;
  const lift = poseAt(track, vliftAt);
  columns.push({ x: lift.x, z: STATION.trackZ - 1.35, y0: S, y1: lift.y + 0.2, w: 1.5 });

  // Brackets off the roof's edge for the lift hill: a column on the deck, and an arm out to the track.
  for (const [x, z] of ROOF_BRACKETS) {
    let best = 0;
    let bestD = 1e9;
    for (let s = 0; s < track.marks.dropFrom; s += 0.5) {
      const p = poseAt(track, s);
      const d = Math.hypot(p.x - (FLOOR.maxX + WALL_T + 3.2), p.z - z) + (p.x < FLOOR.maxX ? 50 : 0);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    const u = under(track, best);
    columns.push({ x, z, y0: 0, y1: u[1], w: 0.4 });
    struts.push({ a: [x, u[1], z], b: u, w: 0.3 });
  }
  return { columns, struts };
}

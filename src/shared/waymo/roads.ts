import { CITY_ROAD, CROSSINGS, PERIOD, lineX, lineZ, type Crossing } from '../city.js';
import { STOP_AT, litAt, type Axis, type LitCrossing } from '../traffic-lights.js';
import { LINE_DEFS } from '../busnet.js';

// flrnoh fork (see FORK.md "Waymo"): the town's streets as a robotaxi drives them. The crossings are
// the nodes and the stretches between them the edges, each driven on its right-hand lane in either
// direction. A route goes from somewhere on one lane to somewhere on another, turning at crossings
// (never round on the spot), and comes out as the same kind of dense lane line the buses drive
// (shared/citybus.ts): straight along the lanes, round each corner on a curve, with the stop lines of
// the lit crossings on the way. Where a robotaxi may stand and wait (to pick someone up or let them
// out) is only on lanes no bus drives, well clear of the crossings: the buses keep their own
// timetable, and nothing may stand in their way.

/** East (+x), south (+z), west (-x), north (-z). */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const back = (d: Dir) => ((d + 2) % 4) as Dir;
/** Driving on the right, this far from the road's middle. */
export const LANE = CITY_ROAD / 4;
const right = (d: Dir): [number, number] => [-DIRS[d][1], DIRS[d][0]];

const key = (a: number, b: number) => `${a},${b}`;
const NODES = new Map(CROSSINGS.map((c) => [key(c.a, c.b), c]));
export const nodeAt = (a: number, b: number): Crossing | undefined => NODES.get(key(a, b));

/** The crossing next along from (a, b) going `d`, if a street goes there. */
export function next(a: number, b: number, d: Dir): Crossing | undefined {
  const c = nodeAt(a, b);
  if (!c) return undefined;
  const open = [c.east, c.south, c.west, c.north][d];
  if (!open) return undefined;
  return nodeAt(a + DIRS[d][0], b + DIRS[d][1]);
}

/** A lane: from crossing (a, b), going `d`. */
export interface Lane {
  a: number;
  b: number;
  d: Dir;
}
export const laneKey = (l: Lane) => `${l.a},${l.b},${l.d}`;

/** Every lane in town that goes somewhere. */
export const LANES: readonly Lane[] = CROSSINGS.flatMap((c) => ([0, 1, 2, 3] as Dir[]).filter((d) => next(c.a, c.b, d)).map((d) => ({ a: c.a, b: c.b, d })));

/** The lanes the buses drive (shared/busnet.ts): nobody waits on those. */
export const BUS_LANES: ReadonlySet<string> = new Set(
  LINE_DEFS.flatMap((def) =>
    def.round.flatMap(([a, b], i) => {
      const [c, e] = def.round[(i + 1) % def.round.length];
      const d = ([0, 1, 2, 3] as Dir[]).find((k) => Math.sign(c - a) === DIRS[k][0] && Math.sign(e - b) === DIRS[k][1])!;
      const out: string[] = [];
      for (let k = 0, x = a, z = b; k < Math.abs(c - a) + Math.abs(e - b); k++, x += DIRS[d][0], z += DIRS[d][1]) out.push(laneKey({ a: x, b: z, d }));
      return out;
    }),
  ),
);

/** Somewhere on a lane: how far (m) from its crossing's middle along it. */
export interface Place extends Lane {
  along: number;
}

/** Where a place is in the world, in its lane (`over`: further toward the curb). */
export function placeAt(p: Place, over = 0): { x: number; z: number } {
  const c = nodeAt(p.a, p.b)!;
  const [dx, dz] = DIRS[p.d];
  const [rx, rz] = right(p.d);
  return { x: c.x + dx * p.along + rx * (LANE + over), z: c.z + dz * p.along + rz * (LANE + over) };
}

/** How far from a crossing's middle a robotaxi may stand and wait. */
export const KERB_CLEAR = 16;

/** Where a robotaxi may stand and wait: every few meters along the lanes no bus drives, clear of the crossings. */
export const KERB_SPOTS: readonly Place[] = LANES.filter((l) => !BUS_LANES.has(laneKey(l))).flatMap((l) => {
  const out: Place[] = [];
  for (let along = KERB_CLEAR; along <= PERIOD - KERB_CLEAR + 1e-6; along += 6) out.push({ ...l, along });
  return out;
});

/** The spot nearest (x, z) to stand and wait at, curb side toward it (not on the lanes in `taken`, where another waits). */
export function kerbNear(x: number, z: number, taken: ReadonlySet<string> = new Set()): Place {
  let best = KERB_SPOTS[0];
  let bd = Infinity;
  for (const p of KERB_SPOTS) {
    if (taken.has(laneKey(p))) continue;
    // The curb it stands at, which you walk up to.
    const at = placeAt(p, 2);
    const d = Math.hypot(at.x - x, at.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// ---- Routes ----------------------------------------------------------------------------------------

/** How much longer (m) a turn feels than going straight on, left (across the traffic) and right. */
const TURN_COST = { left: 25, right: 12 };
/** How much longer a lane the buses drive feels: used only when there's no way round (a bus would roll up behind it at a red light). */
const BUS_COST = 12;

/**
 * The crossings a robotaxi drives through from `from` to `to`, in order (the one its lane runs to
 * first, … , `to`'s own), or null if there's no way. `avoid`: lanes it'd rather not take (someone
 * waits there), as much longer as `avoidCost` m (the default: never). Never round on the spot.
 */
export function route(from: Place, to: Place, avoid: ReadonlySet<string> = new Set(), avoidCost = 1e6): [number, number][] | null {
  // On the same lane, further along: straight there.
  if (from.a === to.a && from.b === to.b && from.d === to.d && to.along > from.along + 4) return [];
  const cost = (l: Lane) => PERIOD * (BUS_LANES.has(laneKey(l)) ? BUS_COST : 1) + (avoid.has(laneKey(l)) ? avoidCost : 0);
  // Dijkstra over lanes: the cost to the end of each (its next crossing).
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const lanes = new Map<string, Lane>();
  const open: { k: string; c: number }[] = [];
  const push = (l: Lane, c: number, p: string | null) => {
    const k = laneKey(l);
    if (c >= (dist.get(k) ?? Infinity)) return;
    dist.set(k, c);
    prev.set(k, p);
    lanes.set(k, l);
    open.push({ k, c });
  };
  push(from, PERIOD - from.along, null);
  let goal: string | null = null;
  let best = Infinity;
  while (open.length) {
    open.sort((x, y) => x.c - y.c);
    const { k, c } = open.shift()!;
    if (c > (dist.get(k) ?? Infinity) || c >= best) continue;
    const l = lanes.get(k)!;
    const n = next(l.a, l.b, l.d)!;
    for (const d of [0, 1, 2, 3] as Dir[]) {
      if (d === back(l.d) || !next(n.a, n.b, d)) continue;
      const turn = d === l.d ? 0 : (l.d + 1) % 4 === d ? TURN_COST.right : TURN_COST.left;
      const out: Lane = { a: n.a, b: n.b, d };
      if (out.a === to.a && out.b === to.b && out.d === to.d) {
        const total = c + turn + to.along + (avoid.has(laneKey(out)) ? avoidCost : 0);
        if (total < best) {
          best = total;
          goal = k;
        }
        continue;
      }
      push(out, c + turn + cost(out), k);
    }
  }
  if (goal === null || best >= 1e6) return null;
  const nodes: [number, number][] = [];
  for (let k: string | null = goal; k; k = prev.get(k) ?? null) {
    const l = lanes.get(k)!;
    const n = next(l.a, l.b, l.d)!;
    nodes.unshift([n.a, n.b]);
  }
  return nodes;
}

// ---- Paths -----------------------------------------------------------------------------------------

const D = 0.5;
type V = [number, number];

/** Where a lit crossing stops it: its stop line along the path, the road it comes in on, the one it leaves by. */
export interface Gate {
  s: number;
  l: LitCrossing;
  axis: Axis;
  exit: Axis;
}

/** A straight bit of the path along a lane: from and to along the path, and where on the lane it starts. */
export interface Leg {
  s0: number;
  s1: number;
  lane: Lane;
  along0: number;
}

/** A robotaxi's way from one place to another: the lane line every half meter, and what's on it. */
export interface Path {
  from: Place;
  nodes: [number, number][];
  to: Place;
  xs: Float64Array;
  zs: Float64Array;
  length: number;
  gates: Gate[];
  /** The corners, where it slows down (from, to along it), and which way each turns (1 right, -1 left). */
  corners: [number, number, number][];
  legs: Leg[];
}

/** The way from `from` through the crossings `nodes` to `to`, as a lane line. */
export function pathOf(from: Place, nodes: [number, number][], to: Place): Path {
  const anchors: { x: number; z: number; d?: Dir; a?: number; b?: number }[] = [];
  const f = nodeAt(from.a, from.b)!;
  anchors.push({ x: f.x + DIRS[from.d][0] * from.along, z: f.z + DIRS[from.d][1] * from.along });
  for (const [a, b] of nodes) {
    const c = nodeAt(a, b)!;
    anchors.push({ x: c.x, z: c.z, a, b });
  }
  const t = nodeAt(to.a, to.b)!;
  anchors.push({ x: t.x + DIRS[to.d][0] * to.along, z: t.z + DIRS[to.d][1] * to.along });
  // The way each bit between anchors goes.
  const dirOf = (p: { x: number; z: number }, q: { x: number; z: number }): Dir => (Math.abs(q.x - p.x) > Math.abs(q.z - p.z) ? (q.x > p.x ? 0 : 2) : q.z > p.z ? 1 : 3);
  const ds = anchors.slice(1).map((q, i) => dirOf(anchors[i], q));
  const pts: V[] = [];
  const push = (p: V) => {
    const last = pts[pts.length - 1];
    if (!last) return void pts.push(p);
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    const k = Math.ceil(d / D);
    for (let j = 1; j <= k; j++) pts.push([last[0] + ((p[0] - last[0]) * j) / k, last[1] + ((p[1] - last[1]) * j) / k]);
  };
  const lanePt = (p: { x: number; z: number }, d: Dir): V => [p.x + right(d)[0] * LANE, p.z + right(d)[1] * LANE];
  const corners: [number, number, number][] = [];
  const legs: Leg[] = [];
  const marks: { at: V; a: number; b: number; axis: Axis; exit: Axis }[] = [];
  let legStart = 0;
  let legLane: Lane = from;
  let legAlong = from.along;
  const closeLeg = () => {
    const s1 = (pts.length - 1) * D;
    if (s1 > legStart) legs.push({ s0: legStart, s1, lane: legLane, along0: legAlong });
  };
  push(lanePt(anchors[0], ds[0]));
  for (let i = 1; i < anchors.length - 1; i++) {
    const c = anchors[i];
    const d0 = ds[i - 1];
    const d1 = ds[i];
    const axisIn: Axis = d0 % 2 === 0 ? 'x' : 'z';
    const axisOut: Axis = d1 % 2 === 0 ? 'x' : 'z';
    // The stop line coming in, if the crossing has lights.
    marks.push({ at: [c.x - DIRS[d0][0] * STOP_AT + right(d0)[0] * LANE, c.z - DIRS[d0][1] * STOP_AT + right(d0)[1] * LANE], a: c.a!, b: c.b!, axis: axisIn, exit: axisOut });
    if (d0 === d1) {
      // Straight over: a new leg starts on the other side.
      push(lanePt(c, d0));
      closeLeg();
      legStart = (pts.length - 1) * D;
      legLane = { a: c.a!, b: c.b!, d: d1 };
      legAlong = 0;
      continue;
    }
    const r0 = right(d0);
    const r1 = right(d1);
    const q: V = [c.x + (r0[0] + r1[0]) * LANE, c.z + (r0[1] + r1[1]) * LANE];
    const isRight = (d0 + 1) % 4 === d1;
    const R = isRight ? 3.6 : 7.6;
    const a: V = [q[0] - DIRS[d0][0] * R, q[1] - DIRS[d0][1] * R];
    const b: V = [q[0] + DIRS[d1][0] * R, q[1] + DIRS[d1][1] * R];
    push(a);
    closeLeg();
    const from0 = (pts.length - 1) * D;
    for (let k = 1; k <= 24; k++) {
      const u = k / 24;
      push([(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * q[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * q[1] + u * u * b[1]]);
    }
    corners.push([from0, (pts.length - 1) * D, isRight ? 1 : -1]);
    legStart = (pts.length - 1) * D;
    legLane = { a: c.a!, b: c.b!, d: d1 };
    // Where the curve comes out on the new lane: along it from the crossing's middle.
    legAlong = (b[0] - c.x) * DIRS[d1][0] + (b[1] - c.z) * DIRS[d1][1];
  }
  push(lanePt(anchors[anchors.length - 1], ds[ds.length - 1]));
  closeLeg();
  const xs = Float64Array.from(pts.map((p) => p[0]));
  const zs = Float64Array.from(pts.map((p) => p[1]));
  const length = (pts.length - 1) * D;
  const near = (x: number, z: number) => {
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best * D;
  };
  const gates: Gate[] = [];
  for (const m of marks) {
    const l = litAt(m.a, m.b);
    if (l) gates.push({ s: near(m.at[0], m.at[1]), l, axis: m.axis, exit: m.exit });
  }
  return { from, nodes, to, xs, zs, length, gates, corners, legs };
}

/** Where along `path` `s` is: x, z, and its yaw (its nose +x turned by yaw about +y, as the buses). */
export function pathPoint(path: Pick<Path, 'xs' | 'zs' | 'length' | 'from'>, s: number): { x: number; z: number; yaw: number } {
  const n = path.xs.length;
  // Standing still where it started (a path of no length): facing along its lane.
  if (n < 2 || path.length < 3) return { x: path.xs[0], z: path.zs[0], yaw: Math.atan2(-DIRS[path.from.d][1], DIRS[path.from.d][0]) };
  const at = (q: number): V => {
    const u = Math.max(0, Math.min(path.length, q)) / D;
    const i = Math.min(n - 2, Math.floor(u));
    const f = u - i;
    return [path.xs[i] + (path.xs[i + 1] - path.xs[i]) * f, path.zs[i] + (path.zs[i + 1] - path.zs[i]) * f];
  };
  const [x, z] = at(s);
  const a = at(Math.min(s, path.length - 2.4) - 1.2);
  const b = at(Math.max(s, 2.4) + 1.2);
  return { x, z, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
}

/** Which lane, and where on it, `s` along `path` is, if it's on a straight bit (not round a corner). */
export function placeOn(path: Path, s: number): Place | null {
  const leg = path.legs.find((l) => s >= l.s0 && s <= l.s1);
  if (!leg) return null;
  return { ...leg.lane, along: leg.along0 + (s - leg.s0) };
}

/** Where a crossing's middle is (for the tests and the screen). */
export const crossingAt = (a: number, b: number) => ({ x: lineX(a), z: lineZ(b) });

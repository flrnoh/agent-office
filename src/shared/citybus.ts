import { CITY_ROAD, lineX, lineZ } from './city.js';
import { FURNITURE, STRIP_OUT, type Furniture } from './streetside.js';
import { CYCLE, STOP_AT, litAt, mayPass, type Axis, type LitCrossing } from './traffic-lights.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the city's buses. Two lines drive a
// loop each through the streets round the office (both past its front), stopping at the bus stops
// along the way (shared/streetside.ts FURNITURE, kind 'bus') with their doors open, and keeping to the
// traffic lights (shared/traffic-lights.ts). Like the lights, nothing about them goes over the wire:
// each line's timetable is worked out once, here, by driving the loop against the lights' own clock,
// and since the lights come round every CYCLE seconds, a loop that takes a whole number of cycles
// (the bus waits at its first stop for the rest) runs the same way for ever. So every page has the
// bus at the same place at the same moment (busAt), the passers-by know when it's at their stop
// (busCall), and someone riding it just goes where it goes.

/** The bus: long, wide and tall (m); its nose is +x in its own frame. */
export const BUS_L = 11;
export const BUS_W = 2.5;
export const BUS_H = 3.0;
/** Driving on the right, this far from the road's middle. */
const LANE = CITY_ROAD / 4;
/** How fast it goes along a street and round a corner, how hard it speeds up and brakes (m/s, m/s²). */
const CRUISE = 9;
const CORNER_V = 4.2;
const ACCEL = 1.2;
const BRAKE = 1.8;
/** How long it stands at a stop, doors and all (s); its doors take this long to open or shut. */
export const DWELL = 12;
const DOOR_MOVE = 1;
/** Where its doors are along it (from its middle) and how far out of its side someone steps in. */
export const DOORS = [BUS_L / 2 - 1.4, -0.6] as const;
/** The step of the timetable (s). */
const STEP = 0.05;
const SAMPLE = 0.25;

/** A line: its number, where it's going (on its display), its color, and the crossings it goes round (a, b on the city's grid). */
interface LineDef {
  no: string;
  dest: string;
  color: string;
  round: [number, number][];
  /** How far its timetable is offset on the office's clock (s). */
  offset: number;
}

const LINE_DEFS: LineDef[] = [
  { no: '7', dest: 'Hauptbahnhof', color: '#e63946', round: [[1, 0], [-1, 0], [-1, -2], [1, -2]], offset: 0 },
  { no: '12', dest: 'Stadtpark', color: '#f4a261', round: [[0, 0], [0, -4], [1, -4], [1, -3], [-1, -3], [-1, 0]], offset: 13 },
];

/** A stop along a line: the bus stop it's at, how far along the loop the bus's middle stands, and where its doors are then. */
export interface BusStop {
  f: Furniture;
  s: number;
  doors: [number, number][];
}

/** Where a lit crossing stops the bus: its stop line along the loop, the road it comes in on, and the one whose zebra it crosses going out. */
interface Gate {
  s: number;
  l: LitCrossing;
  axis: Axis;
  exit: Axis;
}

/** A stop on the timetable: which, and when its doors open and when it pulls away again (s into the round). */
interface Call {
  stop: number;
  arrive: number;
  leave: number;
}

export interface BusLine {
  id: number;
  no: string;
  dest: string;
  color: string;
  /** The loop as points every half meter, and how long it is. */
  xs: Float64Array;
  zs: Float64Array;
  length: number;
  stops: BusStop[];
  gates: Gate[];
  /** Corners, where it slows down: from and to along the loop. */
  corners: [number, number][];
  /** How long one round takes (a whole number of light cycles), and the timetable: where it is every SAMPLE s, and its calls. */
  period: number;
  offset: number;
  track: Float64Array;
  calls: Call[];
}

const D = 0.5;
type V = [number, number];
const right = (d: V): V => [-d[1], d[0]];

/** The loop as a dense polyline: down each street in its lane, round each corner on a curve. */
function trace(def: LineDef): { pts: V[]; corners: [number, number][]; gates: Gate[] } {
  const P = def.round.map(([a, b]): V => [lineX(a), lineZ(b)]);
  const n = P.length;
  const dir = (i: number): V => {
    const p = P[i % n];
    const q = P[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  };
  const pts: V[] = [];
  const corners: [number, number][] = [];
  const marks: { at: V; grid: [number, number]; axis: Axis; exit: Axis }[] = [];
  const push = (p: V) => {
    const last = pts[pts.length - 1];
    if (!last) return void pts.push(p);
    const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    const k = Math.ceil(d / D);
    for (let j = 1; j <= k; j++) pts.push([last[0] + ((p[0] - last[0]) * j) / k, last[1] + ((p[1] - last[1]) * j) / k]);
  };
  // Where each corner's curve starts and ends, the curve's middle point (where the lanes meet).
  const turns = P.map((_, i) => {
    const d0 = dir(i - 1 + n);
    const d1 = dir(i);
    const c = P[i];
    const r0 = right(d0);
    const r1 = right(d1);
    const q: V = [c[0] + (r0[0] + r1[0]) * LANE, c[1] + (r0[1] + r1[1]) * LANE];
    const isRight = d0[0] * r1[0] + d0[1] * r1[1] < 0;
    const R = isRight ? 3.6 : 7.6;
    return { q, a: [q[0] - d0[0] * R, q[1] - d0[1] * R] as V, b: [q[0] + d1[0] * R, q[1] + d1[1] * R] as V, d0, d1 };
  });
  for (let i = 0; i < n; i++) {
    const t = turns[i];
    // The curve round corner i.
    if (!pts.length) pts.push(t.a);
    else push(t.a);
    const from = pts.length - 1;
    for (let k = 1; k <= 24; k++) {
      const u = k / 24;
      push([(1 - u) * (1 - u) * t.a[0] + 2 * u * (1 - u) * t.q[0] + u * u * t.b[0], (1 - u) * (1 - u) * t.a[1] + 2 * u * (1 - u) * t.q[1] + u * u * t.b[1]]);
    }
    corners.push([from * D, (pts.length - 1) * D]);
    // Each crossing on the way to the next corner, and that corner itself: its stop line.
    const d = t.d1;
    const p = P[i];
    const q = P[(i + 1) % n];
    const steps = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 56);
    const ga = def.round[i];
    const gb = def.round[(i + 1) % n];
    const axis: Axis = Math.abs(d[0]) > 0.5 ? 'x' : 'z';
    for (let k = 1; k <= steps; k++) {
      const grid: [number, number] = [ga[0] + Math.sign(gb[0] - ga[0]) * k, ga[1] + Math.sign(gb[1] - ga[1]) * k];
      const cx = p[0] + d[0] * 56 * k;
      const cz = p[1] + d[1] * 56 * k;
      const r = right(d);
      const exitDir = k === steps ? turns[(i + 1) % n].d1 : d;
      marks.push({ at: [cx - d[0] * STOP_AT + r[0] * LANE, cz - d[1] * STOP_AT + r[1] * LANE], grid, axis, exit: Math.abs(exitDir[0]) > 0.5 ? 'x' : 'z' });
    }
  }
  // Round to the first corner's start again.
  push(turns[0].a);
  pts.pop();
  const gates: Gate[] = [];
  for (const m of marks) {
    const l = litAt(m.grid[0], m.grid[1]);
    if (l) gates.push({ s: nearest(pts, m.at[0], m.at[1]) * D, l, axis: m.axis, exit: m.exit });
  }
  return { pts, corners, gates };
}

function nearest(pts: V[], x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  pts.forEach((p, i) => {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Where along the loop (and which way) a bus stop is, if it's on this line's side of the street. */
function stopsOn(pts: V[]): BusStop[] {
  const out: BusStop[] = [];
  for (const f of FURNITURE) {
    if (f.kind !== 'bus') continue;
    const i = nearest(pts, f.x, f.z);
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const d: V = [(q[0] - p[0]) / D, (q[1] - p[1]) / D];
    const r = right(d);
    const off = (f.x - p[0]) * r[0] + (f.z - p[1]) * r[1];
    // On its right, the strip past the sidewalk, along a straight bit.
    if (Math.abs(off - (STRIP_OUT - LANE)) > 0.6 || Math.abs((f.x - p[0]) * d[0] + (f.z - p[1]) * d[1]) > 0.6) continue;
    out.push({ f, s: (i * D + BUS_L / 2 - 2.6 + pts.length * D) % (pts.length * D), doors: [] });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Drives the loop once against the lights, from its first stop, and works out the timetable. */
function timetable(line: Omit<BusLine, 'period' | 'track' | 'calls'>): { period: number; track: Float64Array; calls: Call[] } {
  const L = line.length;
  const first = line.stops[0];
  let s = first.s;
  const end = first.s + L;
  let v = 0;
  let t = 0;
  const calls: Call[] = [];
  const track: number[] = [s];
  let next = 1;
  let gateLeft = line.gates.map((g) => (g.s < s ? g.s + L : g.s)).sort((a, b) => a - b);
  const gateAt = new Map(line.gates.map((g) => [(g.s < first.s ? g.s + L : g.s).toFixed(3), g]));
  for (let guard = 0; guard < 200000 && s < end - 1e-6; guard++) {
    const front = s + BUS_L / 2;
    // The next stop, the next red, and the next corner: how fast it may go now.
    const stopS = next < line.stops.length ? line.stops[next].s + (line.stops[next].s < first.s ? L : 0) : end;
    let limit = stopS - s;
    gateLeft = gateLeft.filter((g) => g - front > -0.01);
    const g = gateLeft[0];
    if (g !== undefined && g - front < 60) {
      const gate = gateAt.get(g.toFixed(3))!;
      const turning = gate.axis !== gate.exit;
      if (!mayPass(gate.l, gate.axis, t + line.offset, g - front, v, BRAKE * 2, turning ? gate.exit : undefined)) limit = Math.min(limit, g - front);
    }
    let want = Math.min(CRUISE, Math.sqrt(2 * BRAKE * Math.max(0, limit)));
    for (const [a, b] of line.corners) {
      for (const k of [0, L]) {
        const ca = a + k;
        const cb = b + k;
        if (s + BUS_L / 2 >= ca && s - BUS_L / 2 <= cb) want = Math.min(want, CORNER_V);
        else if (ca > s && ca - s < 50) want = Math.min(want, Math.sqrt(CORNER_V * CORNER_V + 2 * BRAKE * (ca - s - BUS_L / 2)));
      }
    }
    v = Math.min(want, v + ACCEL * STEP);
    s = Math.min(s + v * STEP, s + Math.max(0, limit));
    t += STEP;
    if (next < line.stops.length && stopS - s < 0.05) {
      // At the stop: doors open, people on and off, doors shut, away.
      s = stopS;
      v = 0;
      calls.push({ stop: next, arrive: t, leave: t + DWELL });
      const until = t + DWELL;
      while (t < until) {
        t += STEP;
        if (Math.round(t / STEP) % Math.round(SAMPLE / STEP) === 0) track.push(s);
      }
      next++;
      continue;
    }
    if (Math.round(t / STEP) % Math.round(SAMPLE / STEP) === 0) track.push(s);
  }
  // Back at the first stop: it stands there for the rest of a whole number of light cycles.
  const period = Math.ceil((t + DWELL) / CYCLE) * CYCLE;
  calls.push({ stop: 0, arrive: t, leave: period });
  return { period, track: Float64Array.from(track), calls };
}

function build(def: LineDef, id: number): BusLine {
  const { pts, corners, gates } = trace(def);
  const xs = Float64Array.from(pts.map((p) => p[0]));
  const zs = Float64Array.from(pts.map((p) => p[1]));
  const length = pts.length * D;
  const stops = stopsOn(pts);
  const line = { id, no: def.no, dest: def.dest, color: def.color, xs, zs, length, stops, gates, corners, offset: def.offset };
  for (const st of stops) {
    const p = pointAt(line, st.s);
    st.doors = DOORS.map((u): [number, number] => {
      const fx = Math.cos(p.yaw);
      const fz = -Math.sin(p.yaw);
      return [p.x + fx * u - fz * (BUS_W / 2 + 0.35), p.z + fz * u + fx * (BUS_W / 2 + 0.35)];
    });
  }
  return { ...line, ...timetable(line) };
}

/** Where along the loop `s` is: x, z, and its yaw (its nose +x turned by yaw about +y, as the city's cars). */
export function pointAt(line: Pick<BusLine, 'xs' | 'zs' | 'length'>, s: number): { x: number; z: number; yaw: number } {
  const n = line.xs.length;
  const at = (q: number): V => {
    const u = (((q % line.length) + line.length) % line.length) / D;
    const i = Math.floor(u);
    const f = u - i;
    const j = (i + 1) % n;
    return [line.xs[i] + (line.xs[j] - line.xs[i]) * f, line.zs[i] + (line.zs[j] - line.zs[i]) * f];
  };
  const [x, z] = at(s);
  const a = at(s - 3);
  const b = at(s + 3);
  return { x, z, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
}

/** The city's bus lines. */
export const BUS_LINES: readonly BusLine[] = LINE_DEFS.map(build);

/** Where a bus is: its middle, its yaw, how far along its loop, how open its doors are (0–1), the stop it's at (or -1), and its speed. */
export interface BusPose {
  x: number;
  z: number;
  yaw: number;
  s: number;
  doors: number;
  stop: number;
  speed: number;
}

/** Where `line`'s bus is at `t` (seconds on the office's clock). */
export function busAt(line: BusLine, t: number, into?: BusPose): BusPose {
  const u = ((((t - line.offset) % line.period) + line.period) % line.period);
  const k = u / SAMPLE;
  const i = Math.min(line.track.length - 1, Math.floor(k));
  const j = Math.min(line.track.length - 1, i + 1);
  const s = line.track[i] + (line.track[j] - line.track[i]) * (k - i);
  const p = pointAt(line, s);
  let doors = 0;
  let stop = -1;
  for (const c of line.calls) {
    if (u < c.arrive || u >= c.leave) continue;
    stop = c.stop;
    doors = Math.max(0, Math.min(1, (u - c.arrive - 0.6) / DOOR_MOVE, (c.leave - u - 0.4) / DOOR_MOVE));
  }
  const b = into ?? ({} as BusPose);
  b.x = p.x;
  b.z = p.z;
  b.yaw = p.yaw;
  b.s = s;
  b.doors = doors;
  b.stop = stop;
  b.speed = (line.track[j] - line.track[i]) / SAMPLE;
  return b;
}

/**
 * The next time from `from` on, before `to`, that a bus stands at the bus stop at (x, z) with its doors
 * open: when they're open, when it leaves, and where its front door is. For the passers-by waiting there.
 */
export function busCall(x: number, z: number, from: number, to: number): { open: number; leave: number; door: [number, number]; rear: [number, number] } | null {
  let best: { open: number; leave: number; door: [number, number]; rear: [number, number] } | null = null;
  for (const line of BUS_LINES) {
    line.stops.forEach((st, i) => {
      if (Math.hypot(st.f.x - x, st.f.z - z) > 4) return;
      for (const c of line.calls) {
        if (c.stop !== i) continue;
        const open = c.arrive + 0.6 + DOOR_MOVE;
        const leave = c.leave - 0.4 - DOOR_MOVE;
        // The first round from `from` on whose doors are still open.
        const k = Math.ceil((from - line.offset - leave) / line.period);
        const at = line.offset + k * line.period;
        if (at + open < to && (!best || at + open < best.open)) best = { open: Math.max(at + open, from), leave: at + leave, door: st.doors[0], rear: st.doors[1] };
      }
    });
  }
  return best;
}

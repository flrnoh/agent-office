import { CITY_ROAD, lineX, lineZ } from './city.js';
import { FURNITURE, type Furniture } from './streetside.js';
import { CYCLE, STOP_AT, litAt, mayPass, type Axis, type LitCrossing } from './traffic-lights.js';
import { LINE_DEFS, type LineDef } from './busnet.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): the city's buses. Each line of the
// network (shared/busnet.ts) drives a loop through the streets round the office, stopping at its own
// named stops with its doors open and keeping to the traffic lights (shared/traffic-lights.ts). Like
// the lights, nothing about them goes over the wire: the timetable is worked out once, here, by
// driving every bus in town at once against the lights' own clock, each keeping out of the others'
// way (queueing behind one at a stop or a red light, waiting for one turning across its way in a
// crossing). Every line's rounds fit a whole number of times into BUS_PERIOD, a whole number of light
// cycles, and a bus that's early waits at its first stop for its next departure, so after a couple of
// periods the town settles into a period that repeats for ever. So every page has every bus at the
// same place at the same moment (busAt), the passers-by know when one's at their stop (busCall), the
// stops' boards when the next ones come (nextCalls), and someone riding one just goes where it goes.

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
/** The step of the timetable (s), and how often where each bus is gets kept. */
const STEP = 0.05;
const SAMPLE = 0.25;
/** The whole town's timetable comes round after this long (s): a whole number of light cycles and of every line's rounds. */
export const BUS_PERIOD = 26 * CYCLE;
/** How far behind another bus one stops (m), and how much room (m) each keeps round it. */
const GAP = 1.5;
const SPARE = 0.25;
/** How far ahead (m) a bus looks for another in its way. */
const LOOK = 26;

/** A stop along a line: the bus stop it's at, how far along the loop the bus's middle stands, and where its doors are then. */
export interface BusStop {
  f: Furniture;
  /** Its name and id (shared/busnet.ts). */
  id: string;
  name: string;
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

/** A bus standing at a stop: which, when it got there and when it pulls away (s on the office's clock, within BUS_PERIOD or just past either end). */
export interface Call {
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
  /** How long a round is on the timetable (BUS_PERIOD over a whole number), and how many buses it has. */
  round: number;
  buses: number;
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

/** The line's stops, where along the loop each is (its bus's middle standing a little past it), in order. */
function stopsOn(pts: V[], def: LineDef): BusStop[] {
  const out: BusStop[] = [];
  for (const id of def.stops) {
    const f = FURNITURE.find((g) => g.stop?.id === id);
    if (!f) throw new Error(`line ${def.no}: no stop ${id}`);
    const i = nearest(pts, f.x, f.z);
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const d: V = [(q[0] - p[0]) / D, (q[1] - p[1]) / D];
    const r = right(d);
    const off = (f.x - p[0]) * r[0] + (f.z - p[1]) * r[1];
    // On its right, by the curb or on the strip past the sidewalk, along a straight bit.
    if (off < 1.5 || off > 5.5 || Math.abs((f.x - p[0]) * d[0] + (f.z - p[1]) * d[1]) > 0.6) throw new Error(`line ${def.no}: stop ${id} isn't on its right`);
    out.push({ f, id, name: f.stop!.name, s: (i * D + BUS_L / 2 - 2.6 + pts.length * D) % (pts.length * D), doors: [] });
  }
  // In the order the bus comes to them, from the first of the line's (where its rounds start and end).
  out.sort((a, b) => a.s - b.s);
  const first = out.findIndex((st) => st.id === def.stops[0]);
  return [...out.slice(first), ...out.slice(0, first)];
}

function build(def: LineDef, id: number): BusLine {
  const { pts, corners, gates } = trace(def);
  const xs = Float64Array.from(pts.map((p) => p[0]));
  const zs = Float64Array.from(pts.map((p) => p[1]));
  const length = pts.length * D;
  const stops = stopsOn(pts, def);
  const line: BusLine = { id, no: def.no, dest: def.dest, color: def.color, xs, zs, length, stops, gates, corners, round: BUS_PERIOD / def.rounds, buses: def.buses };
  for (const st of stops) {
    const p = pointAt(line, st.s);
    st.doors = DOORS.map((u): [number, number] => {
      const fx = Math.cos(p.yaw);
      const fz = -Math.sin(p.yaw);
      return [p.x + fx * u - fz * (BUS_W / 2 + 0.35), p.z + fz * u + fx * (BUS_W / 2 + 0.35)];
    });
  }
  return line;
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

/** One bus: its line, which of the line's buses it is, and its timetable over BUS_PERIOD: where it is every SAMPLE s, and where it stands. */
export interface BusRun {
  line: BusLine;
  k: number;
  /** When it leaves its line's first stop on its first round (s into BUS_PERIOD). */
  depart: number;
  track: Float64Array;
  calls: Call[];
  /** Where it got to at the end of the period (for the tests: its first sample, its rounds on). */
  end: number;
}

// ---- Driving the town ---------------------------------------------------------------------------

/** A bus on the road while the timetable's worked out. */
interface Sim {
  line: BusLine;
  k: number;
  depart: number;
  /** In service yet, how far along its loop (going up for ever), how fast, and the stop it comes to next (counting up for ever). */
  on: boolean;
  s: number;
  v: number;
  next: number;
  /** Standing at a stop till then. */
  until: number;
  /** Where its middle is and which way it's heading, this step. */
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** How long it's been held up by another bus. */
  held: number;
  track: number[];
  calls: Call[];
  end: number;
}

/** The departures of a bus from its first stop: its line's offset, its place among the line's buses, every round. */
function departAt(def: LineDef, line: BusLine, k: number): number {
  return (((def.offset + (k * line.round) / line.buses) % line.round) + line.round) % line.round;
}

/** A bus's outline, a little bigger than it is, from where its middle is and which way it faces: four corners. */
function outline(x: number, z: number, fx: number, fz: number, out: number[]): number[] {
  const l = BUS_L / 2 + SPARE;
  const w = BUS_W / 2 + SPARE;
  out.length = 0;
  for (const [a, c] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) out.push(x + fx * a * l - fz * c * w, z + fz * a * l + fx * c * w);
  return out;
}

/** Whether two outlines (see outline) overlap: no edge of either separates them. */
function overlaps(p: number[], q: number[]): boolean {
  for (const P of [p, q]) {
    for (let i = 0; i < 4; i++) {
      const nx = P[((i + 1) % 4) * 2 + 1] - P[i * 2 + 1];
      const nz = P[i * 2] - P[((i + 1) % 4) * 2];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const da = p[k * 2] * nx + p[k * 2 + 1] * nz;
        const db = q[k * 2] * nx + q[k * 2 + 1] * nz;
        a0 = Math.min(a0, da);
        a1 = Math.max(a1, da);
        b0 = Math.min(b0, db);
        b1 = Math.max(b1, db);
      }
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}

const mine: number[] = [];
const theirs: number[] = [];

/** How far `b` can go along its way (m, up to `max`) before it runs into another bus where that one is now; Infinity if all the way. */
function blockedBy(b: Sim, o: Sim, max: number): number {
  if (!o.on || Math.abs(o.x - b.x) > max + BUS_L || Math.abs(o.z - b.z) > max + BUS_L) return Infinity;
  outline(o.x, o.z, o.fx, o.fz, theirs);
  for (let d = 0.5; d <= max; d += 1) {
    const p = pointAt(b.line, b.s + d);
    if (overlaps(outline(p.x, p.z, Math.cos(p.yaw), -Math.sin(p.yaw), mine), theirs)) return d;
  }
  return Infinity;
}

/**
 * Drives every bus in town together, step by step from two periods back, and keeps the last period:
 * where each is and where it stands. Each keeps to the lights and the corners as a bus alone would,
 * and stops short of another bus in its way: the one in front at a stop or a light, or one turning
 * across it in a crossing (of two in each other's way, the earlier in BUS_RUNS goes first).
 */
function drive(): BusRun[] {
  const sims: Sim[] = BUS_LINES.flatMap((line, li) =>
    Array.from({ length: line.buses }, (_, k): Sim => ({ line, k, depart: departAt(LINE_DEFS[li], line, k), on: false, s: 0, v: 0, next: 0, until: 0, x: 0, z: 0, fx: 1, fz: 0, held: 0, track: [], calls: [], end: 0 })),
  );
  const from = -2 * BUS_PERIOD;
  const steps = Math.round((3 * BUS_PERIOD) / STEP);
  const every = Math.round(SAMPLE / STEP);
  const place = (b: Sim) => {
    const p = pointAt(b.line, b.s);
    b.x = p.x;
    b.z = p.z;
    b.fx = Math.cos(p.yaw);
    b.fz = -Math.sin(p.yaw);
  };
  /** Where stop `n` (counting up for ever, round after round) is along the loop. */
  const stopS = (b: Sim, n: number) => {
    const { stops, length } = b.line;
    const m = stops.length;
    const st = stops[n % m].s;
    return st + (st < stops[0].s ? length : 0) + Math.floor(n / m) * length;
  };
  for (let i = 0; i <= steps; i++) {
    const t = from + i * STEP;
    for (const b of sims) {
      const L = b.line.length;
      if (!b.on) {
        // Into service at its first stop, doors open, a dwell before its first departure.
        const first = b.depart + Math.ceil((t - b.depart) / b.line.round) * b.line.round;
        if (first - t > DWELL) continue;
        b.on = true;
        b.s = b.line.stops[0].s;
        b.next = 1;
        b.until = first;
        place(b);
      }
      if (t < b.until) continue;
      const front = b.s + BUS_L / 2;
      const stopAt = stopS(b, b.next);
      let limit = stopAt - b.s;
      // The next red light.
      for (const g of b.line.gates) {
        let gs = g.s + Math.floor(b.s / L) * L;
        if (gs - front < -0.01) gs += L;
        const ahead = gs - front;
        if (ahead > 60) continue;
        const turning = g.axis !== g.exit;
        if (!mayPass(g.l, g.axis, t, ahead, b.v, BRAKE * 2, turning ? g.exit : undefined)) limit = Math.min(limit, ahead);
      }
      // Another bus in its way: stop short of it.
      let held = false;
      for (const o of sims) {
        if (o === b) continue;
        const d = blockedBy(b, o, Math.min(LOOK, Math.max(limit, 0) + GAP + 1));
        if (d === Infinity) continue;
        // Two in each other's way (a turn across a crossing): the one first in line goes, unless it's been waiting long.
        if (blockedBy(o, b, LOOK) !== Infinity && sims.indexOf(b) < sims.indexOf(o) && o.held < 20) continue;
        if (b.held > 30) continue;
        limit = Math.min(limit, d - GAP);
        held = true;
      }
      let want = Math.min(CRUISE, Math.sqrt(2 * BRAKE * Math.max(0, limit)));
      for (const [ca0, cb0] of b.line.corners) {
        for (const k of [Math.floor(b.s / L) * L, Math.floor(b.s / L) * L + L]) {
          const ca = ca0 + k;
          const cb = cb0 + k;
          if (b.s + BUS_L / 2 >= ca && b.s - BUS_L / 2 <= cb) want = Math.min(want, CORNER_V);
          else if (ca > b.s && ca - b.s < 50) want = Math.min(want, Math.sqrt(CORNER_V * CORNER_V + 2 * BRAKE * (ca - b.s - BUS_L / 2)));
        }
      }
      b.v = Math.min(want, b.v + ACCEL * STEP);
      if (limit <= 0) b.v = 0;
      b.s = Math.min(b.s + b.v * STEP, b.s + Math.max(0, limit));
      b.held = held && b.v < 0.2 ? b.held + STEP : 0;
      if (stopAt - b.s < 0.05) {
        // At the stop: doors open, people on and off, doors shut, away; at its first stop, not before its next departure.
        b.s = stopAt;
        b.v = 0;
        b.until = t + DWELL;
        if (b.next % b.line.stops.length === 0) {
          const due = b.depart + Math.ceil((t + DWELL - b.depart) / b.line.round) * b.line.round;
          b.until = due;
        }
        b.calls.push({ stop: b.next % b.line.stops.length, arrive: t, leave: b.until });
        b.next++;
      }
      place(b);
    }
    // The last period, every SAMPLE s.
    if (t >= 0 && t < BUS_PERIOD && i % every === 0) for (const b of sims) b.track.push(b.s);
    if (i === steps) for (const b of sims) b.end = b.s;
  }
  return sims.map((b) => ({
    line: b.line,
    k: b.k,
    depart: b.depart,
    track: Float64Array.from(b.track),
    end: b.end,
    // A period's calls (one standing over its start has its arrival at the end of it).
    calls: b.calls.filter((c) => c.arrive >= 0 && c.arrive < BUS_PERIOD),
  }));
}

/** Every bus in town, line by line (a bus's place here is its number on the wire, shared/busride.ts). */
export const BUS_RUNS: readonly BusRun[] = drive();
const RUNS_OF = new Map(BUS_LINES.map((l) => [l, BUS_RUNS.filter((r) => r.line === l)]));

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

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Where `line`'s bus `run` (its first if not said) is at `t` (seconds on the office's clock). */
export function busAt(line: BusLine, t: number, into?: BusPose, run = 0): BusPose {
  const r = RUNS_OF.get(line)![run] ?? RUNS_OF.get(line)![0];
  return poseOf(r, t, into);
}

/** Where bus `r` is at `t` (seconds on the office's clock). */
export function poseOf(r: BusRun, t: number, into?: BusPose): BusPose {
  const u = mod(t, BUS_PERIOD);
  const k = u / SAMPLE;
  const n = r.track.length;
  const i = Math.floor(k) % n;
  const j = (i + 1) % n;
  // Across the end of the period the count goes back to where it started, its rounds earlier: the same place.
  const sj = j === 0 ? r.track[0] + Math.round((r.track[n - 1] - r.track[0]) / r.line.length) * r.line.length : r.track[j];
  const s = r.track[i] + (sj - r.track[i]) * (k - Math.floor(k));
  const p = pointAt(r.line, s);
  let doors = 0;
  let stop = -1;
  for (const c of r.calls) {
    for (const w of [u, u + BUS_PERIOD, u - BUS_PERIOD]) {
      if (w < c.arrive || w >= c.leave) continue;
      stop = c.stop;
      doors = Math.max(0, Math.min(1, (w - c.arrive - 0.6) / DOOR_MOVE, (c.leave - w - 0.4) / DOOR_MOVE));
    }
  }
  const b = into ?? ({} as BusPose);
  b.x = p.x;
  b.z = p.z;
  b.yaw = p.yaw;
  b.s = s;
  b.doors = doors;
  b.stop = stop;
  b.speed = (sj - r.track[i]) / SAMPLE;
  return b;
}

/** Bus `r`'s calls at its line's stop `i`, as times its doors are open: the next ones from `t` on (each from when it came), soonest first. */
function callsFrom(r: BusRun, i: number, t: number): { arrive: number; open: number; leave: number }[] {
  const out: { arrive: number; open: number; leave: number }[] = [];
  for (const c of r.calls) {
    if (c.stop !== i) continue;
    const open = c.arrive + 0.6 + DOOR_MOVE;
    const leave = c.leave - 0.4 - DOOR_MOVE;
    // The first period from `t` on whose doors are still open.
    const k = Math.ceil((t - leave) / BUS_PERIOD);
    for (const j of [k, k + 1]) out.push({ arrive: c.arrive + j * BUS_PERIOD, open: open + j * BUS_PERIOD, leave: leave + j * BUS_PERIOD });
  }
  return out;
}

/**
 * The next time from `from` on, before `to`, that a bus stands at the bus stop at (x, z) with its doors
 * open: when they're open, when it leaves, and where its front door is. For the passers-by waiting there.
 */
export function busCall(x: number, z: number, from: number, to: number): { open: number; leave: number; door: [number, number]; rear: [number, number] } | null {
  let best: { open: number; leave: number; door: [number, number]; rear: [number, number] } | null = null;
  for (const r of BUS_RUNS) {
    r.line.stops.forEach((st, i) => {
      if (Math.hypot(st.f.x - x, st.f.z - z) > 4) return;
      for (const c of callsFrom(r, i, from)) {
        // With time enough to get on or off before the doors shut.
        if (c.leave - Math.max(c.open, from) > 3 && c.open < to && (!best || c.open < best.open)) best = { open: Math.max(c.open, from), leave: c.leave, door: st.doors[0], rear: st.doors[1] };
      }
    });
  }
  return best;
}

/** When `line`'s buses next pull up at its stop `i` from `t` on (s on the office's clock, soonest first; one standing there now counts, from when it came). */
export function nextCalls(line: BusLine, i: number, t: number, n = 2): number[] {
  const out: number[] = [];
  for (const r of RUNS_OF.get(line)!) for (const c of callsFrom(r, i, t)) out.push(c.arrive);
  return out.sort((a, b) => a - b).slice(0, n);
}

/** The stop a bus comes to next (or stands at): its index on the line, and whether it's there with its doors open. */
export function nextStop(line: BusLine, pose: BusPose): { i: number; at: boolean } {
  if (pose.stop >= 0) return { i: pose.stop, at: true };
  let i = 0;
  let best = Infinity;
  line.stops.forEach((st, k) => {
    const ahead = mod(st.s - pose.s - 0.5, line.length);
    if (ahead < best) {
      best = ahead;
      i = k;
    }
  });
  return { i, at: false };
}

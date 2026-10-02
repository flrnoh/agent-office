// DER BRECHER's track and ride (flrnoh fork, see FORK.md "Der Brecher"): the route (coaster-route.ts)
// smoothed into a spline, laid out a point every DS metres with a frame at each (where ahead is, which
// way is up for the riders, which way is right), the train's speed all the way round, and when it gets
// where. Pure and worked out once per height of building, the same in the office and every page: where
// the train is follows from how long ago it was dispatched alone, so everyone sees it in the same place.
//
// - The spline: a centripetal Catmull-Rom through the route's points a metre apart (its corners
//   rounded off), resampled evenly.
// - The frame: carried along without twisting (parallel transport), turned where the route says so
//   (the vertical lift's quarter turn), then banked round the heartline so the riders are pushed into
//   their seats rather than sideways: toward where gravity and the turn together push them, smoothed.
// - The speed: the chain lifts and the station's tires at their speed, energy kept on the way down and
//   lost on the way up, a little friction and drag, trims and brakes taking off what's too much, the
//   booster adding what's too little.

import { coasterRoute, HEART, routeStoreys, type Route, type Zone } from './coaster-route.js';
import { carOffset } from './coaster.js';

/** The track's points are this far apart (m). */
export const DS = 0.25;
const G = 9.81;
/** Rolling friction (a fraction of g) and air drag (per metre, times v²). */
const MU = 0.012;
const DRAG = 0.0011;

export interface CoasterTrack {
  storeys: number;
  /** All the way round (m). */
  length: number;
  n: number;
  /** Per point: where the heartline is, ahead (T), the riders' up (N), their right (B = T × N). */
  pos: Float64Array;
  tan: Float64Array;
  nor: Float64Array;
  bin: Float64Array;
  /** Per point: how fast the train's middle goes there (m/s), and when it gets there after it went (s). */
  speed: Float64Array;
  time: Float64Array;
  /** The forces the riders feel there, in g: pushed into the seat (+), sideways (+ right), and forward/back. */
  gN: Float64Array;
  gB: Float64Array;
  gT: Float64Array;
  /** Dispatch to back in the station (s). */
  duration: number;
  zones: Zone[];
  marks: Record<string, number>;
  /** How high the crest is over the deck, the street under the deck, the ground floor's floor. */
  crest: number;
  street: number;
  ground: number;
}

const tracks = new Map<number, CoasterTrack>();

/** The track for a building `storeys` storeys tall (worked out once and kept). */
export function coasterTrack(storeys: number): CoasterTrack {
  const N = routeStoreys(storeys);
  let t = tracks.get(N);
  if (!t) {
    t = build(coasterRoute(N));
    tracks.set(N, t);
  }
  return t;
}

/** How long a ride takes on a building `storeys` storeys tall (s). */
export function rideDuration(storeys: number): number {
  return coasterTrack(storeys).duration;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: V): V => scale(a, 1 / (len(a) || 1));
/** `v` turned `angle` round the unit axis `k` (Rodrigues). */
function rotate(v: V, k: V, angle: number): V {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/** A centripetal Catmull-Rom through the closed ring of points `ctl`, resampled every DS (the last point is the first again). */
function spline(ctl: V[]): { pts: V[]; atCtl: number[] } {
  const m = ctl.length;
  const fine: V[] = [];
  const fineS: number[] = [];
  const atCtl: number[] = [];
  let s = 0;
  const SUB = 12;
  for (let j = 0; j < m; j++) {
    const p0 = ctl[(j - 1 + m) % m];
    const p1 = ctl[j];
    const p2 = ctl[(j + 1) % m];
    const p3 = ctl[(j + 2) % m];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(len(sub(p1, p0))) || 1e-4;
    const t2 = t1 + (Math.sqrt(len(sub(p2, p1))) || 1e-4);
    const t3 = t2 + (Math.sqrt(len(sub(p3, p2))) || 1e-4);
    atCtl.push(s);
    for (let k = j === 0 ? 0 : 1; k <= SUB; k++) {
      const t = t1 + ((t2 - t1) * k) / SUB;
      const lerp = (a: V, b: V, ta: number, tb: number): V => {
        const w = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
      };
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      const c = lerp(b1, b2, t1, t2);
      if (fine.length) s += len(sub(c, fine[fine.length - 1]));
      fine.push(c);
      fineS.push(s);
    }
  }
  atCtl.push(s);
  // Evenly, DS apart, the length rounded to a whole number of them.
  const total = s;
  const n = Math.round(total / DS);
  const step = total / n;
  const pts: V[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const want = k * step;
    while (i < fineS.length - 2 && fineS[i + 1] < want) i++;
    const w = (want - fineS[i]) / (fineS[i + 1] - fineS[i] || 1);
    const a = fine[i];
    const b = fine[i + 1];
    pts.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]);
  }
  // atCtl in units of the even spacing (so s = atCtl[j] / total * n * DS).
  return { pts, atCtl: atCtl.map((x) => (x / total) * n * DS) };
}

function build(route: Route): CoasterTrack {
  // The route's points a metre apart, as the spline's (the last is the first again: dropped).
  const every = Math.round(1 / 0.2);
  const ctl: V[] = [];
  const ctlU: number[] = [];
  const P = route.pts;
  const count = P.length / 3 - 1;
  for (let i = 0; i < count; i += every) {
    ctl.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
    ctlU.push(route.u[i]);
  }
  ctlU.push(route.u[count]);
  const { pts, atCtl } = spline(ctl);
  const n = pts.length;
  const length = n * DS;
  // From the route's distances to the track's: through the control points.
  const toS = (u: number): number => {
    if (u <= 0) return 0;
    let j = 0;
    while (j < ctlU.length - 2 && ctlU[j + 1] < u) j++;
    const w = Math.max(0, Math.min(1, (u - ctlU[j]) / (ctlU[j + 1] - ctlU[j] || 1)));
    return atCtl[j] + (atCtl[j + 1] - atCtl[j]) * w;
  };
  const zones = route.zones.map((z) => ({ ...z, from: toS(z.from), to: toS(z.to) }));
  const marks = Object.fromEntries(Object.entries(route.marks).map(([k, u]) => [k, toS(u)]));
  const twists = route.twists.map((w) => ({ ...w, from: toS(w.from), to: toS(w.to) }));

  // Ahead, at each point.
  const T: V[] = pts.map((_, i) => unit(sub(pts[(i + 1) % n], pts[(i - 1 + n) % n])));
  // The frame carried round without twisting (parallel transport), from upright in the station, turned
  // where the route says so, and wherever the track's neither steep nor upside down, eased back upright
  // (a helix carried round would end up leaning).
  const twistAt = (s: number) => twists.reduce((acc, w) => acc + w.angle * Math.max(0, Math.min(1, (s - w.from) / (w.to - w.from || 1))), 0);
  const Nref: V[] = new Array(n);
  Nref[0] = unit(sub([0, 1, 0], scale(T[0], T[0][1])));
  for (let i = 1; i < n; i++) {
    const a = T[i - 1];
    const b = T[i];
    const axis = cross(a, b);
    const sn = len(axis);
    let v = Nref[i - 1];
    if (sn > 1e-9) v = rotate(v, scale(axis, 1 / sn), Math.atan2(sn, dot(a, b)));
    const turn = twistAt(i * DS) - twistAt((i - 1) * DS);
    if (turn) v = rotate(v, b, turn);
    v = unit(sub(v, scale(b, dot(v, b))));
    const upright = sub([0, 1, 0], scale(b, b[1]));
    const lu = len(upright);
    if (Math.abs(b[1]) < 0.7 && lu > 1e-6 && dot(v, upright) > 0) {
      const u = scale(upright, 1 / lu);
      v = unit([v[0] + (u[0] - v[0]) * 0.04, v[1] + (u[1] - v[1]) * 0.04, v[2] + (u[2] - v[2]) * 0.04]);
      v = unit(sub(v, scale(b, dot(v, b))));
    }
    Nref[i] = v;
  }

  // The speed: from standing in the station, round to standing in it again.
  const speed = new Float64Array(n + 1);
  const zoneAt = (s: number) => zones.filter((z) => s >= z.from && s < z.to);
  let v2 = 0;
  for (let i = 0; i < n; i++) {
    const y0 = pts[i][1];
    const y1 = pts[(i + 1) % n][1];
    v2 = v2 - 2 * G * (y1 - y0) - 2 * DS * (MU * G + DRAG * v2);
    let v = Math.sqrt(Math.max(0, v2));
    const s = (i + 1) * DS;
    for (const z of zoneAt(s)) {
      const was = speed[i];
      if (z.kind === 'tires' || z.kind === 'chain') {
        if (v < z.v) v = Math.min(z.v, Math.sqrt(was * was + 2 * z.a * DS));
      } else if (z.kind === 'boost') {
        if (v < z.v) v = Math.min(z.v, Math.sqrt(was * was + 2 * z.a * DS));
      } else if (z.kind === 'trim' || z.kind === 'brake') {
        if (v > z.v) v = Math.max(z.v, Math.sqrt(Math.max(0, was * was - 2 * z.a * DS)));
      } else if (z.kind === 'stop') {
        v = Math.min(v, Math.sqrt(2 * z.a * Math.max(0, z.to - s)));
      }
    }
    speed[i + 1] = v;
    v2 = v * v;
  }
  speed[n] = 0;
  const time = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) time[i + 1] = time[i] + (2 * DS) / Math.max(1e-3, speed[i] + speed[i + 1]);

  // What the riders feel pushing them: the turn's pull and gravity's push up from the seat.
  const force: V[] = pts.map((_, i) => {
    const k = scale(sub(T[(i + 1) % n], T[(i - 1 + n) % n]), 1 / (2 * DS));
    const v = speed[i];
    return [k[0] * v * v, k[1] * v * v + G, k[2] * v * v];
  });
  // Banked toward it (the side of it nearest the carried frame's up), where it's strong enough to say.
  const roll = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = force[i];
    const fp = sub(f, scale(T[i], dot(f, T[i])));
    const mag = len(fp);
    if (mag < 1e-6) continue;
    const want = scale(fp, (dot(fp, Nref[i]) >= 0 ? 1 : -1) / mag);
    const w = Math.max(0, Math.min(1, (mag - 1.5) / 2.5));
    const angle = Math.atan2(dot(cross(Nref[i], want), T[i]), dot(Nref[i], want));
    roll[i] = angle * w * w * (3 - 2 * w);
  }
  // Smoothed, so the track rolls into a turn rather than snapping.
  const smoothRoll = new Float64Array(n);
  const R = Math.round(2.5 / DS);
  const weights = Array.from({ length: 2 * R + 1 }, (_, k) => Math.exp(-(((k - R) / (R / 2)) ** 2)));
  const wsum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -R; k <= R; k++) acc += roll[(i + k + n) % n] * weights[k + R];
    smoothRoll[i] = acc / wsum;
  }
  const pos = new Float64Array(3 * n);
  const tan = new Float64Array(3 * n);
  const nor = new Float64Array(3 * n);
  const bin = new Float64Array(3 * n);
  const gN = new Float64Array(n);
  const gB = new Float64Array(n);
  const gT = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = T[i];
    const up = unit(rotate(Nref[i], t, smoothRoll[i]));
    const right = cross(t, up);
    pos.set(pts[i], 3 * i);
    tan.set(t, 3 * i);
    nor.set(up, 3 * i);
    bin.set(right, 3 * i);
    const f = force[i];
    gN[i] = dot(f, up) / G;
    gB[i] = dot(f, right) / G;
    // Forward: what the speed's doing, less gravity's pull along the track.
    const dv = (speed[i + 1] * speed[i + 1] - speed[i] * speed[i]) / (2 * DS);
    gT[i] = (dv + G * t[1]) / G;
  }
  return {
    storeys: route.storeys,
    length,
    n,
    pos,
    tan,
    nor,
    bin,
    speed,
    time,
    gN,
    gB,
    gT,
    duration: time[n],
    zones,
    marks,
    crest: route.crest,
    street: route.street,
    ground: route.ground,
  };
}

/** Where along the track (m, 0 to its length) the train's middle is `t` seconds after it went. */
export function sAtTime(track: CoasterTrack, t: number): number {
  const time = track.time;
  if (!(t > 0)) return 0;
  if (t >= track.duration) return 0;
  let lo = 0;
  let hi = track.n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid;
    else hi = mid;
  }
  const w = (t - time[lo]) / (time[hi] - time[lo] || 1);
  return (lo + w) * DS;
}

/** How fast the train goes at `s` (m/s). */
export function speedAt(track: CoasterTrack, s: number): number {
  const f = wrap(track, s) / DS;
  const i = Math.floor(f);
  return track.speed[i] + (track.speed[i + 1] - track.speed[i]) * (f - i);
}

const wrap = (track: CoasterTrack, s: number) => ((s % track.length) + track.length) % track.length;

/** A point on the track and its frame, between the points either side. */
export interface TrackPose {
  x: number;
  y: number;
  z: number;
  /** Ahead, up (for the riders), right. */
  t: [number, number, number];
  n: [number, number, number];
  b: [number, number, number];
}

/** The track at `s` (any distance: it goes round), its frame normalised. */
export function poseAt(track: CoasterTrack, s: number, out?: TrackPose): TrackPose {
  const n = track.n;
  const f = wrap(track, s) / DS;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const w = f - Math.floor(f);
  const o = out ?? { x: 0, y: 0, z: 0, t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0] };
  const P = track.pos;
  o.x = P[3 * i] + (P[3 * j] - P[3 * i]) * w;
  o.y = P[3 * i + 1] + (P[3 * j + 1] - P[3 * i + 1]) * w;
  o.z = P[3 * i + 2] + (P[3 * j + 2] - P[3 * i + 2]) * w;
  const lerpUnit = (A: Float64Array, into: [number, number, number]) => {
    const x = A[3 * i] + (A[3 * j] - A[3 * i]) * w;
    const y = A[3 * i + 1] + (A[3 * j + 1] - A[3 * i + 1]) * w;
    const z = A[3 * i + 2] + (A[3 * j + 2] - A[3 * i + 2]) * w;
    const l = Math.hypot(x, y, z) || 1;
    into[0] = x / l;
    into[1] = y / l;
    into[2] = z / l;
  };
  lerpUnit(track.tan, o.t);
  lerpUnit(track.nor, o.n);
  // Right, square to the two (so the frame stays a frame between the points).
  const t = o.t;
  const u = o.n;
  const d = t[0] * u[0] + t[1] * u[1] + t[2] * u[2];
  u[0] -= t[0] * d;
  u[1] -= t[1] * d;
  u[2] -= t[2] * d;
  const l = Math.hypot(u[0], u[1], u[2]) || 1;
  u[0] /= l;
  u[1] /= l;
  u[2] /= l;
  o.b[0] = t[1] * u[2] - t[2] * u[1];
  o.b[1] = t[2] * u[0] - t[0] * u[2];
  o.b[2] = t[0] * u[1] - t[1] * u[0];
  return o;
}

/** Where car `car`'s middle is along the track with the train's middle at `s`. */
export const carS = (s: number, car: number) => s + carOffset(car);

/** The rails' line at a pose: HEART under the heartline, along the riders' up. */
export function railAt(p: TrackPose): { x: number; y: number; z: number } {
  return { x: p.x - p.n[0] * HEART, y: p.y - p.n[1] * HEART, z: p.z - p.n[2] * HEART };
}

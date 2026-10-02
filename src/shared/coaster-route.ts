// DER BRECHER's route (flrnoh fork, see FORK.md "Der Brecher"): the track laid round the office tower
// as a string of straights, arcs and ramps, a point every few centimetres, in the roof's frame (the
// deck at y 0, the street roofDrop(storeys) below it). Seen from above it's the same however tall the
// building is (so the minimap draws it once); only its heights follow the storeys: the lift hill and the
// first drop down the facade grow with the building, the vertical lift back up too.
//
// The way round, from the station off the roof's north edge, heading east:
//   the chain lift over the north-east corner and up the east side, a flat run along the top to the
//   south-east corner, round over the street side and the FLOGGE OFFICE letters, the first drop down the
//   facade past every storey's balconies (and a jumper on the bungee rope, a few metres to the east), the
//   pull-out over the plaza to the photo flash, a U-turn over the road, the launch, the loop over the
//   street, a left turn over the sidewalk, in through the ground floor's south wall in a glass tube
//   under its ceiling, past the desks and out through the north wall, straight up the vertical lift
//   behind the building, over the top and down the brake run into the station.

import { roofDrop } from './layout.js';
import { STATION, TUBE_OUT_X, TUBE_X } from './coaster.js';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** What a stretch of track does to the train (see coaster-track.ts's physics). */
export type ZoneKind = 'tires' | 'chain' | 'trim' | 'boost' | 'brake' | 'stop' | 'tunnel';

export interface Zone {
  kind: ZoneKind;
  /** Where it runs, along the route (m). */
  from: number;
  to: number;
  /** Its speed: the chain's or the tires', the most a trim or brake lets through, what a booster gets you to (m/s). */
  v: number;
  /** How hard it may speed the train up or slow it down to get there (m/s²). */
  a: number;
}

/** A stretch where the track's turned round itself on purpose (the vertical lift turns a quarter as it climbs). */
export interface Twist {
  from: number;
  to: number;
  angle: number;
}

export interface Route {
  storeys: number;
  /** The points, every STEP or so, as x, y, z. The last one is the first again (it's a circuit). */
  pts: Float64Array;
  /** How far along the route each point is. */
  u: Float64Array;
  zones: Zone[];
  twists: Twist[];
  /** Named places along it (m): the crest, the photo, the loop, the tunnel's ends… */
  marks: Record<string, number>;
  /** How high the crest of the lift hill is over the deck, the street under the deck, the ground floor's floor. */
  crest: number;
  street: number;
  ground: number;
}

/** How far the heartline (the riders' middles, which the route follows) is over the rails (m). */
export const HEART = 0.75;

/** The points' spacing (m). */
export const STEP = 0.2;

/** How fast the chain lifts and the station's tires push (m/s). */
export const CHAIN_V = 3.8;
export const VLIFT_V = 3.4;
/** The most the drop's trims let through, and what the booster launches the train into the loop at. */
const DROP_V = 16.8;
const TURN_V = 12.5;
const LAUNCH_V = 16.5;

/** How hard each kind of zone speeds the train up or slows it down (m/s²); the trims on the drop are gentler. */
const ACCEL: Record<ZoneKind, number> = { tires: 1.4, chain: 1.4, trim: 7, boost: 12.5, brake: 4, stop: 1, tunnel: 0 };

/**
 * The drop, straight down: over the top with the radius growing from 3 to 16 m (as the 2.5th power of
 * how far round it is), and out at the bottom with it shrinking from 20 to 10 m.
 */
const DROP_OVER = [3, 16, 2.5] as const;
const DROP_OUT = [20, 10, 1] as const;
/** At least this much of the drop is straight down, however low the building (the crest goes up for it). */
const DROP_MIN = 1.5;
/** The loop over the street: its turning the way an Euler spiral does (curvature 0 at either end), how tight at the top, how far it steps aside. */
const LOOP_TOP_R = 4;
const LOOP_SHIFT = 2.4;
const LOOP_SHAPE = 1;
/** The tube through the ground floor: in through the south wall heading north at TUBE_X, left at TUBE_TURN_Z, along the desks, out north at TUBE_OUT_X. */
const TUBE_TURN_Z = -0.5;
const WALL_Z_SOUTH = 13.3;
/** After the loop: a breath for the track to roll into the turn, and the turn up to the tube. */
const AFTER_LOOP = 1.5;
const TURN_IN_R = 5;
/** The vertical lift's pitch up off the tube's line. */
const VLIFT_R = 3.2;
/** …and over the top of it into the brake run. */
const OVER_R = 3.4;

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** A height change over a run with its slope rising linearly over `blend`, steady, and easing off over `blend` again: zero slope at both ends. */
function rampAt(w: number, W: number, blend: number): number {
  const b = Math.min(blend, W / 2);
  const m = 1 / (W - b); // the steady slope, so the whole run rises 1
  if (w <= 0) return 0;
  if (w >= W) return 1;
  if (w < b) return (m * w * w) / (2 * b);
  if (w > W - b) return 1 - (m * (W - w) * (W - w)) / (2 * b);
  return (m * b) / 2 + m * (w - b);
}

type PlanSeg = { line: number } | { arc: number; deg: number; side: 'L' | 'R' };

/** Lays the route a point at a time, from where it is, the way it's heading. */
class Turtle {
  pts: number[] = [];
  us: number[] = [];
  u = 0;
  p: V3;
  d: V3;
  zones: Zone[] = [];
  twists: Twist[] = [];
  marks: Record<string, number> = {};

  constructor(p: V3, d: V3) {
    this.p = { ...p };
    this.d = norm(d);
    this.put(this.p);
  }

  private put(q: V3) {
    const n = this.pts.length;
    if (n) this.u += Math.hypot(q.x - this.pts[n - 3], q.y - this.pts[n - 2], q.z - this.pts[n - 1]);
    this.pts.push(q.x, q.y, q.z);
    this.us.push(this.u);
    this.p = { ...q };
  }

  mark(name: string) {
    this.marks[name] = this.u;
  }

  zone(kind: ZoneKind, from: number, to: number, v: number, a = ACCEL[kind]) {
    this.zones.push({ kind, from, to, v, a });
  }

  /** Straight on, `L` metres, the way it's heading. */
  line(L: number) {
    const n = Math.max(1, Math.ceil(L / STEP));
    const o = this.p;
    for (let i = 1; i <= n; i++) {
      const k = (L * i) / n;
      this.put({ x: o.x + this.d.x * k, y: o.y + this.d.y * k, z: o.z + this.d.z * k });
    }
  }

  /**
   * A run over level plan stretches (straights and arcs, turning left or right), its height going
   * from where it is by `dy` along a ramp (`blend` the easing at either end; 0 for none, staying level).
   */
  plan(segs: PlanSeg[], dy = 0, blend = 0) {
    const W = segs.reduce((a, s) => a + ('line' in s ? s.line : (s.arc * s.deg * Math.PI) / 180), 0);
    const y0 = this.p.y;
    let w = 0;
    let h = Math.atan2(this.d.x, this.d.z); // heading: 0 is +z, as rotY
    let at = { x: this.p.x, z: this.p.z };
    const yAt = (k: number) => y0 + dy * (blend > 0 ? rampAt(k, W, blend) : smooth(k / W));
    for (const s of segs) {
      if ('line' in s) {
        const n = Math.max(1, Math.ceil(s.line / STEP));
        for (let i = 1; i <= n; i++) {
          const k = (s.line * i) / n;
          this.put({ x: at.x + Math.sin(h) * k, y: yAt(w + k), z: at.z + Math.cos(h) * k });
        }
        at = { x: at.x + Math.sin(h) * s.line, z: at.z + Math.cos(h) * s.line };
        w += s.line;
      } else {
        const turn = ((s.side === 'L' ? 1 : -1) * s.deg * Math.PI) / 180;
        const len = s.arc * Math.abs(turn);
        const n = Math.max(2, Math.ceil(len / STEP));
        // Left of the heading (rotY h) is +90°: the centre's that side, `arc` away.
        const side = s.side === 'L' ? 1 : -1;
        const c = { x: at.x + Math.sin(h + (side * Math.PI) / 2) * s.arc, z: at.z + Math.cos(h + (side * Math.PI) / 2) * s.arc };
        const a0 = Math.atan2(at.x - c.x, at.z - c.z);
        for (let i = 1; i <= n; i++) {
          const a = a0 + (turn * i) / n;
          this.put({ x: c.x + Math.sin(a) * s.arc, y: yAt(w + (len * i) / n), z: c.z + Math.cos(a) * s.arc });
        }
        at = { x: c.x + Math.sin(a0 + turn) * s.arc, z: c.z + Math.cos(a0 + turn) * s.arc };
        h += turn;
        w += len;
      }
    }
    this.d = { x: Math.sin(h), y: 0, z: Math.cos(h) };
  }

  /**
   * Pitches up (+) or down (-) by `deg` on an arc of radius `r`, in the upright plane it's heading in
   * (or, heading straight up or down, the one toward `toward`).
   */
  pitch(r: number, deg: number, toward?: { x: number; z: number }) {
    const hx = this.d.x;
    const hz = this.d.z;
    const flat = Math.hypot(hx, hz);
    const f = flat > 1e-6 ? { x: hx / flat, z: hz / flat } : toward ?? { x: 1, z: 0 };
    const p0 = Math.asin(Math.max(-1, Math.min(1, this.d.y)));
    const turn = (deg * Math.PI) / 180;
    const sign = Math.sign(turn);
    // The centre is above (pitching up) or below (down), square to the heading.
    const o = this.p;
    const c = { u: -Math.sin(p0) * r * sign, v: Math.cos(p0) * r * sign };
    const n = Math.max(2, Math.ceil((r * Math.abs(turn)) / STEP));
    for (let i = 1; i <= n; i++) {
      const p = p0 + (turn * i) / n;
      const du = c.u + Math.sin(p) * r * sign;
      const dv = c.v - Math.cos(p) * r * sign;
      this.put({ x: o.x + f.x * du, y: o.y + dv, z: o.z + f.z * du });
    }
    const p1 = p0 + turn;
    this.d = { x: f.x * Math.cos(p1), y: Math.sin(p1), z: f.z * Math.cos(p1) };
  }

  /**
   * Pitches from `from` to `to` (radians, 0 level, -pi/2 straight down) in the upright plane toward
   * `f`, its radius going from `r0` to `r1` (as the progress to the power `exp`): over the top of the
   * drop ever less sharply (so the riders float rather than being flung out of their seats as it picks
   * up speed), and out at the bottom ever more sharply (so it builds rather than slams).
   */
  pitchSpiral(from: number, to: number, r0: number, r1: number, exp: number, f: { x: number; z: number }) {
    const fl = Math.hypot(f.x, f.z) || 1;
    const fx = f.x / fl;
    const fz = f.z / fl;
    const { pts } = spiralPath(from, to, r0, r1, exp);
    const o = this.p;
    for (const q of pts) this.put({ x: o.x + fx * q.u, y: o.y + q.v, z: o.z + fz * q.u });
    this.d = { x: fx * Math.cos(to), y: Math.sin(to), z: fz * Math.cos(to) };
  }

  /** Straight up (or on), turning `deg` round itself on the way (a twist). */
  twisted(L: number, deg: number) {
    const from = this.u;
    this.line(L);
    this.twists.push({ from, to: this.u, angle: (deg * Math.PI) / 180 });
  }

  /** The loop over the street (see loopShape), from here, the way it's heading. */
  loop(shape: { u: number; v: number; w: number }[]) {
    const hx = this.d.x;
    const hz = this.d.z;
    const left = { x: hz, z: -hx }; // left of the heading, looking down: heading +x, left is -z
    const o = this.p;
    for (const q of shape) this.put({ x: o.x + hx * q.u + left.x * q.w, y: o.y + q.v, z: o.z + hz * q.u + left.z * q.w });
    this.d = { x: hx, y: 0, z: hz };
  }
}

/**
 * The loop over the street, in its own frame (u ahead, v up, w to the left), a point every STEP: it
 * pitches up and round, all the way, its curvature rising from nothing to the top's and back like an
 * Euler spiral (so nobody's slammed into it), stepping `shift` to the left on the way round so it
 * comes out beside where it went in.
 */
export function loopShape(topR = LOOP_TOP_R, shift = LOOP_SHIFT): { u: number; v: number; w: number }[] {
  // Curvature over arc length: k(s) = K sin(pi s / S)^SHAPE, turning 2 pi in all.
  const K = 1 / topR;
  const n = 4000;
  let integral = 0;
  for (let i = 0; i < n; i++) integral += Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), LOOP_SHAPE) / n;
  const S = (2 * Math.PI) / (K * integral);
  const per = 10;
  const steps = Math.ceil(S / (STEP / per) / per) * per;
  const ds = S / steps;
  let th = 0;
  let u = 0;
  let v = 0;
  const out: { u: number; v: number; w: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * ds;
    th += K * Math.pow(Math.sin((Math.PI * s) / S), LOOP_SHAPE) * ds;
    u += Math.cos(th) * ds;
    v += Math.sin(th) * ds;
    if ((i + 1) % per === 0) out.push({ u, v, w: shift * smooth((i + 1) / steps) });
  }
  out[out.length - 1].v = 0;
  return out;
}

function norm(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** The points of Turtle.pitchSpiral (a point every STEP, ahead u and up v from where it starts), and how far it takes the track. */
function spiralPath(from: number, to: number, r0: number, r1: number, exp: number): { pts: { u: number; v: number }[]; ahead: number; up: number } {
  const k = 2000;
  const sweep = to - from;
  let u = 0;
  let v = 0;
  let since = 0;
  const pts: { u: number; v: number }[] = [];
  for (let i = 0; i < k; i++) {
    const p = (i + 0.5) / k;
    const th = from + sweep * p;
    const ds = (r0 + (r1 - r0) * Math.pow(p, exp)) * Math.abs(sweep / k);
    u += Math.cos(th) * ds;
    v += Math.sin(th) * ds;
    since += ds;
    if (since >= STEP || i === k - 1) {
      pts.push({ u, v });
      since = 0;
    }
  }
  return { pts, ahead: u, up: v };
}

/** The building's height the route's laid for: whole storeys, 1 to 12. */
export const routeStoreys = (n: number) => Math.max(1, Math.min(12, Math.round(Number.isFinite(n) ? n : 1)));

/** How high the lift hill's crest is over the deck: 9 m, or higher on a low building, so the drop's straight down for DROP_MIN at least. */
export function crestOf(storeys: number): number {
  const low = -roofDrop(routeStoreys(storeys)) + 7.3;
  const over = spiralPath(0, -Math.PI / 2, DROP_OVER[0], DROP_OVER[1], DROP_OVER[2]);
  const out = spiralPath(-Math.PI / 2, 0, DROP_OUT[0], DROP_OUT[1], DROP_OUT[2]);
  return Math.max(9, low - over.up - out.up + DROP_MIN) + HEART;
}

/** The route for a building `storeys` storeys tall. */
export function coasterRoute(storeys: number): Route {
  const N = routeStoreys(storeys);
  const S = -roofDrop(N);
  const ground = S - (-3.6); // the ground floor's floor (the street is 3.6 below it, see STREET_Y)
  const crest = crestOf(N);
  // The route is the heartline (where the riders' middles are, HEART over the rails): the track's
  // banked round it, so the riders stay put and the rails swing out.
  const low = S + 7.3 + HEART; // the drop's bottom, the U-turn, the loop: the track's underside 5.5 m and more over the road
  const tube = ground + 4.6 + HEART; // the rails in the ground floor's tube 4.6 up, its ceiling 6.8
  const y0 = STATION.trackY + HEART;
  const t = new Turtle({ x: STATION.stopX, y: y0, z: STATION.trackZ }, { x: 1, y: 0, z: 0 });

  // Out of the station on its tires.
  t.line(5.5);
  t.zone('tires', 0, t.u, 2.2);
  // The chain lift: over the north-east corner (above the back office, if a floor's built one out) and up
  // the east side, then along the top to the south-east corner, still on the chain.
  const lift = t.u;
  t.plan([{ line: 10 }, { arc: 6, deg: 90, side: 'R' }, { line: 9.5 }], crest - y0, 7);
  t.mark('crest');
  t.plan([{ line: 14.4 }]);
  // Round the south-east corner over the letters, heading on down the street side.
  const tilt = 2.9; // a little south of west, so the pull-out ends over the plaza's edge
  t.plan([{ arc: 6, deg: 90 - tilt, side: 'R' }, { line: 3.4 }]);
  t.zone('chain', lift, t.u, CHAIN_V);
  // The first drop: over, straight down past the balconies, and out.
  const dropFrom = t.u;
  const D = crest - low;
  const over = spiralPath(0, -Math.PI / 2, DROP_OVER[0], DROP_OVER[1], DROP_OVER[2]);
  const out = spiralPath(-Math.PI / 2, 0, DROP_OUT[0], DROP_OUT[1], DROP_OUT[2]);
  const Ls = Math.max(0, D + over.up + out.up);
  const heading = { x: t.d.x, z: t.d.z };
  t.pitchSpiral(0, -Math.PI / 2, DROP_OVER[0], DROP_OVER[1], DROP_OVER[2], heading);
  const steep = t.u;
  t.line(Ls);
  t.pitchSpiral(-Math.PI / 2, 0, DROP_OUT[0], DROP_OUT[1], DROP_OUT[2], heading);
  t.mark('photo');
  t.zone('trim', steep, t.u, DROP_V, 4.5);
  t.marks.dropFrom = dropFrom;
  // On along the plaza's edge to where the U-turn starts, whatever's left of the run.
  const run = over.ahead + out.ahead;
  const flat = Math.max(0.5, 34.1 - 3.4 - run);
  const trimFrom = t.u - 9;
  t.line(flat);
  t.zone('trim', trimFrom, t.u + 6, TURN_V);
  // The U-turn over the road, and the launch into the loop: long enough that the left turn after the
  // loop comes out heading north on the tube's line.
  t.plan([{ arc: 3.9, deg: 180 - tilt, side: 'L' }]);
  const shape = loopShape();
  const launch = TUBE_X - TURN_IN_R - AFTER_LOOP - shape[shape.length - 1].u - t.p.x;
  const boost = t.u;
  t.line(launch);
  t.zone('boost', boost, t.u, LAUNCH_V);
  t.mark('loop');
  t.loop(shape);
  t.mark('loopEnd');
  const after = t.u;
  t.line(AFTER_LOOP);
  // Left over the sidewalk and the plaza, climbing as it turns, up to the ground floor's south wall.
  t.plan([{ arc: TURN_IN_R, deg: 90, side: 'L' }], tube - low);
  t.zone('trim', after - 6, t.u, 11.5);
  const ramp = t.u;
  t.plan([{ line: t.p.z - WALL_Z_SOUTH }]);
  t.zone('trim', ramp, t.u, 11);
  // The tube under the ground floor's ceiling (from just outside the fins): north past the stairs, left along the desks, right and out.
  const inFrom = t.u - 1.2;
  t.mark('tunnel');
  t.plan([{ line: t.p.z - TUBE_TURN_Z }, { arc: 6, deg: 90, side: 'L' }]);
  t.plan([{ line: t.p.x - TUBE_OUT_X - 4 }]);
  t.zone('trim', t.u - 4, t.u + 2, 8.6);
  t.plan([{ arc: 4, deg: 90, side: 'R' }]);
  t.plan([{ line: t.p.z - (STATION.trackZ + VLIFT_R) }]);
  t.mark('tunnelEnd');
  // (the tube's portal reaches a little way out of the wall, round the start of the climb)
  t.zone('tunnel', inFrom, t.u + 1, 0);
  // Straight up the back of the building, a quarter turn round on the way, and over the top heading east.
  const vFrom = t.u;
  t.zone('trim', vFrom - 3, vFrom + 1, 7.5);
  t.pitch(VLIFT_R, 90);
  const top = Math.max(1.9, t.p.y + 3.9);
  t.twisted(Math.max(0.2, top - OVER_R - t.p.y), -90);
  t.pitch(OVER_R, -90, { x: 1, z: 0 });
  t.zone('chain', vFrom + 1, t.u - 1.5, VLIFT_V);
  t.mark('vlift');
  // Down the brake run and into the station.
  const brakes = t.u;
  const home = STATION.stopX - t.p.x;
  // Down to the station's level over a smooth ramp (longer the further it has to come down, never tighter than 4 m).
  const down = Math.min(home - 3, Math.max(6.6, Math.sqrt((6 * Math.abs(t.p.y - y0)) / 0.25)));
  t.plan([{ line: down }], y0 - t.p.y, 0);
  t.plan([{ line: home - down }]);
  t.zone('brake', brakes + 1.5, t.u - 2.5, 1.6);
  t.zone('stop', t.u - 2.5, t.u, 0);
  // It closes where it started: the last point onto the first.
  const P = t.pts;
  const n = P.length / 3;
  const gap = Math.hypot(P[0] - P[3 * n - 3], P[1] - P[3 * n - 2], P[2] - P[3 * n - 1]);
  if (gap > 0.05) throw new Error(`the coaster's route doesn't close (${gap.toFixed(3)} m off)`);
  P[3 * n - 3] = P[0];
  P[3 * n - 2] = P[1];
  P[3 * n - 1] = P[2];
  return { storeys: N, pts: Float64Array.from(P), u: Float64Array.from(t.us), zones: t.zones, twists: t.twists, marks: t.marks, crest, street: S, ground };
}

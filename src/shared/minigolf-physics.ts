// The black-light mini golf's ball (flrnoh fork, see FORK.md "Black-light mini golf"): a putt rolling
// over felt, up and down slopes, off rails and bumpers, round a loop, off a ramp through the air, into
// tunnels and cups. Pure and deterministic, so the office (server/bowling/minigolf.ts) and every page
// work out the same roll from the same putt: a putt is where from, which way, how hard and when (the
// shared clock the moving obstacles turn by, see `phase`), and that's all that goes over the wire.
//
// Each hole has its own frame (shared/minigolf-holes.ts): x across, z along it, y up from its base;
// the tee near (0, 0) and the cup somewhere up -z. Headings are as the street golf's: 0 is +z, turning
// toward +x, so a heading `a` rolls along (sin a, cos a).

/** The ball's radius (a bit over a real one's 21 mm, to be seen), the cup's, gravity, the step. */
export const BALL_R = 0.026;
export const CUP_R = 0.056;
const G = 9.81;
export const DT = 1 / 240;
/** A rolling solid ball takes 5/7 of gravity along a slope. */
const ROLL = 5 / 7;
/** Felt: a rolling resistance of MU g plus a little drag that grows with the speed. */
const MU = 0.068;
const DRAG = 0.11;
/** A putt at full power leaves the putter this fast (m/s); the least one this fast. */
export const PUTT_MAX = 5.6;
export const PUTT_MIN = 0.18;
/** No roll goes on longer than this (s): what's still moving then stops where it is. */
const MAX_T = 40;

import { sailAngle, slideAt, spinAngle, support, type Course, type HitTag, type Loop, type Pipe, type Rail } from './minigolf-course.js';

// The course's pieces, its clock and its heights are in minigolf-course.ts; everyone imports them from here too.
export * from './minigolf-course.js';

/** Wraps an angle into -π..π. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How fast a putt `power` (0–1) sends the ball off: finer at the soft end, where most putts are. */
export function puttSpeed(power: number): number {
  const p = Math.max(0, Math.min(1, power));
  return PUTT_MIN + (PUTT_MAX - PUTT_MIN) * p ** 1.45;
}

// ---- The ball --------------------------------------------------------------------------------------

export type BallMode = 'roll' | 'air' | 'loop' | 'pipe' | 'cup' | 'out' | 'rest';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: BallMode;
  /** The shared clock (s). */
  t: number;
  /** Round the loop: how far (radians) and how fast (m/s). */
  th: number;
  v: number;
  /** In a pipe: which, and for how much longer (s). */
  pipe: number;
  left: number;
  /** Over which cup's lip it's rolling already (0 the cup, 1 + i pipe i's hole; -1 none): not again until it's off it. */
  lip: number;
  /** How long it's been still on a moving surface, which carries it. */
  still: number;
}

/** Something the ball did, for the sounds and the show. */
export interface BallEvent {
  k: 'hit' | 'kick' | 'cup' | 'lip' | 'land' | 'pipe' | 'outpipe' | 'loop' | 'out' | 'air';
  tag?: HitTag;
  /** How hard (m/s). */
  speed: number;
  x: number;
  y: number;
  z: number;
}

/** A ball lying still at (x, z) on the course. */
export function restingBall(c: Course, x: number, z: number, t: number): Ball {
  const s = support(c, x, z, t, 99);
  return { x, y: s ? s.y : 0, z, vx: 0, vy: 0, vz: 0, mode: 'rest', t, th: 0, v: 0, pipe: -1, left: 0, lip: -1, still: 0 };
}

/** The ball putted from where it lies, heading `dir`, `power` hard, at `t`. */
export function putt(c: Course, at: { x: number; z: number }, dir: number, power: number, t: number): Ball {
  const b = restingBall(c, at.x, at.z, t);
  const v = puttSpeed(power);
  b.vx = Math.sin(dir) * v;
  b.vz = Math.cos(dir) * v;
  b.mode = 'roll';
  return b;
}

/** How fast it may roll over the cup and still drop, `d` from its middle. */
function capture(d: number): number {
  const k = d / CUP_R;
  return 1.45 * (1 - 0.55 * k * k);
}

/** The rails as they are at `t`: each one's ends, and how fast it moves (the bridge's ride along with it). */
function railAt(r: Rail, t: number) {
  const o = slideAt(r.slide, t);
  return { ax: r.a[0] + o.x, az: r.a[1] + o.z, bx: r.b[0] + o.x, bz: r.b[1] + o.z, vx: o.vx, vz: o.vz };
}

const ev = (out: BallEvent[] | undefined, e: BallEvent) => out?.push(e);

/**
 * Off whatever the ball touches at its new place: rails, posts, the spinner and the windmill's sail.
 * Pushes it out and bounces it, against how fast the thing itself moves.
 */
function collide(c: Course, b: Ball, out?: BallEvent[]) {
  const bounce = (nx: number, nz: number, depth: number, wvx: number, wvz: number, e: number, kick: number, tag: HitTag) => {
    b.x += nx * depth;
    b.z += nz * depth;
    const rvx = b.vx - wvx;
    const rvz = b.vz - wvz;
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0) return;
    // Off it as bouncy as it is, a touch of the rail's grip off the speed along it, plus its kick.
    const tx = rvx - vn * nx;
    const tz = rvz - vn * nz;
    const k = -vn * e + kick;
    b.vx = wvx + tx * 0.94 + nx * k;
    b.vz = wvz + tz * 0.94 + nz * k;
    ev(out, { k: kick ? 'kick' : 'hit', tag, speed: -vn, x: b.x, y: b.y, z: b.z });
  };
  const seg = (ax: number, az: number, bx: number, bz: number, w: number, wvx: number, wvz: number, e: number, kick: number, tag: HitTag, spin = 0, cx = 0, cz = 0) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-9;
    const u = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / len2));
    const qx = ax + dx * u;
    const qz = az + dz * u;
    let nx = b.x - qx;
    let nz = b.z - qz;
    const d = Math.hypot(nx, nz);
    const reach = BALL_R + w;
    if (d >= reach) return;
    if (d < 1e-9) {
      nx = -dz;
      nz = dx;
    }
    const n = Math.hypot(nx, nz);
    // Spinning: the point it touched moves round the middle.
    const pvx = wvx + spin * (qz - cz);
    const pvz = wvz - spin * (qx - cx);
    bounce(nx / n, nz / n, reach - d, pvx, pvz, e, kick, tag);
  };
  const y = b.y;
  for (const r of c.rails) {
    if (y + BALL_R < r.y0 || y - BALL_R > r.y1) continue;
    const s = railAt(r, b.t);
    seg(s.ax, s.az, s.bx, s.bz, r.w ?? 0.02, s.vx, s.vz, r.e ?? 0.62, r.kick ?? 0, r.tag ?? 'rail');
  }
  for (const p of c.posts ?? []) {
    if (y + BALL_R < p.y0 || y - BALL_R > p.y1) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    const reach = BALL_R + p.r;
    if (d >= reach || d < 1e-9) continue;
    bounce(dx / d, dz / d, reach - d, 0, 0, p.e ?? 0.6, p.kick ?? 0, p.tag ?? 'rubber');
  }
  for (const s of c.spinners ?? []) {
    if (y + BALL_R < s.y0 || y - BALL_R > s.y1) continue;
    const a = spinAngle(s, b.t);
    const ux = Math.cos(a) * s.len;
    const uz = Math.sin(a) * s.len;
    const w = ((Math.PI * 2) / s.period) * -1;
    seg(s.x - ux, s.z - uz, s.x + ux, s.z + uz, 0.025, 0, 0, 0.55, 0, 'metal', w, s.x, s.z);
  }
  const m = c.windmill;
  if (m && y < 0.2) {
    // The sail at the bottom where it crosses the ball's height: a bar along x, moving along x.
    const yb = y + BALL_R;
    const turn = sailAngle(m, b.t);
    const w = (Math.PI * 2) / m.period;
    for (let i = 0; i < 4; i++) {
      const a = wrapAngle(turn + (i * Math.PI) / 2);
      const cos = Math.cos(a);
      if (cos <= 0) continue;
      const s = (m.hub - yb) / cos;
      if (s > m.len) continue;
      const xc = m.x + s * Math.sin(a);
      const half = m.width / 2 / cos;
      const vx = (w * (m.hub - yb)) / (cos * cos);
      seg(xc - half, m.z, xc + half, m.z, 0.03, Math.max(-6, Math.min(6, vx)), 0, 0.45, 0, 'blade');
    }
  }
}

/** Whether the ball crossed the line a→b between (px, pz) and (x, z), going the way `into` points. */
function crossed(a: readonly [number, number], bb: readonly [number, number], into: number, px: number, pz: number, x: number, z: number): boolean {
  const dx = bb[0] - a[0];
  const dz = bb[1] - a[1];
  const side = (qx: number, qz: number) => (qx - a[0]) * dz - (qz - a[1]) * dx;
  const s0 = side(px, pz);
  const s1 = side(x, z);
  if (s0 === 0 || Math.sign(s0) === Math.sign(s1)) return false;
  const len2 = dx * dx + dz * dz;
  const u = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
  if (u < 0 || u > 1) return false;
  return (x - px) * Math.sin(into) + (z - pz) * Math.cos(into) > 0;
}

/** Down a hole or into a tunnel. */
function enterPipe(b: Ball, i: number, p: Pipe, out?: BallEvent[]) {
  const speed = Math.hypot(b.vx, b.vz);
  ev(out, { k: 'pipe', speed, x: b.x, y: b.y, z: b.z });
  b.mode = 'pipe';
  b.pipe = i;
  b.left = p.time;
  b.v = Math.max(p.min, speed * p.keep);
}

/** One step of DT along the course, with whatever the ball did in it pushed onto `out`. */
export function step(c: Course, b: Ball, out?: BallEvent[]) {
  if (b.mode === 'rest' || b.mode === 'cup' || b.mode === 'out') return;
  const t0 = b.t;
  b.t += DT;
  if (b.mode === 'pipe') return pipeStep(c, b, out);
  if (b.mode === 'loop') return loopStep(c, b, out);
  if (b.mode === 'air') return airStep(c, b, out);
  rollStep(c, b, t0, out);
}

function rollStep(c: Course, b: Ball, t0: number, out?: BallEvent[]) {
  const under = support(c, b.x, b.z, t0, b.y);
  if (!under || b.y - under.y > 0.02) {
    b.mode = 'air';
    ev(out, { k: 'air', speed: Math.hypot(b.vx, b.vz), x: b.x, y: b.y, z: b.z });
    return airStep(c, b, out);
  }
  const plat = slideAt(under.s.slide, t0);
  let rx = b.vx - plat.vx;
  let rz = b.vz - plat.vz;
  // Down the slope, then the felt slowing it.
  const { gx, gz } = under;
  const k = (ROLL * G) / (1 + gx * gx + gz * gz);
  rx -= k * gx * DT;
  rz -= k * gz * DT;
  const sp = Math.hypot(rx, rz);
  const dec = (MU * G + DRAG * sp) * DT;
  if (sp <= dec) {
    rx = 0;
    rz = 0;
  } else {
    rx *= (sp - dec) / sp;
    rz *= (sp - dec) / sp;
  }
  const slopeAcc = k * Math.hypot(gx, gz);
  if (rx === 0 && rz === 0 && slopeAcc <= MU * G * 1.05) {
    if (!under.s.slide) {
      b.vx = b.vz = b.vy = 0;
      b.y = under.y;
      b.mode = 'rest';
      return;
    }
    // On something moving it's carried along; still long enough, it's left lying where it is.
    b.still += DT;
  } else b.still = 0;
  b.vx = rx + plat.vx;
  b.vz = rz + plat.vz;
  const px = b.x;
  const pz = b.z;
  const vy0 = b.vy;
  b.x += b.vx * DT;
  b.z += b.vz * DT;
  collide(c, b, out);
  const next = support(c, b.x, b.z, b.t, b.y + Math.max(0.02, Math.hypot(b.vx, b.vz) * DT * 1.5));
  // Where the felt falls away faster than the ball can follow it (a ramp's lip, the volcano's rim, an edge): off it goes.
  const flying = b.y + vy0 * DT - 0.5 * G * DT * DT;
  if (!next || next.y < flying - 0.004) {
    b.y = flying;
    b.vy = vy0 - G * DT;
    b.mode = 'air';
    ev(out, { k: 'air', speed: Math.hypot(b.vx, b.vz), x: b.x, y: b.y, z: b.z });
    return;
  }
  b.vy = (next.y - b.y) / DT;
  b.y = next.y;
  if (b.still > 1.5) {
    b.mode = 'rest';
    b.vx = b.vz = b.vy = 0;
    return;
  }
  holes(c, b, px, pz, out);
}

/** The cup, holes down to somewhere else, tunnels' mouths and the loop's: whether the ball went in. */
function holes(c: Course, b: Ball, px: number, pz: number, out?: BallEvent[]) {
  const speed = Math.hypot(b.vx, b.vz);
  const cupLike = (x: number, z: number, id: number): 'in' | 'lip' | null => {
    const d = Math.hypot(b.x - x, b.z - z);
    if (d > CUP_R) {
      if (d > CUP_R + BALL_R && b.lip === id) b.lip = -1;
      return null;
    }
    if (d < CUP_R - BALL_R * 0.25 && speed < capture(d)) return 'in';
    if (b.lip === id) return null;
    b.lip = id;
    // Too fast: over the lip, a little off line and slower.
    const turn = Math.max(-0.35, Math.min(0.35, ((b.x - x) * b.vz - (b.z - z) * b.vx) / (CUP_R * Math.max(speed, 0.01)))) * 0.6;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const vx = b.vx * cos + b.vz * sin;
    const vz = -b.vx * sin + b.vz * cos;
    b.vx = vx * 0.86;
    b.vz = vz * 0.86;
    ev(out, { k: 'lip', speed, x: b.x, y: b.y, z: b.z });
    return 'lip';
  };
  if (cupLike(c.cup.x, c.cup.z, 0) === 'in') {
    b.mode = 'cup';
    b.x = c.cup.x;
    b.z = c.cup.z;
    b.y -= 0.06;
    b.vx = b.vy = b.vz = 0;
    ev(out, { k: 'cup', speed, x: b.x, y: b.y, z: b.z });
    return;
  }
  const pipes = c.pipes ?? [];
  for (let i = 0; i < pipes.length; i++) {
    const p = pipes[i];
    if (p.hole && cupLike(p.hole.x, p.hole.z, i + 1) === 'in') return enterPipe(b, i, p, out);
    if (p.mouth && crossed(p.mouth.a, p.mouth.b, p.mouth.into, px, pz, b.x, b.z)) return enterPipe(b, i, p, out);
  }
  const l = c.loop;
  if (l && b.vz < 0 && pz >= l.z && b.z < l.z && Math.abs(b.x - l.x) <= l.w && b.y < 0.05) {
    b.mode = 'loop';
    b.th = 0;
    b.v = -b.vz;
    b.x = l.x;
    b.z = l.z;
    ev(out, { k: 'loop', speed: b.v, x: b.x, y: b.y, z: b.z });
  }
}

function airStep(c: Course, b: Ball, out?: BallEvent[]) {
  const py = b.y;
  b.vy -= G * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
  collide(c, b, out);
  const under = support(c, b.x, b.z, b.t, py);
  if (under && b.y <= under.y) {
    // Down on the felt: off it again if it came down hard, else rolling on.
    const n = Math.hypot(under.gx, 1, under.gz);
    const nx = -under.gx / n;
    const ny = 1 / n;
    const nz = -under.gz / n;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    b.y = under.y;
    if (vn < 0) {
      const e = -vn > 0.9 ? 0.32 : 0;
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      b.vz -= (1 + e) * vn * nz;
      // A thump on landing takes some of the pace.
      b.vx *= 0.9;
      b.vz *= 0.9;
      ev(out, { k: 'land', speed: -vn, x: b.x, y: b.y, z: b.z });
      if (e === 0) {
        b.mode = 'roll';
        b.vy = 0;
      } else b.y += 1e-4;
    } else b.mode = 'roll';
  }
  if (b.y < c.pit || outside(c, b)) goneOut(b, out);
}

const outside = (c: Course, b: Ball) => b.x < c.bounds.minX || b.x > c.bounds.maxX || b.z < c.bounds.minZ || b.z > c.bounds.maxZ;

function goneOut(b: Ball, out?: BallEvent[]) {
  b.mode = 'out';
  b.vx = b.vy = b.vz = 0;
  ev(out, { k: 'out', speed: 0, x: b.x, y: b.y, z: b.z });
}

function pipeStep(c: Course, b: Ball, out?: BallEvent[]) {
  b.left -= DT;
  if (b.left > 0) return;
  const p = c.pipes![b.pipe];
  b.x = p.out.x;
  b.z = p.out.z;
  const s = support(c, b.x, b.z, b.t, 99);
  b.y = s ? s.y : 0;
  b.vx = Math.sin(p.out.dir) * b.v;
  b.vz = Math.cos(p.out.dir) * b.v;
  b.vy = 0;
  b.mode = 'roll';
  b.lip = -1;
  ev(out, { k: 'outpipe', speed: b.v, x: b.x, y: b.y, z: b.z });
}

/** Where on the loop `th` round is (the ball's middle), and which way along it is ahead (a unit vector). */
export function loopPoint(l: Loop, th: number): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
  const r = l.r - BALL_R;
  const lat = l.lat / (Math.PI * 2);
  const tl = Math.hypot(lat, r);
  return {
    x: l.x + lat * th,
    y: BALL_R + r - r * Math.cos(th),
    z: l.z - r * Math.sin(th),
    tx: lat / tl,
    ty: (r * Math.sin(th)) / tl,
    tz: (-r * Math.cos(th)) / tl,
  };
}

function loopStep(c: Course, b: Ball, out?: BallEvent[]) {
  const l = c.loop!;
  const r = l.r - BALL_R;
  const tl = Math.hypot(l.lat / (Math.PI * 2), r);
  // Gravity along the track, the track's grip, and keeping to it (it needs v² ≥ g r over the top).
  const p0 = loopPoint(l, b.th);
  const sgn = Math.sign(b.v) || 1;
  b.v += (-ROLL * G * p0.ty - sgn * (MU * 1.3 * G + DRAG * Math.abs(b.v))) * DT;
  b.th += (b.v / tl) * DT;
  const p = loopPoint(l, b.th);
  const press = (b.v * b.v) / r + G * Math.cos(b.th);
  if (press < 0 && b.th > Math.PI / 2 && b.th < (Math.PI * 3) / 2) {
    // Too slow over the top: it drops off the track.
    b.mode = 'air';
    b.x = p.x;
    b.y = p.y - BALL_R;
    b.z = p.z;
    b.vx = p.tx * b.v;
    b.vy = p.ty * b.v;
    b.vz = p.tz * b.v;
    ev(out, { k: 'air', speed: Math.abs(b.v), x: b.x, y: b.y, z: b.z });
    return;
  }
  if (b.th >= Math.PI * 2) {
    b.mode = 'roll';
    b.x = l.x + l.lat;
    b.y = support(c, b.x, l.z - 0.01, b.t, 99)?.y ?? 0;
    b.z = l.z - 0.01;
    b.vx = 0;
    b.vy = 0;
    b.vz = -b.v;
    ev(out, { k: 'land', speed: b.v * 0.2, x: b.x, y: b.y, z: b.z });
    return;
  }
  if (b.th <= 0) {
    // Not enough to get round: back out the way it came.
    b.mode = 'roll';
    b.x = l.x;
    b.z = l.z + 0.01;
    b.y = support(c, b.x, b.z, b.t, 99)?.y ?? 0;
    b.vx = 0;
    b.vy = 0;
    b.vz = Math.abs(b.v);
    return;
  }
  b.x = p.x;
  b.y = p.y;
  b.z = p.z;
}

/** Whether the ball's done moving: still, in the cup, or gone out. */
export const settled = (b: Ball) => b.mode === 'rest' || b.mode === 'cup' || b.mode === 'out';

/** What a putt came to: where the ball lies (or went in), and how long it took. */
export interface PuttResult {
  x: number;
  z: number;
  holed: boolean;
  out: boolean;
  /** How long it rolled (s). */
  time: number;
}

/** The whole roll of a putt (see putt), to its end: the result, and (when asked for) everything it did on the way. */
export function simulate(c: Course, from: { x: number; z: number }, dir: number, power: number, t: number, events?: BallEvent[]): PuttResult {
  const b = putt(c, from, dir, power, t);
  const steps = Math.ceil(MAX_T / DT);
  for (let i = 0; i < steps && !settled(b); i++) step(c, b, events);
  if (!settled(b)) {
    // Still going after all that (rocking on something moving): it lies where it is, if that's on the felt.
    const s = support(c, b.x, b.z, b.t, b.y + 0.05);
    if (!s || b.mode !== 'roll') b.mode = 'out';
    else b.mode = 'rest';
  }
  const time = b.t - t;
  if (b.mode === 'out') return { x: from.x, z: from.z, holed: false, out: true, time };
  return { x: b.x, z: b.z, holed: b.mode === 'cup', out: false, time };
}

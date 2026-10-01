import { GOAL, PITCH, PITCH_CX, SOCCER_ROOM, type BallHitKind, type BallWire, type GoalSide } from './soccer.js';

// The soccer hall's ball (flrnoh fork, see FORK.md "The soccer hall"): pure physics, the same on the
// server (which decides where the ball is: server/soccer/) and on each page (which runs it ahead from
// the last snapshot, so the ball moves smoothly between them: client/soccer/ball.ts).
//
// A heavy futsal ball: it rolls on the turf (rolling friction and drag, so passes die sensibly), flies
// when it's kicked up (gravity, air drag, a low bounce), comes off the boards (restitution BOARD_E;
// the nets above them stop a high ball too, so it can't leave the pitch), off the posts and the
// crossbar, dies in the net, and never lies dead against the boards. A goal is the ball wholly over
// the goal line, between the posts and under the bar. Both sides step it in SIM_DT steps, so the
// same start and the same kick come out the same on the office and on the kicker's page.
//
// Below the physics: kicks (a pass with the assist: passKick; a shot aimed up or a chip: shotKick) and
// close control (touchBall: taking the ball with a cushioned first touch, dribbling it just ahead of
// you, the trap, tackles and 50/50s, bodies in the way).

/** The ball's radius (a futsal ball's a bit smaller; this one's easy to see). */
export const BALL_R = 0.12;
export const GRAVITY = 9.81;
/**
 * The physics' step (s): the office and every page step the ball in exactly these, so the same
 * start and the same kick come out the same everywhere (the pages' prediction agrees with the office).
 */
export const SIM_DT = 1 / 60;
/**
 * Rolling on the turf: a steady deceleration (m/s²), plus drag (per second) on top. A futsal ball is
 * heavy: a 6 m/s pass rolls about 6 m, a 7 m/s one about 7.6 m, a full shot runs out after ~37 m.
 */
export const ROLL_DECEL = 1.5;
export const ROLL_DRAG = 0.4;
/** Flying: air drag per second. */
export const AIR_DRAG = 0.12;
/** Off the boards, the posts and the bar: what's kept of the speed into them. Along them, a little is lost. */
export const BOARD_E = 0.62;
export const POST_E = 0.55;
export const ALONG_KEEP = 0.85;
/** Into the net: nearly dead. */
export const NET_E = 0.12;
/** Off the floor: a futsal ball barely bounces (dropped from 2 m it comes up ~0.2 m); slower than BOUNCE_MIN it just lands and rolls. */
export const FLOOR_E = 0.32;
export const BOUNCE_MIN = 1.4;
/** What a bounce keeps of the speed along the floor (the turf grabs a heavy ball). */
export const FLOOR_GRIP = 0.85;
/** Slower than this (m/s), a rolling ball has stopped. */
export const STOP = 0.05;
/** A ball lying (or crawling) this close to the boards is nudged back out at UNSTICK_V, so it never sits dead in a corner. */
export const UNSTICK_GAP = 0.18;
export const UNSTICK_V = 1;
/** The longest step taken at once (m): fast balls are stepped finer so they can't pass through a post. */
const MAX_STEP = 0.06;

/** The ball: where (y is the bottom of the ball above the floor: 0 on the ground) and how fast. */
export interface Ball {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
}

export interface BallHit {
  kind: BallHitKind | 'floor';
  /** How fast it was going into it (m/s). */
  speed: number;
}

export const centreBall = (): Ball => ({ x: PITCH_CX, z: (PITCH.minZ + PITCH.maxZ) / 2, y: 0, vx: 0, vz: 0, vy: 0 });

export const ballWire = (b: Ball): BallWire => [r3(b.x), r3(b.z), r3(b.y), r3(b.vx), r3(b.vz), r3(b.vy)];
export const ballFromWire = (w: BallWire): Ball => ({ x: w[0], z: w[1], y: w[2], vx: w[3], vz: w[4], vy: w[5] });
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Whether the ball is at rest on the floor. */
export const still = (b: Ball) => b.y <= 0 && b.vy === 0 && Math.hypot(b.vx, b.vz) < STOP;

/**
 * Moves `b` on by `dt` seconds, in place. Returns the goal it went into (wholly over the line,
 * between the posts, under the bar), if it did during this step; what it hit goes in `hits`.
 */
export function stepBall(b: Ball, dt: number, hits?: BallHit[]): GoalSide | null {
  const speed = Math.hypot(b.vx, b.vz, b.vy);
  const n = Math.min(40, Math.max(1, Math.ceil((speed * dt) / MAX_STEP)));
  const h = dt / n;
  let goal: GoalSide | null = null;
  for (let i = 0; i < n; i++) {
    const was = inGoal(b);
    substep(b, h, hits);
    const now = inGoal(b);
    if (now && !was) goal = now;
  }
  return goal;
}

/** Which goal the ball is in (wholly over the line, between the posts, under the bar), if any. */
export function inGoal(b: Ball): GoalSide | null {
  if (Math.abs(b.x - PITCH_CX) >= GOAL.width / 2 || b.y >= GOAL.height) return null;
  if (b.z + BALL_R < PITCH.minZ) return 'north';
  if (b.z - BALL_R > PITCH.maxZ) return 'south';
  return null;
}

function substep(b: Ball, h: number, hits?: BallHit[]) {
  // Up and down: gravity while it's off the floor (or going up), a dead-ish bounce when it lands.
  if (b.y > 0 || b.vy > 0) {
    b.vy -= GRAVITY * h;
    b.y += b.vy * h;
    if (b.y <= 0) {
      b.y = 0;
      if (b.vy < -BOUNCE_MIN) {
        hits?.push({ kind: 'floor', speed: -b.vy });
        b.vy = -b.vy * FLOOR_E;
        b.vx *= FLOOR_GRIP;
        b.vz *= FLOOR_GRIP;
      } else b.vy = 0;
    }
  }
  // Along the ground: rolling friction and drag on the turf, only drag in the air.
  const s = Math.hypot(b.vx, b.vz);
  if (s > 0) {
    let k: number;
    if (b.y <= 0 && b.vy === 0) {
      const next = Math.max(0, s - ROLL_DECEL * h) * (1 - ROLL_DRAG * h);
      k = next < STOP ? 0 : next / s;
    } else k = 1 - AIR_DRAG * h;
    b.vx *= k;
    b.vz *= k;
  }
  b.x += b.vx * h;
  b.z += b.vz * h;
  collide(b, h, hits);
  unstick(b);
}

/** A ball dead (or crawling) against the boards or in a corner rolls gently back out into the pitch. */
function unstick(b: Ball) {
  if (b.y > 0 || b.vy !== 0 || Math.hypot(b.vx, b.vz) > UNSTICK_V * 0.6) return;
  // Not in a goal's net (a goal's ball goes back to the spot anyway), nor in its mouth.
  if (b.z < PITCH.minZ + BALL_R || b.z > PITCH.maxZ - BALL_R) return;
  const gap = BALL_R + UNSTICK_GAP;
  let nx = 0;
  let nz = 0;
  if (b.x - PITCH.minX < gap) nx += 1;
  if (PITCH.maxX - b.x < gap) nx -= 1;
  const mouth = Math.abs(b.x - PITCH_CX) < GOAL.width / 2 - BALL_R;
  if (!mouth && b.z - PITCH.minZ < gap) nz += 1;
  if (!mouth && PITCH.maxZ - b.z < gap) nz -= 1;
  if (!nx && !nz) return;
  const n = Math.hypot(nx, nz);
  b.vx = (nx / n) * UNSTICK_V;
  b.vz = (nz / n) * UNSTICK_V;
}

/** Steps `b` on by `steps` of SIM_DT (the way the office and the pages both do). */
export function simulate(b: Ball, steps: number, hits?: BallHit[]): GoalSide | null {
  let goal: GoalSide | null = null;
  for (let i = 0; i < steps; i++) goal = stepBall(b, SIM_DT, hits) ?? goal;
  return goal;
}

/** How fast `b` goes into a surface with normal (nx, nz) (positive: into it). */
function bounce(b: Ball, nx: number, nz: number, e: number): number {
  // n points out of the surface, toward the ball.
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= 0) return 0;
  const tx = b.vx - vn * nx;
  const tz = b.vz - vn * nz;
  b.vx = tx * ALONG_KEEP - vn * e * nx;
  b.vz = tz * ALONG_KEEP - vn * e * nz;
  return -vn;
}

function collide(b: Ball, h: number, hits?: BallHit[]) {
  const R = BALL_R;
  const half = GOAL.width / 2;
  const inMouth = Math.abs(b.x - PITCH_CX) < half;
  // In a goal's net (past its line): the net's sides, back and roof hold it.
  for (const side of ['north', 'south'] as const) {
    const line = side === 'north' ? PITCH.minZ : PITCH.maxZ;
    const s = side === 'north' ? -1 : 1;
    const past = (b.z - line) * s;
    if (past <= 0 || !inMouth) continue;
    // The net's folds take the pace off it, so a ball in stays in.
    if (past > R) {
      const k = Math.exp(-4 * h);
      b.vx *= k;
      b.vz *= k;
    }
    if (b.y + 2 * R > GOAL.height) {
      b.y = GOAL.height - 2 * R;
      if (b.vy > 0) b.vy = -b.vy * NET_E;
    }
    if (past + R > GOAL.depth) {
      b.z = line + s * (GOAL.depth - R);
      const v = bounce(b, 0, -s, NET_E);
      if (v) hits?.push({ kind: 'net', speed: v });
    }
    for (const sx of [-1, 1]) {
      if ((b.x - PITCH_CX) * sx + R > half) {
        b.x = PITCH_CX + sx * (half - R);
        const v = bounce(b, -sx, 0, NET_E);
        if (v) hits?.push({ kind: 'net', speed: v });
      }
    }
    return;
  }

  // The posts (upright cylinders on the goal lines, as high as the bar) and the bars (along x, on top).
  const reach = R + GOAL.post;
  for (const line of [PITCH.minZ, PITCH.maxZ]) {
    if (Math.abs(b.z - line) > reach + 0.01) continue;
    for (const px of [PITCH_CX - half, PITCH_CX + half]) {
      if (b.y >= GOAL.height + GOAL.post) continue;
      const ox = b.x - px;
      const oz = b.z - line;
      const d = Math.hypot(ox, oz);
      if (d < reach && d > 1e-6) {
        const nx = ox / d;
        const nz = oz / d;
        b.x = px + nx * reach;
        b.z = line + nz * reach;
        const v = bounce(b, nx, nz, POST_E);
        if (v) hits?.push({ kind: 'post', speed: v });
      }
    }
    // The bar: a cylinder along x at (y = height + post, z = line); the ball's centre is y + R.
    if (Math.abs(b.x - PITCH_CX) < half) {
      const oy = b.y + R - (GOAL.height + GOAL.post);
      const oz = b.z - line;
      const d = Math.hypot(oy, oz);
      if (d < reach && d > 1e-6) {
        const ny = oy / d;
        const nz = oz / d;
        b.z = line + nz * reach;
        b.y = Math.max(0, GOAL.height + GOAL.post + ny * reach - R);
        const vn = b.vz * nz + b.vy * ny;
        if (vn < 0) {
          b.vz -= (1 + POST_E) * vn * nz;
          b.vy -= (1 + POST_E) * vn * ny;
          hits?.push({ kind: 'bar', speed: -vn });
        }
      }
    }
  }

  // The boards (and the nets above them) along the sides.
  if (b.x - R < PITCH.minX) {
    b.x = PITCH.minX + R;
    const v = bounce(b, 1, 0, BOARD_E);
    if (v) hits?.push({ kind: 'board', speed: v });
  } else if (b.x + R > PITCH.maxX) {
    b.x = PITCH.maxX - R;
    const v = bounce(b, -1, 0, BOARD_E);
    if (v) hits?.push({ kind: 'board', speed: v });
  }
  // Between the posts and under the bar's middle the ball goes on toward the net (the posts and the
  // bar themselves were done above); anywhere else on the end lines it's the boards, or the net above them.
  const blocked = !inMouth || b.y + R > GOAL.height + GOAL.post;
  if (blocked && b.z - R < PITCH.minZ) {
    b.z = PITCH.minZ + R;
    const v = bounce(b, 0, 1, BOARD_E);
    if (v) hits?.push({ kind: 'board', speed: v });
  } else if (blocked && b.z + R > PITCH.maxZ) {
    b.z = PITCH.maxZ - R;
    const v = bounce(b, 0, -1, BOARD_E);
    if (v) hits?.push({ kind: 'board', speed: v });
  }
  // The roof of the hall.
  if (b.y + 2 * R > SOCCER_ROOM.height && b.vy > 0) {
    b.y = SOCCER_ROOM.height - 2 * R;
    b.vy = -b.vy * 0.5;
  }
}


// ---- Kicking ------------------------------------------------------------------------------------

/** How close (m, from the player's middle to the ball's) a kick reaches. */
export const KICK_REACH = 1.5;
/** Higher than this (the ball's bottom, m) it's over your head: no kick. */
export const KICK_HIGH = 1.2;
/** A kick's speed along the ground: from the softest pass to a full-power shot (m/s). */
export const KICK_MIN = 4;
export const KICK_MAX = 24;
/** A lob's lift at full loft: up this fast (m/s) at full power (70% of it at none, so even a short lob clears a head); and how much of the speed along the ground that costs. */
export const LOFT_UP = 8;
export const LOFT_COST = 0.45;
/** Aiming up puts the shot up at most this steep (radians). */
export const MAX_LIFT = 0.45;

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const clampLift = (v: number) => (Number.isFinite(v) ? Math.min(MAX_LIFT, Math.max(0, v)) : 0);

/** A kick as it goes over the wire: `power` and `loft` 0..1, `dir` the angle along the floor (sin, cos on x/z), `lift` the shot's rise (0..MAX_LIFT). */
export interface KickSpec {
  power: number;
  dir: number;
  loft: number;
  lift: number;
}

/** What a kick does to the ball: its new velocity. Everything's clamped, so any numbers make a legal kick. */
export function kickVelocity(power: number, dir: number, loft: number, lift = 0): { vx: number; vz: number; vy: number } {
  const p = clamp01(power);
  const l = clamp01(loft);
  const d = Number.isFinite(dir) ? dir : 0;
  const along = (KICK_MIN + (KICK_MAX - KICK_MIN) * p) * (1 - LOFT_COST * l);
  const vy = l * LOFT_UP * (0.7 + 0.3 * p) + along * Math.tan(clampLift(lift));
  return { vx: Math.sin(d) * along, vz: Math.cos(d) * along, vy };
}

/** Kicks `b` (it must be in reach: see canKick). Off the ground a bit when it goes up, so it leaves the floor. */
export function kick(b: Ball, power: number, dir: number, loft: number, lift = 0) {
  const v = kickVelocity(power, dir, loft, lift);
  b.vx = v.vx;
  b.vz = v.vz;
  if (v.vy > 0) {
    b.vy = v.vy;
    b.y = Math.max(b.y, 0.001);
  } else if (b.y <= 0) b.vy = 0;
}

/** Whether someone standing at (px, pz) can kick `b`: in reach (plus `slack`), and not flying over their head. */
export function canKick(b: { x: number; z: number; y: number }, px: number, pz: number, slack = 0): boolean {
  return Math.hypot(b.x - px, b.z - pz) <= KICK_REACH + slack && b.y < KICK_HIGH;
}

// ---- Passing: the assist -------------------------------------------------------------------------

/** A tap passes to the teammate best in line with where you look: within this half-angle (radians)… */
export const PASS_CONE = 0.5;
/** …and between these distances (m). */
export const PASS_NEAR = 1.5;
export const PASS_FAR = 22;
/** A pass arrives at about this speed (m/s): firm enough to get there, soft enough to take. */
export const PASS_ARRIVE = 3;
/** The fastest pass (m/s): harder than that, it's a shot. */
export const PASS_MAX = 15;
/** With nobody in the cone, a tap rolls the ball about this far along your aim (m). */
export const PASS_FREE = 8;
/** A lob to a teammate comes down this much of the way there (then it bounces and rolls on to them). */
const LOB_LAND = 0.85;

/**
 * How far a ball rolling at `v0` goes before it's down to `vEnd` (m), on the turf: the continuous form
 * of the roll in stepBall (dv/dt = -ROLL_DECEL - ROLL_DRAG·v).
 */
export function rollDistance(v0: number, vEnd = 0): number {
  const a = ROLL_DECEL;
  const k = ROLL_DRAG;
  if (v0 <= vEnd) return 0;
  return (v0 - vEnd) / k - (a / (k * k)) * Math.log((v0 + a / k) / (vEnd + a / k));
}

/** How long (s) a ball rolling at `v0` takes to cover `d` m (Infinity when it stops short). */
export function rollTime(v0: number, d: number): number {
  if (d <= 0) return 0;
  if (rollDistance(v0) < d) return Infinity;
  const a = ROLL_DECEL;
  const k = ROLL_DRAG;
  // x(t) = (v0 + a/k)(1 - e^{-kt})/k - (a/k)t, rising until it stops: bisect.
  let lo = 0;
  let hi = Math.log((v0 + a / k) / (a / k)) / k;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    const x = ((v0 + a / k) * (1 - Math.exp(-k * t))) / k - (a / k) * t;
    if (x < d) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}

/** How fast to roll a pass for it to arrive `d` m away at `arrive` m/s (clamped to KICK_MIN..PASS_MAX). */
export function passSpeed(d: number, arrive = PASS_ARRIVE): number {
  let lo = KICK_MIN;
  let hi = PASS_MAX;
  if (rollDistance(lo, arrive) >= d) return lo;
  if (rollDistance(hi, arrive) <= d) return hi;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (rollDistance(m, arrive) < d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Where a kick at `power` with full loft first comes down (m along the floor), and when (s): its flight under gravity and air drag. */
export function lobCarry(power: number): { d: number; t: number } {
  const v = kickVelocity(power, 0, 1);
  let x = 0;
  let y = 0.001;
  let vz = v.vz;
  let vy = v.vy;
  let t = 0;
  const h = 1 / 240;
  while (t < 5) {
    vy -= GRAVITY * h;
    vz *= 1 - AIR_DRAG * h;
    y += vy * h;
    x += vz * h;
    t += h;
    if (y <= 0) break;
  }
  return { d: x, t };
}

/** The power of a lob (full loft) that first comes down `d` m away. */
export function lobPower(d: number): number {
  let lo = 0;
  let hi = 1;
  if (lobCarry(0).d >= d) return 0;
  if (lobCarry(1).d <= d) return 1;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (lobCarry(m).d < d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Someone a pass could go to: where they stand and how fast they're going. */
export interface Mate {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The teammate a tap passes to, from the ball at `from` with the aim `aim` (a kick's angle): the one
 * best in line with it, within PASS_CONE and PASS_NEAR..PASS_FAR (a little nearer weighs against a
 * little more in line). Null when there's nobody there.
 */
export function pickReceiver(from: { x: number; z: number }, aim: number, mates: readonly Mate[]): Mate | null {
  let best: Mate | null = null;
  let bestScore = Infinity;
  for (const m of mates) {
    const dx = m.x - from.x;
    const dz = m.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d < PASS_NEAR || d > PASS_FAR) continue;
    const off = Math.abs(wrap(Math.atan2(dx, dz) - aim));
    if (off > PASS_CONE) continue;
    const score = off / PASS_CONE + d / PASS_FAR;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

const inPitch = (x: number, z: number, m = 0.5) => ({
  x: Math.min(PITCH.maxX - m, Math.max(PITCH.minX + m, x)),
  z: Math.min(PITCH.maxZ - m, Math.max(PITCH.minZ + m, z)),
});

/** The power (0..1) that kicks the ball along at `v` m/s (no loft). */
export const speedPower = (v: number) => clamp01((v - KICK_MIN) / (KICK_MAX - KICK_MIN));

/** A pass: the kick, who it's for, and the spot it's aimed at (the receiver led if they run). */
export interface Pass extends KickSpec {
  to: string | null;
  at: { x: number; z: number };
}

/**
 * A tap's pass from the ball `b` with the aim `aim`: to the teammate in the cone (pickReceiver), led to
 * where they'll be when it gets there and paced to arrive at PASS_ARRIVE; with nobody there, a ground
 * pass about PASS_FREE along the aim. `lob` sends it through the air (full loft) to come down just
 * short of them.
 */
export function passKick(b: { x: number; z: number }, aim: number, mates: readonly Mate[], lob = false): Pass {
  const m = pickReceiver(b, aim, mates);
  if (!m) {
    const at = inPitch(b.x + Math.sin(aim) * PASS_FREE, b.z + Math.cos(aim) * PASS_FREE, 0);
    if (lob) return { power: lobPower(PASS_FREE * LOB_LAND), dir: aim, loft: 1, lift: 0, to: null, at };
    return { power: speedPower(passSpeed(PASS_FREE, 0.5)), dir: aim, loft: 0, lift: 0, to: null, at };
  }
  // Lead them: where they'll be when the ball gets there (a few rounds, as the time depends on the spot).
  let at = { x: m.x, z: m.z };
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(at.x - b.x, at.z - b.z);
    const t = lob ? lobCarry(lobPower(d * LOB_LAND)).t + 0.3 : Math.min(3, rollTime(passSpeed(d), d));
    at = inPitch(m.x + m.vx * t, m.z + m.vz * t);
  }
  const d = Math.hypot(at.x - b.x, at.z - b.z);
  const dir = Math.atan2(at.x - b.x, at.z - b.z);
  if (lob) return { power: lobPower(d * LOB_LAND), dir, loft: 1, lift: 0, to: m.id, at };
  return { power: speedPower(passSpeed(d)), dir, loft: 0, lift: 0, to: m.id, at };
}

/** A held kick's shot has at least this much power; the rest comes from how long it was charged. */
export const SHOT_MIN = 0.3;

/** A shot: `charge` 0..1 (how long it was held), along `aim`, rising at `lift` (how far you look up); or a chip (`lob`: full loft, no lift). */
export function shotKick(aim: number, lift: number, charge: number, lob = false): KickSpec {
  const c = clamp01(charge);
  if (lob) return { power: 0.15 + 0.85 * c, dir: aim, loft: 1, lift: 0 };
  return { power: SHOT_MIN + (1 - SHOT_MIN) * c, dir: aim, loft: 0, lift: clampLift(lift) };
}

// ---- Close control, first touch, tackles --------------------------------------------------------

/** A player's body, as far as the ball's concerned: a cylinder this wide round where they stand, this tall. */
export const PLAYER_R = 0.32;
export const PLAYER_H = 1.8;
/** A ball into someone's body comes off it with this much of its speed. */
export const BLOCK_E = 0.3;
/** Taking the ball: its middle within this of yours (m), low (its bottom under CONTROL_HIGH), and slower (relative to you) than FIRST_TOUCH_MAX. */
export const CONTROL_R = 1.0;
export const CONTROL_HIGH = 0.6;
export const FIRST_TOUCH_MAX = 15;
/** Keeping it: while it stays within this of you. */
export const HOLD_R = 1.8;
/** The first touch keeps this much of the ball's speed relative to you (it's cushioned). */
export const CUSHION = 0.2;
/** Where the ball's kept while you dribble: this far ahead of your feet at a walk, SPRINT_LEAD at a full sprint (the knock-on), TRAP_LEAD standing. */
export const DRIBBLE_LEAD = 0.75;
export const SPRINT_LEAD = 1.35;
export const TRAP_LEAD = 0.55;
/** From JOG (m/s) on you're sprinting, fully at SPRINT (a walk's 4.6, a run's 7.5). */
export const JOG = 5.2;
export const SPRINT = 7.5;
/** Slower than this (m/s) you're standing: the ball's trapped at your feet. */
export const STAND = 0.5;
/** The dribble's spring: how hard the ball's pulled to its spot (per s), and how quickly its speed follows (per s): a slight lag on a turn. */
export const CARRY_K = 5;
export const CARRY_RATE = 12;
/** A tackle: a challenger this much better placed than whoever has it (who counts HOLD_BONUS nearer) takes it; closer than that it pops loose, at POP_V. */
export const TACKLE_EDGE = 0.12;
export const HOLD_BONUS = 0.25;
export const POP_V = 3.5;

/** A player near the ball, as the touches see them. */
export interface Footer {
  id: string;
  team: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Which way they face (an angle like a kick's `dir`). */
  facing: number;
  /** Whether they may take the ball now (not just after their own kick or a 50/50). */
  free: boolean;
}

/** Who has the ball (dribbling it), or nobody. */
export interface Possession {
  id: string | null;
}

export type TouchEvent =
  /** `id` took the ball (a first touch; `from` someone, a tackle). */
  | { kind: 'take'; id: string; from?: string }
  /** A 50/50: the ball popped loose between these two. */
  | { kind: 'loose'; ids: [string, string] }
  /** It came off `id`'s body. */
  | { kind: 'block'; id: string };

/** How well placed `p` is for the ball: lower is better (nearer, and running at it). */
function claim(b: Ball, p: Footer): number {
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  const at = d > 1e-6 ? (p.vx * dx + p.vz * dz) / d : 0;
  return d - 0.3 * Math.min(1, Math.max(0, at / SPRINT));
}

/** Whether `p` may take the ball now (or, `holding` it, keep it). */
export function mayTake(b: Ball, p: Footer, holding = false): boolean {
  if (!p.free || b.y >= CONTROL_HIGH) return false;
  const d = Math.hypot(b.x - p.x, b.z - p.z);
  if (holding) return d < HOLD_R;
  return d < CONTROL_R && Math.hypot(b.vx - p.vx, b.vz - p.vz, b.vy) < FIRST_TOUCH_MAX;
}

/** The first touch: most of the ball's speed relative to `p` taken off, and down onto the floor. */
export function cushion(b: Ball, p: { vx: number; vz: number }) {
  b.vx = p.vx + (b.vx - p.vx) * CUSHION;
  b.vz = p.vz + (b.vz - p.vz) * CUSHION;
  b.vy = Math.min(0, b.vy) * 0.2;
  if (b.y < 0.05) {
    b.y = 0;
    b.vy = 0;
  }
}

/**
 * The players against the ball for one step of `dt`: who takes it (the nearest, the one running at it;
 * the first touch cushions it), who keeps it (dribbling: carry), tackles (a challenger clearly better
 * placed takes it, a close one pops it loose), and bodies in the way (it comes off them). Changes `b`
 * and `poss` in place; what happened goes in `out`. The office runs it every step with everyone who
 * may touch the ball; a page runs it with just you, to dribble without waiting for the office.
 */
export function touchBall(b: Ball, players: readonly Footer[], poss: Possession, dt: number, out?: TouchEvent[]) {
  let holder = poss.id ? players.find((p) => p.id === poss.id) : undefined;
  if (holder && !mayTake(b, holder, true)) holder = undefined;
  if (!holder) poss.id = null;
  // Who else could have it (not the holder's teammates: they don't tackle each other).
  let best: Footer | undefined;
  let bestClaim = Infinity;
  for (const p of players) {
    if (p === holder || (holder && p.team === holder.team) || !mayTake(b, p)) continue;
    const c = claim(b, p);
    if (c < bestClaim) {
      bestClaim = c;
      best = p;
    }
  }
  if (best && !holder) {
    poss.id = best.id;
    holder = best;
    cushion(b, best);
    out?.push({ kind: 'take', id: best.id });
  } else if (best && holder) {
    const held = claim(b, holder) - HOLD_BONUS;
    if (bestClaim < held - TACKLE_EDGE) {
      out?.push({ kind: 'take', id: best.id, from: holder.id });
      poss.id = best.id;
      holder = best;
      cushion(b, best);
    } else if (bestClaim < held + TACKLE_EDGE) {
      // A 50/50: out sideways from between them (on the side the ball's on); neither has it.
      const ax = best.x - holder.x;
      const az = best.z - holder.z;
      const al = Math.hypot(ax, az) || 1;
      let px = -az / al;
      let pz = ax / al;
      if ((b.x - holder.x) * px + (b.z - holder.z) * pz < 0) {
        px = -px;
        pz = -pz;
      }
      b.vx = (holder.vx + best.vx) / 2 + px * POP_V;
      b.vz = (holder.vz + best.vz) / 2 + pz * POP_V;
      b.vy = 1.2;
      b.y = Math.max(b.y, 0.001);
      out?.push({ kind: 'loose', ids: [holder.id, best.id] });
      poss.id = null;
      holder = undefined;
    }
  }
  if (holder) carry(b, holder, dt);
  for (const p of players) {
    if (p !== holder && block(b, p)) out?.push({ kind: 'block', id: p.id });
  }
}

/**
 * Dribbling: the ball's pulled to a spot ahead of `p`'s feet the way they run (DRIBBLE_LEAD; at a sprint
 * further, up to SPRINT_LEAD: the knock-on), following a turn with a little lag; standing, it's trapped
 * just in front of them (TRAP_LEAD, the way they face). The spot stays off the boards.
 */
export function carry(b: Ball, p: Footer, dt: number) {
  const s = Math.hypot(p.vx, p.vz);
  let ux: number;
  let uz: number;
  let lead: number;
  if (s > STAND) {
    ux = p.vx / s;
    uz = p.vz / s;
    lead = DRIBBLE_LEAD + (SPRINT_LEAD - DRIBBLE_LEAD) * Math.min(1, Math.max(0, (s - JOG) / (SPRINT - JOG)));
  } else {
    ux = Math.sin(p.facing);
    uz = Math.cos(p.facing);
    lead = TRAP_LEAD;
  }
  const t = inPitch(p.x + ux * lead, p.z + uz * lead, BALL_R + UNSTICK_GAP + 0.08);
  const wx = p.vx + (t.x - b.x) * CARRY_K;
  const wz = p.vz + (t.z - b.z) * CARRY_K;
  const k = Math.min(1, dt * CARRY_RATE);
  b.vx += (wx - b.vx) * k;
  b.vz += (wz - b.vz) * k;
  if (b.y < 0.05) {
    b.y = 0;
    b.vy = 0;
  }
  // Never inside them.
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const d = Math.hypot(dx, dz);
  const reach = PLAYER_R + BALL_R;
  if (d < reach) {
    const [nx, nz] = d > 1e-6 ? [dx / d, dz / d] : [ux, uz];
    b.x = p.x + nx * reach;
    b.z = p.z + nz * reach;
  }
}

/** A ball into `p`'s body (anyone but whoever dribbles it) comes off it. True when it touched them. */
export function block(b: Ball, p: { x: number; z: number; vx: number; vz: number }): boolean {
  if (b.y > PLAYER_H - 2 * BALL_R) return false;
  const reach = PLAYER_R + BALL_R;
  let ox = b.x - p.x;
  let oz = b.z - p.z;
  let d = Math.hypot(ox, oz);
  if (d >= reach) return false;
  if (d < 1e-6) {
    const s = Math.hypot(p.vx, p.vz);
    [ox, oz, d] = s > 0 ? [p.vx / s, p.vz / s, 1] : [0, 1, 1];
  }
  const nx = ox / d;
  const nz = oz / d;
  b.x = p.x + nx * (reach + 0.005);
  b.z = p.z + nz * (reach + 0.005);
  const rn = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz;
  if (rn < 0) {
    b.vx -= (1 + BLOCK_E) * rn * nx;
    b.vz -= (1 + BLOCK_E) * rn * nz;
  }
  return true;
}

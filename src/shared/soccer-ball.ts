import { GOAL, PITCH, PITCH_CX, SOCCER_ROOM, type BallHitKind, type BallWire, type GoalSide } from './soccer.js';

// The soccer hall's ball (flrnoh fork, see FORK.md "The soccer hall"): pure physics, the same on the
// server (which decides where the ball is: server/soccer/) and on each page (which runs it ahead from
// the last snapshot, so the ball moves smoothly between them: client/soccer/ball.ts).
//
// The ball rolls on the turf (rolling friction and a little drag), flies when it's kicked up
// (gravity, air drag, a dead-ish bounce), comes off the boards (restitution BOARD_E; the nets above
// them stop a high ball too, so it can't leave the pitch), off the posts and the crossbar, and dies
// in the net. A goal is the ball wholly over the goal line, between the posts and under the bar.

/** The ball's radius (a futsal ball's a bit smaller; this one's easy to see). */
export const BALL_R = 0.12;
export const GRAVITY = 9.81;
/** Rolling on the turf: a steady deceleration (m/s²), plus drag (per second) on top. */
export const ROLL_DECEL = 1.1;
export const ROLL_DRAG = 0.3;
/** Flying: air drag per second. */
export const AIR_DRAG = 0.08;
/** Off the boards, the posts and the bar: what's kept of the speed into them. Along them, a little is lost. */
export const BOARD_E = 0.7;
export const POST_E = 0.6;
export const ALONG_KEEP = 0.9;
/** Into the net: nearly dead. */
export const NET_E = 0.15;
/** Off the floor: a futsal ball barely bounces; slower than BOUNCE_MIN it just lands and rolls. */
export const FLOOR_E = 0.45;
export const BOUNCE_MIN = 1.2;
/** Slower than this (m/s), a rolling ball has stopped. */
export const STOP = 0.04;
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

// ---- Kicking and dribbling -----------------------------------------------------------------------

/** How close (m, from the player's middle to the ball's) a kick reaches. */
export const KICK_REACH = 1.3;
/** A kick's speed along the ground: from a tap to a full-power shot (m/s). */
export const KICK_MIN = 5;
export const KICK_MAX = 22;
/** A chip's lift at full loft: up this fast (m/s), at full power; and how much of the speed along the ground that costs. */
export const LOFT_UP = 7.5;
export const LOFT_COST = 0.4;

/** What a kick does to the ball: its new velocity. `power` and `loft` are clamped to 0..1. */
export function kickVelocity(power: number, dir: number, loft: number): { vx: number; vz: number; vy: number } {
  const p = clamp01(power);
  const l = clamp01(loft);
  const along = (KICK_MIN + (KICK_MAX - KICK_MIN) * p) * (1 - LOFT_COST * l);
  return { vx: Math.sin(dir) * along, vz: Math.cos(dir) * along, vy: l * LOFT_UP * (0.5 + 0.5 * p) };
}

/** Kicks `b` (it must be in reach: see canKick). Off the ground a bit, so a chip leaves the floor. */
export function kick(b: Ball, power: number, dir: number, loft: number) {
  const v = kickVelocity(power, dir, loft);
  b.vx = v.vx;
  b.vz = v.vz;
  if (v.vy > 0) {
    b.vy = v.vy;
    b.y = Math.max(b.y, 0.001);
  }
}

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Whether someone standing at (px, pz) can kick `b`: in reach, and not flying over their head. */
export function canKick(b: Ball, px: number, pz: number): boolean {
  return Math.hypot(b.x - px, b.z - pz) <= KICK_REACH && b.y < 1.2;
}

/** A player's body, as far as the ball's concerned: a cylinder this wide round where they stand. */
export const PLAYER_R = 0.32;
/** Running into the ball: it goes on ahead of you a touch faster than you (a soft touch), or comes off you if you stand. */
export const TOUCH_E = 0.15;
export const BLOCK_E = 0.4;

/**
 * A player at (px, pz) running at (pvx, pvz) against `b`: if they overlap, the ball is pushed out
 * of them and on ahead (dribbling), or comes off them if they stand still. True when they touched it.
 */
export function dribble(b: Ball, px: number, pz: number, pvx: number, pvz: number): boolean {
  if (b.y > 0.5) return false;
  const reach = PLAYER_R + BALL_R;
  let ox = b.x - px;
  let oz = b.z - pz;
  let d = Math.hypot(ox, oz);
  if (d >= reach) return false;
  if (d < 1e-6) {
    // Right on top of it: out the way they're going (or anywhere).
    const s = Math.hypot(pvx, pvz);
    [ox, oz, d] = s > 0 ? [pvx / s, pvz / s, 1] : [0, 1, 1];
  }
  const nx = ox / d;
  const nz = oz / d;
  b.x = px + nx * (reach + 0.005);
  b.z = pz + nz * (reach + 0.005);
  const moving = Math.hypot(pvx, pvz) > 0.3;
  const rn = (b.vx - pvx) * nx + (b.vz - pvz) * nz;
  if (rn < 0) {
    const e = moving ? TOUCH_E : BLOCK_E;
    b.vx -= (1 + e) * rn * nx;
    b.vz -= (1 + e) * rn * nz;
  }
  // Running with it, it goes the way you go: a little of your direction goes into it.
  if (moving) {
    b.vx += (pvx * 1.1 - b.vx) * 0.25;
    b.vz += (pvz * 1.1 - b.vz) * 0.25;
  }
  return true;
}

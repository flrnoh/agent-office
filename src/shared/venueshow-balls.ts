// The beach balls over the club crowd (flrnoh fork, see FORK.md "The show"): batted about by the
// crowd's hands, by anyone who hits one. Nothing goes over the wire but a hit (where, how fast,
// when); from there every page and the office fly it the same way, bounce by bounce, each bounce's
// little kick worked out from how many times it's been hit and how many bounces since. Every ten
// minutes on the office's clock a ball nobody's touched is thrown in afresh, so a page coming in
// late needn't fly it all the way from the start of time.

import type { BallHit } from './venueshow.js';

/** The ball's radius, how high the crowd's hands reach, and how floaty it is (its gravity, m/s²). */
export const BALL_R = 0.42;
export const HANDS = 2.15;
export const BALL_G = 5.2;
/** Where the hands are (the club crowd's area), and the box the ball stays in (the floor, short of the bar and the stage). */
export const HANDS_AREA = { minX: -9.0, maxX: 16.0, minZ: -4.6, maxZ: 3.4 } as const;
export const BALL_BOX = { minX: -10.5, maxX: 18.5, minZ: -5.6, maxZ: 3.7 } as const;
/** A ball nobody touched is thrown in again every this often (ms, office clock). */
export const RELAUNCH_MS = 600_000;
/** How fast a hit may send it (m/s): sideways, and up. */
export const HIT_MAX_SIDE = 4.5;
export const HIT_UP = [2.5, 8.5] as const;
/** How far from a ball (m, sideways) you can reach it to hit it; how high above your feet. */
export const HIT_REACH = 2.6;
export const HIT_HEIGHT = 3.4;

/** A stretch of flight between two bounces. */
export interface Flight {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** When it began (office clock, ms). */
  t0: number;
  /** Bounces since the hit, and the hit's count (BallHit.n): the kicks go by both. */
  k: number;
  n: number;
  /** Lying on the floor, waiting for someone to hit it. */
  rest: boolean;
}

/** A number 0..1 from three integers, the same everywhere. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Folds a coordinate back into [lo, hi] as if it bounced off both ends. */
export function fold(v: number, lo: number, hi: number): number {
  const L = hi - lo;
  let u = (v - lo) % (2 * L);
  if (u < 0) u += 2 * L;
  return lo + (u <= L ? u : 2 * L - u);
}
/** The sign a velocity has after folding (it flips with each wall it met). */
function foldSign(v: number, lo: number, hi: number): number {
  const L = hi - lo;
  let u = (v - lo) % (2 * L);
  if (u < 0) u += 2 * L;
  return u <= L ? 1 : -1;
}

const inHands = (x: number, z: number) => x >= HANDS_AREA.minX && x <= HANDS_AREA.maxX && z >= HANDS_AREA.minZ && z <= HANDS_AREA.maxZ;

/** The fresh throw-in of ball `i` at `at` (a RELAUNCH_MS boundary). */
export function launch(i: number, at: number): BallHit {
  const n = Math.floor(at / RELAUNCH_MS) * 7 + i;
  const x = HANDS_AREA.minX + 3 + (HANDS_AREA.maxX - HANDS_AREA.minX - 6) * ((i + 0.5) / 3);
  return { x, y: HANDS + 0.4, z: -1.2 + (i - 1) * 1.4, vx: (hash(n, 1, 2) - 0.5) * 2, vy: 5.5, vz: (hash(n, 3, 4) - 0.5) * 2, at, n };
}

/** The hit a ball flies from at `now`: its last real one, unless a throw-in has come since. */
export function effectiveHit(i: number, hit: BallHit | undefined, now: number): BallHit {
  const boundary = Math.floor(now / RELAUNCH_MS) * RELAUNCH_MS;
  return hit && hit.at >= boundary ? hit : launch(i, boundary);
}

export const flightOf = (h: BallHit): Flight => ({ x: h.x, y: h.y, z: h.z, vx: h.vx, vy: h.vy, vz: h.vz, t0: h.at, k: 0, n: h.n, rest: false });

/** How long `f` flies until it comes down to `level` (s), or NaN if it never does. */
function fall(f: Flight, level: number): number {
  const disc = f.vy * f.vy + 2 * BALL_G * (f.y - level);
  return disc < 0 ? NaN : (f.vy + Math.sqrt(disc)) / BALL_G;
}

/** Where `f` is `s` seconds in (no bounce). */
function along(f: Flight, s: number) {
  const x = f.x + f.vx * s;
  const z = f.z + f.vz * s;
  return {
    x: fold(x, BALL_BOX.minX, BALL_BOX.maxX),
    z: fold(z, BALL_BOX.minZ, BALL_BOX.maxZ),
    y: f.y + f.vy * s - (BALL_G * s * s) / 2,
    vx: f.vx * foldSign(x, BALL_BOX.minX, BALL_BOX.maxX),
    vz: f.vz * foldSign(z, BALL_BOX.minZ, BALL_BOX.maxZ),
    vy: f.vy - BALL_G * s,
  };
}

/** How long `f` lasts (s; Infinity at rest), and the flight after it. */
export function nextFlight(f: Flight): { len: number; next: Flight } {
  if (f.rest) return { len: Infinity, next: f };
  // Onto the crowd's hands, if it comes down over them: up it goes again, with a little kick toward the middle.
  const th = fall(f, HANDS);
  if (Number.isFinite(th) && th > 0.01) {
    const p = along(f, th);
    if (inHands(p.x, p.z)) {
      const r1 = hash(f.n, f.k, 11);
      const r2 = hash(f.n, f.k, 23);
      const r3 = hash(f.n, f.k, 37);
      const cx = (HANDS_AREA.minX + HANDS_AREA.maxX) / 2;
      const cz = (HANDS_AREA.minZ + HANDS_AREA.maxZ) / 2;
      const vx = p.vx * 0.35 + (r1 - 0.5) * 2.4 + (cx - p.x) * 0.05;
      const vz = p.vz * 0.3 + (r2 - 0.5) * 1.3 + (cz - p.z) * 0.22;
      return { len: th, next: { x: p.x, y: HANDS, z: p.z, vx, vy: 4.4 + r3 * 1.8, vz, t0: f.t0 + th * 1000, k: f.k + 1, n: f.n, rest: false } };
    }
  }
  // Over a walkway (or under the hands already): down onto the floor, bouncing lower each time, then still.
  const tf = fall(f, BALL_R);
  const s = Number.isFinite(tf) && tf > 0 ? tf : 0;
  const p = along(f, s);
  const up = -p.vy * 0.5;
  const rest = up < 1.1;
  return { len: s, next: { x: p.x, y: BALL_R, z: p.z, vx: rest ? 0 : p.vx * 0.6, vy: rest ? 0 : up, vz: rest ? 0 : p.vz * 0.6, t0: f.t0 + s * 1000, k: f.k + 1, n: f.n, rest } };
}

/** Where a flight is at `now` (office clock, ms), and how fast it goes. */
export function flightPos(f: Flight, now: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  if (f.rest) return { x: f.x, y: f.y, z: f.z, vx: 0, vy: 0, vz: 0 };
  return along(f, Math.max(0, (now - f.t0) / 1000));
}

/** Most bounces worked through in one go (a ball left alone ten minutes takes a few hundred). */
const MAX_STEPS = 2000;

/** Brings a flight up to `now`: the bounce it's in then. */
export function advance(f: Flight, now: number): Flight {
  for (let i = 0; i < MAX_STEPS; i++) {
    if (f.rest) return f;
    const { len, next } = nextFlight(f);
    if (f.t0 + len * 1000 > now) return f;
    f = next;
  }
  return { ...f, rest: true };
}

/** Where ball `i` is at `now`, from its last hit (pure: the office checks a hit against it). */
export function ballAt(i: number, hit: BallHit | undefined, now: number) {
  const f = advance(flightOf(effectiveHit(i, hit, now)), now);
  return flightPos(f, now);
}

/**
 * A hit on ball `i` by someone standing at (px, py, pz), sending it off with (vx, vy, vz): the office
 * takes where the ball is from its own reckoning, and the speed within limits. Null when it's out of reach.
 */
export function hitBall(i: number, last: BallHit | undefined, now: number, by: { x: number; y: number; z: number }, v: { vx: number; vy: number; vz: number }): BallHit | null {
  const p = ballAt(i, last, now);
  if (Math.hypot(p.x - by.x, p.z - by.z) > HIT_REACH || p.y - by.y > HIT_HEIGHT || p.y < by.y - 0.5) return null;
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  let vx = num(v.vx);
  let vz = num(v.vz);
  const side = Math.hypot(vx, vz);
  if (side > HIT_MAX_SIDE) {
    vx *= HIT_MAX_SIDE / side;
    vz *= HIT_MAX_SIDE / side;
  }
  const vy = Math.min(HIT_UP[1], Math.max(HIT_UP[0], num(v.vy)));
  const n = (effectiveHit(i, last, now).n + 1) % 1_000_000_007;
  return { x: p.x, y: Math.max(p.y, BALL_R), z: p.z, vx, vy, vz, at: now, n };
}

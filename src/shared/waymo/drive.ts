import { mayPass } from '../traffic-lights.js';
import { pathPoint, type Path } from './roads.js';

// flrnoh fork (see FORK.md "Waymo"): driving a robotaxi's path ahead of time. The office works out,
// the moment it sets one off, where it'll be every quarter second until it gets there: up to speed,
// slowing for the corners, stopping at red lights, and stopping short of anything in its way (a bus,
// another robotaxi) where that'll be at the time. The others don't wait for it (the buses keep their
// timetable, the robotaxis already on their way theirs), so if one would run into it anyway (a bus
// from behind at a red light), the drive fails and the office tries another (later, or another way).
// Every page plays the plan back the same, off the office's clock.

/** A robotaxi: long and wide (m), its nose +x. */
export const CAR_L = 4.7;
export const CAR_W = 2.0;
/** How fast it goes, round a corner, how hard it speeds up and brakes (m/s, m/s²): smooth, like the real one. */
const CRUISE = 11;
const CORNER_V = 4.5;
const ACCEL = 1.6;
const BRAKE = 2.2;
/** How far behind something it stops (m), how much room it keeps round itself, how far ahead it looks. */
const GAP = 2;
const SPARE = 0.3;
const LOOK = 30;
/** The step it's worked out in, and how often where it is gets kept (s). */
const STEP = 0.05;
export const SAMPLE = 0.25;
/** Longer than this (s) and it isn't a drive. */
const LONGEST = 900;

/** Something on the road: where its middle is, which way it faces (unit vector), how long and wide it is. */
export interface Body {
  x: number;
  z: number;
  fx: number;
  fz: number;
  l: number;
  w: number;
}

/** A drive worked out: where along its path it is every SAMPLE s from `t0`, its last one where it stops. */
export interface Drive {
  path: Path;
  t0: number;
  s: number[];
}

/** Four corners of `b`, `spare` m bigger all round. */
export function corners(b: Body, spare = 0): number[] {
  const l = b.l / 2 + spare;
  const w = b.w / 2 + spare;
  const out: number[] = [];
  for (const [a, c] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ])
    out.push(b.x + b.fx * a * l - b.fz * c * w, b.z + b.fz * a * l + b.fx * c * w);
  return out;
}

/** Whether two outlines overlap: no edge of either separates them. */
export function overlaps(p: number[], q: number[]): boolean {
  for (const P of [p, q]) {
    for (let i = 0; i < 4; i++) {
      const nx = P[((i + 1) % 4) * 2 + 1] - P[i * 2 + 1];
      const nz = P[i * 2] - P[((i + 1) % 4) * 2];
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
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

/** The robotaxi at `s` along `path`. */
export function bodyAt(path: Path, s: number): Body {
  const p = pathPoint(path, s);
  return { x: p.x, z: p.z, fx: Math.cos(p.yaw), fz: -Math.sin(p.yaw), l: CAR_L, w: CAR_W };
}

/**
 * Drives `path` from `t0` (s on the office's clock) at `v0` m/s: where it is every SAMPLE s till it
 * stops at the end, or where and when something ran into it (`others(t)`: what else is on the road
 * then). `hold`: it waits at the start till then (pulling away from a stop).
 */
export function drivePath(path: Path, t0: number, others: (t: number) => readonly Body[], v0 = 0, hold = t0): { drive: Drive } | { crash: { t: number; x: number; z: number } } {
  let s = 0;
  let v = v0;
  const out: number[] = [0];
  const steps = Math.round(SAMPLE / STEP);
  for (let i = 1; i * STEP < LONGEST; i++) {
    const t = t0 + i * STEP;
    let limit = t < hold ? 0 : path.length - s;
    for (const g of path.gates) {
      // From its nose (s is its middle).
      const ahead = g.s - (s + CAR_L / 2);
      if (ahead < -0.01 || ahead > 60) continue;
      const turning = g.axis !== g.exit;
      if (!mayPass(g.l, g.axis, t, ahead, v, BRAKE * 2, turning ? g.exit : undefined)) limit = Math.min(limit, ahead);
    }
    const now = others(t);
    // Anything in its way, where it is now: stop short of it.
    const look = Math.min(LOOK, Math.max(0, limit) + GAP + 1);
    if (look > 0) {
      const here = pathPoint(path, s);
      const near = now.filter((o) => Math.abs(o.x - here.x) < LOOK + 12 && Math.abs(o.z - here.z) < LOOK + 12);
      if (near.length) {
        const theirs = near.map((o) => corners(o, SPARE));
        for (let d = 0.5; d <= look; d += 1) {
          const mine = corners(bodyAt(path, Math.min(path.length, s + d)), SPARE);
          if (theirs.some((q) => overlaps(mine, q))) {
            limit = Math.min(limit, d - GAP);
            break;
          }
        }
      }
    }
    let want = Math.min(CRUISE, Math.sqrt(2 * BRAKE * Math.max(0, limit)));
    for (const [a, b] of path.corners) {
      if (s + CAR_L / 2 >= a && s - CAR_L / 2 <= b) want = Math.min(want, CORNER_V);
      else if (a > s && a - s < 60) want = Math.min(want, Math.sqrt(CORNER_V * CORNER_V + 2 * BRAKE * (a - s - CAR_L / 2)));
    }
    v = limit <= 0 ? 0 : Math.min(want, v + ACCEL * STEP);
    s = Math.min(path.length, s + Math.min(v * STEP, Math.max(0, limit)));
    // Run into?
    const me = corners(bodyAt(path, s));
    for (const o of now) {
      if (Math.abs(o.x - me[0]) > 12 || Math.abs(o.z - me[1]) > 12) continue;
      if (overlaps(me, corners(o))) {
        const p = pathPoint(path, s);
        return { crash: { t, x: p.x, z: p.z } };
      }
    }
    if (i % steps === 0) out.push(Math.round(s * 100) / 100);
    if (s >= path.length - 1e-6 && v === 0 && t >= hold) {
      if (i % steps !== 0) out.push(Math.round(s * 100) / 100);
      return { drive: { path, t0, s: out } };
    }
  }
  const p = pathPoint(path, s);
  return { crash: { t: t0 + LONGEST, x: p.x, z: p.z } };
}

/** Where a drive has it at `t`: along its path, how fast, and whether it's there (stopped at the end). */
export function driveAt(d: Drive, t: number): { s: number; speed: number; done: boolean } {
  const k = (t - d.t0) / SAMPLE;
  const n = d.s.length;
  if (k <= 0) return { s: d.s[0], speed: 0, done: false };
  if (k >= n - 1) return { s: d.s[n - 1], speed: 0, done: true };
  const i = Math.floor(k);
  const s = d.s[i] + (d.s[i + 1] - d.s[i]) * (k - i);
  return { s, speed: (d.s[i + 1] - d.s[i]) / SAMPLE, done: false };
}

/** When a drive gets there (s on the office's clock). */
export const driveEnd = (d: Drive) => d.t0 + (d.s.length - 1) * SAMPLE;

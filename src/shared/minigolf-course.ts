// The black-light mini golf's course pieces (flrnoh fork, see FORK.md "Black-light mini golf"): what a
// hole is made of (felt at its heights, rails, posts, the moving things), the shared clock they move
// by, and the felt's height under a point. The ball that rolls over them is minigolf-physics.ts's.

/** How far over a surface the ball may be and still count as on it (a step down this far is rolled over). */
const STICK = 0.012;

// ---- The course's pieces ---------------------------------------------------------------------------

/** A height over a surface: flat, a tilted plane, or a profile round a point (the volcano, a funnel). */
export type Height =
  | { k: 'flat'; y: number }
  | { k: 'plane'; y: number; x0: number; z0: number; gx: number; gz: number }
  /** `prof`: [r, y] points, r rising; linear between, flat beyond the last. */
  | { k: 'radial'; cx: number; cz: number; prof: readonly (readonly [number, number])[] };

/** Something that moves to and fro on the shared clock: `amp` (x, z) either way, once every `period` s. */
export interface Slide {
  ax: number;
  az: number;
  period: number;
  phase?: number;
}

/** A piece of felt the ball rolls on: a polygon (x, z) and its height. `slide`: it moves (the bridge). */
export interface Surface {
  id: string;
  poly: readonly (readonly [number, number])[];
  h: Height;
  slide?: Slide;
}

/** A rail: a thick line from a to b, between heights y0 and y1. `kick`: it pushes back that much harder (m/s). */
export interface Rail {
  a: readonly [number, number];
  b: readonly [number, number];
  y0: number;
  y1: number;
  /** How bouncy (0–1). */
  e?: number;
  kick?: number;
  /** Half its thickness. */
  w?: number;
  slide?: Slide;
  /** What it sounds like when the ball hits it. */
  tag?: HitTag;
}

/** A round post or bumper. */
export interface Post {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  e?: number;
  kick?: number;
  tag?: HitTag;
}

/** A bar spinning round its middle (the pinball's spinner): `len` either side, a turn every `period` s (negative: the other way). */
export interface Spinner {
  x: number;
  z: number;
  len: number;
  y0: number;
  y1: number;
  period: number;
}

/**
 * A windmill: its sails turn across the front of its house, in the plane z = `z` (a turn every
 * `period` s), and the one at the bottom blocks the doorway under them as it goes by.
 */
export interface Windmill {
  x: number;
  z: number;
  /** The hub's height, the sails' length from it, how wide each sail is. */
  hub: number;
  len: number;
  width: number;
  period: number;
}

/**
 * Into a tunnel or a hole and out somewhere else: through a mouth (a line from a to b, crossed going
 * the way `into` points, a heading) or down a hole (x, z, at a cup's speed), out at (x, z) heading
 * `dir`, keeping `keep` of its speed (at least `min`), after `time` s in the dark.
 */
export interface Pipe {
  mouth?: { a: readonly [number, number]; b: readonly [number, number]; into: number };
  hole?: { x: number; z: number };
  out: { x: number; z: number; dir: number };
  keep: number;
  min: number;
  time: number;
}

/** A loop the loop: in at (x, z) going -z, round a circle of radius r standing on the lane, out `lat` further across. */
export interface Loop {
  x: number;
  z: number;
  r: number;
  lat: number;
  /** How wide its mouth is either side. */
  w: number;
}

/** What the ball hit, for the sound. */
export type HitTag = 'rail' | 'wood' | 'bumper' | 'rubber' | 'blade' | 'metal' | 'stone';

/** One hole's course, in its own frame. */
export interface Course {
  surfaces: readonly Surface[];
  rails: readonly Rail[];
  posts?: readonly Post[];
  spinners?: readonly Spinner[];
  windmill?: Windmill;
  pipes?: readonly Pipe[];
  loop?: Loop;
  cup: { x: number; z: number };
  /** Below this the ball's gone (into a pit, off the course): back to where it was putted from. */
  pit: number;
  /** The ball's out beyond these too. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// ---- The shared clock ----------------------------------------------------------------------------

/** How far round its cycle something with this `period` is at `t` (shared clock, s): 0–1. */
export function phase(t: number, period: number, offset = 0): number {
  const p = t / period + offset;
  return p - Math.floor(p);
}

/** Where a slide is at `t`, and how fast it goes. */
export function slideAt(s: Slide | undefined, t: number): { x: number; z: number; vx: number; vz: number } {
  if (!s) return { x: 0, z: 0, vx: 0, vz: 0 };
  const a = phase(t, s.period, s.phase) * Math.PI * 2;
  const k = Math.sin(a);
  const w = (Math.cos(a) * Math.PI * 2) / s.period;
  return { x: s.ax * k, z: s.az * k, vx: s.ax * w, vz: s.az * w };
}

/** The windmill's sails' turn at `t` (radians, 0 with one straight down). */
export function sailAngle(w: Windmill, t: number): number {
  return phase(t, w.period) * Math.PI * 2;
}

/** The spinner's turn at `t`. */
export function spinAngle(s: Spinner, t: number): number {
  return phase(t, Math.abs(s.period)) * Math.PI * 2 * Math.sign(s.period);
}

// ---- Heights ---------------------------------------------------------------------------------------

/** The height of `h` at (x, z) and its slope (dy/dx, dy/dz). */
export function heightAt(h: Height, x: number, z: number): [number, number, number] {
  if (h.k === 'flat') return [h.y, 0, 0];
  if (h.k === 'plane') return [h.y + h.gx * (x - h.x0) + h.gz * (z - h.z0), h.gx, h.gz];
  const dx = x - h.cx;
  const dz = z - h.cz;
  const r = Math.hypot(dx, dz);
  const p = h.prof;
  if (r <= p[0][0]) return [p[0][1], 0, 0];
  for (let i = 1; i < p.length; i++) {
    if (r <= p[i][0]) {
      const k = (p[i][1] - p[i - 1][1]) / (p[i][0] - p[i - 1][0]);
      return [p[i - 1][1] + k * (r - p[i - 1][0]), (k * dx) / r, (k * dz) / r];
    }
  }
  return [p[p.length - 1][1], 0, 0];
}

/** Whether (x, z) is inside the polygon. */
export function inPoly(poly: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The felt under (x, z) at `t`: the highest surface there no higher than `top`, and its height and slope there. */
export function support(c: Course, x: number, z: number, t: number, top: number): { s: Surface; y: number; gx: number; gz: number } | null {
  let best: { s: Surface; y: number; gx: number; gz: number } | null = null;
  for (const s of c.surfaces) {
    const o = slideAt(s.slide, t);
    const lx = x - o.x;
    const lz = z - o.z;
    if (!inPoly(s.poly, lx, lz)) continue;
    const [y, gx, gz] = heightAt(s.h, lx, lz);
    if (y > top + STICK || (best && y <= best.y)) continue;
    best = { s, y, gx, gz };
  }
  return best;
}


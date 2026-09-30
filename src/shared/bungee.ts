// Bungee off the roof (flrnoh fork, see FORK.md): a jetty sticks out over the street-side edge of the
// rooftop bar, and from the platform at its end you jump. Where it stands, the wire types, and the jump
// itself: one motion function of (drop, time since the jump started), the same on the server and in
// every browser, so everyone on the roof sees the jumper fall and bounce on the same curve.

import { FLOOR, WALL_T } from './layout.js';

/**
 * The jetty: `halfWidth` either side of x, from `startZ` on the deck out past the south edge of the
 * roof (the facade is at FLOOR.maxZ + WALL_T) to the open front edge `edgeZ`, `deckY` up. The rope's
 * anchor hangs off an arm `anchorOut` past the front edge, `anchorY` over the deck, so the jumper
 * falls well clear of the facade. You stand at `standZ` to jump. Down on the street that's between
 * the plaza's trees in front of the building (world/city.ts: x 6 and 16), clear of both.
 */
export const BUNGEE = {
  x: 11,
  halfWidth: 0.75,
  startZ: 10.4,
  edgeZ: FLOOR.maxZ + WALL_T + 3.4,
  deckY: 0.12,
  anchorY: 3.4,
  anchorOut: 1.1,
  /** Where the platform (hazard edge, gantry) begins. */
  platformZ: FLOOR.maxZ + WALL_T + 1.6,
  standZ: FLOOR.maxZ + WALL_T + 3.4 - 0.35,
} as const;

/** The rope's anchor, in the roof's frame. */
export const ANCHOR = { x: BUNGEE.x, y: BUNGEE.deckY + BUNGEE.anchorY, z: BUNGEE.edgeZ + BUNGEE.anchorOut } as const;

/** 3, 2, 1… before the jump. */
export const COUNTDOWN = 3;
/** How far the head hangs below the ankles, upside down. */
export const BODY = 1.75;
/** The head never comes closer to the street than this. */
export const MARGIN = 2.2;
/** Between one person's jumps (ms), after the last one's over. */
export const COOLDOWN_MS = 5000;
const G = 9.81;
/** The rope's damping ratio while it's taut. */
const ZETA = 0.25;
/** Air: a little drag at speed. */
const DRAG = 0.0035;
/** The simulation's step (s). */
const H = 1 / 240;

/** The rope as everyone on the roof sees it. `startedAt` is on the office's clock (ms). */
export interface BungeeState {
  jumper: string | null;
  name: string;
  color: string;
  startedAt: number;
  /** How far below the roof the street was when they jumped (m). */
  drop: number;
  /** Jumps since midnight (the office's clock). */
  today: number;
}

export const NO_BUNGEE: BungeeState = { jumper: null, name: '', color: '', startedAt: 0, drop: 0, today: 0 };

export type BungeePhase = 'count' | 'fall' | 'hang' | 'winch' | 'climb' | 'done';

export interface BungeePose {
  /** The ankles, where the rope's tied (the body's root: the feet). */
  x: number;
  y: number;
  z: number;
  /**
   * How far the body has tipped forward (about x, radians): 0 standing, π hanging head down, 2π
   * standing again (after climbing back over onto the platform).
   */
  pitch: number;
  phase: BungeePhase;
  /** The rope is stretched (pulling). */
  taut: boolean;
  /** How fast the ankles are going down (m/s; negative going up). */
  speed: number;
}

export interface BungeePlan {
  drop: number;
  /** The rope's free length (m of fall before it pulls). */
  length: number;
  /** How far the ankles may go (m below the deck): the head's MARGIN over the street. */
  lowest: number;
  /** Spring (per kg) and damping (per kg) while taut. */
  k: number;
  c: number;
  /** Phase ends, seconds after startedAt. */
  jump: number;
  hang: number;
  winch: number;
  climb: number;
  end: number;
  /** The fall: the ankles' distance below the deck and speed, every H seconds from `jump` to `winch`. */
  s: Float64Array;
  v: Float64Array;
}

/** a..b, eased in and out. */
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Falls with spring `k` for `secs`: every step's distance and speed. */
function fall(length: number, k: number, c: number, secs: number): { s: Float64Array; v: Float64Array } {
  const n = Math.ceil(secs / H) + 2;
  const s = new Float64Array(n);
  const v = new Float64Array(n);
  let x = 0;
  let u = 0;
  for (let i = 1; i < n; i++) {
    const a = G - DRAG * u * Math.abs(u) - (x > length ? k * (x - length) + c * u : 0);
    u += a * H;
    x += u * H;
    s[i] = x;
    v[i] = u;
  }
  return { s, v };
}

/** The deepest the ankles go with spring `k` (the first time down). */
function deepest(length: number, k: number): { at: number; t: number } {
  const c = 2 * ZETA * Math.sqrt(k);
  let x = 0;
  let u = 0;
  for (let i = 1; i < 60 / H; i++) {
    const a = G - DRAG * u * Math.abs(u) - (x > length ? k * (x - length) + c * u : 0);
    u += a * H;
    x += u * H;
    if (u < 0) return { at: x, t: i * H };
  }
  return { at: x, t: 60 };
}

const plans = new Map<number, BungeePlan>();

/** The jump for a building `drop` meters tall (roof to street), worked out once and kept. */
export function bungeePlan(drop: number): BungeePlan {
  drop = Math.round(clamp(Number.isFinite(drop) ? drop : 10, 6, 400) * 100) / 100;
  const kept = plans.get(drop);
  if (kept) return kept;
  const lowest = drop - BUNGEE.deckY - BODY - MARGIN;
  const length = 0.72 * lowest;
  // The stiffest rope that doesn't go deeper than `lowest` (damping and air taken into account).
  let lo = 0.01;
  let hi = 200;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (deepest(length, mid).at > lowest) lo = mid;
    else hi = mid;
  }
  const k = hi;
  const c = 2 * ZETA * Math.sqrt(k);
  const first = deepest(length, k).t;
  // A few bounces (longer ones the higher it is), a moment hanging, then the winch.
  const bounce = clamp(first * 2.6, 4.5, 8.5);
  const jump = COUNTDOWN;
  const hang = jump + bounce;
  const winch = hang + 1.2;
  const { s, v } = fall(length, k, c, winch - jump);
  const hanging = s[s.length - 1];
  const climb = winch + clamp(hanging / 9, 2.5, 4.5);
  const end = climb + 1.3;
  const plan: BungeePlan = { drop, length, lowest, k, c, jump, hang, winch, climb, end, s, v };
  if (plans.size > 32) plans.clear();
  plans.set(drop, plan);
  return plan;
}

/** How long a jump from `drop` takes, countdown to back on the platform (s). */
export function bungeeDuration(drop: number): number {
  return bungeePlan(drop).end;
}

/** The fall at `t` seconds after leaving the platform: distance below the deck and speed. */
function fallAt(p: BungeePlan, t: number): { s: number; v: number } {
  const f = clamp(t / H, 0, p.s.length - 1.001);
  const i = Math.floor(f);
  const u = f - i;
  return { s: p.s[i] + (p.s[i + 1] - p.s[i]) * u, v: p.v[i] + (p.v[i + 1] - p.v[i]) * u };
}

/** Where the ankles are out from the anchor (z) while falling: a leap out, then a dying sway under it. */
function swayZ(t: number): number {
  const start = BUNGEE.standZ - ANCHOR.z;
  return start * Math.cos((Math.PI / 1.5) * t) * Math.exp(-t / 3);
}

/** The jumper `t` seconds after `startedAt`, from a roof `drop` meters over the street. */
export function bungeePose(drop: number, t: number): BungeePose {
  const p = bungeePlan(drop);
  const stand = { x: BUNGEE.x, y: BUNGEE.deckY, z: BUNGEE.standZ };
  if (!(t > 0)) return { ...stand, pitch: 0, phase: 'count', taut: false, speed: 0 };
  if (t < p.jump) {
    // Leaning into it on the last beat.
    const lean = smooth((t - (p.jump - 0.5)) / 0.5) * 0.25;
    return { ...stand, pitch: lean, phase: 'count', taut: false, speed: 0 };
  }
  if (t < p.winch) {
    const tf = t - p.jump;
    const { s, v } = fallAt(p, tf);
    const sx = 0.25 * Math.sin(tf * 1.3) * Math.exp(-tf / 4) * smooth(tf);
    return {
      x: BUNGEE.x + sx,
      y: BUNGEE.deckY - s,
      z: ANCHOR.z + swayZ(tf),
      // Diving head first off the edge, head down by the time the rope pulls.
      pitch: 0.25 + (Math.PI - 0.25) * smooth(tf / 1.1),
      phase: t < p.hang ? 'fall' : 'hang',
      taut: s > p.length,
      speed: v,
    };
  }
  const at = p.s[p.s.length - 1];
  const fromZ = ANCHOR.z + swayZ(p.winch - p.jump);
  const top = -0.9; // ankles just under the arm, 0.9 m over the deck
  if (t < p.climb) {
    const u = (t - p.winch) / (p.climb - p.winch);
    const e = smooth(u);
    const s = at + (top - at) * e;
    const ds = ((top - at) * 6 * u * (1 - u)) / (p.climb - p.winch);
    return { x: BUNGEE.x, y: BUNGEE.deckY - s, z: fromZ + (ANCHOR.z - fromZ) * e, pitch: Math.PI, phase: 'winch', taut: true, speed: ds };
  }
  if (t < p.end) {
    // Swung in over the edge feet first, and up onto them.
    const u = smooth((t - p.climb) / (p.end - p.climb));
    const hop = Math.sin(u * Math.PI) * 0.5;
    return {
      x: BUNGEE.x,
      y: BUNGEE.deckY + (1 - u) * -top + hop,
      z: ANCHOR.z + (BUNGEE.standZ - ANCHOR.z) * u,
      pitch: Math.PI + Math.PI * u,
      phase: 'climb',
      taut: true,
      speed: 0,
    };
  }
  return { ...stand, pitch: 0, phase: 'done', taut: false, speed: 0 };
}

/** The office's clock's day, as YYYY-MM-DD in its local time: "jumps today" go by it. */
export function bungeeDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

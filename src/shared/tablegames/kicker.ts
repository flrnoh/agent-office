// Kicker (table football): four rods a side, a goalkeeper, two defenders, five in midfield and three
// up front. The mouse (or W/S) slides all your rods at once, each so its nearest man lines up with
// where you point; a click (or Space) swings them all to kick. First to five. Side 0 defends the
// goal at u = -0.6 and kicks toward +u.

import { emit, type GameState, type Rng, type TableGame } from './game.js';
import { EV, TABLES, clamp, r4, type Side } from './tables.js';

const T = TABLES.kicker;
export const KICKER = {
  halfL: T.length / 2,
  halfW: T.width / 2,
  goal: 0.1,
  ball: 0.018,
  /** A man's feet, round, for bumping the ball. */
  man: 0.02,
  /** How long a kick swings (s); it strikes in the first part of it. */
  kick: 0.22,
  strike: 0.12,
  /** How fast the rods slide (m/s), and the computer's. */
  slide: 3.2,
  cpuSlide: 1.35,
  pause: 1.1,
  target: T.target,
} as const;

export interface Rod {
  side: Side;
  u: number;
  men: number;
  gap: number;
  /** How far it slides either way. */
  range: number;
}

const rod = (side: Side, u: number, men: number, gap: number, range: number): Rod => ({ side, u, men, gap, range });
/** The rods from one goal to the other, as they are on a real table: they take turns, the two sides' interleaved. */
export const RODS: readonly Rod[] = [
  rod(0, -0.52, 1, 0, 0.12),
  rod(0, -0.37, 2, 0.24, 0.19),
  rod(1, -0.22, 3, 0.2, 0.11),
  rod(0, -0.07, 5, 0.12, 0.07),
  rod(1, 0.07, 5, 0.12, 0.07),
  rod(0, 0.22, 3, 0.2, 0.11),
  rod(1, 0.37, 2, 0.24, 0.19),
  rod(1, 0.52, 1, 0, 0.12),
];

/** Where man `i` of a rod is across the table, the rod slid `off`. */
export function manV(r: Rod, i: number, off: number): number {
  return (i - (r.men - 1) / 2) * r.gap + off;
}

/** How far to slide a rod so the man nearest `v` is right there (or as near as it slides). */
export function slideFor(r: Rod, v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < r.men; i++) {
    const off = clamp(v - manV(r, i, 0), -r.range, r.range);
    const d = Math.abs(manV(r, i, off) - v);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = off;
    }
  }
  return best;
}

export interface KickerState extends GameState {
  /** The ball: u, v, vu, vv. */
  b: [number, number, number, number];
  /** How far each rod is slid (RODS' order), and where each side wants its men. */
  off: number[];
  to: [number, number];
  /** How long is left of each side's kick. */
  kick: [number, number];
  pause: number;
  /** How long the ball has hardly moved (it's put back in the middle after a while). */
  still: number;
}

/**
 * Whether the ball at (u, v) has gone in: the side whose goal it is (0 or 1), or -1. Only once it's
 * all the way past the end, through the mouth.
 */
export function kickerGoal(u: number, v: number): -1 | Side {
  const K = KICKER;
  if (Math.abs(v) > K.goal) return -1;
  if (u < -K.halfL - K.ball) return 0;
  if (u > K.halfL + K.ball) return 1;
  return -1;
}

/** The ball dropped in at the side of the middle, rolling across toward the far rail. */
function dropBall(s: KickerState, rng: Rng) {
  const from = rng() < 0.5 ? -1 : 1;
  s.b = [(rng() - 0.5) * 0.04, from * (KICKER.halfW - 0.03), (rng() - 0.5) * 0.15, -from * (0.35 + rng() * 0.2)];
  s.pause = KICKER.pause;
  s.still = 0;
}

export const kicker: TableGame<KickerState> = {
  id: 'kicker',
  init(rng) {
    const s: KickerState = { b: [0, 0, 0, 0], off: RODS.map(() => 0), to: [0, 0], kick: [0, 0], pause: 0, still: 0, score: [0, 0], win: -1 };
    dropBall(s, rng);
    return s;
  },
  input(s, side, a) {
    if (a[0] === 0 && a.length >= 2) s.to[side] = clamp(a[1], -KICKER.halfW, KICKER.halfW);
    else if (a[0] === 1 && s.kick[side] <= 0) s.kick[side] = KICKER.kick;
  },
  step(s, dt, ev, rng) {
    if (s.win !== -1) return;
    const K = KICKER;
    const n = Math.max(1, Math.ceil(dt / 0.002));
    const h = dt / n;
    const slid = RODS.map(() => 0);
    for (let i = 0; i < n; i++) {
      RODS.forEach((r, k) => {
        const want = slideFor(r, s.to[r.side]);
        const d = clamp(want - s.off[k], -K.slide * h, K.slide * h);
        s.off[k] += d;
        slid[k] = d / h;
      });
      const striking: [boolean, boolean] = [s.kick[0] > K.kick - K.strike, s.kick[1] > K.kick - K.strike];
      s.kick = [Math.max(0, s.kick[0] - h), Math.max(0, s.kick[1] - h)];
      if (s.pause > 0) {
        s.pause -= h;
        continue;
      }
      const b = s.b;
      b[0] += b[2] * h;
      b[1] += b[3] * h;
      // Rolling to a stop on the felt.
      const sp = Math.hypot(b[2], b[3]);
      if (sp > 0) {
        const slow = Math.max(0, sp - 0.35 * h) / sp;
        b[2] *= slow;
        b[3] *= slow;
      }
      // The rails, but for the goals.
      const wv = K.halfW - K.ball;
      if (Math.abs(b[1]) > wv) {
        b[1] = Math.sign(b[1]) * wv;
        if (b[1] * b[3] > 0) {
          b[3] = -b[3] * 0.7;
          if (Math.abs(b[3]) > 0.2) emit(ev, EV.wall, b[0], b[1]);
        }
      }
      const wu = K.halfL - K.ball;
      if (Math.abs(b[0]) > wu && Math.abs(b[1]) > K.goal) {
        b[0] = Math.sign(b[0]) * wu;
        if (b[0] * b[2] > 0) {
          b[2] = -b[2] * 0.7;
          if (Math.abs(b[2]) > 0.2) emit(ev, EV.wall, b[0], b[1]);
        }
      }
      // The men: kicking ones send it off toward the other goal, the rest are in the way.
      RODS.forEach((r, k) => {
        const du = b[0] - r.u;
        if (Math.abs(du) > K.man + K.ball + 0.03) return;
        for (let m = 0; m < r.men; m++) {
          const mv = manV(r, m, s.off[k]);
          const dv = b[1] - mv;
          const fwd = r.side === 0 ? 1 : -1;
          // (Once, not again while it's on its way.)
          if (striking[r.side] && b[2] * fwd < 1.2 && Math.abs(dv)< K.man + K.ball + 0.012 && du * fwd > -0.035 && du * fwd < 0.05) {
            const power = 2.2 + rng() * 0.6;
            const across = clamp(dv * 22 + (rng() - 0.5) * 0.4, -1.3, 1.3);
            b[2] = fwd * power;
            b[3] = across + slid[k] * 0.4;
            b[0] = r.u + fwd * (K.man + K.ball + 0.002);
            emit(ev, EV.kick, b[0], b[1]);
            return;
          }
          const d = Math.hypot(du, dv);
          const R = K.man + K.ball;
          if (d >= R || d === 0) continue;
          const nu = du / d;
          const nv = dv / d;
          b[0] = r.u + nu * R;
          b[1] = mv + nv * R;
          const rel = b[2] * nu + (b[3] - slid[k]) * nv;
          if (rel < 0) {
            b[2] -= 1.5 * rel * nu;
            b[3] -= 1.5 * rel * nv;
            if (-rel > 0.25) emit(ev, EV.hit, b[0], b[1]);
          }
        }
      });
      const g = kickerGoal(b[0], b[1]);
      if (g !== -1) {
        const scorer: Side = g === 0 ? 1 : 0;
        s.score[scorer]++;
        emit(ev, EV.score, b[0], b[1]);
        if (s.score[scorer] >= K.target) {
          s.win = scorer;
          emit(ev, EV.win, 0, 0);
          s.b = [0, 0, 0, 0];
          return;
        }
        dropBall(s, rng);
        continue;
      }
      // Stuck somewhere nobody reaches: back in the middle.
      s.still = Math.hypot(b[2], b[3]) < 0.04 ? s.still + h : 0;
      if (s.still > 2.5) dropBall(s, rng);
    }
  },
  cpu(s, side, dt, rng) {
    const K = KICKER;
    const [bu, bv, vu, vv] = s.b;
    const out: number[][] = [];
    // Toward where the ball's going, a beat behind.
    const want = clamp(bv + vv * 0.12, -K.halfW, K.halfW);
    out.push([0, s.to[side] + clamp(want - s.to[side], -K.cpuSlide * dt, K.cpuSlide * dt)]);
    // A kick when the ball's right in front of one of our men.
    if (s.kick[side] <= 0 && s.pause <= 0) {
      const fwd = side === 0 ? 1 : -1;
      RODS.forEach((r, k) => {
        if (r.side !== side) return;
        const du = (bu - r.u) * fwd;
        if (du < -0.02 || du > 0.045) return;
        for (let m = 0; m < r.men; m++) {
          if (Math.abs(bv - manV(r, m, s.off[k])) < 0.035 && Math.abs(vu) < 1.8 && rng() < 0.35) {
            out.push([1]);
            return;
          }
        }
      });
    }
    return out.slice(0, 2);
  },
  encode(s) {
    return [...s.b, ...s.off, ...s.to, ...s.kick, s.pause, s.still, s.score[0], s.score[1], s.win].map(r4);
  },
  decode(a) {
    const n = (i: number) => a[i] ?? 0;
    const off = RODS.map((_, k) => n(4 + k));
    const at = 4 + RODS.length;
    return {
      b: [n(0), n(1), n(2), n(3)],
      off,
      to: [n(at), n(at + 1)],
      kick: [n(at + 2), n(at + 3)],
      pause: n(at + 4),
      still: n(at + 5),
      score: [n(at + 6), n(at + 7)],
      win: (n(at + 8) === 0 || n(at + 8) === 1 ? n(at + 8) : -1) as -1 | 0 | 1,
    };
  },
};

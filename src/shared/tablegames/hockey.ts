// Air hockey: a puck on a cushion of air, a mallet each, a slot of a goal at either end. Your mallet
// follows the mouse round your own half; first to seven. Side 0 defends the goal at u = -1.

import { emit, type GameState, type Rng, type TableGame } from './game.js';
import { EV, TABLES, clamp, r4, type Side } from './tables.js';

const T = TABLES.hockey;
export const HOCKEY = {
  halfL: T.length / 2,
  halfW: T.width / 2,
  /** Half the goal's mouth. */
  goal: 0.16,
  puck: 0.04,
  mallet: 0.055,
  /** How fast a mallet follows the mouse (m/s), and the computer's. */
  reach: 5.5,
  cpuReach: 3.2,
  maxPuck: 6.5,
  /** Seconds the puck waits after a goal before it's in play. */
  pause: 1.1,
  target: T.target,
} as const;

export interface HockeyState extends GameState {
  /** The puck: where, and how fast. */
  p: [number, number, number, number];
  /** Each side's mallet (u, v, vu, vv) and where it's heading. */
  m: [[number, number, number, number], [number, number, number, number]];
  to: [[number, number], [number, number]];
  /** Seconds until the puck is live again after a goal. */
  pause: number;
  /** The computer's plan for the puck on its half (not sent): where across the far end it aims, and how far off it guards. */
  plan?: { aim: number; guard: number; mine: boolean };
}

/** Where a side's mallet may go: its own half, inside the rails. */
export function malletBox(side: Side): { minU: number; maxU: number; minV: number; maxV: number } {
  const H = HOCKEY;
  const r = H.mallet;
  return side === 0 ? { minU: -H.halfL + r, maxU: -r, minV: -H.halfW + r, maxV: H.halfW - r } : { minU: r, maxU: H.halfL - r, minV: -H.halfW + r, maxV: H.halfW - r };
}

const home = (side: Side): [number, number] => [side === 0 ? -HOCKEY.halfL + 0.2 : HOCKEY.halfL - 0.2, 0];

/** The puck, still, on `side`'s half, to play off. */
function servePuck(s: HockeyState, side: Side) {
  s.p = [side === 0 ? -0.45 : 0.45, 0, 0, 0];
  s.pause = HOCKEY.pause;
}

/**
 * Where the puck is now against the goal ends: the side it went in on scored against (0 or 1), or
 * -1. Only once it's all the way over the end line, through the mouth.
 */
export function hockeyGoal(u: number, v: number): -1 | Side {
  const H = HOCKEY;
  if (Math.abs(v) > H.goal) return -1;
  if (u < -H.halfL - H.puck * 0.5) return 0;
  if (u > H.halfL + H.puck * 0.5) return 1;
  return -1;
}

export const hockey: TableGame<HockeyState> = {
  id: 'hockey',
  init() {
    const s: HockeyState = { p: [0, 0, 0, 0], m: [[...home(0), 0, 0], [...home(1), 0, 0]], to: [home(0), home(1)], pause: 0, score: [0, 0], win: -1 };
    servePuck(s, 0);
    return s;
  },
  input(s, side, a) {
    if (a[0] !== 0 || a.length < 3) return;
    const b = malletBox(side);
    s.to[side] = [clamp(a[1], b.minU, b.maxU), clamp(a[2], b.minV, b.maxV)];
  },
  step(s, dt, ev) {
    if (s.win !== -1) return;
    const H = HOCKEY;
    const n = Math.max(1, Math.ceil(dt / 0.003));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      for (const side of [0, 1] as Side[]) {
        const m = s.m[side];
        const [tu, tv] = s.to[side];
        let du = tu - m[0];
        let dv = tv - m[1];
        const d = Math.hypot(du, dv);
        const max = H.reach * h;
        if (d > max) {
          du *= max / d;
          dv *= max / d;
        }
        m[0] += du;
        m[1] += dv;
        m[2] = du / h;
        m[3] = dv / h;
      }
      if (s.pause > 0) {
        s.pause -= h;
        continue;
      }
      const p = s.p;
      p[0] += p[2] * h;
      p[1] += p[3] * h;
      // A little drag, even on air.
      const drag = 1 - 0.12 * h;
      p[2] *= drag;
      p[3] *= drag;
      // The side rails.
      const wallV = H.halfW - H.puck;
      if (Math.abs(p[1]) > wallV) {
        p[1] = Math.sign(p[1]) * wallV;
        if (p[1] * p[3] > 0) {
          p[3] = -p[3] * 0.9;
          if (Math.abs(p[3]) > 0.3) emit(ev, EV.wall, p[0], p[1]);
        }
      }
      // The end rails, but for the goal's mouth.
      const wallU = H.halfL - H.puck;
      if (Math.abs(p[0]) > wallU && Math.abs(p[1]) > H.goal) {
        p[0] = Math.sign(p[0]) * wallU;
        if (p[0] * p[2] > 0) {
          p[2] = -p[2] * 0.9;
          if (Math.abs(p[2]) > 0.3) emit(ev, EV.wall, p[0], p[1]);
        }
      }
      // The mallets.
      for (const side of [0, 1] as Side[]) {
        const m = s.m[side];
        const du = p[0] - m[0];
        const dv = p[1] - m[1];
        const d = Math.hypot(du, dv);
        const R = H.puck + H.mallet;
        if (d >= R || d === 0) continue;
        const nu = du / d;
        const nv = dv / d;
        p[0] = m[0] + nu * R;
        p[1] = m[1] + nv * R;
        const rel = (p[2] - m[2]) * nu + (p[3] - m[3]) * nv;
        if (rel < 0) {
          p[2] -= 1.85 * rel * nu;
          p[3] -= 1.85 * rel * nv;
          emit(ev, EV.hit, p[0], p[1]);
        }
        const speed = Math.hypot(p[2], p[3]);
        if (speed > H.maxPuck) {
          p[2] *= H.maxPuck / speed;
          p[3] *= H.maxPuck / speed;
        }
      }
      const g = hockeyGoal(p[0], p[1]);
      if (g !== -1) {
        const scorer: Side = g === 0 ? 1 : 0;
        s.score[scorer]++;
        emit(ev, EV.score, p[0], p[1]);
        if (s.score[scorer] >= H.target) {
          s.win = scorer;
          emit(ev, EV.win, 0, 0);
          s.p = [0, 0, 0, 0];
          return;
        }
        // Whoever let it in plays it off.
        servePuck(s, g);
      }
    }
  },
  cpu(s, side, dt, rng) {
    const H = HOCKEY;
    const b = malletBox(side);
    const m = s.m[side];
    const [pu, pv, vu, vv] = s.p;
    // Which way is home: side 0's goal is at -u.
    const dir = side === 0 ? -1 : 1;
    let want: [number, number];
    const mine = pu * dir > 0 && s.pause <= 0;
    // A new plan each time the puck comes over: straight at a corner of the goal, or off a rail.
    if (!s.plan || s.plan.mine !== mine) {
      const bank = rng() < 0.4;
      const corner = (rng() < 0.5 ? -1 : 1) * (bank ? 2 * H.halfW - H.puck : 0.1);
      s.plan = { aim: corner, guard: (rng() - 0.5) * 0.12, mine };
    }
    // A quick one coming at the goal is for blocking, not for going after.
    const incoming = vu * dir > 0 && Math.hypot(vu, vv) > 1.6;
    if (!mine || incoming) {
      // Back in front of the goal, in line with the puck, more or less.
      const [hu] = home(side);
      want = [hu, clamp(pv * 0.55 + s.plan.guard, -0.22, 0.22)];
    } else if ((m[0] - pu) * dir < 0.02) {
      // Between the puck and the far end: round behind it first.
      want = [pu + dir * 0.16, pv + (pv > m[1] ? -0.14 : 0.14)];
    } else {
      // Into it, toward the far goal (a bank shot now and then comes by itself).
      const au = -dir * H.halfL - pu;
      const av = s.plan.aim - pv;
      const al = Math.hypot(au, av) || 1;
      want = [pu + vu * 0.05 - (au / al) * 0.02, pv + vv * 0.05 - (av / al) * 0.02];
    }
    // Only as quick as the computer's hand.
    let du = clamp(want[0], b.minU, b.maxU) - m[0];
    let dv = clamp(want[1], b.minV, b.maxV) - m[1];
    const d = Math.hypot(du, dv);
    const max = H.cpuReach * dt;
    if (d > max) {
      du *= max / d;
      dv *= max / d;
    }
    return [[0, m[0] + du, m[1] + dv]];
  },
  encode(s) {
    return [...s.p, ...s.m[0], ...s.m[1], ...s.to[0], ...s.to[1], s.pause, s.score[0], s.score[1], s.win].map(r4);
  },
  decode(a) {
    const n = (i: number) => a[i] ?? 0;
    return {
      p: [n(0), n(1), n(2), n(3)],
      m: [
        [n(4), n(5), n(6), n(7)],
        [n(8), n(9), n(10), n(11)],
      ],
      to: [
        [n(12), n(13)],
        [n(14), n(15)],
      ],
      pause: n(16),
      score: [n(17), n(18)],
      win: (n(19) === 0 || n(19) === 1 ? n(19) : -1) as -1 | 0 | 1,
    };
  },
};

// Table tennis, seen from behind your end: your paddle follows the mouse, and a click (or Space)
// swings it. Swing as the ball comes to you after it has bounced on your side: on time and it goes
// back fast and deep, early or late and it floats back slower, higher and less where you meant it.
// Where on the paddle you meet it steers it left or right, and moving the paddle as you hit puts a
// little side spin on it. Serves go straight over (no bounce on your own side first), two each, then
// one each from 10–10. First to 11, by two. Side 0 plays from the end at u = -1.37.

import { emit, type GameState, type Rng, type TableGame } from './game.js';
import { EV, TABLES, clamp, r4, type Side } from './tables.js';

const T = TABLES.pingpong;
export const PONG = {
  halfL: T.length / 2,
  halfW: T.width / 2,
  net: 0.1525,
  ball: 0.02,
  gravity: 9.0,
  /** How far from the paddle's middle a ball can still be hit, and how high over the table. */
  reach: 0.3,
  high: 0.9,
  /** How long a swing looks for the ball (s), and when in it is just right. */
  swing: 0.26,
  sweet: 0.09,
  /** How fast a paddle follows the mouse (m/s), and the computer's. */
  hand: 6,
  cpuHand: 3.4,
  target: T.target,
} as const;

export const PHASE = { serve: 0, rally: 1, dead: 2 } as const;

export interface PongState extends GameState {
  /** The ball: u, v, h (over the table), vu, vv, vh. */
  b: [number, number, number, number, number, number];
  /** Side spin: how hard it curves across (m/s²). */
  spin: number;
  /** Each side's paddle (u, v), where it's heading, and how long is left of its swing. */
  pad: [[number, number], [number, number]];
  to: [[number, number], [number, number]];
  sw: [number, number];
  phase: number;
  /** Who serves now, and who hit it last. */
  server: Side;
  last: Side;
  /** Where the ball last bounced since it was hit: the side, or -1. */
  landed: -1 | Side;
  /** Seconds before the next serve, after a point; how long the server has waited (the computer serves after a moment). */
  pause: number;
  wait: number;
  /** Hits so far (not sent), and the computer's plan for the ball coming at it: how far off it'll be, whether it swings at all. */
  hits?: number;
  plan?: { hit: number; off: number; whiff: boolean };
}

/** Which way a side hits: side 0 hits toward +u. */
const fwd = (side: Side) => (side === 0 ? 1 : -1);

/** Who serves, the score being what it is: two serves each, and one each from 10–10. */
export function serverFor(score: readonly [number, number]): Side {
  const n = score[0] + score[1];
  return (n >= 20 ? n % 2 : Math.floor(n / 2) % 2) as Side;
}

/** Whether `score` has won the match for one side: 11, two clear. */
export function pongWinner(score: readonly [number, number]): -1 | Side {
  const [a, b] = score;
  if (a >= PONG.target && a - b >= 2) return 0;
  if (b >= PONG.target && b - a >= 2) return 1;
  return -1;
}

/** Where a side's paddle may go: behind and a little over its own end, and a bit wide of the table. */
export function paddleBox(side: Side): { minU: number; maxU: number; minV: number; maxV: number } {
  const e = PONG.halfL;
  return side === 0 ? { minU: -e - 1.1, maxU: -e + 0.35, minV: -1.2, maxV: 1.2 } : { minU: e - 0.35, maxU: e + 1.1, minV: -1.2, maxV: 1.2 };
}

function readyServe(s: PongState) {
  s.server = serverFor(s.score);
  s.phase = PHASE.serve;
  s.landed = -1;
  s.spin = 0;
  s.wait = 0;
  holdBall(s);
}

/** The server holds the ball up in front of their paddle. */
function holdBall(s: PongState) {
  const p = s.pad[s.server];
  s.b = [clamp(p[0], -PONG.halfL - 0.4, PONG.halfL + 0.4) + fwd(s.server) * 0.05, p[1], 0.28, 0, 0, 0];
}

/** A point to `side`: the score, and a new serve (or the match). */
function point(s: PongState, side: Side, ev: number[]) {
  s.score[side]++;
  emit(ev, EV.score, s.b[0], s.b[1]);
  s.phase = PHASE.dead;
  s.pause = 1.1;
  const w = pongWinner(s.score);
  if (w !== -1) {
    s.win = w;
    emit(ev, EV.win, 0, 0);
  }
}

/**
 * The ball off `side`'s paddle: over the net to land somewhere on the other half. `late` is how far
 * into the swing it met the ball (s), `off` how far across the paddle (-1 to 1), `move` how fast the
 * paddle was going across.
 */
export function hitBall(s: PongState, side: Side, late: number, off: number, move: number, rng: Rng) {
  const P = PONG;
  const b = s.b;
  // 0 right on time, 1 as far off it as a swing goes.
  const miss = clamp(Math.abs(late - P.sweet) / (P.swing - P.sweet), 0, 1);
  const depth = 0.75 - 0.4 * miss;
  const tu = fwd(side) * (0.25 + depth * (P.halfL - 0.35)) + (rng() - 0.5) * 0.25 * miss;
  const tv = clamp(-off * 0.62 + (rng() - 0.5) * (0.12 + 0.6 * miss), -P.halfW - 0.2, P.halfW + 0.2);
  // Quicker when it's on time.
  const speed = 5.2 - 2.3 * miss;
  const du = tu - b[0];
  const time = Math.max(0.28, Math.abs(du) / speed);
  const h = Math.max(b[2], 0.05);
  b[2] = h;
  b[3] = du / time;
  b[4] = (tv - b[1]) / time;
  b[5] = (0.5 * P.gravity * time * time - h) / time + (rng() - 0.5) * 0.4 * miss;
  s.spin = clamp(move * 0.9, -3, 3);
  s.last = side;
  s.landed = -1;
  s.sw[side] = 0;
  s.hits = (s.hits ?? 0) + 1;
}

export const pingpong: TableGame<PongState> = {
  id: 'pingpong',
  init() {
    const e = PONG.halfL + 0.25;
    const s: PongState = {
      b: [0, 0, 0, 0, 0, 0],
      spin: 0,
      pad: [
        [-e, 0],
        [e, 0],
      ],
      to: [
        [-e, 0],
        [e, 0],
      ],
      sw: [0, 0],
      phase: PHASE.serve,
      server: 0,
      last: 0,
      landed: -1,
      pause: 0,
      wait: 0,
      score: [0, 0],
      win: -1,
    };
    readyServe(s);
    return s;
  },
  input(s, side, a) {
    if (a[0] === 0 && a.length >= 3) {
      const b = paddleBox(side);
      s.to[side] = [clamp(a[1], b.minU, b.maxU), clamp(a[2], b.minV, b.maxV)];
    } else if (a[0] === 1) {
      if (s.phase === PHASE.dead || s.sw[side] > 0) return;
      s.sw[side] = PONG.swing;
    }
  },
  step(s, dt, ev, rng) {
    if (s.win !== -1) return;
    const P = PONG;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      // The paddles follow their hands; a swing runs out.
      const move: [number, number] = [0, 0];
      for (const side of [0, 1] as Side[]) {
        const p = s.pad[side];
        let du = s.to[side][0] - p[0];
        let dv = s.to[side][1] - p[1];
        const d = Math.hypot(du, dv);
        const max = P.hand * h;
        if (d > max) {
          du *= max / d;
          dv *= max / d;
        }
        p[0] += du;
        p[1] += dv;
        move[side] = dv / h;
        if (s.sw[side] > 0) s.sw[side] = Math.max(0, s.sw[side] - h);
      }
      if (s.phase === PHASE.dead) {
        s.pause -= h;
        // The ball drops away where it went.
        const b = s.b;
        b[0] += b[3] * h;
        b[1] += b[4] * h;
        b[2] = Math.max(-0.76, b[2] + b[5] * h);
        b[5] -= P.gravity * h;
        if (s.pause <= 0) readyServe(s);
        continue;
      }
      if (s.phase === PHASE.serve) {
        holdBall(s);
        s.wait += h;
        const sw = s.sw[s.server];
        // Tossed up and struck: straight over to the other half.
        if (sw > 0 && sw < P.swing - 0.06) {
          hitBall(s, s.server, P.sweet, (rng() - 0.5) * 0.8, move[s.server], rng);
          s.phase = PHASE.rally;
          emit(ev, EV.serve, s.b[0], s.b[1]);
        }
        continue;
      }
      const b = s.b;
      const wasU = b[0];
      b[0] += b[3] * h;
      b[1] += b[4] * h;
      b[2] += b[5] * h;
      b[5] -= P.gravity * h;
      b[4] += s.spin * h;
      // The net: over it, or into it and back.
      if (Math.sign(wasU) !== Math.sign(b[0]) && Math.abs(b[1]) < P.halfW + 0.15 && b[2] < P.net + P.ball && b[2] > -0.05) {
        b[0] = wasU;
        b[3] = -b[3] * 0.15;
        b[4] *= 0.3;
        b[5] = Math.min(b[5], 0);
        emit(ev, EV.net, b[0], b[1]);
      }
      // On the table: a bounce, or out.
      if (b[2] <= P.ball && b[5] < 0) {
        const onTable = Math.abs(b[0]) <= P.halfL && Math.abs(b[1]) <= P.halfW;
        if (onTable && b[2] > -0.03) {
          b[2] = P.ball;
          b[5] = -b[5] * 0.88;
          s.spin *= 0.5;
          const half: Side = b[0] < 0 ? 0 : 1;
          emit(ev, EV.bounce, b[0], b[1]);
          if (half === s.last) {
            // It came down on the hitter's own side (off the net): the point's the other's.
            point(s, (1 - s.last) as Side, ev);
            continue;
          }
          if (s.landed === half) {
            // Twice on the receiver's side: they didn't get it back.
            point(s, s.last, ev);
            continue;
          }
          s.landed = half;
        } else if (b[2] < -0.25) {
          // Down past the table: whoever let it get there loses the point.
          point(s, s.landed === 1 - s.last ? s.last : ((1 - s.last) as Side), ev);
          continue;
        }
      }
      // The receiver's paddle, once it's bounced on their side, if they're swinging and it's in reach.
      const r = (1 - s.last) as Side;
      const p = s.pad[r];
      if (s.landed === r && s.sw[r] > 0 && b[2] < P.high && b[3] * fwd(r) < 0) {
        const off = (b[1] - p[1]) / P.reach;
        if (Math.hypot(b[0] - p[0], b[1] - p[1]) <= P.reach) {
          hitBall(s, r, P.swing - s.sw[r], clamp(off, -1, 1), move[r], rng);
          emit(ev, EV.hit, b[0], b[1]);
        }
      }
    }
  },
  cpu(s, side, dt, rng) {
    const P = PONG;
    const out: number[][] = [];
    const b = s.b;
    const e = fwd(side) * -1 * (P.halfL + 0.3);
    let want: [number, number] = [e, 0];
    if (s.phase === PHASE.serve && s.server === side) {
      want = [e, 0.2 * Math.sin(s.wait * 2)];
      if (s.wait > 0.9 && s.sw[side] === 0) out.push([1]);
    } else if (s.phase === PHASE.rally && s.last !== side) {
      // Not every ball: now and then it misjudges one, or doesn't get there.
      let plan = s.plan;
      if (!plan || plan.hit !== (s.hits ?? 0)) plan = s.plan = { hit: s.hits ?? 0, off: (rng() - 0.5) * 0.55, whiff: rng() < 0.1 };
      // Where the ball will be as it comes past our end, near enough.
      const toEnd = b[3] !== 0 ? (e - b[0]) / b[3] : 0;
      const t = clamp(toEnd, 0, 1.2);
      want = [e, b[1] + b[4] * t + 0.5 * s.spin * t * t + plan.off];
      // Swing a moment before it arrives, not always quite on time.
      const d = Math.hypot(b[0] - s.pad[side][0], b[1] - s.pad[side][1]);
      const coming = b[3] * fwd(side) < 0;
      if (coming && !plan.whiff && s.landed === side && s.sw[side] === 0 && d < 0.22 + rng() * 0.25) out.push([1]);
    }
    const p = s.pad[side];
    let du = want[0] - p[0];
    let dv = want[1] - p[1];
    const d = Math.hypot(du, dv);
    const max = P.cpuHand * dt;
    if (d > max) {
      du *= max / d;
      dv *= max / d;
    }
    out.unshift([0, p[0] + du, p[1] + dv]);
    return out;
  },
  encode(s) {
    return [...s.b, s.spin, ...s.pad[0], ...s.pad[1], ...s.to[0], ...s.to[1], ...s.sw, s.phase, s.server, s.last, s.landed, s.pause, s.wait, s.score[0], s.score[1], s.win].map(r4);
  },
  decode(a) {
    const n = (i: number) => a[i] ?? 0;
    const side = (x: number): Side => (x === 1 ? 1 : 0);
    return {
      b: [n(0), n(1), n(2), n(3), n(4), n(5)],
      spin: n(6),
      pad: [
        [n(7), n(8)],
        [n(9), n(10)],
      ],
      to: [
        [n(11), n(12)],
        [n(13), n(14)],
      ],
      sw: [n(15), n(16)],
      phase: n(17),
      server: side(n(18)),
      last: side(n(19)),
      landed: n(20) === 0 || n(20) === 1 ? (n(20) as Side) : -1,
      pause: n(21),
      wait: n(22),
      score: [n(23), n(24)],
      win: (n(25) === 0 || n(25) === 1 ? n(25) : -1) as -1 | 0 | 1,
    };
  },
};

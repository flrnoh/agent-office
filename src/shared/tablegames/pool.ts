// Pool: eight-ball, a little simplified. Side 0 breaks, from anywhere behind the head string. Pot a
// ball on the open table and that group (solids 1–7 or stripes 9–15) is yours; pot one of yours and
// you go again. Clear yours, then pot the 8 to win; the 8 early, or a scratch with it, loses. A foul
// (the cue ball down, nothing hit, or hitting the other group or the 8 first) gives the other player
// the cue ball in hand behind the head string. Aim with the mouse, hold to pick how hard, let go.

import { emit, type GameState, type Rng, type TableGame } from './game.js';
import { EV, TABLES, clamp, r4, type Side } from './tables.js';

const T = TABLES.pool;
export const POOL = {
  halfL: T.length / 2,
  halfW: T.width / 2,
  ball: 0.028,
  /** The head string: the cue ball in hand goes behind it (u below this). */
  kitchen: -T.length / 4,
  /** The foot spot, where the rack's front ball sits. */
  foot: T.length / 4,
  /** How near a pocket's middle a ball's middle has to come to drop: the corners, the sides. */
  corner: 0.072,
  middle: 0.06,
  /** Rolling slows a ball this much (m/s²); the hardest shot sends the cue ball off this fast. */
  friction: 0.75,
  maxShot: 4.4,
} as const;

/** The six pockets, in the table's frame. */
export const POCKETS: readonly { u: number; v: number; r: number }[] = [
  { u: -POOL.halfL, v: -POOL.halfW, r: POOL.corner },
  { u: 0, v: -POOL.halfW, r: POOL.middle },
  { u: POOL.halfL, v: -POOL.halfW, r: POOL.corner },
  { u: -POOL.halfL, v: POOL.halfW, r: POOL.corner },
  { u: 0, v: POOL.halfW, r: POOL.middle },
  { u: POOL.halfL, v: POOL.halfW, r: POOL.corner },
];

/** Which group a ball is in: 1 solids (1–7), 2 stripes (9–15), 0 the cue ball or the 8. */
export function groupOf(n: number): 0 | 1 | 2 {
  return n >= 1 && n <= 7 ? 1 : n >= 9 && n <= 15 ? 2 : 0;
}

export const POOL_PHASE = { aim: 0, rolling: 1, over: 2 } as const;
/** What the last shot came to, for the players to read. */
export const NOTE = { none: 0, scratch: 1, foul: 2, potted: 3, missed: 4, groups: 5, eight: 6, eightEarly: 7, wrongFirst: 8, noHit: 9 } as const;

export interface PoolState extends GameState {
  /** Sixteen balls, the cue ball first: u, v, vu, vv, and 1 while it's on the table. */
  balls: number[][];
  turn: Side;
  /** What each side is on: 0 the table's open, 1 solids, 2 stripes. */
  groups: [number, number];
  phase: number;
  /** The player to shoot has the cue ball in hand, behind the head string. */
  hand: boolean;
  /** Where the player to shoot is aiming (radians, 0 is +u) and how far they've drawn back (0–1). */
  aim: [number, number];
  /** This shot: the first ball the cue ball touched (-1: none yet), and what went down. */
  first: number;
  down: number[];
  note: number;
  /** How long the computer has been thinking. */
  think: number;
  /** The cue ball was just struck (for its sound; not sent). */
  struck?: boolean;
}

/** The balls racked in a triangle at the foot spot: the 1 at the front, the 8 in the middle, a solid and a stripe at the back corners. */
export function rack(rng: Rng): number[][] {
  const P = POOL;
  const rest = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  // Fifteen places, front to back, row by row: 0 the apex, 4 the middle of the third row, 10 and 14 the back corners.
  const place: number[] = new Array(15).fill(-1);
  place[0] = 1;
  place[4] = 8;
  const solid = rest.findIndex((n) => groupOf(n) === 1);
  place[10] = rest.splice(solid, 1)[0];
  place[14] = 15;
  for (let k = 0; k < 15; k++) if (place[k] === -1) place[k] = rest.shift()!;
  const balls: number[][] = Array.from({ length: 16 }, () => [0, 0, 0, 0, 1]);
  balls[0] = [P.kitchen - 0.15, 0, 0, 0, 1];
  const d = P.ball * 2 + 0.0008;
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) balls[place[k++]] = [P.foot + row * d * Math.cos(Math.PI / 6), (i - row / 2) * d, 0, 0, 1];
  }
  return balls;
}

/** Whether the cue ball can go at (u, v) in hand: behind the head string, on the table, touching nothing. */
export function canPlace(s: PoolState, u: number, v: number): boolean {
  const P = POOL;
  if (u > P.kitchen || u < -P.halfL + P.ball || Math.abs(v) > P.halfW - P.ball) return false;
  for (let i = 1; i < 16; i++) {
    const b = s.balls[i];
    if (b[4] && Math.hypot(b[0] - u, b[1] - v) < P.ball * 2 + 0.002) return false;
  }
  return true;
}

/** How many of its group each side has potted. */
export function potted(s: PoolState): [number, number] {
  const count = (g: number) => (g ? s.balls.filter((b, n) => groupOf(n) === g && !b[4]).length : 0);
  return [count(s.groups[0]), count(s.groups[1])];
}

/** How many of a group are still on the table. */
const left = (s: PoolState, g: number) => s.balls.filter((b, n) => groupOf(n) === g && b[4]).length;

/** Whether ball `n` is a fair first ball to hit for the side to play. */
function fairFirst(s: PoolState, n: number): boolean {
  const g = s.groups[s.turn];
  if (!g) return n !== 8;
  if (left(s, g) === 0) return n === 8;
  return groupOf(n) === g;
}

/** Everything's stopped: what the shot comes to (whose turn, fouls, groups, the match). */
export function settle(s: PoolState) {
  const turn = s.turn;
  const other = (1 - turn) as Side;
  const down = s.down;
  const scratch = down.includes(0);
  // Whether the first ball hit was fair, judged on the groups as they stood before the shot.
  const g0 = s.groups[turn];
  const ownLeftBefore = g0 ? left(s, g0) + down.filter((n) => groupOf(n) === g0).length : 7;
  let wrong: boolean;
  if (s.first === -1) wrong = true;
  else if (!g0) wrong = s.first === 8;
  else if (ownLeftBefore === 0) wrong = s.first !== 8;
  else wrong = groupOf(s.first) !== g0;
  const foul = scratch || wrong;
  s.note = scratch ? NOTE.scratch : s.first === -1 ? NOTE.noHit : wrong ? NOTE.wrongFirst : NOTE.none;
  if (down.includes(8)) {
    const cleared = g0 !== 0 && ownLeftBefore === 0;
    s.win = !foul && cleared ? turn : other;
    s.note = s.win === turn ? NOTE.eight : NOTE.eightEarly;
    s.phase = POOL_PHASE.over;
    s.score = potted(s);
    return;
  }
  // The table's open, and something of a group went down fairly: that group is theirs.
  if (!g0 && !foul) {
    const firstIn = down.find((n) => groupOf(n) !== 0);
    if (firstIn !== undefined) {
      const g = groupOf(firstIn);
      s.groups[turn] = g;
      s.groups[other] = g === 1 ? 2 : 1;
      s.note = NOTE.groups;
    }
  }
  const mine = s.groups[turn];
  const pottedOwn = down.some((n) => (mine ? groupOf(n) === mine : groupOf(n) !== 0));
  if (!foul && pottedOwn) {
    if (s.note === NOTE.none) s.note = NOTE.potted;
  } else {
    if (!foul) s.note = NOTE.missed;
    s.turn = other;
  }
  // A foul: the other player has the cue ball in hand, behind the head string.
  s.hand = foul;
  if (foul) placeCue(s);
  s.score = potted(s);
  s.phase = POOL_PHASE.aim;
  s.first = -1;
  s.down = [];
  s.think = 0;
}

/** The cue ball back on the table behind the head string, somewhere free. */
function placeCue(s: PoolState) {
  const P = POOL;
  for (let k = 0; k < 40; k++) {
    const u = P.kitchen - 0.15 - (k % 5) * 0.06;
    const v = (Math.floor(k / 5) % 2 ? -1 : 1) * Math.floor(k / 10) * 0.08;
    if (canPlace(s, u, v)) {
      s.balls[0] = [u, v, 0, 0, 1];
      return;
    }
  }
  s.balls[0] = [P.kitchen - 0.15, 0, 0, 0, 1];
}

/** Runs the balls on by `h` seconds: rolling, knocking into each other and the cushions, dropping. */
function roll(s: PoolState, h: number, ev: number[]) {
  const P = POOL;
  const B = s.balls;
  for (const b of B) {
    if (!b[4]) continue;
    b[0] += b[2] * h;
    b[1] += b[3] * h;
    const sp = Math.hypot(b[2], b[3]);
    if (sp > 0) {
      const slow = Math.max(0, sp - P.friction * h) / sp;
      b[2] *= slow;
      b[3] *= slow;
    }
  }
  // Into each other: equal balls, nearly elastic.
  for (let i = 0; i < 16; i++) {
    const a = B[i];
    if (!a[4]) continue;
    for (let j = i + 1; j < 16; j++) {
      const b = B[j];
      if (!b[4]) continue;
      const du = b[0] - a[0];
      const dv = b[1] - a[1];
      const d2 = du * du + dv * dv;
      const D = P.ball * 2;
      if (d2 >= D * D || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nu = du / d;
      const nv = dv / d;
      const push = (D - d) / 2;
      a[0] -= nu * push;
      a[1] -= nv * push;
      b[0] += nu * push;
      b[1] += nv * push;
      const rel = (a[2] - b[2]) * nu + (a[3] - b[3]) * nv;
      if (rel <= 0) continue;
      const j2 = rel * 0.97;
      a[2] -= j2 * nu;
      a[3] -= j2 * nv;
      b[2] += j2 * nu;
      b[3] += j2 * nv;
      if (i === 0 && s.first === -1) s.first = j;
      if (rel > 0.05) emit(ev, EV.click, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
  }
  // Down a pocket, or off a cushion.
  B.forEach((b, n) => {
    if (!b[4]) return;
    for (const p of POCKETS) {
      if (Math.hypot(b[0] - p.u, b[1] - p.v) < p.r) {
        b[4] = 0;
        b[2] = b[3] = 0;
        b[0] = p.u;
        b[1] = p.v;
        s.down.push(n);
        emit(ev, EV.pocket, p.u, p.v);
        return;
      }
    }
    const wu = P.halfL - P.ball;
    const wv = P.halfW - P.ball;
    if (Math.abs(b[0]) > wu) {
      b[0] = Math.sign(b[0]) * wu;
      if (b[0] * b[2] > 0) {
        if (Math.abs(b[2]) > 0.15) emit(ev, EV.wall, b[0], b[1]);
        b[2] = -b[2] * 0.78;
      }
    }
    if (Math.abs(b[1]) > wv) {
      b[1] = Math.sign(b[1]) * wv;
      if (b[1] * b[3] > 0) {
        if (Math.abs(b[3]) > 0.15) emit(ev, EV.wall, b[0], b[1]);
        b[3] = -b[3] * 0.78;
      }
    }
  });
}

/** Whether anything's still rolling. */
const rolling = (s: PoolState) => s.balls.some((b) => b[4] && (Math.abs(b[2]) > 0.004 || Math.abs(b[3]) > 0.004));

/** How far the segment from (au, av) to (bu, bv) passes from (pu, pv). */
function segDist(au: number, av: number, bu: number, bv: number, pu: number, pv: number): number {
  const du = bu - au;
  const dv = bv - av;
  const l2 = du * du + dv * dv;
  const t = l2 ? clamp(((pu - au) * du + (pv - av) * dv) / l2, 0, 1) : 0;
  return Math.hypot(au + du * t - pu, av + dv * t - pv);
}

/** Whether a ball could roll from a to b without touching any ball but those in `skip`. */
function clear(s: PoolState, au: number, av: number, bu: number, bv: number, skip: number[]): boolean {
  for (let i = 0; i < 16; i++) {
    if (skip.includes(i) || !s.balls[i][4]) continue;
    if (segDist(au, av, bu, bv, s.balls[i][0], s.balls[i][1]) < POOL.ball * 2) return false;
  }
  return true;
}

/**
 * The computer's best shot from where the cue ball is: at one of its balls (any but the 8 while
 * the table's open), into whichever pocket it's lined up best for, with nothing in the way. An
 * angle and how hard, and how good it looks (higher is better; below zero, no clean shot).
 */
export function bestShot(s: PoolState, cu = s.balls[0][0], cv = s.balls[0][1]): { angle: number; power: number; value: number } {
  const P = POOL;
  let best = { angle: 0, power: 0.5, value: -Infinity };
  for (let n = 1; n < 16; n++) {
    const b = s.balls[n];
    if (!b[4] || !fairFirst(s, n)) continue;
    // Something to fall back on: straight at it, firmly.
    const straight = Math.atan2(b[1] - cv, b[0] - cu);
    const d0 = Math.hypot(b[0] - cu, b[1] - cv);
    if (best.value === -Infinity || -d0 - 10 > best.value) best = { angle: straight, power: 0.55, value: -d0 - 10 };
    for (const p of POCKETS) {
      const tu = p.u - b[0];
      const tv = p.v - b[1];
      const tl = Math.hypot(tu, tv);
      // Where the cue ball has to be as it hits: a ball's width back from it, away from the pocket.
      const gu = b[0] - (tu / tl) * P.ball * 2;
      const gv = b[1] - (tv / tl) * P.ball * 2;
      const cu2 = gu - cu;
      const cv2 = gv - cv;
      const cl = Math.hypot(cu2, cv2);
      if (cl < 1e-6) continue;
      // How much it has to be cut: straight on is 1, a glance is near 0.
      const cut = (cu2 * tu + cv2 * tv) / (cl * tl);
      if (cut < 0.3) continue;
      if (!clear(s, cu, cv, gu, gv, [0, n]) || !clear(s, b[0], b[1], p.u, p.v, [0, n])) continue;
      const value = cut * 3 - (cl + tl) * 0.6;
      if (value > best.value) {
        const power = clamp(0.3 + (cl + tl / Math.max(cut, 0.4)) * 0.18, 0.3, 0.95);
        best = { angle: Math.atan2(cv2, cu2), power, value };
      }
    }
  }
  return best;
}

/** Where the computer puts the cue ball in hand: wherever behind the line leaves it the best shot. */
export function bestPlace(s: PoolState): [number, number] {
  const P = POOL;
  let best: [number, number] = [P.kitchen - 0.15, 0];
  let value = -Infinity;
  for (let u = -P.halfL + 0.12; u <= P.kitchen; u += 0.1) {
    for (let v = -P.halfW + 0.1; v <= P.halfW - 0.1; v += 0.1) {
      if (!canPlace(s, u, v)) continue;
      const shot = bestShot(s, u, v);
      if (shot.value > value) {
        value = shot.value;
        best = [u, v];
      }
    }
  }
  return best;
}

export const pool: TableGame<PoolState> = {
  id: 'pool',
  init(rng) {
    return { balls: rack(rng), turn: 0, groups: [0, 0], phase: POOL_PHASE.aim, hand: true, aim: [0, 0], first: -1, down: [], note: NOTE.none, think: 0, score: [0, 0], win: -1 };
  },
  input(s, side, a) {
    if (s.phase !== POOL_PHASE.aim || side !== s.turn || s.win !== -1) return;
    if (a[0] === 0 && a.length >= 3) s.aim = [a[1], clamp(a[2], 0, 1)];
    else if (a[0] === 2 && a.length >= 3 && s.hand) {
      if (canPlace(s, a[1], a[2])) s.balls[0] = [a[1], a[2], 0, 0, 1];
    } else if (a[0] === 1 && a.length >= 3) {
      const power = clamp(a[2], 0, 1);
      if (power < 0.03) return;
      const speed = power * POOL.maxShot;
      const c = s.balls[0];
      c[2] = Math.cos(a[1]) * speed;
      c[3] = Math.sin(a[1]) * speed;
      s.aim = [a[1], 0];
      s.hand = false;
      s.phase = POOL_PHASE.rolling;
      s.struck = true;
      s.first = -1;
      s.down = [];
      s.note = NOTE.none;
    }
  },
  step(s, dt, ev) {
    if (s.phase !== POOL_PHASE.rolling) return;
    if (s.struck) {
      s.struck = false;
      emit(ev, EV.hit, s.balls[0][0], s.balls[0][1]);
    }
    const n = Math.max(1, Math.ceil(dt / 0.002));
    const h = dt / n;
    for (let i = 0; i < n; i++) roll(s, h, ev);
    if (!rolling(s)) {
      for (const b of s.balls) b[2] = b[3] = 0;
      settle(s);
      if (s.win !== -1) emit(ev, EV.win, 0, 0);
      else if (s.note === NOTE.scratch || s.note === NOTE.wrongFirst || s.note === NOTE.noHit) emit(ev, EV.foul, 0, 0);
    }
  },
  cpu(s, side, dt, rng) {
    if (s.phase !== POOL_PHASE.aim || s.turn !== side || s.win !== -1) return [];
    s.think += dt;
    const out: number[][] = [];
    if (s.hand && s.think > 0.8 && s.think - dt <= 0.8) {
      const [u, v] = bestPlace(s);
      out.push([2, u, v]);
    }
    if (s.think > 1.2) {
      const shot = bestShot(s);
      // Lining it up: the cue comes round to it and draws back.
      const k = clamp((s.think - 1.2) / 1.2, 0, 1);
      const angle = shot.angle + (rng() - 0.5) * 0.02;
      if (k < 1) out.push([0, shot.angle, shot.power * k]);
      else out.push([1, angle, shot.power]);
    }
    return out;
  },
  encode(s) {
    const out: number[] = [];
    for (const b of s.balls) out.push(r4(b[0]), r4(b[1]), r4(b[2]), r4(b[3]), b[4] ? 1 : 0);
    out.push(s.turn, s.groups[0], s.groups[1], s.phase, s.hand ? 1 : 0, r4(s.aim[0]), r4(s.aim[1]), s.first, s.note, r4(s.think), s.score[0], s.score[1], s.win);
    return out;
  },
  decode(a) {
    const n = (i: number) => a[i] ?? 0;
    const balls: number[][] = [];
    for (let i = 0; i < 16; i++) balls.push([n(i * 5), n(i * 5 + 1), n(i * 5 + 2), n(i * 5 + 3), n(i * 5 + 4) ? 1 : 0]);
    const at = 80;
    return {
      balls,
      turn: n(at) === 1 ? 1 : 0,
      groups: [n(at + 1), n(at + 2)],
      phase: n(at + 3),
      hand: n(at + 4) === 1,
      aim: [n(at + 5), n(at + 6)],
      first: n(at + 7),
      down: [],
      note: n(at + 8),
      think: n(at + 9),
      score: [n(at + 10), n(at + 11)],
      win: (n(at + 12) === 0 || n(at + 12) === 1 ? n(at + 12) : -1) as -1 | 0 | 1,
    };
  },
};

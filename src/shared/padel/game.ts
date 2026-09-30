// Padel, the game itself (flrnoh fork, see FORK.md "Padel"): pure, so the office's tests can play it
// too. The court's host page runs it (the computer players included) and sends what it looks like
// to everyone in the hall; the other people on the court send their moves to the host.
//
// The ball: gravity, bounces off the floor and the glass (losing some of its speed each time), dies
// in the wire fence, and stops at the net. The rules, simplified but recognisable: an underhand
// serve after a bounce, diagonally into the service box across (two tries); after that the ball
// must come down once in the other half before it touches that half's walls; after the bounce it may
// come off the glass and be played; a second bounce, or the fence, and the point is over. Volleys
// are fine, except on the return of serve. Scoring in rules.ts.
//
// The players run on their own toward where the ball will be (or where you steer them), and swing
// when told: a swing meets the ball if it's in reach during it, and how well it's timed decides how
// hard and how true it goes back. Shift makes it a lob; a high ball near the net is smashed.

import { emit, type Rng } from '../tablegames/game.js';
import { clamp, r4 } from '../tablegames/tables.js';
import { BALL_R, HALF_L, HALF_W, PEV, SERVICE, SLOTS, backEdge, fwd, halfOf, homeSign, netHeight, sideEdge, teamOf, type Edge, type Slot, type Team } from './court.js';
import { awardPoint, receiverFor, serveFromRight, serverFor } from './rules.js';

export const PADEL = {
  gravity: 9.81,
  /** Off the floor: how much of the speed up it keeps, and of the speed along. */
  floorBounce: 0.7,
  floorGrip: 0.86,
  glassBounce: 0.72,
  glassGrip: 0.9,
  fenceBounce: 0.2,
  /** How fast people run (m/s), and get going. */
  run: 5.4,
  cpuRun: 4.9,
  accel: 24,
  /** How far from a player's middle a ball can be hit, how high, and how high for a smash near the net. */
  reach: 1.15,
  reachTop: 2.45,
  smashTop: 2.95,
  /** A swing: how long it looks for the ball, when it can first meet it, when is just right, the pause after. */
  swing: 0.36,
  early: 0.04,
  sweet: 0.13,
  cooldown: 0.18,
  /** Seconds between points, after a fault, before the computer serves, before someone's serve goes by itself. */
  pointPause: 1.9,
  faultPause: 1.1,
  cpuServeWait: 1.2,
  autoServe: 12,
  /** How often the players rethink where the ball's going (s). */
  think: 0.1,
} as const;

export const PHASE = { serve: 0, rally: 1, dead: 2 } as const;

/** A player: x, z, vx, vz, the swing's time left, and which way they face (a heading: 0 is +z). */
export type PlayerNums = [number, number, number, number, number, number];

export interface PadelState {
  /** The ball: x, y, z, vx, vy, vz (the court's frame). */
  b: [number, number, number, number, number, number];
  p: [PlayerNums, PlayerNums, PlayerNums, PlayerNums];
  /** How each player moves: 1 on their own (toward the ball), 0 steered (`dir`). */
  ctl: [number, number, number, number];
  dir: [[number, number], [number, number], [number, number], [number, number]];
  /** Where each wants their next shot to go (x, z) and whether it's a lob. */
  aim: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
  cool: [number, number, number, number];
  phase: number;
  server: Slot;
  /** On the second serve (after a fault). */
  second: number;
  /** Seconds since the server dropped the ball for the serve, or -1 while they haven't. */
  toss: number;
  /** Who hit it last (-1: nobody yet), and which of them. */
  last: -1 | Team;
  lastSlot: number;
  /** Floor bounces since the last hit, whether it's crossed the net since, and whether it's still the serve. */
  bounces: number;
  crossed: number;
  serveBall: number;
  pause: number;
  wait: number;
  games: [number, number];
  points: [number, number];
  /** The score as the table games have it (games), and who won the match. */
  score: [number, number];
  win: -1 | 0 | 1;
  hits: number;
  /** Which of each team goes for the ball (-1: neither). */
  chase: [number, number];
  /** Not sent: where each player's heading, when they last thought about it, and the computer's plan for the ball. */
  goal?: [number, number][];
  thinkIn?: number;
  plans?: ({ hits: number; whiff: boolean; lead: number; lob: boolean; x: number; depth: number } | null)[];
}

const sgn = (x: number) => (x < 0 ? -1 : 1);
/** The z-sign of a team's half: team 0 plays z > 0. */
const zs = (team: Team) => (team === 0 ? 1 : -1);
/** A team's right, as they face the net: team 0 faces -z, so +x. */
const rightSign = (team: Team) => (team === 0 ? 1 : -1);

/** Where a player may be: their own half, off the walls and the net. */
export function bounds(slot: Slot): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const w = HALF_W - 0.3;
  return teamOf(slot) === 0 ? { minX: -w, maxX: w, minZ: 0.45, maxZ: HALF_L - 0.3 } : { minX: -w, maxX: w, minZ: -HALF_L + 0.3, maxZ: -0.45 };
}

/** Where everyone stands for the serve about to come (the score says who serves, and from which side). */
export function serveSpots(s: Pick<PadelState, 'games' | 'points'>): [number, number][] {
  const server = serverFor(s.games);
  const t = teamOf(server);
  const sx = serveFromRight(s.points) ? rightSign(t) : -rightSign(t);
  const receiver = receiverFor(server, s.points);
  const out: [number, number][] = [];
  for (const slot of SLOTS) {
    if (slot === server) out.push([sx * 2.2, zs(t) * 8.2]);
    else if (teamOf(slot) === t) out.push([-sx * 2.5, zs(t) * 3.4]);
    else if (slot === receiver) out.push([-sx * 2.6, -zs(t) * 8.9]);
    else out.push([sx * 2.5, -zs(t) * 6.8]);
  }
  return out;
}

/** The service box a serve has to land in: the other half, net to service line, across from the server. */
export function serviceBox(s: Pick<PadelState, 'games' | 'points'>): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const t = teamOf(serverFor(s.games));
  const sx = serveFromRight(s.points) ? rightSign(t) : -rightSign(t);
  const bx = -sx;
  const z0 = -zs(t) * SERVICE;
  return { minX: bx > 0 ? 0 : -HALF_W, maxX: bx > 0 ? HALF_W : 0, minZ: Math.min(0, z0), maxZ: Math.max(0, z0) };
}

export function inBox(box: ReturnType<typeof serviceBox>, x: number, z: number): boolean {
  const e = 0.03;
  return x >= box.minX - e && x <= box.maxX + e && z >= box.minZ - e && z <= box.maxZ + e;
}

export function newPadel(): PadelState {
  const s: PadelState = {
    b: [0, -5, 0, 0, 0, 0],
    p: [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0, 0] as PlayerNums) as PadelState['p'],
    ctl: [1, 1, 1, 1],
    dir: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    aim: [0, 1, 2, 3].map((i) => [0, fwd(teamOf(i as Slot)) * 7, 0]) as PadelState['aim'],
    cool: [0, 0, 0, 0],
    phase: PHASE.serve,
    server: 0,
    second: 0,
    toss: -1,
    last: -1,
    lastSlot: -1,
    bounces: 0,
    crossed: 0,
    serveBall: 0,
    pause: 0,
    wait: 0,
    games: [0, 0],
    points: [0, 0],
    score: [0, 0],
    win: -1,
    hits: 0,
    chase: [-1, -1],
  };
  const spots = serveSpots(s);
  SLOTS.forEach((slot) => {
    s.p[slot][0] = spots[slot][0];
    s.p[slot][1] = spots[slot][1];
    s.p[slot][5] = teamOf(slot) === 0 ? Math.PI : 0;
  });
  readyServe(s);
  return s;
}

/** The next serve: who serves and from where, everyone on their spot, the ball in the server's hand. */
function readyServe(s: PadelState) {
  s.server = serverFor(s.games);
  s.phase = PHASE.serve;
  s.toss = -1;
  s.wait = 0;
  s.last = -1;
  s.lastSlot = -1;
  s.bounces = 0;
  s.crossed = 0;
  s.serveBall = 0;
  s.chase = [-1, -1];
  const spots = serveSpots(s);
  for (const slot of SLOTS) {
    const p = s.p[slot];
    p[0] = spots[slot][0];
    p[1] = spots[slot][1];
    p[2] = p[3] = p[4] = 0;
    p[5] = teamOf(slot) === 0 ? Math.PI : 0;
  }
  holdBall(s);
}

/** The server holds the ball out at their side, about hip high. */
function holdBall(s: PadelState) {
  const p = s.p[s.server];
  const t = teamOf(s.server);
  s.b = [p[0] + rightSign(t) * 0.35, 0.95, p[1] + fwd(t) * 0.3, 0, 0, 0];
}

function point(s: PadelState, team: Team, ev: number[]) {
  if (s.phase !== PHASE.rally && s.phase !== PHASE.serve) return;
  const r = awardPoint(s, team);
  s.score = [s.games[0], s.games[1]];
  s.phase = PHASE.dead;
  s.pause = PADEL.pointPause;
  s.second = 0;
  s.chase = [-1, -1];
  emit(ev, PEV.point, team, s.b[2]);
  if (r === 'game') emit(ev, PEV.game, team, 0);
  if (r === 'match') emit(ev, PEV.win, team, 0);
}

function fault(s: PadelState, ev: number[]) {
  if (s.second) return point(s, (1 - teamOf(s.server)) as Team, ev);
  emit(ev, PEV.fault, s.b[0], s.b[2]);
  s.second = 1;
  s.phase = PHASE.dead;
  s.pause = PADEL.faultPause;
}

/** Whether `team` may hit the ball now: it's on their side, it's theirs to play, not twice in a row, not the serve before its bounce. */
export function mayHit(s: PadelState, team: Team): boolean {
  if (s.phase !== PHASE.rally || s.last === team || s.last === -1) return false;
  if (halfOf(s.b[2]) !== team || !s.crossed || s.bounces >= 2) return false;
  if (s.serveBall && s.bounces === 0) return false;
  return true;
}

/** How high a player at z can reach: higher close to the net, where a smash is on. */
const topAt = (z: number) => (Math.abs(z) < 5.5 ? PADEL.smashTop : PADEL.reachTop);

// ---- The ball in the air -----------------------------------------------------------------------

/** A sample of where the ball goes, for the players' legs: time, place, bounces since the start. */
export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  bounced: number;
}

/**
 * Where the ball will go over the next `maxT` seconds, the rules left out: it falls, bounces off the
 * floor and the glass, and the path ends at the fence, the net or out of the court.
 */
export function flight(b: readonly number[], maxT: number, dt = 1 / 60): Sample[] {
  const out: Sample[] = [];
  const c = [...b];
  let bounced = 0;
  const sub = 2;
  const h = dt / sub;
  for (let t = dt; t <= maxT + 1e-9; t += dt) {
    for (let i = 0; i < sub; i++) {
      const was = c[2];
      c[0] += c[3] * h;
      c[1] += c[4] * h;
      c[2] += c[5] * h;
      c[4] -= PADEL.gravity * h;
      if (sgn(was) !== sgn(c[2]) && Math.abs(c[0]) <= HALF_W && c[1] - BALL_R < netHeight(c[0])) return out;
      if (c[1] <= BALL_R && c[4] < 0) {
        c[1] = BALL_R;
        c[4] = -c[4] * PADEL.floorBounce;
        c[3] *= PADEL.floorGrip;
        c[5] *= PADEL.floorGrip;
        bounced++;
      }
      if (Math.abs(c[0]) + BALL_R > HALF_W && c[3] * sgn(c[0]) > 0) {
        if (sideEdge(c[2], c[1]) !== 'glass') return out;
        c[0] = sgn(c[0]) * (HALF_W - BALL_R);
        c[3] = -c[3] * PADEL.glassBounce;
        c[4] *= PADEL.glassGrip;
        c[5] *= PADEL.glassGrip;
      }
      if (Math.abs(c[2]) + BALL_R > HALF_L && c[5] * sgn(c[2]) > 0) {
        if (backEdge(c[1]) !== 'glass') return out;
        c[2] = sgn(c[2]) * (HALF_L - BALL_R);
        c[5] = -c[5] * PADEL.glassBounce;
        c[3] *= PADEL.glassGrip;
        c[4] *= PADEL.glassGrip;
      }
    }
    out.push({ t, x: c[0], y: c[1], z: c[2], bounced });
  }
  return out;
}

/**
 * The launch speed that takes a ball from `b` to land at (tx, tz), over the net with room to spare:
 * horizontal speed `vh`, or `time` in the air if given (a lob). Returns vx, vy, vz.
 */
export function launch(bx: number, by: number, bz: number, tx: number, tz: number, o: { vh?: number; time?: number; clear?: number }): [number, number, number] {
  const g = PADEL.gravity;
  const dx = tx - bx;
  const dz = tz - bz;
  const dist = Math.max(0.5, Math.hypot(dx, dz));
  let T = o.time ?? dist / (o.vh ?? 12);
  const clear = o.clear ?? 0.15;
  let vy = 0;
  for (let i = 0; i < 40; i++) {
    vy = (BALL_R - by + 0.5 * g * T * T) / T;
    // Where it crosses the net, if it does: high enough there?
    if (sgn(bz) === sgn(tz) || dz === 0) break;
    const tn = (-bz / dz) * T;
    const yn = by + vy * tn - 0.5 * g * tn * tn;
    if (yn >= netHeight(bx + (dx * tn) / T) + BALL_R + clear) break;
    T *= 1.06;
  }
  return [dx / T, vy, dz / T];
}

/** Launch speed `v` from `b` changed to meet the net's tape or just under it. */
function intoNet(b: readonly number[], v: [number, number, number], rng: Rng) {
  if (Math.abs(v[2]) < 0.1 || sgn(b[2]) === sgn(b[2] + v[2])) return;
  const tn = Math.abs(b[2] / v[2]);
  const want = netHeight(b[0] + v[0] * tn) - 0.05 - rng() * 0.35;
  v[1] = (want - b[1] + 0.5 * PADEL.gravity * tn * tn) / tn;
}

/**
 * The ball off `slot`'s racket. `late` is how far into the swing it met the ball (s), `reachOff` how
 * far from the player it was: on time and at a comfortable reach it goes where they aimed, hard;
 * off and it floats, strays and now and then finds the net or the back wall on the full.
 */
export function hitBall(s: PadelState, slot: Slot, late: number, reachOff: number, rng: Rng, ev: number[]) {
  const P = PADEL;
  const team = teamOf(slot);
  const f = fwd(team);
  const b = s.b;
  const pz = s.p[slot][1];
  const timing = clamp(Math.abs(late - P.sweet) / 0.2, 0, 1);
  const place = clamp(Math.abs(reachOff - 0.65) / 0.6, 0, 1);
  const miss = clamp(0.7 * timing + 0.3 * place, 0, 1);
  const [ax, az, lob] = s.aim[slot];
  const smash = !lob && b[1] > 1.85 && Math.abs(pz) < 5.5;
  let tx = clamp(ax, -HALF_W + 0.7, HALF_W - 0.7);
  let depth = clamp(Math.abs(az) * (sgn(az) === sgn(f) ? 1 : 0.6), 2.4, HALF_L - 1);
  // Off target, more so the worse it's timed.
  tx += (rng() - 0.5) * 2 * (0.25 + 1.7 * miss);
  depth += (rng() - 0.5) * 2 * (0.3 + 1.5 * miss);
  const clear = 0.18 + 0.25 * (1 - miss);
  const err = rng();
  const netted = err < 0.03 + 0.25 * miss * miss; // into the net (see intoNet, below)
  if (!netted && err < 0.06 + 0.4 * miss * miss) depth = HALF_L + 1.5 + rng() * 2; // long: into their glass on the full
  tx = clamp(tx, -HALF_W + 0.15, HALF_W - 0.15);
  depth = clamp(depth, 1.2, HALF_L + 4);
  if (lob) depth = clamp(depth, 7.4, HALF_L + 4);
  const tz = f * depth;
  let v: [number, number, number];
  if (lob) v = launch(b[0], b[1], b[2], tx, tz, { time: 1.75 + rng() * 0.35 + 0.4 * miss, clear });
  else if (smash) v = launch(b[0], b[1], b[2], tx, f * clamp(depth, 4.5, HALF_L + 4), { vh: 19 - 5 * miss, clear });
  else v = launch(b[0], b[1], b[2], tx, tz, { vh: 14 - 5 * miss, clear });
  if (netted) intoNet(b, v, rng);
  b[3] = v[0];
  b[4] = v[1];
  b[5] = v[2];
  s.last = team;
  s.lastSlot = slot;
  s.bounces = 0;
  s.crossed = 0;
  s.serveBall = 0;
  s.p[slot][4] = 0;
  s.cool[slot] = P.cooldown;
  s.hits++;
  s.chase = [-1, -1];
  s.thinkIn = 0;
  emit(ev, smash ? PEV.smash : PEV.hit, b[0], b[2]);
}

/** The serve: underhand, off the bounce, diagonally into the box across. */
function serveBall(s: PadelState, rng: Rng, ev: number[]) {
  const slot = s.server;
  const team = teamOf(slot);
  const box = serviceBox(s);
  const [ax, az] = s.aim[slot];
  const m = 0.45;
  let tx = clamp(ax, box.minX + m, box.maxX - m);
  // Into the box, not too near the net.
  const dir = fwd(team);
  let tz = dir * clamp(sgn(az) === dir ? Math.abs(az) : 4.5, 2.6, SERVICE - m);
  tx += (rng() - 0.5) * 0.6;
  tz += (rng() - 0.5) * 0.8;
  const err = rng();
  if (err < 0.03) tz += fwd(team) * (1.2 + rng()); // long, past the service line
  else if (err < 0.05) tx = sgn(tx) * -0.4; // across the middle line
  const v = launch(s.b[0], s.b[1], s.b[2], tx, tz, { vh: 10.5, clear: 0.2 });
  if (err >= 0.05 && err < 0.065) intoNet(s.b, v, rng);
  s.b[3] = v[0];
  s.b[4] = v[1];
  s.b[5] = v[2];
  s.phase = PHASE.rally;
  s.serveBall = 1;
  s.last = team;
  s.lastSlot = slot;
  s.bounces = 0;
  s.crossed = 0;
  s.hits++;
  s.toss = -1;
  s.p[slot][4] = 0;
  s.cool[slot] = PADEL.cooldown;
  s.thinkIn = 0;
  emit(ev, PEV.serve, s.b[0], s.b[2]);
}

// ---- The players' legs -------------------------------------------------------------------------

/** Where a player stands to meet the ball at `q`: a little to its side, so it comes past the racket. */
function standFor(slot: Slot, px: number, q: Sample): [number, number] {
  const b = bounds(slot);
  const side = px >= q.x ? 1 : -1;
  return [clamp(q.x + side * 0.6, b.minX, b.maxX), clamp(q.z + zs(teamOf(slot)) * 0.2, b.minZ, b.maxZ)];
}

/** Whether a sample of the ball's path is one `team` could hit (after `already` bounces on their side). */
function hittable(s: PadelState, team: Team, q: Sample, already: number): boolean {
  if (halfOf(q.z) !== team) return false;
  const n = already + q.bounced;
  if (n >= 2) return false;
  if (n >= 1) return q.y >= 0.3 && q.y <= 1.6;
  if (s.serveBall) return false;
  return Math.abs(q.z) <= 6.5 && q.y >= 0.6 && q.y <= (Math.abs(q.z) < 5 ? 2.7 : 2.2);
}

/** Everyone's goal for now: the chasers toward the ball, the rest to where they'd wait. */
function think(s: PadelState) {
  const goal = (s.goal ??= SLOTS.map(() => [0, 0] as [number, number]));
  if (s.phase !== PHASE.rally) {
    const spots = serveSpots(s);
    for (const slot of SLOTS) goal[slot] = [spots[slot][0], spots[slot][1]];
    return;
  }
  const path = s.last === -1 ? [] : flight(s.b, 2.4);
  for (const team of [0, 1] as Team[]) {
    const mates = SLOTS.filter((x) => teamOf(x) === team);
    // Waiting spots: up at the net when we've just hit it over, back when it's coming at us.
    const attacking = s.last === team;
    for (const slot of mates) {
      const b = bounds(slot);
      const hz = zs(team) * (attacking ? 4.2 : 7.4);
      goal[slot] = [clamp(homeSign(slot) * 2.4, b.minX, b.maxX), hz];
    }
    if (attacking || s.last === -1) {
      s.chase[team] = -1;
      continue;
    }
    const already = halfOf(s.b[2]) === team ? s.bounces : 0;
    let best: { slot: Slot; t: number; late: number; at: [number, number] } | null = null;
    for (const slot of mates) {
      const p = s.p[slot];
      const speed = s.ctl[slot] ? PADEL.cpuRun : PADEL.run;
      let mine: { t: number; late: number; at: [number, number] } | null = null;
      for (const q of path) {
        if (q.t < 0.05 || !hittable(s, team, q, already)) continue;
        const at = standFor(slot, p[0], q);
        const need = Math.max(0, Math.hypot(at[0] - p[0], at[1] - p[1]) - 0.2) / speed + 0.08;
        const late = need - q.t;
        if (late <= 0) {
          mine = { t: q.t, late, at };
          break;
        }
        if (!mine || late < mine.late) mine = { t: q.t, late, at };
      }
      if (!mine) continue;
      // Stick with who was going already, unless the other is clearly better placed.
      const bias = s.chase[team] === slot ? -0.12 : 0;
      const score = (mine.late > 0 ? 10 + mine.late : mine.t) + bias;
      const bestScore = best ? (best.late > 0 ? 10 + best.late : best.t) + (s.chase[team] === best.slot ? -0.12 : 0) : Infinity;
      if (score < bestScore) best = { slot, ...mine };
    }
    s.chase[team] = best ? best.slot : -1;
    if (best) goal[best.slot] = best.at;
  }
}

function movePlayers(s: PadelState, h: number) {
  const goal = s.goal;
  for (const slot of SLOTS) {
    const p = s.p[slot];
    const b = bounds(slot);
    let wx = 0;
    let wz = 0;
    const steered = !s.ctl[slot] && s.phase === PHASE.rally;
    const speed = steered ? PADEL.run : PADEL.cpuRun;
    if (steered) {
      const [dx, dz] = s.dir[slot];
      const n = Math.hypot(dx, dz);
      if (n > 0.01) {
        wx = (dx / n) * speed;
        wz = (dz / n) * speed;
      }
    } else if (goal) {
      const dx = goal[slot][0] - p[0];
      const dz = goal[slot][1] - p[1];
      const d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const v = Math.min(speed * (s.phase === PHASE.rally ? 1 : 0.8), d * 5);
        wx = (dx / d) * v;
        wz = (dz / d) * v;
      }
    }
    // Speeding up and slowing down, not all at once.
    const ax = wx - p[2];
    const az = wz - p[3];
    const a = Math.hypot(ax, az);
    const max = PADEL.accel * h;
    const k = a > max ? max / a : 1;
    p[2] += ax * k;
    p[3] += az * k;
    p[0] = clamp(p[0] + p[2] * h, b.minX, b.maxX);
    p[1] = clamp(p[1] + p[3] * h, b.minZ, b.maxZ);
    // Facing the ball while it's in play, else the net.
    const team = teamOf(slot);
    let face = team === 0 ? Math.PI : 0;
    if (s.phase === PHASE.rally && s.b[1] > -1) {
      const dx = s.b[0] - p[0];
      const dz = s.b[2] - p[1];
      if (Math.hypot(dx, dz) > 0.4) face = Math.atan2(dx, dz);
      // Never with their back to the net.
      const net = team === 0 ? Math.PI : 0;
      let d = Math.atan2(Math.sin(face - net), Math.cos(face - net));
      d = clamp(d, -1.3, 1.3);
      face = net + d;
    }
    let turn = Math.atan2(Math.sin(face - p[5]), Math.cos(face - p[5]));
    turn = clamp(turn, -10 * h, 10 * h);
    p[5] += turn;
    if (p[4] > 0) p[4] = Math.max(0, p[4] - h);
    if (s.cool[slot] > 0) s.cool[slot] = Math.max(0, s.cool[slot] - h);
  }
}

// ---- The ball, and the rules ---------------------------------------------------------------------

/** The ball met the court's edge (a wall at `half`'s end or side) and what's there. */
function edgeRule(s: PadelState, edge: Edge, half: Team, ev: number[]) {
  if (s.phase !== PHASE.rally) return;
  const hitter = s.last as Team;
  if (edge === 'glass') {
    if (s.bounces > 0) return;
    if (s.serveBall) return fault(s, ev);
    // Straight into their walls, before the bounce: out.
    if (half !== hitter) point(s, (1 - hitter) as Team, ev);
    return;
  }
  // The fence, or out of the court.
  if (s.serveBall) return s.bounces > 0 && edge === 'open' ? point(s, hitter, ev) : fault(s, ev);
  point(s, s.bounces > 0 ? hitter : ((1 - hitter) as Team), ev);
}

function moveBall(s: PadelState, h: number, ev: number[]) {
  const b = s.b;
  if (b[1] < -2) return;
  const was = [b[0], b[1], b[2]];
  b[0] += b[3] * h;
  b[1] += b[4] * h;
  b[2] += b[5] * h;
  b[4] -= PADEL.gravity * h;
  const live = s.phase === PHASE.rally;
  // The net: over it, or into it and down.
  if (sgn(was[2]) !== sgn(b[2]) && Math.abs(b[0]) <= HALF_W + 0.05) {
    if (b[1] - BALL_R < netHeight(b[0])) {
      b[2] = sgn(was[2]) * (BALL_R + 0.02);
      b[5] = -b[5] * 0.12;
      b[3] *= 0.4;
      b[4] = Math.min(b[4], 0) * 0.5;
      emit(ev, PEV.net, b[0], 0);
    } else if (live && s.last !== -1) {
      if (halfOf(b[2]) !== s.last) s.crossed = 1;
      // Back over the net after its bounce on their side: they couldn't get it.
      else if (s.bounces > 0) return point(s, s.last, ev);
    }
  }
  // The floor.
  if (b[1] <= BALL_R && b[4] < 0) {
    const speed = -b[4];
    b[1] = BALL_R;
    b[4] = speed < 0.4 ? 0 : speed * PADEL.floorBounce;
    b[3] *= PADEL.floorGrip;
    b[5] *= PADEL.floorGrip;
    if (speed > 0.9) emit(ev, PEV.bounce, b[0], b[2]);
    if (live && s.last !== -1) {
      const half = halfOf(b[2]);
      const hitter = s.last;
      if (s.serveBall && s.bounces === 0) {
        if (half !== hitter && inBox(serviceBox(s), b[0], b[2])) s.bounces = 1;
        else return fault(s, ev);
      } else if (half === hitter) {
        return point(s, (1 - hitter) as Team, ev);
      } else if (++s.bounces >= 2) return point(s, hitter, ev);
    }
  }
  // The walls: glass sends it back, the fence stops it dead, an opening or over the top lets it out.
  const inside = Math.abs(was[0]) <= HALF_W + 0.01 && Math.abs(was[2]) <= HALF_L + 0.01;
  if (inside && Math.abs(b[0]) + BALL_R > HALF_W && b[3] * sgn(b[0]) > 0) {
    const edge = sideEdge(b[2], b[1]);
    if (edge !== 'open') {
      b[0] = sgn(b[0]) * (HALF_W - BALL_R);
      b[3] = -b[3] * (edge === 'glass' ? PADEL.glassBounce : PADEL.fenceBounce);
      const k = edge === 'glass' ? PADEL.glassGrip : 0.5;
      b[4] *= k;
      b[5] *= k;
      emit(ev, edge === 'glass' ? PEV.glass : PEV.fence, b[0], b[2]);
      edgeRule(s, edge, halfOf(b[2]), ev);
    }
  }
  if (inside && Math.abs(b[2]) + BALL_R > HALF_L && b[5] * sgn(b[2]) > 0) {
    const edge = backEdge(b[1]);
    if (edge !== 'open') {
      b[2] = sgn(b[2]) * (HALF_L - BALL_R);
      b[5] = -b[5] * (edge === 'glass' ? PADEL.glassBounce : PADEL.fenceBounce);
      const k = edge === 'glass' ? PADEL.glassGrip : 0.5;
      b[3] *= k;
      b[4] *= k;
      emit(ev, edge === 'glass' ? PEV.glass : PEV.fence, b[0], b[2]);
      edgeRule(s, edge, halfOf(b[2]), ev);
    }
  }
  // Out of the court altogether.
  if (Math.abs(b[0]) > HALF_W + 0.4 || Math.abs(b[2]) > HALF_L + 0.4) {
    if (live && s.last !== -1) {
      emit(ev, PEV.out, b[0], b[2]);
      edgeRule(s, 'open', halfOf(b[2]), ev);
    }
    if (Math.abs(b[0]) > HALF_W + 3 || Math.abs(b[2]) > HALF_L + 3 || b[1] < 0) b[1] = -5;
  }
}

/** How long until the ball (at rx, rz from someone, going vx, vz) is closest to them, across the floor. */
function closest(rx: number, rz: number, vx: number, vz: number): number {
  const vv = vx * vx + vz * vz;
  return vv > 1e-6 ? -(rx * vx + rz * vz) / vv : 0;
}

/** A player's racket meets the ball, if they're swinging and it's there to hit. */
function swings(s: PadelState, rng: Rng, ev: number[]) {
  if (s.phase !== PHASE.rally) return;
  const b = s.b;
  for (const slot of SLOTS) {
    const p = s.p[slot];
    if (p[4] <= 0) continue;
    const late = PADEL.swing - p[4];
    if (late < PADEL.early) continue;
    const team = teamOf(slot);
    if (!mayHit(s, team)) continue;
    const rx = b[0] - p[0];
    const rz = b[2] - p[1];
    const d = Math.hypot(rx, rz);
    if (d > PADEL.reach || b[1] < 0.05 || b[1] > topAt(p[1])) continue;
    // Still coming closer, and the swing lasts till then: the racket meets it there.
    const tc = closest(rx, rz, b[3], b[5]);
    if (tc > 0.006 && late + tc < PADEL.swing) {
      const cy = b[1] + b[4] * tc - 0.5 * PADEL.gravity * tc * tc;
      if (Math.hypot(rx + b[3] * tc, rz + b[5] * tc) <= PADEL.reach && cy >= 0.05) continue;
    }
    hitBall(s, slot, late, d, rng, ev);
    return;
  }
}

// ---- The game, for the host --------------------------------------------------------------------

export const padel = {
  init(): PadelState {
    return newPadel();
  },
  /**
   * A move from `slot`: [0, dx, dz, auto] how they move (auto 1: on their own; else steered along
   * dx, dz, the court's frame), [1, x, z, lob] a swing aimed at (x, z), [2, x, z, lob] just the aim.
   */
  input(s: PadelState, slot: Slot, a: readonly number[]) {
    if (a[0] === 0) {
      s.ctl[slot] = a[3] ? 1 : 0;
      s.dir[slot] = [clamp(a[1] ?? 0, -1, 1), clamp(a[2] ?? 0, -1, 1)];
    } else if (a[0] === 1 || a[0] === 2) {
      s.aim[slot] = [clamp(a[1] ?? 0, -HALF_W, HALF_W), clamp(a[2] ?? 0, -HALF_L - 4, HALF_L + 4), a[3] ? 1 : 0];
      if (a[0] !== 1) return;
      if (s.phase === PHASE.serve) {
        if (slot === s.server && s.toss < 0) s.toss = 0;
        return;
      }
      if (s.p[slot][4] > 0 || s.cool[slot] > 0 || s.phase !== PHASE.rally) return;
      s.p[slot][4] = PADEL.swing;
    }
  },
  /** Runs the game on by `dt` seconds; what happened goes into `ev` (see PEV). */
  step(s: PadelState, dt: number, ev: number[], rng: Rng) {
    if (s.win !== -1) {
      const n = Math.max(1, Math.ceil(dt / 0.004));
      for (let i = 0; i < n; i++) moveBall(s, dt / n, ev);
      return;
    }
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.thinkIn = (s.thinkIn ?? 0) - h;
      if (s.thinkIn <= 0) {
        s.thinkIn = PADEL.think;
        think(s);
      }
      movePlayers(s, h);
      if (s.phase === PHASE.dead) {
        s.pause -= h;
        moveBall(s, h, ev);
        if (s.pause <= 0 && s.win === -1) readyServe(s);
        continue;
      }
      if (s.phase === PHASE.serve) {
        s.wait += h;
        if (s.toss < 0) {
          holdBall(s);
          continue;
        }
        // Dropped, and struck as it comes back up off the floor.
        s.toss += h;
        const b = s.b;
        b[1] += b[4] * h;
        b[4] -= PADEL.gravity * h;
        if (b[1] <= BALL_R && b[4] < 0) {
          b[1] = BALL_R;
          b[4] = -b[4] * PADEL.floorBounce;
          emit(ev, PEV.bounce, b[0], b[2]);
        }
        if (s.toss > 0.56) serveBall(s, rng, ev);
        continue;
      }
      moveBall(s, h, ev);
      if (s.phase === PHASE.rally) swings(s, rng, ev);
      // A ball that's stopped rolling in play: whoever it's lying with lost it.
      if (s.phase === PHASE.rally && s.b[1] <= BALL_R + 1e-3 && Math.hypot(s.b[3], s.b[5]) < 0.2 && s.last !== -1) {
        point(s, halfOf(s.b[2]) === s.last ? ((1 - s.last) as Team) : s.last, ev);
      }
    }
  },
  /** The computer's swings for `slot` this frame, if any (its legs are the game's, see think). */
  cpu(s: PadelState, slot: Slot, rng: Rng): number[][] {
    const team = teamOf(slot);
    const plans = (s.plans ??= [null, null, null, null]);
    if (s.phase === PHASE.serve) {
      if (s.server !== slot || s.toss >= 0 || s.wait < PADEL.cpuServeWait) return [];
      const box = serviceBox(s);
      const x = box.minX + (box.maxX - box.minX) * (0.25 + rng() * 0.5);
      const z = sgn(box.minZ + box.maxZ) * (3.5 + rng() * 2.5);
      return [[1, x, z, 0]];
    }
    if (s.phase !== PHASE.rally || !mayHit(s, team) || s.p[slot][4] > 0 || s.cool[slot] > 0) return [];
    let plan = plans[slot];
    if (!plan || plan.hits !== s.hits) {
      // Where to put it: away from whoever's nearer on the other side, deep mostly; a lob now and then at net players.
      const opp = SLOTS.filter((o) => teamOf(o) !== team).map((o) => s.p[o]);
      const atNet = opp.some((o) => Math.abs(o[1]) < 4.8);
      const gapX = -sgn(opp[0][0] + opp[1][0] || rng() - 0.5) * (1.5 + rng() * 2.4);
      plan = plans[slot] = {
        hits: s.hits,
        whiff: rng() < 0.1,
        lead: PADEL.sweet + (rng() - 0.5) * 0.12,
        lob: atNet && rng() < 0.18,
        x: rng() < 0.6 ? gapX : (rng() - 0.5) * 7,
        depth: 5.5 + rng() * 3.4,
      };
    }
    if (plan.whiff) return [];
    // Swing so the racket comes through as the ball comes past.
    const b = s.b;
    const p = s.p[slot];
    const rx = b[0] - p[0];
    const rz = b[2] - p[1];
    const tc = closest(rx, rz, b[3], b[5]);
    if (tc < 0 || tc > plan.lead) return [];
    if (Math.hypot(rx + b[3] * tc, rz + b[5] * tc) > PADEL.reach * 0.9) return [];
    const cy = b[1] + b[4] * tc - 0.5 * PADEL.gravity * tc * tc;
    if (cy > topAt(p[1]) || halfOf(b[2] + b[5] * tc) !== team) return [];
    return [[1, plan.x, fwd(team) * plan.depth, plan.lob ? 1 : 0]];
  },
  encode(s: PadelState): number[] {
    return [
      ...s.b,
      ...s.p.flat(),
      s.phase,
      s.server,
      s.second,
      s.toss,
      s.last,
      s.lastSlot,
      s.bounces,
      s.crossed,
      s.serveBall,
      s.pause,
      s.wait,
      s.games[0],
      s.games[1],
      s.points[0],
      s.points[1],
      s.win,
      s.hits,
      s.chase[0],
      s.chase[1],
      ...s.ctl,
    ].map(r4);
  },
  decode(a: readonly number[]): PadelState {
    const n = (i: number) => (Number.isFinite(a[i]) ? a[i] : 0);
    const slot = (x: number): Slot => (x === 1 || x === 2 || x === 3 ? x : 0);
    const team = (x: number): -1 | Team => (x === 0 || x === 1 ? x : -1);
    const s = newPadel();
    s.b = [n(0), n(1), n(2), n(3), n(4), n(5)];
    for (let i = 0; i < 4; i++) s.p[i] = [n(6 + i * 6), n(7 + i * 6), n(8 + i * 6), n(9 + i * 6), n(10 + i * 6), n(11 + i * 6)];
    s.phase = n(30);
    s.server = slot(n(31));
    s.second = n(32) ? 1 : 0;
    s.toss = n(33);
    s.last = team(n(34));
    s.lastSlot = n(35);
    s.bounces = n(36);
    s.crossed = n(37) ? 1 : 0;
    s.serveBall = n(38) ? 1 : 0;
    s.pause = n(39);
    s.wait = n(40);
    s.games = [n(41), n(42)];
    s.points = [n(43), n(44)];
    s.score = [s.games[0], s.games[1]];
    const w = team(n(45));
    s.win = w;
    s.hits = n(46);
    s.chase = [n(47), n(48)];
    s.ctl = [a[49] ?? 1, a[50] ?? 1, a[51] ?? 1, a[52] ?? 1].map((x) => (x ? 1 : 0)) as PadelState['ctl'];
    s.thinkIn = 0;
    return s;
  },
};

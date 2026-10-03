// Beach volleyball on Sunset Beach (flrnoh fork, see FORK.md "A day at the beach"): the court, how the
// ball flies, what a landing scores, and how the computer team plays. Pure numbers, so the office
// (server/volley.ts, which keeps the score and runs the computer team), the pages and the tests agree.
//
// The ball's flight is worked out, not stepped: from where it was hit, how fast and when, anyone can
// say where it is at any moment, where it comes down and whether it's caught in the net. So a hit is
// all that goes over the wire, and every page sees the same rally.
//
// Heights here are above the sand (the street, see beach.ts): every floor has its own beach.

/** The court: its middle, half its length (along z, the net across it) and width (x), the net's top. */
export const VOLLEY = {
  x: -241,
  z: 172,
  halfL: 8,
  halfW: 4,
  /** The net's top edge, above the sand. */
  net: 2.35,
  /** How far the net (and its posts) reaches out past each sideline. */
  netOver: 0.9,
} as const;

/** The two teams: 0 plays the end toward the lighthouse (z below the net), 1 the end toward the pier. */
export type VolleySide = 0 | 1;
export const TEAMS: readonly { name: string; icon: string; color: string }[] = [
  { name: 'Krabben', icon: '🦀', color: '#e76f51' },
  { name: 'Möwen', icon: '🐦', color: '#457b9d' },
];

export const BALL_R = 0.11;
/** A beach ball floats: gravity's a little gentler than it would be. */
export const GRAVITY = 7;
/** Points to win a set, ahead by two (at most CAP). */
export const WIN_AT = 15;
export const CAP = 21;

/** Reaching the ball: how far from your middle (along the sand), and from how low to how high (jumping adds your jump). */
export const REACH = { r: 1.5, low: 0.25, high: 2.7 } as const;

/** How long the ball lies after a point before the next serve, and before the computer serves (ms). */
export const PAUSE = 2600;
export const CPU_SERVE = 2200;
/** After a won set, the banner's up this long before 0:0 (ms). */
export const SET_PAUSE = 6000;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** A ball in the air: hit from `p` with velocity `v` at `t0` (the office's clock, ms), by side `side`. */
export interface Flight {
  p: Vec;
  v: Vec;
  t0: number;
  side: VolleySide;
}

export type HitKind = 'serve' | 'bump' | 'set' | 'spike';

/** Where the ball is between rallies, or in one. */
export type BallState =
  /** Nobody's playing: it lies in the sand by a post. */
  | { k: 'idle' }
  /** Over `side`'s serving spot, waiting for them to serve. */
  | { k: 'serve'; side: VolleySide }
  | { k: 'fly'; f: Flight; kind: HitKind; by: string }
  /** Down: where it landed, and the point it gave. */
  | { k: 'down'; x: number; y: number; z: number; won: VolleySide; why: 'in' | 'out' | 'net' };

/** A computer player: where it runs to (sand), and when it should be there (office clock, ms; 0 if just strolling). */
export interface NpcMove {
  x: number;
  z: number;
  at: number;
}

export interface VolleyState {
  score: [number, number];
  ball: BallState;
  /** Which sides the computer plays (both, for a show rally when nobody's on the court). */
  cpu: [boolean, boolean];
  /** The four computer players, two a side (0, 1 are team 0's): where they're headed. */
  npcs: [NpcMove, NpcMove, NpcMove, NpcMove];
  /** The last set's winner, while the banner's up; -1 otherwise. */
  won: -1 | VolleySide;
  /** Who's on which side of the court now (peer ids). */
  players: Record<string, VolleySide>;
}

export const NPC_NAMES = ['Kalle', 'Jette', 'Ole', 'Fiete'] as const;

export type VolleyClientMsg =
  /** Where you are about the court: on a side, near it (-1), or gone off (null). */
  | { t: 'volley.stand'; side: VolleySide | -1 | null }
  /** You hit the ball: from where it was, how fast it goes. */
  | { t: 'volley.hit'; p: Vec; v: Vec; kind: HitKind };

export type VolleyServerMsg = { t: 'volley'; state: VolleyState; by?: string };

// ---- The court --------------------------------------------------------------------------------

/** Which side of the net (x, z) is on. */
export const sideOf = (z: number): VolleySide => (z < VOLLEY.z ? 0 : 1);

/** Whether (x, z) is in the court (lines are in). */
export function inCourt(x: number, z: number): boolean {
  return Math.abs(x - VOLLEY.x) <= VOLLEY.halfW + BALL_R && Math.abs(z - VOLLEY.z) <= VOLLEY.halfL + BALL_R;
}

/** Where on (or about) the court someone at (x, z) is: a side, near it (-1), or off (null). */
export function standAt(x: number, z: number): VolleySide | -1 | null {
  const dx = Math.abs(x - VOLLEY.x);
  const dz = Math.abs(z - VOLLEY.z);
  if (dx <= VOLLEY.halfW + 2.5 && dz <= VOLLEY.halfL + 3.5) return sideOf(z);
  if (dx < 90 && dz < 90) return -1;
  return null;
}

/** Where side `side` serves from: behind its baseline, the ball held up. */
export function serveSpot(side: VolleySide): Vec {
  const s = side === 0 ? -1 : 1;
  return { x: VOLLEY.x, y: 1.25, z: VOLLEY.z + s * (VOLLEY.halfL + 1.2) };
}

/** Where the ball lies when nobody's playing: in the sand by a post. */
export const IDLE_SPOT: Vec = { x: VOLLEY.x + VOLLEY.halfW + 1.6, y: BALL_R, z: VOLLEY.z + 0.8 };

/** Where each computer player waits: a back and a front player a side. */
export function npcHome(i: number): { x: number; z: number } {
  const side: VolleySide = i < 2 ? 0 : 1;
  const s = side === 0 ? -1 : 1;
  const front = i % 2 === 1;
  return { x: VOLLEY.x + (front ? 1.2 : -1.2), z: VOLLEY.z + s * (front ? 2.4 : 5.6) };
}

/** Off the court, by the sideline: where a computer player waits while people play. */
export function npcBench(i: number): { x: number; z: number } {
  return { x: VOLLEY.x - VOLLEY.halfW - 3.2, z: VOLLEY.z - 3 + i * 2 };
}

export function freshState(): VolleyState {
  return {
    score: [0, 0],
    ball: { k: 'idle' },
    cpu: [false, false],
    npcs: [0, 1, 2, 3].map((i) => ({ ...npcBench(i), at: 0 })) as VolleyState['npcs'],
    won: -1,
    players: {},
  };
}

// ---- The ball ---------------------------------------------------------------------------------

/** Seconds after it was hit that a ball hit from height `y` going up at `vy` is back down to the sand. */
export function landTime(y: number, vy: number): number {
  const h = y - BALL_R;
  return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * h))) / GRAVITY;
}

/** Where a flight is `s` seconds after it was hit (ignoring the net and the sand). */
export function along(f: Flight, s: number): Vec {
  return { x: f.p.x + f.v.x * s, y: f.p.y + f.v.y * s - (GRAVITY * s * s) / 2, z: f.p.z + f.v.z * s };
}

/** How a flight ends: in the net, or on the sand; `s` seconds after it was hit, and where. */
export interface FlightEnd {
  s: number;
  x: number;
  z: number;
  net: boolean;
}

export function flightEnd(f: Flight): FlightEnd {
  const land = landTime(f.p.y, f.v.y);
  // Across the net's plane before it's down: caught if it's under the tape, between the posts.
  if (Math.abs(f.v.z) > 1e-6) {
    const s = (VOLLEY.z - f.p.z) / f.v.z;
    if (s > 0.02 && s < land) {
      const at = along(f, s);
      if (at.y - BALL_R < VOLLEY.net && Math.abs(at.x - VOLLEY.x) < VOLLEY.halfW + VOLLEY.netOver) {
        // It drops off the net on the side it came from.
        const back = f.v.z > 0 ? -0.35 : 0.35;
        return { s: s + Math.sqrt((2 * Math.max(0, at.y - BALL_R)) / GRAVITY), x: at.x, z: VOLLEY.z + back, net: true };
      }
    }
  }
  const at = along(f, land);
  return { s: land, x: at.x, z: at.z, net: false };
}

/** Where the ball is at office time `now` (ms), its flight running into the net or the sand. */
export function flightAt(f: Flight, now: number): Vec {
  const end = flightEnd(f);
  const s = Math.max(0, (now - f.t0) / 1000);
  if (s < end.s) {
    if (!end.net) return along(f, s);
    // Into the net: along its flight until it's there, then it slides down the net.
    const cross = (VOLLEY.z - f.p.z) / f.v.z;
    if (s < cross) return along(f, s);
    const at = along(f, cross);
    const fall = s - cross;
    return { x: at.x, y: Math.max(BALL_R, at.y - (GRAVITY * fall * fall) / 2), z: VOLLEY.z + (end.z - VOLLEY.z) * Math.min(1, fall * 3) };
  }
  return { x: end.x, y: BALL_R, z: end.z };
}

/** Where the ball is in `b` at office time `now`, or null when it's lying idle. */
export function ballAt(b: BallState, now: number): Vec | null {
  switch (b.k) {
    case 'idle':
      return { ...IDLE_SPOT };
    case 'serve':
      return serveSpot(b.side);
    case 'fly':
      return flightAt(b.f, now);
    case 'down':
      return { x: b.x, y: b.y, z: b.z };
  }
}

/** Who a flight's landing gives the point to, and why. */
export function pointOf(f: Flight, end: FlightEnd): { won: VolleySide; why: 'in' | 'out' | 'net' } {
  const other = (1 - f.side) as VolleySide;
  if (end.net) return { won: other, why: 'net' };
  if (!inCourt(end.x, end.z)) return { won: other, why: 'out' };
  // In: whoever's side it came down on lost it.
  return { won: (1 - sideOf(end.z)) as VolleySide, why: 'in' };
}

/** The velocity that takes a ball from `p` to land at (x, z), topping out `apex` above the sand. */
export function lobTo(p: Vec, x: number, z: number, apex: number): Vec {
  const top = Math.max(apex, p.y + 0.3);
  const vy = Math.sqrt(2 * GRAVITY * (top - p.y));
  const s = landTime(p.y, vy);
  return { x: (x - p.x) / s, y: vy, z: (z - p.z) / s };
}

/** The velocity that drives a ball from `p` down to land at (x, z), `speed` along the sand. */
export function driveTo(p: Vec, x: number, z: number, speed: number): Vec {
  const d = Math.hypot(x - p.x, z - p.z);
  const s = Math.max(0.25, d / speed);
  const vy = (BALL_R - p.y + (GRAVITY * s * s) / 2) / s;
  return { x: (x - p.x) / s, y: vy, z: (z - p.z) / s };
}

/** Whether a ball hit from `p` at `v` goes over the net (rather than into it). */
export const clearsNet = (p: Vec, v: Vec) => !flightEnd({ p, v, t0: 0, side: sideOf(p.z) }).net;

/** A drive to (x, z) if it clears the tape, else a flat, hard lob there (a spike off a ball too low). */
export function attackTo(p: Vec, x: number, z: number, speed: number): { v: Vec; kind: HitKind } {
  const v = driveTo(p, x, z, speed);
  return clearsNet(p, v) ? { v, kind: 'spike' } : { v: lobTo(p, x, z, Math.max(VOLLEY.net + 1.2, p.y + 0.6)), kind: 'bump' };
}

/** The fastest a hit may send the ball (m/s), and how far off the ball you may be when you hit it (the office checks, allowing for the wire). */
export const MAX_SPEED = 24;
export const HIT_SLACK = 2.4;

/** Whether a hit's numbers are numbers, and not impossibly hard. */
export function hitOk(p: unknown, v: unknown): p is Vec {
  const vec = (a: unknown): a is Vec => !!a && typeof a === 'object' && ['x', 'y', 'z'].every((k) => Number.isFinite((a as Record<string, unknown>)[k]));
  if (!vec(p) || !vec(v)) return false;
  if (p.y < 0 || p.y > 4.5 || Math.hypot(v.x, v.y, v.z) > MAX_SPEED) return false;
  return Math.abs(p.x - VOLLEY.x) < VOLLEY.halfW + 12 && Math.abs(p.z - VOLLEY.z) < VOLLEY.halfL + 12;
}

export const isHitKind = (k: unknown): k is HitKind => k === 'serve' || k === 'bump' || k === 'set' || k === 'spike';

/**
 * What you'd do with the ball from where you are, facing `yaw` (0 is +z, as the office's heading):
 * a serve from your spot, a set (Shift) straight up for a teammate, a spike when it's high by the net
 * and you're up off the sand, or a bump over toward the other side. `rand` adds a little error.
 */
export function playerHit(ball: Vec, me: { x: number; z: number; yaw: number; airborne: boolean; shift: boolean; serving: boolean }, rand: () => number): { v: Vec; kind: HitKind } {
  const own = sideOf(me.z);
  const toward = own === 0 ? 1 : -1;
  const err = () => (rand() - 0.5) * 1.2;
  const fx = Math.sin(me.yaw);
  const fz = Math.cos(me.yaw);
  if (me.serving) {
    // Deep into the other half, wherever you're facing across.
    const tz = VOLLEY.z + toward * (VOLLEY.halfL * 0.6);
    const tx = VOLLEY.x + Math.max(-VOLLEY.halfW + 1, Math.min(VOLLEY.halfW - 1, fx * 4));
    return { v: lobTo(ball, tx + err(), tz + err(), 5.2), kind: 'serve' };
  }
  if (me.shift) {
    // Up for a teammate, a step toward the net.
    return { v: lobTo(ball, ball.x + fx * 0.8, ball.z + toward * 1.2, ball.y + 2.6), kind: 'set' };
  }
  const fromNet = Math.abs(ball.z - VOLLEY.z);
  if (me.airborne && ball.y > 2.1 && fromNet < 3.2) {
    // Over the tape and down hard, where you're facing.
    const d = 4 + rand() * 2;
    const dirZ = fz * toward > 0.2 ? Math.abs(fz) : 0.8;
    const tx = Math.max(VOLLEY.x - VOLLEY.halfW + 0.5, Math.min(VOLLEY.x + VOLLEY.halfW - 0.5, ball.x + fx * d));
    return attackTo(ball, tx, VOLLEY.z + toward * Math.max(3, dirZ * d), 15);
  }
  // A bump: across the net, as far as you face it (the court's other half, roughly where you look).
  const reach = Math.max(4, Math.min(14, Math.abs(VOLLEY.z - ball.z) + 5));
  const facingAcross = fz * toward > 0.25;
  const tx = facingAcross ? ball.x + (fx / Math.abs(fz)) * reach * 0.6 : ball.x;
  const tz = ball.z + toward * reach;
  return { v: lobTo(ball, Math.max(VOLLEY.x - VOLLEY.halfW - 1, Math.min(VOLLEY.x + VOLLEY.halfW + 1, tx + err())), tz + err(), Math.max(4.4, ball.y + 2)), kind: 'bump' };
}

// ---- The computer team ------------------------------------------------------------------------

/** When (seconds after it was hit) a flight comes down through height `h` on its way down, or null if it never gets that high. */
export function downThrough(f: Flight, h: number): number | null {
  const a = GRAVITY / 2;
  const b = -f.v.y;
  const c = h - f.p.y;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b + Math.sqrt(disc)) / (2 * a);
  return s > 0 ? s : null;
}

/** What the computer does next: who of side `side` plays the ball, when, from where, and how it goes. */
export interface CpuTouch {
  npc: number;
  s: number;
  at: Vec;
  kind: HitKind;
  v: Vec;
}

/**
 * The computer team's answer to a ball coming down on side `side`: a pass to the front player, then
 * (when it's their own set coming down) a shot over: mostly a lob into the corners, sometimes a
 * spike. Sometimes they miss it (null), more often off a spike. `touch` is how many times they've
 * touched it already this side.
 */
export function cpuTouch(f: Flight, kind: HitKind, side: VolleySide, touch: number, rand: () => number): CpuTouch | null {
  const end = flightEnd(f);
  if (end.net || sideOf(end.z) !== side) return null;
  // Going out by a mile: let it go.
  if (!inCourt(end.x, end.z) && (Math.abs(end.x - VOLLEY.x) > VOLLEY.halfW + 0.6 || Math.abs(end.z - VOLLEY.z) > VOLLEY.halfL + 0.6)) return null;
  const miss = kind === 'spike' ? 0.42 : kind === 'serve' ? 0.12 : 0.1;
  if (touch === 0 && rand() < miss) return null;
  const toward = side === 0 ? 1 : -1;
  const back = side === 0 ? 0 : 2;
  const front = back + 1;
  if (touch === 0) {
    const s = downThrough(f, 0.9) ?? end.s * 0.95;
    const at = along(f, Math.min(s, end.s - 0.02));
    // A pass up to the front player, by the net.
    const v = lobTo(at, VOLLEY.x + (rand() - 0.5) * 1.5, VOLLEY.z - toward * 1.6, 4.6);
    return { npc: back, s, at, kind: 'bump', v };
  }
  const s = downThrough(f, 2.25) ?? end.s * 0.9;
  const at = along(f, Math.min(s, end.s - 0.02));
  const tx = VOLLEY.x + (rand() - 0.5) * (VOLLEY.halfW * 1.6);
  if (rand() < 0.3) {
    const tz = VOLLEY.z + toward * (3 + rand() * 4);
    const hit = attackTo(at, tx, tz, 12 + rand() * 2);
    return { npc: front, s, at, kind: hit.kind, v: hit.v };
  }
  const tz = VOLLEY.z + toward * (3 + rand() * (VOLLEY.halfL - 3.6));
  return { npc: front, s, at, kind: 'bump', v: lobTo(at, tx, tz, 4.2 + rand() * 1.5) };
}

/** The computer's serve from `side`'s spot: a lob deep into the other half. */
export function cpuServe(side: VolleySide, rand: () => number): Vec {
  const toward = side === 0 ? 1 : -1;
  const p = serveSpot(side);
  return lobTo(p, VOLLEY.x + (rand() - 0.5) * VOLLEY.halfW * 1.4, VOLLEY.z + toward * (3 + rand() * 4), 5 + rand());
}

/** Whether a set's over at `score`, and who won it. */
export function setWinner(score: readonly [number, number]): -1 | VolleySide {
  for (const s of [0, 1] as const) {
    const me = score[s];
    const them = score[1 - s];
    if ((me >= WIN_AT && me - them >= 2) || me >= CAP) return s;
  }
  return -1;
}

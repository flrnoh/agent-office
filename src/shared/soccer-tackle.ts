import { GOAL, MARKS, PITCH, PITCH_CX, defends, type GoalSide, type SoccerPhase, type Team } from './soccer.js';
import { rollDistance } from './soccer-ball.js';

// Slide tackles and fouls in the soccer hall (flrnoh fork, see FORK.md "The soccer hall"): the pure
// rules both sides share. Q (or Ctrl) on the pitch slides you along the floor the way you face; what
// you hit first decides it: the ball (you poke it on, or win it) or an opponent's legs (a foul: a free
// kick at the spot, a penalty in your own penalty area, the second foul a yellow card, the third a red).
//
// The slide's curve is the same everywhere: the office (server/soccer/tackle.ts) checks contacts along
// it, the slider's page drives its own position along it (so its `move`s match), and every page poses
// the body by it (client/soccer/tackle.ts). Contacts are sampled on a fixed grid (CONTACT_STEP_MS), so
// the order of "ball first" and "legs first" is the same for the same inputs.

// ---- The slide ------------------------------------------------------------------------------------

/**
 * A slide: `dist` m along the floor in `moveMs`, slowing all the way (an ease-out with exponent
 * `ease`: it leaves at ~12 m/s and stops dead), then lying `lieMs` and getting up in `upMs`. Contacts
 * count only in the first `activeMs`. One every `cooldownMs` (from the start of the last).
 */
export const SLIDE = { dist: 3.5, moveMs: 450, lieMs: 400, upMs: 400, activeMs: 350, cooldownMs: 2000, ease: 1.6 } as const;
/** The whole thing, from going down to standing again (ms). */
export const SLIDE_MS = SLIDE.moveMs + SLIDE.lieMs + SLIDE.upMs;
/** A slide stops this far inside the boards (m): never through them. */
export const SLIDE_EDGE = 0.4;
/** The office takes the start your page says, if it's this close to where it has you (m); else its own. */
export const SLIDE_TRUST = 1.5;

/** A slide on the floor: from (x, z) along `dir` (sin, cos on x/z, like a kick's), `d` m (clamped short of the boards). */
export interface Slide {
  x: number;
  z: number;
  dir: number;
  d: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How far a slide from (x, z) along `dir` may go before the boards (SLIDE_EDGE inside them), at most SLIDE.dist. */
export function slideLength(x: number, z: number, dir: number): number {
  const ux = Math.sin(dir);
  const uz = Math.cos(dir);
  let d: number = SLIDE.dist;
  const lo = { x: PITCH.minX + SLIDE_EDGE, z: PITCH.minZ + SLIDE_EDGE };
  const hi = { x: PITCH.maxX - SLIDE_EDGE, z: PITCH.maxZ - SLIDE_EDGE };
  if (ux > 1e-9) d = Math.min(d, (hi.x - x) / ux);
  if (ux < -1e-9) d = Math.min(d, (lo.x - x) / ux);
  if (uz > 1e-9) d = Math.min(d, (hi.z - z) / uz);
  if (uz < -1e-9) d = Math.min(d, (lo.z - z) / uz);
  return Math.max(0, d);
}

/** A slide from (x, z) along `dir`: the start kept inside the boards, the length clamped short of them. */
export function makeSlide(x: number, z: number, dir: number): Slide {
  const d0 = Number.isFinite(dir) ? Math.atan2(Math.sin(dir), Math.cos(dir)) : 0;
  const sx = clamp(x, PITCH.minX + SLIDE_EDGE, PITCH.maxX - SLIDE_EDGE);
  const sz = clamp(z, PITCH.minZ + SLIDE_EDGE, PITCH.maxZ - SLIDE_EDGE);
  return { x: sx, z: sz, dir: d0, d: slideLength(sx, sz, d0) };
}

/** How far along a slide of length `d` you are `ms` after it started (m). */
export function slideTravel(d: number, ms: number): number {
  const u = clamp(ms / SLIDE.moveMs, 0, 1);
  return d * (1 - Math.pow(1 - u, SLIDE.ease));
}

/** How fast a slide of length `d` goes `ms` after it started (m/s). */
export function slideSpeed(d: number, ms: number): number {
  const u = ms / SLIDE.moveMs;
  if (u < 0 || u >= 1) return 0;
  return ((d * SLIDE.ease) / (SLIDE.moveMs / 1000)) * Math.pow(1 - u, SLIDE.ease - 1);
}

export type SlidePart = 'slide' | 'lie' | 'up' | 'done';

/** Where a slide has you `ms` after it started, and what you're doing: sliding, lying, getting up, or done. */
export function slideAt(s: Slide, ms: number): { x: number; z: number; part: SlidePart } {
  const t = slideTravel(s.d, ms);
  const part: SlidePart = ms < SLIDE.moveMs ? 'slide' : ms < SLIDE.moveMs + SLIDE.lieMs ? 'lie' : ms < SLIDE_MS ? 'up' : 'done';
  return { x: s.x + Math.sin(s.dir) * t, z: s.z + Math.cos(s.dir) * t, part };
}

/**
 * How low the slider's body is `ms` into the slide (0 standing, 1 flat out), for the pose and the camera:
 * down fast, flat while sliding and lying, back up while getting up.
 */
export function slideLow(ms: number): number {
  if (ms <= 0 || ms >= SLIDE_MS) return 0;
  if (ms < 120) return ms / 120;
  if (ms < SLIDE.moveMs + SLIDE.lieMs) return 1;
  const u = (ms - SLIDE.moveMs - SLIDE.lieMs) / SLIDE.upMs;
  return 1 - u * u * (3 - 2 * u);
}

/** Why someone of `team` may not slide now (the match's `phase`, who kicks off), or null when they may. */
export function slideRefused(phase: SoccerPhase | undefined, team: Team | undefined, kickoff?: Team): string | null {
  if (!team) return 'not playing';
  if (phase === 'kickoff') return kickoff === team ? null : 'kickoff';
  if (phase === 'play' || phase === 'waiting' || phase === 'paused' || !phase) return null;
  return 'not now';
}

// ---- What a slide hits ---------------------------------------------------------------------------

/** The foot zone: its middle this far ahead of the body along the slide, and the ball's middle within BALL_HIT_R of it (low: under BALL_HIT_HIGH). */
export const FOOT_AHEAD = 0.75;
export const BALL_HIT_R = 0.5;
export const BALL_HIT_HIGH = 0.5;
/** The sliding leg: from the body out this far along the slide; it hits an opponent's legs (a capsule round where they stand) within LEGS_R of them. */
export const LEG_LEN = 1.0;
export const LEGS_R = 0.4;
/** Contacts are looked for at every multiple of this (ms of the slide), the same grid everywhere. */
export const CONTACT_STEP_MS = 1000 / 240;

export interface ContactBall {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
}

export interface ContactPlayer {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** What a slide hit first: the ball, or `id`'s legs; when (ms into the slide) and where the thing hit was then. */
export type Contact = { kind: 'ball'; ms: number; x: number; z: number } | { kind: 'legs'; ms: number; id: string; x: number; z: number };

/** The distance from (px, pz) to the segment (ax, az)–(bx, bz). */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
}

/**
 * The first contact of slide `s` between `fromMs` (exclusive) and `toMs` (inclusive) of it, looking only
 * in its active part (SLIDE.activeMs): the ball (`ball` as it was at `fromMs`, run on in a straight line;
 * null: the ball can't be played) or an opponent's legs (`opponents` as they were at `fromMs`, run on the
 * way they go). Both in the same instant: the ball wins. Null: nothing yet.
 */
export function firstContact(s: Slide, fromMs: number, toMs: number, ball: ContactBall | null, opponents: readonly ContactPlayer[]): Contact | null {
  const end = Math.min(toMs, SLIDE.activeMs);
  const ux = Math.sin(s.dir);
  const uz = Math.cos(s.dir);
  for (let k = Math.floor(fromMs / CONTACT_STEP_MS) + 1; k * CONTACT_STEP_MS <= end + 1e-9; k++) {
    const ms = k * CONTACT_STEP_MS;
    if (ms < 0) continue;
    const dt = (ms - fromMs) / 1000;
    const at = slideAt(s, ms);
    if (ball && ball.y < BALL_HIT_HIGH) {
      const bx = ball.x + ball.vx * dt;
      const bz = ball.z + ball.vz * dt;
      if (Math.hypot(bx - (at.x + ux * FOOT_AHEAD), bz - (at.z + uz * FOOT_AHEAD)) < BALL_HIT_R) return { kind: 'ball', ms, x: bx, z: bz };
    }
    let best: Contact | null = null;
    let bestD = Infinity;
    for (const o of opponents) {
      const ox = o.x + o.vx * dt;
      const oz = o.z + o.vz * dt;
      const d = segDist(ox, oz, at.x, at.z, at.x + ux * LEG_LEN, at.z + uz * LEG_LEN);
      if (d < LEGS_R && d < bestD) {
        bestD = d;
        best = { kind: 'legs', ms, id: o.id, x: ox, z: oz };
      }
    }
    if (best) return best;
  }
  return null;
}

/** A poke: this fast along the slide (at least), unless it's won. */
export const POKE_V = 7;
/** Slower than this (m/s) when it hits the ball, the slider wins it: it rolls on to stop just past where they end up. */
export const WIN_V = 5;
export const WIN_PAST = 0.6;

/** The speed (m/s) that rolls a ball `d` m along the turf before it stops. */
export function rollSpeedFor(d: number): number {
  if (d <= 0) return 0;
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (rollDistance(m) < d) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * What a slide does to the ball it hits `ms` in: poked on along the slide (POKE_V, or faster when the
 * slide still is), or, when the slide's nearly done (slower than WIN_V), won: rolled on just past
 * where the slider stops, there for them when they're up.
 */
export function pokeOf(s: Slide, ms: number): { vx: number; vz: number; won: boolean } {
  const v = slideSpeed(s.d, ms);
  const ux = Math.sin(s.dir);
  const uz = Math.cos(s.dir);
  if (v < WIN_V) {
    const left = Math.max(0, s.d - slideTravel(s.d, ms));
    const sp = rollSpeedFor(left + WIN_PAST);
    return { vx: ux * sp, vz: uz * sp, won: true };
  }
  const sp = Math.max(POKE_V, v + 1.5);
  return { vx: ux * sp, vz: uz * sp, won: false };
}

// ---- Fouls, free kicks and penalties -------------------------------------------------------------

/** A free kick is never nearer the boards than this (m). */
export const SPOT_EDGE = 2;
/** At a free kick the fouling team keeps this far from the ball (m) for RING_MS; at a penalty everyone but the taker and the keeper PENALTY_RING. */
export const FREEKICK_RING = 3;
export const PENALTY_RING = 4;
export const RING_MS = 3000;
/** Only the penalty taker may be this close (m); they're put this far behind the ball. */
export const TAKER_R = 2;
export const TAKER_BACK = 1.4;
/** A set piece can be taken this long after the whistle (ms), and goes on by itself (play on) after SET_PIECE_MS. */
export const SETUP_MS = 800;
export const SET_PIECE_MS = 8000;
/** The fouled player is down this long (ms): falling, lying, getting up. */
export const FALL_MS = 1500;
/** The keeper at a penalty stands this far in front of the goal line (m). */
export const KEEPER_OFF = 0.4;
/** Fouls in a match: the second's a yellow card, the third a red one (off the pitch for RED_OUT_MS). */
export const YELLOW_AT = 2;
export const RED_AT = 3;
export const RED_OUT_MS = 60_000;

export type Card = 'yellow' | 'red';

/** The card someone's `fouls`-th foul in a match gets them, if any. */
export function cardFor(fouls: number): Card | undefined {
  return fouls >= RED_AT ? 'red' : fouls >= YELLOW_AT ? 'yellow' : undefined;
}

/** The goal line's z for `side`, and which way is into the pitch from it. */
const lineOf = (side: GoalSide) => (side === 'north' ? { z: PITCH.minZ, inward: 1 } : { z: PITCH.maxZ, inward: -1 });

/** Whether (x, z) is in the penalty area in front of goal `side` (within MARKS.area of the goal line between the posts, on the pitch). */
export function inPenaltyArea(x: number, z: number, side: GoalSide): boolean {
  const { z: lz, inward } = lineOf(side);
  if ((z - lz) * inward < 0) return false;
  const half = GOAL.width / 2;
  const dx = Math.max(0, Math.abs(x - PITCH_CX) - half);
  return Math.hypot(dx, z - lz) <= MARKS.area;
}

/** Whether a foul by someone of `team` at (x, z) is a penalty: in the penalty area they defend. */
export const isPenalty = (team: Team, x: number, z: number): boolean => inPenaltyArea(x, z, defends(team));

/** Where a free kick for a foul at (x, z) is taken: there, kept SPOT_EDGE inside the boards. */
export function foulSpot(x: number, z: number): { x: number; z: number } {
  return { x: clamp(x, PITCH.minX + SPOT_EDGE, PITCH.maxX - SPOT_EDGE), z: clamp(z, PITCH.minZ + SPOT_EDGE, PITCH.maxZ - SPOT_EDGE) };
}

/** The penalty spot in front of goal `side`. */
export function penaltySpot(side: GoalSide): { x: number; z: number } {
  const { z, inward } = lineOf(side);
  return { x: PITCH_CX, z: z + inward * MARKS.spot };
}

/** Where the keeper stands for a penalty at goal `side` (on the line, facing out), and the taker (behind the ball, facing the goal). */
export function penaltyPlaces(side: GoalSide): { keeper: { x: number; z: number; rotY: number }; taker: { x: number; z: number; rotY: number } } {
  const { z, inward } = lineOf(side);
  const spot = penaltySpot(side);
  return {
    keeper: { x: PITCH_CX, z: z + inward * KEEPER_OFF, rotY: inward > 0 ? 0 : Math.PI },
    taker: { x: spot.x, z: spot.z + inward * TAKER_BACK, rotY: inward > 0 ? Math.PI : 0 },
  };
}

/** A free kick or a penalty as the match has it (in the view: `ringMs`/`readyMs` are left as of when it was sent). */
export interface SetPiece {
  kind: 'freekick' | 'penalty';
  /** Who takes it (the fouled team). */
  team: Team;
  /** Where the ball is. */
  x: number;
  z: number;
  /** A penalty's taker (the fouled player) and the defending team's keeper (cosmetic: their pages put them on the line). */
  taker?: string;
  keeper?: string;
}

export interface SetPieceView extends SetPiece {
  /** How long the ring round the ball holds (ms), and until the taking team may kick. */
  ringMs: number;
  readyMs: number;
  /** The ring's radius (m). */
  ring: number;
}

/** Whether `id` (of `team`) may kick the ball at set piece `sp` (once it's ready). */
export function mayTakeSetPiece(sp: SetPiece, team: Team, id: string): boolean {
  if (team !== sp.team) return false;
  return sp.kind === 'freekick' || sp.taker === id;
}

/**
 * Where someone at (px, pz) has to stand for set piece `sp`, if not where they are: out of the ring round
 * the ball, onto its edge (`r`, a hair more). Null: they can stay. `exempt` (the taker, the keeper) stay.
 */
export function ringPush(px: number, pz: number, cx: number, cz: number, r: number): { x: number; z: number } | null {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return null;
  const [ux, uz] = d > 1e-6 ? [dx / d, dz / d] : [0, 1];
  const want = r + 0.05;
  let x = cx + ux * want;
  let z = cz + uz * want;
  // Pushed into the boards: round the ring the other way along the pitch.
  if (x < PITCH.minX + 0.4 || x > PITCH.maxX - 0.4) x = clamp(x, PITCH.minX + 0.4, PITCH.maxX - 0.4);
  if (z < PITCH.minZ + 0.4 || z > PITCH.maxZ - 0.4) z = clamp(z, PITCH.minZ + 0.4, PITCH.maxZ - 0.4);
  if (Math.hypot(x - cx, z - cz) < r) {
    const back = Math.sqrt(Math.max(0, want * want - (x - cx) * (x - cx)));
    const sz = cz - back >= PITCH.minZ + 0.4 ? cz - back : cz + back;
    z = clamp(sz, PITCH.minZ + 0.4, PITCH.maxZ - 0.4);
  }
  return { x, z };
}

/** The ring's radius at set piece `sp`. */
export const ringOf = (sp: Pick<SetPiece, 'kind'>): number => (sp.kind === 'penalty' ? PENALTY_RING : FREEKICK_RING);

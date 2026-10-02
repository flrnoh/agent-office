// The SCHALLWERK's crowd (flrnoh fork, see FORK.md "The show"): where its people stand, how many come
// for what's on, the pit that opens where people pogo together, the Wall of Death, and stepping aside
// for the real people among them. Pure, and the same on every page: nothing of the crowd goes over the
// wire but what the players do (the pogo jumps, the Wall of Death's call); each page works the rest
// out from those, the house's mode, the gigs and the office's clock.

import { mulberry32 } from './rng.js';
import type { VenueMode, Zone } from './venue.js';
import { STAGE_FOCUS, WALKWAYS, WOD_PART_MS, WOD_RUN_MS, crowdArea } from './venueshow.js';

/** How many people the crowd has at most (a full house). */
export const MAX_CROWD = 80;
/** How close two of them stand at most (m, between their middles). */
export const CROWD_GAP = 0.66;

export interface Spot {
  x: number;
  z: number;
}

const inZone = (z: Zone, x: number, y: number) => x >= z.minX && x <= z.maxX && y >= z.minZ && y <= z.maxZ;
/** Whether (x, z) is on one of the floor's walkways (with `pad` metres round them). */
export const onWalkway = (x: number, z: number, pad = 0) => WALKWAYS.some((w) => x >= w.minX - pad && x <= w.maxX + pad && z >= w.minZ - pad && z <= w.maxZ + pad);

const spotCache = new Map<VenueMode, Spot[]>();
/**
 * Where the crowd stands in each mode, MAX_CROWD spots, in the order they fill: in concert mode the
 * front first (people press up to the barrier), in club mode all over the floor. A jittered grid,
 * never on a walkway, no two closer than CROWD_GAP.
 */
export function crowdSpots(mode: VenueMode): readonly Spot[] {
  const had = spotCache.get(mode);
  if (had) return had;
  const area = crowdArea(mode);
  const r = mulberry32(mode === 'konzert' ? 0x5c4a11 : 0xc1ab);
  const cand: (Spot & { k: number })[] = [];
  const step = 0.84;
  for (let x = area.minX + 0.3; x <= area.maxX - 0.3; x += step) {
    for (let z = area.minZ + 0.3; z <= area.maxZ - 0.2; z += step) {
      const p = { x: x + (r() - 0.5) * 0.36, z: z + (r() - 0.5) * 0.36, k: r() };
      if (!inZone(area, p.x, p.z) || onWalkway(p.x, p.z, 0.25)) continue;
      cand.push(p);
    }
  }
  // Concert: a crowd pressing up to the barrier in front of the middle of the stage, thinning out
  // toward the sides and the back; club: anywhere, a little toward the middle of the floor.
  const mid = (area.minX + area.maxX) / 2;
  const fromFront = (p: Spot) => Math.hypot((p.x - STAGE_FOCUS.x) / 1.9, p.z - area.maxZ);
  const score = (p: Spot & { k: number }) => (mode === 'konzert' ? -fromFront(p) + p.k * 1.2 : p.k * 6 - Math.abs(p.x - mid) * 0.08 - Math.abs(p.z + 1) * 0.1);
  cand.sort((a, b) => score(b) - score(a));
  const out: Spot[] = [];
  for (const p of cand) {
    if (out.length >= MAX_CROWD) break;
    // Packed at the front, more room further back.
    const gap = mode === 'konzert' ? CROWD_GAP + Math.min(0.5, fromFront(p) * 0.07) : CROWD_GAP + 0.22;
    if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < gap)) continue;
    out.push({ x: p.x, z: p.z });
  }
  spotCache.set(mode, out);
  return out;
}

/** What's going on, for how many come. */
export interface CrowdInputs {
  /** The hour of the day where the office is (0..23, fractional). */
  hour: number;
  mode: VenueMode;
  /** A gig from the calendar is on now. */
  live: boolean;
  /** The house mix or a set plays in the hall. */
  music: boolean;
  /** How loud the stage is, smoothed over a few seconds (0..1). */
  stage: number;
}

/** How many people the crowd should have now (0..MAX_CROWD). */
export function crowdTarget(i: CrowdInputs): number {
  const h = ((i.hour % 24) + 24) % 24;
  // An empty hall in the small hours, a few standing about by day, more in the evening.
  const base = h >= 4 && h < 10 ? 3 : h < 17 && h >= 10 ? 8 : h >= 17 && h < 20 ? 16 : 24;
  if (i.live) return MAX_CROWD;
  let n = base;
  if (i.music) n = Math.max(n, i.mode === 'club' ? 50 : 30);
  if (i.stage > 0.03) n = Math.max(n, Math.round(30 + 42 * Math.min(1, i.stage * 1.6)));
  return Math.min(MAX_CROWD, n);
}

// ---- The pit -----------------------------------------------------------------------------------------

/** A pogo jump somebody did: who, where, when (ms). */
export interface Jump {
  id: string;
  x: number;
  z: number;
  at: number;
}
export interface Pit {
  x: number;
  z: number;
  /** How wide the circle is (m), and how many are jumping in it. */
  r: number;
  jumpers: number;
}
/** How recent jumps count, how close jumpers must be to each other, how many make a pit. */
export const PIT_WINDOW = 2600;
export const PIT_NEAR = 3.6;
export const PIT_MIN = 2;

/**
 * Where the pit is, if one's open: at least PIT_MIN people pogoing within PIT_NEAR of each other in
 * the last PIT_WINDOW ms. The busiest bunch wins; the circle grows with how many are in it.
 */
export function findPit(jumps: readonly Jump[], now: number): Pit | null {
  const recent = new Map<string, Jump>();
  for (const j of jumps) if (now - j.at <= PIT_WINDOW && now >= j.at - 50 && (!recent.has(j.id) || recent.get(j.id)!.at < j.at)) recent.set(j.id, j);
  const list = [...recent.values()];
  let best: Pit | null = null;
  for (const a of list) {
    const near = list.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) <= PIT_NEAR);
    if (near.length < PIT_MIN || (best && near.length <= best.jumpers)) continue;
    const x = near.reduce((s, j) => s + j.x, 0) / near.length;
    const z = near.reduce((s, j) => s + j.z, 0) / near.length;
    best = { x, z, r: Math.min(4.2, 2.3 + near.length * 0.45), jumpers: near.length };
  }
  return best;
}

/** Where someone standing at `s` goes while the pit is open: out to its ring, if they were inside it. */
export function pitPlace(s: Spot, pit: Pit): Spot {
  const dx = s.x - pit.x;
  const dz = s.z - pit.z;
  const d = Math.hypot(dx, dz);
  if (d >= pit.r) return s;
  const a = d > 0.05 ? Math.atan2(dz, dx) : (s.x * 7.3 + s.z * 3.1) % (Math.PI * 2);
  const ring = pit.r + 0.15 + (d / pit.r) * 0.5;
  return { x: pit.x + Math.cos(a) * ring, z: pit.z + Math.sin(a) * ring };
}

// ---- The Wall of Death --------------------------------------------------------------------------------

/** Where the Wall of Death splits the floor: down the middle of the crowd, along z. */
export const wodSplitX = (mode: VenueMode) => {
  const a = crowdArea(mode);
  return (a.minX + a.maxX) / 2;
};

/**
 * Someone at `s` during a Wall of Death called at `at`: first the crowd parts to either side of a lane
 * down the middle, waits, then everyone runs at each other and it's one big pit until it's over.
 * `phase` says which part it's in ('part', 'run'), or null once it's over (or before it).
 */
export function wodPlace(s: Spot, at: number, now: number, mode: VenueMode): { spot: Spot; phase: 'part' | 'run' } | null {
  const t = now - at;
  if (t < 0 || t > WOD_PART_MS + WOD_RUN_MS) return null;
  const mid = wodSplitX(mode);
  const side = s.x < mid ? -1 : 1;
  const lane = 2.2;
  if (t < WOD_PART_MS) {
    const k = Math.min(1, t / 1400);
    const off = Math.max(0, lane - Math.abs(s.x - mid)) * side * k;
    return { spot: { x: s.x + off, z: s.z }, phase: 'part' };
  }
  // The run: everyone surges into the middle and mills about there.
  const k = Math.min(1, (t - WOD_PART_MS) / 900);
  const toward = (mid - s.x) * 0.55 * k;
  return { spot: { x: s.x + toward, z: s.z }, phase: 'run' };
}

// ---- Stepping aside -------------------------------------------------------------------------------------

/**
 * How far someone at `s` steps aside for the real people round them (players, a crowd-surfer coming
 * down): out of a circle of `r` round each, never further than that.
 */
export function stepAside(s: Spot, people: readonly Spot[], r = 0.85): Spot {
  let ox = 0;
  let oz = 0;
  for (const p of people) {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    const push = r - d;
    if (d < 0.01) {
      ox += push;
      continue;
    }
    ox += (dx / d) * push;
    oz += (dz / d) * push;
  }
  return { x: s.x + ox, z: s.z + oz };
}

// ---- How the concert crowd moves --------------------------------------------------------------------

/** What the concert crowd does at a stage `level` (smoothed, 0..1): standing about, swaying with lights up, nodding, going wild. */
export type ConcertMood = 'idle' | 'slow' | 'nod' | 'wild';
export function concertMood(level: number, playing: boolean): ConcertMood {
  if (!playing || level < 0.05) return 'idle';
  if (level < 0.3) return 'slow';
  if (level < 0.66) return 'nod';
  return 'wild';
}

/** The dance moves of the club crowd (and the jumps of the concert's): each person has a favourite few. */
export const MOVES = ['bounce', 'pump', 'wave', 'step', 'bang', 'point', 'jump', 'clap'] as const;
export type Move = (typeof MOVES)[number];

/** Someone's move for a part of a set (shared/djbeats.ts BeatPart), by who they are and the phrase it is. */
export function moveFor(seed: number, part: 'intro' | 'build' | 'drop' | 'breakdown', phrase: number): Move {
  const k = (seed * 2654435761 + phrase * 40503) >>> 0;
  const pick = <T>(l: readonly T[]) => l[k % l.length];
  if (part === 'build') return pick(['clap', 'point', 'clap', 'bounce'] as const);
  if (part === 'drop') return pick(['jump', 'pump', 'jump', 'wave', 'bang', 'pump'] as const);
  if (part === 'breakdown') return pick(['wave', 'step', 'wave'] as const);
  return pick(['bounce', 'step', 'bounce', 'bang', 'pump', 'step'] as const);
}

/**
 * flrnoh fork: speakers all over the office (see FORK.md). Small speaker boxes hang from the ceiling
 * round the floor, in the loft and the meeting room, and in the back office once it's built out, and
 * play whatever the jukebox plays. This file is the pure part, shared by the sound (sound.ts), the
 * boxes (world/speakers.ts) and the tests: where they hang, and how loud they are where you stand.
 *
 * They're one PA, not a dozen sources: the level is the nearest speaker's (so walking about never
 * piles them up or makes them phase against each other), and it's panned lightly towards the nearest
 * two, so you can still tell roughly where the sound comes from.
 */
import { FLOOR, LOFT, MEETING_ROOM, WALL_HEIGHT, WING, inWing, wingMinZ, wingRowZ } from '../shared/layout';

export interface SpeakerDef {
  id: string;
  /** Where its middle hangs. */
  x: number;
  y: number;
  z: number;
  /** The ceiling it hangs from. */
  ceiling: number;
  /** A point on the floor it's aimed at (it tilts down towards the room too). */
  aim: { x: number; z: number };
  /** Smaller under the low ceilings (the meeting room, the loft). */
  scale: number;
  /** In the back office's row `wing`: only there once the floor is built out that far. */
  wing?: number;
}

type Pos = { x: number; y: number; z: number };

/** Hung this far below the office's high ceiling, on a rod. */
const HANG_Y = WALL_HEIGHT - 1.1;
const LOFT_ROOF = LOFT.y + LOFT.height;

export const SPEAKERS: readonly SpeakerDef[] = [
  // Over the two desk clusters, between the lamps.
  { id: 'desks-west', x: -10.5, y: HANG_Y, z: 0, ceiling: WALL_HEIGHT, aim: { x: -10.5, z: 6 }, scale: 1 },
  { id: 'desks-east', x: -1.5, y: HANG_Y, z: 0, ceiling: WALL_HEIGHT, aim: { x: -1.5, z: -6 }, scale: 1 },
  // By the boards on the north wall, and between the whiteboard and the elevator.
  { id: 'boards', x: -5, y: HANG_Y, z: -10, ceiling: WALL_HEIGHT, aim: { x: -5, z: 0 }, scale: 1 },
  { id: 'elevator', x: 6.5, y: HANG_Y, z: -8, ceiling: WALL_HEIGHT, aim: { x: 4, z: 0 }, scale: 1 },
  // The lounge, by the jukebox and the TV.
  { id: 'lounge', x: 13.5, y: HANG_Y, z: 3, ceiling: WALL_HEIGHT, aim: { x: 8, z: 2 }, scale: 1 },
  // The kitchen in the south-west corner, and by the balcony doors.
  { id: 'kitchen', x: -14, y: HANG_Y, z: 9, ceiling: WALL_HEIGHT, aim: { x: -14, z: 13 }, scale: 1 },
  { id: 'balcony', x: -2, y: HANG_Y, z: 9, ceiling: WALL_HEIGHT, aim: { x: -3, z: 3 }, scale: 1 },
  // Under the loft's floor in the meeting room, and up in the loft under its roof.
  { id: 'meeting', x: FLOOR.maxX - 0.7, y: MEETING_ROOM.height - 0.3, z: MEETING_ROOM.minZ + 0.8, ceiling: LOFT.y - 0.25, aim: { x: 12, z: 11 }, scale: 0.72 },
  { id: 'loft', x: FLOOR.maxX - 0.7, y: LOFT_ROOF - 0.5, z: LOFT.minZ + 0.8, ceiling: LOFT_ROOF, aim: { x: 12, z: 11 }, scale: 0.8 },
  // The back office: one over each row, beside its lamp.
  ...Array.from({ length: WING.rows }, (_, i): SpeakerDef => ({ id: `wing-${i + 1}`, x: WING.maxX - 0.8, y: HANG_Y, z: wingRowZ(i + 1), ceiling: WALL_HEIGHT, aim: { x: WING.minX, z: wingRowZ(i + 1) }, scale: 0.9, wing: i + 1 })),
];

/** The speakers there on a floor built out `wing` rows. */
export function builtSpeakers(wing: number): SpeakerDef[] {
  return SPEAKERS.filter((s) => !s.wing || s.wing <= wing);
}

/** The inverse distance curve Web Audio's panners use: 1 up to `ref`, then falling off. */
export function falloff(d: number, ref: number, rolloff: number): number {
  return ref / (ref + rolloff * (Math.max(ref, d) - ref));
}

/** A speaker is at full level within this, from where it hangs; you're never much further from one. */
export const SPEAKER_REF = 4.5;
export const SPEAKER_ROLLOFF = 0.45;
/** Out on the balcony or the fire escape, through the doors and windows: at most this much, gone this far out. */
const OUTSIDE_MAX = 0.35;
const OUTSIDE_REACH = 4;

/**
 * How much of the speakers reaches (x, y, z), your ears, from 0 to 1: all of it inside the office on
 * your floor (the loft, the meeting room and the back office as far as it's built too), a little just
 * outside its walls (the balcony, the fire escape), and none down in the garage, out on the street or
 * higher up.
 */
export function speakerPresence(p: Pos, wing: number): number {
  if (p.y < -0.5 || p.y > WALL_HEIGHT) return 0;
  if ((p.x > FLOOR.minX && p.x < FLOOR.maxX && p.z > FLOOR.minZ && p.z < FLOOR.maxZ) || inWing(p.x, p.z, wing)) return 1;
  // How far outside the walls, to the nearest bit of them (the back office's as well).
  const outside = (minX: number, maxX: number, minZ: number, maxZ: number) => Math.hypot(Math.max(minX - p.x, 0, p.x - maxX), Math.max(minZ - p.z, 0, p.z - maxZ));
  let d = outside(FLOOR.minX, FLOOR.maxX, FLOOR.minZ, FLOOR.maxZ);
  if (wing > 0) d = Math.min(d, outside(WING.minX, WING.maxX, wingMinZ(wing), FLOOR.minZ));
  return d >= OUTSIDE_REACH ? 0 : OUTSIDE_MAX * (1 - d / OUTSIDE_REACH);
}

export interface SpeakerHearing {
  /** 0–1 before your speaker volume: the nearest speaker's level, times how much reaches you. */
  level: number;
  /** -1 (left) to 1 (right), kept light: towards the nearest two speakers. */
  pan: number;
}

/** Where the light panning points: the nearest two speakers, the nearer one weighted more. */
function nearestSpot(p: Pos, speakers: readonly SpeakerDef[]): { d: number; x: number; z: number } | null {
  let a: { s: SpeakerDef; d: number } | null = null;
  let b: { s: SpeakerDef; d: number } | null = null;
  for (const s of speakers) {
    const d = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
    if (!a || d < a.d) [a, b] = [{ s, d }, a];
    else if (!b || d < b.d) b = { s, d };
  }
  if (!a) return null;
  if (!b) return { d: a.d, x: a.s.x, z: a.s.z };
  const wa = 1 / Math.max(0.25, a.d) ** 2;
  const wb = 1 / Math.max(0.25, b.d) ** 2;
  return { d: a.d, x: (a.s.x * wa + b.s.x * wb) / (wa + wb), z: (a.s.z * wa + b.s.z * wb) / (wa + wb) };
}

/** How loud the speakers are at your ears `p`, facing (fx, fz), on a floor built out `wing` rows. */
export function hearSpeakers(p: Pos & { fx: number; fz: number }, wing: number): SpeakerHearing {
  const presence = speakerPresence(p, wing);
  const spot = presence > 0 ? nearestSpot(p, builtSpeakers(wing)) : null;
  if (!spot) return { level: 0, pan: 0 };
  const level = presence * falloff(spot.d, SPEAKER_REF, SPEAKER_ROLLOFF);
  // Right of your facing is (-fz, fx): facing -z, that's +x.
  const dx = spot.x - p.x;
  const dz = spot.z - p.z;
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(p.fx, p.fz);
  if (flat < 1e-6 || len < 1e-6) return { level, pan: 0 };
  const side = (dx * -p.fz + dz * p.fx) / (flat * len);
  // Right overhead it's in the middle; and never more than halfway to one side.
  return { level, pan: 0.5 * side * Math.min(1, flat / 3) };
}

/** Your speaker volume as a gain: squared like the other sliders, and silent when muted, when the music is, or when the floor has them off. */
export function speakerGain(volume: number, muted: boolean, musicMuted: boolean, floorOn = true): number {
  if (muted || musicMuted || !floorOn) return 0;
  const v = Math.max(0, Math.min(1, volume));
  return v * v;
}

/**
 * A stream plays through one audio element (it can't go through Web Audio), so it's as loud as the
 * louder of the jukebox where you stand and the nearest speaker: one stream, never two.
 */
export function streamVolume(jukebox: number, musicGain: number, speakers: number, speakersGain: number): number {
  return Math.max(0, Math.min(1, Math.max(jukebox * musicGain, speakers * speakersGain)));
}

/** The jukebox window's quick steps for your speaker volume (ui/speakers.ts): off, then quiet to loud. */
export const SPEAKER_STEPS: readonly { level: number; bars: string; label: string }[] = [
  { level: 0, bars: '✕', label: 'Off' },
  { level: 0.25, bars: '▁', label: 'Quiet' },
  { level: 0.4, bars: '▁▃', label: 'Medium' },
  { level: 0.7, bars: '▁▃▅', label: 'Loud' },
];

/** Which step a volume is nearest to (0, off, when muted). */
export function speakerStep(speakers: number, muted: boolean): number {
  if (muted || speakers <= 0.01) return 0;
  let best = 1;
  for (let i = 1; i < SPEAKER_STEPS.length; i++) if (Math.abs(SPEAKER_STEPS[i].level - speakers) < Math.abs(SPEAKER_STEPS[best].level - speakers)) best = i;
  return best;
}

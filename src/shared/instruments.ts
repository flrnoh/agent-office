// The Schallwerk's instruments (flrnoh fork, see FORK.md "The instruments"): the drums, guitars,
// basses, keyboards and mics at every spot of INSTRUMENT_SPOTS (shared/venue.ts), on the stage and in
// the rehearsal rooms. One player per instrument; whoever holds one plays it on their computer
// keyboard, and every note goes through the office to everyone in the venue (`instr.note`), whose
// pages sound it at its spot, heard only in that spot's room. Each room has a jam of its own: a tempo,
// a click and a key (Tonart) the band plays in. Shared by the office (server/venue/instruments.ts,
// which keeps who plays what and checks every note) and the page (features/instruments/).

import { DRUM_PIECES, INSTRUMENT_SPOTS, REHEARSAL_ROOMS, ZONES, venueRoomAt, type InstrumentKind, type InstrumentNote, type InstrumentSpot, type VenueRoomId } from './venue.js';

// ---- The spots ----------------------------------------------------------------------------------

export const SPOT_BY_ID: ReadonlyMap<string, InstrumentSpot> = new Map(INSTRUMENT_SPOTS.map((s) => [s.id, s]));

/** How close (m, on the floor) you must be to a spot to take its instrument. */
export const TAKE_REACH = 3.5;
/** How far from your spot the office still takes your notes (you're held there while you play). */
export const PLAY_REACH = 4;

/** The rooms with instruments in them (where a jam can be). */
export const JAM_ROOMS: readonly VenueRoomId[] = ['hall', ...REHEARSAL_ROOMS.map((r) => r.id)];

/** What each instrument is called, with its icon (the hint bar, the overlay). */
export const KIND_NAMES: Record<InstrumentKind, string> = {
  drums: '🥁 Schlagzeug',
  guitar: '🎸 Gitarre',
  bass: '🎸 Bass',
  keys: '🎹 Keyboard',
  mic: '🎤 Mikro',
};
/** Where a room is, for the hint bar (the hall's spots are all on the stage). */
export const ROOM_NAMES: Record<VenueRoomId, string> = {
  hall: 'Bühne',
  ...(Object.fromEntries(REHEARSAL_ROOMS.map((r) => [r.id, r.name])) as Record<Exclude<VenueRoomId, 'hall'>, string>),
};

// ---- Notes --------------------------------------------------------------------------------------

/** The pitches each instrument may send (MIDI notes; the drums' are DRUM_PIECES). */
export const PITCH_RANGE: Record<Exclude<InstrumentKind, 'mic' | 'drums'>, readonly [number, number]> = {
  guitar: [36, 96], // a drop-C low string up past the 24th fret of the high E
  bass: [23, 67], // a five-string's low B to the G string's top
  keys: [21, 108], // a full piano
};
const DRUM_SET: ReadonlySet<number> = new Set(Object.values(DRUM_PIECES));
/** The longest a note may ring (s). */
export const MAX_LEN = 16;

/**
 * A note as the office takes it from a page, or null when it isn't one the spot's instrument can
 * play. A note with `vel` 0 lets go of that pitch (a key coming up, a string damped: MIDI's
 * note-off), which the drums never send. Pitches are whole, velocities 0..1, lengths 0..MAX_LEN.
 */
export function cleanNote(kind: InstrumentKind, n: unknown): InstrumentNote | null {
  if (kind === 'mic' || !n || typeof n !== 'object') return null;
  const { kind: k, pitch, vel, len } = n as Record<string, unknown>;
  if (k !== kind || typeof pitch !== 'number' || typeof vel !== 'number' || !Number.isInteger(pitch) || !Number.isFinite(vel)) return null;
  if (vel < 0 || vel > 1) return null;
  if (kind === 'drums') {
    if (!DRUM_SET.has(pitch) || vel === 0) return null;
    return { kind, pitch, vel };
  }
  const [lo, hi] = PITCH_RANGE[kind];
  if (pitch < lo || pitch > hi) return null;
  if (len === undefined) return { kind, pitch, vel };
  if (typeof len !== 'number' || !Number.isFinite(len) || len < 0 || len > MAX_LEN) return null;
  return { kind, pitch, vel, len };
}

/** Whether a note lets go of its pitch rather than sounding it (see cleanNote). */
export const isRelease = (n: InstrumentNote) => n.vel === 0;

// ---- How many notes a player may send -------------------------------------------------------------

/**
 * A token bucket: `burst` notes at once (a chord strummed, a fill), refilled at `perSec`. Generous
 * enough for a strummed chord on every sixteenth at 180 a minute with the groove on top, and still a
 * wall against a page flooding the venue.
 */
export const NOTE_RATE = { burst: 120, perSec: 80 } as const;

export class RateBucket {
  private tokens: number;
  private at: number;

  constructor(
    private readonly burst = NOTE_RATE.burst,
    private readonly perSec = NOTE_RATE.perSec,
    now = 0,
  ) {
    this.tokens = burst;
    this.at = now;
  }

  /** Takes one at `now` (ms): false when the bucket's empty. */
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.at) / 1000) * this.perSec);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// ---- The jam: a room's tempo, click and key ---------------------------------------------------------

export interface Jam {
  /** Beats a minute. */
  bpm: number;
  /** The click (the metronome) is on, for everyone playing in the room. */
  click: boolean;
  /** The key the band plays in: 0 = C … 11 = B (the guitars' chords and the bass's notes follow it). */
  key: number;
  /** Major (Dur) or minor (Moll): which chords the number keys play. */
  minor: boolean;
  /** A downbeat on the office's clock (ms): the beats and bars count from here. */
  at: number;
  /** When the last count-in started (ms on the office's clock): a bar of the drummer's sticks. 0: none. */
  countIn: number;
}

export const BPM = { min: 40, max: 240, start: 110 } as const;
export const NO_JAM: Jam = { bpm: BPM.start, click: false, key: 4, minor: true, at: 0, countIn: 0 };

/** What a page may ask of a room's jam. */
export interface JamChange {
  bpm?: number;
  click?: boolean;
  key?: number;
  minor?: boolean;
  /** Start a count-in: a bar of sticks on the next beat. */
  countIn?: boolean;
}

/** The jam after `change` at `now`, or null when nothing in it is valid. A new tempo starts its beat now. */
export function applyJam(jam: Jam, change: unknown, now: number): Jam | null {
  if (!change || typeof change !== 'object') return null;
  const c = change as Record<string, unknown>;
  const next = { ...jam };
  let any = false;
  if (typeof c.bpm === 'number' && Number.isFinite(c.bpm)) {
    next.bpm = Math.round(Math.min(BPM.max, Math.max(BPM.min, c.bpm)));
    next.at = now;
    any = true;
  }
  if (typeof c.click === 'boolean') {
    next.click = c.click;
    if (c.click && !jam.click) next.at = now; // the click starts on a downbeat now
    any = true;
  }
  if (typeof c.key === 'number' && Number.isInteger(c.key)) {
    next.key = ((c.key % 12) + 12) % 12;
    any = true;
  }
  if (typeof c.minor === 'boolean') {
    next.minor = c.minor;
    any = true;
  }
  if (c.countIn === true) {
    // On the next beat of the running grid, or straight away with no grid going.
    const beat = 60000 / next.bpm;
    next.countIn = next.at && next.click ? next.at + Math.ceil((now + 120 - next.at) / beat) * beat : now + 150;
    if (!next.click) next.at = next.countIn;
    any = true;
  }
  return any ? next : null;
}

/** The beat number (from `jam.at`) at office time `t`, fractional. */
export const beatAt = (jam: Jam, t: number) => ((t - jam.at) * jam.bpm) / 60000;

// ---- Who hears what -------------------------------------------------------------------------------

/**
 * How a sound in `room` reaches someone standing at (x, z) in the venue: `gain` 0..1, and whether
 * it's muffled (through a wall and a door). A rehearsal room's sound is heard only in that room; the
 * hall's everywhere outside the rehearsal rooms, faint and dull out in the wing's corridor and lobby.
 */
export function heardIn(x: number, z: number, room: VenueRoomId): { gain: number; muffled: boolean } {
  const here = venueRoomAt(x, z);
  if (here !== room) return { gain: 0, muffled: false };
  if (room !== 'hall') return { gain: 1, muffled: false };
  // Out of the hall into the wing (its lobby and corridor; the rooms are rooms of their own).
  const w = ZONES.wing;
  if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return { gain: 0.28, muffled: true };
  return { gain: 1, muffled: false };
}

/**
 * Whose mic is on the PA for someone in `listenerRoom` (see Voice.setPa): whoever holds a mic of
 * that room. The stage's mics fill the hall (and the foyer, the bar, backstage: all 'hall'); a
 * rehearsal room's mic only its own room. `players` is who plays what (spot id → peer id).
 */
export function micsOnPa(listenerRoom: VenueRoomId, players: Readonly<Record<string, string>>): string[] {
  const ids: string[] = [];
  for (const [spot, id] of Object.entries(players)) {
    const s = SPOT_BY_ID.get(spot);
    if (s && s.kind === 'mic' && s.room === listenerRoom && !ids.includes(id)) ids.push(id);
  }
  return ids.sort();
}

// ---- Each instrument's sound (its amp's channel, the keyboard's patch) -----------------------------------

/** The sounds each instrument can be switched between (the first is how it starts). A note doesn't carry it: the spot does. */
export const TONES = {
  drums: ['kit'],
  guitar: ['drive', 'clean'],
  bass: ['amp'],
  keys: ['piano', 'epiano', 'organ', 'lead', 'pad'],
  mic: ['pa'],
} as const satisfies Record<InstrumentKind, readonly string[]>;
export type Tone = (typeof TONES)[InstrumentKind][number];
export const TONE_NAMES: Record<Tone, string> = {
  kit: 'Schlagzeug',
  drive: 'Verzerrt',
  clean: 'Clean',
  amp: 'Bass-Amp',
  piano: 'Piano',
  epiano: 'E-Piano',
  organ: 'Orgel',
  lead: 'Synth-Lead',
  pad: 'Pad',
  pa: 'PA',
};
/** The sound a spot is on: what its player picked, else its instrument's first. */
export const toneOf = (spot: InstrumentSpot, tones: Readonly<Record<string, string>>): Tone => {
  const t = tones[spot.id];
  return (TONES[spot.kind] as readonly string[]).includes(t ?? '') ? (t as Tone) : TONES[spot.kind][0];
};
/** Whether `tone` is one the instrument at `spot` has. */
export const toneFits = (spot: InstrumentSpot, tone: unknown): tone is Tone => typeof tone === 'string' && (TONES[spot.kind] as readonly string[]).includes(tone);

// ---- The messages ---------------------------------------------------------------------------------

export type InstrumentsClientMsg =
  /** Came into the venue: send me who plays what and the rooms' jams. */
  | { t: 'instr.hello' }
  /** Take the instrument at `spot` (one at a time: taking another puts the first back). */
  | { t: 'instr.take'; spot: string }
  /** Put yours back. */
  | { t: 'instr.leave' }
  /** A note played on the instrument you hold (the office checks it's yours and that it's one it can play). */
  | { t: 'instr.note'; spot: string; note: InstrumentNote }
  /** Change a room's jam (you're in that room). */
  | { t: 'instr.jam'; room: VenueRoomId; change: JamChange }
  /** Switch the sound of the instrument you hold (see TONES). */
  | { t: 'instr.tone'; spot: string; tone: string };

export type InstrumentsServerMsg =
  /** Who plays what now (spot id → peer id), to everyone in the venue on every change. */
  | { t: 'instr.state'; players: Record<string, string> }
  /** `id` played `note` at `spot` (to everyone in the venue but them; droppable). */
  | { t: 'instr.note'; id: string; spot: string; note: InstrumentNote }
  /** Rooms' jams: all of them to someone coming in, one to everyone when it changes. */
  | { t: 'instr.jam'; jams: Partial<Record<VenueRoomId, Jam>> }
  /** The spots' sounds (spot id → tone; a spot not in it is on its first): all of them on coming in and on every change. */
  | { t: 'instr.tones'; tones: Record<string, string> };

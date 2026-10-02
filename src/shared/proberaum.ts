// The Schallwerk's rehearsal wing (flrnoh fork, see FORK.md "The rehearsal wing"): three rehearsal
// rooms and the studio off a corridor, with a lobby. Rooms are booked for a while (one a person),
// their doors keep everyone but the band out while they are (knock, and the band lets you in), what's
// said and played in a room stays in it, and each room's recorder (the studio's desk, a little one on
// every room's mixer) keeps takes of what was played and plays them back for everyone in the room.
// The rules both sides use; the layout is shared/proberaum-layout.ts, the office's side
// server/venue/proberaum.ts, the page's client/features/proberaum/.

import { INSTRUMENT_SPOTS, REHEARSAL_ROOMS, VENUE, venueRoomAt, type InstrumentNote, type RehearsalRoomId, type VenueRoomId } from './venue.js';

// ---- The rules -------------------------------------------------------------------------------------

/** How long a room can be booked for (minutes): the booking window's three buttons. */
export const BOOK_MINUTES = [30, 60, 120] as const;
/** A booking is let go when nobody of its band has been in the Schallwerk for this long (ms). */
export const ABANDON_MS = 15 * 60_000;
/** A knock waits this long for the band to let you in (ms). */
export const KNOCK_MS = 60_000;
/** A band is at most this many. */
export const BAND_MAX = 8;
/** Band names, notes on the Schwarzes Brett, setlists: at most this long. */
export const BAND_NAME_MAX = 32;
export const PIN_MAX = 140;
export const SETLIST_MAX = 600;
export const SETLIST_LINES = 16;
/** The Schwarzes Brett keeps this many notes (the oldest come down first), at most this many of anyone's. */
export const PINS_KEPT = 30;
export const PINS_EACH = 3;
/** The polaroid wall keeps this many bands. */
export const POLAROIDS_KEPT = 24;
/** The paper the notes are on. */
export const PIN_COLORS = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1', '#ffffff'] as const;

/** The recorder: a take is at most this long (ms) and this many notes; each room keeps its last this many. */
export const TAKE_MS_MAX = 10 * 60_000;
export const TAKE_NOTES_MAX = 4000;
export const TAKES_KEPT = 20;
export const TAKE_NAME_MAX = 40;
/** The click track's tempo, and the count-in's beats before the take starts. */
export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const COUNT_IN_BEATS = 4;
/** A take played back on a loop stops by itself after this long (ms). */
export const LOOP_MAX_MS = 30 * 60_000;
/** Playback starts this long after it's asked for, so every page in the room starts it together (ms). */
export const PLAY_LEAD_MS = 600;

export const roomName = (id: RehearsalRoomId): string => REHEARSAL_ROOMS.find((r) => r.id === id)?.name ?? id;
export const isRoomId = (v: unknown): v is RehearsalRoomId => typeof v === 'string' && REHEARSAL_ROOMS.some((r) => r.id === v);

/** What never belongs in text someone typed: control characters, zero-width and direction marks, line and paragraph separators. */
const CONTROL = new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');

/** Text someone typed, cleaned: no control characters, one line (or `lines` lines), trimmed, at most `max` long. */
export function cleanText(v: unknown, max: number, lines = 1): string {
  if (typeof v !== 'string') return '';
  const rows = v
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  const kept = lines <= 1 ? [rows.join(' ').trim()] : rows.slice(0, lines);
  return [...kept.join('\n').trim()].slice(0, max).join('').trim();
}

// ---- The band name generator ---------------------------------------------------------------------

const PLURALS = ['Rückkopplungen', 'Verstärkerbrände', 'Lötkolben', 'Fehlgriffe', 'Kabeltrommeln', 'Notenständer', 'Saitenrisse', 'Taktlosen', 'Bierdeckel', 'Mikrofonständer', 'Brummschleifen', 'Proberaumratten', 'Gitarrengötter', 'Halbtöne', 'Fußpedale', 'Drumsticks', 'Bassisten-Witze'];
const ADJ = ['Velvet', 'Static', 'Rusty', 'Electric', 'Midnight', 'Concrete', 'Neon', 'Analog', 'Feral', 'Lukewarm', 'Cosmic', 'Wobbly', 'Polite', 'Sonic', 'Distorted', 'Gentle', 'Haunted'];
const NOUN = ['Feedback', 'Pretzels', 'Amplifiers', 'Basement', 'Lemmings', 'Echo', 'Tape Machine', 'Fuzz', 'Weasels', 'Cassettes', 'Treble', 'Cowbells', 'Thunder', 'Sofa', 'Monitors', 'Metronome', 'Spaghetti'];
const WHO = ['Kabelsalat', 'Klinkenstecker', 'Brummton', 'Probenkeller', 'Fehlstart', 'Lautstärkeregler', 'Soundcheck', 'Zugabe', 'Stagediver', 'Plektrum', 'Rauschfilter', 'Taktstock'];
const PLACE = ['im Proberaum', 'aus dem Keller', 'ohne Stimmgerät', 'vom Hinterhof', 'auf Tour', 'am Limit', 'in Moll', 'mit Verspätung'];

/** A band name from a seed (any whole number): a few patterns, the parts from the lists above, none of them a real band's. */
export function bandName(seed: number): string {
  let s = (Math.abs(Math.floor(seed)) * 2654435761 + 1013904223) >>> 0;
  const pick = <T>(xs: readonly T[]): T => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return xs[s % xs.length];
  };
  switch (pick([0, 1, 2, 3, 4, 5])) {
    case 0:
      return `Die ${pick(PLURALS)}`;
    case 1:
      return `${pick(ADJ)} ${pick(NOUN)}`;
    case 2:
      return `${pick(WHO)} & die ${pick(PLURALS)}`;
    case 3:
      return `The ${pick(ADJ)} ${pick(NOUN)}`;
    case 4:
      return `${pick(WHO)} ${pick(PLACE)}`;
    default:
      return `${pick(NOUN)} ${pick(PLACE)}`;
  }
}

// ---- Sound kept in ----------------------------------------------------------------------------------

/** Where someone is, for whose voice reaches whom. */
export interface Hearer {
  floor?: string | null;
  x: number;
  z: number;
}

/**
 * Whether a rehearsal room's walls stand between two people: both in the Schallwerk, in different
 * rooms by their sound (venueRoomAt), at least one of them in a rehearsal room. Then neither hears
 * the other's voice, wherever their circles reach (features/voicerange) and whatever PA they're on.
 * Anywhere else it's none of the wing's business (false).
 */
export function soundApart(a: Hearer, b: Hearer): boolean {
  if (a.floor !== VENUE || b.floor !== VENUE) return false;
  return venueRoomAt(a.x, a.z) !== venueRoomAt(b.x, b.z);
}

/** How a sound from one room reaches the ears in another: its level (0..1) and a low-pass cutoff (Hz). */
export interface Muffle {
  gain: number;
  cutoff: number;
}

/**
 * How the hall's sound (the stage, the DJ, the PA: `from` 'hall') is heard by someone in `listener`,
 * or a rehearsal room's out in the hall: the same room plain; the hall in a rehearsal room heavily
 * muffled (a thud and a hum through the walls), louder and brighter with its door open; a rehearsal
 * room out in the hall or the corridor only a thump; one rehearsal room in another hardly at all.
 * For the instruments and the show to put on what they play (FORK.md "The rehearsal wing").
 */
export function muffleFor(listener: VenueRoomId, from: VenueRoomId = 'hall', doorOpen = false): Muffle {
  if (listener === from) return { gain: 1, cutoff: 20000 };
  if (from === 'hall') return doorOpen ? { gain: 0.4, cutoff: 1100 } : { gain: 0.16, cutoff: 260 };
  if (listener === 'hall') return doorOpen ? { gain: 0.35, cutoff: 800 } : { gain: 0.08, cutoff: 170 };
  return { gain: 0.02, cutoff: 120 };
}

// ---- Takes ------------------------------------------------------------------------------------------

/** One note in a take: when (ms from the take's start), at which spot (INSTRUMENT_SPOTS), and the note (its kind is the spot's). */
export type TakeEv = [t: number, spot: string, pitch: number, vel: number, len: number];

const SPOT_BY_ID = new Map(INSTRUMENT_SPOTS.map((s) => [s.id, s]));
export const spotOf = (id: string) => SPOT_BY_ID.get(id);

/** A note heard at `spot`, as a take keeps it (`t` ms in), or null when it isn't a note that room's recorder takes. */
export function takeEv(room: RehearsalRoomId, t: number, spot: unknown, note: unknown): TakeEv | null {
  if (typeof spot !== 'string' || !note || typeof note !== 'object') return null;
  const s = SPOT_BY_ID.get(spot);
  if (!s || s.room !== room || s.kind === 'mic') return null;
  const n = note as Partial<InstrumentNote>;
  if (n.kind !== s.kind || typeof n.pitch !== 'number' || !Number.isInteger(n.pitch) || n.pitch < 0 || n.pitch > 127) return null;
  const vel = typeof n.vel === 'number' && Number.isFinite(n.vel) ? Math.round(Math.min(1, Math.max(0, n.vel)) * 100) / 100 : 0.8;
  const len = typeof n.len === 'number' && Number.isFinite(n.len) ? Math.round(Math.min(8, Math.max(0, n.len)) * 100) / 100 : 0;
  if (!Number.isFinite(t) || t < 0 || t > TAKE_MS_MAX) return null;
  return [Math.round(t), spot, n.pitch, vel, len];
}

/** A take's note back as the instruments play it. */
export function evNote(ev: TakeEv): InstrumentNote | null {
  const s = SPOT_BY_ID.get(ev[1]);
  if (!s || s.kind === 'mic') return null;
  const note: InstrumentNote = { kind: s.kind, pitch: ev[2], vel: ev[3] };
  if (ev[4] > 0) note.len = ev[4];
  return note;
}

/** The notes of a take due between `from` (excluded) and `to` (included), ms into it, in order. */
export function dueBetween(evs: readonly TakeEv[], from: number, to: number): TakeEv[] {
  if (to <= from) return [];
  // Binary search for the first after `from`.
  let lo = 0;
  let hi = evs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (evs[mid][0] <= from) lo = mid + 1;
    else hi = mid;
  }
  const out: TakeEv[] = [];
  for (let i = lo; i < evs.length && evs[i][0] <= to; i++) out.push(evs[i]);
  return out;
}

/** Where a take is (ms into it) at `elapsed` ms after it started, or null once it's over (looping: round again). */
export function takePosition(elapsed: number, dur: number, loop: boolean): number | null {
  if (elapsed < 0) return elapsed;
  if (dur <= 0) return null;
  if (loop) return elapsed % dur;
  return elapsed <= dur ? elapsed : null;
}

// ---- What the office keeps, as the page sees it --------------------------------------------------------

export interface BookingView {
  band: string;
  /** Who booked it (their name). */
  by: string;
  since: number;
  until: number;
  /** The band's names (the booker first). */
  members: string[];
}

export interface RecView {
  /** Who started it (name, and their peer id). */
  by: string;
  byId: string;
  /** When the take starts (the office's clock): the count-in runs before it. */
  startAt: number;
  bpm: number;
  click: boolean;
  /** Recording over this take (it plays along and ends up in the new one). */
  over: string | null;
}

export interface PlayingView {
  take: string;
  startAt: number;
  loop: boolean;
  by: string;
}

export interface RoomView {
  id: RehearsalRoomId;
  door: boolean;
  booking: BookingView | null;
  /** Who's knocking (peer id, name). */
  knocks: { id: string; name: string }[];
  rec: RecView | null;
  playing: PlayingView | null;
  setlist: string;
  setlistBy: string;
}

export interface TakeMeta {
  id: string;
  room: RehearsalRoomId;
  name: string;
  by: string;
  at: number;
  /** How long (ms), how many notes, which instruments. */
  dur: number;
  notes: number;
  kinds: string[];
}

export interface Take extends TakeMeta {
  evs: TakeEv[];
}

export interface PinView {
  id: string;
  text: string;
  by: string;
  at: number;
  color: string;
}

export interface Polaroid {
  band: string;
  names: string[];
  room: RehearsalRoomId;
  at: number;
}

export interface ProbeView {
  /** The office's clock when it was sent. */
  now: number;
  rooms: RoomView[];
  takes: TakeMeta[];
  pins: PinView[];
  polaroids: Polaroid[];
  /** What's in the tip jar (€). */
  tips: number;
}

/** What's yours: the room you booked, the bands you're in, the takes you made, your notes. */
export interface ProbeYou {
  booked: RehearsalRoomId | null;
  band: RehearsalRoomId[];
  takes: string[];
  pins: string[];
}

// ---- The messages -----------------------------------------------------------------------------------

export type ProberaumClientMsg =
  /** Coming into the Schallwerk: what the wing's like now. */
  | { t: 'probe.look' }
  /** Book a room for `minutes` (or a booking of yours for longer), the band called `band`. */
  | { t: 'probe.book'; room: RehearsalRoomId; minutes: number; band: string }
  /** Let go of your booking. */
  | { t: 'probe.release'; room: RehearsalRoomId }
  /** Your booking's band is called this now. */
  | { t: 'probe.band'; name: string }
  /** The booker adds someone in the room to the band, or takes someone off it. */
  | { t: 'probe.member'; room: RehearsalRoomId; id: string; add: boolean }
  /** Open or close a room's door. */
  | { t: 'probe.door'; room: RehearsalRoomId; open: boolean }
  /** Knock on a booked room's door. */
  | { t: 'probe.knock'; room: RehearsalRoomId }
  /** Let whoever knocked in (they're in the band then). */
  | { t: 'probe.letin'; room: RehearsalRoomId; id: string }
  /** The room's whiteboard says this now. */
  | { t: 'probe.setlist'; room: RehearsalRoomId; text: string }
  /** The recorder: start a take (a count-in and a click at `bpm` if asked, over take `over` if given). */
  | { t: 'probe.rec'; room: RehearsalRoomId; bpm: number; click: boolean; countIn: boolean; over?: string | null }
  /** Stop the take: kept (named `name`), or thrown away. */
  | { t: 'probe.recstop'; room: RehearsalRoomId; keep: boolean; name?: string }
  /** Play a take back for everyone in the room, once or round and round. */
  | { t: 'probe.play'; room: RehearsalRoomId; take: string; loop: boolean }
  /** Stop what the room's playing back. */
  | { t: 'probe.halt'; room: RehearsalRoomId }
  /** Rename a take of yours, or delete it. */
  | { t: 'probe.take'; take: string; name?: string; del?: boolean }
  /** Pin a note on the Schwarzes Brett, or take one of yours down. */
  | { t: 'probe.pin'; text: string; color: number }
  | { t: 'probe.unpin'; id: string }
  /** A coin in the tip jar. */
  | { t: 'probe.tip' };

export type ProberaumServerMsg =
  /** The wing as it is now (to everyone in the Schallwerk, each with what's theirs). */
  | { t: 'probe'; view: ProbeView; you: ProbeYou }
  /** Someone's knocking on `room`'s door. */
  | { t: 'probe.knocked'; room: RehearsalRoomId; name: string }
  /** `room` plays this take back from `startAt` (the office's clock), or stops (null). */
  | { t: 'probe.playing'; room: RehearsalRoomId; take: Take | null; startAt: number; loop: boolean }
  /** A coin went in the tip jar. */
  | { t: 'probe.tipped'; name: string; tips: number };

export const PROBE_CLIENT_MSGS = ['probe.look', 'probe.book', 'probe.release', 'probe.band', 'probe.member', 'probe.door', 'probe.knock', 'probe.letin', 'probe.setlist', 'probe.rec', 'probe.recstop', 'probe.play', 'probe.halt', 'probe.take', 'probe.pin', 'probe.unpin', 'probe.tip'] as const satisfies readonly ProberaumClientMsg['t'][];
export const PROBE_SERVER_MSGS = ['probe', 'probe.knocked', 'probe.playing', 'probe.tipped'] as const satisfies readonly ProberaumServerMsg['t'][];

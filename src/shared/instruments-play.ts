// Playing the Schallwerk's instruments on a computer keyboard (flrnoh fork, see FORK.md "The
// instruments"): which key plays what on each instrument, the chords and scales the guitars and the
// bass play in the room's key, and the drums' grooves. Pure, so the tests and the docs can go by it;
// features/instruments/play.ts turns key presses into notes with it. Keys are KeyboardEvent.code
// (where the key is, whatever the layout: KeyZ is the Y on a German keyboard).

import { DRUM_PIECES, type InstrumentKind } from './venue.js';
import { PITCH_RANGE } from './instruments.js';

// ---- The drums --------------------------------------------------------------------------------------

export type DrumPiece = keyof typeof DRUM_PIECES;

/** Each key of the kit: the piece and how hard (Shift on top hits as an accent). */
export const DRUM_KEYS: Readonly<Record<string, { piece: DrumPiece; vel: number }>> = {
  Space: { piece: 'kick', vel: 0.85 },
  KeyV: { piece: 'kick', vel: 0.85 }, // the second pedal of a double bass drum
  KeyF: { piece: 'snare', vel: 0.8 },
  KeyJ: { piece: 'snare', vel: 0.8 },
  KeyX: { piece: 'snare', vel: 0.3 }, // a ghost note
  KeyD: { piece: 'hihat', vel: 0.7 },
  KeyK: { piece: 'hihat', vel: 0.7 },
  Comma: { piece: 'hihat', vel: 0.38 },
  KeyS: { piece: 'openhat', vel: 0.75 },
  KeyL: { piece: 'openhat', vel: 0.75 },
  KeyR: { piece: 'tomHi', vel: 0.8 },
  KeyT: { piece: 'tomMid', vel: 0.8 },
  KeyG: { piece: 'tomLow', vel: 0.82 },
  KeyH: { piece: 'tomLow', vel: 0.82 },
  KeyQ: { piece: 'crash', vel: 0.85 },
  KeyP: { piece: 'crash', vel: 0.85 },
  KeyW: { piece: 'ride', vel: 0.7 },
  KeyO: { piece: 'ride', vel: 0.7 },
};
/** Shift held: an accent. */
export const ACCENT = 1;

/** A groove the Groove-Knopf loops: a bar of sixteenths per piece ('X' accent, 'x' a hit, 'o' a ghost note, '.' rest). */
export interface Groove {
  name: string;
  /** Where the off-beat eighths fall, 0.5 straight … 2/3 a shuffle. */
  swing: number;
  steps: Partial<Record<DrumPiece, string>>;
}

export const GROOVES: readonly Groove[] = [
  {
    name: 'Rock',
    swing: 0.5,
    steps: { hihat: 'X.x.X.x.X.x.X.x.', snare: '....X.......X..o', kick: 'x.......x.x.....' },
  },
  {
    name: 'Disco',
    swing: 0.5,
    steps: { hihat: 'x...x...x...x...', openhat: '..x...x...x...x.', snare: '....X.......X...', kick: 'X...X...X...X...' },
  },
  {
    name: 'Halftime',
    swing: 0.5,
    steps: { hihat: 'X.x.x.x.X.x.x.x.', snare: '........X.....o.', kick: 'x.....x...x.....' },
  },
  {
    name: 'Shuffle',
    swing: 2 / 3,
    steps: { ride: 'X.x.X.x.X.x.X.x.', snare: '....X.......X...', kick: 'x.....x.x.....x.', hihat: '....x.......x...' },
  },
  {
    name: 'Punk',
    swing: 0.5,
    steps: { hihat: 'x.x.x.x.x.x.x.x.', snare: '..X...X...X...X.', kick: 'X...x...x...x...' },
  },
];
/** The keys picking a groove (Digit1 the first), and the one stopping it. */
export const GROOVE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'] as const;
export const GROOVE_OFF = 'Digit0';

/** What a groove plays on the sixteenth `step` (0..15): each piece and how hard. */
export function grooveHits(g: Groove, step: number): { piece: DrumPiece; vel: number }[] {
  const hits: { piece: DrumPiece; vel: number }[] = [];
  for (const [piece, bar] of Object.entries(g.steps) as [DrumPiece, string][]) {
    const c = bar[step % 16];
    if (c === 'X') hits.push({ piece, vel: 0.92 });
    else if (c === 'x') hits.push({ piece, vel: 0.7 });
    else if (c === 'o') hits.push({ piece, vel: 0.28 });
  }
  return hits;
}

/** When (in beats into the bar) the sixteenth `step` sounds, with the groove's swing on the off-beat eighths. */
export const stepBeat = (g: Groove, step: number) => Math.floor(step / 4) + (step % 4 === 2 ? g.swing : (step % 4) / 4) + (step % 4 === 3 && g.swing > 0.5 ? g.swing - 0.5 : 0);

// ---- Chords and scales in the room's key -----------------------------------------------------------------

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
type Quality = 'maj' | 'min' | 'dim';
const MAJOR_Q: Quality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_Q: Quality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'H'] as const;

/** The number keys' chords: the key's seven chords, and an eighth (the ♭VII in major, the dominant V in minor). */
export const CHORD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'] as const;

/** The chord on slot `slot` (0..7) in `key` (0 = C), major or minor: its root (pitch class) and quality. */
export function chordOf(key: number, minor: boolean, slot: number): { root: number; quality: Quality; name: string } {
  let root: number;
  let quality: Quality;
  if (slot === 7) {
    root = (key + (minor ? 7 : 10)) % 12;
    quality = 'maj';
  } else {
    root = (key + (minor ? MINOR : MAJOR)[slot]) % 12;
    quality = (minor ? MINOR_Q : MAJOR_Q)[slot];
  }
  return { root, quality, name: `${NOTE_NAMES[root]}${quality === 'min' ? 'm' : quality === 'dim' ? '°' : ''}` };
}

/** The lowest pitch of pitch class `pc` at or above `from`. */
const above = (pc: number, from: number) => from + ((((pc - from) % 12) + 12) % 12);

/**
 * A guitar's chord as it's strummed, low string first: a power chord (root, fifth, octave on the
 * bottom strings, the fifth doubled on top) or a full barre chord, its root on the low E string
 * (E shape) up to the 6th fret, else on the A string (A shape), as a guitarist grabs them.
 */
export function guitarChord(root: number, quality: Quality, power: boolean): number[] {
  const onE = above(root, 40);
  const eShape = onE <= 46;
  const low = eShape ? onE : above(root, 45);
  if (power) return [low, low + 7, low + 12, low + 19].filter((_, i) => i < (low < 45 ? 4 : 3));
  const third = quality === 'maj' ? 4 : 3;
  const fifth = quality === 'dim' ? 6 : 7;
  if (eShape) return [low, low + fifth, low + 12, low + 12 + third, low + 12 + fifth, low + 24];
  return [low, low + fifth, low + 12, low + 12 + third, low + 12 + fifth];
}

/** The pentatonic the leads and the bass play over the key: minor's in a minor key, major's in a major one. */
export const pentatonic = (minor: boolean) => (minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]);

/** The keys of the lead rows: the home row up the scale, the top row the same an octave up (E is for stopping). */
export const LEAD_HOME = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'] as const;
export const LEAD_TOP = ['KeyQ', 'KeyW', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'] as const;

/** Where each instrument's scale starts: the key's root at or above this. */
const SCALE_FROM: Record<'guitar' | 'bass', number> = { guitar: 45, bass: 28 };

/** The pitch of a lead key (`code`) on the guitar or the bass in the room's key, or undefined if it isn't one. */
export function leadPitch(kind: 'guitar' | 'bass', code: string, key: number, minor: boolean): number | undefined {
  const home = (LEAD_HOME as readonly string[]).indexOf(code);
  const top = (LEAD_TOP as readonly string[]).indexOf(code);
  const i = home >= 0 ? home : top;
  if (i < 0) return undefined;
  const scale = pentatonic(minor);
  const p = above(key, SCALE_FROM[kind]) + Math.floor(i / 5) * 12 + scale[i % 5] + (top >= 0 ? 12 : 0);
  const [lo, hi] = PITCH_RANGE[kind];
  return p >= lo && p <= hi ? p : undefined;
}

/** The bass's note for a chord's number key: the chord's root, down low. */
export const bassRoot = (root: number) => above(root, SCALE_FROM.bass);

// ---- The keyboard ----------------------------------------------------------------------------------------

/**
 * Two and a half octaves on the typing keyboard, the way trackers and DAWs lay them: the bottom row
 * the lower octave's white keys with the black keys in the row above it (Y/Z S X D C …), the top row
 * the upper octave's with the number row's black keys (Q 2 W 3 E R 5 T …). Semitones over the octave
 * you're in.
 */
export const KEYS_KEYS: Readonly<Record<string, number>> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31,
};
/** The keyboard's octave: the bottom row's C (C3 to start with), and how far it shifts. */
export const KEYS_OCTAVE = { start: 48, min: 24, max: 72 } as const;

/** Which keys stop playing, by instrument: Esc always; E too, but on the keyboard, where E is a note (Backspace there instead). */
export const leaveKeys = (kind: InstrumentKind): readonly string[] => (kind === 'keys' ? ['Escape', 'Backspace'] : ['Escape', 'KeyE']);

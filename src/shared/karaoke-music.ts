// The karaoke bar's own songs (flrnoh fork, see FORK.md "Karaoke"), as both sides read them: a song
// is written down as chords per bar and lines of lyrics with a melody (karaoke-songs.ts), and this
// lays it out in time: where each syllable starts and how long it's held, which line is up, which
// chord the band plays. The server only needs how long a song runs; the page plays the band and
// lights the words up from the same timeline, so everyone's screen is on the same syllable.

/** How the band plays it (features/karaoke/band.ts has a groove for each). */
export type SongStyle = 'ballad' | 'blues' | 'schlager' | 'anthem' | 'tango';

/** A part of the song: its chords (one per bar) and how many bars each lyric line takes. */
export interface SongSection {
  chords: string[];
  barsPerLine: number;
  /** The melody of each line: notes like `G4:1` (pitch:beats), `r:.5` a rest, `_A4:1` the syllable before held on to a new pitch. */
  melody: string[];
}

export interface SongDef {
  id: string;
  title: string;
  /** Who it's by (made up: they're the office's own). */
  artist: string;
  /** What kind of song, in a few words, for the song book. */
  blurb: string;
  style: SongStyle;
  bpm: number;
  /** Swung eighths (the blues). */
  swing?: boolean;
  /** Chords of the bars before the first verse (the count-in on the screen) and after the last chorus. */
  intro: string[];
  outro: string[];
  verse: SongSection;
  chorus: SongSection;
  /** The two verses' lines (syllables split with `|`), each line as many syllables as its melody has notes. */
  verses: [string[], string[]];
  /** The chorus's lines, sung after each verse. */
  refrain: string[];
}

/** One sung syllable, in beats from the song's start. */
export interface Syllable {
  text: string;
  at: number;
  len: number;
  /** MIDI note of the melody (where it starts, for a held one). */
  midi: number;
  /** Whether a space follows it (the end of a word). */
  space: boolean;
}

export interface LyricLine {
  at: number;
  end: number;
  section: 'verse' | 'chorus';
  syllables: Syllable[];
  text: string;
}

export interface MelodyNote {
  at: number;
  len: number;
  midi: number;
}

export interface Timeline {
  bpm: number;
  /** How long it runs, in beats, the outro included. */
  beats: number;
  lines: LyricLine[];
  /** The chord from each bar on. */
  chords: { at: number; chord: string }[];
  melody: MelodyNote[];
  /** Where each part begins (the band fills into it, the lights go up for a chorus). */
  parts: { at: number; kind: 'intro' | 'verse' | 'chorus' | 'outro' }[];
}

export const BEATS_PER_BAR = 4;
const NOTE_NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `G4`, `F#3`, `Bb4` as a MIDI note number (C4 = 60), or NaN. */
export function noteMidi(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return NaN;
  return 12 * (Number(m[3]) + 1) + NOTE_NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export interface Chord {
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Semitones above the root of each note in it (the root itself is 0). */
  tones: number[];
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  '6': [0, 4, 7, 9],
};

/** A chord's name (`C`, `Am`, `G7`, `F#m`, `Bbmaj7`, `Dsus4`) as its root and tones; null if it isn't one. */
export function parseChord(name: string): Chord | null {
  const m = /^([A-G])(#|b)?(m7|maj7|sus4|dim|m|7|6)?$/.exec(name);
  if (!m) return null;
  const root = (NOTE_NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, tones: QUALITIES[m[3] ?? ''] };
}

interface Note {
  midi: number | null;
  len: number;
  /** Held on from the syllable before. */
  tie: boolean;
}

/** A line's melody as notes; throws on anything it can't read. */
export function parseMelody(src: string): Note[] {
  return src
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^(_?)([A-G](?:#|b)?-?\d|r):(\d*\.?\d+)$/.exec(tok);
      if (!m) throw new Error(`Not a note: ${tok}`);
      const len = Number(m[3]);
      if (m[2] === 'r') return { midi: null, len, tie: false };
      const midi = noteMidi(m[2]);
      if (!Number.isFinite(midi) || !(len > 0)) throw new Error(`Not a note: ${tok}`);
      return { midi, len, tie: m[1] === '_' };
    });
}

/** A line's syllables as written (`Grü|ner Build`): each syllable, and whether a word ends after it. */
export function splitSyllables(line: string): { text: string; space: boolean }[] {
  const out: { text: string; space: boolean }[] = [];
  for (const word of line.trim().split(/\s+/)) {
    const parts = word.split('|');
    parts.forEach((p, i) => out.push({ text: p, space: i === parts.length - 1 }));
  }
  return out;
}

/** How many syllables a melody sings (its notes, not counting rests or held-on ones). */
export const sungNotes = (melody: string) => parseMelody(melody).filter((n) => n.midi !== null && !n.tie).length;
/** How many beats a melody takes, rests included. */
export const melodyBeats = (melody: string) => parseMelody(melody).reduce((s, n) => s + n.len, 0);

/** Swung eighths: an offbeat eighth lands two thirds of the way through its beat. */
function swingAt(beat: number, swing: boolean): number {
  if (!swing) return beat;
  const whole = Math.floor(beat + 1e-9);
  const frac = beat - whole;
  return Math.abs(frac - 0.5) < 1e-6 ? whole + 2 / 3 : beat;
}

const timelines = new Map<SongDef, Timeline>();

/** The song laid out in time (worked out once a song). Throws when its lines don't fit their melodies. */
export function timeline(song: SongDef): Timeline {
  const hit = timelines.get(song);
  if (hit) return hit;
  const t: Timeline = { bpm: song.bpm, beats: 0, lines: [], chords: [], melody: [], parts: [] };
  let bar = 0;
  const chords = (list: string[]) => {
    for (const c of list) {
      if (!parseChord(c)) throw new Error(`${song.id}: not a chord: ${c}`);
      t.chords.push({ at: bar * BEATS_PER_BAR, chord: c });
      bar++;
    }
  };
  const section = (kind: 'verse' | 'chorus', sec: SongSection, lines: string[]) => {
    const start = bar * BEATS_PER_BAR;
    t.parts.push({ at: start, kind });
    if (lines.length * sec.barsPerLine !== sec.chords.length) throw new Error(`${song.id}: ${kind} has ${lines.length} lines for ${sec.chords.length} bars`);
    if (sec.melody.length !== lines.length) throw new Error(`${song.id}: ${kind} has ${lines.length} lines and ${sec.melody.length} melodies`);
    lines.forEach((line, i) => {
      const lineAt = start + i * sec.barsPerLine * BEATS_PER_BAR;
      const lineEnd = lineAt + sec.barsPerLine * BEATS_PER_BAR;
      const notes = parseMelody(sec.melody[i]);
      const syl = splitSyllables(line);
      const sung = notes.filter((n) => n.midi !== null && !n.tie).length;
      if (sung !== syl.length) throw new Error(`${song.id}: "${line}" has ${syl.length} syllables for ${sung} notes`);
      const beats = notes.reduce((s, n) => s + n.len, 0);
      if (beats > sec.barsPerLine * BEATS_PER_BAR + 1e-6) throw new Error(`${song.id}: "${line}" runs ${beats} beats, over its ${sec.barsPerLine} bars`);
      const out: Syllable[] = [];
      let at = 0;
      let k = 0;
      for (const n of notes) {
        const from = swingAt(lineAt + at, !!song.swing);
        at += n.len;
        const to = swingAt(lineAt + at, !!song.swing);
        if (n.midi === null) continue;
        t.melody.push({ at: from, len: to - from, midi: n.midi });
        if (n.tie && out.length) out[out.length - 1].len = to - out[out.length - 1].at;
        else if (!n.tie) {
          out.push({ text: syl[k].text, space: syl[k].space, at: from, len: to - from, midi: n.midi });
          k++;
        }
      }
      t.lines.push({ at: lineAt, end: lineEnd, section: kind, syllables: out, text: lyricText(out) });
    });
    chords(sec.chords);
  };
  t.parts.push({ at: 0, kind: 'intro' });
  chords(song.intro);
  section('verse', song.verse, song.verses[0]);
  section('chorus', song.chorus, song.refrain);
  section('verse', song.verse, song.verses[1]);
  section('chorus', song.chorus, song.refrain);
  t.parts.push({ at: bar * BEATS_PER_BAR, kind: 'outro' });
  chords(song.outro);
  t.beats = bar * BEATS_PER_BAR;
  timelines.set(song, t);
  return t;
}

/** A line's syllables put back together as words. */
export function lyricText(syl: readonly { text: string; space: boolean }[]): string {
  return syl.map((s) => s.text + (s.space ? ' ' : '')).join('').trim();
}

/** How long a song runs, in seconds. */
export function songSeconds(song: SongDef): number {
  return (timeline(song).beats * 60) / song.bpm;
}

/** Where in the song `seconds` is: the beat, the line being sung (or the next, between lines), and the one after. */
export function songAt(song: SongDef, seconds: number): { beat: number; line: number; part: Timeline['parts'][number]['kind'] } {
  const t = timeline(song);
  const beat = (seconds * song.bpm) / 60;
  let line = t.lines.findIndex((l) => beat < l.end);
  if (line < 0) line = t.lines.length;
  let part: Timeline['parts'][number]['kind'] = 'intro';
  for (const p of t.parts) if (beat >= p.at) part = p.kind;
  return { beat, line, part };
}

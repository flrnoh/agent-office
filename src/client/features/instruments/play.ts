import { DRUM_PIECES, type InstrumentNote } from '../../../shared/venue';
import { BPM, TONES, beatAt, type Jam, type JamChange, type Tone } from '../../../shared/instruments';
import { CHORD_KEYS, DRUM_KEYS, GROOVES, GROOVE_KEYS, GROOVE_OFF, KEYS_KEYS, KEYS_OCTAVE, bassRoot, chordOf, grooveHits, guitarChord, leadPitch, leaveKeys, stepBeat } from '../../../shared/instruments-play';
import type { Station } from './stations';

// ---- Playing an instrument (flrnoh fork, see FORK.md "The instruments") ----------------------------------
// What your keys do while you're at an instrument (the key maps are shared/instruments-play.ts's):
// each press is a note, played on your own page straight away and sent to the office for everyone
// else. A keyboard's key let go lets go of its note (a vel-0 note, see cleanNote); a string rings on
// until the next stroke damps it (Shift palm-mutes it, a short `len`). The drums' Groove-Knopf
// loops a beat on the room's tempo grid that you play over; the room's tempo, click, count-in and key
// are the jam everyone in the room shares (instr.jam). Esc (and E, but on the keyboard) stops.

export interface MusicianHooks {
  /** A note you played: sound it here, and send it. `at` (ms, performance clock) when it's due, for the groove's notes scheduled ahead. */
  note(n: InstrumentNote, at?: number): void;
  jam(): Jam;
  setJam(change: JamChange): void;
  tone(): Tone;
  setTone(t: Tone): void;
  /** The office's clock now (ms). */
  officeNow(): number;
  /** Stop playing (a leave key). */
  leave(): void;
  /** Something the overlay shows changed. */
  changed(): void;
}

/** A palm-muted string's length (s): see PALM_MUTE in sound/engine.ts. */
const MUTED_LEN = 0.2;
/** How far ahead (ms) the groove is scheduled. */
const AHEAD = 120;

export class Musician {
  station: Station | null = null;
  /** Keys held down → the pitches they sound (to let go of on key up). */
  private held = new Map<string, number[]>();
  /** The guitar's chord picked last (0..7), the power-chord mode, the keyboard's octave and sustain pedal. */
  chord = 0;
  power = true;
  octave: number = KEYS_OCTAVE.start;
  private pedal = false;
  private pedalled = new Set<number>();
  /** The groove going (index into GROOVES), or -1, and the last sixteenth scheduled (absolute, from the jam's grid). */
  groove = -1;
  private grooveStep = -1;
  /** Keys pressed now, for the overlay to light up. */
  readonly down = new Set<string>();

  constructor(private readonly hooks: MusicianHooks) {}

  get kind() {
    return this.station?.spot.kind ?? null;
  }

  start(st: Station) {
    this.station = st;
    this.held.clear();
    this.down.clear();
    this.groove = -1;
    this.pedal = false;
    this.pedalled.clear();
  }

  stop() {
    this.releaseAll();
    this.station = null;
    this.groove = -1;
  }

  /** A key went down while you're playing: true when it was the instrument's. */
  keyDown(e: KeyboardEvent): boolean {
    const kind = this.kind;
    if (!kind) return false;
    if (leaveKeys(kind).includes(e.code)) {
      if (!e.repeat) this.hooks.leave();
      return true;
    }
    const took = kind === 'drums' ? this.drums(e) : kind === 'guitar' || kind === 'bass' ? this.strings(e, kind) : kind === 'keys' ? this.keys(e) : false;
    if (took) {
      this.down.add(e.code);
      this.hooks.changed();
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Quote' || e.code === 'Slash') e.preventDefault();
    }
    return took;
  }

  keyUp(e: KeyboardEvent) {
    if (!this.station) return;
    this.down.delete(e.code);
    if (this.kind === 'keys' && e.code === 'Space') {
      this.pedal = false;
      for (const p of this.pedalled) this.release(p);
      this.pedalled.clear();
    }
    const pitches = this.held.get(e.code);
    if (pitches) {
      this.held.delete(e.code);
      for (const p of pitches) this.release(p);
    }
    this.hooks.changed();
  }

  /** Lets go of everything held (the window lost focus, you stopped). */
  releaseAll() {
    for (const pitches of this.held.values()) for (const p of pitches) this.release(p);
    for (const p of this.pedalled) this.release(p);
    this.held.clear();
    this.pedalled.clear();
    this.down.clear();
  }

  private release(pitch: number) {
    const kind = this.kind;
    if (!kind || kind === 'drums' || kind === 'mic') return;
    // With the pedal down the keyboard's notes ring on until it comes up.
    if (kind === 'keys' && this.pedal) {
      this.pedalled.add(pitch);
      return;
    }
    // Another key still holds the same pitch: it rings on.
    for (const ps of this.held.values()) if (ps.includes(pitch)) return;
    this.hooks.note({ kind, pitch, vel: 0 });
  }

  private sound(code: string, pitches: number[], vel: number, len?: number) {
    const kind = this.kind;
    if (!kind || kind === 'drums' || kind === 'mic') return;
    // A key held holds its note; a string rings on by itself (the next stroke damps it, Shift mutes it).
    if (kind === 'keys') this.held.set(code, pitches);
    for (const p of pitches) {
      this.pedalled.delete(p);
      this.hooks.note({ kind, pitch: p, vel, ...(len !== undefined ? { len } : {}) });
    }
  }

  // ---- The drums ------------------------------------------------------------------------------------------

  private drums(e: KeyboardEvent): boolean {
    const hit = DRUM_KEYS[e.code];
    if (hit) {
      if (!e.repeat) this.hooks.note({ kind: 'drums', pitch: DRUM_PIECES[hit.piece], vel: e.shiftKey ? 1 : hit.vel });
      return true;
    }
    const g = (GROOVE_KEYS as readonly string[]).indexOf(e.code);
    if (g >= 0 || e.code === GROOVE_OFF) {
      if (e.repeat) return true;
      this.groove = g < 0 || g === this.groove ? -1 : g;
      // Start on the next sixteenth of the grid (the jam's), the first bar with a crash.
      this.grooveStep = -1;
      this.grooveFirst = true;
      if (this.groove >= 0 && !this.hooks.jam().at) this.hooks.setJam({ bpm: this.hooks.jam().bpm });
      return true;
    }
    return this.jamKeys(e);
  }

  /** The tempo, the click and the count-in (on the drums' map; anyone in the room may). */
  private jamKeys(e: KeyboardEvent): boolean {
    const jam = this.hooks.jam();
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const step = (e.shiftKey ? 1 : 5) * (e.code === 'ArrowUp' ? 1 : -1);
      this.hooks.setJam({ bpm: Math.min(BPM.max, Math.max(BPM.min, jam.bpm + step)) });
      return true;
    }
    if (e.code === 'KeyN') {
      if (!e.repeat) this.hooks.setJam({ click: !jam.click });
      return true;
    }
    if (e.code === 'KeyB') {
      if (!e.repeat) this.hooks.setJam({ countIn: true });
      return true;
    }
    return false;
  }

  /** Each frame while you play: the groove's next sixteenths, scheduled `AHEAD` ms out on the room's grid. */
  update() {
    if (this.kind !== 'drums' || this.groove < 0) return;
    const jam = this.hooks.jam();
    const g = GROOVES[this.groove];
    const now = this.hooks.officeNow();
    const beatMs = 60000 / jam.bpm;
    const barMs = beatMs * 4;
    // The bars count from the jam's downbeat.
    const until = now + AHEAD;
    // The grid moved (a new tempo): pick up from where it is now.
    if (jam.at !== this.gridAt || jam.bpm !== this.gridBpm) {
      this.gridAt = jam.at;
      this.gridBpm = jam.bpm;
      this.grooveStep = -1;
    }
    let step = this.grooveStep < 0 ? Math.floor(((now - jam.at) / barMs) * 16) + 1 : this.grooveStep + 1;
    for (; ; step++) {
      const bar = Math.floor(step / 16);
      const s = ((step % 16) + 16) % 16;
      const at = jam.at + bar * barMs + stepBeat(g, s) * beatMs;
      if (at > until) break;
      this.grooveStep = step;
      if (at < now - 30) continue;
      const due = performance.now() + (at - now);
      const hits = grooveHits(g, s);
      // The groove's first downbeat: a crash with it.
      if (s === 0 && this.grooveFirst) hits.push({ piece: 'crash', vel: 0.85 });
      if (s === 0) this.grooveFirst = false;
      for (const h of hits) this.hooks.note({ kind: 'drums', pitch: DRUM_PIECES[h.piece], vel: h.vel }, due);
    }
  }
  private grooveFirst = true;
  private gridAt = 0;
  private gridBpm = 0;

  /** Where in the bar the room's grid is, for the overlay: the beat (1..4) and whether it's running. */
  beat(): number {
    const jam = this.hooks.jam();
    return jam.at ? (((Math.floor(beatAt(jam, this.hooks.officeNow())) % 4) + 4) % 4) + 1 : 0;
  }

  // ---- Guitar and bass ---------------------------------------------------------------------------------------

  private strings(e: KeyboardEvent, kind: 'guitar' | 'bass'): boolean {
    const jam = this.hooks.jam();
    const mute = e.shiftKey;
    const vel = mute ? 0.75 : 0.9;
    const len = mute ? MUTED_LEN : undefined;
    const slot = (CHORD_KEYS as readonly string[]).indexOf(e.code);
    if (slot >= 0) {
      if (e.repeat) return true;
      this.chord = slot;
      const c = chordOf(jam.key, jam.minor, slot);
      if (kind === 'bass') this.sound(e.code, [bassRoot(c.root)], vel, len);
      else this.sound(e.code, guitarChord(c.root, c.quality, this.power), vel, len);
      return true;
    }
    if (kind === 'guitar' && (e.code === 'Space' || e.code === 'KeyB')) {
      if (e.repeat) return true;
      const c = chordOf(jam.key, jam.minor, this.chord);
      const notes = guitarChord(c.root, c.quality, this.power);
      // Space strums down (low string first), B up.
      this.sound(e.code, e.code === 'KeyB' ? [...notes].reverse() : notes, e.code === 'KeyB' ? vel * 0.85 : vel, len);
      return true;
    }
    const lead = leadPitch(kind, e.code, jam.key, jam.minor);
    if (lead !== undefined) {
      if (!e.repeat) this.sound(e.code, [lead], vel, len);
      return true;
    }
    if (kind === 'guitar' && e.code === 'KeyV') {
      if (!e.repeat) this.hooks.setTone(this.hooks.tone() === 'clean' ? 'drive' : 'clean');
      return true;
    }
    if (kind === 'guitar' && e.code === 'KeyC') {
      if (!e.repeat) this.power = !this.power;
      return true;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      this.hooks.setJam({ key: jam.key + (e.code === 'ArrowRight' ? 1 : -1) });
      return true;
    }
    if (e.code === 'KeyM') {
      if (!e.repeat) this.hooks.setJam({ minor: !jam.minor });
      return true;
    }
    return false;
  }

  // ---- The keyboard ------------------------------------------------------------------------------------------

  private keys(e: KeyboardEvent): boolean {
    const semi = KEYS_KEYS[e.code];
    if (semi !== undefined) {
      if (!e.repeat) this.sound(e.code, [this.octave + semi], e.shiftKey ? 1 : 0.78);
      return true;
    }
    if (e.code === 'Space') {
      this.pedal = true;
      return true;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      this.octave = Math.min(KEYS_OCTAVE.max, Math.max(KEYS_OCTAVE.min, this.octave + (e.code === 'ArrowRight' ? 12 : -12)));
      return true;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const list = TONES.keys as readonly Tone[];
      const i = list.indexOf(this.hooks.tone());
      this.hooks.setTone(list[(i + (e.code === 'ArrowUp' ? 1 : list.length - 1)) % list.length]);
      return true;
    }
    return false;
  }
}

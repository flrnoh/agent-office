import { BEATS_PER_BAR, parseChord, timeline, type Chord, type SongDef, type SongStyle, type Timeline } from '../../../shared/karaoke-music';
import type { AudioCore } from '../../sound/core';
import type { Pos } from '../../sound/places';
import { Instruments } from './instruments';

// ---- The karaoke bar's band (flrnoh fork, see FORK.md "Karaoke") ---------------------------------------
// Plays the backing track of one of the bar's own songs (shared/karaoke-songs.ts), synthesized, in
// the groove of its style, with a soft guide melody on top: from the PA either side of the stage, on
// your music volume. Everyone's page plays it from the same moment on the office's clock, so the
// band, the words lighting up on the screen and the singer stay together. A sixteenth at a time,
// a fifth of a second ahead.

/** How far ahead notes are scheduled (s). */
const AHEAD = 0.22;
/** How far the office's clock may wander from the audio's before the band is put back in step (s). */
const SLIP = 0.06;

interface Step {
  /** The sixteenth in its bar (0–15), and the bar in the song. */
  s: number;
  bar: number;
  chord: Chord;
  part: Timeline['parts'][number]['kind'];
  /** The bar before a new part: the drums fill. */
  fill: boolean;
  /** The first bar of a part. */
  first: boolean;
  /** Audio time of this sixteenth, and how long a beat is (s). */
  t: number;
  beat: number;
}

type Groove = (i: Instruments, st: Step) => void;

/** A chord's notes as MIDI, from around `low` up. */
function voicing(c: Chord, low: number, count = c.tones.length): number[] {
  let base = low - ((((low - c.root) % 12) + 12) % 12);
  if (base < low - 6) base += 12;
  const notes = c.tones.map((t) => base + t);
  while (notes.length < count) notes.push(notes[notes.length - c.tones.length] + 12);
  return notes.slice(0, count);
}
const bassOf = (c: Chord, octave = 2) => 12 * (octave + 1) + c.root;

const GROOVES: Record<SongStyle, Groove> = {
  ballad(i, st) {
    const { s, chord: c, part, t, beat } = st;
    const loud = part === 'chorus' ? 1 : 0.75;
    // Electric piano in eighths, up and down the chord.
    if (s % 2 === 0) {
      const v = voicing(c, 60, 4);
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      i.keys(t, [v[order[s / 2]]], beat * 0.9, loud * (s === 0 ? 1.2 : 0.9));
    }
    if (s === 0) {
      i.pad(t, voicing(c, 55, 3), beat * 4, part === 'intro' ? 0.6 : loud);
      i.bass(t, bassOf(c), beat * 1.9, 0.9, 500);
    }
    if (s === 8) i.bass(t, bassOf(c) + (c.tones[2] ?? 7), beat * 1.9, 0.8, 500);
    if (part === 'intro') return;
    if (s === 0 || (part === 'chorus' && s === 10)) i.kick(t, 0.7);
    if (s === 4 || s === 12) i.brush(t, part === 'chorus' ? 1.4 : 1);
    if (part === 'chorus' && s % 4 === 2) i.hat(t, false, 0.5);
    if (st.first && part === 'chorus' && s === 0) i.crash(t, 0.8);
    if (st.fill && s >= 12 && s % 2 === 0) i.snare(t, 0.35 + (s - 12) * 0.08);
  },

  blues(i, st) {
    const { s, chord: c, part, t, beat } = st;
    // Swung eighths (the timeline puts the offbeat two thirds in).
    if (s % 2 !== 0) return;
    const e = s / 2;
    const boogie = [0, 4, 7, 9, 10, 9, 7, 4];
    i.bass(t, bassOf(c) + boogie[e], beat * 0.45, 0.8, 600);
    if (e % 2 === 0) i.hat(t, false, 0.7);
    else i.hat(t, false, 0.45);
    if (e === 0 || e === 4) i.kick(t, 0.8);
    if (e === 2 || e === 6) i.snare(t, part === 'intro' ? 0.6 : 0.9);
    // The organ: a long chord under it all, and stabs on the "and" of two and four.
    if (e === 0) i.organ(t, voicing(c, 57, 4), beat * 3.8, 0.5);
    if (e === 3 || e === 7) i.organ(t, voicing(c, 64, 3), beat * 0.25, 0.9);
    if (st.first && part === 'chorus' && e === 0) i.crash(t, 0.6);
  },

  schlager(i, st) {
    const { s, chord: c, part, t, beat } = st;
    // Four on the floor, an open hat on every offbeat, a clap on two and four.
    if (s % 4 === 0) i.kick(t, 0.95);
    if (s % 4 === 2) i.hat(t, true, 0.8);
    if (s === 4 || s === 12) i.clap(t, part === 'intro' ? 0.7 : 1);
    // The bass jumps octaves in eighths: the disco fox's bounce.
    if (s % 2 === 0) i.bass(t, bassOf(c) + (s % 4 === 2 ? 12 : 0), beat * 0.42, 0.85, 900);
    if (s === 0) i.pad(t, voicing(c, 60, 3), beat * 4, 0.8);
    // Brass on the backbeat in the chorus, a little fanfare going into it.
    if (part === 'chorus' && (s === 4 || s === 12)) i.brass(t, voicing(c, 64, 3), beat * 0.4, 1);
    if (st.fill && (s === 8 || s === 10 || s === 12 || s === 14)) i.brass(t, voicing(c, 67, 3), beat * 0.3, 0.9);
    if (part !== 'chorus' && s % 4 === 2) i.keys(t, voicing(c, 64, 3), beat * 0.3, 0.6);
    if (st.first && part === 'chorus' && s === 0) i.crash(t, 0.7);
  },

  anthem(i, st) {
    const { s, chord: c, part, t, beat } = st;
    const big = part === 'chorus' || part === 'outro';
    // Guitar chugs in eighths: muted in the verse, wide open in the chorus.
    if (s % 2 === 0) i.guitar(t, bassOf(c, 3), beat * (big ? 0.48 : 0.3), !big, s % 8 === 0 ? 1.1 : 0.9);
    if (s % 2 === 0) i.bass(t, bassOf(c, 1) + 12, beat * 0.45, 0.9, 800);
    if (s === 0 || s === 6 || s === 8) i.kick(t, 1);
    if (s === 4 || s === 12) i.snare(t, 1.1);
    if (s % 2 === 0) i.hat(t, big && s % 4 === 2, 0.6);
    if (st.first && s === 0 && part !== 'intro') i.crash(t, 1);
    if (big && s === 0) i.pad(t, voicing(c, 62, 3), beat * 4, 0.7);
    // Into the chorus: the snare rolls.
    if (st.fill && s >= 8) i.snare(t, 0.5 + (s - 8) * 0.07);
  },

  tango(i, st) {
    const { s, chord: c, part, t, beat } = st;
    // Three-three-two: the bandoneon and the bass hit on 1, the "and" of 2, and 4.
    const hit = s === 0 || s === 6 || s === 12;
    if (hit) {
      i.bandoneon(t, voicing(c, 57, 4), beat * (s === 12 ? 0.9 : 0.6), s === 0 ? 1.2 : 1);
      i.bass(t, bassOf(c) + (s === 6 ? (c.tones[2] ?? 7) : 0), beat * 0.6, 1, 500);
      i.knock(t, s === 0 ? 1 : 0.7);
    }
    // The violins pluck the chord in between, a drag of four into each bar's last beat in the chorus.
    if (s === 4 || s === 10) i.pluck(t, voicing(c, 69, 3)[s === 4 ? 1 : 2], 0.8);
    if (part === 'chorus' && s >= 12 && s <= 15) i.pluck(t, voicing(c, 64, 4)[s - 12], 0.6);
    if (s === 0) i.pad(t, voicing(c, 52, 3), beat * 4, part === 'chorus' ? 0.7 : 0.4);
  },
};

/** What's on: a song, from when (office ms of its first beat). */
interface Gig {
  song: SongDef;
  tl: Timeline;
  startedAt: number;
  /** Audio time of its first beat, as last put in step. */
  anchor: number;
  /** The next sixteenth to schedule, and the next melody note. */
  step: number;
  note: number;
  out: GainNode;
  inst: Instruments;
}

export class KaraokeBand {
  private gig: Gig | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly levelBuf = new Float32Array(1024);
  private levelNow = 0;
  /** The guide melody's level (0 off). */
  guide = 1;

  constructor(
    private readonly a: AudioCore,
    private readonly bus: () => AudioNode | null,
    /** The PA's middle: where the band's heard from. */
    private readonly at: Pos,
  ) {}

  /** Plays `song` from `startedAt` (office ms), or stops (null). The same again plays on. */
  play(song: SongDef | null, startedAt = 0) {
    if (this.gig && song && this.gig.song === song && this.gig.startedAt === startedAt) return;
    this.stop();
    const ctx = this.a.ctx;
    const bus = this.bus();
    if (!song || !ctx || !bus) return;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    // From the stage, but loud all through the centre (it's a PA).
    const pan = this.a.panner(this.at, 12, 0.35);
    out.connect(pan).connect(bus);
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
    }
    out.connect(this.analyser);
    this.gig = { song, tl: timeline(song), startedAt, anchor: NaN, step: -1, note: 0, out, inst: new Instruments(ctx, out, this.a.buf.white) };
  }

  stop() {
    const g = this.gig;
    this.gig = null;
    const ctx = this.a.ctx;
    if (!g || !ctx) return;
    g.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => g.out.disconnect(), 600);
  }

  /** Every frame: schedules what's coming, `officeNow` the office's clock (ms). */
  tick(officeNow: number) {
    const g = this.gig;
    const ctx = this.a.ctx;
    if (!g || !ctx || ctx.state !== 'running') return this.measure();
    const spb = 60 / g.song.bpm;
    const anchor = ctx.currentTime - (officeNow - g.startedAt) / 1000;
    if (!(Math.abs(anchor - g.anchor) < SLIP)) {
      const jumped = !Number.isFinite(g.anchor) || Math.abs(anchor - g.anchor) > 0.4;
      g.anchor = anchor;
      if (jumped) {
        // (Re)joining: from the next sixteenth on, no catching up on what's gone.
        const beat = (ctx.currentTime - anchor) / spb;
        g.step = Math.max(0, Math.ceil(beat * 4));
        g.note = g.tl.melody.findIndex((n) => n.at >= beat);
        if (g.note < 0) g.note = g.tl.melody.length;
      }
    }
    const until = ctx.currentTime + AHEAD;
    const total = g.tl.beats * 4;
    const swing = !!g.song.swing;
    while (g.step < total) {
      const beat = g.step / 4;
      const sw = swing && g.step % 4 === 2 ? Math.floor(beat) + 2 / 3 : beat;
      const t = g.anchor + sw * spb;
      if (t > until) break;
      if (t >= ctx.currentTime - 0.02) this.stepAt(g, g.step, t, spb);
      g.step++;
    }
    const mel = g.tl.melody;
    while (g.note < mel.length) {
      const n = mel[g.note];
      const t = g.anchor + n.at * spb;
      if (t > until) break;
      if (t >= ctx.currentTime - 0.02 && this.guide > 0) g.inst.lead(t, n.midi, Math.max(0.12, n.len * spb * 0.95), this.guide);
      g.note++;
    }
    this.measure();
  }

  private stepAt(g: Gig, step: number, t: number, spb: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = parseChord(g.tl.chords[bar]?.chord ?? 'C')!;
    const at = bar * BEATS_PER_BAR;
    let part: Step['part'] = 'intro';
    let first = false;
    let fill = false;
    for (const p of g.tl.parts) {
      if (at >= p.at) part = p.kind;
      if (at === p.at) first = true;
      if (p.at === at + BEATS_PER_BAR && p.kind !== 'intro') fill = true;
    }
    if (bar * 4 >= g.tl.beats) return;
    // The last bar of the outro: one big chord and done.
    const last = at === g.tl.beats - BEATS_PER_BAR;
    if (last) {
      if (s === 0) {
        g.inst.pad(t, voicing(chord, 55, 4), spb * 4, 1.2);
        g.inst.bass(t, bassOf(chord), spb * 3.5, 1, 500);
        g.inst.crash(t, 0.9);
        g.inst.kick(t, 1);
      }
      return;
    }
    GROOVES[g.song.style](g.inst, { s, bar, chord, part, fill, first, t, beat: spb });
  }

  private measure() {
    if (!this.analyser || !this.gig) {
      this.levelNow *= 0.9;
      return;
    }
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    const rms = Math.sqrt(sum / this.levelBuf.length);
    this.levelNow = Math.max(rms, this.levelNow * 0.88);
  }

  /** How loud the band is right now (0–1-ish), for the lights. */
  level(): number {
    return Math.min(1, this.levelNow * 4);
  }

  /** Whether it's playing something. */
  playing(): boolean {
    return !!this.gig;
  }
}

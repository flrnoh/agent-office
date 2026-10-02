import type { AudioCore } from '../sound/core';
import { biquad, envelope, rand } from '../sound/dsp';
import { hiss } from '../sound/hiss';

// ---- flrnoh fork: the bowling centre's sounds (see FORK.md "The bowling centre") -----------------------

export type BowlingSound = 'door' | 'cosmic' | 'lights' | 'pour' | 'fryer' | 'till' | 'shoes';

/** A low thump: a sine dropping fast, for a lever hitting home or a kick. */
function thump(a: AudioCore, out: AudioNode, t0: number, from: number, to: number, len: number, gain: number) {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + len + 0.05);
}

/**
 * The bowling centre's: its glass doors (a whoosh and a two-note bell), the cosmic switch thrown (a
 * heavy clunk, then the bass drops and a shimmer comes up), thrown back (the clunk and the tubes
 * ticking on with a hum), a beer from the tap, the fryer's sizzle, the till's ka-ching, a pair of
 * shoes put down on the counter. On the effects' volume.
 */
export function bowlingSound(a: AudioCore, kind: BowlingSound) {
  a.unlock();
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`bowling.${kind}`);
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.connect(a.alerts);
  switch (kind) {
    case 'door': {
      hiss(a, out, t0, 700, 0.7, [
        [0.05, 0.05],
        [0.35, 0.02],
        [0.5, 0],
      ]);
      a.blip(out, t0 + 0.06, 1318, 1, 0.45, 0.05);
      a.blip(out, t0 + 0.24, 1046, 1, 0.6, 0.05);
      return;
    }
    case 'cosmic':
    case 'lights': {
      // The lever: a click as it goes, a heavy clunk as it hits home.
      hiss(a, out, t0, 3200, 2, [
        [0.003, 0.12],
        [0.04, 0],
      ]);
      thump(a, out, t0 + 0.09, 140, 55, 0.18, 0.5);
      hiss(a, out, t0 + 0.09, 900, 1.2, [
        [0.004, 0.18],
        [0.09, 0],
      ]);
      if (kind === 'cosmic') {
        // The bass drop: a growling saw sweeping down into a sub, a filter closing over it.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t0 + 0.25);
        o.frequency.exponentialRampToValueAtTime(38, t0 + 1.4);
        const f = biquad(ctx, 'lowpass', 1800, 6);
        f.frequency.setValueAtTime(1800, t0 + 0.25);
        f.frequency.exponentialRampToValueAtTime(90, t0 + 1.5);
        const g = ctx.createGain();
        envelope(g.gain, t0 + 0.25, [
          [0.03, 0.22],
          [0.9, 0.16],
          [1.6, 0],
        ]);
        o.connect(f).connect(g).connect(out);
        o.start(t0 + 0.25);
        o.stop(t0 + 1.9);
        thump(a, out, t0 + 0.25, 90, 32, 1.4, 0.75);
        // And the black light's shimmer coming up after it.
        for (let i = 0; i < 9; i++) a.blip(out, t0 + 1.1 + i * 0.07, 1800 + i * 260, 1.02, 0.5, 0.025, 'triangle');
        hiss(a, out, t0 + 0.9, 7000, 0.8, [
          [0.6, 0.03],
          [1.4, 0],
        ]);
      } else {
        // The tubes ticking on, one after another, and their hum rising.
        for (let i = 0; i < 6; i++)
          hiss(a, out, t0 + 0.25 + i * rand(0.05, 0.11), 4200, 3, [
            [0.002, 0.08],
            [0.02, 0],
          ]);
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 100;
        const g = ctx.createGain();
        envelope(g.gain, t0 + 0.3, [
          [0.4, 0.012],
          [1.1, 0],
        ]);
        o.connect(biquad(ctx, 'lowpass', 500, 0.7)).connect(g).connect(out);
        o.start(t0 + 0.3);
        o.stop(t0 + 1.5);
      }
      return;
    }
    case 'pour': {
      // The tap: a hiss of foam, then the glass filling, its note rising.
      hiss(a, out, t0, 1500, 1.2, [
        [0.05, 0.07],
        [1.3, 0.05],
        [1.5, 0],
      ]);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(320, t0);
      o.frequency.linearRampToValueAtTime(720, t0 + 1.4);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.1, 0.02],
        [1.3, 0.02],
        [1.5, 0],
      ]);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 1.6);
      return;
    }
    case 'fryer': {
      // The basket going in: a roar of sizzle settling down, crackles through it.
      hiss(a, out, t0, 5200, 0.5, [
        [0.05, 0.13],
        [0.5, 0.07],
        [1.6, 0.03],
        [2, 0],
      ]);
      for (let i = 0; i < 18; i++)
        hiss(a, out, t0 + rand(0, 1.6), rand(2500, 6000), 4, [
          [0.002, 0.1],
          [0.015, 0],
        ]);
      return;
    }
    case 'till': {
      // Keys, the drawer flying out, the bell.
      for (let i = 0; i < 3; i++)
        hiss(a, out, t0 + i * 0.08, 2600, 3, [
          [0.002, 0.1],
          [0.03, 0],
        ]);
      hiss(a, out, t0 + 0.3, 600, 1, [
        [0.01, 0.12],
        [0.2, 0],
      ]);
      for (const f of [2093, 2637, 3136]) a.blip(out, t0 + 0.32, f, 1, 1.1, 0.04);
      return;
    }
    case 'shoes':
      // A pair put down on the counter: two soft thuds.
      thump(a, out, t0, 180, 90, 0.12, 0.3);
      thump(a, out, t0 + 0.14, 170, 85, 0.12, 0.26);
      hiss(a, out, t0, 1200, 1, [
        [0.005, 0.05],
        [0.06, 0],
      ]);
  }
}

/** A chord progression the house's muzak drifts through: made up, slow, in C (roots, thirds, fifths). */
const CHORDS: readonly number[][] = [
  [261.6, 329.6, 392.0],
  [220.0, 261.6, 329.6],
  [174.6, 220.0, 261.6],
  [196.0, 246.9, 293.7],
];

/**
 * The bowling centre's air: people talking, balls rolling down a lane far off and the pins going, a
 * soft muzak of slow chords, and in cosmic bowling a low pulse under it all. Kept up every frame while
 * you're inside (set); without a call it fades away by itself.
 */
export class BowlingAmbience {
  private bus: { gain: GainNode; murmur: GainNode; muzak: GainNode; pulse: GainNode } | null = null;
  private nextRoll = 0;
  private nextChord = 0;
  private chord = 0;
  private nextBeat = 0;

  constructor(private readonly a: AudioCore) {}

  set(level: number, cosmic: number) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    if (!this.bus) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(a.ambience);
      const murmur = ctx.createGain();
      murmur.gain.value = 0.05;
      const src = a.noise(a.buf.brown, true);
      const chatter = a.noise(a.buf.white, true);
      const chatterG = ctx.createGain();
      chatterG.gain.value = 0.12;
      const lump = a.noise(a.buf.gurgle, true);
      const lumpDepth = ctx.createGain();
      lumpDepth.gain.value = 0.08;
      lump.connect(lumpDepth).connect(chatterG.gain);
      chatter.connect(biquad(ctx, 'bandpass', 1300, 1.5)).connect(chatterG).connect(murmur);
      src.connect(biquad(ctx, 'bandpass', 480, 0.7)).connect(murmur);
      murmur.connect(gain);
      src.start();
      chatter.start();
      lump.start();
      const muzak = ctx.createGain();
      muzak.gain.value = 0.5;
      muzak.connect(biquad(ctx, 'lowpass', 1400, 0.5)).connect(gain);
      const pulse = ctx.createGain();
      pulse.gain.value = 0;
      pulse.connect(gain);
      this.bus = { gain, murmur, muzak, pulse };
    }
    a.count('bowling-ambience');
    const now = ctx.currentTime;
    const g = this.bus.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Math.max(0, Math.min(1, level)), now, 0.3);
    g.setTargetAtTime(0, now + 0.5, 0.4);
    // The muzak steps back a little in cosmic bowling, the pulse comes up.
    this.bus.muzak.gain.setTargetAtTime(0.5 - cosmic * 0.25, now, 0.5);
    this.bus.pulse.gain.setTargetAtTime(cosmic * 0.9, now, 0.5);
    if (now > this.nextRoll) {
      this.nextRoll = now + rand(3.5, 10);
      this.roll(now + 0.05);
    }
    if (now > this.nextChord) {
      this.nextChord = now + 3.2;
      this.pad(now + 0.05, CHORDS[this.chord++ % CHORDS.length]);
    }
    if (cosmic > 0.05) {
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      while (this.nextBeat < now + 0.12) {
        thump(a, this.bus.pulse, this.nextBeat, 110, 45, 0.25, 0.25);
        this.nextBeat += 60 / 116;
      }
    }
  }

  /** A ball rolling down a lane somewhere far off, and the pins going down. */
  private roll(t0: number) {
    const a = this.a;
    const ctx = a.ctx!;
    const out = ctx.createGain();
    out.gain.value = rand(0.5, 1);
    out.connect(this.bus!.gain);
    const n = a.noise(a.buf.brown);
    const g = ctx.createGain();
    const len = rand(1.8, 2.6);
    envelope(g.gain, t0, [
      [0.2, 0.05],
      [len - 0.2, 0.09],
      [len, 0],
    ]);
    n.connect(biquad(ctx, 'lowpass', 180, 0.9)).connect(g).connect(out);
    n.start(t0);
    n.stop(t0 + len + 0.1);
    // The pins: a scatter of hollow knocks, more of them for a strike.
    const pins = Math.random() < 0.35 ? 10 : Math.floor(rand(3, 9));
    for (let i = 0; i < pins; i++)
      hiss(a, out, t0 + len + rand(0, 0.35) * (i / pins + 0.2), rand(900, 1800), 6, [
        [0.003, 0.05],
        [0.07, 0],
      ]);
  }

  /** One of the muzak's chords: soft triangles swelling in and out. */
  private pad(t0: number, notes: readonly number[]) {
    const ctx = this.a.ctx!;
    for (const f of notes) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = rand(-6, 6);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.9, 0.012],
        [2.8, 0.01],
        [3.6, 0],
      ]);
      o.connect(g).connect(this.bus!.muzak);
      o.start(t0);
      o.stop(t0 + 3.7);
    }
  }
}

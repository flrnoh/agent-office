import type { AudioCore } from '../../sound/core';
import { biquad, envelope, place, rand } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';

// ---- A day at the beach (flrnoh fork, see FORK.md) --------------------------------------------------
// Splashes, swimming strokes, the kiosk's bell and fryer, a seagull, the boats' horns and their
// outboards. Synthesized like everything else; on the effects volume.

export type BeachSound = 'splash' | 'stroke' | 'bell' | 'sizzle' | 'gull' | 'ladder' | 'slurp' | 'hornski' | 'hornboat';

/** One of the beach's sounds at `at`; `strength` 0..1 scales a splash. */
export function beach(a: AudioCore, kind: BeachSound, at: Pos, strength = 1) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`beach-${kind}`);
  const out = a.panner(at, kind === 'gull' || kind.startsWith('horn') ? 6 : 2.5, 1);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  const k = Math.max(0.15, Math.min(1, strength));
  switch (kind) {
    case 'splash':
      // The plunge: a low whump, a wash of noise falling away, and bubbles.
      hiss(a, out, t0, 700, 0.6, [
        [0.01, 0.35 * k],
        [0.12, 0.2 * k],
        [0.5 + 0.4 * k, 0],
      ]);
      hiss(a, out, t0 + 0.02, 2600, 0.8, [
        [0.02, 0.12 * k],
        [0.35 + 0.3 * k, 0],
      ]);
      a.blip(out, t0, 160, 0.4, 0.2, 0.18 * k);
      for (let i = 0; i < 3 + Math.round(4 * k); i++) a.blip(out, t0 + rand(0.15, 0.7), rand(500, 1200), 1.8, 0.05, 0.03);
      return;
    case 'stroke':
      hiss(a, out, t0, rand(900, 1400), 0.9, [
        [0.08, 0.05],
        [0.3, 0],
      ]);
      return;
    case 'bell':
      // The bell on the counter: ding!
      for (const [f, g] of [
        [2093, 0.08],
        [5250, 0.025],
      ])
        a.blip(out, t0, f, 0.995, 1.1, g, 'sine');
      return;
    case 'sizzle':
      // Fries going into the fryer: a hiss that crackles.
      hiss(a, out, t0, 5200, 0.7, [
        [0.05, 0.08],
        [0.9, 0.05],
        [1.5, 0],
      ]);
      for (let i = 0; i < 9; i++) a.blip(out, t0 + rand(0, 1.2), rand(2500, 4500), 0.6, 0.012, 0.025, 'square');
      return;
    case 'gull': {
      // A seagull, from somewhere overhead: two cries.
      for (const dt of [0, 0.42]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const t = t0 + dt;
        o.frequency.setValueAtTime(1500, t);
        o.frequency.exponentialRampToValueAtTime(2300, t + 0.07);
        o.frequency.exponentialRampToValueAtTime(1100, t + 0.3);
        const g = ctx.createGain();
        envelope(g.gain, t, [
          [0.02, 0.05],
          [0.25, 0.03],
          [0.32, 0],
        ]);
        o.connect(biquad(ctx, 'bandpass', 1800, 2)).connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.35);
      }
      return;
    }
    case 'ladder':
      a.clink(out, t0, 1900, 0.05);
      a.clink(out, t0 + 0.18, 2300, 0.04);
      hiss(a, out, t0 + 0.05, 1100, 0.8, [
        [0.05, 0.08],
        [0.6, 0],
      ]);
      return;
    case 'slurp':
      for (let i = 0; i < 3; i++) a.blip(out, t0 + i * 0.09, rand(300, 520), 1.6, 0.07, 0.04, 'triangle');
      return;
    case 'hornski':
    case 'hornboat': {
      // A jetski's beep-beep, or the motorboat's deep two-tone.
      const boat = kind === 'hornboat';
      const g = ctx.createGain();
      envelope(g.gain, t0, boat ? [[0.04, 0.1], [0.75, 0.09], [0.85, 0]] : [[0.01, 0.07], [0.12, 0.07], [0.14, 0], [0.2, 0.07], [0.32, 0.07], [0.34, 0]]);
      const tone = biquad(ctx, 'lowpass', boat ? 900 : 2600, 0.8);
      tone.connect(g).connect(out);
      for (const f of boat ? [147, 185] : [660, 830]) {
        const o = ctx.createOscillator();
        o.type = boat ? 'sawtooth' : 'square';
        o.frequency.value = f;
        o.connect(tone);
        o.start(t0);
        o.stop(t0 + 0.9);
      }
      return;
    }
  }
}

/** An outboard running: where it is, how fast it's going, how hard it's pushed, and how high it revs. */
export interface Outboard {
  id: number;
  at: Pos;
  speed: number;
  gas: number;
  /** A jetski's whine sits higher than the motorboat's burble. */
  high: boolean;
}

interface Running {
  saw: OscillatorNode;
  wash: AudioBufferSourceNode;
  washGain: GainNode;
  tone: BiquadFilterNode;
  gain: GainNode;
  pan: PannerNode;
  born: number;
}

/** The boats' engines, and the water rushing past their hulls. */
export class Outboards {
  private running = new Map<number, Running>();

  constructor(private readonly a: AudioCore) {}

  /** The engines running now: one that's dropped off the list dies away. */
  set(list: Outboard[]) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const on = new Set<number>();
    for (const e of list) {
      on.add(e.id);
      let m = this.running.get(e.id);
      if (!m) this.running.set(e.id, (m = this.start(e.at)));
      place(m.pan, e.at.x, e.at.y, e.at.z);
      if (now - m.born < 0.5) continue;
      const v = Math.abs(e.speed);
      const push = Math.abs(e.gas);
      const f = (e.high ? 95 : 52) + v * (e.high ? 7 : 6) + push * 18;
      m.saw.frequency.setTargetAtTime(f, now, 0.08);
      m.tone.frequency.setTargetAtTime(500 + f * 6 + push * 600, now, 0.1);
      m.gain.gain.setTargetAtTime(0.03 + 0.035 * push + 0.02 * Math.min(1, v / 12), now, 0.12);
      m.washGain.gain.setTargetAtTime(0.02 + Math.min(0.12, v * 0.009), now, 0.15);
    }
    for (const [id, m] of this.running) {
      if (on.has(id)) continue;
      this.running.delete(id);
      for (const g of [m.gain, m.washGain]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, 0.15);
      }
      m.saw.stop(now + 0.9);
      m.wash.stop(now + 0.9);
    }
  }

  private start(at: Pos): Running {
    const ctx = this.a.ctx!;
    this.a.count('outboard');
    const now = ctx.currentTime;
    const pan = this.a.panner(at, 3, 1);
    pan.connect(this.a.ambience);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.1);
    gain.gain.setTargetAtTime(0.03, now + 0.35, 0.12);
    const tone = biquad(ctx, 'lowpass', 1200, 3);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(40, now);
    saw.frequency.linearRampToValueAtTime(130, now + 0.25);
    saw.frequency.setTargetAtTime(70, now + 0.3, 0.1);
    saw.connect(tone).connect(gain).connect(pan);
    saw.start(now);
    const wash = this.a.noise(this.a.buf.white, true);
    const washGain = ctx.createGain();
    washGain.gain.value = 0;
    wash.connect(biquad(ctx, 'bandpass', 900, 0.5)).connect(washGain).connect(pan);
    wash.start(now);
    return { saw, wash, washGain, tone, gain, pan, born: now };
  }
}

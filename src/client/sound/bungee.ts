import type { AudioCore } from './core';
import { biquad } from './dsp';
import { hiss } from './hiss';
import type { Pos } from './places';

// ---- Bungee off the roof (flrnoh fork, see client/bungee.ts) -----------------------------------------

/**
 * The countdown's beeps and the go (in your own ears), and the rope's twang as it pulls taut: from
 * `at` when someone else is on it, in your own ears when it's you. On the effects volume.
 */
export function bungee(a: AudioCore, kind: 'count' | 'go' | 'twang', at?: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`bungee.${kind}`);
  const out: AudioNode = at ? a.panner(at, 4, 1) : a.alerts;
  if (at) out.connect(a.alerts);
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'count') a.blip(out, t0, 660, 1, 0.14, 0.08, 'square');
  else if (kind === 'go') a.blip(out, t0, 990, 1, 0.4, 0.09, 'square');
  else {
    // A low, stretched thrum sliding down, and the creak of the harness.
    a.blip(out, t0, 95, 0.55, 0.9, 0.22, 'sawtooth');
    a.blip(out, t0, 142, 0.6, 0.6, 0.1, 'triangle');
    hiss(a, out, t0, 380, 2, [
      [0.01, 0.12],
      [0.35, 0],
    ]);
  }
}

/** The wind past your ears on the rope. */
export class BungeeWind {
  private air: { src: AudioBufferSourceNode; band: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(private readonly a: AudioCore) {}

  /** 0 (still) to 1 (flat out), rising in pitch and loudness. */
  set(level: number) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    level = Math.max(0, Math.min(1, level));
    if (!this.air) {
      if (level <= 0.01) return;
      this.a.count('bungee.wind');
      const src = this.a.noise(this.a.buf.white, true);
      const band = biquad(ctx, 'bandpass', 400, 0.7);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(gain).connect(this.a.alerts);
      src.start();
      this.air = { src, band, gain };
    }
    const air = this.air;
    const now = ctx.currentTime;
    air.gain.gain.setTargetAtTime(0.35 * level * level, now, 0.08);
    air.band.frequency.setTargetAtTime(300 + 1500 * level, now, 0.1);
    if (level <= 0.01) {
      air.src.stop(now + 0.4);
      this.air = null;
    }
  }
}

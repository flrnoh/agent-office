import { SCREEN, STAGE_MID_Z } from '../../../shared/karaoke';
import type { CheerKind } from '../../../shared/karaoke';
import type { AudioCore } from '../../sound/core';
import { biquad, envelope, rand } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';
import { KaraokeBand } from './band';

// ---- The karaoke bar's sounds (flrnoh fork, see FORK.md "Karaoke") ------------------------------------
// The band (band.ts) on the music volume; the room on the effects volume: someone clapping or
// whooping, the whole bar's applause after a song, the thump of a mic coming off its stand (now and
// then with a squeal of feedback), and the fanfare when the rating's in.

/** The PA's middle: over the front of the stage. */
export const PA_AT: Pos = { x: SCREEN.x - 2.5, y: 3.2, z: STAGE_MID_Z };

export class KaraokeSound {
  readonly band: KaraokeBand;

  constructor(
    private readonly a: AudioCore,
    bus: () => AudioNode | null,
    private readonly musicGain: () => number,
  ) {
    this.band = new KaraokeBand(a, bus, PA_AT);
  }

  /**
   * How loud a karaoke video (YouTube's own player, outside Web Audio) is where you stand, 0–1: your
   * master and music volume, a little softer further from the PA, never quiet anywhere in the centre.
   */
  paVolume(): number {
    const l = this.a.listener;
    const d = Math.hypot(l.x - PA_AT.x, l.z - PA_AT.z);
    return Math.min(1, this.a.masterGain() * this.musicGain() * Math.max(0.4, 1 - Math.max(0, d - 8) / 40));
  }

  /** Someone clapping (three or four claps) or whooping, where they stand. */
  cheer(kind: CheerKind, at: Pos) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count(`karaoke-${kind}`);
    const out = this.a.panner(at, 2, 1);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    if (kind === 'clap') {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) clap(this.a, out, t0 + i * rand(0.17, 0.21), 0.09);
      return;
    }
    // "Whoo!": a voice sliding up through an "oo", wobbling at the top.
    const g = ctx.createGain();
    const len = rand(0.7, 1.0);
    envelope(g.gain, t0, [
      [0.06, 0.05],
      [len * 0.7, 0.04],
      [len, 0],
    ]);
    const vowel = biquad(ctx, 'bandpass', 700, 3);
    vowel.frequency.setValueAtTime(500, t0);
    vowel.frequency.linearRampToValueAtTime(900, t0 + len * 0.6);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = rand(320, 520);
    o.frequency.setValueAtTime(f * 0.7, t0);
    o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + len * 0.45);
    o.frequency.setValueAtTime(f * 1.5, t0 + len * 0.6);
    o.frequency.exponentialRampToValueAtTime(f * 1.2, t0 + len);
    o.connect(vowel).connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + len + 0.05);
  }

  /** The whole bar claps and cheers (after a song): `strength` 0–1 how many are in. */
  applause(strength: number) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('karaoke-applause');
    const s = Math.max(0.25, Math.min(1, strength));
    const out = ctx.createGain();
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.02;
    const hands = Math.round(3 + s * 5);
    for (let i = 0; i < 40; i++) {
      const when = t0 + i * 0.075 + Math.random() * 0.04;
      for (let k = 0; k < hands; k++) clap(this.a, out, when + Math.random() * 0.05, 0.03 * s * (1 - i / 48));
    }
    // A cheer or two over it.
    for (let i = 0; i < 1 + Math.round(s * 2); i++) {
      setTimeout(() => this.cheer('whoo', { x: this.a.listener.x + rand(-4, 4), y: 1.6, z: this.a.listener.z + rand(-4, 4) }), rand(100, 1400));
    }
  }

  /** A mic coming off (or going back on) its stand: a thump through the PA, sometimes feedback. */
  mic(take: boolean, squeal: boolean) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('karaoke-mic');
    const out = this.a.panner(PA_AT, 10, 0.4);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const g = ctx.createGain();
    envelope(g.gain, t0, [
      [0.005, take ? 0.3 : 0.2],
      [0.18, 0],
    ]);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t0);
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.16);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.2);
    hiss(this.a, out, t0, 500, 0.8, [
      [0.004, 0.08],
      [0.09, 0],
    ]);
    if (!squeal) return;
    // Feedback: a thin whistle that swells and is caught.
    const w = ctx.createOscillator();
    w.frequency.value = rand(2300, 3100);
    const wg = ctx.createGain();
    envelope(wg.gain, t0 + 0.15, [
      [0.35, 0.025],
      [0.55, 0.03],
      [0.62, 0],
    ]);
    w.connect(wg).connect(out);
    w.start(t0 + 0.15);
    w.stop(t0 + 0.85);
  }

  /** The rating's in: a little fanfare, brighter for a crowning. */
  rated(king: boolean) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('karaoke-rated');
    const out = this.a.panner(PA_AT, 10, 0.4);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.02;
    const notes = king ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 783.99, 987.77];
    notes.forEach((f, i) => {
      this.a.blip(out, t0 + i * 0.12, f, 1, i === notes.length - 1 ? 0.9 : 0.3, 0.05, 'square');
      this.a.blip(out, t0 + i * 0.12, f * 2, 1, 0.25, 0.015, 'sine');
    });
  }
}

/** One pair of hands. */
function clap(a: AudioCore, out: AudioNode, when: number, gain: number) {
  hiss(a, out, when, rand(1200, 2600), 1.1, [
    [0.002, gain * rand(0.6, 1)],
    [0.05, 0],
  ]);
}

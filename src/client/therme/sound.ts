import type { AudioCore } from '../sound/core';
import { biquad } from '../sound/dsp';
import type { Pos } from '../sound/places';

/*
 * The thermal baths' sound (flrnoh fork, see FORK.md "The thermal baths", phase 8): the hall's air (a
 * big glass hall full of water and people: a low rumble, voices and splashes washing round, a little
 * echo), how much of it there is where you stand (all of it under the dome and by the slides, a hush
 * in the Saunadorf, softer out at the lagoon), the slides' riders whooping, a splash where one lands.
 * Built on the office's audio (AudioCore), so the volume and the hidden tab work as everywhere.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class ThermeSounds {
  private bed: { hall: GainNode; voices: GainNode } | null = null;
  private level = { hall: -1, voices: -1 };

  constructor(private readonly a: AudioCore) {}

  /** Every frame in the baths: `hall` 0..1 the hall's rumble and water, `voices` 0..1 its people; both fade, and to nothing outside. */
  air(hall: number, voices: number) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    if (!this.bed) {
      if (hall <= 0 && voices <= 0) return;
      const h = ctx.createGain();
      h.gain.value = 0;
      const rumble = this.a.noise(this.a.buf.brown, true);
      rumble.connect(biquad(ctx, 'lowpass', 380, 0.7)).connect(h);
      const water = this.a.noise(this.a.buf.white, true);
      const wg = ctx.createGain();
      wg.gain.value = 0.18;
      water.connect(biquad(ctx, 'bandpass', 2600, 0.6)).connect(wg).connect(h);
      // Voices: a band of noise in the speaking range, its loudness wobbling, with the hall's echo.
      const v = ctx.createGain();
      v.gain.value = 0;
      const babble = this.a.noise(this.a.buf.white, true);
      const formant = biquad(ctx, 'bandpass', 900, 1.4);
      const wobble = ctx.createGain();
      wobble.gain.value = 0.5;
      const lfo = this.a.noise(this.a.buf.gurgle, true);
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(wobble.gain);
      babble.connect(formant).connect(wobble).connect(v);
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.42;
      const wet = biquad(ctx, 'lowpass', 1800, 0.7);
      wobble.connect(echo).connect(wet).connect(fb).connect(echo);
      wet.connect(v);
      h.connect(this.a.ambience);
      v.connect(this.a.ambience);
      for (const s of [rumble, water, babble, lfo]) s.start();
      this.bed = { hall: h, voices: v };
    }
    const th = Math.max(0, Math.min(1, hall)) * 0.11;
    const tv = Math.max(0, Math.min(1, voices)) * 0.06;
    if (Math.abs(th - this.level.hall) > 1e-4) {
      this.level.hall = th;
      this.bed.hall.gain.setTargetAtTime(th, ctx.currentTime, 0.8);
    }
    if (Math.abs(tv - this.level.voices) > 1e-4) {
      this.level.voices = tv;
      this.bed.voices.gain.setTargetAtTime(tv, ctx.currentTime, 0.8);
    }
  }

  /** Someone down a slide whooping at `at` (higher for a quick one): a voice-ish "juhuu", up then down. */
  whoop(at: Pos, pitch = 1) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('therme.whoop');
    const out = this.a.panner(at, 3, 1.1);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const len = rand(0.7, 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.09, t0 + 0.08);
    g.gain.setValueAtTime(0.08, t0 + len * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    const f1 = biquad(ctx, 'bandpass', 750, 4);
    const f2 = biquad(ctx, 'bandpass', 1250, 5);
    f1.connect(g);
    f2.connect(g);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = rand(260, 340) * pitch;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f0 * 1.6, t0 + len * 0.35);
    o.frequency.linearRampToValueAtTime(f0 * 1.1, t0 + len);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vd = ctx.createGain();
    vd.gain.value = f0 * 0.03;
    vib.connect(vd).connect(o.frequency);
    o.connect(f1);
    o.connect(f2);
    o.start(t0);
    vib.start(t0);
    o.stop(t0 + len + 0.05);
    vib.stop(t0 + len + 0.05);
  }

  /** A big splash at `at` (someone landing off a slide). */
  splash(at: Pos, strength = 1) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('therme.splash');
    const out = this.a.panner(at, 3, 1.2);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const src = this.a.noise(this.a.buf.white);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16 * strength, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    src.connect(biquad(ctx, 'bandpass', rand(700, 1000), 0.7)).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + 0.75);
  }
}

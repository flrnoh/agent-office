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

  /** Water running over you at `at` for `secs` (a shower: a hiss), or all at once (a bucket's gush: a crash and a rush). */
  pour(at: Pos, secs: number, gush = false) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count(gush ? 'therme.gush' : 'therme.shower');
    const out = this.a.panner(at, 2, 1.2);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const src = this.a.noise(this.a.buf.white, true);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gush ? 0.22 : 0.07, t0 + (gush ? 0.04 : 0.25));
    g.gain.setValueAtTime(gush ? 0.16 : 0.07, t0 + Math.max(0.1, secs - 0.4));
    g.gain.linearRampToValueAtTime(0, t0 + secs);
    src.connect(biquad(ctx, gush ? 'lowpass' : 'highpass', gush ? 1400 : 2200, 0.6)).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + secs + 0.05);
  }

  /** A handful of crushed ice: a few crunches. */
  crunch(at: Pos) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('therme.ice');
    const out = this.a.panner(at, 2, 1.2);
    out.connect(this.a.ambience);
    for (let i = 0; i < 6; i++) {
      const t0 = ctx.currentTime + 0.02 + i * rand(0.07, 0.14);
      const src = this.a.noise(this.a.buf.white);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
      src.connect(biquad(ctx, 'bandpass', rand(2500, 4200), 1.8)).connect(g).connect(out);
      src.start(t0, Math.random());
      src.stop(t0 + 0.08);
    }
  }

  /** A foot through the Kneipp trough's water: a little slosh. */
  slosh(at: Pos) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const out = this.a.panner(at, 2, 1.2);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const src = this.a.noise(this.a.buf.white);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
    src.connect(biquad(ctx, 'bandpass', rand(500, 800), 0.9)).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + 0.35);
  }

  /** The stove in a sauna: a crackle, a stone ticking in the heat. */
  crackle(at: Pos) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const out = this.a.panner(at, 2, 1.2);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rand(0.02, 0.09);
      const src = this.a.noise(this.a.buf.white);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(rand(0.03, 0.07), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0008, t + rand(0.03, 0.08));
      src.connect(biquad(ctx, 'bandpass', rand(1800, 3800), 2.5)).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + 0.1);
    }
  }

  /** Water on the hot stones (or the steam bath's generator puffing): a hiss that swells and dies away. */
  hiss(at: Pos, strength = 1) {
    const ctx = this.a.ctx;
    if (!ctx) return;
    this.a.count('therme.hiss');
    const out = this.a.panner(at, 2.5, 1.1);
    out.connect(this.a.ambience);
    const t0 = ctx.currentTime + 0.01;
    const len = rand(1.6, 2.6);
    const src = this.a.noise(this.a.buf.white, true);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.11 * strength, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    const hp = biquad(ctx, 'highpass', 2400, 0.7);
    hp.frequency.setValueAtTime(3600, t0);
    hp.frequency.linearRampToValueAtTime(1800, t0 + len);
    src.connect(hp).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + len + 0.05);
  }
}

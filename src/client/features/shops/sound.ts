import type { AudioCore } from '../../sound/core';
import { biquad, rand } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import { TunePlayer } from '../../sound/music';
import type { Pos } from '../../sound/places';

// ---- The city's shops (flrnoh fork, see FORK.md "Shops to walk into") ---------------------------
// The bell over a shop's door, the till, the barber's scissors, the tattoo machine's buzz, the toys
// (a squeak, bubbles popping, a squirt, a paper plane's whoosh, a yo-yo's whirr), a pill rattling,
// the döner's sizzle; and a record on the headphones at the record shop, for you alone, played by the
// jukebox's own synthesizer (sound/music.ts) with the record's own melody.

export type ShopSound = 'door' | 'till' | 'snip' | 'buzz' | 'squeak' | 'pop' | 'squirt' | 'whoosh' | 'yoyo' | 'hug' | 'rattle' | 'sizzle' | 'splash' | 'beep' | 'receipt' | 'trolley' | 'scoop';

/** One of the shops' sounds at `at`. */
export function shopSound(a: AudioCore, kind: ShopSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`shop-${kind}`);
  const out = a.panner(at, 2, 1.2);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  switch (kind) {
    case 'door':
      // The little bell over the door: two bright dings.
      for (const [dt, f] of [
        [0, 2637],
        [0.11, 3136],
      ])
        a.blip(out, t0 + dt, f, 0.998, 0.9, 0.05, 'sine');
      return;
    case 'till':
      // Ka-ching: a drawer and a bell.
      hiss(a, out, t0, 1800, 1.2, [
        [0.02, 0.08],
        [0.12, 0],
      ]);
      a.blip(out, t0 + 0.12, 3520, 0.999, 0.7, 0.06, 'triangle');
      a.blip(out, t0 + 0.12, 5274, 0.999, 0.5, 0.02, 'sine');
      return;
    case 'snip':
      for (let i = 0; i < 4; i++)
        hiss(a, out, t0 + i * 0.16, 6500, 3, [
          [0.005, 0.12],
          [0.05, 0],
        ]);
      return;
    case 'buzz': {
      // The tattoo machine: a buzzing coil for a couple of seconds, wavering as it works.
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(118, t0);
      for (let i = 1; i < 10; i++) o.frequency.setValueAtTime(rand(110, 128), t0 + i * 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.05);
      g.gain.setValueAtTime(0.06, t0 + 2.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.5);
      o.connect(biquad(ctx, 'bandpass', 900, 0.8)).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 2.6);
      return;
    }
    case 'squeak':
      a.blip(out, t0, 1400, 1.6, 0.18, 0.09, 'square');
      a.blip(out, t0 + 0.2, 1800, 1.3, 0.14, 0.06, 'square');
      return;
    case 'pop':
      a.blip(out, t0, rand(900, 1500), 2.5, 0.04, 0.05, 'sine');
      return;
    case 'squirt':
      hiss(a, out, t0, 3200, 1.5, [
        [0.02, 0.1],
        [0.35, 0.06],
        [0.5, 0],
      ]);
      return;
    case 'splash':
      hiss(a, out, t0, 1500, 0.8, [
        [0.01, 0.12],
        [0.3, 0],
      ]);
      return;
    case 'whoosh':
      hiss(a, out, t0, 900, 1.2, [
        [0.1, 0.06],
        [0.6, 0],
      ]);
      return;
    case 'yoyo':
      a.blip(out, t0, 300, 2.2, 0.5, 0.04, 'triangle');
      a.blip(out, t0 + 0.55, 660, 0.45, 0.5, 0.04, 'triangle');
      return;
    case 'hug':
      a.blip(out, t0, 520, 0.8, 0.35, 0.04, 'sine');
      a.blip(out, t0 + 0.12, 660, 0.8, 0.4, 0.03, 'sine');
      return;
    case 'rattle':
      for (let i = 0; i < 6; i++) a.blip(out, t0 + i * 0.05 + rand(0, 0.02), rand(2500, 4000), 0.8, 0.02, 0.03, 'square');
      return;
    case 'sizzle':
      hiss(a, out, t0, 5000, 0.7, [
        [0.05, 0.06],
        [0.8, 0.04],
        [1.2, 0],
      ]);
      return;
    // Food round 2: the checkout's scanner, the receipt printing, a trolley's rattle, the ice cream scoop.
    case 'beep':
      a.blip(out, t0, 2960, 1, 0.09, 0.07, 'square');
      return;
    case 'receipt':
      for (let i = 0; i < 10; i++) a.blip(out, t0 + i * 0.06, rand(1100, 1300), 1, 0.04, 0.02, 'square');
      hiss(a, out, t0 + 0.65, 3000, 2, [
        [0.01, 0.06],
        [0.08, 0],
      ]);
      return;
    case 'trolley':
      for (let i = 0; i < 8; i++) a.blip(out, t0 + i * 0.04 + rand(0, 0.02), rand(1800, 3200), 0.7, 0.03, 0.025, 'square');
      return;
    case 'scoop':
      hiss(a, out, t0, 2200, 1, [
        [0.04, 0.05],
        [0.25, 0],
      ]);
      a.blip(out, t0 + 0.25, 420, 0.7, 0.12, 0.05, 'sine');
      return;
  }
}

/** A record on the record shop's headphones: only you hear it. */
export class Headphones {
  private tune: TunePlayer | null = null;
  private timer = 0;
  private gain: GainNode | null = null;

  constructor(private readonly a: AudioCore) {}

  /** Puts `rec` on (its tune, with its own melody), or takes the headphones off (null). */
  play(rec: { tune: string; seed: number } | null) {
    this.tune?.stop();
    this.tune = null;
    window.clearInterval(this.timer);
    const ctx = this.a.ctx;
    if (!rec || !ctx) return;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0.8;
      this.gain.connect(this.a.ambience);
    }
    const tune = (this.tune = new TunePlayer(ctx, this.gain, rec.tune, rec.seed));
    this.a.count('headphones');
    const start = performance.now();
    const tick = () => tune.tick((performance.now() - start) / 1000);
    tick();
    this.timer = window.setInterval(tick, 150);
  }

  get playing(): boolean {
    return !!this.tune;
  }
}

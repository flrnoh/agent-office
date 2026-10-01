import type { AudioCore } from './core';
import { biquad, envelope, rand } from './dsp';
import { hiss } from './hiss';

// ---- flrnoh fork: the soccer hall's crowd (world/soccer/look.ts) --------------------------------------

export type SoccerCrowdSound = 'horn' | 'roar' | 'oooh' | 'applause' | 'chant';

/** The crowd's murmur in the soccer hall: a loop of voices, on only while something keeps it up (see set). */
export class SoccerMurmur {
  private murmur: { gain: GainNode; tone: BiquadFilterNode } | null = null;

  constructor(private readonly a: AudioCore) {}

  /**
   * The soccer hall's crowd, every frame while you're in there: `level` 0..1 how full the stands are,
   * `intensity` 0..1 how exciting it is on the pitch right now (the ball near a goal, going fast). A
   * murmur of voices that swells and brightens with both, on the effects' volume. It needs keeping up:
   * half a second without a call (you went out, the tab's asleep) and it fades away by itself.
   */
  set(level: number, intensity: number) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    if (!this.murmur) {
      // Voices: brown noise through a vowel-ish band, some chatter on top that comes and goes.
      const src = a.noise(a.buf.brown, true);
      const tone = biquad(ctx, 'bandpass', 520, 0.7);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const chatter = a.noise(a.buf.white, true);
      const chatterG = ctx.createGain();
      chatterG.gain.value = 0.18;
      const lump = a.noise(a.buf.gurgle, true);
      const lumpDepth = ctx.createGain();
      lumpDepth.gain.value = 0.1;
      lump.connect(lumpDepth).connect(chatterG.gain);
      chatter.connect(biquad(ctx, 'bandpass', 1400, 1.4)).connect(chatterG).connect(tone);
      src.connect(tone).connect(gain).connect(a.ambience);
      src.start();
      chatter.start();
      lump.start();
      this.murmur = { gain, tone };
    }
    a.count('soccer-crowd-murmur');
    const l = Math.max(0, Math.min(1, level));
    const k = Math.max(0, Math.min(1, intensity));
    const now = ctx.currentTime;
    const g = this.murmur.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(l * (0.05 + 0.07 * k), now, 0.35);
    // Unless the next frame says otherwise: gone.
    g.setTargetAtTime(0, now + 0.5, 0.4);
    this.murmur.tone.frequency.setTargetAtTime(460 + 380 * k, now, 0.5);
  }
}

/**
 * The soccer hall's crowd and stadium: the horn (a goal, the kick-off, the final whistle), the roar of
 * a goal, the "oooh" of a near miss, applause for a kick-off, the rhythmic clap of a chant.
 * `strength` 0..1 how many are in it. All round you (the stands are), on the effects' volume.
 */
export function soccerCrowd(a: AudioCore, kind: SoccerCrowdSound, strength = 1) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`soccer-crowd-${kind}`);
  const s = Math.max(0.1, Math.min(1, strength));
  const t0 = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.connect(a.ambience);
  const clap = (when: number, gain: number, hands: number) => {
    // Many pairs of hands, never quite together.
    for (let i = 0; i < hands; i++) {
      hiss(a, out, when + Math.random() * 0.045, rand(1300, 2600), 1.1, [
        [0.002, gain * rand(0.6, 1)],
        [0.05, 0],
      ]);
    }
  };
  switch (kind) {
    case 'horn': {
      // An air horn: three brassy saws, a lowpass that opens as it blares; a short blast, a long one.
      for (const [at, len] of [
        [0, 0.55],
        [0.7, 1.25],
      ] as const) {
        const f = biquad(ctx, 'lowpass', 600, 1.2);
        f.frequency.setValueAtTime(600, t0 + at);
        f.frequency.linearRampToValueAtTime(2400, t0 + at + 0.08);
        f.frequency.linearRampToValueAtTime(1500, t0 + at + len);
        const g = ctx.createGain();
        envelope(g.gain, t0 + at, [
          [0.04, 0.05],
          [len - 0.1, 0.045],
          [len, 0],
        ]);
        f.connect(g).connect(out);
        for (const hz of [233, 294, 349]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz * rand(0.995, 1.005);
          o.connect(f);
          o.start(t0 + at);
          o.stop(t0 + at + len + 0.05);
        }
      }
      break;
    }
    case 'roar':
      // The whole hall at once: a swell of voices that holds, then a long tail.
      for (const [f, q, g] of [
        [420, 0.6, 0.12],
        [950, 0.8, 0.09],
        [2300, 1.1, 0.035],
      ] as const) {
        hiss(a, out, t0, f, q, [
          [0.35, g * s],
          [2.4, g * s * 0.8],
          [4.2, 0],
        ]);
      }
      break;
    case 'oooh': {
      // "Oooh": a vowel that rises as the ball goes close, and falls away as it doesn't go in.
      const n = a.noise(a.buf.brown);
      const f = biquad(ctx, 'bandpass', 330, 3.5);
      f.frequency.setValueAtTime(330, t0);
      f.frequency.linearRampToValueAtTime(560, t0 + 0.45);
      f.frequency.linearRampToValueAtTime(280, t0 + 1.5);
      const g = ctx.createGain();
      envelope(g.gain, t0, [
        [0.2, 0.5 * s],
        [0.7, 0.45 * s],
        [1.6, 0],
      ]);
      n.connect(f).connect(g).connect(out);
      n.start(t0);
      n.stop(t0 + 1.7);
      break;
    }
    case 'applause':
      // A couple of seconds of clapping, thinning out.
      for (let i = 0; i < 26; i++) clap(t0 + i * 0.09 + Math.random() * 0.05, 0.028 * s * (1 - i / 34), 3);
      break;
    case 'chant':
      // The stands clap along: clap clap, clap clap clap, twice over.
      for (let r = 0; r < 2; r++) for (const at of [0, 0.3, 0.8, 1.0, 1.2]) clap(t0 + r * 1.6 + at, 0.035 * s, 6);
      break;
  }
  setTimeout(() => out.disconnect(), 6000);
}

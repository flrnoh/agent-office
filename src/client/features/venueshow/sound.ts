import type { HouseStyle } from '../../../shared/venueshow';
import type { AudioCore } from '../../sound/core';
import { biquad, envelope, rand } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import { partyDrive, partyEmbed } from '../../sound/party';
import type { Pos } from '../../sound/places';
import { soccerCrowd } from '../../sound/soccercrowd';
import { HouseMix } from './music';

// ---- The SCHALLWERK's show, heard (flrnoh fork, see FORK.md "The show") -------------------------------
// The house mix (music.ts) on the music volume, at the party's volume, muffled through the walls of a
// rehearsal room; how loud a DJ set's embedded player should be; the crowd on the effects volume: its
// murmur, cheers that swell with the show, applause, the "Zugabe!" chant, clapping and whoops, a
// camera's flash, a beach ball's pock, the DJ's air horn. All synthesized.

/** Where you hear the house from: the hall itself, through a rehearsal room's walls, or not at all. */
export type Hearing = 'hall' | 'muffled' | 'off';

export type ShowSound = 'clap' | 'whoo' | 'zugabe' | 'roar' | 'applause' | 'flash' | 'ball' | 'horn' | 'thud' | 'pit';

export class VenueShowSound {
  private mix: HouseMix | null = null;
  private chain: { lp: BiquadFilterNode; gain: GainNode; limiter: DynamicsCompressorNode } | null = null;
  private murmur: { gain: GainNode; tone: BiquadFilterNode; cheer: GainNode; cheerTone: BiquadFilterNode } | null = null;

  constructor(
    private readonly a: AudioCore,
    private readonly bus: () => AudioNode | null,
    private readonly musicGain: () => number,
  ) {}

  /** The chain the house mix plays through: a low-pass (the walls), the party's volume, a limiter. */
  private chainNow() {
    const ctx = this.a.ctx;
    const bus = this.bus();
    if (!ctx || !bus) return null;
    if (!this.chain) {
      const lp = biquad(ctx, 'lowpass', 18000, 0.7);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      lp.connect(gain).connect(limiter).connect(bus);
      this.chain = { lp, gain, limiter };
    }
    return this.chain;
  }

  /**
   * Every frame in the house: the house mix in `style` (null: none plays), the DJ's last drop, the
   * office's clock, where you hear it from, and the party's volume (0..2).
   */
  setHouse(style: HouseStyle | null, dropAt: number, officeMs: number, hearing: Hearing, party: number) {
    const ctx = this.a.ctx;
    const play = !!style && hearing !== 'off';
    if (!play) {
      if (this.mix) {
        this.mix.stop();
        this.mix = null;
      }
      return;
    }
    const c = this.chainNow();
    if (!ctx || !c) return;
    if (!this.mix) this.mix = new HouseMix(ctx, c.lp);
    this.a.count('venue-house');
    const now = ctx.currentTime;
    c.lp.frequency.setTargetAtTime(hearing === 'muffled' ? 320 : 18000, now, 0.25);
    c.gain.gain.setTargetAtTime(partyDrive(party) * (hearing === 'muffled' ? 0.45 : 1), now, 0.2);
    this.mix.tick(style!, dropAt, officeMs);
  }

  /** How loud a DJ set in its site's own player should be (0..1): your music volume, the party's, quieter through the walls. */
  embedVolume(hearing: Hearing, party: number): number {
    if (hearing === 'off') return 0;
    const g = this.musicGain();
    return Math.min(1, this.a.masterGain() * g * partyEmbed(party, g) * (hearing === 'muffled' ? 0.12 : 0.9));
  }

  /**
   * Every frame in the hall: the crowd's murmur, `full` 0..1 how many are in, `hype` 0..1 how wild it
   * is (cheering swells with it). It fades away by itself half a second after the last call.
   */
  setCrowd(full: number, hype: number, hearing: Hearing) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    if (!this.murmur) {
      const src = a.noise(a.buf.brown, true);
      const tone = biquad(ctx, 'bandpass', 500, 0.7);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const chatter = a.noise(a.buf.white, true);
      const chatterG = ctx.createGain();
      chatterG.gain.value = 0.16;
      const lump = a.noise(a.buf.gurgle, true);
      const lumpDepth = ctx.createGain();
      lumpDepth.gain.value = 0.1;
      lump.connect(lumpDepth).connect(chatterG.gain);
      chatter.connect(biquad(ctx, 'bandpass', 1400, 1.4)).connect(chatterG).connect(tone);
      src.connect(tone).connect(gain).connect(a.ambience);
      // The cheering: a brighter, breathier layer that comes up with the hype.
      const cheerSrc = a.noise(a.buf.white, true);
      const cheerTone = biquad(ctx, 'bandpass', 1100, 0.9);
      const cheer = ctx.createGain();
      cheer.gain.value = 0;
      cheerSrc.connect(cheerTone).connect(cheer).connect(a.ambience);
      src.start();
      chatter.start();
      lump.start();
      cheerSrc.start();
      this.murmur = { gain, tone, cheer, cheerTone };
    }
    a.count('venue-crowd');
    const m = this.murmur;
    const now = ctx.currentTime;
    const wall = hearing === 'muffled' ? 0.25 : hearing === 'off' ? 0 : 1;
    const f = Math.max(0, Math.min(1, full));
    const k = Math.max(0, Math.min(1, hype));
    for (const [g, v] of [
      [m.gain.gain, f * (0.05 + 0.04 * k) * wall],
      [m.cheer.gain, f * k * k * 0.05 * wall],
    ] as const) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(v, now, 0.4);
      g.setTargetAtTime(0, now + 0.5, 0.4);
    }
    m.tone.frequency.setTargetAtTime((460 + 360 * k) * (hearing === 'muffled' ? 0.6 : 1), now, 0.5);
    m.cheerTone.frequency.setTargetAtTime(900 + 800 * k, now, 0.6);
  }

  /** Something the crowd does, where it happens (`at`; none: all round you), `strength` 0..1. */
  play(kind: ShowSound, at?: Pos, strength = 1) {
    const a = this.a;
    const ctx = a.ctx;
    if (!ctx) return;
    a.count(`venue-${kind}`);
    const s = Math.max(0.1, Math.min(1, strength));
    if (kind === 'roar' || kind === 'applause') return soccerCrowd(a, kind, s);
    const out = at ? a.panner(at, 2, 1) : ctx.createGain();
    out.connect(a.ambience);
    const t0 = ctx.currentTime + 0.01;
    switch (kind) {
      case 'clap': {
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) clap(a, out, t0 + i * rand(0.17, 0.21), 0.1 * s);
        break;
      }
      case 'whoo':
        voice(a, out, t0, rand(320, 520), [0.7, 1.5, 1.2], rand(0.7, 1.0), 0.05 * s);
        break;
      case 'zugabe': {
        // "Zu-ga-be!": a dozen voices on three syllables, the last one held, and clapping on each, three times over.
        const beat = 0.42;
        for (let r = 0; r < 3; r++) {
          const base = t0 + r * beat * 4;
          const sylls: [number, number, number, number][] = [
            [0, 0.22, 1.0, 380],
            [beat, 0.22, 1.12, 900],
            [beat * 2, 0.5, 0.95, 600],
          ];
          for (const [dt, len, pitch, vowel] of sylls) {
            for (let v = 0; v < Math.round(4 + 8 * s); v++) syllable(a, out, base + dt + Math.random() * 0.04, len, rand(150, 300) * pitch, vowel, 0.012 * s);
            for (let h = 0; h < 5; h++) clap(a, out, base + dt + Math.random() * 0.03, 0.05 * s);
          }
        }
        break;
      }
      case 'flash':
        // A shutter's click and the flash's whine charging back up.
        hiss(a, out, t0, 3200, 4, [
          [0.002, 0.08 * s],
          [0.03, 0],
        ]);
        tone(a, out, t0 + 0.05, 2400, 5200, 0.35, 0.006 * s);
        break;
      case 'ball':
        // The hollow pock of a beach ball.
        tone(a, out, t0, 260, 140, 0.12, 0.12 * s, 'sine');
        hiss(a, out, t0, 900, 2, [
          [0.003, 0.05 * s],
          [0.05, 0],
        ]);
        break;
      case 'thud':
        tone(a, out, t0, 110, 45, 0.25, 0.3 * s, 'sine');
        break;
      case 'pit':
        // Bodies bumping: a scatter of dull thumps and a few shouts.
        for (let i = 0; i < 6; i++) tone(a, out, t0 + Math.random() * 0.6, rand(80, 140), 50, 0.12, 0.08 * s, 'sine');
        for (let i = 0; i < 2; i++) voice(a, out, t0 + Math.random() * 0.4, rand(200, 330), [0.9, 1.3, 1.0], 0.5, 0.025 * s);
        break;
      case 'horn':
        horn(a, out, t0, s);
        break;
    }
    setTimeout(() => out.disconnect(), 9000);
  }

  stop() {
    this.mix?.stop();
    this.mix = null;
  }

  /** For quick checks from the console. */
  get mixing(): HouseMix | null {
    return this.mix;
  }
}

function clap(a: AudioCore, out: AudioNode, t: number, gain: number) {
  hiss(a, out, t, rand(1100, 1700), 1.3, [
    [0.002, gain],
    [0.06, 0],
  ]);
}

function tone(a: AudioCore, out: AudioNode, t: number, f0: number, f1: number, len: number, gain: number, type: OscillatorType = 'triangle') {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = ctx.createGain();
  envelope(g.gain, t, [
    [0.006, gain],
    [len, 0],
  ]);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.05);
}

/** A voice sliding through `shape` (multiples of `f`) over `len`: a whoop. */
function voice(a: AudioCore, out: AudioNode, t: number, f: number, shape: number[], len: number, gain: number) {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * shape[0], t);
  shape.slice(1).forEach((k, i) => o.frequency.exponentialRampToValueAtTime(f * k, t + (len * (i + 1)) / shape.length));
  const vowel = biquad(ctx, 'bandpass', 700, 3);
  vowel.frequency.setValueAtTime(500, t);
  vowel.frequency.linearRampToValueAtTime(900, t + len * 0.6);
  const g = ctx.createGain();
  envelope(g.gain, t, [
    [0.05, gain],
    [len * 0.7, gain * 0.8],
    [len, 0],
  ]);
  o.connect(vowel).connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.05);
}

/** One voice of the chant on one syllable: a buzz through a vowel's formant. */
function syllable(a: AudioCore, out: AudioNode, t: number, len: number, f: number, formant: number, gain: number) {
  const ctx = a.ctx!;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 0.94, t + len);
  const v = biquad(ctx, 'bandpass', formant, 4);
  const g = ctx.createGain();
  envelope(g.gain, t, [
    [0.03, gain],
    [len * 0.8, gain * 0.7],
    [len, 0],
  ]);
  o.connect(v).connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.05);
}

/** The air horn: BAAP, bap bap, BAAAAP. */
function horn(a: AudioCore, out: AudioNode, when: number, s: number) {
  const ctx = a.ctx!;
  const f = biquad(ctx, 'bandpass', 1300, 0.6);
  f.connect(out);
  for (const [dt, len] of [
    [0, 0.2],
    [0.26, 0.09],
    [0.4, 0.09],
    [0.55, 0.62],
  ]) {
    const env = ctx.createGain();
    const w = when + dt;
    env.gain.setValueAtTime(0, w);
    env.gain.linearRampToValueAtTime(0.2 * s, w + 0.015);
    env.gain.setValueAtTime(0.2 * s, w + len - 0.03);
    env.gain.linearRampToValueAtTime(0, w + len);
    env.connect(f);
    for (const [hz, det] of [
      [415, 0],
      [415, 14],
      [523, -8],
      [830, 6],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(hz * 0.9, w);
      o.frequency.exponentialRampToValueAtTime(hz, w + 0.06);
      o.connect(env);
      o.start(w);
      o.stop(w + len + 0.02);
    }
  }
}

import { midiHz } from '../../../shared/karaoke-music';
import { biquad } from '../../sound/dsp';

// ---- The karaoke band's instruments (flrnoh fork, see FORK.md "Karaoke") ------------------------------
// Synthesized like every other sound in the office: drums out of noise and a falling sine, a bass, an
// electric piano, a pad, an organ, brass stabs, a crunchy guitar, a bandoneon and the guide melody.
// Each plays one note (or chord) at an audio time into `out`; band.ts says what to play when.

export class Instruments {
  private readonly crunch: WaveShaperNode;
  private readonly crunchIn: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly white: AudioBuffer,
  ) {
    // The guitar's distortion, shared by every chord it plays.
    this.crunch = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6) * 0.8;
    }
    this.crunch.curve = curve;
    this.crunchIn = ctx.createGain();
    this.crunchIn.gain.value = 0.9;
    const tone = biquad(ctx, 'lowpass', 2600, 0.8);
    const level = ctx.createGain();
    level.gain.value = 0.35;
    this.crunchIn.connect(this.crunch).connect(tone).connect(level).connect(out);
  }

  /** A gain that goes up to `peak` at t, holds, and falls away by `t + len`. */
  private env(t: number, peak: number, attack: number, len: number, release = 0.08): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + Math.max(attack, len - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    return g;
  }

  private osc(type: OscillatorType, hz: number, t: number, len: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }

  private noise(t: number, len: number, dest: AudioNode) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.white;
    n.connect(dest);
    // A different stretch of the noise each time.
    n.start(t, Math.random() * 3, len + 0.05);
  }

  // ---- Drums ------------------------------------------------------------------------------------------

  kick(t: number, gain = 1) {
    const g = this.env(t, 0.9 * gain, 0.003, 0.32, 0.25);
    const o = this.osc('sine', 150, t, 0.32, g);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.connect(this.out);
  }

  snare(t: number, gain = 1) {
    const g = this.env(t, 0.32 * gain, 0.002, 0.2, 0.17);
    const band = biquad(this.ctx, 'bandpass', 1900, 0.7);
    this.noise(t, 0.2, band);
    band.connect(g).connect(this.out);
    const body = this.env(t, 0.22 * gain, 0.002, 0.1, 0.08);
    this.osc('triangle', 190, t, 0.1, body);
    body.connect(this.out);
  }

  /** A brushed snare for the ballad: a soft swish. */
  brush(t: number, gain = 1) {
    const g = this.env(t, 0.1 * gain, 0.02, 0.22, 0.18);
    const band = biquad(this.ctx, 'bandpass', 3200, 0.5);
    this.noise(t, 0.22, band);
    band.connect(g).connect(this.out);
  }

  hat(t: number, open = false, gain = 1) {
    const len = open ? 0.24 : 0.045;
    const g = this.env(t, 0.11 * gain, 0.001, len, len * 0.8);
    const hp = biquad(this.ctx, 'highpass', 7200, 0.7);
    this.noise(t, len, hp);
    hp.connect(g).connect(this.out);
  }

  crash(t: number, gain = 1) {
    const g = this.env(t, 0.13 * gain, 0.002, 1.6, 1.5);
    const hp = biquad(this.ctx, 'highpass', 4800, 0.5);
    this.noise(t, 1.6, hp);
    hp.connect(g).connect(this.out);
  }

  /** A hand clap (the schlager's backbeat): three quick bursts. */
  clap(t: number, gain = 1) {
    for (const d of [0, 0.011, 0.023]) {
      const g = this.env(t + d, 0.16 * gain, 0.001, d === 0.023 ? 0.14 : 0.02, 0.012);
      const band = biquad(this.ctx, 'bandpass', 1500, 1.2);
      this.noise(t + d, 0.14, band);
      band.connect(g).connect(this.out);
    }
  }

  /** The tango's knock on the bandoneon's case. */
  knock(t: number, gain = 1) {
    const g = this.env(t, 0.35 * gain, 0.002, 0.14, 0.12);
    const o = this.osc('sine', 110, t, 0.14, g);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    g.connect(this.out);
  }

  // ---- Tuned ------------------------------------------------------------------------------------------

  bass(t: number, midi: number, len: number, gain = 1, bright = 700) {
    const g = this.env(t, 0.3 * gain, 0.006, len, Math.min(0.12, len * 0.4));
    const lp = biquad(this.ctx, 'lowpass', bright, 1.4);
    this.osc('sawtooth', midiHz(midi), t, len, lp);
    this.osc('sine', midiHz(midi), t, len, g);
    lp.connect(g).connect(this.out);
  }

  /** An electric piano: a bell-ish attack fading out. */
  keys(t: number, midis: number[], len: number, gain = 1) {
    for (const m of midis) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 * gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
      this.osc('sine', midiHz(m), t, len + 0.6, g);
      const bell = this.ctx.createGain();
      bell.gain.setValueAtTime(0.0001, t);
      bell.gain.exponentialRampToValueAtTime(0.02 * gain, t + 0.003);
      bell.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      this.osc('sine', midiHz(m) * 4, t, 0.35, bell);
      g.connect(this.out);
      bell.connect(this.out);
    }
  }

  pad(t: number, midis: number[], len: number, gain = 1) {
    const g = this.env(t, 0.035 * gain, 0.35, len, 0.5);
    const lp = biquad(this.ctx, 'lowpass', 1400, 0.5);
    for (const m of midis) for (const d of [-7, 7]) this.osc('sawtooth', midiHz(m), t, len, lp, d);
    lp.connect(g).connect(this.out);
  }

  organ(t: number, midis: number[], len: number, gain = 1) {
    const g = this.env(t, 0.045 * gain, 0.01, len, 0.05);
    for (const m of midis) {
      this.osc('sine', midiHz(m), t, len, g);
      this.osc('sine', midiHz(m) * 2, t, len, g);
      this.osc('square', midiHz(m) / 2, t, len, g).frequency.value = midiHz(m) / 2;
    }
    const lp = biquad(this.ctx, 'lowpass', 3000, 0.5);
    g.connect(lp).connect(this.out);
  }

  /** A brass section's stab: bright, with a filter that opens on the attack. */
  brass(t: number, midis: number[], len: number, gain = 1) {
    const g = this.env(t, 0.05 * gain, 0.02, len, 0.06);
    const lp = biquad(this.ctx, 'lowpass', 900, 1.2);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(3600, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1400, t + len);
    for (const m of midis) for (const d of [-6, 6]) this.osc('sawtooth', midiHz(m), t, len, lp, d);
    lp.connect(g).connect(this.out);
  }

  /** A power chord on a crunchy guitar; `mute`: palm-muted chugs. */
  guitar(t: number, root: number, len: number, mute: boolean, gain = 1) {
    const g = this.env(t, (mute ? 0.18 : 0.26) * gain, 0.004, len, mute ? len * 0.6 : 0.1);
    for (const m of [root, root + 7, root + 12]) for (const d of [-8, 8]) this.osc('sawtooth', midiHz(m), t, len, g, d);
    if (mute) {
      const lp = biquad(this.ctx, 'lowpass', 900, 0.7);
      g.connect(lp).connect(this.crunchIn);
    } else g.connect(this.crunchIn);
  }

  /** A bandoneon: reedy, a little vibrato, short and marked. */
  bandoneon(t: number, midis: number[], len: number, gain = 1) {
    const g = this.env(t, 0.03 * gain, 0.015, len, 0.05);
    const bp = biquad(this.ctx, 'bandpass', 1300, 0.6);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = this.ctx.createGain();
    depth.gain.value = 9;
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
    for (const m of midis) {
      for (const d of [-4, 5]) {
        const o = this.osc('square', midiHz(m), t, len, bp, d);
        depth.connect(o.detune);
      }
    }
    bp.connect(g).connect(this.out);
  }

  /** A plucked string (the tango's violins, a guitar's arpeggio). */
  pluck(t: number, midi: number, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const lp = biquad(this.ctx, 'lowpass', 2400, 1);
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    this.osc('triangle', midiHz(midi), t, 0.45, lp);
    this.osc('sawtooth', midiHz(midi), t, 0.45, lp).detune.value = 3;
    lp.connect(g).connect(this.out);
  }

  /** The guide melody: soft and round, a touch of vibrato once it's held. */
  lead(t: number, midi: number, len: number, gain = 1) {
    const g = this.env(t, 0.07 * gain, 0.02, len, Math.min(0.1, len * 0.3));
    const o = this.osc('triangle', midiHz(midi), t, len, g);
    const s = this.osc('sine', midiHz(midi) * 2, t, len, g);
    s.detune.value = 2;
    if (len > 0.4) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const depth = this.ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14, t + len);
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(t + len + 0.05);
    }
    g.connect(this.out);
  }
}

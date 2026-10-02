import { damp, filter, hz, noiseBuffer } from './fx';

// ---- The keyboards' sounds (flrnoh fork, see FORK.md "The instruments") --------------------------------
// Five patches, each its own kind of synthesis:
//   Piano     three detuned strings of a bright partial series, its filter closing as the note
//             dies (low notes ring longer), and the hammer's knock.
//   E-Piano   two-operator FM, a tine's bark at the start mellowing into a bell-like sine, through
//             the spot's tremolo.
//   Orgel     drawbars (16' 8' 5⅓' 4' 2⅔' 2'), the key's click and the percussion's ping, through
//             the spot's rotating speaker (vibrato and tremolo).
//   Synth-Lead two detuned saws and a sub square through a resonant lowpass that snaps open, a
//             vibrato creeping in.
//   Pad       four detuned saws breathing in, a slowly sweeping filter, a long release.

export type KeysTone = 'piano' | 'epiano' | 'organ' | 'lead' | 'pad';

/** A note sounding: let go of it (from `t`), and when it started. */
export interface Voice {
  pitch: number;
  stop(t: number): void;
  /** When it's silent for sure (audio time), to forget it. */
  until: number;
}

const PIANO_PARTIALS = [1, 0.62, 0.42, 0.3, 0.22, 0.14, 0.11, 0.07, 0.05, 0.035, 0.025, 0.018];

export class Keys {
  private readonly noise: AudioBuffer;
  private pianoWave: PeriodicWave | null = null;

  constructor(private readonly ctx: BaseAudioContext) {
    this.noise = noiseBuffer(ctx, 1);
  }

  /** Starts `pitch` on `tone` into `out` at `t`, `vel` 0..1; `vib` is the spot's slow LFO (the leslie, a lead's vibrato) to wobble pitch by. */
  start(out: AudioNode, tone: KeysTone, pitch: number, vel: number, t: number, vib: AudioNode): Voice {
    const v = Math.max(0.08, Math.min(1, vel));
    switch (tone) {
      case 'piano':
        return this.piano(out, pitch, v, t);
      case 'epiano':
        return this.epiano(out, pitch, v, t);
      case 'organ':
        return this.organ(out, pitch, v, t, vib);
      case 'lead':
        return this.lead(out, pitch, v, t, vib);
      case 'pad':
        return this.pad(out, pitch, v, t);
    }
  }

  private osc(type: OscillatorType | PeriodicWave, f: number, t: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    return o;
  }

  /** A voice out of oscillators feeding `amp`: `stop` lets the amp fall with `release` and stops them once it's quiet. */
  private voice(pitch: number, amp: GainNode, oscs: OscillatorNode[], release: number, ring: number, t: number): Voice {
    let until = t + ring;
    for (const o of oscs) o.stop(until);
    return {
      pitch,
      get until() {
        return until;
      },
      stop: (at: number) => {
        const when = Math.max(at, t + 0.005);
        damp(amp.gain, when, release);
        const end = when + release * 6;
        if (end < until) {
          until = end;
          for (const o of oscs) {
            try {
              o.stop(end);
            } catch {
              // already stopping
            }
          }
        }
      },
    };
  }

  private piano(out: AudioNode, pitch: number, v: number, t: number): Voice {
    const ctx = this.ctx;
    this.pianoWave ??= ctx.createPeriodicWave(new Float32Array([0, ...PIANO_PARTIALS]), new Float32Array(PIANO_PARTIALS.length + 1));
    const f = hz(pitch);
    // Low notes ring for seconds, the top of the keyboard dies fast.
    const tau = Math.max(0.35, Math.min(3.2, 3.2 - (pitch - 40) * 0.045));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.26 * v, t + 0.003);
    amp.gain.setTargetAtTime(0.16 * v, t + 0.003, 0.09);
    amp.gain.setTargetAtTime(0, t + 0.12, tau);
    // Bright on the strike, darker as it rings; harder is brighter.
    const lp = filter(ctx, 'lowpass', Math.min(16000, f * (3 + v * 9) + 600), 0.4);
    lp.frequency.setTargetAtTime(Math.min(9000, f * 2.2 + 300), t + 0.02, tau * 0.6);
    lp.connect(amp).connect(out);
    const oscs = [-3, 0.5, 3.5].map((c) => this.osc(this.pianoWave!, f, t, lp, c * (pitch > 50 ? 1 : 0.6)));
    // The hammer.
    const knock = ctx.createGain();
    knock.gain.setValueAtTime(0.06 * v, t);
    knock.gain.setTargetAtTime(0, t, 0.006);
    const kf = filter(ctx, 'bandpass', Math.min(5000, f * 4), 1.2);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.connect(kf).connect(knock).connect(out);
    n.start(t, Math.random() * 0.8, 0.05);
    return this.voice(pitch, amp, oscs, 0.11, tau * 5 + 0.3, t);
  }

  private epiano(out: AudioNode, pitch: number, v: number, t: number): Voice {
    const ctx = this.ctx;
    const f = hz(pitch);
    const tau = Math.max(0.5, Math.min(2.6, 2.6 - (pitch - 48) * 0.03));
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.3 * v, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.01, tau);
    amp.connect(out);
    // The tine: a modulator at the carrier's own frequency, its index barking up with how hard.
    const mod = ctx.createGain();
    mod.gain.setValueAtTime(f * (0.6 + v * 2.6), t);
    mod.gain.setTargetAtTime(f * 0.25, t, 0.12);
    const m = this.osc('sine', f, t, mod);
    const c = this.osc('sine', f, t, amp, 0.8);
    mod.connect(c.frequency);
    // The metallic ping at the very start.
    const bell = ctx.createGain();
    bell.gain.setValueAtTime(0.05 * v, t);
    bell.gain.setTargetAtTime(0, t, 0.03);
    bell.connect(out);
    const b = this.osc('sine', f * 7.1, t, bell);
    b.stop(t + 0.4);
    return this.voice(pitch, amp, [m, c], 0.09, tau * 5 + 0.3, t);
  }

  private organ(out: AudioNode, pitch: number, v: number, t: number, vib: AudioNode): Voice {
    const ctx = this.ctx;
    const f = hz(pitch);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.07 + 0.03 * v, t + 0.006);
    amp.connect(out);
    const oscs: OscillatorNode[] = [];
    for (const [ratio, a] of [
      [0.5, 0.75],
      [1, 1],
      [1.5, 0.55],
      [2, 0.6],
      [3, 0.3],
      [4, 0.35],
    ] as const) {
      if (f * ratio > 9000) continue;
      const g = ctx.createGain();
      g.gain.value = a;
      g.connect(amp);
      const o = this.osc('sine', f * ratio, t, g);
      vib.connect(o.detune);
      oscs.push(o);
    }
    // Percussion: the third harmonic pinging and dying away.
    const perc = ctx.createGain();
    perc.gain.setValueAtTime(0.09 * v, t);
    perc.gain.setTargetAtTime(0, t, 0.11);
    perc.connect(out);
    this.osc('sine', f * 3, t, perc).stop(t + 0.8);
    // The key's contact click.
    const click = ctx.createGain();
    click.gain.setValueAtTime(0.05, t);
    click.gain.setTargetAtTime(0, t, 0.003);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.connect(filter(ctx, 'highpass', 1800)).connect(click).connect(out);
    n.start(t, Math.random() * 0.8, 0.03);
    return this.voice(pitch, amp, oscs, 0.018, 30, t);
  }

  private lead(out: AudioNode, pitch: number, v: number, t: number, vib: AudioNode): Voice {
    const ctx = this.ctx;
    const f = hz(pitch);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.13 * (0.6 + v * 0.4), t + 0.006);
    amp.gain.setTargetAtTime(0.1 * (0.6 + v * 0.4), t + 0.01, 0.2);
    const lp = filter(ctx, 'lowpass', 500, 6);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(Math.min(12000, 1500 + v * 5000 + f), t + 0.02);
    lp.frequency.setTargetAtTime(Math.min(8000, 900 + f * 2), t + 0.03, 0.25);
    lp.connect(amp).connect(out);
    const oscs = [this.osc('sawtooth', f, t, lp, -8), this.osc('sawtooth', f, t, lp, 8)];
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    subG.connect(lp);
    oscs.push(this.osc('square', f / 2, t, subG));
    // The vibrato creeps in after a moment.
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setTargetAtTime(1, t + 0.35, 0.3);
    vib.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    return this.voice(pitch, amp, oscs, 0.12, 30, t);
  }

  private pad(out: AudioNode, pitch: number, v: number, t: number): Voice {
    const ctx = this.ctx;
    const f = hz(pitch);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.setTargetAtTime(0.1 * (0.6 + v * 0.4), t, 0.35);
    const lp = filter(ctx, 'lowpass', 900 + f * 0.8, 1.2);
    // The filter breathes, each voice at its own pace.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.15 + Math.random() * 0.2;
    const sg = ctx.createGain();
    sg.gain.value = 450;
    sweep.connect(sg).connect(lp.frequency);
    sweep.start(t);
    lp.connect(amp).connect(out);
    const oscs = [-14, -5, 5, 14].map((c) => this.osc('sawtooth', f, t, lp, c));
    const air = ctx.createGain();
    air.gain.value = 0.25;
    air.connect(lp);
    oscs.push(this.osc('triangle', f * 2, t, air, 3), sweep);
    return this.voice(pitch, amp, oscs, 0.55, 30, t);
  }
}

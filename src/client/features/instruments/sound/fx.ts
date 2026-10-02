// The instruments' studio rack (flrnoh fork, see FORK.md "The instruments"): the noise and the cymbal
// metal everything is cut from, the amp's distortion curves, the rooms' reverb tails and the little
// helpers the recipes share. Everything works on any BaseAudioContext, so the lab can render the
// instruments offline (lab/instruments.ts) as the office plays them live.

/** A filter. */
export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707, gain = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

export function gainNode(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A gain that hits `peak` `attack` seconds after `t`, then dies away exponentially with time constant `tau`. */
export function hit(ctx: BaseAudioContext, t: number, peak: number, attack: number, tau: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, tau);
  return g;
}

/** Stops an envelope smoothly from `t` (a damped string, a key let go). */
export function damp(param: AudioParam, t: number, tau: number) {
  param.cancelScheduledValues(t);
  // Hold where it is right now, then fall: setTargetAtTime picks up from the held value.
  param.setTargetAtTime(0, t, tau);
}

/** Seconds of white noise. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/**
 * The cymbals' metal: six square waves at the inharmonic ratios of a struck plate (as the classic
 * drum machines make their hats), summed, a few seconds of it to start anywhere in.
 */
export function metalBuffer(ctx: BaseAudioContext, base = 40): AudioBuffer {
  const sr = ctx.sampleRate;
  const b = ctx.createBuffer(1, Math.ceil(sr * 3), sr);
  const d = b.getChannelData(0);
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
  const f = ratios.map((r) => (r * base * 2.3) / sr);
  const ph = ratios.map(() => Math.random());
  for (let i = 0; i < d.length; i++) {
    let s = 0;
    for (let k = 0; k < 6; k++) {
      ph[k] = (ph[k] + f[k]) % 1;
      s += ph[k] < 0.5 ? 1 : -1;
    }
    d[i] = s / 6 + (Math.random() * 2 - 1) * 0.15;
  }
  return b;
}

/**
 * An amp's distortion: a soft clip that bites harder the more it's driven, a little lopsided (as a
 * valve stage is) so it growls with even harmonics too. `drive` 1 is barely warm, 40 is a stack on 10.
 */
export function driveCurve(drive: number, n = 4096): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = x >= 0 ? Math.tanh(drive * x) : Math.tanh(drive * 0.82 * x) * 0.92;
    c[i] = y / norm;
  }
  return c;
}

/**
 * A room's reverb: stereo decaying noise, its highs dying faster than its lows (smoothed more and
 * more along the tail), with a few early reflections off the walls up front. `secs` how long it
 * rings, `pre` the gap before it starts, `bright` how much air it keeps (0..1).
 */
export function reverbIr(ctx: BaseAudioContext, secs: number, pre: number, bright: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.ceil(sr * (secs + pre));
  const ir = ctx.createBuffer(2, len, sr);
  const p = Math.floor(pre * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = p; i < len; i++) {
      const k = (i - p) / (len - p);
      // Duller the further into the tail: a one-pole lowpass whose cutoff slides down.
      const a = Math.min(0.97, (1 - bright) * 0.4 + k * 0.85);
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * Math.pow(1 - k, 2.4) * (i - p < 300 ? (i - p) / 300 : 1) * (1 + (1 - bright) * 2 * k);
    }
    // Early reflections: the walls, a few taps either side.
    for (let r = 0; r < 7; r++) {
      const at = p + Math.floor((0.004 + Math.random() * pre * 1.6 + r * 0.006) * sr);
      if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - r * 0.05);
    }
  }
  return ir;
}

/** A MIDI note's frequency. */
export const hz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

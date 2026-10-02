// The instruments lab's ear (lab/instruments.ts `?audio=<take>`): renders a few bars of the
// instruments offline, through the very engine the office plays them with (features/instruments/
// sound/engine.ts), draws the waveform and a spectrogram to judge by eye whether a guitar sounds like
// a guitar, and leaves the take as a WAV in window.__wav (base64) for shot.mjs's caller to save.

import { DRUM_PIECES, INSTRUMENT_SPOTS, type InstrumentNote } from '../../shared/venue';
import type { Tone } from '../../shared/instruments';
import { GROOVES, bassRoot, chordOf, grooveHits, guitarChord, stepBeat } from '../../shared/instruments-play';
import { Engine } from '../features/instruments/sound/engine';

type Ev = { t: number; spot: string; tone: Tone; note: InstrumentNote };

const spot = (id: string) => INSTRUMENT_SPOTS.find((s) => s.id === id)!;

/** The takes: a few bars each, as a player at the keyboard would play them. */
function take(name: string): { secs: number; events: Ev[] } {
  const ev: Ev[] = [];
  const bpm = 120;
  const beat = 60 / bpm;
  const g = (t: number, pitch: number, vel = 0.85, len?: number, tone: Tone = 'drive', id = 'stage-guitar1') => ev.push({ t, spot: id, tone, note: { kind: 'guitar', pitch, vel, ...(len !== undefined ? { len } : {}) } });
  const strum = (t: number, slot: number, opts: { power?: boolean; up?: boolean; len?: number; tone?: Tone; key?: number; minor?: boolean } = {}) => {
    const c = chordOf(opts.key ?? 4, opts.minor ?? true, slot);
    const notes = guitarChord(c.root, c.quality, opts.power ?? true);
    (opts.up ? [...notes].reverse() : notes).forEach((p, i) => g(t + i * 0.009, p, 0.85, opts.len, opts.tone ?? 'drive'));
  };
  const drums = (t: number, piece: keyof typeof DRUM_PIECES, vel: number) => ev.push({ t, spot: 'stage-drums', tone: 'kit', note: { kind: 'drums', pitch: DRUM_PIECES[piece], vel } });
  const groove = (t0: number, bars: number, gi: number) => {
    for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) for (const h of grooveHits(GROOVES[gi], s)) drums(t0 + (b * 4 + stepBeat(GROOVES[gi], s)) * beat, h.piece, h.vel);
  };
  const bass = (t: number, pitch: number, len: number) => ev.push({ t, spot: 'stage-bass', tone: 'amp', note: { kind: 'bass', pitch, vel: 0.85, len } });
  const keys = (t: number, pitch: number, len: number, tone: Tone) => ev.push({ t, spot: 'stage-keys', tone, note: { kind: 'keys', pitch, vel: 0.8, len } });
  if (name === 'guitar') {
    // Power chords: chugged eighths (palm-muted), then open ones let ring.
    [0, 5, 3, 6].forEach((slot, bar) => {
      for (let i = 0; i < 6; i++) strum((bar * 4 + i * 0.5) * beat, slot, { len: 0.18 });
      strum((bar * 4 + 3) * beat, slot, { len: beat * 0.9 });
    });
    return { secs: 16 * beat + 1.5, events: ev };
  }
  if (name === 'clean') {
    [0, 3, 4, 0].forEach((slot, bar) => {
      strum(bar * 4 * beat, slot, { power: false, tone: 'clean', minor: false, key: 7, len: beat * 1.9 });
      strum((bar * 4 + 2) * beat, slot, { power: false, tone: 'clean', minor: false, key: 7, len: beat * 0.9 });
      strum((bar * 4 + 3) * beat, slot, { power: false, up: true, tone: 'clean', minor: false, key: 7, len: beat });
    });
    return { secs: 16 * beat + 1.5, events: ev };
  }
  if (name === 'lead') {
    const line = [64, 67, 69, 71, 74, 71, 69, 67, 69, 64, 62, 64];
    line.forEach((p, i) => g(i * beat * 0.5, p, 0.9, i === line.length - 1 ? 1.6 : beat * 0.48));
    return { secs: 8 * beat, events: ev };
  }
  if (name === 'drums') {
    groove(0, 2, 0);
    groove(8 * beat, 1, 1);
    // A fill down the toms into a crash.
    const f0 = 12 * beat;
    (['snare', 'snare', 'tomHi', 'tomHi', 'tomMid', 'tomMid', 'tomLow', 'tomLow'] as const).forEach((p, i) => drums(f0 + i * beat * 0.5, p, 0.85));
    drums(16 * beat, 'crash', 1);
    drums(16 * beat, 'kick', 1);
    return { secs: 16 * beat + 2, events: ev };
  }
  if (name === 'bass') {
    [40, 40, 43, 45, 47, 45, 43, 38].forEach((p, i) => bass(i * beat, p, beat * 0.9));
    return { secs: 9 * beat, events: ev };
  }
  if (name.startsWith('keys-')) {
    const tone = name.slice(5) as Tone;
    const chords = [
      [60, 64, 67, 72],
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [55, 59, 62, 67],
    ];
    chords.forEach((c, i) => c.forEach((p, k) => keys(i * 2 * beat + k * 0.01, p, beat * 1.8, tone)));
    [72, 74, 76, 79, 76, 74, 72].forEach((p, i) => keys(8 * beat + i * beat * 0.5, p, beat * 0.45, tone));
    return { secs: 13 * beat, events: ev };
  }
  // The band: two bars of everything together.
  groove(0, 4, 0);
  [0, 0, 5, 6].forEach((slot, bar) => {
    for (let i = 0; i < 8; i++) strum((bar * 4 + i * 0.5) * beat, slot, { len: i % 4 === 0 ? beat * 0.45 : 0.18 });
    const root = bassRoot(chordOf(4, true, slot).root);
    for (let i = 0; i < 8; i++) bass((bar * 4 + i * 0.5) * beat, root, beat * 0.4);
  });
  return { secs: 16 * beat + 1.5, events: ev };
}

export async function renderTake(name: string, canvas: HTMLCanvasElement) {
  const { secs, events } = take(name);
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const engine = new Engine(ctx, master);
  // Your ears: a few metres in front of the stage, facing it (the hall's sound reaches you whole).
  const L = ctx.listener;
  L.positionX.value = 2.5;
  L.positionY.value = 1.6;
  L.positionZ.value = -1;
  L.forwardX.value = 0;
  L.forwardY.value = 0;
  L.forwardZ.value = 1;
  engine.hear('hall', 1, false, 0);
  for (const e of events) engine.play(spot(e.spot), e.tone, e.note, e.t + 0.05);
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;
  const facts = draw(buf, canvas);
  (window as unknown as { __wav: string }).__wav = wavBase64(buf);
  return { take: name, secs, notes: events.length, renderMs: Math.round(ms), ...facts };
}

/** The waveform on top, a spectrogram (log frequency, 40 Hz – 16 kHz) under it. */
function draw(buf: AudioBuffer, canvas: HTMLCanvasElement) {
  const W = (canvas.width = 1400);
  const H = (canvas.height = 700);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, W, H);
  const d = buf.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (const v of d) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / d.length);
  g.strokeStyle = '#7fd6ff';
  g.beginPath();
  const wh = 160;
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x / W) * d.length);
    const b = Math.floor(((x + 1) / W) * d.length);
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      lo = Math.min(lo, d[i]);
      hi = Math.max(hi, d[i]);
    }
    g.moveTo(x + 0.5, wh / 2 - hi * (wh / 2));
    g.lineTo(x + 0.5, wh / 2 - lo * (wh / 2));
  }
  g.stroke();
  // Spectrogram.
  const N = 2048;
  const top = wh + 10;
  const sh = H - top;
  const hop = Math.max(1, Math.floor((d.length - N) / W));
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const img = g.createImageData(W, sh);
  const fLo = Math.log(40);
  const fHi = Math.log(16000);
  for (let x = 0; x < W; x++) {
    const at = x * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (d[at + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < sh; y++) {
      const f = Math.exp(fHi - (y / sh) * (fHi - fLo));
      const k = Math.min(N / 2 - 1, Math.round((f * N) / buf.sampleRate));
      const db = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12);
      const v = Math.max(0, Math.min(1, (db + 10) / 60));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.6);
      img.data[o + 1] = 255 * Math.max(0, v * 1.4 - 0.4);
      img.data[o + 2] = 255 * Math.max(0, 0.35 + v * 0.3 - v * v);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, top);
  g.fillStyle = '#fff';
  g.font = '14px monospace';
  for (const f of [100, 300, 1000, 3000, 10000]) {
    const y = top + ((fHi - Math.log(f)) / (fHi - fLo)) * sh;
    g.fillText(`${f >= 1000 ? f / 1000 + 'k' : f}`, 4, y);
  }
  return { peak: +peak.toFixed(3), rms: +rms.toFixed(4) };
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
  }
}

/** 16-bit stereo WAV, base64. */
function wavBase64(buf: AudioBuffer): string {
  const n = buf.length;
  const ch = buf.numberOfChannels;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      v.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true);
      o += 2;
    }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

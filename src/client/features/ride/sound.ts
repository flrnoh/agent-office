import type { AudioCore } from '../../sound/core';
import { biquad } from '../../sound/dsp';
import { hiss } from '../../sound/hiss';
import type { Pos } from '../../sound/places';

// ---- Bikes, pets and laundry (flrnoh fork, see FORK.md "Shops to walk into") --------------------
// A bike's bell (ring-ring), its tyres coming down after a hop, a bump; a budgie's chirp, the goldfish
// bag's slosh; a washing machine starting to rumble, and its ding when it's done.

export type RideSound = 'bell' | 'land' | 'bump' | 'chirp' | 'slosh' | 'wash' | 'ding' | 'coin';

export function rideSound(a: AudioCore, kind: RideSound, at: Pos) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`ride-${kind}`);
  const out = a.panner(at, 2, 1.2);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  switch (kind) {
    case 'bell':
      // Ring-ring: a thumb flicking the bell's striker twice, the dome ringing on.
      for (const dt of [0, 0.16]) {
        a.blip(out, t0 + dt, 3950, 0.999, 0.5, 0.09, 'sine');
        a.blip(out, t0 + dt, 5320, 0.999, 0.3, 0.04, 'sine');
      }
      return;
    case 'land':
      hiss(a, out, t0, 400, 0.8, [
        [0.01, 0.25],
        [0.18, 0],
      ]);
      a.blip(out, t0, 90, 0.6, 0.12, 0.3, 'sine');
      return;
    case 'bump':
      a.blip(out, t0, 140, 0.5, 0.15, 0.35, 'triangle');
      a.blip(out, t0 + 0.02, 2600, 0.98, 0.25, 0.04, 'square');
      return;
    case 'chirp':
      for (let i = 0; i < 3; i++) a.blip(out, t0 + i * 0.09, 3200 + i * 300, 1.35, 0.06, 0.05, 'sine');
      return;
    case 'slosh':
      hiss(a, out, t0, 700, 2.5, [
        [0.08, 0.1],
        [0.25, 0.04],
        [0.4, 0],
      ]);
      a.blip(out, t0 + 0.1, 600, 1.8, 0.08, 0.04, 'sine');
      return;
    case 'coin':
      a.blip(out, t0, 4200, 0.999, 0.15, 0.06, 'triangle');
      a.blip(out, t0 + 0.12, 1800, 0.9, 0.08, 0.05, 'square');
      return;
    case 'ding':
      a.blip(out, t0, 1568, 0.999, 1.2, 0.08, 'sine');
      a.blip(out, t0 + 0.35, 1175, 0.999, 1.4, 0.08, 'sine');
      return;
    case 'wash': {
      // The drum filling and starting to turn: water rushing in, a low rumble that swells and fades.
      hiss(a, out, t0, 900, 0.7, [
        [0.3, 0.12],
        [2.2, 0.08],
        [3, 0],
      ]);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(42, t0);
      o.frequency.linearRampToValueAtTime(58, t0 + 4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 1);
      g.gain.setValueAtTime(0.12, t0 + 4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.5);
      o.connect(biquad(ctx, 'lowpass', 160, 0.7)).connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 5.6);
      return;
    }
  }
}

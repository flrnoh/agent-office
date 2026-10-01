import { hearSpeakers, speakerGain } from '../speakers';
import type { AudioCore } from './core';
import { biquad } from './dsp';

// ---- The speakers all over the office (flrnoh fork, see ../speakers.ts) ------------------------------
// One PA for all of them, fed the same tune as the jukebox (features/jukebox/sound.ts hands it its
// source and asks how loud they are where you stand).

export class Speakers {
  private pa: { gain: GainNode; pan: StereoPannerNode } | null = null;
  private volume = 0.4;
  private muted = false;
  /** How far your floor's back office is built out, with the speakers switched on there; null where there are none (the roof, the garage's elevator ride, another map). */
  room: { wing: number; on: boolean } | null = null;
  /** The speakers' level where you stand (0–1, before your speaker volume), for the stream and quick checks. */
  level = 0;

  constructor(private readonly a: AudioCore) {}

  /** The jukebox's tune, a little thinner (small boxes), panned lightly, from `src`; `meter` hears it too. */
  connect(ctx: AudioContext, src: AudioNode, meter: AudioNode) {
    const low = biquad(ctx, 'highpass', 140, 0.7);
    const tone = biquad(ctx, 'lowpass', 9000, 0.6);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(low).connect(tone).connect(gain).connect(pan).connect(ctx.destination);
    pan.connect(meter);
    this.pa = { gain, pan };
  }

  /** Your own speaker volume, 0–1, apart from the jukebox's. */
  setVolume(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
  }

  /** Your speaker volume as a gain, 0 when they're off. Muting the music mutes them too. */
  gain(musicMuted: boolean): number {
    return this.room ? speakerGain(this.volume, this.muted, musicMuted, this.room.on) : 0;
  }

  /** How loud the speakers are where you stand now. */
  hear(now: number, musicMuted: boolean) {
    const room = this.room;
    const heard = room ? hearSpeakers(this.a.listener, room.wing) : { level: 0, pan: 0 };
    this.level = heard.level;
    if (this.pa) {
      this.pa.gain.gain.setTargetAtTime(heard.level * this.gain(musicMuted), now, 0.12);
      this.pa.pan.pan.setTargetAtTime(heard.pan, now, 0.2);
    }
  }
}

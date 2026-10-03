import type { AudioCore } from './core';

/*
 * Gym FM (flrnoh fork, see shared/gym-radio.ts): the gym's radio stream through its speakers. A live
 * stream plays outside Web Audio (most stations don't allow that), so it's an <audio> element whose
 * volume follows your own music volume and how much of the hall's sound reaches you (client/gym.ts:
 * all of it on the gym floor, a little in the changing room, none in the spa or the basement). It
 * only streams while you can hear it: a few seconds of silence and it lets go of the station.
 */

/** How loud the speakers are against your music volume. */
const LEVEL = 0.85;
/** How long it stays connected after going quiet (s), so a walk through the spa door doesn't cut it. */
const HOLD = 6;
/** How often it asks the browser again to start after being refused (autoplay rules), in ms. */
const RETRY_MS = 2500;

export class GymRadioSound {
  private audio: HTMLAudioElement | null = null;
  private url = '';
  /** How much reaches you right now (eased), and how long it's been silent. */
  private level = 0;
  private quiet = 0;
  private retryAt = 0;
  private last = 0;

  constructor(
    private readonly a: AudioCore,
    private readonly musicGain: () => number,
  ) {}

  /** Every frame in the gym: the station's stream (empty: none, or you're not in there) and how much reaches you (0…1). */
  set(url: string, reach: number) {
    const now = performance.now();
    const dt = this.last ? Math.min(0.2, (now - this.last) / 1000) : 0;
    this.last = now;
    if (url !== this.url) this.drop();
    this.url = url;
    const want = url ? Math.max(0, Math.min(1, reach)) : 0;
    // Through the spa's door it fades within a second, as a door closing would.
    this.level += (want - this.level) * Math.min(1, dt * 3);
    if (this.level < 0.01) {
      this.quiet += dt;
      if (this.audio && this.quiet > HOLD) this.drop();
    } else this.quiet = 0;
    if (!url || (this.level < 0.01 && !this.audio)) return;
    if (!this.audio && this.a.ctx) this.start(url);
    const el = this.audio;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, this.musicGain() * LEVEL * this.level * this.level));
    if (el.paused && now > this.retryAt && this.a.ctx?.state === 'running') {
      this.retryAt = now + RETRY_MS;
      void el.play().catch(() => {});
    }
  }

  /** Out of the gym: off. */
  stop() {
    this.drop();
    this.url = '';
    this.level = 0;
  }

  private start(url: string) {
    const el = new Audio();
    el.preload = 'none';
    el.src = url;
    this.audio = el;
    this.retryAt = performance.now() + RETRY_MS;
    void el.play().catch(() => {});
    this.a.count('gymradio');
  }

  private drop() {
    const el = this.audio;
    if (!el) return;
    this.audio = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
}

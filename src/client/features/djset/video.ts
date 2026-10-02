import * as THREE from 'three';
import type { WallVideo } from '../rooftop/ledwall';

/*
 * A YouTube set's own video on the roof's LED wall (flrnoh fork, see FORK.md "The set's video on the
 * LED wall"). A browser can't draw YouTube's player into WebGL, so the office keeps a small copy
 * without sound (server/djvideo/) and this plays it in a hidden, muted <video>, in step with the set
 * you hear: off by more than a little, it jumps there; else it runs a touch faster or slower until
 * it's caught up. It's only made while you're up on the roof and there's a copy, and let go of
 * when you go down, the set changes or the house DJ is back.
 */

/** How far off it may be before it jumps (s); closer than that it's caught up by its speed. */
const JUMP = 0.6;
/** How far off its picture may be and still be shown (s): a moment behind while it jumps is better than a dark wall; not the wrong bit of the set. */
const SHOWN = 5;

export class SetVideo {
  private v: HTMLVideoElement | null = null;
  private tex: THREE.VideoTexture | null = null;
  /** The copy it holds (DjVideoStatus.key), and one that wouldn't play here. */
  private key = '';
  private failed = '';
  private lastJump = 0;

  /**
   * Each frame up on the roof: the copy `key` (null: none), kept at `at` seconds into the set while
   * the set's own player is `playing` here. What the wall gets: null while there's nothing to show.
   */
  update(key: string | null, at: number, playing: boolean): WallVideo | null {
    if (!key || key === this.failed) {
      this.release();
      return null;
    }
    if (key !== this.key) this.load(key);
    const v = this.v!;
    if (!playing) {
      if (!v.paused) v.pause();
      return null;
    }
    // Not even its length known yet.
    if (v.readyState < 1) return null;
    // The set runs on past its video (or hasn't reached it): nothing to show.
    if (at < 0 || (Number.isFinite(v.duration) && at > v.duration - 0.25)) {
      if (!v.paused) v.pause();
      return null;
    }
    const off = v.currentTime - at;
    const now = performance.now();
    if (Math.abs(off) > JUMP) {
      // Not again while it's still getting there; a jump before it can play goes a little ahead, to meet the set.
      if (!v.seeking && now - this.lastJump > 1500) {
        this.lastJump = now;
        v.currentTime = at + (v.readyState >= 3 ? 0.05 : 0.3);
      }
    } else {
      const rate = Math.min(1.03, Math.max(0.97, 1 - off * 0.25));
      if (Math.abs(v.playbackRate - rate) > 0.004) v.playbackRate = rate;
    }
    if (v.paused) void v.play().catch(() => {});
    const on = v.videoWidth > 0 && v.readyState >= 2 && Math.abs(off) < SHOWN;
    return { texture: this.tex!, aspect: v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9, on };
  }

  private load(key: string) {
    this.release();
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.setAttribute('aria-hidden', 'true');
    v.addEventListener('error', () => {
      if (this.v !== v) return;
      console.warn(`[dj] the set's video won't play here (${v.error?.message || v.error?.code || 'no reason'})`);
      this.failed = key;
      this.release();
    });
    v.src = `/api/dj/video?v=${encodeURIComponent(key)}`;
    this.v = v;
    this.key = key;
    this.tex = new THREE.VideoTexture(v);
    this.tex.generateMipmaps = false;
  }

  /** Lets go of the video and its texture (off the roof, another set, the house DJ). */
  release() {
    const v = this.v;
    if (!v) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
    this.tex?.dispose();
    this.tex = null;
    this.v = null;
    this.key = '';
  }

  /** The video, while there is one (for checks from the console). */
  element(): HTMLVideoElement | null {
    return this.v;
  }
}

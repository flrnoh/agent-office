import * as THREE from 'three';
import { FILMS, kinoAt, runtime, type KinoNow } from '../../../shared/kino';
import { SCREEN1 } from '../../../shared/kino-plan';
import { wrap } from '../../world/kino/kit';

// Saal 1's screen (flrnoh fork, see FORK.md "The cinema"): the film on now, from Wikimedia Commons
// straight into the viewer's browser, drawn on the screen as a texture (Commons sends CORS, so WebGL
// may). Everyone's at the same moment of it (the programme runs on the office's clock, see
// shared/kino.ts): coming in late seeks to where it is, and it's put back when it drifts. The <video>
// is only made near the cinema, plays only while you're in the hall, and is let go of once you're away.
// Between films (and while one loads) the screen shows a card: what's next, when, and its credit.

/** How far it may drift from everyone else before it's put back (s). */
const DRIFT = 2.5;

export type FilmPhase = 'off' | 'break' | 'loading' | 'playing' | 'failed';

export interface FilmHooks {
  now(): number;
  /** How loud it is where you stand, 0–1 (0 outside the hall). */
  volume(): number;
  toast(text: string, level?: 'info' | 'warn'): void;
}

export class FilmScreen {
  private video: HTMLVideoElement | null = null;
  private tex: THREE.VideoTexture | null = null;
  /** Which film the video holds. */
  private film = -1;
  private failed = -1;
  private phaseNow: FilmPhase = 'off';
  private readonly cardCanvas = document.createElement('canvas');
  private readonly cardTex: THREE.CanvasTexture;
  private cardKey = '';
  private lastSync = 0;
  /** The film it was last put in step with on coming in (a new film, or back in the hall, seeks straight away). */
  private synced = -1;
  /** Whether the screen shows the video (else its card). */
  private shownVideo = false;
  /** It's playing muted because the browser wanted a click first: the next click turns the sound up. */
  private hushed = false;
  private readonly unhush = () => {
    if (!this.hushed || !this.video) return;
    this.hushed = false;
    this.video.muted = false;
  };

  constructor(
    private readonly hooks: FilmHooks,
    private readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    private readonly plaque: THREE.CanvasTexture,
  ) {
    this.cardCanvas.width = 1280;
    this.cardCanvas.height = 720;
    this.cardTex = new THREE.CanvasTexture(this.cardCanvas);
    this.cardTex.colorSpace = THREE.SRGBColorSpace;
    window.addEventListener('pointerdown', this.unhush, true);
    window.addEventListener('keydown', this.unhush, true);
  }

  phase(): FilmPhase {
    return this.phaseNow;
  }

  /** The video, while there is one (for checks from the console). */
  element(): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Each frame: `near` the cinema (the video's made, ready for the film on now or next), `inside` the
   * hall (it plays, with sound). Away from the cinema it's let go of.
   */
  update(near: boolean, inside: boolean): KinoNow {
    const k = kinoAt(this.hooks.now());
    if (!near) {
      this.unload();
      this.phaseNow = 'off';
      this.show(k);
      return k;
    }
    if (this.film !== k.film) this.load(k.film);
    const v = this.video;
    if (this.failed === k.film) this.phaseNow = 'failed';
    else if (k.phase === 'break') this.phaseNow = 'break';
    else this.phaseNow = v && v.readyState >= 2 && !v.paused && inside ? 'playing' : 'loading';
    if (v && this.failed !== k.film) {
      if (k.phase === 'film' && inside) {
        const now = performance.now();
        // Coming in, or every few seconds once it plays: back where everyone is. While it's still
        // fetching that bit it's left to it (seeking again then would only start the fetch over),
        // unless it's fallen far behind; a seek while it buffers goes a little ahead, to meet the film.
        if (v.readyState >= 1 && !v.seeking && (this.film !== this.synced || now - this.lastSync > 3000)) {
          const ready = v.readyState >= 3;
          const drift = Math.abs(v.currentTime - k.offset);
          if (this.film !== this.synced || drift > (ready ? DRIFT : 20)) {
            this.lastSync = now;
            v.currentTime = Math.min(k.offset + (ready ? 0 : 2), Math.max(0, (v.duration || Infinity) - 0.5));
          }
          this.synced = this.film;
        }
        if (v.paused) this.start(v);
        const vol = this.hooks.volume();
        if (Math.abs(v.volume - vol) > 0.01) v.volume = Math.max(0, Math.min(1, vol));
      } else if (!v.paused) {
        v.pause();
        this.synced = -1;
      }
      else if (k.phase === 'break' && v.readyState >= 1 && v.currentTime > 0.5) v.currentTime = 0;
    }
    this.show(k);
    return k;
  }

  /** Starts it; a browser that won't without a click gets it muted, and the next click turns it up. */
  private start(v: HTMLVideoElement) {
    void v.play().catch((e: Error) => {
      if (e?.name !== 'NotAllowedError' || v.muted) return;
      v.muted = true;
      this.hushed = true;
      this.hooks.toast('🎬 Click to hear the film');
      void v.play().catch(() => {});
    });
  }

  private load(film: number) {
    this.unload();
    const f = FILMS[film];
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.playsInline = true;
    v.setAttribute('aria-label', `Saal 1: ${f.title}`);
    v.addEventListener('loadedmetadata', () => this.fit());
    v.addEventListener('error', () => {
      if (this.video !== v || this.failed === film) return;
      this.failed = film;
      this.hooks.toast(`🎬 ${f.title} won't play in this browser here`, 'warn');
    });
    v.src = f.url;
    this.video = v;
    this.film = film;
    this.failed = -1;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;
    this.drawPlaque(film);
  }

  private unload() {
    const v = this.video;
    if (!v) return;
    v.pause();
    v.removeAttribute('src');
    v.load();
    this.tex?.dispose();
    this.tex = null;
    this.video = null;
    this.film = -1;
    this.hushed = false;
  }

  /** The screen as big as the film's picture allows, in its own shape (a 4:3 silent film, a 2.39:1 one). */
  private fit() {
    const v = this.video;
    if (!v || !v.videoWidth || !v.videoHeight || !this.shownVideo) return;
    const a = v.videoWidth / v.videoHeight;
    const box = SCREEN1.w / SCREEN1.h;
    this.screen.scale.set(a > box ? 1 : a / box, a > box ? box / a : 1, 1);
  }

  /** The film while it plays, else the card. */
  private show(k: KinoNow) {
    const playing = this.phaseNow === 'playing' && !!this.tex;
    if (playing !== this.shownVideo) {
      this.shownVideo = playing;
      if (playing) this.fit();
      else this.screen.scale.set(1, 1, 1);
    }
    const map = playing ? this.tex! : this.card(k);
    if (this.screen.material.map !== map) {
      this.screen.material.map = map;
      this.screen.material.needsUpdate = true;
    }
  }

  /** What the screen shows between films: next, when, how long, and its credit. */
  private card(k: KinoNow): THREE.Texture {
    const f = FILMS[k.film];
    const secs = Math.max(0, Math.ceil(-k.offset));
    const status = this.phaseNow === 'failed' ? 'kann hier nicht abgespielt werden' : k.phase === 'break' ? `beginnt in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : this.phaseNow === 'off' ? '' : 'wird geladen…';
    const key = `${k.film}|${status}`;
    if (key === this.cardKey) return this.cardTex;
    this.cardKey = key;
    const g = this.cardCanvas.getContext('2d');
    if (!g) return this.cardTex;
    const [bg, , accent] = f.poster;
    const grad = g.createLinearGradient(0, 0, 0, 720);
    grad.addColorStop(0, '#0d0d10');
    grad.addColorStop(1, bg);
    g.fillStyle = grad;
    g.fillRect(0, 0, 1280, 720);
    g.textAlign = 'center';
    g.fillStyle = accent;
    g.font = '800 40px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText(k.phase === 'break' ? 'GLEICH IN SAAL 1' : 'SAAL 1', 640, 150);
    g.fillStyle = '#ffffff';
    g.font = '900 96px Nunito, ui-rounded, system-ui, sans-serif';
    const lines = wrap(g, f.title, 1180).slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, 640, 290 + i * 100));
    g.font = '700 36px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillText([f.original, String(f.year), runtime(f.seconds), f.silent ? 'Stummfilm' : ''].filter(Boolean).join(' · '), 640, 290 + lines.length * 100);
    g.font = '800 48px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = accent;
    g.fillText(status, 640, 560);
    g.font = '700 26px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.75)';
    wrap(g, f.credit, 1180).slice(0, 2).forEach((l, i) => g.fillText(l, 640, 640 + i * 32));
    this.cardTex.needsUpdate = true;
    return this.cardTex;
  }

  /** The plaque under the screen: the film and its credit. */
  private drawPlaque(film: number) {
    const f = FILMS[film];
    const c = this.plaque.image as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#1a0d0d';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffd166';
    g.textAlign = 'center';
    g.font = '800 30px Nunito, ui-rounded, system-ui, sans-serif';
    let text = `${f.title} (${f.year}) · ${f.credit}`;
    while (g.measureText(text).width > c.width - 30 && text.length > 20) text = `${text.slice(0, -2)}…`;
    g.fillText(text, c.width / 2, 43);
    this.plaque.needsUpdate = true;
  }
}

/** The house lights for where the programme is: up in the break, down over its last seconds, down in the film. */
export function houseLevel(k: KinoNow): number {
  if (k.phase === 'film') return 0.06;
  const dim = 8;
  return k.offset > -dim ? 0.06 + 0.94 * (-k.offset / dim) : 1;
}

/** How far the curtain's open: shut in the break, opening over the last seconds of it. */
export function curtainOpen(k: KinoNow): number {
  if (k.phase === 'film') return 1;
  return k.offset > -5 ? (5 + k.offset) / 5 : 0;
}


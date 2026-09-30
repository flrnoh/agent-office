import * as THREE from 'three';
import { hms } from '../shared/embeds';
import { TV } from '../shared/layout';
import { TV_SITES, sameTvStream, tvTitle, type TvState, type TvStream } from '../shared/tv';
import { EmbedPlayer, loadScript, youtubeDeck, type Deck, type DeckEvents, type EmbedHooks } from './embeds';
import { lineBlocked, quadMatrix, type Box, type Pt } from './tvquad';

/*
 * Streams on the office TV (flrnoh fork, see FORK.md): plays the YouTube video or Twitch stream
 * someone put on at the lounge TV, on the TV itself. Browsers can't draw another site's player into
 * WebGL, so the player is a real iframe laid over the page, bent each frame (a CSS matrix3d, see
 * tvquad.ts) onto where the TV's screen is: shown while you look at the TV from the room, near
 * enough, and nothing solid in between; the TV's own picture says what's on otherwise. In the big
 * player (E at the TV) the same iframe is laid over the window instead, with its controls to use.
 * Keeping it in step and at the right volume is embeds.ts's, as for the DJ's sets.
 */

export const TV_OFF: TvState = { set: null, startedAt: 0, elapsed: 0 };
/** Where the TV's sound comes from, on your floor. */
export const TV_AT = { x: TV.x, y: TV.y, z: TV.z } as const;

/** The iframe's size on the page before it's bent onto the TV (16:9, as the TV is). */
const W = 1280;
const H = 720;
/** Beyond this (m), the TV only shows what's on, and you hear it faintly. */
const SEE_FROM = 26;

interface TwitchPlayer {
  play(): void;
  pause(): void;
  seek(s: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideo?(): string;
  addEventListener(ev: string, fn: () => void): void;
  destroy?(): void;
}
interface TwitchNamespace {
  Player: (new (el: HTMLElement, o: Record<string, unknown>) => TwitchPlayer) & Record<'READY' | 'PLAYING' | 'PAUSE' | 'ENDED' | 'ONLINE' | 'OFFLINE', string>;
}
const tw = window as unknown as { Twitch?: TwitchNamespace };

/** Twitch's player, for a channel (live) or a past broadcast; `parent` is this page's host, as Twitch insists. */
async function twitchDeck(set: TvStream, at: () => number, on: DeckEvents, host: HTMLElement): Promise<Deck> {
  await loadScript('https://player.twitch.tv/js/embed/v1.js', () => !!tw.Twitch?.Player);
  const P = tw.Twitch!.Player;
  const el = document.createElement('div');
  el.style.cssText = 'width:100%;height:100%';
  host.append(el);
  const p = new P(el, {
    width: '100%',
    height: '100%',
    parent: [location.hostname],
    autoplay: true,
    // Muted until the office says how loud it should be where you stand.
    muted: true,
    ...(set.live ? { channel: set.id } : { video: `v${set.id}`, time: hms(Math.floor(at())) }),
  });
  let ready = false;
  p.addEventListener(P.READY, () => {
    ready = true;
    on.ready();
  });
  // A channel that says it's offline gets a few seconds to come on (or to have been wrong) before it counts.
  let offline = 0;
  const online = () => clearTimeout(offline);
  p.addEventListener(P.PLAYING, () => {
    online();
    on.playing();
  });
  p.addEventListener(P.PAUSE, () => on.paused());
  p.addEventListener(P.ENDED, () => on.ended());
  if (set.live) {
    p.addEventListener(P.ONLINE, online);
    p.addEventListener(P.OFFLINE, () => {
      online();
      offline = window.setTimeout(() => on.error(`${set.id} isn't live right now`), 6000);
    });
  }
  return {
    play: () => {
      if (!ready) return;
      p.play();
    },
    pause: () => ready && p.pause(),
    seek: (s) => ready && !set.live && p.seek(s),
    setVolume: (v) => {
      if (!ready) return;
      p.setMuted(v <= 0);
      p.setVolume(v);
    },
    position: async () => (ready && !set.live ? p.getCurrentTime() : undefined),
    duration: () => (ready && !set.live && p.getDuration() > 0 ? p.getDuration() : undefined),
    destroy: () => {
      online();
      try {
        p.destroy?.();
      } catch {
        // already gone
      }
      el.remove();
    },
  };
}

export interface TvView {
  camera: THREE.Camera;
  /** The TV's screen: a plane facing into the room. */
  screen: THREE.Mesh;
  /** What could stand between you and the TV (the floor's walls and furniture). */
  boxes: readonly Box[];
}

export class TvStreams extends EmbedPlayer<TvStream> {
  /** Laid over the page; holds the site's player. */
  private readonly host: HTMLElement;
  private readonly cardCanvas = document.createElement('canvas');
  private readonly cardTex: THREE.CanvasTexture;
  /** The big player's placeholder, while it's open. */
  private big: HTMLElement | null = null;
  private seen = false;
  private blocked = false;
  private frames = 0;
  private cardKey = '';

  constructor(hooks: EmbedHooks, after: HTMLElement) {
    const box = document.createElement('div');
    super(hooks, {
      decks: { youtube: (set, at, on) => youtubeDeck(set.id, at, on, box, true), twitch: (set, at, on) => twitchDeck(set, at, on, box) },
      site: (set) => TV_SITES[set.kind],
      fallbackTitle: tvTitle,
      same: sameTvStream,
      cantPlay: (why) => `📺 Can't play it on the TV here: ${why}`,
      clickToHear: '📺 Click to hear the TV',
    });
    this.host = box;
    box.id = 'tv-stream';
    box.setAttribute('aria-label', 'Office TV');
    box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;pointer-events:none;opacity:0;background:#000;overflow:hidden;contain:strict`;
    after.after(box);
    this.cardCanvas.width = 1280;
    this.cardCanvas.height = 720;
    this.cardTex = new THREE.CanvasTexture(this.cardCanvas);
    this.cardTex.colorSpace = THREE.SRGBColorSpace;
  }

  /** What's on, from the office (or TV_OFF). */
  override set(s: TvState) {
    super.set(s);
    this.drawCard();
  }

  /** Whether the TV has something of its own on (not given up on here). */
  showing(): boolean {
    return !!this.current().set;
  }

  /** The TV's picture while a stream's on: what it is, and how it's going here. */
  card(): THREE.Texture {
    this.drawCard();
    return this.cardTex;
  }

  /** Opens (a placeholder element) or closes (null) the big player. */
  watch(el: HTMLElement | null) {
    this.big = el;
    this.setHands(!!el);
    this.host.style.pointerEvents = el ? 'auto' : 'none';
    this.host.style.zIndex = el ? '51' : '';
    this.host.style.borderRadius = el ? '10px' : '';
  }

  /** Each frame, after the scene's drawn: lays the player over the TV (or the big player), or hides it. */
  frame(view: TvView | null) {
    const phase = this.phase();
    const live = phase === 'playing' || phase === 'loading' || phase === 'blocked' || phase === 'held';
    let matrix: string | null = null;
    if (live && this.big) {
      const r = this.big.getBoundingClientRect();
      if (r.width > 0) matrix = quadMatrix(W, H, [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]]);
    } else if (live && view) matrix = this.onTv(view);
    this.seen = !!matrix;
    if (matrix) this.host.style.transform = matrix;
    this.host.style.opacity = matrix ? '1' : '0';
  }

  /** Whether the player shows on the TV right now (else the TV shows its card). */
  visible(): boolean {
    return this.seen;
  }

  private onTv({ camera, screen, boxes }: TvView): string | null {
    const geo = screen.geometry as THREE.PlaneGeometry;
    const w = geo.parameters.width / 2;
    const h = geo.parameters.height / 2;
    screen.updateWorldMatrix(true, false);
    const m = screen.matrixWorld;
    const center = new THREE.Vector3().setFromMatrixPosition(m);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const toEye = eye.clone().sub(center);
    // From behind the wall, or from too far to make it out.
    if (toEye.dot(normal) < 0.2 || toEye.length() > SEE_FROM) return null;
    const canvas = this.host.previousElementSibling as HTMLElement | null;
    const rect = (canvas ?? document.body).getBoundingClientRect();
    const pts: Pt[] = [];
    for (const [x, y] of [[-w, h], [w, h], [w, -h], [-w, -h]]) {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(m);
      // A corner behind you: too close and turned away to lay it out right.
      if (p.clone().applyMatrix4(camera.matrixWorldInverse).z > -0.15) return null;
      p.project(camera);
      pts.push([rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height]);
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    // Off the side of the view, or so small the TV's own picture will do.
    if (Math.max(...xs) < rect.left || Math.min(...xs) > rect.right || Math.max(...ys) < rect.top || Math.min(...ys) > rect.bottom) return null;
    if (Math.max(...xs) - Math.min(...xs) < 48) return null;
    // Something solid in the way (a wall, the loft), looked at a few times a second.
    if (this.frames++ % 8 === 0) this.blocked = lineBlocked(boxes, eye, center.clone().addScaledVector(normal, 0.4));
    if (this.blocked) return null;
    return quadMatrix(W, H, pts as [Pt, Pt, Pt, Pt]);
  }

  /** The TV's own picture while something's on: its title, who put it on, and how it's going here. */
  private drawCard() {
    const s = this.current();
    const set = s.set;
    const phase = this.phase();
    const status: Record<string, string> = {
      loading: 'starting…',
      playing: 'on now: come and watch',
      blocked: 'click anywhere to start it',
      held: 'paused by you',
      failed: `can't play here${this.problem() ? `: ${this.problem()}` : ''}`,
      ended: 'it has ended',
      away: 'paused while a screen is shared or you are away',
      off: '',
    };
    const key = [set?.url, this.titleNow(), s.by, phase, this.problem()].join('|');
    if (key === this.cardKey) return;
    this.cardKey = key;
    const g = this.cardCanvas.getContext('2d');
    if (!g) return;
    const grad = g.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#1b1d2e');
    grad.addColorStop(1, set?.kind === 'twitch' ? '#4b2a8a' : '#6b1420');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '900 72px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText(set ? `📺 ${set.live ? 'Live' : 'On the TV'}` : '📺 Office TV', 640, 250);
    g.font = '800 52px Nunito, ui-rounded, system-ui, sans-serif';
    const title = this.titleNow();
    const lines = wrap(g, title, 1140).slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, 640, 350 + i * 64));
    g.font = '700 36px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.8)';
    const meta = [set && `from ${TV_SITES[set.kind]}`, s.by && `put on by ${s.by}`].filter(Boolean).join(' · ');
    g.fillText(meta, 640, 350 + lines.length * 64 + 40);
    g.fillText(status[phase] ?? '', 640, 640);
    this.cardTex.needsUpdate = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

import * as THREE from 'three';
import { CAPSULE_COUNTDOWN, SLIDE_BY_ID, SLIDES, rideTime, type SlideBoards, type SlideId } from '../../shared/therme-slides';
import type { ThermeServerMsg } from '../../shared/therme-msgs';
import type { ClientMsg } from '../../shared/protocol';
import { curveKey, type SlideWorld } from '../world/therme/slides';
import type { Person } from '../world/character';
import { toast } from '../ui/dom';

/*
 * Riding the thermal baths' slides (flrnoh fork, see shared/therme-slides.ts, phase 4): E at a slide's
 * gate on its platform and down you go (the Falltür's capsule counts you down first, then its floor
 * drops away). Gravity along the curve, the water's slip and the air's drag set the speed, so the
 * Turbo is fast and the Wellenrutsche gentle; the camera goes with you, in the tube. At the bottom you
 * drop into the landing pool (and the swimming takes over). The office clocks the ride (start and
 * finish are its to time); just before the end a camera by the slide takes your ride photo. Everyone
 * else sees you go from your moves.
 */

const G = 9.81;
const FEET = 0.32;

export interface RiderHost {
  player: { pos: THREE.Vector3; rig: ((dt: number) => void) | null; vy: number; grounded: boolean; facing: number; camYaw: number; lookPitch: number; view: 'first' | 'third'; moving: boolean; stopWalking(): void; seat: unknown };
  send(m: ClientMsg): void;
  sound(k: 'whoosh' | 'splash' | 'beep' | 'go' | 'photo'): void;
  /** For the ride photo: the scene drawn from a camera by the slide, you in it. */
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  me(): Person;
  name(): string;
}

export interface RidePhoto {
  slide: SlideId;
  canvas: HTMLCanvasElement;
  at: number;
}

export class SlideRider {
  /** On the way down (or counting down in the capsule). */
  riding: { slide: SlideId; lane: number; t: number; s: number; v: number; countdown: number; photo: boolean } | null = null;
  boards: SlideBoards = {};
  /** Your last ride's photo, for the kiosk. */
  photo: RidePhoto | null = null;
  /** Your last ride, as the office clocked it. */
  last: { slide: SlideId; ms: number; rank: number; best: number } | null = null;
  /** Called when the boards change (the wall board redraws). */
  onBoards: (() => void) | null = null;
  private beeped = 0;
  private world: SlideWorld | null = null;

  constructor(private host: RiderHost) {}

  bind(world: SlideWorld) {
    this.world = world;
  }

  /** E at a slide's gate: off you go. */
  start(slide: SlideId, lane = 0) {
    const p = this.host.player;
    const def = SLIDE_BY_ID.get(slide);
    const curve = this.world?.curves.get(curveKey(slide, lane));
    if (!def || !curve || this.riding || p.rig || p.seat) return;
    p.stopWalking();
    p.vy = 0;
    this.riding = { slide, lane, t: 0, s: 0, v: def.kind === 'capsule' ? 0 : 1.6, countdown: def.kind === 'capsule' ? CAPSULE_COUNTDOWN / 1000 : 0, photo: false };
    this.beeped = 0;
    const at = curve.getPointAt(0);
    p.pos.set(at.x, at.y - FEET, at.z);
    p.rig = (dt) => this.step(dt);
    if (def.kind !== 'capsule') this.go();
    else this.host.sound('beep');
  }

  private go() {
    const r = this.riding!;
    this.host.send({ t: 'therme.slide', slide: r.slide, phase: 'start', lane: r.lane });
    this.host.sound('whoosh');
  }

  /** Off the slide where you are (you left the baths): it doesn't count. */
  stop() {
    if (!this.riding) return;
    this.riding = null;
    if (this.host.player.rig) this.host.player.rig = null;
  }

  private step(dt: number) {
    const r = this.riding;
    const p = this.host.player;
    if (!r) return;
    const curve = this.world!.curves.get(curveKey(r.slide, r.lane))!;
    const len = curve.getLength();
    p.moving = false;
    if (r.countdown > 0) {
      // In the capsule: three, two, one, and the floor drops.
      r.countdown -= dt;
      const n = Math.ceil(r.countdown);
      if (n !== this.beeped && n > 0) {
        this.beeped = n;
        this.host.sound('beep');
        toast(`🚪 ${n} …`);
      }
      if (r.countdown <= 0) {
        this.host.sound('go');
        this.go();
      } else return;
    }
    r.t += dt;
    const u = Math.min(1, r.s / len);
    const tg = curve.getTangentAt(u);
    // Gravity along the slope, the water's slip, the air.
    const a = -G * tg.y * 0.94 - 0.011 * r.v * r.v - 0.35;
    r.v = Math.max(1.4, Math.min(24, r.v + a * dt));
    r.s += r.v * dt;
    const k = Math.min(1, r.s / len);
    const at = curve.getPointAt(k);
    const ahead = curve.getTangentAt(k);
    p.pos.set(at.x, at.y - FEET, at.z);
    p.facing = Math.atan2(ahead.x, ahead.z);
    if (p.view === 'first') {
      p.camYaw = Math.atan2(-ahead.x, -ahead.z);
      p.lookPitch = Math.max(-1.2, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, ahead.y))) * 0.8));
    }
    if (!r.photo && k > 0.86) {
      r.photo = true;
      this.snap(r.slide, at, ahead);
    }
    if (k >= 1) this.land();
  }

  /** Out of the end, into the water. */
  private land() {
    const r = this.riding!;
    const p = this.host.player;
    this.riding = null;
    p.rig = null;
    p.vy = -1.5;
    p.grounded = false;
    p.lookPitch = 0;
    this.host.sound('splash');
    this.host.send({ t: 'therme.slide', slide: r.slide, phase: 'finish' });
  }

  /** The ride photo: from beside the slide, a little ahead and up, looking back at you. */
  private snap(slide: SlideId, at: THREE.Vector3, ahead: THREE.Vector3) {
    const W = 960;
    const H = 600;
    const side = new THREE.Vector3(ahead.z, 0, -ahead.x).normalize();
    const from = at.clone().addScaledVector(ahead, 3.2).addScaledVector(side, 2.6).add(new THREE.Vector3(0, 1.4, 0));
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 400);
    cam.position.copy(from);
    cam.lookAt(at);
    cam.updateMatrixWorld();
    const me = this.host.me().root;
    const shown = me.visible;
    me.visible = true;
    const { renderer, scene } = this.host;
    const target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
    renderer.setRenderTarget(was);
    target.dispose();
    me.visible = shown;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    const def = SLIDE_BY_ID.get(slide)!;
    g.lineWidth = 14;
    g.strokeStyle = '#16324f';
    g.strokeRect(7, 7, W - 14, H - 14);
    g.fillStyle = 'rgba(22,50,79,0.85)';
    g.fillRect(14, H - 78, W - 28, 64);
    g.font = '900 34px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = '#ffe08a';
    g.textBaseline = 'middle';
    g.fillText(`${def.emoji} ${def.name}`, 32, H - 46);
    g.font = '700 22px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.textAlign = 'right';
    const when = new Date();
    g.fillText(`${this.host.name()} · ${when.toLocaleDateString('de-DE')} ${when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, W - 32, H - 46);
    g.textAlign = 'left';
    this.photo = { slide, canvas, at: Date.now() };
    this.host.sound('photo');
  }

  onMessage(msg: ThermeServerMsg | { t: string }) {
    if (msg.t === 'therme.slides') {
      this.boards = (msg as Extract<ThermeServerMsg, { t: 'therme.slides' }>).boards;
      this.onBoards?.();
    }
    if (msg.t === 'therme.ride') {
      const m = msg as Extract<ThermeServerMsg, { t: 'therme.ride' }>;
      const def = SLIDE_BY_ID.get(m.slide);
      this.last = { slide: m.slide, ms: m.ms, rank: m.rank, best: m.best };
      const place = m.rank ? ` · Platz ${m.rank} auf der Tafel` : m.best < m.ms ? ` · deine Bestzeit ${rideTime(m.best)}` : '';
      toast(`${def?.emoji ?? '🛝'} ${def?.name}: ${rideTime(m.ms)}${place}${m.rank === 1 ? ' 🏆' : ''} · 📸 Foto an der Bestzeiten-Tafel`);
    }
  }

  /** What the hint bar says while you ride. */
  hint(): string {
    const r = this.riding;
    if (!r) return '';
    const def = SLIDE_BY_ID.get(r.slide)!;
    return r.countdown > 0 ? `${def.emoji} ${def.name} · gleich geht's los` : `${def.emoji} ${def.name} · ${(r.t).toFixed(1)} s · ${Math.round(r.v * 3.6)} km/h`;
  }

  /** The wall board: each slide's best three. */
  drawBoard() {
    const b = this.world?.board;
    if (!b) return;
    const g = b.canvas.getContext('2d')!;
    const W = b.canvas.width;
    const H = b.canvas.height;
    g.fillStyle = '#0f2740';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe08a';
    g.font = '900 64px Nunito, ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🏁 BESTZEITEN · RUTSCHENWELT', W / 2, 60);
    const colW = W / 4;
    SLIDES.forEach((s, i) => {
      const cx = (i % 4) * colW + colW / 2;
      const cy = 150 + Math.floor(i / 4) * 280;
      g.fillStyle = '#ffffff';
      g.font = '800 34px Nunito, ui-rounded, system-ui, sans-serif';
      g.fillText(`${s.emoji} ${s.name}`, cx, cy);
      const rows = this.boards[s.id] ?? [];
      g.font = '600 28px Nunito, ui-rounded, system-ui, sans-serif';
      for (let k = 0; k < 3; k++) {
        const row = rows[k];
        g.fillStyle = k === 0 ? '#ffd166' : '#cfe3f2';
        g.fillText(row ? `${k + 1}. ${row.name.slice(0, 14)} ${rideTime(row.ms)}` : `${k + 1}. —`, cx, cy + 50 + k * 44);
      }
    });
    b.texture.needsUpdate = true;
  }

  /** Each frame: the black hole's rings flash. */
  update(t: number) {
    const rings = this.world?.rings ?? [];
    for (const [i, m] of rings.entries()) m.color.setHSL((t * 0.15 + i * 0.07) % 1, 0.9, 0.55 + 0.25 * Math.sin(t * 6 + i));
  }
}

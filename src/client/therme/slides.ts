import * as THREE from 'three';
import { CAPSULE_COUNTDOWN, LANDING, RIDE_POSE, SLIDE_BY_ID, SLIDE_RADIUS, SLIDES, TOWER, rideTime, type SlideBoards, type SlideId } from '../../shared/therme-slides';
import { inT } from '../../shared/therme';
import type { ThermeServerMsg } from '../../shared/therme-msgs';
import type { ClientMsg } from '../../shared/protocol';
import { curveKey, frameAt, type SlideWorld } from '../world/therme/slides';
import { SlidePoser } from './slide-pose';
import type { Person } from '../world/character';
import { toast } from '../ui/dom';

/*
 * Riding the thermal baths' slides (flrnoh fork, see shared/therme-slides.ts, phase 4): E at a slide's
 * gate on its platform and down you go (the Falltür's capsule counts you down first, then its floor
 * drops away). Gravity along the curve, the water's slip and the air's drag set the speed, so the
 * Turbo is fast and the Wellenrutsche gentle. Down a tube you lie in it on your back, feet first, and
 * the camera rides inside with you (your eyes, or just behind you in third person), past the LED rings;
 * on the open ones you sit, ride a tyre or a mat (client/therme/slide-pose.ts). At the bottom you drop
 * into the landing pool (and the swimming takes over). The office clocks the ride (start and finish
 * are its to time); just before the end a camera takes your ride photo: inside the tube, lit up, on
 * the closed ones, from beside the trough on the open ones. Everyone else sees you go from your moves,
 * lying in the same tube (the page finds whom by the nearest point of a track).
 */

const G = 9.81;
/** How far in from the curve (the tube's middle) the floor you ride on is. */
const FLOOR = SLIDE_RADIUS * 0.92;
const V = () => new THREE.Vector3();
const FR = { t: V(), down: V(), side: V() };

export interface RiderHost {
  player: { pos: THREE.Vector3; rig: ((dt: number) => void) | null; vy: number; grounded: boolean; facing: number; camYaw: number; lookPitch: number; view: 'first' | 'third'; moving: boolean; stopWalking(): void; seat: unknown };
  /** The view: down a tube, the ride takes it over (your eyes in the tube). */
  camera: THREE.PerspectiveCamera;
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
  riding: { slide: SlideId; lane: number; t: number; s: number; v: number; countdown: number; photo: boolean; yaw0: number } | null = null;
  /** Who's posed on a slide (you and the others). */
  private poser = new SlidePoser();
  /** Every track's floor, sampled, for finding which one someone else is on. */
  private samples: { key: string; slide: SlideId; lane: number; u: number; at: THREE.Vector3 }[] = [];
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
    if (this.world === world) return;
    this.world = world;
    this.samples = [];
    for (const s of SLIDES)
      for (let l = 0; l < (s.lanes?.length ?? 1); l++) {
        const key = curveKey(s.id, l);
        const curve = world.curves.get(key)!;
        const f = world.frames.get(key)!;
        for (let i = 0; i <= f.n; i++) this.samples.push({ key, slide: s.id, lane: l, u: i / f.n, at: curve.getPointAt(i / f.n).addScaledVector(f.down[i], FLOOR) });
      }
  }

  /** Where on a track's floor `u` of the way along is, and its frame there. */
  private floorAt(key: string, u: number, out = V()): THREE.Vector3 {
    const w = this.world!;
    const k = Math.max(0, Math.min(1, u));
    frameAt(w.frames.get(key)!, k, FR);
    return w.curves.get(key)!.getPointAt(k, out).addScaledVector(FR.down, FLOOR);
  }

  /** E at a slide's gate: off you go. */
  start(slide: SlideId, lane = 0) {
    const p = this.host.player;
    const def = SLIDE_BY_ID.get(slide);
    const curve = this.world?.curves.get(curveKey(slide, lane));
    if (!def || !curve || this.riding || p.rig || p.seat) return;
    p.stopWalking();
    p.vy = 0;
    this.riding = { slide, lane, t: 0, s: 0, v: def.kind === 'capsule' ? 0 : 1.6, countdown: def.kind === 'capsule' ? CAPSULE_COUNTDOWN / 1000 : 0, photo: false, yaw0: p.camYaw };
    this.beeped = 0;
    if (def.kind === 'capsule') {
      // Standing in the capsule till its floor goes.
      const at = curve.getPointAt(0);
      p.pos.set(at.x, at.y - SLIDE_RADIUS, at.z);
    } else p.pos.copy(this.floorAt(curveKey(slide, lane), 0));
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
    this.poser.clear(this.host.me());
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
    const ahead = curve.getTangentAt(k);
    p.pos.copy(this.floorAt(curveKey(r.slide, r.lane), k));
    p.facing = Math.atan2(ahead.x, ahead.z);
    if (!r.photo && k > 0.86) {
      r.photo = true;
      this.snap(r.slide, r.lane, k, len);
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
    p.camYaw = Math.atan2(-Math.sin(p.facing), -Math.cos(p.facing));
    this.poser.clear(this.host.me());
    this.host.sound('splash');
    this.host.send({ t: 'therme.slide', slide: r.slide, phase: 'finish' });
  }

  /** The ride photo: inside a closed tube, from a little ahead looking back at you, the tube lit up for the flash; beside an open one, a little ahead and up. */
  private snap(slide: SlideId, lane: number, k: number, len: number) {
    const W = 960;
    const H = 600;
    const def = SLIDE_BY_ID.get(slide)!;
    const key = curveKey(slide, lane);
    const curve = this.world!.curves.get(key)!;
    const at = curve.getPointAt(k);
    const ahead = curve.getTangentAt(k);
    const cam = new THREE.PerspectiveCamera(def.kind === 'open' ? 50 : 84, W / H, 0.05, 400);
    const tube = this.world!.tubes.get(slide);
    if (def.kind !== 'open') {
      frameAt(this.world!.frames.get(key)!, k, FR);
      // Up under the tube's roof a little ahead of your feet, looking back down along you to your face.
      cam.position.copy(curve.getPointAt(Math.min(1, k + 1.7 / len))).addScaledVector(FR.down, -0.42);
      cam.up.copy(FR.down).negate();
      cam.lookAt(this.floorAt(key, Math.max(0, k - 0.55 / len)).addScaledVector(FR.down, -0.2));
    } else {
      const side = new THREE.Vector3(ahead.z, 0, -ahead.x).normalize();
      cam.position.copy(at).addScaledVector(ahead, 3.2).addScaledVector(side, 2.6).add(new THREE.Vector3(0, 1.4, 0));
      cam.lookAt(at);
    }
    cam.updateMatrixWorld();
    const glow = tube?.emissive.clone();
    if (tube) tube.emissive.set(def.color).multiplyScalar(0.55);
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
    if (tube && glow) tube.emissive.copy(glow);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    // A soft vignette, darker at the corners, like a flash photo in a tube.
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,6,30,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
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

  /** Each frame: the black hole's rings flash; you and everyone else on a slide posed on it; down a tube, your eyes in it. */
  update(t: number, people: readonly { id: string; x: number; y: number; z: number; person: Person | undefined }[], you: string) {
    const rings = this.world?.rings ?? [];
    for (const [i, m] of rings.entries()) m.color.setHSL((t * 0.15 + i * 0.07) % 1, 0.9, 0.55 + 0.25 * Math.sin(t * 6 + i));
    if (!this.world) return;
    const on = new Set<Person>();
    const r = this.riding;
    const me = this.host.me();
    if (r && r.countdown <= 0) {
      const key = curveKey(r.slide, r.lane);
      const len = this.world.curves.get(key)!.getLength();
      const u = Math.min(1, r.s / len);
      this.poser.set(me, r.slide, this.world.frames.get(key)!, this.host.player.pos, u, r.lane);
      on.add(me);
      if (SLIDE_BY_ID.get(r.slide)!.kind !== 'open') this.inTube(key, u, len, RIDE_POSE[r.slide] === 'mat');
    }
    // The others: on a track's floor, out of the tower and over the deck, posed on the nearest bit of it.
    for (const q of people) {
      if (q.id === you || !q.person || q.y < 0.3 || inT(TOWER, q.x, q.z, -0.6) || q.x < LANDING.minX - 4 || q.z > LANDING.maxZ) continue;
      let best: (typeof this.samples)[number] | null = null;
      let bd = 0.8;
      for (const s of this.samples) {
        const d = Math.abs(s.at.x - q.x) + Math.abs(s.at.y - q.y) + Math.abs(s.at.z - q.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) continue;
      this.poser.set(q.person, best.slide, this.world.frames.get(best.key)!, q.person.root.position, best.u, best.lane);
      on.add(q.person);
    }
    this.poser.keep(on);
  }

  /** Down a closed tube the camera's in it: your eyes (lying back, feet first: a little behind your hips) or, in third person, a few metres behind you; the mouse looks round a little. */
  private inTube(key: string, u: number, len: number, headFirst: boolean) {
    const p = this.host.player;
    const cam = this.host.camera;
    const f = this.world!.frames.get(key)!;
    const curve = this.world!.curves.get(key)!;
    frameAt(f, u, FR);
    const up = V().copy(FR.down).negate();
    if (p.view === 'first') {
      const eye = this.floorAt(key, u + (headFirst ? 0.75 : -0.78) / len).addScaledVector(up, 0.34);
      const look = curve.getPointAt(Math.min(1, u + 4 / len)).addScaledVector(up, -0.15);
      cam.position.copy(eye);
      cam.up.copy(up);
      cam.lookAt(look);
      // A little of the mouse: turn your head in the tube.
      const yaw = THREE.MathUtils.clamp(p.camYaw - this.riding!.yaw0, -1, 1);
      cam.rotateY(yaw * 0.6);
      cam.rotateX(THREE.MathUtils.clamp(p.lookPitch, -0.6, 0.6) * 0.6);
    } else {
      // Behind and over your head, as high as the tube lets it, looking down along you to your feet.
      cam.position.copy(curve.getPointAt(Math.max(0, u - 4.3 / len))).addScaledVector(up, 0.47);
      cam.up.copy(up);
      cam.lookAt(this.floorAt(key, u + (headFirst ? -0.4 : 1.1) / len).addScaledVector(up, 0.1));
    }
    cam.updateMatrixWorld();
    cam.up.set(0, 1, 0);
  }
}

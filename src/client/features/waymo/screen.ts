/**
 * flrnoh fork (see FORK.md "Waymo"): the screens in the robotaxi you're riding: what the car sees,
 * as the real ones show it. Seen from above and a little behind, the car in the middle pointing up:
 * the streets round about, its route ahead in blue, and everything its lidar picks up as dots and
 * shapes (the city's cars, the buses, other robotaxis, people on foot), with where it's going, when
 * it gets there and how fast it's going over the top; waiting, "Fahrt starten"; there, "Du bist da".
 */
import * as THREE from 'three';
import { CITY_ROAD } from '../../../shared/city';
import { LANES, next, nodeAt } from '../../../shared/waymo/roads';
import { waymoEta, type WaymoCar, type WaymoPose } from '../../../shared/waymo/fleet';

/** Screen px to a meter. */
const K = 3.4;
const W = 512;
const H = 320;

export interface Seen {
  vehicles: { x: number; z: number; yaw: number; l: number; w: number; kind: 'car' | 'bus' | 'waymo' }[];
  people: { x: number; z: number }[];
}

/** The streets once: every lane's line (crossing to crossing). */
const STREET_LINES = LANES.filter((l) => l.d < 2).map((l) => {
  const a = nodeAt(l.a, l.b)!;
  const b = next(l.a, l.b, l.d)!;
  return [a.x, a.z, b.x, b.z] as const;
});

export class RideScreen {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private last = 0;

  constructor() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    this.g = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Draws it, at most a few times a second (`now`: ms on the page's clock; `t`: s on the office's). */
  draw(now: number, car: WaymoCar, p: WaymoPose, t: number, seen: Seen) {
    if (now - this.last < 110) return;
    this.last = now;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#070b14';
    g.fillRect(0, 0, W, H);
    // The world turned so the car points up, a bit below the middle.
    const cx = W / 2;
    const cy = H * 0.66;
    const fx = Math.cos(p.yaw);
    const fz = -Math.sin(p.yaw);
    const at = (x: number, z: number): [number, number] => {
      const dx = x - p.x;
      const dz = z - p.z;
      // Ahead (along f) is up; to its right (along (-fz, fx)) is right.
      const ahead = dx * fx + dz * fz;
      const right = dx * -fz + dz * fx;
      return [cx + right * K, cy - ahead * K];
    };
    // The streets, as dark asphalt.
    g.lineCap = 'round';
    g.strokeStyle = '#1a2233';
    g.lineWidth = CITY_ROAD * K;
    g.beginPath();
    for (const [ax, az, bx, bz] of STREET_LINES) {
      if (Math.min(Math.hypot(ax - p.x, az - p.z), Math.hypot(bx - p.x, bz - p.z)) > 140) continue;
      const [x1, y1] = at(ax, az);
      const [x2, y2] = at(bx, bz);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
    // The lidar's rings round the car.
    g.strokeStyle = 'rgba(80, 160, 255, 0.12)';
    g.lineWidth = 1;
    for (const r of [10, 20, 35, 55]) {
      g.beginPath();
      g.arc(cx, cy, r * K, 0, Math.PI * 2);
      g.stroke();
    }
    // Its route ahead, in blue.
    const path = p.path;
    if (car.mode === 'riding' || car.mode === 'coming') {
      g.strokeStyle = '#3aa0ff';
      g.lineWidth = 7;
      g.beginPath();
      for (let s = p.s; s <= path.length; s += 2) {
        const i = Math.min(path.xs.length - 1, Math.round(s / 0.5));
        const [x, y] = at(path.xs[i], path.zs[i]);
        if (s === p.s) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      // Where it ends: a pin.
      const [ex, ey] = at(path.xs[path.xs.length - 1], path.zs[path.zs.length - 1]);
      g.fillStyle = '#3aa0ff';
      g.beginPath();
      g.arc(ex, ey, 7, 0, Math.PI * 2);
      g.fill();
    }
    // What it sees: the other vehicles as shapes, the people as dots.
    for (const v of seen.vehicles) {
      if (Math.hypot(v.x - p.x, v.z - p.z) > 70) continue;
      const [x, y] = at(v.x, v.z);
      g.save();
      g.translate(x, y);
      // Its heading on screen: the car's own is up.
      g.rotate(-(v.yaw - p.yaw));
      g.fillStyle = v.kind === 'bus' ? 'rgba(255, 196, 64, 0.85)' : v.kind === 'waymo' ? 'rgba(220, 235, 255, 0.85)' : 'rgba(175, 120, 255, 0.85)';
      g.fillRect((-v.w / 2) * K, (-v.l / 2) * K, v.w * K, v.l * K);
      g.restore();
    }
    g.fillStyle = '#ffb347';
    for (const q of seen.people) {
      if (Math.hypot(q.x - p.x, q.z - p.z) > 60) continue;
      const [x, y] = at(q.x, q.z);
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // The car itself.
    g.fillStyle = '#ffffff';
    g.fillRect(cx - (2 / 2) * K, cy - (4.7 / 2) * K, 2 * K, 4.7 * K);
    g.fillStyle = '#00c4b3';
    g.fillRect(cx - 4, cy - 6, 8, 8);
    // Over the top: where, when, how fast.
    g.fillStyle = 'rgba(7, 11, 20, 0.85)';
    g.fillRect(0, 0, W, 56);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.font = '600 22px system-ui, sans-serif';
    const dest = car.dest?.name ?? '';
    const eta = waymoEta(car);
    const mins = Math.max(0, Math.ceil((eta - t) / 60));
    const clock = new Date(eta * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const head = car.mode === 'riding' ? `Unterwegs nach ${dest}` : car.mode === 'arrived' ? `Du bist da: ${dest}` : car.mode === 'waiting' ? `Nach ${dest}` : 'Waymo';
    g.fillText(head, 16, 22);
    g.font = '16px system-ui, sans-serif';
    g.fillStyle = '#9fb3c8';
    g.fillText(car.mode === 'riding' ? `Ankunft ${clock} · ${mins} min` : car.mode === 'waiting' ? 'Anschnallen, dann Fahrt starten' : car.mode === 'arrived' ? 'Bitte nimm alles mit. Danke!' : '', 16, 44);
    g.textAlign = 'right';
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`${Math.round(p.speed * 3.6)}`, W - 52, 26);
    g.font = '13px system-ui, sans-serif';
    g.fillStyle = '#9fb3c8';
    g.fillText('km/h', W - 14, 28);
    g.textAlign = 'left';
    // Waiting: the button to set off.
    if (car.mode === 'waiting') {
      g.fillStyle = '#00c4b3';
      const bw = 220;
      g.beginPath();
      g.roundRect(W / 2 - bw / 2, H - 70, bw, 48, 24);
      g.fill();
      g.fillStyle = '#04201d';
      g.font = 'bold 20px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Fahrt starten  (E)', W / 2, H - 46);
      g.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }
}

let idle: THREE.CanvasTexture | null = null;
/** What the screens show in a car you're not in: its name on black. */
export function idleScreen(): THREE.CanvasTexture {
  if (idle) return idle;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#070b14';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#e8edf3';
  g.font = '600 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('waymo', 128, 80);
  idle = new THREE.CanvasTexture(c);
  idle.colorSpace = THREE.SRGBColorSpace;
  return idle;
}

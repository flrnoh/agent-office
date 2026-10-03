import * as THREE from 'three';
import { CAR_L, CAR_W } from '../../../shared/waymo/drive';
import { DRIVER_SEAT, WAYMO_SEATS } from '../../../shared/waymo/fleet';
import { mergeByMaterial, toon } from '../toon';

// flrnoh fork (see FORK.md "Waymo"): a Waymo robotaxi, as they drive round San Francisco and Phoenix:
// a white electric SUV (the Jaguar I-Pace's shape) with the spinning lidar dome on its roof, camera
// and radar pods on its corners, a dark glass cabin, "waymo" on its doors. Round the dome's base the
// little displays that light up with your initials when it's yours; inside the seats, the wheel turning
// by itself with nobody behind it, a screen on the dash and one on the back of each front seat. In its
// own frame: nose +x, right +z, the street at 0.

const L = CAR_L;
const W = CAR_W - 0.12;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** The materials all of them share. */
interface Mats {
  white: THREE.Material;
  black: THREE.Material;
  glass: THREE.Material;
  grey: THREE.Material;
  seat: THREE.Material;
  teal: THREE.MeshBasicMaterial;
}
let shared: Mats | null = null;
const mats = (): Mats =>
  (shared ??= {
    white: toon('#f4f5f2'),
    black: toon('#1b1d22'),
    glass: toon('#1e2833', { transparent: true, opacity: 0.42 }),
    grey: toon('#8d939c'),
    seat: toon('#2f3238'),
    teal: new THREE.MeshBasicMaterial({ color: '#00c4b3' }),
  });

let logo: THREE.CanvasTexture | null = null;
/** "waymo" in its grey, for the doors. */
function logoTexture(): THREE.CanvasTexture {
  if (logo) return logo;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5c6470';
  g.font = '600 46px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('waymo', 8, 34);
  logo = new THREE.CanvasTexture(c);
  logo.colorSpace = THREE.SRGBColorSpace;
  return logo;
}

/** The little display round the dome's base: your initials in teal when it's yours, else dark. */
export class DomeSign {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private shown = '';

  constructor() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    this.g = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.show('');
  }

  show(text: string, color = '#00e0c6') {
    const k = `${text}|${color}`;
    if (k === this.shown) return;
    this.shown = k;
    const g = this.g;
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, 128, 48);
    if (text) {
      g.fillStyle = color;
      g.font = 'bold 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 64, 26);
    }
    this.texture.needsUpdate = true;
  }
}

export interface WaymoModel {
  group: THREE.Group;
  /** The lidar's top, which spins; the wheels; the steering wheel. */
  lidar: THREE.Object3D;
  wheels: THREE.Object3D[];
  steering: THREE.Object3D;
  /** The dome's displays, the screens inside (the dash and the backs of the front seats share one). */
  sign: DomeSign;
  screen: THREE.MeshBasicMaterial;
  /** The indicators (left, right), the brake lights and the headlights, to light up. */
  blinkL: THREE.MeshBasicMaterial;
  blinkR: THREE.MeshBasicMaterial;
  brake: THREE.MeshBasicMaterial;
  heads: THREE.MeshBasicMaterial;
}

export function buildWaymo(): WaymoModel {
  const m = mats();
  const group = new THREE.Group();
  group.name = 'waymo';
  const parts = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => parts.add(new THREE.Mesh(geo, mat));
  const hl = L / 2;
  const hw = W / 2;
  // The body: white over black cladding, a short sloping hood, the cabin's glass all round, the roof.
  add(box(L, 0.5, W, 0, 0.62, 0), m.white);
  add(box(L + 0.04, 0.22, W + 0.04, 0, 0.36, 0), m.black);
  // The hood, low enough to see the road over from inside.
  add(box(1.5, 0.1, W - 0.04, hl - 0.8, 0.9, 0), m.white);
  add(box(2.55, 0.7, W - 0.14, -0.35, 1.23, 0), m.glass);
  // Pillars and the roof, a little inside the glass's edges so their faces don't meet.
  for (const x of [0.88, -1.6]) for (const s of [-1, 1]) add(box(0.1, 0.7, 0.06, x, 1.23, s * (hw - 0.09)), m.white);
  add(box(2.4, 0.07, W - 0.18, -0.38, 1.615, 0), m.white);
  add(new THREE.BoxGeometry(0.85, 0.06, W - 0.16).rotateZ(0.72).translate(1.15, 1.25, 0), m.glass);
  // The tail: a short hatch, the light bar right across it.
  add(new THREE.BoxGeometry(0.6, 0.06, W - 0.16).rotateZ(-0.8).translate(-1.78, 1.28, 0), m.glass);
  // The wheel arches, black.
  for (const x of [hl - 0.95, -hl + 0.95]) for (const s of [-1, 1]) add(box(0.95, 0.36, 0.05, x, 0.62, s * (hw + 0.025)), m.black);
  // The doors' lines, and "waymo" on the front doors.
  for (const s of [-1, 1]) for (const x of [0.05, -1.05]) add(box(0.02, 0.48, 0.012, x, 0.66, s * (hw + 0.006)), m.grey);
  for (const s of [-1, 1]) {
    const name = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true }));
    name.position.set(0.55, 0.7, s * (hw + 0.012));
    if (s < 0) name.rotation.y = Math.PI;
    group.add(name);
  }
  // Mirrors, each with its camera pod.
  for (const s of [-1, 1]) {
    add(box(0.16, 0.1, 0.18, 0.85, 1.0, s * (hw + 0.1)), m.white);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).translate(0.85, 1.11, s * (hw + 0.12)), m.black);
  }
  // Sensor pods on the four corners, and the radar on the front bumper.
  for (const x of [hl - 0.2, -hl + 0.2]) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12).translate(x, 0.95, s * (hw - 0.05)), m.black);
  add(box(0.06, 0.12, 0.5, hl + 0.02, 0.5, 0), m.black);
  // The lidar dome on the roof: a white base, its dark spinning top above.
  add(new THREE.CylinderGeometry(0.3, 0.33, 0.14, 24).translate(-0.3, 1.72, 0), m.white);
  const sign = new DomeSign();
  const signMat = new THREE.MeshBasicMaterial({ map: sign.texture });
  for (const k of [0, 1, 2, 3]) {
    const a = (k * Math.PI) / 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.1), signMat);
    p.position.set(-0.3 + Math.cos(a) * 0.335, 1.72, -Math.sin(a) * 0.335);
    p.rotation.y = a + Math.PI / 2;
    group.add(p);
  }
  const lidar = new THREE.Group();
  lidar.position.set(-0.3, 1.86, 0);
  lidar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 20), m.black));
  // A stripe and a lens, so you see it go round.
  lidar.add(new THREE.Mesh(box(0.02, 0.06, 0.2, 0.23, 0, 0), m.teal));
  lidar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20).translate(0, 0.1, 0), m.grey));
  group.add(lidar);
  // Lights: slim LED headlights, indicators at the corners, the light bar at the back.
  const heads = new THREE.MeshBasicMaterial({ color: '#fdf8e6' });
  const brake = new THREE.MeshBasicMaterial({ color: '#7a0b1a' });
  const blinkL = new THREE.MeshBasicMaterial({ color: '#5a3a10' });
  const blinkR = new THREE.MeshBasicMaterial({ color: '#5a3a10' });
  for (const s of [-1, 1]) {
    group.add(new THREE.Mesh(box(0.04, 0.06, 0.42, hl + 0.01, 0.78, s * (hw - 0.3)), heads));
    group.add(new THREE.Mesh(box(0.05, 0.05, 0.14, hl + 0.01, 0.7, s * (hw - 0.08)), s < 0 ? blinkL : blinkR));
    group.add(new THREE.Mesh(box(0.05, 0.05, 0.14, -hl - 0.01, 0.86, s * (hw - 0.08)), s < 0 ? blinkL : blinkR));
  }
  group.add(new THREE.Mesh(box(0.04, 0.05, W - 0.4, -hl - 0.01, 0.92, 0), brake));
  // Inside: the floor, the seats (the driver's too, empty), the dash.
  add(box(L - 1.2, 0.04, W - 0.2, -0.2, 0.42, 0), m.black);
  for (const s of [...WAYMO_SEATS, { ...DRIVER_SEAT, front: true }]) {
    add(box(0.5, 0.12, 0.48, s.x, 0.4, s.z), m.seat);
    add(box(0.12, 0.65, 0.48, s.x - 0.28, 0.78, s.z), m.seat);
  }
  add(box(0.4, 0.22, W - 0.24, 0.95, 0.8, 0), m.black);
  group.add(mergeByMaterial(parts));
  // The wheel, before the empty driver's seat: it turns by itself.
  const steering = new THREE.Group();
  steering.position.set(0.68, 0.92, DRIVER_SEAT.z);
  steering.rotation.z = 0.45;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateY(Math.PI / 2), m.black);
  steering.add(rim);
  steering.add(new THREE.Mesh(box(0.02, 0.03, 0.3, 0, 0, 0), m.black));
  group.add(steering);
  // The screens: on the dash between the front seats, and on the back of each front seat.
  const screen = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), screen);
  dash.position.set(0.74, 1.0, 0);
  dash.rotation.set(0, -Math.PI / 2, 0);
  dash.rotateX(-0.25);
  group.add(dash);
  for (const s of [-1, 1]) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), screen);
    back.position.set(DRIVER_SEAT.x - 0.35, 0.92, s * 0.4);
    back.rotation.y = -Math.PI / 2;
    group.add(back);
  }
  // Four wheels.
  const wheels: THREE.Object3D[] = [];
  for (const x of [hl - 0.95, -hl + 0.95]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(x, 0.36, s * (hw - 0.06));
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 16).rotateX(Math.PI / 2), m.black);
      const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 6).rotateX(Math.PI / 2), m.grey);
      w.add(tyre, rimMesh);
      group.add(w);
      wheels.push(w);
    }
  }
  return { group, lidar, wheels, steering, sign, screen, blinkL, blinkR, brake, heads };
}

import * as THREE from 'three';
import { G } from './kit';

// flrnoh fork (see FORK.md "The petrol station"): the car wash's spray and foam: drops of water and
// colored foam flying from the gantry's nozzles, blobs of foam that settle on the car and get
// scrubbed and rinsed off again, and the drops thrown up round anyone standing in there. Pooled:
// two instanced meshes, in the station's frame.

const DROPS = 900;
const BLOBS = 520;
const GRAVITY = 9.8;
/** The active foam's three colours (the wash's party trick), and plain white suds. */
export const FOAM = ['#ff7eb6', '#ffe066', '#6ecbff', '#ffffff'] as const;

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface Blob {
  /** Where it sits, in the car's own frame (x across, z along, y up off the street). */
  lx: number;
  ly: number;
  lz: number;
  size: number;
  grow: number;
  color: THREE.Color;
  /** 1 sitting there, easing to 0 as it's rinsed off. */
  left: number;
}

export class WashFx {
  readonly group = new THREE.Group();
  private drops: Drop[] = [];
  private blobs: Blob[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly blobMesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly colors = FOAM.map((c) => new THREE.Color(c));
  private readonly water = new THREE.Color('#d9f2ff');
  private readonly air = new THREE.Color('#f4fbff');

  constructor() {
    const dropMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
    dropMat.userData.outlineParameters = { visible: false };
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), dropMat, DROPS);
    this.dropMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DROPS * 3), 3);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    const blobMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: null });
    blobMat.userData.outlineParameters = { visible: false };
    this.blobMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), blobMat, BLOBS);
    this.blobMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BLOBS * 3), 3);
    this.blobMesh.count = 0;
    this.blobMesh.frustumCulled = false;
    this.group.add(this.dropMesh, this.blobMesh);
  }

  private drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, color: THREE.Color, life = 1.6) {
    if (this.drops.length >= DROPS) this.drops.shift();
    this.drops.push({ x, y, z, vx, vy, vz, life, size, color });
  }

  /** Water from a nozzle at (x, y, z) shooting toward (dx, dy, dz): `n` drops this frame. */
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, n: number, kind: 'water' | 'foam' | 'air') {
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * 3;
      const j = () => (Math.random() - 0.5) * 1.2;
      const color = kind === 'water' ? this.water : kind === 'air' ? this.air : this.colors[Math.floor(Math.random() * 3)];
      const size = kind === 'foam' ? 0.05 + Math.random() * 0.06 : kind === 'air' ? 0.015 + Math.random() * 0.02 : 0.02 + Math.random() * 0.025;
      this.drop(x, y, z, (dx + j() * 0.4) * sp, (dy + j() * 0.3) * sp, (dz + j() * 0.4) * sp, size, color, kind === 'air' ? 0.6 : 1.4);
    }
  }

  /** Drops thrown up round someone standing in the spray at (x, y, z): they're getting wet. */
  splash(x: number, y: number, z: number, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = 0.6 + Math.random() * 1.6;
      // Round them, clear of their eyes, so a first-person view still sees past it.
      this.drop(x + Math.cos(a) * 0.5, y + 0.3 + Math.random() * 1.6, z + Math.sin(a) * 0.5, Math.cos(a) * out, 1 + Math.random() * 2.5, Math.sin(a) * out, 0.015 + Math.random() * 0.02, this.water);
    }
  }

  /** Foam lands on the car round `lz` along it (its own frame), `n` blobs; `body` and `roof` are how high it comes up there. */
  foam(lz: number, n: number, half: { w: number; l: number }, top: number) {
    for (let i = 0; i < n && this.blobs.length < BLOBS; i++) {
      const side = Math.random();
      const z = Math.max(-half.l, Math.min(half.l, lz + (Math.random() - 0.5) * 0.9));
      // On top, or down one side.
      const onTop = side < 0.45;
      const lx = onTop ? (Math.random() - 0.5) * half.w * 1.8 : (side < 0.72 ? -1 : 1) * (half.w + 0.02);
      const ly = onTop ? top + 0.02 : 0.3 + Math.random() * (top - 0.4);
      this.blobs.push({ lx, ly, lz: z, size: 0.06 + Math.random() * 0.09, grow: 0, color: this.colors[Math.floor(Math.random() * 4)], left: 1 });
    }
  }

  /** The foam where the rinse passes (round `lz` along the car) starts to run off. */
  rinse(lz: number) {
    for (const b of this.blobs) if (Math.abs(b.lz - lz) < 0.8) b.left = Math.min(b.left, 0.999);
  }

  /** No more foam: a fresh wash, or none going. */
  clearFoam() {
    this.blobs.length = 0;
  }

  get foamCount(): number {
    return this.blobs.length;
  }

  /** Each frame: the drops fly and fall; the foam sits on the car at `car` (its pose), wobbling under the brushes. */
  update(dt: number, t: number, car: { x: number; z: number; rotY: number } | null, scrub: number) {
    let n = 0;
    const live: Drop[] = [];
    for (const d of this.drops) {
      d.vy -= GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.life -= dt;
      if (d.life <= 0 || d.y < G) continue;
      live.push(d);
      this.p.set(d.x, d.y, d.z);
      this.s.setScalar(d.size);
      this.m.compose(this.p, this.q, this.s);
      this.dropMesh.setMatrixAt(n, this.m);
      this.dropMesh.setColorAt(n, d.color);
      n++;
    }
    this.drops = live;
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    if (this.dropMesh.instanceColor) this.dropMesh.instanceColor.needsUpdate = true;

    let k = 0;
    if (car) {
      const sn = Math.sin(car.rotY);
      const cs = Math.cos(car.rotY);
      const kept: Blob[] = [];
      for (const [i, b] of this.blobs.entries()) {
        b.grow = Math.min(1, b.grow + dt * 3);
        if (b.left < 1) b.left -= dt * 1.4;
        if (b.left <= 0) continue;
        kept.push(b);
        const wob = 1 + scrub * 0.25 * Math.sin(t * 22 + i);
        const sag = (1 - b.left) * 0.3;
        this.p.set(car.x + b.lx * cs + b.lz * sn, G + b.ly - sag, car.z - b.lx * sn + b.lz * cs);
        this.s.setScalar(b.size * b.grow * Math.max(0.05, b.left) * wob);
        this.s.y *= 0.55;
        this.m.compose(this.p, this.q, this.s);
        this.blobMesh.setMatrixAt(k, this.m);
        this.blobMesh.setColorAt(k, b.color);
        k++;
      }
      this.blobs = kept;
    }
    this.blobMesh.count = k;
    this.blobMesh.instanceMatrix.needsUpdate = true;
    if (this.blobMesh.instanceColor) this.blobMesh.instanceColor.needsUpdate = true;
  }
}

import * as THREE from 'three';

// The sea's little effects (flrnoh fork, see FORK.md "A day at the beach"): droplets thrown up by a
// splash or a boat's wake, and rings spreading out on the surface round swimmers and splashes. All
// pooled: one instanced mesh for the drops, a handful of rings reused, in world coordinates.

const DROPS = 360;
const RINGS = 48;
const GRAVITY = 9.8;

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  /** Where it falls back into the water (the sea's surface, there). */
  floor: number;
}

interface Ring {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  life: number;
  grow: number;
}

export class SeaFx {
  readonly group = new THREE.Group();
  private drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly rings: Ring[] = [];
  private nextRing = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.85, depthWrite: false });
    mat.userData.outlineParameters = { visible: false };
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat, DROPS);
    this.dropMesh.count = 0;
    this.dropMesh.frustumCulled = false;
    this.group.add(this.dropMesh);
    for (let i = 0; i < RINGS; i++) {
      const rm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      rm.userData.outlineParameters = { visible: false };
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), rm);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 0, life: 1, grow: 1 });
    }
  }

  /** Water thrown up at (x, y, z), `strength` 0..1 (a dip of a toe … a cannonball off the board). */
  splash(x: number, y: number, z: number, strength: number) {
    const n = Math.round(10 + 50 * strength);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.6 + Math.random() * 2.2) * (0.5 + strength);
      this.drop(x + Math.cos(a) * 0.25, y, z + Math.sin(a) * 0.25, Math.cos(a) * out, 2 + Math.random() * 4.5 * (0.4 + strength), Math.sin(a) * out, y, 0.04 + Math.random() * 0.05);
    }
    this.ring(x, y, z, 1.6 + 2.5 * strength, 1.4);
    this.ring(x, y, z, 0.9 + 1.4 * strength, 1);
  }

  /** Spray off a hull at (x, y, z), going (vx, vz), thrown out to the sides. */
  spray(x: number, y: number, z: number, vx: number, vz: number, amount: number) {
    const n = Math.round(amount);
    const speed = Math.hypot(vx, vz) || 1;
    const sx = -vz / speed;
    const sz = vx / speed;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = 1 + Math.random() * 2.5;
      this.drop(x, y + 0.1, z, sx * side * out - vx * 0.15, 1 + Math.random() * 2.2, sz * side * out - vz * 0.15, y, 0.035 + Math.random() * 0.05);
    }
  }

  /** A ring on the water at (x, y, z), spreading out to `size` m over `life` seconds. */
  ring(x: number, y: number, z: number, size: number, life: number) {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % RINGS;
    r.mesh.position.set(x, y + 0.02, z);
    r.age = 0;
    r.life = life;
    r.grow = size;
    r.mesh.visible = true;
  }

  private drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, floor: number, size: number) {
    if (this.drops.length >= DROPS) this.drops.shift();
    this.drops.push({ x, y, z, vx, vy, vz, life: 2, size, floor });
  }

  update(dt: number) {
    let n = 0;
    const live: Drop[] = [];
    for (const d of this.drops) {
      d.vy -= GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.life -= dt;
      if (d.life <= 0 || (d.y < d.floor && d.vy < 0)) continue;
      live.push(d);
      this.p.set(d.x, d.y, d.z);
      this.s.setScalar(d.size);
      this.m.compose(this.p, this.q, this.s);
      this.dropMesh.setMatrixAt(n++, this.m);
    }
    this.drops = live;
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.3 + r.grow * Math.sqrt(k));
      r.mesh.material.opacity = 0.55 * (1 - k);
    }
  }
}

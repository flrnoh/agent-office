import * as THREE from 'three';
import { toon } from '../toon';
import { rand } from './kit';

/*
 * The thermal baths' palms and bamboo (flrnoh fork, see shared/therme-paradies.ts): instanced, so
 * the whole grove is a handful of draw calls however many stand. A palm is a curving trunk of ringed
 * segments, a crown of drooping fronds and a few coconuts; a bamboo clump a bundle of green canes
 * with leafy tufts. Each sways a little (the crowns only: the trunks stand).
 */

const SEGS = 7;
const FRONDS = 9;

/** One frond: a long leaf curving down from the crown, along +x. */
function frondGeometry(): THREE.BufferGeometry {
  const len = 3.2;
  const pts: number[] = [];
  const idx: number[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len;
    const y = Math.sin(t * Math.PI * 0.55) * 0.9 - t * t * 1.6;
    const w = Math.sin(t * Math.PI) * 0.55 + 0.05;
    pts.push(x, y, -w, x, y + 0.05, 0, x, y, w);
    if (i < n) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface Grove {
  group: THREE.Group;
  update(t: number): void;
}

/** Palms at (x, z) with height h, standing on `y` (the planter's top, or the floor). */
export function buildPalms(palms: readonly { x: number; z: number; h: number; y?: number }[], seed = 17): Grove {
  const group = new THREE.Group();
  const r = rand(seed);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 1, 7), toon('#8a6a48'), palms.length * SEGS);
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.24, 0.035, 4, 10), toon('#6e5238'), palms.length * SEGS);
  const fronds = new THREE.InstancedMesh(frondGeometry(), new THREE.MeshToonMaterial({ color: '#3f9a46', side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap }), palms.length * FRONDS);
  const nuts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), toon('#6b4a1e'), palms.length * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const crowns: { x: number; y: number; z: number; lean: number; dir: number; phase: number }[] = [];
  palms.forEach((p, i) => {
    const base = p.y ?? 0;
    const lean = 0.08 + r() * 0.16;
    const dir = r() * Math.PI * 2;
    const seg = p.h / SEGS;
    let x = p.x;
    let z = p.z;
    let y = base;
    for (let k = 0; k < SEGS; k++) {
      // Each segment leans a little more than the last: a gentle curve.
      const a = lean * (k / SEGS) * 1.6;
      const dx = Math.sin(a) * Math.cos(dir) * seg;
      const dz = Math.sin(a) * Math.sin(dir) * seg;
      const dy = Math.cos(a) * seg;
      e.set(Math.sin(dir) * a, 0, -Math.cos(dir) * a);
      q.setFromEuler(e);
      v.set(x + dx / 2, y + dy / 2, z + dz / 2);
      const taper = 1 - (k / SEGS) * 0.35;
      s.set(taper, seg * 1.02, taper);
      trunk.setMatrixAt(i * SEGS + k, m.compose(v, q, s));
      v.set(x + dx, y + dy, z + dz);
      e.set(Math.PI / 2 + Math.sin(dir) * a, 0, -Math.cos(dir) * a);
      q.setFromEuler(e);
      s.set(taper, taper, 1);
      ring.setMatrixAt(i * SEGS + k, m.compose(v, q, s));
      x += dx;
      y += dy;
      z += dz;
    }
    crowns.push({ x, y, z, lean, dir, phase: r() * 6 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + dir;
      nuts.setMatrixAt(i * 3 + k, m.compose(v.set(x + Math.cos(a) * 0.22, y - 0.25, z + Math.sin(a) * 0.22), q.identity(), s.set(1, 1, 1)));
    }
  });
  const sway = (t: number) => {
    crowns.forEach((c, i) => {
      for (let k = 0; k < FRONDS; k++) {
        const a = (k / FRONDS) * Math.PI * 2 + c.dir * 0.3;
        const droop = -0.15 + (k % 3) * 0.12 + Math.sin(t * 0.9 + c.phase + k) * 0.04;
        e.set(0, -a, droop, 'YZX');
        q.setFromEuler(e);
        const sz = 0.85 + ((k * 7) % 5) * 0.06;
        fronds.setMatrixAt(i * FRONDS + k, m.compose(v.set(c.x, c.y, c.z), q, s.set(sz, sz, sz)));
      }
    });
    fronds.instanceMatrix.needsUpdate = true;
  };
  sway(0);
  for (const im of [trunk, ring, fronds, nuts]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    group.add(im);
  }
  let last = -1;
  return {
    group,
    // The crowns sway a few times a second (not every frame: a hundred matrices).
    update: (t) => {
      if (t - last < 0.12) return;
      last = t;
      sway(t);
    },
  };
}

/** Bamboo clumps at (x, z): a dozen canes each, leafy at the top. */
export function buildBamboo(clumps: readonly { x: number; z: number }[], seed = 23): THREE.Group {
  const group = new THREE.Group();
  const r = rand(seed);
  const N = 12;
  const canes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.055, 1, 6), toon('#7fae3c'), clumps.length * N);
  const knots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), toon('#5f8a2a'), clumps.length * N * 4);
  const tufts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), toon('#4f9a3a'), clumps.length * N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  clumps.forEach((c, i) => {
    for (let k = 0; k < N; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * 0.4;
      const h = 3.2 + r() * 1.6;
      const tilt = (r() - 0.5) * 0.12;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      e.set(tilt, 0, tilt * 0.7);
      q.setFromEuler(e);
      canes.setMatrixAt(i * N + k, m.compose(v.set(x, h / 2, z), q, s.set(1, h, 1)));
      for (let j = 0; j < 4; j++) knots.setMatrixAt((i * N + k) * 4 + j, m.compose(v.set(x, (h * (j + 1)) / 5, z), q, s.set(1, 1, 1)));
      const sz = 0.6 + r() * 0.5;
      tufts.setMatrixAt(i * N + k, m.compose(v.set(x + tilt * h * 0.5, h, z + tilt * h * 0.35), q, s.set(sz, sz * 1.4, sz)));
    }
  });
  for (const im of [canes, knots, tufts]) {
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    group.add(im);
  }
  return group;
}

import * as THREE from 'three';
import type { Side } from '../../../shared/layout';
import type { Supports } from '../../../shared/coaster-supports';
import { toonUnique } from '../toon';

// flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER's supports as they're drawn (shared/
// coaster-supports.ts has where they stand): round steel tubes painted the spine's white, the brackets
// off the top storey on a steel plate bolted to the wall, the columns on the street on a round concrete
// footing. Every tube in one merged mesh, so the lot is a draw call or two.

/** Round the tubes are this many sides (thick ones get a few more). */
const SIDES = 10;

interface Buf {
  pos: number[];
  nor: number[];
  idx: number[];
}

/** A round tube from `a` to `b`, `w` across, capped at both ends. */
function tube(out: Buf, a: THREE.Vector3, b: THREE.Vector3, w: number): void {
  const axis = new THREE.Vector3().subVectors(b, a);
  if (axis.lengthSq() < 1e-6) return;
  axis.normalize();
  const side = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, side).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const r = w / 2;
  const n = w > 0.5 ? SIDES + 4 : SIDES;
  const base = out.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const d = new THREE.Vector3().addScaledVector(u, Math.cos(t)).addScaledVector(v, Math.sin(t));
    for (const p of [a, b]) {
      out.pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r);
      out.nor.push(d.x, d.y, d.z);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = base + i * 2;
    const a1 = base + j * 2;
    out.idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1);
  }
  // The caps: a fan round each end's centre.
  for (const [p, nrm] of [
    [a, axis.clone().negate()],
    [b, axis],
  ] as const) {
    const c = out.pos.length / 3;
    out.pos.push(p.x, p.y, p.z);
    out.nor.push(nrm.x, nrm.y, nrm.z);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const d = new THREE.Vector3().addScaledVector(u, Math.cos(t)).addScaledVector(v, Math.sin(t));
      out.pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r);
      out.nor.push(nrm.x, nrm.y, nrm.z);
    }
    for (let i = 0; i < n; i++) {
      const i0 = c + 1 + i;
      const i1 = c + 1 + ((i + 1) % n);
      if (nrm === axis) out.idx.push(c, i0, i1);
      else out.idx.push(c, i1, i0);
    }
  }
}

function mesh(b: Buf, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  geo.setIndex(b.idx);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.raycast = () => {};
  return m;
}

/** Which way out of the building a wall faces. */
const OUT: Record<Side, THREE.Vector3> = {
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  west: new THREE.Vector3(-1, 0, 0),
  east: new THREE.Vector3(1, 0, 0),
};

export interface SupportsView {
  group: THREE.Group;
  dispose(): void;
}

export function buildSupports(s: Supports): SupportsView {
  const group = new THREE.Group();
  group.name = 'coaster-supports';
  const steel: Buf = { pos: [], nor: [], idx: [] };
  const v = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
  for (const c of s.columns) {
    if (c.y1 - c.y0 < 0.05) continue;
    tube(steel, new THREE.Vector3(c.x, c.y0, c.z), new THREE.Vector3(c.x, c.y1, c.z), c.w);
  }
  for (const b of s.struts) tube(steel, v(b.a), v(b.b), b.w);
  for (const b of s.brackets) {
    // Starting a hand's breadth out of the wall (from the plate), a collar where it meets the spine.
    const out = OUT[b.wall];
    tube(steel, v(b.a).addScaledVector(out, 0.06), v(b.b), b.w);
  }
  const mats: THREE.Material[] = [];
  const noOutline = <M extends THREE.Material>(m: M) => {
    m.userData.outlineParameters = { visible: false };
    mats.push(m);
    return m;
  };
  const paint = noOutline(toonUnique('#eef1f5'));
  group.add(mesh(steel, paint));

  // The brackets' wall plates and the collars on the spine, and the columns' footings.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  const plateMat = noOutline(toonUnique('#c7ccd4'));
  const concrete = noOutline(toonUnique('#b9bec7'));
  const plates = new THREE.InstancedMesh(box, plateMat, Math.max(1, s.brackets.length * 2));
  const feet = new THREE.InstancedMesh(disc, concrete, Math.max(1, s.columns.length));
  const mm = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let n = 0;
  for (const b of s.brackets) {
    const out = OUT[b.wall];
    const along = b.wall === 'north' || b.wall === 'south';
    // A plate on the wall…
    q.identity();
    mm.compose(v(b.a).addScaledVector(out, 0.03), q, along ? new THREE.Vector3(0.5, 0.62, 0.06) : new THREE.Vector3(0.06, 0.62, 0.5));
    plates.setMatrixAt(n++, mm);
    // …and a little saddle under the spine.
    mm.compose(v(b.b), q, new THREE.Vector3(0.34, 0.16, 0.34));
    plates.setMatrixAt(n++, mm);
  }
  plates.count = n;
  n = 0;
  for (const c of s.columns) {
    const w = c.w + 0.55;
    mm.compose(new THREE.Vector3(c.x, c.y0 + 0.1, c.z), q.identity(), new THREE.Vector3(w, 0.2, w));
    feet.setMatrixAt(n++, mm);
  }
  feet.count = n;
  for (const m of [plates, feet]) {
    m.raycast = () => {};
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return {
    group,
    dispose() {
      for (const c of group.children) if (c instanceof THREE.Mesh && c.geometry !== box && c.geometry !== disc) c.geometry.dispose();
      box.dispose();
      disc.dispose();
      plates.dispose();
      feet.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

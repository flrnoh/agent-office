import * as THREE from 'three';
import type { Supports } from '../../../shared/coaster-supports';
import { canvasTexture } from '../texture';
import { toon } from '../toon';

// flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER's supports as they're drawn (shared/
// coaster-supports.ts has where they stand): lattice columns and beams, square steel tubes with
// X-bracing, the lattice a see-through texture over plain boxes so a whole forest of them is a couple of
// draw calls; their uvs in metres, so the bracing's the same size up a tall tower as on a short leg.

/** The bracing: a frame with an X in each square, see-through between. */
function latticeTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffff';
    g.lineCap = 'square';
    g.lineWidth = 7;
    g.strokeRect(3.5, 3.5, 57, 57);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(4, 4);
    g.lineTo(60, 60);
    g.moveTo(60, 4);
    g.lineTo(4, 60);
    g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A box from `a` to `b` (its long axis), `w` square, its four sides' uvs in units of `w` along it. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, caps: boolean): { pos: number[]; nor: number[]; uv: number[] } {
  const axis = new THREE.Vector3().subVectors(b, a);
  const len = axis.length();
  axis.normalize();
  const side = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, side).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const h = w / 2;
  const corners = [
    [h, h],
    [-h, h],
    [-h, -h],
    [h, -h],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const reps = Math.max(1, Math.round(len / w));
  const at = (p: THREE.Vector3, i: number) => new THREE.Vector3().copy(p).addScaledVector(u, corners[i][0]).addScaledVector(v, corners[i][1]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const n = new THREE.Vector3().addScaledVector(u, (corners[i][0] + corners[j][0]) / w).addScaledVector(v, (corners[i][1] + corners[j][1]) / w).normalize();
    const p0 = at(a, i);
    const p1 = at(a, j);
    const p2 = at(b, j);
    const p3 = at(b, i);
    for (const [p, uu, vv] of [
      [p0, 0, 0],
      [p1, 1, 0],
      [p2, 1, reps],
      [p0, 0, 0],
      [p2, 1, reps],
      [p3, 0, reps],
    ] as const) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(uu, vv);
    }
  }
  if (caps) {
    for (const [p, n] of [
      [b, axis],
      [a, axis.clone().negate()],
    ] as const) {
      const q = [0, 1, 2, 0, 2, 3].map((i) => at(p, i));
      for (const c of q) {
        pos.push(c.x, c.y, c.z);
        nor.push(n.x, n.y, n.z);
        uv.push(0.5, 0.5);
      }
    }
  }
  return { pos, nor, uv };
}

export interface SupportsView {
  group: THREE.Group;
  dispose(): void;
}

export function buildSupports(s: Supports): SupportsView {
  const group = new THREE.Group();
  group.name = 'coaster-supports';
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const push = (r: { pos: number[]; nor: number[]; uv: number[] }) => {
    pos.push(...r.pos);
    nor.push(...r.nor);
    uv.push(...r.uv);
  };
  for (const c of s.columns) {
    if (c.y1 - c.y0 < 0.05) continue;
    push(beam(new THREE.Vector3(c.x, c.y0, c.z), new THREE.Vector3(c.x, c.y1, c.z), c.w, true));
  }
  for (const b of s.struts) push(beam(new THREE.Vector3(...b.a), new THREE.Vector3(...b.b), b.w, true));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const tex = latticeTexture();
  const gradient = (toon('#ffffff') as THREE.MeshToonMaterial).gradientMap;
  const mat = new THREE.MeshToonMaterial({ color: '#dfe4ea', map: tex, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: gradient });
  mat.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.raycast = () => {};
  group.add(m);
  // Feet: a concrete pad under every column standing on the ground.
  const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.25, 1), toon('#b9bec7'), Math.max(1, s.columns.length));
  const mm = new THREE.Matrix4();
  let n = 0;
  for (const c of s.columns) {
    const w = c.w + 0.5;
    mm.compose(new THREE.Vector3(c.x, c.y0 + 0.12, c.z), new THREE.Quaternion(), new THREE.Vector3(w, 1, w));
    pads.setMatrixAt(n++, mm);
  }
  pads.count = n;
  pads.raycast = () => {};
  group.add(pads);
  return {
    group,
    dispose() {
      geo.dispose();
      tex.dispose();
      mat.dispose();
      pads.geometry.dispose();
      pads.dispose();
    },
  };
}

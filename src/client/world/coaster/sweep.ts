import * as THREE from 'three';
import { DS, poseAt, type CoasterTrack, type TrackPose } from '../../../shared/coaster-track';

// flrnoh fork (see FORK.md "Der Brecher"): geometry swept along DER BRECHER's track, in its own frame
// (across it along B, up along N from the heartline): the rails and the spine as tubes, the catwalk and
// the chain as ribbons, the glass tube through the ground floor. One BufferGeometry each, built once
// per height of building.

/** Where along the track a sweep runs (it may wrap past the end, back round to the start). */
export interface Span {
  from: number;
  to: number;
}

const pose: TrackPose = { x: 0, y: 0, z: 0, t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0] };

/** The distances a sweep's rings go at: `step` apart from `from` to `to`, both ends included. */
function stations(span: Span, step: number): number[] {
  const len = span.to - span.from;
  const k = Math.max(1, Math.round(len / step));
  return Array.from({ length: k + 1 }, (_, i) => span.from + (len * i) / k);
}

/**
 * A round tube `radius` thick, `b` across and `n` up from the heartline, `radial` sides round. `color`
 * (if given) colors each ring by how far along it is (vertex colors).
 */
export function tube(track: CoasterTrack, span: Span, b: number, n: number, radius: number, radial = 8, step = 0.5, color?: (s: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const at = stations(span, step);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  at.forEach((s, i) => {
    poseAt(track, s, pose);
    const cx = pose.x + pose.b[0] * b + pose.n[0] * n;
    const cy = pose.y + pose.b[1] * b + pose.n[1] * n;
    const cz = pose.z + pose.b[2] * b + pose.n[2] * n;
    if (color) color(s, c);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = pose.b[0] * ca + pose.n[0] * sa;
      const ny = pose.b[1] * ca + pose.n[1] * sa;
      const nz = pose.b[2] * ca + pose.n[2] * sa;
      pos.push(cx + nx * radius, cy + ny * radius, cz + nz * radius);
      nor.push(nx, ny, nz);
      if (color) col.push(c.r, c.g, c.b);
    }
    if (i === 0) return;
    const r0 = (i - 1) * (radial + 1);
    const r1 = i * (radial + 1);
    for (let k = 0; k < radial; k++) idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A flat ribbon `width` wide, `b` across and `n` up from the heartline, facing up along N (both ways);
 * its uvs run along it in metres (u across, v along), for a texture to repeat or scroll.
 */
export function ribbon(track: CoasterTrack, span: Span, b: number, n: number, width: number, step = 0.5): THREE.BufferGeometry {
  const at = stations(span, step);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  at.forEach((s, i) => {
    poseAt(track, s, pose);
    for (const side of [-1, 1]) {
      const w = b + (side * width) / 2;
      pos.push(pose.x + pose.b[0] * w + pose.n[0] * n, pose.y + pose.b[1] * w + pose.n[1] * n, pose.z + pose.b[2] * w + pose.n[2] * n);
      nor.push(pose.n[0], pose.n[1], pose.n[2]);
      uv.push((side + 1) / 2, s - span.from);
    }
    if (i === 0) return;
    const a = (i - 1) * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A matrix putting something built along +z (up +y, its left +x) at `s` on the track, `b` across and `n` up. */
export function frameAt(track: CoasterTrack, s: number, b: number, n: number, out: THREE.Matrix4): THREE.Matrix4 {
  poseAt(track, s, pose);
  // Basis: x = N × T (the riders' left), y = N, z = T.
  const t = pose.t;
  const u = pose.n;
  const x = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
  out.set(x[0], u[0], t[0], pose.x + pose.b[0] * b + u[0] * n, x[1], u[1], t[1], pose.y + pose.b[1] * b + u[1] * n, x[2], u[2], t[2], pose.z + pose.b[2] * b + u[2] * n, 0, 0, 0, 1);
  return out;
}

/** Instances of `geo` every `every` metres along the spans (built along +z, up +y), `b` across and `n` up. */
export function along(track: CoasterTrack, spans: Span[], every: number, b: number, n: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
  const at: number[] = [];
  for (const sp of spans) for (let s = sp.from; s < sp.to; s += every) at.push(s);
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, at.length));
  m.count = at.length;
  const mat4 = new THREE.Matrix4();
  at.forEach((s, i) => m.setMatrixAt(i, frameAt(track, s, b, n, mat4)));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/** The whole way round. */
export const all = (track: CoasterTrack): Span => ({ from: 0, to: track.length });
/** Rounded to the track's step. */
export const snap = (s: number) => Math.round(s / DS) * DS;

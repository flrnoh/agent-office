import * as THREE from 'three';
import type { Box3 } from '../../../../shared/coaster-keepout';

// flrnoh fork (see FORK.md "Der Brecher"): an interior's decor and lamps going round what runs under the
// ground floor's ceiling, DER BRECHER's glass tube (shared/coaster-keepout.ts's tubeBoxes). One pass over
// whatever an interior put up, whichever interior it is: something long that runs across the tube (a
// beam, a duct, a light line, a moulding, a strip along the wall) is cut where the tube goes through and
// carries on either side of it; anything else the tube would run into (a hanging plant, a disco ball, a
// lamp, a vent, a leaf of a vine) isn't put up.

const AXES = ['x', 'y', 'z'] as const;
const unit = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/** Whether `b` (a THREE box) and keep-out `k` overlap. */
const meets = (b: THREE.Box3, k: Box3) => b.min.x < k.maxX && b.max.x > k.minX && b.min.y < k.maxY && b.max.y > k.minY && b.min.z < k.maxZ && b.max.z > k.minZ;

/** Takes `container`'s children out of the way of `keep` (boxes in `container`'s frame). Returns how many it cut or took down. */
export function clearOf(container: THREE.Object3D, keep: readonly Box3[]): number {
  if (!keep.length) return 0;
  container.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).applyMatrix4(toLocal);
  let changed = 0;
  for (const child of [...container.children]) {
    const b = boxOf(child);
    if (b.isEmpty()) continue;
    const hits = keep.filter((k) => meets(b, k));
    if (!hits.length) continue;
    changed++;
    const size = b.getSize(new THREE.Vector3());
    // Long and level (along x or z), a single mesh: cut out where the tube goes through.
    const along = (child as THREE.Mesh).isMesh ? ([0, 2] as const).find((a) => size.getComponent(a) > 3 * Math.max(size.getComponent(a === 0 ? 2 : 0), size.y, 0.05)) : undefined;
    if (along === undefined) {
      container.remove(child);
      continue;
    }
    const lo = b.min.getComponent(along);
    const hi = b.max.getComponent(along);
    const key = AXES[along];
    // What the tube takes along it, and what's left either side.
    const blocked = hits.map((k) => [key === 'x' ? k.minX : k.minZ, key === 'x' ? k.maxX : k.maxZ] as [number, number]).sort((p, q) => p[0] - q[0]);
    const free: [number, number][] = [];
    let at = lo;
    for (const [a, z] of blocked) {
      if (a > at) free.push([at, Math.min(a, hi)]);
      at = Math.max(at, z);
    }
    if (at < hi) free.push([at, hi]);
    container.remove(child);
    const mesh = child as THREE.Mesh;
    // Which of its own axes runs along the room's `along`.
    const q = mesh.quaternion;
    const local = [0, 1, 2].find((i) => Math.abs(unit[i].clone().applyQuaternion(q).getComponent(along)) > 0.9) ?? along;
    for (const [a, z] of free) {
      if (z - a < 0.25) continue;
      const piece = mesh.clone();
      const s = piece.scale.getComponent(local) * ((z - a) / (hi - lo));
      piece.scale.setComponent(local, s);
      piece.position.setComponent(along, piece.position.getComponent(along) + ((a + z) / 2 - (lo + hi) / 2));
      container.add(piece);
    }
  }
  return changed;
}

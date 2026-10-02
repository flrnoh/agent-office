import * as THREE from 'three';
import type { Interactable } from '../types';

/** What the crosshair lands on but nobody sees (see aimedAt in input/pointer.ts): the Schallwerk's merged meshes carry nothing themselves. */
const PICK = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
PICK.userData.outlineParameters = { visible: false };

/** An invisible box over `b` from `y0` to `y1`, carrying `it`. */
export function pickBox(group: THREE.Object3D, it: Interactable, b: { minX: number; maxX: number; minZ: number; maxZ: number }, y0: number, y1: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, y1 - y0, b.maxZ - b.minZ), PICK);
  m.position.set((b.minX + b.maxX) / 2, (y0 + y1) / 2, (b.minZ + b.maxZ) / 2);
  m.userData.interact = it;
  group.add(m);
}

const nothing = () => {};
/** Light and air (beams, haze, sparks, confetti): the crosshair goes through them to what's behind. */
export function noPick(...objects: THREE.Object3D[]) {
  for (const o of objects) o.traverse((c) => (c.raycast = nothing));
}

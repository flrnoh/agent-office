// flrnoh fork: out of person.ts (which re-exports it), to make room there for the marks' hook lines.
import type * as THREE from 'three';

/** Fork: the parts of a Person a gym machine poses (world/gym/equipment.ts): forward is +z, the arms hang down -y from their shoulders. */
export interface Bones {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  /** The arm and leg on -x and on +x (the character's right and left). */
  armR: THREE.Object3D;
  armL: THREE.Object3D;
  legR: THREE.Object3D;
  legL: THREE.Object3D;
}

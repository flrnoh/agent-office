import * as THREE from 'three';
import { mesh, toon } from '../../world/toon';

/** Last week's league champion wears this in the bowling centre (flrnoh fork, see FORK.md "Bowling lanes"): a gold crown with red jewels. */
export function crownMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const gold = toon('#f5c542', { emissive: '#4a3200' });
  const jewel = toon('#e0283c', { emissive: '#400008' });
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.115, 0.07, 16, 1, true), gold, 0, 0, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(new THREE.ConeGeometry(0.03, 0.08, 6), gold, Math.sin(a) * 0.11, 0.07, Math.cos(a) * 0.11));
    g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), jewel, Math.sin(a + 0.63) * 0.118, 0.005, Math.cos(a + 0.63) * 0.118, false));
  }
  (g.children[0] as THREE.Mesh).material = gold.clone();
  ((g.children[0] as THREE.Mesh).material as THREE.Material).side = THREE.DoubleSide;
  g.position.y = 0.36;
  g.rotation.z = 0.12;
  return g;
}

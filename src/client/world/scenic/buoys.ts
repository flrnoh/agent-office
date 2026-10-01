import * as THREE from 'three';
import { SWIM_OUT, waterEdge } from '../../../shared/beach';
import { mergeByColor, mesh, toon } from '../toon';
import { G } from './kit';

// The line of buoys off the beach (flrnoh fork, see FORK.md "A day at the beach"): swimmers stay inside
// it (water.ts's fences stand on it), boats go anywhere past the shallows. Red and white floats on a
// rope, every few meters along the beach and the coast north of it.

/** The floats along the swim line, merged and culled a stretch at a time. */
export function buoys(root: THREE.Group, cullable: (o: THREE.Object3D, minX: number, maxX: number, minZ: number, maxZ: number) => void) {
  const red = toon('#ef233c');
  const white = toon('#f8f9fa');
  for (let z0 = -40; z0 < 420; z0 += 60) {
    const g = new THREE.Group();
    for (let z = z0; z < z0 + 60; z += 6) {
      const x = waterEdge(z) - SWIM_OUT;
      const ball = mesh(new THREE.SphereGeometry(0.32, 10, 8), (z / 6) % 2 ? red : white, x, G - 0.12, z, false);
      ball.scale.y = 0.8;
      g.add(ball);
      const next = waterEdge(z + 6) - SWIM_OUT;
      const rope = mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(next - x, 6), 4), toon('#f4a261'), (x + next) / 2, G - 0.14, z + 3, false);
      rope.rotation.order = 'YXZ';
      rope.rotation.set(Math.PI / 2, Math.atan2(next - x, 6), 0);
      g.add(rope);
    }
    const merged = mergeByColor(g);
    root.add(merged);
    const xs = [waterEdge(z0), waterEdge(z0 + 60)].map((x) => x - SWIM_OUT);
    cullable(merged, Math.min(...xs) - 4, Math.max(...xs) + 4, z0 - 2, z0 + 62);
  }
}

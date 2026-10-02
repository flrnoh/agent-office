import * as THREE from 'three';
import { mesh, toon } from '../toon';

// flrnoh fork (see FORK.md "Your look follows your account"): the host's smoking jacket, OWNER_TOP, the
// office's admins' alone. Midnight-blue velvet with black satin shawl lapels and cuffs, closed with one
// gold button over a black shirt worn open at the neck, a silk square in the breast pocket, gold
// cufflinks, black trousers with a satin stripe down the side and patent shoes. Velvet and satin are
// toon materials with a faint glow of their own, so they read as a sheen against the flat cotton
// everyone else wears. Measures as in person-outfit.ts.

const TORSO_R = 0.26;

const velvet = () => toon('#1c2a52', { emissive: '#0a1126' });
const satin = () => toon('#0d0d12', { emissive: '#23232e' });
const gold = () => toon('#d4af37', { emissive: '#5a4510' });
const patent = () => toon('#0a0a0d', { emissive: '#1d1d26' });

export interface SmokingParts {
  torso: THREE.Object3D;
  /** The character's own left arm (on +x) and right arm. */
  left: THREE.Object3D;
  right: THREE.Object3D;
  feet: THREE.Object3D[];
}

export function smokingJacket(p: SmokingParts, shell: (mat: THREE.Material) => void, front: (mat: THREE.Material, w: number, y0: number, y1: number, out?: number) => THREE.Mesh) {
  const add = (g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false) => {
    const m = mesh(geo, mat, x, y, z, shadow);
    g.add(m);
    return m;
  };
  shell(velvet());
  // The jacket's skirt over the hips, flaring a little.
  add(p.torso, new THREE.CylinderGeometry(TORSO_R + 0.016, TORSO_R + 0.034, 0.16, 18, 1, true), velvet(), 0, 0.5, 0, true);
  // The black shirt in the V, no tie, its collar points open over the lapels.
  for (const [y0, y1, w] of [[0.82, 0.96, 0.9], [0.72, 0.82, 0.62], [0.63, 0.72, 0.35]]) front(toon('#121216'), w, y0, y1, 0.017);
  for (const s of [-1, 1]) {
    const c = add(p.torso, new THREE.BoxGeometry(0.1, 0.025, 0.07), toon('#121216'), s * 0.07, 1.05, 0.14);
    c.rotation.set(0.5, 0, s * -0.5);
  }
  // Shawl lapels in satin, from the shoulders down in a V to the one gold button.
  for (const s of [-1, 1]) {
    const lapel = add(p.torso, new THREE.BoxGeometry(0.075, 0.42, 0.014), satin(), s * 0.08, 0.8, TORSO_R + 0.026);
    lapel.rotation.z = s * -0.36;
  }
  add(p.torso, new THREE.SphereGeometry(0.017, 10, 8), gold(), 0, 0.6, TORSO_R + 0.03);
  // A silk square peeking out of the breast pocket, on their left.
  const square = add(p.torso, new THREE.ConeGeometry(0.03, 0.05, 4), toon('#8c1c2e', { emissive: '#2a0710' }), 0.17, 0.74, TORSO_R + 0.012);
  square.rotation.set(0.25, Math.PI / 4, -0.15);
  // Satin cuffs, and a gold cufflink on the outside of each.
  for (const [arm, out] of [
    [p.left, 1],
    [p.right, -1],
  ] as const) {
    add(arm, new THREE.CylinderGeometry(0.094, 0.094, 0.06, 14, 1, true), satin(), 0, -0.3, 0);
    add(arm, new THREE.SphereGeometry(0.014, 8, 6), gold(), out * 0.096, -0.3, 0.02);
  }
  // A satin stripe down the outside of each trouser leg, and patent shoes (the legs' ends are at -0.37).
  p.feet.forEach((leg, i) => {
    const out = i === 0 ? -1 : 1;
    add(leg, new THREE.BoxGeometry(0.012, 0.3, 0.04), satin(), out * 0.102, -0.19, 0);
    add(leg, new THREE.BoxGeometry(0.17, 0.08, 0.27), patent(), 0, -0.37, 0.045, true);
    add(leg, new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), patent(), 0, -0.41, 0.17).scale.set(1, 0.9, 0.7);
  });
}

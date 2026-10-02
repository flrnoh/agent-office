import * as THREE from 'three';
import { HIPS } from '../character/rig';
import { RETRO } from './signs';

/*
 * Rental bowling shoes (flrnoh fork, see FORK.md "The bowling centre"): two-tone, a coloured toe cap
 * and heel over a cream middle, a white sole, laces. On the shelf behind the counter in pairs, and on
 * the feet of everyone who rented a pair (client/bowling/shoes.ts puts them on a person's legs).
 * Forward is +z, the sole on y 0.
 */

/** The two tones of each kind of pair: the toe and heel, and the middle. */
const TONES: readonly [string, string][] = [
  [RETRO.cherry, '#f4ead4'],
  [RETRO.teal, '#f4ead4'],
  ['#2b2d6e', '#e63946'],
];

const geos = {
  sole: new THREE.BoxGeometry(0.13, 0.035, 0.3),
  middle: new THREE.BoxGeometry(0.128, 0.085, 0.13),
  toe: new THREE.SphereGeometry(0.066, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  heel: new THREE.BoxGeometry(0.128, 0.1, 0.08),
  lace: new THREE.BoxGeometry(0.08, 0.012, 0.012),
};
const mats = new Map<string, THREE.MeshToonMaterial>();
const mat = (c: string) => {
  if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c }));
  return mats.get(c)!;
};

/** One shoe of a pair in tones `kind` (0 cherry, 1 teal, 2 navy and red). */
export function shoe(kind: number): THREE.Group {
  const [a, b] = TONES[((kind % TONES.length) + TONES.length) % TONES.length];
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(geos.sole, '#fbfbf6', 0, 0.0175, 0.02);
  add(geos.middle, b, 0, 0.075, 0.0);
  const toe = add(geos.toe, a, 0, 0.035, 0.1);
  toe.scale.set(1, 1.05, 1.4);
  add(geos.heel, a, 0, 0.083, -0.095);
  for (let i = 0; i < 3; i++) add(geos.lace, '#ffffff', 0, 0.122, -0.03 + i * 0.035);
  return g;
}

/** A pair side by side, for the shelf. */
export function shoePair(kind: number): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const one = shoe(kind);
    one.position.x = s * 0.08;
    one.rotation.y = s * 0.06;
    g.add(one);
  }
  return g;
}

/** A shoe as worn: under a leg's pivot (Person.limbs()), its sole on the ground. */
export function wornShoe(kind: number): THREE.Group {
  const g = shoe(kind);
  g.position.set(0, -HIPS, 0.045);
  g.scale.setScalar(1.12);
  g.userData.bowlingShoe = true;
  return g;
}

/** The tones a rented size comes in (so everyone's pair in a size looks the same everywhere). */
export const toneOfSize = (size: number) => size % 3;

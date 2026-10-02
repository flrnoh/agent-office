import * as THREE from 'three';
import { VENUE_ROOM } from '../../../shared/venue';
import { BACK_BAR, BAR_COUNTER, TAPS_Z } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, glow } from '../casino/parts';
import { SW, barBoardTexture, neonWord } from './signs';
import type { Look } from './lighting';
import { pickBox } from './pick';

/*
 * The Schallwerk's bar (flrnoh fork, see FORK.md "The Schallwerk"), down the east wall of the hall in
 * ZONES.bar: a long counter of riveted black steel with a reclaimed-timber top and an amber underglow,
 * three taps, the back bar with shelves of bottles lit from behind under a long mirror, the coolers,
 * BAR in red neon and the drinks on a chalk board over it, cage pendants over the counter. E at the
 * counter orders (client/venue/place.ts).
 */

const R = VENUE_ROOM;

export interface VenueBar {
  update(look: Look, t: number): void;
}

export function buildBar(group: THREE.Group, colliders: Collider[], interactables: Interactable[]): VenueBar {
  const parts = new THREE.Group();
  const C = BAR_COUNTER;
  const BB = BACK_BAR;
  const len = C.maxZ - C.minZ;
  const cz = (C.minZ + C.maxZ) / 2;
  const steel = toon('#1d1d22');
  const rivet = toon('#55585f');
  const timber = toon('#8b5a34');
  const chrome = toon('#c9cdd3');

  // ---- The counter --------------------------------------------------------------------------------
  parts.add(mesh(box(C.maxX - C.minX, C.top - 0.06, len), steel, (C.minX + C.maxX) / 2, (C.top - 0.06) / 2, cz));
  parts.add(mesh(box(C.maxX - C.minX + 0.25, 0.07, len + 0.1), timber, (C.minX + C.maxX) / 2 - 0.08, C.top - 0.03, cz));
  for (let z = C.minZ + 0.25; z < C.maxZ; z += 0.5) for (const y of [0.25, C.top - 0.2]) parts.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), rivet, C.minX - 0.01, y, z, false));
  // A brass foot rail along its front.
  parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8).rotateX(Math.PI / 2), toon('#c9a227'), C.minX - 0.25, 0.22, cz));
  // The amber underglow under the top's overhang.
  const under = glow(null, '#ff9a3d');
  parts.add(mesh(box(0.03, 0.04, len - 0.2), under, C.minX - 0.12, C.top - 0.1, cz, false));
  // The taps on their column, the drip tray; glasses upside down on a towel.
  const tapZ = TAPS_Z;
  parts.add(mesh(box(0.14, 0.42, tapZ[tapZ.length - 1] - tapZ[0] + 0.3), chrome, (C.minX + C.maxX) / 2 + 0.1, C.top + 0.21, (tapZ[0] + tapZ[tapZ.length - 1]) / 2));
  for (const z of tapZ) {
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8).rotateZ(Math.PI / 2), chrome, (C.minX + C.maxX) / 2 - 0.05, C.top + 0.36, z));
    parts.add(mesh(box(0.05, 0.16, 0.06), toon(['#ffb347', '#e9d8a6', '#c4121f'][tapZ.indexOf(z) % 3]), (C.minX + C.maxX) / 2 - 0.12, C.top + 0.48, z));
  }
  parts.add(mesh(box(0.2, 0.02, 1), toon('#2b2b2b'), (C.minX + C.maxX) / 2 - 0.05, C.top + 0.01, (tapZ[0] + tapZ[tapZ.length - 1]) / 2));
  const glassMat = new THREE.MeshToonMaterial({ color: '#dff3ff', transparent: true, opacity: 0.45, depthWrite: false });
  glassMat.userData.outlineParameters = { visible: false };
  const glasses = new THREE.Group();
  for (let i = 0; i < 8; i++) glasses.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.14, 10), glassMat, (C.minX + C.maxX) / 2, C.top + 0.07, 0.6 + i * 0.12, false));
  group.add(mergeByMaterial(glasses));
  parts.add(mesh(box(0.3, 0.01, 1.2), toon('#e9e2d0'), (C.minX + C.maxX) / 2, C.top + 0.005, 1.0));
  // A till at the north end, beer mats, a tip jar.
  parts.add(mesh(box(0.35, 0.22, 0.32), toon('#2c2c2c'), (C.minX + C.maxX) / 2 + 0.05, C.top + 0.11, C.minZ + 0.6));
  parts.add(mesh(box(0.05, 0.18, 0.28), toon('#4ad4ff', { emissive: '#2a9bd4' }), (C.minX + C.maxX) / 2 - 0.12, C.top + 0.3, C.minZ + 0.6, false));
  group.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), glassMat, (C.minX + C.maxX) / 2, C.top + 0.08, C.minZ + 1.2, false));
  colliders.push({ minX: C.minX - 0.2, maxX: C.maxX, minZ: C.minZ, maxZ: C.maxZ, bottom: 0, top: C.top });
  // E anywhere along the front of it: one interactable every couple of metres, so it's never far.
  for (let z = C.minZ; z < C.maxZ - 0.01; z += 2.55) {
    const it: Interactable = { kind: 'venuebar', x: C.minX - 0.3, z: z + 1.27, radius: 1.6 };
    interactables.push(it);
    pickBox(group, it, { minX: C.minX - 0.2, maxX: BB.maxX, minZ: z, maxZ: Math.min(C.maxZ, z + 2.55) }, 0, 2.4);
  }

  // ---- The back bar ---------------------------------------------------------------------------------
  const bx = (BB.minX + BB.maxX) / 2;
  const blen = BB.maxZ - BB.minZ;
  const bcz = (BB.minZ + BB.maxZ) / 2;
  parts.add(mesh(box(BB.maxX - BB.minX, BB.top, blen), steel, bx, BB.top / 2, bcz));
  // Coolers' glass doors under it, lit.
  const cooler = glow(null, '#bfe9ff');
  for (let z = BB.minZ + 0.8; z < BB.maxZ - 0.5; z += 1.3) parts.add(mesh(box(0.02, 0.6, 1.1), cooler, BB.minX - 0.01, 0.45, z, false));
  // The mirror, the shelves, the bottles backlit in amber.
  const mirror = new THREE.MeshToonMaterial({ color: '#2e3644', emissive: new THREE.Color('#1b2230') });
  parts.add(mesh(box(0.03, 1.5, blen - 0.6), mirror, R.maxX - 0.05, BB.top + 1.05, bcz, false));
  const backlight = glow(null, '#ffb35c');
  parts.add(mesh(box(0.02, 1.4, blen - 0.8), backlight, R.maxX - 0.08, BB.top + 1.05, bcz, false));
  for (const y of [BB.top + 0.45, BB.top + 0.95, BB.top + 1.45]) parts.add(mesh(box(0.3, 0.04, blen - 0.6), toon('#3a2a20'), R.maxX - 0.2, y, bcz));
  const bottleColors = ['#2f6b3a', '#7a3b12', '#c9c2a8', '#3a5a8a', '#8a1c2b', '#d9a441', '#1c1c1c'];
  const bottles = new THREE.Group();
  let n = 0;
  for (const y of [BB.top + 0.47, BB.top + 0.97, BB.top + 1.47])
    for (let z = BB.minZ + 0.5; z < BB.maxZ - 0.4; z += 0.16) {
      const c = bottleColors[(n++ * 5) % bottleColors.length];
      const h = 0.26 + ((n * 7) % 5) * 0.025;
      bottles.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 8), toon(c), R.maxX - 0.2, y + h / 2 + 0.02, z, false));
      bottles.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 6), toon(c), R.maxX - 0.2, y + h + 0.06, z, false));
    }
  group.add(mergeByMaterial(bottles));
  colliders.push({ minX: BB.minX, maxX: BB.maxX, minZ: BB.minZ, maxZ: BB.maxZ, bottom: 0, top: 2.6 });

  // ---- BAR in neon, the board, the cage pendants -------------------------------------------------
  const neon = mesh(new THREE.PlaneGeometry(3.2, 1.0), glow(neonWord('BAR', SW.red, 1024, 320), '#ffffff', { transparent: true }), R.maxX - 0.06, 3.7, cz - 3.2, false);
  neon.rotation.y = -Math.PI / 2;
  group.add(neon);
  const board = mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshToonMaterial({ map: barBoardTexture() }), R.maxX - 0.06, 3.55, cz + 1.6, false);
  board.rotation.y = -Math.PI / 2;
  group.add(board);
  const bulbMat = glow(null, '#ffcf8a');
  const cages = new THREE.Group();
  for (let z = C.minZ + 0.8; z < C.maxZ; z += 1.7) {
    const x = (C.minX + C.maxX) / 2 + 0.8;
    cages.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.4, 4), toon('#111'), x, 4.6, z, false));
    cages.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), bulbMat, x, 2.85, z, false));
    for (let k = 0; k < 4; k++) {
      const wire = mesh(new THREE.TorusGeometry(0.14, 0.008, 4, 12), toon('#222'), x, 2.85, z, false);
      wire.rotation.y = (k * Math.PI) / 4;
      cages.add(wire);
    }
  }
  group.add(mergeByMaterial(cages));

  group.add(mergeByMaterial(parts));

  // The bar's own warm light.
  const light = new THREE.PointLight('#ffb36b', 2.6, 13, 1.3);
  light.position.set(21, 3, cz);
  group.add(light);

  return {
    update(look, t) {
      // The bar stays lit through the show, a touch dimmer in a club, a flicker of the strobe.
      light.intensity = (look.mode === 'club' ? 2.0 : 2.6) * (look.scene === 'blackout' ? 0.6 : 1) + look.flash * 1.5;
      under.color.setRGB(1, 0.6, 0.24).multiplyScalar(0.8 + 0.2 * Math.sin(t * 0.7));
    },
  };
}

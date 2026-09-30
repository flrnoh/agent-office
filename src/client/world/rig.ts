import * as THREE from 'three';
import { RIG } from '../../shared/rig';
import { mesh, roundedBox, toon } from './toon';
import type { Collider, Interactable } from './office';

// The racing rig in the lounge (flrnoh fork, see FORK.md): a bucket seat on an aluminium cockpit
// frame, a wheel on its mount, three pedals, and a TV on a stand at the far end, facing the seat.
// ui/rig.ts paints OFFICE GP on its screen and turns the wheel. It faces the meeting room's glass
// (+z), so the lounge watches the race over the driver's shoulder.

export interface RigModel {
  group: THREE.Group;
  collider: Collider;
  interactable: Interactable;
  /** The race goes on this: 16:9, facing the seat (-z). */
  screen: THREE.Mesh;
  /** The wheel, which turns (about its own z) with the steering. */
  wheel: THREE.Object3D;
}

export function buildRig(): RigModel {
  const group = new THREE.Group();
  const frameMat = toon('#adb5bd');
  const dark = toon('#2b2d42');
  const black = toon('#1b1d2e');
  const red = toon('#ef476f');
  const z0 = RIG.minZ + 0.05;
  const z1 = RIG.wheel.z + 0.62;
  const zs = RIG.seatZ;

  // A floor mat under it all, and the frame's two rails along it with cross members.
  group.add(mesh(roundedBox(0.92, 0.03, z1 - z0 + 0.1, 0.08), dark, 0, 0.015, (z0 + z1) / 2, false));
  const tube = (w: number, h: number, d: number, x: number, y: number, z: number) => group.add(mesh(new THREE.BoxGeometry(w, h, d), frameMat, x, y, z));
  for (const sx of [-1, 1]) {
    tube(0.06, 0.06, z1 - z0, sx * 0.36, 0.08, (z0 + z1) / 2);
    // The wheel's uprights.
    tube(0.06, 0.62, 0.06, sx * 0.28, 0.34, RIG.wheel.z + 0.14);
  }
  for (const z of [z0 + 0.03, zs, RIG.wheel.z + 0.14, z1 - 0.03]) tube(0.78, 0.05, 0.05, 0, 0.08, z);
  tube(0.62, 0.05, 0.06, 0, RIG.wheel.y - 0.1, RIG.wheel.z + 0.14);

  // The bucket seat: its base on a rail mount, the back leaning back, bolsters either side, a headrest cut out.
  group.add(mesh(new THREE.BoxGeometry(0.36, 0.14, 0.4), black, 0, 0.17, zs));
  const seat = new THREE.Group();
  seat.position.set(0, 0.3, zs);
  seat.add(mesh(roundedBox(0.54, 0.12, 0.52, 0.1), red, 0, 0, 0.02));
  for (const sx of [-1, 1]) seat.add(mesh(roundedBox(0.09, 0.12, 0.46, 0.04), red, sx * 0.25, 0.08, 0.02));
  const back = new THREE.Group();
  back.position.set(0, 0.02, -0.24);
  back.rotation.x = -0.28;
  back.add(mesh(roundedBox(0.54, 0.78, 0.1, 0.1), red, 0, 0.4, 0));
  for (const sx of [-1, 1]) back.add(mesh(roundedBox(0.09, 0.6, 0.16, 0.04), red, sx * 0.25, 0.3, 0.06));
  // The harness slots and a stripe down the middle.
  for (const sx of [-1, 1]) back.add(mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), black, sx * 0.1, 0.66, 0.055, false));
  back.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.012), toon('#ffd166'), 0, 0.3, 0.056, false));
  seat.add(back);
  group.add(seat);

  // The gear stick by your right hand (the frame's +x side is the driver's left: they face +z).
  group.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), frameMat, -0.4, 0.3, zs + 0.3));
  group.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), black, -0.4, 0.46, zs + 0.3));

  // The wheel on its motor, leaning back toward the driver.
  group.add(mesh(roundedBox(0.2, 0.16, 0.22, 0.04), black, 0, RIG.wheel.y - 0.02, RIG.wheel.z + 0.14));
  const wheel = new THREE.Group();
  wheel.position.set(0, RIG.wheel.y, RIG.wheel.z);
  wheel.rotation.x = -0.35;
  const spin = new THREE.Group();
  spin.add(mesh(new THREE.TorusGeometry(0.16, 0.024, 10, 28), black));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const spoke = mesh(new THREE.BoxGeometry(0.15, 0.03, 0.02), dark, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    spoke.rotation.z = a;
    spin.add(spoke);
  }
  spin.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16).rotateX(Math.PI / 2), red, 0, 0, 0));
  // The mark at the top, so it shows turning.
  spin.add(mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), toon('#ffd166'), 0, 0.16, 0, false));
  wheel.add(spin);
  group.add(wheel);

  // The pedals: clutch, brake and the long gas pedal, on a plate tilted toward the seat.
  const pedals = new THREE.Group();
  pedals.position.set(0, 0.16, RIG.wheel.z + 0.44);
  pedals.rotation.x = 0.5;
  pedals.add(mesh(new THREE.BoxGeometry(0.44, 0.02, 0.26), dark, 0, -0.03, 0));
  for (const [x, h] of [
    [0.13, 0.12],
    [0, 0.12],
    [-0.13, 0.18],
  ] as const)
    pedals.add(mesh(new THREE.BoxGeometry(0.07, 0.015, h), frameMat, x, 0, -0.02));
  group.add(pedals);

  // The TV on its stand, at the far end, facing the seat.
  const S = RIG.screen;
  group.add(mesh(roundedBox(0.7, 0.04, 0.34, 0.06), dark, 0, 0.02, S.z + 0.08));
  group.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, S.y, 10), frameMat, 0, S.y / 2, S.z + 0.12));
  const bezel = mesh(roundedBox(S.width + 0.08, 0.06, S.height + 0.08, 0.04), black, 0, S.y, S.z + 0.05);
  bezel.rotation.x = Math.PI / 2;
  group.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.height), new THREE.MeshBasicMaterial({ color: '#070b14', toneMapped: false }));
  screen.position.set(0, S.y, S.z + 0.015);
  screen.rotation.y = Math.PI;
  group.add(screen);
  // A little light bar under it, in the game's colors.
  ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0'].forEach((c, i) => group.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.01), toon(c, { emissive: c }), -0.3 + i * 0.2, S.y - S.height / 2 - 0.07, S.z + 0.01, false)));

  group.position.set(RIG.x, 0, 0);
  const collider: Collider = { minX: RIG.minX, maxX: RIG.maxX, minZ: RIG.minZ, maxZ: RIG.maxZ, top: RIG.height };
  const interactable: Interactable = { kind: 'rig', x: RIG.x, z: RIG.seatZ, radius: 1.3 };
  group.userData.interact = interactable;
  return { group, collider, interactable, screen, wheel: spin };
}

import * as THREE from 'three';
import { thermeFixtures } from '../../../shared/therme';
import type { Collider, Interactable } from '../types';
import { mergeByColor } from '../toon';
import { buildWayIn } from './gang';
import type { ThermeParts } from './kit';
import { buildShell } from './shell';

/*
 * Inside the thermal baths (flrnoh fork, see FORK.md "The thermal baths"): a place of its own, built
 * the first time anyone goes in (client/therme/place.ts), in the baths' own coordinates (shared/
 * therme.ts, the floor at y 0). Phase 0 is the empty house: the shell under the glass dome, the
 * passage from the gym with its door back, the zones' doors shut, signs where each part is coming.
 * Each phase adds its part here.
 */

export interface ThermeInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way back to the gym (E at the passage's door). */
  exit: Interactable;
  update(t: number, dt: number): void;
}

export function buildThermeInterior(): ThermeInterior {
  const group = new THREE.Group();
  group.name = 'therme';
  const still = new THREE.Group();
  const p: ThermeParts = { group, still, colliders: thermeFixtures().map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom })), interactables: [] };
  buildShell(p);
  const { exit } = buildWayIn(p);
  group.add(mergeByColor(still));
  return { group, colliders: p.colliders, interactables: p.interactables, pickables: [group], exit, update: () => {} };
}

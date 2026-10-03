import * as THREE from 'three';
import { thermeFixtures } from '../../../shared/therme-all';
import type { Collider, Interactable } from '../types';
import { mergeByColor } from '../toon';
import { buildWayIn } from './gang';
import type { ThermeParts } from './kit';
import { buildShell } from './shell';
import { buildParadies } from './paradies';
import { buildGrotto } from './grotto';
import { buildWavePool } from './waves';
import { buildSlides, type SlideWorld } from './slides';
import { buildDorf, type Dorf } from './dorf';
import { buildLagune } from './lagune';
import { buildLobby, type Lobby } from './lobby';
import type { Person } from '../character';

/*
 * Inside the thermal baths (flrnoh fork, see FORK.md "The thermal baths"): a place of its own, built
 * the first time anyone goes in (client/therme/place.ts), in the baths' own coordinates (shared/
 * therme.ts, the floor at y 0): the shell under the glass dome, the passage from the gym with its
 * door back, the zones' doors that are shut for now, signs where each part is coming; the
 * Thermenparadies (paradies.ts, grotto.ts, palms.ts). Each phase adds its part here.
 */

export interface ThermeInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way back to the gym (E at the passage's door). */
  exit: Interactable;
  /** The swim-up bar's counter, and who's behind it. */
  bar: Interactable;
  bartender: Person;
  /** The slides' curves, the board, the black hole's rings (world/therme/slides.ts). */
  slides: SlideWorld;
  /** The Saunadorf: its Saunameister, its board, the steam (world/therme/dorf.ts). */
  dorf: Dorf;
  /** The entrance hall (world/therme/lobby.ts). */
  lobby: Lobby;
  /** Every frame inside; `now` is the office's clock (the waves), `me` where you are (what's far off doesn't bubble). */
  update(t: number, dt: number, now: number, me: THREE.Vector3, cold: number): void;
}

export function buildThermeInterior(): ThermeInterior {
  const group = new THREE.Group();
  group.name = 'therme';
  const still = new THREE.Group();
  const p: ThermeParts = { group, still, colliders: thermeFixtures().map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom })), interactables: [] };
  buildShell(p);
  const { exit } = buildWayIn(p);
  const paradies = buildParadies(p);
  const grotto = buildGrotto(p);
  const waves = buildWavePool(p);
  const slides = buildSlides(p);
  const dorf = buildDorf(p);
  const lagune = buildLagune(p);
  const lobby = buildLobby(p);
  group.add(mergeByColor(still));
  // No toon outline round what's marked so (water, glass, pick boxes, signs): it's the material that says (core/outline.ts).
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.userData.noOutline) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.userData.outlineParameters = { visible: false };
  });
  return {
    group,
    colliders: p.colliders,
    interactables: p.interactables,
    pickables: [group],
    exit,
    bar: paradies.bar,
    bartender: paradies.bartender,
    slides,
    dorf,
    lobby,
    update: (t, dt, now, me, cold) => {
      paradies.update(t, dt, me);
      grotto.update(t, dt, me);
      waves.update(t, dt, now, me);
      slides.update(t, dt);
      dorf.update(t, dt);
      lagune.update(t, dt, cold, me);
    },
  };
}

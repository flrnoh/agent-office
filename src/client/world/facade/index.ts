import * as THREE from 'three';
import { EXIT_DOOR, SLAB, STOREY, STREET_Y, WALL_HEIGHT, type Opening, type Side } from '../../../shared/layout';
import { interiorFor } from '../../../shared/interiors';
import { storeyPlan } from '../../../shared/storey';
import { tubePortals } from '../../../shared/coaster'; // flrnoh fork: DER BRECHER's tube
import type { Fixture } from '../office/fixture';
import type { NightParts } from '../outside';
import { mergeByMaterial } from '../toon';
import { bands, drips, fins, glowOf, muralWall } from './skin';
import { blade, bulbSculpture, cornerLights, paperPlane, pencil, rooftopLetters } from './landmarks';

// flrnoh fork (see FORK.md, "A facade for creatives"): the building from outside, as a studio full of
// creatives would have it. Over the tower's walls (world/tower.ts), for every storey, the one you're
// on included: murals right across the blank north and east walls, rainbow fins between the windows on
// the street side, a band round each storey in its interior's color (shared/interiors.ts) with a light
// under it in that interior's glow at night, so you can tell from the street how each floor is
// furnished, paint dripping off the top, FLOGGE OFFICE in lit letters up on the roof, a neon blade on the
// corner, a light bulb having an idea up on the corner, a paper plane, a giant pencil stuck in the wall
// and lights up the corners going round the rainbow. The roof shows the same (world/city.ts), the
// letters on its parapet. Nothing of it is in anyone's way: no colliders.

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the outside of the building, for the creatives inside (world/facade/). */
    facade: Facade;
  }
}

export interface Facade {
  /** The interior picked for each floor of the building, bottom one first (FloorInfo.interior): the bands follow them, the roof's too. */
  setPicks(picks: readonly (string | null | undefined)[]): void;
}

/** The floors' picks, for every facade there is (the office's, and the one under the roof). */
let picks: readonly (string | null | undefined)[] = [];
const watchers = new Set<() => void>();

export interface BuiltFacade {
  group: THREE.Group;
  /** Over every floor of a building `count` floors tall, seen from floor `index` (`count` is the roof). */
  set(index: number, count: number): void;
}

/**
 * The facade over a building, for the office (seen from a floor) and the roof (seen from up there):
 * it animates itself as it's drawn, so whoever shows it needn't tick it.
 */
export function buildFacade(night: NightParts): BuiltFacade {
  const group = new THREE.Group();
  group.userData.outdoors = true; // no interior recolors it (world/office/interior/)

  const corners = cornerLights(night);
  const sign = blade(night);
  const letters = rooftopLetters(night);
  const idea = bulbSculpture(night);
  const plane = paperPlane();
  const lead = pencil();
  for (const o of [corners.group, sign.group, letters.group, idea.group, plane.group, lead]) group.add(o);
  // Animated as the paper plane's drawn (never culled, so always): whichever page shows this facade moves it.
  const clock = performance.now();
  const anchor = plane.group.getObjectByProperty('isMesh', true);
  if (anchor) {
    anchor.frustumCulled = false;
    anchor.onBeforeRender = () => {
      const t = (performance.now() - clock) / 1000;
      corners.update(t);
      sign.update(t);
      plane.update(t);
    };
  }

  let built: THREE.Object3D | null = null;
  let level = { index: 0, count: 1 };
  let shown = '';

  const build = () => {
    const { index, count } = level;
    const styles = Array.from({ length: count }, (_, k) => interiorFor(k, picks[k]));
    const key = `${index}|${count}|${styles.map((s) => s.id).join(',')}`;
    if (key === shown) return;
    shown = key;
    if (built) {
      group.remove(built);
      built.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const parts = new THREE.Group();
    // The murals keep their uvs: mergeByMaterial drops them, so they're not merged.
    const murals = new THREE.Group();
    for (let k = 0; k < count; k++) {
      const y0 = (k - index) * STOREY;
      const plan = storeyPlan(k);
      const holes = (side: Side): Opening[] => [...plan.windows, ...plan.balconies.map((b) => b.door), ...(k === 0 && side === 'west' ? [EXIT_DOOR] : []), ...tubePortals(k)].filter((o) => o.wall === side);
      muralWall(murals, 'north', y0, holes('north'), k);
      muralWall(murals, 'east', y0, holes('east'), k + 2);
      muralWall(murals, 'west', y0, holes('west'), k + 1);
      fins(parts, y0, holes('south'), plan.balconies, k, night);
      bands(parts, y0, styles[k], glowOf(styles[k], night));
    }
    const top = (count - 1 - index) * STOREY + WALL_HEIGHT;
    drips(parts, top, storeyPlan(count - 1).windows);
    built = new THREE.Group();
    built.add(mergeByMaterial(parts), murals);
    built.traverse((o) => (o.receiveShadow = false));
    group.add(built);

    // The landmarks, where the building is now.
    const street = STREET_Y - index * STOREY;
    const ground = -index * STOREY; // the bottom floor's
    corners.place(street, top + 0.45);
    sign.place(ground, count);
    letters.place(top + SLAB); // up on the roof's deck
    idea.place(top);
    plane.place(ground + Math.min(count - 1, 1) * STOREY);
    lead.position.y = ground;
  };
  watchers.add(build);

  return {
    group,
    set: (index, count) => {
      level = { index, count };
      build();
    },
  };
}

/** Tells every facade how the floors are furnished. */
export function setFacadePicks(p: readonly (string | null | undefined)[]) {
  picks = [...p];
  for (const w of watchers) w();
}

export const facade: Fixture<'facade'> = (site) => {
  const built = buildFacade(site.get('night'));
  site.group.add(built.group);
  return {
    handle: { facade: { setPicks: setFacadePicks } },
    setLevel: (index, count) => built.set(index, count),
  };
};

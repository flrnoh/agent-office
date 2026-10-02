import * as THREE from 'three';
import { EXIT_DOOR, STOREY, STREET_Y, WALL_HEIGHT, type Opening, type Side } from '../../../shared/layout';
import { interiorFor } from '../../../shared/interiors';
import { storeyPlan } from '../../../shared/storey';
import type { Fixture } from '../office/fixture';
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
// and lights up the corners going round the rainbow. Nothing of it is in anyone's way: no colliders.

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the outside of the building, for the creatives inside (world/facade/). */
    facade: Facade;
  }
}

export interface Facade {
  /** The interior picked for each floor of the building, bottom one first (FloorInfo.interior): the bands follow them. */
  setPicks(picks: readonly (string | null | undefined)[]): void;
}

export const facade: Fixture<'facade'> = (site) => {
  const night = site.get('night');
  const group = new THREE.Group();
  group.userData.outdoors = true; // no interior recolors it (world/office/interior/)
  site.group.add(group);

  const corners = cornerLights(night);
  const sign = blade(night);
  const letters = rooftopLetters(night);
  const idea = bulbSculpture(night);
  const plane = paperPlane();
  const lead = pencil();
  for (const o of [corners.group, sign.group, letters.group, idea.group, plane.group, lead]) group.add(o);

  let built: THREE.Object3D | null = null;
  let level = { index: 0, count: 1 };
  let picks: readonly (string | null | undefined)[] = [];
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
      const holes = (side: Side): Opening[] => [...plan.windows, ...plan.balconies.map((b) => b.door), ...(k === 0 && side === 'west' ? [EXIT_DOOR] : [])].filter((o) => o.wall === side);
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
    letters.place(top + 0.45);
    idea.place(top);
    plane.place(ground + Math.min(count - 1, 1) * STOREY);
    lead.position.y = ground;
  };

  return {
    handle: {
      facade: {
        setPicks: (p) => {
          picks = [...p];
          build();
        },
      },
    },
    setLevel: (index, count) => {
      level = { index, count };
      build();
    },
    update: (t) => {
      corners.update(t);
      sign.update(t);
      plane.update(t);
    },
  };
};

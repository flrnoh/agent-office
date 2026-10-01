import * as THREE from 'three';
import type { Balcony } from '../../../shared/balconies';
import { storeyPlan } from '../../../shared/storey';
import type { Collider, Interactable } from '../../world/types';
import type { Built, Site } from '../../world/office/fixture';
import { movable, moveOnto } from '../../world/office/balcony';

// flrnoh fork (see FORK.md, "Each storey its own cut"): golf off whichever balcony a storey has its tee
// on. The tee stands on the furnished balcony (shared/storey.ts), which may be off the south wall
// facing the hole across the street, or round the side of the building: there it's a driving range,
// aimed out from its wall as far either way as the bottom floor's. Built in the bottom floor's
// balcony's frame (features/golf/world.ts) and turned onto each storey's, like the balcony's furniture.
// Where it is on each, and what a ball rattles round out there, is shared/teespot.ts.

export { aimWithin, insideDecks, startAim, teeSpot, wallSide, type TeeSpot } from '../../../shared/teespot';

/** The golf tee, built in the bottom floor's balcony's frame by `build`, turned onto each storey's furnished balcony. */
export function storeyTee<T>(site: Site, build: (group: THREE.Group, colliders: Collider[], interactables: Interactable[]) => T): Built<'tee'> & { built: T } {
  const group = new THREE.Group();
  site.group.add(group);
  const cols: Collider[] = [];
  const its: Interactable[] = [];
  const built = build(group, cols, its);
  const moved = movable(cols, its, site);
  let shown: Balcony | null = null;
  return {
    built,
    setLevel: (index) => {
      const b = storeyPlan(index).balconies[0];
      if (b !== shown) moveOnto((shown = b), group, moved);
    },
  };
}


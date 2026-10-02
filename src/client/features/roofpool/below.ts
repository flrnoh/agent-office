import { SLAB, STOREY, WALL_HEIGHT } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { buildRoofPool } from './world';

// flrnoh fork (see FORK.md "Pool party on the roof"): the pool on the roof as seen from the floors and
// the street (world/tower.ts draws the rest of the roof from down here, roughly), up where the roof is.

export const poolFromBelow: Fixture = (site) => {
  const pool = buildRoofPool(site.get('night'));
  pool.group.userData.outdoors = true; // no interior recolors it (world/office/interior/)
  site.group.add(pool.group);
  return {
    setLevel: (index, count) => {
      pool.group.position.y = (count - 1 - index) * STOREY + WALL_HEIGHT + SLAB;
      pool.group.visible = index < count;
    },
    update: (t) => pool.update(t, 0.5),
  };
};

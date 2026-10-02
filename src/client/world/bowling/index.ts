import { streetBelow } from '../../../shared/layout';
import type { Fixture, StreetSite } from '../office/fixture';
import { buildBowlingExterior } from './exterior';

// flrnoh fork (see FORK.md "The bowling centre"): the bowling centre on its block right next to the
// office, down on the street in the outlook with the city round it, so it's there from every floor's
// street, from the windows and from the roof. Its doors take you inside (client/bowling).

/** Fork: the bowling centre's outside (world/bowling/exterior.ts). */
export const bowlingOut: Fixture<never, StreetSite> = (site) => {
  const out = buildBowlingExterior(site.outlook, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

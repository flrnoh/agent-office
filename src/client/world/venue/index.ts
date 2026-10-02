import { streetBelow } from '../../../shared/layout';
import type { Fixture, StreetSite } from '../office/fixture';
import { buildVenueExterior } from './exterior';

// flrnoh fork (see FORK.md "The Schallwerk"): the concert hall across the street east of the gym,
// down on the street in the outlook with the city round it, so it's there from every floor's street,
// from the windows and from the roof. Its doors take you inside (client/venue).

/** Fork: the Schallwerk's outside (world/venue/exterior.ts). */
export const venueOut: Fixture<never, StreetSite> = (site) => {
  const out = buildVenueExterior(site.outlook, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

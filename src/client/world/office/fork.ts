import { streetBelow } from '../../../shared/layout';
import { buildCasinoExterior } from '../casino/exterior';
import { buildGymExterior } from '../gym/exterior';
import { buildHallExterior } from '../hall/exterior';
import { buildSoccerExterior } from '../soccer/exterior';
import { buildRig, type RigModel } from '../rig';
import type { Fixture, StreetSite } from './fixture';

// flrnoh fork (see FORK.md): the fork's own fixtures on the office floor, kept out of upstream's files
// so syncing stays conflict-free. build.ts only lists them in its floor plan: the casino, the gym, the
// padel hall and the soccer hall down on the street, and the racing rig in the lounge.

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the racing rig next to the arcade cabinet, where OFFICE GP plays (ui/rig.ts). */
    rig: RigModel;
  }
}

/** Fork: the casino across the street (world/casino/). */
export const casinoOut: Fixture<never, StreetSite> = (site) => {
  const out = buildCasinoExterior(site.ground, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

/** Fork: the gym (world/gym/). */
export const gymOut: Fixture<never, StreetSite> = (site) => {
  const out = buildGymExterior(site.ground, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

/** Fork: the padel hall (world/hall/). */
export const hallOut: Fixture<never, StreetSite> = (site) => {
  const out = buildHallExterior(site.ground, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

/** Fork: the soccer hall (world/soccer/). */
export const soccerOut: Fixture<never, StreetSite> = (site) => {
  const out = buildSoccerExterior(site.ground, site.groundColliders, site.interactables, site.get('night'));
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)) };
};

/** Fork: the racing rig, out between the lounge and the meeting room's glass. */
export const rig: Fixture<'rig'> = () => {
  const built = buildRig();
  return { group: built.group, colliders: [built.collider], interactables: [built.interactable], handle: { rig: built } };
};

import * as THREE from 'three';
import { streetBelow } from '../../../shared/layout';
import { PARKED, stationSolids } from '../../../shared/tankstelle';
import { supercar } from '../../features/cars/world';
import type { Fixture, StreetSite } from '../office/fixture';
import { glowTexture } from '../town/kit';
import { buildCanopy, type PumpView } from './canopy';
import { buildExtras } from './extras';
import { buildStationGround } from './ground';
import { G, collider } from './kit';
import { buildShop } from './shop';
import { buildWash, type WashView } from './wash';

// flrnoh fork (see FORK.md "The petrol station"): FLOGGE OIL, the petrol station with its car wash on
// its own block of the city west of the office (shared/tankstelle.ts lays it out). It stands down on
// the street with the city, in the outlook the roof borrows, so it's the same from every floor's
// windows, the street and the roof. What happens there (filling up, the wash's programme, the shop's
// till) is the feature's, features/tankstelle/.

export interface Station {
  /** All of it, in the station's frame (down on the street at STREET_Y, like the town's). */
  group: THREE.Group;
  pumps: PumpView[];
  wash: WashView;
}

/** The station, built into `group`; hands back what moves, for the feature to drive, and the shop's door. */
export function buildStation(site: StreetSite): { station: Station; door: ReturnType<typeof buildShop> } {
  const group = new THREE.Group();
  const night = site.get('night');
  buildStationGround(group);
  const pumps = buildCanopy(group, night, glowTexture());
  buildExtras(group, night);
  const door = buildShop(group, night);
  const wash = buildWash(group, night);
  // Its own cars, parked in front of the shop and at the vacuum.
  for (const p of PARKED) {
    const car = supercar(p.kind, p.color);
    car.root.position.set(p.x, G, p.z);
    car.root.rotation.y = p.rotY;
    group.add(car.root);
  }
  return { station: { group, pumps, wash }, door };
}

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the petrol station and its car wash (world/tankstelle/), down on the street west of the office. */
    tankstelle: Station;
  }
}

/** Fork: the petrol station, in the outlook with the town. */
export const tankstelle: Fixture<'tankstelle', StreetSite> = (site) => {
  const { station, door } = buildStation(site);
  site.outlook.add(station.group);
  site.groundColliders.push(...stationSolids().map((r) => collider(r)));
  // The shop's door slides open for whoever comes up to it, down on the street under whichever floor you're on.
  site.doors.push(door);
  return {
    setLevel: (index) => {
      door.y = streetBelow(index);
    },
    handle: { tankstelle: station },
  };
};

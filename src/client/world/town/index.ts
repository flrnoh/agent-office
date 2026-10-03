import * as THREE from 'three';
import { roofDrop, streetBelow } from '../../../shared/layout';
import { mulberry32 } from '../../../shared/rng';
import type { Fixture, StreetSite } from '../office/fixture';
import type { NightParts } from '../outside';
import type { Collider } from '../types';
import { buildTownBuildings } from './buildings';
import { buildTownGround } from './ground';
import { buildFurniture } from './furniture';
import { buildShops } from './shops';
import { buildShopFronts, type ShopFronts } from './shopfronts'; // fork: the shops from outside
import { LAID_OUT, glowTexture } from './kit';
import { buildTraffic, type Obstacle } from './traffic';
import { buildPassersby, type Passersby } from './people'; // fork: passers-by
import { buildTrafficLights } from './lights'; // fork: traffic lights
import { buildBuses, type Buses } from './bus'; // fork: the city bus
import { buildBusStops, type BusStops } from './busstops'; // fork: the bus stops' signs and boards
import { BUS_L } from '../../../shared/citybus';

export type { Obstacle } from './traffic';

// flrnoh fork (see FORK.md): the city round the office, as shared/city.ts lays it out. It stands down
// on the street round the office, as far out as the haze, and it's the same city from every floor,
// from the street, and from the rooftop bar: the office builds it (see buildTown, and the `town` fixture) as part of what
// you see out of its windows, and lends all of that to the roof while you're up there (see City in world/city.ts).
// Its streets are paved for cars (shared/garage.ts), it has cars of its own driving up and down them,
// street lamps and parks, and blocks of buildings, lower than the roof close by so you look out over
// them, with a skyline of towers further off. At night their windows light up, the lamps come on and
// the cars' lights show. The building is as tall as there are floors, so from the roof the street is
// that far down, and the buildings round about only as tall as leaves the view over them (see rise).
//
// Everything is built from a handful of shared materials (a window texture per paint, repeated a
// window at a time), merged into a few meshes, so the whole city is a few dozen draw calls.


export interface Town {
  /** All of it, down on the street at STREET_Y: the office's ground holds it, or the roof borrows it. */
  group: THREE.Group;
  /** The buildings, the lamp posts and the parks' trees, in the same frame (street at STREET_Y). */
  colliders: Collider[];
  /** The city's cars, kept where they are (see setStreet): the office's colliders take these in too. */
  traffic: Collider[];
  /** The building has `floors` floors: the buildings round about are only as tall as leaves the roof's view. */
  setFloors(floors: number): void;
  /** Where the street is in the frame the traffic's colliders are in (the floor you're on's). */
  setStreet(street: number): void;
  /** The passers-by on the sidewalks (town/people.ts). */
  people: Passersby;
  /** The shops' fronts, signs, shutters and what's out in front (town/shopfronts.ts), kept by features/shopfronts. */
  fronts: ShopFronts;
  /** The city's buses (town/bus.ts), on the office's clock. */
  buses: Buses;
  /** The bus stops' signs and departures boards (town/busstops.ts). */
  busStops: BusStops;
  /**
   * The cars along the streets, stopping for `obstacles` (and the passers-by crossing); the lights: `dark`
   * is how dark it is (0–1); `now`: the office's clock (s), which the traffic lights and the buses keep to.
   */
  update(t: number, dt: number, dark: number, obstacles: Iterable<Obstacle>, now?: number): void;
}

/**
 * The town round the office: the city's streets and sidewalks, its crossings with their zebras, the
 * blocks with their buildings, the parks, the street lamps and the cars, all at street level.
 */
export function buildTown(night: NightParts): Town {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  // The same numbers every time, so everyone sees the same city.
  const r = mulberry32(20260930);
  const glow = glowTexture();
  const lamps = buildTownGround(group, colliders, glow);
  const { raise, beaconMat } = buildTownBuildings(group, colliders, night, glow);
  const shops = buildShops(group, night);
  const fronts = buildShopFronts(group, colliders);
  buildFurniture(group, colliders);
  const cars = buildTraffic(group, r);
  const lights = buildTrafficLights();
  group.add(lights.group);
  const buses = buildBuses(group);
  const busStops = buildBusStops(group);
  const busAt = buses.buses.map((b) => b.pose);
  cars.traffic.push(...buses.buses.map((b) => b.box));
  const people = buildPassersby();
  group.add(people.group);
  const crossing: Obstacle[] = [];
  let riseNow = -1;
  const obstacleList: Obstacle[] = [];
  return {
    group,
    colliders,
    traffic: cars.traffic,
    people,
    buses,
    busStops,
    fronts,
    setFloors(floors) {
      // The buildings only change height up to six floors (see rise).
      const drop = roofDrop(Math.max(1, floors));
      const k = Math.min(1, drop / LAID_OUT);
      if (k === riseNow) return;
      riseNow = k;
      raise(drop);
    },
    setStreet(y) {
      cars.setStreet(y);
      buses.setStreet(y);
    },
    update(t, dt, dark, obstacles, now) {
      obstacleList.length = 0;
      for (const o of obstacles) obstacleList.push(o);
      if (now !== undefined) {
        lights.update(now, dark);
        buses.update(now, dark);
      }
      // The passers-by step aside for the same; the cars stop for those out in the road.
      crossing.length = 0;
      people.update(Math.min(dt, 0.1), obstacleList, crossing);
      obstacleList.push(...crossing);
      // The buses, nose to tail, for the cars to stop behind (or for, crossing their way).
      for (const b of busAt) for (const k of [-0.45, 0, 0.45]) obstacleList.push({ x: b.x + Math.cos(b.yaw) * k * BUS_L, z: b.z - Math.sin(b.yaw) * k * BUS_L });
      cars.move(Math.min(dt, 0.1), obstacleList, now, busAt);
      lamps.visible = dark > 0.02;
      lamps.material.opacity = dark;
      shops.light(dark);
      cars.headMat.color.setScalar(0.75 + 0.25 * dark);
      // The masts' lights blink, a second on and a second off, brighter at night.
      beaconMat.opacity = (Math.sin(t * Math.PI) > 0 ? 1 : 0.08) * (0.35 + 0.65 * dark);
    },
  };
}

declare module '../types' {
  interface OfficeHandles {
    /** Fork: the city round the office (world/town/), down on the street with the rest of what's out there. */
    town: Town;
    /**
     * Fork: puts what you see out of the windows (the street, the city and the country past it) in
     * `holder`, for the roof to look out at while you're up there; null brings it back down here.
     */
    lendOutlook(holder: THREE.Object3D | null): void;
  }
}

/** Fork: the city round the office, in the outlook with the street and the country. */
export const town: Fixture<'town' | 'lendOutlook', StreetSite> = (site) => {
  const built = buildTown(site.get('night'));
  site.outlook.add(built.group);
  site.groundColliders.push(...built.colliders);
  const outlook = site.outlook;
  const ground = site.ground;
  return {
    // The city's cars move, so their boxes follow them (and the street) themselves, like the garage's.
    colliders: built.traffic,
    setLevel: (index, count) => {
      built.setStreet(streetBelow(index));
      built.setFloors(count);
    },
    handle: { town: built, lendOutlook: (holder) => void (holder ?? ground).add(outlook) },
  };
};

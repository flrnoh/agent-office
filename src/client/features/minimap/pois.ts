// flrnoh fork (see FORK.md "The minimap"): what the map names, and where. Pure numbers from shared/,
// so tests/minimap.test.ts can check every place is on the map and the way home goes somewhere real.

import { ENTRANCE as BAUMARKT_DOOR } from '../../../shared/baumarkt';
import { CASINO, CASINO_BOX, CASINO_DOOR } from '../../../shared/casino';
import { CHURCH } from '../../../shared/church';
import { GYM, GYM_BOX, GYM_STREET_BOX, GYM_STREET_DOOR } from '../../../shared/gym';
import { HALL, HALL_BOX, HALL_DOOR } from '../../../shared/hall';
import { BEACH_PARKING, JETTY } from '../../../shared/beach';
import { VOLLEY } from '../../../shared/volley';
import { landmarkBox } from '../../../shared/landmarks';
import { EXIT_STAIRS, FLOOR, GOLF_HOLE } from '../../../shared/layout';
import { FARM, LAKE, LIGHTHOUSE, LOOP, PLACES, TUNNEL } from '../../../shared/scenic';
import { SHOPS, SHOP_KIND_BY_ID, shopPoint } from '../../../shared/shops';
import { SOCCER, SOCCER_BOX } from '../../../shared/soccer';
import { STATION } from '../../../shared/coaster'; // fork: DER BRECHER
import { BOWLING, BOWLING_BOX, BOWLING_DOOR } from '../../../shared/bowling';
import { VENUE, VENUE_BOX, VENUE_DOOR } from '../../../shared/venue';
import { THERME } from '../../../shared/therme';
import { THERME_STREET_BOX, THERME_STREET_DOOR } from '../../../shared/therme-street';

export interface Poi {
  id: string;
  name: string;
  icon: string;
  x: number;
  z: number;
  /** How it shows: a big place (always labelled), a shop (an emoji, labelled close up), or scenery along the loop. */
  kind: 'home' | 'place' | 'shop' | 'scenery';
}

/** The office: the bottom of the steps down from its door, which is where you walk in from the street. */
export const HOME: Poi = {
  id: 'office',
  name: 'Büro',
  icon: '🏢',
  x: (EXIT_STAIRS.minX + EXIT_STAIRS.maxX) / 2,
  z: EXIT_STAIRS.landingZ1 + EXIT_STAIRS.steps * EXIT_STAIRS.run,
  kind: 'home',
};

/** The office building's footprint, drawn in the accent color. */
export const OFFICE_RECT = { minX: FLOOR.minX, maxX: FLOOR.maxX, minZ: FLOOR.minZ, maxZ: FLOOR.maxZ };

const box = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 });

/** Where the loop's `place` starts: a little way into it, on the road. */
function loopAt(place: keyof typeof PLACES, into = 30) {
  const i = LOOP.findIndex((p) => p.place === place);
  const p = LOOP[Math.min(LOOP.length - 1, Math.max(0, i) + Math.round(into / 2))];
  return { x: p.x, z: p.z };
}

const tank = landmarkBox('tankstelle');
const kino = landmarkBox('kino');

/** The big places, by their doors on the street (or their middles, out of town). */
export const PLACES_ON_MAP: readonly Poi[] = [
  { id: CASINO, name: 'Casino', icon: '🎰', x: CASINO_DOOR.x, z: CASINO_BOX.minZ, kind: 'place' },
  { id: 'golf', name: 'Golf', icon: '⛳', x: GOLF_HOLE.x, z: GOLF_HOLE.z, kind: 'place' },
  { id: SOCCER, name: 'Soccerhalle', icon: '⚽', x: (SOCCER_BOX.minX + SOCCER_BOX.maxX) / 2, z: SOCCER_BOX.minZ, kind: 'place' },
  { id: HALL, name: 'Padel-Halle', icon: '🎾', x: HALL_DOOR.x, z: HALL_BOX.minZ, kind: 'place' },
  { id: GYM, name: 'Gym', icon: '🏋️', x: GYM_STREET_DOOR.x, z: GYM_BOX.minZ, kind: 'place' },
  { id: BOWLING, name: 'Bowling', icon: '🎳', x: BOWLING_DOOR.x, z: BOWLING_BOX.maxZ, kind: 'place' },
  { id: VENUE, name: 'Schallwerk', icon: '🎸', x: VENUE_DOOR.x, z: VENUE_BOX.minZ, kind: 'place' },
  { id: THERME, name: 'Thermenwelt', icon: '🌴', x: THERME_STREET_DOOR.x - 1, z: THERME_STREET_DOOR.z, kind: 'place' },
  { id: 'tankstelle', name: 'Tankstelle', icon: '⛽', x: tank.x, z: tank.z, kind: 'place' },
  { id: 'kino', name: 'Kino', icon: '🍿', x: kino.x, z: kino.z, kind: 'place' },
  { id: 'baumarkt', name: 'Baumarkt', icon: '🔨', x: BAUMARKT_DOOR.x, z: BAUMARKT_DOOR.z, kind: 'place' },
  { id: 'coaster', name: 'Der Brecher (Dach)', icon: '🎢', x: STATION.stopX, z: STATION.trackZ, kind: 'place' },
  ...(CHURCH ? [{ id: 'kirche', name: 'Kirche', icon: '⛪', x: CHURCH.x, z: CHURCH.z, kind: 'place' as const }] : []),
  { id: 'beach', name: PLACES.beach.name, icon: PLACES.beach.icon, x: JETTY.x0 + 6, z: JETTY.z, kind: 'scenery' },
  { id: 'lighthouse', name: 'Leuchtturm', icon: '🗼', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, kind: 'scenery' },
  { id: 'volleyball', name: 'Beachvolleyball', icon: '🏐', x: VOLLEY.x, z: VOLLEY.z, kind: 'scenery' },
  { id: 'beachparking', name: 'Strandparkplatz', icon: '🅿️', x: (BEACH_PARKING.minX + BEACH_PARKING.maxX) / 2, z: (BEACH_PARKING.minZ + BEACH_PARKING.maxZ) / 2, kind: 'scenery' },
  { id: 'farm', name: PLACES.farm.name, icon: PLACES.farm.icon, x: FARM.barn.x, z: FARM.barn.z, kind: 'scenery' },
  { id: 'forest', name: PLACES.forest.name, icon: PLACES.forest.icon, ...loopAt('forest', 60), kind: 'scenery' },
  { id: 'lake', name: 'See', icon: '💧', x: LAKE.x, z: LAKE.z, kind: 'scenery' },
  { id: 'tunnel', name: PLACES.tunnel.name, icon: PLACES.tunnel.icon, x: (TUNNEL.x0 + TUNNEL.x1) / 2, z: TUNNEL.z, kind: 'scenery' },
];

/** Every shop in town, by its door. */
export const SHOPS_ON_MAP: readonly Poi[] = SHOPS.map((s) => {
  const k = SHOP_KIND_BY_ID.get(s.kind)!;
  const at = shopPoint(s, s.doorU, 0);
  return { id: `shop:${s.i}`, name: k.name, icon: k.emoji, x: at.x, z: at.z, kind: 'shop' as const };
});

export const ALL_POIS: readonly Poi[] = [HOME, ...PLACES_ON_MAP, ...SHOPS_ON_MAP];

/**
 * Where on the map someone is whose floor is a place of its own (the casino, the gym, the halls): its
 * rooms have their own numbers, so they're shown at its building. Null on a floor or the roof.
 */
export function placeSpot(floor: string | null): { x: number; z: number } | null {
  switch (floor) {
    case CASINO:
      return box(CASINO_BOX);
    case GYM:
      return box(GYM_STREET_BOX);
    case THERME:
      return box(THERME_STREET_BOX);
    case HALL:
      return box(HALL_BOX);
    case SOCCER:
      return box(SOCCER_BOX);
    case BOWLING:
      return box(BOWLING_BOX);
    case VENUE:
      return box(VENUE_BOX);
    default:
      return null;
  }
}

/** Compass words for a heading in radians (0 = north, -z; clockwise). */
export function compassWord(rad: number): string {
  const words = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const k = Math.round(((rad % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 4)) % 8;
  return words[k];
}

/** A distance for people: meters close by, a tenth of a km further out. */
export function distanceWord(m: number): string {
  return m < 1000 ? `${Math.round(m / 5) * 5} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

import { NORTH_BAND_Z, ZONES, type TFixture, type TRect } from './therme.js';

/*
 * The thermal baths on the street (flrnoh fork, see FORK.md "The thermal baths", phase 7): their own
 * house in the town, south of the gym, where the farm's long field ran (it's shorter now), its main
 * entrance on the side street to the west (x 28). From outside: a long hall with a glass dome over its
 * middle, the slide tower at its east end with its tubes looping round outside, palms behind the
 * glass, its name on the roof's edge. E at its doors goes in (to the entrance hall inside, the
 * `lobby` zone of shared/therme.ts, at the box office), and E at the doors in there comes back out.
 * The house outside is a likeness, not the inside's size: the town has room for less.
 */

/** Its lot on the street (the hall and the slide tower beside it), clear of the gym, the Schallwerk, the padel hall and the farm. */
export const THERME_STREET_BOX: TRect = { minX: 36, maxX: 133, minZ: 90, maxZ: 138 };
/** The hall itself, the lot's west part (the tower stands free east of it). */
export const THERME_STREET_HALL: TRect = { minX: THERME_STREET_BOX.minX, maxX: 110, minZ: THERME_STREET_BOX.minZ, maxZ: THERME_STREET_BOX.maxZ };
export const THERME_STREET_HEIGHT = 12;
/** The doors, in its west face toward the side street: their middle along z, how wide and tall. */
export const THERME_STREET_DOOR = { x: THERME_STREET_BOX.minX, z: 112, width: 4, height: 3.2 } as const;
/** Where you land on the sidewalk coming out, facing the street (west, −x). */
export const THERME_STREET_SPOT = { x: THERME_STREET_BOX.minX - 2, z: THERME_STREET_DOOR.z, rotY: -Math.PI / 2 } as const;
/** The dome over its middle, outside (street coordinates): an ellipse on the roof rising `rise` more. */
export const STREET_DOME = { cx: 73, cz: 114, rx: 26, rz: 18, rise: 11 } as const;
/** The slide tower at its east end, and how tall. */
export const STREET_TOWER = { x: 122, z: 112, half: 4.5, h: 26 } as const;

// ---- The entrance hall inside (the baths' own coordinates) -----------------------------------------

const L = ZONES.lobby;
/** Coming in off the street: just inside the entrance hall's street doors, facing in (+z). */
export const LOBBY_ARRIVAL = { x: (L.minX + L.maxX) / 2, y: 0, z: L.minZ + 2.2, rotY: 0 } as const;
/** The doors back out to the street, in the hall's north wall. */
export const LOBBY_DOOR = { x: (L.minX + L.maxX) / 2, z: L.minZ, width: 4 } as const;
/** The box office: a counter along the hall's west side with the cashier behind it. */
export const KASSE: TRect = { minX: L.minX + 0.4, maxX: L.minX + 1.6, minZ: 4, maxZ: 11 };
export const CASHIER = { x: L.minX + 0.9, z: 7.5, rotY: Math.PI / 2 } as const;
/** The turnstiles across the hall, into the baths: four gates between posts. */
export const TURNSTILE_Z = NORTH_BAND_Z - 3;
export const GATES: readonly number[] = [117, 121, 127, 131];
/** The lockers along the east wall. */
export const LOCKERS: TRect = { minX: L.maxX - 1.1, maxX: L.maxX - 0.4, minZ: 2.5, maxZ: 11.5 };
/** The info board: the waves and the Aufgüsse. */
export const INFO_BOARD = { x: L.maxX - 0.42, z: 7, y: 2.6, w: 4, h: 2.4 } as const;

/** The entrance hall's solid things: the counter, the lockers, the turnstiles' posts (the gates between them walked through). */
export function lobbyFixtures(): TFixture[] {
  const f: TFixture[] = [
    { id: 'kasse', ...KASSE, top: 1.1 },
    { id: 'lockers', ...LOCKERS, top: 2.1 },
  ];
  // The turnstiles' barrier across the hall, open at each gate.
  let x = L.minX;
  for (const [i, g] of GATES.entries()) {
    if (g - 0.6 > x) f.push({ id: `turnstile-${i}`, minX: x, maxX: g - 0.6, minZ: TURNSTILE_Z - 0.15, maxZ: TURNSTILE_Z + 0.15, top: 1.05 });
    x = g + 0.6;
  }
  f.push({ id: 'turnstile-end', minX: x, maxX: L.maxX, minZ: TURNSTILE_Z - 0.15, maxZ: TURNSTILE_Z + 0.15, top: 1.05 });
  return f;
}

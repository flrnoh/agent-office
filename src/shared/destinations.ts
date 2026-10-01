import { paved, type Box } from './garage.js';

// flrnoh fork: named places in the drivable world to drive to. None yet: the first one planned is a
// supermarket down the road (Florian's idea). Adding one:
//   1. Give it ground a car can reach: a lot of its own in PAVEMENT (shared/garage.ts), off the
//      street or off the scenic loop (shared/scenic.ts, whose PLACES already name its sights).
//   2. List it here with that lot as its `area`; tests/bulli.test.ts checks it's all paved.
//   3. Draw it (a world/*.ts of its own, hooked into world/scenic.ts or world/outside.ts), and have
//      the drive hint in main.ts (renderDriveHint) say "🛒 at the supermarket" via destinationAt.

export interface Destination {
  id: string;
  name: string;
  icon: string;
  /** Where you've arrived: somewhere to park, all of it paved. */
  area: Box;
}

export const DESTINATIONS: readonly Destination[] = [
  // { id: 'supermarket', name: 'Supermarkt', icon: '🛒', area: { minX: …, maxX: …, minZ: …, maxZ: … } },
];

/** The destination whose area (x, z) is in, if any. */
export function destinationAt(x: number, z: number): Destination | undefined {
  return DESTINATIONS.find((d) => x >= d.area.minX && x <= d.area.maxX && z >= d.area.minZ && z <= d.area.maxZ);
}

/** Whether a destination's whole area is somewhere a car can get to (its corners and middle are paved). */
export function reachable(d: Destination): boolean {
  const { minX, maxX, minZ, maxZ } = d.area;
  return [
    [minX, minZ],
    [minX, maxZ],
    [maxX, minZ],
    [maxX, maxZ],
    [(minX + maxX) / 2, (minZ + maxZ) / 2],
  ].every(([x, z]) => paved(x, z));
}

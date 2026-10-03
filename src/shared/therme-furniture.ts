import type { TFixture, TRect } from './therme.js';

/*
 * What stands about the thermal baths (flrnoh fork, see FORK.md "The thermal baths"): the planting
 * beds (tropical ones under the dome, along its walls, round the wave pool, on the palm island, and
 * outside along the house at the lagoon; a stone kerb, plants over your knees: nobody walks through
 * them), the lifeguards' high chairs, and the beach bar at the lagoon. All solid, clear of every door,
 * path and pool (tests/therme-detail.test.ts). The page builds them (client/world/therme/details.ts).
 */

export const PLANT_BEDS: readonly TRect[] = [
  // Under the dome: along the north wall either side of the passage, behind the whirlpools, on the east deck.
  { minX: 76, maxX: 90, minZ: 15.5, maxZ: 18 },
  { minX: 105, maxX: 112, minZ: 15.5, maxZ: 18 },
  { minX: 55.5, maxX: 57.8, minZ: 32, maxZ: 68 },
  { minX: 131, maxX: 139.4, minZ: 42, maxZ: 62 },
  { minX: 136.5, maxX: 139.4, minZ: 18, maxZ: 30 },
  // Round the wave pool: its west and east decks, the south deck either side of the way out to the lagoon.
  { minX: 55.5, maxX: 58.6, minZ: 106, maxZ: 123 },
  { minX: 135.8, maxX: 139.4, minZ: 84, maxZ: 123 },
  { minX: 60, maxX: 84, minZ: 134, maxZ: 139.5 },
  { minX: 111, maxX: 135, minZ: 134, maxZ: 139.5 },
  // The palm island, behind its two loungers.
  { minX: 89.8, maxX: 105.2, minZ: 46.8, maxZ: 55.6 },
  // Outside, along the house's glass front and the slide hall.
  { minX: 31, maxX: 84, minZ: 140.6, maxZ: 142.2 },
  { minX: 111, maxX: 189, minZ: 140.6, maxZ: 142.2 },
];
export const BED_TOP = 0.6;

/** The lifeguards' high chairs: by the wave pool and on the thermal pool's east deck, facing the water. */
export const LIFEGUARDS: readonly { x: number; z: number; rotY: number }[] = [
  { x: 58, z: 92, rotY: Math.PI / 2 },
  { x: 129.3, z: 50, rotY: -Math.PI / 2 },
];
/** How high a lifeguard sits. */
export const LIFEGUARD_SEAT = 1.9;

/** The beach bar at the lagoon, between the lagoon and the lazy river: a hut, its counter on the west side facing the water (E there orders, like the swim-up bar). */
export const STRANDBAR = { box: { minX: 101.5, maxX: 107.5, minZ: 159, maxZ: 166 } as TRect, counter: { minX: 100.4, maxX: 101.5, minZ: 159.6, maxZ: 165.4 } as TRect, top: 1.1, roof: 3.4 } as const;
/** Where the beach bar's barkeeper stands, behind the counter facing out. */
export const STRANDBAR_KEEPER = { x: 102.4, z: 162.5, rotY: -Math.PI / 2 } as const;

export function furnitureFixtures(): TFixture[] {
  const f: TFixture[] = PLANT_BEDS.map((r, i) => ({ id: `bed-${i}`, ...r, top: BED_TOP }));
  for (const [i, l] of LIFEGUARDS.entries()) f.push({ id: `lifeguard-${i}`, minX: l.x - 0.5, maxX: l.x + 0.5, minZ: l.z - 0.5, maxZ: l.z + 0.5, top: LIFEGUARD_SEAT + 0.3 });
  const S = STRANDBAR;
  // The hut's walls (the barkeeper's inside, the way in at the back), the counter in front of it.
  f.push({ id: 'strandbar-n', minX: S.box.minX, maxX: S.box.maxX, minZ: S.box.minZ, maxZ: S.box.minZ + 0.2, top: S.roof });
  f.push({ id: 'strandbar-s', minX: S.box.minX, maxX: S.box.maxX, minZ: S.box.maxZ - 0.2, maxZ: S.box.maxZ, top: S.roof });
  f.push({ id: 'strandbar-e', minX: S.box.maxX - 0.2, maxX: S.box.maxX, minZ: S.box.minZ, maxZ: S.box.maxZ, top: S.roof });
  f.push({ id: 'strandbar-counter', ...S.counter, top: S.top });
  f.push({ id: 'strandbar-roof', minX: S.box.minX - 1.4, maxX: S.box.maxX + 0.6, minZ: S.box.minZ - 0.6, maxZ: S.box.maxZ + 0.6, bottom: S.roof, top: S.roof + 0.25 });
  return f;
}

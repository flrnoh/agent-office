import { inPoolAt, type PoolDef } from './swim.js';
import { thermeFixtures as houseFixtures, thermeWhereabouts as zoneWords, type TFixture } from './therme.js';
import { BAR_COUNTER, GROTTO, ISLAND, PARADIES_POOLS, THERMAL_POOL, paradiesFixtures, paradiesWater } from './therme-paradies.js';

/*
 * The thermal baths put together (flrnoh fork, see FORK.md "The thermal baths"): the house (shared/
 * therme.ts) with every part built so far, each in its own plan file. What the page builds and walks
 * in, and what the tests walk: add a part's water, fixtures and pools here.
 */

/** Every wet rectangle in the baths: where the floor is open. */
export const thermeWater = () => [...paradiesWater()];

/** Every pool in the baths. */
export const THERME_POOLS: readonly PoolDef[] = [...PARADIES_POOLS];

/** Everything solid in the baths: the house's floor (open over the water), walls and doors, and what stands in each part. */
export function thermeFixtures(): TFixture[] {
  return [...houseFixtures(thermeWater()), ...paradiesFixtures()];
}

/** Where someone is in the baths, in words (the people list, the corner's line): in a pool, at the bar, or the zone they're in. */
export function thermeWhereabouts(x: number, y: number, z: number): string {
  const swimming = THERME_POOLS.find((p) => inPoolAt(p, x, y, z));
  if (swimming) {
    if (swimming.id === THERMAL_POOL.id) return x > BAR_COUNTER.minX - 2.6 && x < BAR_COUNTER.maxX && z > BAR_COUNTER.minZ && z < BAR_COUNTER.maxZ ? '🍹 an der Schwimmbar' : '🌊 im Thermalbecken';
    if (swimming.id.startsWith('therme-whirl')) return '🫧 im Whirlpool';
    if (swimming.id === 'therme-grotto') return '💎 in der Tropfsteingrotte';
  }
  if (x > GROTTO.minX && x < GROTTO.maxX && z > GROTTO.minZ && z < GROTTO.maxZ) return '💎 in der Tropfsteingrotte';
  if (x > ISLAND.minX && x < ISLAND.maxX && z > ISLAND.minZ && z < ISLAND.maxZ) return '🌴 auf der Palmeninsel';
  return zoneWords(x, z);
}

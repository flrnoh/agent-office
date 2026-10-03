import { POOL_DEFAULTS, type PoolDef, type SwimRect } from './swim.js';
import { NORTH_BAND_Z, ZONES, type TFixture, type TRect } from './therme.js';
import type { DrinkId } from './rooftop.js';

/*
 * The Thermenparadies under the glass dome (flrnoh fork, see FORK.md "The thermal baths", phase 2):
 * the plan of its north half (the wave pool takes the south half, phase 3). Pure data, shared by the
 * page (client/world/therme/paradies*.ts) and the tests.
 *
 *   - the thermal pool (34 °C), a ring of water round the palm island, a notch of it under the
 *     grotto's cliff where the waterfall comes down
 *   - the swim-up bar in its east arm: a counter standing in the water, stools in it, the bartender
 *     on the dry bar floor behind
 *   - four whirlpools along the west deck, bamboo between them
 *   - the dripstone grotto in the north-west corner, rock all round, a warm basin inside, coloured light
 *   - loungers along the decks, palms on the island and round the pools
 */

const P = ZONES.paradies;

/** The thermal pool's water level and floor (the hall's floor is y 0). */
export const THERMAL = { surface: -0.12, floor: -1.45 } as const;
/** The palm island in the middle of the ring. */
export const ISLAND: TRect = { minX: 89, maxX: 106, minZ: 46, maxZ: 60 };
/** The bar floor behind the counter (dry, the deck's height). */
export const BAR_FLOOR: TRect = { minX: 121, maxX: 125, minZ: 48, maxZ: 58 };
/** The counter, standing in the water along the bar floor's west edge. */
export const BAR_COUNTER = { minX: 120.5, maxX: 121.3, minZ: 48.4, maxZ: 57.6, top: 1.05 } as const;
/** Where the bartender stands (on the bar floor, facing the water), and the back bar behind. */
export const BARTENDER = { x: 122.6, z: 53, rotY: -Math.PI / 2 } as const;
export const BACK_BAR = { minX: 124.2, maxX: 124.9, minZ: 49, maxZ: 57, top: 1.9 } as const;
/** The stools in the water in front of the counter (their seats just under the surface). */
export const BAR_STOOLS: readonly { x: number; z: number }[] = [49.4, 51.0, 52.6, 54.2, 55.8].map((z) => ({ x: 119.7, z }));
/** What the swim-up bar pours: the roof's catalog, the lighter end of it, and a fruity one or two. */
export const SWIMBAR_MENU: readonly DrinkId[] = ['maitai', 'mojito', 'beer', 'wine', 'water'];

/** The grotto: a cave of rock in the north-west corner (clear of the entrance hall's way in, north-east), open to the east; its basin inside. */
export const GROTTO: TRect = { minX: P.minX + 0.2, maxX: 75, minZ: NORTH_BAND_Z + 0.2, maxZ: 31 };
export const GROTTO_MOUTH = { minZ: 21.5, maxZ: 26.5 } as const;
export const GROTTO_POOL: TRect = { minX: 56.5, maxX: 69, minZ: 17, maxZ: 29.5 };
export const GROTTO_ROOF = 4.6;
const GROTTO_WALL = 0.8;
/** The cliff south-east of the grotto, and the waterfall down it into the thermal pool's notch. */
export const CLIFF: TRect = { minX: 70, maxX: 80, minZ: 29.5, maxZ: 31.5 };
export const WATERFALL = { minX: 72, maxX: 78, z: CLIFF.maxZ + 0.05, top: 4.2 } as const;

/** The thermal pool's water: a ring round the island (north, south, west and east arms; the east one round the bar floor), and the notch under the cliff. */
const RING: SwimRect[] = [
  { minX: 70, maxX: 125, minZ: 34, maxZ: ISLAND.minZ },
  { minX: 70, maxX: 125, minZ: ISLAND.maxZ, maxZ: 72 },
  { minX: 70, maxX: ISLAND.minX, minZ: ISLAND.minZ, maxZ: ISLAND.maxZ },
  { minX: ISLAND.maxX, maxX: BAR_FLOOR.minX, minZ: ISLAND.minZ, maxZ: ISLAND.maxZ },
  { minX: BAR_FLOOR.minX, maxX: 125, minZ: ISLAND.minZ, maxZ: BAR_FLOOR.minZ },
  { minX: BAR_FLOOR.minX, maxX: 125, minZ: BAR_FLOOR.maxZ, maxZ: ISLAND.maxZ },
  { minX: CLIFF.minX, maxX: CLIFF.maxX, minZ: CLIFF.maxZ, maxZ: 34 },
];

const pool = (id: string, rects: SwimRect[], surface: number, floor: number, sink = 1.2): PoolDef => ({ ...POOL_DEFAULTS, id, rects, surface, floor, sink, deck: 0, speed: 1.4, fast: 2.1 });

export const THERMAL_POOL: PoolDef = pool('therme-thermal', RING, THERMAL.surface, THERMAL.floor);
/** The whirlpools along the west deck, each its own small pool, a little hotter and shallower. */
export const WHIRLPOOLS: readonly PoolDef[] = [34, 42, 50, 58].map((z, i) => pool(`therme-whirl-${i + 1}`, [{ minX: 58.4, maxX: 63.2, minZ: z, maxZ: z + 4.8 }], -0.15, -1.15, 0.95));
export const GROTTO_SWIM: PoolDef = pool('therme-grotto', [GROTTO_POOL], -0.12, -1.3, 1.1);
/** Every pool in the Thermenparadies. */
export const PARADIES_POOLS: readonly PoolDef[] = [THERMAL_POOL, ...WHIRLPOOLS, GROTTO_SWIM];

/** The bubble loungers: shallow ledges along the thermal pool's north wall with jets under them (seen, not sat on). */
export const BUBBLE_LEDGES: readonly TRect[] = [76, 84, 112, 118].map((x) => ({ minX: x, maxX: x + 4, minZ: 34, maxZ: 35.4 }));

/** The loungers: in rows along the north and south decks and on the island, facing the water. */
export const LOUNGERS: readonly { id: string; x: number; z: number; rotY: number }[] = [
  ...[82.4, 85, 87.6, 90.2, 106, 108.6, 111.2, 113.8, 116.4, 119, 121.6].map((x, i) => ({ id: `therme-lounger-n${i + 1}`, x, z: 30.2, rotY: 0 })),
  ...[71.5, 74.1, 76.7, 79.3, 81.9, 84.5, 87.1, 89.7, 105.3, 107.9, 110.5, 113.1, 115.7, 118.3, 120.9, 123.5].map((x, i) => ({ id: `therme-lounger-s${i + 1}`, x, z: 75.4, rotY: Math.PI })),
  ...[92.5, 95.1].map((x, i) => ({ id: `therme-lounger-i${i + 1}`, x, z: 58.2, rotY: Math.PI })),
];
/** How high a lounger's cushion is (the hips, lying on it). */
export const LOUNGER_HIPS = 0.36;

/** Palms (x, z, height): on the island, round the decks, flanking the passage's mouth. */
export const PALMS: readonly { x: number; z: number; h: number }[] = [
  { x: 92, z: 48.5, h: 9 },
  { x: 102.5, z: 48.2, h: 11 },
  { x: 104, z: 56.8, h: 8 },
  { x: 90.6, z: 54.5, h: 10 },
  { x: 97.4, z: 50.6, h: 13 },
  { x: 91.6, z: 19.5, h: 8 },
  { x: 108.4, z: 19.5, h: 8 },
  { x: 66.6, z: 32.6, h: 9 },
  { x: 67.2, z: 74, h: 10 },
  { x: 128.5, z: 74, h: 9 },
  { x: 129, z: 38, h: 11 },
  { x: 57.6, z: 76.5, h: 12 },
  { x: 137.4, z: 76.5, h: 12 },
  { x: 128, z: 64, h: 8 },
  { x: 102.4, z: 29.5, h: 7 },
];
/** Bamboo clumps between the whirlpools. */
export const BAMBOO: readonly { x: number; z: number }[] = [32.4, 40.4, 48.4, 56.4, 64.4].map((z) => ({ x: 60.8, z }));
/** Planters round each palm on the decks (the island's grow straight out of it). */
export const PLANTER = 0.9;

/** Every wet rectangle in the Thermenparadies: where the floor is open. */
export const paradiesWater = (): SwimRect[] => PARADIES_POOLS.flatMap((p) => p.rects);

/** The grotto's rock: walls round it (open at the mouth), its roof, the cliff west of it. */
function grottoRock(): TFixture[] {
  const G = GROTTO;
  const t = GROTTO_WALL;
  return [
    { id: 'grotto-n', minX: G.minX, maxX: G.maxX, minZ: G.minZ, maxZ: G.minZ + t, top: GROTTO_ROOF },
    { id: 'grotto-s', minX: G.minX, maxX: G.maxX, minZ: G.maxZ - t, maxZ: G.maxZ, top: GROTTO_ROOF },
    { id: 'grotto-w', minX: G.minX, maxX: G.minX + t, minZ: G.minZ, maxZ: G.maxZ, top: GROTTO_ROOF },
    { id: 'grotto-e1', minX: G.maxX - t, maxX: G.maxX, minZ: G.minZ, maxZ: GROTTO_MOUTH.minZ, top: GROTTO_ROOF },
    { id: 'grotto-e2', minX: G.maxX - t, maxX: G.maxX, minZ: GROTTO_MOUTH.maxZ, maxZ: G.maxZ, top: GROTTO_ROOF },
    { id: 'grotto-lintel', minX: G.maxX - t, maxX: G.maxX, minZ: GROTTO_MOUTH.minZ, maxZ: GROTTO_MOUTH.maxZ, bottom: 2.9, top: GROTTO_ROOF },
    { id: 'grotto-roof', minX: G.minX, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ, bottom: GROTTO_ROOF, top: GROTTO_ROOF + 0.6 },
    { id: 'cliff', minX: CLIFF.minX, maxX: CLIFF.maxX, minZ: CLIFF.minZ, maxZ: CLIFF.maxZ, top: WATERFALL.top + 0.3 },
  ];
}

/** Every solid thing in the Thermenparadies (besides the floor, which the plan cuts round the water): rock, the bar, planters, the pools' floors. */
export function paradiesFixtures(): TFixture[] {
  const f: TFixture[] = [...grottoRock()];
  f.push({ id: 'bar-counter', ...BAR_COUNTER, bottom: THERMAL.floor });
  f.push({ id: 'back-bar', ...BACK_BAR });
  for (const [i, p] of PALMS.entries()) {
    if (inIsland(p.x, p.z)) continue;
    f.push({ id: `planter-${i}`, minX: p.x - PLANTER / 2, maxX: p.x + PLANTER / 2, minZ: p.z - PLANTER / 2, maxZ: p.z + PLANTER / 2, top: 0.55 });
  }
  for (const [i, p] of PALMS.entries()) if (inIsland(p.x, p.z)) f.push({ id: `palm-${i}`, minX: p.x - 0.25, maxX: p.x + 0.25, minZ: p.z - 0.25, maxZ: p.z + 0.25, top: p.h });
  for (const [i, b] of BAMBOO.entries()) f.push({ id: `bamboo-${i}`, minX: b.x - 0.55, maxX: b.x + 0.55, minZ: b.z - 0.55, maxZ: b.z + 0.55, top: 4.5 });
  for (const pl of PARADIES_POOLS) for (const [j, r] of pl.rects.entries()) f.push({ id: `${pl.id}-floor-${j}`, ...r, bottom: pl.floor - 0.3, top: pl.floor });
  return f;
}

const inIsland = (x: number, z: number) => x > ISLAND.minX && x < ISLAND.maxX && z > ISLAND.minZ && z < ISLAND.maxZ;

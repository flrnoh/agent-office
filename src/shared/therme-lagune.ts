import { POOL_DEFAULTS, type PoolDef, type SwimRect } from './swim.js';
import { DOORS, THERME_BOX, TWALL, ZONES, type TFixture, type TRect } from './therme.js';

/*
 * The outdoor lagoon (flrnoh fork, see FORK.md "The thermal baths", phase 6): out through the glass
 * doors in the Thermenparadies's south wall, under the open sky. A sandy beach along the house with
 * loungers and sunshades, a warm lagoon to the west, and to the east the lazy river: a channel round an
 * island whose current carries you round and round (clockwise, seen from above), a footbridge over it
 * onto the island. It's outside: the office's real weather falls here (rain, snow), and on cold days
 * steam rises off the warm water.
 */

const L = ZONES.lagune;

/** Where outside begins: past the house's south wall. */
export const OUTSIDE_Z = THERME_BOX.maxZ + TWALL;
/** The beach along the house: sand from the wall to the water. */
export const BEACH_SAND: TRect = { minX: L.minX, maxX: L.maxX, minZ: OUTSIDE_Z, maxZ: 147 };

/** The lagoon: freeform, a bay and a lobe. */
export const LAGOON_RECTS: SwimRect[] = [
  { minX: 36, maxX: 98, minZ: 149, maxZ: 176 },
  { minX: 48, maxX: 90, minZ: 176, maxZ: 185 },
];
export const LAGOON: PoolDef = { ...POOL_DEFAULTS, id: 'therme-lagoon', rects: LAGOON_RECTS, surface: -0.12, floor: -1.6, sink: 1.25, deck: 0, speed: 1.4, fast: 2.1 };

/** The lazy river: a channel round the island. */
export const RIVER_OUT: TRect = { minX: 110, maxX: 184, minZ: 149, maxZ: 186 };
export const ISLE: TRect = { minX: 117, maxX: 177, minZ: 155, maxZ: 180 };
const RIVER_RECTS: SwimRect[] = [
  { minX: RIVER_OUT.minX, maxX: RIVER_OUT.maxX, minZ: RIVER_OUT.minZ, maxZ: ISLE.minZ },
  { minX: RIVER_OUT.minX, maxX: RIVER_OUT.maxX, minZ: ISLE.maxZ, maxZ: RIVER_OUT.maxZ },
  { minX: RIVER_OUT.minX, maxX: ISLE.minX, minZ: ISLE.minZ, maxZ: ISLE.maxZ },
  { minX: ISLE.maxX, maxX: RIVER_OUT.maxX, minZ: ISLE.minZ, maxZ: ISLE.maxZ },
];
/** How fast the river carries you (m/s). */
export const RIVER_SPEED = 0.95;

/** The river's current at (x, z): along the channel, clockwise round the island seen from above (east along its north side, south down its east side, and so on), easing round the corners. */
export function riverFlow(x: number, z: number): { x: number; z: number } {
  const cx = (ISLE.minX + ISLE.maxX) / 2;
  const cz = (ISLE.minZ + ISLE.maxZ) / 2;
  // Which side of the island you're on, by how far past its edges (a rounded rectangle's tangent).
  const hx = (ISLE.maxX - ISLE.minX) / 2;
  const hz = (ISLE.maxZ - ISLE.minZ) / 2;
  const dx = x - cx;
  const dz = z - cz;
  const px = Math.max(0, Math.abs(dx) - hx) * Math.sign(dx);
  const pz = Math.max(0, Math.abs(dz) - hz) * Math.sign(dz);
  let nx = px;
  let nz = pz;
  if (!nx && !nz) return { x: 0, z: 0 };
  const len = Math.hypot(nx, nz);
  nx /= len;
  nz /= len;
  // Clockwise seen from above (+y up, z south): the outward normal turned a quarter.
  return { x: -nz * RIVER_SPEED, z: nx * RIVER_SPEED };
}

export const RIVER: PoolDef = { ...POOL_DEFAULTS, id: 'therme-river', rects: RIVER_RECTS, surface: -0.12, floor: -1.6, sink: 1.25, deck: 0, speed: 1.2, fast: 1.9, flow: (x, z) => riverFlow(x, z) };

export const LAGUNE_POOLS: readonly PoolDef[] = [LAGOON, RIVER];

/** The footbridge over the river's north arm, onto the island: a deck you walk under the water's edge of, a step up at each end. */
export const BRIDGE = { minX: 138, maxX: 141, minZ: RIVER_OUT.minZ - 1, maxZ: ISLE.minZ + 1, top: 0.6, bottom: 0.4, step: 0.3 } as const;

/** The loungers on the beach and the island, the sunshades over them. */
export const SUN_LOUNGERS: readonly { id: string; x: number; z: number; rotY: number }[] = [
  ...[40, 43, 46, 52, 55, 58, 64, 67, 70, 106, 109, 112, 150, 153, 156, 162, 165, 168, 174, 177].map((x, i) => ({ id: `therme-sun-${i + 1}`, x, z: 144.6, rotY: 0 })),
  ...[124, 127, 130, 160, 163, 166].map((x, i) => ({ id: `therme-isle-${i + 1}`, x, z: 162, rotY: Math.PI })),
];
export const SHADES: readonly { x: number; z: number; color: string }[] = [
  { x: 41.5, z: 143.4, color: '#e63946' },
  { x: 53.5, z: 143.4, color: '#f4a261' },
  { x: 65.5, z: 143.4, color: '#2a9d8f' },
  { x: 107.5, z: 143.4, color: '#e9c46a' },
  { x: 151.5, z: 143.4, color: '#e63946' },
  { x: 163.5, z: 143.4, color: '#2a9d8f' },
  { x: 175.5, z: 143.4, color: '#f4a261' },
  { x: 128.5, z: 164, color: '#e9c46a' },
  { x: 163, z: 164, color: '#e63946' },
];
/** Palms on the island and round the lagoon. */
export const ISLE_PALMS: readonly { x: number; z: number; h: number }[] = [
  { x: 135, z: 170, h: 10 },
  { x: 146, z: 166, h: 12 },
  { x: 157, z: 172, h: 9 },
  { x: 170, z: 168, h: 11 },
  { x: 121, z: 175, h: 8 },
  { x: 33, z: 150, h: 10 },
  { x: 101, z: 152, h: 9 },
  { x: 33, z: 182, h: 11 },
  { x: 101, z: 182, h: 10 },
];

/** Where outside ends: a hedge round it, with trees beyond. */
export const HEDGE = { minX: L.minX - 0.6, maxX: L.maxX + 0.6, maxZ: L.maxZ + 0.6, height: 2.2 } as const;

/** Whether (x, z) is outside (the lagoon's part), where the weather falls. */
export const outside = (x: number, z: number) => z > OUTSIDE_Z && x > L.minX - 1 && x < L.maxX + 1;

/** The outside's water, where its ground's open. */
export const laguneWater = (): TRect[] => [...LAGOON_RECTS, ...RIVER_RECTS];

/** The ground outside: the lagoon zone, sand and deck, its edge, the bridge. */
export function laguneFixtures(cut: (r: TRect, holes: readonly TRect[]) => TRect[]): TFixture[] {
  const f: TFixture[] = cut({ minX: L.minX, maxX: L.maxX, minZ: OUTSIDE_Z, maxZ: L.maxZ }, laguneWater()).map((r, i) => ({ id: `out-ground-${i}`, ...r, bottom: -2.4, top: 0 }));
  for (const p of LAGUNE_POOLS) for (const [j, r] of p.rects.entries()) f.push({ id: `${p.id}-floor-${j}`, ...r, bottom: p.floor - 0.3, top: p.floor });
  // The hedge round the outside (the house's wall is its north side).
  f.push({ id: 'hedge-s', minX: HEDGE.minX, maxX: HEDGE.maxX, minZ: L.maxZ, maxZ: HEDGE.maxZ, top: HEDGE.height });
  f.push({ id: 'hedge-w', minX: HEDGE.minX, maxX: L.minX, minZ: OUTSIDE_Z, maxZ: HEDGE.maxZ, top: HEDGE.height });
  f.push({ id: 'hedge-e', minX: L.maxX, maxX: HEDGE.maxX, minZ: OUTSIDE_Z, maxZ: HEDGE.maxZ, top: HEDGE.height });
  // The bridge: its deck over the river, a step at each end on the bank.
  f.push({ id: 'bridge', minX: BRIDGE.minX, maxX: BRIDGE.maxX, minZ: BRIDGE.minZ + 0.5, maxZ: BRIDGE.maxZ - 0.5, bottom: BRIDGE.bottom, top: BRIDGE.top });
  f.push({ id: 'bridge-step-n', minX: BRIDGE.minX, maxX: BRIDGE.maxX, minZ: BRIDGE.minZ - 0.5, maxZ: BRIDGE.minZ + 0.5, top: BRIDGE.step });
  f.push({ id: 'bridge-step-s', minX: BRIDGE.minX, maxX: BRIDGE.maxX, minZ: BRIDGE.maxZ - 0.5, maxZ: BRIDGE.maxZ + 0.5, top: BRIDGE.step });
  // The bridge's railings (you don't fall off it into the river).
  for (const [i, x] of [BRIDGE.minX, BRIDGE.maxX].entries()) f.push({ id: `bridge-rail-${i}`, minX: x - 0.05, maxX: x + 0.05, minZ: BRIDGE.minZ, maxZ: BRIDGE.maxZ, bottom: BRIDGE.top, top: BRIDGE.top + 1 });
  // The palms' trunks.
  for (const [i, p] of ISLE_PALMS.entries()) f.push({ id: `out-palm-${i}`, minX: p.x - 0.3, maxX: p.x + 0.3, minZ: p.z - 0.3, maxZ: p.z + 0.3, top: p.h });
  return f;
}

/** The lagoon's door in the house's south wall (shared/therme.ts DOORS), no longer shut. */
export const LAGUNE_DOOR = DOORS.find((d) => d.id === 'lagune')!;

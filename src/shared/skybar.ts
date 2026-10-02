// The sky bar on the roof (flrnoh fork): an L. The long counter runs down the east side; at its
// north end, the pool's end, it turns and runs east to the edge of the roof, so it's closed there
// and has a few more stools round the corner. The bartender gets in and out at the south end, the
// bungee jetty's end. Kept apart from layout.ts (which re-exports ROOF_BAR) so the seats fit in.

import type { SeatDef } from './layout.js';

/** The long counter along the east side: its middle (x), its ends, how deep and high it is. */
export const ROOF_BAR = { x: 12.95, minZ: -0.6, maxZ: 9.2, depth: 0.7, height: 1.1 } as const;

/** The edge of the roof (layout.ts FLOOR.maxX), where the short leg ends. */
const EDGE_X = 18;

/** The short leg across the north end, from the long counter's front to the edge: closed off there. */
export const ROOF_BAR_END = {
  minX: ROOF_BAR.x - ROOF_BAR.depth / 2,
  maxX: EDGE_X,
  minZ: ROOF_BAR.minZ - ROOF_BAR.depth,
  maxZ: ROOF_BAR.minZ,
} as const;

/** Stools along the front of the long counter, and round the corner in front of the short leg, facing the bartender. */
export const SKYBAR_STOOLS: SeatDef[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `roof-stool-${i + 1}`, label: '🪑 Bar stool', x: ROOF_BAR.x - ROOF_BAR.depth / 2 - 0.45, y: 0, z: ROOF_BAR.minZ + 0.9 + i * 1.64, rotY: Math.PI / 2, places: [0], hips: 0.78, depth: 0, out: -0.75, roof: true, bar: true })),
  ...[0, 1, 2].map((i) => ({ id: `roof-stool-${i + 7}`, label: '🪑 Bar stool', x: ROOF_BAR_END.minX + 1.1 + i * 1.5, y: 0, z: ROOF_BAR_END.minZ - 0.45, rotY: 0, places: [0], hips: 0.78, depth: 0, out: -0.75, roof: true, bar: true })),
];

/** Where the bartender walks: behind the long counter, and along behind the short leg. */
export const TENDER = { x: ROOF_BAR.x + ROOF_BAR.depth / 2 + 0.7, legZ: ROOF_BAR_END.maxZ + 0.6, legMaxX: EDGE_X - 1.5 } as const;

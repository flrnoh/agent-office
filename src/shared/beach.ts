// The sea off Sunset Beach (flrnoh fork, see FORK.md "A day at the beach"): where the water is, how
// deep it is where you stand in it, the jetty's ladder and diving board, and the line of buoys
// swimmers stay inside. Pure numbers, so the pages, the office and the tests agree on them.
//
// The beach, the sea and the pier are the scenic loop's (shared/scenic.ts, world/scenic/coast.ts and
// water.ts). Heights here are above the street (the sea's surface is just under it), never absolute:
// every floor has its own street, that many storeys further down.

import { LIGHTHOUSE, PIER, shoreX } from './scenic.js';

/** The sea's surface, below the street (m): water.ts draws it there. */
export const SEA_LEVEL = -0.15;

/** How far below the street a swimmer's feet are (their head and shoulders out of the water). */
export const SWIM_SINK = 1.25;

/** From the water's edge out, how far you wade before you're swimming (m). */
export const WADE = 5;

/** How far out from the water's edge swimmers may go: the line of buoys (m). */
export const SWIM_OUT = 50;

/** How far north and south the sea goes on (z): the world's edge, well out of sight. */
export const SEA_Z = 860;

/** How far out boats may go (x), out of sight of the beach anyway. */
export const SEA_FAR = -1400;

/** The pier's deck, on its posts out into the sea (see coast.ts): from the sand at `x0` out to its end at `x1`. */
export const JETTY = (() => {
  const shore = shoreX(PIER.z);
  const x0 = shore + 8;
  const x1 = shore - PIER.length;
  return {
    x0,
    x1,
    z: PIER.z,
    width: PIER.width,
    /** The deck's top, above the street. */
    deck: 0.28,
    /** The swim ladder down its south side at the far end, and where climbing it puts you on the deck. */
    ladder: { x: x1 + 1.6, z: PIER.z + PIER.width / 2 + 0.15, top: { x: x1 + 1.6, z: PIER.z + PIER.width / 2 - 0.7 } },
    /** The diving board off its end: a plank out over the water, a little higher than the deck. */
    board: { x0: x1 - 2.4, x1: x1 + 0.4, z: PIER.z, width: 0.7, top: 0.5 },
  } as const;
})();

/** Where the water starts at `z`: the shore, as water.ts draws it. */
export const waterEdge = (z: number) => shoreX(z);

/**
 * How deep in the sea someone at (x, z) stands, 0 (on the sand) to SWIM_SINK (swimming): over the
 * first WADE meters out from the edge the sand slopes away under you.
 */
export function seaDepth(x: number, z: number): number {
  if (Math.abs(z) > SEA_Z) return 0;
  const out = waterEdge(z) - 0.5 - x;
  if (out <= 0) return 0;
  return Math.min(1, out / WADE) * SWIM_SINK;
}

/** Whether (x, z) is in the sea (past the water's edge), however shallow. */
export function inSea(x: number, z: number): boolean {
  return seaDepth(x, z) > 0;
}

/** Whether (x, z) is out of your depth: you swim there rather than wade. */
export function swimDepth(x: number, z: number): boolean {
  return seaDepth(x, z) >= SWIM_SINK * 0.85;
}

/**
 * Whether someone with their feet at `y`, `street` being their floor's street, is swimming: in the
 * sea, well down in it. Everyone's page works it out from where they are (their `move`), so nobody
 * needs to say they're swimming.
 */
export function swimmingAt(x: number, y: number, z: number, street: number): boolean {
  return swimDepth(x, z) && y < street - SWIM_SINK * 0.6 && y > street - SWIM_SINK - 1;
}

/** Whether someone at (x, y, z) is in the sea at all, wading or swimming (their feet below the street). */
export function wadingAt(x: number, y: number, z: number, street: number): boolean {
  return inSea(x, z) && y < street - 0.05 && y > street - SWIM_SINK - 1;
}

/** Inside the buoys: where swimmers may go. */
export function inSwimZone(x: number, z: number): boolean {
  return Math.abs(z) < SEA_Z && x > waterEdge(z) - SWIM_OUT;
}

/** Whether a swimmer at (x, z) can reach the jetty's ladder. */
export function atLadder(x: number, z: number): boolean {
  return Math.hypot(x - JETTY.ladder.x, z - JETTY.ladder.z) < 1.6;
}

/** Somewhere flat, x and z. */
interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** What stands in the sea that a boat can't go through: the pier on its posts, and the lighthouse's rocks. */
export const SEA_SOLIDS: readonly Rect[] = [
  { minX: JETTY.x1 - 2.6, maxX: JETTY.x0, minZ: PIER.z - PIER.width / 2 - 0.2, maxZ: PIER.z + PIER.width / 2 + 0.3 },
  { minX: LIGHTHOUSE.x - 10, maxX: shoreX(LIGHTHOUSE.z) + 2, minZ: LIGHTHOUSE.z - 9, maxZ: LIGHTHOUSE.z + 10 },
];

/** The sailboats moored out on the water (coast.ts draws them), and how far round them a boat keeps off. */
export const SAILBOATS: readonly [number, number][] = [
  [-300, 170],
  [-335, 262],
  [-290, 330],
  [-320, 80],
];
export const SAILBOAT_R = 3.4;

/**
 * Whether (x, z) is open water a boat can be on: past the shallows (3 m out from the edge), inside
 * the world, clear of the pier and the lighthouse's rocks. The sailboats are the driver's page to
 * bump into.
 */
export function onWater(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(z) > SEA_Z || x < SEA_FAR) return false;
  if (x > waterEdge(z) - 3) return false;
  return !SEA_SOLIDS.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
}

/**
 * The beach car park across the road from the kiosk (flrnoh fork; world/scenic/parking.ts builds it):
 * its edges, the driveway off the road, the bays (either side of the aisle down the middle, `depth`
 * deep and `width` wide), and the cars parked there already (nose toward the aisle; 0 is +z).
 */
export const BEACH_PARKING = (() => {
  const minX = -208;
  const maxX = -190;
  const minZ = 198;
  const maxZ = 232;
  const bay = { depth: 5, width: 2.6 };
  const bayZ = (k: number) => minZ + 0.5 + (k + 0.5) * bay.width;
  const west = minX + bay.depth / 2;
  const east = maxX - bay.depth / 2;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    drive: { fromX: -216.5, z: 215, width: 6 },
    bay,
    parked: [
      { kind: 'ferrari', color: '#d62828', x: west, z: bayZ(1), rotY: -Math.PI / 2 },
      { kind: 'lambo', color: '#9ef01a', x: east, z: bayZ(3), rotY: Math.PI / 2 },
      { kind: 'ferrari', color: '#ffd60a', x: east, z: bayZ(8), rotY: Math.PI / 2 },
      { kind: 'lambo', color: '#ff8500', x: west, z: bayZ(10), rotY: -Math.PI / 2 },
    ] as const,
  };
})();

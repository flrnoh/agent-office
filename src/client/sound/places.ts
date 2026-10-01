import { CABINET, FLOOR, GONG, WINDOWS as OPENINGS, type Opening } from '../../shared/layout';

/** A point in the office, where a sound comes from or where you hear it. */
export type Pos = { x: number; y: number; z: number };

// The kitchen props (kitchen.ts puts the kitchen at x -14.5, z 12.2).
export const COFFEE_MACHINE: Pos = { x: -15.7, y: 1.4, z: 12.2 };
export const FRIDGE: Pos = { x: -11.3, y: 1.1, z: 12.2 };
/** Just outside each of `openings` low enough to hear through (not the loft's windows). */
const outside = (openings: readonly Opening[]): Pos[] =>
  openings
    .filter((o) => o.y0 < 2)
    .map((o) =>
      o.wall === 'south' || o.wall === 'north'
        ? { x: o.u, y: 2.4, z: o.wall === 'south' ? FLOOR.maxZ + 1.5 : FLOOR.minZ - 1.5 }
        : { x: o.wall === 'west' ? FLOOR.minX - 1.5 : FLOOR.maxX + 1.5, y: 2.4, z: o.u },
    );
/** Just outside the office's windows (not the loft's). */
export const WINDOWS: Pos[] = outside(OPENINGS);
/** flrnoh fork: the floor you're on's windows (each storey has them where its balconies leave room, shared/storey.ts). */
export function hearThrough(openings: readonly Opening[]) {
  WINDOWS.splice(0, WINDOWS.length, ...outside(openings));
}
/** The middle of the gong's disc. */
export const GONG_AT: Pos = { x: GONG.x, y: GONG.height - 1.36, z: GONG.z };
/** The arcade cabinet's speaker, under its screen. */
export const CABINET_AT: Pos = { x: CABINET.x - 0.2, y: 1.2, z: CABINET.z };

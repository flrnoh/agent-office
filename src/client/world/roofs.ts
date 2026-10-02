// flrnoh fork (see FORK.md "The Baumarkt"): roofs down on the street that keep the rain and snow off
// what's under them (the sky's `sheltered`, world/sky.ts, asks underRoof by way of fogbox.ts). Each is a
// box in x/z; the street's buildings that stand on it add theirs once, as they're built.

export interface RoofBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const ROOFS: RoofBox[] = [];

/** One more roof to keep the rain off. */
export function addRoof(b: RoofBox) {
  ROOFS.push(b);
}

/** Whether (x, z) is under one of them. */
export const underRoof = (x: number, z: number): boolean => ROOFS.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);

// flrnoh fork (see FORK.md "A facade for creatives"): where the rainbow fins stand on the street side,
// shared by the facade that draws them (client/world/facade/skin.ts) and what has to keep clear of them
// (DER BRECHER's brackets off the top storey, shared/coaster-supports.ts).

import { EXIT_DOOR, FLOOR, WALL_T, type Opening } from './layout.js';
import { storeyPlan, type Balcony } from './storey.js';
import { tubePortals } from './coaster.js';

export const FIN = { depth: 0.7, width: 0.24, step: 0.85 } as const;

const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T } as const;

/** Along the street side (x), where a storey's fins stand, between `holes` (its openings there) and its decks. */
export function finXs(holes: readonly Opening[], balconies: readonly Balcony[]): number[] {
  const blocked: [number, number][] = holes.map((o) => [o.u - o.width / 2 - 0.35, o.u + o.width / 2 + 0.35]);
  for (const b of balconies) if (b.wall === 'south') blocked.push([b.rect.minX - 0.35, b.rect.maxX + 0.35]);
  const out: number[] = [];
  for (let u = B.minX + 0.5; u <= B.maxX - 0.5; u += FIN.step) if (!blocked.some(([a, b]) => u + FIN.width > a && u - FIN.width < b)) out.push(u);
  return out;
}

/** Storey `k`'s openings in wall `side` (windows, balcony doors, the exit door, DER BRECHER's tube). */
export function storeyHoles(k: number, side: Opening['wall']): Opening[] {
  const plan = storeyPlan(k);
  return [...plan.windows, ...plan.balconies.map((b) => b.door), ...(k === 0 && side === 'west' ? [EXIT_DOOR] : []), ...tubePortals(k)].filter((o) => o.wall === side);
}

/** Storey `k`'s fins (x along the street side). */
export const storeyFins = (k: number) => finXs(storeyHoles(k, 'south'), storeyPlan(k).balconies);

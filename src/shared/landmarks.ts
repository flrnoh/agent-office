import { BLOCK_INNER, blockAt } from './city.js';
import { LANDMARKS, type LandmarkId } from './landmark-blocks.js';

// flrnoh fork (see FORK.md): the city's landmarks, each on a whole block of its own instead of the
// buildings shared/city.ts would put there: the petrol station with its car wash, the cinema and the
// DIY store. The block keeps its streets, sidewalks and crossings; what stands on it is the landmark's
// own (each its own module), inside the block's sidewalks (`landmarkBox`).

export { LANDMARKS, landmarkAt, type Landmark, type LandmarkId } from './landmark-blocks.js';

/** Where a landmark may build: its block inside the sidewalks, as a box in x/z. */
export function landmarkBox(id: LandmarkId): { minX: number; maxX: number; minZ: number; maxZ: number; x: number; z: number } {
  const l = LANDMARKS.find((m) => m.id === id)!;
  const { x, z } = blockAt(l.i, l.j);
  const h = BLOCK_INNER / 2;
  return { minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h, x, z };
}

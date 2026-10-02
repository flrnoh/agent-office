import { FLOOR, WALL_T } from '../../../shared/layout';

// flrnoh fork (see FORK.md, "A facade for creatives"): the building's outline, walls included.

export const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T } as const;

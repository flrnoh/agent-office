import type { SeatDef } from './layout.js';
import { GYM_BOX, GYM_ROOM } from './gym.js';

/*
 * The gym's changing room (flrnoh fork, see FORK.md "Rooms, spa and detail"): through the door in
 * the hall's west wall, by the lockers, a room of its own built onto the hall's outside (the gym's
 * interior is a scene of its own, so there's room out there). Lockers along its west wall, a bench in
 * the middle, sinks and a mirror on the north wall, three showers along the south wall. Pure data,
 * shared by the page (world/gym/changing.ts) and the tests (which walk in through the door).
 */

/** A rectangle on the floor (as shared/gym-rooms.ts Rect, kept here so the two don't import each other). */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The changing room between its walls. Its east wall is the hall's west wall. */
export const CHANGING_ROOM = { minX: 1.5, maxX: GYM_BOX.minX, minZ: 37.0, maxZ: 44.0, height: 2.8 } as const;
/** Its own walls' thickness (west, north and south). */
export const CHANGING_WALL = 0.15;
/** The door through the hall's west wall: its middle along z, and how wide. */
export const CHANGING_DOOR = { z: 39.75, width: 1.05 } as const;
/** The doorway through the hall's wall, from the changing room's floor to the hall's. */
export const CHANGING_DOORWAY: Box = { minX: GYM_BOX.minX - 0.5, maxX: GYM_ROOM.minX + 0.5, minZ: CHANGING_DOOR.z - CHANGING_DOOR.width / 2, maxZ: CHANGING_DOOR.z + CHANGING_DOOR.width / 2 };

/** The lockers along its west wall. */
export const CHANGING_LOCKERS = { minX: CHANGING_ROOM.minX, maxX: CHANGING_ROOM.minX + 0.5, minZ: CHANGING_ROOM.minZ, maxZ: 41.6, top: 2.0 } as const;
/** The bench in the middle, facing the lockers. */
export const CHANGING_BENCH = { minX: 3.0, maxX: 3.4, minZ: 37.8, maxZ: 41.0, top: 0.45 } as const;
/** The sinks under the mirror, on the north wall. */
export const CHANGING_SINKS = { minX: 3.8, maxX: 5.6, minZ: CHANGING_ROOM.minZ, maxZ: 37.55, top: 0.85 } as const;
/** The showers along the south wall: three stalls between tiled partitions. */
export const SHOWER_ZONE = { minZ: 42.0, maxZ: CHANGING_ROOM.maxZ } as const;
export const SHOWER_PARTITIONS = [2.95, 4.4] as const;
export const SHOWER_PARTITION_FROM = 42.7;
export const SHOWERS = [
  { x: 2.22, z: 43.55 },
  { x: 3.67, z: 43.55 },
  { x: 5.12, z: 43.55 },
] as const;
/** How close under a shower head counts as standing in its water. */
export const SHOWER_REACH = 0.55;

/** The shower someone standing at (x, z) is under, if any. */
export function showerAt(x: number, z: number): number {
  return SHOWERS.findIndex((s) => Math.hypot(x - s.x, z - s.z) < SHOWER_REACH);
}

/** Whether (x, z) is in the changing room (between its walls). */
export const inChanging = (x: number, z: number) => x > CHANGING_ROOM.minX && x < CHANGING_ROOM.maxX && z > CHANGING_ROOM.minZ && z < CHANGING_ROOM.maxZ;

/** The bench to sit on while you lace up (SEATING has it, with `gym`). */
export const CHANGING_SEATING: SeatDef[] = [
  { id: 'gym-changing-bench', label: '🪑 Bench', x: (CHANGING_BENCH.minX + CHANGING_BENCH.maxX) / 2, y: 0, z: (CHANGING_BENCH.minZ + CHANGING_BENCH.maxZ) / 2, rotY: -Math.PI / 2, places: [-1.1, 0, 1.1], hips: 0.46, depth: 0, out: 0.75, gym: true },
];

/**
 * Its solid parts, as the gym's other fixtures (see gymFixtures): the hall's west wall either side of
 * the door and above it, the room's own walls, floor and ceiling, the lockers, bench, sinks and the
 * showers' partitions.
 */
export function changingFixtures(): (Box & { id: string; top: number; bottom?: number })[] {
  const C = CHANGING_ROOM;
  const w = CHANGING_WALL;
  const d0 = CHANGING_DOOR.z - CHANGING_DOOR.width / 2;
  const d1 = CHANGING_DOOR.z + CHANGING_DOOR.width / 2;
  const wallX = { minX: GYM_BOX.minX, maxX: GYM_ROOM.minX };
  const H = GYM_ROOM.height;
  return [
    // The hall's west wall, with the doorway through it.
    { id: 'gym-wall-w1', ...wallX, minZ: GYM_BOX.minZ, maxZ: d0, top: H },
    { id: 'gym-wall-w2', ...wallX, minZ: d1, maxZ: GYM_BOX.maxZ, top: H },
    { id: 'changing-lintel', ...wallX, minZ: d0, maxZ: d1, bottom: 2.25, top: H },
    // The room's own walls, its floor and its ceiling.
    { id: 'changing-wall-w', minX: C.minX - w, maxX: C.minX, minZ: C.minZ - w, maxZ: C.maxZ + w, top: C.height },
    { id: 'changing-wall-n', minX: C.minX - w, maxX: C.maxX, minZ: C.minZ - w, maxZ: C.minZ, top: C.height },
    { id: 'changing-wall-s', minX: C.minX - w, maxX: C.maxX, minZ: C.maxZ, maxZ: C.maxZ + w, top: C.height },
    { id: 'changing-floor', minX: C.minX - w, maxX: GYM_ROOM.minX, minZ: C.minZ - w, maxZ: C.maxZ + w, bottom: -1, top: 0 },
    { id: 'changing-ceiling', minX: C.minX - w, maxX: C.maxX, minZ: C.minZ - w, maxZ: C.maxZ + w, bottom: C.height, top: C.height + 0.3 },
    // Inside.
    { id: 'changing-lockers', ...CHANGING_LOCKERS },
    { id: 'changing-bench', ...CHANGING_BENCH },
    { id: 'changing-sinks', ...CHANGING_SINKS },
    ...SHOWER_PARTITIONS.map((x, i) => ({ id: `shower-wall-${i + 1}`, minX: x - 0.04, maxX: x + 0.04, minZ: SHOWER_PARTITION_FROM, maxZ: C.maxZ, top: 2.0 })),
  ];
}

// The padel hall's building (flrnoh fork, see FORK.md "The padel hall"): where its furniture stands
// inside, in the hall's own coordinates (shared/hall.ts HALL_ROOM). Shared by the page (which builds
// it, src/client/world/hall/interior.ts), the server (which lets you sit on its seats only in there)
// and the tests (which keep it all off the courts and their run-out, COURT_MARGIN).
//
// Only types come from layout.ts here: layout.ts puts HALL_SEATING into SEATING (via fork-seating.ts).

import type { SeatDef } from './layout.js';
import { COURTS, COURT, COURT_MARGIN, GALLERY, HALL_DOOR_INSIDE, HALL_ROOM } from './hall.js';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Each court with its run-out round it: nothing of the building stands on the ground in there. */
export const COURT_KEEP_OUT: readonly Rect[] = COURTS.map((c) => ({
  minX: c.x - COURT.width / 2 - COURT_MARGIN,
  maxX: c.x + COURT.width / 2 + COURT_MARGIN,
  minZ: c.z - COURT.length / 2 - COURT_MARGIN,
  maxZ: c.z + COURT.length / 2 + COURT_MARGIN,
}));

/** How thick the gallery's floor is: its underside is this far below GALLERY.y. */
export const GALLERY_SLAB = 0.3;

/**
 * The stairs up to the gallery, along the east wall beside court 2's run-out: `steps` steps from the
 * foot (z `footZ`, on the ground) north to the gallery's edge (z GALLERY.maxZ, at GALLERY.y).
 */
export const HALL_STAIRS = { minX: HALL_ROOM.maxX - 1.55, maxX: HALL_ROOM.maxX - 0.05, footZ: -1.5, topZ: GALLERY.maxZ, steps: 14 } as const;
/** How high one step rises, and how deep it is. */
export const STAIR_RISE = GALLERY.y / HALL_STAIRS.steps;
export const STAIR_RUN = (HALL_STAIRS.footZ - HALL_STAIRS.topZ) / HALL_STAIRS.steps;

/** The `i`th step (1 is the lowest): its box, and the top you stand on. */
export function stairStep(i: number): Rect & { top: number } {
  const z1 = HALL_STAIRS.footZ - (i - 1) * STAIR_RUN;
  return { minX: HALL_STAIRS.minX, maxX: HALL_STAIRS.maxX, minZ: z1 - STAIR_RUN, maxZ: z1, top: i * STAIR_RISE };
}

/** Pillars holding up the gallery's edge (x, z): off the courts' run-out, clear of the stand's aisles. */
export const GALLERY_PILLARS: readonly { x: number; z: number }[] = [
  { x: HALL_ROOM.minX + 0.45, z: GALLERY.maxZ - 0.45 },
  { x: 0, z: GALLERY.maxZ - 0.45 },
];

/**
 * The stand under the gallery, facing the courts (+z): a bench on the ground at the front, then two
 * risers stepping up behind it (each `rise` higher than the one in front), a bench on each. Two
 * benches a row, one in front of each court.
 */
export const HALL_STAND = {
  rows: [
    { z: GALLERY.maxZ - 1.3, y: 0 },
    { z: GALLERY.maxZ - 2.55, y: 0.3 },
    { z: GALLERY.maxZ - 3.8, y: 0.6 },
  ],
  /** Where each riser starts (its front edge) going back: row 2's and row 3's. */
  risers: [
    { minZ: GALLERY.maxZ - 4.4, maxZ: GALLERY.maxZ - 2.0, top: 0.3 },
    { minZ: HALL_ROOM.minZ, maxZ: GALLERY.maxZ - 3.2, top: 0.6 },
  ],
  minX: HALL_ROOM.minX + 1.2,
  maxX: HALL_STAIRS.minX - 0.3,
  benchLength: 8,
  benchXs: COURTS.map((c) => c.x),
} as const;

/** Down by the doors: the reception desk (decor), the lockers along the south wall, a bench by them. */
export const RECEPTION = { x: -7, z: 14.2, length: 3.6, depth: 0.8 } as const;
export const LOCKERS = { minX: HALL_ROOM.minX + 0.3, maxX: HALL_ROOM.minX + 5.3, z: HALL_ROOM.maxZ - 0.3, depth: 0.5, height: 2 } as const;
export const DOOR_BENCH = { x: 8.5, z: HALL_ROOM.maxZ - 0.55, length: 4 } as const;

/** Up on the gallery: the café's counter along the north wall, where E orders, with the machine and the cakes on it. */
export const CAFE_COUNTER = { minX: -13.5, maxX: -6.5, z: HALL_ROOM.minZ + 1.1, depth: 0.75, height: 1.08 } as const;
/** Where you stand to order (the hint and E reach from here). */
export const CAFE_ORDER = { x: (CAFE_COUNTER.minX + CAFE_COUNTER.maxX) / 2, z: CAFE_COUNTER.z + 1.2 } as const;
/** The café's little round tables, two chairs each (west and east of it, facing each other). */
export const CAFE_TABLES: readonly { x: number; z: number }[] = [
  { x: -10, z: GALLERY.maxZ - 1.5 },
  { x: -5.5, z: GALLERY.maxZ - 1.5 },
  { x: -1, z: GALLERY.maxZ - 1.5 },
  { x: 3.5, z: GALLERY.maxZ - 1.5 },
  { x: 8, z: GALLERY.maxZ - 1.5 },
  { x: 1.5, z: HALL_ROOM.minZ + 2.3 },
];
/** How far from its table's middle a chair stands. */
export const CAFE_CHAIR_OFF = 0.72;

/**
 * Where people sit in the hall (SEATING has these, with `hall`): the stand's benches, the bench by
 * the doors, and the café's chairs. Sitting on one only counts in the hall (see seatHere).
 */
export const HALL_SEATING: SeatDef[] = [
  ...HALL_STAND.rows.flatMap((row, r) =>
    HALL_STAND.benchXs.map((x, b) => ({
      id: `hall-stand-${r + 1}-${b + 1}`,
      label: '🎾 Stand',
      x,
      y: row.y,
      z: row.z,
      rotY: 0,
      places: Array.from({ length: 8 }, (_, i) => -3.5 + i),
      hips: 0.46,
      depth: 0,
      out: 0.55,
      hall: true,
    })),
  ),
  { id: 'hall-bench', label: '🪑 Bench', x: DOOR_BENCH.x, y: 0, z: DOOR_BENCH.z, rotY: Math.PI, places: [-1.2, 0, 1.2], hips: 0.46, depth: 0, out: 0.7, hall: true },
  ...CAFE_TABLES.flatMap((t, i) =>
    [-1, 1].map((s) => ({
      id: `cafe-chair-${i + 1}-${s < 0 ? 'w' : 'e'}`,
      label: '☕ Café chair',
      x: t.x + s * CAFE_CHAIR_OFF,
      y: GALLERY.y,
      z: t.z,
      // Facing the table.
      rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2,
      places: [0],
      hips: 0.48,
      depth: 0,
      out: -0.7,
      hall: true,
    })),
  ),
];

/** Whether (x, z) is on the ground inside the doors: where E goes back out. */
export const nearHallDoor = (x: number, z: number) => Math.abs(x - HALL_DOOR_INSIDE.x) < HALL_DOOR_INSIDE.width / 2 + 0.6 && z > HALL_DOOR_INSIDE.z - 1.6;

/** Whether a rect on the ground stands on a court or in its run-out. */
export function onCourt(r: Rect): boolean {
  return COURT_KEEP_OUT.some((k) => r.minX < k.maxX && r.maxX > k.minX && r.minZ < k.maxZ && r.maxZ > k.minZ);
}

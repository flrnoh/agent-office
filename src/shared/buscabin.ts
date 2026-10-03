import { BUS_L, BUS_W, DOORS } from './citybus.js';

// flrnoh fork (see FORK.md "Traffic lights and the city bus"): inside a city bus, in its own frame
// (its nose +x, its doors on the right, +z; the floor at FLOOR_Y over the street). One plan for the
// page that draws the seats, the poles and the rest (world/town/bus-cabin.ts), the page that walks you
// about in there as it drives and sits you down (features/citybus/cabin.ts), and the office, which
// only takes a place in here that's in here (server/fork/busride.ts).

/** How high its floor is over the street (a low-floor bus: one low step in). */
export const FLOOR_Y = 0.36;
const HL = BUS_L / 2;
const HW = BUS_W / 2;
/** How wide its doors are. */
export const DOOR_W = 1.25;

/** A seat: where you sit (its middle), facing which way (local, as `facing`: 0 is +z, π/2 the nose), and the window side it's on. */
export interface CabinSeat {
  x: number;
  z: number;
  rotY: number;
}

/** How far (m) from a seat's front edge you can sit down in it (the back row's window seats from the aisle). */
export const SEAT_REACH = 1.25;
/** How high your hips are over the floor, sitting in one. */
export const SEAT_HIPS = 0.5;
const FORWARD = Math.PI / 2;

/** Down the left: two seats a row, and the space for prams and wheelchairs across from the middle doors. */
const LEFT_ROWS = [-4.1, -3.25, -2.4, 1.0, 1.85, 2.7];
/** Down the right: one seat a row, clear of the doors. */
const RIGHT_ROWS = [-4.1, -3.25, -2.4, 0.9, 1.75, 2.6];
/** The back row, right across. */
const BACK_X = -HL + 0.55;

export const SEATS: readonly CabinSeat[] = [
  ...[-0.94, -0.47, 0, 0.47, 0.94].map((z) => ({ x: BACK_X, z, rotY: FORWARD })),
  ...LEFT_ROWS.flatMap((x) => [-0.94, -0.48].map((z) => ({ x, z, rotY: FORWARD }))),
  ...RIGHT_ROWS.map((x) => ({ x, z: 0.94, rotY: FORWARD })),
];

/** Where the pram and wheelchair space is (across from the middle doors), for its sign and its bar. */
export const PRAM = { minX: -1.95, maxX: 0.5, z: -HW } as const;

/** The ticket validators (Entwerter), each on a pole just in from a door. */
export const VALIDATORS: readonly { x: number; z: number }[] = [
  { x: DOORS[0] - 0.95, z: 0.62 },
  { x: DOORS[1] - 0.95, z: 0.62 },
];

/** A box on the floor plan (local). */
export interface CabinBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The driver's cab (seat, wheel and the screen behind them) and the dashboard right across the front. */
export const CAB: CabinBox = { minX: HL - 1.8, maxX: HL, minZ: -HW, maxZ: -0.12 };
const DASH: CabinBox = { minX: HL - 0.55, maxX: HL, minZ: -HW, maxZ: HW };

/** What you can't walk through in there: the seats (and their backs), the cab, the dashboard, the validators. */
export const CABIN_BLOCKS: readonly CabinBox[] = [
  ...SEATS.map((s) => ({ minX: s.x - 0.3, maxX: s.x + 0.25, minZ: s.z - 0.23, maxZ: s.z + 0.23 })),
  CAB,
  DASH,
  ...VALIDATORS.map((v) => ({ minX: v.x - 0.12, maxX: v.x + 0.12, minZ: v.z - 0.12, maxZ: v.z + 0.12 })),
];

/** How far your middle keeps from the walls and what's in there. */
export const BODY_R = 0.26;
/** The inside of the walls. */
export const INSIDE: CabinBox = { minX: -HL + 0.1, maxX: HL - 0.1, minZ: -HW + 0.08, maxZ: HW - 0.08 };

/** The doors' gaps in the right wall: along x, from and to. */
export const DOOR_GAPS: readonly [number, number][] = DOORS.map((u) => [u - DOOR_W / 2 + 0.1, u + DOOR_W / 2 - 0.1]);

/** Whether someone (their middle) can stand at (x, z) in there: inside the walls, clear of everything. */
export function standsAt(x: number, z: number, r = BODY_R): boolean {
  if (x < INSIDE.minX + r || x > INSIDE.maxX - r || z < INSIDE.minZ + r || z > INSIDE.maxZ - r) return false;
  return !CABIN_BLOCKS.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
}

/** Which door's gap (x, z) is in, stepping out: in its span and right up against the wall. -1 if none. */
export function doorAt(x: number, z: number): number {
  if (z < INSIDE.maxZ - BODY_R - 0.06) return -1;
  return DOOR_GAPS.findIndex(([a, b]) => x > a && x < b);
}

/** Where you stand just inside a door, having got on. */
export function inDoor(k: number): [number, number] {
  return [DOORS[k], INSIDE.maxZ - BODY_R - 0.02];
}

/** Whether (x, z) is somewhere in there at all (for the office: a place someone says they stand or sit). */
export function inCabin(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && x >= INSIDE.minX && x <= INSIDE.maxX && z >= INSIDE.minZ && z <= INSIDE.maxZ;
}

// The padel hall across the street (flrnoh fork, see FORK.md): two padel courts, a stand, and a
// gallery with a café above them. The shared plan both halves build on: the building and its café
// (src/client/world/hall/, src/server/hall.ts) and the padel game (src/shared/padel/, ...).
//
// Inside, the hall is a place of its own like the roof and the casino (HALL is a peer's `floor`
// while they're in there), so people from every floor meet there. Its interior is its own scene in
// its own coordinates (below): x across the hall, z along the courts, the floor at y 0.

/** Where you are while you're in the hall (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const HALL = '@hall';
export const HALL_NAME = 'Padel Hall';

/** The room inside, walls excluded (interior coordinates). */
export const HALL_ROOM = { minX: -15, maxX: 15, minZ: -17, maxZ: 17, height: 10 } as const;

/** A padel court: 10 m wide (x), 20 m long (z), the net across its middle (z = center). */
export const COURT = { width: 10, length: 20, netHeight: 0.88, netHeightPosts: 0.92, backWall: 3, sideGlass: 2, fence: 4 } as const;

/** The two courts side by side, both running along z. Their surroundings (glass, fence, net, lines, lights) belong to the padel game. */
export const COURTS = [
  { id: 'court-1', name: 'Court 1', x: -7, z: 0 },
  { id: 'court-2', name: 'Court 2', x: 7, z: 0 },
] as const;
export type CourtId = (typeof COURTS)[number]['id'];

/** The south band (z 10.5..17) at the ground: the entrance with the doors, a reception desk, a bench for watching. */
export const HALL_ENTRY = { x: 0, z: 15.2, rotY: Math.PI } as const;
/** The inside of the doors: E there goes back out onto the street. */
export const HALL_DOOR_INSIDE = { x: 0, z: HALL_ROOM.maxZ - 0.4, width: 2.6 } as const;

/**
 * The gallery: a mezzanine along the north end (z -17..-11), its floor at y GALLERY.y, with a glass
 * railing overlooking both courts, reached by stairs; the café is up there (counter, tables).
 * Under it at the ground: a low stand (benches) for watching the courts up close.
 */
export const GALLERY = { minX: HALL_ROOM.minX, maxX: HALL_ROOM.maxX, minZ: HALL_ROOM.minZ, maxZ: -11, y: 3.6 } as const;

/** Nothing of the building (stand, stairs, café, pillars) may stand inside this band round each court: players run out there. */
export const COURT_MARGIN = 1.2;

// ---- The building on the street (the building's half, see src/client/world/hall/) --------------

/**
 * The building's footprint on the street (walls included): across the road to the east, the
 * casino's counterpart, where a neighbour stood. Its front (north, z = minZ) faces the street.
 */
export const HALL_BOX = { minX: 22, maxX: 54, minZ: 36, maxZ: 72 } as const;
/** How tall its walls stand above the street (the curved roof rises HALL_ROOF_RISE more in the middle). */
export const HALL_HEIGHT = 9;
export const HALL_ROOF_RISE = 3;
/** The front doors, in the middle of its north face (toward the street): center along x, and how wide and tall. */
export const HALL_DOOR = { x: (HALL_BOX.minX + HALL_BOX.maxX) / 2, width: 2.6, height: 2.8 } as const;
/** Where you land on the sidewalk coming out, facing the street (-z). */
export const HALL_STREET_SPOT = { x: HALL_DOOR.x, z: HALL_BOX.minZ - 1.8, rotY: Math.PI } as const;

// The rehearsal wing's layout (flrnoh fork, see FORK.md "The rehearsal wing"): where its walls, doors,
// furniture and the things you use stand, in the Schallwerk's interior coordinates (shared/venue.ts).
// The page builds from it (client/features/proberaum/), the office checks who stands where by it
// (server/venue/proberaum.ts), and tests/proberaum-plan.test.ts checks it keeps clear of the
// instruments' spots, the doors and the walkways.

import { REHEARSAL_ROOMS, STUDIO_REGIE_X, VENUE_ROOM, WING_CORRIDOR, WING_DOOR, ZONES, type RehearsalRoom, type RehearsalRoomId, type Zone } from './venue.js';

/** The rooms' walls, and the wing's own east wall onto the foyer and the hall. */
export const WING_WALL = 0.2;
/** The wing's ceiling (the lobby, the corridor and every room): a proper Proberaum height, not the hall's 9 m. */
export const WING_CEILING = 3.3;
/** The wing's east wall onto the foyer and the hall stands as tall as the hall, so the wing is a box of its own from out there. */
export const WING_EAST_WALL = { minX: ZONES.wing.maxX - WING_WALL, maxX: ZONES.wing.maxX, height: VENUE_ROOM.height } as const;
/** How tall the doorways are. */
export const DOOR_HEIGHT = 2.15;

/** The lobby, inside its walls: the wing's north end, from the building's north and west walls to the rooms. */
export const LOBBY: Zone = { minX: ZONES.wing.minX, maxX: WING_EAST_WALL.minX, minZ: ZONES.wing.minZ, maxZ: REHEARSAL_ROOMS[0].box.minZ };
/** The corridor's floor, inside the walls (the rooms' east walls, the wing's east wall). */
export const CORRIDOR_FLOOR: Zone = { minX: WING_CORRIDOR.minX, maxX: WING_EAST_WALL.minX, minZ: WING_CORRIDOR.minZ, maxZ: WING_CORRIDOR.maxZ };

/** A room inside its own walls. */
export const inner = (r: RehearsalRoom): Zone => ({ minX: r.box.minX + WING_WALL, maxX: r.box.maxX - WING_WALL, minZ: r.box.minZ + WING_WALL, maxZ: r.box.maxZ - WING_WALL });
export const roomById = (id: RehearsalRoomId): RehearsalRoom => REHEARSAL_ROOMS.find((r) => r.id === id)!;
export const midZ = (r: RehearsalRoom) => (r.box.minZ + r.box.maxZ) / 2;

/**
 * A room's door: in its east wall, hinged on the south jamb and swinging in (the corridor is too
 * narrow for a heavy door to swing out into). `x` the wall's middle, `outX`/`inX` where you stand
 * to use it from the corridor or from inside.
 */
export function doorOf(r: RehearsalRoom) {
  const x = r.box.maxX - WING_WALL / 2;
  return { x, z: r.door.z, width: r.door.width, hingeZ: r.door.z + r.door.width / 2, outX: r.box.maxX + 0.65, inX: r.box.maxX - WING_WALL - 0.7 };
}
/** What the open door sweeps through, inside the room: kept clear. */
export function doorSwing(r: RehearsalRoom): Zone {
  const d = doorOf(r);
  return { minX: r.box.maxX - WING_WALL - d.width - 0.05, maxX: r.box.maxX - WING_WALL, minZ: d.z - d.width / 2 - 0.05, maxZ: d.z + d.width / 2 + 0.1 };
}
/** You use a door from this near (m), either side of it. */
export const DOOR_REACH = 3;

/** The studio's glass wall between the live room and the control room, and the doorway through it at its north end. */
export const STUDIO_GLASS = { x: STUDIO_REGIE_X, minZ: inner(roomById('studio')).minZ, maxZ: inner(roomById('studio')).maxZ, doorZ0: inner(roomById('studio')).minZ, doorZ1: inner(roomById('studio')).minZ + 1.1 } as const;

/** Something that stands on the floor: what you bump into, its top. */
export interface Solid extends Zone {
  id: string;
  top: number;
  /** In which room (for the clearance check against that room's instruments), or the lobby / corridor. */
  where: RehearsalRoomId | 'lobby' | 'corridor';
}

/** What stands in each rehearsal room (not the studio), by the room. The vibes differ, the furniture's places don't. */
function roomSolids(r: RehearsalRoom): Solid[] {
  const I = inner(r);
  const s = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, top: number): Solid => ({ id: `${r.id}-${id}`, where: r.id, minX, maxX, minZ, maxZ, top });
  const out = [
    // The mixer and the recorder on a little table in the north-east corner, the fridge beside it.
    s('mixer', I.maxX - 2.5, I.maxX - 1.3, I.minZ, I.minZ + 0.6, 0.85),
    s('fridge', I.maxX - 1.0, I.maxX - 0.35, I.minZ, I.minZ + 0.65, 1.45),
    // The sofa in the south-east corner, facing the band.
    s('sofa', I.maxX - 2.6, I.maxX - 0.6, I.maxZ - 0.9, I.maxZ, 0.5),
    // The PA: a top on a stand in each west corner past the guitar and the bass.
    s('pa-n', -20.85, -20.35, I.minZ + 0.1, I.minZ + 0.6, 1.9),
    s('pa-s', -20.85, -20.35, I.maxZ - 0.6, I.maxZ - 0.1, 1.9),
  ];
  if (r.id === 'probe1') out.push(s('crate', I.minX + 0.1, I.minX + 0.6, I.minZ + 0.1, I.minZ + 0.45, 0.6));
  if (r.id === 'probe2') out.push(s('lamp', I.minX + 0.15, I.minX + 0.65, I.minZ + 0.15, I.minZ + 0.65, 1.7), s('plant', I.minX + 0.15, I.minX + 0.65, I.maxZ - 0.65, I.maxZ - 0.15, 1.2));
  if (r.id === 'probe3') out.push(s('crates', I.minX + 0.1, I.minX + 0.75, I.maxZ - 0.55, I.maxZ - 0.1, 0.9), s('case', I.minX + 0.1, I.minX + 1.0, I.minZ + 0.1, I.minZ + 0.6, 0.75));
  return out;
}

const studio = roomById('studio');
const SI = inner(studio);
/** The studio: the desk against the glass facing the live room, the rack, the couch and a mini fridge at the back of the control room. */
const STUDIO_SOLIDS: Solid[] = [
  { id: 'studio-desk', where: 'studio', minX: STUDIO_REGIE_X + 0.15, maxX: STUDIO_REGIE_X + 1.1, minZ: 11.3, maxZ: 14.0, top: 0.95 },
  { id: 'studio-rack', where: 'studio', minX: SI.maxX - 0.95, maxX: SI.maxX - 0.35, minZ: SI.minZ, maxZ: SI.minZ + 0.6, top: 1.35 },
  { id: 'studio-couch', where: 'studio', minX: SI.maxX - 2.5, maxX: SI.maxX - 0.7, minZ: SI.maxZ - 0.9, maxZ: SI.maxZ, top: 0.5 },
  { id: 'studio-amp', where: 'studio', minX: STUDIO_REGIE_X - 0.82, maxX: STUDIO_REGIE_X - 0.18, minZ: SI.maxZ - 0.47, maxZ: SI.maxZ, top: 0.55 },
  { id: 'studio-fridge', where: 'studio', minX: SI.maxX - 0.55, maxX: SI.maxX, minZ: SI.maxZ - 0.6, maxZ: SI.maxZ, top: 0.85 },
];

/** The lobby: lockers, the vending machine and the string machine, the backline counter, the sofa corner. */
const LOBBY_SOLIDS: Solid[] = [
  { id: 'lockers', where: 'lobby', minX: LOBBY.minX + 0.05, maxX: LOBBY.minX + 2.45, minZ: LOBBY.minZ, maxZ: LOBBY.minZ + 0.5, top: 1.9 },
  { id: 'vending', where: 'lobby', minX: -20.95, maxX: -19.95, minZ: LOBBY.minZ, maxZ: LOBBY.minZ + 0.8, top: 1.85 },
  { id: 'strings', where: 'lobby', minX: -19.7, maxX: -19.0, minZ: LOBBY.minZ, maxZ: LOBBY.minZ + 0.42, top: 1.75 },
  { id: 'counter', where: 'lobby', minX: -18.2, maxX: -14.8, minZ: LOBBY.minZ, maxZ: LOBBY.minZ + 1.35, top: 1.05 },
  { id: 'sofa', where: 'lobby', minX: -22.9, maxX: -20.7, minZ: LOBBY.maxZ - 0.85, maxZ: LOBBY.maxZ, top: 0.5 },
  { id: 'amp', where: 'lobby', minX: -20.55, maxX: -20.0, minZ: LOBBY.maxZ - 0.6, maxZ: LOBBY.maxZ, top: 0.62 },
  { id: 'kicker', where: 'lobby', minX: -19.9, maxX: -18.5, minZ: -12.45, maxZ: -11.65, top: 0.95 },
  { id: 'plant', where: 'lobby', minX: LOBBY.minX, maxX: LOBBY.minX + 0.6, minZ: LOBBY.maxZ - 0.65, maxZ: LOBBY.maxZ, top: 1.2 },
  { id: 'table', where: 'lobby', minX: -22.4, maxX: -21.2, minZ: LOBBY.maxZ - 2.0, maxZ: LOBBY.maxZ - 1.4, top: 0.45 },
];

/** Everything in the wing that stands on its floor. */
export const WING_SOLIDS: readonly Solid[] = [...LOBBY_SOLIDS, ...REHEARSAL_ROOMS.filter((r) => r.id !== 'studio').flatMap(roomSolids), ...STUDIO_SOLIDS];
export const solid = (id: string): Solid => WING_SOLIDS.find((s) => s.id === id)!;

// ---- What you can use --------------------------------------------------------------------------------

/**
 * The things in the wing that E does something at. `door`/`doorin` the room's door from the corridor
 * or from inside, `panel` the little screen beside it (booking), `mixer` a room's recorder (the
 * studio's desk), `setlist` its whiteboard, `fridge` its beer; in the lobby the booking board, the
 * Schwarzes Brett, the polaroids, the band name generator, the machines, the backline counter, the
 * tip jar and the lockers.
 */
export type WingThing = 'door' | 'doorin' | 'panel' | 'mixer' | 'setlist' | 'fridge' | 'board' | 'notes' | 'polaroids' | 'bandname' | 'vending' | 'strings' | 'rental' | 'tip' | 'lockers' | 'lava' | 'kicker';

export interface WingSpot {
  what: WingThing;
  room?: RehearsalRoomId;
  x: number;
  z: number;
  /** How near (m) to count as at it, for the hint in third person. */
  radius: number;
}

function roomSpots(r: RehearsalRoom): WingSpot[] {
  const d = doorOf(r);
  const I = inner(r);
  const out: WingSpot[] = [
    { what: 'door', room: r.id, x: d.outX, z: d.z, radius: 0.8 },
    { what: 'doorin', room: r.id, x: d.inX, z: d.z, radius: 0.75 },
    { what: 'panel', room: r.id, x: d.outX, z: d.z - d.width / 2 - 0.55, radius: 0.5 },
  ];
  if (r.id === 'studio') {
    const desk = solid('studio-desk');
    out.push({ what: 'mixer', room: r.id, x: desk.maxX + 0.45, z: 12.2, radius: 0.9 }, { what: 'fridge', room: r.id, x: SI.maxX - 0.3, z: SI.maxZ - 1.0, radius: 0.45 });
    return out;
  }
  const mixer = solid(`${r.id}-mixer`);
  out.push(
    { what: 'mixer', room: r.id, x: (mixer.minX + mixer.maxX) / 2, z: mixer.maxZ + 0.45, radius: 0.6 },
    { what: 'fridge', room: r.id, x: I.maxX - 0.68, z: I.minZ + 1.1, radius: 0.45 },
    { what: 'setlist', room: r.id, x: I.maxX - 0.6, z: midZ(r) + 1.7, radius: 0.6 },
  );
  if (r.id === 'probe2') out.push({ what: 'lava', room: r.id, x: mixer.maxX - 0.2, z: mixer.maxZ + 0.35, radius: 0.35 });
  return out;
}

export const WING_SPOTS: readonly WingSpot[] = [
  { what: 'board', x: -16.2, z: LOBBY.maxZ - 0.7, radius: 1.0 },
  { what: 'notes', x: LOBBY.minX + 0.75, z: -13.6, radius: 1.0 },
  { what: 'polaroids', x: LOBBY.minX + 0.75, z: -11.2, radius: 1.0 },
  { what: 'bandname', x: LOBBY.maxX - 0.65, z: -14.6, radius: 0.8 },
  { what: 'vending', x: -20.45, z: LOBBY.minZ + 1.25, radius: 0.55 },
  { what: 'strings', x: -19.35, z: LOBBY.minZ + 0.95, radius: 0.45 },
  { what: 'rental', x: -17.0, z: LOBBY.minZ + 1.8, radius: 0.8 },
  { what: 'tip', x: -15.35, z: LOBBY.minZ + 1.75, radius: 0.45 },
  { what: 'lockers', x: LOBBY.minX + 1.25, z: LOBBY.minZ + 0.95, radius: 0.9 },
  { what: 'kicker', x: -19.2, z: -11.15, radius: 0.8 },
  ...REHEARSAL_ROOMS.flatMap(roomSpots),
];

/** Where in the wing (x, z) is: a room (inside its walls), the lobby, the corridor, or not in the wing at all. */
export function wingPartAt(x: number, z: number): RehearsalRoomId | 'lobby' | 'corridor' | null {
  for (const r of REHEARSAL_ROOMS) if (x > r.box.minX && x < r.box.maxX && z > r.box.minZ && z < r.box.maxZ) return r.id;
  if (x > LOBBY.minX && x < LOBBY.maxX && z > LOBBY.minZ && z < LOBBY.maxZ) return 'lobby';
  if (x > CORRIDOR_FLOOR.minX && x < CORRIDOR_FLOOR.maxX && z > CORRIDOR_FLOOR.minZ && z < CORRIDOR_FLOOR.maxZ) return 'corridor';
  return null;
}

/** The way in from the foyer: kept clear in the lobby in front of WING_DOOR. */
export const WING_DOOR_WAY: Zone = { minX: WING_DOOR.x - 2.2, maxX: WING_DOOR.x, minZ: WING_DOOR.z - WING_DOOR.width / 2, maxZ: WING_DOOR.z + WING_DOOR.width / 2 };

// The SCHALLWERK, the concert venue next to the gym (flrnoh fork, see FORK.md "The Schallwerk"): a
// hall with a big stage that's a concert venue one night and a club the next, a bar, a foyer with
// the box office, the cloakroom and the merch stand, backstage, and a wing of fully kitted-out band
// rehearsal rooms with a recording studio. The shared plan all four parts build on:
//
//   - the building and the place (the house on the street, going in and out, the foyer, the bar,
//     the FOH desk with the light show, the mode switch concert/club, backstage):
//     client/world/venue/, client/venue/, server/venue/place.ts
//   - the instruments (drums, guitars, bass, keys, mics: playable, heard by everyone in the room,
//     at every spot in INSTRUMENT_SPOTS, on the stage and in the rehearsal rooms): features/instruments/,
//     server/venue/instruments.ts, shared/instruments*.ts
//   - the rehearsal wing (the rooms, their doors and booking, sound kept in, the studio's recorder):
//     features/proberaum/, server/venue/proberaum.ts, shared/proberaum.ts
//   - the show (the crowd on the floor and what they do, the club's DJ booth, the gig calendar and
//     the posters): features/venueshow/, server/venue/show.ts, shared/venueshow.ts
//
// Each part builds only inside its own zone (below), and adds itself to the house with
// `addVenuePart(...)` (client/world/venue/parts.ts), so none of them touch another's files.
//
// Inside, the venue is a place of its own like the bowling centre (VENUE is a peer's `floor` while
// they're in there). Its interior is its own scene in its own coordinates, centred on the building:
// x across (east +), z from the street (north, -z, the doors) to the back (south, +z, the stage),
// floor at y 0. Outside, it stands across the street east of the gym, where the farm used to start.

/** Where you are while you're in the venue (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const VENUE = '@venue';
export const VENUE_NAME = 'Schallwerk';

// ---- The building on the street ------------------------------------------------------------------

/**
 * The building's footprint on the street (walls included): across the street from the office's
 * block, east of the gym (shared/gym.ts GYM_STREET_BOX x 58..86) and before the farm (moved east
 * for it, shared/scenic.ts FARM). Its front (north, z = minZ) faces the street, which ends at
 * x 110 and runs on as the scenic loop.
 */
export const VENUE_BOX = { minX: 89, maxX: 137, minZ: 36, maxZ: 68 } as const;
/** How tall its walls stand above the street (the hall inside is 9 m; the fly tower over the stage may go higher). */
export const VENUE_HEIGHT = 11;
export const VENUE_WALL = 0.3;
/** Where the building's middle is on the street: interior (0, 0) is here. */
export const VENUE_CENTER = { x: (VENUE_BOX.minX + VENUE_BOX.maxX) / 2, z: (VENUE_BOX.minZ + VENUE_BOX.maxZ) / 2 } as const;
/** The front doors, in its north face (toward the street): center along x (street coordinates), and how wide and tall. */
export const VENUE_DOOR = { x: VENUE_CENTER.x, width: 3.2, height: 3 } as const;
/** Where you land on the sidewalk coming out, facing the street (-z, rotY π). */
export const VENUE_STREET_SPOT = { x: VENUE_DOOR.x, z: VENUE_BOX.minZ - 1.8, rotY: Math.PI } as const;

// ---- Inside (interior coordinates) ---------------------------------------------------------------

/** The room inside, walls excluded: 47.4 × 31.4 m, 9 m to the ceiling. */
export const VENUE_ROOM = {
  minX: -(VENUE_BOX.maxX - VENUE_BOX.minX) / 2 + VENUE_WALL,
  maxX: (VENUE_BOX.maxX - VENUE_BOX.minX) / 2 - VENUE_WALL,
  minZ: -(VENUE_BOX.maxZ - VENUE_BOX.minZ) / 2 + VENUE_WALL,
  maxZ: (VENUE_BOX.maxZ - VENUE_BOX.minZ) / 2 - VENUE_WALL,
  height: 9,
} as const;

/** The doors inside, in the north wall: E there goes back out onto the street. */
export const VENUE_DOOR_INSIDE = { x: 0, z: VENUE_ROOM.minZ + 0.4, width: 3.2 } as const;
/** Just inside the doors, facing into the foyer (+z, rotY 0). */
export const VENUE_ENTRY = { x: 0, z: VENUE_ROOM.minZ + 1.6, rotY: 0 } as const;

/** A box in interior coordinates. */
export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Who builds where. Each part puts its meshes, colliders and interactables only inside its own zone;
 * the walkways between them stay clear (the building may put pillars, speakers, plants and signs on
 * the walls round them, never in them; the rig over the stage and the hall hangs from the ceiling
 * and is the building's, above 6 m). tests/venue-plan.test.ts checks the zones don't overlap.
 *
 *   north (street, doors)                                                    z -15.7
 *   +--------------+-----------------------doors-------------------------------+
 *   | WING lobby   |  FOYER: box office, cloakroom, merch (building)           |
 *   |  (proberaum) |                                                           |
 *   +--door        +----------walk-----+  FOH  +-------walk--------+---------+ z -9
 *   | Proberaum 1  |                   +-------+                   |         |
 *   +--------------+      FLOOR (show: the crowd, the dance floor)    |  BAR    | z -6
 *   | Proberaum 2  |                                                 | (bldg)  |
 *   +--------------+                                                 |         |
 *   | Proberaum 3  +-------------------------------------------------+---------+ z 4
 *   +--------------+    STAGE (instruments: riser, backline)        | DJ BOOTH|
 *   | STUDIO       |                                                | (show)  |
 *   |  live | regie+------------------------------------------------+---------+ z 11
 *   |              |    BACKSTAGE (building: green room, rider, the band's way up) |
 *   +--------------+-----------------------------------------------------------+ z 15.7
 *   west x -23.7      x -11                                       x 16  x 19   east x 23.7
 *
 * The wing (x -23.7..-11) has its own corridor down its east side (x -13.2..-11), the rooms west of
 * it, each with its door in the corridor wall; the corridor opens into the foyer by WING_DOOR.
 */
export const ZONES = {
  /** The building: the foyer behind the street doors, with the box office, the cloakroom and the merch stand. */
  foyer: { minX: -11, maxX: VENUE_ROOM.maxX, minZ: VENUE_ROOM.minZ, maxZ: -9 },
  /** The building: the front-of-house desk, mid-hall at the back, the light desk (anyone may run the show from it) and the sound desk. */
  foh: { minX: -2, maxX: 4, minZ: -9, maxZ: -6 },
  /** The building: the long bar down the east wall of the hall. */
  bar: { minX: 19, maxX: VENUE_ROOM.maxX, minZ: -9, maxZ: 4 },
  /** The show: the floor in front of the stage, where the crowd stands, dances, moshes, crowd-surfs. */
  floor: { minX: -11, maxX: 19, minZ: -6, maxZ: 4 },
  /** The instruments: the stage riser (1.2 m), its steps, the backline, the monitors, the mic stands. */
  stage: { minX: -11, maxX: 16, minZ: 4, maxZ: 11 },
  /** The show: the DJ booth for club nights, on its own riser stage right. */
  djbooth: { minX: 16, maxX: VENUE_ROOM.maxX, minZ: 4, maxZ: 11 },
  /** The building: behind the stage, the green room (sofas, the rider in a fridge, mirrors) and the way up onto the stage. */
  backstage: { minX: -11, maxX: VENUE_ROOM.maxX, minZ: 11, maxZ: VENUE_ROOM.maxZ },
  /** The rehearsal wing: its lobby, its corridor, the three rehearsal rooms and the studio, all their walls. */
  wing: { minX: VENUE_ROOM.minX, maxX: -11, minZ: VENUE_ROOM.minZ, maxZ: VENUE_ROOM.maxZ },
} as const satisfies Record<string, Zone>;
export type ZoneId = keyof typeof ZONES;

/** The wing's door into the foyer, in the wing's east wall (x = ZONES.wing.maxX): its middle along z, how wide. The foyer keeps a metre and a half in front of it clear. */
export const WING_DOOR = { x: ZONES.wing.maxX, z: -12.4, width: 1.8 } as const;
/** The wing's corridor, down its east side from its lobby to the studio. */
export const WING_CORRIDOR: Zone = { minX: -13.2, maxX: ZONES.wing.maxX, minZ: -9, maxZ: VENUE_ROOM.maxZ };

/** How high the stage riser stands. */
export const STAGE_HEIGHT = 1.2;

// ---- The rooms (whose sound is whose) ------------------------------------------------------------

/** The rehearsal rooms and the studio, each a room of its own with its own sound. */
export type RehearsalRoomId = 'probe1' | 'probe2' | 'probe3' | 'studio';
/** Where a sound is: in one of the rehearsal rooms (heard only in there), or the hall and all the rest. */
export type VenueRoomId = RehearsalRoomId | 'hall';

export interface RehearsalRoom {
  id: RehearsalRoomId;
  name: string;
  /** The room, walls included (0.2 m walls; the proberaum part builds them). */
  box: Zone;
  /** Its door, in its east wall onto the corridor: the middle along z, how wide. */
  door: { z: number; width: number };
}

const WING_ROOMS_X = { minX: VENUE_ROOM.minX, maxX: WING_CORRIDOR.minX } as const;
const roomBox = (minZ: number, maxZ: number): Zone => ({ ...WING_ROOMS_X, minZ, maxZ });

export const REHEARSAL_ROOMS: readonly RehearsalRoom[] = [
  { id: 'probe1', name: 'Proberaum 1', box: roomBox(-9, -2.8), door: { z: -5.9, width: 1.2 } },
  { id: 'probe2', name: 'Proberaum 2', box: roomBox(-2.8, 3.4), door: { z: 0.3, width: 1.2 } },
  { id: 'probe3', name: 'Proberaum 3', box: roomBox(3.4, 9.6), door: { z: 6.5, width: 1.2 } },
  // The studio: the live room (west) and the control room (east, x STUDIO_REGIE_X..) with the desk and the recorder.
  { id: 'studio', name: 'Studio', box: roomBox(9.6, VENUE_ROOM.maxZ), door: { z: 12.6, width: 1.2 } },
];
/** In the studio, the glass wall between the live room (west of it) and the control room (east). */
export const STUDIO_REGIE_X = -16.8;

/** Which room (x, z) is in, by its sound: a rehearsal room (inside its walls), or the hall (everywhere else in the venue). */
export function venueRoomAt(x: number, z: number): VenueRoomId {
  for (const r of REHEARSAL_ROOMS) if (x > r.box.minX && x < r.box.maxX && z > r.box.minZ && z < r.box.maxZ) return r.id;
  return 'hall';
}

// ---- The instruments' spots ----------------------------------------------------------------------

/** What can be played. A mic puts your voice on that room's PA (the stage's: the whole hall). */
export type InstrumentKind = 'drums' | 'guitar' | 'bass' | 'keys' | 'mic';

/**
 * Where an instrument stands, and so where you stand (or sit) to play it: the instruments part
 * builds one at every spot, the rest keep clear of them. `rotY` is the way the player faces (a
 * facing angle, 0 = +z); `y` the floor it's on (the stage riser's top on the stage).
 */
export interface InstrumentSpot {
  id: string;
  kind: InstrumentKind;
  room: VenueRoomId;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

const S = STAGE_HEIGHT;
/** The players on the stage face the hall (-z): rotY π. */
const STAGE_SPOTS: InstrumentSpot[] = [
  { id: 'stage-drums', kind: 'drums', room: 'hall', x: 2.5, y: S, z: 9, rotY: Math.PI },
  { id: 'stage-guitar1', kind: 'guitar', room: 'hall', x: -3.5, y: S, z: 6.8, rotY: Math.PI },
  { id: 'stage-guitar2', kind: 'guitar', room: 'hall', x: 8.5, y: S, z: 6.8, rotY: Math.PI },
  { id: 'stage-bass', kind: 'bass', room: 'hall', x: 5.5, y: S, z: 7.8, rotY: Math.PI },
  { id: 'stage-keys', kind: 'keys', room: 'hall', x: -7.5, y: S, z: 7.6, rotY: Math.PI },
  { id: 'stage-mic1', kind: 'mic', room: 'hall', x: 2.5, y: S, z: 5.0, rotY: Math.PI },
  { id: 'stage-mic2', kind: 'mic', room: 'hall', x: -3.5, y: S, z: 5.0, rotY: Math.PI },
  { id: 'stage-mic3', kind: 'mic', room: 'hall', x: 8.5, y: S, z: 5.0, rotY: Math.PI },
];

/**
 * A rehearsal room's spots: the drums against the west wall facing east into the room, the others
 * in a half circle facing them (the way bands rehearse, looking at each other).
 */
function roomSpots(r: RehearsalRoom, kinds: readonly InstrumentKind[]): InstrumentSpot[] {
  const midZ = (r.box.minZ + r.box.maxZ) / 2;
  const west = r.box.minX + 0.2;
  const at: Record<InstrumentKind, { dx: number; dz: number; rotY: number }> = {
    drums: { dx: 1.6, dz: 0, rotY: Math.PI / 2 },
    guitar: { dx: 4.6, dz: -1.7, rotY: -Math.PI / 2 - 0.5 },
    bass: { dx: 4.6, dz: 1.7, rotY: -Math.PI / 2 + 0.5 },
    keys: { dx: 6.6, dz: -1.9, rotY: -Math.PI / 2 - 0.3 },
    mic: { dx: 5.6, dz: 0, rotY: -Math.PI / 2 },
  };
  return kinds.map((kind) => ({ id: `${r.id}-${kind}`, kind, room: r.id, x: west + at[kind].dx, y: 0, z: midZ + at[kind].dz, rotY: at[kind].rotY }));
}

/** The studio's live room is narrower (the control room takes its east end): the drums at the back, guitar and vocal booth mic before them. */
function studioSpots(r: RehearsalRoom): InstrumentSpot[] {
  const midZ = (r.box.minZ + r.box.maxZ) / 2;
  const west = r.box.minX + 0.2;
  return [
    { id: 'studio-drums', kind: 'drums', room: r.id, x: west + 1.6, y: 0, z: midZ, rotY: Math.PI / 2 },
    { id: 'studio-guitar', kind: 'guitar', room: r.id, x: west + 4.4, y: 0, z: midZ - 1.6, rotY: -Math.PI / 2 - 0.4 },
    { id: 'studio-mic', kind: 'mic', room: r.id, x: west + 4.4, y: 0, z: midZ + 1.6, rotY: -Math.PI / 2 + 0.4 },
  ];
}

const BAND: readonly InstrumentKind[] = ['drums', 'guitar', 'bass', 'keys', 'mic'];
/** Every instrument in the house: the stage's backline, a full band's in each rehearsal room, and the studio's live room. */
export const INSTRUMENT_SPOTS: readonly InstrumentSpot[] = [
  ...STAGE_SPOTS,
  ...REHEARSAL_ROOMS.filter((r) => r.id !== 'studio').flatMap((r) => roomSpots(r, BAND)),
  ...studioSpots(REHEARSAL_ROOMS[3]),
];

/**
 * One thing played on an instrument, on the wire and in a recording. `pitch` is a MIDI note for the
 * guitar, the bass and the keys (a chord is several notes at the same `at`), and for the drums one
 * of DRUM_PIECES; `vel` 0..1. `len` is how long it rings in seconds (a key held, a string let ring),
 * absent for the drums. The instruments part makes and plays them; the studio's recorder keeps them.
 */
export interface InstrumentNote {
  kind: Exclude<InstrumentKind, 'mic'>;
  pitch: number;
  vel: number;
  len?: number;
}
/** The drum kit's pieces, as an InstrumentNote's `pitch` for the drums (General MIDI numbers). */
export const DRUM_PIECES = { kick: 36, snare: 38, hihat: 42, openhat: 46, tomHi: 50, tomMid: 47, tomLow: 43, crash: 49, ride: 51 } as const;

// ---- Concert or club ------------------------------------------------------------------------------

/**
 * What the house is tonight: `konzert` (the house lights on the floor, the stage lit, a crowd that
 * faces the band) or `club` (dark, the mirror ball, lasers, haze, the DJ booth lit and a crowd that
 * dances everywhere). One switch for the whole venue, at the FOH desk (the building keeps it,
 * `venue.mode` on the wire); every part's `mode(...)` is called on coming in and on every switch.
 */
export type VenueMode = 'konzert' | 'club';

// The bowling centre next to the office (flrnoh fork, see FORK.md "The bowling centre"): six lanes
// with a league and a leaderboard, a counter with beer, fries and rental shoes, a karaoke bar with a
// stage, and a black-light mini golf room. The shared plan all four halves build on:
//
//   - the building and the place (the house on its block, going in and out, the counter, shoes,
//     cosmic bowling's lights, the lounge): src/client/world/bowling/, features/bowling/, server/bowling/place.ts
//   - the bowling game (lanes, balls, pins, scoring, league): features/bowlinggame/, server/bowling/lanes.ts, shared/bowling-game.ts
//   - the karaoke bar: features/karaoke/, server/bowling/karaoke.ts, shared/karaoke.ts
//   - the black-light mini golf: features/minigolf/, server/bowling/minigolf.ts, shared/minigolf.ts
//
// Each half builds only inside its own zone (below), and adds itself to the room with
// `addBowlingPart(...)` (client/world/bowling/parts.ts), so none of them touch another's files.
//
// Inside, the centre is a place of its own like the soccer hall (BOWLING is a peer's `floor` while
// they're in there), so people from every floor meet there. Its interior is its own scene in its own
// coordinates: x across (east +), z from the pins (north, -z) to the doors (south, +z), floor at y 0.
// Outside, it stands on the block right next to the office to the east, on the office's street.

/** Where you are while you're in the bowling centre (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const BOWLING = '@bowling';
export const BOWLING_NAME = 'Bowling Center';

// ---- The building on the street ------------------------------------------------------------------

/**
 * The building's footprint on the street (walls included): city block (1, 0), the one east of the
 * office across the side street at x ≈ 28 (shared/landmarks.ts, id 'bowling'), a metre in from its
 * sidewalks (the block inside them is x 34..78, z -23..21). Its front (south, z = maxZ) faces the
 * office's street.
 */
export const BOWLING_BOX = { minX: 35, maxX: 77, minZ: -22, maxZ: 20 } as const;
/** How tall its walls stand above the street. */
export const BOWLING_HEIGHT = 8;
export const BOWLING_WALL = 0.3;
/** Where the building's middle is on the street: interior (0, 0) is here. */
export const BOWLING_CENTER = { x: (BOWLING_BOX.minX + BOWLING_BOX.maxX) / 2, z: (BOWLING_BOX.minZ + BOWLING_BOX.maxZ) / 2 } as const;
/** The front doors, in its south face (toward the street): center along x, and how wide and tall. */
export const BOWLING_DOOR = { x: BOWLING_CENTER.x, width: 2.6, height: 2.8 } as const;
/** Where you land on the sidewalk coming out, facing the street (+z). */
export const BOWLING_STREET_SPOT = { x: BOWLING_DOOR.x, z: BOWLING_BOX.maxZ + 1.8, rotY: 0 } as const;

// ---- Inside (interior coordinates) ---------------------------------------------------------------

/** The room inside, walls excluded: 41.4 m square, 7 m to the ceiling. */
export const BOWLING_ROOM = {
  minX: -(BOWLING_BOX.maxX - BOWLING_BOX.minX) / 2 + BOWLING_WALL,
  maxX: (BOWLING_BOX.maxX - BOWLING_BOX.minX) / 2 - BOWLING_WALL,
  minZ: -(BOWLING_BOX.maxZ - BOWLING_BOX.minZ) / 2 + BOWLING_WALL,
  maxZ: (BOWLING_BOX.maxZ - BOWLING_BOX.minZ) / 2 - BOWLING_WALL,
  height: 7,
} as const;

/** The doors inside, in the south wall: E there goes back out onto the street. */
export const BOWLING_DOOR_INSIDE = { x: 0, z: BOWLING_ROOM.maxZ - 0.4, width: 2.6 } as const;
/** Just inside the doors, facing into the centre (-z). */
export const BOWLING_ENTRY = { x: 0, z: BOWLING_ROOM.maxZ - 1.6, rotY: Math.PI } as const;

/** A box in interior coordinates. */
export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Who builds where. Each half puts its meshes, colliders and interactables only inside its own zone;
 * the walkways between them stay clear (the building's half may put pillars, plants and signs on the
 * walls round them, never in them). tests/bowling-plan.test.ts checks the zones don't overlap.
 *
 *   north (pins)                                             z -20.7
 *   +--------------------+--+------------------------------+
 *   |                    |  |                              |
 *   |   LANES (6)        |  |   MINIGOLF (own walls,       |
 *   |   pins north,      |W |   always black light)        |
 *   |   foul line z 1.8  |A |                              |
 *   |                    |L +--------door------------------+ z 1
 *   |                    |K    LOUNGE       |               |
 *   +--------------------+     (building)   |   KARAOKE     |
 *   |  BOWLERS (seats,   |                  |   bar, stage  |
 *   |  consoles, return) |                  |   on east wall|
 *   +--------------------+------------------+               | z 10
 *   |  COUNTER (beer, fries, shoes)   ENTRANCE              |
 *   +-----------------------------doors---------------------+ z 20.7
 *   west x -20.7                                     east x 20.7
 */
export const ZONES = {
  /** The bowling game: the lanes from the pin decks and the machines behind them to the end of the approaches. */
  lanes: { minX: BOWLING_ROOM.minX, maxX: -8, minZ: BOWLING_ROOM.minZ, maxZ: 6.4 },
  /** The bowling game too: behind the approaches, the bowlers' seats, the scoring consoles, the ball returns and racks. */
  bowlers: { minX: BOWLING_ROOM.minX, maxX: -8, minZ: 6.4, maxZ: 10 },
  /** The mini golf room, walls included (its own walls on the south and west, a door in the south wall, see MINIGOLF_DOOR). */
  minigolf: { minX: -5, maxX: BOWLING_ROOM.maxX, minZ: BOWLING_ROOM.minZ, maxZ: 1 },
  /** The karaoke bar: its stage against the east wall, its own little bar, tables. */
  karaoke: { minX: 4, maxX: BOWLING_ROOM.maxX, minZ: 1, maxZ: BOWLING_ROOM.maxZ - 3 },
  /** The building's half: the counter with the till, the beer taps and fries, and the shoe rental behind it. */
  counter: { minX: BOWLING_ROOM.minX, maxX: -8, minZ: 13, maxZ: BOWLING_ROOM.maxZ },
  /** The building's half: sofas, a couple of arcade machines, the cosmic bowling switch. */
  lounge: { minX: -5, maxX: 4, minZ: 1, maxZ: 10 },
} as const satisfies Record<string, Zone>;
export type ZoneId = keyof typeof ZONES;

/** The mini golf room's door, in its south wall (z = ZONES.minigolf.maxZ): its middle along x, how wide. */
export const MINIGOLF_DOOR = { x: 1, width: 2 } as const;

/** The six lanes, west to east: each lane's middle along x. The bowling game's (shared/bowling-game.ts has the lane's own measures). */
export const LANE_COUNT = 6;
export const LANE_PITCH = 1.9;
export const LANE_X: readonly number[] = Array.from({ length: LANE_COUNT }, (_, i) => -18.8 + i * LANE_PITCH);
/** Where the foul line runs across all the lanes, and where the head pin stands (18.29 m up the lane). */
export const FOUL_LINE_Z = 1.8;
export const HEAD_PIN_Z = FOUL_LINE_Z - 18.29;

// ---- Cosmic bowling ------------------------------------------------------------------------------

/**
 * The lights over the lanes, the lounge and the bar: `normal`, or `cosmic` (the house lights down, UV
 * tubes on, everything that glows glows). One switch for the whole centre, in the lounge (the
 * building's half keeps it, `bowling.lights` on the wire). The mini golf room is always black light,
 * whatever the switch says.
 */
export type BowlingLights = 'normal' | 'cosmic';

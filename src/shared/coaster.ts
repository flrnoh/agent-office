// DER BRECHER, the roller coaster wound round the office tower (flrnoh fork, see FORK.md "Der Brecher").
// What the page and the office share about it: where the station is on the roof, the train, the seats,
// the state everyone in the building gets, the messages, and the timings. The track itself is
// coaster-route.ts (the route round the building) and coaster-track.ts (the spline, its frames and the
// ride's physics): a pure function of how many storeys the building has, so every page works out the
// same track, and where the train is from the moment it was dispatched alone.

import { FLOOR, WALL_HEIGHT, WALL_T, type Opening } from './layout.js';

export const COASTER_NAME = 'DER BRECHER';

/**
 * The station, cantilevered off the north edge of the roof next to the DJ's stage, at deck level (the
 * roof's frame: the deck at y 0). The train stands with its middle at `stopX`, heading east (+x), on
 * the track at `trackZ`; the platform runs along its south (building) side from the facade out to
 * `edgeZ`, and the deck's railing has a gap at `gap` to walk onto it (the deck's north edge between the
 * stage and the elevator's housing).
 */
export const STATION = {
  x0: -7.4,
  x1: 7.4,
  stopX: 0,
  /** The rail line through the station (the cars stand on it). */
  trackY: 0.12,
  trackZ: FLOOR.minZ - WALL_T - 3.1,
  /** The platform: from the facade to the track's edge. */
  wallZ: FLOOR.minZ - WALL_T,
  edgeZ: FLOOR.minZ - WALL_T - 2.05,
  /** The far side's railing and the canopy's back posts, past the track. */
  farZ: FLOOR.minZ - WALL_T - 4.3,
  /** The gap in the deck's north railing onto the platform. */
  gap: { x0: 3.2, x1: 6.6 },
  /** Where you stand to board (E), in the middle of the platform. */
  boardAt: { x: 1.6, z: FLOOR.minZ - WALL_T - 1.1 },
  /** The ride photo's monitor and the records board, on the platform's wall end. */
  monitor: { x: -5.6, z: FLOOR.minZ - WALL_T - 0.35 },
  board: { x: -2.4, z: FLOOR.minZ - WALL_T - 0.35 },
} as const;

/**
 * The glass tube through the ground floor: in through its south wall heading north at x TUBE_X, out
 * through its north wall at x TUBE_OUT_X, under the ceiling. The holes it goes through in those walls
 * (only the ground floor's: `tubePortals(index)`), for the walls, the tower, the facade and the interiors.
 */
export const TUBE_X = 4.8;
export const TUBE_OUT_X = -16;
export const TUBE_PORTALS: readonly Opening[] = [
  { wall: 'south', u: TUBE_X, width: 3.1, y0: 3.75, y1: WALL_HEIGHT },
  { wall: 'north', u: TUBE_OUT_X, width: 3.1, y0: 3.75, y1: WALL_HEIGHT },
];
export const tubePortals = (index: number): readonly Opening[] => (index === 0 ? TUBE_PORTALS : []);

/** The gap in the roof's north railing (rooftop/world.ts leaves it open). */
export const COASTER_GAP = STATION.gap;

/** Four cars of two seats: car `i` of the train, seat `side` (0 left, 1 right) in it. */
export const CARS = 4;
export const SEATS = CARS * 2;
/** From one car's middle to the next (m), and how long a car is. */
export const CAR_PITCH = 2.45;
export const CAR_LENGTH = 2.2;
/** How far a car's middle is ahead of the train's middle along the track (car 0 is the front one). */
export const carOffset = (car: number) => ((CARS - 1) / 2 - car) * CAR_PITCH;
/** Across the car from its middle (m, along the track's binormal: + is the right-hand side). */
export const SEAT_SIDE = 0.34;
/** The seat's hips over the rail line, and where a rider's eyes are. */
export const SEAT_HIPS = 0.62;
export const EYE_UP = 1.32;
export const seatCar = (seat: number) => Math.floor(seat / 2);
export const seatSide = (seat: number) => (seat % 2 === 0 ? -1 : 1);

/** After the first one boards, the train waits this long for more (ms); then it goes. */
export const COUNTDOWN_MS = 9000;
/** Back in the station: the lap bars open, everyone off (ms). */
export const UNLOAD_MS = 2500;

export type CoasterPhase = 'load' | 'count' | 'ride';

export interface CoasterRider {
  /** Their socket's id (who they are on the roof and in the people list). */
  id: string;
  name: string;
  color: string;
  /** Hands up right now. */
  hands: boolean;
}

/** The leaderboard at the station: rides, and the longest anyone held their hands up through a ride. */
export interface CoasterLeader {
  name: string;
  rides: number;
  /** Their best hands-up time in one ride (s). */
  hands: number;
}

/** The ground floor's workers at their desks when the train went: the tunnel runs over their heads. */
export interface CoasterTypist {
  desk: string;
  name: string;
  color: string;
}

/**
 * The coaster as everyone in the building sees it (the track's seen from every floor and the street).
 * `at` is on the office's clock (ms): in `count` when the train goes, in `ride` when it went.
 */
export interface CoasterState {
  phase: CoasterPhase;
  at: number;
  /** How many storeys the track was laid for when the train went (the building's height then). */
  storeys: number;
  seats: (CoasterRider | null)[];
  /** Rides since the office started counting (coaster.json). */
  rides: number;
  /** Which ride this is (the photo's number). */
  ride: number;
  leaders: CoasterLeader[];
  typists: CoasterTypist[];
}

export const NO_COASTER: CoasterState = { phase: 'load', at: 0, storeys: 1, seats: Array(SEATS).fill(null), rides: 0, ride: 0, leaders: [], typists: [] };

export type CoasterClientMsg =
  /** Get in at the station (any free seat, or `seat` if it's free), while the train's in. */
  | { t: 'coaster.board'; seat?: number }
  /** Get out again before it goes. */
  | { t: 'coaster.leave' }
  /** Hands up (or down) while riding. */
  | { t: 'coaster.hands'; up: boolean };

export type CoasterServerMsg = { t: 'coaster'; state: CoasterState };

export const isCoasterMsg = (t: string): t is CoasterClientMsg['t'] => t === 'coaster.board' || t === 'coaster.leave' || t === 'coaster.hands';

/** The office clock's day, YYYY-MM-DD in its local time. */
export function coasterDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

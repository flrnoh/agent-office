// Where a storey's balconies hang (flrnoh fork, see FORK.md and shared/storey.ts). The bottom floor
// has one, off the south wall over the garage entrance (layout.ts's BALCONY); every floor above has its
// own: off another stretch of the south wall, or round the side of the building, off the east or the
// west wall, and now and then a second, smaller one on another side. The north wall is the boards',
// the elevator's and the back office's, with no room for a door.
//
// Each balcony is the bottom floor's turned onto its wall and slid along it: in its own frame, the
// bottom floor's coordinates (the doors' middle at x = BALCONY_DOOR.u, the wall's inside face at
// z = FLOOR.maxZ, out is +z), so what stands on the bottom floor's balcony (the bench, the ashtray, the
// tee, the lamp poles) stands on every furnished one the same way, turned with it. `balconyAt` takes a
// point in that frame to where it is on the floor; `balconyLocal` brings it back.

import { BALCONY, BALCONY_DOOR, EXIT_STAIRS, FLOOR, WALL_T, type Opening } from './layout.js';

/** The walls a balcony can hang off. */
export type BalconyWall = 'south' | 'east' | 'west';

/** A balcony's footprint, outside its wall. */
export interface BalconyRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Pt2 {
  x: number;
  z: number;
}

export interface Balcony {
  /** Which spot of SPOTS it hangs at. */
  spot: string;
  wall: BalconyWall;
  /** Its glass doors, in its wall. */
  door: Opening;
  /** Its deck, on the floor (axis-aligned: it's only ever turned a quarter at a time). */
  rect: BalconyRect;
  /** The deck in its own frame: from `a0` to `a1` along the wall from the doors' middle, `depth` out from the wall. */
  a0: number;
  a1: number;
  depth: number;
  /** The one with the bench, the stools, the ashtray, the lamps and the tee (the others are a deck, a railing and plants). */
  furnished: boolean;
  /** How far it's turned from the bottom floor's (about +y, as three.js turns things): 0 south, π/2 east, -π/2 west. */
  turn: number;
}

/** The building, walls included: no deck reaches past its corners. */
const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T } as const;

const TURN: Record<BalconyWall, number> = { south: 0, east: Math.PI / 2, west: -Math.PI / 2 };

/** Where the wall's inside face meets the doors' middle `u`, on the floor. */
function anchor(wall: BalconyWall, u: number): Pt2 {
  if (wall === 'south') return { x: u, z: FLOOR.maxZ };
  return wall === 'east' ? { x: FLOOR.maxX, z: u } : { x: FLOOR.minX, z: u };
}

/** cos and sin of a quarter turn, exactly. */
function cs(turn: number): [number, number] {
  return [Math.round(Math.cos(turn)), Math.round(Math.sin(turn))];
}

/** Point (x, z) of the bottom floor's balcony, as it is on `b`. */
export function balconyAt(b: Pick<Balcony, 'wall' | 'door' | 'turn'>, x: number, z: number): Pt2 {
  const [c, s] = cs(b.turn);
  const a = x - BALCONY_DOOR.u;
  const o = z - FLOOR.maxZ;
  const p = anchor(b.wall, b.door.u);
  return { x: p.x + a * c + o * s, z: p.z - a * s + o * c };
}

/** Point (x, z) on the floor, in `b`'s own frame (the bottom floor's balcony's coordinates). */
export function balconyLocal(b: Pick<Balcony, 'wall' | 'door' | 'turn'>, x: number, z: number): Pt2 {
  const [c, s] = cs(b.turn);
  const p = anchor(b.wall, b.door.u);
  const dx = x - p.x;
  const dz = z - p.z;
  return { x: BALCONY_DOOR.u + dx * c - dz * s, z: FLOOR.maxZ + dx * s + dz * c };
}

/** A heading (rotY) on the bottom floor's balcony, as it is on `b`. */
export function balconyYaw(b: Pick<Balcony, 'turn'>, rotY: number): number {
  return rotY + b.turn;
}

/** A box on the bottom floor's balcony, as it is on `b` (still axis-aligned). */
export function balconyBox<T extends BalconyRect>(b: Pick<Balcony, 'wall' | 'door' | 'turn'>, box: T): T {
  const p = balconyAt(b, box.minX, box.minZ);
  const q = balconyAt(b, box.maxX, box.maxZ);
  return { ...box, minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minZ: Math.min(p.z, q.z), maxZ: Math.max(p.z, q.z) };
}

/** Straight out from `b`'s wall, and along it the way its own frame's +x runs. */
export function balconyAxes(b: Pick<Balcony, 'turn'>): { out: Pt2; along: Pt2 } {
  const [c, s] = cs(b.turn);
  return { out: { x: s, z: c }, along: { x: c, z: -s } };
}

/** `b`'s deck in its own frame (the bottom floor's balcony's coordinates). */
export function localRect(b: Pick<Balcony, 'a0' | 'a1' | 'depth'>): BalconyRect {
  return { minX: BALCONY_DOOR.u + b.a0, maxX: BALCONY_DOOR.u + b.a1, minZ: BALCONY.minZ, maxZ: BALCONY.minZ + b.depth };
}

/** Whether (x, z) is out on `b`, give or take `slack` round its railing and `inward` back in through its wall. */
export function nearDeck(b: Balcony, x: number, z: number, slack = 0, inward = slack): boolean {
  const p = balconyLocal(b, x, z);
  const r = localRect(b);
  return p.x > r.minX - slack && p.x < r.maxX + slack && p.z > r.minZ - inward && p.z < r.maxZ + slack;
}

/**
 * Where a balcony can hang: its wall, its doors' middle `u` along it, how wide its doors may be, and
 * how far along the wall (`lo`..`hi`, x on the south wall, z on the side ones) its deck may reach. Each
 * is where there's a free stretch of wall inside for its doors, between what stands against it:
 * - `south-mid`, the bottom floor's: between the bookshelf and the window east of it.
 * - `south-west`: where the west window of the middle two is, between the kitchen and the bookshelf.
 * - `south-east`: where the east window is, short of the stairs up to the loft.
 * - `west`: where the middle window of the west wall was, just short of the ladder and clear of the
 *   bean bag that comes out under that window, so its doors are a little narrower; its deck stays
 *   north of the exit door's landing and stairs (the fire escape).
 * - `east`: between the Services board and the TV, so its doors are narrower.
 */
export const SPOTS: readonly { id: string; wall: BalconyWall; u: number; width: number; lo: number; hi: number }[] = [
  { id: 'south-mid', wall: 'south', u: BALCONY_DOOR.u, width: BALCONY_DOOR.width, lo: B.minX, hi: B.maxX },
  { id: 'south-west', wall: 'south', u: -9, width: 3, lo: B.minX, hi: B.maxX },
  { id: 'south-east', wall: 'south', u: 0, width: 3, lo: B.minX, hi: B.maxX },
  { id: 'west', wall: 'west', u: -1.9, width: 2.4, lo: B.minZ, hi: EXIT_STAIRS.landingZ0 - 0.6 },
  { id: 'east', wall: 'east', u: -4.25, width: 1.7, lo: B.minZ, hi: B.maxZ },
];
export type Spot = (typeof SPOTS)[number];

/** The furnished balcony's deck reaches at least this far either side of its doors (the bottom floor's), so everything on it fits. */
export const FURNISHED_REACH = BALCONY_DOOR.u - BALCONY.minX;
/** A plain balcony: its deck either side of its doors, at least, how deep it is, and its doors at most. */
export const PLAIN = { reach: 2.2, depth: 1.8, door: 1.6 } as const;

/** How much further than `a0`..`a1` the deck may reach at `spot`, at its near (-a) and far (+a) ends. */
export function room(spot: Spot, a0: number, a1: number): [number, number] {
  // Along the wall, the deck runs from u + a0 to u + a1 (south, west), or from u - a1 to u - a0 (east).
  if (spot.wall === 'east') return [spot.hi - (spot.u - a0), spot.u - a1 - spot.lo];
  return [spot.u + a0 - spot.lo, spot.hi - (spot.u + a1)];
}

/** A balcony at `spot`, its doors `width` wide, its deck from `a0` to `a1` along the wall and `depth` deep. */
export function makeBalcony(spot: Spot, width: number, a0: number, a1: number, depth: number, furnished: boolean): Balcony {
  const door: Opening = { wall: spot.wall, u: spot.u, width, y0: BALCONY_DOOR.y0, y1: BALCONY_DOOR.y1 };
  const frame = { wall: spot.wall, door, turn: TURN[spot.wall] };
  const rect = balconyBox(frame, { minX: BALCONY_DOOR.u + a0, maxX: BALCONY_DOOR.u + a1, minZ: BALCONY.minZ, maxZ: BALCONY.minZ + depth });
  return { spot: spot.id, ...frame, rect, a0, a1, depth, furnished };
}

/** The bottom floor's balcony: exactly layout.ts's. */
export const GROUND_BALCONY: Balcony = {
  spot: 'south-mid',
  wall: 'south',
  door: BALCONY_DOOR,
  rect: { ...BALCONY },
  a0: BALCONY.minX - BALCONY_DOOR.u,
  a1: BALCONY.maxX - BALCONY_DOOR.u,
  depth: BALCONY.maxZ - BALCONY.minZ,
  furnished: true,
  turn: 0,
};

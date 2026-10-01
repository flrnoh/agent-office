import type { SeatDef } from './layout.js';
import { GYM_DOOR, GYM_ENTRY, GYM_ROOM } from './gym.js';
import { CHANGING_DOOR, CHANGING_SEATING, changingFixtures } from './gym-changing.js';

/*
 * The gym's rooms, spa and fixtures (flrnoh fork, see FORK.md "Rooms, spa and detail"): where
 * everything that isn't a cardio or strength machine stands inside the gym, shared by the server
 * (which works out who is inside the walk-in sauna and steam room from where they stand, and what
 * sitting on their benches does) and the page (which builds all of it: world/gym/rooms.ts and
 * friends). Pure data and maths, so the tests can walk the floor plan.
 *
 * The plan (interior coordinates, the room is x 6.3..33.7, z 36.3..55.7, the street door north):
 *   - north: the cardio deck along the windows, the lobby with reception and turnstiles at the door
 *   - west wall: lockers and the changing-room door, the juice bar, a water fountain, towels, plates
 *   - middle: the strength floor (GYM_STATIONS, untouched here)
 *   - south: the stretch area with mats and rollers, and the functional turf lane along the wall
 *   - south-east: the wellness spa behind its own walls: the walk-in sauna and steam room, the
 *     jacuzzi, the cold plunge, relaxation loungers, and a massage room behind a curtain
 */

/** A rectangle on the gym's floor. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something solid standing on the floor: you walk round it (or, below STEP, up onto it). */
export interface Fixture extends Rect {
  id: string;
  /** How high it stands. */
  top: number;
  /** Where its underside is, for a ceiling (a cabin's roof). Defaults to the floor. */
  bottom?: number;
}

const R = GYM_ROOM;
/** How thick the spa's and the cabins' walls are. */
export const SPA_WALL = 0.15;
/** How high the spa's partition walls and the cabins stand (the hall's ceiling is far above). */
export const SPA_WALL_HEIGHT = 2.9;
export const CABIN_HEIGHT = 2.45;

/** The wellness spa: the south-east corner, walled off from the gym floor (walls included). */
export const SPA: Rect = { minX: 24.6, maxX: R.maxX, minZ: 42.0, maxZ: R.maxZ };
/** The way into the spa: a gap in its north wall, off the aisle behind the cardio deck. */
export const SPA_DOOR = { minX: 27.0, maxX: 28.6, z: SPA.minZ } as const;

/** A walk-in room: a cabin inside the spa you go into through a glass door. */
export interface WalkInRoom {
  /** The wellness station it is (GYM_STATIONS), whose game pays out while you're inside. */
  station: string;
  machine: 'sauna' | 'steam';
  name: string;
  /** The walls, outside to outside (the room's own east/south walls are the gym's). */
  outer: Rect;
  /** Between its walls: where you are "inside". */
  inner: Rect;
  /** The door in its west wall: its middle along z and how wide. */
  door: { x: number; z: number; width: number };
  /** Its benches (SEATING ids, with `gym`): sitting on one in here works a little better. */
  seats: readonly string[];
  /** The bucket (the sauna) or the eucalyptus bowl (the steam room): E there is an Aufguss. */
  pour: { x: number; z: number };
}

const cabin = (minZ: number, maxZ: number): { outer: Rect; inner: Rect } => ({
  outer: { minX: 29.3, maxX: R.maxX, minZ, maxZ },
  inner: { minX: 29.3 + SPA_WALL, maxX: R.maxX, minZ: minZ + SPA_WALL, maxZ },
});

export const SAUNA: WalkInRoom = {
  station: 'sauna',
  machine: 'sauna',
  name: 'Finnish sauna',
  ...cabin(50.6, R.maxZ),
  door: { x: 29.3 + SPA_WALL / 2, z: 52.25, width: 0.9 },
  seats: ['gym-sauna-low-e', 'gym-sauna-high-e', 'gym-sauna-low-s', 'gym-sauna-high-s'],
  pour: { x: 31.3, z: 51.1 },
};

export const STEAM: WalkInRoom = {
  station: 'steam',
  machine: 'steam',
  name: 'Steam room',
  ...cabin(46.25, 50.6),
  door: { x: 29.3 + SPA_WALL / 2, z: 48.35, width: 0.9 },
  seats: ['gym-steam-e', 'gym-steam-s'],
  pour: { x: 30.05, z: 46.85 },
};

export const WALK_INS: readonly WalkInRoom[] = [SAUNA, STEAM];
export const WALK_IN_BY_STATION = new Map(WALK_INS.map((r) => [r.station, r]));

/** Whether (x, z) is inside `r`, `margin` in from its edges (negative: that far out past them). */
export const inRect = (r: Rect, x: number, z: number, margin = 0) => x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin;

/**
 * The walk-in room someone standing (or sitting) at (x, z) is in, if any. `margin` > 0 asks for them
 * to be that far in (stepping through the door), < 0 lets them be that far out (so a step back into
 * the doorway doesn't count as leaving): the server uses both, so the edge doesn't flicker.
 */
export function walkInAt(x: number, z: number, margin = 0): WalkInRoom | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return WALK_INS.find((r) => inRect(r.inner, x, z, margin));
}
/** How far through the door you step before you count as in, and how far back out before you're out. */
export const WALK_IN_ENTER = 0.25;
export const WALK_IN_LEAVE = -0.2;

// ---- The Aufguss --------------------------------------------------------------------------------

/** How long the stones need between two Aufgüsse, per room, whoever pours. */
export const AUFGUSS_COOLDOWN_MS = 30_000;
/** How long an Aufguss's wave of heat lifts everyone's recovery in there, and by how much. */
export const AUFGUSS_BOOST_MS = 40_000;
export const AUFGUSS_BOOST = 1.5;
/** Sitting on a bench in a walk-in room recovers this much faster than standing about in it. */
export const BENCH_BONUS = 1.25;

/** How long until the next Aufguss can be poured (0: now), the last one having been at `lastAt` (0: never). */
export function aufgussWait(lastAt: number, now: number): number {
  if (!lastAt) return 0;
  return Math.max(0, lastAt + AUFGUSS_COOLDOWN_MS - now);
}

/** How much faster than the spot's own rate you recover right now: on a bench, and/or in an Aufguss's heat. */
export function walkInFactor(onBench: boolean, lastAufguss: number, now: number): number {
  const boosted = lastAufguss > 0 && now >= lastAufguss && now < lastAufguss + AUFGUSS_BOOST_MS;
  return (onBench ? BENCH_BONUS : 1) * (boosted ? AUFGUSS_BOOST : 1);
}

/** The id of the seat a peer's `seat` key names ("gym-sauna-low-e:1" → "gym-sauna-low-e"). */
export const seatIdOf = (key: string | undefined): string | undefined => (key ? /^([\w-]+):\d+$/.exec(key)?.[1] : undefined);

/** Whether a peer sitting on `seatKey` is on one of `room`'s benches. */
export const onBenchIn = (room: WalkInRoom, seatKey: string | undefined): boolean => {
  const id = seatIdOf(seatKey);
  return !!id && room.seats.includes(id);
};

// ---- Where the rest of the spa stands ------------------------------------------------------------

/** The jacuzzi: a round tub with a raised rim and steps up on its west side. */
export const JACUZZI = { x: 26.9, z: 52.9, r: 1.25, rim: 0.55 } as const;
/** The cold plunge: a square steel tub of ice water. */
export const PLUNGE = { x: 27.3, z: 48.3, half: 0.7, rim: 0.8 } as const;
/** The massage room: behind a curtain in the spa's north-east corner, two tables. */
export const MASSAGE_ROOM: Rect = { minX: 29.3, maxX: R.maxX, minZ: SPA.minZ + SPA_WALL, maxZ: STEAM.outer.minZ };
/** The gap in its curtain, drawn aside. */
export const MASSAGE_OPENING = { minZ: 43.75, maxZ: 44.85 } as const;
export const MASSAGE_TABLES = [
  { id: 'massage-1', x: 31.9, z: 43.05 },
  { id: 'massage-2', x: 31.9, z: 45.35 },
] as const;
/** How high the massage tables' tops stand (low enough for the masseur to work over). */
export const MASSAGE_TOP = 0.5;
/** The masseurs: one at the side of each table, in the gap between the two, facing their table. */
export const MASSEURS = MASSAGE_TABLES.map((t, i) => ({ table: t.id, x: t.x + 0.2, z: t.z + (i === 0 ? 0.6 : -0.6), rotY: i === 0 ? Math.PI : 0 }));
/** Relaxation loungers along the spa's west wall, looking east. */
export const LOUNGER_ZS = [43.1, 44.2, 45.3, 46.4] as const;
export const LOUNGER = { minX: SPA.minX + SPA_WALL + 0.1, length: 1.9, width: 0.7 } as const;

// ---- The rest of the gym -------------------------------------------------------------------------

/** The stretch area: mats and foam rollers south of the strength floor. */
export const STRETCH: Rect = { minX: 11.4, maxX: 24.2, minZ: 50.5, maxZ: 53.3 };
/** The functional turf lane along the south wall: sled, tyre, boxes, kettlebells, battle ropes. */
export const TURF: Rect = { minX: 11.0, maxX: SPA.minX, minZ: 53.5, maxZ: R.maxZ };
/** The lobby just inside the door: reception to the east, turnstiles in front. */
export const RECEPTION = { minX: 22.0, maxX: 24.3, minZ: R.minZ, maxZ: 38.9, counterX: 22.5, returnZ: 38.4 } as const;
export const TURNSTILE = { z: 37.9, posts: [18.5, 19.45, 20.55, 21.5] } as const;
/** The lockers and the changing-room door on the west wall, by the entrance. */
export const LOCKERS = { minZ: R.minZ, maxZ: 38.9, depth: 0.5 } as const;
export { CHANGING_DOOR };
/** The juice bar's counter along the west wall (shared/gym.ts JUICE_BAR is its station), and its stools. */
export const JUICE_COUNTER = { backMaxX: R.minX + 0.4, minX: 7.1, maxX: 7.7, minZ: 41.0, maxZ: 47.0, top: 1.1 } as const;
export const JUICE_STOOL_X = 8.15;
export const JUICE_STOOL_ZS = [41.8, 42.9, 44.0, 45.1, 46.2] as const;

/** The places to sit in the gym (SEATING has these, with `gym`): only in there (see seatHere). */
export const GYM_SEATING: SeatDef[] = [
  // The sauna: two tiers along the east wall and the south wall. The upper tier's feet rest on the lower.
  { id: 'gym-sauna-low-e', label: '🧖 Sauna bench', x: 32.45, y: 0, z: 52.4, rotY: -Math.PI / 2, places: [-1.2, 0, 1.2], hips: 0.47, depth: 0, out: 0.75, gym: true },
  { id: 'gym-sauna-high-e', label: '🧖 Top bench', x: 33.28, y: 0.45, z: 52.6, rotY: -Math.PI / 2, places: [-1.4, 0, 1.4], hips: 0.47, depth: 0, out: 0.85, gym: true },
  { id: 'gym-sauna-low-s', label: '🧖 Sauna bench', x: 31.0, y: 0, z: 54.45, rotY: Math.PI, places: [-0.5, 0.9], hips: 0.47, depth: 0, out: 0.8, gym: true },
  { id: 'gym-sauna-high-s', label: '🧖 Top bench', x: 31.0, y: 0.45, z: 55.28, rotY: Math.PI, places: [-1.0, 0.1, 1.2], hips: 0.47, depth: 0, out: 0.85, gym: true },
  // The steam room: tiled benches along the east and south walls.
  { id: 'gym-steam-e', label: '💨 Steam bench', x: 33.35, y: 0, z: 48.1, rotY: -Math.PI / 2, places: [-1.1, 0, 1.1], hips: 0.47, depth: 0, out: 0.75, gym: true },
  { id: 'gym-steam-s', label: '💨 Steam bench', x: 31.6, y: 0, z: 50.25, rotY: Math.PI, places: [-0.7, 0.7], hips: 0.47, depth: 0, out: 0.75, gym: true },
  // Relaxation loungers in the spa, a towel on each.
  ...LOUNGER_ZS.map((z, i) => ({ id: `gym-lounger-${i + 1}`, label: '🛋️ Lounger', x: LOUNGER.minX + 0.95, y: 0, z, rotY: Math.PI / 2, places: [0], hips: 0.42, depth: -0.15, out: 1.5, gym: true })),
  // The changing room's bench (shared/gym-changing.ts).
  ...CHANGING_SEATING,
  // The juice bar's stools, facing the counter.
  ...JUICE_STOOL_ZS.map((z, i) => ({ id: `gym-stool-${i + 1}`, label: '🥤 Bar stool', x: JUICE_STOOL_X, y: 0, z, rotY: -Math.PI / 2, places: [0], hips: 0.74, depth: 0, out: -0.7, gym: true })),
  // A bench by the lockers, and one along the spa's wall facing the strength floor.
  { id: 'gym-locker-bench', label: '🪑 Bench', x: 7.7, y: 0, z: 37.6, rotY: Math.PI / 2, places: [-0.5, 0.5], hips: 0.46, depth: 0, out: 0.7, gym: true },
  { id: 'gym-spa-bench', label: '🪑 Bench', x: 24.4, y: 0, z: 44.0, rotY: -Math.PI / 2, places: [-0.6, 0.6], hips: 0.46, depth: 0, out: 0.75, gym: true },
];

/** The walls of a walk-in cabin (outside its door), as fixtures: the west wall either side of the door, the north wall, and the roof. */
export function cabinWalls(r: WalkInRoom): Fixture[] {
  const o = r.outer;
  const d0 = r.door.z - r.door.width / 2;
  const d1 = r.door.z + r.door.width / 2;
  const top = CABIN_HEIGHT;
  return [
    { id: `${r.station}-wall-w1`, minX: o.minX, maxX: o.minX + SPA_WALL, minZ: o.minZ, maxZ: d0, top },
    { id: `${r.station}-wall-w2`, minX: o.minX, maxX: o.minX + SPA_WALL, minZ: d1, maxZ: o.maxZ, top },
    { id: `${r.station}-wall-n`, minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.minZ + SPA_WALL, top },
    // Above the door, and the roof: you can't jump out over the top.
    { id: `${r.station}-lintel`, minX: o.minX, maxX: o.minX + SPA_WALL, minZ: d0, maxZ: d1, bottom: 2.1, top },
    { id: `${r.station}-roof`, minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ, bottom: top, top: top + 0.12 },
  ];
}

/**
 * Everything solid in the gym besides the machines (GYM_STATIONS) and the room's own walls: the
 * page makes its colliders from these (world/gym/rooms.ts), the tests walk round them.
 */
export function gymFixtures(): Fixture[] {
  const f: Fixture[] = [];
  const S = SPA;
  const w = SPA_WALL;
  const h = SPA_WALL_HEIGHT;
  // The spa's partition: its west wall, and its north wall either side of the way in.
  f.push({ id: 'spa-wall-w', minX: S.minX, maxX: S.minX + w, minZ: S.minZ, maxZ: S.maxZ, top: h });
  f.push({ id: 'spa-wall-n1', minX: S.minX, maxX: SPA_DOOR.minX, minZ: S.minZ, maxZ: S.minZ + w, top: h });
  f.push({ id: 'spa-wall-n2', minX: SPA_DOOR.maxX, maxX: S.maxX, minZ: S.minZ, maxZ: S.minZ + w, top: h });
  for (const r of WALK_INS) f.push(...cabinWalls(r));
  // The massage room's curtain, drawn aside in the middle.
  const M = MASSAGE_ROOM;
  f.push({ id: 'curtain-1', minX: M.minX, maxX: M.minX + 0.08, minZ: M.minZ, maxZ: MASSAGE_OPENING.minZ, top: 2.3 });
  f.push({ id: 'curtain-2', minX: M.minX, maxX: M.minX + 0.08, minZ: MASSAGE_OPENING.maxZ, maxZ: M.maxZ, top: 2.3 });
  for (const t of MASSAGE_TABLES) f.push({ id: `table-${t.id}`, minX: t.x - 1.0, maxX: t.x + 1.0, minZ: t.z - 0.38, maxZ: t.z + 0.38, top: MASSAGE_TOP });
  for (const m of MASSEURS) f.push({ id: `masseur-${m.table}`, minX: m.x - 0.22, maxX: m.x + 0.22, minZ: m.z - 0.22, maxZ: m.z + 0.22, top: 1.7 });
  // Inside the sauna: the stove and its rail, and the benches in two tiers.
  f.push({ id: 'sauna-stove', minX: 30.05, maxX: 30.85, minZ: SAUNA.inner.minZ, maxZ: 51.45, top: 0.9 });
  f.push({ id: 'sauna-low-e', minX: 32.05, maxX: 32.85, minZ: SAUNA.inner.minZ, maxZ: 54.05, top: 0.45 });
  f.push({ id: 'sauna-high-e', minX: 32.85, maxX: R.maxX, minZ: SAUNA.inner.minZ, maxZ: R.maxZ, top: 0.9 });
  f.push({ id: 'sauna-low-s', minX: SAUNA.inner.minX, maxX: 32.85, minZ: 54.05, maxZ: 54.85, top: 0.45 });
  f.push({ id: 'sauna-high-s', minX: SAUNA.inner.minX, maxX: 32.85, minZ: 54.85, maxZ: R.maxZ, top: 0.9 });
  // Inside the steam room: the benches and the eucalyptus bowl on its pedestal.
  f.push({ id: 'steam-bench-e', minX: 33.0, maxX: R.maxX, minZ: STEAM.inner.minZ, maxZ: STEAM.inner.maxZ, top: 0.45 });
  f.push({ id: 'steam-bench-s', minX: 30.3, maxX: 33.0, minZ: 49.9, maxZ: STEAM.inner.maxZ, top: 0.45 });
  f.push({ id: 'steam-bowl', minX: STEAM.pour.x - 0.22, maxX: STEAM.pour.x + 0.22, minZ: STEAM.pour.z - 0.22, maxZ: STEAM.pour.z + 0.22, top: 0.9 });
  // The jacuzzi (a square round it: you can't walk the curve) and the cold plunge.
  const J = JACUZZI;
  f.push({ id: 'jacuzzi', minX: J.x - J.r, maxX: J.x + J.r, minZ: J.z - J.r, maxZ: J.z + J.r, top: J.rim });
  const P = PLUNGE;
  f.push({ id: 'plunge', minX: P.x - P.half, maxX: P.x + P.half, minZ: P.z - P.half, maxZ: P.z + P.half, top: P.rim });
  // Loungers, the towel shelf and a plant by the way in.
  for (const z of LOUNGER_ZS) f.push({ id: `lounger-${z}`, minX: LOUNGER.minX, maxX: LOUNGER.minX + LOUNGER.length, minZ: z - LOUNGER.width / 2, maxZ: z + LOUNGER.width / 2, top: 0.45 });
  f.push({ id: 'towel-shelf', minX: 25.0, maxX: 26.6, minZ: S.minZ + w, maxZ: S.minZ + w + 0.4, top: 1.4 });
  f.push({ id: 'spa-plant', minX: 28.75, maxX: 29.2, minZ: S.minZ + w + 0.05, maxZ: S.minZ + w + 0.5, top: 1.2 });
  // The lobby: reception (a counter facing the door, and its return), the turnstiles' posts.
  const Rc = RECEPTION;
  f.push({ id: 'reception', minX: Rc.minX, maxX: Rc.counterX, minZ: 36.9, maxZ: Rc.returnZ, top: 1.1 });
  f.push({ id: 'reception-return', minX: Rc.minX, maxX: Rc.maxX, minZ: Rc.returnZ, maxZ: Rc.maxZ, top: 1.1 });
  for (const x of TURNSTILE.posts) f.push({ id: `turnstile-${x}`, minX: x - 0.08, maxX: x + 0.08, minZ: TURNSTILE.z - 0.25, maxZ: TURNSTILE.z + 0.25, top: 1.0 });
  // The west wall: lockers and their bench, the juice bar, the fountain, towels, plates, medicine balls.
  f.push({ id: 'lockers', minX: R.minX, maxX: R.minX + LOCKERS.depth, minZ: LOCKERS.minZ, maxZ: LOCKERS.maxZ, top: 2.0 });
  f.push({ id: 'locker-bench', minX: 7.52, maxX: 7.88, minZ: 36.9, maxZ: 38.3, top: 0.45 });
  const C = JUICE_COUNTER;
  f.push({ id: 'juice-back', minX: R.minX, maxX: C.backMaxX, minZ: C.minZ, maxZ: C.maxZ, top: 1.0 });
  f.push({ id: 'juice-counter', minX: C.minX, maxX: C.maxX, minZ: C.minZ, maxZ: C.maxZ, top: C.top });
  f.push({ id: 'fountain', minX: R.minX, maxX: R.minX + 0.45, minZ: 47.65, maxZ: 48.25, top: 1.0 });
  f.push({ id: 'towel-rack', minX: R.minX, maxX: R.minX + 0.45, minZ: 48.6, maxZ: 49.5, top: 1.5 });
  f.push({ id: 'plate-rack', minX: R.minX, maxX: R.minX + 0.6, minZ: 49.9, maxZ: 51.6, top: 1.2 });
  f.push({ id: 'medball-rack', minX: R.minX, maxX: R.minX + 0.55, minZ: 54.0, maxZ: 55.5, top: 1.3 });
  // The stretch area's shelf of rollers and blocks (under the class timetable), and the spa-wall bench.
  f.push({ id: 'roller-shelf', minX: S.minX - 0.5, maxX: S.minX, minZ: 51.0, maxZ: 52.8, top: 1.0 });
  f.push({ id: 'spa-bench', minX: S.minX - 0.4, maxX: S.minX, minZ: 43.2, maxZ: 44.8, top: 0.45 });
  // The turf lane: sled, tyre, plyo boxes, the kettlebell rack.
  f.push({ id: 'sled', minX: 11.75, maxX: 12.65, minZ: 54.2, maxZ: 54.95, top: 0.7 });
  f.push({ id: 'tyre', minX: 14.0, maxX: 15.2, minZ: 54.0, maxZ: 55.2, top: 0.28 });
  f.push({ id: 'plyo-boxes', minX: 16.1, maxX: 17.1, minZ: 54.75, maxZ: 55.6, top: 0.75 });
  f.push({ id: 'kettlebell-rack', minX: 18.0, maxX: 19.8, minZ: 55.2, maxZ: R.maxZ, top: 0.7 });
  // Plants: by the door, and at the end of the juice bar.
  f.push({ id: 'plant-door', minX: 21.55, maxX: 21.95, minZ: R.minZ + 0.05, maxZ: R.minZ + 0.45, top: 1.3 });
  f.push({ id: 'plant-juice', minX: R.minX + 0.05, maxX: R.minX + 0.5, minZ: 40.35, maxZ: 40.8, top: 1.3 });
  // The changing room through the west wall, and the wall itself either side of its door.
  f.push(...changingFixtures());
  return f;
}

/** Where you stand when you come in (just inside the turnstiles): kept clear. */
export const ENTRY_SPOT = { x: GYM_ENTRY.x, z: GYM_ENTRY.z } as const;
export { GYM_DOOR };

// ---- Getting in: the jacuzzi, the plunge, the massage tables ---------------------------------------

/**
 * The spa's spots you get into rather than stand at (flrnoh fork): E there sits you down in the
 * jacuzzi's water (one of its four places), crouches you neck-deep in the plunge's ice, or lays you
 * face down on a massage table, and holds you there until you get out (client/gym.ts). The office
 * keeps who's in which place (WellnessView.slots), so everyone sees the same.
 */
export type SoakPose = 'tub' | 'plunge' | 'massage';
export interface SoakPlace {
  x: number;
  z: number;
  /** Which way they face (0: +z). */
  rotY: number;
  pose: SoakPose;
}
/** The water's surface in the jacuzzi and in the plunge. */
export const JACUZZI_WATER = JACUZZI.rim - 0.08;
export const PLUNGE_WATER = PLUNGE.rim - 0.14;
/** How far out from the jacuzzi's middle its places are, round its bench. */
const TUB_PLACE = 0.72;

/** Whether station `id` is one you get into. */
export const isSoak = (id: string) => id === 'hottub' || id === 'coldplunge' || MASSAGE_TABLES.some((t) => t.id === id);

/** Where place `slot` of station `id` has you, if it's one you get into. */
export function soakPlace(id: string, slot = 0): SoakPlace | undefined {
  if (id === 'hottub') {
    // Round the tub, each facing its middle.
    const a = Math.PI / 4 + (Math.max(0, slot) % 4) * (Math.PI / 2);
    return { x: JACUZZI.x + Math.cos(a) * TUB_PLACE, z: JACUZZI.z + Math.sin(a) * TUB_PLACE, rotY: Math.atan2(-Math.cos(a), -Math.sin(a)), pose: 'tub' };
  }
  if (id === 'coldplunge') return { x: PLUNGE.x, z: PLUNGE.z, rotY: -Math.PI / 2, pose: 'plunge' };
  const t = MASSAGE_TABLES.find((m) => m.id === id);
  // Face down along the table, the head on the face rest at its east end.
  return t ? { x: t.x, z: t.z, rotY: Math.PI / 2, pose: 'massage' } : undefined;
}

/** Where you step out to: down the jacuzzi's steps, beside the plunge, off the foot of the table. */
export function soakOff(id: string): { x: number; z: number; rotY: number } | undefined {
  if (id === 'hottub') return { x: JACUZZI.x - JACUZZI.r - 0.5, z: JACUZZI.z, rotY: Math.PI / 2 };
  if (id === 'coldplunge') return { x: PLUNGE.x - PLUNGE.half - 0.5, z: PLUNGE.z, rotY: Math.PI / 2 };
  const t = MASSAGE_TABLES.find((m) => m.id === id);
  return t ? { x: t.x - 1.45, z: t.z, rotY: Math.PI / 2 } : undefined;
}

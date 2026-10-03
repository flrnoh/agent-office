// The gym across the street (flrnoh fork, see FORK.md): a fully kitted-out fitness club with a
// wellness area, built the same way as the casino. Cardio machines, strength stations, a boxing
// bag, a stretch/yoga corner, a juice bar, and a wellness spa (sauna, steam room, jacuzzi, cold
// plunge, massage loungers). Nothing costs anything: you work out for fitness points (XP) and a
// place on the leaderboard, and the wellness area gives back the energy your workouts spend.
//
// Inside, the gym is a place of its own like the roof and the casino (GYM is a peer's `floor` while
// they're in there), so people from every floor meet at its machines. Outside, it stands on every
// floor's street, across from the office to the east (the casino is to the west).
//
// Shared by the server (the fitness profiles, the stations) and the client (the building, the
// windows). Its stations all speak the one generic protocol at the bottom of this file, so a new
// piece of equipment needs no new message types — exactly like the casino.

/** Where you are while you're in the gym (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const GYM = '@gym';
export const GYM_NAME = 'Gym';

/** The building's footprint on the street (walls included), south of the road, east of the golf hole. */
export const GYM_BOX = { minX: 6, maxX: 34, minZ: 36, maxZ: 56 } as const;
/** How tall its walls stand above the street, and how thick they are. */
export const GYM_HEIGHT = 9;
export const GYM_WALL = 0.3;
/** The front door, in the middle of its north face (toward the street): its center along x, and how wide. */
export const GYM_DOOR = { x: 20, width: 2.6, height: 2.9 } as const;
/**
 * Inside: the room between the walls, its floor at y 0 (the interior is its own scene, like the
 * roof, so it doesn't matter how far down the street is on your floor).
 */
export const GYM_ROOM = {
  minX: GYM_BOX.minX + GYM_WALL,
  maxX: GYM_BOX.maxX - GYM_WALL,
  minZ: GYM_BOX.minZ + GYM_WALL,
  maxZ: GYM_BOX.maxZ - GYM_WALL,
  height: 5.4,
} as const;
/** Where you stand when you come in, facing into the room (+z), and where you land outside when you leave, facing the street. */
export const GYM_ENTRY = { x: GYM_DOOR.x, z: GYM_ROOM.minZ + 2.4, rotY: 0 } as const;
/**
 * flrnoh fork: on the street the gym stands GYM_SHIFT further east than its interior's coordinates,
 * next to the padel hall (hall.ts HALL_BOX), which took the lot the gym was first planned on. The
 * interior is a scene of its own, so it keeps its coordinates; only the building outside moves.
 */
export const GYM_SHIFT = 52;
export const GYM_STREET_BOX = { minX: GYM_BOX.minX + GYM_SHIFT, maxX: GYM_BOX.maxX + GYM_SHIFT, minZ: GYM_BOX.minZ, maxZ: GYM_BOX.maxZ } as const;
export const GYM_STREET_DOOR = { ...GYM_DOOR, x: GYM_DOOR.x + GYM_SHIFT } as const;
export const GYM_STREET_SPOT = { x: GYM_STREET_DOOR.x, z: GYM_BOX.minZ - 1.8, rotY: Math.PI } as const;

/**
 * What kind of thing a station is, and so which window opens at it and which server game runs it.
 * Many pieces of equipment share a kind (all the treadmills, bikes and rowers are 'cardio'); the
 * station's `machine` says which one, so the one game and the one window cover them all.
 */
export type GymKind = 'cardio' | 'strength' | 'wellness' | 'juicebar' | 'radio';

/** A station (a machine, a bench, a sauna, the juice bar): where it stands and how many use it at once. */
export interface GymStationDef {
  id: string;
  kind: GymKind;
  /** Which exercise/machine it is within its kind (see gym-cardio, gym-strength, gym-wellness). */
  machine: string;
  name: string;
  x: number;
  z: number;
  /** Which way someone at it faces, as a facing angle (0 = +z, toward the room's south). */
  rotY: number;
  /** How many use it at once (a treadmill: 1; the sauna: several). */
  seats: number;
}

export const GYM_STATIONS: readonly GymStationDef[] = [
  // ---- Cardio deck, along the front (north) windows, facing them (‑z) --------------------------
  { id: 'treadmill-1', kind: 'cardio', machine: 'treadmill', name: 'Treadmill', x: 9.5, z: 39.2, rotY: Math.PI, seats: 1 },
  { id: 'treadmill-2', kind: 'cardio', machine: 'treadmill', name: 'Treadmill', x: 12.2, z: 39.2, rotY: Math.PI, seats: 1 },
  { id: 'treadmill-3', kind: 'cardio', machine: 'treadmill', name: 'Treadmill', x: 14.9, z: 39.2, rotY: Math.PI, seats: 1 },
  { id: 'bike-1', kind: 'cardio', machine: 'bike', name: 'Exercise bike', x: 25.1, z: 39.2, rotY: Math.PI, seats: 1 },
  { id: 'bike-2', kind: 'cardio', machine: 'bike', name: 'Exercise bike', x: 27.6, z: 39.2, rotY: Math.PI, seats: 1 },
  { id: 'rower-1', kind: 'cardio', machine: 'rower', name: 'Rowing machine', x: 30.4, z: 39.4, rotY: Math.PI, seats: 1 },
  { id: 'elliptical-1', kind: 'cardio', machine: 'elliptical', name: 'Cross-trainer', x: 17.6, z: 39.2, rotY: Math.PI, seats: 1 },
  // ---- The strength floor, down the middle -----------------------------------------------------
  { id: 'bench', kind: 'strength', machine: 'bench', name: 'Bench press', x: 10, z: 45, rotY: 0, seats: 1 },
  { id: 'squat', kind: 'strength', machine: 'squat', name: 'Squat rack', x: 10, z: 49, rotY: 0, seats: 1 },
  { id: 'deadlift', kind: 'strength', machine: 'deadlift', name: 'Deadlift platform', x: 14, z: 45, rotY: 0, seats: 1 },
  { id: 'legpress', kind: 'strength', machine: 'legpress', name: 'Leg press', x: 14, z: 49, rotY: 0, seats: 1 },
  { id: 'latpull', kind: 'strength', machine: 'latpull', name: 'Lat pulldown', x: 18, z: 45, rotY: 0, seats: 1 },
  { id: 'shoulder', kind: 'strength', machine: 'shoulder', name: 'Shoulder press', x: 18, z: 49, rotY: 0, seats: 1 },
  { id: 'cable', kind: 'strength', machine: 'cable', name: 'Cable machine', x: 22, z: 45, rotY: 0, seats: 1 },
  { id: 'dumbbell', kind: 'strength', machine: 'dumbbell', name: 'Dumbbells', x: 22, z: 49, rotY: 0, seats: 1 },
  { id: 'bag', kind: 'strength', machine: 'bag', name: 'Heavy bag', x: 9.5, z: 53, rotY: 0, seats: 1 },
  // ---- The stretch area, south of the strength floor (shared/gym-rooms.ts STRETCH) ---------------
  { id: 'yoga', kind: 'wellness', machine: 'yoga', name: 'Stretch studio', x: 17.8, z: 51.9, rotY: -Math.PI / 2, seats: 3 },
  // ---- The wellness spa, walled off in the south-east corner (shared/gym-rooms.ts) ---------------
  // The sauna and the steam room are walk-in cabins: you're in while you're inside (the server goes by
  // where you stand), so their seats are their benches' places.
  { id: 'sauna', kind: 'wellness', machine: 'sauna', name: 'Finnish sauna', x: 31.6, z: 53.2, rotY: -Math.PI / 2, seats: 11 },
  { id: 'steam', kind: 'wellness', machine: 'steam', name: 'Steam room', x: 31.6, z: 48.5, rotY: -Math.PI / 2, seats: 5 },
  { id: 'hottub', kind: 'wellness', machine: 'hottub', name: 'Jacuzzi', x: 26.9, z: 52.9, rotY: 0, seats: 4 },
  { id: 'coldplunge', kind: 'wellness', machine: 'coldplunge', name: 'Cold plunge', x: 27.3, z: 48.3, rotY: 0, seats: 1 },
  { id: 'massage-1', kind: 'wellness', machine: 'massage', name: 'Massage table', x: 31.9, z: 43.05, rotY: Math.PI / 2, seats: 1 },
  { id: 'massage-2', kind: 'wellness', machine: 'massage', name: 'Massage table', x: 31.9, z: 45.35, rotY: Math.PI / 2, seats: 1 },
  // ---- Down in the basement (shared/gym-basement.ts): walked (or swum) into, like the sauna ------
  { id: 'salt', kind: 'wellness', machine: 'salt', name: 'Salt grotto', x: 32.6, z: 44.1, rotY: Math.PI / 2, seats: 8 },
  { id: 'rest', kind: 'wellness', machine: 'rest', name: 'Quiet room', x: 15.0, z: 48.0, rotY: -Math.PI / 2, seats: 18 },
  { id: 'grotto', kind: 'wellness', machine: 'grotto', name: 'Whirlpool grotto', x: 37.4, z: 69.0, rotY: -Math.PI / 2, seats: 8 },
  { id: 'kneipp', kind: 'wellness', machine: 'kneipp', name: 'Kneipp walk', x: 32.9, z: 49.2, rotY: Math.PI / 2, seats: 4 },
  { id: 'lappool', kind: 'wellness', machine: 'lappool', name: 'Lap pool', x: 19.5, z: 69.0, rotY: Math.PI / 2, seats: 16 },
];
export const GYM_STATION_BY_ID = new Map(GYM_STATIONS.map((s) => [s.id, s]));

/** The juice bar's counter, along the west wall: your stats and the leaderboard, and a smoothie. */
export const JUICE_BAR = { id: 'juicebar', x: GYM_ROOM.minX + 1.1, z: 44, length: 6, seats: 3 } as const;

// ---- Fitness points, levels and energy ----------------------------------------------------------

/** Nobody's XP grows past this (a runaway number stays readable). */
export const MAX_XP = 1_000_000_000;
/** The highest level the curve goes to. */
export const MAX_LEVEL = 99;

/** Total XP needed to have reached `level` (level 1 is 0). A gently steepening curve. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 50 * (l - 1) * l;
}

/** The level `xp` puts you at (1…MAX_LEVEL). */
export function levelFor(xp: number): number {
  const x = Math.max(0, xp);
  // Invert xpForLevel: 50·(l−1)·l ≤ x  →  l = ⌊(1 + √(1 + 4x/50)) / 2⌋
  const l = Math.floor((1 + Math.sqrt(1 + (4 * x) / 50)) / 2);
  return Math.max(1, Math.min(MAX_LEVEL, l));
}

/** A friendly rank for a level, shown by your name and on the leaderboard. */
export function rankFor(level: number): string {
  if (level >= 90) return 'Legend';
  if (level >= 70) return 'Champion';
  if (level >= 50) return 'Beast';
  if (level >= 35) return 'Athlete';
  if (level >= 22) return 'Regular';
  if (level >= 12) return 'Rising';
  if (level >= 5) return 'Newcomer';
  return 'Rookie';
}

/** Energy: everyone's is capped here, workouts spend it, and the wellness area gives it back. */
export const STAMINA_MAX = 100;
/** How fast energy comes back on its own, per second, just from resting. */
export const STAMINA_REGEN = 100 / (40 * 60); // a full bar back in ~40 minutes of rest

/** Your fitness, as your own page and the leaderboard see it. */
export interface FitnessProfile {
  xp: number;
  level: number;
  rank: string;
  /** XP into the current level, and how much the level spans (for the bar). */
  levelXp: number;
  levelSpan: number;
  /** Energy right now (0…STAMINA_MAX). */
  stamina: number;
  /** Lifetime tallies. */
  totals: {
    workouts: number;
    meters: number;
    calories: number;
    volume: number;
    reps: number;
    relaxSecs: number;
  };
  /** Days in a row you've worked out, and whether today counts yet. */
  streak: number;
}

/** A line on the leaderboard. */
export interface LeaderRow {
  name: string;
  level: number;
  rank: string;
  xp: number;
  /** Whether this is you. */
  you?: boolean;
}

/** A smoothie at the juice bar: a quick energy top-up and a bit of flavour. */
export interface Smoothie {
  id: string;
  name: string;
  icon: string;
  /** Energy it gives back. */
  energy: number;
  note: string;
}

export const SMOOTHIES: readonly Smoothie[] = [
  { id: 'green', name: 'Green Machine', icon: '🥬', energy: 8, note: 'Spinach, apple, ginger.' },
  { id: 'berry', name: 'Berry Blast', icon: '🍓', energy: 10, note: 'Mixed berries and banana.' },
  { id: 'protein', name: 'Protein Punch', icon: '🥜', energy: 6, note: 'Peanut butter, oats, whey.' },
  { id: 'recovery', name: 'Recovery Shake', icon: '🥥', energy: 12, note: 'Coconut water and electrolytes.' },
];
export const SMOOTHIE_BY_ID = new Map(SMOOTHIES.map((s) => [s.id, s]));

/** What the server sends everyone about the juice bar: who's there and the leaderboard. */
export interface JuiceBarView {
  kind: 'juicebar';
  occupants: string[];
  seats: number;
  board: LeaderRow[];
}

// ---- The protocol -------------------------------------------------------------------------------
// You go in and out with floor.go (GYM, and back to your floor with `at` outside the door). At a
// station everything goes through three messages, whatever the equipment: each game says what its
// actions mean (`action`, `data`) and what its station looks like (`state`), so a new machine needs
// no new message types. Mirrors the casino's protocol exactly (shared/casino.ts).

export type GymClientMsg =
  /** Step onto/into a station (a machine, a bench, a sauna, the juice bar). You use one at a time. */
  | { t: 'gym.sit'; station: string }
  /** Step off whatever you're using. */
  | { t: 'gym.stand' }
  /** Do something at it: a set, a sprint, a splash of water on the stones… `action`/`data` are the game's own. */
  | { t: 'gym.act'; station: string; action: string; data?: unknown };

export type GymServerMsg =
  /** Your fitness: level, XP, energy and tallies. Sent when it moves. */
  | { t: 'gym.profile'; profile: FitnessProfile }
  /** A station as you see it (a game's own shape: see its module). Everyone in the gym gets every station's. */
  | { t: 'gym.station'; station: string; state: unknown }
  /** How it went: a toast, and whatever the station's window animates (`data`). `xp`: fitness points earned. */
  | { t: 'gym.result'; station: string; text: string; xp?: number; data?: unknown };

/** Whether `t` is one of the gym's messages (the server hands those to the gym). */
export const isGymMsg = (t: string): t is GymClientMsg['t'] => t === 'gym.sit' || t === 'gym.stand' || t === 'gym.act';

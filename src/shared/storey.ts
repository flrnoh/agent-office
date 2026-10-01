// Each storey's own cut (flrnoh fork, see FORK.md). Every floor of the building is a project, and in
// the real world no two would have the same layout. `storeyPlan(index)` is where each floor's lies:
// the same seats and fixtures (same ids, same counts, so the server's seating doesn't care which floor
// it is), laid out its own way. It's a pure function of the floor's index in the stack (0 is the bottom
// one), so the client and the server, and every player's screen, work out the same plan for a floor,
// and its deterministic play (golf, the basketball) stays in step. Floor 0's plan is layout.ts's
// constants; the floors above vary from them. Each is worked out once and kept.
//
// Not to be confused with shared/floorplan.ts (a floor's desk signs and how far its back office is
// built out, which people change) or world/office/build.ts's list of fixtures: this is the bare cut.

import { ASHTRAY, BALCONY, BALCONY_DOOR, DESK_BY_ID, DESK_CLUSTERS_X, DESK_PODS, DESKS, GOLF_TEE, PARACHUTE, SEATING_BY_ID, WINDOWS, WING_DESKS, buildDesks, deskBuilt, type DeskDef, type Opening, type SeatPlace, type Side } from './layout.js';
import { mulberry32 } from './rng.js';
import { FURNISHED_REACH, GROUND_BALCONY, PLAIN, SPOTS, nearDeck, balconyAt, balconyAxes, balconyYaw, makeBalcony, room, type Balcony, type BalconyRect, type Pt2 } from './balconies.js';

export type { Balcony, BalconyRect, Pt2 } from './balconies.js';

/** Leaving off the balcony by parachute (see PARACHUTE), on this storey: which way is out, and along. */
export interface Jump {
  /** At the railing, straight out from the doors, where a worker climbs up and over. */
  jump: Pt2;
  /** Up on the top rail, straight out from `jump`. */
  rail: Pt2;
  railTop: number;
  /** The chute comes down `out` further out than it opened, and a random bit of `east` along. */
  out: number;
  east: readonly [number, number];
  /** Straight out from the wall, and along it. */
  dir: Pt2;
  side: Pt2;
}

/** One storey's layout: its desks, its balconies (and so its windows) and an accent wall vary, the rest is the same on every floor. */
export interface StoreyPlan {
  /** The room's worker desks, `desk-1`..`desk-16`: the same ids on every floor, laid out per floor. */
  desks: DeskDef[];
  /** Any place a worker can be by id (seats, the back office's, kiosks, meeting chairs, the boss desk), with this floor's desks. */
  deskById: Map<string, DeskDef>;
  /** Which of the four desk pods (in DESKS' order, four desks each) are turned a quarter, and which way: 0 for not. */
  podTurns: number[];
  /** Every balcony on this storey: the furnished one first. */
  balconies: Balcony[];
  /** The furnished balcony's deck: the smoking balcony. */
  balcony: BalconyRect;
  /** Its glass doors. */
  balconyDoor: Opening;
  /** The ashtray on it, where a smoke break starts. */
  ashtray: Pt2;
  /** The golf tee on it, its ball and the bag behind it, and the way straight out from it (0 is south, +z). */
  golfTee: { x: number; z: number; size: number; ball: Pt2; bag: Pt2; turn: number };
  /** Leaving off it by parachute. */
  parachute: Jump;
  /** The windows in the outside walls: the bottom floor's, but for where a balcony's doors are, and one more where the bottom floor's doors are when this floor has none there. */
  windows: Opening[];
  /** One inside wall painted its own color, or none (the bottom floor). */
  accent: { wall: Side; color: string } | null;
  /** How far round the rugs' colors are turned (see world/office/room.ts). */
  rugShift: number;
}
const PLANS = new Map<number, StoreyPlan>();

/**
 * A little deterministic randomness for floor `index`, seeded from it alone (the same LCG the tower
 * uses): every page, and the server, works out the same numbers for a floor.
 */
function storeyRandom(index: number): () => number {
  let seed = (Math.imul(index + 1, 2654435761) ^ 0x9e3779b9) >>> 0;
  seed = seed % 2147483647 || 1;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** The colors an accent wall comes in: muted, so they sit with any of the floor palettes. */
const ACCENTS = ['#e07a5f', '#81b29a', '#3d5a80', '#f2cc8f', '#9d7bb0', '#2a9d8f', '#d4a373', '#6d8fb3'];
const ACCENT_WALLS: Side[] = ['north', 'south', 'east', 'west'];

/** Whether window `w` is in the way of doors `d`, or too near them. */
const inTheWay = (w: Opening, d: Opening) => w.wall === d.wall && w.y0 < d.y1 && Math.abs(w.u - d.u) < (w.width + d.width) / 2 + 0.3;

/** The windows of a storey with `balconies`: none where a balcony's doors are, and one where the bottom floor's doors are when that's wall here. */
function windowsFor(balconies: Balcony[]): Opening[] {
  const doors = balconies.map((b) => b.door);
  const windows = WINDOWS.filter((w) => !doors.some((d) => inTheWay(w, d)));
  if (!balconies.some((b) => b.spot === GROUND_BALCONY.spot)) windows.push({ wall: 'south', u: BALCONY_DOOR.u, width: 2.4, y0: 1.1, y1: 3.3 });
  return windows;
}

/** The furnished balcony's things, as `b` has them: the ashtray, the tee, the way off it by parachute. */
function furnish(b: Balcony): Pick<StoreyPlan, 'ashtray' | 'golfTee' | 'parachute'> {
  const at = (p: Pt2) => balconyAt(b, p.x, p.z);
  const { out, along } = balconyAxes(b);
  const jump = at(PARACHUTE.jump);
  return {
    ashtray: at(ASHTRAY),
    golfTee: { ...GOLF_TEE, ...at(GOLF_TEE), ball: at(GOLF_TEE.ball), bag: at(GOLF_TEE.bag), turn: b.turn },
    parachute: { ...PARACHUTE, jump, rail: at({ x: PARACHUTE.jump.x, z: BALCONY.maxZ - 0.06 }), dir: out, side: along },
  };
}

/** Puts a plan together from a floor's desks and balconies. */
function makePlan(desks: DeskDef[], podTurns: number[], balconies: Balcony[], accent: StoreyPlan['accent'], rugShift: number): StoreyPlan {
  const deskById = new Map(DESK_BY_ID);
  for (const d of desks) deskById.set(d.id, d);
  const main = balconies[0];
  return { desks, deskById, podTurns, balconies, balcony: main.rect, balconyDoor: main.door, ...furnish(main), windows: windowsFor(balconies), accent, rugShift };
}

/** The bottom floor, as it always was. */
function groundPlan(): StoreyPlan {
  const plan = makePlan(DESKS, [0, 0, 0, 0], [GROUND_BALCONY], null, 0);
  return { ...plan, ashtray: ASHTRAY, golfTee: { ...GOLF_TEE, turn: 0 }, windows: WINDOWS };
}

/** Turns pod `i` of `desks` (four desks, two back to back each side) a quarter `turn` round its middle. */
function turnPod(desks: DeskDef[], i: number, turn: number) {
  const four = desks.slice(i * 4, i * 4 + 4);
  const cx = four.reduce((n, d) => n + d.x, 0) / 4;
  const cz = four.reduce((n, d) => n + d.z, 0) / 4;
  const s = Math.sign(turn);
  for (const d of four) {
    const dx = d.x - cx;
    const dz = d.z - cz;
    // A quarter turn about +y, as three.js turns things: (x, z) → (z, -x) for +π/2.
    Object.assign(d, { x: cx + dz * s, z: cz - dx * s, rotY: d.rotY + turn });
  }
}

/**
 * How floor `key` (1 and up) differs from floor 0, and from the floor below it:
 * - The desk pods sit a little differently, and now and then one is turned a quarter, its rows facing
 *   east and west.
 * - Its balcony hangs somewhere else than the floor below's (see SPOTS in shared/balconies.ts): another
 *   stretch of the south wall, or round the side, reaching its own way along the wall. Now and then
 *   there's a second, plain one on another side. Its windows make way for their doors.
 * - One of its inside walls is painted a color of its own, and its rugs are other colors.
 */
function variedPlan(key: number): StoreyPlan {
  const rnd = storeyRandom(key);
  const span = (mid: number, half: number) => mid + (rnd() * 2 - 1) * half;
  // The clusters slide a little across, and each pod up or down the room; each pod's rows stay back to
  // back, so it still reads as an office of desks.
  const clusterX = DESK_CLUSTERS_X.map((x) => span(x, 1.2));
  const pods = DESK_PODS.map((p) => {
    const c = span((p.back + p.front) / 2, 0.8);
    return { back: c - 0.55, front: c + 0.55 };
  });
  const desks = buildDesks(clusterX, pods);
  // The rest from a stream of its own, so the pods sit where they did before this came in.
  const pick = mulberry32(Math.imul(key, 0x9e3779b1) ^ 0x52b8c767);
  const podTurns = [0, 1, 2, 3].map(() => (pick() < 0.35 ? (pick() < 0.5 ? 1 : -1) * (Math.PI / 2) : 0));
  podTurns.forEach((t, i) => t && turnPod(desks, i, t));

  // The furnished balcony: anywhere but where the floor below has its own.
  const below = storeyPlan(key - 1).balconies[0].spot;
  const spots = SPOTS.filter((s) => s.id !== below);
  const spot = spots[Math.floor(pick() * spots.length)];
  const [near, far] = room(spot, -FURNISHED_REACH, FURNISHED_REACH);
  const main = makeBalcony(spot, spot.width, -FURNISHED_REACH - pick() * Math.min(2, near), FURNISHED_REACH + pick() * Math.min(2, far), BALCONY.maxZ - BALCONY.minZ, true);
  const balconies = [main];
  // Now and then a second, plain one, on another wall.
  const others = SPOTS.filter((s) => s.wall !== spot.wall);
  if (pick() < 0.45 && others.length) {
    const s = others[Math.floor(pick() * others.length)];
    const [n, f] = room(s, -PLAIN.reach, PLAIN.reach);
    balconies.push(makeBalcony(s, Math.min(PLAIN.door, s.width), -PLAIN.reach - pick() * Math.min(0.8, n), PLAIN.reach + pick() * Math.min(0.8, f), PLAIN.depth, false));
  }

  const accent = { wall: ACCENT_WALLS[Math.floor(pick() * ACCENT_WALLS.length)], color: ACCENTS[Math.floor(pick() * ACCENTS.length)] };
  return makePlan(desks, podTurns, balconies, accent, 1 + Math.floor(pick() * 3));
}

/** The plan of floor `index` (0 is the bottom one), worked out once and kept. Floor 0 is layout.ts's constants. */
export function storeyPlan(index: number): StoreyPlan {
  const key = Math.max(0, Math.trunc(index) || 0);
  let plan = PLANS.get(key);
  if (!plan) {
    plan = key === 0 ? groundPlan() : variedPlan(key);
    PLANS.set(key, plan);
  }
  return plan;
}

/** Every desk on floor `index`, built out `wing` rows: the room's (as this floor lays them out), then the back office's. */
export function storeyDesks(index: number, wing: number): DeskDef[] {
  return [...storeyPlan(index).desks, ...WING_DESKS.filter((d) => deskBuilt(d, wing))];
}

/** The seats out on the furnished balcony (see SEATING): they go where it goes. */
export const BALCONY_SEATS: readonly string[] = ['bench', 'stool-1', 'stool-2'];

/** A seat out on the balcony as it stands on floor `index`, turned with its balcony; any other seat as it is. */
export function storeySeat<P extends Pick<SeatPlace, 'seatId' | 'x' | 'z' | 'rotY'>>(place: P, index: number): P;
export function storeySeat<P extends Pick<SeatPlace, 'seatId' | 'x' | 'z' | 'rotY'>>(place: P | undefined, index: number): P | undefined;
export function storeySeat<P extends Pick<SeatPlace, 'seatId' | 'x' | 'z' | 'rotY'>>(place: P | undefined, index: number): P | undefined {
  if (!place || !BALCONY_SEATS.includes(place.seatId)) return place;
  const b = storeyPlan(index).balconies[0];
  if (b === GROUND_BALCONY) return place;
  return { ...place, ...balconyAt(b, place.x, place.z), rotY: balconyYaw(b, place.rotY) };
}

/** Where the balcony seat `id` stands on floor `index` (its middle, as SEATING has it), and the way it faces. */
export function balconySeatAt(id: string, index: number): { x: number; z: number; rotY: number } {
  const s = SEATING_BY_ID.get(id)!;
  return storeySeat({ seatId: id, x: s.x, z: s.z, rotY: s.rotY }, index);
}

/** The one of floor `index`'s balconies (x, z) is out on, give or take `slack` round its railing and `inward` back in through its wall. */
export function onBalcony(x: number, z: number, index: number, slack = 0, inward = slack): Balcony | undefined {
  return storeyPlan(index).balconies.find((b) => nearDeck(b, x, z, slack, inward));
}

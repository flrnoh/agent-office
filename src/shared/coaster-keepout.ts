// What DER BRECHER has to keep clear of (flrnoh fork, see FORK.md "Der Brecher"), as boxes in the roof's
// frame (the deck at y 0, the street roofDrop(storeys) below) for a building `storeys` tall: the tower
// and every storey's balconies, the facade's landmarks, the bungee's jetty and its jumper's fall, the
// trees and lamps round the building, the side streets, the halls across the street; and inside the
// ground floor, where the tube runs, what hangs from its ceiling and what stands tall. The supports are
// placed clear of them (coaster-supports.ts) and tests/coaster.test.ts checks the track and every
// support against all of them, for one storey to eight.

import { FLOOR, STOREY, WALL_HEIGHT, WALL_T, roofDrop } from './layout.js';
import { storeyPlan } from './storey.js';
import { BUNGEE, ANCHOR } from './bungee.js';
import { CASINO_BOX } from './casino.js';
import { GYM_STREET_BOX } from './gym.js';
import { HALL_BOX } from './hall.js';
import { SOCCER_BOX } from './soccer.js';
import { GOLF_HOLE } from './layout.js';
import { routeStoreys } from './coaster-route.js';

export interface Box3 {
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const box = (name: string, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Box3 => ({ name, minX, maxX, minY, maxY, minZ, maxZ });

/** The building, walls, fins and corner lights included, up to the roof's railing (the track never crosses over the deck). */
export const TOWER = { minX: FLOOR.minX - WALL_T - 0.35, maxX: FLOOR.maxX + WALL_T + 0.35, minZ: FLOOR.minZ - WALL_T - 0.35, maxZ: FLOOR.maxZ + WALL_T + 0.8, maxY: 1.5 } as const;

/** The office's street (its road), and either side street's road and sidewalks: nothing of the coaster stands or runs there. */
export const ROAD_Z = { min: 23, max: 31 } as const;
export const SIDE_STREETS = [
  { minX: 23.5, maxX: 34 },
  { minX: -34, maxX: -23.5 },
] as const;
/** The office street's sidewalks: passers-by walk there, so nothing stands on them. */
export const SIDEWALKS_Z = [
  { min: 21, max: 23 },
  { min: 31, max: 33 },
] as const;
/** The bowling centre going up on the block east of the office (feat/bowling). */
export const BOWLING_BOX = { minX: 35, maxX: 77, minZ: -22, maxZ: 20 } as const;

/** The trees round the office (world/outside.ts): x, z, size. */
export const TREES: readonly (readonly [number, number, number])[] = [
  [-37, 22, 1.1],
  [-20.5, 22, 1],
  [20.5, 22, 1.05],
  [37, 22, 0.95],
  [-40, 32.5, 1.1],
  [-12, 32.5, 1],
  [42, 32.5, 1],
  [-21.6, -8, 1.2],
  [-21.4, 4, 1],
  [-21.6, 14, 0.9],
  [33.2, -6, 1.1],
  [33.2, 6, 1.25],
  [-12, -22, 1.2],
  [4, -24, 1],
  [23, -19, 1.1],
];
/** The street lamps along the office's street (world/outside.ts): near side at z 22.2 reaching out to +z, far side at 31.8 to -z. */
export const LAMPS_NEAR = [-62, -40, -19, -4, 8, 19, 40, 62] as const;
export const LAMPS_FAR = [-37, -22, -4, 1.5, 26, 46, 62, 82] as const;

/** Where the ground floor's floor is, and the street, for a building `storeys` tall (roof frame). */
export function levels(storeys: number): { street: number; ground: number; top: number } {
  const street = -roofDrop(routeStoreys(storeys));
  return { street, ground: street + 3.6, top: -WALL_T };
}

/** Everything outside the building the coaster keeps clear of (the building itself is TOWER). */
export function outsideKeepouts(storeys: number): Box3[] {
  const N = routeStoreys(storeys);
  const { street: S, ground, top } = levels(N);
  const out: Box3[] = [];
  // Every storey's balconies: their decks, railings, lamps and string lights.
  for (let k = 0; k < N; k++) {
    const y = ground + k * STOREY;
    for (const b of storeyPlan(k).balconies) out.push(box(`balcony ${k} ${b.spot}`, b.rect.minX - 0.15, b.rect.maxX + 0.15, y - 0.45, y + 3.2, b.rect.minZ - 0.1, b.rect.maxZ + 0.15));
  }
  // The exit door's landing and stairs down the west side.
  out.push(box('exit stairs', FLOOR.minX - WALL_T - 1.75, FLOOR.minX - WALL_T, S, ground + 3.4, 5.4, 12.9));
  // The facade's landmarks (world/facade/landmarks.ts).
  const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };
  out.push(box('CREATE blade', B.minX - 2.4, B.minX, ground + 0.6, ground + 7.4, B.maxZ, B.maxZ + 2.4));
  out.push(box('FLOGGE OFFICE letters', -17.2, 17.2, top + 0.2, top + 4.6, B.maxZ - 0.3, B.maxZ + 0.35));
  // The bulb and its rays fan out across the corner's diagonal; its arm reaches back to the corner below it.
  out.push(box('light bulb', B.minX - 5.3, B.minX + 0.1, top - 3.3, top + 6, B.minZ - 5.3, B.minZ + 0.1));
  out.push(box('light bulb arm', B.minX - 2.8, B.minX, top - 3.3, top - 1.6, B.minZ - 2.8, B.minZ));
  const plane = ground + Math.min(N - 1, 1) * STOREY + 4.2;
  out.push(box('paper plane', 11.0, 18.7, plane - 1.9, plane + 3.4, B.maxZ, B.maxZ + 6.7));
  out.push(box('pencil', B.maxX, B.maxX + 6.9, ground + 2.2, ground + 7.2, 4.9, 5.9));
  // The bungee: its jetty and gantry up top, and the jumper's fall down to the street.
  out.push(box('bungee jetty', BUNGEE.x - BUNGEE.halfWidth - 0.4, BUNGEE.x + BUNGEE.halfWidth + 0.4, top - 0.2, BUNGEE.deckY + ANCHOR.y + 1.4, B.maxZ, ANCHOR.z + 0.6));
  out.push(box('bungee jumper', BUNGEE.x - 0.6, BUNGEE.x + 0.6, S + 1.9, ANCHOR.y, ANCHOR.z - 1.85, ANCHOR.z + 1.85));
  // A back office built out on any floor stands on posts down to the street.
  out.push(box('back office', 13.0, B.maxX + 0.4, S, 0.35, B.minZ - 2 * 4.6 - 0.4, B.minZ));
  // The trees, and the street lamps.
  for (const [x, z, s] of TREES) {
    const r = 1.75 * s;
    out.push(box(`tree ${x},${z}`, x - r, x + r, S, S + 5.1 * s, z - r, z + r));
  }
  for (const x of LAMPS_NEAR) out.push(box(`lamp ${x},22.2`, x - 0.3, x + 0.3, S, S + 5.25, 21.95, 23.55));
  for (const x of LAMPS_FAR) out.push(box(`lamp ${x},31.8`, x - 0.3, x + 0.3, S, S + 5.25, 30.45, 32.05));
  // The side streets, all the way up, and the halls and fields across the street.
  for (const s of SIDE_STREETS) out.push(box('side street', s.minX, s.maxX, S - 1, S + 200, -200, 200));
  out.push(box('bowling centre', BOWLING_BOX.minX, BOWLING_BOX.maxX, S - 1, S + 40, BOWLING_BOX.minZ, BOWLING_BOX.maxZ));
  out.push(box('casino', CASINO_BOX.minX, CASINO_BOX.maxX, S - 1, S + 12, CASINO_BOX.minZ, CASINO_BOX.maxZ));
  out.push(box('gym', GYM_STREET_BOX.minX, GYM_STREET_BOX.maxX, S - 1, S + 12, GYM_STREET_BOX.minZ, GYM_STREET_BOX.maxZ));
  out.push(box('padel hall', HALL_BOX.minX, HALL_BOX.maxX, S - 1, S + 14, HALL_BOX.minZ, HALL_BOX.maxZ));
  out.push(box('soccer hall', SOCCER_BOX.minX, SOCCER_BOX.maxX, S - 1, S + 16, SOCCER_BOX.minZ, SOCCER_BOX.maxZ));
  out.push(box('golf', GOLF_HOLE.fairway[0] - 0.5, GOLF_HOLE.fairway[1] + 0.5, S - 1, S + 3, 33, GOLF_HOLE.z + GOLF_HOLE.green));
  return out;
}

/** Inside the ground floor (its frame: its floor at y 0), where the tube runs: what it must clear. */
export function groundFloorKeepouts(storeys: number): Box3[] {
  const N = routeStoreys(storeys);
  const out: Box3[] = [];
  // The speakers hanging from the ceiling (client/speakers.ts) and the cone lamps over the pods (world/office/room.ts).
  for (const [x, z] of [
    [-10.5, 0],
    [-1.5, 0],
    [-5, -10],
    [6.5, -8],
    [13.5, 3],
    [-14, 9],
    [-2, 9],
  ] as const)
    out.push(box(`speaker ${x},${z}`, x - 0.4, x + 0.4, WALL_HEIGHT - 1.75, WALL_HEIGHT, z - 0.4, z + 0.4));
  for (const [x, z] of [
    [-10.5, -4],
    [-1.5, -4],
    [-10.5, 4],
    [-1.5, 4],
    [13, 0],
  ] as const)
    out.push(box(`lamp ${x},${z}`, x - 0.65, x + 0.65, 3.4, WALL_HEIGHT, z - 0.65, z + 0.65));
  // The fire pole down from the floor above (only with one), the ladder, the loft, the elevator's shaft.
  if (N > 1) {
    out.push(box('fire pole', 6.8 - 0.3, 6.8 + 0.3, 0, WALL_HEIGHT, 1.6 - 0.3, 1.6 + 0.3));
    out.push(box('fire pole hole', 6.8 - 0.75, 6.8 + 0.75, WALL_HEIGHT - 0.4, WALL_HEIGHT, 1.6 - 0.75, 1.6 + 0.75));
  }
  out.push(box('ladder', FLOOR.minX, FLOOR.minX + 1.1, 0, WALL_HEIGHT, -0.7, 0.7));
  out.push(box('loft', 8.8, FLOOR.maxX, 2.8, WALL_HEIGHT, 7.8, FLOOR.maxZ));
  out.push(box('elevator shaft', 7.1, 9.9, 0, WALL_HEIGHT, FLOOR.minZ, -10.5));
  // Heads on the stairs up to the loft.
  for (let x = 3; x < 9; x += 1) out.push(box(`stairs ${x}`, x, x + 1, 0, ((x + 1 - 3) / 6) * 3 + 2.0, 11.1, FLOOR.maxZ));
  // On the walls: the TV and the Services board (east), the boards (north).
  out.push(box('TV', FLOOR.maxX - 0.4, FLOOR.maxX, 0, 4.05, -3.3, 3.3));
  out.push(box('services board', FLOOR.maxX - 0.3, FLOOR.maxX, 0.4, 3.75, -11.3, -5.1));
  out.push(box('north boards', -14.8, 7, 0.4, 3.95, FLOOR.minZ, FLOOR.minZ + 0.35));
  return out;
}

/** Whether boxes `a` and `b` overlap, with `pad` between them to spare. */
export function overlaps(a: Box3, b: Box3, pad = 0): boolean {
  return a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minY < b.maxY + pad && a.maxY > b.minY - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
}

/** Whether the point is in box `b`, give or take `pad`. */
export function inBox(b: Box3, x: number, y: number, z: number, pad = 0): boolean {
  return x > b.minX - pad && x < b.maxX + pad && y > b.minY - pad && y < b.maxY + pad && z > b.minZ - pad && z < b.maxZ + pad;
}

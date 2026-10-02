// Where everything of the cinema stands (flrnoh fork, see FORK.md "The cinema"), on its block of the
// city (landmarkBox('kino'), north-west behind the office): its walls, doors, the foyer's counter,
// the halls, their tiers and seats, as boxes in the world's x/z with heights over the street (0).
// The page builds what you see from it (client/world/kino/) and what you bump into, and the tests
// walk it (every seat and door reachable from the street).
//
// It faces east, onto the street at x = -28 that runs north from the office's street: the entrance
// with its marquee in the middle of the east front. Inside, the foyer runs along that front; behind
// it, Saal 1 (the big one, sloped rows facing its screen on the foyer's wall, doors either side of
// the screen) and Saal 2 (small and flat, armchairs facing its screen on the far wall, its door at
// the back).

import { landmarkBox } from './landmarks.js';

export interface KBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Bottom and top over the street. */
  bottom: number;
  top: number;
}

export interface KinoSeat {
  /** "kino1:r3s7" or "kino2:r1s2": its hall, row and place. */
  key: string;
  hall: 1 | 2;
  row: number;
  /** Where you sit (your feet's spot), how high the floor under it is, and which way you face. */
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** How high your hips are over that floor, and how far out in front you get up. */
  hips: number;
  out: number;
}

const L = landmarkBox('kino');
/** The building: well inside the block's sidewalks, with a forecourt on the street side for the marquee. */
export const KINO = { minX: L.x - 18, maxX: L.x + 16, minZ: L.z - 16, maxZ: L.z + 16 } as const;
/** Walls' thickness. */
export const KT = 0.3;
/** The foyer along the front, and its ceiling. */
export const FOYER = { minX: KINO.maxX - 12, maxX: KINO.maxX, minZ: KINO.minZ, maxZ: KINO.maxZ, h: 5 } as const;
/** The wall between the two halls. */
const SPLIT_Z = KINO.minZ + 13.5;
/** Saal 1 (the big one): behind the foyer, from the split to the south wall. */
export const SAAL1 = { minX: KINO.minX, maxX: FOYER.minX, minZ: SPLIT_Z, maxZ: KINO.maxZ, h: 10 } as const;
/** Saal 2 (the small one), north of it, with the projectionists' rooms behind its screen. */
export const SAAL2 = { minX: KINO.minX + 6, maxX: FOYER.minX, minZ: KINO.minZ, maxZ: SPLIT_Z, h: 7 } as const;
/** The entrance: glass doors in the middle of the east front, z from–to. */
export const ENTRANCE = { x: KINO.maxX, z: L.z, w: 4.4 } as const;

/** Saal 1's screen: on the foyer's wall, facing west into the hall (center, size). */
export const SCREEN1 = { x: SAAL1.maxX - KT / 2 - 0.35, y: 4.5, z: (SAAL1.minZ + SAAL1.maxZ) / 2, w: 12.4, h: 5.8 } as const;
/** Saal 2's: on its west wall, facing east. */
export const SCREEN2 = { x: SAAL2.minX + KT / 2 + 0.3, y: 3.3, z: (SAAL2.minZ + SAAL2.maxZ) / 2, w: 8, h: 4.5 } as const;

/** Doorways from the foyer: into Saal 1 either side of its screen, into Saal 2 at its back. */
export const HALL_DOORS = [
  { hall: 1 as const, x: FOYER.minX, z: SAAL1.maxZ - 1.5, w: 1.6 },
  { hall: 1 as const, x: FOYER.minX, z: SAAL1.minZ + 1.5, w: 1.6 },
  { hall: 2 as const, x: FOYER.minX, z: SAAL2.maxZ - 1.3, w: 1.6 },
];

/** Saal 1's rows: the first on the floor by the screen, each further one a step up and further back. */
export const ROWS1 = 10;
const ROW_DEPTH = 1.25;
export const ROW_RISE = 0.28;
/** Where the first row's tier begins (its east edge), with room in front of the screen. */
const FRONT1 = SCREEN1.x - 5.5;
/** A seat: its depth (back to front, a collider), and the gap between seats in a row. */
const SEAT_DEPTH = 0.45;
const PITCH1 = 0.68;
const PER_SIDE1 = 9;
/** The aisle down the middle of Saal 1. */
const AISLE1 = 1.4;

/** Tier `k`'s east edge (rows go west, up from the screen). */
const tierEdge = (k: number) => FRONT1 - ROW_DEPTH * k;
/** The floor under row `k` of Saal 1. */
export const rowY = (k: number) => ROW_RISE * k;

/** Saal 2's armchairs: rows from the screen back toward the door. */
export const ROWS2 = 4;
const PER_SIDE2 = 3;

function seats(): KinoSeat[] {
  const out: KinoSeat[] = [];
  for (let k = 0; k < ROWS1; k++) {
    // The seat stands against the tier's west edge; you sit on its cushion, facing the screen (east).
    const back = tierEdge(k + 1);
    for (const side of [-1, 1]) {
      for (let j = 0; j < PER_SIDE1; j++) {
        const z = SCREEN1.z + side * (AISLE1 / 2 + PITCH1 / 2 + j * PITCH1);
        out.push({ key: `kino1:r${k + 1}s${side < 0 ? PER_SIDE1 - j : PER_SIDE1 + 1 + j}`, hall: 1, row: k + 1, x: back + 0.24, y: rowY(k), z, rotY: Math.PI / 2, hips: 0.46, out: 0.62 });
      }
    }
  }
  for (let k = 0; k < ROWS2; k++) {
    const x = SCREEN2.x + 6 + k * 2.2;
    for (const side of [-1, 1]) {
      for (let j = 0; j < PER_SIDE2; j++) {
        const z = SCREEN2.z + side * (0.55 + j * 1.0);
        out.push({ key: `kino2:r${k + 1}s${side < 0 ? PER_SIDE2 - j : PER_SIDE2 + 1 + j}`, hall: 2, row: k + 1, x, y: 0, z, rotY: -Math.PI / 2, hips: 0.44, out: 0.85 });
      }
    }
  }
  return out;
}

export const KINO_SEATS: readonly KinoSeat[] = seats();
export const SEAT_BY_KEY = new Map(KINO_SEATS.map((s) => [s.key, s]));

/** The ticket counter (and snacks) in the foyer's north end: the counter, where the cashier stands, where you stand to be served. */
export const COUNTER = { minX: FOYER.minX + 2.5, maxX: FOYER.maxX - 3, minZ: KINO.minZ + 3.2, maxZ: KINO.minZ + 4, top: 1.1 } as const;
export const CASHIER = { x: (COUNTER.minX + COUNTER.maxX) / 2 + 1, z: COUNTER.minZ - 1, rotY: 0 } as const;
export const SERVE = { x: (COUNTER.minX + COUNTER.maxX) / 2 + 1, z: COUNTER.maxZ + 0.9 } as const;
/** The popcorn machine on the counter's west end. */
export const POPCORN = { x: COUNTER.minX + 0.6, z: (COUNTER.minZ + COUNTER.maxZ) / 2, y: COUNTER.top } as const;
/** Saal 2's lectern with the remote, just inside its door: E there to put on a link. */
export const BOOTH2 = { x: FOYER.minX - 1.6, z: SAAL2.maxZ - 3.4 } as const;

/** Whether (x, z) is inside hall `h` (between its walls). */
export function inHall(h: 1 | 2, x: number, z: number): boolean {
  const s = h === 1 ? SAAL1 : SAAL2;
  return x > s.minX + KT / 2 && x < s.maxX - KT / 2 && z > s.minZ + KT / 2 && z < s.maxZ - KT / 2;
}

/** Whether (x, z) is inside the building at all (foyer, halls, or the rooms behind). */
export function inKino(x: number, z: number): boolean {
  return x > KINO.minX && x < KINO.maxX && z > KINO.minZ && z < KINO.maxZ;
}

/** A wall along x (at z) or along z (at x), from–to, with doorways (center, width) left open; `top` high. */
function wall(alongX: boolean, at: number, from: number, to: number, top: number, gaps: { c: number; w: number }[] = []): KBox[] {
  const out: KBox[] = [];
  const cuts = gaps.map((g) => [g.c - g.w / 2, g.c + g.w / 2] as const).sort((a, b) => a[0] - b[0]);
  let a = from;
  for (const [g0, g1] of [...cuts, [to, to] as const]) {
    if (g0 > a + 0.01) {
      out.push(alongX ? { minX: a, maxX: g0, minZ: at - KT / 2, maxZ: at + KT / 2, bottom: 0, top } : { minX: at - KT / 2, maxX: at + KT / 2, minZ: a, maxZ: g0, bottom: 0, top });
    }
    a = Math.max(a, g1);
  }
  return out;
}

/** What you bump into, and the tiers you walk up: everything solid of the cinema, over the street. */
export function kinoSolids(): KBox[] {
  const out: KBox[] = [];
  const H = SAAL1.h;
  // The outside walls; the front with the entrance in it.
  out.push(...wall(true, KINO.minZ, KINO.minX, KINO.maxX, H));
  out.push(...wall(true, KINO.maxZ, KINO.minX, KINO.maxX, H));
  out.push(...wall(false, KINO.minX, KINO.minZ, KINO.maxZ, H));
  out.push(...wall(false, KINO.maxX, KINO.minZ, KINO.maxZ, FOYER.h + 1.5, [{ c: ENTRANCE.z, w: ENTRANCE.w }]));
  // The foyer's back wall, with the halls' doorways; the wall between the halls; Saal 2's screen wall and the rooms behind it.
  out.push(...wall(false, FOYER.minX, KINO.minZ, KINO.maxZ, H, HALL_DOORS.map((d) => ({ c: d.z, w: d.w }))));
  out.push(...wall(true, SPLIT_Z, KINO.minX, FOYER.minX, H));
  out.push({ minX: KINO.minX, maxX: SAAL2.minX + KT / 2, minZ: KINO.minZ, maxZ: SPLIT_Z, bottom: 0, top: SAAL2.h });
  // Saal 1's tiers: each a step up from the one in front, all the way to the back wall.
  for (let k = 1; k <= ROWS1; k++) out.push({ minX: SAAL1.minX + KT / 2, maxX: tierEdge(k), minZ: SAAL1.minZ + KT / 2, maxZ: SAAL1.maxZ - KT / 2, bottom: 0, top: rowY(k) });
  // Its rows of seats, either side of the aisle: in the way, but you sidle along in front of them.
  for (let k = 0; k < ROWS1; k++) {
    const back = tierEdge(k + 1);
    for (const side of [-1, 1]) {
      const z0 = SCREEN1.z + side * (AISLE1 / 2);
      const z1 = SCREEN1.z + side * (AISLE1 / 2 + PER_SIDE1 * PITCH1);
      out.push({ minX: back, maxX: back + SEAT_DEPTH, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), bottom: rowY(k), top: rowY(k) + 0.95 });
    }
  }
  // The stage in front of Saal 1's screen.
  out.push({ minX: SCREEN1.x - 0.9, maxX: SAAL1.maxX - KT / 2, minZ: SCREEN1.z - SCREEN1.w / 2, maxZ: SCREEN1.z + SCREEN1.w / 2, bottom: 0, top: 0.6 });
  // Saal 2's armchairs, one by one (there's room to walk between them).
  for (const s of KINO_SEATS) if (s.hall === 2) out.push({ minX: s.x - 0.2, maxX: s.x + 0.5, minZ: s.z - 0.42, maxZ: s.z + 0.42, bottom: 0, top: 0.95 });
  // The foyer's counter, the step behind it the cashier stands on, and Saal 2's lectern.
  out.push({ ...COUNTER, bottom: 0 });
  out.push({ minX: COUNTER.minX, maxX: COUNTER.maxX, minZ: KINO.minZ + 0.8, maxZ: COUNTER.minZ, bottom: 0, top: 0.3 });
  out.push({ minX: BOOTH2.x - 0.3, maxX: BOOTH2.x + 0.3, minZ: BOOTH2.z - 0.3, maxZ: BOOTH2.z + 0.3, bottom: 0, top: 1.1 });
  return out;
}

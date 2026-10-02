import { CITY_ROAD, CITY_WALK, LOTS, STREETS, stretchRect, type Stretch } from './city.js';
import { mulberry32 } from './rng.js';
import { onTankstelle } from './tankstelle.js';
import { BOWLING_BOX } from './bowling.js';
import { VENUE_BOX } from './venue.js';

// flrnoh fork (see FORK.md): what stands along the city's streets, laid out once so the page that
// draws it (client/world/town/furniture.ts, ground.ts) and the passers-by who sit on its benches and
// walk round its lamp posts (shared/sidewalks.ts) agree on where it is. Only close by, where you walk
// (FURNITURE_CLOSE): further off the haze has it.

/** How far from the office the street furniture goes. */
export const FURNITURE_CLOSE = 200;
/** How tall a street lamp is, and how far apart they stand along a street. */
export const LAMP_H = 5.2;
export const LAMP_EVERY = 28;
/** Half the road, and the road with its sidewalk. */
const H = CITY_ROAD / 2;
/** On the lots' strip, just past the sidewalk: where the trees, benches and bus stops stand. */
export const STRIP_OUT = H + CITY_WALK + 0.9;
/** Where the street lamps stand: on the sidewalk's outer half. */
export const LAMP_OFF = H + CITY_WALK * 0.6;
/** Where the bollards stand at the ends of a stretch: this far in from the road's edge, and along from its crossing. */
export const BOLLARD_OFF = H + 0.45;
export const BOLLARD_IN = H + CITY_WALK + 0.6;

/** `pillar`: an advertising pillar (Litfaßsäule); `papers`: newspaper boxes by a bin. */
export type FurnitureKind = 'tree' | 'bench' | 'bikes' | 'bus' | 'bin' | 'pillar' | 'papers';

/** Something on the strip beside a sidewalk, turned by `yaw` to face the road (its +z toward it). */
export interface Furniture {
  kind: FurnitureKind;
  x: number;
  z: number;
  yaw: number;
  /** The stretch it stands along, and on which side of it (-1: the side toward -z or -x). */
  street: Stretch;
  side: -1 | 1;
  /** Along the stretch (x for a stretch along x, else z). */
  along: number;
  /** A tree's size, and which of the greens its crown is. */
  k: number;
  leaf: number;
}

/** A street lamp: where it stands, and which stretch and side it's on. */
export interface Lamp {
  x: number;
  z: number;
  street: Stretch;
  side: -1 | 1;
  along: number;
}

/** What stands in a bin's slot, by where it is. */
const BIN_SLOTS: FurnitureKind[] = ['pillar', 'bin', 'papers', 'pillar', 'bin'];

/** Whether a building stands within `pad` of (x, z) (fork: the bowling centre on its block too, and the Schallwerk). */
const built = (x: number, z: number, pad: number) =>
  LOTS.some((l) => Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(z - l.z) < l.d / 2 + pad) ||
  [BOWLING_BOX, VENUE_BOX].some((b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);

/** The stretch's ends along it, its line, and whether it's close enough for furniture. */
export function stretchSpan(s: Stretch): { from: number; to: number; line: number; near: boolean } {
  const rr = stretchRect(s);
  const from = s.alongX ? rr.minX : rr.minZ;
  const to = s.alongX ? rr.maxX : rr.maxZ;
  const line = s.alongX ? (rr.minZ + rr.maxZ) / 2 : (rr.minX + rr.maxX) / 2;
  const mid = (from + to) / 2;
  return { from, to, line, near: Math.hypot(s.alongX ? mid : line, s.alongX ? line : mid) < FURNITURE_CLOSE };
}

function layFurniture(): Furniture[] {
  // The same numbers, drawn in the same order, as the street furniture always was.
  const r = mulberry32(20261001);
  const out: Furniture[] = [];
  for (const s of STREETS) {
    const { from, to, line, near } = stretchSpan(s);
    if (!near) continue;
    const len = to - from - 2 * (H + CITY_WALK);
    const at = (along: number, across: number): [number, number] => (s.alongX ? [along, line + across] : [line + across, along]);
    for (const side of [-1, 1] as const) {
      const yaw = s.alongX ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const start = from + H + CITY_WALK + 4;
      // Between the lamps: a tree, and every so often a bench with a bin, a bike stand, or a bus stop.
      let slot = 0;
      for (let a = start + LAMP_EVERY / 2; a < to - H - CITY_WALK - 4; a += LAMP_EVERY / 2, slot++) {
        const [x, z] = at(a, side * STRIP_OUT);
        if (built(x, z, 1.4)) continue;
        const put = (kind: FurnitureKind, k = 1, leaf = 0) => out.push({ kind, x, z, yaw, street: s, side, along: a, k, leaf });
        if (slot % 2 === 0) {
          const k = 0.85 + r() * 0.35;
          put('tree', k, Math.floor(r() * 3));
          continue;
        }
        const pick = r();
        if (pick < 0.45) put('bench');
        else if (pick < 0.7) put('bikes');
        else if (pick < 0.82 && len > 30) put('bus');
        // A bin, or (by where it is, not by drawing another number, so the rest stays as it was) an
        // advertising pillar or newspaper boxes in its place.
        else put(BIN_SLOTS[Math.abs(Math.round(x * 3 + z * 7)) % BIN_SLOTS.length]);
      }
    }
  }
  return out;
}

/** The trees, benches, bike stands, bus stops and bins along the streets close by. */
export const FURNITURE: readonly Furniture[] = layFurniture();

function layLamps(): Lamp[] {
  const out: Lamp[] = [];
  for (const s of STREETS) {
    const { from, to, line } = stretchSpan(s);
    for (let a = from + 12 + (Math.abs(s.a * 7 + s.b * 3) % 3) * 4; a < to - 10; a += LAMP_EVERY) {
      for (const side of [-1, 1] as const) {
        const off = side * LAMP_OFF;
        const x = s.alongX ? a : line + off;
        const z = s.alongX ? line + off : a;
        if (onTankstelle(x, z)) continue; // fork: none in the petrol station's driveways
        out.push({ x, z, street: s, side, along: a });
      }
    }
  }
  return out;
}

/** The street lamps down both sides of every city street. */
export const LAMPS: readonly Lamp[] = layLamps();

import { DOOR_W, SHOPS, shopPoint, shopRect, shopYaw, type Rect, type Shop } from './shops.js';
import { frontStyle, type OutsideKind } from './shopfronts.js';
import { END_IN, WALKS, shopFace, walkCoords, type Spot, type Walk } from './sidewalks.js';
import { FURNITURE } from './streetside.js';

// flrnoh fork (see FORK.md "Shop fronts"): what stands out in front of the shops by day (shopfronts.ts
// says what each kind puts out): café tables, crates of fruit, flower buckets, the paper stand, a
// sandwich board, bikes, a bubblegum machine. Only on the strip between the sidewalk's walking band
// (sidewalks.ts BAND_MIN … bandMax) and the shop's front, never in front of a door or of the window
// the passers-by look into, never where a tree or a bench stands. Each piece is in its shop's frame (u
// along the front, v negative: out from it). Café tables are seats: for you with E (features/shopfronts)
// and for the passers-by, whose spots by the walks this adds (kind 'cafe').

export interface OutsidePiece {
  what: OutsideKind;
  shop: number;
  u0: number;
  u1: number;
  /** Out from the front: v0 < v1 <= 0. */
  v0: number;
  v1: number;
  /** How tall, and whether you bump into it. */
  h: number;
  solid: boolean;
}

/** A café table's seat: where you sit (feet), facing out to the street. */
export interface OutsideSeat {
  key: string;
  shop: number;
  x: number;
  z: number;
  rotY: number;
  hips: number;
}

/** How wide (along the front) and deep each takes, and how tall it is. */
const SIZE: Record<OutsideKind, { w: number; d: number; h: number; solid: boolean }> = {
  tables: { w: 1.9, d: 0.8, h: 0.75, solid: true },
  crates: { w: 1.3, d: 0.7, h: 0.9, solid: true },
  flowers: { w: 1.4, d: 0.6, h: 0.8, solid: true },
  papers: { w: 0.7, d: 0.45, h: 1.3, solid: true },
  board: { w: 0.62, d: 0.55, h: 1.0, solid: true },
  bikes: { w: 1.9, d: 0.55, h: 1.0, solid: true },
  gumball: { w: 0.4, d: 0.3, h: 1.45, solid: false },
};
/** Kept clear in front of a door, either side of it, and of the window the passers-by look into. */
const DOOR_CLEAR = 0.5;
const WINDOW_CLEAR = 0.6;
/** Kept off the walking band. */
const BAND_GAP = 0.15;
/** The chairs either side of a café table, from its middle, and how high you sit. */
export const CHAIR_OFF = 0.62;
const HIPS = 0.47;

/** Where along a shop's front its window spot is (shared/sidewalks.ts lays it there too). */
export const windowU = (s: Shop) => (s.doorU < s.len / 2 ? (s.doorU + s.len) / 2 : s.doorU / 2);

/** How deep the strip in front of `s` is, between the walking band and its front, and its walk. */
export function stripOf(s: Shop): { depth: number; w: Walk } | null {
  const face = shopFace(s);
  if (!face) return null;
  const p = shopPoint(s, s.len / 2, 0);
  const off = walkCoords(face.w, p.x, p.z)[1];
  return { depth: off - face.w.bandMax - BAND_GAP, w: face.w };
}

function layOutside(s: Shop): OutsidePiece[] {
  const strip = stripOf(s);
  const style = frontStyle(s.kind);
  if (!strip || !style.outside.length) return [];
  // The free stretches along the front: past the door and the window spot, and the street's furniture.
  let free: [number, number][] = [[0.35, s.len - 0.35]];
  const cut = (a: number, b: number) => {
    free = free.flatMap(([p, q]): [number, number][] => (b <= p || a >= q ? [[p, q]] : ([[p, a], [b, q]] as [number, number][]).filter(([x, y]) => y - x > 0.05)));
  };
  cut(s.doorU - DOOR_W / 2 - DOOR_CLEAR, s.doorU + DOOR_W / 2 + DOOR_CLEAR);
  cut(windowU(s) - WINDOW_CLEAR, windowU(s) + WINDOW_CLEAR);
  for (const f of FURNITURE) {
    const fu = (f.x - s.ox) * s.ux + (f.z - s.oz) * s.uz;
    const fv = -((f.x - s.ox) * s.nx + (f.z - s.oz) * s.nz);
    if (fv < -strip.depth - 2 || fv > 0 || fu < -2 || fu > s.len + 2) continue;
    cut(fu - 1.4, fu + 1.4);
  }
  const out: OutsidePiece[] = [];
  for (const what of style.outside) {
    const z = SIZE[what];
    if (z.d > strip.depth) continue;
    const slot = free.find(([p, q]) => q - p >= z.w);
    if (!slot) continue;
    // From the end away from the door, so the pieces gather at the shop's quieter end.
    const fromFar = s.doorU < s.len / 2;
    const u0 = fromFar ? slot[1] - z.w : slot[0];
    const u1 = u0 + z.w;
    cut(u0 - 0.15, u1 + 0.15);
    out.push({ what, shop: s.i, u0, u1, v0: -z.d - 0.02, v1: -0.02, h: z.h, solid: z.solid });
  }
  return out;
}

/** What stands outside each shop, by its place in SHOPS. */
export const OUTSIDE: readonly (readonly OutsidePiece[])[] = SHOPS.map(layOutside);

/** The world box of an outside piece. */
export const outsideRect = (p: OutsidePiece): Rect => shopRect(SHOPS[p.shop], p.u0, p.u1, p.v0, p.v1);

/** The two seats at a café table: either side of it, facing the street. */
export function tableSeats(p: OutsidePiece, n: number): OutsideSeat[] {
  const s = SHOPS[p.shop];
  const mid = (p.u0 + p.u1) / 2;
  const v = (p.v0 + p.v1) / 2 + 0.05;
  const rotY = shopYaw(s, 0, -1);
  return [-1, 1].map((side, k) => {
    const at = shopPoint(s, mid + side * CHAIR_OFF, v);
    return { key: `cafe-${s.i}-${n}-${k}`, shop: s.i, x: at.x, z: at.z, rotY, hips: HIPS };
  });
}

/** Every café seat out in front of a shop. */
export const OUTSIDE_SEATS: readonly OutsideSeat[] = OUTSIDE.flatMap((ps) => ps.filter((p) => p.what === 'tables').flatMap((p, n) => tableSeats(p, n)));
export const OUTSIDE_SEAT_BY_KEY = new Map(OUTSIDE_SEATS.map((s) => [s.key, s]));

/** The world boxes you bump into outside the shops, each with its shop, from the street up to `top`. */
export function outsideSolids(): (Rect & { shop: number; top: number })[] {
  return OUTSIDE.flat()
    .filter((p) => p.solid)
    .map((p) => {
      // A café table: only the table and its parasol's pole in the middle, so you can step up to its chairs.
      if (p.what === 'tables') {
        const m = (p.u0 + p.u1) / 2;
        return { ...shopRect(SHOPS[p.shop], m - 0.3, m + 0.3, p.v0 + 0.1, p.v1 - 0.1), shop: p.shop, top: p.h };
      }
      return { ...outsideRect(p), shop: p.shop, top: p.h };
    });
}

// The passers-by sit down at the café tables too: a spot by the walk for each table, the two of a pair
// on its two chairs, someone alone on the first.
for (const ps of OUTSIDE) {
  ps.filter((p) => p.what === 'tables').forEach((p, n) => {
    const s = SHOPS[p.shop];
    const w = stripOf(s)!.w;
    const [a, b] = tableSeats(p, n);
    const mid = shopPoint(s, (p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2 + 0.05);
    const along = walkCoords(w, mid.x, mid.z)[0];
    if (along < w.from + END_IN + 2 || along > w.to - END_IN - 2) return;
    const spot: Spot = { kind: 'cafe', walk: w.id, along, x: mid.x, z: mid.z, yaw: a.rotY, spread: CHAIR_OFF, shop: s.i, solo: [b.x, b.z] };
    WALKS[w.id].spots.push(spot);
    WALKS[w.id].spots.sort((x, y) => x.along - y.along);
  });
}

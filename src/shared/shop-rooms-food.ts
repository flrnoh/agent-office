import { FRONT_T, WALL_T, type Shop } from './shops.js';
import type { Piece, PieceKind, Room, Station } from './shop-rooms.js';
import { AISLE_FRIDGE, AISLE_VEG, MARKET_AISLES } from './trolley.js';

// flrnoh fork (see FORK.md "Shops to walk into", food round 2): how the ice cream parlour, the sushi
// bar, the butcher's and the supermarket are furnished, in the shop's frame (see shops.ts), laid out
// for a door at the +u end like shop-rooms.ts's and turned round there for the others. Also the sushi
// bar's conveyor belt: where its plates are at any moment is a pure function of the office clock, so
// everyone sees the same plates go by.

/** The pieces only these kinds have. */
export type FoodPieceKind = 'icecase' | 'meatcase' | 'beltcounter' | 'checkout' | 'trolleybay' | 'vegstand' | 'sausages' | 'tiles';
/** Where E does something in them: a seat at the belt, the trolley bay, a supermarket shelf (its `n` is the aisle). */
export type FoodStationKind = 'belt' | 'trolleys' | 'aisle';

const FOOD = new Set(['eisdiele', 'sushi', 'metzgerei', 'supermarkt']);

/** The room of a shop of one of these kinds, laid out for a door at +u; null for the other kinds. */
export function foodRoom(s: Shop): Room | null {
  if (!FOOD.has(s.kind)) return null;
  const L = s.len;
  const D = s.depth;
  const P = WALL_T;
  const T = FRONT_T;
  const pieces: Piece[] = [];
  const stations: Station[] = [];
  const put = (what: PieceKind, u0: number, u1: number, v0: number, v1: number, h: number, solid = true, du = 0, dv = -1) => {
    if (u1 - u0 > 0.05 && v1 - v0 > 0.05) pieces.push({ what, u0, u1, v0, v1, h, solid, du, dv });
  };
  // The middle of the room, clear of the way in at the door and across in front of the counter.
  const m = { u0: P + 1.3, u1: L - 3.3, v0: T + 1.4, v1: D - 3.6 };
  const mu = (m.u0 + m.u1) / 2;
  const mv = (m.v0 + m.v1) / 2;
  const roomy = m.u1 - m.u0 > 0.9 && m.v1 - m.v0 > 0.9;
  if (s.kind === 'supermarkt') return market(s, put, stations, pieces);
  // A counter along the back, away from the door: the keeper behind it, you in front.
  const deep = s.kind === 'sushi' ? 0.9 : 0.7;
  const c0 = P + 0.45;
  const c1 = s.kind === 'sushi' ? Math.max(c0 + 2, L - 3.1) : Math.max(c0 + 1.4, Math.min(c0 + 3.6, L - 3.1));
  const mid = (c0 + c1) / 2;
  const cv1 = D - 1.3;
  const cv0 = cv1 - deep;
  put(s.kind === 'eisdiele' ? 'icecase' : s.kind === 'metzgerei' ? 'meatcase' : 'beltcounter', c0, c1, cv0, cv1, s.kind === 'sushi' ? 0.95 : 1.12);
  const keeper = { u: mid, v: D - 0.8 };
  const spot = { u: mid, v: cv0 - 0.6 };
  stations.push({ at: 'counter', n: 0, u: mid, v: cv0 - 0.1, r: 2.4 });
  put('display', P, L - 2.5, T, T + 0.45, 0.55);
  switch (s.kind) {
    case 'eisdiele':
      // Cones and cups on the shelf behind, the flavours on a board over it; little round tables.
      put('backshelf', P + 0.2, Math.min(c1 + 0.4, L - P - 0.2), D - 0.45, D - P, 1.5);
      put('menuboard', c0, c1, D - P - 0.05, D - P, 0.9, false);
      if (roomy) for (const v of m.v1 - m.v0 > 2.4 ? [m.v0 + 0.5, m.v1 - 0.5] : [mv]) put('table', mu - 0.35, mu + 0.35, v - 0.35, v + 0.35, 0.75);
      break;
    case 'sushi': {
      // The chef's board behind the belt, stools along it, each a place to take a plate from.
      put('backshelf', P + 0.2, Math.min(c1 + 0.4, L - P - 0.2), D - 0.45, D - P, 1.4);
      let n = 0;
      for (let u = c0 + 0.45; u < c1 - 0.3; u += 0.85, n++) {
        put('stool', u - 0.17, u + 0.17, cv0 - 0.48, cv0 - 0.14, 0.72, false);
        stations.push({ at: 'belt', n, u, v: cv0 - 0.25, r: 1.1, aim: { u, v: cv0 + 0.2, w: 0.7, d: 0.6 } });
      }
      if (roomy) put('table', mu - 0.4, mu + 0.4, mv - 0.4, mv + 0.4, 0.75);
      break;
    }
    case 'metzgerei':
      // White tiles all round, the block and the hooks behind the counter, sausages hanging over it.
      put('backshelf', P + 0.2, Math.min(c1 + 0.4, L - P - 0.2), D - 0.5, D - P, 0.95);
      put('sausages', c0, c1, D - 0.45, D - 0.3, 0.6, false);
      put('tiles', P, L - P, D - P - 0.02, D - P, 2.2, false);
      put('fridge', P, P + 0.7, T + 0.8, Math.min(T + 3.2, cv0 - 0.9), 2.0, true, 1, 0);
      if (roomy) put('hightable', mu - 0.35, mu + 0.35, mv - 0.35, mv + 0.35, 1.1);
      break;
  }
  return { pieces, stations, keeper, spot };
}

/**
 * The supermarket: a whole side of its building. By the door the trolley bay, fruit and veg and the
 * checkouts with the cashier; behind them rows of shelves running back from the front, with an aisle
 * between each, and the fridges along the wall away from the door.
 */
function market(s: Shop, put: (what: PieceKind, u0: number, u1: number, v0: number, v1: number, h: number, solid?: boolean, du?: number, dv?: number) => void, stations: Station[], pieces: Piece[]): Room {
  const L = s.len;
  const D = s.depth;
  const P = WALL_T;
  const T = FRONT_T;
  // The window display along the front, away from the door.
  put('display', P, L - 6.2, T, T + 0.45, 0.55);
  // The trolley bay by the door, along the wall at its end.
  put('trolleybay', L - P - 0.9, L - P, T + 1.9, T + 3.7, 1.05);
  stations.push({ at: 'trolleys', n: 0, u: L - P - 1.45, v: T + 2.8, r: 1.4, aim: { u: L - P - 0.45, v: T + 2.8, w: 0.9, d: 1.8 } });
  // Fruit and veg, sloped crates on a stand, the first thing past the door.
  const vg0 = L - 5.6;
  put('vegstand', vg0, vg0 + 2, T + 1.3, T + 2.4, 0.9);
  stations.push({ at: 'aisle', n: AISLE_VEG, u: vg0 + 1, v: T + 2.95, r: 1.4, aim: { u: vg0 + 1, v: T + 1.85, w: 2, d: 1.1 } });
  // Two checkouts (one where the space runs short): a belt running in along v, the cashier at the far end of the first.
  const checkouts = L > 14 ? 2 : 1;
  let keeper = { u: P + 1.25, v: T + 2.3 };
  let spot = { u: P + 2.75, v: T + 2.0 };
  for (let k = 0; k < checkouts; k++) {
    const u0 = P + 1.8 + k * 2.7;
    put('checkout', u0, u0 + 0.75, T + 1.0, T + 3.1, 0.88, true, 1, 0);
    if (k === 0) {
      keeper = { u: u0 - 0.45, v: T + 2.6 };
      spot = { u: u0 + 1.25, v: T + 2.0 };
      stations.push({ at: 'counter', n: 0, u: spot.u, v: spot.v, r: 1.8, aim: { u: u0 + 0.38, v: T + 2.0, w: 0.9, d: 2.1 } });
    }
  }
  // The fridges along the wall away from the door, at the back.
  const back0 = T + 4.4;
  put('fridge', P, P + 0.75, back0, D - 0.4, 2.0, true, 1, 0);
  stations.push({ at: 'aisle', n: AISLE_FRIDGE, u: P + 1.35, v: (back0 + D - 0.4) / 2, r: 1.5, aim: { u: P + 0.4, v: (back0 + D - 0.4) / 2, w: 0.8, d: 2 } });
  // Rows of shelves running back from the front, an aisle between each and a way along the back.
  const rowEnd = D - 1.45;
  let n = 0;
  for (let u = P + 0.75 + 1.5 + 0.45; u + 0.45 < L - 2.1; u += 2.5, n++) {
    put('shelf', u - 0.45, u, back0 + 0.2, rowEnd, 1.8, true, -1, 0);
    put('shelf', u, u + 0.45, back0 + 0.2, rowEnd, 1.8, true, 1, 0);
    const aisle = 2 + (n % (MARKET_AISLES.length - 2));
    stations.push({ at: 'aisle', n: aisle, u: u + 1.2, v: (back0 + rowEnd) / 2, r: 1.4, aim: { u: u + 0.23, v: (back0 + rowEnd) / 2, w: 0.5, d: 2.2 } });
  }
  return { pieces, stations, keeper, spot };
}

// ---- The sushi bar's belt --------------------------------------------------------------------------

/** How fast the belt runs (m/s), and how far apart its plates are (m). */
export const BELT_SPEED = 0.09;
export const BELT_GAP = 0.42;

/** What comes round on the belt, by plate color (shopwares-food.ts has them as things to hold). */
export const SUSHI_PLATES = ['sushilachs', 'sushithun', 'sushimaki', 'sushiebi', 'sushitamago', 'sushiinari'] as const;
export type SushiPlate = (typeof SUSHI_PLATES)[number];

/** The belt's loop over the sushi counter: two lanes along u and a half turn at each end. */
export interface Belt {
  a: number;
  b: number;
  /** The front lane's v, the back's, and the turns' radius. */
  vf: number;
  vb: number;
  r: number;
  len: number;
}

/** The belt on shop `s`'s counter (in its frame as furnished, turned or not), if it's a sushi bar. */
export function beltOf(room: Room): Belt | null {
  const c = room.pieces.find((p) => p.what === 'beltcounter');
  if (!c) return null;
  const vf = c.v0 + 0.22;
  const vb = c.v1 - 0.22;
  const r = (vb - vf) / 2;
  const a = c.u0 + 0.15 + r;
  const b = c.u1 - 0.15 - r;
  return { a, b, vf, vb, r, len: 2 * (b - a) + 2 * Math.PI * r };
}

/** Where along the belt (u, v) a distance `d` is: out along the front lane toward +u, round, back along the back. */
export function beltPoint(bt: Belt, d: number): { u: number; v: number } {
  const L = bt.b - bt.a;
  const turn = Math.PI * bt.r;
  let x = ((d % bt.len) + bt.len) % bt.len;
  const vc = (bt.vf + bt.vb) / 2;
  if (x < L) return { u: bt.a + x, v: bt.vf };
  x -= L;
  if (x < turn) {
    const ang = x / bt.r;
    return { u: bt.b + Math.sin(ang) * bt.r, v: vc - Math.cos(ang) * bt.r };
  }
  x -= turn;
  if (x < L) return { u: bt.b - x, v: bt.vb };
  x -= L;
  const ang = x / bt.r;
  return { u: bt.a - Math.sin(ang) * bt.r, v: vc + Math.cos(ang) * bt.r };
}

/** How many plates fit round the belt, and what's on plate `k` (every fifth spot is empty). */
export const beltSlots = (bt: Belt) => Math.max(1, Math.floor(bt.len / BELT_GAP));
export function plateOn(shop: number, k: number): SushiPlate | null {
  if (k % 5 === 4) return null;
  return SUSHI_PLATES[(k * 7 + shop * 3) % SUSHI_PLATES.length];
}

/** Where plate `k` is at office time `t` (seconds). */
export function platePoint(bt: Belt, k: number, t: number): { u: number; v: number } {
  const n = beltSlots(bt);
  return beltPoint(bt, (k * bt.len) / n + t * BELT_SPEED);
}

/** The plate passing in front of `u` on the front lane at office time `t`, if one's within reach. */
export function plateAt(shop: number, bt: Belt, u: number, t: number, reach = 0.32): { k: number; plate: SushiPlate } | null {
  const n = beltSlots(bt);
  let best: { k: number; plate: SushiPlate; d: number } | null = null;
  for (let k = 0; k < n; k++) {
    const p = platePoint(bt, k, t);
    const plate = plateOn(shop, k);
    if (!plate || Math.abs(p.v - bt.vf) > 1e-6) continue;
    const d = Math.abs(p.u - u);
    if (d <= reach && (!best || d < best.d)) best = { k, plate, d };
  }
  return best && { k: best.k, plate: best.plate };
}

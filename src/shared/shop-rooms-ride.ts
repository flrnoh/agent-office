import type { ShopKindId } from './shops.js';
import type { PieceKind, Station } from './shop-rooms.js';

// flrnoh fork (see FORK.md "Shops to walk into"): what stands in the bike shop, the pet shop and the
// laundromat, laid out in a shop's frame like the other kinds in shop-rooms.ts (the door at the +u
// end, the counter along the back, away from it), which hands over what it's worked out already.

export type RidePieceKind = 'bikewall' | 'bikerow' | 'repairstand' | 'tyres' | 'aquarium' | 'foodshelf' | 'hamster' | 'birdcage' | 'birdstand' | 'washer' | 'dryers' | 'foldtable' | 'plasticchair' | 'vending';
export type RideStationKind = 'washer' | 'vending';

/** What shop-rooms.ts's layRoom has worked out for a room, and its helpers to put things in it. */
export interface RoomKit {
  L: number;
  D: number;
  /** The side and back walls' thickness, and the front's. */
  P: number;
  T: number;
  /** The counter, along u, and its front along v. */
  c0: number;
  c1: number;
  mid: number;
  cv0: number;
  /** The middle of the room, clear of the way in, and whether there's room there. */
  m: { u0: number; u1: number; v0: number; v1: number };
  roomy: boolean;
  mu: number;
  mv: number;
  put(what: PieceKind, u0: number, u1: number, v0: number, v1: number, h: number, solid?: boolean, du?: number, dv?: number): void;
  /** Along the wall away from the door, facing in. */
  away(what: PieceKind, h: number, deep?: number, solid?: boolean): void;
  /** Along the door's wall, behind where the door swings open, facing in. */
  doorSide(what: PieceKind, h: number, deep?: number): void;
  stations: Station[];
}

/** How far apart the laundromat's washing machines stand, and how big one is. */
export const WASHER_PITCH = 0.72;
export const WASHER_W = 0.66;

/** Lays out kind `k`'s things, if it's one of these. */
export function layRide(k: ShopKindId, r: RoomKit): void {
  const { L, D, P, T, c1, m, roomy, mu, mv, put, away, doorSide, stations } = r;
  switch (k) {
    case 'fahrrad': {
      // Bikes hung on the wall away from the door, tyres and tubes on the door's, rows of bikes on the floor, the repair stand by the counter.
      away('bikewall', 2.3, 0.45);
      doorSide('tyres', 2.0, 0.4);
      if (roomy) {
        const rows = m.v1 - m.v0 > 2.6 ? 2 : 1;
        for (let i = 0; i < rows; i++) {
          const v = rows === 1 ? mv : m.v0 + 0.45 + i * (m.v1 - m.v0 - 0.9);
          put('bikerow', m.u0, m.u1, v - 0.3, v + 0.3, 1.05, true, 0, -1);
        }
      }
      put('repairstand', c1 + 0.45, c1 + 1.35, D - 2.0, D - 1.4, 1.45, true, 0, -1);
      return;
    }
    case 'zoo': {
      // A wall of aquariums, food on the door's wall, the hamsters' table and a budgie on its stand in the middle, cages hanging in the window.
      away('aquarium', 1.85, 0.6);
      doorSide('foodshelf', 1.9, 0.45);
      if (roomy) {
        const w = m.u1 - m.u0;
        const hu = w > 2.4 ? mu - 0.5 : mu;
        put('hamster', hu - 0.6, hu + 0.6, mv - 0.4, mv + 0.4, 0.85);
        if (w > 2.4) put('birdstand', hu + 1.0, hu + 1.5, mv - 0.25, mv + 0.25, 1.75);
      }
      for (const u of [P + 0.9, Math.min(L - 3.2, P + 2.6)]) put('birdcage', u - 0.3, u + 0.3, T + 0.15, T + 0.6, 0.6, false);
      return;
    }
    case 'waschsalon': {
      // A row of washing machines along the wall away from the door, dryers stacked two high on the
      // door's, the folding table in the middle, plastic chairs along the window, the vending machine
      // in the corner behind the door's wall.
      const v0 = T + 0.6;
      const n = Math.max(1, Math.floor((D - 2.3 - v0) / WASHER_PITCH));
      for (let i = 0; i < n; i++) {
        const v = v0 + i * WASHER_PITCH;
        const c = v + WASHER_W / 2;
        put('washer', P, P + WASHER_W, v, v + WASHER_W, 0.92, true, 1, 0);
        stations.push({ at: 'washer', n: i, u: P + WASHER_W + 0.55, v: c, r: 1.15, hit: { u: P + WASHER_W / 2, v: c, w: WASHER_W, h: 0.92, d: WASHER_W - 0.04 } });
      }
      doorSide('dryers', 1.85, 0.72);
      if (roomy) put('foldtable', mu - Math.min(0.85, (m.u1 - m.u0) / 2), mu + Math.min(0.85, (m.u1 - m.u0) / 2), mv - 0.4, mv + 0.4, 0.9);
      let k = 0;
      for (let u = P + 1.2; u <= L - 3.3 && k < 4; u += 0.62, k++) {
        put('plasticchair', u - 0.22, u + 0.22, T + 0.15, T + 0.6, 0.85, false, 0, 1);
        stations.push({ at: 'chair', n: k, u, v: T + 1.15, r: 1.0, seat: { u, v: T + 0.4, du: 0, dv: 1, hips: 0.47 } });
      }
      put('vending', L - P - 0.75, L - P, D - 1.25, D - P - 0.05, 1.9, true, -1, 0);
      stations.push({ at: 'vending', n: 0, u: L - P - 1.35, v: D - 0.75, r: 1.3, hit: { u: L - P - 0.38, v: D - 0.7, w: 0.75, h: 1.9, d: 1.0 } });
      return;
    }
    default:
      return;
  }
}

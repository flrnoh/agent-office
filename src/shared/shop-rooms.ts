import { FRONT_T, SHOP_H, SHOPS, WALL_T, lotSolids, shopLocal, shopPoint, shopRect, shopWalls, shopYaw, type Shop, type ShopKindId, type Solid } from './shops.js';

// flrnoh fork (see FORK.md "Shops to walk into"): what's in each shop, in its frame (see shops.ts),
// the same for the page that draws it and the tests that walk in: the counter with the keeper behind
// it, shelves, tables, chairs, crates, and the places where E does something (`stations`). It's laid
// out as if the door were at the shop's +u end and turned round for a shop whose door is at the other,
// so there's always a clear way in from the door and across to the counter.

export type PieceKind =
  | 'counter'
  | 'vitrine'
  | 'backshelf'
  | 'shelf'
  | 'tallshelf'
  | 'display'
  | 'fridge'
  | 'table'
  | 'hightable'
  | 'oven'
  | 'buckets'
  | 'newsrack'
  | 'crates'
  | 'mirror'
  | 'barberchair'
  | 'tattoochair'
  | 'flash'
  | 'spit'
  | 'menuboard'
  | 'traintable'
  | 'plush'
  | 'recordcrate'
  | 'listening'
  | 'stool';

/** Something in a shop: a box in its frame (u0..u1 along, v0..v1 in), `h` tall; `solid` ones you bump into. */
export interface Piece {
  what: PieceKind;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  h: number;
  solid: boolean;
  /** Which way its front faces, in the shop's frame (du, dv): a shelf's goods, a chair's seat. */
  du: number;
  dv: number;
}

export type StationKind = 'counter' | 'chair' | 'crate' | 'listen' | 'shelf';

/** Where E does something: where you stand (u, v), how near you must be, and (a chair) where you sit. */
export interface Station {
  at: StationKind;
  n: number;
  u: number;
  v: number;
  r: number;
  /** A chair: its seat, facing (du, dv), and how high your hips are on it. */
  seat?: { u: number; v: number; du: number; dv: number; hips: number };
}

export interface Room {
  pieces: Piece[];
  stations: Station[];
  /** Where the keeper stands behind the counter, facing the way in (-v). */
  keeper: { u: number; v: number };
  /** Where you stand at the counter. */
  spot: { u: number; v: number };
}

/** The door is at the +u end in the laid-out frame; for a shop whose door is at the other, u turns round. */
const mirrored = (s: Shop) => s.doorU < s.len / 2;

function layRoom(s: Shop): Room {
  const L = s.len;
  const D = s.depth;
  const P = WALL_T;
  const T = FRONT_T;
  const pieces: Piece[] = [];
  const stations: Station[] = [];
  const put = (what: PieceKind, u0: number, u1: number, v0: number, v1: number, h: number, solid = true, du = 0, dv = -1) => {
    if (u1 - u0 > 0.05 && v1 - v0 > 0.05) pieces.push({ what, u0, u1, v0, v1, h, solid, du, dv });
  };
  const k: ShopKindId = s.kind;
  // The counter along the back, away from the door; the keeper behind it, you in front.
  const long = k === 'bar' ? 5 : k === 'friseur' || k === 'tattoo' ? 1.8 : 3.2;
  const c0 = P + 0.5;
  const c1 = Math.max(c0 + 1.4, Math.min(c0 + long, L - 3.1));
  const mid = (c0 + c1) / 2;
  const cv0 = D - 1.9;
  const cv1 = D - 1.3;
  put(k === 'baeckerei' || k === 'doener' ? 'vitrine' : 'counter', c0, c1, cv0, cv1, 1.05);
  const keeper = { u: mid, v: D - 0.8 };
  const spot = { u: mid, v: D - 2.5 };
  stations.push({ at: 'counter', n: 0, u: mid, v: cv0 - 0.1, r: 2.4 });
  // Behind the keeper: shelves, an oven, the döner's spit.
  if (k === 'pizza') put('oven', c0 + 0.2, c0 + 1.6, D - 0.75, D - P, 1.9);
  else if (k === 'doener') {
    put('backshelf', c0, mid - 0.4, D - 0.45, D - P, 1.8);
    put('spit', mid + 0.1, mid + 0.7, D - 0.75, D - 0.25, 1.6, false);
  } else put('backshelf', P + 0.2, Math.min(c1 + 0.4, L - P - 0.2), D - 0.45, D - P, 2.3);
  if (k === 'doener') put('menuboard', c0, c1, D - P - 0.05, D - P, 0.9, false);
  // The window display: low, along the front left of the door.
  const dispEnd = L - 2.5;
  if (k !== 'tattoo' && k !== 'friseur' && k !== 'bar') put('display', P, dispEnd, T, T + 0.45, 0.55);
  // Along the wall away from the door, and along the door's (behind where the door swings open).
  const away = (what: PieceKind, h: number, deep = 0.55, solid = true) => put(what, P, P + deep, T + 0.7, D - 2.4, h, solid, 1, 0);
  const doorSide = (what: PieceKind, h: number, deep = 0.6) => put(what, L - P - deep, L - P, T + 1.7, D - 1.4, h, true, -1, 0);
  // The middle of the room, clear of the way in at the door and across in front of the counter.
  const m = { u0: P + 1.3, u1: L - 3.3, v0: T + 1.4, v1: D - 3.4 };
  const roomy = m.u1 - m.u0 > 0.9 && m.v1 - m.v0 > 0.9;
  const mu = (m.u0 + m.u1) / 2;
  const mv = (m.v0 + m.v1) / 2;
  const tables = (what: PieceKind, size: number, h: number) => {
    if (!roomy) return;
    const n = m.v1 - m.v0 > 2.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const v = n === 1 ? mv : m.v0 + size / 2 + 0.2 + i * (m.v1 - m.v0 - size - 0.4);
      put(what, mu - size / 2, mu + size / 2, v - size / 2, v + size / 2, h);
    }
  };
  switch (k) {
    case 'baeckerei':
      away('shelf', 1.8);
      tables('hightable', 0.7, 1.1);
      break;
    case 'cafe':
      away('shelf', 1.8);
      tables('table', 0.8, 0.75);
      break;
    case 'pizza':
      away('shelf', 1.6);
      tables('table', 0.9, 0.75);
      break;
    case 'apotheke':
      away('tallshelf', 2.3);
      doorSide('tallshelf', 2.3);
      if (roomy) put('display', mu - 0.4, mu + 0.4, mv - 0.4, mv + 0.4, 1.0);
      break;
    case 'blumen':
      away('buckets', 0.65, 0.7);
      if (roomy) put('buckets', mu - 0.6, mu + 0.6, mv - 0.6, mv + 0.6, 0.65);
      break;
    case 'buchladen':
      away('tallshelf', 2.4);
      doorSide('tallshelf', 2.4);
      if (roomy) put('table', mu - 0.6, mu + 0.6, mv - 0.45, mv + 0.45, 0.8);
      stations.push({ at: 'shelf', n: 0, u: P + 1.2, v: (T + 0.7 + D - 2.4) / 2, r: 2 });
      break;
    case 'kiosk':
      away('newsrack', 1.5, 0.5);
      doorSide('fridge', 2.0, 0.7);
      break;
    case 'bar':
      tables('hightable', 0.7, 1.1);
      for (let u = c0 + 0.4; u < c1 - 0.2; u += 0.9) put('stool', u - 0.18, u + 0.18, cv0 - 0.5, cv0 - 0.14, 0.75, false);
      break;
    case 'spaeti':
      away('fridge', 2.0, 0.7);
      doorSide('fridge', 2.0, 0.7);
      if (roomy) put('crates', mu - 0.5, mu + 0.5, mv - 0.35, mv + 0.35, 0.7);
      break;
    case 'friseur': {
      // Chairs facing mirrors on the wall away from the door.
      let n = 0;
      for (let v = T + 1.6; v <= D - 3.1 && n < 2; v += 1.7, n++) {
        put('mirror', P, P + 0.06, v - 0.55, v + 0.55, 1.2, false, 1, 0);
        put('barberchair', P + 0.7, P + 1.3, v - 0.32, v + 0.32, 1.0, false, -1, 0);
        stations.push({ at: 'chair', n, u: P + 1.4, v, r: 1.5, seat: { u: P + 1.05, v, du: -1, dv: 0, hips: 0.62 } });
      }
      break;
    }
    case 'tattoo': {
      const v = T + 2.0;
      put('tattoochair', P + 0.5, P + 1.5, v - 0.4, v + 0.4, 0.9, false, 1, 0);
      put('stool', P + 1.8, P + 2.15, v + 0.5, v + 0.85, 0.6, false);
      put('flash', P, P + 0.05, T + 0.6, D - 2.6, 1.4, false, 1, 0);
      put('flash', L - P - 0.05, L - P, T + 1.7, D - 1.5, 1.4, false, -1, 0);
      stations.push({ at: 'chair', n: 0, u: P + 1.6, v, r: 1.6, seat: { u: P + 1.0, v, du: 1, dv: 0, hips: 0.7 } });
      break;
    }
    case 'doener':
      tables('hightable', 0.7, 1.1);
      break;
    case 'spielzeug':
      away('shelf', 2.0);
      doorSide('shelf', 2.0);
      if (roomy) put('traintable', mu - Math.min(0.9, (m.u1 - m.u0) / 2), mu + Math.min(0.9, (m.u1 - m.u0) / 2), mv - 0.55, mv + 0.55, 0.8);
      put('plush', P, P + 1.0, T + 0.5, T + 1.1, 0.5, false);
      break;
    case 'platten': {
      put('listening', P, P + 0.5, T + 1.0, T + 1.7, 1.1, true, 1, 0);
      stations.push({ at: 'listen', n: 0, u: P + 1.1, v: T + 1.35, r: 1.4 });
      if (roomy) {
        const n = m.v1 - m.v0 > 2.4 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const v = n === 1 ? mv : m.v0 + 0.4 + i * (m.v1 - m.v0 - 0.8);
          put('recordcrate', mu - 0.6, mu + 0.6, v - 0.3, v + 0.3, 0.85, true, 0, -1);
          stations.push({ at: 'crate', n: i, u: mu, v: v - 0.85, r: 1.4 });
        }
      }
      doorSide('shelf', 2.0, 0.4);
      break;
    }
  }
  return { pieces, stations, keeper, spot };
}

/** Turns a laid-out room round for a shop whose door is at its -u end. */
function turned(s: Shop, r: Room): Room {
  if (!mirrored(s)) return r;
  const L = s.len;
  return {
    pieces: r.pieces.map((p) => ({ ...p, u0: L - p.u1, u1: L - p.u0, du: -p.du })),
    stations: r.stations.map((t) => ({ ...t, u: L - t.u, seat: t.seat && { ...t.seat, u: L - t.seat.u, du: -t.seat.du } })),
    keeper: { ...r.keeper, u: L - r.keeper.u },
    spot: { ...r.spot, u: L - r.spot.u },
  };
}

const ROOMS = new Map<number, Room>();

/** What's in shop `s`, in its frame. */
export function shopRoom(s: Shop): Room {
  let r = ROOMS.get(s.i);
  if (!r) ROOMS.set(s.i, (r = turned(s, layRoom(s))));
  return r;
}

/** What you bump into in shop `s`, as world boxes from `bottom` to `top` above the street: its walls and its solid pieces. */
export function shopSolids(s: Shop): Solid[] {
  return [...shopWalls(s), ...shopRoom(s).pieces.filter((p) => p.solid).map((p) => ({ ...shopRect(s, p.u0, p.u1, p.v0, p.v1), bottom: 0, top: p.h }))];
}

/** Where a station is in the world, and (a chair) its seat with the way it faces. */
export function stationAt(s: Shop, t: Station): { x: number; z: number; seat?: { x: number; z: number; rotY: number; hips: number } } {
  const at = shopPoint(s, t.u, t.v);
  if (!t.seat) return at;
  const p = shopPoint(s, t.seat.u, t.seat.v);
  return { ...at, seat: { ...p, rotY: shopYaw(s, t.seat.du, t.seat.dv), hips: t.seat.hips } };
}

// ---- Shop seats ----------------------------------------------------------------------------------

/** A shop's chair as a seat key (see PeerInfo.seat): `shop-<shop>-<chair>:0`. */
export const shopSeatKey = (shop: number, n: number) => `shop-${shop}-${n}:0`;

/** The shop and chair a seat key names, if it's a shop's chair. */
export function shopSeatOf(key: string | undefined): { shop: Shop; station: Station } | undefined {
  const m = key ? /^shop-(\d+)-(\d+):0$/.exec(key) : null;
  const shop = m ? SHOPS[Number(m[1])] : undefined;
  const station = shop && shopRoom(shop).stations.find((t) => t.at === 'chair' && t.n === Number(m![2]));
  return shop && station ? { shop, station } : undefined;
}

/** How high someone sitting on a shop's chair has their hips (a peer's seat), or null when it isn't one. */
export function shopSeatHips(key: string | undefined): number | null {
  return shopSeatOf(key)?.station.seat?.hips ?? null;
}

/** Whether (x, z) is inside shop `s`'s room, in its walls (`pad` in from them). */
export function insideShop(s: Shop, x: number, z: number, pad = 0): boolean {
  const { u, v } = shopLocal(s, x, z);
  return u > WALL_T + pad && u < s.len - WALL_T - pad && v > FRONT_T + pad && v < s.depth - WALL_T - pad;
}

/** The fog-free box of a shop's room, from the street up to its ceiling. */
export function shopBox(s: Shop): { minX: number; maxX: number; minZ: number; maxZ: number; h: number } {
  return { ...s.rect, h: SHOP_H };
}

/** What you bump into of lot `li` (by its place in LOTS): its solids (shops.ts) and what stands in its shops. */
export function lotColliders(li: number): Solid[] {
  const out = lotSolids(li);
  for (const s of SHOPS) if (s.lot === li) for (const p of shopRoom(s).pieces) if (p.solid) out.push({ ...shopRect(s, p.u0, p.u1, p.v0, p.v1), bottom: 0, top: p.h });
  return out;
}

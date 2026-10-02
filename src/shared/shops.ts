import { BLOCK_INNER, CITY_X, CITY_Z, LOTS, PERIOD, onCityStreet, type Lot } from './city.js';
import { ROAD } from './layout.js';
import { STREET_END, onLoop } from './scenic.js';

// flrnoh fork (see FORK.md "Shops to walk into"): the ground-floor shops of the city's buildings close
// by, laid out once, the same for the page that draws them, the server and the tests. A building
// gets shops on the sides that face a street (with a road out front); each such side is split into
// shop rooms of about 8 m, each with a door and shop windows in its front, its own interior behind
// it (as deep as half the building, at most ROOM_MAX), and a wall to the next shop. What's behind the
// rooms (the core of the building) and everything over the ground floor stays solid. Which kind of
// shop each is goes round SHOP_KINDS in order of how far it is from the office, so the shops nearest
// to it are one of every kind, and every kind is all over the city. A kind marked `whole` (the
// supermarket) instead takes a whole side of two or three shops' length, every few such sides.
//
// Each shop has a frame of its own: `u` runs along its front (0 at one end, `len` at the other), `v`
// inward from the front's outer face (0) to its back wall (`depth`). shop-rooms.ts furnishes it in
// that frame.

/** How tall a ground floor with shops is. */
export const SHOP_H = 4.2;
/** How deep a shop goes into its building at most, and at least (a side too shallow for that gets none). */
export const ROOM_MAX = 9;
const ROOM_MIN = 6;
/** About how long a shop's front is: a longer side is split into several. */
const SHOP_LEN = 8;
/** The front wall's thickness, and the side and back walls'. */
export const FRONT_T = 0.25;
export const WALL_T = 0.15;
/** The door: how wide, how tall, and how far its middle is from the front's end it's nearer to. */
export const DOOR_W = 1.4;
export const DOOR_H = 2.5;
const DOOR_IN = 1.6;
/** The shop windows: from the sill to the top. */
export const SILL = 0.55;
export const WINDOW_TOP = 3.05;

export type ShopKindId = 'baeckerei' | 'cafe' | 'pizza' | 'apotheke' | 'blumen' | 'buchladen' | 'kiosk' | 'bar' | 'spaeti' | 'friseur' | 'tattoo' | 'doener' | 'spielzeug' | 'platten' | 'spielhalle' | 'post' | 'boutique' | 'optiker' | 'eisdiele' | 'sushi' | 'metzgerei' | 'supermarkt' | 'fahrrad' | 'zoo' | 'waschsalon';

export interface ShopKind {
  id: ShopKindId;
  /** On the sign over the door. */
  sign: string;
  /** What the hint calls it, and its emoji. */
  name: string;
  emoji: string;
  /** What E does at its counter, in the hint. */
  verb: string;
  /** The frame and the wall round the windows, the awning's two stripes, the sign's ground and its letters. */
  frame: string;
  awning: [string, string];
  signBg: string;
  ink: string;
  /** A neon sign: its letters glow at night, brighter than the rest. */
  neon?: boolean;
  /** What's in the window from afar: a row of these colors, on shelves. */
  goods: string[];
  /** Inside: the walls and the floor. */
  wall: string;
  floor: string;
  /** Who's behind the counter: a name for their speech, a shirt, and a look (shared/avatar.ts). */
  keeper: { name: string; shirt: string; skin: number; hair: number; style: number };
  /** A shop as long as a whole side of its building (two or three shops' worth): the supermarket (see layShops). */
  whole?: true;
}

export const SHOP_KINDS: readonly ShopKind[] = [
  { id: 'baeckerei', sign: 'BÄCKEREI', name: 'Bäckerei', emoji: '🥨', verb: 'bestellen', frame: '#7a4b2a', awning: ['#e9c46a', '#fff4d6'], signBg: '#fff4d6', ink: '#7a4b2a', goods: ['#d9a35b', '#e8c07d', '#b9773e'], wall: '#f6e7cb', floor: '#b08968', keeper: { name: 'Frau Huber', shirt: '#fefae0', skin: 1, hair: 5, style: 2 } },
  { id: 'cafe', sign: 'CAFÉ', name: 'Café', emoji: '☕', verb: 'bestellen', frame: '#2f3e46', awning: ['#2a9d8f', '#e9f5f2'], signBg: '#2f3e46', ink: '#f6e7cb', goods: ['#f6e7cb', '#c08552', '#8c5e3c'], wall: '#e9f5f2', floor: '#6f4e37', keeper: { name: 'Luca', shirt: '#2a9d8f', skin: 3, hair: 0, style: 0 } },
  { id: 'pizza', sign: 'PIZZA', name: 'Pizzeria', emoji: '🍕', verb: 'bestellen', frame: '#9b2226', awning: ['#bb3e03', '#fefae0'], signBg: '#fefae0', ink: '#9b2226', goods: ['#ee9b00', '#ca6702', '#94d2bd'], wall: '#fefae0', floor: '#9b2226', keeper: { name: 'Giuseppe', shirt: '#ffffff', skin: 3, hair: 1, style: 0 } },
  { id: 'apotheke', sign: 'APOTHEKE', name: 'Apotheke', emoji: '💊', verb: 'beraten lassen', frame: '#e9ecef', awning: ['#2b9348', '#ffffff'], signBg: '#2b9348', ink: '#ffffff', goods: ['#ffffff', '#80ed99', '#caf0f8'], wall: '#f8f9fa', floor: '#dee2e6', keeper: { name: 'Dr. Brandl', shirt: '#ffffff', skin: 0, hair: 5, style: 1 } },
  { id: 'blumen', sign: 'BLUMEN', name: 'Blumenladen', emoji: '💐', verb: 'einen Strauß binden lassen', frame: '#386641', awning: ['#ff8fab', '#fff0f3'], signBg: '#fff0f3', ink: '#386641', goods: ['#ff8fab', '#ffd166', '#c77dff', '#6a994e'], wall: '#f1faee', floor: '#a3b18a', keeper: { name: 'Rosi', shirt: '#6a994e', skin: 1, hair: 4, style: 5 } },
  { id: 'buchladen', sign: 'BUCHLADEN', name: 'Buchladen', emoji: '📚', verb: 'ein Buch nehmen', frame: '#3d405b', awning: ['#81b29a', '#f4f1de'], signBg: '#f4f1de', ink: '#3d405b', goods: ['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b'], wall: '#f4f1de', floor: '#8d6e63', keeper: { name: 'Herr Lehner', shirt: '#81b29a', skin: 0, hair: 5, style: 6 } },
  { id: 'kiosk', sign: 'KIOSK', name: 'Kiosk', emoji: '📰', verb: 'kaufen', frame: '#264653', awning: ['#e76f51', '#ffffff'], signBg: '#e76f51', ink: '#ffffff', goods: ['#e9c46a', '#f4a261', '#2a9d8f', '#e76f51'], wall: '#fdf0d5', floor: '#6c757d', keeper: { name: 'Ömer', shirt: '#264653', skin: 4, hair: 0, style: 0 } },
  { id: 'bar', sign: 'BAR', name: 'Bar', emoji: '🍸', verb: 'bestellen', frame: '#1b1b1e', awning: ['#5a189a', '#e0aaff'], signBg: '#1b1b1e', ink: '#e0aaff', neon: true, goods: ['#ffb703', '#8ecae6', '#e0aaff'], wall: '#3c096c', floor: '#2d1e2f', keeper: { name: 'Mia', shirt: '#1b1b1e', skin: 2, hair: 8, style: 3 } },
  { id: 'spaeti', sign: 'SPÄTI', name: 'Späti', emoji: '🌙', verb: 'kaufen', frame: '#14213d', awning: ['#fca311', '#ffffff'], signBg: '#fca311', ink: '#14213d', goods: ['#fca311', '#e5e5e5', '#d62828'], wall: '#e5e5e5', floor: '#495057', keeper: { name: 'Kemal', shirt: '#fca311', skin: 5, hair: 0, style: 3 } },
  { id: 'friseur', sign: 'FRISEUR', name: 'Friseur', emoji: '💈', verb: 'Platz nehmen', frame: '#6d6875', awning: ['#b5838d', '#ffcdb2'], signBg: '#ffcdb2', ink: '#6d6875', goods: ['#ffcdb2', '#e5989b', '#ffffff'], wall: '#fff1e6', floor: '#f0efeb', keeper: { name: 'Chantal', shirt: '#b5838d', skin: 1, hair: 7, style: 1 } },
  { id: 'tattoo', sign: 'TATTOO', name: 'Tattoo & Piercing', emoji: '🖋️', verb: 'Platz nehmen', frame: '#111111', awning: ['#1a1a1a', '#c1121f'], signBg: '#0b0b0b', ink: '#ff2e63', neon: true, goods: ['#ff2e63', '#08d9d6', '#eaeaea'], wall: '#2b2b2b', floor: '#1a1a1a', keeper: { name: 'Jo', shirt: '#111111', skin: 1, hair: 0, style: 6 } },
  { id: 'doener', sign: 'DÖNER KEBAB', name: 'Döner', emoji: '🥙', verb: 'bestellen', frame: '#b5121b', awning: ['#ffcc00', '#d62828'], signBg: '#ffcc00', ink: '#b5121b', goods: ['#c47a3a', '#7cb518', '#e63946'], wall: '#fff3b0', floor: '#9c6644', keeper: { name: 'Mehmet', shirt: '#ffffff', skin: 4, hair: 0, style: 0 } },
  { id: 'spielzeug', sign: 'SPIELZEUG', name: 'Spielzeugladen', emoji: '🧸', verb: 'ein Spielzeug aussuchen', frame: '#3a86ff', awning: ['#ffbe0b', '#fb5607'], signBg: '#ffbe0b', ink: '#8338ec', goods: ['#ff006e', '#3a86ff', '#ffbe0b', '#06d6a0'], wall: '#fff8e1', floor: '#8ecae6', keeper: { name: 'Opa Sepp', shirt: '#e63946', skin: 0, hair: 5, style: 0 } },
  { id: 'platten', sign: 'PLATTEN', name: 'Plattenladen', emoji: '💿', verb: 'eine Platte kaufen', frame: '#2b2d42', awning: ['#ef233c', '#edf2f4'], signBg: '#edf2f4', ink: '#2b2d42', goods: ['#ef233c', '#8d99ae', '#ffb703', '#2b2d42'], wall: '#d6ccc2', floor: '#3d405b', keeper: { name: 'Didi', shirt: '#2b2d42', skin: 2, hair: 1, style: 4 } },
  // flrnoh fork, "fun shops": the arcade with its claw machine and photo booth, and the post office (shared/funshops.ts).
  { id: 'spielhalle', sign: 'SPIELHALLE', name: 'Spielhalle', emoji: '🕹️', verb: 'Snacks holen', frame: '#0b0b1a', awning: ['#14002e', '#ff00aa'], signBg: '#0b0b1a', ink: '#00f0ff', neon: true, goods: ['#ff00aa', '#00f0ff', '#ffe600', '#7cff00'], wall: '#1a1033', floor: '#120a24', keeper: { name: 'Kevin', shirt: '#ff00aa', skin: 2, hair: 3, style: 4 } },
  { id: 'post', sign: 'POST', name: 'Post & Paketshop', emoji: '📮', verb: 'eine Postkarte schreiben', frame: '#1d1d1b', awning: ['#ffcc00', '#ffcc00'], signBg: '#ffcc00', ink: '#1d1d1b', goods: ['#c8a165', '#ffcc00', '#e9d8a6'], wall: '#fffbe6', floor: '#9a9a90', keeper: { name: 'Frau Wimmer', shirt: '#ffcc00', skin: 0, hair: 2, style: 1 } },
  { id: 'boutique', sign: 'KLAMOTTEN', name: 'Boutique', emoji: '👗', verb: 'Klamotten anprobieren', frame: '#f4f1ea', awning: ['#2b2d42', '#f4f1ea'], signBg: '#2b2d42', ink: '#f4acb7', goods: ['#f4acb7', '#4f86f7', '#ffd166', '#2b2d42', '#06d6a0'], wall: '#fbf7f2', floor: '#c8b6a6', keeper: { name: 'Vanessa', shirt: '#2b2d42', skin: 2, hair: 3, style: 5 } },
  { id: 'optiker', sign: 'OPTIK', name: 'Optiker', emoji: '👓', verb: 'Brillen aufsetzen', frame: '#1d3557', awning: ['#1d3557', '#a8dadc'], signBg: '#f1faee', ink: '#1d3557', goods: ['#1d3557', '#9b2226', '#d4af37', '#111111'], wall: '#f1faee', floor: '#a8dadc', keeper: { name: 'Herr Scharf', shirt: '#ffffff', skin: 0, hair: 5, style: 0 } },
  // Food round 2 (shared/shop-rooms-food.ts furnishes them, features/shops/food.ts is what E does).
  { id: 'eisdiele', sign: 'EISCAFÉ VENEZIA', name: 'Eisdiele', emoji: '🍨', verb: 'Eis aussuchen', frame: '#0081a7', awning: ['#f07167', '#fdfcdc'], signBg: '#fdfcdc', ink: '#0081a7', goods: ['#f07167', '#fed9b7', '#00afb9', '#fdfcdc', '#7f4f24'], wall: '#fdfcdc', floor: '#e9d8a6', keeper: { name: 'Gianni', shirt: '#ffffff', skin: 3, hair: 1, style: 0 } },
  { id: 'sushi', sign: 'SUSHI 回転', name: 'Sushi-Bar', emoji: '🍣', verb: 'Teller nehmen', frame: '#1d1d1d', awning: ['#c1121f', '#fdf0d5'], signBg: '#1d1d1d', ink: '#fdf0d5', neon: true, goods: ['#f4845f', '#fdf0d5', '#2d6a4f', '#c1121f'], wall: '#efe6d8', floor: '#6b4f3a', keeper: { name: 'Kenji', shirt: '#fdf0d5', skin: 2, hair: 0, style: 0 } },
  { id: 'metzgerei', sign: 'METZGEREI', name: 'Metzgerei', emoji: '🥩', verb: 'bestellen', frame: '#9d0208', awning: ['#9d0208', '#ffffff'], signBg: '#ffffff', ink: '#9d0208', goods: ['#c9184a', '#ff8fa3', '#e9c46a', '#9c6644'], wall: '#f8f9fa', floor: '#adb5bd', keeper: { name: 'Herr Wimmer', shirt: '#ffffff', skin: 0, hair: 5, style: 0 } },
  { id: 'supermarkt', sign: 'SUPERMARKT', name: 'Supermarkt', emoji: '🛒', verb: 'bezahlen', frame: '#e63946', awning: ['#e63946', '#ffd60a'], signBg: '#ffd60a', ink: '#e63946', goods: ['#e63946', '#ffd60a', '#2a9d8f', '#f4a261', '#457b9d', '#ffffff'], wall: '#f8f9fa', floor: '#dee2e6', keeper: { name: 'Frau Schmid', shirt: '#e63946', skin: 1, hair: 2, style: 1 }, whole: true },
  // Rentals, pets and laundry (features/ride, shared/ride.ts).
  { id: 'fahrrad', sign: 'FAHRRÄDER', name: 'Fahrradladen', emoji: '🚲', verb: 'ein Rad leihen', frame: '#1d3557', awning: ['#2a9d8f', '#f1faee'], signBg: '#f1faee', ink: '#1d3557', goods: ['#e63946', '#1d3557', '#2a9d8f', '#ffb703'], wall: '#f1faee', floor: '#495057', keeper: { name: 'Toni', shirt: '#2a9d8f', skin: 2, hair: 2, style: 0 } },
  { id: 'zoo', sign: 'ZOOHANDLUNG', name: 'Zoohandlung', emoji: '🐠', verb: 'ein Tier aussuchen', frame: '#2d6a4f', awning: ['#74c69d', '#fefae0'], signBg: '#fefae0', ink: '#2d6a4f', goods: ['#4cc9f0', '#f77f00', '#90be6d', '#ffd60a'], wall: '#e9f5db', floor: '#b5a58a', keeper: { name: 'Frau Wimmer', shirt: '#2d6a4f', skin: 0, hair: 3, style: 1 } },
  { id: 'waschsalon', sign: 'WASCHSALON', name: 'Waschsalon', emoji: '🫧', verb: 'Waschpulver holen', frame: '#4361ee', awning: ['#4cc9f0', '#ffffff'], signBg: '#ffffff', ink: '#3a0ca3', neon: true, goods: ['#4cc9f0', '#ffffff', '#f72585'], wall: '#e0fbfc', floor: '#adb5bd', keeper: { name: 'Herr Pospischil', shirt: '#4361ee', skin: 1, hair: 5, style: 6 } },
];

/** The kinds dealt round shop by shop (the others take a whole side of a building: see layShops). */
export const DEALT_KINDS: readonly ShopKind[] = SHOP_KINDS.filter((k) => !k.whole);
/** The kinds that take a whole side of a building. */
export const WHOLE_KINDS: readonly ShopKind[] = SHOP_KINDS.filter((k) => k.whole);

export const SHOP_KIND_BY_ID = new Map<ShopKindId, ShopKind>(SHOP_KINDS.map((k) => [k.id, k]));

/** A side of a lot: the +z, -z, +x or -x one. */
export type Side = 'pz' | 'nz' | 'px' | 'nx';
export const SIDES: readonly Side[] = ['pz', 'nz', 'px', 'nx'];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A side of a lot as a line along its outer face: from corner (ax, az) along (ux, uz) for `len`, facing out along (nx, nz). */
export interface Face {
  ax: number;
  az: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  len: number;
}

export interface Shop {
  /** Its place in SHOPS. */
  i: number;
  /** Its building, by its place in LOTS, and the side of it. */
  lot: number;
  side: Side;
  kind: ShopKindId;
  /** Its frame: (ox, oz) is u = 0, v = 0; u runs along (ux, uz), v inward, against (nx, nz). */
  ox: number;
  oz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  len: number;
  depth: number;
  /** The door's middle, along u. */
  doorU: number;
  /** The room, walls and all. */
  rect: Rect;
}

/** Whether there's a road within 12 m out from (x, z) along (dx, dz): a city street, the office's, or the loop. */
function roadOut(x: number, z: number, dx: number, dz: number): boolean {
  for (let d = 1; d <= 12; d += 0.5) {
    const px = x + dx * d;
    const pz = z + dz * d;
    if (onCityStreet(px, pz) || onLoop(px, pz) || (pz > ROAD.minZ && pz < ROAD.maxZ && Math.abs(px) < STREET_END)) return true;
  }
  return false;
}

/** Which sides of `lot` face a street (not the next lot on its block, nor the country). */
export function streetSides(lot: Lot): Record<Side, boolean> {
  const i = Math.round((lot.x - CITY_X + PERIOD / 2) / PERIOD);
  const j = Math.round((lot.z - CITY_Z + PERIOD / 2) / PERIOD);
  const bx = CITY_X - PERIOD / 2 + i * PERIOD;
  const bz = CITY_Z - PERIOD / 2 + j * PERIOD;
  const edge = BLOCK_INNER / 2 - 5;
  const hw = lot.w / 2;
  const hd = lot.d / 2;
  return {
    pz: lot.z + hd > bz + edge && roadOut(lot.x, lot.z + hd, 0, 1),
    nz: lot.z - hd < bz - edge && roadOut(lot.x, lot.z - hd, 0, -1),
    px: lot.x + hw > bx + edge && roadOut(lot.x + hw, lot.z, 1, 0),
    nx: lot.x - hw < bx - edge && roadOut(lot.x - hw, lot.z, -1, 0),
  };
}

/** Whether a lot gets shops: the buildings close enough to walk to (see Lot.ring). */
export const hasShops = (lot: Lot) => lot.ring < 2;

/** A side of `lot` as a face, corner to corner. */
export function faceOf(lot: Lot, side: Side): Face {
  const hw = lot.w / 2;
  const hd = lot.d / 2;
  switch (side) {
    case 'pz':
      return { ax: lot.x - hw, az: lot.z + hd, ux: 1, uz: 0, nx: 0, nz: 1, len: lot.w };
    case 'nz':
      return { ax: lot.x + hw, az: lot.z - hd, ux: -1, uz: 0, nx: 0, nz: -1, len: lot.w };
    case 'px':
      return { ax: lot.x + hw, az: lot.z + hd, ux: 0, uz: -1, nx: 1, nz: 0, len: lot.d };
    case 'nx':
      return { ax: lot.x - hw, az: lot.z - hd, ux: 0, uz: 1, nx: -1, nz: 0, len: lot.d };
  }
}

/**
 * How a lot's ground floor is laid out: for each side, the stretch along its face that's shops (`from`
 * to `to`, in meters from the face's corner) and how deep they go, or null; and the solid core behind them.
 * The ±z sides' shops run the whole width; the ±x sides' run between those, if there's room.
 */
export interface LotPlan {
  rooms: Record<Side, { from: number; to: number; depth: number; count: number } | null>;
  core: Rect | null;
}

export function lotPlan(lot: Lot): LotPlan {
  const rooms: LotPlan['rooms'] = { pz: null, nz: null, px: null, nx: null };
  const core: Rect = { minX: lot.x - lot.w / 2, maxX: lot.x + lot.w / 2, minZ: lot.z - lot.d / 2, maxZ: lot.z + lot.d / 2 };
  if (!hasShops(lot)) return { rooms, core };
  const sides = streetSides(lot);
  const deep = (both: boolean, across: number) => Math.min(ROOM_MAX, both ? across / 2 : across - 4);
  const dz = deep(sides.pz && sides.nz, lot.d);
  const count = (len: number) => Math.max(1, Math.floor(len / SHOP_LEN));
  if (dz >= ROOM_MIN) {
    for (const s of ['pz', 'nz'] as const) if (sides[s] && lot.w >= ROOM_MIN) rooms[s] = { from: 0, to: lot.w, depth: dz, count: count(lot.w) };
  }
  if (rooms.pz) core.maxZ -= dz;
  if (rooms.nz) core.minZ += dz;
  const dx = deep(sides.px && sides.nx, lot.w);
  const lenX = core.maxZ - core.minZ;
  if (dx >= ROOM_MIN && lenX >= ROOM_MIN) {
    // Along the ±x faces, between the ±z sides' shops: measured from each face's own corner.
    const skipP = rooms.pz ? dz : 0;
    const skipN = rooms.nz ? dz : 0;
    if (sides.px) rooms.px = { from: skipP, to: skipP + lenX, depth: dx, count: count(lenX) };
    if (sides.nx) rooms.nx = { from: skipN, to: skipN + lenX, depth: dx, count: count(lenX) };
  }
  if (rooms.px) core.maxX -= dx;
  if (rooms.nx) core.minX += dx;
  return { rooms, core: core.maxX - core.minX > 0.01 && core.maxZ - core.minZ > 0.01 ? core : null };
}

/** World (x, z) of (u, v) in `shop`'s frame. */
export function shopPoint(s: Pick<Shop, 'ox' | 'oz' | 'ux' | 'uz' | 'nx' | 'nz'>, u: number, v: number): { x: number; z: number } {
  return { x: s.ox + s.ux * u - s.nx * v, z: s.oz + s.uz * u - s.nz * v };
}

/** (u, v) in `shop`'s frame of world (x, z). */
export function shopLocal(s: Shop, x: number, z: number): { u: number; v: number } {
  const dx = x - s.ox;
  const dz = z - s.oz;
  return { u: dx * s.ux + dz * s.uz, v: -(dx * s.nx + dz * s.nz) };
}

/** The heading (rotY, 0 = +z) that faces along (dx, dz) in `shop`'s frame: +v is into the shop. */
export function shopYaw(s: Pick<Shop, 'ux' | 'uz' | 'nx' | 'nz'>, du: number, dv: number): number {
  const x = s.ux * du - s.nx * dv;
  const z = s.uz * du - s.nz * dv;
  return Math.atan2(x, z);
}

/** The world box of a box in `shop`'s frame (u0..u1 along, v0..v1 in). */
export function shopRect(s: Pick<Shop, 'ox' | 'oz' | 'ux' | 'uz' | 'nx' | 'nz'>, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = shopPoint(s, u0, v0);
  const b = shopPoint(s, u1, v1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

/** Every lot's plan, by its place in LOTS. */
export const LOT_PLANS: readonly LotPlan[] = LOTS.map(lotPlan);

/**
 * Where each quarter of the city starts its round of kinds, so neighbouring quarters don't match and
 * every kind gets at least five shops in three quarters or more (tests/shops.test.ts). Picked by trying
 * every set of starts for the 24 kinds dealt now (25 less the supermarket, which takes whole sides)
 * and keeping the one whose rarest kind has the most shops; with more or fewer kinds, pick again.
 */
const QUARTER_START: Record<string, number> = { '1-1': 0, '-1-1': 3, '11': 21, '-11': 23 };

/** Which quarter of the city round the office (x, z) is in. */
export const quarterOf = (x: number, z: number) => `${Math.sign(x)}${Math.sign(z - 27)}`;

/** A whole-side kind (the supermarket) takes every this-many-th side of two or three shops, nearest first, in each quarter. */
const WHOLE_EVERY = 4;

function layShops(): Shop[] {
  const shops: Omit<Shop, 'i' | 'kind'>[] = [];
  const whole: (ShopKindId | undefined)[] = [];
  // The sides that could be a whole-side kind: two or three shops long, in order of how far their middle is, per quarter.
  const wide: { li: number; side: Side; d: number; q: string }[] = [];
  LOTS.forEach((lot, li) => {
    for (const side of SIDES) {
      const r = LOT_PLANS[li].rooms[side];
      if (!r || r.count < 2 || r.count > 3) continue;
      const f = faceOf(lot, side);
      const mx = f.ax + f.ux * (r.from + r.to) / 2;
      const mz = f.az + f.uz * (r.from + r.to) / 2;
      wide.push({ li, side, d: Math.hypot(mx, mz), q: quarterOf(mx, mz) });
    }
  });
  wide.sort((a, b) => a.d - b.d || a.li - b.li);
  const wholeSide = new Map<string, ShopKindId>();
  const perQ = new Map<string, number>();
  for (const w of wide) {
    const n = perQ.get(w.q) ?? 0;
    perQ.set(w.q, n + 1);
    if (WHOLE_KINDS.length && n % WHOLE_EVERY === 0) wholeSide.set(`${w.li}${w.side}`, WHOLE_KINDS[(n / WHOLE_EVERY) % WHOLE_KINDS.length].id);
  }
  LOTS.forEach((lot, li) => {
    const plan = LOT_PLANS[li];
    for (const side of SIDES) {
      const r = plan.rooms[side];
      if (!r) continue;
      const f = faceOf(lot, side);
      const big = wholeSide.get(`${li}${side}`);
      const count = big ? 1 : r.count;
      const len = (r.to - r.from) / count;
      for (let k = 0; k < count; k++) {
        const start = r.from + k * len;
        const ox = f.ax + f.ux * start;
        const oz = f.az + f.uz * start;
        // The door at one end or the other, so neighbours' doors don't sit side by side.
        const doorU = (li + k + SIDES.indexOf(side)) % 2 ? DOOR_IN : len - DOOR_IN;
        const frame = { ox, oz, ux: f.ux, uz: f.uz, nx: f.nx, nz: f.nz };
        shops.push({ lot: li, side, ...frame, len, depth: r.depth, doorU, rect: shopRect(frame, 0, len, 0, r.depth) });
        whole.push(big);
      }
    }
  });
  // The nearest shops to the office are one of every dealt kind; past them the kinds go round in order of
  // how far each shop's door is, in each quarter of the city on its own, so every kind turns up in
  // every quarter, whatever blocks there are (a landmark's takes its shops away).
  const door = (s: (typeof shops)[number]) => shopPoint(s, s.doorU, 0);
  const far = (s: (typeof shops)[number]) => Math.hypot(door(s).x, door(s).z);
  const order = shops.map((s, n) => ({ n, d: far(s) })).filter(({ n }) => !whole[n]).sort((a, b) => a.d - b.d || a.n - b.n);
  const kinds: ShopKindId[] = whole.map((w) => w as ShopKindId);
  const dealt = new Map<string, number>();
  order.forEach(({ n }, rank) => {
    if (rank < DEALT_KINDS.length) return void (kinds[n] = DEALT_KINDS[rank].id);
    const d = door(shops[n]);
    const q = quarterOf(d.x, d.z);
    const k = dealt.get(q) ?? QUARTER_START[q] ?? 0;
    dealt.set(q, k + 1);
    kinds[n] = DEALT_KINDS[k % DEALT_KINDS.length].id;
  });
  return shops.map((s, i) => ({ ...s, i, kind: kinds[i] }));
}

/** Every shop in the city. */
export const SHOPS: readonly Shop[] = layShops();

/** The shop whose room (walls included, `pad` more round it) (x, z) is in, if any. */
export function shopAt(x: number, z: number, pad = 0): Shop | undefined {
  for (const s of SHOPS) {
    const r = s.rect;
    if (x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad) return s;
  }
  return undefined;
}

/** A solid box, from `bottom` to `top` above the street. */
export interface Solid extends Rect {
  bottom: number;
  top: number;
}

/**
 * What of a lot is solid: without shops, all of it; with them, the floors over the shops, the core
 * behind them, and each shop's walls with a gap for its door (shop-rooms.ts adds what's in it).
 */
export function lotSolids(li: number): Solid[] {
  const lot = LOTS[li];
  const all: Rect = { minX: lot.x - lot.w / 2, maxX: lot.x + lot.w / 2, minZ: lot.z - lot.d / 2, maxZ: lot.z + lot.d / 2 };
  const plan = LOT_PLANS[li];
  if (!SIDES.some((s) => plan.rooms[s])) return [{ ...all, bottom: 0, top: 400 }];
  const out: Solid[] = [{ ...all, bottom: SHOP_H, top: 400 }];
  if (plan.core) out.push({ ...plan.core, bottom: 0, top: SHOP_H });
  for (const s of SHOPS) if (s.lot === li) out.push(...shopWalls(s));
  return out;
}

/** The door's leaf, propped open against the inside of the front on the side away from the shop's middle: u0..u1, v0..v1. */
export function doorLeaf(s: Pick<Shop, 'doorU' | 'len'>): { u0: number; u1: number; v0: number; v1: number; hinge: number } {
  const far = s.doorU > s.len / 2;
  const hinge = far ? s.doorU + DOOR_W / 2 : s.doorU - DOOR_W / 2;
  return { u0: far ? hinge : hinge - 0.06, u1: far ? hinge + 0.06 : hinge, v0: FRONT_T, v1: FRONT_T + DOOR_W - 0.05, hinge };
}

/** A shop's walls: the front either side of its door (its windows are glass), the door's open leaf, its sides and its back. */
export function shopWalls(s: Shop): Solid[] {
  const wall = (u0: number, u1: number, v0: number, v1: number, bottom = 0, top = SHOP_H): Solid => ({ ...shopRect(s, u0, u1, v0, v1), bottom, top });
  const d0 = s.doorU - DOOR_W / 2;
  const d1 = s.doorU + DOOR_W / 2;
  const leaf = doorLeaf(s);
  return [
    wall(0, d0, 0, FRONT_T),
    wall(d1, s.len, 0, FRONT_T),
    // Over the door, and the door itself, open.
    wall(d0, d1, 0, FRONT_T, DOOR_H, SHOP_H),
    wall(leaf.u0, leaf.u1, leaf.v0, leaf.v1, 0, DOOR_H),
    wall(0, WALL_T, 0, s.depth),
    wall(s.len - WALL_T, s.len, 0, s.depth),
    wall(0, s.len, s.depth - WALL_T, s.depth),
  ];
}

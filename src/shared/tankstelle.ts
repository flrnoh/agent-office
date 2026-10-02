import { landmarkBox } from './landmarks.js';

// flrnoh fork (see FORK.md "The petrol station"): FLOGGE OIL, the petrol station with its car wash on
// the landmark block west of the office (shared/landmarks.ts: x -134..-90, z -23..21 inside its
// sidewalks). The office's own street runs along its south side (z ≈ 27), city streets along its
// north (z -29) and east (x -84). Where everything stands is laid out here, once, so the page draws
// it, the garage's cars may drive on its paving (paved in shared/garage.ts), the office checks a car
// is at a pump or on the wash's marking, and the tests agree with all of them.
//
//            north street (z -29)
//   ┌──exit──┬───────┬────────────────────┐
//   │  car   │vacuum │  shop (glass front │
//   │  wash  │ yard  │  south, door x-104)│
//   │  hall  ├───────┴──┬─parking──┬──────┤
//   │ (drive │  canopy over two pump    │ air
//   │ north) │  islands, 4 pumps        │
//   │ queue  │                          │pylon
//   └─wash in┴────────────── entry ─────┘
//            office's street (z 27)

/** The block the station stands on, inside its sidewalks. */
export const STATION = landmarkBox('tankstelle');

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** What the station calls itself, on the pylon, the canopy and the shop (a brand of its own, no real one). */
export const BRAND = 'FLOGGE OIL';

/**
 * Where a car can go on the station: the forecourt, the lane through the wash, the vacuum bays, and
 * the driveways out across the sidewalks onto the streets (the office's to the south, the city's to
 * the north). The green strips round the edge, the planter under the pylon and the buildings aren't.
 */
export const STATION_PAVED: readonly Rect[] = [
  // The forecourt: the pumps, the parking in front of the shop, the queue for the wash.
  { minX: -133, maxX: -91, minZ: -9, maxZ: 16.3 },
  { minX: -133, maxX: -95, minZ: 16.3, maxZ: 20 },
  // The lane through the car wash, and the vacuum bays beside it.
  { minX: -133, maxX: -123, minZ: -22, maxZ: -9 },
  { minX: -123, maxX: -114.3, minZ: -22, maxZ: -9 },
  // The driveways: in off the office's street to the pumps, in off it to the wash (and out again), and out
  // of the wash across the north sidewalk onto the city's street. (None further west: there the office's
  // street is already the scenic loop, whose verge stays unbroken so a car rides along its edge.)
  { minX: -105.5, maxX: -97.5, minZ: 16, maxZ: 23.8 },
  { minX: -121.5, maxX: -113.5, minZ: 16, maxZ: 23.8 },
  { minX: -131, maxX: -125, minZ: -25.3, maxZ: -21.5 },
];

/** The driveways alone (the ones STATION_PAVED ends with), for the curbs' gaps and the tests. */
export const DRIVEWAYS: readonly Rect[] = STATION_PAVED.slice(4);

/** Whether (x, z) is on the station's block (or within `pad` of it): what the country round it keeps off (its palms). */
export const inStation = (x: number, z: number, pad = 0) => x > STATION.minX - pad && x < STATION.maxX + pad && z > STATION.minZ - pad && z < STATION.maxZ + pad;

const inside = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** Whether (x, z) is the station's paving (see paved in shared/garage.ts). */
export function onTankstelle(x: number, z: number): boolean {
  if (x < -134 || x > -90 || z < -25.5 || z > 24) return false;
  return STATION_PAVED.some((r) => inside(r, x, z));
}

// ---- The pumps ---------------------------------------------------------------------------------

/** The canopy over the pumps, and how high its underside is. */
export const CANOPY: Rect & { under: number; deck: number } = { minX: -119.5, maxX: -98.5, minZ: -0.5, maxZ: 14.5, under: 4.9, deck: 0.9 };

/** The two pump islands, running north-south under the canopy (a curb, low enough for a car's wheels). */
export const ISLANDS: readonly Rect[] = [
  { minX: -113.6, maxX: -112.4, minZ: 1.8, maxZ: 12.2 },
  { minX: -105.6, maxX: -104.4, minZ: 1.8, maxZ: 12.2 },
];

/** The canopy's columns, at the islands' ends. */
export const COLUMNS: readonly { x: number; z: number }[] = [
  { x: -113, z: 2.4 },
  { x: -113, z: 11.6 },
  { x: -105, z: 2.4 },
  { x: -105, z: 11.6 },
];

export interface Pump {
  /** Its number, as the sign over it says (1–4). */
  n: number;
  x: number;
  z: number;
}

/** Four pumps, two on each island, each with a hose either side (it serves a car on either side of its island). */
export const PUMPS: readonly Pump[] = [
  { n: 1, x: -113, z: 5 },
  { n: 2, x: -113, z: 9 },
  { n: 3, x: -105, z: 5 },
  { n: 4, x: -105, z: 9 },
];

/** A pump's footprint, either side of its middle (x across the island, z along it). */
export const PUMP_HALF = { x: 0.32, z: 0.48, h: 1.95 } as const;

/** What it costs a litre (fun only: there's no money in the office). */
export interface Fuel {
  id: 'e10' | 'super' | 'plus' | 'diesel';
  name: string;
  price: number;
  color: string;
}

export const FUELS: readonly Fuel[] = [
  { id: 'e10', name: 'Super E10', price: 1.769, color: '#2a9d8f' },
  { id: 'super', name: 'Super E5', price: 1.829, color: '#3a86ff' },
  { id: 'plus', name: 'Super Plus', price: 1.939, color: '#e63946' },
  { id: 'diesel', name: 'Diesel', price: 1.689, color: '#222222' },
];

/** Prices the way a German pylon shows them: "1,76⁹". */
export function priceParts(p: number): { main: string; nine: string } {
  const s = p.toFixed(3);
  return { main: s.slice(0, 4).replace('.', ','), nine: s.slice(4) };
}

// ---- The shop ------------------------------------------------------------------------------------

/** The shop: its walls (the glass front faces the forecourt, south), its door, the counter, the cashier. */
export const SHOP: Rect & { h: number; wall: number } = { minX: -114, maxX: -94, minZ: -21, maxZ: -9, h: 4.2, wall: 0.25 };
/** The automatic sliding door in the glass front, and how wide it opens. */
export const SHOP_DOOR = { x: -104, z: -9, w: 2.4, h: 2.5 } as const;
/** The counter (the till on it), the cashier behind it facing the shop, and where you stand to be served. */
export const COUNTER: Rect & { h: number } = { minX: -112.5, maxX: -107.5, minZ: -13.4, maxZ: -12.6, h: 1.05 };
export const CASHIER = { x: -110, z: -14.5, rotY: 0 } as const;
/** The back counter behind the cashier, with the coffee machine on it. */
export const BACK_COUNTER: Rect & { h: number } = { minX: -113.7, maxX: -106.6, minZ: -16.9, maxZ: -16.1, h: 0.95 };
export const COFFEE_MACHINE = { x: -108.2, z: -16.5 } as const;
/** The shelves of snacks down the shop, and the drinks fridges along its back wall. */
export const SHELVES: readonly Rect[] = [
  { minX: -103, maxX: -102, minZ: -18.6, maxZ: -12.6 },
  { minX: -99.2, maxX: -98.2, minZ: -18.6, maxZ: -12.6 },
];
export const FRIDGES: Rect = { minX: -105.5, maxX: -94.4, minZ: -20.75, maxZ: -20.05 };
/** The low wall between the till and the shelves, so the cashier has her own corner. */
export const TILL_WALL: Rect = { minX: -107.1, maxX: -106.8, minZ: -16.9, maxZ: -13.9 };

// ---- The car wash ----------------------------------------------------------------------------------

/**
 * The car wash: a hall you drive through northward, in at its south end off the forecourt and out at
 * its north end onto the city's street. `bay` is where a car stops for its wash (the marking on the
 * floor), facing north; the gantry runs along the car between `from` and `to` (z).
 */
export const WASH = {
  hall: { minX: -133, maxX: -123, minZ: -21, maxZ: 1 },
  wall: 0.3,
  h: 4.6,
  /** The doors at either end: how wide (in x, about the lane's middle) and how high. */
  door: { w: 4.4, h: 3.5 },
  lane: -128,
  bay: { x: -128, z: -10, rotY: Math.PI },
  from: -14.2,
  to: -5.8,
  /** The pay terminal by the way in, on the driver's side (west). */
  terminal: { x: -131.5, z: 4.4 },
} as const;

/** How far off the marking a car may stand and still be washed. */
const BAY_SLACK = { x: 0.9, z: 1.4, yaw: 0.4 } as const;

/** Whether a car standing at `p` is on the wash's marking (nose north, or backed in south). */
export function onWashBay(p: { x: number; z: number; rotY: number }): boolean {
  if (Math.abs(p.x - WASH.bay.x) > BAY_SLACK.x || Math.abs(p.z - WASH.bay.z) > BAY_SLACK.z) return false;
  return Math.abs(Math.sin(p.rotY)) < Math.sin(BAY_SLACK.yaw);
}

/** Whether (x, z) is inside the wash hall (someone standing in there gets wet). */
export function inWashHall(x: number, z: number): boolean {
  const h = WASH.hall;
  return x > h.minX + WASH.wall && x < h.maxX - WASH.wall && z > h.minZ && z < h.maxZ;
}

// ---- Round about -----------------------------------------------------------------------------------

/** The price pylon at the street, the air and water post, the vacuum station, and the bins. */
export const PYLON = { x: -93, z: 18.2, w: 2.3, h: 6.6 } as const;
export const PLANTER: Rect = { minX: -95, maxX: -91, minZ: 16.3, maxZ: 20 };
export const AIR = { x: -92.4, z: 6 } as const;
export const VACUUM = { x: -118.6, z: -21.2 } as const;
export const BINS: readonly { x: number; z: number }[] = [
  { x: -113, z: 7 },
  { x: -105, z: 7 },
  { x: -101.4, z: -8.3 },
  { x: -132.4, z: 12 },
  { x: -114.9, z: -11 },
];

/** The station's own cars, parked: two in front of the shop and one at the vacuum. */
export const PARKED: readonly { x: number; z: number; rotY: number; color: string; kind: 'lambo' | 'ferrari' }[] = [
  { x: -111.4, z: -6.4, rotY: Math.PI, color: '#f1faee', kind: 'ferrari' },
  { x: -96.6, z: -6.4, rotY: Math.PI, color: '#264653', kind: 'lambo' },
  { x: -116.2, z: -15.6, rotY: Math.PI, color: '#9b5de5', kind: 'ferrari' },
];

const box = (x: number, z: number, hx: number, hz: number, top: number): Rect & { top: number } => ({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, top });

/**
 * What stands on the station and is in the way, for people and cars alike (`top` meters up off the
 * street): the shop's and the wash hall's walls (with their doorways left open), the columns, the
 * pumps, the pylon, the posts and the bins, and the station's own parked cars. The page builds its
 * colliders from these; the tests check none of them stands in a driveway, a pump's lane or the wash's.
 */
export function stationSolids(): (Rect & { top: number })[] {
  const out: (Rect & { top: number })[] = [];
  const s = SHOP;
  const t = s.wall;
  // The shop: back and sides, the glass front either side of the door.
  out.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.minZ + t, top: s.h });
  out.push({ minX: s.minX, maxX: s.minX + t, minZ: s.minZ, maxZ: s.maxZ, top: s.h });
  out.push({ minX: s.maxX - t, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, top: s.h });
  out.push({ minX: s.minX, maxX: SHOP_DOOR.x - SHOP_DOOR.w / 2, minZ: s.maxZ - t, maxZ: s.maxZ, top: s.h });
  out.push({ minX: SHOP_DOOR.x + SHOP_DOOR.w / 2, maxX: s.maxX, minZ: s.maxZ - t, maxZ: s.maxZ, top: s.h });
  // Inside: the counter, the back counter, the shelves, the fridges.
  for (const r of [COUNTER, BACK_COUNTER]) out.push({ ...r, top: r.h });
  out.push({ ...TILL_WALL, top: 1.2 });
  for (const r of SHELVES) out.push({ ...r, top: 1.7 });
  out.push({ ...FRIDGES, top: 2.2 });
  // The wash hall: its long walls, and the stubs either side of its doors at both ends.
  const w = WASH.hall;
  const wt = WASH.wall;
  out.push({ minX: w.minX, maxX: w.minX + wt, minZ: w.minZ, maxZ: w.maxZ, top: WASH.h });
  out.push({ minX: w.maxX - wt, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ, top: WASH.h });
  for (const z of [w.minZ, w.maxZ]) {
    out.push({ minX: w.minX, maxX: WASH.lane - WASH.door.w / 2, minZ: z - wt / 2, maxZ: z + wt / 2, top: WASH.h });
    out.push({ minX: WASH.lane + WASH.door.w / 2, maxX: w.maxX, minZ: z - wt / 2, maxZ: z + wt / 2, top: WASH.h });
  }
  out.push(box(WASH.terminal.x, WASH.terminal.z, 0.25, 0.2, 1.5));
  // Under the canopy: its columns and the pumps.
  for (const c of COLUMNS) out.push(box(c.x, c.z, 0.25, 0.25, CANOPY.under));
  for (const p of PUMPS) out.push(box(p.x, p.z, PUMP_HALF.x, PUMP_HALF.z, PUMP_HALF.h));
  // Round about.
  out.push(box(PYLON.x, PYLON.z, 0.25, PYLON.w / 2, PYLON.h)); // its faces east and west, along the street
  out.push(box(AIR.x, AIR.z, 0.3, 0.3, 1.5));
  out.push(box(VACUUM.x, VACUUM.z, 0.35, 0.35, 2.4));
  for (const b of BINS) out.push(box(b.x, b.z, 0.28, 0.28, 0.95));
  for (const p of PARKED) out.push(box(p.x, p.z, 1, 2.3, 1.15));
  return out;
}

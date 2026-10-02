import { CITY_WALK } from './city.js';
import { landmarkBox } from './landmarks.js';

// flrnoh fork (see FORK.md "The Baumarkt"): HAMMER & CO, the DIY store on its landmark block north-east
// of the office (shared/landmarks.ts). Where everything stands, laid out once for the office, every
// page and the tests: the hall with its aisles of high-bay racks, the checkouts, the paint counter and
// the tool wall; the delivery bay with its lorry beside it, the car park in front (paved for the
// garage's cars, see paved in shared/garage.ts) with a driveway across the sidewalk to the street, the
// trolley corral and the fenced garden centre. What moves (the forklift, its pallets, the trolleys) is
// in baumarkt-play.ts. All x/z in the office's frame; the street is at STREET_Y.

/** A box on the ground, in x and z. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The block inside its sidewalks: 44 × 44 m. */
export const BLOCK = landmarkBox('baumarkt');

/**
 * The hall, walls included (0.3 m, centered on these lines), and how tall it is. Clear of the street
 * trees on the block's edge behind it and down its east side (see world/town/furniture.ts).
 */
export const HALL: Box = { minX: BLOCK.minX + 12, maxX: BLOCK.maxX - 3.2, minZ: BLOCK.minZ + 3.5, maxZ: BLOCK.minZ + 24.5 };
export const HALL_H = 8;
export const WALL_T = 0.3;
/** Inside the walls. */
export const INSIDE: Box = { minX: HALL.minX + WALL_T / 2, maxX: HALL.maxX - WALL_T / 2, minZ: HALL.minZ + WALL_T / 2, maxZ: HALL.maxZ - WALL_T / 2 };

/** The entrance: sliding doors in the front (south) wall, under the canopy. */
export const ENTRANCE = { x: HALL.minX + 11, z: HALL.maxZ, width: 4 } as const;
/** The dock's roller door in the west wall, out to the delivery bay: wide enough for the forklift with a pallet. */
export const DOCK = { x: HALL.minX, z: HALL.minZ + 10.5, width: 5 } as const;

/** The delivery bay west of the hall, open to the car park. */
export const BAY: Box = { minX: BLOCK.minX + 2, maxX: HALL.minX, minZ: HALL.minZ, maxZ: HALL.maxZ };
/** The lorry parked along the bay's north side (cab to the west), its curtain open. */
export const LORRY: Box = { minX: BAY.minX + 1, maxX: BAY.maxX - 0.6, minZ: BAY.minZ + 0.4, maxZ: BAY.minZ + 2.9 };

/** The car park in front of the hall and the bay, out to the block's edge. */
export const LOT: Box = { minX: BLOCK.minX + 2, maxX: HALL.minX + 18, minZ: HALL.maxZ, maxZ: BLOCK.maxZ };
/** Across the sidewalk to the street in front (z = BLOCK.maxZ + CITY_WALK is the road's edge), between the street trees. */
export const DRIVEWAY: Box = { minX: BLOCK.x + 0.5, maxX: BLOCK.x + 7.5, minZ: BLOCK.maxZ, maxZ: BLOCK.maxZ + CITY_WALK };

/** The garden centre east of the car park, fenced, its gate on the car park's side. */
export const GARDEN: Box = { minX: LOT.maxX + 1.5, maxX: HALL.maxX, minZ: HALL.maxZ + 2, maxZ: BLOCK.maxZ - 2 };
export const GARDEN_GATE = { z0: GARDEN.minZ + 5, z1: GARDEN.minZ + 9 } as const;
/** The glasshouse roof over the garden centre's north half. */
export const GLASSHOUSE: Box = { minX: GARDEN.minX, maxX: GARDEN.maxX, minZ: GARDEN.minZ, maxZ: GARDEN.minZ + 7 };

/** Where the garage's cars may drive here: the car park, the bay and the driveway (see paved in shared/garage.ts). */
const PAVED: Box[] = [LOT, BAY, DRIVEWAY];
export const inBox = (b: Box, x: number, z: number, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
export function onBaumarktLot(x: number, z: number): boolean {
  return PAVED.some((b) => inBox(b, x, z)) && !inBox(GARDEN, x, z);
}

/** On the Baumarkt's block (or its driveway), give or take `pad`. */
export const onBaumarkt = (x: number, z: number, pad = 0) => inBox(BLOCK, x, z, pad) || inBox(DRIVEWAY, x, z, pad);
/** Inside the hall. */
export const inHall = (x: number, z: number, pad = 0) => inBox(INSIDE, x, z, pad);

// ---- Inside ------------------------------------------------------------------------------------

/** A row of high-bay racks, down the hall (along z), shelves on both faces; what's on them; the aisle sign east of it. */
export interface Rack {
  x: number;
  z0: number;
  z1: number;
  goods: 'timber' | 'tiles' | 'pipes' | 'paint';
}
export const RACK_DEEP = 1.4;
export const RACK_H = 5.4;
/** The shelves' heights (the ground's the first). */
export const SHELVES = [0.12, 1.45, 2.8, 4.15] as const;
/** Four bays of 2.4 m each, a cross aisle behind them and the front of the hall before them. */
export const RACK_BAY = 2.4;
const RACK_Z0 = HALL.minZ + 2.6;
const RACK_Z1 = RACK_Z0 + 4 * RACK_BAY;
export const RACKS: readonly Rack[] = [
  { x: HALL.minX + 6, z0: RACK_Z0, z1: RACK_Z1, goods: 'timber' },
  { x: HALL.minX + 11, z0: RACK_Z0, z1: RACK_Z1, goods: 'tiles' },
  { x: HALL.minX + 16, z0: RACK_Z0, z1: RACK_Z1, goods: 'pipes' },
  { x: HALL.minX + 21, z0: RACK_Z0, z1: RACK_Z1, goods: 'paint' },
];
export const rackBox = (r: Rack): Box => ({ minX: r.x - RACK_DEEP / 2, maxX: r.x + RACK_DEEP / 2, minZ: r.z0, maxZ: r.z1 });

/** The signs hanging over the aisles: west of the first rack, between the racks, and east of the last. */
export const AISLES: readonly { x: number; name: string; icon: string }[] = [
  { x: (INSIDE.minX + RACKS[0].x - RACK_DEEP / 2) / 2, name: 'Paletten & Baustoffe', icon: '🧱' },
  { x: (RACKS[0].x + RACKS[1].x) / 2, name: 'Holz & Zuschnitt', icon: '🪵' },
  { x: (RACKS[1].x + RACKS[2].x) / 2, name: 'Fliesen', icon: '🔲' },
  { x: (RACKS[2].x + RACKS[3].x) / 2, name: 'Sanitär', icon: '🚿' },
  { x: (RACKS[3].x + RACK_DEEP / 2 + INSIDE.maxX) / 2, name: 'Farben & Werkzeug', icon: '🎨' },
];
export const AISLE_SIGN_Z = (RACK_Z0 + RACK_Z1) / 2;

/** The checkouts east of the entrance: a counter each (along z), the cashier on its east side. */
export const CHECKOUTS: readonly Box[] = [0, 1].map((k) => {
  const x = ENTRANCE.x + 4.5 + k * 3.5;
  return { minX: x - 0.4, maxX: x + 0.4, minZ: HALL.maxZ - 5, maxZ: HALL.maxZ - 2.2 };
});
export const CASHIER = { x: CHECKOUTS[0].maxX + 0.65, z: (CHECKOUTS[0].minZ + CHECKOUTS[0].maxZ) / 2 - 0.3, rotY: -Math.PI / 2 } as const;
/** The anti-theft gates either side of the way in, just inside the doors. */
export const GATES: readonly Box[] = [-1, 1].map((s) => {
  const x = ENTRANCE.x + s * (ENTRANCE.width / 2 + 0.25);
  return { minX: x - 0.12, maxX: x + 0.12, minZ: HALL.maxZ - 1.6, maxZ: HALL.maxZ - 1 };
});

/** The paint counter against the east wall, the shaker on it; and the tool wall (pegboard) along the east wall behind the racks. */
export const PAINT_COUNTER: Box = { minX: INSIDE.maxX - 1.1, maxX: INSIDE.maxX, minZ: HALL.maxZ - 7, maxZ: HALL.maxZ - 3 };
export const MIXER = { x: INSIDE.maxX - 0.55, z: (PAINT_COUNTER.minZ + PAINT_COUNTER.maxZ) / 2 } as const;
export const TOOL_WALL = { x: INSIDE.maxX, z0: HALL.minZ + 2.5, z1: HALL.minZ + 11 } as const;
/** A stack of charcoal sacks on offer by the checkouts. */
export const PROMO: Box = { minX: HALL.minX + 23.45, maxX: HALL.minX + 25.55, minZ: HALL.maxZ - 4.25, maxZ: HALL.maxZ - 2.75 };

/** What the forklift (and a pallet it sets down) can't go through: the walls but their doors, the racks, the counters, the gates and the lorry. */
export const SOLIDS: readonly Box[] = (() => {
  const t = WALL_T / 2;
  const { minX, maxX, minZ, maxZ } = HALL;
  const ex0 = ENTRANCE.x - ENTRANCE.width / 2;
  const ex1 = ENTRANCE.x + ENTRANCE.width / 2;
  const dz0 = DOCK.z - DOCK.width / 2;
  const dz1 = DOCK.z + DOCK.width / 2;
  return [
    { minX, maxX, minZ: minZ - t, maxZ: minZ + t },
    { minX: maxX - t, maxX: maxX + t, minZ, maxZ },
    { minX, maxX: ex0, minZ: maxZ - t, maxZ: maxZ + t },
    { minX: ex1, maxX, minZ: maxZ - t, maxZ: maxZ + t },
    { minX: minX - t, maxX: minX + t, minZ, maxZ: dz0 },
    { minX: minX - t, maxX: minX + t, minZ: dz1, maxZ },
    ...RACKS.map(rackBox),
    ...CHECKOUTS,
    ...GATES,
    PAINT_COUNTER,
    PROMO,
    LORRY,
  ];
})();

/** Where the forklift may go: the hall and the delivery bay, through the dock's door. */
export const FORK_AREA: readonly Box[] = [INSIDE, { minX: BAY.minX + 0.3, maxX: HALL.minX, minZ: BAY.minZ + 0.2, maxZ: BAY.maxZ - 0.2 }, { minX: HALL.minX - 0.3, maxX: HALL.minX + 0.3, minZ: DOCK.z - DOCK.width / 2, maxZ: DOCK.z + DOCK.width / 2 }];
export const inForkArea = (x: number, z: number) => FORK_AREA.some((b) => inBox(b, x, z));

/** Whether a rectangle (half-widths `hw` across and `hl` along, turned by rotY) at (x, z) overlaps box `b`: separating axes. */
export function rectHits(p: { x: number; z: number; rotY: number }, hw: number, hl: number, b: Box): boolean {
  const ex = (b.maxX - b.minX) / 2;
  const ez = (b.maxZ - b.minZ) / 2;
  const dx = (b.minX + b.maxX) / 2 - p.x;
  const dz = (b.minZ + b.maxZ) / 2 - p.z;
  const sn = Math.sin(p.rotY);
  const cs = Math.cos(p.rotY);
  const s = Math.abs(sn);
  const c = Math.abs(cs);
  if (Math.abs(dx) >= c * hw + s * hl + ex) return false;
  if (Math.abs(dz) >= s * hw + c * hl + ez) return false;
  if (Math.abs(dx * cs - dz * sn) >= hw + ex * c + ez * s) return false;
  if (Math.abs(dx * sn + dz * cs) >= hl + ex * s + ez * c) return false;
  return true;
}

/** A point in a thing's own frame (x across, +x its left; z ahead), out in the world. */
export function localPoint(p: { x: number; z: number; rotY: number }, lx: number, lz: number): { x: number; z: number } {
  const s = Math.sin(p.rotY);
  const c = Math.cos(p.rotY);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Whether a rectangle like rectHits' lies wholly in the forklift's area (its corners and middle). */
export function rectInArea(p: { x: number; z: number; rotY: number }, hw: number, hl: number): boolean {
  for (const [lx, lz] of [
    [0, 0],
    [hw, hl],
    [-hw, hl],
    [hw, -hl],
    [-hw, -hl],
  ]) {
    const at = localPoint(p, lx, lz);
    if (!inForkArea(at.x, at.z)) return false;
  }
  return true;
}

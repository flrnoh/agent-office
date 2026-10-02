import { ROAD, STREET_Y } from './layout.js';
import { CREEK, FARM, LOOP_HALF, LOOP_PAVED, STREET_END, STREET_Z, nearLoop } from './scenic.js';
import { CASINO_BOX } from './casino.js';
import { GYM_STREET_BOX } from './gym.js';
import { HALL_BOX } from './hall.js';
import { SOCCER_BOX } from './soccer.js';
import { mulberry32 } from './rng.js';
import { landmarkAt } from './landmark-blocks.js'; // fork: the landmarks' blocks

// flrnoh fork (see FORK.md): the city round the office, one and the same from every floor, from the
// street and from the rooftop bar. It used to be two: the rooftop bar looked out over a city of its
// own (a grid of streets painted on one big texture, towers out to the haze), while down on the
// street and from the floors there were a handful of neighbours and grass. Now there's this one
// plan, and world/town/ draws it round the office, which lends it to the roof (world/city.ts).
//
// Streets run down x = 28 + 56k and z = 27 + 56k (the street in front of the office is the one at
// z = 27), with a block between each pair. Blocks are city where nothing else is: not the office's
// own, not the row across the street (the casino, the golf hole, the soccer and padel halls and the
// gym stand there), not the farm, the sea or the scenic loop (shared/scenic.ts), which runs round
// the south of the town and out into the country. South of the street the town goes two rows deep
// inside the loop; past that it's the country. The streets between the blocks are paved for cars
// (see paved in shared/garage.ts); the buildings on the blocks are laid out here too, so the office,
// the roof and the tests agree on where they stand.

/** A block and the street beside it. */
export const PERIOD = 56;
/** Where the streets run: x = CITY_X + PERIOD·a, z = CITY_Z + PERIOD·b. */
export const CITY_X = 28;
export const CITY_Z = STREET_Z;
/** The road, as wide as the street in front of the office, and a sidewalk either side of it. */
export const CITY_ROAD = ROAD.maxZ - ROAD.minZ;
export const CITY_WALK = 2;
/** A block inside its sidewalks. */
export const BLOCK_INNER = PERIOD - CITY_ROAD - CITY_WALK * 2;
/** How far out the city goes: past this the haze has it anyway. */
export const CITY_RADIUS = 330;
/** Where the sea is and the beach before it: no city west of here. */
const WEST_EDGE = -232;
/** How far south of the street the town goes (inside the loop): two rows of blocks. */
const SOUTH_EDGE = CITY_Z + PERIOD * 2 + CITY_ROAD / 2;
/** The row across the street, whose blocks the office's own neighbours stand on (a–b in x). */
const ACROSS = { j: 1, from: -1, to: 1 } as const;

/** The street at x = lineX(a) and at z = lineZ(b). */
export const lineX = (a: number) => CITY_X + PERIOD * a;
export const lineZ = (b: number) => CITY_Z + PERIOD * b;
/** Block (i, j) lies between the streets lineX(i - 1)..lineX(i) and lineZ(j - 1)..lineZ(j); its middle. */
export const blockAt = (i: number, j: number) => ({ x: CITY_X - PERIOD / 2 + i * PERIOD, z: CITY_Z - PERIOD / 2 + j * PERIOD });

/** `landmark`: a block that's a landmark's own (shared/landmarks.ts), with no buildings of the city's on it. */
export type BlockKind = 'office' | 'across' | 'city' | 'park' | 'landmark';

export interface Block {
  i: number;
  j: number;
  x: number;
  z: number;
  kind: BlockKind;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const overlap = (a: Rect, b: Rect, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
const around = (x: number, z: number, r: number): Rect => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });

/** What the farm stands on: its fields, the pasture, the barn, the silo and the windmill. */
const FARMLAND: Rect[] = [...FARM.fields, FARM.pasture, around(FARM.barn.x, FARM.barn.z, 10), around(FARM.silo.x, FARM.silo.z, 5), around(FARM.windmill.x, FARM.windmill.z, 8)];
/** The buildings across the street, which no road goes through (the golf hole's fairway is between them). */
const ACROSS_BUILDINGS: Rect[] = [CASINO_BOX, HALL_BOX, SOCCER_BOX, GYM_STREET_BOX, { minX: -12, maxX: 1, minZ: ROAD.maxZ, maxZ: 66 }];

/** Where the loop runs along the street itself, at either end of it: that's like any other street. */
const alongStreet = (at: { x: number; z: number; tz: number }) => Math.abs(at.x) < 143 && Math.abs(at.z - STREET_Z) < 1.5 && Math.abs(at.tz) < 0.1;

/** How far (x, z) is from the creek's middle. */
function fromCreek(x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k < CREEK.length - 1; k++) {
    const [ax, az] = CREEK[k];
    const [bx, bz] = CREEK[k + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

/** Whether all of `r` is clear of the country: the sea, the farm, the creek and the loop (bar where it's the street). */
function clearOfCountry(r: Rect, loopGap: number): boolean {
  if (r.minX < WEST_EDGE || r.maxZ > SOUTH_EDGE) return false;
  if (FARMLAND.some((f) => overlap(r, f, 4))) return false;
  for (let x = r.minX; x <= r.maxX + 1e-6; x += 4) {
    for (let z = r.minZ; z <= r.maxZ + 1e-6; z += 4) {
      if (fromCreek(x, z) < 14) return false;
      const at = nearLoop(x, z);
      if (at && at.off < loopGap && !alongStreet(at)) return false;
    }
  }
  return true;
}


/**
 * A building on a lot, laid out round a roof six floors up. How much of that height it stands
 * depends on how far out it is (`ring`: close by, further out, or on the skyline) and on how tall
 * the office's building is (see world/city.ts).
 */
export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  paint: number;
  /** Where its lit windows start in the pattern. */
  ou: number;
  ov: number;
  ring: 0 | 1 | 2;
  /** Tall ones step back on the way up: the top part's footprint, and how much taller it goes. */
  step?: { w: number; d: number; up: number };
  /** On its roof: a mast with a red light, a water tower, or a box of air conditioning. */
  top?: { kind: 'mast' } | { kind: 'tank'; x: number; z: number } | { kind: 'plant'; x: number; z: number; w: number; d: number };
}

/** A tree in a park: where, how big, and which green. */
export interface ParkTree {
  x: number;
  z: number;
  s: number;
  dark: boolean;
}

/** Paints 7 and 8 are the glass towers' (see world/city.ts). */
const GLASS_TOWERS = [7, 8];

/**
 * The blocks, the buildings on them and the parks' trees, laid out once. The numbers are drawn in
 * the same order as the rooftop bar's city always drew them, so the skyline is the one it's always
 * been; blocks that aren't city any more (the country, the row across the street) are just left out.
 */
function layOut() {
  const r = mulberry32(20260927);
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const trees: ParkTree[] = [];
  const n = Math.ceil(CITY_RADIUS / PERIOD) + 1;
  const inner = BLOCK_INNER;
  const tree = (): ParkTree => {
    const s = 0.8 + r() * 0.7;
    const dark = r() >= 0.5;
    return { x: 0, z: 0, s, dark };
  };
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const { x: bx, z: bz } = blockAt(i, j);
      const dist = Math.hypot(bx, bz);
      if (dist > CITY_RADIUS) continue;
      if (i === 0 && j === 0) {
        blocks.push({ i, j, x: bx, z: bz, kind: 'office' });
        continue;
      }
      const across = j === ACROSS.j && i >= ACROSS.from && i <= ACROSS.to;
      // South of the street the town is only inside the loop, west of the farm: east of it are the pines.
      const city = !across && (bz < CITY_Z || bx < PERIOD) && clearOfCountry(around(bx, bz, inner / 2), LOOP_PAVED + 2);
      // fork: a landmark's block (shared/landmarks.ts) draws the same numbers, so the rest of the city stays as it was, but keeps none of it.
      const landmark = city && !!landmarkAt(i, j);
      if (across) blocks.push({ i, j, x: bx, z: bz, kind: 'across' });
      // Now and then a park, with trees.
      if (r() < 0.1 && dist > 60) {
        const planted: ParkTree[] = [];
        for (let k = 0; k < 7; k++) {
          const t = tree();
          t.x = bx + (r() - 0.5) * (inner - 6);
          t.z = bz + (r() - 0.5) * (inner - 6);
          planted.push(t);
        }
        if (landmark) blocks.push({ i, j, x: bx, z: bz, kind: 'landmark' });
        else if (city) {
          blocks.push({ i, j, x: bx, z: bz, kind: 'park' });
          trees.push(...planted);
        }
        continue;
      }
      if (city) blocks.push({ i, j, x: bx, z: bz, kind: landmark ? 'landmark' : 'city' });
      // The block split into lots: one big one, two halves or four quarters.
      const split = r();
      const plots: [number, number, number, number][] = [];
      const gap = 2;
      if (split < 0.25) plots.push([bx, bz, inner, inner]);
      else if (split < 0.6) {
        const w = (inner - gap) / 2;
        const alongX = r() < 0.5;
        for (const s of [-1, 1]) plots.push(alongX ? [bx + (s * (w + gap)) / 2, bz, w, inner] : [bx, bz + (s * (w + gap)) / 2, inner, w]);
      } else {
        const w = (inner - gap) / 2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) plots.push([bx + (sx * (w + gap)) / 2, bz + (sz * (w + gap)) / 2, w, w]);
      }
      // Lower than the roof round about, so you see out over them; taller further out, and tallest
      // downtown, off to the north-east, where the skyline is. South of the street, in the town
      // inside the loop, they stay low: it's the edge of town there, and the country past it.
      const downtown = Math.max(0, 1 - Math.hypot(bx - 210, bz + 220) / 150);
      for (const [lx, lz, lw, ld] of plots) {
        const back = 1 + r() * 3;
        const w = lw - back * 2;
        const d = ld - back * 2;
        if (w < 6 || d < 6) continue;
        let h: number;
        if (dist < 100) h = 9 + r() * 24 + (r() < 0.1 ? 8 : 0);
        else if (dist < 190) h = r() < 0.1 ? 50 + r() * 40 : 12 + r() * 28;
        else h = r() < 0.2 ? 65 + r() * 95 : 20 + r() * 30;
        h *= 1 + downtown * 1.3;
        const glassy = h > 70 && r() < 0.6;
        const paint = glassy ? GLASS_TOWERS[Math.floor(r() * GLASS_TOWERS.length)] : Math.floor(r() * 7);
        const lot: Lot = { x: lx, z: lz, w, d, h, paint, ou: Math.floor(r() * 16), ov: Math.floor(r() * 16), ring: dist < 100 ? 0 : dist < 190 ? 1 : 2 };
        let tall = h;
        let tw = w;
        let td = d;
        // Tall ones step back once on the way up.
        if (h > 55 && r() < 0.6) {
          tw = w * (0.55 + r() * 0.25);
          td = d * (0.55 + r() * 0.25);
          lot.step = { w: tw, d: td, up: 12 + r() * h * 0.5 };
          tall += lot.step.up;
        }
        // On the roof: a water tower, a box of air conditioning, or a mast with a red light.
        const what = r();
        if (tall > 90) lot.top = { kind: 'mast' };
        else if (what < 0.3) lot.top = { kind: 'tank', x: lx + (r() - 0.5) * tw * 0.4, z: lz + (r() - 0.5) * td * 0.4 };
        else if (what < 0.65) {
          const pw = 3 + r() * 3;
          const pd = 2 + r() * 2;
          lot.top = { kind: 'plant', w: pw, d: pd, x: lx + (r() - 0.5) * tw * 0.4, z: lz + (r() - 0.5) * td * 0.4 };
        }
        if (!city || landmark || !clearOfCountry({ minX: lx - w / 2, maxX: lx + w / 2, minZ: lz - d / 2, maxZ: lz + d / 2 }, LOOP_PAVED + 6)) continue;
        if (bz > CITY_Z) {
          // The edge of town: four to eight storeys, no towers.
          const cap = 13 + (Math.abs(lx * 7 + lz * 3) % 13);
          if (tall > cap) {
            const k = cap / tall;
            lot.h *= k;
            if (lot.step) lot.step.up *= k;
            if (lot.top?.kind === 'mast') delete lot.top;
          }
        }
        lots.push(lot);
      }
    }
  }
  return { blocks, lots, trees };
}

const PLAN = layOut();

/** Every block round the office within CITY_RADIUS that isn't the country. */
export const BLOCKS: readonly Block[] = PLAN.blocks;
/** The buildings on the city's blocks. */
export const LOTS: readonly Lot[] = PLAN.lots;
/** The trees in the city's parks. */
export const PARK_TREES: readonly ParkTree[] = PLAN.trees;

const blockKey = (i: number, j: number) => `${i},${j}`;
const BLOCK_KINDS = new Map(BLOCKS.map((b) => [blockKey(b.i, b.j), b.kind]));
const townBlock = (i: number, j: number) => BLOCK_KINDS.has(blockKey(i, j));

// ---- The streets ----------------------------------------------------------------------------------

/**
 * A stretch of street from one crossing to the next: along x (from lineX(a) to lineX(a + 1), at
 * lineZ(b)) or along z (from lineZ(b) to lineZ(b + 1), at lineX(a)).
 */
export interface Stretch {
  alongX: boolean;
  a: number;
  b: number;
}

/** The asphalt a stretch covers, crossing to crossing. */
export function stretchRect(s: Stretch): Rect {
  const h = CITY_ROAD / 2;
  return s.alongX ? { minX: lineX(s.a), maxX: lineX(s.a + 1), minZ: lineZ(s.b) - h, maxZ: lineZ(s.b) + h } : { minX: lineX(s.a) - h, maxX: lineX(s.a) + h, minZ: lineZ(s.b), maxZ: lineZ(s.b + 1) };
}

/** The street in front of the office, which is the office's own (world/outside.ts) out to STREET_END, and the loop's past that. */
const isMainStreet = (s: Stretch) => s.alongX && s.b === 0;

/** Whether a stretch goes anywhere: along a block of the town, through nothing, and not out into the country. */
function laid(s: Stretch): boolean {
  if (isMainStreet(s)) return false;
  const sides = s.alongX ? [townBlock(s.a + 1, s.b), townBlock(s.a + 1, s.b + 1)] : [townBlock(s.a, s.b + 1), townBlock(s.a + 1, s.b + 1)];
  if (!sides.some(Boolean)) return false;
  const r = stretchRect(s);
  if (ACROSS_BUILDINGS.some((b) => overlap(r, b, 1))) return false;
  // Its ends may meet the loop only where the loop is the office's street: out in the country the loop
  // runs on unbroken, so its edges carry a car round it hands off (tests/scenic.test.ts).
  const ends = s.alongX ? [[r.minX, lineZ(s.b)], [r.maxX, lineZ(s.b)]] : [[lineX(s.a), r.minZ], [lineX(s.a), r.maxZ]];
  for (const [x, z] of ends) {
    const at = nearLoop(x, z);
    if (at && at.off < LOOP_HALF + CITY_ROAD && !(Math.abs(z - STREET_Z) < CITY_ROAD && Math.abs(x) <= STREET_END)) return false;
  }
  // Nor does the rest of it.
  const inset = s.alongX ? { ...r, minX: r.minX + 14, maxX: r.maxX - 14 } : { ...r, minZ: r.minZ + 14, maxZ: r.maxZ - 14 };
  return clearOfCountry(inset, LOOP_HALF + CITY_ROAD / 2 + 2);
}

const stretchKey = (s: Stretch) => `${s.alongX ? 'x' : 'z'}${s.a},${s.b}`;

function layStreets(): Stretch[] {
  const n = Math.ceil(CITY_RADIUS / PERIOD) + 1;
  const all: Stretch[] = [];
  for (let a = -n - 1; a <= n; a++) {
    for (let b = -n - 1; b <= n; b++) {
      for (const alongX of [true, false]) {
        const s = { alongX, a, b };
        if (laid(s)) all.push(s);
      }
    }
  }
  // A street that ends where no other does, well inside the town and off the loop and the office's
  // street, goes nowhere: it's left out (and then maybe the one it came off, and so on).
  const ends = (s: Stretch): [number, number][] => (s.alongX ? [[s.a, s.b], [s.a + 1, s.b]] : [[s.a, s.b], [s.a, s.b + 1]]);
  let streets = all;
  for (;;) {
    const degree = new Map<string, number>();
    for (const s of streets) for (const [a, b] of ends(s)) degree.set(`${a},${b}`, (degree.get(`${a},${b}`) ?? 0) + 1);
    const joined = (a: number, b: number) => {
      const x = lineX(a);
      const z = lineZ(b);
      if ((degree.get(`${a},${b}`) ?? 0) > 1) return true;
      if (b === 0 && Math.abs(x) <= STREET_END) return true;
      const at = nearLoop(x, z);
      if (at && at.off < CITY_ROAD) return true;
      return Math.hypot(x, z) > CITY_RADIUS - PERIOD;
    };
    const kept = streets.filter((s) => ends(s).every(([a, b]) => joined(a, b)));
    if (kept.length === streets.length) return kept;
    streets = kept;
  }
}

/** Every stretch of city street. */
export const STREETS: readonly Stretch[] = layStreets();
const STREET_KEYS = new Set(STREETS.map(stretchKey));
const hasStretch = (alongX: boolean, a: number, b: number) => STREET_KEYS.has(stretchKey({ alongX, a, b }));

/** A crossing: where streets meet, with the corners of its sidewalks paved over so a car can turn. */
export interface Crossing {
  a: number;
  b: number;
  x: number;
  z: number;
  /** Which ways streets go from it. The office's street counts, along x, where it's there. */
  east: boolean;
  west: boolean;
  north: boolean;
  south: boolean;
}

function layCrossings(): Crossing[] {
  const seen = new Map<string, Crossing>();
  const at = (a: number, b: number) => {
    const k = `${a},${b}`;
    let c = seen.get(k);
    if (!c) {
      const x = lineX(a);
      const z = lineZ(b);
      const main = b === 0 && Math.abs(x) < STREET_END;
      seen.set(k, (c = { a, b, x, z, east: main, west: main, north: false, south: false }));
    }
    return c;
  };
  for (const s of STREETS) {
    if (s.alongX) {
      at(s.a, s.b).east = true;
      at(s.a + 1, s.b).west = true;
    } else {
      at(s.a, s.b).south = true;
      at(s.a, s.b + 1).north = true;
    }
  }
  return [...seen.values()];
}

/** Every crossing of the city's streets (and where one meets the office's street). */
export const CROSSINGS: readonly Crossing[] = layCrossings();
const CROSSING_AT = new Map(CROSSINGS.map((c) => [`${c.a},${c.b}`, c]));

/** How far either side of a crossing's middle its sidewalks' corners go, which are paved over where a car turns. */
export const CROSSING_HALF = CITY_ROAD / 2 + CITY_WALK;

/**
 * Which corners of a crossing are paved over, so a car can turn there: those between two streets
 * that go from it (north-east, north-west, south-east, south-west).
 */
export function pavedCorners(c: Crossing): { ne: boolean; nw: boolean; se: boolean; sw: boolean } {
  return { ne: c.north && c.east, nw: c.north && c.west, se: c.south && c.east, sw: c.south && c.west };
}

/** Whether (x, z) is on a city street, or on a paved corner of one of its crossings. */
export function onCityStreet(x: number, z: number): boolean {
  const a = Math.round((x - CITY_X) / PERIOD);
  const b = Math.round((z - CITY_Z) / PERIOD);
  const dx = x - lineX(a);
  const dz = z - lineZ(b);
  const h = CITY_ROAD / 2;
  if (Math.abs(dx) <= h && hasStretch(false, a, Math.floor((z - CITY_Z) / PERIOD))) return true;
  if (Math.abs(dz) <= h && hasStretch(true, Math.floor((x - CITY_X) / PERIOD), b)) return true;
  if (Math.abs(dx) > CROSSING_HALF || Math.abs(dz) > CROSSING_HALF) return false;
  const c = CROSSING_AT.get(`${a},${b}`);
  if (!c) return false;
  if (Math.abs(dx) <= h && Math.abs(dz) <= h) return true;
  if (Math.abs(dx) <= h || Math.abs(dz) <= h) return false;
  const k = pavedCorners(c);
  return dz < 0 ? (dx > 0 ? k.ne : k.nw) : dx > 0 ? k.se : k.sw;
}

/** Whether (x, z) is somewhere in the town: on a city block or street, not out in the country. */
export function inTown(x: number, z: number, pad = 0): boolean {
  const i = Math.round((x - CITY_X + PERIOD / 2) / PERIOD);
  const j = Math.round((z - CITY_Z + PERIOD / 2) / PERIOD);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (!townBlock(i + di, j + dj)) continue;
      const c = blockAt(i + di, j + dj);
      if (Math.abs(x - c.x) <= PERIOD / 2 + pad && Math.abs(z - c.z) <= PERIOD / 2 + pad) return true;
    }
  }
  return false;
}

// ---- Traffic --------------------------------------------------------------------------------------

/** A straight run of city street, as far as it goes without a gap: traffic drives up and down it. */
export interface Run {
  alongX: boolean;
  /** The street's line across (z for a run along x, x for one along z). */
  line: number;
  from: number;
  to: number;
}

function layRuns(): Run[] {
  const runs: Run[] = [];
  const byLine = new Map<string, Stretch[]>();
  for (const s of STREETS) {
    const k = s.alongX ? `x${s.b}` : `z${s.a}`;
    let list = byLine.get(k);
    if (!list) byLine.set(k, (list = []));
    list.push(s);
  }
  for (const list of byLine.values()) {
    list.sort((p, q) => (p.alongX ? p.a - q.a : p.b - q.b));
    let start = 0;
    for (let k = 1; k <= list.length; k++) {
      const prev = list[k - 1];
      const next = list[k];
      const gap = !next || (prev.alongX ? next.a !== prev.a + 1 : next.b !== prev.b + 1);
      if (!gap) continue;
      const first = list[start];
      const alongX = first.alongX;
      const from = alongX ? lineX(first.a) : lineZ(first.b);
      const to = alongX ? lineX(prev.a + 1) : lineZ(prev.b + 1);
      if (to - from >= PERIOD * 2) runs.push({ alongX, line: alongX ? lineZ(first.b) : lineX(first.a), from, to });
      start = k;
    }
  }
  return runs;
}

/** The runs of street the city's own cars drive (see world/city.ts): two blocks long at least. */
export const RUNS: readonly Run[] = layRuns();

/** Down on the street: y of the city's ground in the office's frame on the bottom floor. */
export const CITY_GROUND = STREET_Y;

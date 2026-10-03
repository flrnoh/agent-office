import type { SeatDef } from './layout.js';
import { POOL_DEFAULTS, type PoolDef } from './swim.js';
import { GYM_ROOM } from './gym.js';

/*
 * The gym's basement (flrnoh fork, see FORK.md "The gym's basement"): a floor under the wellness spa,
 * down a stair where the spa's loungers stood. Pure data and maths, shared by the server (who is in
 * which pool or room, by where they stand: x, z and how far down) and the page (which builds it all:
 * world/gym/basement/), so the tests can walk it.
 *
 * The plan (interior coordinates, like the gym's; the floor is BASEMENT_FLOOR under the gym's):
 *   - the stair comes down along the spa's west wall into the foyer (towels, water, the way on)
 *   - west of the foyer the quiet room (Ruheraum): loungers and water beds under a starry ceiling
 *   - east of it the salt grotto (walk-in, a graduation wall trickling brine) and the Kneipp room
 *     (a cold tread basin, three adventure showers)
 *   - south, past where the gym's walls stand upstairs, a tall pool hall: a 25 m lap pool with four
 *     lanes, starting blocks, loungers round it, a whirlpool grotto with a waterfall at its east end,
 *     and in its south wall the passage to the thermal baths (closed for now: built another day)
 * Everything down here is quiet: the gym's radio stays upstairs (client/gym-radio.ts).
 */

/** A rectangle on the floor. */
export interface BRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something solid down here: its top, and its underside (the floor, unless it hangs). */
export interface BFixture extends BRect {
  id: string;
  top: number;
  bottom?: number;
}

/** The basement's floor, under the gym's (whose floor is y 0). */
export const BASEMENT_FLOOR = -4.2;
const B = BASEMENT_FLOOR;
/** How far down nothing at all is, in the gym (the street a place stands on: core/travel.ts): below the pools' floors. */
export const GYM_UNDER = -9;
/** Feet further down than this are in the basement, not up in the gym. */
export const BASEMENT_SPLIT = -1.5;
/** How thick the gym's floor is, as the basement's ceiling: its underside is at -SLAB. */
export const SLAB = 0.3;
/** How thick the basement's walls are. */
export const BWALL = 0.3;
/** The pool hall's ceiling: tall, out past the gym's south wall where there's no floor above. */
export const HALL_CEILING = 2.6;

/** Whether feet at `y` are down in the basement. */
export const downstairs = (y: number | undefined) => typeof y === 'number' && y < BASEMENT_SPLIT;
export const inB = (r: BRect, x: number, z: number, margin = 0) => x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin;

// ---- The stair --------------------------------------------------------------------------------

/**
 * The stair down: along the spa's west wall, from the top step at `topZ` (by the spa's door) south to
 * the foyer's floor, each step `rise` down and `run` long. `steps` drops in all, so the last lands on
 * the basement's floor. The hole in the gym's floor round it is STAIRWELL; a rail keeps you from
 * falling in from the side.
 */
export const STAIR = { minX: 24.85, maxX: 26.25, topZ: 43.3, rise: 0.3, run: 0.3, steps: 14 } as const;
/** Where the stair's last step meets the basement's floor. */
export const STAIR_FOOT_Z = STAIR.topZ + (STAIR.steps - 1) * STAIR.run;
/** The hole in the gym's floor over the stair (its west edge is the spa's wall). */
export const STAIRWELL: BRect = { minX: 24.75, maxX: 26.55, minZ: STAIR.topZ - 0.1, maxZ: STAIR_FOOT_Z + 0.1 };
/** The rail round the hole up in the spa: open at its north end, where you step down. */
export const STAIR_RAIL = { thick: 0.08, height: 1.05 } as const;

/** The steps, top first: each solid down to the basement's floor. */
export function stairSteps(): BFixture[] {
  const s = STAIR;
  return Array.from({ length: s.steps - 1 }, (_, i) => ({ id: `stair-${i}`, minX: s.minX, maxX: s.maxX, minZ: s.topZ + i * s.run, maxZ: s.topZ + (i + 1) * s.run, bottom: B, top: -(i + 1) * s.rise }));
}

/** The rail round the stairwell up in the spa (on the gym's floor). */
export function stairRails(): BFixture[] {
  const w = STAIRWELL;
  const t = STAIR_RAIL.thick;
  return [
    { id: 'stair-rail-e', minX: w.maxX - t, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ, top: STAIR_RAIL.height },
    { id: 'stair-rail-s', minX: w.minX, maxX: w.maxX, minZ: w.maxZ - t, maxZ: w.maxZ, top: STAIR_RAIL.height },
  ];
}

// ---- The rooms ----------------------------------------------------------------------------------

/** The band under the gym (walls included): the quiet room, the foyer, the salt grotto, the Kneipp room. Its ceiling is the gym's floor. */
export const NORTH_BAND: BRect = { minX: 8.0, maxX: 36.3, minZ: 40.0, maxZ: 56.0 };
/** The foyer at the stair's foot, open to the pool hall at its south end. */
export const FOYER: BRect = { minX: 22.0, maxX: 29.0, minZ: 40.3, maxZ: 56.3 };
/** The quiet room, west of the foyer (between its walls). */
export const REST: BRect = { minX: 8.3, maxX: 21.7, minZ: 40.3, maxZ: 55.7 };
export const REST_DOOR = { x: 21.85, z: 51.0, width: 1.6 } as const;
/** The salt grotto, east of the foyer. */
export const SALT: BRect = { minX: 29.3, maxX: 36.0, minZ: 40.3, maxZ: 47.45 };
export const SALT_DOOR = { x: 29.15, z: 44.1, width: 1.2 } as const;
/** The graduation wall along the salt grotto's east wall: brine trickles down blackthorn. */
export const GRADIER = { minX: 35.2, maxX: SALT.maxX, minZ: 40.9, maxZ: 46.9, top: 2.6 } as const;
/** The Kneipp room, south of the salt grotto. */
export const KNEIPP_ROOM: BRect = { minX: 29.3, maxX: 36.0, minZ: 47.75, maxZ: 55.7 };
export const KNEIPP_DOOR = { x: 29.15, z: 52.6, width: 1.6 } as const;
/** The Kneipp basin: a long, shallow trough of cold water you tread through, one step down. */
export const KNEIPP: BRect & { floor: number; water: number } = { minX: 30.2, maxX: 35.6, minZ: 48.35, maxZ: 50.05, floor: B - 0.25, water: B - 0.06 };
/** The adventure showers along the Kneipp room's east wall: stand under one and it runs. */
export const SHOWER_KINDS = ['tropic', 'storm', 'ice'] as const;
export type ShowerKind = (typeof SHOWER_KINDS)[number];
export const BSHOWERS: readonly { kind: ShowerKind; name: string; x: number; z: number }[] = [
  { kind: 'tropic', name: 'Tropical rain', x: 35.1, z: 51.65 },
  { kind: 'storm', name: 'Thunderstorm', x: 35.1, z: 53.15 },
  { kind: 'ice', name: 'Ice mist', x: 35.1, z: 54.65 },
];
/** How near a shower's head you stand to be under it. */
export const SHOWER_REACH = 0.62;
/** The shower under which (x, z) is, if any. */
export const bShowerAt = (x: number, z: number) => BSHOWERS.find((s) => Math.hypot(x - s.x, z - s.z) < SHOWER_REACH);

/** The pool hall (between its walls), out south past the gym's footprint: its ceiling is HALL_CEILING. */
export const HALL: BRect = { minX: 4.3, maxX: 39.7, minZ: 56.3, maxZ: 81.7 };
/** The whole basement's outline, for the camera (walls included). */
export const BASEMENT_BOX: BRect = { minX: 4.0, maxX: 40.0, minZ: 40.0, maxZ: 82.0 };

// ---- The lap pool -------------------------------------------------------------------------------

/** The lap pool's water: 25 m long (west to east), four lanes of 2.5 m; its surface `surface`, its floor `floor`. */
export const LAP_POOL = { minX: 7.0, maxX: 32.0, minZ: 64.0, maxZ: 74.0, surface: B - 0.1, floor: B - 2.0, lanes: 4 } as const;
/** How far below the surface a swimmer's feet are (the roof pool's POOL_SINK). */
export const SWIM_SINK = 1.25;
/** A lane's middle along z (lane 0 the northernmost). */
export const laneZ = (lane: number) => LAP_POOL.minZ + ((LAP_POOL.maxZ - LAP_POOL.minZ) / LAP_POOL.lanes) * (lane + 0.5);
/** The lane a swimmer at z is in. */
export const laneAt = (z: number) => Math.max(0, Math.min(LAP_POOL.lanes - 1, Math.floor(((z - LAP_POOL.minZ) / (LAP_POOL.maxZ - LAP_POOL.minZ)) * LAP_POOL.lanes)));
/** The starting blocks at the west end, one per lane: a step behind, the block's top. */
export const BLOCKS = { minX: 6.15, maxX: 6.95, step: B + 0.3, top: B + 0.6, half: 0.32 } as const;
/** How near a wall a swimmer touches it (a length counts from wall to wall). */
export const TOUCH = 0.7;

/** The lap pool as a pool to swim in (shared/swim.ts, client/swim/): lengths along x, timed, lane by lane. */
export const LAP_SWIM: PoolDef = {
  ...POOL_DEFAULTS,
  id: 'gym-lap',
  rects: [LAP_POOL],
  surface: LAP_POOL.surface,
  floor: LAP_POOL.floor,
  sink: SWIM_SINK,
  deck: B,
  climbOut: (x, z) => lapClimbOut(x, z),
  lengths: { axis: 'x', meters: 25, touch: TOUCH, key: 'agent-office.gym.best25', where: (_x, z) => `lane ${laneAt(z) + 1}` },
};

export const overLapPool = (x: number, z: number, slack = 0) => inB(LAP_POOL, x, z, slack);
/** Whether someone with feet at `y` at (x, z) is swimming in the lap pool. */
export const inLapPoolAt = (x: number, y: number, z: number) => overLapPool(x, z) && y < LAP_POOL.surface - 0.3 && y > LAP_POOL.floor - 0.2;
/** Whether a swimmer at (x, z) is near enough a wall to climb out. */
export const atLapEdge = (x: number, z: number) => overLapPool(x, z) && !overLapPool(x, z, 0.75);
/** Where on the deck someone climbing out at (x, z) comes up: straight out over the nearest wall, never onto a block. */
export function lapClimbOut(x: number, z: number): { x: number; z: number } {
  const p = LAP_POOL;
  const ways = [
    { d: x - p.minX + 0.3, at: { x: BLOCKS.minX - 0.45, z } }, // over the blocks' end: past them, a little further
    { d: p.maxX - x, at: { x: p.maxX + 0.45, z } },
    { d: z - p.minZ, at: { x, z: p.minZ - 0.45 } },
    { d: p.maxZ - z, at: { x, z: p.maxZ + 0.45 } },
  ];
  const w = [...ways].sort((a, b) => a.d - b.d)[0].at;
  // Not onto a block: beside it instead.
  if (w.x < p.minX) {
    const lane = laneAt(w.z);
    const near = Math.abs(w.z - laneZ(lane)) < BLOCKS.half + 0.35;
    if (near) w.z = laneZ(lane) + (w.z < laneZ(lane) ? -1 : 1) * (BLOCKS.half + 0.4);
    w.x = p.minX - 0.4;
  }
  return w;
}

// ---- The whirlpool grotto -----------------------------------------------------------------------

/** The grotto: rock walls round a whirlpool at the hall's east end, open on its west side toward the pool. */
export const GROTTO: BRect = { minX: 34.5, maxX: HALL.maxX, minZ: 63.0, maxZ: 75.0 };
/** The way in, a gap in its west wall. */
export const GROTTO_GAP = { minZ: 66.4, maxZ: 71.6 } as const;
/** The whirlpool: a basin you walk down into on its west steps, waist deep; its surface `water`. */
export const GROTTO_POOL = { minX: 35.6, maxX: 39.2, minZ: 67.0, maxZ: 71.0, floor: B - 0.9, water: B - 0.12 } as const;
/** The steps into it along its west side, each 0.3 down. */
export const GROTTO_STEPS = [
  { minX: 35.6, maxX: 35.9, top: B - 0.3 },
  { minX: 35.9, maxX: 36.2, top: B - 0.6 },
] as const;
/** The bench under the water along its east side, and where the waterfall comes down (the east wall, behind it). */
export const GROTTO_BENCH = { minX: 38.65, maxX: GROTTO_POOL.maxX, top: GROTTO_POOL.floor + 0.45 } as const;
export const WATERFALL = { x: HALL.maxX - 0.05, z: 69.0, width: 1.6, top: B + 2.3 } as const;
/** The underside of the rock roof over the grotto: a cave. */
export const GROTTO_ROOF = B + 2.4;

// ---- The way to the thermal baths ---------------------------------------------------------------

/**
 * The passage to the thermal baths, through the pool hall's south wall: a short tunnel to a closed
 * glass door, for now. Another session builds the baths behind it: they go on from `door` (z), the
 * tunnel's walls x minX..maxX, its floor the basement's.
 */
export const THERME_PASSAGE = { minX: 18.0, maxX: 22.0, minZ: HALL.maxZ, maxZ: 88.0, door: 87.4, height: 2.8 } as const;

// ---- Who's where (the walk-in rooms down here) ----------------------------------------------------

/** A room or pool down here you're in while you stand (or swim) inside it: its wellness station pays out meanwhile. */
export interface BasementRoom {
  station: string;
  machine: 'salt' | 'rest' | 'grotto' | 'kneipp' | 'lappool';
  name: string;
  inner: BRect;
  /** Its seats (SEATING ids with `gym`): sitting on one in here works a little better. */
  seats: readonly string[];
  /** Where E pours (the salt grotto's brine pump): an Aufguss of salt mist. */
  pour?: { x: number; z: number };
}

const RL = { length: 1.9, width: 0.7 } as const;
/** The quiet room's loungers (facing the aquarium on its west wall), and its water beds (two places each) along the south. */
export const REST_LOUNGERS: readonly { x: number; z: number }[] = [11.5, 14.8, 18.1].flatMap((x) => [42.6, 45.2, 47.8, 50.4].map((z) => ({ x, z })));
export const REST_BEDS: readonly { x: number; z: number }[] = [11.5, 14.8, 18.1].map((x) => ({ x, z: 53.8 }));
/** The salt grotto's loungers, facing the graduation wall. */
export const SALT_LOUNGERS: readonly { x: number; z: number }[] = [41.3, 42.6, 45.6, 46.7].map((z) => ({ x: 32.1, z }));
/** Loungers on the pool hall's north deck, facing the water. */
export const POOL_LOUNGERS: readonly { x: number; z: number }[] = [9.0, 11.0, 13.0, 15.0, 30.0, 32.0].map((x) => ({ x, z: 59.4 }));

export const BASEMENT_SEATING: SeatDef[] = [
  ...REST_LOUNGERS.map((l, i) => ({ id: `gym-rest-${i + 1}`, label: '🌙 Lounger', x: l.x, y: B, z: l.z, rotY: -Math.PI / 2, places: [0], hips: 0.42, depth: -0.15, out: 1.5, gym: true })),
  ...REST_BEDS.map((l, i) => ({ id: `gym-waterbed-${i + 1}`, label: '🌊 Water bed', x: l.x, y: B, z: l.z, rotY: -Math.PI / 2, places: [-0.4, 0.4], hips: 0.4, depth: -0.15, out: 1.5, gym: true })),
  ...SALT_LOUNGERS.map((l, i) => ({ id: `gym-salt-${i + 1}`, label: '🧂 Lounger', x: l.x, y: B, z: l.z, rotY: Math.PI / 2, places: [0], hips: 0.42, depth: -0.15, out: 1.5, gym: true })),
  ...POOL_LOUNGERS.map((l, i) => ({ id: `gym-poolside-${i + 1}`, label: '🏖️ Lounger', x: l.x, y: B, z: l.z, rotY: 0, places: [0], hips: 0.42, depth: -0.15, out: 1.5, gym: true })),
  { id: 'gym-grotto-bench', label: '🌊 Whirlpool bench', x: GROTTO_POOL.maxX - 0.3, y: GROTTO_POOL.floor, z: 69.0, rotY: -Math.PI / 2, places: [-1.2, 0, 1.2], hips: 0.47, depth: 0, out: 0.9, gym: true },
  { id: 'gym-foyer-bench', label: '🪑 Bench', x: 22.35, y: B, z: 44.5, rotY: Math.PI / 2, places: [-0.6, 0.6], hips: 0.46, depth: 0, out: 0.75, gym: true },
];

export const SALT_ROOM: BasementRoom = { station: 'salt', machine: 'salt', name: 'Salt grotto', inner: SALT, seats: SALT_LOUNGERS.map((_, i) => `gym-salt-${i + 1}`), pour: { x: 34.6, z: 44.1 } };
export const REST_ROOM: BasementRoom = { station: 'rest', machine: 'rest', name: 'Quiet room', inner: REST, seats: [...REST_LOUNGERS.map((_, i) => `gym-rest-${i + 1}`), ...REST_BEDS.map((_, i) => `gym-waterbed-${i + 1}`)] };
export const GROTTO_ROOM: BasementRoom = { station: 'grotto', machine: 'grotto', name: 'Whirlpool grotto', inner: GROTTO_POOL, seats: ['gym-grotto-bench'] };
export const KNEIPP_WALK: BasementRoom = { station: 'kneipp', machine: 'kneipp', name: 'Kneipp walk', inner: KNEIPP, seats: [] };
export const LAP_LANES: BasementRoom = { station: 'lappool', machine: 'lappool', name: 'Lap pool', inner: LAP_POOL, seats: [] };
export const BASEMENT_ROOMS: readonly BasementRoom[] = [SALT_ROOM, REST_ROOM, GROTTO_ROOM, KNEIPP_WALK, LAP_LANES];

/** The room down here (x, z) is in, `margin` in from its edges (negative: that far out past them). */
export function basementRoomAt(x: number, z: number, margin = 0): BasementRoom | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return BASEMENT_ROOMS.find((r) => inB(r.inner, x, z, margin));
}

// ---- What's solid -------------------------------------------------------------------------------

/** `r` without the `holes` in it, as rectangles (row by row). */
export function cutOut(r: BRect, holes: readonly BRect[]): BRect[] {
  const hs = holes.map((h) => ({ minX: Math.max(r.minX, h.minX), maxX: Math.min(r.maxX, h.maxX), minZ: Math.max(r.minZ, h.minZ), maxZ: Math.min(r.maxZ, h.maxZ) })).filter((h) => h.minX < h.maxX && h.minZ < h.maxZ);
  const zs = [...new Set([r.minZ, r.maxZ, ...hs.flatMap((h) => [h.minZ, h.maxZ])])].sort((a, b) => a - b);
  const xs = [...new Set([r.minX, r.maxX, ...hs.flatMap((h) => [h.minX, h.maxX])])].sort((a, b) => a - b);
  const out: BRect[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const z0 = zs[j];
    const z1 = zs[j + 1];
    let run: BRect | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (z0 + z1) / 2;
      const holed = hs.some((h) => cx > h.minX && cx < h.maxX && cz > h.minZ && cz < h.maxZ);
      if (holed) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.maxX = xs[i + 1];
      else run = { minX: xs[i], maxX: xs[i + 1], minZ: z0, maxZ: z1 };
    }
    if (run) out.push(run);
  }
  return out;
}

/** The gym's floor (the basement's ceiling), with the stairwell open: what you stand on up there. */
export function gymFloorSlabs(): BFixture[] {
  const r: BRect = { minX: Math.min(NORTH_BAND.minX, GYM_ROOM.minX - 0.3), maxX: NORTH_BAND.maxX, minZ: GYM_ROOM.minZ - 0.3, maxZ: NORTH_BAND.maxZ };
  return cutOut(r, [STAIRWELL]).map((s, i) => ({ id: `gym-floor-${i}`, ...s, bottom: -SLAB, top: 0 }));
}

/** Walls along a line with gaps (doors) in it: x0..x1 at z (`axis` 'x'), or z0..z1 at x. */
function wallLine(id: string, axis: 'x' | 'z', from: number, to: number, at: number, gaps: readonly [number, number][], bottom: number, top: number): BFixture[] {
  const out: BFixture[] = [];
  let a = from;
  const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
  for (const [g0, g1] of [...cuts, [to, to] as [number, number]]) {
    if (g0 > a + 0.01) {
      const [lo, hi] = [a, Math.min(g0, to)];
      out.push(axis === 'x' ? { id: `${id}-${out.length}`, minX: lo, maxX: hi, minZ: at, maxZ: at + BWALL, bottom, top } : { id: `${id}-${out.length}`, minX: at, maxX: at + BWALL, minZ: lo, maxZ: hi, bottom, top });
    }
    a = Math.max(a, g1);
  }
  return out;
}

/** Everything solid in the basement: its floors (round the pools), walls, the stair, fixtures and furniture, its ceilings. */
export function basementFixtures(): BFixture[] {
  const f: BFixture[] = [];
  const low = -SLAB;
  const deep = LAP_POOL.floor - 0.5;
  // Floors: the band and the hall, round the lap pool, the whirlpool and the Kneipp trough; the hall's deck goes down past a swimmer's feet, so it keeps them in.
  for (const [i, r] of cutOut(NORTH_BAND, [KNEIPP]).entries()) f.push({ id: `bfloor-n${i}`, ...r, bottom: B - 0.3, top: B });
  for (const [i, r] of cutOut({ minX: BASEMENT_BOX.minX, maxX: BASEMENT_BOX.maxX, minZ: NORTH_BAND.maxZ, maxZ: BASEMENT_BOX.maxZ }, [LAP_POOL, GROTTO_POOL]).entries()) f.push({ id: `bfloor-h${i}`, ...r, bottom: deep, top: B });
  f.push({ id: 'bfloor-therme', minX: THERME_PASSAGE.minX, maxX: THERME_PASSAGE.maxX, minZ: BASEMENT_BOX.maxZ, maxZ: THERME_PASSAGE.maxZ, bottom: B - 0.3, top: B });
  f.push({ id: 'kneipp-floor', ...rect(KNEIPP), bottom: B - 0.6, top: KNEIPP.floor });
  f.push({ id: 'lap-floor', ...rect(LAP_POOL), bottom: LAP_POOL.floor - 0.3, top: LAP_POOL.floor });
  const G = GROTTO_POOL;
  f.push({ id: 'grotto-floor', minX: GROTTO_STEPS[1].maxX, maxX: G.maxX, minZ: G.minZ, maxZ: G.maxZ, bottom: G.floor - 0.3, top: G.floor });
  for (const [i, s] of GROTTO_STEPS.entries()) f.push({ id: `grotto-step-${i}`, minX: s.minX, maxX: s.maxX, minZ: G.minZ, maxZ: G.maxZ, bottom: G.floor - 0.3, top: s.top });
  f.push({ id: 'grotto-bench', minX: GROTTO_BENCH.minX, maxX: GROTTO_BENCH.maxX, minZ: G.minZ + 0.3, maxZ: G.maxZ - 0.3, bottom: G.floor, top: GROTTO_BENCH.top });
  // The stair, and the stairwell's walls either side of it: up to the spa's wall on the west, a parapet as high as the rail on the east (no ledge to step onto).
  f.push(...stairSteps());
  f.push({ id: 'well-w', minX: STAIRWELL.minX - 0.15, maxX: STAIR.minX, minZ: STAIRWELL.minZ, maxZ: STAIRWELL.maxZ, bottom: B, top: 2.9 });
  f.push({ id: 'well-e', minX: STAIR.maxX, maxX: STAIRWELL.maxX, minZ: STAIRWELL.minZ, maxZ: STAIRWELL.maxZ, bottom: B, top: STAIR_RAIL.height });
  // The band's walls: outside, and between its rooms (with their doors); its ceiling is the gym's floor (gymFloorSlabs).
  const N = NORTH_BAND;
  f.push(...wallLine('bw-n', 'x', N.minX, N.maxX, N.minZ, [], B, low));
  f.push(...wallLine('bw-w', 'z', N.minZ, N.maxZ, N.minX, [], B, low));
  f.push(...wallLine('bw-e', 'z', N.minZ, N.maxZ, N.maxX - BWALL, [], B, low));
  f.push(...wallLine('bw-rest', 'z', N.minZ, REST.maxZ, REST.maxX, [[REST_DOOR.z - REST_DOOR.width / 2, REST_DOOR.z + REST_DOOR.width / 2]], B, low));
  f.push(...wallLine('bw-rest-s', 'x', N.minX, FOYER.minX, REST.maxZ, [], B, low));
  f.push(...wallLine('bw-east', 'z', N.minZ, KNEIPP_ROOM.maxZ, FOYER.maxX, [[SALT_DOOR.z - SALT_DOOR.width / 2, SALT_DOOR.z + SALT_DOOR.width / 2], [KNEIPP_DOOR.z - KNEIPP_DOOR.width / 2, KNEIPP_DOOR.z + KNEIPP_DOOR.width / 2]], B, low));
  f.push(...wallLine('bw-salt-s', 'x', SALT.minX, SALT.maxX, SALT.maxZ, [], B, low));
  f.push(...wallLine('bw-kneipp-s', 'x', FOYER.maxX, N.maxX, KNEIPP_ROOM.maxZ, [], B, low));
  // The hall's walls (the north one open to the foyer, the south one to the passage), and its ceiling.
  const H = HALL;
  const top = HALL_CEILING;
  f.push(...wallLine('hw-n', 'x', BASEMENT_BOX.minX, BASEMENT_BOX.maxX, NORTH_BAND.maxZ, [[FOYER.minX, FOYER.maxX]], B, top));
  f.push(...wallLine('hw-s', 'x', BASEMENT_BOX.minX, BASEMENT_BOX.maxX, H.maxZ, [[THERME_PASSAGE.minX, THERME_PASSAGE.maxX]], B, top));
  f.push({ id: 'hw-s-lintel', minX: THERME_PASSAGE.minX, maxX: THERME_PASSAGE.maxX, minZ: H.maxZ, maxZ: H.maxZ + BWALL, bottom: B + THERME_PASSAGE.height, top });
  f.push(...wallLine('hw-w', 'z', NORTH_BAND.maxZ, BASEMENT_BOX.maxZ, BASEMENT_BOX.minX, [], B, top));
  f.push(...wallLine('hw-e', 'z', NORTH_BAND.maxZ, BASEMENT_BOX.maxZ, H.maxX, [], B, top));
  f.push({ id: 'hall-ceiling', minX: BASEMENT_BOX.minX, maxX: BASEMENT_BOX.maxX, minZ: NORTH_BAND.maxZ, maxZ: BASEMENT_BOX.maxZ, bottom: top, top: top + 0.3 });
  // The passage to the baths: its walls, its ceiling and the closed door.
  const T = THERME_PASSAGE;
  f.push({ id: 'therme-w', minX: T.minX - BWALL, maxX: T.minX, minZ: H.maxZ, maxZ: T.maxZ, bottom: B, top: B + T.height });
  f.push({ id: 'therme-e', minX: T.maxX, maxX: T.maxX + BWALL, minZ: H.maxZ, maxZ: T.maxZ, bottom: B, top: B + T.height });
  f.push({ id: 'therme-door', minX: T.minX, maxX: T.maxX, minZ: T.door, maxZ: T.maxZ, bottom: B, top: B + T.height });
  f.push({ id: 'therme-ceiling', minX: T.minX - BWALL, maxX: T.maxX + BWALL, minZ: H.maxZ, maxZ: T.maxZ, bottom: B + T.height, top: B + T.height + 0.3 });
  // The grotto's rock walls, open to the west where the steps go down.
  const R = GROTTO;
  f.push({ id: 'grotto-n', minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.minZ + 0.6, bottom: B, top: B + 2.4 });
  f.push({ id: 'grotto-s', minX: R.minX, maxX: R.maxX, minZ: R.maxZ - 0.6, maxZ: R.maxZ, bottom: B, top: B + 2.4 });
  f.push({ id: 'grotto-w1', minX: R.minX, maxX: R.minX + 0.6, minZ: R.minZ, maxZ: GROTTO_GAP.minZ, bottom: B, top: B + 2.4 });
  f.push({ id: 'grotto-w2', minX: R.minX, maxX: R.minX + 0.6, minZ: GROTTO_GAP.maxZ, maxZ: R.maxZ, bottom: B, top: B + 2.4 });
  f.push({ id: 'grotto-roof', minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ, bottom: GROTTO_ROOF, top: GROTTO_ROOF + 0.5 });
  f.push({ id: 'grotto-rim-n', minX: G.minX, maxX: G.maxX, minZ: G.minZ - 0.25, maxZ: G.minZ, bottom: B - 1.2, top: B + 0.35 });
  f.push({ id: 'grotto-rim-s', minX: G.minX, maxX: G.maxX, minZ: G.maxZ, maxZ: G.maxZ + 0.25, bottom: B - 1.2, top: B + 0.35 });
  // The starting blocks: a step up behind each, the block in front.
  for (let lane = 0; lane < LAP_POOL.lanes; lane++) {
    const z = laneZ(lane);
    f.push({ id: `block-step-${lane}`, minX: BLOCKS.minX - 0.35, maxX: BLOCKS.minX, minZ: z - BLOCKS.half, maxZ: z + BLOCKS.half, top: BLOCKS.step, bottom: B });
    f.push({ id: `block-${lane}`, minX: BLOCKS.minX, maxX: BLOCKS.maxX, minZ: z - BLOCKS.half, maxZ: z + BLOCKS.half, top: BLOCKS.top, bottom: B });
  }
  // Loungers and water beds.
  const lounger = (id: string, x: number, z: number, alongX: boolean, width: number = RL.width) =>
    f.push(alongX ? { id, minX: x - RL.length / 2, maxX: x + RL.length / 2, minZ: z - width / 2, maxZ: z + width / 2, top: B + 0.42, bottom: B } : { id, minX: x - width / 2, maxX: x + width / 2, minZ: z - RL.length / 2, maxZ: z + RL.length / 2, top: B + 0.42, bottom: B });
  REST_LOUNGERS.forEach((l, i) => lounger(`rest-lounger-${i}`, l.x, l.z, true));
  REST_BEDS.forEach((l, i) => lounger(`waterbed-${i}`, l.x, l.z, true, 1.7));
  SALT_LOUNGERS.forEach((l, i) => lounger(`salt-lounger-${i}`, l.x, l.z, true));
  POOL_LOUNGERS.forEach((l, i) => lounger(`pool-lounger-${i}`, l.x, l.z, false));
  // The rooms' fixtures: the aquarium wall, the graduation wall, the shower partitions, the foyer's shelf, water and bench.
  f.push({ id: 'aquarium', minX: REST.minX, maxX: REST.minX + 0.6, minZ: 42.0, maxZ: 52.0, top: B + 2.2, bottom: B });
  f.push({ id: 'gradier', minX: GRADIER.minX, maxX: GRADIER.maxX, minZ: GRADIER.minZ, maxZ: GRADIER.maxZ, top: B + GRADIER.top, bottom: B });
  f.push({ id: 'brine-pump', minX: 34.75, maxX: GRADIER.minX, minZ: 43.85, maxZ: 44.35, top: B + 1.0, bottom: B });
  for (const z of [52.4, 53.9]) f.push({ id: `shower-wall-${z}`, minX: 34.4, maxX: KNEIPP_ROOM.maxX, minZ: z - 0.03, maxZ: z + 0.03, top: B + 2.1, bottom: B });
  f.push({ id: 'kneipp-rail', minX: KNEIPP.minX + 0.5, maxX: KNEIPP.maxX - 0.5, minZ: KNEIPP.maxZ, maxZ: KNEIPP.maxZ + 0.06, top: B + 0.95, bottom: B });
  f.push({ id: 'towel-shelf', minX: 26.6, maxX: 28.6, minZ: FOYER.minZ, maxZ: FOYER.minZ + 0.45, top: B + 1.4, bottom: B });
  f.push({ id: 'water-cooler', minX: 22.0, maxX: 22.45, minZ: 41.0, maxZ: 41.45, top: B + 1.2, bottom: B });
  f.push({ id: 'foyer-bench', minX: 22.0, maxX: 22.7, minZ: 43.7, maxZ: 45.3, top: B + 0.45, bottom: B });
  f.push({ id: 'lifeguard', minX: 19.0, maxX: 20.0, minZ: 61.6, maxZ: 62.6, top: B + 1.9, bottom: B });
  return f;
}

const rect = (r: BRect): BRect => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });

/** Where you stand at the stair's foot, facing down the foyer (south). */
export const BASEMENT_ARRIVAL = { x: (STAIR.minX + STAIR.maxX) / 2, y: B, z: STAIR_FOOT_Z + 0.8, rotY: 0 } as const;

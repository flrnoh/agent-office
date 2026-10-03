import { BAR_STOOLS, LOUNGERS, THERMAL_POOL, WHIRLPOOLS } from './therme-paradies.js';
import { DEEP, WAVE_POOL, waveSwell } from './therme-waves.js';
import { ISLE, LAGOON, RIVER, RIVER_OUT } from './therme-lagune.js';
import { GARDEN_TUB, TUB_POOL, dorfSeats } from './therme-dorf.js';

/*
 * The thermal baths' other bathers (flrnoh fork, see FORK.md "The thermal baths", phase 8): who they
 * are and where each is at any moment of the office's clock, pure, so every page puts them in the same
 * places (client/therme/bathers.ts draws them) and the tests can check that none of them walks over
 * the water or through a wall, and none swims out of it. Walkers keep to routes along the decks, the
 * sauna garden's gravel paths and the lagoon's beach, there and back; swimmers do their rounds.
 */

export type BatherRole = 'ring' | 'waves' | 'whirl' | 'lounge' | 'walk' | 'river' | 'lagoon' | 'beach' | 'garden' | 'tub' | 'lawn' | 'bar';

/** The loungers the bathers lie on (taken for everyone else): six round the thermal pool, two on the sauna garden's lawn. */
export const NPC_LOUNGERS: readonly string[] = LOUNGERS.filter((l) => l.id.startsWith('therme-lounger-s')).slice(8, 14).map((l) => l.id);
export const NPC_LAWN: readonly string[] = ['therme-lawn-3', 'therme-lawn-14'];

export const BATHER_NAMES = ['Anke', 'Bernd', 'Carla', 'Dieter', 'Elif', 'Franz', 'Gabi', 'Hakan', 'Ines', 'Jonas', 'Karin', 'Lutz', 'Mira', 'Nils', 'Olga', 'Paul', 'Rosi', 'Sepp', 'Tanja', 'Udo', 'Vera', 'Willi', 'Xenia', 'Yusuf', 'Zoe', 'Bärbel', 'Kurt', 'Lisl', 'Moni', 'Toni', 'Greta', 'Hans', 'Ilse', 'Jens', 'Klara', 'Leon', 'Marta', 'Otto'];
export const BATHER_SUITS = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#7b2cbf', '#ffb703', '#219ebc', '#fb8500', '#8ecae6', '#06d6a0'];
/** How many of each. */
export const BATHER_PLAN: readonly [BatherRole, number][] = [
  ['ring', 7],
  ['waves', 5],
  ['whirl', 4],
  ['lounge', 6],
  ['walk', 3],
  ['river', 2],
  ['lagoon', 2],
  ['beach', 2],
  ['garden', 2],
  ['tub', 2],
  ['lawn', 2],
  ['bar', 1],
];

type Corner = readonly [number, number];

/** Along a route of corners at `s` metres: round and round (`loop`), or there and back. Where, and which way it faces. */
function along(corners: readonly Corner[], s: number, loop: boolean): { x: number; z: number; rot: number } {
  const n = loop ? corners.length : corners.length - 1;
  const segs = Array.from({ length: n }, (_, i) => {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const one = segs.reduce((t, g) => t + g.len, 0);
  const total = loop ? one : one * 2;
  let k = ((s % total) + total) % total;
  const back = !loop && k > one;
  if (back) k = total - k;
  for (const g of segs) {
    if (k <= g.len) {
      const u = k / g.len;
      const dx = (g.b[0] - g.a[0]) * (back ? -1 : 1);
      const dz = (g.b[1] - g.a[1]) * (back ? -1 : 1);
      return { x: g.a[0] + (g.b[0] - g.a[0]) * u, z: g.a[1] + (g.b[1] - g.a[1]) * u, rot: Math.atan2(dx, dz) };
    }
    k -= g.len;
  }
  return { x: corners[0][0], z: corners[0][1], rot: 0 };
}

/** Round the palm island, in the middle of the ring's arms. */
const RING: Corner[] = [
  [79.5, 40],
  [115.5, 40],
  [115.5, 66],
  [79.5, 66],
];
/** Round the thermal pool on its decks: down the west deck by the whirlpools, along the south one, up the east, along the north (the waterfall's notch cuts it off from the west). */
export const WALK_ROUTE: Corner[] = [
  [66, 36],
  [66, 73],
  [126.6, 73],
  [126.6, 32.3],
  [81, 32.3],
];
/** Along the lagoon's beach, between the loungers and the water. */
export const BEACH_ROUTE: Corner[] = [
  [33.5, 146.6],
  [182, 146.6],
];
/** Through the sauna garden on its gravel paths: in from the dome's door, up to the north huts, down the west path, past the arena to the Finnish and the Kelo sauna. */
export const GARDEN_ROUTE: Corner[] = [
  [53.5, 74],
  [41, 74],
  [41, 31.5],
  [16.3, 31.5],
  [16.3, 95.8],
  [32.5, 95.8],
  [32.5, 113],
  [52, 113],
];
/** Round the lazy river's island, mid-channel. */
const RIVER_RING: Corner[] = [
  [(RIVER_OUT.minX + ISLE.minX) / 2, (RIVER_OUT.minZ + ISLE.minZ) / 2],
  [(RIVER_OUT.maxX + ISLE.maxX) / 2, (RIVER_OUT.minZ + ISLE.minZ) / 2],
  [(RIVER_OUT.maxX + ISLE.maxX) / 2, (RIVER_OUT.maxZ + ISLE.maxZ) / 2],
  [(RIVER_OUT.minX + ISLE.minX) / 2, (RIVER_OUT.maxZ + ISLE.maxZ) / 2],
];
/** Lengths of the lagoon's bay. */
const LAGOON_RING: Corner[] = [
  [42, 154],
  [92, 154],
  [92, 171],
  [42, 171],
];

/** The walkers' routes and the swimmers' rounds, with how fast each goes (m/s) and whether it's a loop. */
export const ROUTES: Partial<Record<BatherRole, { corners: readonly Corner[]; speed: number; loop: boolean; gap: number }>> = {
  ring: { corners: RING, speed: 0.55, loop: true, gap: 13.7 },
  walk: { corners: WALK_ROUTE, speed: 1.1, loop: false, gap: 61 },
  beach: { corners: BEACH_ROUTE, speed: 1.0, loop: false, gap: 83 },
  garden: { corners: GARDEN_ROUTE, speed: 0.9, loop: false, gap: 97 },
  river: { corners: RIVER_RING, speed: 0.9, loop: true, gap: 95 },
  lagoon: { corners: LAGOON_RING, speed: 0.6, loop: true, gap: 67 },
};

const swim = (surface: number, sink: number) => surface - sink;
let lawn: ReturnType<typeof dorfSeats> | null = null;

/** Where bather `slot` of `role` (with its `phase`) is at `now` (office ms): its feet, which way it faces, whether it's on the move. */
export function batherAt(role: BatherRole, slot: number, phase: number, now: number): { x: number; y: number; z: number; rot: number; moving: boolean } {
  const s = now / 1000;
  const route = ROUTES[role];
  if (route) {
    const p = along(route.corners, s * route.speed + slot * route.gap, route.loop);
    const y = role === 'ring' ? swim(THERMAL_POOL.surface, THERMAL_POOL.sink) : role === 'river' ? swim(RIVER.surface, RIVER.sink) : role === 'lagoon' ? swim(LAGOON.surface, LAGOON.sink) : 0;
    return { ...p, y, moving: role !== 'river' };
  }
  switch (role) {
    case 'waves': {
      const x = DEEP.minX + 6 + ((Math.sin(s * 0.021 + phase) + 1) / 2) * (DEEP.maxX - DEEP.minX - 12);
      const z = DEEP.minZ + 4 + ((Math.sin(s * 0.017 + phase * 1.3) + 1) / 2) * (DEEP.maxZ - DEEP.minZ - 8);
      const rot = Math.atan2(Math.cos(s * 0.021 + phase), Math.cos(s * 0.017 + phase * 1.3));
      return { x, y: WAVE_POOL.surface + waveSwell(x, z, now) - WAVE_POOL.sink, z, rot, moving: true };
    }
    case 'whirl': {
      const r = WHIRLPOOLS[slot % WHIRLPOOLS.length].rects[0];
      const cx = (r.minX + r.maxX) / 2;
      const cz = (r.minZ + r.maxZ) / 2;
      return { x: cx + Math.cos(phase) * 1.4, y: swim(WHIRLPOOLS[0].surface, WHIRLPOOLS[0].sink), z: cz + Math.sin(phase) * 1.4, rot: Math.atan2(-Math.cos(phase), -Math.sin(phase)), moving: false };
    }
    case 'tub': {
      // Sitting at the hot tub's sides, facing in.
      const T = GARDEN_TUB;
      const a = slot ? Math.PI * 0.25 : Math.PI * 1.2;
      const cx = (T.minX + T.maxX) / 2;
      const cz = (T.minZ + T.maxZ) / 2;
      return { x: cx + Math.cos(a) * 2, y: swim(TUB_POOL.surface, TUB_POOL.sink), z: cz + Math.sin(a) * 2, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), moving: false };
    }
    case 'bar': {
      // At the swim-up bar, on a stool in the water, facing the counter (east).
      const st = BAR_STOOLS[1 + (slot % (BAR_STOOLS.length - 1))];
      return { x: st.x - 0.2, y: swim(THERMAL_POOL.surface, THERMAL_POOL.sink), z: st.z, rot: Math.PI / 2, moving: false };
    }
    case 'lounge': {
      const l = LOUNGERS.find((q) => q.id === NPC_LOUNGERS[slot % NPC_LOUNGERS.length])!;
      return { x: l.x, y: 0, z: l.z, rot: l.rotY, moving: false };
    }
    case 'lawn': {
      const l = (lawn ??= dorfSeats().filter((q) => NPC_LAWN.includes(q.id))).find((q) => q.id === NPC_LAWN[slot % NPC_LAWN.length])!;
      return { x: l.x, y: 0, z: l.z, rot: l.rotY, moving: false };
    }
    default:
      return { x: 0, y: 0, z: 0, rot: 0, moving: false };
  }
}

/** How long a role's route takes, there and back (s): the tests walk every bit of it. */
export function routePeriod(role: BatherRole): number {
  const r = ROUTES[role];
  if (!r) return 0;
  const n = r.loop ? r.corners.length : r.corners.length - 1;
  let len = 0;
  for (let i = 0; i < n; i++) len += Math.hypot(r.corners[(i + 1) % r.corners.length][0] - r.corners[i][0], r.corners[(i + 1) % r.corners.length][1] - r.corners[i][1]);
  return (r.loop ? len : len * 2) / r.speed;
}

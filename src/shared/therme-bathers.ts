import { LOUNGERS, THERMAL_POOL, WHIRLPOOLS } from './therme-paradies.js';
import { DEEP, WAVE_POOL, waveSwell } from './therme-waves.js';
import { ISLE, RIVER, RIVER_OUT } from './therme-lagune.js';

/*
 * The thermal baths' other bathers (flrnoh fork, see FORK.md "The thermal baths", phase 8): who they
 * are and where each is at any moment of the office's clock, pure, so every page puts them in the same
 * places (client/therme/bathers.ts draws them) and the tests can check none of them stands in a wall.
 */

export type BatherRole = 'ring' | 'waves' | 'whirl' | 'lounge' | 'walk' | 'river';

/** The loungers the bathers lie on (taken for everyone else). */
export const NPC_LOUNGERS: readonly string[] = LOUNGERS.filter((l) => l.id.startsWith('therme-lounger-s')).slice(8, 14).map((l) => l.id);

export const BATHER_NAMES = ['Anke', 'Bernd', 'Carla', 'Dieter', 'Elif', 'Franz', 'Gabi', 'Hakan', 'Ines', 'Jonas', 'Karin', 'Lutz', 'Mira', 'Nils', 'Olga', 'Paul', 'Rosi', 'Sepp', 'Tanja', 'Udo', 'Vera', 'Willi', 'Xenia', 'Yusuf', 'Zoe', 'Bärbel', 'Kurt', 'Lisl', 'Moni', 'Toni'];
export const BATHER_SUITS = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#7b2cbf', '#ffb703', '#219ebc', '#fb8500', '#8ecae6', '#06d6a0'];
/** How many of each. */
export const BATHER_PLAN: readonly [BatherRole, number][] = [
  ['ring', 9],
  ['waves', 5],
  ['whirl', 4],
  ['lounge', 6],
  ['walk', 4],
  ['river', 2],
];

/** A loop of corners, walked at `speed` m/s: where along it at `s` metres, and which way. */
function along(corners: readonly [number, number][], s: number): { x: number; z: number; rot: number } {
  const segs = corners.map((c, i) => {
    const d = corners[(i + 1) % corners.length];
    return { a: c, b: d, len: Math.hypot(d[0] - c[0], d[1] - c[1]) };
  });
  const total = segs.reduce((t, g) => t + g.len, 0);
  let k = ((s % total) + total) % total;
  for (const g of segs) {
    if (k <= g.len) {
      const u = k / g.len;
      return { x: g.a[0] + (g.b[0] - g.a[0]) * u, z: g.a[1] + (g.b[1] - g.a[1]) * u, rot: Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]) };
    }
    k -= g.len;
  }
  return { x: corners[0][0], z: corners[0][1], rot: 0 };
}

/** Round the island, in the middle of the ring's arms. */
const RING: [number, number][] = [
  [79.5, 40],
  [115.5, 40],
  [115.5, 66],
  [79.5, 66],
];
/** Round the thermal pool on its deck, between the coping and the loungers. */
const WALK: [number, number][] = [
  [67.8, 32.6],
  [126.6, 32.6],
  [126.6, 73],
  [67.8, 73],
];
/** Round the lazy river's island, mid-channel. */
const RIVER_RING: [number, number][] = [
  [(RIVER_OUT.minX + ISLE.minX) / 2, (RIVER_OUT.minZ + ISLE.minZ) / 2],
  [(RIVER_OUT.maxX + ISLE.maxX) / 2, (RIVER_OUT.minZ + ISLE.minZ) / 2],
  [(RIVER_OUT.maxX + ISLE.maxX) / 2, (RIVER_OUT.maxZ + ISLE.maxZ) / 2],
  [(RIVER_OUT.minX + ISLE.minX) / 2, (RIVER_OUT.maxZ + ISLE.maxZ) / 2],
];

/** Where bather `slot` of `role` (with its `phase`) is at `now` (office ms): its feet, which way it faces, whether it's on the move. */
export function batherAt(role: BatherRole, slot: number, phase: number, now: number): { x: number; y: number; z: number; rot: number; moving: boolean } {
  const s = now / 1000;
  const b = { role, slot, phase };
  switch (b.role) {
    case 'ring': {
      const p = along(RING, s * 0.55 + b.slot * 13.7);
      return { ...p, y: THERMAL_POOL.surface - THERMAL_POOL.sink, moving: true };
    }
    case 'waves': {
      const x = DEEP.minX + 6 + ((Math.sin(s * 0.021 + b.phase) + 1) / 2) * (DEEP.maxX - DEEP.minX - 12);
      const z = DEEP.minZ + 4 + ((Math.sin(s * 0.017 + b.phase * 1.3) + 1) / 2) * (DEEP.maxZ - DEEP.minZ - 8);
      const rot = Math.atan2(Math.cos(s * 0.021 + b.phase), Math.cos(s * 0.017 + b.phase * 1.3));
      return { x, y: WAVE_POOL.surface + waveSwell(x, z, now) - WAVE_POOL.sink, z, rot, moving: true };
    }
    case 'whirl': {
      const r = WHIRLPOOLS[b.slot % WHIRLPOOLS.length].rects[0];
      const cx = (r.minX + r.maxX) / 2;
      const cz = (r.minZ + r.maxZ) / 2;
      const a = b.phase;
      return { x: cx + Math.cos(a) * 1.4, y: WHIRLPOOLS[0].surface - WHIRLPOOLS[0].sink, z: cz + Math.sin(a) * 1.4, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), moving: false };
    }
    case 'lounge': {
      const l = LOUNGERS.find((q) => q.id === NPC_LOUNGERS[b.slot % NPC_LOUNGERS.length])!;
      return { x: l.x, y: 0, z: l.z, rot: l.rotY, moving: false };
    }
    case 'walk': {
      const p = along(WALK, s * 1.1 + b.slot * 47);
      return { ...p, y: 0, moving: true };
    }
    case 'river': {
      const p = along(RIVER_RING, s * 0.9 + b.slot * 95);
      return { ...p, y: RIVER.surface - RIVER.sink, moving: false };
    }
  }
}


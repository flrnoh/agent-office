import { POOL_DEFAULTS, type PoolDef } from './swim.js';
import { ZONES, type TFixture, type TRect } from './therme.js';

/*
 * The Saunadorf (flrnoh fork, see FORK.md "The thermal baths", phase 5): the sauna village in the
 * baths' west part, through the door from the Thermenparadies. Huts round a cold pond: the Aufguss
 * arena with its tiers, a Finnish sauna, a Kelo log sauna, an earth sauna under a grass roof, a salt
 * sauna, a herbal sauna, a steam bath, the plunge pool, an ice fountain, a Kneipp trough, and the
 * Ruhehaus with its fireplace. Quiet in here: no radio, no music.
 *
 * The Aufguss plan runs by the office's clock: every AUFGUSS_EVERY one of the saunas has one (the
 * arena every other time), for AUFGUSS_RUN; the Saunameister comes in, waves the towel, the steam
 * comes off the stones, and whoever's inside then gets energy back (the gym's, the office gives it).
 * Every page works the plan out the same, so only the bonus goes over the wire.
 */

const D = ZONES.dorf;

export type SaunaId = 'arena' | 'finnisch' | 'kelo' | 'erd' | 'salz' | 'bio' | 'dampf';

export interface SaunaDef {
  id: SaunaId;
  name: string;
  /** Where you are when you're in it: "in der Aufgussarena", "im Dampfbad". */
  inName: string;
  emoji: string;
  /** How hot (°C), for the sign and the hint. */
  temp: number;
  /** The hut, walls included. */
  box: TRect;
  /** Its door: in which wall, and where along it (the gap's middle). */
  door: { side: 'n' | 's' | 'e' | 'w'; at: number };
  /** How tall inside. */
  height: number;
  /** Rows of benches along its walls: how many tiers (each 0.45 up and 0.6 deep). */
  tiers: number;
  /** Which walls the benches run along. */
  benches: readonly ('n' | 's' | 'e' | 'w')[];
  /** What it's made of, for the page. */
  look: 'wood' | 'log' | 'earth' | 'salt' | 'tile' | 'herbs';
}

export const HUT_WALL = 0.25;
export const DOOR_WIDTH = 1.4;
export const DOOR_HEIGHT = 2.1;
export const TIER = { rise: 0.45, run: 0.6 } as const;

export const SAUNAS: readonly SaunaDef[] = [
  { id: 'arena', name: 'Aufgussarena', inName: 'in der Aufgussarena', emoji: '🔥', temp: 90, box: { minX: 3, maxX: 29, minZ: 98, maxZ: 136 }, door: { side: 'e', at: 112 }, height: 5, tiers: 4, benches: ['w', 's', 'n'], look: 'wood' },
  { id: 'finnisch', name: 'Finnische Sauna', inName: 'in der Finnischen Sauna', emoji: '🪵', temp: 95, box: { minX: 36, maxX: 50, minZ: 99, maxZ: 110 }, door: { side: 'n', at: 43 }, height: 2.8, tiers: 3, benches: ['s', 'w', 'e'], look: 'wood' },
  { id: 'kelo', name: 'Kelo-Sauna', inName: 'in der Kelo-Sauna', emoji: '🌲', temp: 85, box: { minX: 36, maxX: 50, minZ: 116, maxZ: 130 }, door: { side: 'n', at: 43 }, height: 3.2, tiers: 2, benches: ['s', 'w', 'e'], look: 'log' },
  { id: 'erd', name: 'Erdsauna', inName: 'in der Erdsauna', emoji: '⛰️', temp: 100, box: { minX: 3, maxX: 15, minZ: 17, maxZ: 29 }, door: { side: 's', at: 9 }, height: 2.6, tiers: 2, benches: ['n', 'w', 'e'], look: 'earth' },
  { id: 'dampf', name: 'Dampfbad', inName: 'im Dampfbad', emoji: '💨', temp: 46, box: { minX: 18, maxX: 28, minZ: 17, maxZ: 28 }, door: { side: 's', at: 23 }, height: 2.6, tiers: 1, benches: ['n', 'w', 'e'], look: 'tile' },
  { id: 'salz', name: 'Salzsauna', inName: 'in der Salzsauna', emoji: '🧂', temp: 70, box: { minX: 31, maxX: 41, minZ: 17, maxZ: 28 }, door: { side: 's', at: 36 }, height: 2.6, tiers: 2, benches: ['n', 'w', 'e'], look: 'salt' },
  { id: 'bio', name: 'Bio-Sauna', inName: 'in der Bio-Sauna', emoji: '🌿', temp: 60, box: { minX: 3, maxX: 15, minZ: 34, maxZ: 46 }, door: { side: 'e', at: 40 }, height: 2.6, tiers: 2, benches: ['n', 'w', 's'], look: 'herbs' },
];
export const SAUNA_BY_ID = new Map(SAUNAS.map((s) => [s.id, s]));

/** The Ruhehaus: a quiet room with loungers and a fireplace, its door to the south. */
export const RUHEHAUS = { box: { minX: 44, maxX: 54, minZ: 17, maxZ: 34 } as TRect, door: { side: 's' as const, at: 49 }, height: 3.4, fire: { x: 49, z: 18.2 } } as const;

/** The cold pond in the middle, and the plunge pool by the huts. */
export const POND: TRect = { minX: 18, maxX: 38, minZ: 52, maxZ: 84 };
/** The jetty out into the pond, on its east side (dry: you step off it into the water). */
export const JETTY: TRect = { minX: 32, maxX: POND.maxX, minZ: 66, maxZ: 69 };
export const PLUNGE: TRect = { minX: 44, maxX: 48.5, minZ: 47, maxZ: 51.5 };
export const ICE_FOUNTAIN = { x: 51, z: 49.2 } as const;
/** The Kneipp trough: ankle-deep, walked through. */
export const KNEIPP: TRect = { minX: 43, maxX: 53, minZ: 56, maxZ: 58.6 };
export const KNEIPP_FLOOR = -0.3;

const pool = (id: string, rects: TRect[], floor: number, sink: number): PoolDef => ({ ...POOL_DEFAULTS, id, rects, surface: -0.12, floor, sink, deck: 0, speed: 1.3, fast: 2 });
/** The pond's water: either side of the jetty and beyond its end. */
export const POND_POOL = pool('therme-pond', [
  { minX: POND.minX, maxX: POND.maxX, minZ: POND.minZ, maxZ: JETTY.minZ },
  { minX: POND.minX, maxX: POND.maxX, minZ: JETTY.maxZ, maxZ: POND.maxZ },
  { minX: POND.minX, maxX: JETTY.minX, minZ: JETTY.minZ, maxZ: JETTY.maxZ },
], -1.7, 1.25);
export const PLUNGE_POOL = pool('therme-plunge', [PLUNGE], -1.5, 1.2);
export const DORF_POOLS: readonly PoolDef[] = [POND_POOL, PLUNGE_POOL];

/** The water in the Saunadorf: where the floor's open (the Kneipp trough too, its floor a little lower). */
export const dorfWater = (): TRect[] => [POND, PLUNGE, KNEIPP];

/** The board at the way in from the Thermenparadies, with the next Aufgüsse. */
export const AUFGUSS_BOARD = { x: D.maxX - 2.5, z: 66.5, y: 1.6, w: 3.4, h: 2.2 } as const;

// ---- The Aufguss plan --------------------------------------------------------------------------

/** One Aufguss every so often (office ms), for so long, in these saunas by turn (the arena every other one). */
export const AUFGUSS_EVERY = 5 * 60_000;
export const AUFGUSS_RUN = 3 * 60_000;
export const AUFGUSS_ORDER: readonly SaunaId[] = ['arena', 'finnisch', 'arena', 'kelo', 'arena', 'erd', 'arena', 'salz', 'arena', 'bio', 'arena', 'dampf'];
/** What being in for one gives you back (the gym's energy), and the fitness points. */
export const AUFGUSS_BONUS = { stamina: 30, xp: 20 } as const;
/** How long into an Aufguss you still count as there for it. */
export const AUFGUSS_LATE = 90_000;

/** The Aufguss slot `now` (office ms) is in: which sauna, when it starts, whether it's running. */
export function aufgussAt(now: number): { slot: number; sauna: SaunaId; start: number; running: boolean } {
  const slot = Math.floor(now / AUFGUSS_EVERY);
  const start = slot * AUFGUSS_EVERY;
  const sauna = AUFGUSS_ORDER[((slot % AUFGUSS_ORDER.length) + AUFGUSS_ORDER.length) % AUFGUSS_ORDER.length];
  return { slot, sauna, start, running: now - start < AUFGUSS_RUN };
}

/** The next `n` Aufgüsse from `now` (the one running first, if one is). */
export function aufgussPlan(now: number, n = 4): { sauna: SaunaId; start: number; running: boolean }[] {
  const out: { sauna: SaunaId; start: number; running: boolean }[] = [];
  const first = aufgussAt(now);
  for (let k = first.running ? 0 : 1; out.length < n; k++) {
    const a = aufgussAt(first.start + k * AUFGUSS_EVERY);
    out.push({ sauna: a.sauna, start: a.start, running: k === 0 && first.running });
  }
  return out;
}

/** The inside of a hut (its walls' inner faces). */
export const innerOf = (b: TRect): TRect => ({ minX: b.minX + HUT_WALL, maxX: b.maxX - HUT_WALL, minZ: b.minZ + HUT_WALL, maxZ: b.maxZ - HUT_WALL });

/** Which sauna (x, z) is inside (feet below 3 m up), if any. */
export function saunaAt(x: number, y: number, z: number): SaunaDef | undefined {
  if (y > 3) return undefined;
  return SAUNAS.find((s) => {
    const r = innerOf(s.box);
    return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
  });
}
export const inRuhehaus = (x: number, z: number) => {
  const r = innerOf(RUHEHAUS.box);
  return x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;
};

// ---- What's solid ------------------------------------------------------------------------------

/** A hut's walls (a gap for its door, a lintel over it) and its roof. */
function hut(id: string, b: TRect, door: { side: 'n' | 's' | 'e' | 'w'; at: number }, height: number): TFixture[] {
  const t = HUT_WALL;
  const f: TFixture[] = [];
  const wall = (side: 'n' | 's' | 'e' | 'w') => {
    const horiz = side === 'n' || side === 's';
    const at = side === 'n' ? b.minZ : side === 's' ? b.maxZ - t : side === 'w' ? b.minX : b.maxX - t;
    const from = horiz ? b.minX : b.minZ;
    const to = horiz ? b.maxX : b.maxZ;
    const seg = (a: number, z: number, bottom: number, top: number, k: string) =>
      f.push(horiz ? { id: `${id}-${side}-${k}`, minX: a, maxX: z, minZ: at, maxZ: at + t, bottom, top } : { id: `${id}-${side}-${k}`, minX: at, maxX: at + t, minZ: a, maxZ: z, bottom, top });
    if (door.side !== side) return seg(from, to, 0, height, 'a');
    seg(from, door.at - DOOR_WIDTH / 2, 0, height, 'a');
    seg(door.at + DOOR_WIDTH / 2, to, 0, height, 'b');
    seg(door.at - DOOR_WIDTH / 2, door.at + DOOR_WIDTH / 2, DOOR_HEIGHT, height, 'lintel');
  };
  (['n', 's', 'e', 'w'] as const).forEach(wall);
  f.push({ id: `${id}-roof`, ...b, bottom: height, top: height + 0.3 });
  return f;
}

/** A sauna's benches: tier by tier up from its floor along the walls it has them on (not across its door). */
export function benches(s: SaunaDef): TFixture[] {
  const r = innerOf(s.box);
  const f: TFixture[] = [];
  for (let k = 0; k < s.tiers; k++) {
    const d = (s.tiers - k) * TIER.run; // the lowest tier reaches furthest in
    const top = (k + 1) * TIER.rise;
    for (const side of s.benches) {
      const b =
        side === 'n' ? { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.minZ + d } : side === 's' ? { minX: r.minX, maxX: r.maxX, minZ: r.maxZ - d, maxZ: r.maxZ } : side === 'w' ? { minX: r.minX, maxX: r.minX + d, minZ: r.minZ, maxZ: r.maxZ } : { minX: r.maxX - d, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ };
      f.push({ id: `${s.id}-tier${k}-${side}`, ...b, top });
    }
  }
  return f;
}

/** The stove in the middle of each sauna (the arena's on its stage), as a solid block. */
export const stoveOf = (s: SaunaDef) => {
  const r = innerOf(s.box);
  const cx = s.id === 'arena' ? r.maxX - 4 : (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  return { minX: cx - 0.55, maxX: cx + 0.55, minZ: cz - 0.55, maxZ: cz + 0.55, top: 1.0 };
};

/** Where the Saunameister stands in each (by the stove, toward the benches). */
export const masterSpot = (s: SaunaDef) => {
  const st = stoveOf(s);
  return { x: (st.minX + st.maxX) / 2 - 1.2, z: (st.minZ + st.maxZ) / 2 + 0.2 };
};

export function dorfFixtures(): TFixture[] {
  const f: TFixture[] = [];
  for (const s of SAUNAS) {
    f.push(...hut(s.id, s.box, s.door, s.height));
    f.push(...benches(s));
    f.push({ id: `${s.id}-stove`, ...stoveOf(s) });
  }
  f.push(...hut('ruhe', RUHEHAUS.box, RUHEHAUS.door, RUHEHAUS.height));
  f.push({ id: 'ruhe-fire', minX: RUHEHAUS.fire.x - 1.2, maxX: RUHEHAUS.fire.x + 1.2, minZ: RUHEHAUS.box.minZ + HUT_WALL, maxZ: RUHEHAUS.fire.z + 0.6, top: 1.2 });
  f.push({ id: 'pond-floor', ...POND, bottom: POND_POOL.floor - 0.3, top: POND_POOL.floor });
  f.push({ id: 'jetty', ...JETTY, bottom: -0.3, top: 0 });
  f.push({ id: 'plunge-floor', ...PLUNGE, bottom: PLUNGE_POOL.floor - 0.3, top: PLUNGE_POOL.floor });
  f.push({ id: 'kneipp-floor', ...KNEIPP, bottom: -0.6, top: KNEIPP_FLOOR });
  f.push({ id: 'ice-fountain', minX: ICE_FOUNTAIN.x - 0.6, maxX: ICE_FOUNTAIN.x + 0.6, minZ: ICE_FOUNTAIN.z - 0.6, maxZ: ICE_FOUNTAIN.z + 0.6, top: 1.1 });
  f.push({ id: 'aufguss-board', minX: AUFGUSS_BOARD.x - 0.15, maxX: AUFGUSS_BOARD.x + 0.15, minZ: AUFGUSS_BOARD.z - AUFGUSS_BOARD.w / 2, maxZ: AUFGUSS_BOARD.z + AUFGUSS_BOARD.w / 2, top: AUFGUSS_BOARD.y + AUFGUSS_BOARD.h / 2 });
  return f;
}

// ---- Seats ---------------------------------------------------------------------------------------

/** Somewhere to sit (on a sauna's bench, at its edge) or lie (the Ruhehaus's loungers). */
export interface DorfSeat {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  pose: 'sit' | 'lie';
}

/** Seats on every tier of every sauna's benches, every metre or so, facing the room. */
export function dorfSeats(): DorfSeat[] {
  const out: DorfSeat[] = [];
  for (const s of SAUNAS) {
    const r = innerOf(s.box);
    for (let k = 0; k < s.tiers; k++) {
      const d = (s.tiers - k) * TIER.run;
      const y = (k + 1) * TIER.rise;
      // On each tier, at the front of its own step (where the one above stops).
      const edge = d - TIER.run / 2;
      for (const side of s.benches) {
        const horiz = side === 'n' || side === 's';
        const from = (horiz ? r.minX : r.minZ) + (s.tiers + 0.4) * TIER.run;
        const to = (horiz ? r.maxX : r.maxZ) - (s.tiers + 0.4) * TIER.run;
        const step = s.id === 'arena' ? 1.1 : 0.95;
        for (let v = from; v <= to + 1e-6; v += step) {
          const at =
            side === 'n' ? { x: v, z: r.minZ + edge, rotY: 0 } : side === 's' ? { x: v, z: r.maxZ - edge, rotY: Math.PI } : side === 'w' ? { x: r.minX + edge, z: v, rotY: Math.PI / 2 } : { x: r.maxX - edge, z: v, rotY: -Math.PI / 2 };
          out.push({ id: `therme-bench-${s.id}-${k}-${side}-${out.length}`, ...at, y, pose: 'sit' });
        }
      }
    }
  }
  const R = innerOf(RUHEHAUS.box);
  for (let z = R.minZ + 4.5; z < R.maxZ - 1.5; z += 2.2) {
    out.push({ id: `therme-ruhe-${out.length}`, x: R.minX + 1.4, y: 0, z, rotY: Math.PI / 2, pose: 'lie' });
    out.push({ id: `therme-ruhe-${out.length}`, x: R.maxX - 1.4, y: 0, z, rotY: -Math.PI / 2, pose: 'lie' });
  }
  return out;
}

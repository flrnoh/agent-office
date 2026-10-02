// The bowling centre's house (flrnoh fork, see FORK.md "The bowling centre"): the building's half of
// it, inside. Where the counter, the shoe rental and the lounge stand (interior coordinates, see
// shared/bowling.ts, each inside its zone), what the counter serves, the shoe sizes, and the messages
// for the lights (cosmic bowling) and the rental shoes. The server keeps both (server/bowling/place.ts).

import { ZONES, type BowlingLights, type Zone } from './bowling.js';
import type { DrinkId } from './rooftop.js';

// ---- The counter (ZONES.counter) ----------------------------------------------------------------

/** A box standing on the floor, `top` high. */
export interface Stand extends Zone {
  top: number;
}

/** The counter: a long run facing north (the lanes), people order from its north side. */
export const COUNTER: Stand = { minX: -19.4, maxX: -9.4, minZ: 14.6, maxZ: 15.4, top: 1.08 };
/** Its short return toward the entrance, facing east: the shoe rental's desk. */
export const SHOE_DESK: Stand = { minX: -9.4, maxX: -8.6, minZ: 14.6, maxZ: 17.8, top: 1.08 };
/** The back bar along the west wall: the fryer, the chip warmer, the glasses. */
export const BACK_BAR: Stand = { minX: -20.65, maxX: -19.9, minZ: 15.9, maxZ: 20.6, top: 0.95 };
/** The shelf of rental shoes against the south wall, behind the counter. */
export const SHOE_SHELF: Stand = { minX: -18.6, maxX: -10.4, minZ: 20.05, maxZ: 20.65, top: 2.3 };
/** The staff gate, between the shoe desk and the south wall. */
export const STAFF_GATE: Stand = { minX: -9.3, maxX: -8.7, minZ: 17.8, maxZ: 20.7, top: 1.0 };
/** The beer taps and the till, along the counter. */
export const TAPS = { x: -15.2, z: 15.0 } as const;
export const TILL = { x: -11, z: 15.0 } as const;
export const FRYER = { x: -20.25, z: 19.3 } as const;
/** Where the one behind the counter stands (facing north, over the counter), and where the shoe rental is served. */
export const BARKEEP = { x: -13.2, z: 16.3, rotY: Math.PI } as const;
/** Where you stand to order, and to rent shoes. */
export const ORDER_SPOT = { x: -13.2, z: 13.9 } as const;
export const SHOE_SPOT = { x: -8.1, z: 16.2 } as const;

/** What the counter serves: draught beer, a Radler, soft drinks, fries red-white, currywurst, nachos (all held like the fridge's things). */
export const BOWLING_MENU: readonly DrinkId[] = ['zwickl', 'radler', 'spezi', 'cola', 'pommes', 'currywurst', 'nachos'];

// ---- The shoe rental ----------------------------------------------------------------------------

/** The sizes on the shelf (EU). */
export const SHOE_SIZES: readonly number[] = Array.from({ length: 12 }, (_, i) => 36 + i);
export const isShoeSize = (v: unknown): v is number => typeof v === 'number' && SHOE_SIZES.includes(v);

// ---- The lounge (ZONES.lounge) ------------------------------------------------------------------

/** A sofa: its middle, which way you face sitting on it (rotY, +z is 0), how long it is. */
export interface Sofa {
  id: string;
  x: number;
  z: number;
  rotY: number;
  len: number;
}

/** A booth of three round a table on the west side, and one more on the east, the way to the mini golf between them. */
export const SOFAS: readonly Sofa[] = [
  { id: 'w', x: -4.45, z: 7.1, rotY: Math.PI / 2, len: 3.2 },
  { id: 'n', x: -2.75, z: 5.05, rotY: 0, len: 2.4 },
  { id: 's', x: -2.75, z: 9.15, rotY: Math.PI, len: 2.4 },
  { id: 'e', x: 3.45, z: 6.6, rotY: -Math.PI / 2, len: 3 },
];
export const SOFA_DEPTH = 0.9;
/** The coffee table in the booth. */
export const LOUNGE_TABLE = { x: -2.6, z: 7.1, r: 0.7 } as const;
/** The seats on the sofas, a person's width apart: where you sit and which way you face. */
export function sofaSeats(): { key: string; x: number; z: number; rotY: number }[] {
  const out: { key: string; x: number; z: number; rotY: number }[] = [];
  for (const s of SOFAS) {
    const n = Math.max(1, Math.floor(s.len / 0.8));
    const fx = Math.sin(s.rotY);
    const fz = Math.cos(s.rotY);
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * (s.len / n);
      // Along the sofa is across its facing; a little forward of the back.
      out.push({ key: `bowling-sofa-${s.id}${i + 1}`, x: s.x + fz * u + fx * 0.08, z: s.z - fx * u + fz * 0.08, rotY: s.rotY });
    }
  }
  return out;
}
/** Two arcade cabinets and the jukebox light against the mini golf room's wall, facing the room. */
export const ARCADES: readonly { x: number; z: number }[] = [
  { x: -4.35, z: 1.5 },
  { x: -3.4, z: 1.5 },
];
export const JUKE_LIGHT = { x: -2.1, z: 1.4 } as const;
/** The cosmic bowling switch, on its pedestal east of the way to the mini golf. */
export const COSMIC_SWITCH = { x: 3.25, z: 2.3 } as const;
/** The mirror ball over the lounge. */
export const MIRROR_BALL = { x: 0.6, y: 6.2, z: 5.6 } as const;
/** The way from the doors to the mini golf room's door, kept clear through the lounge. */
export const GOLF_WAY: Zone = { minX: -0.6, maxX: 2.6, minZ: ZONES.lounge.minZ, maxZ: ZONES.lounge.maxZ };

/** Everything the house stands inside: what tests/bowling-building.test.ts checks against the zones. */
export function houseSolids(): { id: string; zone: 'counter' | 'lounge'; box: Zone }[] {
  const sofa = (s: Sofa): Zone => {
    const across = Math.abs(Math.sin(s.rotY)) > 0.5;
    const hx = across ? SOFA_DEPTH / 2 : s.len / 2;
    const hz = across ? s.len / 2 : SOFA_DEPTH / 2;
    return { minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz };
  };
  return [
    { id: 'counter', zone: 'counter', box: COUNTER },
    { id: 'shoe desk', zone: 'counter', box: SHOE_DESK },
    { id: 'back bar', zone: 'counter', box: BACK_BAR },
    { id: 'shoe shelf', zone: 'counter', box: SHOE_SHELF },
    { id: 'staff gate', zone: 'counter', box: STAFF_GATE },
    ...SOFAS.map((s) => ({ id: `sofa ${s.id}`, zone: 'lounge' as const, box: sofa(s) })),
    { id: 'table', zone: 'lounge', box: { minX: LOUNGE_TABLE.x - LOUNGE_TABLE.r, maxX: LOUNGE_TABLE.x + LOUNGE_TABLE.r, minZ: LOUNGE_TABLE.z - LOUNGE_TABLE.r, maxZ: LOUNGE_TABLE.z + LOUNGE_TABLE.r } },
    ...ARCADES.map((a, i) => ({ id: `arcade ${i + 1}`, zone: 'lounge' as const, box: { minX: a.x - 0.4, maxX: a.x + 0.4, minZ: a.z - 0.4, maxZ: a.z + 0.45 } })),
    { id: 'jukebox light', zone: 'lounge', box: { minX: JUKE_LIGHT.x - 0.45, maxX: JUKE_LIGHT.x + 0.45, minZ: JUKE_LIGHT.z - 0.3, maxZ: JUKE_LIGHT.z + 0.3 } },
    { id: 'cosmic switch', zone: 'lounge', box: { minX: COSMIC_SWITCH.x - 0.4, maxX: COSMIC_SWITCH.x + 0.4, minZ: COSMIC_SWITCH.z - 0.35, maxZ: COSMIC_SWITCH.z + 0.35 } },
  ];
}

// ---- The wire -----------------------------------------------------------------------------------

/** Between two flips of the cosmic switch (ms): it's a big lever, not a strobe. */
export const LIGHTS_COOLDOWN_MS = 1500;
export const isBowlingLights = (v: unknown): v is BowlingLights => v === 'normal' || v === 'cosmic';

export type BowlingHouseClientMsg =
  /** Flip the cosmic bowling switch (only in the centre). */
  | { t: 'bowling.lights'; lights: BowlingLights }
  /** Rent a pair of shoes in a size, or give them back (null). */
  | { t: 'bowling.shoes'; size: number | null };

export type BowlingHouseServerMsg =
  /** The lights switched, by whom (to everyone in the centre). */
  | { t: 'bowling.lights'; lights: BowlingLights; by: string }
  /** Someone put rental shoes on, or gave them back (to everyone in the centre). */
  | { t: 'bowling.shoes'; id: string; size: number | null }
  /** Coming in: how the lights are, and who's wearing rental shoes. */
  | { t: 'bowling.house'; lights: BowlingLights; shoes: Record<string, number> };

// ---- Whereabouts ---------------------------------------------------------------------------------

const WHERE: Record<keyof typeof ZONES, string> = {
  lanes: '🎳 on the lanes',
  bowlers: '🎳 by the lanes',
  minigolf: '⛳ at the black-light mini golf',
  karaoke: '🎤 in the karaoke bar',
  counter: '🍟 at the bowling counter',
  lounge: '🛋️ in the bowling lounge',
};

/** Where in the bowling centre someone is, in words (ui/whereabouts.ts), by the zone they stand in. */
export function bowlingWhereabouts(x: number, z: number): string {
  for (const [id, b] of Object.entries(ZONES) as [keyof typeof ZONES, Zone][]) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return WHERE[id];
  return '🎳 in the bowling centre';
}

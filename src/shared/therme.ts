import { BASEMENT_FLOOR, THERME_PASSAGE, cutOut } from './gym-basement.js';

/*
 * The thermal baths behind the gym (flrnoh fork, see FORK.md "The thermal baths"): a place of its own
 * like the gym and the Schallwerk (THERME is a peer's `floor` while they're in there), reached for now
 * through the glass door at the end of the gym basement's passage (shared/gym-basement.ts
 * THERME_PASSAGE). Its interior is its own scene in its own coordinates; it shares nothing with the
 * gym but that door.
 *
 * The plan every phase builds on (interior coordinates: x east, z from the north side (z 0, toward
 * the gym and the street) to the south, the floor at y 0):
 *
 *   z 0 ┌──────────────── the north band: the passage from the gym, the main entrance ────────────┐
 *  z 15 ├───────────┬────────────────────────────────────────────┬──────────────────────────────┤
 *       ┊ SAUNADORF ┊ THERMENPARADIES under the glass dome        │ RUTSCHENWELT                 │
 *       ┊ x 0..55   ┊ x 55..140; the WELLENBAD x 60..135, z 80..125│ x 140..200, the slide tower  │
 *       ┊ open air, ┊                                             │                              │
 *       ┊ fenced    ┊                                             │                              │
 * z 140 └┈┈┈┈┈┈┈┈┈┈┈┴────────────────────────────────────────────┴──────────────────────────────┘
 *                     AUSSENLAGUNE + Strömungskanal (z 140..190, open sky)
 *
 * Pure data and maths, shared by the server (where someone lands, which zone they're in) and the
 * page (which builds it: client/world/therme/), so the tests can walk it. Phase 0 is the empty hall:
 * the floor, the walls, the dome's frame; the zones' doors that lead nowhere yet stay shut.
 */

/** Where you are while you're in the baths (a peer's `floor`, and `floor.go`'s). Never a project floor's id. */
export const THERME = '@therme';
/** The baths' name, wherever it's shown (one place to change it, like OFFICE_NAME in shared/brand.ts). */
export const THERME_NAME = 'Thermenwelt Flogge';

/** A rectangle on the floor. */
export interface TRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something solid in there: its top, and its underside (the floor, unless it hangs). */
export interface TFixture extends TRect {
  id: string;
  top: number;
  bottom?: number;
}

export const inT = (r: TRect, x: number, z: number, margin = 0) => x > r.minX + margin && x < r.maxX - margin && z > r.minZ + margin && z < r.maxZ - margin;

// ---- The building ---------------------------------------------------------------------------------

/** The whole house inside its outer walls (which stand just outside it). */
export const THERME_BOX: TRect = { minX: 0, maxX: 200, minZ: 0, maxZ: 140 };
/** How thick the walls are: the outer ones stand outside THERME_BOX, the inner ones straddle their line. */
export const TWALL = 0.4;
/** Where the north band (the passage, the entrance, the plant rooms) ends and the baths begin. */
export const NORTH_BAND_Z = 15;

/** The zones (who builds where, phase by phase). */
export const ZONES = {
  /** The tiled passage from the gym's basement: you come in at its north end. */
  gang: { minX: 96, maxX: 104, minZ: 0, maxZ: NORTH_BAND_Z },
  /** The main entrance from the street (phase 7): the box office, turnstiles, changing rooms. */
  lobby: { minX: 110, maxX: 138, minZ: 0, maxZ: NORTH_BAND_Z },
  /** The sauna village (phase 5): a garden under the open sky, fenced round, quiet, no radio, no music. */
  dorf: { minX: 0, maxX: 55, minZ: NORTH_BAND_Z, maxZ: 140 },
  /** The heart of it, under the glass dome (phase 2): the thermal pool, the swim-up bar, palm islands. */
  paradies: { minX: 55, maxX: 140, minZ: NORTH_BAND_Z, maxZ: 140 },
  /** The slide world (phase 4): the tower, the slides, their landing pools. */
  rutschen: { minX: 140, maxX: 200, minZ: NORTH_BAND_Z, maxZ: 140 },
  /** The outdoor lagoon and the lazy river (phase 6), out past the south wall under the open sky. */
  lagune: { minX: 30, maxX: 190, minZ: 140 + TWALL, maxZ: 190 },
} as const satisfies Record<string, TRect>;
export type ThermeZone = keyof typeof ZONES;

/** The wave pool, in the Thermenparadies's south half (phase 3): the beach at its north, shallow end. */
export const WELLENBAD: TRect = { minX: 60, maxX: 135, minZ: 80, maxZ: 125 };

/** How high each part's roof is: the north band's, the eaves round the dome, the slide hall's (the tower's 30 m fits under it). The sauna village has none: it's a garden. */
export const ROOFS = { band: 6, paradies: 12, rutschen: 34 } as const;
/** How tall the sauna garden's wooden fence is (along the west and south, where it isn't the house). */
export const DORF_FENCE = 2.8;
/** The passage's tiled ceiling, under the north band's roof. */
export const GANG_CEILING = 3.2;

/** The glass dome over the Thermenparadies: an ellipse on the eaves (spring) rising to `top`. */
export const DOME = {
  cx: (ZONES.paradies.minX + ZONES.paradies.maxX) / 2,
  cz: (ZONES.paradies.minZ + ZONES.paradies.maxZ) / 2,
  rx: (ZONES.paradies.maxX - ZONES.paradies.minX) / 2,
  rz: (ZONES.paradies.maxZ - ZONES.paradies.minZ) / 2,
  spring: ROOFS.paradies,
  top: 28,
  /** Steel ribs from the eaves to the crown, and rings round it. */
  ribs: 24,
  rings: 5,
} as const;

/** How high the dome is over (x, z): the eaves outside its ellipse. */
export function domeHeight(x: number, z: number): number {
  const u = (x - DOME.cx) / DOME.rx;
  const v = (z - DOME.cz) / DOME.rz;
  const r2 = u * u + v * v;
  return r2 >= 1 ? DOME.spring : DOME.spring + (DOME.top - DOME.spring) * Math.sqrt(1 - r2);
}

// ---- Doors ----------------------------------------------------------------------------------------

/** A door or opening in a wall: along `axis` (the wall runs along it) at `at`, from `from` to `to`, `height` tall. */
export interface TDoor {
  id: string;
  /** 'x': the wall runs along x at z = at; 'z': along z at x = at. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  height: number;
  /** Shut for now (its zone isn't built yet): a collider in the opening, and what the sign on it says. */
  shut?: string;
  /** How far the wall's middle is off its line (the outer walls stand outside THERME_BOX). */
  shift?: number;
}

/** The entrance hall's doors out to the street (shared/therme-street.ts), in the north wall: a fixture of their own, like the gym's door. */
export const STREET_DOOR = { x: 124, z: 0, width: 4, height: 3.2 } as const;

/** The glass door back to the gym, at the passage's north end (in the north wall). E there goes back. */
export const GYM_DOOR = { x: (ZONES.gang.minX + ZONES.gang.maxX) / 2, z: THERME_BOX.minZ, width: THERME_PASSAGE.maxX - THERME_PASSAGE.minX, height: THERME_PASSAGE.height } as const;

/** The openings in the inner and outer walls: the door back to the gym (a fixture of its own, `gym-door`), the passage's mouth, and the shut ones, which say what's built behind them, and when. */
export const DOORS: readonly TDoor[] = [
  { id: 'gym', axis: 'x', at: THERME_BOX.minZ, from: GYM_DOOR.x - GYM_DOOR.width / 2, to: GYM_DOOR.x + GYM_DOOR.width / 2, height: GYM_DOOR.height, shift: -TWALL / 2 },
  { id: 'gang', axis: 'x', at: NORTH_BAND_Z, from: ZONES.gang.minX, to: ZONES.gang.maxX, height: GANG_CEILING },
  { id: 'lobby', axis: 'x', at: NORTH_BAND_Z, from: 113, to: 135, height: 4 },
  { id: 'street', axis: 'x', at: THERME_BOX.minZ, from: STREET_DOOR.x - STREET_DOOR.width / 2, to: STREET_DOOR.x + STREET_DOOR.width / 2, height: STREET_DOOR.height, shift: -TWALL / 2 },
  { id: 'dorf', axis: 'z', at: ZONES.dorf.maxX, from: 70, to: 78, height: 3.2 },
  { id: 'lagune', axis: 'x', at: THERME_BOX.maxZ, from: 88, to: 107, height: 4.5, shift: TWALL / 2 },
];

// ---- Walls ----------------------------------------------------------------------------------------

/** One wall from `from` to `to` along `axis` at `at`, `top` tall, `t` thick (centred on `at` + `shift`), leaving its doors open with a lintel over each. */
function wallLine(id: string, axis: 'x' | 'z', at: number, from: number, to: number, top: number, shift = 0, t = TWALL): TFixture[] {
  const doors = DOORS.filter((d) => d.axis === axis && Math.abs(d.at - at) < 1e-6 && d.from >= from - 1e-6 && d.to <= to + 1e-6).sort((a, b) => a.from - b.from);
  const lo = at + shift - t / 2;
  const hi = at + shift + t / 2;
  const box = (a: number, b: number, bottom: number, tp: number, part: string): TFixture =>
    axis === 'x' ? { id: `${id}-${part}`, minX: a, maxX: b, minZ: lo, maxZ: hi, bottom, top: tp } : { id: `${id}-${part}`, minX: lo, maxX: hi, minZ: a, maxZ: b, bottom, top: tp };
  const out: TFixture[] = [];
  let x = from;
  doors.forEach((d, i) => {
    if (d.from > x + 1e-6) out.push(box(x, d.from, 0, top, `${i}`));
    if (top > d.height) out.push(box(d.from, d.to, d.height, top, `lintel-${d.id}`));
    x = d.to;
  });
  if (to > x + 1e-6) out.push(box(x, to, 0, top, `${doors.length}`));
  return out;
}

const B = THERME_BOX;
const Z = ZONES;
const W = TWALL;

/** Every wall: the outer ones (outside THERME_BOX; round the sauna garden, its fence), the north band's, the house's west face to the garden, and the slide hall's skirt over the open side to the dome. */
export function thermeWalls(): TFixture[] {
  return [
    // North (z 0): the band's height all along; the door back to the gym is a fixture of its own.
    ...wallLine('n', 'x', B.minZ, B.minX - W, B.maxX + W, ROOFS.band, -W / 2),
    // The band's south side (z 15): to each part's own roof; the passage and the entrance open through it.
    ...wallLine('band-dorf', 'x', NORTH_BAND_Z, B.minX, Z.dorf.maxX, ROOFS.band),
    ...wallLine('band-par', 'x', NORTH_BAND_Z, Z.paradies.minX, Z.paradies.maxX, ROOFS.paradies),
    ...wallLine('band-rut', 'x', NORTH_BAND_Z, Z.rutschen.minX, B.maxX, ROOFS.rutschen),
    // The passage's and the entrance's side walls, inside the band.
    ...wallLine('gang-w', 'z', Z.gang.minX, B.minZ, NORTH_BAND_Z, ROOFS.band),
    ...wallLine('gang-e', 'z', Z.gang.maxX, B.minZ, NORTH_BAND_Z, ROOFS.band),
    ...wallLine('lobby-w', 'z', Z.lobby.minX, B.minZ, NORTH_BAND_Z, ROOFS.band),
    ...wallLine('lobby-e', 'z', Z.lobby.maxX, B.minZ, NORTH_BAND_Z, ROOFS.band),
    // West and east (outside the box), each part as tall as its roof.
    ...wallLine('w-band', 'z', B.minX, B.minZ, NORTH_BAND_Z, ROOFS.band, -W / 2),
    ...wallLine('w-dorf', 'z', B.minX, NORTH_BAND_Z, B.maxZ + W, DORF_FENCE, -W / 2),
    ...wallLine('e-band', 'z', B.maxX, B.minZ, NORTH_BAND_Z, ROOFS.band, W / 2),
    ...wallLine('e-rut', 'z', B.maxX, NORTH_BAND_Z, B.maxZ + W, ROOFS.rutschen, W / 2),
    // South (z 140, outside the box), with the doors out to the lagoon.
    ...wallLine('s-dorf', 'x', B.maxZ, B.minX - W, Z.dorf.maxX, DORF_FENCE, W / 2),
    ...wallLine('s-par', 'x', B.maxZ, Z.paradies.minX, Z.paradies.maxX, ROOFS.paradies, W / 2),
    ...wallLine('s-rut', 'x', B.maxZ, Z.rutschen.minX, B.maxX + W, ROOFS.rutschen, W / 2),
    // The house's west face to the sauna garden (x 55), up to the dome's eaves.
    ...wallLine('dorf-e', 'z', Z.dorf.maxX, NORTH_BAND_Z, B.maxZ, ROOFS.paradies),
    // Over the open side between the dome and the slide hall (x 140): a skirt from the eaves up to its roof.
    { id: 'rut-skirt', minX: Z.rutschen.minX - W / 2, maxX: Z.rutschen.minX + W / 2, minZ: NORTH_BAND_Z, maxZ: B.maxZ, bottom: ROOFS.paradies, top: ROOFS.rutschen },
  ];
}

/** How far down the floor's slabs reach round the pools: their sides are the basins' walls, keeping swimmers in. */
export const SLAB_BOTTOM = -2.4;

/**
 * The house's own solid things: the floor (open over `water`, the pools' rectangles: its slabs reach
 * down past a swimmer's feet), the walls, the door back to the gym, the shut doors, the passage's
 * ceiling. What stands in the parts is theirs (shared/therme-all.ts puts it all together).
 */
export function thermeFixtures(water: readonly TRect[] = []): TFixture[] {
  const all = { minX: B.minX - W, maxX: B.maxX + W, minZ: B.minZ - W, maxZ: B.maxZ + W };
  const f: TFixture[] = cutOut(all, water).map((r, i) => ({ id: i ? `floor-${i}` : 'floor', ...r, bottom: water.length ? SLAB_BOTTOM : -0.3, top: 0 }));
  f.push(...thermeWalls());
  f.push({ id: 'gym-door', minX: GYM_DOOR.x - GYM_DOOR.width / 2, maxX: GYM_DOOR.x + GYM_DOOR.width / 2, minZ: B.minZ - W, maxZ: B.minZ, top: GYM_DOOR.height });
  f.push({ id: 'street-door', minX: STREET_DOOR.x - STREET_DOOR.width / 2, maxX: STREET_DOOR.x + STREET_DOOR.width / 2, minZ: B.minZ - W, maxZ: B.minZ, top: STREET_DOOR.height });
  for (const d of DOORS) {
    if (!d.shut) continue;
    const c = d.at + (d.shift ?? 0);
    f.push(d.axis === 'x' ? { id: `shut-${d.id}`, minX: d.from, maxX: d.to, minZ: c - W / 2, maxZ: c + W / 2, top: d.height } : { id: `shut-${d.id}`, minX: c - W / 2, maxX: c + W / 2, minZ: d.from, maxZ: d.to, top: d.height });
  }
  f.push({ id: 'gang-ceiling', minX: Z.gang.minX, maxX: Z.gang.maxX, minZ: B.minZ, maxZ: NORTH_BAND_Z, bottom: GANG_CEILING, top: GANG_CEILING + 0.3 });
  return f;
}

// ---- Coming and going -----------------------------------------------------------------------------

type Spot = { x: number; y: number; z: number; rotY: number };

/** Where you land coming through from the gym: just inside the passage's door, facing down it (+z). */
export const THERME_ARRIVAL: Spot = { x: GYM_DOOR.x, y: 0, z: B.minZ + 2.2, rotY: 0 };
/** Where you land back in the gym's basement (gym coordinates): in its passage in front of the door, facing the pool hall (-z). */
export const GYM_FROM_THERME: Spot = { x: (THERME_PASSAGE.minX + THERME_PASSAGE.maxX) / 2, y: BASEMENT_FLOOR, z: THERME_PASSAGE.door - 1.4, rotY: Math.PI };

/** Whether (x, z) is in the sauna garden (under the open sky, like the lagoon). */
export const inDorf = (x: number, z: number) => inT(ZONES.dorf, x, z);

/** Whether (x, z) is somewhere you can be in the baths: the passage, the entrance, or one of the parts (the lagoon too). */
export function inTherme(x: number, z: number): boolean {
  return Object.values(ZONES).some((r) => inT(r, x, z));
}

/** The zone (x, z) is in, the wave pool before the Thermenparadies round it. */
export function zoneAt(x: number, z: number): ThermeZone | 'wellenbad' | null {
  if (inT(WELLENBAD, x, z)) return 'wellenbad';
  for (const [id, r] of Object.entries(ZONES) as [ThermeZone, TRect][]) if (inT(r, x, z)) return id;
  return null;
}

/** Where someone is in there, in words (the people list's whereabouts). */
export function thermeWhereabouts(x: number, z: number): string {
  const words: Record<ThermeZone | 'wellenbad', string> = {
    gang: '🚪 im Gang zur Therme',
    lobby: '🎫 an der Thermenkasse',
    dorf: '🧖 im Saunadorf',
    paradies: '🌴 im Thermenparadies',
    wellenbad: '🌊 am Wellenbad',
    rutschen: '🛝 in der Rutschenwelt',
    lagune: '🏝️ an der Außenlagune',
  };
  const z0 = zoneAt(x, z);
  return z0 ? words[z0] : '🌴 in der Therme';
}

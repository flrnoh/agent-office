// The Schallwerk's house (flrnoh fork, see FORK.md "The Schallwerk"): the building's part of it,
// inside. Where the box office, the cloakroom, the merch stand, the photo booth, the bar, the FOH
// desks and the green room stand (interior coordinates, see shared/venue.ts, each inside its zone),
// the way up onto the stage, what the bar and the rider serve, the merch, the light desk's scenes and
// effects, and the messages for all of it. The server keeps the house (server/venue/place.ts).

import { STAGE_HEIGHT, VENUE_DOOR_INSIDE, VENUE_ENTRY, VENUE_ROOM, WING_DOOR, ZONES, REHEARSAL_ROOMS, WING_CORRIDOR, type VenueMode, type Zone, type ZoneId } from './venue.js';
import type { DrinkId } from './rooftop.js';

const R = VENUE_ROOM;

/** A box standing on the floor, `top` high. */
export interface Stand extends Zone {
  top: number;
}

/** Where someone stands (a person behind a counter, or you in front of it): `rotY` the way they face (0 = +z). */
export interface Spot {
  x: number;
  z: number;
  rotY: number;
}

// ---- The foyer (ZONES.foyer) ------------------------------------------------------------------------

/** The gallery over the foyer: a slab at `y` from the north wall to the hall (`edgeZ`), its front a balcony rail facing the stage. */
export const GALLERY = { y: 4.4, edgeZ: ZONES.foyer.maxZ, rail: 1.05 } as const;
/** The pillars under the gallery's front edge (their middles along x; 0.5 m square), clear of the ways into the hall. */
export const PILLARS_X: readonly number[] = [-6.5, 6.5, 13, 19.6];
export const PILLAR_Z = ZONES.foyer.maxZ - 0.3;
export const PILLAR_HALF = 0.25;

/** The box office (Kasse): a glazed booth against the north wall, west of the doors; you're stamped at its window. */
export const KASSE: Stand = { minX: -9.4, maxX: -4.4, minZ: R.minZ, maxZ: -13.9, top: 1.1 };
export const KASSE_STAFF: Spot = { x: -6.9, z: -14.85, rotY: 0 };
export const KASSE_SPOT = { x: -6.9, z: -13.1 } as const;

/** The cloakroom (Garderobe): a counter east of the doors, the coat rails behind it. */
export const GARDEROBE: Stand = { minX: 4.4, maxX: 10.4, minZ: -14.0, maxZ: -13.4, top: 1.05 };
export const COAT_RAILS: Stand = { minX: 4.6, maxX: 10.2, minZ: R.minZ, maxZ: -14.9, top: 1.9 };
export const GARDEROBE_STAFF: Spot = { x: 7.4, z: -14.45, rotY: 0 };
export const GARDEROBE_SPOT = { x: 7.4, z: -12.7 } as const;

/** The merch stand: shirts and hoodies on the wall behind, a table of stacks and posters before it. */
export const MERCH_TABLE: Stand = { minX: 12.4, maxX: 17.4, minZ: -14.3, maxZ: -13.4, top: 0.9 };
export const MERCH_WALL: Stand = { minX: 12.2, maxX: 17.6, minZ: R.minZ, maxZ: -15.4, top: 3.2 };
export const MERCH_STAFF: Spot = { x: 14.9, z: -14.9, rotY: 0 };
export const MERCH_SPOT = { x: 14.9, z: -12.6 } as const;

/** The photo booth (Fotobox) at the foyer's east end: a cabin with its curtain toward the foyer. */
export const FOTOBOX: Stand = { minX: 19.7, maxX: 22.7, minZ: -15.6, maxZ: -13.4, top: 2.4 };
/** Where you stand in front of it (and where the camera in it looks). */
export const FOTOBOX_SPOT = { x: 21.2, z: -12.6 } as const;

/** Two high tables in the foyer. */
export const HIGH_TABLES: readonly { x: number; z: number }[] = [
  { x: -3.6, z: -11.4 },
  { x: 10.6, z: -11.2 },
];

// ---- The bar (ZONES.bar) ----------------------------------------------------------------------------

/** The long bar down the east wall: its counter facing the hall (west), the back bar against the wall. */
export const BAR_COUNTER: Stand = { minX: 19.3, maxX: 20.1, minZ: -7.6, maxZ: 2.6, top: 1.1 };
export const BACK_BAR: Stand = { minX: 22.95, maxX: R.maxX, minZ: -8.6, maxZ: 3.6, top: 0.95 };
export const BARTENDER: Spot = { x: 21.5, z: -2.4, rotY: -Math.PI / 2 };
export const BAR_SPOT = { x: 18.4, z: -2.4 } as const;
/** The taps along the counter. */
export const TAPS_Z: readonly number[] = [-3.6, -3.0, -2.4];

/** What the bar pours (all on the house, held like the fridge's and the shops' things): beer, mate, Spezi, longdrinks, a shot, water. */
export const BAR_MENU: readonly DrinkId[] = ['zwickl', 'helles', 'radler', 'mate', 'spezi', 'cola', 'gintonic', 'spritz', 'obstler', 'energy', 'sprudel'];
/** What the rider in the green room's fridge has (the band's, but who's counting). */
export const RIDER_MENU: readonly DrinkId[] = ['helles', 'mate', 'sprudel', 'spezi', 'energy', 'brezn'];

// ---- Front of house (ZONES.foh) ---------------------------------------------------------------------

/** The FOH desks, side by side facing the stage: the sound desk (west) and the light desk (east), a rail round them. */
export const MIX_DESK: Stand = { minX: -1.6, maxX: 1.0, minZ: -7.1, maxZ: -6.35, top: 0.95 };
export const LIGHT_DESK: Stand = { minX: 1.4, maxX: 3.6, minZ: -7.1, maxZ: -6.35, top: 0.95 };
export const FOH_RAIL: readonly Stand[] = [
  { minX: ZONES.foh.minX, maxX: ZONES.foh.maxX, minZ: ZONES.foh.maxZ - 0.12, maxZ: ZONES.foh.maxZ, top: 1.05 },
  { minX: ZONES.foh.minX, maxX: ZONES.foh.minX + 0.12, minZ: ZONES.foh.minZ + 0.6, maxZ: ZONES.foh.maxZ, top: 1.05 },
  { minX: ZONES.foh.maxX - 0.12, maxX: ZONES.foh.maxX, minZ: ZONES.foh.minZ + 0.6, maxZ: ZONES.foh.maxZ, top: 1.05 },
];
export const LIGHT_SPOT = { x: 2.5, z: -7.9 } as const;
export const MIX_SPOT = { x: -0.3, z: -7.9 } as const;

// ---- Backstage (ZONES.backstage) --------------------------------------------------------------------

/** The hall's back wall behind the stage (and the DJ booth): backstage's north wall, full height, the LED wall on its face. */
export const BACK_WALL = { z0: ZONES.backstage.minZ, z1: ZONES.backstage.minZ + 0.25 } as const;
/**
 * The band's way up onto the stage: stairs in backstage climbing north to the riser's back edge
 * (z = ZONES.stage.maxZ, STAGE_HEIGHT up), through an opening in the back wall. The instruments
 * part keeps the riser's back edge free between minX and maxX.
 */
export const STAGE_STAIRS = { minX: 11.4, maxX: 13.4, foot: 13.3, steps: 6 } as const;
/** The top of the stairs: a landing at the riser's height through the back wall's opening, up to the riser. */
export const STAIRS_LANDING: Stand = { minX: STAGE_STAIRS.minX, maxX: STAGE_STAIRS.maxX, minZ: ZONES.stage.maxZ, maxZ: BACK_WALL.z1 + 0.3, top: STAGE_HEIGHT };
/** Each step of the stairs, bottom (south) first. */
export function stairSteps(): Stand[] {
  const out: Stand[] = [];
  const n = STAGE_STAIRS.steps;
  const run = (STAGE_STAIRS.foot - STAIRS_LANDING.maxZ) / (n - 1);
  for (let i = 0; i < n - 1; i++) out.push({ minX: STAGE_STAIRS.minX, maxX: STAGE_STAIRS.maxX, minZ: STAGE_STAIRS.foot - (i + 1) * run, maxZ: STAGE_STAIRS.foot - i * run, top: ((i + 1) * STAGE_HEIGHT) / n });
  return out;
}
/** The artists' door: from the rehearsal wing's corridor into backstage, in the wall between them (x = ZONES.wing.maxX). */
export const BACKSTAGE_DOOR = { x: ZONES.wing.maxX, z: 13.6, width: 1.4 } as const;

/** The green room's sofas: middle, the way you face sitting (rotY), length. */
export interface Sofa {
  id: string;
  x: number;
  z: number;
  rotY: number;
  len: number;
}
export const SOFAS: readonly Sofa[] = [
  { id: 'a', x: -6.4, z: 15.15, rotY: Math.PI, len: 3 },
  { id: 'b', x: -2.6, z: 15.15, rotY: Math.PI, len: 2.4 },
  { id: 'c', x: 6.4, z: 15.15, rotY: Math.PI, len: 2.4 },
];
export const SOFA_DEPTH = 0.9;
/** The low table in front of the sofas. */
export const GREEN_TABLE = { x: -4.6, z: 13.9, w: 2.2, d: 0.8 } as const;
/** The make-up mirrors with their bulbs, against the back wall, and the counter under them. */
export const MIRRORS: Stand = { minX: -9.6, maxX: -3.6, minZ: BACK_WALL.z1, maxZ: BACK_WALL.z1 + 0.5, top: 0.85 };
/** The rider fridge (glass door, the band's drinks), against the south wall. */
export const RIDER: Stand = { minX: 1.6, maxX: 2.6, minZ: R.maxZ - 0.75, maxZ: R.maxZ, top: 1.9 };
export const RIDER_SPOT = { x: 2.1, z: 14.1 } as const;
/** Flight cases and a cable spool or two, east of the stairs, by the loading door. */
export const CASES: readonly Stand[] = [
  { minX: 15.0, maxX: 16.4, minZ: 14.6, maxZ: 15.6, top: 1.2 },
  { minX: 16.6, maxX: 17.8, minZ: 14.8, maxZ: 15.6, top: 0.9 },
  { minX: 20.2, maxX: 21.4, minZ: 11.5, maxZ: 12.3, top: 1.0 },
];
/** The roll-up door onto the loading dock, in the east wall. */
export const LOADING_DOOR = { z: 13.5, width: 3.2, height: 3.4 } as const;

/** The seats on the sofas, a person's width apart: where you sit and which way you face. */
export function sofaSeats(): { key: string; x: number; z: number; rotY: number }[] {
  const out: { key: string; x: number; z: number; rotY: number }[] = [];
  for (const s of SOFAS) {
    const n = Math.max(1, Math.floor(s.len / 0.8));
    const fx = Math.sin(s.rotY);
    const fz = Math.cos(s.rotY);
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * (s.len / n);
      out.push({ key: `venue-sofa-${s.id}${i + 1}`, x: s.x + fz * u + fx * 0.08, z: s.z - fx * u + fz * 0.08, rotY: s.rotY });
    }
  }
  return out;
}

/** Every solid of the house, with the zone it must stand in: what tests/venue-building.test.ts checks. */
export function houseSolids(): { id: string; zone: ZoneId; box: Zone }[] {
  const sofa = (s: Sofa): Zone => ({ minX: s.x - s.len / 2, maxX: s.x + s.len / 2, minZ: s.z - SOFA_DEPTH / 2, maxZ: Math.min(R.maxZ, s.z + SOFA_DEPTH / 2) });
  const square = (x: number, z: number, r: number): Zone => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  return [
    { id: 'box office', zone: 'foyer', box: KASSE },
    { id: 'cloakroom', zone: 'foyer', box: GARDEROBE },
    { id: 'coat rails', zone: 'foyer', box: COAT_RAILS },
    { id: 'merch table', zone: 'foyer', box: MERCH_TABLE },
    { id: 'merch wall', zone: 'foyer', box: MERCH_WALL },
    { id: 'photo booth', zone: 'foyer', box: FOTOBOX },
    ...HIGH_TABLES.map((t, i) => ({ id: `high table ${i + 1}`, zone: 'foyer' as const, box: square(t.x, t.z, 0.4) })),
    ...PILLARS_X.map((x, i) => ({ id: `pillar ${i + 1}`, zone: 'foyer' as const, box: square(x, PILLAR_Z, PILLAR_HALF) })),
    { id: 'bar counter', zone: 'bar', box: BAR_COUNTER },
    { id: 'back bar', zone: 'bar', box: BACK_BAR },
    { id: 'sound desk', zone: 'foh', box: MIX_DESK },
    { id: 'light desk', zone: 'foh', box: LIGHT_DESK },
    ...FOH_RAIL.map((r, i) => ({ id: `foh rail ${i + 1}`, zone: 'foh' as const, box: r })),
    ...stairSteps().map((s, i) => ({ id: `stair ${i + 1}`, zone: 'backstage' as const, box: s })),
    ...SOFAS.map((s) => ({ id: `sofa ${s.id}`, zone: 'backstage' as const, box: sofa(s) })),
    { id: 'green room table', zone: 'backstage', box: { minX: GREEN_TABLE.x - GREEN_TABLE.w / 2, maxX: GREEN_TABLE.x + GREEN_TABLE.w / 2, minZ: GREEN_TABLE.z - GREEN_TABLE.d / 2, maxZ: GREEN_TABLE.z + GREEN_TABLE.d / 2 } },
    { id: 'mirrors', zone: 'backstage', box: MIRRORS },
    { id: 'rider fridge', zone: 'backstage', box: RIDER },
    ...CASES.map((c, i) => ({ id: `flight case ${i + 1}`, zone: 'backstage' as const, box: c })),
  ];
}

/** The ways that stay clear: from the doors into the foyer and on into the hall, in front of the wing's door and the artists' door, round the stairs. */
export function walkways(): { id: string; box: Zone }[] {
  return [
    { id: 'the entrance', box: { minX: VENUE_ENTRY.x - 1.6, maxX: VENUE_ENTRY.x + 1.6, minZ: VENUE_DOOR_INSIDE.z - 0.4, maxZ: ZONES.foyer.maxZ } },
    { id: 'the wing door', box: { minX: WING_DOOR.x, maxX: WING_DOOR.x + 1.5, minZ: WING_DOOR.z - WING_DOOR.width / 2, maxZ: WING_DOOR.z + WING_DOOR.width / 2 } },
    { id: 'the artists’ door', box: { minX: BACKSTAGE_DOOR.x, maxX: BACKSTAGE_DOOR.x + 1.5, minZ: BACKSTAGE_DOOR.z - BACKSTAGE_DOOR.width / 2, maxZ: BACKSTAGE_DOOR.z + BACKSTAGE_DOOR.width / 2 } },
    { id: 'the foot of the stairs', box: { minX: STAGE_STAIRS.minX, maxX: STAGE_STAIRS.maxX, minZ: STAGE_STAIRS.foot, maxZ: STAGE_STAIRS.foot + 1.2 } },
    { id: 'the way to the bar', box: { minX: 13.5, maxX: 19, minZ: ZONES.foyer.maxZ - 1, maxZ: ZONES.foyer.maxZ } },
  ];
}

// ---- Merch ------------------------------------------------------------------------------------------

/** What the merch stand sells: three shirts to wear (everyone sees them on you) and a poster to take home (a PNG). */
export type MerchId = 'shirt' | 'tour' | 'hoodie';
export interface MerchItem {
  id: MerchId;
  name: string;
  emoji: string;
  blurb: string;
  /** The fabric, and the print on it. */
  color: string;
  ink: string;
  /** Long sleeves and a hood. */
  hoodie: boolean;
}
export const MERCH: readonly MerchItem[] = [
  { id: 'shirt', name: 'Logo-Shirt', emoji: '👕', blurb: 'Schwarz, das Logo in Neonrot auf der Brust', color: '#18181c', ink: '#ff3b3b', hoodie: false },
  { id: 'tour', name: 'Tour-Shirt', emoji: '🎸', blurb: 'Weiß, vorne das Logo, hinten alle Daten der Tour', color: '#f2efe8', ink: '#16161a', hoodie: false },
  { id: 'hoodie', name: 'Hoodie', emoji: '🧥', blurb: 'Weinrot, warm, Kapuze, das Logo groß auf der Brust', color: '#6d1420', ink: '#ffd166', hoodie: true },
];
export const MERCH_BY_ID = new Map(MERCH.map((m) => [m.id, m]));
export const isMerch = (v: unknown): v is MerchId => typeof v === 'string' && MERCH_BY_ID.has(v as MerchId);

/** What someone has on them from the house: the entry stamp on their hand, a merch shirt, their coat's ticket at the cloakroom. */
export interface VenueWear {
  stamp?: boolean;
  shirt?: MerchId;
  /** The cloakroom ticket's number while their coat hangs there. */
  coat?: number;
}
/** How long an entry stamp lasts (ms): the night. */
export const STAMP_MS = 8 * 3600_000;
/** The cloakroom's numbers. */
export const COAT_TAGS = 120;

// ---- The light desk -------------------------------------------------------------------------------

/** The scenes the light desk has: `auto` follows the music (venueLevel), the rest are looks of their own. */
export const SCENES = ['auto', 'warm', 'rot', 'blau', 'uv', 'strobo', 'blackout'] as const;
export type VenueScene = (typeof SCENES)[number];
export const SCENE_NAMES: Record<VenueScene, string> = { auto: '🎵 Auto (zur Musik)', warm: '🔆 Warmweiß', rot: '🔴 Rot', blau: '🔵 Blau', uv: '🟣 UV', strobo: '⚡ Strobo', blackout: '⬛ Blackout' };
export const isScene = (v: unknown): v is VenueScene => typeof v === 'string' && (SCENES as readonly string[]).includes(v);

/** How the house is lit, for everyone inside: the scene, the lasers, the mirror ball. */
export interface VenueLights {
  scene: VenueScene;
  laser: boolean;
  ball: boolean;
}
/** Where each mode starts: a concert lit warm with no lasers, a club dark with the ball and the lasers. */
export const MODE_LIGHTS: Record<VenueMode, VenueLights> = {
  konzert: { scene: 'auto', laser: false, ball: false },
  club: { scene: 'auto', laser: true, ball: true },
};

/** The one-shot effects: CO₂ cannons, a confetti cannon, cold sparkler fountains along the stage's front, the haze machine, an announcement. */
export const EFFECTS = ['co2', 'konfetti', 'funken', 'nebel'] as const;
export type VenueFx = (typeof EFFECTS)[number];
export const FX_NAMES: Record<VenueFx, string> = { co2: '💨 CO₂-Kanonen', konfetti: '🎊 Konfetti', funken: '✨ Funkenfontänen', nebel: '🌫️ Nebel' };
export const isFx = (v: unknown): v is VenueFx => typeof v === 'string' && (EFFECTS as readonly string[]).includes(v);
/** How long each effect takes to load again (ms), for the whole house. */
export const FX_COOLDOWN_MS: Record<VenueFx, number> = { co2: 2500, konfetti: 8000, funken: 5000, nebel: 6000 };
/** How long each lasts once fired (ms): the haze hangs about a while. */
export const FX_LASTS_MS: Record<VenueFx, number> = { co2: 1600, konfetti: 9000, funken: 3500, nebel: 45000 };
/** The announcements the sound desk can make over the PA. */
export const ANNOUNCEMENTS: readonly string[] = ['Gleich geht’s los: noch fünf Minuten bis zur Show!', 'Letzte Runde an der Bar!', 'Bitte nicht vergessen: Jacken an der Garderobe abholen.', 'Macht mal Lärm für die Band!', 'Danke, dass ihr da wart. Kommt gut heim!'];

/** Between two mode switches (ms): the whole house changes, give it a moment. */
export const MODE_COOLDOWN_MS = 3000;
/** Between two changes at the light desk (ms), from anyone. */
export const LIGHTS_COOLDOWN_MS = 150;
/** Between two announcements (ms). */
export const ANNOUNCE_COOLDOWN_MS = 6000;
export const isMode = (v: unknown): v is VenueMode => v === 'konzert' || v === 'club';

// ---- The wire ---------------------------------------------------------------------------------------

export type VenueHouseClientMsg =
  /** Switch the house between concert and club (at the light desk). */
  | { t: 'venue.mode'; mode: VenueMode }
  /** The light desk: a scene, the lasers on or off, the mirror ball on or off (any of them). */
  | { t: 'venue.lights'; scene?: VenueScene; laser?: boolean; ball?: boolean }
  /** Fire an effect: CO₂, confetti, the sparkler fountains, haze. */
  | { t: 'venue.fx'; fx: VenueFx }
  /** An announcement over the PA from the sound desk (one of ANNOUNCEMENTS). */
  | { t: 'venue.announce'; n: number }
  /** A stamp on your hand at the box office. */
  | { t: 'venue.stamp' }
  /** Hand your coat in at the cloakroom (true), or get it back (false). */
  | { t: 'venue.coat'; in: boolean }
  /** Put on a merch shirt, or take it off again (null). */
  | { t: 'venue.merch'; item: MerchId | null }
  /** The page wants to know what everyone has on (on arriving in the office): answered with venue.house. */
  | { t: 'venue.hello' };

export type VenueHouseServerMsg =
  /** The house switched (to everyone in the office: the letter board out front shows it). */
  | { t: 'venue.mode'; mode: VenueMode; lights: VenueLights; by: string }
  /** The light desk changed (to everyone inside). */
  | { t: 'venue.lights'; lights: VenueLights; by: string }
  /** An effect went off, on the office's clock (to everyone inside). */
  | { t: 'venue.fx'; fx: VenueFx; at: number; by: string }
  /** An announcement (to everyone inside). */
  | { t: 'venue.announce'; text: string; by: string }
  /** What someone has on from the house now (to everyone in the office: a shirt and a stamp go along everywhere). */
  | { t: 'venue.wear'; id: string; wear: VenueWear }
  /** Coming in, or asking: the mode, the lights, the effects still going, and what everyone has on, by peer id. */
  | { t: 'venue.house'; mode: VenueMode; lights: VenueLights; fx: { fx: VenueFx; at: number }[]; wear: Record<string, VenueWear> };

// ---- Whereabouts ------------------------------------------------------------------------------------

/** Where in the Schallwerk someone is, in words (ui/whereabouts.ts), by the zone they stand in (and how high: up on the stage). */
export function venueWhereabouts(x: number, y: number, z: number): string {
  const inBox = (b: Zone) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  for (const r of REHEARSAL_ROOMS) if (inBox(r.box)) return r.id === 'studio' ? '🎙️ im Studio' : `🥁 im ${r.name}`;
  if (inBox(ZONES.wing) || inBox(WING_CORRIDOR)) return '🎸 bei den Proberäumen';
  if (inBox(ZONES.stage)) return y > STAGE_HEIGHT - 0.4 ? '🎤 auf der Bühne' : '🤘 vor der Bühne';
  if (inBox(ZONES.djbooth)) return '🎧 am DJ-Pult';
  if (inBox(ZONES.backstage)) return '🛋️ Backstage';
  if (inBox(ZONES.bar)) return '🍺 an der Bar';
  if (inBox(ZONES.foh)) return '🎛️ am Mischpult';
  if (inBox(ZONES.floor)) return '🤘 vor der Bühne';
  if (inBox(ZONES.foyer)) return '🎟️ im Foyer';
  return '🎸 im Schallwerk';
}

// ---- Outside, round the building (street coordinates) --------------------------------------------

/** The smokers' beer garden in front of the west half of the façade: benches, a fire bowl, string lights, a low fence. */
export const BEER_GARDEN = { minX: 91, maxX: 108.4, minZ: 33.4, maxZ: 36 } as const;
/** The band's nightliner, parked along the front of the east half, its door toward the house. */
export const TOUR_BUS = { minX: 118.6, maxX: 132.4, minZ: 32.1, maxZ: 34.6, h: 4 } as const;
/** The loading dock against the east wall at the back: a platform at truck height, the roll-up door above it. */
export const DOCK = { minX: 137, maxX: 139.8, minZ: 60.2, maxZ: 67.8, top: 1.2 } as const;
/** Everything of the house's that stands outside its box, for the street to keep clear of (outside.ts neighbourBoxes, the tests). */
export const YARD: readonly (Zone & { top: number })[] = [
  { ...BEER_GARDEN, top: 3.2 },
  { minX: TOUR_BUS.minX, maxX: TOUR_BUS.maxX, minZ: TOUR_BUS.minZ, maxZ: TOUR_BUS.maxZ, top: TOUR_BUS.h },
  { ...DOCK, top: 4.6 },
];

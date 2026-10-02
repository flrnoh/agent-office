// Each storey its own interior (flrnoh fork, see FORK.md). The storeys already have their own cut
// (shared/storey.ts: the desks, the balconies, the windows); this is how each one's furnished: its
// floor, its ceiling, what's on its walls, its lamps, its rugs, the colors of its desks, chairs and
// couch, and the bits of decor that make it a place of its own (a loft's ducts, an Altbau's stucco,
// the jungle's hanging plants, the neon signs).
//
// Every floor has one. Unless an admin picked one for it in the elevator (the floor's `interior`,
// kept in interiors.json), it's the one its place in the stack gives it (`defaultInterior`): the bottom
// floor the office as it always was, the floors above taking turns, so no two floors one over the
// other are furnished alike. Shared by the server (which keeps the picks) and the page (which builds
// them), as pure data.

/** What the floor's laid with. */
export type FloorFinish = 'planks' | 'herringbone' | 'concrete' | 'tatami' | 'carpet' | 'epoxy';
/** What's over your head. */
export type CeilingFinish = 'tiles' | 'concrete' | 'boards' | 'stucco' | 'dark';
/** What the walls have on them, past their paint (see world/office/interior/walls.ts). */
export type WallFinish = 'none' | 'brick' | 'slats' | 'wainscot' | 'moss' | 'wallpaper' | 'panels' | 'shoji';
/** The lamps that hang from the ceiling over the desks and the lounge. */
export type LampKind = 'cone' | 'cage' | 'globe' | 'chandelier' | 'rattan' | 'dome' | 'ring' | 'lantern';
/** The rugs under the desk pods. */
export type RugKind = 'rect' | 'round' | 'oriental' | 'jute' | 'shag' | 'neon' | 'tatami';

export interface InteriorStyle {
  id: string;
  /** What the elevator calls it. */
  name: string;
  emoji: string;
  /** A line about it, for the elevator. */
  blurb: string;
  /**
   * The walls', trim's and floor's colors, over the floor's own palette (see FLOOR_PALETTES): none of
   * them, and the floor looks like its project as it always did.
   */
  paint?: { wall?: string; trim?: string; floor?: string; floorAlt?: string; seam?: string };
  /**
   * The accent wall's color (see StoreyPlan.accent), in its place: one that goes with the interior. None,
   * and the storey's own accent stays (the office as it always was).
   */
  accent?: string;
  floor: FloorFinish;
  ceiling: CeilingFinish;
  /** Which walls get its finish: the accent wall (or the west wall, on a floor with none), or all round. */
  walls: { finish: WallFinish; where: 'accent' | 'all' };
  lamp: LampKind;
  rugs: { kind: RugKind; colors: readonly string[] };
  /** The lounge's rug. */
  loungeRug: string;
  /** The desks' tops and legs, and the wood round the office (the boards' frames, the coffee table, shelves). */
  desk: string;
  deskLeg: string;
  wood: string;
  /** The desk chairs, which the desks take turns with. */
  chairs: readonly string[];
  /** The lounge's couch (and the loft's). */
  sofa: string;
  /** The potted plants' pots, and how big the plants grow here. */
  pot: string;
  plantScale: number;
}

/** The office as it always was: the floor's palette, pastel rugs, the cone lamps. */
const KLASSIK: InteriorStyle = {
  id: 'klassik',
  name: 'Klassik',
  emoji: '🏢',
  blurb: 'Das Büro, wie es immer war',
  floor: 'planks',
  ceiling: 'tiles',
  walls: { finish: 'none', where: 'accent' },
  lamp: 'cone',
  rugs: { kind: 'rect', colors: ['#bde0fe', '#ffd6a5', '#caffbf', '#ffc6ff'] },
  loungeRug: '#ffc6ff',
  desk: '#f7f3ea',
  deskLeg: '#3d405b',
  wood: '#c98b5a',
  chairs: ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'],
  sofa: '#5b8def',
  pot: '#e76f51',
  plantScale: 1,
};

/** Every interior, the bottom floor's first; the floors above take turns with the rest in this order. */
export const INTERIORS: readonly InteriorStyle[] = [
  KLASSIK,
  {
    id: 'loft',
    name: 'Industrie-Loft',
    emoji: '🏭',
    blurb: 'Sichtbeton, Backstein, Lüftungsrohre und Glühbirnen im Käfig',
    paint: { wall: '#e9e4dc', trim: '#2b2d33', floor: '#9fa3a8', floorAlt: '#979ba1', seam: '#7d8187' },
    accent: '#cfc6b8',
    floor: 'concrete',
    ceiling: 'concrete',
    walls: { finish: 'brick', where: 'accent' },
    lamp: 'cage',
    rugs: { kind: 'rect', colors: ['#6b705c', '#a5543a', '#3f4a5a', '#8c6d46'] },
    loungeRug: '#4a4e57',
    desk: '#b98a5e',
    deskLeg: '#1f2126',
    wood: '#8a5a3b',
    chairs: ['#1f2126', '#8b4a2b', '#1f2126', '#5c636e', '#8b4a2b', '#2f3540'],
    sofa: '#8b4a2b',
    pot: '#8e9196',
    plantScale: 1.1,
  },
  {
    id: 'skandi',
    name: 'Skandi',
    emoji: '🌿',
    blurb: 'Helles Holz, Weiß, runde Teppiche und Papierkugeln',
    paint: { wall: '#fbfaf7', trim: '#d9cbb4', floor: '#ecdcc0', floorAlt: '#e5d2b2', seam: '#d6c19e' },
    accent: '#dde5dc',
    floor: 'planks',
    ceiling: 'boards',
    walls: { finish: 'slats', where: 'accent' },
    lamp: 'globe',
    rugs: { kind: 'round', colors: ['#e9e2d6', '#c9d6c4', '#d8c7b8', '#cfd8e0'] },
    loungeRug: '#ede6da',
    desk: '#f4ede1',
    deskLeg: '#d8c3a2',
    wood: '#d8b98e',
    chairs: ['#f4f1ea', '#9aac94', '#d8c3a2', '#c7cfd6', '#e8d9c4', '#7e8f88'],
    sofa: '#c9c4bb',
    pot: '#f1ece3',
    plantScale: 1.15,
  },
  {
    id: 'altbau',
    name: 'Altbau',
    emoji: '🏛️',
    blurb: 'Fischgrät-Parkett, Kassetten, Stuck und Kronleuchter',
    paint: { wall: '#eef0e3', trim: '#ffffff', floor: '#b9814c', floorAlt: '#a87140', seam: '#7f5430' },
    accent: '#8fa89a',
    floor: 'herringbone',
    ceiling: 'stucco',
    walls: { finish: 'wainscot', where: 'all' },
    lamp: 'chandelier',
    rugs: { kind: 'oriental', colors: ['#8c2f39', '#2e4a7d', '#7a2e3b', '#284a5e'] },
    loungeRug: '#6a2c35',
    desk: '#6b4129',
    deskLeg: '#3b2416',
    wood: '#6b4129',
    chairs: ['#2f5d50', '#7a2e3b', '#2f5d50', '#b08d57', '#7a2e3b', '#2f5d50'],
    sofa: '#2f5d50',
    pot: '#e9e4d8',
    plantScale: 1.2,
  },
  {
    id: 'jungle',
    name: 'Urban Jungle',
    emoji: '🪴',
    blurb: 'Pflanzen von der Decke, Mooswand, Rattan und Jute',
    paint: { wall: '#e4ead9', trim: '#5e7d4f', floor: '#c69c6d', floorAlt: '#bb905f', seam: '#9b7449' },
    accent: '#c9d8b6',
    floor: 'planks',
    ceiling: 'boards',
    walls: { finish: 'moss', where: 'accent' },
    lamp: 'rattan',
    rugs: { kind: 'jute', colors: ['#cdb48a', '#c4a97c', '#d3bc93', '#bfa375'] },
    loungeRug: '#c9ae80',
    desk: '#e3cfa8',
    deskLeg: '#5e7d4f',
    wood: '#a8794b',
    chairs: ['#c47a4a', '#5e7d4f', '#d9b26f', '#3f6b4a', '#c47a4a', '#8fa66b'],
    sofa: '#5e7d4f',
    pot: '#c4673f',
    plantScale: 1.6,
  },
  {
    id: 'retro',
    name: '70er',
    emoji: '🪩',
    blurb: 'Orange, Braun, Senf: Kreis-Tapete, Holzvertäfelung und Lavalampen',
    paint: { wall: '#f6e3c3', trim: '#a0522d', floor: '#8a5a33', floorAlt: '#7e512e', seam: '#5f3c20' },
    accent: '#e9b872',
    floor: 'carpet',
    ceiling: 'tiles',
    walls: { finish: 'wallpaper', where: 'accent' },
    lamp: 'dome',
    rugs: { kind: 'shag', colors: ['#e07a1f', '#c9a227', '#9c4a1a', '#d9822b'] },
    loungeRug: '#c9a227',
    desk: '#f1d9a8',
    deskLeg: '#6b3e1e',
    wood: '#7a4a22',
    chairs: ['#e07a1f', '#c9a227', '#9c4a1a', '#6b8e23', '#e07a1f', '#b5651d'],
    sofa: '#c9a227',
    pot: '#e07a1f',
    plantScale: 1,
  },
  {
    id: 'neon',
    name: 'Neon',
    emoji: '🌃',
    blurb: 'Dunkel, Leuchtstreifen an der Decke und Neonschilder an der Wand',
    paint: { wall: '#262a3d', trim: '#19e3ff', floor: '#1b1e2b', floorAlt: '#1f2232', seam: '#3a2f6b' },
    accent: '#1b1e2c',
    floor: 'epoxy',
    ceiling: 'dark',
    walls: { finish: 'panels', where: 'accent' },
    lamp: 'ring',
    rugs: { kind: 'neon', colors: ['#19e3ff', '#ff3dcb', '#8a5cff', '#2bff88'] },
    loungeRug: '#2a2246',
    desk: '#2b2f40',
    deskLeg: '#ff3dcb',
    wood: '#3a3f55',
    chairs: ['#15161f', '#19e3ff', '#15161f', '#ff3dcb', '#15161f', '#8a5cff'],
    sofa: '#4b2a7a',
    pot: '#15161f',
    plantScale: 1,
  },
  {
    id: 'zen',
    name: 'Zen',
    emoji: '🎋',
    blurb: 'Tatami, Shoji-Gitter, dunkle Balken und Papierlaternen',
    paint: { wall: '#f4efe4', trim: '#3a2a1e', floor: '#cfc28e', floorAlt: '#c6b882', seam: '#2b2b2b' },
    accent: '#e9dfc8',
    floor: 'tatami',
    ceiling: 'boards',
    walls: { finish: 'shoji', where: 'accent' },
    lamp: 'lantern',
    rugs: { kind: 'tatami', colors: ['#b9ab74', '#c2b47d', '#b3a46c', '#bdb079'] },
    loungeRug: '#3a4a5c',
    desk: '#d9c29a',
    deskLeg: '#3a2a1e',
    wood: '#5a3d28',
    chairs: ['#2f3e52', '#3a2a1e', '#7a8b6f', '#2f3e52', '#a33b2b', '#3a2a1e'],
    sofa: '#2f3e52',
    pot: '#3a2a1e',
    plantScale: 0.9,
  },
];

export const INTERIOR_BY_ID: ReadonlyMap<string, InteriorStyle> = new Map(INTERIORS.map((s) => [s.id, s]));

/** Whether `id` names an interior (what an admin can pick, and what interiors.json may keep). */
export function isInterior(id: unknown): id is string {
  return typeof id === 'string' && INTERIOR_BY_ID.has(id);
}

/**
 * The interior a floor gets by its place in the stack (`index`, 0 is the bottom one) when nobody
 * picked one: the bottom floor's the office as it always was, the floors above take turns with the
 * others, round and round, so no two floors one over the other match.
 */
export function defaultInterior(index: number): InteriorStyle {
  const i = Math.max(0, Math.trunc(index) || 0);
  if (i === 0) return KLASSIK;
  const rest = INTERIORS.length - 1;
  return INTERIORS[1 + ((i - 1) % rest)];
}

/** Floor `index`'s interior: the one picked for it (`picked`, if it's one), else its place's (see defaultInterior). */
export function interiorFor(index: number, picked?: string | null): InteriorStyle {
  return (picked && INTERIOR_BY_ID.get(picked)) || defaultInterior(index);
}

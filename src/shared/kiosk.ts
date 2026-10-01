// The snack shack on Sunset Beach, Kiosk zur Möwe (flrnoh fork, see FORK.md "A day at the beach"):
// E at its counter opens the menu. What Uschi hands you over the counter is held like a bottle from
// the kitchen fridge (a peer's `drink`; rooftop.ts's DRINK_BY_ID has these too) and, like the
// fridge's, may be held anywhere and comes along wherever you go. Everything's on the house.
//
// Only types come from rooftop.ts here: fridge.ts reads this file, not the other way round.

import type { Drink } from './rooftop.js';

/** What it comes in: the kiosk's own paper cones, trays, cups and sticks. */
export type KioskGlass = 'fries' | 'currywurst' | 'cone' | 'popsicle' | 'fishroll' | 'slush' | 'coconut' | 'icetea' | 'radlercan';

export type KioskItemId = 'pommes' | 'currywurst' | 'softeis' | 'eisamstiel' | 'fischbroetchen' | 'slush' | 'kokosnuss' | 'eistee' | 'strandradler';

/** A little something it does to you as you eat it (see features/beach/kiosk.ts). */
export type KioskTreat = 'brainfreeze' | 'spicy' | 'seagull' | 'tropical' | null;

export interface KioskItem extends Drink {
  id: KioskItemId;
  glass: KioskGlass;
  section: 'food' | 'ice' | 'drinks';
  /** How long you hold it (seconds): a drink a while, fries and ice cream go in a few bites. */
  seconds: number;
  /** A cone's, a cup's or a wrapper's second colour. */
  label: string;
  /** What Uschi says as she hands it over. */
  says: string;
  treat: KioskTreat;
}

export const KIOSK_ITEMS: readonly KioskItem[] = [
  { id: 'pommes', section: 'food', name: 'Pommes rot-weiß', emoji: '🍟', blurb: 'Crispy fries in a paper cone, ketchup and mayo on top', strength: -0.1, color: '#f4c430', glass: 'fries', label: '#e63946', seconds: 24, says: 'Einmal Pommes Schranke!', treat: 'seagull' },
  { id: 'currywurst', section: 'food', name: 'Currywurst', emoji: '🌭', blurb: 'Sliced, smothered in curry ketchup, a little wooden fork', strength: -0.15, color: '#b5452b', glass: 'currywurst', label: '#f1e3c6', seconds: 24, says: 'Mit scharf? Mit scharf!', treat: 'spicy' },
  { id: 'fischbroetchen', section: 'food', name: 'Fischbrötchen', emoji: '🐟', blurb: 'Matjes, onion rings and a crisp roll: the coast in one bite', strength: -0.12, color: '#d9a05b', glass: 'fishroll', label: '#c7d6c2', seconds: 22, says: 'Moin! Frisch vom Kutter', treat: 'seagull' },
  { id: 'softeis', section: 'ice', name: 'Softeis', emoji: '🍦', blurb: 'Vanilla and strawberry swirled into a wafer cone, sprinkles on top', strength: 0, color: '#fff3d6', glass: 'cone', label: '#ff8fab', seconds: 20, says: 'Schnell, bevor’s tropft!', treat: 'brainfreeze' },
  { id: 'eisamstiel', section: 'ice', name: 'Eis am Stiel', emoji: '🍭', blurb: 'An orange-and-lemon rocket on a stick', strength: 0, color: '#ff7b00', glass: 'popsicle', label: '#ffe066', seconds: 18, says: 'Raketeneis, 3… 2… 1…', treat: 'brainfreeze' },
  { id: 'slush', section: 'ice', name: 'Blue Slush', emoji: '🧊', blurb: 'Crushed ice, blue raspberry, a spoon-straw: your tongue will be blue', strength: 0, color: '#3a86ff', glass: 'slush', label: '#ffffff', seconds: 30, says: 'Zunge blau garantiert', treat: 'brainfreeze' },
  { id: 'kokosnuss', section: 'drinks', name: 'Coconut', emoji: '🥥', blurb: 'A whole coconut with a straw and a paper umbrella in it', strength: 0, color: '#6f4518', glass: 'coconut', label: '#ffd166', seconds: 40, says: 'Urlaub in der Nuss', treat: 'tropical' },
  { id: 'eistee', section: 'drinks', name: 'Eistee Pfirsich', emoji: '🧋', blurb: 'Peach iced tea over ice in a tall cup', strength: 0, color: '#e9a23b', glass: 'icetea', label: '#ffffff', seconds: 40, says: 'Eiskalt, wie bestellt', treat: null },
  { id: 'strandradler', section: 'drinks', name: 'Strand-Radler', emoji: '🍋', blurb: 'A cold can of lemon Radler, for the sunset', strength: 0.12, color: '#ffd60a', glass: 'radlercan', label: '#2a9d8f', seconds: 45, says: 'Prost, auf den Sonnenuntergang', treat: null },
];

export const KIOSK_BY_ID = new Map<KioskItemId, KioskItem>(KIOSK_ITEMS.map((d) => [d.id, d]));

export function isKioskItem(v: unknown): v is KioskItemId {
  return typeof v === 'string' && KIOSK_BY_ID.has(v as KioskItemId);
}

/** Whether a glass is one of the kiosk's own shapes. */
export function isKioskGlass(g: string): g is KioskGlass {
  return ['fries', 'currywurst', 'cone', 'popsicle', 'fishroll', 'slush', 'coconut', 'icetea', 'radlercan'].includes(g);
}

/** Whether it's eaten (in bites) rather than drunk (the slush goes through its straw). */
export const isKioskBite = (d: Drink) => {
  const s = KIOSK_BY_ID.get(d.id as KioskItemId)?.section;
  return (s === 'food' || s === 'ice') && d.glass !== 'slush';
};

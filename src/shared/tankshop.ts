// The FLOGGE OIL shop's counter (flrnoh fork, see FORK.md "The petrol station"): E at the till for a
// coffee to go, a chocolate bar, crisps, an energy drink, a Bockwurst or the paper. What the cashier
// hands you is held like a bottle from the kitchen fridge (a peer's `drink`; rooftop.ts's DRINK_BY_ID
// has these too) and, like the fridge's, may be held anywhere and comes along. All on the house.
//
// Only types come from rooftop.ts here: fridge.ts reads this file, not the other way round.

import type { Drink } from './rooftop.js';

/** What it comes in: a paper cup with a lid, a wrapper, a bag, a tall can, a sausage in a roll, the paper. */
export type TankGlass = 'togo' | 'candybar' | 'chipsbag' | 'tallcan' | 'bockwurst' | 'newspaper';

export type TankItemId = 'tankkaffee' | 'schokoriegel' | 'tankchips' | 'tankenergy' | 'bockwurst' | 'zeitung';

export interface TankItem extends Drink {
  id: TankItemId;
  glass: TankGlass;
  /** How long you hold it (seconds). */
  seconds: number;
  /** A cup's sleeve, a wrapper's band, a bag's print, the paper's headline. */
  label: string;
  /** Coffee: a minute of the kitchen machine's buzz. Else seconds of it topped up (the energy drink). */
  coffee: boolean;
  caffeine: number;
  /** Eaten in bites (or read), rather than drunk. */
  bites: boolean;
  /** What the cashier says as she hands it over. */
  says: string;
}

export const TANK_ITEMS: readonly TankItem[] = [
  { id: 'tankkaffee', name: 'Kaffee to go', emoji: '☕', blurb: 'Filter coffee in a paper cup with a lid: the long drive’s best friend', strength: 0, color: '#6f4a2e', glass: 'togo', label: '#2a9d8f', seconds: 55, coffee: true, caffeine: 0, bites: false, says: 'Frisch durchgelaufen!' },
  { id: 'schokoriegel', name: 'Schokoriegel', emoji: '🍫', blurb: 'Caramel, nougat, chocolate: the till’s oldest trick', strength: 0, color: '#4a2c1a', glass: 'candybar', label: '#e63946', seconds: 16, coffee: false, caffeine: 0, bites: true, says: 'Für die Nerven' },
  { id: 'tankchips', name: 'Chips', emoji: '🥔', blurb: 'A bag of salted crisps for the road', strength: 0, color: '#f4a261', glass: 'chipsbag', label: '#e9c46a', seconds: 22, coffee: false, caffeine: 0, bites: true, says: 'Knusper knusper' },
  { id: 'tankenergy', name: 'Energy-Drink', emoji: '⚡', blurb: 'Half a litre of fizzing neon: drives itself', strength: 0, color: '#06d6a0', glass: 'tallcan', label: '#111111', seconds: 35, coffee: false, caffeine: 40, bites: false, says: 'Gute Fahrt!' },
  { id: 'bockwurst', name: 'Bockwurst', emoji: '🌭', blurb: 'Hot from the water bath, in a roll, mustard on the side', strength: -0.12, color: '#c0603a', glass: 'bockwurst', label: '#f2c14e', seconds: 22, coffee: false, caffeine: 0, bites: true, says: 'Mit Senf, wie immer' },
  { id: 'zeitung', name: 'Zeitung', emoji: '📰', blurb: 'Today’s paper: headlines, the weather, the football', strength: 0, color: '#f1efe8', glass: 'newspaper', label: '#d62828', seconds: 60, coffee: false, caffeine: 0, bites: false, says: 'Steht nix Gutes drin' },
];

export const TANK_BY_ID = new Map<TankItemId, TankItem>(TANK_ITEMS.map((d) => [d.id, d]));

export function isTankItem(v: unknown): v is TankItemId {
  return typeof v === 'string' && TANK_BY_ID.has(v as TankItemId);
}

/** Whether a glass is one of the shop's own shapes. */
export function isTankGlass(g: string): g is TankGlass {
  return ['togo', 'candybar', 'chipsbag', 'tallcan', 'bockwurst', 'newspaper'].includes(g);
}

/** Whether it's eaten (in bites) rather than drunk. */
export const isTankBite = (d: Drink) => !!TANK_BY_ID.get(d.id as TankItemId)?.bites;

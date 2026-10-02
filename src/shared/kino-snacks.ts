// What the cinema's counter hands out (flrnoh fork, see FORK.md "The cinema"): popcorn, nachos and
// a big cola, held like the kitchen fridge's things (a peer's `drink`; rooftop.ts's DRINK_BY_ID has
// these too) and, like those, held anywhere and along to every floor. Everything's on the house.
//
// Only types come from rooftop.ts here: fridge.ts reads this file, not the other way round.

import type { Drink } from './rooftop.js';

/** What it comes in: a striped bucket, a tray with a dip, a big paper cup with a straw. */
export type KinoGlass = 'popcorn' | 'nachos' | 'kinocup';

export type KinoSnackId = 'popcorn' | 'nachos' | 'kinocola';

export interface KinoSnack extends Drink {
  id: KinoSnackId;
  glass: KinoGlass;
  /** How long you hold it (seconds): popcorn lasts a while, a handful at a time. */
  seconds: number;
  /** The bucket's or the cup's second colour. */
  label: string;
  /** What the cashier says as she hands it over. */
  says: string;
}

export const KINO_SNACKS: readonly KinoSnack[] = [
  { id: 'popcorn', name: 'Popcorn', emoji: '🍿', blurb: 'Fresh from the machine, sweet and salty, in a striped bucket', strength: -0.08, color: '#fff3c4', glass: 'popcorn', label: '#d62828', seconds: 60, says: 'Frisch gepoppt!' },
  { id: 'nachos', name: 'Nachos', emoji: '🧀', blurb: 'Tortilla chips with warm cheese dip', strength: -0.1, color: '#f4a261', glass: 'nachos', label: '#ffd166', seconds: 40, says: 'Mit extra Käse' },
  { id: 'kinocola', name: 'Cola, groß', emoji: '🥤', blurb: 'A big cup of cola on ice, with a straw', strength: 0, color: '#3b1f12', glass: 'kinocup', label: '#e63946', seconds: 60, says: 'Eine Große, bitte schön' },
];

export const KINO_SNACK_BY_ID = new Map<KinoSnackId, KinoSnack>(KINO_SNACKS.map((d) => [d.id, d]));

export function isKinoSnack(v: unknown): v is KinoSnackId {
  return typeof v === 'string' && KINO_SNACK_BY_ID.has(v as KinoSnackId);
}

export function isKinoGlass(g: string): g is KinoGlass {
  return g === 'popcorn' || g === 'nachos' || g === 'kinocup';
}

/** Whether it's eaten (a handful at a time) rather than drunk. */
export const isKinoBite = (d: Drink) => d.glass === 'popcorn' || d.glass === 'nachos';

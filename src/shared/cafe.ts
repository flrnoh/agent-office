// The café up on the padel hall's gallery (flrnoh fork, see FORK.md "The padel hall"): E at its
// counter opens the menu. What you order is held like a bottle from the kitchen fridge (a peer's
// `drink`; rooftop.ts's DRINK_BY_ID has these too) and, like the fridge's, may be held anywhere and
// comes along wherever you go. The coffees give you the kitchen machine's buzz.
//
// Only types come from rooftop.ts and fridge.ts here: fridge.ts reads this file, not the other way round.

import type { Drink } from './rooftop.js';
import type { FridgeGlass } from './fridge.js';

/** What it comes in: cups and glasses of the café's own, a plate with a slice on it, or the fridge's pretzel. */
export type CafeGlass = 'cappuccino' | 'latte' | 'espresso' | 'mug' | 'iced' | 'schorle' | 'sport' | 'weizen' | 'cake' | 'strudel' | 'loaf';

export type CafeItemId = 'cappuccino' | 'latte' | 'espresso' | 'chai' | 'icedcoffee' | 'schorle' | 'iso' | 'weissbier' | 'kaesekuchen' | 'strudel' | 'cafebrezn' | 'bananenbrot';

export interface CafeItem extends Drink {
  id: CafeItemId;
  glass: CafeGlass | FridgeGlass;
  section: 'coffee' | 'cold' | 'cakes';
  /** How long you hold it (seconds): a coffee a while, a slice of cake a few bites. */
  seconds: number;
  /** A proper coffee: the kitchen machine's full minute of buzz (and its jitters, cup after cup). */
  coffee: boolean;
  /** Otherwise, seconds of that buzz it tops up (like the fridge's cola). */
  caffeine: number;
  /** A cup's rim, a glass's froth, a plate. */
  label: string;
  /** What the toast says as it's handed over. */
  says: string;
}

export const CAFE_ITEMS: readonly CafeItem[] = [
  { id: 'cappuccino', section: 'coffee', name: 'Cappuccino', emoji: '☕', blurb: 'Double shot, a cloud of milk foam, cocoa on top', strength: 0, color: '#6f4a2e', glass: 'cappuccino', label: '#f5ecdf', seconds: 55, coffee: true, caffeine: 0, says: 'Grazie! ☕' },
  { id: 'latte', section: 'coffee', name: 'Latte Macchiato', emoji: '🥛', blurb: 'Milk, foam and a shot through it, in a tall glass', strength: 0, color: '#c9a27a', glass: 'latte', label: '#f7f1e6', seconds: 60, coffee: true, caffeine: 0, says: 'Three layers, all yours' },
  { id: 'espresso', section: 'coffee', name: 'Espresso', emoji: '⚡', blurb: 'Short, strong, gone in two sips', strength: 0, color: '#3b2314', glass: 'espresso', label: '#ffffff', seconds: 20, coffee: true, caffeine: 0, says: 'Zack, weg!' },
  { id: 'chai', section: 'coffee', name: 'Chai Latte', emoji: '🫖', blurb: 'Black tea, spices, steamed milk: a little buzz', strength: 0, color: '#c68b59', glass: 'mug', label: '#e76f51', seconds: 55, coffee: false, caffeine: 20, says: 'Warm hands, happy heart' },
  { id: 'icedcoffee', section: 'coffee', name: 'Iced Coffee', emoji: '🧊', blurb: 'Cold brew over ice, a splash of milk, a straw', strength: 0, color: '#7a5436', glass: 'iced', label: '#e9f4fb', seconds: 50, coffee: true, caffeine: 0, says: 'Cool and caffeinated' },
  { id: 'schorle', section: 'cold', name: 'Apfelschorle', emoji: '🍏', blurb: 'Apple juice and sparkling water, half and half', strength: 0, color: '#e2b04a', glass: 'schorle', label: '#f7f3e3', seconds: 40, coffee: false, caffeine: 0, says: 'The Bavarian sports drink' },
  { id: 'iso', section: 'cold', name: 'Iso drink', emoji: '💦', blurb: 'For after a match: salts back in, thirst gone', strength: -0.1, color: '#4cc9f0', glass: 'sport', label: '#f72585', seconds: 35, coffee: false, caffeine: 0, says: 'Rehydrated. Next set!' },
  { id: 'weissbier', section: 'cold', name: 'Weißbier (alcohol-free)', emoji: '🍺', blurb: 'Cloudy wheat beer, all of the taste, no alcohol', strength: 0, color: '#e8a33d', glass: 'weizen', label: '#fffaf0', seconds: 50, coffee: false, caffeine: 0, says: 'Prost, and still fit to play' },
  { id: 'kaesekuchen', section: 'cakes', name: 'Käsekuchen', emoji: '🍰', blurb: 'Baked cheesecake, a buttery crust, a slice as tall as it should be', strength: 0, color: '#f4dca0', glass: 'cake', label: '#c98b3a', seconds: 22, coffee: false, caffeine: 0, says: 'Mahlzeit!' },
  { id: 'strudel', section: 'cakes', name: 'Apfelstrudel', emoji: '🥧', blurb: 'Warm, flaky, cinnamon apples and a dusting of sugar', strength: 0, color: '#d9a05b', glass: 'strudel', label: '#fffdf8', seconds: 22, coffee: false, caffeine: 0, says: 'Like Oma makes it' },
  { id: 'cafebrezn', section: 'cakes', name: 'Brezn', emoji: '🥨', blurb: 'A soft pretzel with salt on top. Soaks up a beer', strength: -0.12, color: '#9c4f1c', glass: 'pretzel', label: '#ffffff', seconds: 20, coffee: false, caffeine: 0, says: 'Guad!' },
  { id: 'bananenbrot', section: 'cakes', name: 'Bananenbrot', emoji: '🍌', blurb: 'A thick slice of banana bread, still a little warm', strength: 0, color: '#a86b3c', glass: 'loaf', label: '#f2d27c', seconds: 20, coffee: false, caffeine: 0, says: 'Fuel for the next match' },
];

export const CAFE_BY_ID = new Map<CafeItemId, CafeItem>(CAFE_ITEMS.map((d) => [d.id, d]));

export function isCafeItem(v: unknown): v is CafeItemId {
  return typeof v === 'string' && CAFE_BY_ID.has(v as CafeItemId);
}

/** Whether a glass is one of the café's own shapes (the pretzel is the fridge's). */
export function isCafeGlass(g: string): g is CafeGlass {
  return ['cappuccino', 'latte', 'espresso', 'mug', 'iced', 'schorle', 'sport', 'weizen', 'cake', 'strudel', 'loaf'].includes(g);
}

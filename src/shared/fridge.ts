// The kitchen fridge (flrnoh fork, see FORK.md): E at it for a cold bottle, a can or a snack. What
// you grab is held like a drink from the rooftop bar (a peer's `drink`, rooftop.ts's DRINK_BY_ID has
// these too), but unlike the bar's glasses it goes wherever you go, the roof included.
//
// Only types come from rooftop.ts here, so the two files don't load each other at runtime.

import type { Drink } from './rooftop.js';
import { CAFE_BY_ID, isCafeItem, type CafeItemId } from './cafe.js'; // the padel hall's café: held the same way
import { KIOSK_BY_ID, isKioskBite, isKioskItem, type KioskItemId } from './kiosk.js'; // and the beach kiosk's
import { KINO_SNACK_BY_ID, isKinoBite, isKinoSnack, type KinoSnackId } from './kino-snacks.js'; // and the cinema's
import { SHOP_ITEM_BY_ID, isShopItem, type ShopItemId } from './shopwares.js'; // and the city's shops'

/** What it comes in: a bottle, a can, or a snack of its own shape. */
export type FridgeGlass = 'bottle' | 'can' | 'pretzel' | 'crisps' | 'chocolate' | 'apple' | 'sandwich';

export type FridgeItemId =
  | 'helles'
  | 'radler'
  | 'cola'
  | 'spezi'
  | 'limo'
  | 'sprudel'
  | 'mate'
  | 'energy'
  | 'brezn'
  | 'crisps'
  | 'chocolate'
  | 'apple'
  | 'leberkas';

export interface FridgeItem extends Drink {
  id: FridgeItemId;
  glass: FridgeGlass;
  section: 'drinks' | 'snacks';
  /** How long you hold it: a drink is sipped for a while, a snack goes in a few bites. */
  seconds: number;
  /** Seconds of the coffee's buzz it tops up (see caffeine.ts): a little, never the jitters. */
  caffeine: number;
  /** A bottle's label, a can's band, a bag's print or a wrapper. */
  label: string;
  /** What the toast says as you grab it. */
  says: string;
}

export const FRIDGE_ITEMS: readonly FridgeItem[] = [
  { id: 'helles', says: 'Prost! 🍻', section: 'drinks', name: 'Helles', emoji: '🍺', blurb: 'A cold bottle of Bavarian lager', strength: 0.26, color: '#6b3d12', glass: 'bottle', label: '#f4e3b0', seconds: 45, caffeine: 0 },
  { id: 'radler', says: 'Prost, gently', section: 'drinks', name: 'Radler', emoji: '🚲', blurb: 'Half beer, half lemonade: the cyclist’s pint', strength: 0.12, color: '#3f7f3a', glass: 'bottle', label: '#ffe66d', seconds: 45, caffeine: 0 },
  { id: 'cola', says: 'Fizzy!', section: 'drinks', name: 'Cola', emoji: '🥤', blurb: 'Ice cold, with a little kick', strength: 0, color: '#d62828', glass: 'can', label: '#ffffff', seconds: 40, caffeine: 12 },
  { id: 'spezi', says: 'The Bavarian way', section: 'drinks', name: 'Spezi', emoji: '🧡', blurb: 'Cola and orange, the Bavarian way', strength: 0, color: '#4a2511', glass: 'bottle', label: '#ff9f1c', seconds: 45, caffeine: 10 },
  { id: 'limo', says: 'Nice and cold', section: 'drinks', name: 'Zitronenlimo', emoji: '🍋', blurb: 'Fizzy lemonade, sweet and cloudy', strength: 0, color: '#d8e8c8', glass: 'bottle', label: '#ffd60a', seconds: 40, caffeine: 0 },
  { id: 'sprudel', says: 'Good call. Stay hydrated', section: 'drinks', name: 'Sprudel', emoji: '💧', blurb: 'Sparkling water. Clears your head a little', strength: -0.2, color: '#bfe3f5', glass: 'bottle', label: '#1d6fa5', seconds: 35, caffeine: 0 },
  { id: 'mate', says: 'Ship it', section: 'drinks', name: 'Mate', emoji: '🧉', blurb: 'Fizzy mate, the hacker’s fuel', strength: 0, color: '#8a5a12', glass: 'bottle', label: '#fff3b0', seconds: 50, caffeine: 25 },
  { id: 'energy', says: 'Wiiings… no, not quite', section: 'drinks', name: 'Energy drink', emoji: '⚡', blurb: 'Tastes like gummy bears. Wings not included', strength: 0, color: '#2b59c3', glass: 'can', label: '#c0c0c8', seconds: 35, caffeine: 40 },
  { id: 'brezn', says: 'Guad! That soaks it up', section: 'snacks', name: 'Brezn', emoji: '🥨', blurb: 'A proper Bavarian pretzel, salt on top', strength: -0.12, color: '#9c4f1c', glass: 'pretzel', label: '#ffffff', seconds: 20, caffeine: 0 },
  { id: 'crisps', says: 'Crunch crunch', section: 'snacks', name: 'Crisps', emoji: '🥔', blurb: 'A bag of paprika crisps, all for you', strength: 0, color: '#e76f51', glass: 'crisps', label: '#ffd166', seconds: 22, caffeine: 0 },
  { id: 'chocolate', says: 'A little treat', section: 'snacks', name: 'Chocolate bar', emoji: '🍫', blurb: 'Alpine milk chocolate in a lilac wrapper', strength: 0, color: '#5a3825', glass: 'chocolate', label: '#9d8ac7', seconds: 18, caffeine: 0 },
  { id: 'apple', says: 'An apple a day…', section: 'snacks', name: 'Apple', emoji: '🍎', blurb: 'Crunchy, red, and good for you', strength: 0, color: '#d62828', glass: 'apple', label: '#3f8f45', seconds: 18, caffeine: 0 },
  { id: 'leberkas', says: 'Mahlzeit!', section: 'snacks', name: 'Leberkässemmel', emoji: '🥪', blurb: 'Leberkäs in a crusty roll, with sweet mustard', strength: -0.18, color: '#e8a87c', glass: 'sandwich', label: '#c98b5a', seconds: 24, caffeine: 0 },
];

export const FRIDGE_BY_ID = new Map<FridgeItemId, FridgeItem>(FRIDGE_ITEMS.map((d) => [d.id, d]));

export function isFridgeItem(v: unknown): v is FridgeItemId {
  return typeof v === 'string' && FRIDGE_BY_ID.has(v as FridgeItemId);
}

/** Whether it may be held anywhere and comes along to every floor: the fridge's things, the café's and the beach kiosk's. */
export function heldAnywhere(v: unknown): v is FridgeItemId | CafeItemId | KioskItemId | KinoSnackId | ShopItemId {
  return isFridgeItem(v) || isCafeItem(v) || isKioskItem(v) || isKinoSnack(v) || isShopItem(v);
}

/** How long a drink or snack stays in your hand: the fridge's own (or the café's, or the kiosk's), or a glass from the bar's 45 s. */
export function holdSeconds(d: Drink, glass = 45): number {
  return FRIDGE_BY_ID.get(d.id as FridgeItemId)?.seconds ?? CAFE_BY_ID.get(d.id as CafeItemId)?.seconds ?? KIOSK_BY_ID.get(d.id as KioskItemId)?.seconds ?? KINO_SNACK_BY_ID.get(d.id as KinoSnackId)?.seconds ?? SHOP_ITEM_BY_ID.get(d.id as ShopItemId)?.seconds ?? glass;
}

/** Whether it's eaten (in bites) rather than drunk: the fridge's snacks, the café's cakes, the kiosk's food and ice. */
export function isSnack(d: Drink): boolean {
  return FRIDGE_BY_ID.get(d.id as FridgeItemId)?.section === 'snacks' || CAFE_BY_ID.get(d.id as CafeItemId)?.section === 'cakes' || isKioskBite(d) || isKinoBite(d) || !!SHOP_ITEM_BY_ID.get(d.id as ShopItemId)?.bite;
}

/** Milliseconds to the next sip, or the next bite of a snack, which go quicker. */
export function sipEvery(d: Drink, random = Math.random()): number {
  return isSnack(d) ? 3500 + random * 2500 : 9000 + random * 9000;
}

// flrnoh fork (see FORK.md "The rucksack"): what you keep of the things you buy in town. A flower, a
// book, a toy, a pet, a record, a plush from the claw machine: they don't run out in your hand any
// more. Q puts what you hold in your rucksack (12 places, kept per account, so it's there after a
// reload or on another browser), U opens it: take something out, put it down in front of you, or give
// it to someone near you. Put down, it stays where it is (on that floor, for good) for everyone to see,
// and only whoever put it there can pick it up again. Food and drinks are still eaten and drunk.
// The pure parts, the same for the page, the server and the tests.

import { SHOP_ITEM_BY_ID, type ShopItem, type ShopItemId } from './shopwares.js';

/** How many things fit in a rucksack. */
export const BAG_SLOTS = 12;
/** How many things one person may have put down, across the building. */
export const PLACED_PER_OWNER = 40;
/** How many things may stand on one floor (or the roof, or a place), all told. */
export const PLACED_PER_FLOOR = 240;
/** How far from where you stand you may put something down, and give something to someone (meters). */
export const DROP_REACH = 2.5;
export const GIVE_REACH = 4;

/** A thing to keep: one of the shops' things that isn't eaten or drunk. */
export function keepable(v: unknown): v is ShopItemId {
  return typeof v === 'string' && !!SHOP_ITEM_BY_ID.get(v as ShopItemId)?.keep;
}
export function keptItem(id: ShopItemId): ShopItem {
  return SHOP_ITEM_BY_ID.get(id)!;
}

/** Where something is put down: a spot and which way it faces. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** Something standing somewhere, as a page sees it. */
export interface PlacedView extends Spot {
  id: string;
  item: ShopItemId;
  /** Who put it there, by name. */
  by: string;
  /** You did: you can pick it up again. */
  mine: boolean;
}

/** What someone asked of their rucksack, done. */
export type BagDid = 'stow' | 'take' | 'drop' | 'pick' | 'give';

export type BagClientMsg =
  /** What's in my rucksack, and what stands on the floor I've just arrived on. */
  | { t: 'bag.look' }
  /** What I hold goes in my rucksack; with `spill`, put down there if the rucksack is full. */
  | { t: 'bag.stow'; item: ShopItemId; spill?: Spot }
  /** Place `slot` of my rucksack into my hand (what I hold goes into its place). */
  | { t: 'bag.take'; slot: number }
  /** Put what I hold (or `slot` of my rucksack) down at `spot`. */
  | { t: 'bag.drop'; spot: Spot; slot?: number }
  /** Pick up something I put down. */
  | { t: 'bag.pick'; id: string }
  /** Give what I hold (or `slot` of my rucksack) to `to`, who's near me: it goes in their rucksack. */
  | { t: 'bag.give'; to: string; slot?: number };

export type BagServerMsg =
  /** Your rucksack, (when it's changed) what's in your hand now (null: nothing), and what you asked that's done. */
  | { t: 'bag'; items: ShopItemId[]; hand?: ShopItemId | null; did?: BagDid }
  /** Everything standing on `floor`, for whoever's just arrived there. */
  | { t: 'placed'; floor: string; items: PlacedView[] }
  /** Something put down on your floor. */
  | { t: 'placed.add'; item: PlacedView }
  /** Something picked up again. */
  | { t: 'placed.gone'; id: string }
  /** Someone gave you something: it's in your rucksack. */
  | { t: 'bag.gift'; from: string; item: ShopItemId };

const num = (v: unknown, lim: number): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);

/**
 * A spot someone asks to put something down at, if it's sound and within reach of where they stand
 * (`at`): no further than DROP_REACH away, and between a little below their feet and above their head.
 */
export function spotNear(v: unknown, at: { x: number; y: number; z: number }): Spot | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  const x = num(s.x, 1e5);
  const y = num(s.y, 1e5);
  const z = num(s.z, 1e5);
  const rotY = num(s.rotY, 1e3);
  if (x === null || y === null || z === null || rotY === null) return null;
  if (Math.hypot(x - at.x, z - at.z) > DROP_REACH + 0.01) return null;
  if (y < at.y - 1.2 || y > at.y + 2.2) return null;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(x), y: r(y), z: r(z), rotY: r(rotY) };
}

/** A slot of a rucksack of `n` things, if `v` is one. */
export const slotOf = (v: unknown, n: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : null);

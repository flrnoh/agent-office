// What the city's shops hand over the counter (flrnoh fork, see FORK.md "Shops to walk into"): held
// like a bottle from the kitchen fridge (a peer's `drink`; rooftop.ts's DRINK_BY_ID has these too)
// and, like the fridge's, held anywhere and along to every floor. Everything's on the house. Some
// shops sell the fridge's, the café's or the beach kiosk's things too (MENUS names them by id).
//
// Only types come from rooftop.ts here: fridge.ts reads this file, not the other way round.

import type { Drink, DrinkId } from './rooftop.js';
import type { ShopKindId } from './shops.js';
import { RECORDS, type RecordId } from './records.js';

/** What it comes in, or what it is in your hand. */
export type ShopGlass =
  | 'semmel'
  | 'krapfen'
  | 'pizzaslice'
  | 'newspaper'
  | 'gummies'
  | 'pill'
  | 'lozenge'
  | 'bouquet'
  | 'sunflower'
  | 'tulips'
  | 'book'
  | 'doener'
  | 'duerum'
  | 'lahmacun'
  | 'ayran'
  | 'yoyo'
  | 'bubbles'
  | 'duck'
  | 'plane'
  | 'watergun'
  | 'teddy'
  | 'record'
  | 'fishbag'
  | 'budgie'
  | 'detergent'
  | 'sock';

export const SHOP_GLASSES: readonly ShopGlass[] = ['semmel', 'krapfen', 'pizzaslice', 'newspaper', 'gummies', 'pill', 'lozenge', 'bouquet', 'sunflower', 'tulips', 'book', 'doener', 'duerum', 'lahmacun', 'ayran', 'yoyo', 'bubbles', 'duck', 'plane', 'watergun', 'teddy', 'record', 'fishbag', 'budgie', 'detergent', 'sock'];

export type ToyId = 'yoyo' | 'seifenblasen' | 'quietscheente' | 'papierflieger' | 'wasserpistole' | 'teddy';

export type ShopItemId =
  | 'semmel'
  | 'krapfen'
  | 'nussschnecke'
  | 'pizzamargherita'
  | 'pizzasalami'
  | 'zeitung'
  | 'gummibaerchen'
  | 'kopfwehpille'
  | 'hustenbonbon'
  | 'rosenstrauss'
  | 'sonnenblume'
  | 'tulpen'
  | 'krimi'
  | 'roman'
  | 'kochbuch'
  | 'reisefuehrer'
  | 'comic'
  | 'zwickl'
  | 'spritz'
  | 'gintonic'
  | 'obstler'
  | 'negroni'
  | 'doener'
  | 'doenerscharf'
  | 'duerum'
  | 'lahmacun'
  | 'ayran'
  | ToyId
  | RecordId
  | PetItemId;

/** A little something it does to you (see features/shops). */
export type ShopTreat = 'spicy' | 'sober' | 'fresh' | 'read' | 'toy' | 'listen' | 'pet' | null;

/** The pet shop's and the laundromat's things (shared/ride.ts says what the budgie does). */
export type PetItemId = 'goldfisch' | 'wellensittich' | 'waschmittel' | 'socke';

export interface ShopItem extends Drink {
  id: ShopItemId;
  glass: ShopGlass | 'pint' | 'wine' | 'highball' | 'shot' | 'martini';
  /** A heading on the menu. */
  section: string;
  /** How long you hold it (seconds). */
  seconds: number;
  /** Eaten in bites rather than drunk. */
  bite: boolean;
  /** Seconds of the coffee's buzz it tops up. */
  caffeine: number;
  /** A wrapper's, a cover's or a sleeve's second color. */
  label: string;
  /** What the shopkeeper says as it's handed over. */
  says: string;
  treat: ShopTreat;
}

const food = (id: ShopItemId, section: string, name: string, emoji: string, blurb: string, glass: ShopGlass, color: string, label: string, says: string, more: Partial<ShopItem> = {}): ShopItem => ({
  id, section, name, emoji, blurb, glass, color, label, says, strength: 0, seconds: 22, bite: true, caffeine: 0, treat: null, ...more,
});
const drink = (id: ShopItemId, section: string, name: string, emoji: string, blurb: string, glass: ShopItem['glass'], color: string, strength: number, says: string): ShopItem => ({
  id, section, name, emoji, blurb, glass, color, label: '#ffffff', says, strength, seconds: 45, bite: false, caffeine: 0, treat: null,
});
const thing = (id: ShopItemId, section: string, name: string, emoji: string, blurb: string, glass: ShopGlass, color: string, label: string, says: string, treat: ShopTreat, seconds = 240): ShopItem => ({
  id, section, name, emoji, blurb, glass, color, label, says, strength: 0, seconds, bite: false, caffeine: 0, treat,
});

export const SHOP_ITEMS: readonly ShopItem[] = [
  // The bakery.
  food('semmel', 'Gebäck', 'Semmel', '🥖', 'A crusty Bavarian roll, still warm', 'semmel', '#d9a35b', '#f3d9a4', 'Frisch aus dem Ofen!', { strength: -0.08 }),
  food('krapfen', 'Gebäck', 'Krapfen', '🍩', 'Jam-filled, sugar on top, sticky fingers guaranteed', 'krapfen', '#d4893f', '#fffaf0', 'Mit Marmelade, wie sich’s gehört'),
  food('nussschnecke', 'Gebäck', 'Nussschnecke', '🌀', 'A swirl of hazelnut and icing', 'krapfen', '#b9773e', '#f5e6c8', 'Die letzte, extra für dich'),
  // The pizzeria.
  food('pizzamargherita', 'Pizza', 'Pizzastück Margherita', '🍕', 'Tomato, mozzarella, basil, folded the Roman way', 'pizzaslice', '#e9c46a', '#d62828', 'Mamma mia, che buona!', { seconds: 24 }),
  food('pizzasalami', 'Pizza', 'Pizzastück Salami', '🍕', 'With salami, a little oil running down your wrist', 'pizzaslice', '#e9c46a', '#9b2226', 'Attenzione, è caldo!', { seconds: 24 }),
  // The kiosk.
  thing('zeitung', 'Lesen', 'Zeitung', '📰', 'Today’s paper: weather, football, the crossword', 'newspaper', '#f1f1ee', '#222222', 'Die Neueste. Kreuzworträtsel ist schon halb gelöst', 'read', 120),
  food('gummibaerchen', 'Süßes', 'Gummibärchen', '🐻', 'A paper bag of gummy bears, the red ones first', 'gummies', '#ff595e', '#ffca3a', 'Die roten sind die besten'),
  // The pharmacy.
  food('kopfwehpille', 'Apotheke', 'Kopfwehtablette', '💊', 'For the morning after: clears your head a good deal quicker', 'pill', '#ffffff', '#2b9348', 'Mit viel Wasser, bitte. Gute Besserung!', { strength: -0.6, seconds: 6, treat: 'sober' }),
  food('hustenbonbon', 'Apotheke', 'Hustenbonbon', '🍬', 'Eucalyptus and menthol: breathe in, wow', 'lozenge', '#80ed99', '#ffffff', 'Für den Hals, und ein frischer Atem', { seconds: 14, treat: 'fresh' }),
  // The florist.
  thing('rosenstrauss', 'Sträuße', 'Rosenstrauß', '🌹', 'A dozen red roses in paper', 'bouquet', '#d62828', '#f1faee', 'Für jemand Besonderen?', null),
  thing('sonnenblume', 'Sträuße', 'Sonnenblume', '🌻', 'One big sunflower, as tall as your arm', 'sunflower', '#ffd166', '#386641', 'Bringt die Sonne mit', null),
  thing('tulpen', 'Sträuße', 'Tulpen', '🌷', 'A bunch of tulips, pink and yellow', 'tulips', '#ff8fab', '#ffd166', 'Frisch aus Holland', null),
  // The bookshop.
  thing('krimi', 'Bücher', 'Krimi: Tod am Regen', '🔪', 'A detective in a small Bavarian town, and a body in the river', 'book', '#3d405b', '#e07a5f', 'Nicht vor dem Einschlafen lesen!', 'read'),
  thing('roman', 'Bücher', 'Roman: Signal & Stille', '📖', 'A quiet novel about noise, love and a radio mast', 'book', '#81b29a', '#f4f1de', 'Mein Lieblingsbuch dieses Jahr', 'read'),
  thing('kochbuch', 'Bücher', 'Kochbuch: Omas Knödel', '🥟', 'Forty kinds of dumpling, and the gravy', 'book', '#f2cc8f', '#9b2226', 'Der Semmelknödel auf Seite 12 ist ein Gedicht', 'read'),
  thing('reisefuehrer', 'Bücher', 'Reiseführer: Bayerwald', '🗺️', 'Hikes, lakes, inns and where the lynx are', 'book', '#2a9d8f', '#ffd166', 'Gute Reise!', 'read'),
  thing('comic', 'Bücher', 'Comic: Die Büro-Katze', '🐈', 'A cat who runs an office of robots', 'book', '#ffbe0b', '#ff006e', 'Der ist lustig, versprochen', 'read'),
  // The bar.
  drink('zwickl', 'Bier', 'Zwickl vom Fass', '🍺', 'Cloudy, unfiltered, straight from the barrel', 'pint', '#d4a017', 0.26, 'Prost! Zum Wohl'),
  drink('spritz', 'Cocktails', 'Aperol Spritz', '🍹', 'Bitter orange, prosecco, a splash of soda', 'wine', '#ff7b00', 0.22, 'Salute!'),
  drink('gintonic', 'Cocktails', 'Gin Tonic', '🍸', 'Dry gin, tonic, cucumber and lots of ice', 'highball', '#e9f5f2', 0.3, 'Cheers, darling'),
  drink('negroni', 'Cocktails', 'Negroni', '🥃', 'Gin, vermouth and Campari, stirred, an orange peel', 'martini', '#b5121b', 0.38, 'Langsam trinken…'),
  drink('obstler', 'Schnaps', 'Obstler', '🥃', 'A clear fruit schnapps from the Bayerwald. Brrr', 'shot', '#f4f4f4', 0.5, 'Auf ex? Auf ex!'),
  // The döner shop.
  food('doener', 'Döner', 'Döner mit alles', '🥙', 'Bread, meat off the spit, salad, onions, garlic and herb sauce', 'doener', '#e9c46a', '#7cb518', 'Mit alles, ohne scharf. Guten Appetit, Bruder!', { strength: -0.15, seconds: 28 }),
  food('doenerscharf', 'Döner', 'Döner mit alles, scharf', '🌶️', 'All of it, and the chili flakes on top', 'doener', '#e9c46a', '#e63946', 'Mit alles und scharf! Respekt.', { strength: -0.15, seconds: 28, treat: 'spicy' }),
  food('duerum', 'Döner', 'Dürüm', '🌯', 'Rolled up in thin bread, easy to walk with', 'duerum', '#f1d3a1', '#7cb518', 'Gerollt, nicht gefaltet', { strength: -0.12, seconds: 26 }),
  food('lahmacun', 'Döner', 'Lahmacun', '🫓', 'Thin and crisp, spiced mince, lemon and parsley, rolled', 'lahmacun', '#c1440e', '#7cb518', 'Mit Zitrone, Chef', { strength: -0.1, seconds: 24 }),
  { ...drink('ayran', 'Getränke', 'Ayran', '🥛', 'Cold, salty, frothy yoghurt drink', 'ayran', '#fbfbf2', -0.08, 'Gegen die Schärfe'), label: '#d62828', seconds: 35 },
  // The toy shop.
  thing('yoyo', 'Spielzeug', 'Jo-Jo', '🪀', 'Wooden, red, with a long string. Click to play', 'yoyo', '#e63946', '#ffd166', 'Erst runter, dann wieder rauf!', 'toy'),
  thing('seifenblasen', 'Spielzeug', 'Seifenblasen', '🫧', 'A tube of soap and a wand. Click to blow bubbles', 'bubbles', '#8ecae6', '#ff006e', 'Pusten, nicht trinken!', 'toy'),
  thing('quietscheente', 'Spielzeug', 'Quietscheente', '🦆', 'Yellow, rubber, squeaks when squeezed. Click!', 'duck', '#ffd60a', '#fb8500', 'Quiiietsch!', 'toy'),
  thing('papierflieger', 'Spielzeug', 'Papierflieger', '✈️', 'Folded just right. Click to throw it: it glides', 'plane', '#f8f9fa', '#3a86ff', 'Gut zielen!', 'toy'),
  thing('wasserpistole', 'Spielzeug', 'Wasserpistole', '🔫', 'A little squirt gun. Click: a splash for whoever you hit', 'watergun', '#06d6a0', '#ff006e', 'Aber nur ein bisschen nass machen!', 'toy'),
  thing('teddy', 'Spielzeug', 'Teddybär', '🧸', 'Soft and brown, with a bow. Click to hug it', 'teddy', '#a0522d', '#e63946', 'Der hat dich gleich lieb', 'toy'),
  // The record shop: a sleeve under your arm.
  // The pet shop: a goldfish in a plastic bag of water, or a budgie that sits on your shoulder a while.
  thing('goldfisch', 'Tiere', 'Goldfisch im Beutel', '🐠', 'A goldfish called Günther, in a knotted bag of water. Sloshes', 'fishbag', '#f77f00', '#bde0fe', 'Nicht schütteln! Und daheim gleich ins Glas', 'pet', 300),
  thing('wellensittich', 'Tiere', 'Wellensittich', '🦜', 'A green budgie. It hops onto your shoulder and stays a while', 'budgie', '#80b918', '#ffd60a', 'Der heißt Pepe. Er mag dich!', 'pet', 300),
  // The laundromat.
  thing('waschmittel', 'Waschen', 'Waschpulver', '🧴', 'A little box of washing powder for one load', 'detergent', '#f72585', '#4cc9f0', 'Eine Ladung, nicht mehr reinkippen!', null, 180),
  thing('socke', 'Waschen', 'Einzelne Socke', '🧦', 'From the lost-and-found basket. Its twin is still out there somewhere', 'sock', '#ffbe0b', '#e63946', 'Die lag seit März im Trockner', null, 180),
  ...RECORDS.map((r) => thing(r.id, 'Platten', `${r.band}: ${r.title}`, '💿', `${r.genre}, ${r.year}`, 'record', r.sleeve, r.ink, 'Gute Wahl. Die B-Seite ist noch besser', 'listen')),
];

export const SHOP_ITEM_BY_ID = new Map<ShopItemId, ShopItem>(SHOP_ITEMS.map((d) => [d.id, d]));

export function isShopItem(v: unknown): v is ShopItemId {
  return typeof v === 'string' && SHOP_ITEM_BY_ID.has(v as ShopItemId);
}

/** Whether a glass is one of the shops' own shapes. */
export function isShopGlass(g: string): g is ShopGlass {
  return (SHOP_GLASSES as readonly string[]).includes(g);
}

export const TOYS: readonly ToyId[] = ['yoyo', 'seifenblasen', 'quietscheente', 'papierflieger', 'wasserpistole', 'teddy'];
export const isToy = (v: unknown): v is ToyId => typeof v === 'string' && (TOYS as readonly string[]).includes(v);

/**
 * What each shop has on its menu, by DrinkId: its own things, and the fridge's, the café's and the
 * beach kiosk's where they fit. The barber's and the tattoo studio's chairs are their menus; the record
 * shop sells from its crates.
 */
export const MENUS: Readonly<Record<ShopKindId, readonly DrinkId[]>> = {
  baeckerei: ['brezn', 'semmel', 'leberkas', 'krapfen', 'nussschnecke', 'kaesekuchen', 'strudel', 'cappuccino'],
  cafe: ['cappuccino', 'latte', 'espresso', 'chai', 'icedcoffee', 'schorle', 'kaesekuchen', 'bananenbrot'],
  pizza: ['pizzamargherita', 'pizzasalami', 'cola', 'limo', 'sprudel', 'radler'],
  apotheke: ['kopfwehpille', 'hustenbonbon', 'sprudel', 'iso'],
  blumen: ['rosenstrauss', 'sonnenblume', 'tulpen'],
  buchladen: ['krimi', 'roman', 'kochbuch', 'reisefuehrer', 'comic'],
  kiosk: ['zeitung', 'chocolate', 'gummibaerchen', 'crisps', 'eisamstiel', 'mate', 'spezi', 'cola'],
  bar: ['zwickl', 'spritz', 'gintonic', 'negroni', 'obstler', 'sprudel'],
  spaeti: ['mate', 'spezi', 'helles', 'radler', 'energy', 'cola', 'crisps', 'chocolate', 'gummibaerchen'],
  friseur: [],
  tattoo: [],
  doener: ['doener', 'doenerscharf', 'duerum', 'lahmacun', 'pommes', 'ayran', 'cola'],
  spielzeug: [...TOYS],
  platten: RECORDS.map((r) => r.id),
  fahrrad: [],
  zoo: ['goldfisch', 'wellensittich'],
  waschsalon: ['waschmittel', 'socke', 'cola', 'chocolate', 'crisps'],
};

// ---- Throwing toys about (features/shops/toys.ts) ------------------------------------------------

/** Using a toy you hold: where from and the way you're facing (yaw, and pitch up). */
export type ToyClientMsg = { t: 'toy.use'; toy: ToyId; x: number; y: number; z: number; yaw: number; pitch: number };
/** Someone on your floor used one: everyone there sees (and hears) it. */
export type ToyServerMsg = { t: 'toy.used'; id: string; toy: ToyId; x: number; y: number; z: number; yaw: number; pitch: number };

/** A toy.use as the office passes it on, if it's sound: a toy they hold, finite numbers, clamped. Null drops it. */
export function toyUse(msg: Partial<ToyClientMsg>, holding: string | undefined, id: string): ToyServerMsg | null {
  if (!isToy(msg.toy) || msg.toy !== holding) return null;
  const n = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : null);
  const x = n(msg.x, 2000);
  const y = n(msg.y, 500);
  const z = n(msg.z, 2000);
  const yaw = n(msg.yaw, 100);
  const pitch = n(msg.pitch, 1.6);
  if (x === null || y === null || z === null || yaw === null || pitch === null) return null;
  return { t: 'toy.used', id, toy: msg.toy, x, y, z, yaw, pitch };
}

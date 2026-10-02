// What the ice cream parlour, the sushi bar and the butcher's hand over (flrnoh fork, see FORK.md
// "Shops to walk into", food round 2): held like everything from the shops (shopwares.ts takes these
// into SHOP_ITEMS). Ice cream is what you pick: two or three scoops of six flavours, in a waffle cone
// or a cup, each such choice a thing of its own (its id names the scoops, so everyone sees your
// flavours). Only types come from shopwares.ts: it reads this file, not the other way round.

import type { ShopItem } from './shopwares.js';
import type { SushiPlate } from './shop-rooms-food.js';

export type FoodGlass = 'scoopcone' | 'scoopcup' | 'spaghettieis' | 'eiskaffee' | 'sushiplate' | 'greentea' | 'leberkaessemmel' | 'wienerpaar' | 'pflanzerl' | 'wurstsemmel';
export const FOOD_GLASSES: readonly FoodGlass[] = ['scoopcone', 'scoopcup', 'spaghettieis', 'eiskaffee', 'sushiplate', 'greentea', 'leberkaessemmel', 'wienerpaar', 'pflanzerl', 'wurstsemmel'];

/** The parlour's flavours: a letter each (in an ice cream's id), a name and a color. */
export const FLAVOURS = [
  { k: 'v', name: 'Vanille', color: '#fff3c4' },
  { k: 's', name: 'Schoko', color: '#6f4518' },
  { k: 'e', name: 'Erdbeer', color: '#ff8fab' },
  { k: 'p', name: 'Pistazie', color: '#a7c957' },
  { k: 'z', name: 'Zitrone', color: '#fff275' },
  { k: 'c', name: 'Stracciatella', color: '#f8f4ec' },
] as const;
export type FlavourKey = (typeof FLAVOURS)[number]['k'];

/** An ice cream you picked: `eis`, `w` (waffle cone) or `b` (cup), and its scoops' letters, sorted. */
export type IceId = `eis${'w' | 'b'}${string}`;
export type FoodItemId = IceId | 'spaghettieis' | 'eiskaffee' | SushiPlate | 'gruentee' | 'leberkaessemmel' | 'wienerwuerstl' | 'fleischpflanzerl' | 'wurstsemmel';

/** The id of `scoops` (2 or 3 flavour letters) in a cone or a cup. */
export function iceId(cone: boolean, scoops: readonly FlavourKey[]): IceId {
  return `eis${cone ? 'w' : 'b'}${[...scoops].sort().join('')}`;
}

/** The scoops' colors of an ice cream you picked, bottom first; null if it isn't one. */
export function iceScoops(id: string): string[] | null {
  const m = /^eis([wb])([vsepzc]{2,3})$/.exec(id);
  if (!m) return null;
  return [...m[2]].map((k) => FLAVOURS.find((f) => f.k === k)!.color);
}

const base = { strength: 0, caffeine: 0, label: '#ffffff', treat: null } as const;

/** Every 2- and 3-scoop choice (sorted, repeats allowed), in a cone and in a cup. */
function ices(): ShopItem[] {
  const out: ShopItem[] = [];
  const keys = FLAVOURS.map((f) => f.k);
  const combos: FlavourKey[][] = [];
  keys.forEach((a, i) => keys.slice(i).forEach((b, j) => {
    combos.push([a, b]);
    keys.slice(i + j).forEach((c) => combos.push([a, b, c]));
  }));
  for (const cone of [true, false])
    for (const sc of combos) {
      const names = sc.map((k) => FLAVOURS.find((f) => f.k === k)!.name).join(', ');
      out.push({
        ...base,
        id: iceId(cone, sc),
        section: 'Eis',
        name: `${sc.length} Kugeln im ${cone ? 'Hörnchen' : 'Becher'}`,
        emoji: cone ? '🍦' : '🍨',
        blurb: names,
        glass: cone ? 'scoopcone' : 'scoopcup',
        color: FLAVOURS.find((f) => f.k === sc[0])!.color,
        label: cone ? '#d4a373' : '#f07167',
        seconds: sc.length === 3 ? 28 : 22,
        bite: true,
        says: sc.length === 3 ? 'Drei Kugeln, bella! Schnell, es tropft!' : 'Ecco! Buon appetito!',
        treat: 'brainfreeze',
      });
    }
  return out;
}

const it = (id: FoodItemId, section: string, name: string, emoji: string, blurb: string, glass: FoodGlass, color: string, label: string, says: string, more: Partial<ShopItem> = {}): ShopItem => ({
  ...base, id, section, name, emoji, blurb, glass, color, label, says, seconds: 24, bite: true, ...more,
});

/** The sushi on the belt, by plate. */
const SUSHI: Record<SushiPlate, [string, string, string, string]> = {
  sushilachs: ['Lachs-Nigiri', '🍣', 'Two slices of salmon on rice, a dab of wasabi', '#f4845f'],
  sushithun: ['Thunfisch-Nigiri', '🍣', 'Deep red tuna on rice, with more wasabi than you think', '#c1121f'],
  sushimaki: ['Gurken-Maki', '🥒', 'Six little rolls of cucumber in nori', '#2d6a4f'],
  sushiebi: ['Ebi-Nigiri', '🍤', 'A butterflied prawn on rice', '#ffb4a2'],
  sushitamago: ['Tamago', '🍳', 'Sweet rolled omelette tied on with nori', '#ffd166'],
  sushiinari: ['Inari', '🫘', 'Rice in a sweet fried tofu pocket', '#bc6c25'],
};
/** Each plate's color (its rim), the way kaiten plates tell what's on them. */
export const PLATE_RIMS: Record<SushiPlate, string> = { sushilachs: '#e63946', sushithun: '#1d3557', sushimaki: '#2a9d8f', sushiebi: '#f4a261', sushitamago: '#ffd60a', sushiinari: '#8d99ae' };

export const FOOD_ITEMS: readonly ShopItem[] = [
  ...ices(),
  it('spaghettieis', 'Spezialitäten', 'Spaghettieis', '🍝', 'Vanilla pressed into spaghetti, strawberry sauce, white chocolate for the parmesan', 'spaghettieis', '#fff3c4', '#e63946', 'Spaghetti alla Venezia!', { seconds: 30, treat: 'brainfreeze' }),
  it('eiskaffee', 'Spezialitäten', 'Eiskaffee', '🧋', 'Cold coffee over vanilla ice, cream on top, a long spoon', 'eiskaffee', '#8a5a44', '#fffaf0', 'Mit Sahne, natürlich', { seconds: 35, bite: false, caffeine: 60, treat: 'brainfreeze' }),
  ...(Object.entries(SUSHI) as [SushiPlate, [string, string, string, string]][]).map(([id, [name, emoji, blurb, color]]) =>
    it(id, 'Vom Band', name, emoji, blurb, 'sushiplate', color, PLATE_RIMS[id], 'Itadakimasu!', { seconds: 20, treat: id === 'sushithun' ? 'spicy' : null }),
  ),
  it('gruentee', 'Getränke', 'Grüner Tee', '🍵', 'Hot sencha in a little cup without a handle', 'greentea', '#a7c957', '#dad7cd', 'Vorsicht, heiß', { seconds: 40, bite: false, caffeine: 25 }),
  it('leberkaessemmel', 'Brotzeit', 'Leberkässemmel', '🥪', 'A thick warm slice of Leberkäs in a Semmel, sweet or hot mustard', 'leberkaessemmel', '#d08c60', '#e9c46a', 'Mit süßem Senf, gell?', { strength: -0.15, seconds: 26 }),
  it('wienerwuerstl', 'Brotzeit', 'Paar Wiener', '🌭', 'A pair of Wiener on a paper plate, mustard and a roll', 'wienerpaar', '#c9733f', '#ffd166', 'A Paar Wiener, bitteschön', { strength: -0.12, seconds: 24 }),
  it('fleischpflanzerl', 'Brotzeit', 'Fleischpflanzerl', '🍔', 'A Bavarian meatball, flat and crisp, in a Semmel', 'pflanzerl', '#7f4f24', '#d9a35b', 'Wie bei der Oma', { strength: -0.15, seconds: 26 }),
  it('wurstsemmel', 'Brotzeit', 'Wurstsemmel', '🥖', 'Gelbwurst in a Semmel, for the kids, and for you', 'wurstsemmel', '#f6d6c8', '#d9a35b', 'A Radl Wurscht dazu?', { strength: -0.1, seconds: 22 }),
];

/** What the butcher's and the parlour's counters offer (the cone and cup are picked in their own window). */
export const FOOD_MENUS = {
  eisdiele: ['spaghettieis', 'eiskaffee', 'espresso'],
  sushi: ['sushilachs', 'sushithun', 'sushimaki', 'sushiebi', 'sushitamago', 'sushiinari', 'gruentee'],
  metzgerei: ['leberkaessemmel', 'wienerwuerstl', 'fleischpflanzerl', 'wurstsemmel', 'spezi'],
  supermarkt: [],
} as const;

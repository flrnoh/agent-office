// flrnoh fork (see FORK.md "Shops to walk into", food round 2): the supermarket's shopping trolley.
// You take one at the trolley bay by its door and push it in front of you (everyone on your floor sees
// it, and what's in it), anywhere down on the street; E at a shelf puts something from it in, E at the
// checkout rings it all up (beep, beep, a receipt: everything's on the house), E with nothing to use
// lets go of it. The office only keeps who pushes one and what's in it, per floor, in memory.

/** What's on the supermarket's shelves: how it looks in the trolley, and what it costs on the receipt. */
export interface MarketGood {
  id: string;
  name: string;
  emoji: string;
  /** Its color, and its shape in the trolley. */
  color: string;
  shape: 'box' | 'bottle' | 'can' | 'bag' | 'round' | 'tray';
  /** On the receipt, in cents (nobody pays: it's on the house). */
  cents: number;
}

const g = (id: string, name: string, emoji: string, color: string, shape: MarketGood['shape'], cents: number): MarketGood => ({ id, name, emoji, color, shape, cents });

export const MARKET_GOODS: readonly MarketGood[] = [
  g('aepfel', 'Äpfel 1 kg', '🍎', '#d62828', 'round', 249),
  g('bananen', 'Bananen', '🍌', '#ffd60a', 'round', 179),
  g('tomaten', 'Tomaten', '🍅', '#e63946', 'round', 199),
  g('salat', 'Kopfsalat', '🥬', '#6a994e', 'round', 99),
  g('milch', 'Vollmilch 1 l', '🥛', '#f8f9fa', 'box', 119),
  g('joghurt', 'Joghurt', '🥣', '#ffafcc', 'tray', 59),
  g('kaese', 'Bergkäse', '🧀', '#ffd166', 'tray', 329),
  g('butter', 'Butter', '🧈', '#fff3b0', 'box', 239),
  g('nudeln', 'Spaghetti', '🍝', '#f4a261', 'box', 129),
  g('reis', 'Reis', '🍚', '#ffffff', 'bag', 189),
  g('tomatensosse', 'Tomatensoße', '🥫', '#c1121f', 'can', 149),
  g('chips', 'Chips Paprika', '🥔', '#f77f00', 'bag', 199),
  g('schokolade', 'Schokolade', '🍫', '#6f1d1b', 'box', 119),
  g('gummibaeren', 'Gummibären', '🐻', '#ff595e', 'bag', 99),
  g('wasser', 'Mineralwasser', '💧', '#8ecae6', 'bottle', 59),
  g('apfelschorle', 'Apfelschorle', '🧃', '#e9c46a', 'bottle', 89),
  g('bier', 'Helles, Kasten', '🍺', '#d4a017', 'box', 1699),
  g('kaffee', 'Kaffee gemahlen', '☕', '#6f4e37', 'bag', 599),
  g('muesli', 'Müsli', '🥣', '#e9c46a', 'box', 279),
  g('brot', 'Bauernbrot', '🍞', '#b9773e', 'round', 299),
  g('klopapier', 'Klopapier, 8 Rollen', '🧻', '#ffffff', 'bag', 389),
  g('spuelmittel', 'Spülmittel', '🧴', '#06d6a0', 'bottle', 129),
];

export const MARKET_GOOD_BY_ID = new Map(MARKET_GOODS.map((m) => [m.id, m]));

/** The supermarket's aisles: what each shelf (a station's `n`) holds. */
export interface MarketAisle {
  name: string;
  emoji: string;
  goods: readonly string[];
}

export const MARKET_AISLES: readonly MarketAisle[] = [
  { name: 'Obst & Gemüse', emoji: '🍎', goods: ['aepfel', 'bananen', 'tomaten', 'salat'] },
  { name: 'Kühlregal', emoji: '🧊', goods: ['milch', 'joghurt', 'kaese', 'butter'] },
  { name: 'Nudeln & Konserven', emoji: '🍝', goods: ['nudeln', 'reis', 'tomatensosse'] },
  { name: 'Süßes & Knabbern', emoji: '🍫', goods: ['chips', 'schokolade', 'gummibaeren'] },
  { name: 'Getränke', emoji: '🥤', goods: ['wasser', 'apfelschorle', 'bier'] },
  { name: 'Frühstück', emoji: '☕', goods: ['kaffee', 'muesli', 'brot'] },
  { name: 'Haushalt', emoji: '🧻', goods: ['klopapier', 'spuelmittel'] },
];
/** The aisle by the door (fruit and veg) and the fridges along the wall; the shelves go round the rest. */
export const AISLE_VEG = 0;
export const AISLE_FRIDGE = 1;

/** How much fits in a trolley. */
export const TROLLEY_MAX = 14;

/** The next thing you take from aisle `n`, the `k`-th time you take from it: round its goods. */
export function aisleGood(n: number, k: number): MarketGood {
  const a = MARKET_AISLES[((n % MARKET_AISLES.length) + MARKET_AISLES.length) % MARKET_AISLES.length];
  return MARKET_GOOD_BY_ID.get(a.goods[((k % a.goods.length) + a.goods.length) % a.goods.length])!;
}

/** A trolley's contents as the office keeps them: known goods only, at most TROLLEY_MAX; null (none) for anything else. */
export function trolleyItems(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((id): id is string => typeof id === 'string' && MARKET_GOOD_BY_ID.has(id)).slice(0, TROLLEY_MAX);
}

/** The receipt for what's in a trolley: a line per kind of thing (how many, what it comes to) and the sum. */
export function receipt(items: readonly string[]): { lines: { good: MarketGood; n: number; cents: number }[]; cents: number } {
  const count = new Map<string, number>();
  for (const id of items) if (MARKET_GOOD_BY_ID.has(id)) count.set(id, (count.get(id) ?? 0) + 1);
  const lines = [...count].map(([id, n]) => {
    const good = MARKET_GOOD_BY_ID.get(id)!;
    return { good, n, cents: good.cents * n };
  });
  return { lines, cents: lines.reduce((a, l) => a + l.cents, 0) };
}

/** Cents as euros, German style: 12,34 €. */
export const euros = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')} €`;

/** Taking a trolley (an empty list), what's in it now, or letting go of it (null). */
export type TrolleyClientMsg = { t: 'trolley.set'; items: string[] | null };
/** Someone on your floor took a trolley, put something in, rang it up or let go of it (null). */
export type TrolleyServerMsg = { t: 'trolley'; id: string; items: string[] | null };

/** Who pushes a trolley on each floor, and what's in it (in memory: nobody's pushing one after a restart). */
export class Trolleys {
  private floors = new Map<string, Map<string, string[]>>();

  /** Sets (or with null, drops) `id`'s trolley on `floor`; the message to pass on, or null when nothing changed. */
  set(floor: string, id: string, raw: unknown): TrolleyServerMsg | null {
    const items = raw === null ? null : trolleyItems(raw);
    const here = this.floors.get(floor) ?? new Map<string, string[]>();
    if (items === null) {
      if (!here.delete(id)) return null;
    } else here.set(id, items);
    if (here.size) this.floors.set(floor, here);
    else this.floors.delete(floor);
    return { t: 'trolley', id, items };
  }

  /** `id` let go of theirs on `floor` (left it, or the office): the message for those still there, if they had one. */
  leave(floor: string | undefined, id: string): TrolleyServerMsg | null {
    return floor ? this.set(floor, id, null) : null;
  }

  /** Every trolley on `floor`, by who pushes it. */
  view(floor: string | undefined): Record<string, string[]> {
    return Object.fromEntries(floor ? (this.floors.get(floor) ?? []) : []);
  }
}

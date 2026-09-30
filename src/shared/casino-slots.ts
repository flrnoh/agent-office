// The casino's slot machines (flrnoh fork, see shared/casino.ts): three reels, one payline. Each
// reel is a strip of REEL_STOPS symbols, some more often than others; a spin stops each reel on a
// stop the server draws. The paytable pays back about 95% of what goes in (PAYBACK, worked out
// exactly over every combination of stops in tests/casino-slots.test.ts).

export type SlotSymbol = 'cherry' | 'lemon' | 'bell' | 'star' | 'seven' | 'diamond';

export const SLOT_SYMBOLS: readonly { id: SlotSymbol; emoji: string; name: string; weight: number }[] = [
  { id: 'cherry', emoji: '🍒', name: 'Cherry', weight: 7 },
  { id: 'lemon', emoji: '🍋', name: 'Lemon', weight: 9 },
  { id: 'bell', emoji: '🔔', name: 'Bell', weight: 7 },
  { id: 'star', emoji: '⭐', name: 'Star', weight: 4 },
  { id: 'seven', emoji: '7️⃣', name: 'Seven', weight: 3 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 2 },
];
export const SLOT_EMOJI: Record<SlotSymbol, string> = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.id, s.emoji])) as Record<SlotSymbol, string>;

/** What you can stake on a spin. */
export const SLOT_BETS = [1, 5, 10, 25] as const;
export type SlotBet = (typeof SLOT_BETS)[number];
export const isSlotBet = (v: unknown): v is SlotBet => SLOT_BETS.includes(v as SlotBet);

/** How long the reels turn (ms): the machine's busy until they've stopped, and the window lands on the result then. */
export const SPIN_MS = 1600;

/**
 * Spreads each symbol's weight along a strip, so the same symbols don't bunch up: the i-th copy of
 * a symbol with weight w lands near (i + 0.5) / w of the way along, offset per reel.
 */
function strip(offset: number): SlotSymbol[] {
  const at: { s: SlotSymbol; pos: number }[] = [];
  SLOT_SYMBOLS.forEach((sym, k) => {
    for (let i = 0; i < sym.weight; i++) at.push({ s: sym.id, pos: ((i + 0.5) / sym.weight + (k * 0.137 + offset)) % 1 });
  });
  return at.sort((a, b) => a.pos - b.pos).map((a) => a.s);
}

/** The three reels' strips: the same symbols, in a different order on each. */
export const REELS: readonly (readonly SlotSymbol[])[] = [strip(0), strip(0.31), strip(0.67)];
export const REEL_STOPS = REELS[0].length;

/** A winning line, what it pays (times the stake, the stake included), and how the paytable says it. */
export interface SlotLine {
  label: string;
  pays: number;
}

/** Three of a kind pays this many times the stake. */
export const THREE_OF_A_KIND: Record<SlotSymbol, number> = { diamond: 200, seven: 100, star: 30, bell: 15, cherry: 10, lemon: 8 };
/** Cherries on the first two reels (not three), and a cherry on the first reel only. */
export const TWO_CHERRIES = 4;
export const ONE_CHERRY = 1;

/** The paytable as the machine shows it, best first. */
export const PAYTABLE: readonly { symbols: string; pays: number }[] = [
  ...(Object.entries(THREE_OF_A_KIND) as [SlotSymbol, number][]).sort((a, b) => b[1] - a[1]).map(([s, pays]) => ({ symbols: SLOT_EMOJI[s].repeat(3), pays })),
  { symbols: '🍒🍒 ·', pays: TWO_CHERRIES },
  { symbols: '🍒 · ·', pays: ONE_CHERRY },
];

/** What the line pays (times the stake, the stake included): 0 for nothing. */
export function slotPays(line: readonly SlotSymbol[]): number {
  const [a, b, c] = line;
  if (a === b && b === c) return THREE_OF_A_KIND[a];
  if (a === 'cherry' && b === 'cherry') return TWO_CHERRIES;
  if (a === 'cherry') return ONE_CHERRY;
  return 0;
}

/** The symbols on the payline for three stops (each 0..REEL_STOPS-1). */
export function slotLine(stops: readonly number[]): SlotSymbol[] {
  return REELS.map((reel, i) => reel[((stops[i] % REEL_STOPS) + REEL_STOPS) % REEL_STOPS]);
}

/** A slot machine as everyone in the casino sees it (a `casino.table` state). */
export interface SlotsView {
  kind: 'slots';
  /** Where each reel stands (or is stopping): stops, 0..REEL_STOPS-1. */
  stops: number[];
  /** Counts up with every spin, so a page can tell a new one from the same one again. */
  spin: number;
  /** Turning right now (until `until`, on the office's clock). */
  spinning: boolean;
  until?: number;
  /** Who's playing it, if anyone. */
  player?: string;
  /** The last spin's stake and what it paid out (0 for nothing). */
  bet?: number;
  won?: number;
}

/** What a spin's `casino.result` carries for the window to land on. */
export interface SlotsResult {
  stops: number[];
  spin: number;
  bet: number;
  won: number;
}

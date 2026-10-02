import { SKY_DAY_MS, skyTime } from './sun.js';

// flrnoh fork (see FORK.md "Shops to walk into", "Shop fronts"): how each kind of shop looks from the
// street and when it's open, as a table keyed by the kind's id. A kind that isn't in it (a new one, say)
// gets DEFAULT_FRONT, so it looks decent right away and can add its own row later. The same for the page
// that draws the fronts (client/world/town/shopfronts.ts), the passers-by who only go into open shops
// (shared/passersby.ts) and the tests. What stands outside each shop is laid out in shop-outside.ts.

/** What the ground floor's front is clad in, round the windows: tinted by `facadeColor`. */
export type Facade = 'plaster' | 'wood' | 'tiles' | 'dark' | 'colorful' | 'brick';
/** The sign over the door: a painted board, a lit box, or neon letters that glow (and some flicker). */
export type SignStyle = 'board' | 'lightbox' | 'neon';
/** What stands outside by day (while it's open): see shop-outside.ts for their sizes. */
export type OutsideKind = 'tables' | 'crates' | 'flowers' | 'papers' | 'board' | 'bikes' | 'gumball';

export interface FrontStyle {
  facade: Facade;
  facadeColor: string;
  sign: SignStyle;
  /** Neon only: whether its letters flicker now and then. */
  flicker?: boolean;
  /** Office hours on the office's clock (see skyHour): open from `open` until `close` (past 24 is after midnight). */
  open: number;
  close: number;
  /** A roller shutter comes down over the windows and the door while it's shut. */
  shutter: boolean;
  /** What's put out in front by day, in this order, as far as the room in front of the shop goes. */
  outside: OutsideKind[];
  /** A sandwich board's chalk lines. */
  chalk?: [string, string];
}

/** A kind without a row of its own: plaster in its frame's color, a painted board, open 8 to 20. */
export const DEFAULT_FRONT: FrontStyle = { facade: 'plaster', facadeColor: '#d8cfc4', sign: 'board', open: 8, close: 20, shutter: true, outside: ['bikes'] };

/**
 * Each kind's front, by its id. Keyed by plain strings so a kind still to come can have its row here
 * before it exists (the Eisdiele has one waiting: tables out front and a board).
 */
export const FRONT_STYLES: Readonly<Record<string, FrontStyle>> = {
  baeckerei: { facade: 'wood', facadeColor: '#8b5a2b', sign: 'board', open: 6, close: 20, shutter: true, outside: ['board', 'bikes'], chalk: ['Frische Brezn', 'Kaffee to go 1,90'] },
  cafe: { facade: 'wood', facadeColor: '#2f4f4f', sign: 'lightbox', open: 7, close: 22, shutter: true, outside: ['tables', 'board', 'tables'], chalk: ['Cappuccino 2,90', 'Kuchen vom Blech'] },
  pizza: { facade: 'brick', facadeColor: '#b04a3a', sign: 'lightbox', open: 11, close: 23, shutter: true, outside: ['board', 'bikes'], chalk: ['Mittagstisch', 'Pizza ab 6,50'] },
  apotheke: { facade: 'tiles', facadeColor: '#f4f7f6', sign: 'lightbox', open: 8, close: 20, shutter: true, outside: ['gumball'] },
  blumen: { facade: 'wood', facadeColor: '#4f7a4a', sign: 'board', open: 8, close: 20, shutter: true, outside: ['flowers', 'flowers', 'flowers'] },
  buchladen: { facade: 'wood', facadeColor: '#3d405b', sign: 'board', open: 9, close: 20, shutter: true, outside: ['bikes'] },
  kiosk: { facade: 'plaster', facadeColor: '#2a5d6b', sign: 'lightbox', open: 6, close: 26, shutter: true, outside: ['papers', 'crates', 'gumball'] },
  bar: { facade: 'dark', facadeColor: '#2a2230', sign: 'neon', flicker: false, open: 12, close: 28, shutter: true, outside: ['bikes'] },
  spaeti: { facade: 'tiles', facadeColor: '#33415c', sign: 'lightbox', open: 0, close: 24, shutter: false, outside: ['crates', 'crates', 'gumball', 'bikes'] },
  friseur: { facade: 'tiles', facadeColor: '#f1d7d0', sign: 'lightbox', open: 9, close: 19, shutter: true, outside: [] },
  tattoo: { facade: 'dark', facadeColor: '#1c1c1c', sign: 'neon', flicker: true, open: 12, close: 24, shutter: true, outside: ['bikes'] },
  doener: { facade: 'dark', facadeColor: '#3a1517', sign: 'neon', flicker: true, open: 10, close: 27, shutter: true, outside: ['tables', 'board'], chalk: ['Döner 6,50', 'mit alles & scharf'] },
  spielzeug: { facade: 'colorful', facadeColor: '#ffffff', sign: 'board', open: 9, close: 19, shutter: true, outside: ['gumball', 'bikes'] },
  platten: { facade: 'brick', facadeColor: '#4a4e69', sign: 'neon', flicker: false, open: 11, close: 20, shutter: true, outside: ['crates', 'board'], chalk: ['Vinyl ab 5 €', 'Neu: Krautrock'] },
  eisdiele: { facade: 'tiles', facadeColor: '#fde2e4', sign: 'lightbox', open: 11, close: 22, shutter: true, outside: ['tables', 'board', 'tables'], chalk: ['Eis 1,80 die Kugel', 'Spaghetti-Eis'] },
};

/** How a kind's front looks: its own row, or the default. */
export function frontStyle(kind: string): FrontStyle {
  return FRONT_STYLES[kind] ?? DEFAULT_FRONT;
}

/** The hour of the day (0–24) on the office's clock at `ms`: the sky's, a whole day every hour (shared/sun.ts). */
export function skyHour(ms: number, utcOffset: number): number {
  const local = skyTime(ms, utcOffset) + utcOffset * 60_000;
  const day = SKY_DAY_MS * 24;
  return ((((local % day) + day) % day) / day) * 24;
}

/** Whether a kind of shop is open at `hour` (0–24). */
export function shopOpen(kind: string, hour: number): boolean {
  const s = frontStyle(kind);
  if (s.close - s.open >= 24) return true;
  const h = ((hour % 24) + 24) % 24;
  return (h >= s.open && h < s.close) || (h + 24 >= s.open && h + 24 < s.close);
}

/** "7:00": when a kind opens, for the hint at its locked door. */
export function opensAt(kind: string): string {
  return `${frontStyle(kind).open % 24}:00`;
}

const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x27d4eb2f, 0x85ebca6b) ^ Math.imul(b | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};
const idHash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/**
 * How bright a neon sign is at `t` (seconds on the office's clock), 0–1: steady, but a flickering one
 * now and then stutters for a second or so. Only from the clock, so everyone sees the same flicker.
 */
export function neonLevel(kind: string, shop: number, t: number): number {
  if (!frontStyle(kind).flicker) return 1;
  const seed = idHash(kind) + shop * 7919;
  const span = 6;
  const n = Math.floor(t / span);
  if (hash(seed, n) > 0.4) return 1;
  // A stutter somewhere in this span, lasting 0.6 to 1.6 seconds.
  const at = hash(seed, n + 1e6) * (span - 1.6);
  const into = t - n * span - at;
  if (into < 0 || into > 0.6 + hash(seed, n + 2e6)) return 1;
  const tick = Math.floor(t * 14);
  return hash(seed, tick) < 0.5 ? 0.12 : 1;
}

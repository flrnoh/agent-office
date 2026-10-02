import { PARK_TREES, STREETS, stretchRect } from './city.js';
import { ROAD } from './layout.js';
import { STREET_END } from './scenic.js';
import { FURNITURE } from './streetside.js';
import { SHOPS, type ShopKindId } from './shops.js';
import { density } from './passersby.js';
import { skyHour } from './shopfronts.js';

// flrnoh fork (see FORK.md, "Sounds of the city"): the pure part of the city's soundscape, which
// sound/city.ts plays: how loud the road, the people and the rain on the awnings are where you stand,
// and when the church's bells strike and a siren goes by. The bells and the sirens run on the office's
// clock, so everyone hears them at the same moment.

/** A street's asphalt, as a box (the city's stretches, and the office's own street). */
interface Strip {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const ROADS: Strip[] = [...STREETS.map(stretchRect), { minX: -STREET_END, maxX: STREET_END, minZ: ROAD.minZ, maxZ: ROAD.maxZ }];

/** How far (x, z) is from the nearest asphalt, in metres (0 on it). */
export function streetDistance(x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) {
    const dx = Math.max(r.minX - x, 0, x - r.maxX);
    const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Past this far (counting height) from a street the road is gone altogether. */
export const ROAD_GONE = 90;
/** Behind glass the city is this much quieter (and muffled, see sound/city.ts). */
export const INSIDE = 0.3;

/** Where you hear the city from, and what's round you. */
export interface Ear {
  x: number;
  z: number;
  /** How far above the street your ears are. */
  up: number;
  /** Behind glass: in the office, in a shop, in the cinema. */
  inside: boolean;
}

/** 0 far off, 1 right there: an inverse-square fall with distance `d`, `half` the distance at which it's half. */
const near = (d: number, half: number) => 1 / (1 + (d / half) ** 2);
/** 1 up to `from`, easing to 0 at `to`. */
const fade = (d: number, from: number, to: number) => (d <= from ? 1 : d >= to ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (d - from)) / (to - from)));

/**
 * How loud the road is where you are, 0–1: the street's rumble, louder the closer you are to one and
 * the more cars there are about (`cars`: where the city's cars are), fainter up on a floor or the roof,
 * quieter and muffled behind glass, and nothing at all far from any street.
 */
export function roadLevel(ear: Ear, cars: readonly { x: number; z: number }[]): number {
  const flat = streetDistance(ear.x, ear.z);
  const d = Math.hypot(flat, Math.max(0, ear.up - 1.6) * 0.9);
  if (d >= ROAD_GONE) return 0;
  let busy = 0;
  for (const c of cars) busy += near(Math.hypot(c.x - ear.x, c.z - ear.z, ear.up), 35);
  // Even an empty street hums a little (the city further off); each car close by adds to it.
  const traffic = 0.35 + 0.65 * Math.min(1, busy / 2.5);
  return Math.min(1, near(d, 10) * traffic * fade(d, ROAD_GONE * 0.5, ROAD_GONE) * (ear.inside ? INSIDE : 1));
}

/** The shops' doors, and which kind each is. */
const DOORS = SHOPS.map((s) => ({ x: s.ox + s.ux * s.doorU, z: s.oz + s.uz * s.doorU, kind: s.kind }));

/** The nearest shop door to (x, z) (of `kinds`, if given), and how far it is. */
export function nearestDoor(x: number, z: number, kinds?: readonly ShopKindId[]): { x: number; z: number; kind: ShopKindId; d: number } | null {
  let best: (typeof DOORS)[number] | null = null;
  let bestD = Infinity;
  for (const door of DOORS) {
    if (kinds && !kinds.includes(door.kind)) continue;
    const d = Math.hypot(door.x - x, door.z - z);
    if (d < bestD) {
      bestD = d;
      best = door;
    }
  }
  return best && { ...best, d: bestD };
}

/**
 * How loud the people about the shops are, 0–1: by day, near a street of shops (the busier the
 * sidewalks, see shared/passersby.ts), and not in the rain.
 */
export function murmurLevel(ear: Ear, day: number, rain: number): number {
  const door = nearestDoor(ear.x, ear.z);
  if (!door) return 0;
  const d = Math.hypot(door.d, ear.up);
  if (d > 70) return 0;
  const busy = (density(day) - 0.28) / 0.66;
  return Math.max(0, busy * near(d, 16) * fade(d, 35, 70) * (1 - Math.min(1, rain * 1.4)) * (ear.inside ? INSIDE * 0.5 : 1));
}

/** How loud the rain is on the shops' awnings, 0–1: near one, while it rains, and only outside. */
export function awningLevel(ear: Ear, rain: number): number {
  if (rain < 0.02 || ear.inside) return 0;
  const door = nearestDoor(ear.x, ear.z);
  if (!door) return 0;
  const d = Math.hypot(door.d, ear.up);
  return Math.min(1, rain ** 0.7 * near(d, 7) * fade(d, 15, 30));
}

/** The trees birds sing in and crickets chirp under: the parks' and the streets'. */
export const TREES: readonly { x: number; z: number }[] = [...PARK_TREES, ...FURNITURE.filter((f) => f.kind === 'tree')];

/** The trees within `r` of (x, z). */
export function treesNear(x: number, z: number, r: number): { x: number; z: number }[] {
  return TREES.filter((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r);
}

/** Warm enough for crickets: over 14 °C by the forecast, or, without one, May to September. */
export function summerish(temp: number | undefined, ms: number): boolean {
  if (temp !== undefined) return temp >= 14;
  const month = new Date(ms).getUTCMonth();
  return month >= 4 && month <= 8;
}

// ---- The church's bells -------------------------------------------------------------------------

/**
 * The hours the bells ring: morning, noon and evening. The office's day goes by in an hour, so ringing
 * every hour would be every two and a half minutes; three times a day is about every twenty.
 */
export const BELL_HOURS: readonly number[] = [8, 12, 18];

/** How many times the bell strikes at `hour` (0–23): the hour on a twelve-hour clock at BELL_HOURS, else 0. */
export function bellStrikes(hour: number): number {
  const h = Math.floor(hour) % 24;
  if (!BELL_HOURS.includes(h)) return 0;
  return h % 12 || 12;
}

/**
 * Whether a full hour of the office's sky (shared/sun.ts: a whole day an hour) began between
 * `prev` and `now` (Unix ms): how many strikes, or 0. A jump of more than `maxGap` ms (the tab was
 * hidden, the page just opened) rings nothing, so the bells never strike late.
 */
export function bellDue(prev: number, now: number, utcOffset: number, maxGap = 10_000): number {
  if (now <= prev || now - prev > maxGap) return 0;
  const a = skyHour(prev, utcOffset);
  const b = skyHour(now, utcOffset);
  // Past midnight the hour wraps round to 0.
  const crossed = Math.floor(b) !== Math.floor(a);
  return crossed ? bellStrikes(b) : 0;
}

// ---- Sirens, far off ----------------------------------------------------------------------------

/** On average a siren every this many ms of the office's clock, give or take SIREN_JITTER. */
export const SIREN_EVERY = 15 * 60_000;
export const SIREN_JITTER = 2.5 * 60_000;

/** A hash of `n` to 0–1, the same everywhere. */
function hash01(n: number, salt: number): number {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The `n`th siren on the office's clock: when (Unix ms), and where it goes by (a bearing, how far off, which way round). */
export function siren(n: number): { n: number; at: number; bearing: number; dist: number; turn: 1 | -1 } {
  return {
    n,
    at: n * SIREN_EVERY + (hash01(n, 1) * 2 - 1) * SIREN_JITTER,
    bearing: hash01(n, 2) * Math.PI * 2,
    dist: 220 + hash01(n, 3) * 160,
    turn: hash01(n, 4) < 0.5 ? 1 : -1,
  };
}

/** The siren that starts between `prev` and `now` (Unix ms of the office's clock), if one does and the jump's small. */
export function sirenDue(prev: number, now: number, maxGap = 10_000): ReturnType<typeof siren> | null {
  if (now <= prev || now - prev > maxGap) return null;
  const n = Math.round(now / SIREN_EVERY);
  for (const k of [n - 1, n, n + 1]) {
    const s = siren(k);
    if (s.at > prev && s.at <= now) return s;
  }
  return null;
}

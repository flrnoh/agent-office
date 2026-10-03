import type { PoolDef } from './swim.js';
import type { TFixture } from './therme.js';
import { PARADIES_POOLS } from './therme-paradies.js';
import { DORF_POOLS, KNEIPP_FLOOR } from './therme-dorf.js';
import { WAVE_POOL } from './therme-waves.js';
import { LANDING_POOL } from './therme-slides.js';
import { LAGUNE_POOLS } from './therme-lagune.js';

const POOLS: readonly PoolDef[] = [...PARADIES_POOLS, WAVE_POOL, LANDING_POOL, ...DORF_POOLS, ...LAGUNE_POOLS];

/*
 * Every pool in the thermal baths, as the signs by it and the hint bar in it name it (flrnoh fork,
 * see FORK.md "The thermal baths"): what it's called, how warm, how deep, what's special about it,
 * and where its sign stands on the deck (a post with a board, read from either side; solid, so
 * nobody walks through it, and clear of every path: tests/therme-detail.test.ts).
 */

export interface PoolInfo {
  name: string;
  emoji: string;
  /** °C */
  temp: number;
  note: string;
}

export const POOL_INFO: Record<string, PoolInfo> = {
  'therme-thermal': { name: 'Thermalbecken', emoji: '🌊', temp: 34, note: 'Sole · Schwimmbar · Sprudelliegen' },
  'therme-whirl-1': { name: 'Whirlpool', emoji: '🫧', temp: 36, note: 'Sprudel von unten' },
  'therme-whirl-2': { name: 'Whirlpool', emoji: '🫧', temp: 36, note: 'Sprudel von unten' },
  'therme-whirl-3': { name: 'Whirlpool', emoji: '🫧', temp: 36, note: 'Sprudel von unten' },
  'therme-whirl-4': { name: 'Whirlpool', emoji: '🫧', temp: 36, note: 'Sprudel von unten' },
  'therme-grotto': { name: 'Tropfsteingrotte', emoji: '💎', temp: 36, note: 'Farblicht · Dampf' },
  'therme-waves': { name: 'Wellenbad', emoji: '🌊', temp: 30, note: 'Wellen alle 8 Minuten' },
  'therme-landing': { name: 'Landebecken', emoji: '🛝', temp: 30, note: 'Rutschenauslauf · Bestzeiten am Kiosk' },
  'therme-pond': { name: 'Kaltwasserteich', emoji: '🧊', temp: 16, note: 'zum Abkühlen nach der Sauna' },
  'therme-plunge': { name: 'Tauchbecken', emoji: '🧊', temp: 12, note: 'einmal ganz unter' },
  'therme-gardentub': { name: 'Whirlpool im Saunagarten', emoji: '🫧', temp: 38, note: 'unter freiem Himmel' },
  'therme-lagoon': { name: 'Außenlagune', emoji: '🏝️', temp: 32, note: 'unter freiem Himmel' },
  'therme-river': { name: 'Strömungskanal', emoji: '🌀', temp: 32, note: 'lass dich treiben' },
};
/** The Kneipp trough: not a pool you swim in, waded through (shared/therme-dorf.ts). */
export const KNEIPP_INFO: PoolInfo = { name: 'Kneippbecken', emoji: '🦶', temp: 14, note: 'im Storchengang hindurch' };

/** "1,35 m": a depth in metres, to the nearest 5 cm. */
export const metres = (m: number) => `${(Math.round(m * 20) / 20).toFixed(2).replace(/0$/, '').replace('.', ',')} m`;

/** How deep a pool is, in words (the wave pool from its beach to its deep end). */
export function depthOf(def: PoolDef): string {
  if (def.id === WAVE_POOL.id) return `0–${metres(def.surface - def.floor)}`;
  return metres(def.surface - def.floor);
}

/** A pool's info by id (every pool has one: the tests check). */
export const poolInfo = (id: string | undefined): PoolInfo | undefined => (id ? POOL_INFO[id] : undefined);

/** Its sign's two lines: "🌊 THERMALBECKEN", "34 °C · 1,35 m tief · Sole …". */
export function signWords(id: string): [string, string] {
  if (id === 'kneipp') return [`${KNEIPP_INFO.emoji} ${KNEIPP_INFO.name.toUpperCase()}`, `${KNEIPP_INFO.temp} °C · ${metres(-KNEIPP_FLOOR)} · ${KNEIPP_INFO.note}`];
  const info = POOL_INFO[id];
  const def = POOLS.find((p) => p.id === id)!;
  return [`${info.emoji} ${info.name.toUpperCase()}`, `${info.temp} °C · ${depthOf(def)} tief · ${info.note}`];
}

/** Where the pools' signs stand (on the deck by each; the grotto's is over its mouth already). */
export const POOL_SIGNS: readonly { pool: string; x: number; z: number; rotY: number }[] = [
  { pool: 'therme-thermal', x: 100, z: 31, rotY: 0 },
  { pool: 'therme-thermal', x: 97.5, z: 74.6, rotY: 0 },
  { pool: 'therme-whirl-1', x: 64.6, z: 34.3, rotY: Math.PI / 2 },
  { pool: 'therme-whirl-2', x: 64.6, z: 42.3, rotY: Math.PI / 2 },
  { pool: 'therme-whirl-3', x: 64.6, z: 50.3, rotY: Math.PI / 2 },
  { pool: 'therme-whirl-4', x: 64.6, z: 58.3, rotY: Math.PI / 2 },
  { pool: 'therme-waves', x: 97.5, z: 78.4, rotY: 0 },
  { pool: 'therme-waves', x: 57.8, z: 102, rotY: Math.PI / 2 },
  { pool: 'therme-landing', x: 165, z: 99.8, rotY: 0 },
  { pool: 'therme-pond', x: 38.9, z: 62, rotY: Math.PI / 2 },
  { pool: 'therme-plunge', x: 46.2, z: 53, rotY: 0 },
  { pool: 'kneipp', x: 48, z: 59.5, rotY: 0 },
  { pool: 'therme-gardentub', x: 43.2, z: 89, rotY: Math.PI / 2 },
  { pool: 'therme-lagoon', x: 60.5, z: 147.9, rotY: 0 },
  { pool: 'therme-river', x: 108, z: 147.9, rotY: 0 },
  { pool: 'therme-river', x: 147, z: 147.9, rotY: 0 },
];
export const SIGN_HEIGHT = 1.9;

/** The signs' posts, solid. */
export const signFixtures = (): TFixture[] => POOL_SIGNS.map((s, i) => ({ id: `pool-sign-${i}`, minX: s.x - 0.15, maxX: s.x + 0.15, minZ: s.z - 0.15, maxZ: s.z + 0.15, top: SIGN_HEIGHT }));


/** The showers on the decks (E under one: a rinse), by the ways into the pools. */
export const SHOWERS: readonly { x: number; z: number }[] = [
  { x: 94.5, z: 24 },
  { x: 105.5, z: 24 },
  { x: 118, z: 22.5 },
  { x: 62.2, z: 78.6 },
  { x: 85.5, z: 142.6 },
  { x: 140.8, z: 99.4 },
];
export const SHOWER_HEIGHT = 2.3;
export const showerFixtures = (): TFixture[] => SHOWERS.map((s, i) => ({ id: `shower-${i}`, minX: s.x - 0.12, maxX: s.x + 0.12, minZ: s.z - 0.12, maxZ: s.z + 0.12, top: SHOWER_HEIGHT }));

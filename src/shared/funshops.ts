// flrnoh fork (see FORK.md "Shops to walk into": the Spielhalle and the Post): the pure parts of the
// arcade's claw machine and the post office's postcards, the same for the page, the server and the
// tests. The claw: a pile of plush toys laid out from the shop alone (everyone sees the same pile),
// and whether a drop at (x, z) grabs one, from where it lands and one roll the office makes. The
// postcards: the city's motifs, how long a card's text may be, cleaning it up, and how many a day.

import { SHOPS } from './shops.js';
import { PLUSHIES, type PlushId } from './plushies.js';

// ---- The claw machine ----------------------------------------------------------------------------

export { PLUSHIES, PLUSH_BY_ID, isPlush, type PlushId } from './plushies.js';

/** The claw's field: x and z from 0 to 1 (x across the glass, z from the front to the back). */
export interface PlushInPile {
  id: PlushId;
  x: number;
  z: number;
  /** How big it is (a grab must land within this of its middle). */
  r: number;
}

/** How many plushies lie in a machine, and the chute's corner (front left), where none lie. */
export const PILE = 9;
export const CHUTE = { x: 0.14, z: 0.14, r: 0.16 };
/** At best, a dead-centre grab holds on this often: the claws are famously weak. */
export const GRIP = 0.7;
/** Seconds between drops, per person (the office checks). */
export const CLAW_EVERY = 4;

/** A small seeded random generator (mulberry32): the same numbers from the same seed everywhere. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pile in shop `shop`'s claw machine: the same on every page, out of the chute's corner, not on top of each other. */
export function clawPile(shop: number): PlushInPile[] {
  const rnd = seeded(shop * 7919 + 17);
  const out: PlushInPile[] = [];
  for (let tries = 0; out.length < PILE && tries < 400; tries++) {
    const p = {
      id: PLUSHIES[Math.floor(rnd() * PLUSHIES.length)].id,
      x: 0.12 + rnd() * 0.76,
      z: 0.12 + rnd() * 0.76,
      r: 0.075 + rnd() * 0.025,
    };
    if (Math.hypot(p.x - CHUTE.x, p.z - CHUTE.z) < CHUTE.r + p.r) continue;
    if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < (o.r + p.r) * 0.9)) continue;
    out.push(p);
  }
  return out;
}

/** Where the claw would come down: the plush nearest (x, z), how far off its middle (0 dead centre, 1 its edge), and the chance it holds. */
export function clawAim(pile: readonly PlushInPile[], x: number, z: number): { plush: PlushInPile | null; off: number; chance: number } {
  let best: PlushInPile | null = null;
  let off = Infinity;
  for (const p of pile) {
    const d = Math.hypot(p.x - x, p.z - z) / p.r;
    if (d < off) [best, off] = [p, d];
  }
  if (!best || off >= 1) return { plush: null, off: Math.min(off, 9), chance: 0 };
  // Dead centre GRIP, falling off toward the edge (squared: a near miss mostly slips).
  return { plush: best, off, chance: GRIP * (1 - off * off) };
}

/** A drop: what it lands on and whether it holds, given the office's `roll` (0..1). The same numbers, the same answer. */
export function clawGrab(pile: readonly PlushInPile[], x: number, z: number, roll: number): { won: PlushId | null; near: PlushId | null } {
  const a = clawAim(pile, x, z);
  return {
    won: a.plush && roll < a.chance ? a.plush.id : null,
    near: a.plush?.id ?? null,
  };
}

export type ClawClientMsg = {
  t: 'claw.drop';
  shop: number;
  x: number;
  z: number;
};
/** A drop in a shop's claw machine, to everyone near (the claw moves on every page) and the player: `won` is the plush, or null. */
export type ClawServerMsg = {
  t: 'claw';
  id: string;
  name: string;
  shop: number;
  x: number;
  z: number;
  won: PlushId | null;
};

/** A claw.drop as the office takes it: a Spielhalle's shop, a place in the glass (clamped). Null drops it. */
export function clawDrop(msg: Partial<ClawClientMsg>): { shop: number; x: number; z: number } | null {
  const shop = msg.shop;
  if (typeof shop !== 'number' || !Number.isInteger(shop) || SHOPS[shop]?.kind !== 'spielhalle') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0.04, Math.min(0.96, v)) : null);
  const x = n(msg.x);
  const z = n(msg.z);
  return x === null || z === null ? null : { shop, x, z };
}

// ---- Postcards -----------------------------------------------------------------------------------

/** What's on the front: the city, drawn on the page (features/funshops/motifs.ts). */
export const POSTCARD_MOTIFS = [
  { id: 'skyline', name: 'Skyline bei Nacht' },
  { id: 'kino', name: 'Das Kino' },
  { id: 'park', name: 'Im Park' },
  { id: 'strand', name: 'Sunset Beach' },
  { id: 'buero', name: 'Das Büro' },
  { id: 'spielhalle', name: 'Neon in der Spielhalle' },
] as const;
export type MotifId = (typeof POSTCARD_MOTIFS)[number]['id'];
export const isMotif = (v: unknown): v is MotifId => typeof v === 'string' && POSTCARD_MOTIFS.some((m) => m.id === v);

/** How long a card's text may be, and how many cards anyone sends a day. */
export const POSTCARD_TEXT_MAX = 200;
export const POSTCARDS_PER_DAY = 10;

/** A card's text, cleaned up: no control or invisible characters (or text turned round), lines kept (at most 6), runs of spaces one, at most POSTCARD_TEXT_MAX. */
export function cleanPostcardText(v: unknown): string {
  if (typeof v !== 'string') return '';
  const lines = v
    .slice(0, POSTCARD_TEXT_MAX * 4)
    .replace(/\r\n?/g, '\n')
    // Control characters but the line break, zero-width and direction marks and overrides, the BOM.
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim());
  const kept: string[] = [];
  for (const l of lines) if (l || (kept.length && kept[kept.length - 1])) kept.push(l);
  return [...kept.slice(0, 6)].join('\n').trim().slice(0, POSTCARD_TEXT_MAX).trim();
}

/** Someone you can send a card to: `key` is who they are to the office (`account:<id>`, or `name:<name>`). */
export interface Recipient {
  key: string;
  name: string;
  online: boolean;
}

export interface Postcard {
  id: string;
  from: string;
  to: string;
  motif: MotifId;
  text: string;
  /** When it was sent (ms). */
  at: number;
}

export type PostClientMsg =
  /** Who you can send a card to. */
  | { t: 'post.recipients' }
  | { t: 'post.send'; to: string; motif: MotifId; text: string }
  /** Any cards waiting for you (the page asks once it's in). */
  | { t: 'post.check' };

export type PostServerMsg =
  | { t: 'post.recipients'; list: Recipient[]; left: number }
  /** Your card's in the post (`left`: how many more today). */
  | { t: 'post.sent'; to: string; left: number }
  /** Cards for you: in the post since you were last in, or just now. */
  | { t: 'post.cards'; cards: Postcard[] };

/** The day (YYYY-MM-DD, the office's local time) a count of cards goes by. */
export function postDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

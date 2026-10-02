// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): what a look wears.
// From the boutique (Klamotten) in town: the top's style, the trousers' color and something on the
// head; from the optician: glasses and their tint. The top's color is the shirt color everyone
// already has (the profile's `color`), so the boutique changes that and adds nothing for it.
//
// Like the marks (avatar-marks.ts), every field is optional and absent means what everyone wore
// before: a T-shirt, the dark blue trousers, nothing on the head, no glasses. sanitizeOutfit never
// writes a default, so a look without them stays byte for byte the same.

import type { Look } from './avatar.js';

/** Top styles, by index; 0 is the T-shirt everyone wore before. The last, the smoking jacket, is the office's admins' alone (OWNER_TOP). */
export const TOP_STYLES = ['T-shirt', 'Hoodie', 'Shirt', 'Blazer', 'Leather jacket', 'Dress', 'Smoking jacket'];
export const TOP_STYLES_DE = ['T-Shirt', 'Hoodie', 'Hemd', 'Sakko', 'Lederjacke', 'Kleid', 'Smoking'];
/** The host's own: midnight-blue velvet, satin lapels, gold cufflinks, patent shoes. Only an admin's look keeps it (forOwner). */
export const OWNER_TOP = 6;
/** The boutique's colors for a top (the profile's shirt color): the character window's eight and a few more. */
export const TOP_COLORS = ['#ff8a5b', '#4f86f7', '#06d6a0', '#ef476f', '#ffd166', '#9d4edd', '#00b4d8', '#f77f00', '#ffffff', '#2b2d42', '#8d99ae', '#6a994e', '#9b2226', '#f4acb7'];
/** Trousers, by index; 0 is the dark blue everyone wore before. */
export const LEG_COLORS = ['#3d405b', '#1d3557', '#457b9d', '#2b2b2b', '#8d99ae', '#c9b79c', '#6b4f3a', '#386641', '#9b2226', '#f1faee'];
export const LEG_COLOR_NAMES = ['Dunkelblau', 'Marine', 'Jeansblau', 'Schwarz', 'Grau', 'Beige', 'Braun', 'Oliv', 'Weinrot', 'Weiß'];
/** On the head, by index; 0 is nothing. */
export const HEADWEAR = ['None', 'Cap', 'Beanie', 'Hat', 'Sun hat'];
export const HEADWEAR_DE = ['Ohne', 'Cap', 'Mütze', 'Hut', 'Sonnenhut'];
/** Glasses frames, by index; 0 is none. */
export const GLASSES = ['None', 'Round', 'Square', 'Nerd', 'Aviator', 'Cat-eye'];
export const GLASSES_DE = ['Ohne', 'Rund', 'Eckig', 'Nerd', 'Pilotenbrille', 'Cat-Eye'];
/** The lenses' tint, by index; 0 is clear. */
export const TINTS = ['Clear', 'Dark', 'Mirrored'];
export const TINTS_DE = ['Klar', 'Dunkel', 'Verspiegelt'];
/** The aviator's frame is a pair of sunglasses: picked with clear lenses, it comes dark. */
export const AVIATOR = 4;

/** The parts of a Look this file adds (see Look in avatar.ts). Absent means the default (index 0). */
export interface LookOutfit {
  /** Index into TOP_STYLES; absent (or 0) is a T-shirt. */
  top?: number;
  /** Index into LEG_COLORS; absent (or 0) is the dark blue. */
  legs?: number;
  /** Index into HEADWEAR; absent (or 0) is nothing. */
  hat?: number;
  /** Index into GLASSES; absent (or 0) is none. */
  specs?: number;
  /** Index into TINTS, only with glasses; absent (or 0) is clear. */
  tint?: number;
}

const FIELDS: readonly [keyof LookOutfit, readonly string[]][] = [
  ['top', TOP_STYLES],
  ['legs', LEG_COLORS],
  ['hat', HEADWEAR],
  ['specs', GLASSES],
  ['tint', TINTS],
];

/**
 * `base` with the outfit of `o` (anything, as sanitizeLook got it), each field checked: absent is the
 * default; one that isn't an index of its list keeps `fallback`'s. Nothing is written for a default,
 * and no tint without glasses.
 */
export function sanitizeOutfit<L extends object>(o: Record<string, unknown>, fallback: LookOutfit, base: L): L & LookOutfit {
  const out: L & LookOutfit = { ...base };
  for (const [k, list] of FIELDS) {
    const v = o[k];
    const i = v === undefined ? 0 : Number.isInteger(v) && (v as number) >= 0 && (v as number) < list.length ? (v as number) : (fallback[k] ?? 0);
    if (i > 0) out[k] = i;
    else delete out[k];
  }
  if (!out.specs) delete out.tint;
  return out;
}

/** `look` as someone who isn't an admin may wear it: the owner's smoking jacket comes off (back to a T-shirt). */
export function forOwner<L extends LookOutfit>(look: L, owner: boolean): L {
  if (owner || look.top !== OWNER_TOP) return look;
  const { top: _top, ...rest } = look;
  return rest as L;
}

/** One string for the outfit (for sameLook, and to know when to redraw). */
export function outfitKey(o: LookOutfit): string {
  return FIELDS.map(([k]) => o[k] ?? 0).join('.');
}

export function sameOutfit(a: LookOutfit, b: LookOutfit): boolean {
  return outfitKey(a) === outfitKey(b);
}

/** A changed copy of `look` with `change` in it, checked (a field set to 0 goes). */
export function withOutfit(look: Look, change: LookOutfit): Look {
  const next = sanitizeOutfit({ ...look, ...change } as Record<string, unknown>, look, { ...look }) as Look;
  // Picking the aviators with clear lenses: they're sunglasses.
  if (change.specs === AVIATOR && change.tint === undefined && !look.tint) next.tint = 1;
  return next;
}

/** Whether hair of style `style` (HAIR_STYLES' name) shows under what's on the head: what pokes up hides under a hat. */
export function hairShows(o: LookOutfit, style: string): boolean {
  return !o.hat || !(style === 'Spiky' || style === 'Bun' || style === 'Curly');
}

// ---- On the wire: as URL parameters when the socket connects, next to the marks' -------------------

/** `top=2&legs=3&hat=1&specs=4&tint=1`; only what isn't the default. */
export function outfitToParams(o: LookOutfit): Record<string, string> {
  const q: Record<string, string> = {};
  for (const [k] of FIELDS) if (o[k]) q[k] = String(o[k]);
  return q;
}

/** outfitToParams back, unchecked (sanitizeLook checks it): what's missing stays missing. */
export function outfitFromParams(q: { get(k: string): string | null }): LookOutfit {
  const out: Record<string, number> = {};
  for (const [k] of FIELDS) {
    const v = q.get(k);
    if (v) out[k] = Number(v);
  }
  return out as LookOutfit;
}

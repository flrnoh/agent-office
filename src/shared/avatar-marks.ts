// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): what a look carries besides skin and hair.
// A beard (from the barber's chair), tattoos and piercings (from the tattoo studio in town). Shared by
// server and client, re-exported from avatar.ts, so a look stays one small object on the wire.
//
// All three are optional on a Look and absent means none: a look without them (every look saved
// before there were any, lookFromSeed's) stays exactly what it was. sanitizeMarks never writes a
// default (no `beard: 0`, no empty lists), so an unchanged look stays byte for byte the same.

import type { Look } from './avatar.js';

/** Beard styles, by index like HAIR_STYLES; 0 is none. The beard is the hair's color (HAIR_COLORS[look.hair]). */
export const BEARD_STYLES = ['None', 'Stubble', 'Moustache', 'Goatee', 'Chin strap', 'Full beard', 'Viking', 'Mutton chops'];
/** The same in German, for the barber's window. */
export const BEARD_STYLES_DE = ['Ohne', 'Dreitagebart', 'Schnauzer', 'Ziegenbart', 'Kinnriemen', 'Vollbart', 'Wikinger', 'Koteletten'];

export interface TattooMotif {
  id: string;
  de: string;
  en: string;
  emoji: string;
}

export const TATTOO_MOTIFS: readonly TattooMotif[] = [
  { id: 'anchor', de: 'Anker', en: 'Anchor', emoji: '⚓' },
  { id: 'rose', de: 'Rose', en: 'Rose', emoji: '🌹' },
  { id: 'mama', de: 'Herz „Mama“', en: 'Heart "Mama"', emoji: '❤️' },
  { id: 'skull', de: 'Totenkopf', en: 'Skull', emoji: '💀' },
  { id: 'swallow', de: 'Schwalbe', en: 'Swallow', emoji: '🐦' },
  { id: 'tribal', de: 'Tribal-Band', en: 'Tribal band', emoji: '〰️' },
  { id: 'robot', de: 'Büro-Bot', en: 'Office bot', emoji: '🤖' },
  { id: 'star', de: 'Nautischer Stern', en: 'Nautical star', emoji: '⭐' },
  { id: 'coffee', de: 'Kaffeetasse', en: 'Coffee cup', emoji: '☕' },
];

export interface MarkSpot {
  id: string;
  de: string;
  en: string;
}

/** Where a tattoo can go. `-l`/`-r` are the character's own left and right (left is +x, forward is +z). */
export const TATTOO_SPOTS: readonly MarkSpot[] = [
  { id: 'forearm-l', de: 'Unterarm links', en: 'Left forearm' },
  { id: 'forearm-r', de: 'Unterarm rechts', en: 'Right forearm' },
  { id: 'upperarm-l', de: 'Oberarm links', en: 'Left upper arm' },
  { id: 'upperarm-r', de: 'Oberarm rechts', en: 'Right upper arm' },
  { id: 'neck', de: 'Hals', en: 'Neck' },
  { id: 'hand-l', de: 'Hand links', en: 'Left hand' },
  { id: 'hand-r', de: 'Hand rechts', en: 'Right hand' },
];

export interface PiercingKind extends MarkSpot {
  /** What goes in: a stud, a ring, or a little bar (the eyebrow's). */
  shape: 'stud' | 'ring' | 'bar';
  /** Where it is, for grouping in the studio's window. */
  group: 'ear' | 'face';
}

/** Where a piercing can go, one each. Up to three helix rings an ear, as kinds of their own. */
export const PIERCING_KINDS: readonly PiercingKind[] = [
  { id: 'lobe-stud-l', de: 'Ohrläppchen links (Stecker)', en: 'Left lobe stud', shape: 'stud', group: 'ear' },
  { id: 'lobe-stud-r', de: 'Ohrläppchen rechts (Stecker)', en: 'Right lobe stud', shape: 'stud', group: 'ear' },
  { id: 'lobe-ring-l', de: 'Ohrläppchen links (Ring)', en: 'Left lobe ring', shape: 'ring', group: 'ear' },
  { id: 'lobe-ring-r', de: 'Ohrläppchen rechts (Ring)', en: 'Right lobe ring', shape: 'ring', group: 'ear' },
  { id: 'helix-l1', de: 'Helix links 1', en: 'Left helix 1', shape: 'ring', group: 'ear' },
  { id: 'helix-l2', de: 'Helix links 2', en: 'Left helix 2', shape: 'ring', group: 'ear' },
  { id: 'helix-l3', de: 'Helix links 3', en: 'Left helix 3', shape: 'ring', group: 'ear' },
  { id: 'helix-r1', de: 'Helix rechts 1', en: 'Right helix 1', shape: 'ring', group: 'ear' },
  { id: 'helix-r2', de: 'Helix rechts 2', en: 'Right helix 2', shape: 'ring', group: 'ear' },
  { id: 'helix-r3', de: 'Helix rechts 3', en: 'Right helix 3', shape: 'ring', group: 'ear' },
  { id: 'nose-stud', de: 'Nasenstecker', en: 'Nose stud', shape: 'stud', group: 'face' },
  { id: 'nose-ring', de: 'Nasenring', en: 'Nose ring', shape: 'ring', group: 'face' },
  { id: 'septum', de: 'Septum', en: 'Septum', shape: 'ring', group: 'face' },
  { id: 'brow-l', de: 'Augenbraue links', en: 'Left eyebrow', shape: 'bar', group: 'face' },
  { id: 'brow-r', de: 'Augenbraue rechts', en: 'Right eyebrow', shape: 'bar', group: 'face' },
  { id: 'lip-ring', de: 'Lippenring', en: 'Lip ring', shape: 'ring', group: 'face' },
];

export type Metal = 'silver' | 'gold';
export const METALS: readonly Metal[] = ['silver', 'gold'];
/** How each metal looks on the character. */
export const METAL_COLORS: Readonly<Record<Metal, string>> = { silver: '#d9dde3', gold: '#e6b422' };

export interface Tattoo {
  motif: string;
  spot: string;
}

export interface Piercing {
  kind: string;
  metal: Metal;
}

/** The parts of a Look this file adds (see Look in avatar.ts). Absent means none. */
export interface LookMarks {
  /** Index into BEARD_STYLES; absent (or 0) is clean-shaven. */
  beard?: number;
  /** At most one a spot, at most MAX_TATTOOS. */
  tattoos?: Tattoo[];
  /** At most one a kind, at most MAX_PIERCINGS. */
  piercings?: Piercing[];
}

export const MAX_TATTOOS = 6;
export const MAX_PIERCINGS = 10;

const MOTIF_IDS = new Set(TATTOO_MOTIFS.map((m) => m.id));
const SPOT_IDS = new Set(TATTOO_SPOTS.map((s) => s.id));
const KIND_IDS = new Set(PIERCING_KINDS.map((k) => k.id));

export const motifOf = (id: string): TattooMotif | undefined => TATTOO_MOTIFS.find((m) => m.id === id);
export const spotOf = (id: string): MarkSpot | undefined => TATTOO_SPOTS.find((s) => s.id === id);
export const piercingKindOf = (id: string): PiercingKind | undefined => PIERCING_KINDS.find((k) => k.id === id);

function validTattoo(x: unknown): Tattoo | null {
  if (!x || typeof x !== 'object') return null;
  const { motif, spot } = x as Record<string, unknown>;
  return typeof motif === 'string' && typeof spot === 'string' && MOTIF_IDS.has(motif) && SPOT_IDS.has(spot) ? { motif, spot } : null;
}

function validPiercing(x: unknown): Piercing | null {
  if (!x || typeof x !== 'object') return null;
  const { kind, metal } = x as Record<string, unknown>;
  return typeof kind === 'string' && KIND_IDS.has(kind) && (metal === 'silver' || metal === 'gold') ? { kind, metal } : null;
}

/**
 * The valid entries of `list`, one per `key` (a later one replaces an earlier one, in its place at the
 * end, like getting a new tattoo over an old one), and the first `max` of those.
 */
function cleanList<T>(list: unknown[], valid: (x: unknown) => T | null, key: (t: T) => string, max: number): T[] {
  const out: T[] = [];
  for (const x of list) {
    const t = valid(x);
    if (!t) continue;
    const at = out.findIndex((o) => key(o) === key(t));
    if (at >= 0) out.splice(at, 1);
    out.push(t);
  }
  return out.slice(0, max);
}

/**
 * `base` with the beard, tattoos and piercings of `o` (anything, as sanitizeLook got it), each checked:
 * - absent (undefined) is none, so a look sent without them has none;
 * - a beard that isn't an index of BEARD_STYLES keeps `fallback`'s;
 * - a list that isn't an array keeps `fallback`'s; in one that is, unknown motifs, spots, kinds and
 *   metals are dropped, a second tattoo on a spot (or piercing of a kind) replaces the first, and only
 *   the first MAX_TATTOOS (MAX_PIERCINGS) are kept.
 * Nothing is written for none, so the result has no `beard: 0` and no empty lists.
 */
export function sanitizeMarks<L extends { skin: number; hair: number; style: number }>(o: Record<string, unknown>, fallback: LookMarks, base: L): L & LookMarks {
  const out: L & LookMarks = { ...base };
  const b = o.beard;
  const beard = b === undefined ? 0 : Number.isInteger(b) && (b as number) >= 0 && (b as number) < BEARD_STYLES.length ? (b as number) : (fallback.beard ?? 0);
  if (beard > 0) out.beard = beard;
  const tattoos = o.tattoos === undefined ? [] : Array.isArray(o.tattoos) ? cleanList(o.tattoos, validTattoo, (t) => t.spot, MAX_TATTOOS) : cleanList(fallback.tattoos ?? [], validTattoo, (t) => t.spot, MAX_TATTOOS);
  if (tattoos.length) out.tattoos = tattoos;
  const piercings =
    o.piercings === undefined ? [] : Array.isArray(o.piercings) ? cleanList(o.piercings, validPiercing, (p) => p.kind, MAX_PIERCINGS) : cleanList(fallback.piercings ?? [], validPiercing, (p) => p.kind, MAX_PIERCINGS);
  if (piercings.length) out.piercings = piercings;
  return out;
}

/** One string for the marks, the same however the lists are ordered (for sameLook, and to know when to redraw). */
export function marksKey(m: LookMarks): string {
  const tat = (m.tattoos ?? []).map((t) => `${t.motif}.${t.spot}`).sort();
  const pierce = (m.piercings ?? []).map((p) => `${p.kind}.${p.metal}`).sort();
  return `${m.beard ?? 0}|${tat.join(',')}|${pierce.join(',')}`;
}

export function sameMarks(a: LookMarks, b: LookMarks): boolean {
  return marksKey(a) === marksKey(b);
}

/** Sometimes a beard, for randomLook (never tattoos or piercings: those are earned in town). */
export function randomMarks(): LookMarks {
  return Math.random() < 0.35 ? { beard: 1 + Math.floor(Math.random() * (BEARD_STYLES.length - 1)) } : {};
}

// ---- On the wire: the look rides along as URL parameters when the socket connects (net.ts). --------

/** `beard=3`, `tat=anchor.forearm-l,rose.neck`, `pierce=nose-stud.gold,lobe-stud-l.silver`; only what there is. */
export function marksToParams(m: LookMarks): Record<string, string> {
  const q: Record<string, string> = {};
  if (m.beard) q.beard = String(m.beard);
  if (m.tattoos?.length) q.tat = m.tattoos.map((t) => `${t.motif}.${t.spot}`).join(',');
  if (m.piercings?.length) q.pierce = m.piercings.map((p) => `${p.kind}.${p.metal}`).join(',');
  return q;
}

/** marksToParams back, unchecked (sanitizeLook checks it): what's missing stays missing. */
export function marksFromParams(q: { get(k: string): string | null }): LookMarks {
  const out: Record<string, unknown> = {};
  const beard = q.get('beard');
  if (beard) out.beard = Number(beard);
  const pairs = (s: string) => s.split(',').filter(Boolean).map((p) => p.split('.'));
  const tat = q.get('tat');
  if (tat !== null) out.tattoos = pairs(tat).map(([motif, spot]) => ({ motif, spot }));
  const pierce = q.get('pierce');
  if (pierce !== null) out.piercings = pairs(pierce).map(([kind, metal]) => ({ kind, metal }));
  return out as LookMarks;
}

// ---- For the barber's chair and the studio: a changed copy of a look, never the look itself. ------

const shaped = (look: Look, marks: LookMarks): Look => sanitizeMarks(marks as Record<string, unknown>, {}, { skin: look.skin, hair: look.hair, style: look.style }) as Look;

/** With beard style `i` (0, or one that isn't one, shaves it off). */
export function withBeard(look: Look, i: number): Look {
  return shaped(look, { ...look, beard: Number.isInteger(i) && i > 0 && i < BEARD_STYLES.length ? i : 0 });
}

/** Whether a tattoo fits on `spot`: one's there to go over, or there's room for another. */
export function canTattoo(look: Look, spot: string): boolean {
  const list = look.tattoos ?? [];
  return list.some((t) => t.spot === spot) || list.length < MAX_TATTOOS;
}

/** With `t` (over whatever was on its spot). Unchanged if it isn't a tattoo there is, or there's no room left. */
export function withTattoo(look: Look, t: Tattoo): Look {
  if (!validTattoo(t) || !canTattoo(look, t.spot)) return shaped(look, look);
  const tattoos = (look.tattoos ?? []).map((o) => (o.spot === t.spot ? { motif: t.motif, spot: t.spot } : o));
  if (!tattoos.some((o) => o.spot === t.spot)) tattoos.push({ motif: t.motif, spot: t.spot });
  return shaped(look, { ...look, tattoos });
}

/** Lasered off: without the tattoo on `spot`. */
export function withoutTattoo(look: Look, spot: string): Look {
  return shaped(look, { ...look, tattoos: (look.tattoos ?? []).filter((t) => t.spot !== spot) });
}

/** Whether a piercing of `kind` fits: one's there to swap, or there's room for another. */
export function canPierce(look: Look, kind: string): boolean {
  const list = look.piercings ?? [];
  return list.some((p) => p.kind === kind) || list.length < MAX_PIERCINGS;
}

/** With `p` (in place of one of its kind, say silver for gold). Unchanged if it isn't one there is, or there's no room left. */
export function withPiercing(look: Look, p: Piercing): Look {
  if (!validPiercing(p) || !canPierce(look, p.kind)) return shaped(look, look);
  const piercings = (look.piercings ?? []).map((o) => (o.kind === p.kind ? { kind: p.kind, metal: p.metal } : o));
  if (!piercings.some((o) => o.kind === p.kind)) piercings.push({ kind: p.kind, metal: p.metal });
  return shaped(look, { ...look, piercings });
}

/** Without the piercing of `kind`. */
export function withoutPiercing(look: Look, kind: string): Look {
  return shaped(look, { ...look, piercings: (look.piercings ?? []).filter((p) => p.kind !== kind) });
}

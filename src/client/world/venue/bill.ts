import type { VenueMode } from '../../../shared/venue';

/*
 * What's on at the Schallwerk, for the letter board over its doors, the LED wall over the stage and
 * the poster cases on the façade (flrnoh fork, see FORK.md "The Schallwerk"). The building shows
 * "HEUTE: KONZERT" or "HEUTE: CLUB" by the house's mode on its own; client/venue/gigbill.ts fills it
 * from the show's gig calendar (features/venueshow/gigs.ts): the gig on now as tonight's, the next
 * ones under it, their posters in the cases.
 */

export interface VenueBill {
  /** The gig on now ("NULL POINTER SISTERS"): the letter board's big line, the LED wall's word. Absent: the mode's. */
  tonight?: string;
  /** What's coming next, a few short lines ("SA 10.10. KERNEL PANIK"). */
  next?: string[];
  /** The calendar's posters for the façade's cases (up to four), newest first; absent: the house's own. */
  posters?: HTMLCanvasElement[];
}

let bill: VenueBill | null = null;
let mode: VenueMode = 'konzert';
const watchers = new Set<() => void>();

/** What's on (or null: back to the mode's words and the house's posters). */
export function setVenueBill(b: VenueBill | null) {
  bill = b ? { tonight: b.tonight ? String(b.tonight).slice(0, 40) : undefined, next: (b.next ?? []).slice(0, 3).map((l) => String(l).slice(0, 40)), posters: b.posters?.slice(0, 4) } : null;
  for (const fn of watchers) fn();
}

/** The building's: the house switched between concert and club. */
export function setBillMode(m: VenueMode) {
  if (m === mode) return;
  mode = m;
  for (const fn of watchers) fn();
}

/** The letter board's lines now: tonight first, then what's next (or the doors' times). */
export function billLines(): string[] {
  const first = bill?.tonight ? `HEUTE: ${bill.tonight}` : mode === 'club' ? 'HEUTE: CLUB' : 'HEUTE: KONZERT';
  const next = bill?.next?.length ? bill.next.map((l) => `DEMNÄCHST: ${l}`) : [mode === 'club' ? 'TÜR 23 UHR · BIS DIE SONNE KOMMT' : 'EINLASS 19 UHR · BEGINN 20 UHR'];
  return [first, ...next];
}

/** Tonight in a word, for the LED wall. */
export function billTonight(): string {
  return bill?.tonight ?? (mode === 'club' ? 'CLUBNACHT' : 'LIVE');
}

/** The calendar's posters for the façade, or none (the house's own then). */
export function billPosters(): HTMLCanvasElement[] {
  return bill?.posters ?? [];
}

/** Called with every change (the letter board redraws). */
export function onVenueBill(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

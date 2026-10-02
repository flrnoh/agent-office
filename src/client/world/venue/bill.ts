import type { VenueMode } from '../../../shared/venue';

/*
 * What's on at the Schallwerk tonight, for the letter board over its doors and the LED wall over the
 * stage (flrnoh fork, see FORK.md "The Schallwerk"). The building shows "HEUTE: KONZERT" or "HEUTE:
 * CLUB" by the house's mode on its own; the show part (features/venueshow/, the gig calendar) calls
 * `setVenueBill(...)` whenever its calendar says something else is on, and `null` to hand back.
 */

export interface VenueBill {
  /** Tonight's act or night ("NULL POINTER SISTERS", "TECHNO BIS ZUM MORGEN"): the letter board's big line. */
  tonight: string;
  /** What's coming next, a few short lines ("SA 10.10. KERNEL PANIK"): the board's smaller lines. */
  next?: string[];
}

let bill: VenueBill | null = null;
let mode: VenueMode = 'konzert';
const watchers = new Set<() => void>();

/** The show part's: what's on (or null: back to the mode's words). */
export function setVenueBill(b: VenueBill | null) {
  bill = b ? { tonight: String(b.tonight).slice(0, 40), next: (b.next ?? []).slice(0, 3).map((l) => String(l).slice(0, 40)) } : null;
  for (const fn of watchers) fn();
}

/** The building's: the house switched between concert and club. */
export function setBillMode(m: VenueMode) {
  if (m === mode) return;
  mode = m;
  for (const fn of watchers) fn();
}

/** The letter board's lines now: tonight first, then what's next. */
export function billLines(): string[] {
  if (bill) return [`HEUTE: ${bill.tonight}`, ...(bill.next ?? [])];
  return [mode === 'club' ? 'HEUTE: CLUB' : 'HEUTE: KONZERT', mode === 'club' ? 'TÜR 23 UHR · BIS DIE SONNE KOMMT' : 'EINLASS 19 UHR · BEGINN 20 UHR'];
}

/** Tonight in a word, for the LED wall. */
export function billTonight(): string {
  return bill?.tonight ?? (mode === 'club' ? 'CLUBNACHT' : 'LIVE');
}

/** Called with every change (the letter board redraws). */
export function onVenueBill(fn: () => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

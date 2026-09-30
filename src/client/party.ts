import type { WorkerInfo } from '../shared/protocol';
import { store } from './state';
import { toast } from './ui/dom';
import type { InteractKind } from './world/office';

/*
 * Party guests on the page (flrnoh fork, see FORK.md "Party guests"). The office already sends them
 * none of the work (server/party.ts); this keeps the page from offering it: no terminals, boards,
 * queue, meetings, docs, search or services, desks that say only who's there, laptops on a
 * screensaver, and the boss's PC just Minesweeper.
 */

export const isParty = (): boolean => !!store.me.party;

/** What a party guest hears when they reach for something of the work. */
export const PARTY_NOPE = '🎉 That’s the team’s work — you’re here for the party: grab a drink, play, dance';

/** At the top of every window of the work: true (and a note) when a party guest tries to open it. */
export function partyRefuses(): boolean {
  if (!isParty()) return false;
  toast(PARTY_NOPE);
  return true;
}

/** Things in the office a party guest can't use: the work's boards, the whiteboard, knocking out walls. */
export const PARTY_OFF = new Set<InteractKind>(['issues', 'pulls', 'services', 'queue', 'bookshelf', 'meeting', 'whiteboard', 'expand', 'herald', 'station']);

/** What a desk (or a board agent's kiosk) says to a party guest: who's there and that they're busy, nothing more. */
export function partyDeskLine(w: WorkerInfo | undefined, label: string): string {
  if (!w) return `${label} · empty`;
  return `${w.name} · ${w.status === 'working' || w.status === 'starting' ? 'busy' : 'at their desk'}`;
}

/** The laptop screen a party guest sees at every desk. */
export const PARTY_SCREENSAVER = '🌙 zzz · screensaver';

/** ☰ menu entries a party guest doesn't get. */
const PARTY_MENU_OFF = new Set(['issues', 'pulls', 'queue', 'services', 'whiteboard', 'meeting', 'search', 'docs', 'waiting', 'decor', 'team', 'accounts', 'signins', 'lite', 'upgrade']);

/** The ☰ menu, with the work's entries hidden from party guests. */
export function partyMenu<A extends { id: string; shown?: () => boolean }>(actions: A[]): A[] {
  for (const a of actions) {
    if (!PARTY_MENU_OFF.has(a.id)) continue;
    const shown = a.shown;
    a.shown = () => !isParty() && (shown ? shown() : true);
  }
  return actions;
}

let wasParty: boolean | undefined;
/**
 * `body.party` hides the work's panels (spend, Claude limits, the floor's details); a role change to
 * or from party guest reloads the page, so nothing of the work it had stays on it.
 */
export function watchParty() {
  store.on('me', () => {
    const now = isParty();
    document.body.classList.toggle('party', now);
    if (wasParty !== undefined && wasParty !== now) location.reload();
    wasParty = now;
  });
}

/**
 * flrnoh fork (see FORK.md "Guest role", "Party guests"): what guests and party guests get when they
 * use something, and what the hint bar tells them. A guest watches: E at a desk opens its worker's
 * terminal to look at, the rest of the work is the team's. A party guest gets none of the work. The
 * office refuses it all anyway (server/guests.ts, server/party.ts); this keeps the page from offering it.
 */
import type { Ctx, Hint } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import type { DeskKey } from '../../interaction';
import { isParty, partyDeskLine, PARTY_NOPE, PARTY_OFF } from '../../party';
import { store } from '../../state';
import { clip, STATUS_LABEL, toast } from '../../ui/dom';
import type { InteractKind, Interactable } from '../../world/types';

/** What a guest can't do at desks, boards and the queue (the office refuses it anyway). */
const GUEST_ONLY_WATCH = new Set<InteractKind>(['issues', 'pulls', 'services', 'queue', 'bookshelf', 'meeting']);

export interface GuestsDeps {
  /** A worker's terminal, to watch (see features/waiting). */
  openWorkerTerminal(id: string): void;
}

export function installGuests(ctx: Ctx, deps: GuestsDeps) {
  /** Whether using `target` with `key` is turned away for a guest or a party guest (and they're told). */
  function refuses(target: Interactable, key: DeskKey): boolean {
    // A party guest uses none of the work's things (party.ts).
    if (isParty() && ((target.kind === 'desk' && target.deskId) || PARTY_OFF.has(target.kind))) {
      if (key === 'E') toast(PARTY_NOPE);
      return true;
    }
    if (!store.me.guest) return false;
    // A guest watches: E opens a worker's terminal to look at, everything else is for the team.
    const deskId = target.kind === 'desk' || target.kind === 'station' ? target.deskId : undefined;
    if (deskId) {
      const w = store.workerAtDesk(deskId);
      if (w && (key === 'E' || (target.kind === 'station' && key === 'O'))) deps.openWorkerTerminal(w.id);
      else if (key === 'E' || key === 'P') toast('👀 Guests watch the workers — grab a coffee or head up to the roof');
      return true;
    }
    if (GUEST_ONLY_WATCH.has(target.kind)) {
      if (key === 'E') toast('👀 That’s for the team — as a guest you watch');
      return true;
    }
    return false;
  }

  /** What the hint bar says about `it` to a guest or a party guest, where it isn't what it says to the team. */
  function hint(it: Interactable): Hint | null {
    // Party guests: who's at a desk, busy or not; the work's things are the team's.
    if (isParty() && (it.kind === 'desk' || it.kind === 'station') && it.deskId) {
      const line = partyDeskLine(store.workerAtDesk(it.deskId), ctx.plan().byId.get(it.deskId)?.label ?? '');
      return { k: `party${line}`, parts: [hintTitle(line)] };
    }
    if (isParty() && PARTY_OFF.has(it.kind)) return { k: 'party', parts: [aside('🎉 the team’s — you’re here for the party')] };
    if (!store.me.guest) return null;
    if (GUEST_ONLY_WATCH.has(it.kind) || (it.kind === 'station' && !(it.deskId && store.workerAtDesk(it.deskId)))) {
      return { k: 'guest', parts: [aside('👀 for the team — you’re a guest')] };
    }
    if (it.kind === 'station' && it.deskId) {
      const w = store.workerAtDesk(it.deskId)!;
      return { k: `guest${w.id}${w.status}`, parts: [hintTitle(`${w.name} · ${STATUS_LABEL[w.status]}`), key('O', '👀 Watch')] };
    }
    if (it.kind === 'desk' && it.deskId) {
      const w = store.workerAtDesk(it.deskId);
      const label = ctx.plan().byId.get(it.deskId)?.label ?? '';
      if (!w) return { k: 'guest', parts: [hintTitle(`${label} · empty`)] };
      const doing = w.activity ? clip(w.activity, 48) : '';
      return { k: `guest${w.id}${w.status}${doing}`, parts: [hintTitle(`${w.name} · ${STATUS_LABEL[w.status]}`), doing ? aside(doing) : '', key('E', '👀 Watch')] };
    }
    return null;
  }

  return { refuses, hint };
}

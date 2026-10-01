// flrnoh fork (see FORK.md): guests and party guests on the office's side, and who holds the Bulli's
// keys. The rules themselves are in guests.ts and party.ts; this is where the office applies them.
import type { Me } from '../../shared/protocol.js';
import type { Accounts } from '../accounts.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import { GUEST_MSGS, GUEST_QUIET } from '../guests.js';
import { PARTY_MSGS, PARTY_QUIET, PARTY_REFUSED } from '../party.js';
import { whiteboardHooks } from '../ws/handlers/whiteboard.js';

/** What a connection's role adds to upstream's Me: guest, party guest, and the Bulli's keys (carkeys.ts). */
export function roleOf(ctx: Ctx, a: ReturnType<Accounts['get']>, accountId: string | undefined): Partial<Me> {
  const keys = ctx.carKeys.mayDrive(a?.id ?? accountId, a ? a.role === 'admin' : !accountId) ? { bulli: true } : {};
  if (!a) return keys;
  return { ...(a.role === 'guest' ? { guest: true } : a.role === 'party' ? { guest: true, party: true } : {}), ...keys };
}

/** Whether what `c` was last told about their role is out of date. */
export const roleMoved = (c: Client, me: Me) => !!me.guest !== c.guest || !!me.bulli !== c.bulli || !!me.party !== c.party;

/** Brings `c` up to date with `me` (they're told with the `me` that follows). */
export function roleChanged(ctx: Ctx, c: Client, me: Me) {
  c.bulli = !!me.bulli;
  if (!!me.party !== c.party) partyChanged(ctx, c, !!me.party);
  if (!!me.guest !== c.guest) {
    c.guest = !!me.guest;
    // Made a guest while at a keyboard: they keep watching, but stop typing.
    if (c.guest) c.typingAt.clear();
  }
}

/** Made a party guest, or no longer one. Their page reloads on the `me` that follows; from now on they watch and draw nothing. */
function partyChanged(ctx: Ctx, c: Client, party: boolean) {
  c.party = party;
  if (!party) return;
  for (const f of ctx.floors.values()) {
    f.workers.detachAll(c.id);
    f.changes.unwatchAll(c.id);
  }
  c.attached.clear();
  c.stale.clear();
  c.typingAt.clear();
  whiteboardHooks.leaving?.(ctx, c, ctx.floorOf(c))?.();
}

/**
 * Whether a message is turned away for `c`'s role, checked on the office's side whatever the page
 * lets them click. Party guests first: they're stricter than guests.
 */
export function refusedForRole(ctx: Ctx, c: Client, t: string): boolean {
  const rules = c.party ? { may: PARTY_MSGS, quiet: PARTY_QUIET, note: PARTY_REFUSED } : c.guest ? { may: GUEST_MSGS, quiet: GUEST_QUIET, note: 'Guests only watch here: grab a drink, play, and look over the workers’ shoulders' } : undefined;
  if (!rules || rules.may.has(t)) return false;
  const now = Date.now();
  if (!rules.quiet.has(t) && now - c.lastGuestNoteAt > 3000) {
    c.lastGuestNoteAt = now;
    ctx.warn(c, rules.note);
  }
  return true;
}

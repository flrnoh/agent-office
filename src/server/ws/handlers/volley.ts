// flrnoh fork (see FORK.md "A day at the beach"): beach volleyball on the wire. Where you are about the
// court and your hits go to your floor's court (server/volley.ts), which tells everyone on the floor
// how it is. Guests and party guests play too (guests.ts, party.ts). Leaving your floor, or the
// office, takes you off the court.
import type { VolleyClientMsg } from '../../../shared/volley.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { volleyMessage } from '../../volley.js';
import type { FeatureHooks, HandlerMap } from './types.js';

function volley(ctx: Ctx, c: Client, msg: VolleyClientMsg) {
  volleyMessage(ctx.beaches, ctx.floorOf(c)?.id, c.id, msg, (m) => ctx.sendTo(c, m));
}

export const volleyHandlers = {
  'volley.stand': volley,
  'volley.hit': volley,
} satisfies HandlerMap<VolleyClientMsg>;

export const volleyHooks: FeatureHooks = {
  leaving(ctx, c, was) {
    ctx.beaches.leave(was?.id, c.id);
  },
  closedOn(ctx, c, floor) {
    ctx.beaches.leave(floor.id, c.id);
  },
};

export const VOLLEY_CLIENT_MSGS = ['volley.stand', 'volley.hit'] as const satisfies readonly VolleyClientMsg['t'][];

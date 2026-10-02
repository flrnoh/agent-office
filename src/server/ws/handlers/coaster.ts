// flrnoh fork (see FORK.md "Der Brecher"): getting in and out of DER BRECHER's train up on the roof and
// putting your hands up on the ride (server/coaster.ts), letting go of your seat when you leave the roof
// or the office, and the train in every floor view (it's seen from every floor). Guests and party
// guests ride too (guests.ts, party.ts).
import type { CoasterClientMsg } from '../../../shared/coaster.js';
import { ROOF } from '../../../shared/rooftop.js';
import { coasterMessage } from '../../coaster.js';
import { owner } from '../../fork/office.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

function coaster(ctx: Ctx, c: Client, msg: CoasterClientMsg) {
  coasterMessage(ctx.coaster, msg, { id: c.id, owner: owner(c), name: c.peer.name, color: c.peer.color, onRoof: c.peer.floor === ROOF, warn: (t) => ctx.warn(c, t) });
}

export const coasterHandlers = {
  'coaster.board': coaster,
  'coaster.leave': coaster,
  'coaster.hands': coaster,
} satisfies HandlerMap<CoasterClientMsg>;

/** Off the roof (the station's up there) or out of the office: out of the train. */
export const coasterHooks: FeatureHooks = {
  leaving(ctx, c) {
    if (c.peer.floor === ROOF) ctx.coaster.gone(c.id);
  },
  closed(ctx, c) {
    ctx.coaster.gone(c.id);
  },
};

export const coasterView: ViewPieces['coaster'] = (ctx) => ctx.coaster.state();

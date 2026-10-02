// flrnoh fork (see FORK.md "Black-light mini golf"): the bowling centre's mini golf messages
// (shared/minigolf.ts), and letting go of the putter on leaving the centre or the office.
import { BOWLING } from '../../../shared/bowling.js';
import type { MinigolfClientMsg } from '../../../shared/minigolf.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import type { FeatureHooks, HandlerMap } from './types.js';

/** Only from inside the bowling centre. */
function minigolf(ctx: Ctx, c: Client, msg: MinigolfClientMsg) {
  if (c.peer.floor !== BOWLING) return;
  const warning = ctx.minigolf.message({ id: c.id, owner: owner(c), name: c.peer.name }, msg);
  if (warning) ctx.warn(c, warning);
}

export const minigolfHandlers = {
  'mg.look': minigolf,
  'mg.take': minigolf,
  'mg.return': minigolf,
  'mg.group': minigolf,
  'mg.putt': minigolf,
  'mg.pickup': minigolf,
} satisfies HandlerMap<MinigolfClientMsg>;

/** Out of the centre (or the office): the putter goes back, the ball off the course, out of their group. */
export const minigolfHooks: FeatureHooks = {
  leaving(ctx, c) {
    ctx.minigolf.leave(c.id);
  },
  closed(ctx, c) {
    ctx.minigolf.leave(c.id);
  },
};

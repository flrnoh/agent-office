// flrnoh fork (see FORK.md "The bowling centre"): the house's messages (the cosmic switch, the rental
// shoes; server/bowling/place.ts keeps them), and the shoes going back when someone leaves the centre.
import { BOWLING } from '../../../shared/bowling.js';
import type { BowlingHouseClientMsg } from '../../../shared/bowling-house.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import type { FeatureHooks, HandlerMap } from './types.js';

function house(ctx: Ctx, c: Client, msg: BowlingHouseClientMsg) {
  const reply = ctx.bowling.message({ id: c.id, name: c.peer.name, inside: c.peer.floor === BOWLING }, msg);
  if (!reply) return;
  if ('warn' in reply) return ctx.warn(c, reply.warn);
  ctx.toBowling(reply.all);
}

/** Their shoes back on the shelf, and everyone still inside told. */
const shoesBack = (ctx: Ctx, c: Client) => {
  const m = ctx.bowling.leave(c.id);
  if (m) ctx.toBowling(m, c.id);
};

export const bowlingHandlers = {
  'bowling.lights': house,
  'bowling.shoes': house,
} satisfies HandlerMap<BowlingHouseClientMsg>;

export const bowlingHooks: FeatureHooks = {
  leaving(ctx, c) {
    if (c.peer.floor === BOWLING) shoesBack(ctx, c); // out of the bowling centre: the rental shoes stay there
  },
  closed: shoesBack,
};

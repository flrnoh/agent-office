// flrnoh fork (see FORK.md "The Schallwerk"): the house's messages (concert or club, the light desk,
// the effects, the announcements, the stamp, the cloakroom, the merch; server/venue/place.ts keeps
// them). A shirt, a stamp and a coat ticket are seen everywhere, so their news goes to the whole office.
import { VENUE } from '../../../shared/venue.js';
import type { VenueHouseClientMsg } from '../../../shared/venue-house.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import type { HandlerMap } from './types.js';

/** Everyone in the office, by peer id and who they are to the house. */
const people = (ctx: Ctx) => [...ctx.clients.values()].map((o) => ({ id: o.id, owner: owner(o) }));

function house(ctx: Ctx, c: Client, msg: VenueHouseClientMsg) {
  if (msg.t === 'venue.hello') return ctx.sendTo(c, ctx.venue.state(people(ctx)));
  const reply = ctx.venue.message({ id: c.id, owner: owner(c), name: c.peer.name, inside: c.peer.floor === VENUE }, msg);
  if (!reply) return;
  if ('warn' in reply) return ctx.warn(c, reply.warn);
  if ('everyone' in reply) return ctx.broadcast(reply.everyone);
  ctx.toVenue(reply.inside);
}

export const venueHandlers = {
  'venue.mode': house,
  'venue.lights': house,
  'venue.fx': house,
  'venue.announce': house,
  'venue.stamp': house,
  'venue.coat': house,
  'venue.merch': house,
  'venue.hello': house,
} satisfies HandlerMap<VenueHouseClientMsg>;


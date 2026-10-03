// flrnoh fork (see FORK.md "Waymo"): the robotaxis on the wire. Booking, getting in and out, setting
// off, pulling over and honking go to the fleet (server/fork/waymo.ts), which tells everyone what's
// changed; a page that's come asks for the whole fleet once. Guests and party guests ride too
// (guests.ts, party.ts). Leaving the office or your floor gets you out of your car.
import type { WaymoClientMsg } from '../../../shared/waymo/fleet.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { throttle } from '../../office/client.js';
import type { FeatureHooks, HandlerMap } from './types.js';

function waymo(ctx: Ctx, c: Client, msg: WaymoClientMsg) {
  if (msg.t === 'waymo.hello') return ctx.sendTo(c, { t: 'waymo.fleet', cars: ctx.waymo.cars });
  // A press at a time: nobody books a car a millisecond.
  if (!throttle(c, 'waymo', 250)) return;
  ctx.waymo.message({ id: c.id, name: c.peer.name, color: c.peer.color }, msg);
}

export const waymoHandlers = {
  'waymo.hello': waymo,
  'waymo.book': waymo,
  'waymo.cancel': waymo,
  'waymo.enter': waymo,
  'waymo.leave': waymo,
  'waymo.go': waymo,
  'waymo.pullover': waymo,
  'waymo.honk': waymo,
} satisfies HandlerMap<WaymoClientMsg>;

export const waymoHooks: FeatureHooks = {
  leaving(ctx, c) {
    ctx.waymo.gone(c.id);
  },
  closed(ctx, c) {
    ctx.waymo.gone(c.id);
  },
};

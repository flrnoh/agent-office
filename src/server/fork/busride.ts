import { BUS_RIDE_THROTTLE_MS, busRideOf, type BusRideClientMsg } from '../../shared/busride.js';
import { throttle, type Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * Riding a city bus (flrnoh fork, see FORK.md "Traffic lights and the city bus" and shared/busride.ts):
 * the office keeps where in which bus someone is as their `bus` (so whoever comes along later sees them
 * in it) and tells their floor when it changes. The bus itself is every page's own, off the office's
 * clock; only somewhere in a bus that's there is taken. Leaving the floor gets them off (`busLeft`).
 */
export function busRideMessage(ctx: Pick<Ctx, 'toNeighbors'>, c: Client, msg: BusRideClientMsg) {
  const ride = busRideOf(msg.ride);
  // Getting off always goes through; walking about in there, as often as the page sends while moving.
  if (ride && !throttle(c, 'bus.ride', BUS_RIDE_THROTTLE_MS)) return;
  if (!ride && !c.peer.bus) return;
  if (ride) c.peer.bus = ride;
  else delete c.peer.bus;
  ctx.toNeighbors(c, { t: 'bus.rode', id: c.id, ride }, !!ride);
}

/** Off the floor: off the bus too, and everyone there told. */
export function busLeft(ctx: Pick<Ctx, 'toNeighbors'>, c: Client) {
  if (!c.peer.bus) return;
  delete c.peer.bus;
  ctx.toNeighbors(c, { t: 'bus.rode', id: c.id, ride: null });
}

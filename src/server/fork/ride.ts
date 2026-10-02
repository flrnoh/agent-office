import { bikeOf, type RideClientMsg } from '../../shared/ride.js';
import { throttle, type Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * A bike from the city's bike shop (flrnoh fork, see FORK.md "Shops to walk into"): the office keeps
 * which one someone's on as their `bike` (so whoever comes along later sees them riding, see
 * shared/ride.ts) and passes the bell on to their floor. Where they ride is their own `move`.
 */
export function rideMessage(ctx: Pick<Ctx, 'broadcast' | 'toNeighbors'>, c: Client, msg: RideClientMsg) {
  if (msg.t === 'bike.bell') {
    if (c.peer.bike && throttle(c, 'bike.bell', 350)) ctx.toNeighbors(c, { t: 'bike.bell', id: c.id }, true);
    return;
  }
  const bike = bikeOf(msg.bike);
  if (bike === c.peer.bike) return;
  if (bike) c.peer.bike = bike;
  else delete c.peer.bike;
  ctx.broadcast({ t: 'bike.rode', id: c.id, bike: bike ?? null }, c.id, true);
}

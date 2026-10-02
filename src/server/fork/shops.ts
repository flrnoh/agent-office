import { shopSeatOf } from '../../shared/shop-rooms.js';
import { OFFICE_MAP } from '../../shared/maps/index.js';
import type { Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * The city's shops (flrnoh fork, see FORK.md "Shops to walk into"): a shop's chair (the barber's, the
 * tattoo studio's) is somewhere to sit down in town, so only for someone on one of the office's
 * floors (whose street the town is on), with the office's map.
 */
export function shopSeatHere(ctx: Pick<Ctx, 'floors' | 'maps'>, c: Pick<Client, 'peer'>, key: string): boolean {
  return !!shopSeatOf(key) && !!c.peer.floor && ctx.floors.has(c.peer.floor) && ctx.maps.pick() === OFFICE_MAP;
}

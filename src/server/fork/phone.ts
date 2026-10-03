import { PHONE_THROTTLE_MS, type PhoneClientMsg } from '../../shared/phone.js';
import { throttle, type Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * Your phone (flrnoh fork, see FORK.md "The phone" and shared/phone.ts): the office keeps whether
 * someone has it out as their `phone` and tells their floor when that changes.
 */
export function phoneMessage(ctx: Pick<Ctx, 'toNeighbors'>, c: Client, msg: PhoneClientMsg) {
  const on = msg.on === true;
  if (on === !!c.peer.phone) return;
  if (on && !throttle(c, 'phone.hold', PHONE_THROTTLE_MS)) return;
  if (on) c.peer.phone = true;
  else delete c.peer.phone;
  ctx.toNeighbors(c, { t: 'phone.held', id: c.id, on });
}

import { isDance, DANCE_THROTTLE_MS, type DanceClientMsg } from '../../shared/dance.js';
import { ROOF } from '../../shared/rooftop.js';
import { throttle, type Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * Dancing on the roof (flrnoh fork, see FORK.md and shared/dance.ts): the office keeps which move
 * someone dances as their `dance` (so whoever comes up later sees them at it) and tells everyone when
 * it changes. The beat is every page's own (the office's clock), so nothing more goes over the wire.
 * Only up on the roof; going down stops it (`danceLeft`, from forkHooks.leaving).
 */
export function danceMessage(ctx: Pick<Ctx, 'broadcast'>, c: Client, msg: DanceClientMsg) {
  // The page sends once the pick has settled (features/dance); more than that is spam.
  if (!throttle(c, 'dance.set', DANCE_THROTTLE_MS)) return;
  const move = c.peer.floor === ROOF && isDance(msg.move) ? msg.move : null;
  if (move === (c.peer.dance ?? null)) return;
  if (move) c.peer.dance = move;
  else delete c.peer.dance;
  ctx.broadcast({ t: 'dance.moved', id: c.id, move }, c.id);
}

/** Off the roof: no more dancing, and everyone told. */
export function danceLeft(ctx: Pick<Ctx, 'broadcast'>, c: Client) {
  if (!c.peer.dance) return;
  delete c.peer.dance;
  ctx.broadcast({ t: 'dance.moved', id: c.id, move: null }, c.id);
}

import { VOICE_RANGE_DEFAULT, voiceRangeOf, type VoiceRangeClientMsg } from '../../shared/voicerange.js';
import { throttle, type Client } from '../office/client.js';
import type { Ctx } from '../office/context.js';

/*
 * Hörkreise (flrnoh fork, see FORK.md and shared/voicerange.ts): the office keeps how far someone's
 * voice carries as their `voiceRange` (so whoever comes along later knows) and tells everyone when it
 * changes. Who hears whom is the pages' to work out: each only sends its voice into its own circle.
 */
export function voiceRangeMessage(ctx: Pick<Ctx, 'broadcast'>, c: Client, msg: VoiceRangeClientMsg) {
  // The page sends once the circle has settled (features/voicerange); more than that is spam.
  if (!throttle(c, 'voice.range', 60)) return;
  const range = voiceRangeOf(msg.range);
  if (range === (c.peer.voiceRange ?? VOICE_RANGE_DEFAULT)) return;
  if (range === VOICE_RANGE_DEFAULT) delete c.peer.voiceRange;
  else c.peer.voiceRange = range;
  // Not droppable: it's how everyone else knows whether they hear you.
  ctx.broadcast({ t: 'voice.ranged', id: c.id, range }, c.id);
}

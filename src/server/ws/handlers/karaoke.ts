// flrnoh fork (see FORK.md "Karaoke"): the bowling centre's karaoke bar (server/bowling/karaoke.ts).
// Only from someone in the centre; leaving it (or the office) lets go of their songs, mic and turn.
import { BOWLING } from '../../../shared/bowling.js';
import type { KaraokeClientMsg } from '../../../shared/karaoke.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import type { FeatureHooks, HandlerMap } from './types.js';

const karaoke = (ctx: Ctx, c: Client, msg: KaraokeClientMsg) => {
  if (c.peer.floor !== BOWLING) return;
  ctx.karaoke.message({ id: c.id, name: c.peer.name, owner: owner(c) }, msg);
};

export const karaokeHandlers = {
  'karaoke.hello': karaoke,
  'karaoke.queue': karaoke,
  'karaoke.unqueue': karaoke,
  'karaoke.mic': karaoke,
  'karaoke.stop': karaoke,
  'karaoke.done': karaoke,
  'karaoke.rate': karaoke,
  'karaoke.cheer': karaoke,
} satisfies HandlerMap<KaraokeClientMsg>;

export const karaokeHooks: FeatureHooks = {
  leaving(ctx, c) {
    if (c.peer.floor === BOWLING) ctx.karaoke.leave(c.id); // out of the centre: songs, mic and turn go
  },
  closed(ctx, c) {
    ctx.karaoke.leave(c.id);
  },
};

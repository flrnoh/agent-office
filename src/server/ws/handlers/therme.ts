// flrnoh fork (see FORK.md "The thermal baths"): the baths' messages (server/therme/ keeps them):
// the slides' rides, clocked by the office.
import { THERME } from '../../../shared/therme.js';
import { isSlideId } from '../../../shared/therme-slides.js';
import type { ThermeClientMsg } from '../../../shared/therme-msgs.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import type { HandlerMap } from './types.js';

function slide(ctx: Ctx, c: Client, msg: ThermeClientMsg) {
  if (c.peer.floor !== THERME || !isSlideId(msg.slide)) return;
  if (msg.phase === 'start') {
    const no = ctx.therme.start(c.id, msg.slide, typeof msg.lane === 'number' ? msg.lane : 0);
    if (no) ctx.warn(c, no.warn);
    return;
  }
  if (msg.phase !== 'finish') return;
  const r = ctx.therme.finish(c.id, owner(c), c.peer.name, msg.slide);
  if (!r) return;
  if ('warn' in r) return ctx.warn(c, r.warn);
  ctx.sendTo(c, { t: 'therme.ride', slide: msg.slide, ms: r.ms, rank: r.rank, best: r.best });
  if (r.changed) ctx.toTherme({ t: 'therme.slides', boards: ctx.therme.boards() });
}

export const thermeHandlers = {
  'therme.slide': slide,
} satisfies HandlerMap<ThermeClientMsg>;

// flrnoh fork (see FORK.md "The rehearsal wing"): the Schallwerk's rehearsal wing's messages
// (shared/proberaum.ts), its clock (bookings running out, the recorders), and the recorders hearing
// what the instruments play.
import { VENUE } from '../../../shared/venue.js';
import type { ProberaumClientMsg } from '../../../shared/proberaum.js';
import type { ServerMsg } from '../../../shared/protocol.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { Proberaum } from '../../venue/proberaum.js';
import type { FeatureHooks, HandlerMap } from './types.js';

/** Who someone is to the wing: fork/office.ts's `owner` (not imported: that would import this file back through the views). */
const owner = (c: Client) => (c.accountId ? `account:${c.accountId}` : `name:${c.peer.name}`);

const wings = new WeakMap<Ctx, Proberaum>();

/**
 * The wing, one per office, made the first time anyone needs it (the first page coming into the
 * Schallwerk asks for it). It runs a clock of its own every second, and listens in on what the
 * office sends round the Schallwerk: every `instr.note` (the instruments part's, sent with
 * ctx.toVenue) goes past the recorders on its way.
 */
export function wingOf(ctx: Ctx): Proberaum {
  let w = wings.get(ctx);
  if (w) return w;
  const wing = new Proberaum({
    now: () => Date.now(),
    present: () => [...ctx.clients.values()].filter((c) => c.peer.floor === VENUE).map((c) => ({ id: c.id, owner: owner(c), name: c.peer.name, x: c.peer.x, z: c.peer.z })),
    send: (id, m) => {
      const c = ctx.clients.get(id);
      if (c) ctx.sendTo(c, m);
    },
    dataDir: ctx.cfg.dataDir,
  });
  w = wing;
  wings.set(ctx, wing);
  const toVenue = ctx.toVenue;
  ctx.toVenue = (m, except, droppable) => {
    heardInVenue(ctx, m);
    toVenue(m, except, droppable);
  };
  setInterval(() => wing.tick(), 1000).unref();
  return wing;
}

/**
 * What the Schallwerk hears: an `instr.note` ({ spot, note }) goes into the recording of its room,
 * if there is one. Called for everything sent with ctx.toVenue; an instruments part that sends its
 * notes some other way calls this for each (FORK.md "The rehearsal wing").
 */
export function heardInVenue(ctx: Ctx, m: ServerMsg | { t: string }) {
  if (m.t !== 'instr.note') return;
  const n = m as unknown as { spot?: unknown; note?: unknown };
  wings.get(ctx)?.heard(n.spot, n.note);
}

/** Only from inside the Schallwerk. */
function probe(ctx: Ctx, c: Client, msg: ProberaumClientMsg) {
  if (c.peer.floor !== VENUE) return;
  const warning = wingOf(ctx).message({ id: c.id, owner: owner(c), name: c.peer.name }, msg);
  if (warning) ctx.warn(c, warning);
}

export const proberaumHandlers = {
  'probe.look': probe,
  'probe.book': probe,
  'probe.release': probe,
  'probe.band': probe,
  'probe.member': probe,
  'probe.door': probe,
  'probe.knock': probe,
  'probe.letin': probe,
  'probe.setlist': probe,
  'probe.rec': probe,
  'probe.recstop': probe,
  'probe.play': probe,
  'probe.halt': probe,
  'probe.take': probe,
  'probe.pin': probe,
  'probe.unpin': probe,
  'probe.tip': probe,
} satisfies HandlerMap<ProberaumClientMsg>;

/** Out of the Schallwerk (or the office): their knocks go. Their bookings and takes stay. */
export const proberaumHooks: FeatureHooks = {
  leaving(ctx, c) {
    wings.get(ctx)?.leave(c.id);
  },
  closed(ctx, c) {
    wings.get(ctx)?.leave(c.id);
  },
};

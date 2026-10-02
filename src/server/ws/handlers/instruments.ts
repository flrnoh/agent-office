// flrnoh fork (see FORK.md "The instruments"): the Schallwerk's instruments' messages
// (shared/instruments.ts). Only from someone in the venue; leaving it (or the office) puts their
// instrument back. Notes go to everyone in the venue but whoever played them (their page has played
// them already), droppable: each page sounds them only in the spot's room.
import { VENUE, venueRoomAt } from '../../../shared/venue.js';
import { SPOT_BY_ID, type InstrumentsClientMsg, type InstrumentsServerMsg } from '../../../shared/instruments.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { Instruments, type Musician } from '../../venue/instruments.js';
import type { FeatureHooks, HandlerMap } from './types.js';

/** The venue's instruments, one set per office (made the first time anyone needs them). */
const sets = new WeakMap<Ctx, Instruments>();
export function instrumentsOf(ctx: Ctx): Instruments {
  let i = sets.get(ctx);
  if (!i) sets.set(ctx, (i = new Instruments()));
  return i;
}

const inside = (c: Client) => c.peer.floor === VENUE;
const musician = (c: Client): Musician => ({ id: c.id, name: c.peer.name, x: c.peer.x, z: c.peer.z });
const toAll = (ctx: Ctx, m: InstrumentsServerMsg, except?: string, droppable = false) => ctx.toVenue(m, except, droppable);
const players = (ctx: Ctx) => toAll(ctx, { t: 'instr.state', players: instrumentsOf(ctx).state() });

type Msg<K extends InstrumentsClientMsg['t']> = Extract<InstrumentsClientMsg, { t: K }>;

export const instrumentsHandlers = {
  'instr.hello'(ctx, c) {
    if (!inside(c)) return;
    const i = instrumentsOf(ctx);
    ctx.sendTo(c, { t: 'instr.state', players: i.state() });
    ctx.sendTo(c, { t: 'instr.jam', jams: i.allJams() });
    ctx.sendTo(c, { t: 'instr.tones', tones: i.allTones() });
  },
  'instr.take'(ctx, c, msg: Msg<'instr.take'>) {
    if (!inside(c) || typeof msg.spot !== 'string') return;
    const res = instrumentsOf(ctx).take(musician(c), msg.spot);
    if ('error' in res) {
      ctx.warn(c, res.error);
      // Their page may think it has it: tell them who does.
      ctx.sendTo(c, { t: 'instr.state', players: instrumentsOf(ctx).state() });
      return;
    }
    if (res.changed) players(ctx);
  },
  'instr.leave'(ctx, c) {
    if (instrumentsOf(ctx).leave(c.id)) players(ctx);
  },
  'instr.note'(ctx, c, msg: Msg<'instr.note'>) {
    if (!inside(c) || typeof msg.spot !== 'string') return;
    const res = instrumentsOf(ctx).note(musician(c), msg.spot, msg.note, Date.now());
    if ('note' in res) return toAll(ctx, { t: 'instr.note', id: c.id, spot: msg.spot, note: res.note }, c.id, true);
    if (res.refused === 'away') players(ctx); // walked off it: back on its stand
  },
  'instr.jam'(ctx, c, msg: Msg<'instr.jam'>) {
    if (!inside(c)) return;
    // From someone in that room, or playing in it.
    const i = instrumentsOf(ctx);
    const mine = SPOT_BY_ID.get(i.spotOf(c.id) ?? '');
    if (venueRoomAt(c.peer.x, c.peer.z) !== msg.room && mine?.room !== msg.room) return;
    const jam = i.setJam(msg.room, msg.change, Date.now());
    if (jam) toAll(ctx, { t: 'instr.jam', jams: { [msg.room]: jam } });
  },
  'instr.tone'(ctx, c, msg: Msg<'instr.tone'>) {
    if (!inside(c) || typeof msg.spot !== 'string') return;
    const i = instrumentsOf(ctx);
    if (i.setTone(c.id, msg.spot, msg.tone)) toAll(ctx, { t: 'instr.tones', tones: i.allTones() });
  },
} satisfies HandlerMap<InstrumentsClientMsg>;

/** Out of the venue, or out of the office: the instrument goes back, and everyone still in there is told. */
const putBack = (ctx: Ctx, c: Client) => {
  if (instrumentsOf(ctx).leave(c.id)) toAll(ctx, { t: 'instr.state', players: instrumentsOf(ctx).state() }, c.id);
};

export const instrumentsHooks: FeatureHooks = {
  leaving(ctx, c) {
    if (inside(c)) putBack(ctx, c);
  },
  closed(ctx, c) {
    putBack(ctx, c);
    instrumentsOf(ctx).forget(c.id);
  },
};

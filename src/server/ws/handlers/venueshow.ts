// flrnoh fork (see FORK.md "The show"): the SCHALLWERK's show, its messages (shared/venueshow.ts)
// and what it keeps (server/venue/show.ts), one per office, started with the fork. Only from someone
// in the house, but the calendar: anyone may read it from anywhere, the team edits it (guests.ts).
import { VENUE } from '../../../shared/venue.js';
import { ACT_EVERY, isCrowdAct, isDjFx, type VenueShowClientMsg, type VenueShowServerMsg } from '../../../shared/venueshow.js';
import type { Ctx } from '../../office/context.js';
import { throttle, type Client } from '../../office/client.js';
import { VenueShow, type ShowPerson } from '../../venue/show.js';
import type { FeatureHooks, HandlerMap } from './types.js';

const shows = new WeakMap<Ctx, VenueShow>();
/** The house's show, one per office (made the first time anything needs it). */
export function showOf(ctx: Ctx): VenueShow {
  let s = shows.get(ctx);
  if (!s) {
    s = new VenueShow({
      dataDir: ctx.cfg.dataDir,
      now: () => Date.now(),
      toVenue: (m, except) => ctx.toVenue(m, except),
      toAll: (m) => ctx.broadcast(m),
      present: () => [...ctx.clients.values()].filter((o) => o.peer.floor === VENUE).length,
      partyVolume: () => ctx.djBooth.state().volume ?? 1,
    });
    shows.set(ctx, s);
  }
  return s;
}

/** The show's clock (a gig starting) runs from the office's start (fork/office.ts startFork). */
export const startVenueShow = (ctx: Ctx) => showOf(ctx).start();
export const stopVenueShow = (ctx: Ctx) => shows.get(ctx)?.stop();

const inside = (c: Client) => c.peer.floor === VENUE;
const person = (c: Client): ShowPerson => ({ id: c.id, name: c.peer.name, x: c.peer.x, y: c.peer.y, z: c.peer.z });
const toast = (ctx: Ctx, text: string) => ctx.toVenue({ t: 'toast', text, level: 'info' });
const answer = (ctx: Ctx, c: Client, r: { error: string } | { ok: true; toast?: string }) => {
  if ('error' in r) return ctx.warn(c, r.error);
  if (r.toast) toast(ctx, r.toast);
};

type Msg<K extends VenueShowClientMsg['t']> = Extract<VenueShowClientMsg, { t: K }>;

export const venueShowHandlers = {
  'show.hello'(ctx, c) {
    if (!inside(c)) return;
    const s = showOf(ctx);
    ctx.sendTo(c, { t: 'show', state: s.state() });
    ctx.sendTo(c, s.gigsMsg());
  },
  'show.act'(ctx, c, msg: Msg<'show.act'>) {
    if (!inside(c) || !isCrowdAct(msg.act) || !throttle(c, `show.${msg.act}`, ACT_EVERY[msg.act])) return;
    if ((msg.act === 'light' || msg.act === 'unlight') && !showOf(ctx).light(c.id, msg.act === 'light')) return;
    const m: VenueShowServerMsg = { t: 'show.act', id: c.id, act: msg.act, x: c.peer.x, z: c.peer.z };
    ctx.toVenue(m, c.id, msg.act === 'pogo');
  },
  'show.surf'(ctx, c, msg: Msg<'show.surf'>) {
    if (!inside(c) || (msg.on && !throttle(c, 'show.surf', 3000))) return;
    answer(ctx, c, showOf(ctx).surf(person(c), msg.on === true));
  },
  'show.ball'(ctx, c, msg: Msg<'show.ball'>) {
    if (!inside(c) || !throttle(c, 'show.ball', 250)) return;
    showOf(ctx).ball(person(c), msg.i, msg);
  },
  'show.wod'(ctx, c) {
    if (!inside(c)) return;
    answer(ctx, c, showOf(ctx).wod(person(c)));
  },
  'venuedj.take'(ctx, c) {
    if (!inside(c)) return;
    answer(ctx, c, showOf(ctx).take(person(c)));
  },
  'venuedj.leave'(ctx, c) {
    if (showOf(ctx).leave(c.id)) toast(ctx, `🎧 ${c.peer.name} gibt das Pult ab`);
  },
  'venuedj.play'(ctx, c, msg: Msg<'venuedj.play'>) {
    if (!inside(c)) return;
    const r = showOf(ctx).play(person(c), msg.url);
    if ('error' in r) return ctx.warn(c, r.error);
    void r.titled?.then(() => r.toast && toast(ctx, r.toast));
  },
  'venuedj.stop'(ctx, c) {
    if (!inside(c)) return;
    answer(ctx, c, showOf(ctx).stopSet(person(c)));
  },
  'venuedj.tap'(ctx, c, msg: Msg<'venuedj.tap'>) {
    if (!inside(c)) return;
    answer(ctx, c, showOf(ctx).tap(person(c), msg.bpm, msg.at));
  },
  'venuedj.house'(ctx, c, msg: Msg<'venuedj.house'>) {
    if (!inside(c) || !throttle(c, 'venuedj.house', 1000)) return;
    answer(ctx, c, showOf(ctx).houseStyle(person(c), msg.style));
  },
  'venuedj.fx'(ctx, c, msg: Msg<'venuedj.fx'>) {
    if (!inside(c) || !isDjFx(msg.fx)) return;
    const s = showOf(ctx);
    if (msg.fx === 'horn') {
      if (!s.isDj(c.id) || !throttle(c, 'venuedj.horn', 900)) return;
      return ctx.toVenue({ t: 'venuedj.horn', id: c.id, by: c.peer.name });
    }
    answer(ctx, c, s.fx(person(c), msg.fx));
  },
  'gig.list'(ctx, c) {
    if (!throttle(c, 'gig.list', 500)) return;
    ctx.sendTo(c, showOf(ctx).gigsMsg());
  },
  'gig.save'(ctx, c, msg: Msg<'gig.save'>) {
    if (c.guest || c.party) return; // the team's (guests.ts says so too)
    if (!throttle(c, 'gig.save', 800)) return ctx.warn(c, 'Einen Moment …');
    const s = showOf(ctx);
    const r = s.calendar.save(msg.gig, c.peer.name);
    if ('error' in r) return ctx.warn(c, r.error);
    ctx.broadcast(s.gigsMsg());
    s.tick();
  },
  'gig.delete'(ctx, c, msg: Msg<'gig.delete'>) {
    if (c.guest || c.party) return;
    const s = showOf(ctx);
    if (s.calendar.remove(msg.id)) ctx.broadcast(s.gigsMsg());
  },
} satisfies HandlerMap<VenueShowClientMsg>;

export const venueShowHooks: FeatureHooks = {
  leaving(ctx, c) {
    // Out of the house: once they're gone, their decks, surf and lighter go (and the set, if they were the last).
    if (inside(c)) return () => showOf(ctx).gone(c.id);
  },
  closed(ctx, c) {
    const s = shows.get(ctx);
    if (s) setTimeout(() => s.gone(c.id), 0);
  },
};

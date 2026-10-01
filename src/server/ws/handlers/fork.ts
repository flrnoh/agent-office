// flrnoh fork (see FORK.md): the messages of everything this fork adds (shared/protocol/fork.ts),
// what each keeps per person, and its pieces of the floor view.
import type { ForkClientMsg } from '../../../shared/protocol.js';
import { ROOF } from '../../../shared/rooftop.js';
import { HALL } from '../../../shared/hall.js';
import { OFFICE_MAP } from '../../../shared/maps/index.js';
import { reorderMap } from '../../../shared/floor-order.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { djMessage } from '../../djset.js';
import { tvMessage } from '../../tv.js';
import { tableMessage } from '../../tablegames.js';
import { padelMessage } from '../../padel.js';
import { bungeeMessage } from '../../bungee.js';
import { rigMessage } from '../../rig.js';
import { here } from './common.js';
import { jukeboxChanged } from './jukebox.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

const toClient = (ctx: Ctx) => (id: string, m: Parameters<Ctx['sendTo']>[1]) => {
  const o = ctx.clients.get(id);
  if (o) ctx.sendTo(o, m);
};

const leftTable = (ctx: Ctx, id: string) => ctx.roofTables.leave(id) && ctx.toRoof({ t: 'tables', tables: ctx.roofTables.state() }, id);
const leftCourt = (ctx: Ctx, id: string) => ctx.padelCourts.leave(id) && ctx.toHall({ t: 'padel', courts: ctx.padelCourts.state() }, id);
const offRope = (ctx: Ctx, id: string) => ctx.bungeeRope.leave(id) && ctx.toRoof({ t: 'bungee', state: ctx.bungeeRope.state() }, id);
const rigLeft = (ctx: Ctx, c: Client) => ctx.rigs.leave(c.id).forEach(ctx.rigChanged);

type Casino = Ctx['casino'];
type Gym = Ctx['gym'];
const casino = (ctx: Ctx, c: Client, msg: Parameters<Casino['message']>[1]) => ctx.casino.message(c.id, msg);
const gym = (ctx: Ctx, c: Client, msg: Parameters<Gym['message']>[1]) => ctx.gym.message(c.id, msg);
const soccer = (ctx: Ctx, c: Client, msg: Parameters<Ctx['soccer']['message']>[1]) => ctx.soccer.message(c.id, msg);

function dj(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: 'dj.play' | 'dj.stop' }>) {
  djMessage(ctx.djBooth, msg, { id: c.id, who: c.peer.name, onRoof: c.peer.floor === ROOF, toRoof: (m) => ctx.toRoof(m), warn: (t) => ctx.warn(c, t) });
}
function tv(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: 'tv.play' | 'tv.stop' }>) {
  const floor = ctx.floorOf(c); // streams on the office TV (tv.ts)
  tvMessage(floor?.tv, msg, { id: c.id, who: c.peer.name, office: ctx.maps.pick() === OFFICE_MAP, toFloor: (m) => floor && ctx.toFloor(floor, m), warn: (t) => ctx.warn(c, t) });
}
function table(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `table.${string}` }>) {
  tableMessage(ctx.roofTables, msg, { id: c.id, who: c.peer.name, color: c.peer.color, onRoof: c.peer.floor === ROOF, toRoof: ctx.toRoof, toClient: toClient(ctx), warn: (t) => ctx.warn(c, t) });
}
function padel(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `padel.${string}` }>) {
  padelMessage(ctx.padelCourts, msg, { id: c.id, who: c.peer.name, color: c.peer.color, inHall: c.peer.floor === HALL, toHall: ctx.toHall, toClient: toClient(ctx), warn: (t) => ctx.warn(c, t) });
}
function rig(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `rig.${string}` }>) {
  const floor = ctx.floorOf(c);
  rigMessage(ctx.rigs, msg, {
    id: c.id,
    who: c.peer.name,
    color: c.peer.color,
    floor: floor?.id,
    send: (m) => ctx.sendTo(c, m),
    toNeighbors: (m, droppable) => ctx.toNeighbors(c, m, droppable),
    changed: () => floor && ctx.rigChanged(floor.id),
    tablesChanged: () => [...ctx.floors.keys()].forEach(ctx.rigChanged),
    toastFloor: (t) => ctx.toastFloor(floor, t),
    warn: (t) => ctx.warn(c, t),
  });
}

export const forkHandlers = {
  'casino.sit': casino,
  'casino.stand': casino,
  'casino.act': casino,
  'gym.sit': gym,
  'gym.stand': gym,
  'gym.act': gym,
  'soccer.join': soccer,
  'soccer.leave': soccer,
  'soccer.kick': soccer,
  'soccer.slide': soccer, // fork: slide tackles (server/soccer/tackle.ts)
  'padel.look': padel,
  'padel.join': padel,
  'padel.leave': padel,
  'padel.input': padel,
  'padel.sync': padel,
  'dj.play': dj,
  'dj.stop': dj,
  'tv.play': tv,
  'tv.stop': tv,
  'table.join': table,
  'table.leave': table,
  'table.input': table,
  'table.sync': table,
  'bungee.jump'(ctx, c, msg) {
    bungeeMessage(ctx.bungeeRope, msg, { id: c.id, who: c.peer.name, color: c.peer.color, onRoof: c.peer.floor === ROOF, floors: ctx.floors.size, toRoof: ctx.toRoof, warn: (t) => ctx.warn(c, t) });
  },
  'jukebox.speakers'(ctx, c, msg) {
    // The speakers all over the floor (client/speakers.ts); guests can't (guests.ts).
    const who = c.peer.name;
    const floor = here(ctx, c);
    if (!floor || !floor.jukebox.setSpeakers(msg.on === true)) return;
    jukeboxChanged(ctx, floor);
    ctx.toastFloor(floor, msg.on === true ? `🔊 ${who} switched the speakers on` : `🔈 ${who} switched the speakers off`);
  },
  'rig.play': rig,
  'rig.leave': rig,
  'rig.frame': rig,
  'rig.finish': rig,
  'floor.order'(ctx, c, msg) {
    // Floors in any order (see FORK.md): the same ids reorder floors.json and the open floors.
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can rearrange the floors');
    const ids = Array.isArray(msg.ids) ? msg.ids.slice(0, 1000) : [];
    if (!ctx.building.reorder(ids)) return ctx.sendTo(c, { t: 'floors', floors: ctx.floorInfos() });
    reorderMap(ctx.floors, ids);
    ctx.floorsChanged();
    ctx.toastAll(`🛗 ${c.peer.name} rearranged the floors`);
  },
} satisfies HandlerMap<ForkClientMsg>;

/** Letting go of the fork's things on leaving a floor (or the roof, or a place) and the office. */
export const forkHooks: FeatureHooks = {
  leaving(ctx, c) {
    ctx.casino.leave(c.id); // up from the casino's tables
    ctx.gym.leave(c.id); // off the gym's stations
    if (c.peer.floor === ROOF) leftTable(ctx, c.id); // off the roof, away from its tables
    if (c.peer.floor === HALL) leftCourt(ctx, c.id); // out of the padel hall, off its courts
    ctx.soccer.leave(c.id); // out of the soccer hall, off its pitch
    if (c.peer.floor === ROOF) offRope(ctx, c.id); // and off the bungee rope
    rigLeft(ctx, c); // the racing rig
  },
  closed(ctx, c) {
    ctx.casino.leave(c.id);
    ctx.gym.leave(c.id);
    leftTable(ctx, c.id);
    leftCourt(ctx, c.id);
    ctx.soccer.leave(c.id);
    offRope(ctx, c.id);
    rigLeft(ctx, c);
  },
};

// The roof's (dj, tables, bungee) come with roofExtras (fork/office.ts); a floor has none of them.
export const rigView: ViewPieces['rig'] = (ctx, floor) => ctx.rigs.view(floor?.id);
export const tvView: ViewPieces['tv'] = (_ctx, floor) => floor?.tv.state();
export const noView = () => undefined;

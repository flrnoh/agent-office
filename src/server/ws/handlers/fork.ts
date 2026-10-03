// flrnoh fork (see FORK.md): the messages of everything this fork adds (shared/protocol/fork.ts),
// what each keeps per person, and its pieces of the floor view.
import type { ForkClientMsg } from '../../../shared/protocol.js';
import { ROOF } from '../../../shared/rooftop.js';
import { HALL } from '../../../shared/hall.js';
import { OFFICE_MAP } from '../../../shared/maps/index.js';
import { reorderMap } from '../../../shared/floor-order.js';
import { interiorFor } from '../../../shared/interiors.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { djMessage } from '../../djset.js';
import { tvMessage } from '../../tv.js';
import { tableMessage } from '../../tablegames.js';
import { padelMessage } from '../../padel.js';
import { bungeeMessage } from '../../bungee.js';
import { rigMessage } from '../../rig.js';
import { boatMessage } from '../../boats.js';
import { baumarktMessage } from '../../baumarkt.js';
import { kinoMessage } from '../../kino.js';
import { toyUse } from '../../../shared/shopwares.js';
import { funshopHandlers } from './funshops.js';
import { coasterHandlers, coasterHooks } from './coaster.js';
import { karaokeHandlers } from './karaoke.js';
import { bowlingHandlers } from './bowling.js';
import { venueHandlers } from './venue.js';
import { rideMessage } from '../../fork/ride.js';
import { busLeft, busRideMessage } from '../../fork/busride.js';
import { voiceRangeMessage } from '../../fork/voicerange.js';
import { danceLeft, danceMessage } from '../../fork/dance.js';
import { here } from './common.js';
import { jukeboxChanged } from './jukebox.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

const toClient = (ctx: Ctx) => (id: string, m: Parameters<Ctx['sendTo']>[1]) => {
  const o = ctx.clients.get(id);
  if (o) ctx.sendTo(o, m);
};

const leftTable = (ctx: Ctx, id: string) => ctx.roofTables.leave(id) && ctx.toRoof({ t: 'tables', tables: ctx.roofTables.state() }, id);
const leftCourt = (ctx: Ctx, id: string) => ctx.padelCourts.leave(id) && ctx.toHall({ t: 'padel', courts: ctx.padelCourts.state() }, id);
// The rope's news goes to the whole building: the jetty and the jump are seen from every floor and the street.
const offRope = (ctx: Ctx, id: string) => ctx.bungeeRope.leave(id) && ctx.broadcast({ t: 'bungee', state: ctx.bungeeRope.state() }, id);
const rigLeft = (ctx: Ctx, c: Client) => ctx.rigs.leave(c.id).forEach(ctx.rigChanged);
/** Out of a craft at the jetty of the floor they're leaving (or left), and everyone still there told. */
const boatLeft = (ctx: Ctx, c: Client, floorId: string | undefined) => {
  const floor = floorId ? ctx.floors.get(floorId) : undefined;
  if (floor && ctx.marinas.leave(floorId, c.id)) ctx.toFloor(floor, { t: 'boats', boats: ctx.marinas.of(floor.id).state() });
};

/** Off the forklift, a trolley let go and what they held put back, at the Baumarkt of the floor they're leaving (or left). */
const baumarktLeft = (ctx: Ctx, c: Client, floorId: string | undefined) => {
  const floor = floorId ? ctx.floors.get(floorId) : undefined;
  if (floor && ctx.baumaerkte.leave(floorId, c.id)) ctx.toFloor(floor, { t: 'baumarkt', state: ctx.baumaerkte.of(floor.id).state() });
};
/** Their supermarket trolley let go of on the floor they're leaving (or left), and everyone still there told. */
const trolleyLeft = (ctx: Ctx, c: Client, floorId: string | undefined) => {
  const floor = floorId ? ctx.floors.get(floorId) : undefined;
  const m = floor && ctx.trolleys.leave(floor.id, c.id);
  if (floor && m) ctx.toFloor(floor, m);
};

type Casino = Ctx['casino'];
type Gym = Ctx['gym'];
const casino = (ctx: Ctx, c: Client, msg: Parameters<Casino['message']>[1]) => ctx.casino.message(c.id, msg);
const gym = (ctx: Ctx, c: Client, msg: Parameters<Gym['message']>[1]) => ctx.gym.message(c.id, msg);
const soccer = (ctx: Ctx, c: Client, msg: Parameters<Ctx['soccer']['message']>[1]) => ctx.soccer.message(c.id, msg);

function dj(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: 'dj.play' | 'dj.stop' | 'dj.seek' | 'dj.tap' | 'dj.volume' }>) {
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
function boat(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `boat.${string}` }>) {
  const floor = ctx.floorOf(c); // the jetskis and the motorboat at the beach (boats.ts)
  boatMessage(ctx.marinas, msg, { id: c.id, floor: floor?.id, send: (m) => ctx.sendTo(c, m), toNeighbors: (m, droppable) => ctx.toNeighbors(c, m, droppable) });
}
function baumarkt(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `bm.${string}` }>) {
  const floor = ctx.floorOf(c); // the Baumarkt on the street (baumarkt.ts)
  const where = () => (floor && c.peer.floor === floor.id ? { x: c.peer.x, z: c.peer.z } : undefined);
  baumarktMessage(ctx.baumaerkte, msg, { id: c.id, floor: floor?.id, where, send: (m) => ctx.sendTo(c, m), toNeighbors: (m, droppable) => ctx.toNeighbors(c, m, droppable) });
}
function kino(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: 'kino.play' | 'kino.stop' }>) {
  const floor = ctx.floorOf(c); // the cinema's Saal 2 (kino.ts)
  kinoMessage(floor && ctx.kinos.of(floor), msg, { id: c.id, who: c.peer.name, office: ctx.maps.pick() === OFFICE_MAP, toFloor: (m) => floor && ctx.toFloor(floor, m), warn: (t) => ctx.warn(c, t) });
}

function tank(ctx: Ctx, c: Client, msg: Extract<ForkClientMsg, { t: `tank.${string}` }>) {
  const floor = ctx.floorOf(c); // the petrol station and its car wash (tankstelle.ts)
  if (!floor) return;
  const res = ctx.forecourts.message(floor.id, { id: c.id, inCar: floor.garage.seatOf(c.id)?.car, x: c.peer.x, z: c.peer.z }, msg, floor.garage.state());
  if ('refused' in res) return ctx.warn(c, res.refused);
  ctx.toFloor(floor, res.ok);
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
  'dj.seek': dj,
  'dj.tap': dj,
  'dj.volume': dj,
  'tv.play': tv,
  'tv.stop': tv,
  'table.join': table,
  'table.leave': table,
  'table.input': table,
  'table.sync': table,
  'bungee.jump'(ctx, c, msg) {
    bungeeMessage(ctx.bungeeRope, msg, { id: c.id, who: c.peer.name, color: c.peer.color, onRoof: c.peer.floor === ROOF, floors: ctx.floors.size, toBuilding: (m) => ctx.broadcast(m), warn: (t) => ctx.warn(c, t) });
  },
  'jukebox.speakers'(ctx, c, msg) {
    // The speakers all over the floor (client/speakers.ts); guests can't (guests.ts).
    const who = c.peer.name;
    const floor = here(ctx, c);
    if (!floor || !floor.jukebox.setSpeakers(msg.on === true)) return;
    jukeboxChanged(ctx, floor);
    ctx.toastFloor(floor, msg.on === true ? `🔊 ${who} switched the speakers on` : `🔈 ${who} switched the speakers off`);
  },
  'boat.enter': boat,
  'boat.leave': boat,
  'boat.drive': boat,
  'boat.horn': boat,
  'bm.fork.enter': baumarkt,
  'bm.fork.leave': baumarkt,
  'bm.fork.drive': baumarkt,
  'bm.fork.horn': baumarkt,
  'bm.trolley.grab': baumarkt,
  'bm.trolley.push': baumarkt,
  'bm.trolley.let': baumarkt,
  'bm.hold': baumarkt,
  'bm.use': baumarkt,
  'bm.mix': baumarkt,
  'kino.play': kino,
  'kino.stop': kino,
  'toy.use'(ctx, c, msg) {
    // A toy from the city's toy shop (shared/shopwares.ts): only the one in their hand, seen on their floor.
    const used = toyUse(msg, c.peer.drink, c.id);
    if (used) ctx.toNeighbors(c, used);
  },
  ...funshopHandlers, // the Spielhalle's claw machine and the Post's postcards
  ...coasterHandlers, // DER BRECHER, the roller coaster round the tower
  ...karaokeHandlers, // the bowling centre's karaoke bar (karaoke.ts)
  ...bowlingHandlers, // the bowling centre's cosmic switch and rental shoes
  ...venueHandlers, // the Schallwerk's house: concert or club, the light desk, stamp, cloakroom, merch (venue.ts)
  'bike.ride': rideMessage, // a bike from the city's bike shop (fork/ride.ts)
  'bike.bell': rideMessage,
  'bus.ride': busRideMessage, // riding a city bus: where in it (fork/busride.ts)
  'voice.range': voiceRangeMessage, // how far your voice carries (fork/voicerange.ts)
  'dance.set': danceMessage, // dancing on the roof (fork/dance.ts)
  'tank.fill': tank,
  'tank.wash': tank,
  'trolley.set'(ctx, c, msg) {
    // The supermarket's trolley (shared/trolley.ts): taken, filled, rung up or let go of, seen on their floor.
    const floor = ctx.floorOf(c);
    const m = floor && ctx.trolleys.set(floor.id, c.id, msg.items);
    if (m) ctx.toNeighbors(c, m);
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
  'floor.interior'(ctx, c, msg) {
    // Each storey its own interior (see FORK.md): interiors.json keeps the pick, everyone's elevator list carries it.
    if (!ctx.meOf(c.accountId).admin) return ctx.warn(c, 'Only admins can refurnish a floor');
    const floor = typeof msg.id === 'string' ? ctx.floors.get(msg.id) : undefined;
    const interior = msg.interior === null ? null : typeof msg.interior === 'string' ? msg.interior : undefined;
    if (!floor || interior === undefined || !ctx.interiors.set(floor.id, interior)) return ctx.sendTo(c, { t: 'floors', floors: ctx.floorInfos() });
    ctx.floorsChanged();
    const style = interiorFor(0, interior);
    ctx.toastAll(interior ? `${style.emoji} ${c.peer.name} furnished ${floor.def.name} as ${style.name}` : `🛋️ ${c.peer.name} put ${floor.def.name} back to its own furnishing`);
  },
} satisfies HandlerMap<ForkClientMsg>;

/** Letting go of the fork's things on leaving a floor (or the roof, or a place) and the office. */
export const forkHooks: FeatureHooks = {
  leaving(ctx, c, was) {
    ctx.casino.leave(c.id); // up from the casino's tables
    ctx.gym.leave(c.id); // off the gym's stations
    if (c.peer.floor === ROOF) leftTable(ctx, c.id); // off the roof, away from its tables
    if (c.peer.floor === HALL) leftCourt(ctx, c.id); // out of the padel hall, off its courts
    ctx.soccer.leave(c.id); // out of the soccer hall, off its pitch
    if (c.peer.floor === ROOF) offRope(ctx, c.id); // and off the bungee rope
    if (c.peer.floor === ROOF) danceLeft(ctx, c); // and off the dance floor
    rigLeft(ctx, c); // the racing rig
    boatLeft(ctx, c, was?.id); // out of a boat at the beach
    baumarktLeft(ctx, c, was?.id); // off the Baumarkt's forklift, trolleys and tools
    trolleyLeft(ctx, c, was?.id); // the supermarket's trolley stays behind
    coasterHooks.leaving?.(ctx, c, was); // out of DER BRECHER's train, off the roof
    busLeft(ctx, c); // off the city bus
  },
  closed(ctx, c) {
    ctx.casino.leave(c.id);
    ctx.gym.leave(c.id);
    leftTable(ctx, c.id);
    leftCourt(ctx, c.id);
    ctx.soccer.leave(c.id);
    offRope(ctx, c.id);
    rigLeft(ctx, c);
    coasterHooks.closed?.(ctx, c);
  },
  closedOn(ctx, c, floor) {
    boatLeft(ctx, c, floor.id); // out of a boat at the beach
    baumarktLeft(ctx, c, floor.id);
    trolleyLeft(ctx, c, floor.id); // and the supermarket's trolley
  },
};

// The roof's (dj, tables) come with roofExtras (fork/office.ts); a floor has none of them. The bungee rope
// is in every view: the jump is seen from below too.
export const rigView: ViewPieces['rig'] = (ctx, floor) => ctx.rigs.view(floor?.id);
export const tvView: ViewPieces['tv'] = (_ctx, floor) => floor?.tv.state();
export const boatsView: ViewPieces['boats'] = (ctx, floor) => ctx.marinas.view(floor?.id);
export const baumarktView: ViewPieces['baumarkt'] = (ctx, floor) => ctx.baumaerkte.view(floor?.id);
export const kinoView: ViewPieces['kino'] = (ctx, floor) => ctx.kinos.view(floor);
export const tankView: ViewPieces['tankstelle'] = (ctx, floor) => ctx.forecourts.view(floor?.id);
export const trolleysView: ViewPieces['trolleys'] = (ctx, floor) => ctx.trolleys.view(floor?.id);
export const noView = () => undefined;
export const bungeeView: ViewPieces['bungee'] = (ctx) => ctx.bungeeRope.state();

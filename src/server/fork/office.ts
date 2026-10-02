// flrnoh fork (see FORK.md): what this fork adds to the office's shared context (office/context.ts),
// made after upstream's stages in server.ts, and the places across the street people go to.
import { WebSocket } from 'ws';
import type { FloorView, ServerMsg } from '../../shared/protocol.js';
import { ROOF } from '../../shared/rooftop.js';
import { CASINO, CASINO_ENTRY } from '../../shared/casino.js';
import { GYM, GYM_ENTRY } from '../../shared/gym.js';
import { HALL } from '../../shared/hall.js';
import { SOCCER } from '../../shared/soccer.js';
import { BOWLING } from '../../shared/bowling.js';
import { VENUE } from '../../shared/venue.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import type { Spot } from '../office/input.js';
import { floorView } from '../office/views.js';
import { DjBooth } from '../djset.js';
import { Casino, type CasinoPlayer } from '../casino/index.js';
import { Gym, type GymPlayer } from '../gym/index.js';
import { Turn, readTurnKey } from '../turn.js';
import { CarKeys } from '../carkeys.js';
import { Interiors } from '../interiors.js';
import { RigTable, Rigs } from '../rig.js';
import { Marinas } from '../boats.js';
import { Baumaerkte } from '../baumarkt.js';
import { KinoScreens } from '../kino.js';
import { Postcards } from '../postcards.js';
import { Forecourts } from '../tankstelle.js';
import { Trolleys } from '../../shared/trolley.js';
import { RoofTables } from '../tablegames.js';
import { PadelCourts } from '../padel.js';
import { BungeeRope } from '../bungee.js';
import { Coaster } from '../coaster.js';
import { Soccer } from '../soccer/index.js';
import { RadioProxy } from '../radio.js';
import { Karaoke } from '../bowling/karaoke.js';
import { tvTitleLookup } from '../tv.js';
import { HALL_ARRIVAL, backInHall, hallView } from '../hall.js';
import { SOCCER_ARRIVAL, backInSoccer, soccerView } from '../soccer/place.js';
import { BOWLING_ARRIVAL, BowlingHouse, backInBowling, bowlingView } from '../bowling/place.js';
import { Minigolf } from '../bowling/minigolf.js';
import { VENUE_ARRIVAL, VenueHouse, backInVenue, venueView } from '../venue/place.js';

/** Made last, once upstream's stages are all there (see server.ts). */
export interface Fork {
  djBooth: DjBooth; // DJ sets on the roof
  casino: Casino; // the casino across the street (casino/)
  gym: Gym; // the gym across the street (gym/)
  turn: Turn; // TURN so voice gets through from outside (turn.ts)
  carKeys: CarKeys; // who drives the Bulli
  interiors: Interiors; // how admins had floors furnished (interiors.json)
  rigs: Rigs; // the racing rig in the lounge, one driver a floor, one table for the building
  marinas: Marinas; // the jetskis and the motorboat at each floor's jetty on the beach
  baumaerkte: Baumaerkte; // the Baumarkt on each floor's street: forklift, pallets, trolleys, tools
  kinos: KinoScreens; // the cinema's Saal 2 on each floor's street
  postcards: Postcards; // the Post's postcards, waiting for their recipients (postcards.json)
  forecourts: Forecourts; // the petrol station's pumps and car wash on each floor
  trolleys: Trolleys; // who pushes a supermarket trolley on each floor's street, and what's in it
  roofTables: RoofTables; // the table games on the roof
  padelCourts: PadelCourts; // padel in the hall
  bungeeRope: BungeeRope; // bungee off the roof
  coaster: Coaster; // DER BRECHER, the roller coaster round the tower (coaster.ts)
  soccer: Soccer; // the soccer hall's ball and match
  radio: RadioProxy; // radio stations on the jukebox
  karaoke: Karaoke; // the bowling centre's karaoke bar (bowling/karaoke.ts)
  bowling: BowlingHouse; // the bowling centre's lights (cosmic bowling) and rental shoes
  minigolf: Minigolf; // the bowling centre's black-light mini golf (bowling/minigolf.ts)
  venue: VenueHouse; // the Schallwerk's house: concert or club, the light desk, the effects, stamps, shirts, coats (venue/place.ts)
  /** To everyone up on the roof (or everyone but `except`). */
  toRoof(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** To everyone in the padel hall. */
  toHall(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** To everyone in the bowling centre (its lanes, karaoke and mini golf all talk to the whole room). */
  toBowling(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** To everyone in the Schallwerk (its instruments, rehearsal rooms and show sort out among themselves who hears what). */
  toVenue(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** Tells a floor who's at its racing rig now. */
  rigChanged(floorId: string): void;
  /** A picture hanging on some floor's wall: the one thing a guest may fetch through the image proxy. */
  onAWall(imageUrl: string): boolean;
  casinoPlayer(c: Client): CasinoPlayer;
  gymPlayer(c: Client): GymPlayer;
}

/** The places across the street: like the roof, places of their own with none of a floor's things. */
export const PLACES = [CASINO, GYM, HALL, SOCCER, BOWLING, VENUE] as const;
export const isPlace = (floor: unknown): floor is (typeof PLACES)[number] => (PLACES as readonly unknown[]).includes(floor);

/** Who someone is to the fork's keepers (the casino's wallets, the gym, the postcards). */
export const owner = (c: Client) => (c.accountId ? `account:${c.accountId}` : `name:${c.peer.name}`);

export function createFork(ctx: Ctx): Fork {
  const { cfg, clients, floors } = ctx;
  const to = (place: string) => (m: ServerMsg, except?: string, droppable = false) => {
    const json = JSON.stringify(m);
    for (const o of clients.values()) {
      if (o.id === except || o.peer.floor !== place || o.ws.readyState !== WebSocket.OPEN) continue;
      if (droppable && o.ws.bufferedAmount > 1024 * 1024) continue;
      o.ws.send(json);
    }
  };
  const rigs = new Rigs(new RigTable(cfg.dataDir));
  return {
    djBooth: new DjBooth(cfg.dataDir),
    casino: new Casino(cfg.dataDir),
    gym: new Gym(cfg.dataDir),
    turn: new Turn(readTurnKey(cfg.dataDir), cfg.iceServers),
    carKeys: new CarKeys(cfg.dataDir),
    interiors: new Interiors(cfg.dataDir),
    rigs,
    marinas: new Marinas(),
    baumaerkte: new Baumaerkte(),
    kinos: new KinoScreens(),
    postcards: new Postcards(cfg.dataDir),
    trolleys: new Trolleys(),
    forecourts: new Forecourts((floorId) => {
      const f = floors.get(floorId);
      if (f) ctx.toFloor(f, { t: 'tankstelle', state: ctx.forecourts.of(floorId).state() });
    }),
    roofTables: new RoofTables(),
    padelCourts: new PadelCourts(),
    bungeeRope: new BungeeRope(),
    coaster: new Coaster({
      dataDir: cfg.dataDir, // the rides and records (coaster.json)
      changed: (state) => ctx.broadcast({ t: 'coaster', state }), // the whole building: it's seen from every floor
      storeys: () => floors.size,
      // The ground floor's workers at their desks: the tube runs over their heads.
      typists: () => [...([...floors.values()][0]?.workers.list() ?? [])].map((w) => ({ desk: w.deskId, name: w.name, color: w.color })),
    }),
    soccer: new Soccer({
      where: (id) => {
        const c = clients.get(id);
        return c && c.peer.floor === SOCCER ? c.peer : null;
      },
      dataDir: cfg.dataDir, // the leaderboard (soccer.json)
    }),
    radio: new RadioProxy(),
    karaoke: new Karaoke({
      toAll: (m, except) => to(BOWLING)(m, except),
      toOne: (id, m) => {
        const c = clients.get(id);
        if (c) ctx.sendTo(c, m);
      },
      present: () => [...clients.values()].filter((c) => c.peer.floor === BOWLING).map((c) => c.id),
      dataDir: cfg.dataDir, // the week's karaoke kings (karaoke.json)
      lookup: tvTitleLookup,
    }),
    bowling: new BowlingHouse(),
    minigolf: new Minigolf({
      now: () => Date.now(),
      where: (id) => {
        const c = clients.get(id);
        return c && c.peer.floor === BOWLING ? { x: c.peer.x, z: c.peer.z } : null;
      },
      send: (id, m) => {
        const c = clients.get(id);
        if (c) ctx.sendTo(c, m);
      },
      toAll: (m) => to(BOWLING)(m),
      dataDir: cfg.dataDir, // the records (minigolf.json)
    }),
    venue: new VenueHouse({ dataDir: cfg.dataDir }), // venue.json
    toRoof: to(ROOF),
    toHall: to(HALL),
    toBowling: to(BOWLING),
    toVenue: to(VENUE),
    rigChanged: (floorId) => {
      const f = floors.get(floorId);
      if (f) ctx.toFloor(f, { t: 'rig', state: rigs.state(floorId) });
    },
    onAWall: (imageUrl) => [...floors.values()].some((f) => f.decor.list().some((d) => d.url === imageUrl)),
    casinoPlayer: (c) => ({ id: c.id, owner: owner(c), name: c.peer.name, send: (m) => ctx.sendTo(c, m) }),
    gymPlayer: (c) => ({ id: c.id, owner: owner(c), name: c.peer.name, send: (m) => ctx.sendTo(c, m), where: () => (c.peer.floor === GYM ? { x: c.peer.x, z: c.peer.z, seat: c.peer.seat } : undefined) }),
  };
}

/** What someone arriving in one of the places gets. */
export function placeView(ctx: Ctx, place: (typeof PLACES)[number]): FloorView {
  const empty = floorView(ctx, undefined);
  if (place === HALL) return hallView(empty);
  if (place === SOCCER) return soccerView(empty);
  if (place === BOWLING) return bowlingView(empty);
  if (place === VENUE) return venueView(empty);
  return { ...empty, floor: place };
}

/** Just inside each place's door. */
const ENTRY: Record<(typeof PLACES)[number], Spot> = {
  [CASINO]: { x: CASINO_ENTRY.x, y: 0, z: CASINO_ENTRY.z, rotY: CASINO_ENTRY.rotY },
  [GYM]: { x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY },
  [HALL]: HALL_ARRIVAL,
  [SOCCER]: SOCCER_ARRIVAL,
  [BOWLING]: BOWLING_ARRIVAL,
  [VENUE]: VENUE_ARRIVAL,
};

/** Into one of the places once they're in: the casino, the gym and the soccer hall keep a list of who's there. */
export function enteredPlace(ctx: Ctx, c: Client, place: string | undefined) {
  if (place === CASINO) ctx.casino.enter(ctx.casinoPlayer(c));
  if (place === GYM) ctx.gym.enter(ctx.gymPlayer(c));
  if (place === SOCCER) ctx.soccer.enter({ id: c.id, name: c.peer.name, owner: owner(c), send: (m) => ctx.sendTo(c, m) });
  if (place === BOWLING) ctx.sendTo(c, ctx.bowling.state()); // the lights and who's in rental shoes
  if (place === VENUE) ctx.sendTo(c, ctx.venue.state([...ctx.clients.values()].map((o) => ({ id: o.id, owner: owner(o) })))); // concert or club, the lights, who has what on
}

/** `floor.go` to one of the places, just inside its door. Whether it was one (else upstream's floors and roof). */
export function goToPlace(ctx: Ctx, c: Client, floor: unknown): boolean {
  if (!isPlace(floor)) return false;
  if (!ctx.floors.size || c.peer.floor === floor) return true;
  ctx.goSomewhere(c, floor, ENTRY[floor], placeView(ctx, floor), () => enteredPlace(ctx, c, floor));
  return true;
}

/** Someone coming back in (a reload, a restart) to one of the places, while there's a building for its street. */
export function backInPlace(wanted: string | null, floors: number): (typeof PLACES)[number] | undefined {
  if (!isPlace(wanted) || floors === 0) return undefined;
  if (wanted === HALL) return backInHall(wanted, floors) ? HALL : undefined;
  if (wanted === SOCCER) return backInSoccer(wanted, floors) ? SOCCER : undefined;
  if (wanted === BOWLING) return backInBowling(wanted, floors) ? BOWLING : undefined;
  if (wanted === VENUE) return backInVenue(wanted, floors) ? VENUE : undefined;
  return wanted;
}

/** The roof's own things on top of an empty floor view. */
export const roofExtras = (ctx: Ctx): Partial<FloorView> => ({ dj: ctx.djBooth.state(), tables: ctx.roofTables.state() });

export function startFork(ctx: Ctx) {
  ctx.turn.start();
  ctx.minigolf.start();
  // The office has heard the DJ set that's on (or couldn't): the roof's lights go by its beats.
  ctx.djBooth.onBeats = () => ctx.toRoof({ t: 'dj', state: ctx.djBooth.state() });
}

export function stopFork(ctx: Ctx) {
  ctx.coaster.stop();
  ctx.casino.stop();
  ctx.soccer.stop();
  ctx.karaoke.stop();
  ctx.gym.stop();
  ctx.turn.stop();
  ctx.forecourts.stop();
  ctx.minigolf.stop();
  ctx.venue.stop();
}

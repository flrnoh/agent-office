// flrnoh fork (see FORK.md): what this fork adds to the office's shared context (office/context.ts),
// made after upstream's stages in server.ts, and the places across the street people go to.
import { WebSocket } from 'ws';
import type { FloorView, ServerMsg } from '../../shared/protocol.js';
import { ROOF } from '../../shared/rooftop.js';
import { CASINO, CASINO_ENTRY } from '../../shared/casino.js';
import { GYM, GYM_ENTRY } from '../../shared/gym.js';
import { HALL } from '../../shared/hall.js';
import { SOCCER } from '../../shared/soccer.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';
import type { Spot } from '../office/input.js';
import { floorView } from '../office/views.js';
import { DjBooth } from '../djset.js';
import { Casino, type CasinoPlayer } from '../casino/index.js';
import { Gym, type GymPlayer } from '../gym/index.js';
import { Turn, readTurnKey } from '../turn.js';
import { CarKeys } from '../carkeys.js';
import { RigTable, Rigs } from '../rig.js';
import { RoofTables } from '../tablegames.js';
import { PadelCourts } from '../padel.js';
import { BungeeRope } from '../bungee.js';
import { Soccer } from '../soccer/index.js';
import { RadioProxy } from '../radio.js';
import { HALL_ARRIVAL, backInHall, hallView } from '../hall.js';
import { SOCCER_ARRIVAL, backInSoccer, soccerView } from '../soccer/place.js';

/** Made last, once upstream's stages are all there (see server.ts). */
export interface Fork {
  djBooth: DjBooth; // DJ sets on the roof
  casino: Casino; // the casino across the street (casino/)
  gym: Gym; // the gym across the street (gym/)
  turn: Turn; // TURN so voice gets through from outside (turn.ts)
  carKeys: CarKeys; // who drives the Bulli
  rigs: Rigs; // the racing rig in the lounge, one driver a floor, one table for the building
  roofTables: RoofTables; // the table games on the roof
  padelCourts: PadelCourts; // padel in the hall
  bungeeRope: BungeeRope; // bungee off the roof
  soccer: Soccer; // the soccer hall's ball and match
  radio: RadioProxy; // radio stations on the jukebox
  /** To everyone up on the roof (or everyone but `except`). */
  toRoof(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** To everyone in the padel hall. */
  toHall(m: ServerMsg, except?: string, droppable?: boolean): void;
  /** Tells a floor who's at its racing rig now. */
  rigChanged(floorId: string): void;
  /** A picture hanging on some floor's wall: the one thing a guest may fetch through the image proxy. */
  onAWall(imageUrl: string): boolean;
  casinoPlayer(c: Client): CasinoPlayer;
  gymPlayer(c: Client): GymPlayer;
}

/** The places across the street: like the roof, places of their own with none of a floor's things. */
export const PLACES = [CASINO, GYM, HALL, SOCCER] as const;
export const isPlace = (floor: unknown): floor is (typeof PLACES)[number] => (PLACES as readonly unknown[]).includes(floor);

const owner = (c: Client) => (c.accountId ? `account:${c.accountId}` : `name:${c.peer.name}`);

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
    rigs,
    roofTables: new RoofTables(),
    padelCourts: new PadelCourts(),
    bungeeRope: new BungeeRope(),
    soccer: new Soccer({
      where: (id) => {
        const c = clients.get(id);
        return c && c.peer.floor === SOCCER ? c.peer : null;
      },
    }),
    radio: new RadioProxy(),
    toRoof: to(ROOF),
    toHall: to(HALL),
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
  return { ...empty, floor: place };
}

/** Just inside each place's door. */
const ENTRY: Record<(typeof PLACES)[number], Spot> = {
  [CASINO]: { x: CASINO_ENTRY.x, y: 0, z: CASINO_ENTRY.z, rotY: CASINO_ENTRY.rotY },
  [GYM]: { x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY },
  [HALL]: HALL_ARRIVAL,
  [SOCCER]: SOCCER_ARRIVAL,
};

/** Into one of the places once they're in: the casino, the gym and the soccer hall keep a list of who's there. */
export function enteredPlace(ctx: Ctx, c: Client, place: string | undefined) {
  if (place === CASINO) ctx.casino.enter(ctx.casinoPlayer(c));
  if (place === GYM) ctx.gym.enter(ctx.gymPlayer(c));
  if (place === SOCCER) ctx.soccer.enter({ id: c.id, name: c.peer.name, send: (m) => ctx.sendTo(c, m) });
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
  return wanted;
}

/** The roof's own things on top of an empty floor view. */
export const roofExtras = (ctx: Ctx): Partial<FloorView> => ({ dj: ctx.djBooth.state(), tables: ctx.roofTables.state(), bungee: ctx.bungeeRope.state() });

export function startFork(ctx: Ctx) {
  ctx.turn.start();
}

export function stopFork(ctx: Ctx) {
  ctx.casino.stop();
  ctx.soccer.stop();
  ctx.gym.stop();
  ctx.turn.stop();
}

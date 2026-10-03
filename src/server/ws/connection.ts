import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Session } from '../auth.js';
import type { ClientMsg } from '../../shared/protocol.js';
import { elevatorSpot } from '../../shared/layout.js';
import { lookFromSeed, marksFromParams, sanitizeLook } from '../../shared/avatar.js'; // marksFromParams: flrnoh fork
import { ROOF } from '../../shared/rooftop.js';
import type { Ctx } from '../office/context.js';
import { newClient } from '../office/client.js';
import { COLOR_RE, spotFrom, str } from '../office/input.js';
import { floorView, roofView, screensOf } from '../office/views.js';
import { dispatch } from './dispatch.js';
import { features } from './handlers/index.js';
import { mapNews } from './handlers/settings.js';
import { backInPlace, enteredPlace, isPlace, placeSpotFrom, placeView } from '../fork/office.js'; // flrnoh fork
import { partyGate } from '../party.js';
import { settleLook } from '../fork/looks.js'; // flrnoh fork

/**
 * Someone came in: where they arrive and who they are, the welcome with everything they see, and
 * then whatever they send, until they leave.
 */
export function onConnection(ctx: Ctx, ws: WebSocket, url: URL, session: Session) {
  const { cfg, accounts, clients, chat, building, floors, maps, team, upgrader, ledger, webhook, machine, sky, themes, prompts, leaveOnMerge, signins } = ctx;
  const { sendTo, broadcast, floorInfos, floorsChanged, arrivalFloor, meOf, accountsChanged, limitsOf } = ctx;
  const id = randomBytes(5).toString('hex');
  // Back on the floor they were on before a reload, a restart or closing the tab, else the first floor.
  const wanted = url.searchParams.get('floor');
  // Their floor's gone since (taken off the building, or its checkout deleted): up to the roof instead.
  const gone = !!wanted && wanted !== ROOF && !isPlace(wanted) && !floors.has(wanted); // isPlace: flrnoh fork
  const me = meOf(session.account?.id);
  // Up on the roof, as long as there's a building under it.
  const onRoof = (wanted === ROOF || gone || (!wanted && !!me.party)) && floors.size > 0; // fork: party guests arrive at the rooftop bar
  const place = backInPlace(wanted, floors.size); // fork: back in the casino, the gym, a hall
  const floor = onRoof || place ? undefined : arrivalFloor(wanted);
  // Back where they were standing on it too; anywhere else, they arrive by elevator.
  const back = !gone && wanted !== null && (onRoof || !!place || floor?.id === wanted);
  const spot = (back && (place ? placeSpotFrom(place, url.searchParams) : spotFrom(url.searchParams))) || { ...elevatorSpot(), y: 0, rotY: 0 }; // placeSpotFrom: flrnoh fork
  const account = session.account;
  // An account's name is its own; on the shared password people pick one.
  const name = account?.name ?? (str(url.searchParams.get('name'), 24).trim() || `Guest ${id.slice(0, 3)}`);
  const colorParam = url.searchParams.get('color') ?? '';
  const intParam = (k: string) => (url.searchParams.get(k) ? Number(url.searchParams.get(k)) : undefined);
  const client = newClient(id, ws, { accountId: account?.id, admin: me.admin, guest: me.guest, bulli: me.bulli, party: me.party }, {
    id,
    name,
    color: COLOR_RE.test(colorParam) ? colorParam : '#4f86f7',
    look: sanitizeLook({ skin: intParam('skin'), hair: intParam('hair'), style: intParam('style'), ...marksFromParams(url.searchParams) }, lookFromSeed(id)), // marksFromParams: flrnoh fork
    x: spot.x,
    y: spot.y,
    z: spot.z,
    // The way they were facing, or out through the elevator's doors.
    rotY: spot.rotY,
    moving: false,
    voice: false,
    muted: true,
    sharing: false,
    ...(account ? { account: true } : {}),
    ...(url.searchParams.get('lite') === '1' ? { lite: true } : {}),
    ...(onRoof ? { floor: ROOF } : place ? { floor: place } : floor ? { floor: floor.id } : {}),
  });
  // Maps of your own may have been added or edited since: everyone already in hears first.
  const mapWas = maps.pick();
  if (maps.reload()) mapNews(ctx, mapWas);
  partyGate(ws, () => client.party); // fork: all a party guest gets goes through party.ts
  settleLook(ctx, client, true); // fork: an account's look from any browser, the smoking jacket an admin's alone
  clients.set(id, client);
  if (account) accounts.seen(account.id);
  ws.on('pong', () => (client.isAlive = true));

  sendTo(client, {
    t: 'welcome',
    you: id,
    peers: [...clients.values()].map((c) => c.peer),
    floors: floorInfos(),
    projectsDir: building.projectsDirState(),
    ice: ctx.turn.servers(), // fork: plus Cloudflare TURN when there's a key (turn.ts)
    chat: chat.recent(50),
    invites: team.available || !!cfg.tailnet,
    version: upgrader.version,
    upgrade: upgrader.state,
    usage: ledger.state(),
    limits: limitsOf(client).state,
    me,
    notify: webhook.state(),
    machine: machine.state(),
    sky: sky.state,
    theme: themes.state(),
    map: maps.state(),
    prompts: prompts.state(),
    leaveOnMerge: leaveOnMerge.state(),
    ...(onRoof ? roofView(ctx) : place ? placeView(ctx, place) : floorView(ctx, floor)),
  });
  enteredPlace(ctx, client, place); // fork
  screensOf(ctx, client, floor);
  broadcast({ t: 'peer.join', peer: client.peer }, id);
  if (account) accountsChanged(); // now online
  floorsChanged();
  if (floor) {
    floor.arrived();
    // Anyone whose process ended since (exited, or failed to resume) gets up as you walk in.
    floor.workers.wakeAll();
  }
  limitsOf(client).refresh();
  if (account) {
    sendTo(client, { t: 'signins', state: signins.state(account.id) });
    void signins.look(account.id);
  }

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || client.out) return;
    dispatch(ctx, client, msg);
  });
  ws.on('close', () => {
    clients.delete(id);
    // Each feature lets go of what they had (see FeatureHooks), then of what they had on each floor.
    for (const f of features) f.closed?.(ctx, client);
    for (const floor of floors.values()) for (const f of features) f.closedOn?.(ctx, client, floor);
    broadcast({ t: 'peer.leave', id });
    if (account) accountsChanged();
    floorsChanged();
  });
  ws.on('error', () => ws.terminate());
}

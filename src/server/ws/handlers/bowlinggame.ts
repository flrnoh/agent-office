// flrnoh fork (see FORK.md "Bowling lanes"): the bowling game's messages (shared/bowling-game.ts),
// and its lanes let go of whoever leaves the bowling centre or the office.
import { BOWLING } from '../../../shared/bowling.js';
import type { BowlingGameClientMsg, BowlingGameServerMsg, LeagueBoard } from '../../../shared/bowling-game.js';
import type { Ctx } from '../../office/context.js';
import type { Client } from '../../office/client.js';
import { BowlingLanes } from '../../bowling/lanes.js';
import { BowlingLeague } from '../../bowling/league.js';
import type { FeatureHooks, HandlerMap } from './types.js';

/** The lanes and the league, one of each per office (made the first time anyone needs them). */
interface Alley {
  lanes: BowlingLanes;
  league: BowlingLeague;
}
const alleys = new WeakMap<Ctx, Alley>();
export function alleyOf(ctx: Ctx): Alley {
  let a = alleys.get(ctx);
  if (!a) {
    const league = new BowlingLeague(ctx.cfg.dataDir);
    a = { league, lanes: new BowlingLanes((g) => league.record(g)) };
    alleys.set(ctx, a);
  }
  return a;
}

const inside = (c: Client) => c.peer.floor === BOWLING;
/** Who someone is to the league: fork/office.ts's `owner` (not imported: that would import this file back through the views). */
const owner = (c: Client) => (c.accountId ? `account:${c.accountId}` : `name:${c.peer.name}`);
const send = (ctx: Ctx, c: Client, m: BowlingGameServerMsg) => ctx.sendTo(c, m);
const toAll = (ctx: Ctx, m: BowlingGameServerMsg, droppable = false) => ctx.toBowling(m, undefined, droppable);
const laneNews = (ctx: Ctx, lanes: Iterable<number>) => {
  const a = alleyOf(ctx);
  for (const lane of new Set(lanes)) toAll(ctx, { t: 'bowl.lane', lane: a.lanes.view(lane) });
};

/** The league's board, with who in the centre right now is last week's champion (they wear the crown). */
function board(ctx: Ctx, now: number): LeagueBoard {
  const { board: b, champion } = alleyOf(ctx).league.board(now);
  const crowned = champion ? [...ctx.clients.values()].filter((o) => inside(o) && owner(o) === champion).map((o) => o.id) : [];
  return { ...b, crowned };
}

type Msg<K extends BowlingGameClientMsg['t']> = Extract<BowlingGameClientMsg, { t: K }>;

export const bowlingGameHandlers = {
  'bowl.look'(ctx, c) {
    if (!inside(c)) return;
    const a = alleyOf(ctx);
    send(ctx, c, { t: 'bowl.lanes', lanes: a.lanes.views() });
    // Everyone gets the board again: whoever just came in may be wearing the crown.
    toAll(ctx, { t: 'bowl.board', board: board(ctx, Date.now()) });
  },
  'bowl.join'(ctx, c, msg: Msg<'bowl.join'>) {
    if (!inside(c)) return;
    const res = alleyOf(ctx).lanes.join({ id: c.id, owner: owner(c), name: c.peer.name, color: c.peer.color }, msg.lane, Date.now());
    if ('error' in res) return ctx.warn(c, res.error);
    laneNews(ctx, res.lanes);
  },
  'bowl.leave'(ctx, c) {
    const lane = alleyOf(ctx).lanes.leave(c.id, Date.now());
    if (lane !== undefined) laneNews(ctx, [lane]);
  },
  'bowl.ball'(ctx, c, msg: Msg<'bowl.ball'>) {
    if (!inside(c)) return;
    const lane = alleyOf(ctx).lanes.pickBall(c.id, msg.ball);
    if (lane !== undefined) laneNews(ctx, [lane]);
  },
  'bowl.new'(ctx, c, msg: Msg<'bowl.new'>) {
    if (!inside(c)) return;
    const res = alleyOf(ctx).lanes.newGame(c.id, msg.lane, Date.now());
    if ('error' in res) return ctx.warn(c, res.error);
    laneNews(ctx, [msg.lane]);
  },
  'bowl.skip'(ctx, c) {
    if (!inside(c)) return;
    const a = alleyOf(ctx);
    const lane = a.lanes.laneOf(c.id);
    const gone = lane >= 0 ? a.lanes.skip(c.id, lane, Date.now()) : null;
    if (!gone) return;
    laneNews(ctx, [lane]);
    const o = ctx.clients.get(gone);
    if (o) ctx.warn(o, `🎳 Du warst zu lange dran: ${c.peer.name} hat dich auf Bahn ${lane + 1} übersprungen`);
  },
  'bowl.throw'(ctx, c, msg: Msg<'bowl.throw'>) {
    if (!inside(c)) return;
    const now = Date.now();
    const res = alleyOf(ctx).lanes.throw(c.id, msg.lane, msg.params, now);
    if ('error' in res) return ctx.warn(c, res.error);
    toAll(ctx, { t: 'bowl.roll', roll: res.roll });
    if (res.over) {
      toAll(ctx, { t: 'bowl.over', lane: res.roll.lane, scores: res.over });
      toAll(ctx, { t: 'bowl.board', board: board(ctx, now) });
    }
  },
  'bowl.stats'(ctx, c) {
    const a = alleyOf(ctx);
    send(ctx, c, { t: 'bowl.stats', board: board(ctx, Date.now()), mine: a.league.mine(owner(c), c.peer.name) });
  },
} satisfies HandlerMap<BowlingGameClientMsg>;

/** Out of the centre, or out of the office: off their lane, and everyone still there told. */
const offLane = (ctx: Ctx, c: Client) => {
  const lane = alleyOf(ctx).lanes.leave(c.id, Date.now());
  if (lane !== undefined) ctx.toBowling({ t: 'bowl.lane', lane: alleyOf(ctx).lanes.view(lane) }, c.id);
};

export const bowlingGameHooks: FeatureHooks = {
  leaving: (ctx, c) => offLane(ctx, c),
  closed: (ctx, c) => offLane(ctx, c),
};

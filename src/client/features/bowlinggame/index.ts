/**
 * flrnoh fork (see FORK.md "Bowling lanes"): the bowling game in the bowling centre. Six lanes with
 * their machines, ball returns, consoles, benches and monitors, built into the centre's room through
 * its seam (addBowlingPart, world/bowling/parts.ts); joining a lane at its console, a house ball off
 * the return, bowling from the approach (play.ts), everyone's balls and pins played back (view.ts),
 * the score sheets and the league's board (monitor.ts), its windows (ui.ts), and cosmic bowling's
 * neon. The office counts every ball (server/bowling/lanes.ts).
 */
import * as THREE from 'three';
import { BOWLING } from '../../../shared/bowling';
import { BALLS, PAIRS, laneName, pinCount, type LaneView, type LeagueBoard, type ThrowParams } from '../../../shared/bowling-game';
import { pinsUp, position } from '../../../shared/bowling-score';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { clip, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import { addBowlingPart } from '../../world/bowling/parts';
import { buildLanes, type LanesBuilt } from './lanes3d';
import { buildMachines, type Machines } from './machine';
import { buildFurniture, type Furniture } from './furniture';
import { drawBoard, drawConsole, drawSheet } from './monitor';
import { Bowler } from './play';
import { cosmicProps } from './props';
import { LanesView } from './view';
import { openBalls, openLeague } from './ui';
import { crownMesh } from './crown';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts), and the lane each is for.
declare module '../../world/types' {
  interface InteractKinds {
    bowlconsole: true;
    bowlreturn: true;
    bowlapproach: true;
    bowlboard: true;
  }
  interface Interactable {
    /** Fork: which of the bowling centre's lanes (shared/bowling.ts LANE_X), for the bowling game's kinds. */
    bowlLane?: number;
  }
}

export interface BowlingGameDeps {
  /** Someone else in the centre, as you see them. */
  personOf(id: string): Person | undefined;
}

export function installBowlingGame(ctx: Ctx, deps: BowlingGameDeps) {
  /** What the office last said about each lane, and the league's board. */
  const views: (LaneView | null)[] = [null, null, null, null, null, null];
  let board: LeagueBoard | null = null;
  let built: { lanes: LanesBuilt; machines: Machines; furniture: Furniture; lv: LanesView; root: THREE.Object3D } | null = null;
  let inside = false;
  let cosmic = false;
  let glow = 0;
  let propsCosmic = false;
  let boardDirty = true;
  const dirty = new Set<number>();
  /** When you let go of your last ball (performance.now()), to play it back in step with your steps. */
  let sentAt = 0;
  let league: ReturnType<typeof openLeague> | null = null;

  const me = () => store.you;
  const person = (id: string): Person | undefined => (id === me() ? ctx.me : deps.personOf(id));
  const myLane = () => views.findIndex((v) => !!v?.players.some((p) => p.id === me()));
  const myBall = () => views.flatMap((v) => v?.players ?? []).find((p) => p.id === me())?.ball ?? 4;
  const isUp = (lane: number) => views[lane]?.up === me();

  const bowler = new Bowler(ctx.player, ctx.camera, () => built?.lv ?? null, {
    bowl: (lane: number, params: ThrowParams) => {
      sentAt = performance.now();
      ctx.net.send({ t: 'bowl.throw', lane, params });
    },
    up: isUp,
    lbs: () => BALLS[myBall()]?.lbs ?? 12,
    where: (lane) => {
      const p = views[lane]?.players.find((x) => x.id === me());
      if (!p) return '';
      const pos = position(p.rolls);
      return `frame ${pos.frame + 1}, ball ${pos.ball + 1} · ${pinsUp(p.rolls)} up`;
    },
    changed: () => ctx.hint.invalidate(),
  });

  ctx.activities.add({
    id: 'bowling',
    active: () => bowler.active,
    stop: (why) => {
      if (why !== 'taken') bowler.stop();
    },
    // On the approach, E steps off it (Space bowls, see Bowler); nothing else is in reach, no emotes mid-swing.
    key: (e) => {
      if (e.code !== 'KeyF' && e.code !== 'KeyG' && !(e.code in DESK_KEYS) && !/^(?:Digit|Numpad)[1-6]$/.test(e.code)) return false;
      if (e.code === 'KeyE' && (bowler.stage === 'aim' || bowler.stage === 'charge')) bowler.stop();
      return true;
    },
    hint: (el) =>
      ctx.hint.draw(el, `bowl|${bowler.stage}`, () =>
        bowler.stage === 'aim'
          ? [key('Space', 'Hold to bowl'), key('Mouse', 'Line'), key('A D', 'Across'), key('W S', 'Up / back'), key('E', 'Step off')]
          : bowler.stage === 'charge'
            ? [hintTitle('🎳 Let go to bowl'), aside('mouse or A D: hook'), key('Space', 'Let go')]
            : [hintTitle('🎳 Down the lane…')],
      ),
    takesCamera: true,
    hidesHands: true,
    bothHands: true,
  });

  // ---- What you can use ----
  const laneTitle = (lane: number) => `🎳 Bahn ${laneName(lane)}`;
  ctx.interactions.define('bowlconsole', {
    reach: 2.4,
    hint: (it) => {
      const lane = it.bowlLane ?? 0;
      const v = views[lane];
      const n = v?.players.length ?? 0;
      const mine = !!v?.players.some((p) => p.id === me());
      const up = v?.players.find((p) => p.id === v.up);
      const waiting = up && up.id !== me() && v && store.officeNow() - v.upSince > 90_000;
      const about = v?.over ? 'game over' : up ? `${clip(up.name, 18)} is up` : `${n}/6 playing`;
      const parts = [hintTitle(laneTitle(lane)), aside(about)];
      if (mine) {
        if (v?.over || !v?.players.some((p) => p.rolls.length) || n === 1) parts.push(key('E', 'New game'));
        else if (waiting) parts.push(key('E', `Skip ${clip(up!.name, 14)}`));
        parts.push(key('X', 'Leave the lane'));
      } else parts.push(key('E', n >= 6 ? 'Full' : 'Play'));
      return { k: `con|${lane}|${about}|${mine}|${waiting}`, parts };
    },
    use: (it, k) => {
      const lane = it.bowlLane ?? 0;
      const v = views[lane];
      const mine = !!v?.players.some((p) => p.id === me());
      if (k === 'X' && mine) return ctx.net.send({ t: 'bowl.leave' });
      if (k !== 'E') return;
      if (!mine) return ctx.net.send({ t: 'bowl.join', lane });
      const up = v?.players.find((p) => p.id === v.up);
      if (up && up.id !== me() && v && store.officeNow() - v.upSince > 90_000 && !v.over) return ctx.net.send({ t: 'bowl.skip' });
      ctx.net.send({ t: 'bowl.new', lane });
    },
  });
  ctx.interactions.define('bowlreturn', {
    reach: 2,
    hint: (it) => {
      const pair = PAIRS.findIndex((p) => p.lanes.includes((it.bowlLane ?? 0) as 0));
      const b = BALLS[myBall()];
      return { k: `ret|${b.id}`, parts: [hintTitle(`🎳 Kugelrückgabe ${PAIRS[pair]?.lanes.map((l) => laneName(l)).join('/') ?? ''}`), aside(myLane() >= 0 ? `yours: ${b.name}, ${b.lbs} lbs` : 'house balls, 8–16 lbs'), key('E', 'Pick a ball')] };
    },
    use: (_it, k) => {
      if (k !== 'E') return;
      if (myLane() < 0) return toast('🎳 Join a lane at its console first', 'warn');
      openBalls(myBall(), (ball) => ctx.net.send({ t: 'bowl.ball', ball }));
    },
  });
  ctx.interactions.define('bowlapproach', {
    reach: 1.6,
    hint: (it) => {
      const lane = it.bowlLane ?? 0;
      const v = views[lane];
      const up = v?.players.find((p) => p.id === v.up);
      if (isUp(lane)) {
        const busy = built?.lv.busy(lane);
        return { k: `app|${lane}|up|${busy}`, parts: [hintTitle(`${laneTitle(lane)} · your ball`), aside(busy ? 'the pinsetter’s at work…' : `${pinsUp(v!.players.find((p) => p.id === me())!.rolls)} pins up`), ...(busy ? [] : [key('E', 'Step up')])] };
      }
      return { k: `app|${lane}|${up?.id}`, parts: [hintTitle(laneTitle(lane)), aside(up ? `${clip(up.name, 18)} is up` : v?.players.length ? 'game over' : 'free: join at the console')] };
    },
    use: (it, k) => {
      const lane = it.bowlLane ?? 0;
      if (k !== 'E' || !isUp(lane) || built?.lv.busy(lane) || bowler.active) return;
      ctx.activities.stopAll('start');
      bowler.start(lane);
    },
  });
  ctx.interactions.define('bowlboard', {
    reach: 3,
    hint: () => ({ k: 'board', parts: [hintTitle('🏆 Liga & Bestenliste'), aside(board?.champion ? `👑 ${clip(board.champion.name, 18)}` : 'the week, all time, your games'), key('E', 'Open')] }),
    use: (_it, k) => {
      if (k !== 'E') return;
      league = openLeague(
        () => ctx.net.send({ t: 'bowl.stats' }),
        () => (league = null),
      );
    },
  });

  // ---- The office's news ----
  const changed = (lane: number) => {
    dirty.add(lane);
    ctx.hint.invalidate();
  };
  ctx.messages.on('bowl.lanes', (msg) => {
    for (const v of msg.lanes) views[v.lane] = v;
    built?.lv.setAll(msg.lanes);
    for (let l = 0; l < views.length; l++) changed(l);
  });
  ctx.messages.on('bowl.lane', (msg) => {
    views[msg.lane.lane] = msg.lane;
    built?.lv.set(msg.lane);
    changed(msg.lane.lane);
  });
  ctx.messages.on('bowl.roll', (msg) => {
    const r = msg.roll;
    views[r.lane] = r.view;
    const ago = r.by === me() && sentAt ? (performance.now() - sentAt) / 1000 : 0;
    built?.lv.roll(r, Math.min(1, ago));
    changed(r.lane);
  });
  ctx.messages.on('bowl.board', (msg) => {
    board = msg.board;
    boardDirty = true;
  });
  ctx.messages.on('bowl.stats', (msg) => {
    board = msg.board;
    boardDirty = true;
    league?.fill(msg.board, msg.mine);
  });
  ctx.messages.on('bowl.over', (msg) => {
    if (!inside) return;
    const top = msg.scores[0];
    if (top) toast(`🎳 Bahn ${laneName(msg.lane)}: ${msg.scores.map((s) => `${s.name} ${s.score}`).join(' · ')}`);
  });

  // ---- The crown on last week's champion ----
  const crowns = new Map<string, { on: Person; mesh: THREE.Object3D }>();
  function placeCrowns() {
    const want = new Set(inside ? (board?.crowned ?? []) : []);
    for (const [id, c] of crowns) {
      const p = person(id);
      if (!want.has(id) || p !== c.on || store.peers.get(id)?.floor !== BOWLING) {
        c.mesh.removeFromParent();
        crowns.delete(id);
      }
    }
    for (const id of want) {
      if (crowns.has(id)) continue;
      const p = person(id);
      if (!p || (id !== me() && store.peers.get(id)?.floor !== BOWLING)) continue;
      const mesh = crownMesh();
      p.wear(mesh, 'head');
      crowns.set(id, { on: p, mesh });
    }
  }

  // ---- Joining the centre's room ----
  addBowlingPart({
    build(room) {
      const lanes = buildLanes(room.group);
      const machines = buildMachines(room.group);
      const furniture = buildFurniture(room.group);
      const lv = new LanesView({
        root: room.group,
        machines,
        furniture,
        sound: (k, at, s) => ctx.sound.bowling(k, at, s),
        rolling: (lane, at, speed, gutter) => ctx.sound.bowlRoll(lane, at, speed, gutter),
        person,
        confetti: (x, y, z, n, power) => {
          const v = room.group.localToWorld(new THREE.Vector3(x, y, z));
          ctx.confetti.burst(v.x, v.y, v.z, n, power);
        },
        changed,
      });
      room.group.add(bowler.guide);
      room.colliders.push(...lanes.colliders, ...furniture.colliders);
      room.interactables.push(...furniture.interactables);
      built = { lanes, machines, furniture, lv, root: room.group };
      const known = views.filter((v): v is LaneView => !!v);
      if (known.length) lv.setAll(known);
      for (let l = 0; l < views.length; l++) dirty.add(l);
      boardDirty = true;
      if (cosmic) glow = 0.999;
    },
    place(yes) {
      inside = yes;
      if (yes) ctx.net.send({ t: 'bowl.look' });
      else {
        bowler.stop();
        league?.modal.close();
      }
      placeCrowns();
    },
    lights(l) {
      cosmic = l === 'cosmic';
    },
    update(_t, dt) {
      if (!built) return;
      const { lv, furniture, lanes, machines } = built;
      lv.update();
      // Cosmic bowling fades in and out.
      const to = cosmic ? 1 : 0;
      if (glow !== to) {
        glow = Math.abs(to - glow) < 0.01 ? to : glow + (to - glow) * Math.min(1, dt * 2.5);
        lanes.glow(glow);
        machines.glow(glow);
      }
      if (glow > 0.5 !== propsCosmic) {
        propsCosmic = glow > 0.5;
        cosmicProps(propsCosmic);
        for (let l = 0; l < views.length; l++) dirty.add(l);
        boardDirty = true;
      }
      const neon = glow > 0.5;
      for (let lane = 0; lane < views.length; lane++) {
        const party = lv.party(lane);
        if (!dirty.has(lane) && !party) continue;
        dirty.delete(lane);
        const m = furniture.monitors[lane];
        drawSheet(m.g, lv.shown(lane), { cosmic: neon, party, rolling: lv.rolling(lane) ? 'yes' : null });
        m.texture.needsUpdate = true;
        const c = furniture.consoles[lane];
        drawConsole(c.g, lv.shown(lane), lane, neon);
        c.texture.needsUpdate = true;
      }
      if (boardDirty) {
        boardDirty = false;
        drawBoard(furniture.board.g, board, neon);
        furniture.board.texture.needsUpdate = true;
        placeCrowns();
      }
      // Those who left (or came) since: the crown follows the champion.
      if (crowns.size || board?.crowned.length) placeCrowns();
      // Pulled away from the approach (a trip, a seat): off it.
      if (bowler.active && (ctx.trip() || ctx.player.seat)) bowler.stop();
      bowler.update(dt);
    },
  });

  return {
    bowler,
    /** For the console: the lanes as the page knows them, and the pins standing on each. */
    lanes: () => views.map((v) => v && { lane: v.lane, players: v.players.map((p) => p.name), up: v.up, pins: pinCount(v.pins.reduce((m, p) => m | (1 << p.n), 0)) }),
  };
}

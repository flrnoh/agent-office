/**
 * The black-light mini golf in the bowling centre (flrnoh fork, see FORK.md "Black-light mini golf"):
 * the room and its nine holes (built into the centre the first time anyone goes in, through
 * addBowlingPart), the putter and the ball from the stand, putting, everyone's balls rolling the same
 * way on every page, the scorecard and the board, the sounds.
 */
import * as THREE from 'three';
import { BOWLING } from '../../../shared/bowling';
import { HOLES, toRoom, type HoleDef } from '../../../shared/minigolf-holes';
import { inPoly, sailAngle, simulate } from '../../../shared/minigolf-physics';
import { MG_BOARD, MG_ROOM, MG_STAND, clockSec, type MgMine, type MgPlayer, type MgShot, type MgView } from '../../../shared/minigolf';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import { DESK_KEYS } from '../../interaction';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { addBowlingPart, type BowlingRoom } from '../../world/bowling/parts';
import { drawBoard } from './board';
import { Balls } from './balls';
import { buildHole, type HoleView } from './course';
import { buildObstacles, type Obstacles } from './obstacles';
import { Putter } from './putting';
import { buildRoom, type MinigolfRoom } from './room';
import { ballSound, showEvent, standing } from './show';
import { MinigolfUi } from './ui';

/** What you can use in the room: the stand, the board, the first tee, and along each hole. */
type MgSpot = { what: 'stand' | 'board' | 'tee' | 'lane'; hole?: number };

declare module '../../world/types' {
  interface InteractKinds {
    minigolf: true;
  }
  interface Interactable {
    /** Fork: what it is in the bowling centre's mini golf (features/minigolf). */
    mg?: MgSpot;
  }
}

export interface MinigolfDeps {
  /** Up off whatever you're sitting on. */
  standUp(): void;
  /** Stops a walk over to someone. */
  stopWalking(): void;
  /** Someone else, as you see them. */
  personOf(id: string): Person | undefined;
}

interface Built {
  room: MinigolfRoom;
  group: THREE.Group;
  holes: HoleView[];
  obstacles: Obstacles;
  balls: Balls;
}

export function installMinigolf(ctx: Ctx, deps: MinigolfDeps) {
  let built: Built | null = null;
  let view: MgView | null = null;
  let mine: MgMine | null = null;
  /** The office's clock, as an offset from this page's (the best guess: the latest a message could have been sent). */
  let offset: number | null = null;
  let boardDirty = true;
  let boardAt = 0;
  let lastUse = 0;
  let wasMyTurn = false;
  let sailQuarter = -1;
  const ui = new MinigolfUi();
  const shared = () => Date.now() + (offset ?? 0);
  const inCentre = () => store.floor === BOWLING;

  const toWorld = (v: THREE.Vector3) => (built ? built.group.localToWorld(v.clone()) : v.clone());
  const toRoomPoint = (v: THREE.Vector3) => (built ? built.group.worldToLocal(v.clone()) : v.clone());
  /** Where you stand in the room. */
  const myRoomPos = () => toRoomPoint(ctx.player.pos);
  const inRoom = () => {
    if (!inCentre() || !built) return false;
    const p = myRoomPos();
    return p.x > MG_ROOM.minX && p.x < MG_ROOM.maxX && p.z > MG_ROOM.minZ && p.z < MG_ROOM.maxZ;
  };

  const me = (): MgPlayer | null => view?.players.find((p) => p.id === store.you) ?? null;
  function turn(): { mine: boolean; whose: string | null } {
    const p = me();
    if (!p?.group) return { mine: true, whose: null };
    const g = view?.groups.find((x) => x.id === p.group);
    if (!g || !g.turn) return { mine: false, whose: null };
    if (g.turn === p.id) return { mine: true, whose: p.name };
    return { mine: false, whose: view?.players.find((x) => x.id === g.turn)?.name ?? null };
  }
  /** Where your ball lies to be putted (null: rolling, down, or none). */
  function lie(): { def: HoleDef; x: number; z: number } | null {
    const p = me();
    if (!p || p.hole < 1 || p.card[p.hole - 1] !== null || !built) return null;
    const def = HOLES[p.hole - 1];
    const w = built.balls.where(p.id);
    if (built.balls.rolling(p.id)) return null;
    if (w?.ball && w.ended && w.hole === def.n) {
      if (w.ball.mode === 'cup') return null;
      if (w.ball.mode === 'rest') return { def, x: w.ball.x, z: w.ball.z };
    }
    if (p.rolling) return null;
    return { def, x: p.ball.x, z: p.ball.z };
  }

  const putter = new Putter(ctx.player, ctx.me, ctx.camera, {
    lie,
    turn,
    ball: () => {
      const w = built?.balls.where(store.you);
      if (!w) return null;
      return { at: w.at, rolling: !!built?.balls.rolling(store.you), holed: w.ball?.mode === 'cup' };
    },
    putt: (def, dir, power) => {
      const from = lie();
      if (!from || !built) return;
      const at = Math.round(shared());
      const shot: MgShot = { id: store.you, hole: def.n, from: { x: from.x, z: from.z }, dir, power, at, result: simulate(def.course, from, dir, power, clockSec(at)) };
      built.balls.shoot(shot, true);
      ctx.net.send({ t: 'mg.putt', hole: def.n, dir, power, at });
      const p = toRoom(def, from.x, from.z);
      ctx.sound.minigolf('putt', toWorld(new THREE.Vector3(p.x, def.base, p.z)), power);
    },
    pickup: () => ctx.net.send({ t: 'mg.pickup' }),
    toWorld,
    done: () => {
      ctx.net.send({ t: 'act', golf: false });
      ctx.hint.invalidate();
    },
    changed: () => ctx.hint.invalidate(),
  });

  /** Over your ball with the putter. */
  function address() {
    if (putter.active || ctx.trip()) return;
    if (!lie()) return;
    if (ctx.player.seat) deps.standUp();
    ctx.activities.stopAll('start');
    deps.stopWalking();
    if (putter.start()) ctx.net.send({ t: 'act', golf: true });
  }

  // ---- The room, built into the centre --------------------------------------------------------------

  function build(room: BowlingRoom) {
    if (built) return;
    const r = buildRoom();
    const group = r.group;
    const holes = HOLES.map((def) => buildHole(def));
    for (const v of holes) group.add(v.group);
    const obstacles = buildObstacles(holes);
    const balls = new Balls(group, {
      shared,
      event: (e, at, hole) => {
        if (e.k === 'kick' || (e.k === 'hit' && e.tag === 'bumper')) obstacles.flash(hole, e.x, e.z);
        const s = ballSound(e, hole);
        if (s && inCentre()) ctx.sound.minigolf(s, toWorld(at), Math.min(1, e.speed / 3));
      },
    });
    group.add(putter.guide);
    room.group.add(group);
    room.colliders.push(...r.colliders, ...obstacles.colliders);
    room.interactables.push(...spots());
    built = { room: r, group, holes, obstacles, balls };
    if (view) balls.set(view);
    boardDirty = true;
  }

  /** The stand, the board, the first tee, and points along every hole (E there: over your ball). */
  function spots(): Interactable[] {
    const out: Interactable[] = [
      { kind: 'minigolf', mg: { what: 'stand' }, x: MG_STAND.x, z: MG_STAND.z - 0.45, radius: 0.9 },
      { kind: 'minigolf', mg: { what: 'board' }, x: MG_BOARD.x, z: MG_BOARD.z - 0.4, radius: 1.6 },
    ];
    const t1 = toRoom(HOLES[0], HOLES[0].tee.x, HOLES[0].tee.z);
    out.push({ kind: 'minigolf', mg: { what: 'tee', hole: 1 }, x: t1.x, z: t1.z, radius: 0.7 });
    for (const def of HOLES) {
      const b = def.course.bounds;
      for (let x = b.minX + 0.4; x < b.maxX; x += 1.1) {
        for (let z = b.maxZ - 0.4; z > b.minZ; z -= 1.1) {
          if (!def.course.surfaces.some((s) => inPoly(s.poly, x, z))) continue;
          if (def.n === 1 && Math.hypot(x - def.tee.x, z - def.tee.z) < 0.8) continue;
          const p = toRoom(def, x, z);
          out.push({ kind: 'minigolf', mg: { what: 'lane', hole: def.n }, x: p.x, z: p.z, radius: 0.75 });
        }
      }
    }
    return out;
  }

  // ---- E and the hint -------------------------------------------------------------------------------

  function use(it: Interactable, k: string): boolean {
    if (it.kind !== 'minigolf' || !it.mg) return false;
    if (k !== 'E') return true;
    // Some pages may hear one press twice (the part and the kind): once is enough.
    if (performance.now() - lastUse < 150 || putter.justStopped) return true;
    lastUse = performance.now();
    const p = me();
    const spot = it.mg;
    if (spot.what === 'stand') {
      if (!p) {
        ctx.net.send({ t: 'mg.take' });
        ctx.sound.minigolf('take');
      } else {
        if (putter.active) putter.stop();
        ctx.net.send({ t: 'mg.return' });
        toast(p.hole > 0 && (p.strokes > 0 || p.card.some((n) => n !== null)) ? '⛳ Schläger zurück – die Runde ist vorbei' : '⛳ Schläger & Ball zurückgegeben');
      }
      return true;
    }
    if (spot.what === 'board') {
      ui.toggle();
      return true;
    }
    if (!p) {
      toast('⛳ Erst Schläger & Ball holen – am Stand gleich am Eingang', 'warn');
      return true;
    }
    const fresh = p.hole === 0 || (p.hole === 1 && p.strokes === 0 && p.card.every((n) => n === null));
    if (spot.what === 'tee' && fresh && !p.group) {
      ctx.net.send({ t: 'mg.group' });
      return true;
    }
    if (p.hole === 0) {
      toast('⛳ Runde fertig – am ersten Abschlag geht’s neu los', 'warn');
      return true;
    }
    if (spot.hole !== p.hole) {
      toast(`⛳ Dein Ball liegt auf Bahn ${p.hole}`, 'warn');
      return true;
    }
    if (!lie()) {
      toast(p.card[p.hole - 1] !== null ? '⛳ Warte auf die anderen' : '⛳ Der Ball rollt noch');
      return true;
    }
    address();
    return true;
  }

  function hint(it: Interactable): { k: string; parts: (HTMLElement | string)[] } | null {
    if (it.kind !== 'minigolf' || !it.mg) return null;
    const p = me();
    const spot = it.mg;
    if (spot.what === 'stand') {
      return p ? { k: 'stand|back', parts: [hintTitle('⛳ Schläger & Bälle'), key('E', 'Zurückgeben')] } : { k: 'stand|take', parts: [hintTitle('⛳ Schläger & Bälle'), aside('Schwarzlicht-Minigolf · 9 Bahnen'), key('E', 'Schläger & Ball nehmen')] };
    }
    if (spot.what === 'board') return { k: 'board', parts: [hintTitle('📋 Scorekarte'), key('E', ui.open ? 'Zumachen' : 'Ansehen'), aside('oder Tab')] };
    const def = HOLES[(spot.hole ?? 1) - 1];
    const title = hintTitle(`⛳ Bahn ${def.n} · ${def.name} · Par ${def.par}`);
    const here = (view?.players ?? []).filter((x) => x.hole === def.n && x.id !== store.you).map((x) => x.name);
    const others = here.length ? aside(`hier: ${here.slice(0, 3).join(', ')}${here.length > 3 ? ' …' : ''}`) : '';
    if (!p) return { k: `lane|${def.n}|none|${here.join()}`, parts: [title, others, aside('Schläger & Bälle am Eingang')] };
    const fresh = p.hole === 0 || (p.hole === 1 && p.strokes === 0 && p.card.every((n) => n === null));
    if (spot.what === 'tee' && fresh && !p.group) {
      const near = nearTee();
      return { k: `tee|${near}`, parts: [title, key('E', near > 1 ? `Runde mit allen hier (${near})` : 'Runde starten'), aside(near > 1 ? 'ihr wechselt euch ab' : 'allein – oder warte auf Freunde')] };
    }
    if (p.hole !== def.n) return { k: `lane|${def.n}|other|${p.hole}|${here.join()}`, parts: [title, others, aside(p.hole ? `dein Ball: Bahn ${p.hole}` : `${standing(view, p.id)} – Runde fertig`)] };
    const t = turn();
    if (!lie()) return { k: `lane|${def.n}|wait`, parts: [title, aside(p.card[p.hole - 1] !== null ? 'warte auf die anderen' : 'rollt …')] };
    return { k: `lane|${def.n}|go|${t.mine}|${t.whose}`, parts: [title, others, key('E', t.mine ? 'Zum Ball' : 'Zum Ball (gleich)'), aside(t.mine ? `Schlag ${p.strokes + 1}` : `${t.whose} ist dran`)] };
  }

  /** How many with a putter and no round going stand at the first tee (you too). */
  function nearTee(): number {
    const tee = toRoom(HOLES[0], HOLES[0].tee.x, HOLES[0].tee.z);
    let n = 0;
    for (const p of view?.players ?? []) {
      if (p.hole > 1 || p.strokes > 0 || p.group) continue;
      const at = p.id === store.you ? myRoomPos() : (() => {
        const peer = store.peers.get(p.id);
        return peer ? toRoomPoint(new THREE.Vector3(peer.x, 0, peer.z)) : null;
      })();
      if (at && Math.hypot(at.x - tee.x, at.z - tee.z) <= 4.5) n++;
    }
    return n;
  }

  addBowlingPart({
    build,
    use: (it, k) => use(it, k),
    hint: (it) => hint(it),
    place: (inside) => {
      if (inside) ctx.net.send({ t: 'mg.look' });
      else leave();
    },
  });
  ctx.interactions.define('minigolf', {
    reach: 3,
    hint: (it) => hint(it) ?? { k: '', parts: [] },
    use: (it, k) => void use(it, k),
  });
  ctx.activities.add({
    id: 'minigolf',
    active: () => putter.active,
    stop: (why) => {
      if (why !== 'taken') putter.stop();
    },
    key: (e) => {
      if (e.code === 'KeyE' || e.code === 'Escape') {
        putter.stop();
        return true;
      }
      if (e.code === 'KeyQ') {
        putter.pickup();
        return true;
      }
      return e.code === 'KeyF' || e.code === 'KeyG' || e.code in DESK_KEYS || /^(?:Digit|Numpad)[1-6]$/.test(e.code);
    },
    hint: (el) => {
      const stage = putter.doing;
      const t = turn();
      ctx.hint.draw(el, `mg|${stage}|${t.mine}|${t.whose}`, () =>
        stage === 'watch'
          ? [h('span.title', {}, '⛳ Rollt …'), key('E', 'Weggehen')]
          : stage === 'charge'
            ? [h('span.title', {}, '⛳ Loslassen zum Putten'), aside('je voller, desto fester')]
            : t.mine
              ? [key('Space', 'Halten zum Putten'), key('Maus · A D', 'Zielen'), key('Q', 'Aufheben (+)'), key('E', 'Fertig')]
              : [h('span.title', {}, `⛳ ${t.whose ?? '…'} ist dran`), key('E', 'Fertig')],
      );
    },
    takesCamera: true,
    hidesHands: true,
    bothHands: true,
  });
  // Tab (the card) and Esc (closing it) in the room, before anything else hears them.
  ctx.keys.add('guard', (e) => ui.key(e, inRoom()));

  function leave() {
    if (putter.active) putter.stop();
    if (ui.open) ui.toggle(false);
  }

  // ---- The office's news ------------------------------------------------------------------------------

  ctx.messages.on('mg', (msg) => {
    const sample = msg.view.now - Date.now();
    // The latest a message can have left is when it says: the largest sample's the nearest guess, drifting down slowly.
    offset = offset === null ? sample : Math.max(sample, offset - 2);
    view = msg.view;
    if (msg.mine) mine = msg.mine;
    built?.balls.set(view);
    boardDirty = true;
    if (msg.event) showEvent(msg.event, view, { sound: ctx.sound, confetti: ctx.confetti, you: () => store.you, toWorld: (x, y, z) => toWorld(new THREE.Vector3(x, y, z)), here: inCentre, openCard: () => ui.toggle(true) });
    // Your turn now (in a group): a little ping.
    const t = turn();
    const p = me();
    const myTurn = !!p?.group && t.mine;
    if (myTurn && !wasMyTurn && inCentre() && !msg.event) toast(`⛳ Du bist dran – Bahn ${p!.hole}`);
    wasMyTurn = myTurn;
    if (!p && putter.active) putter.stop();
    ctx.hint.invalidate();
  });
  ctx.messages.on('mg.putt', (msg) => {
    if (!built || !inCentre()) return;
    const s = msg.shot;
    const mineShot = s.id === store.you;
    built.balls.shoot(s, mineShot);
    if (mineShot) return;
    // Their putter swings through, and the tick of it from where their ball was.
    const person = deps.personOf(s.id);
    if (person) {
      person.golfBack(Math.min(0.35, 0.1 + s.power * 0.3));
      setTimeout(() => person.golfBack(0), 380);
    }
    const def = HOLES[s.hole - 1];
    const at = toRoom(def, s.from.x, s.from.z);
    setTimeout(() => ctx.sound.minigolf('putt', toWorld(new THREE.Vector3(at.x, def.base, at.z)), s.power), 380);
  });

  // ---- Every frame ------------------------------------------------------------------------------------

  ctx.ticks.add('play', ({ dt }) => {
    // Out of the centre (or into an elevator): the putter goes down.
    if (putter.active && (!inCentre() || ctx.trip() || ctx.player.seat)) putter.stop();
    putter.update(dt);
  });
  ctx.ticks.add('world', ({ dt, now }) => {
    if (!built || !inCentre()) {
      ui.renderBar(null, { mine: false, whose: null }, -1, -1);
      return;
    }
    const t = clockSec(shared());
    const sec = now / 1000;
    built.obstacles.update(t, dt);
    built.balls.update(performance.now());
    const pipe = built.balls.inPipe(store.you);
    if (pipe) built.balls.showInPipe(store.you, (() => {
      const p = built.obstacles.pipePoint(pipe.hole, pipe.pipe, pipe.k);
      if (!p) return null;
      const def = HOLES[pipe.hole - 1];
      const at = toRoom(def, p.x, p.z);
      return new THREE.Vector3(at.x, def.base + p.y, at.z);
    })());
    for (const p of view?.players ?? []) {
      if (p.id === store.you) continue;
      const ip = built.balls.inPipe(p.id);
      if (!ip) continue;
      const q = built.obstacles.pipePoint(ip.hole, ip.pipe, ip.k);
      if (q) {
        const def = HOLES[ip.hole - 1];
        const at = toRoom(def, q.x, q.z);
        built.balls.showInPipe(p.id, new THREE.Vector3(at.x, def.base + q.y, at.z));
      }
    }
    const myBall = built.balls.where(store.you);
    if (myBall?.ball) {
      const def = HOLES[myBall.hole - 1];
      if (def) putter.steer(...headingVel(def, myBall.ball.vx, myBall.ball.vz), dt);
    }
    built.room.update(sec, (x, z, r) => {
      const p = myRoomPos();
      if (Math.hypot(p.x - x, p.z - z) < r) return true;
      for (const peer of store.peers.values()) if (peer.floor === BOWLING && Math.hypot(peer.x - x, peer.z - z) < r) return true;
      return false;
    });
    sounds(t);
    if (boardDirty && performance.now() - boardAt > 800) {
      drawBoard(built.room.board, view);
      boardDirty = false;
      boardAt = performance.now();
    }
    const p = me();
    ui.renderBar(p && inRoom() ? p : null, turn(), putter.doing === 'charge' || putter.doing === 'aim' ? putter.power : -1, putter.last);
    ui.renderCard(view, store.you, mine);
  });

  /** A ball's way in hole `def`'s frame, as a room heading's (x, z). */
  function headingVel(def: HoleDef, vx: number, vz: number): [number, number] {
    const c = Math.cos(def.at.rot);
    const s = Math.sin(def.at.rot);
    return [c * vx + s * vz, -s * vx + c * vz];
  }

  /** The room's pad (in it, or near its door), the felt under the nearest rolling ball, the windmill's sails going by. */
  function sounds(t: number) {
    if (!built) return;
    const p = myRoomPos();
    const dx = Math.max(MG_ROOM.minX - p.x, 0, p.x - MG_ROOM.maxX);
    const dz = Math.max(MG_ROOM.minZ - p.z, 0, p.z - MG_ROOM.maxZ);
    const out = Math.hypot(dx, dz);
    const ambient = out === 0 ? 1 : Math.max(0, 1 - out / 7) * 0.5;
    let best: { at: THREE.Vector3; speed: number; d: number } | null = null;
    for (const b of built.balls.moving()) {
      const d = b.at.distanceTo(p);
      if (!best || d < best.d) best = { ...b, d };
    }
    const roll = best ? Math.min(1, best.speed / 2.5) * Math.max(0, 1 - best.d / 9) * (out === 0 ? 1 : 0.4) : 0;
    ctx.sound.setMinigolf(ambient, roll, best ? toWorld(best.at) : null, best?.speed ?? 0);
    const mill = HOLES.find((d) => d.course.windmill);
    const m = mill?.course.windmill;
    if (mill && m && out === 0) {
      const q = Math.floor(sailAngle(m, t) / (Math.PI / 2));
      if (q !== sailQuarter) {
        const hub = toRoom(mill, m.x, m.z);
        if (sailQuarter >= 0 && Math.hypot(hub.x - p.x, hub.z - p.z) < 7) ctx.sound.minigolf('whoosh', toWorld(new THREE.Vector3(hub.x, mill.base + 0.3, hub.z)), 0.6);
        sailQuarter = q;
      }
    }
  }

  return {
    /** For the console and the tests: the view, and where your ball lies. */
    get view() {
      return view;
    },
    lie,
    /** Over your ball (as E along your hole does), and the putter (for checks from the console). */
    address,
    putter,
    ui,
  };
}

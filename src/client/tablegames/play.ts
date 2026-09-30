import * as THREE from 'three';
import type { ServerMsg } from '../../shared/protocol';
import { ROOF } from '../../shared/rooftop';
import type { GameState } from '../../shared/tablegames/game';
import { GAMES } from '../../shared/tablegames/index';
import { KICKER, RODS, slideFor, type KickerState } from '../../shared/tablegames/kicker';
import { type HockeyState, malletBox } from '../../shared/tablegames/hockey';
import { paddleBox, type PongState } from '../../shared/tablegames/pingpong';
import { NOTE, POOL_PHASE, canPlace, groupOf, type PoolState } from '../../shared/tablegames/pool';
import { EV, TABLES, clamp, standSpot, tableToWorld, worldToTable, type Side, type TableId, type TableSeat } from '../../shared/tablegames/tables';
import type { Net } from '../net';
import { isTyping, type PlayerController } from '../player';
import type { OfficeSound } from '../sound';
import { store } from '../state';
import { h, openModal, toast, type Modal } from '../ui/dom';
import type { RoofTablesView } from './models';
import './tablegames.css';

// Playing the table games on the roof (flrnoh fork, see shared/tablegames and FORK.md). E at a table
// steps up to it: the camera glides to a view of the table from your end, and the mouse plays. The
// first of the two players' pages runs the game (and the computer, for someone alone) and sends it to
// everyone up there; the other player's page sends its moves to that one. With both sides taken, E
// watches. ✕ or Esc steps back.

const SEND_EVERY = 40;
const MOVE_EVERY = 33;
const RESTART_AFTER = 6000;
const CPU = '🤖 Computer';

interface Hosted {
  s: GameState;
  lineup: string;
  sentAt: number;
  ev: number[];
  restartAt: number;
}

interface At {
  table: TableId;
  mode: 'play' | 'watch';
  /** Your side, once the office has you at the table. */
  side: Side | null;
}

/** How the camera looks at a table: from where (the table's frame, height over the roof) at what. */
interface Pose {
  u: number;
  v: number;
  y: number;
  lu: number;
  lv: number;
}

/** From your end (or side, at the kicker), and for watching. Side 1's is side 0's turned round. */
const POSES: Record<TableId, { play: Pose; watch: Pose }> = {
  // (From the +v side, so the head string is on the left and the rack on the right.)
  pool: { play: { u: 0, v: 1.05, y: 2.95, lu: 0, lv: 0.05 }, watch: { u: 0, v: 1.7, y: 2.7, lu: 0, lv: 0 } },
  kicker: { play: { u: 0, v: -0.72, y: 1.95, lu: 0, lv: 0.04 }, watch: { u: 0, v: -1.1, y: 1.95, lu: 0, lv: 0 } },
  hockey: { play: { u: -1.45, v: 0, y: 2.75, lu: 0.15, lv: 0 }, watch: { u: 0, v: -1.7, y: 2.6, lu: 0, lv: 0 } },
  pingpong: { play: { u: -2.55, v: 0, y: 2.25, lu: 0.35, lv: 0 }, watch: { u: 0, v: -2.4, y: 2.5, lu: 0, lv: 0 } },
};

const TIPS: Record<TableId, string> = {
  pool: 'Aim with the mouse · hold the button (or Space) and let go to shoot',
  kicker: 'Mouse up and down (or W/S) slides your rods · click or Space kicks',
  hockey: 'Your mallet follows the mouse round your half',
  pingpong: 'The paddle follows the mouse · click or Space to swing as the ball comes to you',
};

/** Where the sound of each thing that happened comes from, as the sound system calls it. */
function soundOf(table: TableId, kind: number): Parameters<OfficeSound['tableGame']>[0] | null {
  switch (kind) {
    case EV.hit:
      return table === 'pool' ? 'cue' : table === 'kicker' ? 'rail' : 'hit';
    case EV.serve:
      return 'hit';
    case EV.wall:
      return table === 'pool' ? 'clack' : 'rail';
    case EV.bounce:
      return 'bounce';
    case EV.net:
      return 'net';
    case EV.kick:
      return 'kick';
    case EV.click:
      return 'clack';
    case EV.pocket:
      return 'pocket';
    case EV.score:
      return 'goal';
    case EV.foul:
      return 'foul';
    case EV.win:
      return 'win';
  }
  return null;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const want = new THREE.Vector3();
const look = new THREE.Vector3();
const lookAt = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export interface TableGamesHooks {
  net: Net;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  player: PlayerController;
  sound: OfficeSound;
  /** The roof's tables, once the roof is built. */
  view(): RoofTablesView | null;
}

export class TableGames {
  private seats = new Map<TableId, TableSeat>();
  private hosted = new Map<TableId, Hosted>();
  /** What the tables someone else runs look like, as their last snapshot had it. */
  private remote = new Map<TableId, GameState>();
  /** What a table nobody's at looks like. */
  private idle = new Map<TableId, GameState>();
  private at: At | null = null;
  private modal: Modal | null = null;
  private zoom = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  /** The mouse, in the page's pixels, while you're at a table. */
  private mouse: { x: number; y: number } | null = null;
  /** Your hand on the table: where the mouse points on it (u, v). */
  private aim: { u: number; v: number } | null = null;
  /** The kicker's rods, moved by the keys (the mouse takes over when it moves). */
  private keyV: number | null = null;
  /** Pool: when you started drawing the cue back (performance.now()), and whether you're putting the cue ball down. */
  private chargeAt: number | null = null;
  private placing = false;
  private movedAt = 0;
  private lastMove = '';
  /** What each table last showed, to tell what changed (a goal, a turn, the match). */
  private shownScore = new Map<TableId, string>();
  private shownNote = new Map<TableId, number>();
  private shownWin = new Map<TableId, number>();
  private hud: { el: HTMLElement; title: HTMLElement; score: HTMLElement; tip: HTMLElement; banner: HTMLElement; meter: HTMLElement; fill: HTMLElement } | null = null;
  private bannerUntil = 0;
  private hudKey = '';

  constructor(private readonly hooks: TableGamesHooks) {
    for (const id of Object.keys(TABLES) as TableId[]) this.idle.set(id, GAMES[id].init(Math.random));
    hooks.net.onMessage((msg) => this.onMessage(msg));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  /** At a table, playing or watching: the camera's there, and your hands would be in the way. */
  get zoomed(): boolean {
    return this.zoom > 0;
  }

  get active(): boolean {
    return this.at !== null;
  }

  // ---- Stepping up and back ----------------------------------------------------------------------

  /** E at a table: play if there's a side free, else watch. */
  use(table: TableId) {
    if (store.floor !== ROOF || this.at) return;
    const seat = this.seats.get(table);
    const full = !!seat?.players[0] && !!seat.players[1];
    const mine = seat?.players.findIndex((p) => p?.id === store.you) ?? -1;
    if (full && mine < 0) return this.open(table, 'watch');
    this.open(table, 'play');
    if (mine >= 0) this.at!.side = mine as Side;
    else this.hooks.net.send({ t: 'table.join', table });
  }

  /** What the hint says at a table: its name, who's on, and what E does. */
  hint(table: TableId): { title: string; aside: string; action: string } {
    const def = TABLES[table];
    const seat = this.seats.get(table);
    const [a, b] = seat?.players ?? [null, null];
    const title = `${def.emoji} ${def.name}`;
    if (a && b) return { title, aside: `${a.name} ${seat!.score[0]} : ${seat!.score[1]} ${b.name}`, action: 'Watch' };
    const one = a ?? b;
    if (one) return { title, aside: `${one.name} is playing the computer`, action: `Play ${one.name}` };
    return { title, aside: table === 'pool' ? 'eight-ball' : `first to ${def.target}`, action: 'Play' };
  }

  /** Off the roof (or the page is leaving it): away from the table. */
  setUp(up: boolean) {
    if (up) return;
    this.modal?.close();
    this.hosted.clear();
    this.remote.clear();
    this.seats.clear();
  }

  private open(table: TableId, mode: 'play' | 'watch') {
    const def = TABLES[table];
    this.at = { table, mode, side: null };
    this.aim = null;
    this.mouse = null;
    this.keyV = null;
    this.chargeAt = null;
    this.placing = false;
    const title = h('span.tg-title', {}, `${def.emoji} ${def.name}`);
    const score = h('span.tg-score');
    const tip = h('span.tg-tip', {}, mode === 'watch' ? '👀 Watching' : TIPS[table]);
    const banner = h('div.tg-banner.hidden');
    const fill = h('span.tg-fill');
    const meter = h('div.tg-meter.hidden', {}, fill);
    const el = h('div.tg', { role: 'dialog', 'aria-label': def.name }, h('header.tg-bar', {}, title, score, tip), banner, meter);
    this.hud = { el, title, score, tip, banner, meter, fill };
    this.hudKey = '';
    el.addEventListener('pointermove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('header')) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      if (e.button === 0) this.press(true);
    });
    window.addEventListener('pointerup', this.onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.modal = openModal(el, {
      backdropCloses: false,
      doing: mode === 'play' ? `${def.emoji} playing ${def.name.toLowerCase()}` : `👀 watching ${def.name.toLowerCase()}`,
      onClose: () => this.closed(),
    });
    this.modal.backdrop.classList.add('clear', 'tg-backdrop');
    // Playing: up to your end of the table (the office moves you there when it knows your side).
    this.camPos.copy(this.hooks.camera.position);
    this.camQuat.copy(this.hooks.camera.quaternion);
  }

  private onUp = (e: PointerEvent) => {
    if (e.button === 0) this.press(false);
  };

  private closed() {
    const at = this.at;
    window.removeEventListener('pointerup', this.onUp);
    this.modal = null;
    this.hud = null;
    this.at = null;
    this.chargeAt = null;
    for (const v of Object.values(this.hooks.view()?.views ?? {})) {
      v.guide?.(false, 0, 0, 0);
      v.ghost?.(false, 0, 0, true);
    }
    if (!at) return;
    const p = this.hooks.player;
    if (p.rig === this.stand) {
      p.rig = null;
      p.mouseLook = true;
      p.camYaw = p.facing + Math.PI;
      p.lookPitch = -0.08;
    }
    if (at.mode === 'play') this.hooks.net.send({ t: 'table.leave' });
  }

  /** Keeps you standing at your end of the table while you play. */
  private stand = () => {
    const at = this.at;
    if (!at || at.side === null) return;
    const s = standSpot(TABLES[at.table], at.side);
    const p = this.hooks.player;
    p.pos.set(s.x, 0, s.z);
    p.facing = s.facing;
    p.moving = false;
  };

  // ---- What the office says --------------------------------------------------------------------------

  private onMessage(msg: ServerMsg) {
    if (msg.t === 'welcome' || msg.t === 'floor.enter') {
      // Once the page has taken in who you are and where (its own handler runs after this one).
      const tables = msg.floor === ROOF ? msg.tables : undefined;
      queueMicrotask(() => (tables ? this.setSeats(tables) : this.setUp(false)));
      return;
    }
    if (msg.t === 'tables') return this.setSeats(msg.tables);
    if (msg.t === 'table.sync') {
      if (this.hosted.has(msg.table)) return;
      const s = GAMES[msg.table].decode(msg.snap.s);
      this.remote.set(msg.table, s);
      this.happened(msg.table, msg.snap.ev ?? [], s);
      return;
    }
    if (msg.t === 'table.input') {
      const run = this.hosted.get(msg.table);
      if (run) GAMES[msg.table].input(run.s, msg.side, msg.input);
    }
  }

  private setSeats(list: TableSeat[]) {
    const me = store.you;
    for (const seat of list) {
      const id = seat.id;
      const before = this.seats.get(id);
      this.seats.set(id, seat);
      const lineup = `${seat.players[0]?.id ?? '-'}|${seat.players[1]?.id ?? '-'}`;
      if (seat.host === me) {
        const run = this.hosted.get(id);
        // A new game whenever someone new steps up (or away).
        if (!run || run.lineup !== lineup) this.hosted.set(id, { s: GAMES[id].init(Math.random), lineup, sentAt: 0, ev: [], restartAt: 0 });
        this.remote.delete(id);
      } else {
        this.hosted.delete(id);
        if (!seat.players[0] && !seat.players[1]) this.remote.delete(id);
        else if (seat.snap && !this.remote.has(id)) this.remote.set(id, GAMES[id].decode(seat.snap.s));
      }
      // Somebody won: everyone up here hears who.
      if (before && before.win === -1 && seat.win !== -1 && store.floor === ROOF) {
        const w = seat.players[seat.win]?.name ?? CPU;
        const l = seat.players[(1 - seat.win) as Side]?.name ?? CPU;
        if (!this.at || this.at.table !== id) toast(`${TABLES[id].emoji} ${w} beat ${l} at ${TABLES[id].name.toLowerCase()}, ${seat.score[seat.win]}–${seat.score[1 - seat.win]}`);
      }
      // Stepping up: which side the office gave you, and off to your end.
      const at = this.at;
      if (at?.table === id && at.mode === 'play') {
        const side = seat.players.findIndex((p) => p?.id === me);
        if (side >= 0 && at.side !== side) {
          at.side = side as Side;
          const p = this.hooks.player;
          p.rig = this.stand;
          p.mouseLook = false;
          this.stand();
        } else if (side < 0 && at.side === null) {
          // The table filled up before you got there: watch instead.
          at.mode = 'watch';
          if (this.hud) this.hud.tip.textContent = '👀 Watching';
        } else if (side < 0) this.modal?.close();
      }
    }
    this.boards();
  }

  /** The scoreboards over the tables. */
  private boards() {
    const views = this.hooks.view()?.views;
    if (!views) return;
    for (const [id, seat] of this.seats) {
      const [a, b] = seat.players;
      if (!a && !b) {
        views[id].board(null);
        continue;
      }
      const n0 = a?.name ?? CPU;
      const n1 = b?.name ?? CPU;
      views[id].board(`${TABLES[id].emoji} ${n0}  ${seat.score[0]} : ${seat.score[1]}  ${n1}`);
    }
  }

  /** What happened at a table since the last look: its sounds, and news for whoever's at it. */
  private happened(table: TableId, ev: readonly number[], s: GameState) {
    const def = TABLES[table];
    for (let i = 0; i + 2 < ev.length; i += 3) {
      const kind = soundOf(table, ev[i]);
      if (!kind) continue;
      const w = tableToWorld(def, ev[i + 1], ev[i + 2]);
      this.hooks.sound.tableGame(kind, { x: w.x, y: def.top + 0.1, z: w.z });
    }
    if (this.at?.table !== table) return;
    const seat = this.seats.get(table);
    const name = (side: Side) => (seat?.players[side]?.id === store.you ? 'You' : (seat?.players[side]?.name ?? CPU));
    const score = `${s.score[0]}:${s.score[1]}`;
    const was = this.shownScore.get(table);
    this.shownScore.set(table, score);
    if (s.win !== -1 && this.shownWin.get(table) !== s.win) {
      this.shownWin.set(table, s.win);
      const who = name(s.win as Side);
      return this.banner(`🏆 ${who === 'You' ? 'You win' : `${who} wins`}!`, 4000);
    }
    if (s.win === -1) this.shownWin.delete(table);
    if (table === 'pool') {
      const p = s as PoolState;
      const note = this.shownNote.get(table);
      this.shownNote.set(table, p.note);
      if (note !== undefined && note !== p.note && p.phase === POOL_PHASE.aim) {
        const next = name(p.turn);
        const text: Partial<Record<number, string>> = {
          [NOTE.scratch]: `Scratch! Ball in hand for ${next}`,
          [NOTE.wrongFirst]: `Foul: wrong ball first. Ball in hand for ${next}`,
          [NOTE.noHit]: `Foul: nothing hit. Ball in hand for ${next}`,
          [NOTE.groups]: `${name(p.turn)} ${name(p.turn) === 'You' ? 'have' : 'has'} ${p.groups[p.turn] === 1 ? 'solids' : 'stripes'}`,
        };
        if (text[p.note]) this.banner(text[p.note]!, 2200);
      }
      return;
    }
    if (was && was !== score) {
      const [a0, b0] = was.split(':').map(Number);
      const scorer: Side = s.score[0] > a0 ? 0 : 1;
      if (s.score[scorer] === (scorer === 0 ? a0 : b0)) return;
      const who = name(scorer);
      const what = table === 'pingpong' ? (who === 'You' ? 'Your point' : `Point ${who}`) : who === 'You' ? 'GOAL! You scored' : `GOAL! ${who}`;
      this.banner(what, 1400);
    }
  }

  private banner(text: string, ms: number) {
    if (!this.hud) return;
    this.hud.banner.textContent = text;
    this.hud.banner.classList.remove('hidden');
    this.bannerUntil = performance.now() + ms;
  }

  // ---- Your hand -----------------------------------------------------------------------------------

  private key(e: KeyboardEvent, down: boolean) {
    const at = this.at;
    if (!at || at.mode !== 'play' || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.press(down);
    } else if (down && at.table === 'kicker' && (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      const s = this.stateOf('kicker') as KickerState;
      const mine = at.side ?? 0;
      // Away from you is up the table: +v for side 0, who stands at -v.
      const away = (e.code === 'KeyW' || e.code === 'ArrowUp' ? 1 : -1) * (mine === 0 ? 1 : -1);
      this.keyV = clamp((this.keyV ?? s.to[mine]) + away * 0.06, -KICKER.halfW, KICKER.halfW);
      this.aim = null;
    } else if (down && at.table === 'pool' && e.code === 'KeyR') {
      const s = this.stateOf('pool') as PoolState;
      if (s.hand && s.turn === at.side) this.placing = true;
    }
  }

  /** The button (or Space) down or up: a swing, a kick, drawing the cue back and letting go. */
  private press(down: boolean) {
    const at = this.at;
    if (!at || at.mode !== 'play' || at.side === null) return;
    if (at.table !== 'pool') {
      if (down) this.send(at.table, at.side, [1]);
      return;
    }
    const s = this.stateOf('pool') as PoolState;
    if (s.turn !== at.side || s.phase !== POOL_PHASE.aim || s.win !== -1) return;
    if (this.placing && s.hand) {
      if (down && this.aim && canPlace(s, this.aim.u, this.aim.v)) {
        this.send('pool', at.side, [2, this.aim.u, this.aim.v]);
        this.placing = false;
      }
      return;
    }
    if (down) this.chargeAt = performance.now();
    else if (this.chargeAt !== null) {
      const power = this.power();
      this.chargeAt = null;
      if (power > 0.03) this.send('pool', at.side, [1, this.poolAngle(s), power]);
    }
  }

  /** How far the cue's drawn back: up to full in a second and a bit, then back down, and up again. */
  private power(): number {
    if (this.chargeAt === null) return 0;
    const p = ((performance.now() - this.chargeAt) / 1100) % 2;
    return p > 1 ? 2 - p : p;
  }

  /** Where the cue points: from the cue ball at the mouse. */
  private poolAngle(s: PoolState): number {
    const c = s.balls[0];
    if (!this.aim) return s.aim[0];
    return Math.atan2(this.aim.v - c[1], this.aim.u - c[0]);
  }

  /** A move of yours: straight into the game if your page runs it, else to the page that does. */
  private send(table: TableId, side: Side, input: number[]) {
    const run = this.hosted.get(table);
    if (run) return GAMES[table].input(run.s, side, input);
    this.hooks.net.send({ t: 'table.input', table, input });
  }

  /** The table the mouse is over, in its own frame. */
  private pointAt(table: TableId): { u: number; v: number } | null {
    if (!this.mouse) return null;
    const def = TABLES[table];
    const r = this.hooks.canvas.getBoundingClientRect();
    ndc.set(((this.mouse.x - r.left) / r.width) * 2 - 1, -((this.mouse.y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, this.hooks.camera);
    plane.constant = -def.top;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return worldToTable(def, hit.x, hit.z);
  }

  private stateOf(table: TableId): GameState {
    return this.hosted.get(table)?.s ?? this.remote.get(table) ?? this.idle.get(table)!;
  }

  /** Your hand this frame: where the mouse points becomes your move. */
  private handle(now: number) {
    const at = this.at;
    if (!at || at.mode !== 'play' || at.side === null) return;
    const side = at.side;
    const p = this.pointAt(at.table);
    if (p && (this.mouse && (!this.aim || Math.abs(p.u - this.aim.u) + Math.abs(p.v - this.aim.v) > 1e-4))) {
      this.aim = p;
      this.keyV = null;
    }
    const aim = this.aim;
    let move: number[] | null = null;
    if (at.table === 'hockey' && aim) move = [0, aim.u, aim.v];
    else if (at.table === 'pingpong' && aim) move = [0, aim.u, aim.v];
    else if (at.table === 'kicker' && (aim || this.keyV !== null)) move = [0, this.keyV ?? aim!.v];
    else if (at.table === 'pool') {
      const s = this.stateOf('pool') as PoolState;
      const myTurn = s.turn === side && s.phase === POOL_PHASE.aim && s.win === -1;
      // A new turn of yours with the cue ball in hand: put it down first.
      const turn = `${s.phase}|${s.turn}`;
      if (turn !== this.lastTurn && myTurn) this.placing = s.hand;
      this.lastTurn = turn;
      if (!myTurn) this.placing = false;
      if (myTurn && !this.placing) move = [0, this.poolAngle(s), this.power()];
    }
    if (!move) return;
    const run = this.hosted.get(at.table);
    if (run) return GAMES[at.table].input(run.s, side, move);
    // To the host: not every frame, and only when it changed.
    const k = move.map((x) => x.toFixed(3)).join(',');
    if (k === this.lastMove || now - this.movedAt < (at.table === 'pool' ? 100 : MOVE_EVERY)) return;
    this.lastMove = k;
    this.movedAt = now;
    this.hooks.net.send({ t: 'table.input', table: at.table, input: move });
  }
  private lastTurn = '';

  // ---- Every frame --------------------------------------------------------------------------------

  /** Runs the games this page hosts, draws every table, and moves the camera to yours. Call it after the player has placed the camera. */
  update(dt: number) {
    const view = this.hooks.view();
    const now = performance.now();
    const up = store.floor === ROOF;
    // The camera first: where the mouse points on the table depends on where it looks from.
    this.camera(dt);
    if (up) this.handle(now);
    const step = Math.min(dt, 0.05);
    for (const [id, run] of this.hosted) {
      const game = GAMES[id];
      const seat = this.seats.get(id);
      if (!seat) continue;
      // The computer takes whichever side nobody's at.
      for (const side of [0, 1] as Side[]) if (!seat.players[side]) for (const a of game.cpu(run.s, side, step, Math.random)) game.input(run.s, side, a);
      const ev: number[] = [];
      game.step(run.s, step, ev, Math.random);
      run.ev.push(...ev);
      if (run.ev.length > 57) run.ev.splice(0, run.ev.length - 57);
      this.happened(id, ev, run.s);
      if (run.s.win !== -1 && !run.restartAt) run.restartAt = now + RESTART_AFTER;
      if (run.restartAt && now >= run.restartAt) {
        run.s = game.init(Math.random);
        run.restartAt = 0;
      }
      if (now - run.sentAt >= SEND_EVERY) {
        run.sentAt = now;
        this.hooks.net.send({ t: 'table.sync', table: id, snap: { s: game.encode(run.s), score: [run.s.score[0], run.s.score[1]], win: run.s.win, ...(run.ev.length ? { ev: run.ev } : {}) } });
        run.ev = [];
        // The scoreboard over it, without waiting for the office.
        if (seat.score[0] !== run.s.score[0] || seat.score[1] !== run.s.score[1]) {
          seat.score = [run.s.score[0], run.s.score[1]];
          this.boards();
        }
      }
    }
    if (view && up) this.draw(view, dt);
    this.renderHud(now);
  }

  private draw(view: RoofTablesView, dt: number) {
    for (const id of Object.keys(view.views) as TableId[]) {
      let s = this.stateOf(id);
      const at = this.at;
      // Your own hand as it is now, not as the host last saw it.
      if (at?.table === id && at.mode === 'play' && at.side !== null && !this.hosted.has(id)) s = this.predict(id, s, at.side);
      const v = view.views[id];
      v.draw(s, dt);
      v.boardAway(at?.table === id && this.zoom > 0.05);
      if (id === 'pool' && v.guide && v.ghost) {
        const p = s as PoolState;
        const mine = at?.table === 'pool' && at.mode === 'play' && p.turn === at.side && p.phase === POOL_PHASE.aim && p.win === -1;
        v.ghost(!!(mine && this.placing && this.aim), this.aim?.u ?? 0, this.aim?.v ?? 0, !!this.aim && canPlace(p, this.aim.u, this.aim.v));
        v.guide(!!(mine && !this.placing), p.balls[0][0], p.balls[0][1], this.poolAngle(p));
      }
    }
  }

  /** A copy of a snapshot with your paddle, mallet, rods or cue where your hand has them. */
  private predict(id: TableId, s: GameState, side: Side): GameState {
    const aim = this.aim;
    if (id === 'hockey' && aim) {
      const c = structuredClone(s) as HockeyState;
      const b = malletBox(side);
      c.m[side][0] = clamp(aim.u, b.minU, b.maxU);
      c.m[side][1] = clamp(aim.v, b.minV, b.maxV);
      return c;
    }
    if (id === 'pingpong' && aim) {
      const c = structuredClone(s) as PongState;
      const b = paddleBox(side);
      c.pad[side] = [clamp(aim.u, b.minU, b.maxU), clamp(aim.v, b.minV, b.maxV)];
      return c;
    }
    if (id === 'kicker' && (aim || this.keyV !== null)) {
      const c = structuredClone(s) as KickerState;
      const v = this.keyV ?? aim!.v;
      RODS.forEach((r, k) => {
        if (r.side === side) c.off[k] = slideFor(r, v);
      });
      return c;
    }
    if (id === 'pool') {
      const c = s as PoolState;
      if (c.turn !== side || c.phase !== POOL_PHASE.aim) return s;
      const copy = structuredClone(c);
      copy.aim = [this.poolAngle(c), this.power()];
      return copy;
    }
    return s;
  }

  /** Glides the camera to the table while you're at it, and back after. */
  private camera(dt: number) {
    const cam = this.hooks.camera;
    const at = this.at;
    const target = at ? 1 : 0;
    if (this.zoom === target && !target) return;
    this.zoom += (target - this.zoom) * Math.min(1, dt * 5);
    if (Math.abs(target - this.zoom) < 0.002) this.zoom = target;
    if (!at) {
      // On the way back: from where the table view left off toward your own view.
      cam.position.lerp(this.camPos, this.zoom);
      cam.quaternion.slerp(this.camQuat, this.zoom);
      return;
    }
    const def = TABLES[at.table];
    const pose = at.mode === 'play' && at.side !== null ? POSES[at.table].play : POSES[at.table].watch;
    // Side 1 sees it from the other end (or side).
    const flip = at.mode === 'play' && at.side === 1 ? -1 : 1;
    const w = tableToWorld(def, pose.u * flip, pose.v * flip);
    const l = tableToWorld(def, pose.lu * flip, pose.lv * flip);
    want.set(w.x, pose.y, w.z);
    look.set(l.x, def.top, l.z);
    lookAt.lookAt(want, look, UP);
    turn.setFromRotationMatrix(lookAt);
    this.camPos.copy(want);
    this.camQuat.copy(turn);
    cam.position.lerp(want, this.zoom);
    cam.quaternion.slerp(turn, this.zoom);
  }

  /** The bar at the top while you're at a table: the score, whose turn, what to do. */
  private renderHud(now: number) {
    const hud = this.hud;
    const at = this.at;
    if (!hud || !at) return;
    if (now > this.bannerUntil) hud.banner.classList.add('hidden');
    const s = this.stateOf(at.table);
    const seat = this.seats.get(at.table);
    const name = (side: Side) => (seat?.players[side]?.id === store.you ? 'You' : (seat?.players[side]?.name ?? CPU));
    let tip = at.mode === 'watch' ? '👀 Watching' : at.side === null ? 'Stepping up…' : TIPS[at.table];
    let score = `${name(0)}  ${s.score[0]} : ${s.score[1]}  ${name(1)}`;
    if (at.table === 'pool') {
      const p = s as PoolState;
      const group = (side: Side) => (p.groups[side] === 1 ? ' (solids)' : p.groups[side] === 2 ? ' (stripes)' : '');
      score = `${name(0)}${group(0)}  ${p.score[0]} : ${p.score[1]}  ${name(1)}${group(1)}`;
      if (at.mode === 'play' && p.win === -1) {
        const mine = p.turn === at.side;
        if (!mine) tip = `${name(p.turn)}'s shot`;
        else if (p.phase !== POOL_PHASE.aim) tip = 'Rolling…';
        else if (this.placing) tip = 'Ball in hand: click behind the line to put the cue ball down';
        else {
          const g = p.groups[p.turn];
          const on = !g ? 'the table is open' : p.balls.every((b, n) => groupOf(n) !== g || !b[4]) ? 'on the 8' : g === 1 ? 'on solids' : 'on stripes';
          tip = `Your shot, ${on} · hold and let go to shoot${p.hand ? ' · R to move the cue ball' : ''}`;
        }
      }
      const power = this.power();
      hud.meter.classList.toggle('hidden', this.chargeAt === null);
      hud.fill.style.width = `${Math.round(power * 100)}%`;
    } else if (at.table === 'pingpong' && at.mode === 'play') {
      const p = s as PongState;
      if (p.phase === 0 && p.server === at.side && p.win === -1) tip = 'Your serve: click or Space';
      else if (p.phase === 0 && p.win === -1) tip = `${name(p.server)} to serve`;
    }
    if (s.win !== -1) tip = 'A new game in a moment';
    const key = `${score}|${tip}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    hud.score.textContent = score;
    hud.tip.textContent = tip;
  }
}

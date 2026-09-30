import * as THREE from 'three';
import { lookFromSeed } from '../../shared/avatar';
import { COURTS, HALL, HALL_ROOM, type CourtId } from '../../shared/hall';
import { DOOR, HALF_L, HALF_W, PEV, SLOTS, courtDef, fwd, teamOf, type PadelSeat, type Slot, type Team } from '../../shared/padel/court';
import { PHASE, padel, serviceBox, type PadelState } from '../../shared/padel/game';
import { golden, pointsLine } from '../../shared/padel/rules';
import type { ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { isTyping, type PlayerController } from '../player';
import type { OfficeSound } from '../sound';
import { store } from '../state';
import { h, openModal, toast, type Modal } from '../ui/dom';
import { currentCourts, type Cast, type PadelCourtsView } from './courts';
import '../tablegames/tablegames.css';
import './padel.css';

/*
 * Playing padel in the padel hall (flrnoh fork, see FORK.md "Padel"; the game is shared/padel, the
 * courts hall/courts.ts). E at a court opens a little chooser: which place (team and side), or watch.
 * Playing, the camera glides in behind your player; they run for the ball on their own (WASD steers
 * them yourself while held), the mouse aims, a click or Space swings (on time goes hard and true),
 * Shift makes it a lob, and a high ball near the net is smashed. ✕ or Esc steps off the court.
 *
 * The first person on a court runs its game on their page (the computer players too) and sends it
 * through the office to everyone in the hall; the others send their moves to that page.
 */

const SEND_EVERY = 40;
const RESTART_AFTER = 8000;
const CPU = '🤖';
const TIP = 'Mouse aims · click or Space swings · hold Shift: lob · WASD steers';

interface Hosted {
  s: PadelState;
  sentAt: number;
  ev: number[];
  restartAt: number;
}

interface At {
  court: CourtId;
  mode: 'play' | 'watch';
  /** Your place, once the office has you on the court. */
  slot: Slot | null;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3();
const want = new THREE.Vector3();
const look = new THREE.Vector3();
const lookAt = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export interface PadelHooks {
  net: Net;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  player: PlayerController;
  sound: Pick<OfficeSound, 'padel'>;
  /** The courts, once the hall has built them (default: currentCourts()). */
  courts?(): PadelCourtsView | null;
}

/** Where a sound from a court's event comes from, in the hall. */
function soundOf(kind: number): Parameters<OfficeSound['padel']>[0] | null {
  switch (kind) {
    case PEV.hit:
      return 'hit';
    case PEV.smash:
      return 'smash';
    case PEV.serve:
      return 'serve';
    case PEV.bounce:
      return 'bounce';
    case PEV.glass:
      return 'glass';
    case PEV.fence:
      return 'fence';
    case PEV.net:
      return 'net';
    case PEV.point:
      return 'point';
    case PEV.fault:
      return 'fault';
    case PEV.game:
      return 'game';
    case PEV.win:
      return 'win';
  }
  return null;
}

export class PadelPlay {
  private seats = new Map<CourtId, PadelSeat>();
  private hosted = new Map<CourtId, Hosted>();
  /** What the courts someone else runs look like: their last snapshot, run on a moment between snapshots. */
  private remote = new Map<CourtId, { s: PadelState; age: number }>();
  private at: At | null = null;
  private modal: Modal | null = null;
  private chooser: Modal | null = null;
  private zoom = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private readonly camAt = new THREE.Vector3();
  private mouse: { x: number; y: number } | null = null;
  /** Where your next shot's aimed, in the court's frame. */
  private aim: { x: number; z: number } | null = null;
  private keys = new Set<string>();
  private shift = false;
  /** Running for the ball on your own (WASD steers while held); off, you stand when you let go. */
  private autoRun = true;
  private lastMove = '';
  private movedAt = 0;
  private hud: { el: HTMLElement; score: HTMLElement; tip: HTMLElement; banner: HTMLElement } | null = null;
  private bannerUntil = 0;
  private hudKey = '';
  private castAt = 0;

  constructor(private readonly hooks: PadelHooks) {
    hooks.net.onMessage((msg) => this.onMessage(msg));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private courts(): PadelCourtsView | null {
    return (this.hooks.courts ?? currentCourts)();
  }

  /** On a court, playing or watching: the camera's there, and your own body and hands would be in the way. */
  get zoomed(): boolean {
    return this.zoom > 0;
  }

  get active(): boolean {
    return this.at !== null;
  }

  /** Whether someone's on a court (the court draws them, so their own figure in the hall hides). */
  hides(id: string): boolean {
    for (const seat of this.seats.values()) if (seat.players.some((p) => p?.id === id)) return true;
    return false;
  }

  // ---- The chooser, stepping on and off ------------------------------------------------------

  /** What the hint says at a court: its name, how many people are on it, and what E does. */
  hint(court: CourtId): { title: string; aside: string; action: string } {
    const seat = this.seats.get(court);
    const n = seat?.players.filter(Boolean).length ?? 0;
    const title = `🎾 ${courtDef(court).name}`;
    const score = seat && n ? ` · ${seat.score[0]}–${seat.score[1]}` : '';
    if (seat?.players.some((p) => p?.id === store.you)) return { title, aside: `${n} of 4${score}`, action: 'Back to your game' };
    return { title, aside: n ? `${n} of 4${score}` : 'free · you + 🤖 vs 🤖 🤖', action: n >= 4 ? 'Watch' : 'Play' };
  }

  /** E at a court: the chooser (which place, or watch). */
  use(court: CourtId) {
    if (store.floor !== HALL || this.at || this.chooser) return;
    const seat = this.seats.get(court);
    const mine = seat?.players.findIndex((p) => p?.id === store.you) ?? -1;
    if (mine >= 0) {
      this.open(court, 'play');
      this.at!.slot = mine as Slot;
      this.onCourt();
      return;
    }
    this.choose(court);
  }

  private choose(court: CourtId) {
    const def = courtDef(court);
    const seat = this.seats.get(court);
    const pick = (slot: Slot | 'watch') => {
      this.chooser?.close();
      if (slot === 'watch') return this.open(court, 'watch');
      this.open(court, 'play');
      this.hooks.net.send({ t: 'padel.join', court, slot });
    };
    const side = (slot: Slot) => ((slot & 1) === 0 ? 'right' : 'left');
    const team = (t: Team) => {
      const buttons = SLOTS.filter((s) => teamOf(s) === t).map((slot) => {
        const p = seat?.players[slot];
        const taken = !!p;
        return h(
          'button.btn.padel-slot',
          { type: 'button', disabled: taken, onclick: () => pick(slot), title: taken ? `${p!.name} plays here` : `Take the ${side(slot)} (the computer plays it now)` },
          h('b', {}, `${slot + 1}`),
          ` ${side(slot)} · `,
          taken ? p!.name : `${CPU} computer`,
        );
      });
      return h('div.padel-team', {}, h('div.padel-team-name', {}, h('span.padel-dot', { style: `background:${t === 0 ? '#ef476f' : '#06a6a6'}` }), t === 0 ? 'South end' : 'North end'), ...buttons);
    };
    const auto = h('input', { type: 'checkbox', checked: this.autoRun, onchange: () => (this.autoRun = auto.checked) }) as HTMLInputElement;
    const el = h(
      'div.modal.padel-choose',
      { role: 'dialog', 'aria-label': def.name },
      h('header', {}, h('h2', {}, `🎾 ${def.name}`)),
      h(
        'div.body',
        {},
        h('p.padel-sub', {}, 'Two against two, first to four games (golden point at 40–40). The computer plays every free place. Pick yours:'),
        h('div.padel-teams', {}, team(0), team(1)),
        h('label.padel-auto', {}, auto, ' Run for the ball by myself (WASD still steers)'),
      ),
      h('footer', {}, h('span.grow', {}, '1–4 picks a place'), h('button.btn', { type: 'button', onclick: () => pick('watch') }, '👀 Watch')),
    );
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && !seat?.players[n - 1]) {
        e.preventDefault();
        pick((n - 1) as Slot);
      }
    };
    window.addEventListener('keydown', onKey);
    this.chooser = openModal(el, {
      doing: `🎾 at ${def.name.toLowerCase()}`,
      onClose: () => {
        window.removeEventListener('keydown', onKey);
        this.chooser = null;
        if (!this.at) this.backToLook();
      },
    });
  }

  /** Into the hall or out of it: out, everything's off. */
  setIn(inHall: boolean) {
    if (inHall) return;
    this.chooser?.close();
    this.modal?.close();
    this.hosted.clear();
    this.remote.clear();
    this.seats.clear();
  }

  private open(court: CourtId, mode: 'play' | 'watch') {
    const def = courtDef(court);
    this.at = { court, mode, slot: null };
    this.mouse = null;
    this.aim = null;
    this.keys.clear();
    const score = h('span.tg-score');
    const tip = h('span.tg-tip', {}, mode === 'watch' ? '👀 Watching' : 'Stepping on…');
    const banner = h('div.tg-banner.hidden');
    const el = h('div.tg.padel-view', { role: 'dialog', 'aria-label': def.name }, h('header.tg-bar', {}, h('span.tg-title', {}, `🎾 ${def.name}`), score, tip), banner);
    this.hud = { el, score, tip, banner };
    this.hudKey = '';
    el.addEventListener('pointermove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('header')) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      if (e.button === 0) this.swing(e.shiftKey);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.modal = openModal(el, {
      backdropCloses: false,
      doing: mode === 'play' ? `🎾 playing padel on ${def.name.toLowerCase()}` : `👀 watching padel on ${def.name.toLowerCase()}`,
      onClose: () => this.closed(),
    });
    this.modal.backdrop.classList.add('clear', 'tg-backdrop');
    this.camPos.copy(this.hooks.camera.position);
    this.camQuat.copy(this.hooks.camera.quaternion);
  }

  private closed() {
    const at = this.at;
    this.modal = null;
    this.hud = null;
    this.at = null;
    this.keys.clear();
    this.courts()?.views[at?.court ?? COURTS[0].id]?.aim(false, 0, 0);
    if (!at) return;
    const p = this.hooks.player;
    if (p.rig === this.stand) {
      p.rig = null;
      // Out through the nearest opening, facing away from the court.
      const def = courtDef(at.court);
      const me = at.slot !== null ? this.stateOf(at.court)?.p[at.slot] : null;
      const sx = me && me[0] < 0 ? -1 : 1;
      const sz = me && me[1] < 0 ? -1 : 1;
      p.pos.set(def.x + sx * (HALF_W + 0.9), 0, def.z + sz * (DOOR.from + DOOR.to) / 2);
      p.facing = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (at.mode === 'play') this.hooks.net.send({ t: 'padel.leave' });
    this.backToLook();
  }

  private backToLook() {
    const p = this.hooks.player;
    p.mouseLook = true;
    p.camYaw = p.facing + Math.PI;
    p.lookPitch = -0.08;
  }

  /** On the court: your body goes where your player is (the court draws you). */
  private onCourt() {
    const p = this.hooks.player;
    p.rig = this.stand;
    p.mouseLook = false;
    this.stand();
  }

  private stand = () => {
    const at = this.at;
    if (!at || at.slot === null) return;
    const s = this.stateOf(at.court);
    const def = courtDef(at.court);
    const p = this.hooks.player;
    if (s) {
      const me = s.p[at.slot];
      p.pos.set(def.x + me[0], 0, def.z + me[1]);
      p.facing = me[5];
    }
    p.moving = false;
  };

  // ---- What the office says ------------------------------------------------------------------

  private onMessage(msg: ServerMsg) {
    if (msg.t === 'welcome' || msg.t === 'floor.enter') {
      const inHall = msg.floor === HALL;
      queueMicrotask(() => {
        this.setIn(inHall);
        if (inHall) this.hooks.net.send({ t: 'padel.look' });
      });
      return;
    }
    if (msg.t === 'padel') return this.setSeats(msg.courts);
    if (msg.t === 'padel.sync') {
      if (this.hosted.has(msg.court)) return;
      this.remote.set(msg.court, { s: padel.decode(msg.snap.s), age: 0 });
      this.happened(msg.court, msg.snap.ev ?? [], this.remote.get(msg.court)!.s);
      return;
    }
    if (msg.t === 'padel.input') {
      const run = this.hosted.get(msg.court);
      if (run) padel.input(run.s, msg.slot, msg.input);
    }
  }

  private setSeats(list: PadelSeat[]) {
    const me = store.you;
    for (const seat of list) {
      const id = seat.id;
      const before = this.seats.get(id);
      this.seats.set(id, seat);
      if (seat.host === me) {
        if (!this.hosted.has(id)) {
          // Ours to run now: from where it was (the last snapshot), or a new match.
          const from = this.remote.get(id)?.s ?? (seat.snap ? padel.decode(seat.snap.s) : null);
          this.hosted.set(id, { s: from ?? padel.init(), sentAt: 0, ev: [], restartAt: 0 });
        }
        this.remote.delete(id);
      } else {
        this.hosted.delete(id);
        if (!seat.players.some(Boolean)) this.remote.delete(id);
        else if (seat.snap && !this.remote.has(id)) this.remote.set(id, { s: padel.decode(seat.snap.s), age: 0 });
      }
      // A match won: everyone in the hall hears who.
      if (before && before.win === -1 && seat.win !== -1 && store.floor === HALL && this.at?.court !== id) {
        toast(`🎾 ${this.teamName(seat, seat.win as Team)} won on ${courtDef(id).name}, ${seat.score[seat.win]}–${seat.score[1 - seat.win]}`);
      }
      const at = this.at;
      if (at?.court === id && at.mode === 'play') {
        const slot = seat.players.findIndex((p) => p?.id === me);
        if (slot >= 0 && at.slot !== slot) {
          at.slot = slot as Slot;
          this.onCourt();
          this.sendMove(true);
        } else if (slot < 0 && at.slot === null) {
          // The place went before we got there: watch instead.
          at.mode = 'watch';
          if (this.hud) this.hud.tip.textContent = '👀 Watching';
        } else if (slot < 0) this.modal?.close();
      }
    }
    this.cast();
  }

  private teamName(seat: PadelSeat | undefined, team: Team): string {
    const names = SLOTS.filter((s) => teamOf(s) === team).map((s) => (seat?.players[s]?.id === store.you ? 'You' : (seat?.players[s]?.name ?? CPU)));
    return names.join(' & ');
  }

  /** Who the figures on each court are. */
  private cast() {
    const courts = this.courts();
    if (!courts) return;
    for (const def of COURTS) {
      const seat = this.seats.get(def.id);
      const list = SLOTS.map((slot): Cast | null => {
        const p = seat?.players[slot];
        if (!p) return null;
        const peer = store.peers.get(p.id);
        const look = p.id === store.you ? store.profile.look : (peer?.look ?? lookFromSeed(p.id));
        return { id: p.id, name: p.name, color: peer?.color ?? p.color, look, cpu: false };
      });
      courts.views[def.id].cast(list);
    }
  }

  /** What happened on a court: its sounds, and news for whoever's on it or watching it. */
  private happened(court: CourtId, ev: readonly number[], s: PadelState) {
    const def = courtDef(court);
    for (let i = 0; i + 2 < ev.length; i += 3) {
      const kind = soundOf(ev[i]);
      if (!kind) continue;
      const center = ev[i] === PEV.point || ev[i] === PEV.game || ev[i] === PEV.win;
      this.hooks.sound.padel(kind, center ? { x: def.x, y: 4, z: def.z } : { x: def.x + ev[i + 1], y: 0.6, z: def.z + ev[i + 2] });
      if (this.at?.court !== court) continue;
      const seat = this.seats.get(court);
      if (ev[i] === PEV.win) {
        const team = ev[i + 1] as Team;
        const mine = this.at.slot !== null && teamOf(this.at.slot) === team;
        this.banner(this.at.mode === 'play' ? (mine ? '🏆 You win the match!' : `${this.teamName(seat, team)} win the match`) : `🏆 ${this.teamName(seat, team)} win`, 5000);
      } else if (ev[i] === PEV.game) {
        this.banner(`Game ${this.teamName(seat, ev[i + 1] as Team)} · ${s.games[0]}–${s.games[1]}`, 1800);
      } else if (ev[i] === PEV.point) {
        const team = ev[i + 1] as Team;
        const mine = this.at.mode === 'play' && this.at.slot !== null && teamOf(this.at.slot) === team;
        this.banner(golden(s) ? 'Golden point!' : mine ? `Your point · ${pointsLine(s)}` : `Point ${this.teamName(seat, team)} · ${pointsLine(s)}`, 1300);
      } else if (ev[i] === PEV.fault) this.banner('Fault · second serve', 1100);
    }
  }

  private banner(text: string, ms: number) {
    if (!this.hud) return;
    this.hud.banner.textContent = text;
    this.hud.banner.classList.remove('hidden');
    this.bannerUntil = performance.now() + ms;
  }

  // ---- Your hand and legs --------------------------------------------------------------------

  private key(e: KeyboardEvent, down: boolean) {
    const at = this.at;
    if (e.key === 'Shift') this.shift = down;
    if (!at || at.mode !== 'play' || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (down && !e.repeat) this.swing(e.shiftKey);
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
      this.sendMove();
    }
  }

  /** How you move: steered by the keys held (the court's frame, as seen from your end), else on your own (or standing). */
  private sendMove(force = false) {
    const at = this.at;
    if (!at || at.slot === null) return;
    const k = this.keys;
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ahead = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const f = fwd(teamOf(at.slot));
    // From your end: ahead is toward the net, right is +x for the south end (facing -z).
    const move = [0, right * -f, ahead * f, right || ahead ? 0 : this.autoRun ? 1 : 0];
    const key = move.join(',');
    if (!force && key === this.lastMove) return;
    this.lastMove = key;
    this.send(at.court, at.slot, move);
  }

  /** A swing, aimed where the mouse points (a lob with Shift). */
  private swing(lob: boolean) {
    const at = this.at;
    if (!at || at.mode !== 'play' || at.slot === null) return;
    const aim = this.aimFor(at.court, at.slot);
    this.send(at.court, at.slot, [1, aim.x, aim.z, lob || this.shift ? 1 : 0]);
  }

  /** Where the mouse points on the other half (or somewhere sensible there, if it's not on it). */
  private aimFor(court: CourtId, slot: Slot): { x: number; z: number } {
    const f = fwd(teamOf(slot));
    const s = this.stateOf(court);
    const a = this.aim;
    if (s && s.phase === PHASE.serve && s.server === slot) {
      const box = serviceBox(s);
      const x = a ? Math.min(box.maxX - 0.4, Math.max(box.minX + 0.4, a.x)) : (box.minX + box.maxX) / 2;
      return { x, z: f * Math.min(6.4, Math.max(2.6, a && Math.sign(a.z) === f ? Math.abs(a.z) : 4.5)) };
    }
    if (!a) return { x: 0, z: f * 7 };
    return { x: Math.max(-HALF_W + 0.5, Math.min(HALF_W - 0.5, a.x)), z: f * Math.min(HALF_L - 0.8, Math.max(2.4, Math.sign(a.z) === f ? Math.abs(a.z) : 2.4)) };
  }

  /** A move of yours: straight into the game if your page runs it, else to the page that does. */
  private send(court: CourtId, slot: Slot, input: number[]) {
    const run = this.hosted.get(court);
    if (run) return padel.input(run.s, slot, input);
    this.hooks.net.send({ t: 'padel.input', court, input });
  }

  /** Where the mouse points on the court's floor, in its frame. */
  private pointAt(court: CourtId): { x: number; z: number } | null {
    if (!this.mouse) return null;
    const def = courtDef(court);
    const r = this.hooks.canvas.getBoundingClientRect();
    ndc.set(((this.mouse.x - r.left) / r.width) * 2 - 1, -((this.mouse.y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, this.hooks.camera);
    if (!ray.ray.intersectPlane(floorPlane, hitPt)) return null;
    return { x: hitPt.x - def.x, z: hitPt.z - def.z };
  }

  private stateOf(court: CourtId): PadelState | null {
    return this.hosted.get(court)?.s ?? this.remote.get(court)?.s ?? null;
  }

  // ---- Every frame -----------------------------------------------------------------------------

  /** Runs the courts this page hosts, draws them all, and moves the camera onto yours. Call it after the player has placed the camera. */
  update(dt: number) {
    const now = performance.now();
    const inHall = store.floor === HALL;
    const courts = this.courts();
    this.camera(dt);
    const at = this.at;
    if (at && at.mode === 'play' && at.slot !== null) {
      const p = this.pointAt(at.court);
      if (p) this.aim = p;
      // Keys held count as steering until they're let go (a blur clears them).
      if (now - this.movedAt > 1000) {
        this.movedAt = now;
        if (!this.hosted.has(at.court)) this.sendMove(true);
      }
    }
    const step = Math.min(dt, 0.05);
    for (const [id, run] of this.hosted) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      // The computer plays every place nobody has.
      for (const slot of SLOTS) {
        if (seat.players[slot]) continue;
        run.s.ctl[slot] = 1;
        for (const a of padel.cpu(run.s, slot, Math.random)) padel.input(run.s, slot, a);
      }
      const ev: number[] = [];
      padel.step(run.s, step, ev, Math.random);
      // Someone who never serves: after a while it goes by itself.
      if (run.s.phase === PHASE.serve && run.s.toss < 0 && seat.players[run.s.server] && run.s.wait > 12) padel.input(run.s, run.s.server, [1, 0, fwd(teamOf(run.s.server)) * 4.5, 0]);
      run.ev.push(...ev);
      if (run.ev.length > 57) run.ev.splice(0, run.ev.length - 57);
      this.happened(id, ev, run.s);
      if (run.s.win !== -1 && !run.restartAt) run.restartAt = now + RESTART_AFTER;
      if (run.restartAt && now >= run.restartAt) {
        run.s = padel.init();
        run.restartAt = 0;
      }
      if (now - run.sentAt >= SEND_EVERY) {
        run.sentAt = now;
        this.hooks.net.send({ t: 'padel.sync', court: id, snap: { s: padel.encode(run.s), score: [run.s.games[0], run.s.games[1]], win: run.s.win, ...(run.ev.length ? { ev: run.ev } : {}) } });
        run.ev = [];
      }
    }
    // Between snapshots, the others' courts run on a moment by themselves (only for the look).
    for (const r of this.remote.values()) {
      r.age += step;
      if (r.age < 0.2) padel.step(r.s, step, [], Math.random);
    }
    if (!courts || !inHall) return;
    if (now - this.castAt > 1000) {
      this.castAt = now;
      this.cast();
    }
    for (const def of COURTS) {
      const seat = this.seats.get(def.id);
      const s = seat?.players.some(Boolean) ? this.stateOf(def.id) : null;
      const v = courts.views[def.id];
      v.draw(s, dt);
      v.board(s ? { names: [this.teamName(seat, 0), this.teamName(seat, 1)], s } : null);
      v.focus(at?.court === def.id && at.mode === 'play' ? at.slot : null);
      const mine = at?.court === def.id && at.mode === 'play' && at.slot !== null && !!s && s.win === -1;
      const a = mine ? this.aimFor(def.id, at!.slot!) : null;
      v.aim(!!a, a?.x ?? 0, a?.z ?? 0);
    }
    this.renderHud(now);
  }

  /** Glides the camera onto the court (behind your player, or high over the south end to watch) and back. */
  private camera(dt: number) {
    const cam = this.hooks.camera;
    const at = this.at;
    const target = at ? 1 : 0;
    if (this.zoom === target && !target) return;
    this.zoom += (target - this.zoom) * Math.min(1, dt * 4);
    if (Math.abs(target - this.zoom) < 0.002) this.zoom = target;
    if (!at) {
      cam.position.lerp(this.camPos, this.zoom);
      cam.quaternion.slerp(this.camQuat, this.zoom);
      return;
    }
    const def = courtDef(at.court);
    const s = this.stateOf(at.court);
    if (at.mode === 'play' && at.slot !== null && s) {
      const me = s.p[at.slot];
      const back = -fwd(teamOf(at.slot));
      const cz = def.z + me[1] + back * 4.6;
      const lim = HALL_ROOM.maxZ - 1.2;
      want.set(def.x + me[0] * 0.85, 3.1, Math.max(-lim, Math.min(lim, cz)));
      look.set(def.x + me[0] * 0.45, 0.7, def.z + me[1] - back * 7);
    } else {
      want.set(def.x, 9, def.z + HALL_ROOM.maxZ - 1.2);
      look.set(def.x, 0, def.z - 2);
    }
    // Following smoothly, not every jitter of the player.
    if (this.camAt.lengthSq() === 0 || this.zoom < 0.05) this.camAt.copy(want);
    else this.camAt.lerp(want, Math.min(1, dt * 5));
    lookAt.lookAt(this.camAt, look, UP);
    turn.setFromRotationMatrix(lookAt);
    this.camPos.copy(this.camAt);
    this.camQuat.copy(turn);
    cam.position.lerp(this.camAt, this.zoom);
    cam.quaternion.slerp(turn, this.zoom);
  }

  /** The bar at the top: the teams, games and points, and what to do. */
  private renderHud(now: number) {
    const hud = this.hud;
    const at = this.at;
    if (!hud || !at) return;
    if (now > this.bannerUntil) hud.banner.classList.add('hidden');
    const s = this.stateOf(at.court);
    const seat = this.seats.get(at.court);
    let score = 'Waiting for the court…';
    let tip = at.mode === 'watch' ? '👀 Watching · ✕ or Esc to step away' : at.slot === null ? 'Stepping on…' : TIP;
    if (s) {
      score = `${this.teamName(seat, 0)}  ${s.games[0]} : ${s.games[1]}  ${this.teamName(seat, 1)} · ${s.win !== -1 ? 'match over' : pointsLine(s)}`;
      if (at.mode === 'play' && at.slot !== null && s.win === -1) {
        if (s.phase === PHASE.serve && s.server === at.slot && s.toss < 0) tip = `Your ${s.second ? 'second ' : ''}serve: aim into the lit box, click or Space`;
        else if (s.phase === PHASE.serve) tip = `${s.server === at.slot ? 'Serving…' : `${seat?.players[s.server]?.name ?? CPU} to serve`}`;
      }
      if (s.win !== -1) tip = 'A new match in a moment · ✕ to step off';
    }
    const key = `${score}|${tip}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    hud.score.textContent = score;
    hud.tip.textContent = tip;
  }
}

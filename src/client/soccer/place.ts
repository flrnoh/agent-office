import * as THREE from 'three';
import {
  GOAL,
  MAX_PER_TEAM,
  PITCH,
  PITCH_CX,
  SOCCER,
  SOCCER_ENTRY,
  SOCCER_NAME,
  SOCCER_ROOM,
  SOCCER_STREET_SPOT,
  TEAM_COLOR,
  TEAM_NAME,
  clockText,
  onPitch,
  type SoccerServerMsg,
  type SoccerView,
  type Team,
} from '../../shared/soccer';
import { canKick } from '../../shared/soccer-ball';
import type { ClientMsg, FloorInfo, ServerMsg } from '../../shared/protocol';
import { streetBelow } from '../../shared/layout';
import type { Collider, Interactable } from '../world/office';
import { buildSoccerInterior, type SoccerInterior } from '../world/soccer/interior';
import { h, toast } from '../ui/dom';
import { isTyping } from '../player';
import { BallView } from './ball';
import { SoccerShow } from './show'; // stats, replays, kits and moves
import type { Person } from '../world/character';
import './soccer.css';

/*
 * The soccer hall across the street (flrnoh fork, see FORK.md "The soccer hall"), on this page: going
 * in and out, the room inside (a place of its own like the casino, built the first time you go in),
 * joining a team, kicking, the ball, the bibs, the scoreboards and the bar at the top, sounds, and the
 * light inside. main.ts hooks it in with a few lines; everything else is here.
 *
 * Kicking: hold the left mouse button (or Space) to charge, let go to kick the way you face; the right
 * mouse button (or Shift while charging) chips it. The office decides whether you reached the ball.
 */

/** Where you stand, to be put somewhere: main.ts's placeAt. */
type Spot = { x: number; y: number; z: number; rotY: number };

export type SoccerSoundKind = 'door' | 'kick' | 'board' | 'post' | 'net' | 'whistle' | 'final' | 'cheer';

export interface SoccerHost {
  scene: THREE.Scene;
  canvas: HTMLElement;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): SOCCER while inside. */
  floor(): string | null;
  /** Your id (store.you). */
  you(): string;
  /** The building's floors, bottom first (builtFloors). */
  floors(): FloorInfo[];
  /** On the office's map (the hall is only on its street). */
  inOffice(): boolean;
  player: {
    pos: THREE.Vector3;
    facing: number;
    view: 'first' | 'third';
    enabled: boolean;
    colliders: Collider[];
    room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean };
  };
  /** Someone's body (you too), to put a bib on: its root. */
  body(id: string): THREE.Object3D | undefined;
  /** Hides the office and everything round it while you're inside, and shows it again after. */
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): SoccerHost['player']['room'];
  /** In the hall there's no rain, and it lights itself (see mood). */
  setIndoors(on: boolean): void;
  /** Off to floor `floor` (or the hall), faded, landing `at`: main.ts's trip. */
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: SoccerSoundKind, at: { x: number; y: number; z: number }, strength: number): void;
  confetti(x: number, y: number, z: number): void;
  /** Someone's Person (you too), for their kit and moves (show.ts). */
  person?(id: string): Person | undefined;
  /** The view's camera, for the replay (show.ts). */
  camera?: THREE.Camera;
}

const FROM_KEY = 'agent-office.soccer.from';
/** Holding this long charges a kick fully (ms). */
const CHARGE_MS = 900;

export class SoccerPlace {
  private room: SoccerInterior | null = null;
  /** In the hall now (setPlace). */
  active = false;
  private outside: Spot | null = null;
  private arriving = false;
  private view: SoccerView | null = null;
  private viewAt = 0;
  /** When the last goal went in (for the scoreboards' flash). */
  private goalAt = -1e9;
  private ball = new BallView();
  /** Your team, as the office last said (kept over a reconnect, to join again). */
  private team: Team | undefined;
  /** Asked to join and not heard yet: until when not to put you off the pitch. */
  private joining = 0;
  private charge: { t0: number; chip: boolean } | null = null;
  private bibs = new Map<string, { root: THREE.Object3D; group: THREE.Group; team: Team }>();
  private hud: HTMLElement | null = null;
  private meter: HTMLElement | null = null;
  private light = new THREE.Color('#fbfff6');
  private floorLight = new THREE.Color('#5f7a66');
  /** The stats, the replay, the kits and the moves (show.ts). */
  private show: SoccerShow;

  constructor(private host: SoccerHost) {
    this.show = new SoccerShow(host); // first, so its keys (Tab, skipping a replay) come before kicking's
    // Kicking: captured before the player's own handlers, only while you play in here.
    window.addEventListener('pointerdown', (e) => this.pointerDown(e), true);
    window.addEventListener('pointerup', (e) => this.pointerUp(e), true);
    window.addEventListener('contextmenu', (e) => this.playing() && e.target === this.host.canvas && e.preventDefault(), true);
    window.addEventListener('keydown', (e) => this.key(e, true), true);
    window.addEventListener('keyup', (e) => this.key(e, false), true);
    window.addEventListener('blur', () => (this.charge = null));
  }

  private theRoom(): SoccerInterior {
    if (!this.room) {
      this.room = buildSoccerInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      this.show.setRoom(this.room);
    }
    return this.room;
  }

  get interactables(): Interactable[] {
    return this.active && this.room ? this.room.interactables : [];
  }

  get pickables(): THREE.Object3D[] {
    return this.active && this.room ? this.room.pickables : [];
  }

  /** Whether you play (on a team, in the hall). */
  playing(): boolean {
    return this.active && !!this.team;
  }

  /** A goal's replay is on screen (main.ts keeps the first-person hands out of it). */
  get replaying(): boolean {
    return this.show.replaying;
  }

  // ---- In and out -----------------------------------------------------------------------------------

  private from(): string | undefined {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(FROM_KEY);
    } catch {
      // private mode: the bottom floor it is
    }
    const floors = this.host.floors();
    return (floors.find((f) => f.id === id) ?? floors[0])?.id;
  }

  /** E at the doors on the street: in you go. */
  go() {
    const here = this.host.floor();
    if (!here || here === SOCCER) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.sound('door', this.host.player.pos, 1);
    this.host.trip(SOCCER);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the hall. */
  leave() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const at = { x: SOCCER_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: SOCCER_STREET_SPOT.z, rotY: SOCCER_STREET_SPOT.rotY };
    this.outside = at;
    this.team = undefined;
    this.host.sound('door', this.host.player.pos, 1);
    this.host.trip(to, at);
  }

  private roomBox() {
    return { minX: SOCCER_ROOM.minX, maxX: SOCCER_ROOM.maxX, minZ: SOCCER_ROOM.minZ, maxZ: SOCCER_ROOM.maxZ, wall: 0.3, enclosed: true };
  }

  private inside(p: THREE.Vector3): boolean {
    return p.x > SOCCER_ROOM.minX && p.x < SOCCER_ROOM.maxX && p.z > SOCCER_ROOM.minZ && p.z < SOCCER_ROOM.maxZ && p.y > -0.5 && p.y < 2;
  }

  private entry(): Spot {
    return { x: SOCCER_ENTRY.x, y: 0, z: SOCCER_ENTRY.z, rotY: SOCCER_ENTRY.rotY };
  }

  /** You arrived somewhere (main.ts's setPlace): in the hall, its room is what you see and walk in; anywhere else, the office is back. */
  setPlace(inside: boolean) {
    if (inside && !this.host.inOffice()) {
      const to = this.from();
      if (to) this.host.trip(to);
      return;
    }
    if (inside === this.active) return;
    this.active = inside;
    if (inside) {
      const r = this.theRoom();
      r.group.visible = true;
      this.host.showOffice(false);
      this.host.player.colliders = r.colliders;
      this.host.player.room = this.roomBox();
      this.host.setIndoors(true);
    } else {
      if (this.room) this.room.group.visible = false;
      this.host.showOffice(true);
      this.host.player.colliders = this.host.officeColliders();
      this.host.player.room = this.host.officeRoom();
      this.host.setIndoors(false);
      this.team = undefined;
      this.view = null;
      this.charge = null;
      this.clearBibs();
    }
    this.show.setActive(inside);
    this.showHud(inside);
  }

  /** The building's map changed while you're inside: on the office's, still in here; on a map of its own, back to a floor. */
  refresh() {
    if (!this.active || !this.room) return;
    if (!this.host.inOffice()) {
      const to = this.from();
      if (to) this.host.trip(to);
      return;
    }
    this.host.showOffice(false);
    this.host.player.colliders = this.room.colliders;
    this.host.player.room = this.roomBox();
    if (!this.inside(this.host.player.pos)) this.host.placeAt(this.entry());
  }

  /** After a welcome or a trip: where you stand, now the place you're in is set up. */
  arrived() {
    if (this.active) {
      if (this.arriving || !this.inside(this.host.player.pos)) this.host.placeAt(this.entry());
      this.arriving = false;
      this.outside = null;
      // Back after a reconnect while playing: onto your team again (the office took you off when the line dropped).
      if (this.team) {
        this.joining = performance.now() + 2500;
        this.host.send({ t: 'soccer.join' });
      }
      return;
    }
    this.arriving = false;
    if (this.outside) {
      this.host.placeAt(this.outside);
      this.outside = null;
    }
  }

  // ---- Using things -------------------------------------------------------------------------------

  /** E at something of the hall's: the doors, or the boards at the halfway line (join or leave the pitch). True when it was ours. */
  use(it: Interactable, key: string): boolean {
    if (it.kind === 'soccer') {
      if (key === 'E') {
        if (this.active) this.leave();
        else this.go();
      }
      return true;
    }
    if (it.kind !== 'soccer-pitch') return false;
    if (key !== 'E' || !this.active) return true;
    if (this.team) {
      this.host.send({ t: 'soccer.leave' });
      this.offPitch(it.x);
    } else {
      this.joining = performance.now() + 2500;
      this.host.send({ t: 'soccer.join' });
    }
    return true;
  }

  /** Onto your team's half, facing the goal you attack. */
  private onToPitch(team: Team) {
    const n = this.view?.players.filter((p) => p.team === team).length ?? 1;
    const x = PITCH_CX + ((n % 5) - 2) * 2.2;
    const z = team === 'red' ? -4 : 4;
    this.host.placeAt({ x, y: 0, z, rotY: team === 'red' ? 0 : Math.PI });
  }

  /** Off the pitch over the boards, on the side you're nearest (or `sideX`'s). */
  private offPitch(sideX?: number) {
    const p = this.host.player.pos;
    const west = (sideX ?? p.x) < PITCH_CX;
    const z = THREE.MathUtils.clamp(p.z, PITCH.minZ + 1, PITCH.maxZ - 1);
    this.host.placeAt({ x: west ? PITCH.minX - 1.1 : PITCH.maxX + 1.1, y: 0, z, rotY: west ? -Math.PI / 2 : Math.PI / 2 });
  }

  // ---- Kicking ------------------------------------------------------------------------------------

  /** Whether a click on the world is yours to kick with (not the one that takes the mouse, not under a window). */
  private kickable(e: Event): boolean {
    if (!this.playing() || !this.host.player.enabled || e.target !== this.host.canvas) return false;
    if (document.querySelector('.backdrop')) return false;
    if (this.host.player.view === 'first' && !document.pointerLockElement) return false;
    return true;
  }

  private pointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.button !== 2) return;
    if (!this.kickable(e)) return;
    e.stopPropagation();
    e.preventDefault();
    this.startCharge(e.button === 2);
  }

  private pointerUp(e: PointerEvent) {
    if (!this.charge || (e.button !== 0 && e.button !== 2)) return;
    e.stopPropagation();
    this.release();
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (!this.playing() || isTyping(e)) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (down && this.charge) this.charge.chip = true;
      return;
    }
    if (e.code !== 'Space') return;
    // Space kicks in here (no jumping on the pitch).
    e.preventDefault();
    e.stopPropagation();
    if (document.querySelector('.backdrop') || !this.host.player.enabled) return;
    if (down && !e.repeat && !this.charge) this.startCharge(false);
    else if (!down && this.charge) this.release();
  }

  private startCharge(chip: boolean) {
    this.charge = { t0: performance.now(), chip };
  }

  private release() {
    const c = this.charge;
    this.charge = null;
    if (!c || !this.playing()) return;
    const power = Math.min(1, (performance.now() - c.t0) / CHARGE_MS);
    const dir = this.host.player.facing;
    const loft = c.chip ? 1 : 0;
    this.host.send({ t: 'soccer.kick', power, dir, loft });
    // In reach as far as this page knows: it goes at once (the office confirms or corrects it).
    const p = this.host.player.pos;
    const b = this.ball.b;
    if (canKick(b, p.x, p.z) && this.mayTouch()) {
      this.ball.kick(power, dir, loft);
      this.host.sound('kick', { x: b.x, y: b.y, z: b.z }, 0.4 + power * 0.6);
    }
  }

  private mayTouch(): boolean {
    const v = this.view;
    if (!v || !this.team) return false;
    if (v.phase === 'waiting' || v.phase === 'paused') return true;
    return v.phase === 'play' && (!v.kickoff || v.kickoff === this.team);
  }

  // ---- The office's news --------------------------------------------------------------------------

  onMessage(msg: ServerMsg) {
    if (msg.t !== 'soccer' && msg.t !== 'soccer.ball') return;
    this.show.onMessage(msg as SoccerServerMsg); // stats, replays, moves
    const m = msg as SoccerServerMsg;
    if (m.t === 'soccer.ball') {
      this.ball.snapshot(m.b);
      if (m.hit && !(m.hit === 'kick' && m.by === this.host.you())) {
        const at = { x: m.b[0], y: m.b[2], z: m.b[1] };
        const s = Math.min(1, (m.hs ?? 5) / 18);
        this.host.sound(m.hit === 'bar' ? 'post' : m.hit, at, s);
      }
      return;
    }
    const was = this.team;
    this.view = m.state;
    this.viewAt = performance.now();
    const me = m.state.players.find((p) => p.id === this.host.you());
    this.team = me?.team;
    if (this.active && this.team && this.team !== was) {
      this.joining = 0;
      this.onToPitch(this.team);
    } else if (this.active && was && !this.team) {
      // Back after a reconnect, the office doesn't have you on a team until your join (sent in arrived) lands.
      if (performance.now() < this.joining) this.team = was;
      else if (onPitch(this.host.player.pos.x, this.host.player.pos.z)) this.offPitch();
    }
    const ev = m.event;
    if (ev) {
      const centre = { x: PITCH_CX, y: 1.5, z: 0 };
      if (ev.kind === 'goal' && ev.team) {
        this.goalAt = performance.now();
        const goalZ = ev.team === 'red' ? PITCH.maxZ : PITCH.minZ;
        this.host.sound('cheer', { x: PITCH_CX, y: 2, z: goalZ }, 1);
        this.host.sound('whistle', centre, 0.8);
        if (this.active) this.host.confetti(PITCH_CX, GOAL.height, goalZ);
      }
      if (ev.kind === 'play') this.host.sound('whistle', centre, 0.7);
      if (ev.kind === 'end') this.host.sound('final', centre, 1);
      if (ev.text && ev.kind !== 'kickoff' && ev.kind !== 'play') toast(ev.text, ev.kind === 'pause' ? 'warn' : 'info');
    }
    this.renderHud();
  }

  // ---- What it says ---------------------------------------------------------------------------------

  private counts(): Record<Team, number> {
    const c = { red: 0, blue: 0 };
    for (const p of this.view?.players ?? []) c[p.team] += 1;
    return c;
  }

  /** The hint bar over something of the hall's, or null when it isn't the hall's. */
  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null {
    if (it.kind === 'soccer') return this.active ? { k: 'soccer-out', parts: [title('🚪 Street'), key('E', 'Go out')] } : { k: 'soccer-in', parts: [title(`⚽ ${SOCCER_NAME}`), aside('indoor five-a-side'), key('E', 'Go in')] };
    if (it.kind !== 'soccer-pitch') return null;
    const c = this.counts();
    const teams = aside(`Red ${c.red} · Blue ${c.blue}`);
    if (this.team) return { k: `pitch-in|${this.team}`, parts: [title(`⚽ You play for ${TEAM_NAME[this.team]}`), key('E', 'Leave the pitch')] };
    if (c.red >= MAX_PER_TEAM && c.blue >= MAX_PER_TEAM) return { k: 'pitch-full', parts: [title('⚽ Pitch'), aside('full: 5 a side')] };
    return { k: `pitch|${c.red}|${c.blue}`, parts: [title('⚽ Pitch'), teams, key('E', 'Join a team')] };
  }

  private clock(): number {
    const v = this.view;
    if (!v) return 5 * 60_000;
    return Math.max(0, v.clockMs - (v.running ? performance.now() - this.viewAt : 0));
  }

  private scoreLine(): string {
    const v = this.view;
    const s = v?.score ?? { red: 0, blue: 0 };
    return `Red ${s.red}:${s.blue} Blue · ${clockText(this.clock())}`;
  }

  /** The top bar's title, inside. */
  title(): { name: string; meta: string } {
    return { name: `⚽ ${SOCCER_NAME}`, meta: this.scoreLine() };
  }

  private showHud(on: boolean) {
    if (on && !this.hud) {
      this.hud = h('div.soccer-hud', { 'aria-live': 'polite' });
      this.meter = h('div.soccer-meter', {}, h('i'));
      document.body.append(this.hud, this.meter);
    }
    if (this.hud) this.hud.hidden = !on;
    if (this.meter) this.meter.hidden = true;
    this.renderHud();
  }

  private hudKey = '';
  private renderHud() {
    const el = this.hud;
    if (!el || el.hidden) return;
    const v = this.view;
    const s = v?.score ?? { red: 0, blue: 0 };
    const phase = !v || v.phase === 'waiting' ? (v?.players.length ? 'waiting for both teams' : 'E at the halfway boards to play') : v.phase === 'kickoff' ? `kick-off: ${TEAM_NAME[v.kickoff ?? 'red']}` : v.phase === 'paused' ? 'paused' : v.phase === 'goal' ? 'GOAL!' : v.phase === 'over' ? 'full time' : '';
    const mine = this.team ? `you: ${TEAM_NAME[this.team]}` : '';
    const key = `${s.red}|${s.blue}|${clockText(this.clock())}|${phase}|${mine}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    el.replaceChildren(
      h('b.red', {}, `${s.red}`),
      h('span', {}, ':'),
      h('b.blue', {}, `${s.blue}`),
      h('span.clock', {}, clockText(this.clock())),
      ...(phase ? [h('small', {}, phase)] : []),
      ...(mine ? [h(`small.mine.${this.team}`, {}, mine)] : []),
    );
  }

  // ---- Bibs -----------------------------------------------------------------------------------------

  private bibFor(team: Team): THREE.Group {
    const g = new THREE.Group();
    // The shirt's the kit's (show.ts, kit.ts): here just the ring under their feet.
    const ringMat = new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.85, depthWrite: false });
    ringMat.toneMapped = false;
    ringMat.userData.outlineParameters = { visible: false };
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    g.userData.soccerBib = true;
    return g;
  }

  private syncBibs() {
    const want = new Map<string, Team>();
    if (this.active) for (const p of this.view?.players ?? []) want.set(p.id, p.team);
    for (const [id, b] of this.bibs) {
      const root = this.host.body(id);
      if (want.get(id) !== b.team || root !== b.root) {
        b.group.removeFromParent();
        b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.bibs.delete(id);
      }
    }
    for (const [id, team] of want) {
      if (this.bibs.has(id)) continue;
      const root = this.host.body(id);
      if (!root) continue;
      const group = this.bibFor(team);
      root.add(group);
      this.bibs.set(id, { root, group, team });
    }
  }

  private clearBibs() {
    for (const b of this.bibs.values()) {
      b.group.removeFromParent();
      b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.bibs.clear();
  }

  // ---- Every frame ----------------------------------------------------------------------------------

  update(t: number, dt: number) {
    if (!this.active || !this.room) return;
    const moved = this.ball.update(dt);
    const s = this.ball.shown;
    this.room.setBall(s.x, s.y, s.z, moved.dx, moved.dz);
    const since = performance.now() - this.goalAt;
    this.room.setBoard(this.view, this.clock(), since < 3000 ? 1 - since / 3000 : 0);
    this.room.update(t, dt);
    this.show.update(dt, this.view, this.ball, this.clock()); // kits, moves, the replay (after the ball's placed)
    this.syncBibs();
    this.renderHud();
    // On the pitch without a team (back after a reload, say): over the boards you go.
    const p = this.host.player.pos;
    if (!this.team && performance.now() > this.joining && onPitch(p.x, p.z, -0.2) && p.y < 1) this.offPitch();
    // The kick's meter.
    if (this.meter) {
      this.meter.hidden = !this.charge;
      if (this.charge) {
        const k = Math.min(1, (performance.now() - this.charge.t0) / CHARGE_MS);
        (this.meter.firstChild as HTMLElement).style.width = `${Math.round(k * 100)}%`;
        this.meter.classList.toggle('chip', this.charge.chip);
      }
    }
  }

  /** Inside, the hall lights itself: bright and even, no sun through the roof, no haze. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
    lights.sun.intensity = 0;
    lights.hemi.color.copy(this.light);
    lights.hemi.groundColor.copy(this.floorLight);
    lights.hemi.intensity = 1.5;
    lights.ambient.color.copy(this.light);
    lights.ambient.intensity = 0.8;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

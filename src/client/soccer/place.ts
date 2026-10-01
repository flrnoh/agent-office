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
import { BALL_R, KICK_REACH, type Footer, type KickSpec, type Mate, canKick, passKick, shotKick } from '../../shared/soccer-ball';
import type { ClientMsg, FloorInfo, ServerMsg } from '../../shared/protocol';
import { streetBelow } from '../../shared/layout';
import type { Collider, Interactable } from '../world/office';
import { buildSoccerInterior, type SoccerInterior } from '../world/soccer/interior';
import { h, toast } from '../ui/dom';
import { isTyping } from '../player';
import { BallView } from './ball';
import { KickButton, TAP_MS } from './controls';
import './soccer.css';

/*
 * The soccer hall across the street (flrnoh fork, see FORK.md "The soccer hall"), on this page: going
 * in and out, the room inside (a place of its own like the casino, built the first time you go in),
 * joining a team, kicking, the ball, the bibs, the scoreboards and the bar at the top, sounds, and the
 * light inside. main.ts hooks it in with a few lines; everything else is here.
 *
 * Playing: run into the ball and it's yours (taken at your feet on this page at once, see ball.ts), and
 * it stays in front of you as you run. A tap of the left mouse button (or Space) passes to the teammate
 * you look at (shared/soccer-ball.ts passKick); holding it charges a shot (the meter by the crosshair,
 * a line on the floor from the ball) that goes where you look, up if you look up; the right button
 * (or C) does the same in the air: a lob to a teammate, or a chip. Pressed a moment before the ball's
 * in reach, the kick waits for it; a moment after, it still goes. The office decides in the end.
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
    /** First person: how far up you look (the kick's lift), and a kick's jolt of the view. */
    lookPitch: number;
    camDist: number;
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
}

const FROM_KEY = 'agent-office.soccer.from';
/** After your kick you don't take the ball straight back (ms; the office's KICK_COOL_MS). */
const KICK_COOL_MS = 250;
/** The key that lobs and chips, besides the right mouse button (Shift is sprinting). */
const LOB_KEY = 'KeyC';
/** Looking this far down (first person, radians) is a flat shot; every bit higher lifts it. */
const LIFT_ZERO = 0.05;
/** A kick's jolt of the view lasts this long (ms). */
const RECOIL_MS = 170;

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
  /** The kick button: held, or a kick waiting for the ball (controls.ts). */
  private button = new KickButton();
  /** When the ball was last in your reach, when you may take it again after your kick (ms), how you run. */
  private reachAt = -1e9;
  private coolUntil = 0;
  private vel = { x: 0, z: 0 };
  private lastPos = { x: 0, z: 0 };
  /** Everyone else on the pitch: where their bodies are and how they run. */
  private tracks = new Map<string, { x: number; z: number; vx: number; vz: number }>();
  private recoil: { t0: number; a: number; applied: number } | null = null;
  private passedTo: { id: string; until: number } | null = null;
  private arrow: THREE.Group | null = null;
  private aimEl: HTMLElement | null = null;
  private keysEl: HTMLElement | null = null;
  private bibs = new Map<string, { root: THREE.Object3D; group: THREE.Group; team: Team }>();
  private hud: HTMLElement | null = null;
  private light = new THREE.Color('#fbfff6');
  private floorLight = new THREE.Color('#5f7a66');

  constructor(private host: SoccerHost) {
    // Kicking: captured before the player's own handlers, only while you play in here.
    window.addEventListener('pointerdown', (e) => this.pointerDown(e), true);
    window.addEventListener('pointerup', (e) => this.pointerUp(e), true);
    window.addEventListener('contextmenu', (e) => this.playing() && e.target === this.host.canvas && e.preventDefault(), true);
    window.addEventListener('keydown', (e) => this.key(e, true), true);
    window.addEventListener('keyup', (e) => this.key(e, false), true);
    window.addEventListener('blur', () => (this.button.press = null));
  }

  private theRoom(): SoccerInterior {
    if (!this.room) {
      this.room = buildSoccerInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
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
      this.button.cancel();
      this.ball.release();
      this.clearBibs();
    }
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
    this.button.down(performance.now(), e.button === 2, `m${e.button}`);
  }

  private pointerUp(e: PointerEvent) {
    if (this.button.press?.by !== `m${e.button}`) return;
    e.stopPropagation();
    this.release(`m${e.button}`);
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (!this.playing() || isTyping(e)) return;
    if (e.code !== 'Space' && e.code !== LOB_KEY) return;
    // Space kicks in here (no jumping on the pitch), C lobs.
    e.preventDefault();
    e.stopPropagation();
    if (down && (document.querySelector('.backdrop') || !this.host.player.enabled)) return;
    if (down && !e.repeat) this.button.down(performance.now(), e.code === LOB_KEY, e.code);
    else if (!down) this.release(e.code);
  }

  /** Let go: a tap passes, a hold shoots (charged by how long); it goes now if the ball's in reach, else as soon as it is (for a moment). */
  private release(by: string) {
    const now = performance.now();
    if (!this.button.up(now, by) || !this.playing()) return;
    this.tryKick(now);
  }

  /** Where you aim: the way you look (first person: up a little lifts a shot), or the way you face. */
  private aim(): { dir: number; lift: number } {
    const pl = this.host.player;
    return { dir: pl.facing, lift: pl.view === 'first' ? Math.max(0, pl.lookPitch + LIFT_ZERO) : 0 };
  }

  /** Your teammates on the pitch, where they are and how they run (for a pass). */
  private mates(): Mate[] {
    const out: Mate[] = [];
    for (const pl of this.view?.players ?? []) {
      if (pl.team !== this.team || pl.id === this.host.you()) continue;
      const t = this.tracks.get(pl.id);
      if (t) out.push({ id: pl.id, x: t.x, z: t.z, vx: t.vx, vz: t.vz });
    }
    return out;
  }

  /** The kick a tap (or a hold) makes now. */
  private kickNow(k: { lob: boolean; shot: boolean; charge: number }): KickSpec & { to?: string | null } {
    const a = this.aim();
    if (k.shot) return shotKick(a.dir, a.lift, k.charge, k.lob);
    return passKick(this.ball.b, a.dir, this.mates(), k.lob);
  }

  private tryKick(now: number) {
    const p = this.host.player.pos;
    const k = this.button.fire(now, canKick(this.ball.b, p.x, p.z), this.reachAt, this.mayTouch());
    if (!k) return;
    const spec = this.kickNow(k);
    this.host.send({ t: 'soccer.kick', power: spec.power, dir: spec.dir, loft: spec.loft, lift: spec.lift });
    // It goes at once on this page (the office confirms or corrects it).
    this.ball.kick(spec, now);
    this.coolUntil = now + KICK_COOL_MS;
    const b = this.ball.shown;
    this.host.sound('kick', { x: b.x, y: b.y, z: b.z }, 0.35 + spec.power * 0.65);
    this.recoil = { t0: now, a: 0.012 + 0.03 * spec.power, applied: 0 };
    if (spec.to) this.passedTo = { id: spec.to, until: now + 900 };
  }

  private mayTouch(): boolean {
    const v = this.view;
    if (!v || !this.team) return false;
    if (v.phase === 'waiting' || v.phase === 'paused') return true;
    return v.phase === 'play' && (!v.kickoff || v.kickoff === this.team);
  }

  /** You as the ball sees you (for dribbling on this page), or null when you may not touch it. */
  private footer(now: number): Footer | null {
    if (!this.team || !this.mayTouch() || !this.host.player.enabled) return null;
    const p = this.host.player.pos;
    return { id: this.host.you(), team: this.team, x: p.x, z: p.z, vx: this.vel.x, vz: this.vel.z, facing: this.host.player.facing, free: now >= this.coolUntil };
  }

  /** How everyone on the pitch moves (their bodies, frame to frame), and you. */
  private trackPlayers(dt: number) {
    const k = Math.min(1, dt * 12);
    const me = this.host.player.pos;
    const vx = dt > 0 ? (me.x - this.lastPos.x) / dt : 0;
    const vz = dt > 0 ? (me.z - this.lastPos.z) / dt : 0;
    // Put somewhere (joining, a kickoff): no speed from that.
    const jump = Math.hypot(vx, vz) > 12;
    this.vel.x = jump ? 0 : this.vel.x + (vx - this.vel.x) * k;
    this.vel.z = jump ? 0 : this.vel.z + (vz - this.vel.z) * k;
    this.lastPos = { x: me.x, z: me.z };
    const seen = new Set<string>();
    for (const pl of this.view?.players ?? []) {
      if (pl.id === this.host.you()) continue;
      const root = this.host.body(pl.id);
      if (!root) continue;
      seen.add(pl.id);
      const x = root.position.x;
      const z = root.position.z;
      const t = this.tracks.get(pl.id);
      if (!t) {
        this.tracks.set(pl.id, { x, z, vx: 0, vz: 0 });
        continue;
      }
      const rvx = dt > 0 ? (x - t.x) / dt : 0;
      const rvz = dt > 0 ? (z - t.z) / dt : 0;
      const far = Math.hypot(rvx, rvz) > 12;
      t.vx = far ? 0 : t.vx + (rvx - t.vx) * k;
      t.vz = far ? 0 : t.vz + (rvz - t.vz) * k;
      t.x = x;
      t.z = z;
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
  }

  /** Whether anybody else on the pitch is nearer the ball than you. */
  private someoneNearer(): boolean {
    const b = this.ball.b;
    const p = this.host.player.pos;
    const mine = Math.hypot(b.x - p.x, b.z - p.z);
    for (const t of this.tracks.values()) if (Math.hypot(b.x - t.x, b.z - t.z) < mine) return true;
    return false;
  }

  /** The ball on this page, every frame: taking it at your feet at once, dribbling it, a kick waiting for it. */
  private play(dt: number, now: number) {
    this.trackPlayers(dt);
    const me = this.footer(now);
    const b = this.ball;
    if (me && !b.poss.id) {
      const other = b.controller && b.controller !== me.id;
      if (b.controller === me.id || (!other && b.canTake(me) && !this.someoneNearer())) b.claim(me, now);
    }
    const moved = b.update(dt, me, now);
    const p = this.host.player.pos;
    if (canKick(b.b, p.x, p.z)) this.reachAt = now;
    this.tryKick(now);
    return moved;
  }

  /** The kick's little jolt of the view: up and back in first person, in and out in third. */
  private jolt(now: number) {
    const r = this.recoil;
    if (!r) return;
    const t = (now - r.t0) / RECOIL_MS;
    const want = t >= 1 ? 0 : r.a * Math.sin(Math.PI * t);
    const d = want - r.applied;
    r.applied = want;
    const pl = this.host.player;
    if (pl.view === 'first') pl.lookPitch += d;
    else pl.camDist = Math.max(1, pl.camDist - d * 12);
    if (t >= 1) this.recoil = null;
  }

  // ---- The aim ------------------------------------------------------------------------------------

  private aimArrow(): THREE.Group {
    if (this.arrow) return this.arrow;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    mat.toneMapped = false;
    mat.userData.outlineParameters = { visible: false };
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1), mat);
    strip.rotation.x = -Math.PI / 2;
    strip.name = 'strip';
    const tri = new THREE.Shape();
    tri.moveTo(-0.26, 0);
    tri.lineTo(0.26, 0);
    tri.lineTo(0, 0.42);
    tri.closePath();
    const head = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
    head.rotation.x = Math.PI / 2;
    head.name = 'head';
    g.add(strip, head);
    g.renderOrder = 5;
    g.visible = false;
    g.userData.mat = mat;
    this.theRoom().group.add(g);
    this.arrow = g;
    return g;
  }

  /** The aim on the floor (a line from the ball the way it'll go) and by the crosshair (the power, who a pass is for). */
  private showAim(now: number) {
    const on = this.playing() && this.host.player.enabled;
    if (this.aimEl) this.aimEl.hidden = !on;
    const arrow = this.aimArrow();
    if (!on) {
      arrow.visible = false;
      return;
    }
    const p = this.button.press;
    const charging = !!p && now - p.t0 >= TAP_MS;
    const charge = this.button.charge(now);
    const b = this.ball.shown;
    const pos = this.host.player.pos;
    const near = Math.hypot(b.x - pos.x, b.z - pos.z) < KICK_REACH + 0.6 && this.mayTouch();
    let dir = 0;
    let len = 0;
    let color = '#ffffff';
    let opacity = 0;
    let label = '';
    if (charging) {
      const k = this.kickNow({ lob: p.lob, shot: true, charge });
      dir = k.dir;
      len = 2 + 9 * charge;
      color = p.lob ? '#7ee89a' : charge > 0.85 ? '#ff5a4f' : '#ffd166';
      opacity = 0.75;
      label = p.lob ? 'CHIP' : 'SHOT';
    } else if (near) {
      const k = passKick(this.ball.b, this.aim().dir, this.mates(), !!p?.lob);
      dir = k.dir;
      len = Math.max(1.5, Math.hypot(k.at.x - b.x, k.at.z - b.z));
      color = k.to ? '#bdf3ff' : '#ffffff';
      opacity = k.to ? 0.5 : 0.28;
      const name = k.to ? this.view?.players.find((x) => x.id === k.to)?.name : '';
      label = name ? `→ ${name}` : '';
    }
    arrow.visible = opacity > 0;
    if (arrow.visible) {
      arrow.position.set(b.x, 0.03, b.z);
      arrow.rotation.y = dir;
      const strip = arrow.getObjectByName('strip')!;
      strip.scale.set(1, len, 1);
      strip.position.set(0, 0, len / 2 + BALL_R);
      arrow.getObjectByName('head')!.position.set(0, 0.001, len + BALL_R);
      const mat = arrow.userData.mat as THREE.MeshBasicMaterial;
      mat.color.set(color);
      mat.opacity = opacity;
    }
    const passed = this.passedTo && now < this.passedTo.until ? this.view?.players.find((x) => x.id === this.passedTo!.id)?.name : '';
    const text = charging ? label : passed ? `→ ${passed}` : label;
    const el = this.aimEl;
    if (!el) return;
    el.classList.toggle('charging', charging);
    el.classList.toggle('lob', !!p?.lob);
    el.classList.toggle('full', charging && charge >= 1);
    el.classList.toggle('third', this.host.player.view === 'third');
    (el.querySelector('.bar i') as HTMLElement).style.width = `${Math.round((charging ? charge : 0) * 100)}%`;
    const t = el.querySelector('.who') as HTMLElement;
    if (t.textContent !== text) t.textContent = text;
  }

  // ---- The office's news --------------------------------------------------------------------------

  onMessage(msg: ServerMsg) {
    if (msg.t !== 'soccer' && msg.t !== 'soccer.ball') return;
    const m = msg as SoccerServerMsg;
    if (m.t === 'soccer.ball') {
      const mine = m.hit === 'kick' && m.by === this.host.you();
      this.ball.snapshot(m.b, m.k, m.c, mine);
      if (m.hit && !mine) {
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
      this.keysEl = h('div.soccer-keys', {}, 'Click pass · Hold shoot · Right-click lob · Shift sprint');
      this.aimEl = h('div.soccer-aim', {}, h('span.ring'), h('span.bar', {}, h('i')), h('span.who'));
      document.body.append(this.hud, this.keysEl, this.aimEl);
    }
    if (this.hud) this.hud.hidden = !on;
    if (this.aimEl) this.aimEl.hidden = true;
    if (this.arrow) this.arrow.visible = false;
    this.renderHud();
  }

  private hudKey = '';
  private renderHud() {
    const el = this.hud;
    if (this.keysEl) this.keysEl.hidden = !el || el.hidden || !this.team;
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
    const cloth = new THREE.MeshToonMaterial({ color: TEAM_COLOR[team] });
    const bib = new THREE.Mesh(new THREE.CapsuleGeometry(0.278, 0.26, 4, 12), cloth);
    bib.position.y = 0.72;
    bib.scale.set(1, 1, 0.97);
    g.add(bib);
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
    const now = performance.now();
    const moved = this.play(dt, now);
    const s = this.ball.shown;
    this.room.setBall(s.x, s.y, s.z, moved.dx, moved.dz);
    const since = performance.now() - this.goalAt;
    this.room.setBoard(this.view, this.clock(), since < 3000 ? 1 - since / 3000 : 0);
    this.room.update(t, dt);
    this.syncBibs();
    this.renderHud();
    // On the pitch without a team (back after a reload, say): over the boards you go.
    const p = this.host.player.pos;
    if (!this.team && performance.now() > this.joining && onPitch(p.x, p.z, -0.2) && p.y < 1) this.offPitch();
    // The aim, and a kick's jolt.
    this.showAim(now);
    this.jolt(now);
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

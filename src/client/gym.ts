import * as THREE from 'three';
import { GYM, GYM_ENTRY, GYM_NAME, GYM_ROOM, GYM_STATION_BY_ID, GYM_STREET_SPOT, JUICE_BAR, STAMINA_MAX, rankFor, xpForLevel, type FitnessProfile, type GymServerMsg, type GymStationDef } from '../shared/gym';
import { CARDIO_MACHINES } from '../shared/gym-cardio';
import { EXERCISES } from '../shared/gym-strength';
import { WELLNESS_SPOTS, type WellnessView } from '../shared/gym-wellness';
import { AUFGUSS_BOOST_MS, SPA, WALK_IN_BY_STATION, inRect } from '../shared/gym-rooms';
import { CHANGING_ROOM, inChanging } from '../shared/gym-changing';
import { BASEMENT_ARRIVAL, BASEMENT_BOX, FOYER, HALL, KNEIPP_ROOM, REST, SALT, THERME_PASSAGE, bShowerAt, downstairs, inB } from '../shared/gym-basement'; // fork: the basement
import { GYM_CHANNEL_BY_ID, GYM_RADIO } from '../shared/gym-radio'; // fork: Gym FM
import { GymPool } from './gym-pool'; // fork: swimming in the basement's lap pool
import type { ClientMsg, FloorInfo, ServerMsg } from '../shared/protocol';
import { streetBelow } from '../shared/layout';
import type { Collider, Interactable } from './world/types';
import { buildGymInterior, type GymInterior } from './world/gym/interior';
import type { MachineSound } from './world/gym/equipment';
import type { Person } from './world/character';
import type { PlayerController } from './player';
import { h, toast } from './ui/dom';
import { gymUiFor, type GymSoundKind, type GymUi } from './ui/gym/registry';
import './ui/gym/cardio'; // registers the cardio window
import './ui/gym/strength'; // registers the strength window
import './ui/gym/wellness'; // registers the wellness window
import './ui/gym/juicebar'; // registers the juice-bar window
import './ui/gym/radio'; // fork: registers Gym FM's picker
import './ui/gym/gym.css';

/*
 * The gym across the street (flrnoh fork, see FORK.md), on this page: going in and out, the room
 * inside (a place of its own like the casino, built the first time you go in), your fitness HUD, and
 * the station windows. main.ts hooks it in with a few lines; everything else is here. Mirrors
 * client/casino.ts.
 */

type Spot = { x: number; y: number; z: number; rotY: number };

export interface GymHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  floor(): string | null;
  floors(): FloorInfo[];
  inOffice(): boolean;
  player: PlayerController;
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): GymHost['player']['room'];
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: GymSoundKind): void;
  noOutline(o: THREE.Object3D): void;
  /** Fork (the spa): the camera, everyone else in the gym, and the spa's quiet ambience (0…1). */
  spaPeople?(): { x: number; y: number; z: number }[];
  ambience?(level: number): void;
  /** Fork: Gym FM's stream (empty: none) and how much of it reaches you (0…1); the thunder in the storm shower. */
  radio?(url: string, reach: number, volume: number): void;
  thunder?(): void;
  /** Everyone else in here, by name, as drawn (for posing whoever's on a machine), and you. */
  people(): { name: string; person: Person }[];
  you(): { name: string; person: Person } | null;
  /** The office's clock (ms), which a set's reps are timed by. */
  now(): number;
  camera: THREE.PerspectiveCamera;
  /** A machine at work, heard from where it is. */
  soundAt(kind: MachineSound, at: { x: number; y: number; z: number }): void;
}

const FROM_KEY = 'agent-office.gym.from';

/** A fresh profile until the office sends yours. */
function blankProfile(): FitnessProfile {
  return { xp: 0, level: 1, rank: rankFor(1), levelXp: 0, levelSpan: Math.max(1, xpForLevel(2) - xpForLevel(1)), stamina: STAMINA_MAX, totals: { workouts: 0, meters: 0, calories: 0, volume: 0, reps: 0, relaxSecs: 0 }, streak: 0 };
}

/** The station's icon and name, from the shared catalogs. */
function stationLook(def: GymStationDef): { icon: string; name: string } {
  if (def.kind === 'cardio') return { icon: (CARDIO_MACHINES[def.machine] ?? CARDIO_MACHINES.treadmill).icon, name: def.name };
  if (def.kind === 'strength') return { icon: (EXERCISES[def.machine] ?? EXERCISES.bench).icon, name: def.name };
  if (def.kind === 'wellness') return { icon: (WELLNESS_SPOTS[def.machine] ?? WELLNESS_SPOTS.sauna).icon, name: def.name };
  return { icon: '🥤', name: 'Juice bar' };
}

export class GymPlace {
  private room: GymInterior | null = null;
  active = false;
  private profile: FitnessProfile = blankProfile();
  private stations = new Map<string, unknown>();
  private open: { station: string; ui: GymUi } | null = null;
  private hud: HTMLElement | null = null;
  private outside: Spot | null = null;
  private arriving = false;
  /** The walk-in room you're standing in (its station), for the hint line and the ambience. */
  private walkIn: string | null = null;
  /** When each walk-in room's last Aufguss was, as the page last heard it (for the hiss). */
  private puffs = new Map<string, number>();
  private camPos = new THREE.Vector3();
  /** The machine you're on (cardio or strength), or the spa's spot you're in (the jacuzzi, the plunge, a massage table), holding you in place there, or null. */
  private riding: string | null = null;
  private readonly hold = () => {
    const id = this.riding;
    const at = id && this.room ? (this.room.equipment.spot(id) ?? this.room.soak.spot(id, this.host.you()?.name ?? '')) : null;
    const p = this.host.player;
    if (at) {
      p.pos.set(at.x, at.y, at.z);
      p.facing = at.rotY;
    }
    p.moving = false;
  };
  private head = new THREE.Vector3();
  /** Whether you're in the changing room (the camera keeps to it there). */
  private changing = false;
  /** The room the camera keeps to: the hall, or the changing room while you're in it; fork: the basement, down there (a vault). */
  private roomBox() {
    const r = this.changing ? CHANGING_ROOM : GYM_ROOM;
    const v = this.vault;
    return { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, wall: this.changing ? 0.15 : 0.3, enclosed: true, vault: { minX: v.minX, maxX: v.maxX, minZ: v.minZ, maxZ: v.maxZ, top: 0 } };
  }
  /** Whether (x, z) is somewhere in the gym: the hall or the changing room; fork: or (feet at `y`) the basement. */
  private static within(x: number, z: number, y = 0) {
    if (downstairs(y)) return inB(BASEMENT_BOX, x, z) || inB(THERME_PASSAGE, x, z);
    return (x > GYM_ROOM.minX && x < GYM_ROOM.maxX && z > GYM_ROOM.minZ && z < GYM_ROOM.maxZ) || inChanging(x, z);
  }
  /** Fork: the lap pool (gym-pool.ts), and how the light and the sound go where you are down there. */
  readonly pool: GymPool;
  private zone: 'gym' | 'rest' | 'salt' | 'pool' = 'gym';
  /** The basement room the camera keeps to while you're in it (its walls), or the whole basement. */
  private vault: { minX: number; maxX: number; minZ: number; maxZ: number } = BASEMENT_BOX;
  private thunderAt = 0;
  private warm = new THREE.Color('#cfe8d6');
  private amber = new THREE.Color('#ffc59a');
  private cool = new THREE.Color('#d6eeff');
  private warmGround = new THREE.Color('#1b2a22');

  constructor(private host: GymHost) {
    this.pool = new GymPool(host.player, {
      splash: () => host.sound('splash'),
      stroke: () => host.sound('whoosh'),
      out: () => host.sound('splash'),
      lap: (text) => toast(text),
    });
  }

  private theRoom(): GymInterior {
    if (!this.room) {
      this.room = buildGymInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      for (const [id, s] of this.stations) this.room.setStation(id, s);
    }
    return this.room;
  }

  get interactables(): Interactable[] {
    return this.active && this.room ? this.room.interactables : [];
  }
  get pickables(): THREE.Object3D[] {
    return this.active && this.room ? this.room.pickables : [];
  }

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
    if (!here || here === GYM) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.trip(GYM);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the gym. */
  leave() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const at = { x: GYM_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: GYM_STREET_SPOT.z, rotY: GYM_STREET_SPOT.rotY };
    this.outside = at;
    this.letGo(false);
    this.closeUi();
    this.host.trip(to, at);
  }

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
      this.showHud(true);
    } else {
      if (this.room) this.room.group.visible = false;
      this.letGo(false);
      this.pool.release();
      this.host.radio?.('', 0, 0);
      this.closeUi();
      this.host.showOffice(true);
      this.host.player.colliders = this.host.officeColliders();
      this.host.player.room = this.host.officeRoom();
      this.host.setIndoors(false);
      this.showHud(false);
    }
  }

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
    const p = this.host.player.pos;
    if (!GymPlace.within(p.x, p.z, p.y)) this.host.placeAt({ x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY });
  }

  arrived() {
    if (this.active) {
      const p = this.host.player.pos;
      const inside = GymPlace.within(p.x, p.z, p.y) && (Math.abs(p.y) < 1 || downstairs(p.y));
      // Fork: back in the pool after a reload is back on its deck, at the stair's foot.
      if (!this.arriving && inside && downstairs(p.y) && p.y < BASEMENT_ARRIVAL.y - 0.5 && !this.pool.swimming) this.host.placeAt(BASEMENT_ARRIVAL);
      else if (this.arriving || !inside) this.host.placeAt({ x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY });
      this.arriving = false;
      this.outside = null;
      if (this.open) this.host.send({ t: 'gym.sit', station: this.open.station });
      return;
    }
    this.arriving = false;
    if (this.outside) {
      this.host.placeAt(this.outside);
      this.outside = null;
    }
  }

  // ---- At the stations --------------------------------------------------------------------------

  /** E at something of the gym's: the doors (in or out), or a station. True when it was ours. */
  use(it: Interactable, key: string): boolean {
    if (it.kind === 'gym') {
      if (key === 'E') {
        if (this.active) this.leave();
        else this.go();
      }
      return true;
    }
    if (it.kind !== 'gymstation') return false;
    if (key !== 'E' || !it.gymStation) return true;
    if (it.gymStation === 'lappool') {
      this.pool.jumpIn(); // fork: a header into the lap pool
      return true;
    }
    if (it.gymAct) {
      // Fork: the sauna's bucket, the steam room's bowl: straight to it, no window (you're in there).
      this.host.send({ t: 'gym.act', station: it.gymStation, action: it.gymAct });
      return true;
    }
    this.sitAt(it.gymStation);
    return true;
  }

  private defOf(id: string): GymStationDef | undefined {
    if (id === JUICE_BAR.id) return { id: JUICE_BAR.id, kind: 'juicebar', machine: 'juicebar', name: 'Juice bar', x: JUICE_BAR.x, z: JUICE_BAR.z, rotY: 0, seats: JUICE_BAR.seats };
    if (id === GYM_RADIO.id) return { id: GYM_RADIO.id, kind: 'radio', machine: 'radio', name: 'Gym FM', x: GYM_RADIO.x, z: GYM_RADIO.z, rotY: 0, seats: 0 }; // fork
    return GYM_STATION_BY_ID.get(id);
  }

  private sitAt(id: string) {
    const def = this.defOf(id);
    if (!def || !this.active) return;
    const open = gymUiFor(def.kind);
    if (!open) return;
    this.closeUi();
    // Fork: Gym FM's picker is just a window: nobody sits at the sound system.
    const seated = def.kind !== 'radio';
    if (seated) this.host.send({ t: 'gym.sit', station: id });
    let ui: GymUi | null = null;
    ui = open({
      station: def,
      state: this.stations.get(id) ?? null,
      profile: this.profile,
      act: (action, data) => this.host.send({ t: 'gym.act', station: id, action, ...(data !== undefined ? { data } : {}) }),
      sound: (k) => this.host.sound(k),
      toast: (text, level) => toast(text, level),
      closed: () => {
        if (this.open?.ui !== ui) return;
        this.open = null;
        if (seated) this.host.send({ t: 'gym.stand' });
      },
    });
    this.open = { station: id, ui };
  }

  private closeUi() {
    const o = this.open;
    if (!o) return;
    o.ui.close();
    if (this.open === o) {
      this.open = null;
      if (o.station !== GYM_RADIO.id) this.host.send({ t: 'gym.stand' });
    }
  }

  // ---- The office's news ------------------------------------------------------------------------

  onMessage(msg: ServerMsg) {
    if (!msg.t.startsWith('gym.')) return;
    const m = msg as GymServerMsg;
    switch (m.t) {
      case 'gym.profile': {
        const leveled = m.profile.level > this.profile.level;
        this.profile = m.profile;
        this.renderHud(leveled);
        this.open?.ui.profile(m.profile);
        break;
      }
      case 'gym.station':
        this.pouredIn(m.station, m.state);
        this.stations.set(m.station, m.state);
        this.room?.setStation(m.station, m.state);
        if (this.open?.station === m.station) this.open.ui.station(m.state);
        break;
      case 'gym.result': {
        if (this.open && this.open.station === m.station && this.open.ui.result(m.text, m.xp, m.data)) break;
        if (this.open && this.open.station === m.station && /using that|it's full/i.test(m.text)) this.closeUi();
        toast(m.text);
        break;
      }
    }
  }

  // ---- What it says -----------------------------------------------------------------------------

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } {
    if (it.kind === 'gym') return this.active ? { k: 'gym-out', parts: [title('🚪 Street'), key('E', 'Go out')] } : { k: 'gym-in', parts: [title(`🏋️ ${GYM_NAME}`), aside('work out & unwind'), key('E', 'Go in')] };
    // Fork: Gym FM on the counter, and the lap pool's water.
    if (it.gymStation === GYM_RADIO.id) {
      const c = GYM_CHANNEL_BY_ID.get(this.room?.radio.channel() ?? '');
      const vol = Math.round((this.room?.radio.volume() ?? 1) * 100);
      return { k: `radio|${c?.id}|${vol}`, parts: [title('📻 Gym FM'), aside(c?.url ? `${c.name} · ${vol} %` : 'off'), key('E', 'Station & volume')] };
    }
    if (it.gymStation === 'lappool') return this.pool.swimming ? { k: '', parts: [] } : { k: 'lappool', parts: [title('🏊 Lap pool'), aside('25 m · four lanes'), key('E', 'Jump in')] };
    const def = it.gymStation ? this.defOf(it.gymStation) : undefined;
    if (!def) return { k: '', parts: [] };
    if (it.gymAct) {
      const room = WALK_IN_BY_STATION.get(def.id);
      const v = this.stations.get(def.id) as WellnessView | undefined;
      const sauna = room?.machine === 'sauna';
      const inside = this.walkIn === def.id;
      return {
        k: `${def.id}|act|${inside}`,
        parts: [title(sauna ? '🪣 Aufguss' : '🌿 Eucalyptus'), aside(inside ? `${v?.occupants?.length ?? 0} in here` : 'step inside first'), key('E', sauna ? 'Pour water on the stones' : 'Release the steam')],
      };
    }
    const look = stationLook(def);
    const state = this.stations.get(def.id) as { player?: string; running?: boolean; working?: boolean; occupants?: string[]; seats?: number } | undefined;
    let status = '';
    let verb = 'Use';
    if (def.kind === 'cardio') {
      status = state?.player ? `${state.player} is on it` : 'free';
      verb = 'Step on';
    } else if (def.kind === 'strength') {
      status = state?.player ? `${state.player} lifting` : 'free';
      verb = 'Step on';
    } else if (def.kind === 'wellness') {
      status = `${state?.occupants?.length ?? 0}/${def.seats} in`;
      verb = def.machine === 'massage' ? 'Lie down' : def.machine === 'hottub' || def.machine === 'coldplunge' ? 'Get in' : 'Step in';
    } else {
      status = 'your stats & the board';
      verb = 'Sit down';
    }
    return { k: `${def.id}|${status}`, parts: [title(`${look.icon} ${look.name}`), aside(status), key('E', verb)] };
  }

  title(): { name: string; meta: string } {
    return { name: `🏋️ ${GYM_NAME}`, meta: `Lv ${this.profile.level} ${this.profile.rank} · ⚡ ${Math.round(this.profile.stamina)}` };
  }

  private showHud(on: boolean) {
    if (on && !this.hud) {
      this.hud = h('div.gym-hud', { 'aria-live': 'polite' });
      document.body.append(this.hud);
    }
    if (this.hud) this.hud.hidden = !on;
    this.renderHud(false);
  }

  private renderHud(bump: boolean) {
    const el = this.hud;
    if (!el || el.hidden) return;
    const p = this.profile;
    const xpFill = h('i', { style: `width:${Math.min(100, (p.levelXp / p.levelSpan) * 100)}%` });
    const enFill = h('i', { style: `width:${Math.min(100, (p.stamina / STAMINA_MAX) * 100)}%` });
    const room = this.walkIn ? WALK_IN_BY_STATION.get(this.walkIn) : undefined;
    const spot = room ? WELLNESS_SPOTS[room.machine] : undefined;
    const v = room ? (this.stations.get(room.station) as WellnessView | undefined) : undefined;
    const hot = !!v?.puffAt && Date.now() - v.puffAt < AUFGUSS_BOOST_MS;
    el.replaceChildren(
      h('span.lvl', {}, `Lv ${p.level}`),
      h('div.track', { title: 'Fitness points to next level' }, xpFill),
      h('div.track.energy', { title: 'Energy' }, enFill),
      h('small', {}, `⚡${Math.round(p.stamina)}`),
      ...(room && spot ? [h('small.gym-room', { title: 'Recovering while you are in here; faster on a bench' }, `${spot.icon} ${room.name} · ${spot.temp}${hot ? ' · 🔥 Aufguss' : ''}`)] : []),
    );
    if (bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  // ---- Every frame ------------------------------------------------------------------------------

  update(t: number, dt: number) {
    if (!this.active || !this.room) {
      if (this.walkIn !== null) this.setWalkIn(null);
      this.host.ambience?.(0);
      return;
    }
    const me = this.host.player.pos;
    const everyone = [{ x: me.x, y: me.y, z: me.z }, ...(this.host.spaPeople?.() ?? [])];
    // Fork: up in the gym, and down in its basement (whose rooms are under the spa's).
    const people = everyone.filter((q) => !downstairs(q.y));
    const below = everyone.filter((q) => downstairs(q.y));
    const cam = this.host.camera ? this.camPos.setFromMatrixPosition(this.host.camera.matrixWorld) : null;
    this.room.update(t, dt, { me: { x: me.x, y: me.y, z: me.z }, cam, people });
    const showers = this.room.basement.update(t, dt, below);
    const room = this.room.walkInAt(me.x, me.z, me.y) ?? null;
    if (room !== this.walkIn) this.setWalkIn(room);
    this.underground(me, room, showers.length > 0, dt);
    // On a machine: the office has you on the station whose window you have open.
    const you = this.host.you();
    const open = this.open?.station;
    const def = open ? GYM_STATION_BY_ID.get(open) : undefined;
    const view = open ? (this.stations.get(open) as { player?: string } | undefined) : undefined;
    const onMachine = def && (def.kind === 'cardio' || def.kind === 'strength') && you && view?.player === you.name;
    // Fork: in the jacuzzi, the plunge, on a massage table, once the office has you in it.
    const soaking = def && this.room.soak.has(def.id) && you && (this.stations.get(def.id) as WellnessView | undefined)?.occupants?.includes(you.name);
    const mine = def && (onMachine || soaking) ? def.id : null;
    if (mine !== this.riding) {
      this.letGo(true);
      if (mine) this.getOn(mine);
    }
    const bodies = this.host.people();
    this.room.equipment.update(t, dt, this.host.now(), { people: bodies, you, mine }, (kind, at) => this.host.soundAt(kind, at));
    this.room.soak.update(t, dt, { people: bodies, you });
    if (this.riding && you) {
      you.person.bones.head.getWorldPosition(this.head);
      if (this.room.soak.has(this.riding)) this.room.soak.frame(this.riding, you.name, this.host.camera, dt);
      else this.room.equipment.frame(this.riding, this.host.camera, dt, this.host.player.view === 'first', this.head);
    }
    // In the changing room the camera keeps to it, out in the hall to the hall.
    const changing = inChanging(me.x, me.z);
    if (changing !== this.changing) {
      this.changing = changing;
      this.host.player.room = this.roomBox();
    }
  }

  /**
   * Fork: what you hear and see where you are. Gym FM through the hall's speakers (quieter in the
   * changing room, not at all in the spa or the basement: quiet is the point there); the spa's soft
   * water and air, down here too (more in the pools and under a running shower, hushed in the quiet
   * room); the light (dim in the quiet room, warm in the salt grotto); the pool holding a swimmer.
   */
  private underground(me: { x: number; y: number; z: number }, room: string | null, showerOn: boolean, dt: number) {
    const down = downstairs(me.y);
    const spa = !down && inRect(SPA, me.x, me.z);
    const url = GYM_CHANNEL_BY_ID.get(this.room?.radio.channel() ?? '')?.url ?? '';
    this.host.radio?.(url, down || spa ? 0 : inChanging(me.x, me.z) ? 0.3 : 1, this.room?.radio.volume() ?? 1);
    const shower = down && !!bShowerAt(me.x, me.z);
    const quiet: Record<string, number> = { rest: 0.25, salt: 0.5, grotto: 1, kneipp: 0.8, lappool: 0.9 };
    const level = down ? (shower && showerOn ? 1 : room ? (quiet[room] ?? 0.6) : inB(HALL, me.x, me.z) ? 0.7 : inB(KNEIPP_ROOM, me.x, me.z) ? 0.6 : inB(FOYER, me.x, me.z) ? 0.3 : 0.4) : room ? 1 : spa ? 0.6 : 0;
    this.host.ambience?.(level);
    this.zone = !down ? 'gym' : inB(REST, me.x, me.z) ? 'rest' : inB(SALT, me.x, me.z) ? 'salt' : 'pool';
    // The camera keeps to the room you're in down there, so it never ends up in a wall between two.
    const vault = [REST, SALT, KNEIPP_ROOM, FOYER, HALL, THERME_PASSAGE].find((r) => inB(r, me.x, me.z)) ?? BASEMENT_BOX;
    if (vault !== this.vault) {
      this.vault = vault;
      this.host.player.room = this.roomBox();
    }
    // The storm shower's thunder, now and then while you stand under it.
    this.thunderAt -= dt;
    if (shower && bShowerAt(me.x, me.z)?.kind === 'storm' && this.thunderAt <= 0) {
      this.thunderAt = 4 + Math.random() * 4;
      this.host.thunder?.();
    }
    this.pool.tick(dt);
    const you = this.host.you();
    const bodies = this.host.people().map((b) => ({ person: b.person, moving: false, x: b.person.root.position.x, y: b.person.root.position.y, z: b.person.root.position.z }));
    if (you) bodies.push({ person: you.person, moving: this.host.player.moving, x: me.x, y: me.y, z: me.z });
    this.pool.pose(bodies);
  }

  /** Onto machine `id`: you stand (sit, lie) where it has you, and stay there until you step off. */
  private getOn(id: string) {
    this.riding = id;
    this.host.player.rig = this.hold;
    this.hold();
  }

  /** Off the machine you're on: onto the floor beside it (`place`), or just let go (leaving the gym). */
  private letGo(place: boolean) {
    const id = this.riding;
    if (!id) return;
    this.riding = null;
    this.room?.equipment.unframe();
    this.room?.soak.unframe();
    const p = this.host.player;
    if (p.rig === this.hold) p.rig = null;
    const off = place && this.room ? (this.room.equipment.off(id) ?? this.room.soak.off(id)) : null;
    if (off) this.host.placeAt(off);
  }

  /** On a machine, the camera's the gym's: framed on you, or out from your eyes on the cardio deck in first person. */
  get zoomed(): boolean {
    return !!this.riding;
  }

  /** Whether your own body should be drawn: on a machine, unless you're looking out from your eyes. */
  get showsYou(): boolean {
    return !!this.riding && !(this.host.player.view === 'first' && this.room?.equipment.firstPerson(this.riding));
  }

  /** Into or out of the sauna or the steam room (the office works out the same by where it sees you). */
  private setWalkIn(room: string | null) {
    this.walkIn = room;
    this.renderHud(false);
  }

  /** An Aufguss in a walk-in room: the stones hiss for whoever's in there (and a little outside). */
  private pouredIn(station: string, state: unknown) {
    const room = WALK_IN_BY_STATION.get(station);
    const at = (state as WellnessView | null)?.puffAt;
    if (!room || !at) return;
    const was = this.puffs.get(station);
    this.puffs.set(station, at);
    if (was === undefined || was === at || !this.active) return;
    const me = this.host.player.pos;
    if (this.walkIn === station || inRect(SPA, me.x, me.z)) this.host.sound('hiss');
    if (this.walkIn === station) this.renderHud(false);
  }

  /** Inside, the hall lights itself: bright and cool, no sun through the ceiling, no haze across the room. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
    lights.sun.intensity = 0;
    lights.hemi.color.copy(this.warm);
    lights.hemi.groundColor.copy(this.warmGround);
    // Fork: dim in the basement's quiet room, warm in its salt grotto, bright and cool by the pool.
    const z = this.zone;
    lights.hemi.intensity = z === 'rest' ? 0.45 : z === 'salt' ? 0.9 : 1.3;
    lights.ambient.color.copy(z === 'salt' ? this.amber : z === 'pool' ? this.cool : this.warm);
    lights.ambient.intensity = z === 'rest' ? 0.3 : 0.85;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

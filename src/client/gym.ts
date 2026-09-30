import * as THREE from 'three';
import { GYM, GYM_ENTRY, GYM_NAME, GYM_ROOM, GYM_STATION_BY_ID, GYM_STREET_SPOT, JUICE_BAR, STAMINA_MAX, rankFor, xpForLevel, type FitnessProfile, type GymServerMsg, type GymStationDef } from '../shared/gym';
import { CARDIO_MACHINES } from '../shared/gym-cardio';
import { EXERCISES } from '../shared/gym-strength';
import { WELLNESS_SPOTS, type WellnessView } from '../shared/gym-wellness';
import { AUFGUSS_BOOST_MS, SPA, WALK_IN_BY_STATION, inRect } from '../shared/gym-rooms';
import type { ClientMsg, FloorInfo, ServerMsg } from '../shared/protocol';
import { streetBelow } from '../shared/layout';
import type { Collider, Interactable } from './world/office';
import { buildGymInterior, type GymInterior } from './world/gym/interior';
import { h, toast } from './ui/dom';
import { gymUiFor, type GymSoundKind, type GymUi } from './ui/gym/registry';
import './ui/gym/cardio'; // registers the cardio window
import './ui/gym/strength'; // registers the strength window
import './ui/gym/wellness'; // registers the wellness window
import './ui/gym/juicebar'; // registers the juice-bar window
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
  player: { pos: THREE.Vector3; colliders: Collider[]; room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean } };
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): GymHost['player']['room'];
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: GymSoundKind): void;
  noOutline(o: THREE.Object3D): void;
  /** Fork (the spa): the camera, everyone else in the gym, and the spa's quiet ambience (0…1). */
  camera?: THREE.Camera;
  people?(): { x: number; z: number }[];
  ambience?(level: number): void;
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
  private warm = new THREE.Color('#cfe8d6');
  private warmGround = new THREE.Color('#1b2a22');

  constructor(private host: GymHost) {}

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
      this.host.player.room = { minX: GYM_ROOM.minX, maxX: GYM_ROOM.maxX, minZ: GYM_ROOM.minZ, maxZ: GYM_ROOM.maxZ, wall: 0.3, enclosed: true };
      this.host.setIndoors(true);
      this.showHud(true);
    } else {
      if (this.room) this.room.group.visible = false;
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
    this.host.player.room = { minX: GYM_ROOM.minX, maxX: GYM_ROOM.maxX, minZ: GYM_ROOM.minZ, maxZ: GYM_ROOM.maxZ, wall: 0.3, enclosed: true };
    const p = this.host.player.pos;
    if (!(p.x > GYM_ROOM.minX && p.x < GYM_ROOM.maxX && p.z > GYM_ROOM.minZ && p.z < GYM_ROOM.maxZ)) this.host.placeAt({ x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY });
  }

  arrived() {
    if (this.active) {
      const p = this.host.player.pos;
      const inside = p.x > GYM_ROOM.minX && p.x < GYM_ROOM.maxX && p.z > GYM_ROOM.minZ && p.z < GYM_ROOM.maxZ && Math.abs(p.y) < 1;
      if (this.arriving || !inside) this.host.placeAt({ x: GYM_ENTRY.x, y: 0, z: GYM_ENTRY.z, rotY: GYM_ENTRY.rotY });
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
    if (it.kind !== 'gym-station') return false;
    if (key !== 'E' || !it.gymStation) return true;
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
    return GYM_STATION_BY_ID.get(id);
  }

  private sitAt(id: string) {
    const def = this.defOf(id);
    if (!def || !this.active) return;
    const open = gymUiFor(def.kind);
    if (!open) return;
    this.closeUi();
    this.host.send({ t: 'gym.sit', station: id });
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
        this.host.send({ t: 'gym.stand' });
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
      this.host.send({ t: 'gym.stand' });
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
      verb = 'Step in';
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
    const people = [{ x: me.x, z: me.z }, ...(this.host.people?.() ?? [])];
    const cam = this.host.camera ? this.camPos.setFromMatrixPosition(this.host.camera.matrixWorld) : null;
    this.room.update(t, dt, { me: { x: me.x, y: me.y, z: me.z }, cam, people });
    const room = this.room.walkInAt(me.x, me.z) ?? null;
    if (room !== this.walkIn) this.setWalkIn(room);
    // The spa's own quiet: soft water and air in there, a little more in the cabins.
    this.host.ambience?.(room ? 1 : inRect(SPA, me.x, me.z) ? 0.6 : 0);
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
    lights.hemi.intensity = 1.3;
    lights.ambient.color.copy(this.warm);
    lights.ambient.intensity = 0.85;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

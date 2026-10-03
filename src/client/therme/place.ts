import * as THREE from 'three';
import { GYM } from '../../shared/gym';
import { GYM_FROM_THERME, THERME, THERME_ARRIVAL, THERME_BOX, THERME_NAME, ZONES, inT, inTherme } from '../../shared/therme';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { SeatPlace } from '../../shared/layout';
import type { Drink } from '../../shared/rooftop';
import { THERME_POOLS, thermeWhereabouts as whereIn, underSky } from '../../shared/therme-all';
import { BARTENDER, BAR_COUNTER, SWIMBAR_MENU } from '../../shared/therme-paradies';
import { Swimmer } from '../swim';
import { nextWaves, waveStrength } from '../../shared/therme-waves';
import { ThermeLoungers } from './loungers';
import { SlideRider, type RiderHost } from './slides';
import { Bathers } from './bathers';
import type { ThermeSounds } from './sound';
import { zoneAt } from '../../shared/therme';
import { openBoards, openLift } from './slide-ui';
import { LANDING, LEVELS, LIFT_DOOR, SLIDE_BY_ID, TOWER } from '../../shared/therme-slides';
import { SAUNA_BY_ID } from '../../shared/therme-dorf';
import { thermeSeat } from './loungers';
import { DorfLife } from './dorf-life';
import { LOBBY_ARRIVAL, THERME_STREET_SPOT } from '../../shared/therme-street';
import { streetBelow } from '../../shared/layout';
import { toast } from '../ui/dom';
import { openVenueMenu } from '../venue/ui';
import type { Person } from '../world/character';
import type { Collider, Interactable } from '../world/types';
import { buildThermeInterior, type ThermeInterior } from '../world/therme';

/*
 * The thermal baths behind the gym (flrnoh fork, see FORK.md "The thermal baths"), on this page:
 * going in through the glass door at the end of the gym basement's passage and back, the house
 * inside (a place of its own like the gym, built the first time you go in, hidden again when you
 * leave), hints and the light under the dome. features/places hooks it in.
 *
 * The door is the gym's on one side (its interactable is in the gym's basement, kind 'therme') and
 * the baths' on the other; the office lands you by it either way, and this page puts you there:
 * coming in, just inside the passage; going back, in the gym's passage in front of the door (after
 * the gym's own `arrived`, which would have you at its front door).
 */

type Spot = { x: number; y: number; z: number; rotY: number };
type Room = { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean };

export type ThermeSoundKind = 'door' | 'splash' | 'stroke' | 'pour' | 'ladder' | 'horn' | 'whoosh' | 'beep' | 'go' | 'photo' | 'ding';

export interface ThermeHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): THERME while inside. */
  floor(): string | null;
  /** The building's floors, bottom first (builtFloors): back out onto your floor's street. */
  floors(): { id: string }[];
  /** On the office's map (the gym, and so the baths, are only on its street). */
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: Room; seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void; lookPitch: number } & ConstructorParameters<typeof Swimmer>[0];
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): Room;
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: ThermeSoundKind): void;
  /** How much daylight there is outside (0 night … 1 noon): the dome lets it in. */
  daylight(): number;
  /** The office's clock (ms): the waves and currents go by it. */
  now(): number;
  you(): string;
  /** Everyone in the baths (you too), where they are and their bodies. */
  people(): { id: string; x: number; y: number; z: number; moving: boolean; person: Person | undefined }[];
  me(): Person;
  /** Handed over the bar: into your hand (like the Schallwerk's). */
  served(d: Drink): void;
  cutOff(): boolean;
  /** No toon outline round its signs, screens and pick boxes (core/outline.ts). */
  noOutline(o: THREE.Object3D): void;
  /** For the slides' ride photo. */
  renderer: RiderHost['renderer'];
  /** The baths' own sounds (client/therme/sound.ts): the hall's air, whoops, splashes. */
  audio: ThermeSounds;
  /** It's this cold outside (°C, the office's real weather; undefined: unknown): steam off the lagoon. */
  temp(): number | undefined;
  /** Where the camera is (the saunas' walls lift away while you're inside one and it isn't). */
  camera: THREE.Camera;
  name(): string;
}

const FROM_KEY = 'agent-office.therme.from';

export class ThermePlace {
  private room: ThermeInterior | null = null;
  active = false;
  /** In through a door: from the gym (just inside the passage) or off the street (at the box office). */
  private arriving: 'gym' | 'street' | null = null;
  /** Out through the street doors: where to put you once your floor's street is back. */
  private outside: { x: number; y: number; z: number; rotY: number } | null = null;
  /** Back through the door to the gym: put you in front of it on the gym's side. */
  private backToGym = false;
  private day = new THREE.Color('#fff4e0');
  private night = new THREE.Color('#ffd2a1');
  private ground = new THREE.Color('#8a7a60');
  private light = new THREE.Color();

  /** Swimming in any of the baths' pools (client/swim/, the pools in shared/therme-all.ts). */
  readonly swim: Swimmer;
  private loungers: ThermeLoungers;
  /** Riding the slides (client/therme/slides.ts). */
  readonly rider: SlideRider;
  /** The run of waves the horn last went for. */
  private hornFor = 0;
  /** The Saunadorf's goings-on, the showers, buckets and ice (client/therme/dorf-life.ts). */
  private dorf: DorfLife | null = null;
  /** Out at the lagoon, under the open sky (the weather falls there). */
  private outdoors = false;
  /** The other bathers (client/therme/bathers.ts). */
  private bathers: Bathers | null = null;
  /** Who's on a slide now (they whooped already), and how high everyone was a moment ago (to hear them land). */
  private whooped = new Set<string>();
  private lastY = new Map<string, number>();

  constructor(private host: ThermeHost) {
    this.swim = new Swimmer(host.player, () => THERME_POOLS, {
      splash: () => host.sound('splash'),
      stroke: () => host.sound('stroke'),
      out: () => host.sound('ladder'),
    }, () => host.now());
    this.rider = new SlideRider({ player: host.player, camera: host.camera as THREE.PerspectiveCamera, send: (m) => host.send(m), sound: (k) => host.sound(k), renderer: host.renderer, scene: host.scene, me: () => host.me(), name: () => host.name() });
    this.rider.onBoards = () => this.rider.drawBoard();
    this.loungers = new ThermeLoungers({ you: () => host.you(), people: () => host.people(), player: host.player, me: () => host.me(), npc: (id) => !!this.bathers?.takes(id) });
  }

  /** Swimming up at the bar's counter (E there orders, not climbs out). */
  get atBar(): boolean {
    const p = this.host.player.pos;
    const C = BAR_COUNTER;
    return this.active && p.x > C.minX - 2.6 && p.x < C.maxX + 0.5 && p.z > C.minZ - 0.6 && p.z < C.maxZ + 0.6;
  }

  /** A bar's menu: Kai at the swim-up bar (or Lina at the beach bar) mixes it and slides it across the counter. */
  bar(beach = false) {
    this.host.sound('pour');
    openVenueMenu({
      title: beach ? '🏝️ Strandbar' : '🍹 Schwimmbar',
      doing: beach ? '🏝️ at the beach bar' : '🍹 at the swim-up bar',
      footer: beach ? 'Alles aufs Haus. Mit Sand zwischen den Zehen.' : 'Alles aufs Haus. Im Wasser schmeckt’s doppelt.',
      menu: SWIMBAR_MENU,
      cut: this.host.cutOff(),
      cutNote: `${beach ? 'Lina' : 'Kai'} meint, für jetzt lieber ein Wasser`,
      order: (d) => {
        this.host.sound('pour');
        window.setTimeout(() => {
          if (this.active) this.host.served(d);
        }, 1100);
      },
    });
  }

  private theRoom(): ThermeInterior {
    if (!this.room) {
      this.room = buildThermeInterior();
      this.bathers = new Bathers(this.room.group);
      this.dorf = new DorfLife(this.room, { camera: this.host.camera, audio: this.host.audio });
      this.host.noOutline(this.room.group);
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

  /** E at the glass door in the gym's basement: through to the baths. */
  go() {
    if (this.host.floor() !== GYM) return;
    this.arriving = 'gym';
    this.host.sound('door');
    this.host.trip(THERME);
  }

  /** E at the main doors on the street: in, at the box office. */
  goFromStreet() {
    const here = this.host.floor();
    if (!here || here === THERME) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = 'street';
    this.host.sound('door');
    this.host.trip(THERME);
  }

  /** The floor you came in from off the street (kept over a reload), else the bottom one. */
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

  /** E at the entrance hall's doors: back out onto your floor's street, in front of the baths. */
  leaveToStreet() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    this.outside = { x: THERME_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: THERME_STREET_SPOT.z, rotY: THERME_STREET_SPOT.rotY };
    this.host.sound('door');
    this.host.trip(to, this.outside);
  }

  /** E at the door at the passage's end: back to the gym's basement. */
  leave() {
    this.backToGym = true;
    this.host.sound('door');
    this.host.trip(GYM);
  }

  private roomBox(): Room {
    return { minX: THERME_BOX.minX, maxX: THERME_BOX.maxX, minZ: THERME_BOX.minZ, maxZ: ZONES.lagune.maxZ, wall: 0.3, enclosed: true };
  }

  private static inside(p: THREE.Vector3): boolean {
    return inTherme(p.x, p.z) && p.y > -3 && p.y < 40;
  }

  setPlace(inside: boolean) {
    if (inside && !this.host.inOffice()) {
      // The building's on a map of its own now: no street, no gym, no baths. Back to the gym's way out.
      this.host.trip(GYM);
      return;
    }
    if (inside === this.active) return;
    this.active = inside;
    if (inside) {
      const r = this.theRoom();
      this.rider.bind(r.slides);
      this.rider.drawBoard();
      r.group.visible = true;
      this.host.showOffice(false);
      this.host.player.colliders = r.colliders;
      this.host.player.room = this.roomBox();
      this.host.setIndoors(true);
      this.outdoors = false;
    } else {
      if (this.room) this.room.group.visible = false;
      this.swim.release();
      this.rider.stop();
      this.loungers.clear();
      this.host.audio.air(0, 0);
      if (this.host.player.seat?.seatId?.startsWith('therme-')) this.host.player.stand();
      this.host.showOffice(true);
      this.host.player.colliders = this.host.officeColliders();
      this.host.player.room = this.host.officeRoom();
      this.host.setIndoors(false);
    }
  }

  refresh() {
    if (!this.active || !this.room) return;
    if (!this.host.inOffice()) {
      this.host.trip(GYM);
      return;
    }
    this.host.showOffice(false);
    this.host.player.colliders = this.room.colliders;
    this.host.player.room = this.roomBox();
    if (!ThermePlace.inside(this.host.player.pos)) this.host.placeAt(THERME_ARRIVAL);
  }

  /** After a welcome or a trip: where you stand, now the place you're in is set up. */
  arrived() {
    if (this.active) {
      // Back after a reload, where you were; coming through the door, just inside it.
      if (this.arriving === 'street') this.host.placeAt(LOBBY_ARRIVAL);
      else if (this.arriving || !ThermePlace.inside(this.host.player.pos)) this.host.placeAt(THERME_ARRIVAL);
      this.arriving = null;
      this.backToGym = false;
      this.outside = null;
      return;
    }
    this.arriving = null;
    if (this.outside) {
      this.host.placeAt(this.outside);
      this.outside = null;
    }
    if (this.backToGym && this.host.floor() === GYM) this.host.placeAt(GYM_FROM_THERME);
    this.backToGym = false;
  }

  /** E at the door (either side of it), a lounger or the bar. True when it was the baths'. */
  use(it: Interactable, key: string): boolean {
    if (it.kind === 'thermeseat') {
      if (key === 'E' && it.seatId && !this.swim.swimming) this.loungers.lie(it.seatId);
      return true;
    }
    if (it.kind === 'thermebar') {
      if (key === 'E') this.bar(it.z > THERME_BOX.maxZ);
      return true;
    }
    if (it.kind === 'thermestreet') {
      if (key === 'E') {
        if (this.active) this.leaveToStreet();
        else this.goFromStreet();
      }
      return true;
    }
    if (it.kind === 'thermeslide') {
      if (key === 'E' && it.thermeSlide && !this.swim.swimming) this.rider.start(it.thermeSlide, it.thermeLane ?? 0);
      return true;
    }
    if (it.kind === 'thermelift') {
      if (key === 'E')
        openLift(it.thermeLevel ?? -1, (l) => {
          this.host.sound('ding');
          this.host.placeAt({ x: LIFT_DOOR.x, y: l < 0 ? 0 : LEVELS[l], z: LIFT_DOOR.z, rotY: 0 });
        });
      return true;
    }
    if (it.kind === 'thermeboard') {
      if (key === 'E') openBoards(this.rider.boards, this.rider.photo, this.host.name());
      return true;
    }
    if (it.kind === 'thermeuse') return this.dorf?.use(it, key) ?? true;
    if (it.kind !== 'therme') return false;
    if (key === 'E') {
      if (this.active) this.leave();
      else this.go();
    }
    return true;
  }

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null {
    if (it.kind === 'thermeseat') {
      const seat = it.seatId ? thermeSeat(it.seatId) : undefined;
      const lie = seat?.pose !== 'sit';
      const id = it.seatId ?? '';
      const fire = id.startsWith('therme-fire');
      const name = fire ? '🔥 Feuerstelle' : lie ? (id.startsWith('therme-ruhe') ? '🛋️ Liege im Ruhehaus' : id.startsWith('therme-lawn') ? '🌿 Liege auf der Wiese' : '🏖️ Liege') : `🪵 Saunabank · Stufe ${Math.round((seat?.y ?? 0.45) / 0.45)}`;
      if (this.host.player.seat?.seatId === it.seatId) return { k: 'therme-up', parts: [title(name), key('E', 'Get up')] };
      const note = fire ? 'auf einem Holzstamm am Feuer' : lie ? (id.startsWith('therme-ruhe') ? 'am Kamin · Ruhe bitte' : id.startsWith('therme-lawn') ? 'im Saunagarten' : 'unter Palmen') : 'oben ist es heißer';
      return { k: `therme-seat|${lie}|${fire}|${id.slice(0, 12)}`, parts: [title(name), aside(note), key('E', lie ? 'Lie down' : 'Sit down')] };
    }
    if (it.kind === 'thermeslide') {
      const s = it.thermeSlide ? SLIDE_BY_ID.get(it.thermeSlide) : undefined;
      if (!s) return null;
      const best = this.rider.boards[s.id]?.[0];
      return { k: `therme-slide|${s.id}|${it.thermeLane ?? 0}`, parts: [title(`${s.emoji} ${s.name}${s.lanes ? ` · Bahn ${(it.thermeLane ?? 0) + 1}` : ''}`), aside(best ? `${s.blurb} · Rekord ${best.name} ${(best.ms / 1000).toFixed(2).replace('.', ',')} s` : s.blurb), key('E', 'Go down')] };
    }
    if (it.kind === 'thermestreet') return this.active ? { k: 'therme-street-out', parts: [title('🚪 Straße'), key('E', 'Go out')] } : { k: 'therme-street-in', parts: [title(`🌴 ${THERME_NAME}`), aside('Thermalbad · Rutschen · Saunadorf · Lagune'), key('E', 'Go in')] };
    if (it.kind === 'thermelift') return { k: 'therme-lift', parts: [title('🛗 Aufzug'), aside('Rutschenturm · drei Ebenen'), key('E', 'Ride')] };
    if (it.kind === 'thermeboard') return { k: 'therme-board', parts: [title('🏁 Bestzeiten'), aside('jede Rutsche · dein Fahrfoto'), key('E', 'Look')] };
    if (it.kind === 'thermeuse') return this.dorf?.hint(it, title, key, aside) ?? null;
    if (it.kind === 'thermebar') return it.z > THERME_BOX.maxZ ? { k: 'therme-beachbar', parts: [title('🏝️ Strandbar'), aside('Cocktails · Bier · Wein · Wasser'), key('E', 'Order')] } : { k: 'therme-bar', parts: [title('🍹 Schwimmbar'), aside('Cocktails · Bier · Wein · Wasser'), key('E', 'Order')] };
    if (it.kind !== 'therme') return null;
    if (this.active) return { k: 'therme-out', parts: [title('🚪 Gym'), aside('Schwimmhalle · Untergeschoss'), key('E', 'Back to the gym')] };
    return { k: 'therme-in', parts: [title(`🌴 ${THERME_NAME}`), aside('Thermalbad · geöffnet'), key('E', 'Go in')] };
  }

  title(): { name: string; meta: string } {
    const p = this.host.player.pos;
    return { name: `🌴 ${THERME_NAME}`, meta: whereIn(p.x, p.y, p.z).replace(/^\S+\s/, '') };
  }

  onMessage(msg: ServerMsg) {
    if (msg.t === 'therme.slides' || msg.t === 'therme.ride') this.rider.onMessage(msg);
    if (msg.t === 'therme.aufguss') toast(`${SAUNA_BY_ID.get(msg.sauna)?.emoji ?? '🔥'} Aufguss ${SAUNA_BY_ID.get(msg.sauna)?.inName ?? 'in der Sauna'}: +${msg.stamina} Energie · +${msg.xp} Fitnesspunkte`);
  }

  update(t: number, dt: number) {
    if (!this.active || !this.room) return;
    const me = this.host.player.pos;
    const now = this.host.now();
    const temp = this.host.temp();
    this.room.update(t, dt, now, me, temp === undefined ? 0 : Math.max(0, Math.min(1, (10 - temp) / 14)));
    // In the sauna garden and out at the lagoon it's outdoors: the rain and the snow fall there, not under the dome.
    const outdoors = underSky(me.x, me.z);
    if (outdoors !== this.outdoors) {
      this.outdoors = outdoors;
      this.host.setIndoors(!outdoors);
    }
    this.bathers?.update(now, t, dt, me);
    this.hear(me, this.host.people());
    // The horn as each run of waves starts (once a run), for whoever's in the baths.
    const run = nextWaves(now);
    if (waveStrength(now) > 0 && run !== this.hornFor) {
      if (now - run < 4000) this.host.sound('horn');
      this.hornFor = run;
    }
    if (!this.rider.riding) this.swim.tick(dt);
    this.dorf?.update(me, this.host.player.moving, now, t, dt);
    const people = this.host.people();
    this.rider.update(t, people, this.host.you());
    this.room.details.update(t, this.rider.riding && this.rider.riding.countdown <= 0 ? this.rider.riding.slide : null);
    this.swim.pose(people.filter((q): q is typeof q & { person: Person } => !!q.person));
    this.loungers.pose();
    this.room.lobby.update(t, dt, people);
    // Kai behind the bar turns to whoever swims up.
    const b = this.room.bartender;
    b.update(dt, t, false, false);
    const near = Math.hypot(me.x - BARTENDER.x, me.z - BARTENDER.z) < 7;
    const to = near ? Math.atan2(me.x - BARTENDER.x, me.z - BARTENDER.z) : BARTENDER.rotY;
    let d = to - b.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.root.rotation.y += d * Math.min(1, dt * 4);
  }

  /** The baths' sound where you are: the hall's air by zone (a hush in the Saunadorf), whoops off the slides, a splash as someone lands. */
  private hear(me: THREE.Vector3, people: { id: string; x: number; y: number; z: number; moving: boolean }[]) {
    const zone = zoneAt(me.x, me.z);
    const quiet = zone === 'dorf';
    const hall = quiet ? 0.1 : this.outdoors ? 0.35 : zone === 'gang' || zone === 'lobby' ? 0.45 : 1;
    const crowd = (this.bathers?.count(me) ?? 0) + people.filter((q) => Math.hypot(q.x - me.x, q.z - me.z) < 25).length;
    this.host.audio.air(hall, quiet ? 0 : Math.min(1, 0.25 + crowd * 0.08));
    const R = ZONES.rutschen;
    for (const q of people) {
      const onSlide = q.id === this.host.you() ? !!this.rider.riding && (this.rider.riding.countdown ?? 0) <= 0 : q.x > R.minX && q.y > 2.5 && q.moving && !inT(TOWER, q.x, q.z, -0.5);
      if (onSlide && !this.whooped.has(q.id) && Math.random() < 0.6) this.host.audio.whoop(q.id === this.host.you() ? { x: me.x, y: me.y + 1, z: me.z } : { x: q.x, y: q.y + 1, z: q.z }, 0.9 + Math.random() * 0.3);
      if (onSlide) this.whooped.add(q.id);
      else if (q.y < 0.5) this.whooped.delete(q.id);
      const was = this.lastY.get(q.id);
      if (q.id !== this.host.you() && was !== undefined && was > 0 && q.y < -0.5 && inT(LANDING, q.x, q.z)) this.host.audio.splash({ x: q.x, y: 0, z: q.z });
      this.lastY.set(q.id, q.y);
    }
  }

  /** Under the dome it's as light as it is outside: the sun by day; at night the dome goes dark and the hall's own warm light takes over. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
    const fog0 = lights.scene.fog as THREE.Fog | null;
    if (this.outdoors) {
      // Outside, the sky lights it as it is.
      if (fog0) {
        fog0.near = 600;
        fog0.far = 800;
      }
      return;
    }
    const d = Math.max(0, Math.min(1, this.host.daylight()));
    this.light.copy(this.night).lerp(this.day, d);
    lights.sun.intensity *= 0.85;
    lights.hemi.color.copy(this.light);
    lights.hemi.groundColor.copy(this.ground);
    lights.hemi.intensity = 1.0 + 0.5 * d;
    lights.ambient.color.copy(this.light);
    lights.ambient.intensity = 0.6 + 0.3 * d;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 600;
      fog.far = 800;
    }
  }
}

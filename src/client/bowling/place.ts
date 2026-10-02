import * as THREE from 'three';
import { BOWLING, BOWLING_ENTRY, BOWLING_NAME, BOWLING_ROOM, BOWLING_STREET_SPOT, type BowlingLights } from '../../shared/bowling';
import { BARKEEP, sofaSeats, type BowlingHouseServerMsg } from '../../shared/bowling-house';
import type { ClientMsg, FloorInfo, ServerMsg } from '../../shared/protocol';
import type { Drink } from '../../shared/rooftop';
import { streetBelow, type SeatPlace } from '../../shared/layout';
import type { Collider, Interactable } from '../world/types';
import { Person } from '../world/character';
import { bowlingParts, type BowlingPart, type BowlingRoom } from '../world/bowling/parts';
import { buildBowlingInterior, type BowlingInterior } from '../world/bowling/interior';
import { toast } from '../ui/dom';
import { openBowlingCounter, openShoeRental } from './ui';
import { BowlingShoes } from './shoes';
import type { BowlingSound } from './sound';

/*
 * The bowling centre as a place on this page (flrnoh fork, see FORK.md "The bowling centre"), like the
 * padel hall (client/hall.ts): going in and out, the room inside (built the first time you go in), the
 * counter, the shoe rental, the lounge's sofas and its cosmic switch, hints, the light inside. The
 * lanes, the karaoke bar and the mini golf join in as parts (world/bowling/parts.ts): each is built
 * into the room with it, hears every message, gets every frame and the lights, and E and the hint go
 * to them for anything that isn't the house's.
 */

type Spot = { x: number; y: number; z: number; rotY: number };

export type HintParts = { k: string; parts: (HTMLElement | string)[] };

export interface BowlingHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): BOWLING while inside. */
  floor(): string | null;
  floors(): FloorInfo[];
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean }; seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void };
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): BowlingHost['player']['room'];
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: BowlingSound): void;
  /** Every frame inside: the room's air (sound/index.ts setBowling). */
  ambience(level: number, cosmic: number): void;
  /** Handed over the counter: into your hand (like the cinema's snacks). */
  served(d: Drink): void;
  /** Had enough beer for now (the bar's booze). */
  cutOff(): boolean;
  /** You and everyone else in the centre, by peer id: who they are, where they stand, their body. */
  you(): string;
  people(): { id: string; name: string; x: number; y: number; z: number; moving: boolean; seated: boolean; person: Person | undefined }[];
  /** Your own body, for sitting down on a sofa. */
  me(): Person;
}

const FROM_KEY = 'agent-office.bowling.from';
const SEATS = sofaSeats();
const SEAT_BY_KEY = new Map(SEATS.map((s) => [s.key, s]));
/** How close to a seat's spot someone must stand still to be sitting on it. */
const ON_SEAT = 0.25;
const SOFA_HIPS = 0.44;

export class BowlingPlace {
  private room: BowlingInterior | null = null;
  active = false;
  private outside: Spot | null = null;
  private arriving = false;
  private parts: BowlingPart[] = [];
  private lights: BowlingLights = 'normal';
  readonly shoes: BowlingShoes;
  private barkeep: Person | null = null;
  private sitting = new Map<string, Person>();
  private warm = { sky: new THREE.Color('#fff2dc'), ground: new THREE.Color('#7b5f4a') };
  private uv = { sky: new THREE.Color('#5a2fa8'), ground: new THREE.Color('#1a0d33') };
  private sky = new THREE.Color();
  private ground = new THREE.Color();

  constructor(private host: BowlingHost) {
    this.shoes = new BowlingShoes();
    this.parts = [...bowlingParts((p) => this.join(p))];
  }

  /** A part joins after the room was built: built into it straight away, and told the lights. */
  private join(p: BowlingPart) {
    if (!this.parts.includes(p)) this.parts.push(p);
    if (!this.room) return;
    p.build?.(this.partRoom());
    if (this.active) {
      p.place?.(true);
      p.lights?.(this.lights);
    }
  }

  private partRoom(): BowlingRoom {
    const r = this.room!;
    return { group: r.group, colliders: r.colliders, interactables: r.interactables };
  }

  private theRoom(): BowlingInterior {
    if (!this.room) {
      this.room = buildBowlingInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      const p = new Person('Toni', '#e63946', { skin: 2, hair: 3, style: 1 });
      p.root.position.set(BARKEEP.x, 0, BARKEEP.z);
      p.root.rotation.y = BARKEEP.rotY;
      p.showLabel(false);
      this.room.group.add(p.root);
      this.barkeep = p;
      this.room.setLights(this.lights, true);
      for (const part of this.parts) part.build?.(this.partRoom());
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
    if (!here || here === BOWLING) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.sound('door');
    this.host.trip(BOWLING);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the centre. */
  leave() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const at = { x: BOWLING_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: BOWLING_STREET_SPOT.z, rotY: BOWLING_STREET_SPOT.rotY };
    this.outside = at;
    if (this.shoes.of(this.host.you())) toast('👟 Die Leihschuhe bleiben hier: zurück ins Regal');
    this.host.sound('door');
    this.host.trip(to, at);
  }

  private roomBox() {
    return { minX: BOWLING_ROOM.minX, maxX: BOWLING_ROOM.maxX, minZ: BOWLING_ROOM.minZ, maxZ: BOWLING_ROOM.maxZ, wall: 0.3, enclosed: true };
  }

  private inside(p: THREE.Vector3): boolean {
    return p.x > BOWLING_ROOM.minX && p.x < BOWLING_ROOM.maxX && p.z > BOWLING_ROOM.minZ && p.z < BOWLING_ROOM.maxZ && p.y > -0.5 && p.y < BOWLING_ROOM.height;
  }

  private entry(): Spot {
    return { x: BOWLING_ENTRY.x, y: 0, z: BOWLING_ENTRY.z, rotY: BOWLING_ENTRY.rotY };
  }

  /** You arrived somewhere: in the centre, its room is what you see and walk in; anywhere else, the office is back. */
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
      r.setLights(this.lights, true);
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
      this.unsitAll();
      this.shoes.clear();
    }
    for (const p of this.parts) {
      p.place?.(inside);
      if (inside) p.lights?.(this.lights);
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
    if (!this.inside(this.host.player.pos)) this.host.placeAt(this.entry());
  }

  arrived() {
    if (this.active) {
      if (this.arriving || !this.inside(this.host.player.pos)) this.host.placeAt(this.entry());
      this.arriving = false;
      this.outside = null;
      return;
    }
    this.arriving = false;
    if (this.outside) {
      this.host.placeAt(this.outside);
      this.outside = null;
    }
  }

  // ---- Using things ---------------------------------------------------------------------------------

  use(it: Interactable, key: string): boolean {
    if (it.kind === 'bowling') {
      if (key === 'E') {
        if (this.active) this.leave();
        else this.go();
      }
      return true;
    }
    if (!this.active) return false;
    if (it.kind === 'bowlingcounter') {
      if (key === 'E') this.counter();
      return true;
    }
    if (it.kind === 'bowlingshoes') {
      if (key === 'E') this.rental();
      return true;
    }
    if (it.kind === 'bowlingswitch') {
      if (key === 'E') this.host.send({ t: 'bowling.lights', lights: this.lights === 'cosmic' ? 'normal' : 'cosmic' });
      return true;
    }
    if (it.kind === 'bowlingseat') {
      if (key === 'E') this.sit(it.seatId ?? '');
      return true;
    }
    return this.parts.some((p) => p.use?.(it, key) ?? false);
  }

  private counter() {
    this.barkeep?.say('Was darf’s sein?', 2.5);
    openBowlingCounter({
      cut: this.host.cutOff(),
      order: (d) => {
        const fried = d.id === 'pommes' || d.id === 'currywurst' || d.id === 'nachos';
        this.host.sound(fried ? 'fryer' : d.strength > 0 ? 'pour' : 'till');
        this.barkeep?.reach();
        this.barkeep?.say(fried ? (d.id === 'pommes' ? 'Rot-weiß, kommt sofort!' : 'Frisch aus der Fritteuse!') : d.strength > 0 ? 'Frisch gezapft. Prost!' : 'Eiskalt, bitteschön!', 3);
        window.setTimeout(() => {
          if (!this.active) return;
          this.host.sound('till');
          this.host.served(d);
        }, fried ? 1500 : 900);
      },
    });
  }

  private rental() {
    const wearing = this.shoes.of(this.host.you());
    this.barkeep?.say(wearing ? 'Passen sie nicht?' : 'Welche Größe?', 2.5);
    openShoeRental({
      wearing,
      rent: (size) => {
        this.host.send({ t: 'bowling.shoes', size });
        this.host.sound('shoes');
        this.barkeep?.reach();
        this.barkeep?.say(`Größe ${size}, bitteschön!`, 3);
      },
      giveBack: () => {
        this.host.send({ t: 'bowling.shoes', size: null });
        this.host.sound('shoes');
        this.barkeep?.say('Danke, kommen ins Spray.', 3);
      },
    });
  }

  // ---- The sofas: like the cinema's seats, nobody tells the office; everyone sees who's still on one ----

  private seatPlace(key: string): SeatPlace | null {
    const s = SEAT_BY_KEY.get(key);
    return s ? { key, seatId: key, x: s.x, y: 0, z: s.z, rotY: s.rotY, hips: SOFA_HIPS, out: 0.75 } : null;
  }

  private taken(key: string): boolean {
    const s = SEAT_BY_KEY.get(key);
    if (!s) return true;
    return this.host.people().some((p) => p.id !== this.host.you() && !p.moving && Math.abs(p.x - s.x) < ON_SEAT && Math.abs(p.z - s.z) < ON_SEAT);
  }

  private sit(key: string) {
    if (this.host.player.seat?.seatId === key) return this.host.player.stand();
    const place = this.seatPlace(key);
    if (!place) return;
    if (this.taken(key)) return toast('Da sitzt schon jemand', 'warn');
    this.host.player.sit(place);
    this.host.me().sit(SOFA_HIPS);
  }

  /** Each frame: everyone else standing still on a sofa's seat sits down on it, and gets up once they're off it. */
  private poseOthers() {
    const seen = new Set<string>();
    for (const p of this.host.people()) {
      if (p.id === this.host.you() || !p.person) continue;
      const s = !p.moving && !p.seated ? SEATS.find((q) => Math.abs(q.x - p.x) < ON_SEAT && Math.abs(q.z - p.z) < ON_SEAT && Math.abs(p.y) < 0.4) : undefined;
      if (!s) continue;
      seen.add(p.id);
      p.person.sit(SOFA_HIPS);
      p.person.root.rotation.y = s.rotY;
      this.sitting.set(p.id, p.person);
    }
    for (const [id, person] of this.sitting) {
      if (seen.has(id)) continue;
      person.sit(null);
      this.sitting.delete(id);
    }
  }

  private unsitAll() {
    for (const person of this.sitting.values()) person.sit(null);
    this.sitting.clear();
  }

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): HintParts | null {
    if (it.kind === 'bowling') return this.active ? { k: 'bowling-out', parts: [title('🚪 Straße'), key('E', 'Rausgehen')] } : { k: 'bowling-in', parts: [title(`🎳 ${BOWLING_NAME}`), aside('6 Bahnen · Theke · Karaoke · Schwarzlicht-Minigolf'), key('E', 'Reingehen')] };
    if (!this.active) return null;
    if (it.kind === 'bowlingcounter') {
      const cut = this.host.cutOff();
      return { k: `bw-counter|${cut}`, parts: [title('🍺 Theke'), aside(cut ? 'genug Bier für jetzt · Spezi, Cola, Pommes gehen immer' : 'Bier vom Fass, Spezi, Pommes rot-weiß'), key('E', 'Bestellen')] };
    }
    if (it.kind === 'bowlingshoes') {
      const size = this.shoes.of(this.host.you());
      return { k: `bw-shoes|${size}`, parts: [title('👟 Schuhverleih'), aside(size ? `du trägst Größe ${size}` : 'Bowlingschuhe in 36–47'), key('E', size ? 'Tauschen / zurückgeben' : 'Schuhe leihen')] };
    }
    if (it.kind === 'bowlingswitch') {
      const on = this.lights === 'cosmic';
      return { k: `bw-switch|${on}`, parts: [title('🌌 Cosmic Bowling'), aside(on ? 'Schwarzlicht an, für alle' : 'Licht aus, Schwarzlicht an, für alle'), key('E', on ? 'Licht an' : 'Cosmic an')] };
    }
    if (it.kind === 'bowlingseat') {
      const mine = this.host.player.seat?.seatId === it.seatId;
      if (mine) return { k: `${it.seatId}|me`, parts: [title('🛋️ Lounge'), key('W A S D', 'Aufstehen')] };
      const full = this.taken(it.seatId ?? '');
      return { k: `${it.seatId}|${full}`, parts: [title('🛋️ Lounge'), full ? aside('besetzt') : key('E', 'Hinsetzen')] };
    }
    for (const p of this.parts) {
      const h = p.hint?.(it, title, key, aside);
      if (h) return h;
    }
    return null;
  }

  title(): { name: string; meta: string } {
    return { name: `🎳 ${BOWLING_NAME}`, meta: this.lights === 'cosmic' ? '🌌 Cosmic Bowling · Karaoke · Minigolf' : '6 Bahnen · Theke · Karaoke · Minigolf' };
  }

  // ---- Messages ---------------------------------------------------------------------------------------

  onMessage(msg: ServerMsg) {
    this.house(msg);
    for (const p of this.parts) p.onMessage?.(msg);
  }

  private house(msg: ServerMsg) {
    const m = msg as BowlingHouseServerMsg;
    if (m.t === 'bowling.house') {
      this.lights = m.lights;
      this.shoes.reset(m.shoes);
      this.room?.setLights(m.lights, true);
      if (this.active) for (const p of this.parts) p.lights?.(m.lights);
    } else if (m.t === 'bowling.lights') {
      if (m.lights === this.lights) return;
      this.lights = m.lights;
      if (!this.active) return;
      this.room?.setLights(m.lights);
      this.host.sound(m.lights === 'cosmic' ? 'cosmic' : 'lights');
      toast(m.lights === 'cosmic' ? `🌌 ${m.by} switched on cosmic bowling` : `💡 ${m.by} put the house lights back on`);
      for (const p of this.parts) p.lights?.(m.lights);
    } else if (m.t === 'bowling.shoes') {
      this.shoes.set(m.id, m.size);
      if (m.id === this.host.you() && m.size) toast(`👟 Bowlingschuhe in Größe ${m.size} an. Viel Spaß auf der Bahn!`);
    }
  }

  // ---- Every frame ------------------------------------------------------------------------------------

  update(t: number, dt: number) {
    if (!this.active || !this.room) return;
    this.room.update(t, dt);
    this.barkeep?.update(dt, t, false, false);
    this.watch(dt);
    this.poseOthers();
    const people = this.host.people();
    this.shoes.dress(people.map((p) => ({ id: p.id, person: p.id === this.host.you() ? this.host.me() : p.person })));
    this.host.ambience(Math.min(1, 0.55 + people.length * 0.05), this.room.lighting.shares().uv);
    for (const p of this.parts) p.update?.(t, dt);
  }

  /** Toni looks up at whoever comes to the counter (you), within reason. */
  private watch(dt: number) {
    const b = this.barkeep;
    if (!b) return;
    const p = this.host.player.pos;
    const near = Math.hypot(p.x - BARKEEP.x, p.z - BARKEEP.z) < 7 && p.z < BARKEEP.z;
    const to = near ? Math.atan2(p.x - BARKEEP.x, p.z - BARKEEP.z) : BARKEEP.rotY;
    let d = to - b.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.root.rotation.y += d * Math.min(1, dt * 4);
  }

  /** Inside, the centre lights itself: warm and bright with the house lights on, a deep violet glow in cosmic bowling. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active || !this.room) return;
    const { house } = this.room.lighting.shares();
    lights.sun.intensity = 0;
    this.sky.copy(this.uv.sky).lerp(this.warm.sky, house);
    this.ground.copy(this.uv.ground).lerp(this.warm.ground, house);
    lights.hemi.color.copy(this.sky);
    lights.hemi.groundColor.copy(this.ground);
    lights.hemi.intensity = 0.55 + house * 0.85;
    lights.ambient.color.copy(this.sky);
    lights.ambient.intensity = 0.28 + house * 0.5;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

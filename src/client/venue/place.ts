import * as THREE from 'three';
import { VENUE, VENUE_ENTRY, VENUE_NAME, VENUE_ROOM, VENUE_STREET_SPOT, ZONES, venueRoomAt, type VenueMode } from '../../shared/venue';
import { muffleFor } from '../../shared/proberaum';
import { BAR_MENU, DOCK, DOCK_SPOT, FOTOBOX_SPOT, LOADING_INSIDE, MERCH_BY_ID, MODE_LIGHTS, RIDER_MENU, type MerchId, type VenueFx, type VenueHouseServerMsg, type VenueLights, type VenueWear } from '../../shared/venue-house';
import type { ClientMsg, FloorInfo, ServerMsg } from '../../shared/protocol';
import type { Drink } from '../../shared/rooftop';
import type { EmoteId } from '../../shared/emotes';
import type { Look } from '../../shared/avatar';
import { streetBelow, type SeatPlace } from '../../shared/layout';
import type { Collider, Interactable } from '../world/types';
import type { Person } from '../world/character';
import { venueLevel, venueParts, type VenuePart, type VenueRoom } from '../world/venue/parts';
import { buildVenueInterior, type VenueInterior } from '../world/venue/interior';
import { applyMood } from '../world/venue/lighting';
import { setBillMode } from '../world/venue/bill';
import { toast } from '../ui/dom';
import { openAnnouncements, openLightDesk, openMerch, openVenueMenu } from './ui';
import { openVenueBooth, type Sitter } from './booth';
import { VenueWearing } from './wear';
import { posterPng } from './poster';
import type { VenueSoundKind } from './sound';
import { venueHint, type HintParts } from './hints';
import { hireStaff, tendStaff, type VenueStaff } from './staff';
import { VenueSofas } from './seats';
import './gigbill'; // the show's gig calendar on the letter board, the LED wall and the façade's posters

/*
 * The Schallwerk as a place on this page (flrnoh fork, see FORK.md "The Schallwerk"), like the
 * bowling centre (client/bowling/place.ts): going in and out, the house inside (built the first time
 * you go in) with its people (Mia at the box office, Jo at the cloakroom, Sam at the merch stand, Ronja
 * behind the bar), the stamp, the cloakroom, the merch, the photo booth, the bar, the rider, the green
 * room's sofas, the light and sound desks, the light show and its effects, the air inside. The
 * instruments, the rehearsal wing and the show join in as parts (world/venue/parts.ts): each is built
 * into the house with it, hears every message, gets every frame, `place` and `mode`, and E and the hint
 * go to them for anything that isn't the house's. What people have on from the house (a merch shirt,
 * the stamp) this page draws on everyone it sees, in here or anywhere.
 */

type Spot = { x: number; y: number; z: number; rotY: number };

export interface VenuePerson {
  id: string;
  name: string;
  color: string;
  look: Look;
  x: number;
  y: number;
  z: number;
  moving: boolean;
  seated: boolean;
  person: Person | undefined;
}

export interface VenueHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): VENUE while inside. */
  floor(): string | null;
  floors(): FloorInfo[];
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean }; seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void };
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): VenueHost['player']['room'];
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: VenueSoundKind): void;
  /** Every frame inside: the house's air (crowd 0..1, how close to the foyer, to the bar). */
  ambience(crowd: number, foyer: number, bar: number): void;
  /** Handed over the bar: into your hand. */
  served(d: Drink): void;
  /** Had enough for now (the bar's booze). */
  cutOff(): boolean;
  you(): string;
  /** Everyone in the venue (you too): who, where, their body. */
  people(): VenuePerson[];
  /** Everyone this page draws, wherever (you and the people on your floor): for what they have on from the house. */
  everyone(): { id: string; person: Person | undefined }[];
  me(): Person;
  /** The office's clock (ms). */
  now(): number;
  /** Your character strikes a pose (the photo booth), for everyone to see. */
  emote(id: EmoteId): void;
}

const FROM_KEY = 'agent-office.venue.from';

export class VenuePlace {
  private room: VenueInterior | null = null;
  active = false;
  private outside: Spot | null = null;
  private arriving = false;
  /** Came in by the loading door (lands backstage, not in the foyer). */
  private viaDock = false;
  private parts: VenuePart[] = [];
  mode: VenueMode = 'konzert';
  lights: VenueLights = { ...MODE_LIGHTS.konzert };
  /** When each effect last went off (office clock), for the light desk and for coming in mid-effect. */
  readonly fired: Partial<Record<VenueFx, number>> = {};
  readonly wearing = new VenueWearing();
  private staff: VenueStaff | null = null;
  readonly sofas: VenueSofas;
  private deskWatchers = new Set<() => void>();
  private coatsKey = '';
  private snapLook = true;

  constructor(private host: VenueHost) {
    this.parts = [...venueParts((p) => this.join(p))];
    this.sofas = new VenueSofas(host);
  }

  /** A part joins after the house was built: built into it straight away, and told where you are and the mode. */
  private join(p: VenuePart) {
    if (!this.parts.includes(p)) this.parts.push(p);
    if (!this.room) return;
    p.build?.(this.partRoom());
    if (this.active) {
      p.place?.(true);
      p.mode?.(this.mode);
    }
  }

  private partRoom(): VenueRoom {
    const r = this.room!;
    return { group: r.group, colliders: r.colliders, interactables: r.interactables };
  }

  private theRoom(): VenueInterior {
    if (!this.room) {
      this.room = buildVenueInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      this.staff = hireStaff(this.room.group);
      this.wearing.set('npc-merch', { shirt: 'shirt' });
      this.room.setLights(this.lights, this.mode);
      for (const [f, at] of Object.entries(this.fired) as [VenueFx, number][]) this.room.fire(f, at);
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
  go(dock = false) {
    this.viaDock = dock;
    const here = this.host.floor();
    if (!here || here === VENUE) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.sound('door');
    this.host.trip(VENUE);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the Schallwerk. */
  leave(dock = false) {
    const to = this.from();
    if (!to) return toast('Es gibt kein Stockwerk, auf das du zurückkannst', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const spot = dock ? DOCK_SPOT : VENUE_STREET_SPOT;
    const at = { x: spot.x, y: streetBelow(Math.max(0, i)) + (dock ? DOCK.top : 0), z: spot.z, rotY: spot.rotY };
    this.outside = at;
    const coat = this.wearing.of(this.host.you()).coat;
    if (coat) toast(`🧥 Deine Jacke hängt noch an der Garderobe (Marke ${coat})`);
    this.host.sound('door');
    this.host.trip(to, at);
  }

  private roomBox() {
    return { minX: VENUE_ROOM.minX, maxX: VENUE_ROOM.maxX, minZ: VENUE_ROOM.minZ, maxZ: VENUE_ROOM.maxZ, wall: 0.3, enclosed: true };
  }

  private inside(p: THREE.Vector3): boolean {
    return p.x > VENUE_ROOM.minX && p.x < VENUE_ROOM.maxX && p.z > VENUE_ROOM.minZ && p.z < VENUE_ROOM.maxZ && p.y > -0.5 && p.y < VENUE_ROOM.height;
  }

  private entry(): Spot {
    if (this.viaDock) return { x: LOADING_INSIDE.x, y: 0, z: LOADING_INSIDE.z, rotY: LOADING_INSIDE.rotY };
    return { x: VENUE_ENTRY.x, y: 0, z: VENUE_ENTRY.z, rotY: VENUE_ENTRY.rotY };
  }

  /** You arrived somewhere: in the venue, its house is what you see and walk in; anywhere else, the office is back. */
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
      this.snapLook = true;
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
      this.sofas.clear();
    }
    for (const p of this.parts) {
      p.place?.(inside);
      if (inside) p.mode?.(this.mode);
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
      this.viaDock = false;
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
    if (it.kind === 'venue' || it.kind === 'venuedock') {
      const dock = it.kind === 'venuedock';
      if (key === 'E') {
        if (this.active) this.leave(dock);
        else this.go(dock);
      }
      return true;
    }
    if (!this.active) return false;
    const e = key === 'E';
    switch (it.kind) {
      case 'venuekasse':
        if (e) this.stamp();
        return true;
      case 'venuecoat':
        if (e) this.coat();
        return true;
      case 'venuemerch':
        if (e) this.merch();
        return true;
      case 'venuebooth':
        if (e) this.booth();
        return true;
      case 'venuebar':
        if (e) this.bar();
        return true;
      case 'venuerider':
        if (e) this.rider();
        return true;
      case 'venuelight':
        if (e) this.lightDesk();
        return true;
      case 'venuemix':
        if (e)
          openAnnouncements({
            say: (n) => this.host.send({ t: 'venue.announce', n }),
            lights: () => this.lightDesk(),
          });
        return true;
      case 'venueseat':
        if (e) this.sofas.sit(it.seatId ?? '');
        return true;
    }
    return this.parts.some((p) => p.use?.(it, key) ?? false);
  }

  private stamp() {
    const s = this.staff?.kasse;
    const had = this.wearing.of(this.host.you()).stamp;
    s?.reach();
    s?.say(had ? 'Hast doch schon einen! Na gut, frisch nachgestempelt.' : 'Hand her! Viel Spaß heute.', 3);
    this.host.sound('stamp');
    window.setTimeout(() => this.host.send({ t: 'venue.stamp' }), 350);
  }

  private coat() {
    const s = this.staff?.coat;
    const tag = this.wearing.of(this.host.you()).coat;
    s?.reach();
    s?.say(tag ? `Marke ${tag}? Bitteschön, deine Jacke.` : 'Jacke? Gib her. Hier ist deine Marke.', 3);
    this.host.sound('coat');
    this.host.send({ t: 'venue.coat', in: !tag });
  }

  private merch() {
    const s = this.staff?.merch;
    const wearing = this.wearing.of(this.host.you()).shirt ?? null;
    s?.say(wearing ? 'Steht dir! Noch was?' : 'Shirts, Hoodie, Poster: alles aufs Haus.', 3);
    openMerch({
      wearing,
      wear: (id: MerchId | null) => {
        this.host.sound('merch');
        s?.reach();
        s?.say(id ? `${MERCH_BY_ID.get(id)?.name}, gute Wahl!` : 'Zurück auf den Stapel damit.', 3);
        this.host.send({ t: 'venue.merch', item: id });
      },
      poster: () => posterPng(),
    });
  }

  private booth() {
    const me = this.host.people().find((p) => p.id === this.host.you());
    const near = this.host
      .people()
      .filter((p) => p.id !== this.host.you() && Math.hypot(p.x - FOTOBOX_SPOT.x, p.z - FOTOBOX_SPOT.z) < 3)
      .sort((a, b) => Math.hypot(a.x - FOTOBOX_SPOT.x, a.z - FOTOBOX_SPOT.z) - Math.hypot(b.x - FOTOBOX_SPOT.x, b.z - FOTOBOX_SPOT.z))
      .slice(0, 3);
    const sitter = (p: VenuePerson): Sitter => ({ name: p.name, color: p.color, look: p.look, wear: this.wearing.of(p.id) });
    this.host.sound('door');
    openVenueBooth({
      sitters: [...(me ? [sitter(me)] : []), ...near.map(sitter)],
      pose: (id) => this.host.emote(id),
      shutter: () => this.host.sound('shutter'),
      done: () => toast('📸 Dein Fotostreifen: herunterladen, oder einfach behalten'),
    });
  }

  private bar() {
    const s = this.staff?.bar;
    s?.say('Was darf’s sein?', 2.5);
    openVenueMenu({
      title: '🍺 Bar',
      doing: '🍺 at the Schallwerk bar',
      footer: 'Alles aufs Haus. Mit vor die Bühne, oder mit ins Büro.',
      menu: BAR_MENU,
      cut: this.host.cutOff(),
      cutNote: 'Ronja meint, du hattest genug für jetzt',
      order: (d) => {
        const beer = d.strength > 0 && d.strength < 0.3;
        this.host.sound(beer ? 'pour' : 'till');
        s?.reach();
        s?.say(beer ? 'Frisch gezapft. Prost!' : d.strength > 0.4 ? 'Auf ex? Auf ex!' : d.strength > 0 ? 'Mit viel Eis. Cheers!' : 'Eiskalt, bitteschön!', 3);
        window.setTimeout(() => {
          if (!this.active) return;
          this.host.sound('till');
          this.host.served(d);
        }, beer ? 1300 : 800);
      },
    });
  }

  private rider() {
    this.host.sound('fridge');
    openVenueMenu({
      title: '🧊 Rider',
      doing: '🧊 raiding the rider',
      footer: 'Eigentlich für die Band. Aber wer zählt schon nach.',
      menu: RIDER_MENU,
      cut: this.host.cutOff(),
      cutNote: 'Für jetzt lieber ein Wasser',
      order: (d) => {
        this.host.sound('fridge');
        this.host.served(d);
      },
    });
  }

  lightDesk() {
    openLightDesk({
      state: () => ({ mode: this.mode, lights: this.lights, fired: this.fired, now: this.host.now() }),
      watch: (fn) => {
        this.deskWatchers.add(fn);
        return () => this.deskWatchers.delete(fn);
      },
      mode: (m) => {
        if (m === this.mode) return;
        this.host.sound('click');
        this.host.send({ t: 'venue.mode', mode: m });
      },
      scene: (s) => {
        this.host.sound('click');
        this.host.send({ t: 'venue.lights', scene: s });
      },
      laser: (on) => {
        this.host.sound('click');
        this.host.send({ t: 'venue.lights', laser: on });
      },
      ball: (on) => {
        this.host.sound('click');
        this.host.send({ t: 'venue.lights', ball: on });
      },
      fx: (f) => this.host.send({ t: 'venue.fx', fx: f }),
    });
  }

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): HintParts | null {
    const own = venueHint(this, it, title, key, aside);
    if (own !== undefined) return own;
    for (const p of this.parts) {
      const h = p.hint?.(it, title, key, aside);
      if (h) return h;
    }
    return null;
  }

  /** What the hints need to know. */
  get you(): { wear: VenueWear; cut: boolean; seat: string | null } {
    return { wear: this.wearing.of(this.host.you()), cut: this.host.cutOff(), seat: this.host.player.seat?.seatId ?? null };
  }

  title(): { name: string; meta: string } {
    return { name: `🎸 ${VENUE_NAME}`, meta: this.mode === 'club' ? '🪩 Clubnacht · Bar · Proberäume' : '🎤 Konzert · Bar · Proberäume' };
  }

  // ---- Messages ---------------------------------------------------------------------------------------

  onMessage(msg: ServerMsg) {
    if (msg.t === 'welcome') this.host.send({ t: 'venue.hello' }); // what everyone has on, and the mode for the letter board
    this.house(msg);
    for (const p of this.parts) p.onMessage?.(msg);
  }

  private setMode(m: VenueMode) {
    const changed = m !== this.mode;
    this.mode = m;
    setBillMode(m);
    if (changed && this.active) for (const p of this.parts) p.mode?.(m);
  }

  private house(msg: ServerMsg) {
    const m = msg as VenueHouseServerMsg;
    switch (m.t) {
      case 'venue.house':
        this.lights = { ...m.lights };
        this.setMode(m.mode);
        this.wearing.reset(m.wear);
        for (const f of m.fx) this.fire(f.fx, f.at, false);
        this.room?.setLights(this.lights, this.mode);
        if (this.active) for (const p of this.parts) p.mode?.(this.mode);
        break;
      case 'venue.mode': {
        const was = this.mode;
        this.lights = { ...m.lights };
        this.setMode(m.mode);
        this.room?.setLights(this.lights, this.mode);
        if (this.active && was !== m.mode) {
          this.host.sound(m.mode === 'club' ? 'club' : 'konzert');
          toast(m.mode === 'club' ? `🪩 ${m.by} macht das Schallwerk zum Club` : `🎸 ${m.by} macht das Schallwerk zur Konzerthalle`);
        }
        break;
      }
      case 'venue.lights':
        this.lights = { ...m.lights };
        this.room?.setLights(this.lights, this.mode);
        break;
      case 'venue.fx':
        this.fire(m.fx, m.at, true);
        break;
      case 'venue.announce':
        if (!this.active) break;
        this.host.sound('announce');
        toast(`📣 ${m.text} (${m.by})`);
        break;
      case 'venue.wear': {
        const was = this.wearing.of(m.id);
        this.wearing.set(m.id, m.wear);
        if (m.id !== this.host.you()) break;
        if (m.wear.stamp && !was.stamp) toast('✋ Einlass-Stempel drauf. Leuchtet im Dunkeln!');
        if (m.wear.coat && !was.coat) toast(`🧥 Jacke abgegeben: Marke ${m.wear.coat}`);
        if (!m.wear.coat && was.coat) toast('🧥 Jacke wieder an');
        if (m.wear.shirt && m.wear.shirt !== was.shirt) toast(`👕 ${MERCH_BY_ID.get(m.wear.shirt)?.name} an. Sehen alle, auch im Büro!`);
        break;
      }
      default:
        return;
    }
    for (const fn of this.deskWatchers) fn();
  }

  private fire(fx: VenueFx, at: number, fresh: boolean) {
    this.fired[fx] = at;
    this.room?.fire(fx, at);
    if (fresh && this.active && this.heard() > 0.5) this.host.sound(fx); // (not through a rehearsal room's walls)
  }

  // ---- Every frame ------------------------------------------------------------------------------------

  update(t: number, dt: number) {
    // What people have on from the house, on everyone this page draws (inside or not).
    const npcs = this.staff && this.active ? [{ id: 'npc-merch', person: this.staff.merch }] : [];
    this.wearing.dress([...this.host.everyone(), ...npcs]);
    if (!this.active || !this.room) return;
    this.room.update(this.host.now(), t, dt, venueLevel(), this.snapLook);
    this.snapLook = false;
    if (this.staff) tendStaff(this.staff, this.host.player.pos, t, dt);
    this.sofas.pose();
    const people = this.host.people();
    this.coatRack(people);
    const p = this.host.player.pos;
    const foyer = p.z < ZONES.foyer.maxZ + 2 ? 1 : Math.max(0, 1 - (p.z - ZONES.foyer.maxZ - 2) / 6);
    const bar = Math.max(0, 1 - Math.hypot(p.x - 21, Math.max(0, Math.abs(p.z + 2.5) - 5)) / 8);
    // In a rehearsal room the hall's crowd and bar are kept out (shared/proberaum.ts muffleFor).
    const kept = this.heard();
    this.host.ambience(Math.min(1, 0.3 + people.length * 0.07) * kept, foyer * kept, bar * kept);
    for (const part of this.parts) part.update?.(t, dt);
  }

  /** How much of the hall you hear where you stand: all of it, or what gets through a rehearsal room's walls. */
  private heard(): number {
    const p = this.host.player.pos;
    return muffleFor(venueRoomAt(p.x, p.z), 'hall').gain;
  }

  /** The coats handed in, on the rails in their owners' colours. */
  private coatRack(people: VenuePerson[]) {
    const coats = this.wearing.coats().map((c) => ({ tag: c.tag, color: people.find((p) => p.id === c.id)?.color ?? '#5a5a66' }));
    const key = coats.map((c) => `${c.tag}${c.color}`).join();
    if (key === this.coatsKey || !this.room) return;
    this.coatsKey = key;
    this.room.foyer.setCoats(coats);
  }

  /** Inside, the house lights itself: the show's look sets the air. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active || !this.room) return;
    lights.sun.intensity = 0;
    applyMood(this.room.show.look, lights.hemi, lights.ambient);
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

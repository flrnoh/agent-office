import * as THREE from 'three';
import { GALLERY, HALL, HALL_ENTRY, HALL_NAME, HALL_ROOM, HALL_STREET_SPOT } from '../shared/hall';
import type { CafeItem } from '../shared/cafe';
import type { ClientMsg, FloorInfo, ServerMsg } from '../shared/protocol';
import { streetBelow } from '../shared/layout';
import type { Collider, Interactable } from './world/office';
import { buildHallInterior, type HallInterior } from './world/hall/interior';
import { openCafe } from './ui/cafe';
import { toast } from './ui/dom';

/*
 * The padel hall across the street (flrnoh fork, see FORK.md "The padel hall"), on this page: going
 * in and out, the room inside (a place of its own like the casino, built the first time you go in),
 * the café up on the gallery, hints and lighting. main.ts hooks it in with a few lines.
 *
 * The padel game adds itself with `add(part)`: its courts' meshes, colliders, what you can use on
 * them, its messages and its frame (see HallPart), without more hooks in main.ts. In main.ts, right
 * after `const hall = new HallPlace(...)`:
 *
 *   hall.add({ build: (room) => { const courts = buildCourts(room.group); room.colliders.push(...courts.colliders); room.interactables.push(...courts.interactables); } });
 *
 * room.colliders is what you walk into in there (the player's), room.interactables what E and the
 * hint look at (usable()), and room.group is what the crosshair can pick (pickables), courts included.
 */

/** Where you stand, to be put somewhere: main.ts's placeAt. */
type Spot = { x: number; y: number; z: number; rotY: number };

export type HallSoundKind = 'door' | 'espresso' | 'pour' | 'plate';

export interface HallHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): HALL while inside. */
  floor(): string | null;
  /** The building's floors, bottom first (builtFloors). */
  floors(): FloorInfo[];
  /** On the office's map (the hall is only on its street). */
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean } };
  /** Hides the office and everything round it while you're inside, and shows it again after. */
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): HallHost['player']['room'];
  /** In the hall there's no rain, and it lights itself (see mood). */
  setIndoors(on: boolean): void;
  /** Off to floor `floor` (or the hall), faded, landing `at`: main.ts's trip. */
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: HallSoundKind): void;
  /** Handed over the café's counter: into your hand (main.ts, like the fridge's). */
  served(item: CafeItem): void;
}

/**
 * Something more in the hall (the padel game's courts): built with the room, the first time anyone
 * goes in. Everything's optional.
 */
export interface HallPart {
  /** Called once, with the room built: add meshes to `room.group`, push colliders and interactables. */
  build?(room: HallInterior): void;
  /** E (or another key) at one of its interactables: true when it was its. */
  use?(it: Interactable, key: string): boolean;
  /** The hint bar over one of its interactables, or null when it isn't its. */
  hint?(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null;
  /** Every message from the office (in the hall or not). */
  onMessage?(msg: ServerMsg): void;
  /** Every frame while you're inside. */
  update?(t: number, dt: number): void;
  /** You came in (true) or went out (false). */
  place?(inside: boolean): void;
}

const FROM_KEY = 'agent-office.hall.from';

export class HallPlace {
  private room: HallInterior | null = null;
  /** In the hall now (setPlace). */
  active = false;
  /** Out through the doors: where to put you once your floor's street is back. */
  private outside: Spot | null = null;
  /** In through the doors: put you just inside them. */
  private arriving = false;
  private parts: HallPart[] = [];
  private light = new THREE.Color('#fff8ec');
  private floorLight = new THREE.Color('#7a8494');

  constructor(private host: HallHost) {}

  /** The padel game (or anything else in the hall) joins in: see HallPart. */
  add(part: HallPart) {
    this.parts.push(part);
    if (this.room) part.build?.(this.room);
  }

  private theRoom(): HallInterior {
    if (!this.room) {
      this.room = buildHallInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      for (const p of this.parts) p.build?.(this.room);
    }
    return this.room;
  }

  get interactables(): Interactable[] {
    return this.active && this.room ? this.room.interactables : [];
  }

  get pickables(): THREE.Object3D[] {
    return this.active && this.room ? this.room.pickables : [];
  }

  /** The floor you came in from (kept over a reload), else the bottom one. */
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
    if (!here || here === HALL) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.sound('door');
    this.host.trip(HALL);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the hall. */
  leave() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const at = { x: HALL_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: HALL_STREET_SPOT.z, rotY: HALL_STREET_SPOT.rotY };
    this.outside = at;
    this.host.sound('door');
    this.host.trip(to, at);
  }

  private roomBox() {
    return { minX: HALL_ROOM.minX, maxX: HALL_ROOM.maxX, minZ: HALL_ROOM.minZ, maxZ: HALL_ROOM.maxZ, wall: 0.3, enclosed: true };
  }

  /** Where you stand is inside the hall: on its floor, the stand, the stairs or the gallery. */
  private inside(p: THREE.Vector3): boolean {
    return p.x > HALL_ROOM.minX && p.x < HALL_ROOM.maxX && p.z > HALL_ROOM.minZ && p.z < HALL_ROOM.maxZ && p.y > -0.5 && p.y < GALLERY.y + 1.5;
  }

  /** You arrived somewhere (main.ts's setPlace): in the hall, its room is what you see and walk in; anywhere else, the office is back. */
  setPlace(inside: boolean) {
    if (inside && !this.host.inOffice()) {
      // The building's on a map of its own now: no street, no hall. Back to a floor.
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
    }
    for (const p of this.parts) p.place?.(inside);
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
    if (!this.inside(this.host.player.pos)) this.host.placeAt({ x: HALL_ENTRY.x, y: 0, z: HALL_ENTRY.z, rotY: HALL_ENTRY.rotY });
  }

  /** After a welcome or a trip: where you stand, now the place you're in is set up. */
  arrived() {
    if (this.active) {
      // Back after a reload, where you were (the gallery too); coming in, just inside the doors.
      if (this.arriving || !this.inside(this.host.player.pos)) this.host.placeAt({ x: HALL_ENTRY.x, y: 0, z: HALL_ENTRY.z, rotY: HALL_ENTRY.rotY });
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

  // ---- Using things -------------------------------------------------------------------------------

  /** E at something of the hall's: the doors (in or out), the café's counter, or the padel game's. True when it was the hall's. */
  use(it: Interactable, key: string): boolean {
    if (it.kind === 'hall') {
      if (key === 'E') {
        if (this.active) this.leave();
        else this.go();
      }
      return true;
    }
    if (it.kind === 'cafe') {
      if (key === 'E' && this.active) this.cafe();
      return true;
    }
    if (!this.active) return false;
    return this.parts.some((p) => p.use?.(it, key) ?? false);
  }

  /** The menu at the counter: what you pick is made and handed over. */
  private cafe() {
    openCafe({
      order: (d) => {
        this.host.sound(d.coffee || d.id === 'chai' ? 'espresso' : d.section === 'cakes' ? 'plate' : 'pour');
        this.host.served(d);
      },
    });
  }

  /** The hint bar over something of the hall's, or null when it isn't the hall's. */
  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null {
    if (it.kind === 'hall') return this.active ? { k: 'hall-out', parts: [title('🚪 Street'), key('E', 'Go out')] } : { k: 'hall-in', parts: [title(`🎾 ${HALL_NAME}`), aside('2 courts · café on the gallery'), key('E', 'Go in')] };
    if (it.kind === 'cafe') return { k: 'cafe', parts: [title('☕ Café Netzroller'), aside('coffee, cold drinks, cakes'), key('E', 'Order')] };
    if (!this.active) return null;
    for (const p of this.parts) {
      const h = p.hint?.(it, title, key, aside);
      if (h) return h;
    }
    return null;
  }

  /** The top bar's title, inside. */
  title(): { name: string; meta: string } {
    return { name: `🎾 ${HALL_NAME}`, meta: '2 courts · ☕ café on the gallery' };
  }

  /** A message from the office, for the padel game's parts. */
  onMessage(msg: ServerMsg) {
    for (const p of this.parts) p.onMessage?.(msg);
  }

  // ---- Every frame --------------------------------------------------------------------------------

  update(t: number, dt: number) {
    if (!this.active || !this.room) return;
    this.room.update(t, dt);
    for (const p of this.parts) p.update?.(t, dt);
  }

  /** Inside, the hall lights itself: bright, a touch warm, no sun through the roof, no haze across the courts. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
    lights.sun.intensity = 0;
    lights.hemi.color.copy(this.light);
    lights.hemi.groundColor.copy(this.floorLight);
    lights.hemi.intensity = 1.45;
    lights.ambient.color.copy(this.light);
    lights.ambient.intensity = 0.8;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

import * as THREE from 'three';
import { GYM } from '../../shared/gym';
import { GYM_FROM_THERME, THERME, THERME_ARRIVAL, THERME_BOX, THERME_NAME, inTherme, thermeWhereabouts } from '../../shared/therme';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
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

export type ThermeSoundKind = 'door';

export interface ThermeHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): THERME while inside. */
  floor(): string | null;
  /** On the office's map (the gym, and so the baths, are only on its street). */
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: Room };
  showOffice(on: boolean): void;
  officeColliders(): Collider[];
  officeRoom(): Room;
  setIndoors(on: boolean): void;
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: ThermeSoundKind): void;
  /** How much daylight there is outside (0 night … 1 noon): the dome lets it in. */
  daylight(): number;
}

export class ThermePlace {
  private room: ThermeInterior | null = null;
  active = false;
  /** Through the door from the gym: put you just inside it. */
  private arriving = false;
  /** Back through the door to the gym: put you in front of it on the gym's side. */
  private backToGym = false;
  private day = new THREE.Color('#fff4e0');
  private night = new THREE.Color('#ffd2a1');
  private ground = new THREE.Color('#8a7a60');
  private light = new THREE.Color();

  constructor(private host: ThermeHost) {}

  private theRoom(): ThermeInterior {
    if (!this.room) {
      this.room = buildThermeInterior();
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
    this.arriving = true;
    this.host.sound('door');
    this.host.trip(THERME);
  }

  /** E at the door at the passage's end: back to the gym's basement. */
  leave() {
    this.backToGym = true;
    this.host.sound('door');
    this.host.trip(GYM);
  }

  private roomBox(): Room {
    return { minX: THERME_BOX.minX, maxX: THERME_BOX.maxX, minZ: THERME_BOX.minZ, maxZ: THERME_BOX.maxZ, wall: 0.3, enclosed: true };
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
      if (this.arriving || !ThermePlace.inside(this.host.player.pos)) this.host.placeAt(THERME_ARRIVAL);
      this.arriving = false;
      this.backToGym = false;
      return;
    }
    this.arriving = false;
    if (this.backToGym && this.host.floor() === GYM) this.host.placeAt(GYM_FROM_THERME);
    this.backToGym = false;
  }

  /** E at the door (either side of it). True when it was the baths'. */
  use(it: Interactable, key: string): boolean {
    if (it.kind !== 'therme') return false;
    if (key === 'E') {
      if (this.active) this.leave();
      else this.go();
    }
    return true;
  }

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } | null {
    if (it.kind !== 'therme') return null;
    if (this.active) return { k: 'therme-out', parts: [title('🚪 Gym'), aside('Schwimmhalle · Untergeschoss'), key('E', 'Back to the gym')] };
    return { k: 'therme-in', parts: [title(`🌴 ${THERME_NAME}`), aside('Thermalbad · geöffnet'), key('E', 'Go in')] };
  }

  title(): { name: string; meta: string } {
    const p = this.host.player.pos;
    return { name: `🌴 ${THERME_NAME}`, meta: thermeWhereabouts(p.x, p.z).replace(/^\S+\s/, '') };
  }

  onMessage(_msg: ServerMsg) {}

  update(t: number, dt: number) {
    if (!this.active || !this.room) return;
    this.room.update(t, dt);
  }

  /** Under the dome it's as light as it is outside: the sun by day; at night the dome goes dark and the hall's own warm light takes over. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
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

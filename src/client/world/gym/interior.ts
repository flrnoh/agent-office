import * as THREE from 'three';
import { GYM_ROOM, GYM_DOOR, GYM_STATIONS } from '../../../shared/gym';
import { gymFixtures } from '../../../shared/gym-rooms';
import type { Collider, Interactable } from '../types';
import { mergeByColor, mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { box, glow } from './parts';
import { buildGymRooms } from './rooms'; // the hall, lobby, juice bar, turf, stretch area, decor
import { buildGymSpa, type SpaView } from './spa'; // the spa: walk-in sauna and steam room, jacuzzi, plunge, massage
import { buildEquipment, type Equipment } from './equipment'; // the cardio and strength machines, alive

/*
 * Inside the gym (flrnoh fork, see FORK.md): a place of its own like the roof and the casino, built
 * the first time anyone goes in (client/gym.ts). A bright fitness club — a rubber floor, mirrored
 * walls, a cardio deck along the front windows, the strength floor down the middle, a heavy bag and a
 * stretch studio, a juice bar along the west wall, and a walled-off wellness spa (sauna, steam room,
 * jacuzzi, cold plunge, massage loungers) in the south-east corner. Its floor is at y 0. Mirrors
 * world/casino/interior.ts.
 */

export interface GymInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  exit: Interactable;
  /** A station's state from the office: cardio belts spin, a lifter's plates load, steam puffs. */
  setStation(id: string, state: unknown): void;
  /** Every frame; `view` (you, your camera, everyone in the gym) opens the doors and turnstiles. */
  update(t: number, dt: number, view?: SpaView): void;
  /** The walk-in room (sauna, steam room) at x, z, if any. */
  walkInAt(x: number, z: number): string | undefined;
  /** The cardio and strength machines, alive, and the people on them (equipment.ts). */
  equipment: Equipment;
}

const R = GYM_ROOM;

export function buildGymInterior(showCeiling = true): GymInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const trim = toon('#a3e635');

  // Fork: the hall, its rooms and the spa (rooms.ts, spa.ts); their colliders from shared/gym-rooms.ts.
  const still = new THREE.Group();
  const kit = { group, still, colliders, interactables };
  const rooms = buildGymRooms(kit, showCeiling);
  const spa = buildGymSpa(kit);
  for (const f of gymFixtures()) colliders.push({ minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, bottom: f.bottom ?? 0, top: f.top });

  // ---- Stations -----------------------------------------------------------------------------------

  // The cardio deck and the strength floor: their own machines, in world/gym/machines (equipment.ts).
  const equipment = buildEquipment(group, GYM_STATIONS, colliders, interactables);

  // ---- The way out --------------------------------------------------------------------------------
  const dx = GYM_DOOR.x;
  const dw = GYM_DOOR.width;
  const dh = GYM_DOOR.height;
  parts.add(mesh(box(dw + 0.5, 0.3, 0.12), trim, dx, dh + 0.15, R.minZ + 0.05, false));
  for (const s of [-1, 1]) parts.add(mesh(box(0.22, dh, 0.12), trim, dx + s * (dw / 2 + 0.11), dh / 2, R.minZ + 0.05, false));
  const doorGlass = mesh(new THREE.PlaneGeometry(dw, dh), glow(null, '#bfe9ff', { transparent: true }), dx, dh / 2, R.minZ + 0.02, false);
  (doorGlass.material as THREE.MeshBasicMaterial).opacity = 0.5;
  group.add(doorGlass);
  const exitSign = textPlane('🚪 EXIT · street', { bg: '#0f1a12', color: '#35e0d0', size: 52, border: '#35e0d0' });
  exitSign.position.set(dx, dh + 0.55, R.minZ + 0.06);
  group.add(exitSign);
  const exit: Interactable = { kind: 'gym', x: dx, z: R.minZ + 0.8, y: 0, radius: 1.3 };
  interactables.push(exit);
  doorGlass.userData.interact = exit;
  exitSign.userData.interact = exit;

  group.add(mergeByMaterial(parts));
  group.add(mergeByColor(still));

  // ---- Live state ---------------------------------------------------------------------------------
  const setStation = (id: string, state: unknown) => {
    if (!state || typeof state !== 'object') return;
    const kind = (state as { kind?: string }).kind;
    if (kind === 'cardio' || kind === 'strength') {
      equipment.setStation(id, state);
    } else if (kind === 'wellness' || kind === 'juicebar') {
      rooms.setStation(id, state);
      spa.setStation(id, state);
    }
  };

  const update = (t: number, dt: number, view?: SpaView) => {
    const v: SpaView = view ?? { me: null, cam: null, people: [] };
    rooms.update(t, dt, v.people);
    spa.update(t, dt, v);
  };

  return { group, colliders, interactables, pickables: [group], exit, setStation, update, walkInAt: (x, z) => spa.roomAt(x, z)?.station, equipment };
}

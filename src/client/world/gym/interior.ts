import * as THREE from 'three';
import { GYM_ROOM, GYM_DOOR, GYM_STATIONS, type GymStationDef } from '../../../shared/gym';
import { EXERCISES } from '../../../shared/gym-strength';
import type { CardioView } from '../../../shared/gym-cardio';
import type { StrengthView } from '../../../shared/gym-strength';
import { gymFixtures } from '../../../shared/gym-rooms';
import type { Collider, Interactable } from '../office';
import { mergeByColor, mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { box, glow } from './parts';
import { buildGymRooms } from './rooms'; // the hall, lobby, juice bar, turf, stretch area, decor
import { buildGymSpa, type SpaView } from './spa'; // the spa: walk-in sauna and steam room, jacuzzi, plunge, massage

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
}

const R = GYM_ROOM;

interface Cardio {
  wheel: THREE.Mesh;
  belt?: { tex: THREE.CanvasTexture; };
  dot: THREE.MeshBasicMaterial;
  speed: number;
  running: boolean;
  player: boolean;
}
interface Strength {
  dot: THREE.MeshBasicMaterial;
  plates: THREE.Mesh[];
  weight: number;
  working: boolean;
  player: boolean;
  bag?: THREE.Object3D;
}

export function buildGymInterior(showCeiling = true): GymInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const steel = toon('#6b7883');
  const dark = toon('#20272d');
  const trim = toon('#a3e635');

  // Fork: the hall, its rooms and the spa (rooms.ts, spa.ts); their colliders from shared/gym-rooms.ts.
  const still = new THREE.Group();
  const kit = { group, still, colliders, interactables };
  const rooms = buildGymRooms(kit, showCeiling);
  const spa = buildGymSpa(kit);
  for (const f of gymFixtures()) colliders.push({ minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, bottom: f.bottom ?? 0, top: f.top });

  // ---- Stations -----------------------------------------------------------------------------------
  const cardios = new Map<string, Cardio>();
  const strengths = new Map<string, Strength>();

  const stationInteractable = (def: GymStationDef, obj: THREE.Object3D, w: number, d: number, top = 1.1) => {
    const it: Interactable = { kind: 'gym-station', gymStation: def.id, x: def.x, z: def.z, y: 0, radius: Math.max(w, d) / 2 + 1.2 };
    obj.userData.interact = it;
    interactables.push(it);
    colliders.push({ minX: def.x - w / 2, maxX: def.x + w / 2, minZ: def.z - d / 2, maxZ: def.z + d / 2, bottom: 0, top });
  };
  const indicator = (x: number, y: number, z: number): THREE.MeshBasicMaterial => {
    const m = glow(null, '#4b5a3a');
    group.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), m, x, y, z, false));
    return m;
  };

  const buildCardio = (def: GymStationDef) => {
    const g = new THREE.Group();
    const fwd = new THREE.Vector3(Math.sin(def.rotY), 0, Math.cos(def.rotY)); // the way they face
    // base
    g.add(mesh(box(0.8, 0.2, 1.5), dark, def.x, 0.1, def.z));
    // console/upright at the front (in the facing direction)
    const cx = def.x + fwd.x * 0.6;
    const cz = def.z + fwd.z * 0.6;
    g.add(mesh(box(0.7, 1.1, 0.12).clone(), steel, cx, 1.0, cz));
    const screen = mesh(new THREE.PlaneGeometry(0.5, 0.32), glow(null, '#0f2a24'), cx - fwd.x * 0.08, 1.05, cz - fwd.z * 0.08, false);
    screen.lookAt(cx - fwd.x, 1.05, cz - fwd.z);
    g.add(screen);
    if (def.machine === 'treadmill') g.add(mesh(box(0.7, 0.08, 1.2), toon('#15191d'), def.x, 0.22, def.z, false));
    if (def.machine === 'bike') g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), steel, def.x, 0.5, def.z + 0.1));
    if (def.machine === 'rower') g.add(mesh(box(0.14, 0.06, 1.3), steel, def.x, 0.18, def.z, false));
    // a flywheel that spins with the pace
    const wheelMat = toon('#3a444d');
    const wheel = mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 18), wheelMat, def.x + fwd.x * 0.7, 0.5, def.z + fwd.z * 0.7);
    wheel.rotation.y = def.rotY + Math.PI / 2;
    g.add(wheel);
    group.add(g);
    const dot = indicator(cx, 1.5, cz);
    stationInteractable(def, g,1.0, 1.7);
    // seat/stool for the rider (bike/rower)
    cardios.set(def.id, { wheel, dot, speed: 0, running: false, player: false });
  };

  const buildStrength = (def: GymStationDef) => {
    const ex = EXERCISES[def.machine] ?? EXERCISES.bench;
    const g = new THREE.Group();
    const plates: THREE.Mesh[] = [];
    let bag: THREE.Object3D | undefined;
    const plateMat = toon('#2a2f34');
    const addBar = (y: number) => {
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8).rotateZ(Math.PI / 2), steel, def.x, y, def.z));
      for (const s of [-1, 1]) {
        const p = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16).rotateZ(Math.PI / 2), plateMat, def.x + s * 0.78, y, def.z);
        g.add(p);
        plates.push(p);
      }
    };
    if (def.machine === 'bench') {
      g.add(mesh(box(0.4, 0.5, 1.3), dark, def.x, 0.45, def.z));
      g.add(mesh(box(0.42, 0.1, 1.3), toon('#c1443a'), def.x, 0.72, def.z, false));
      for (const s of [-1, 1]) g.add(mesh(box(0.1, 1.2, 0.1), steel, def.x + s * 0.55, 0.6, def.z - 0.35));
      addBar(1.15);
    } else if (def.machine === 'squat') {
      for (const s of [-1, 1]) g.add(mesh(box(0.12, 2.2, 0.12), steel, def.x + s * 0.7, 1.1, def.z));
      g.add(mesh(box(1.6, 0.12, 0.12), steel, def.x, 2.1, def.z, false));
      addBar(1.5);
    } else if (def.machine === 'deadlift') {
      g.add(mesh(box(1.8, 0.06, 1.4), toon('#3a2f26'), def.x, 0.03, def.z, false));
      addBar(0.28);
    } else if (def.machine === 'dumbbell') {
      g.add(mesh(box(1.8, 0.9, 0.5), dark, def.x, 0.45, def.z));
      for (let i = 0; i < 6; i++) for (const row of [0, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.07 + row * 0.02, 0.07 + row * 0.02, 0.28, 10).rotateZ(Math.PI / 2), plateMat, def.x - 0.7 + i * 0.28, 0.55 + row * 0.28, def.z + 0.1, false));
      }
    } else if (def.machine === 'bag') {
      g.add(mesh(box(1.4, 0.12, 0.6), steel, def.x, 2.4, def.z, false));
      for (const s of [-1, 1]) g.add(mesh(box(0.1, 2.4, 0.1), steel, def.x + s * 0.6, 1.2, def.z));
      bag = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 14), toon('#8a1f1f'), def.x, 1.55, def.z);
      g.add(bag);
    } else {
      // A stack machine: frame, a seat, a weight stack, a pulley.
      g.add(mesh(box(0.5, 2.1, 0.5), steel, def.x, 1.05, def.z - 0.4));
      g.add(mesh(box(0.4, 0.9, 0.4), dark, def.x, 0.45, def.z + 0.2));
      g.add(mesh(box(0.42, 0.1, 0.42), toon('#c1443a'), def.x, 0.72, def.z + 0.2, false));
      g.add(mesh(box(0.34, 1.2, 0.34), toon('#3a444d'), def.x, 0.7, def.z - 0.4));
      g.add(mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), steel, def.x, 1.95, def.z - 0.15));
    }
    group.add(g);
    const dot = indicator(def.x, def.machine === 'bag' ? 2.3 : 1.7, def.z + 0.25);
    stationInteractable(def, g,1.9, 1.5, def.machine === 'squat' || def.machine === 'bag' ? 2.2 : 1.2);
    strengths.set(def.id, { dot, plates, weight: 0, working: false, player: false, bag });
    // seed plate size at comfy-ish default
    setPlates(strengths.get(def.id)!, ex, ex.base);
  };

  function setPlates(s: Strength, ex: (typeof EXERCISES)[string], weight: number) {
    s.weight = weight;
    const r = 0.12 + 0.2 * Math.min(1, weight / ex.max);
    for (const p of s.plates) p.scale.set(1, r / 0.2, r / 0.2);
  }

  for (const def of GYM_STATIONS) {
    if (def.kind === 'cardio') buildCardio(def);
    else if (def.kind === 'strength') buildStrength(def);
  }

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
    if (kind === 'cardio') {
      const c = cardios.get(id);
      const v = state as CardioView;
      if (c) {
        c.speed = v.speed;
        c.running = v.running;
        c.player = !!v.player;
      }
    } else if (kind === 'strength') {
      const s = strengths.get(id);
      const v = state as StrengthView;
      const def = GYM_STATIONS.find((d) => d.id === id);
      if (s && def) {
        setPlates(s, EXERCISES[def.machine] ?? EXERCISES.bench, v.weight);
        s.working = v.working;
        s.player = !!v.player;
      }
    } else if (kind === 'wellness' || kind === 'juicebar') {
      rooms.setStation(id, state);
      spa.setStation(id, state);
    }
  };

  const update = (t: number, dt: number, view?: SpaView) => {
    for (const c of cardios.values()) {
      c.wheel.rotation.x += c.speed * dt * 1.6;
      c.dot.color.set(c.running ? '#a3e635' : c.player ? '#ffd36b' : '#4b5a3a');
    }
    for (const s of strengths.values()) {
      const on = s.working;
      s.dot.color.set(on ? (Math.floor(t * 6) % 2 ? '#ffffff' : '#a3e635') : s.player ? '#ffd36b' : '#4b5a3a');
      if (s.bag) s.bag.rotation.z = on ? Math.sin(t * 12) * 0.12 : Math.sin(t * 1.5) * 0.01;
    }
    const v: SpaView = view ?? { me: null, cam: null, people: [] };
    rooms.update(t, dt, v.people);
    spa.update(t, dt, v);
  };

  return { group, colliders, interactables, pickables: [group], exit, setStation, update, walkInAt: (x, z) => spa.roomAt(x, z)?.station };
}

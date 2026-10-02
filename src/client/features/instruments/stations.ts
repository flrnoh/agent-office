import * as THREE from 'three';
import { INSTRUMENT_SPOTS, type InstrumentSpot } from '../../../shared/venue';
import type { Collider, Interactable } from '../../world/types';
import { combo } from './gear/amps';
import { KitLook, drumKit, type FINISHES } from './gear/kit';
import { keyboard, micStand, type KeyboardModel } from './gear/keys';
import { guitarStand, stringed, type StringFinish } from './gear/strings';
import { DRUM_RISER } from './stage';

// ---- An instrument at every spot (flrnoh fork, see FORK.md "The instruments") ---------------------------
// Each spot of INSTRUMENT_SPOTS gets its instrument, laid out round where its player stands (the
// origin, facing +z, turned to the spot's rotY): the kit with its throne on the spot, a guitar or a
// bass on its stand in front of you with a combo behind you (on the stage the backline's stacks
// stand behind instead, see stage.ts), a keyboard on its X stand, a mic stand. Each has what E
// aims at (its interactable) and what you bump into, clear of the spot itself.

export interface Station {
  spot: InstrumentSpot;
  group: THREE.Group;
  interactable: Interactable;
  colliders: Collider[];
  /** The guitar or bass on its stand, or the mic in its clip: gone while someone plays it. */
  held?: THREE.Object3D;
  /** The kit's moving parts. */
  kit?: KitLook;
  keys?: KeyboardModel;
  /** How high the player stands at it (the stage's drum riser lifts the drummer). */
  floorY: number;
}

/** Which finish each spot's instrument has, by spot id (rooms each their own look). */
const KIT_FINISH: Record<string, keyof typeof FINISHES> = { 'stage-drums': 'stage', 'probe1-drums': 'red', 'probe2-drums': 'blue', 'probe3-drums': 'pearl', 'studio-drums': 'wood' };
const GUITAR_FINISH: Record<string, StringFinish> = { 'stage-guitar1': 'sunburst', 'stage-guitar2': 'goldtop', 'probe1-guitar': 'red', 'probe2-guitar': 'white', 'probe3-guitar': 'black', 'studio-guitar': 'natural' };
const BASS_FINISH: Record<string, StringFinish> = { 'stage-bass': 'black', 'probe1-bass': 'sunburst', 'probe2-bass': 'blue', 'probe3-bass': 'white' };
const KEYS_COLOR: Record<string, string> = { 'stage-keys': '#c8202c', 'probe1-keys': '#1f1f24', 'probe2-keys': '#2a2d36', 'probe3-keys': '#c8202c' };

/** The finish of the guitar or bass at a spot (to strap the same one on whoever plays it). */
export const stringFinishOf = (id: string): StringFinish | undefined => GUITAR_FINISH[id] ?? BASS_FINISH[id];

/** Where on a guitar stand the guitar's middle is, and the stand's yoke. */
const ON_STAND = { y: 0.36, tilt: -0.16, yoke: 0.86 };

/** How high you stand at `spot` (the stage's drummer sits up on the drum riser). */
export const floorOf = (spot: InstrumentSpot) => spot.y + (spot.id === 'stage-drums' ? DRUM_RISER.h : 0);

/** A box in the spot's frame (x across, z ahead) as the axis-aligned collider round it, `h` tall over its floor. */
function box(spot: InstrumentSpot, floorY: number, x0: number, x1: number, z0: number, z1: number, h: number): Collider {
  const c = Math.cos(spot.rotY);
  const s = Math.sin(spot.rotY);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [x0, x1])
    for (const z of [z0, z1]) {
      // The frame turned by rotY: local +z is (sin, cos), local +x is (cos, -sin).
      xs.push(spot.x + x * c + z * s);
      zs.push(spot.z - x * s + z * c);
    }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), top: floorY + h };
}

export function buildStation(spot: InstrumentSpot): Station {
  const group = new THREE.Group();
  group.name = `instrument:${spot.id}`;
  const floorY = floorOf(spot);
  group.position.set(spot.x, floorY, spot.z);
  group.rotation.y = spot.rotY;
  const onStage = spot.room === 'hall';
  const colliders: Collider[] = [];
  let held: THREE.Object3D | undefined;
  let kit: KitLook | undefined;
  let keys: KeyboardModel | undefined;
  let aim = new THREE.Vector3(0, 0, 0.5);
  let radius = 1.3;
  if (spot.kind === 'drums') {
    const k = drumKit(KIT_FINISH[spot.id] ?? 'red');
    group.add(k);
    kit = new KitLook(k);
    colliders.push(box(spot, floorY, -0.78, 0.78, 0.2, 1.0, 1.0));
    aim = new THREE.Vector3(0, 0, 0.55);
    radius = 1.7;
  } else if (spot.kind === 'guitar' || spot.kind === 'bass') {
    const bass = spot.kind === 'bass';
    const st = guitarStand(ON_STAND.yoke + (bass ? 0.1 : 0));
    // On your right, a step ahead, turned toward you.
    st.position.set(-0.62, 0, 0.42);
    st.rotation.y = Math.PI - 0.5;
    group.add(st);
    const inst = stringed(bass, (bass ? BASS_FINISH : GUITAR_FINISH)[spot.id] ?? 'black');
    inst.position.set(-0.62 - 0.01, ON_STAND.y + (bass ? 0.04 : 0), 0.42 - 0.02);
    inst.rotation.set(0, Math.PI - 0.5, 0); // its front toward you…
    inst.rotateX(ON_STAND.tilt); // …leaning back into the yoke
    inst.scale.setScalar(bass ? 0.92 : 1);
    group.add(inst);
    held = inst;
    colliders.push(box(spot, floorY, -0.85, -0.42, 0.25, 0.62, 1.0));
    if (!onStage) {
      // In a rehearsal room the combo stands behind you, toward the room.
      const amp = combo(bass);
      amp.position.set(-0.15, 0, -0.85);
      amp.rotation.y = 0.2;
      group.add(amp);
      colliders.push(box(spot, floorY, -0.55, 0.25, bass ? -1.1 : -1.0, -0.62, bass ? 0.66 : 0.52));
    }
    aim = new THREE.Vector3(-0.62, 0, 0.42);
    radius = 1.3;
  } else if (spot.kind === 'keys') {
    keys = keyboard(KEYS_COLOR[spot.id] ?? '#1f1f24', 0.92, true);
    keys.group.position.set(0, 0, 0.42);
    group.add(keys.group);
    colliders.push(box(spot, floorY, -0.55, 0.55, 0.25, 0.62, 0.95));
    aim = new THREE.Vector3(0, 0, 0.42);
    radius = 1.4;
  } else {
    const m = micStand();
    group.add(m.group);
    held = m.mic;
    aim = new THREE.Vector3(0, 0, 0.4);
    radius = 1.1;
  }
  // What E aims at: the whole instrument (the crosshair finds its meshes), and its middle for the hint.
  const at = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spot.rotY);
  const interactable: Interactable = { kind: 'instrument', x: spot.x + at.x, z: spot.z + at.z, y: floorY, radius };
  group.userData.interact = interactable;
  return { spot, group, interactable, colliders, held, kit, keys, floorY };
}

/** Every spot's station: the stage's and the rehearsal rooms'. */
export const buildStations = (spots: readonly InstrumentSpot[] = INSTRUMENT_SPOTS): Station[] => spots.map(buildStation);

import * as THREE from 'three';
import { GYM_ROOM, GYM_DOOR, GYM_STATIONS, JUICE_BAR, type GymStationDef } from '../../../shared/gym';
import { EXERCISES } from '../../../shared/gym-strength';
import type { CardioView } from '../../../shared/gym-cardio';
import type { StrengthView } from '../../../shared/gym-strength';
import type { WellnessView } from '../../../shared/gym-wellness';
import type { Collider, Interactable } from '../office';
import { mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { box, glow, mirrorTexture, neonSign, rubberFloor } from './parts';

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
  update(t: number, dt: number): void;
}

const R = GYM_ROOM;
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;
const T = 0.3;

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
interface Wellness {
  machine: string;
  light: THREE.MeshBasicMaterial;
  steam?: THREE.Mesh;
  water?: THREE.Mesh;
  puffAt: number;
  puffShown: number;
  occupied: number;
  seats: number;
}

export function buildGymInterior(showCeiling = true): GymInterior {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const wall = toon('#2c3843');
  const trim = toon('#a3e635');
  const steel = toon('#6b7883');
  const dark = toon('#20272d');
  const rubber = toon('#22282d');
  const H = R.height;

  // The rubber floor.
  const floorTex = rubberFloor();
  floorTex.repeat.set(W, D);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });

  // Walls and ceiling.
  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) {
    parts.add(mesh(box(x1 - x0, H, z1 - z0), wall, (x0 + x1) / 2, H / 2, (z0 + z1) / 2, false));
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, bottom: 0, top: H });
  }
  if (showCeiling) {
    const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T), toon('#151b20'), CX, H, CZ, false);
    ceiling.rotation.x = Math.PI / 2;
    group.add(ceiling);
  }
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });
  // Lime rail round the walls.
  for (const z of [R.minZ + 0.05, R.maxZ - 0.05]) parts.add(mesh(box(W, 0.12, 0.06), trim, CX, 1.4, z, false));
  for (const x of [R.minX + 0.05, R.maxX - 0.05]) parts.add(mesh(box(0.06, 0.12, D), trim, x, 1.4, CZ, false));

  // Ceiling strip lights.
  const strip = glow(null, '#f2ffe0');
  for (let z = R.minZ + 2.5; z < R.maxZ; z += 3) group.add(mesh(box(W - 2, 0.06, 0.3), strip, CX, H - 0.15, z, false));

  // A mirrored wall along the west, north of the juice bar.
  const mirror = new THREE.MeshToonMaterial({ map: mirrorTexture() });
  const mz0 = R.minZ + 0.4;
  const mz1 = JUICE_BAR.z - JUICE_BAR.length / 2 - 0.4;
  if (mz1 > mz0 + 1) {
    const mm = mesh(new THREE.PlaneGeometry(mz1 - mz0, 2.6), mirror, R.minX + 0.02, 1.5, (mz0 + mz1) / 2, false);
    mm.rotation.y = Math.PI / 2;
    group.add(mm);
  }
  // And a mirrored strip on the south wall behind the strength floor.
  const sm = mesh(new THREE.PlaneGeometry(12, 2.6), mirror, 14, 1.5, R.maxZ - 0.02, false);
  sm.rotation.y = Math.PI;
  group.add(sm);

  // Hung neon signs over the zones (readable from both sides).
  const hangSign = (text: string, color: string, x: number, z: number, rotY: number, w = 3.4) => {
    const matGlow = glow(neonSign(text, color, 768, 160, '#0f1a12'));
    for (const s of [0, Math.PI]) {
      const p = mesh(new THREE.PlaneGeometry(w, w / 4.8), matGlow, x, H - 0.9, z, false);
      p.rotation.y = rotY + s;
      p.position.x += Math.sin(rotY + s) * 0.02;
      p.position.z += Math.cos(rotY + s) * 0.02;
      group.add(p);
    }
  };
  hangSign('CARDIO', '#35e0d0', CX, R.minZ + 2.2, 0, 3.6);
  hangSign('STRENGTH', '#a3e635', 14, 46, 0, 4);
  hangSign('WELLNESS SPA', '#ffd36b', 27.5, 43.2, 0, 4.2);

  // ---- Stations -----------------------------------------------------------------------------------
  const cardios = new Map<string, Cardio>();
  const strengths = new Map<string, Strength>();
  const wellnesses = new Map<string, Wellness>();

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

  const buildWellness = (def: GymStationDef) => {
    const g = new THREE.Group();
    let steam: THREE.Mesh | undefined;
    let water: THREE.Mesh | undefined;
    let lightColor = '#ffcaa0';
    if (def.machine === 'sauna' || def.machine === 'steam') {
      const wood = def.machine === 'sauna' ? toon('#7a5330') : toon('#4a6a72');
      g.add(mesh(box(2.6, 2.4, 2.4), wood, def.x, 1.2, def.z));
      // glowing window
      const win = mesh(new THREE.PlaneGeometry(0.8, 0.8), glow(null, def.machine === 'sauna' ? '#ff9d5c' : '#bfe9ff'), def.x - 1.31, 1.4, def.z, false);
      win.rotation.y = -Math.PI / 2;
      g.add(win);
      steam = mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0 }), def.x - 1.0, 2.2, def.z, false);
      steam.renderOrder = 2;
      g.add(steam);
      lightColor = def.machine === 'sauna' ? '#ff9d5c' : '#bfe9ff';
      stationInteractable(def, g,2.6, 2.4, 2.4);
    } else if (def.machine === 'hottub' || def.machine === 'coldplunge') {
      const r = def.machine === 'hottub' ? 1.2 : 0.7;
      g.add(mesh(new THREE.CylinderGeometry(r, r, 0.8, def.machine === 'hottub' ? 24 : 4), toon('#5b6a72'), def.x, 0.4, def.z));
      water = mesh(new THREE.CircleGeometry(r - 0.08, 24), new THREE.MeshBasicMaterial({ color: def.machine === 'hottub' ? '#39a0c4' : '#7fd4ff', transparent: true, opacity: 0.85 }), def.x, 0.78, def.z, false);
      water.rotation.x = -Math.PI / 2;
      g.add(water);
      lightColor = def.machine === 'hottub' ? '#39a0c4' : '#7fd4ff';
      stationInteractable(def, g,r * 2, r * 2, 0.9);
    } else if (def.machine === 'massage') {
      g.add(mesh(box(0.8, 0.5, 2.0), dark, def.x, 0.35, def.z));
      const pad = mesh(box(0.82, 0.14, 2.0), toon('#6a7a86'), def.x, 0.62, def.z, false);
      pad.rotation.x = -0.12;
      g.add(pad);
      lightColor = '#c9a0ff';
      stationInteractable(def, g,1.0, 2.1, 0.8);
    } else {
      // yoga / stretch studio: mats + a small stand
      for (let i = 0; i < 3; i++) {
        const m = mesh(box(0.7, 0.04, 1.7), toon(['#7c5cd6', '#3fa0c4', '#e08a3f'][i]), def.x, 0.03, def.z - 1.7 + i * 1.7, false);
        g.add(m);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 10), toon('#3a444d'), def.x - 1.0, 0.25, def.z));
      lightColor = '#a3e635';
      stationInteractable(def, g,1.2, 5.3, 0.3);
    }
    group.add(g);
    const light = glow(null, lightColor);
    group.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), light, def.x, 0.2, def.z, false));
    wellnesses.set(def.id, { machine: def.machine, light, steam, water, puffAt: 0, puffShown: 0, occupied: 0, seats: def.seats });
  };

  for (const def of GYM_STATIONS) {
    if (def.kind === 'cardio') buildCardio(def);
    else if (def.kind === 'strength') buildStrength(def);
    else if (def.kind === 'wellness') buildWellness(def);
  }

  // ---- The wellness spa's glass partition (SE corner), with a doorway on its north edge ----------
  const spaX = 22;
  const spaZ = 43.6;
  const spaGlass = new THREE.MeshToonMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.28 });
  // north edge z=spaZ from x=spaX..maxX with a gap at x 23.4..25.4
  for (const [x0, x1] of [[spaX + 0.4, 23.4], [25.4, R.maxX]]) {
    if (x1 <= x0) continue;
    group.add(mesh(box(x1 - x0, 2.0, 0.08), spaGlass, (x0 + x1) / 2, 1.0, spaZ, false));
    colliders.push({ minX: x0, maxX: x1, minZ: spaZ - 0.1, maxZ: spaZ + 0.1, bottom: 0, top: 2.0 });
  }
  // west edge x=spaX from z=spaZ..maxZ
  group.add(mesh(box(0.08, 2.0, R.maxZ - spaZ), spaGlass, spaX, 1.0, (spaZ + R.maxZ) / 2, false));
  colliders.push({ minX: spaX - 0.1, maxX: spaX + 0.1, minZ: spaZ, maxZ: R.maxZ, bottom: 0, top: 2.0 });
  const spaSign = textPlane('🧖 WELLNESS', { bg: '#0f1a12', color: '#ffd36b', size: 44, border: '#ffd36b' });
  spaSign.position.set(24.4, 2.3, spaZ);
  group.add(spaSign);

  // ---- The juice bar, along the west wall --------------------------------------------------------
  const jb = JUICE_BAR;
  const j0 = jb.z - jb.length / 2;
  const j1 = jb.z + jb.length / 2;
  parts.add(mesh(box(0.9, 1.1, jb.length), toon('#3a2f26'), jb.x, 0.55, jb.z));
  parts.add(mesh(box(1.05, 0.08, jb.length + 0.1), trim, jb.x, 1.12, jb.z, false));
  // a blender and bottles on the counter
  const blender = mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.3, 10), toon('#7fd4ff', { opacity: 0.9, transparent: true }), jb.x + 0.2, 1.32, jb.z - 1.2);
  group.add(blender);
  for (let i = 0; i < 6; i++) parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), toon(['#a3e635', '#ff7ab0', '#ffd36b'][i % 3]), jb.x + 0.25, 1.28, j0 + 0.8 + i * 0.9, false));
  // a big glowing menu / leaderboard screen on the wall
  const screen = mesh(new THREE.PlaneGeometry(2.4, 1.4), glow(neonSign('JUICE BAR', '#a3e635', 640, 320, '#0f1a12')), R.minX + 0.05, 2.3, jb.z, false);
  screen.rotation.y = Math.PI / 2;
  group.add(screen);
  const jbIt: Interactable = { kind: 'gym-station', gymStation: jb.id, x: jb.x + 1.2, z: jb.z, y: 0, radius: 1.8 };
  interactables.push(jbIt);
  screen.userData.interact = jbIt;
  colliders.push({ minX: R.minX, maxX: jb.x + 0.5, minZ: j0, maxZ: j1, bottom: 0, top: 1.15 });
  for (let i = 0; i < jb.seats; i++) {
    const sx = jb.x + 1.0;
    const sz = jb.z - 0.9 + i * 0.9;
    parts.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12), toon('#a3e635'), sx, 0.72, sz));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.66, 8), steel, sx, 0.36, sz));
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
    } else if (kind === 'wellness') {
      const w = wellnesses.get(id);
      const v = state as WellnessView;
      if (w) {
        w.occupied = v.occupants.length;
        if (v.puffAt) w.puffAt = v.puffAt;
      }
    }
  };

  const update = (t: number, dt: number) => {
    for (const c of cardios.values()) {
      c.wheel.rotation.x += c.speed * dt * 1.6;
      c.dot.color.set(c.running ? '#a3e635' : c.player ? '#ffd36b' : '#4b5a3a');
    }
    for (const s of strengths.values()) {
      const on = s.working;
      s.dot.color.set(on ? (Math.floor(t * 6) % 2 ? '#ffffff' : '#a3e635') : s.player ? '#ffd36b' : '#4b5a3a');
      if (s.bag) s.bag.rotation.z = on ? Math.sin(t * 12) * 0.12 : Math.sin(t * 1.5) * 0.01;
    }
    for (const w of wellnesses.values()) {
      w.light.color.set(w.occupied ? '#a3e635' : '#4b5a3a');
      if (w.water) w.water.position.y = (w.machine === 'hottub' ? 0.78 : 0.78) + Math.sin(t * 3) * 0.01;
      if (w.steam) {
        if (w.puffAt !== w.puffShown) {
          w.puffShown = w.puffAt;
          w.steam.userData.until = t + 1.4;
          w.steam.scale.setScalar(0.2);
        }
        const until = (w.steam.userData.until as number) ?? 0;
        const m = w.steam.material as THREE.MeshBasicMaterial;
        if (t < until) {
          const k = 1 - (until - t) / 1.4;
          w.steam.scale.setScalar(0.2 + k * 1.4);
          w.steam.position.y = 2.2 + k * 0.8;
          m.opacity = 0.5 * (1 - k);
        } else m.opacity = 0;
      }
    }
  };

  return { group, colliders, interactables, pickables: [group], exit, setStation, update };
}

import * as THREE from 'three';
import { BASEMENT_FLOOR, BSHOWERS, GRADIER, KNEIPP, KNEIPP_ROOM, REST, REST_BEDS, REST_DOOR, REST_LOUNGERS, SALT, SALT_DOOR, SALT_LOUNGERS, SALT_ROOM, SLAB, type ShowerKind } from '../../../../shared/gym-basement';
import type { WellnessView } from '../../../../shared/gym-wellness';
import type { Interactable } from '../../types';
import { mesh, toon } from '../../toon';
import { blk, cyl, picture, seatable, tex, type GymParts } from '../kit';
import { glow } from '../parts';
import { Cloud } from '../particles';
import { tiles } from '../textures';
import { floorPatch, panel, wallSign } from './shell';
import { aquarium, blackthorn, fallingWater, nightSky, ripples, saltBricks, saltFloor, sign, wrap } from './textures';

/*
 * The basement's rooms off the foyer (flrnoh fork, see shared/gym-basement.ts): the quiet room
 * (Ruheraum) with loungers and water beds under a night sky, an aquarium along its west wall; the
 * salt grotto with its glowing salt-brick walls and the graduation wall trickling brine (E at its
 * pump: a burst of salt mist for everyone in there); the Kneipp room with its cold tread basin and
 * three adventure showers that run while someone stands under them (tropical rain, a thunderstorm,
 * ice mist).
 */

const B = BASEMENT_FLOOR;
const H = -SLAB - B; // a room's height under the gym's floor

export interface BasementRooms {
  setStation(id: string, state: unknown): void;
  /** Every frame: who's standing where (you and everyone else, with how far down), so the showers run. */
  update(t: number, dt: number, people: readonly { x: number; y: number; z: number }[]): ShowerKind[];
}

/** A lounger along x, its head at the east end when `faceWest` (you look west), with a cushion and a folded towel. */
function lounger(p: GymParts, x: number, z: number, faceWest: boolean, frame: string, cushion: string, width = 0.7, seatId?: string) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.26, width), toon(frame), x, B + 0.13, z, false));
  g.add(mesh(new THREE.BoxGeometry(1.35, 0.12, width - 0.06), toon(cushion), x + (faceWest ? -0.25 : 0.25), B + 0.33, z, false));
  const back = mesh(new THREE.BoxGeometry(0.72, 0.1, width - 0.06), toon(cushion), x + (faceWest ? 0.62 : -0.62), B + 0.55, z, false);
  back.rotation.z = faceWest ? 0.75 : -0.75;
  g.add(back);
  p.still.add(g);
  if (seatId) seatable(p, g, seatId, 1.2);
  return g;
}

export function buildRooms(p: GymParts): BasementRooms {
  // ---- The quiet room: dark blue fabric walls, a starry ceiling, an aquarium, soft lamps ----
  floorPatch(p, REST, tiles('#2a2f44', '#1d2133', 2, 0.05, 19), 1.2);
  const fabric = tiles('#1d2a4a', '#18223d', 1, 0.04, 23);
  const d0 = REST_DOOR.z - REST_DOOR.width / 2;
  const d1 = REST_DOOR.z + REST_DOOR.width / 2;
  panel(p, fabric, d0 - REST.minZ, H, REST.maxX - 0.002, B + H / 2, (REST.minZ + d0) / 2, -Math.PI / 2, 6, 2);
  panel(p, fabric, REST.maxZ - d1, H, REST.maxX - 0.002, B + H / 2, (d1 + REST.maxZ) / 2, -Math.PI / 2, 3, 2);
  panel(p, fabric, REST.maxX - REST.minX, H, (REST.minX + REST.maxX) / 2, B + H / 2, REST.minZ + 0.002, 0, 8, 2);
  panel(p, fabric, REST.maxX - REST.minX, H, (REST.minX + REST.maxX) / 2, B + H / 2, REST.maxZ - 0.002, Math.PI, 8, 2);
  panel(p, fabric, REST.maxZ - REST.minZ, H, REST.minX + 0.002, B + H / 2, (REST.minZ + REST.maxZ) / 2, Math.PI / 2, 8, 2);
  const sky = mesh(new THREE.PlaneGeometry(REST.maxX - REST.minX, REST.maxZ - REST.minZ), glow(nightSky()), (REST.minX + REST.maxX) / 2, -SLAB - 0.01, (REST.minZ + REST.maxZ) / 2, false);
  sky.rotation.x = Math.PI / 2;
  p.group.add(sky);
  // The aquarium along the west wall: a dark frame round glowing water with fish swimming by.
  const fishTex = aquarium();
  blk(p, 0.6, 2.2, 10.0, '#11151f', REST.minX + 0.3, B + 1.1, 47.0);
  const tank = picture(p, 9.6, 1.6, glow(fishTex), REST.minX + 0.61, B + 1.15, 47.0, Math.PI / 2);
  tank.userData.noOutline = true;
  wallSign(p, '🤫 RUHERAUM', 'Bitte Ruhe · quiet please', REST.maxX - 0.02, B + 2.6, 48.3, -Math.PI / 2, 1.5, '#0d1530', '#c9d4ff');
  REST_LOUNGERS.forEach((l, i) => lounger(p, l.x, l.z, true, '#3a3f55', '#8f9cc8', 0.7, `gym-rest-${i + 1}`));
  // The water beds: wide, glossy blue mattresses on a dark plinth.
  REST_BEDS.forEach((l, i) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.22, 1.7), toon('#20253a'), l.x, B + 0.11, l.z, false));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.18, 1.6), toon('#4a7fd0', { emissive: '#0d2140' }), l.x, B + 0.31, l.z, false));
    for (const dz of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.4, 0.12, 0.6), toon('#dfe6ff'), l.x + 0.7, B + 0.46, l.z + dz, false));
    p.still.add(g);
    seatable(p, g, `gym-waterbed-${i + 1}`, 1.4);
  });
  // Soft lamps: warm glowing globes on the floor between the loungers.
  const globe = glow(null, '#ffd9a0');
  for (const [x, z] of [
    [13.15, 44.0],
    [16.45, 44.0],
    [13.15, 49.1],
    [16.45, 49.1],
    [19.8, 54.6],
  ]) {
    p.still.add(mesh(new THREE.SphereGeometry(0.16, 14, 10), globe, x, B + 0.16, z, false));
  }

  // ---- The salt grotto: walls of glowing salt bricks, a salt floor, the graduation wall ----
  floorPatch(p, SALT, saltFloor(), 1.0);
  const bricks = saltBricks();
  const glowBrick = (w: number, x: number, z: number, rotY: number) => {
    const t = bricks.clone();
    wrap(t, w / 1.6, H / 1.6);
    t.needsUpdate = true;
    picture(p, w, H, glow(t, '#ffd2b0'), x, B + H / 2, z, rotY).userData.noOutline = true;
  };
  glowBrick(SALT.maxX - SALT.minX, (SALT.minX + SALT.maxX) / 2, SALT.minZ + 0.002, 0);
  glowBrick(SALT.maxX - SALT.minX, (SALT.minX + SALT.maxX) / 2, SALT.maxZ - 0.002, Math.PI);
  const s0 = SALT_DOOR.z - SALT_DOOR.width / 2;
  const s1 = SALT_DOOR.z + SALT_DOOR.width / 2;
  glowBrick(s0 - SALT.minZ, SALT.minX + 0.002, (SALT.minZ + s0) / 2, Math.PI / 2);
  glowBrick(SALT.maxZ - s1, SALT.minX + 0.002, (s1 + SALT.maxZ) / 2, Math.PI / 2);
  glowBrick(SALT.maxZ - SALT.minZ, SALT.maxX - 0.002, (SALT.minZ + SALT.maxZ) / 2, -Math.PI / 2);
  const amber = new THREE.PointLight('#ff9a4a', 4, 9, 1.5);
  amber.position.set(32.6, B + 2.6, 43.9);
  p.group.add(amber);
  // The graduation wall: a timber frame filled with blackthorn, a trough at its foot, brine running down.
  const G = GRADIER;
  const gw = G.maxZ - G.minZ;
  blk(p, G.maxX - G.minX, 0.3, gw, '#6b4f36', (G.minX + G.maxX) / 2, B + 0.15, (G.minZ + G.maxZ) / 2);
  const thorn = blackthorn();
  wrap(thorn, gw / 1.2, (G.top - 0.3) / 1.2);
  p.group.add(mesh(new THREE.BoxGeometry(G.maxX - G.minX - 0.1, G.top - 0.3, gw - 0.2), tex(thorn), (G.minX + G.maxX) / 2, B + 0.3 + (G.top - 0.3) / 2, (G.minZ + G.maxZ) / 2, false));
  for (const z of [G.minZ + 0.05, G.maxZ - 0.05]) blk(p, G.maxX - G.minX, G.top, 0.1, '#5a3f2a', (G.minX + G.maxX) / 2, B + G.top / 2, z);
  blk(p, G.maxX - G.minX, 0.1, gw, '#5a3f2a', (G.minX + G.maxX) / 2, B + G.top, (G.minZ + G.maxZ) / 2);
  const brine = ripples('#9fd0e0', '#e9fbff', 37);
  brine.repeat.set(1, 3);
  const drip = mesh(new THREE.PlaneGeometry(gw - 0.3, G.top - 0.4), new THREE.MeshBasicMaterial({ map: brine, transparent: true, opacity: 0.35, depthWrite: false }), G.minX - 0.01, B + 0.3 + (G.top - 0.4) / 2, (G.minZ + G.maxZ) / 2, false);
  drip.rotation.y = -Math.PI / 2;
  drip.userData.noOutline = true;
  p.group.add(drip);
  // The brine pump in front of it: E is a burst of salt mist (an Aufguss, for everyone in here).
  const pump = new THREE.Group();
  pump.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 12), toon('#8a6a4a'), 34.97, B + 0.45, 44.1, false));
  pump.add(mesh(new THREE.SphereGeometry(0.16, 12, 8), toon('#d8f3ff', { emissive: '#3a7f99' }), 34.97, B + 1.02, 44.1, false));
  p.group.add(pump);
  const pour = SALT_ROOM.pour!;
  const pumpIt: Interactable = { kind: 'gymstation', gymStation: 'salt', gymAct: 'ladle', x: pour.x, z: pour.z, y: B, radius: 1.3 };
  p.interactables.push(pumpIt);
  pump.traverse((o) => (o.userData.interact = pumpIt));
  SALT_LOUNGERS.forEach((l, i) => lounger(p, l.x, l.z, false, '#b48a5a', '#f2e6d8', 0.7, `gym-salt-${i + 1}`));
  const mist = new Cloud(220, '#fff4ec');
  mist.lift = 0.12;
  mist.drag = 0.9;
  mist.bounds = new THREE.Box3(new THREE.Vector3(SALT.minX, B, SALT.minZ), new THREE.Vector3(SALT.maxX, -SLAB, SALT.maxZ));
  p.group.add(mist.points);
  let puffAt = 0;
  let puffShown = 0;

  // ---- The Kneipp room: white tiles, the cold trough, three adventure showers ----
  const white = tiles('#eef4f5', '#c7d3d6', 6, 0.03, 29);
  floorPatch(p, KNEIPP_ROOM, white, 1.5);
  const K = KNEIPP_ROOM;
  panel(p, white, K.maxX - K.minX, H, (K.minX + K.maxX) / 2, B + H / 2, K.minZ + 0.002, 0, 4, 2);
  panel(p, white, K.maxX - K.minX, H, (K.minX + K.maxX) / 2, B + H / 2, K.maxZ - 0.002, Math.PI, 4, 2);
  panel(p, white, K.maxZ - K.minZ, H, K.maxX - 0.002, B + H / 2, (K.minZ + K.maxZ) / 2, -Math.PI / 2, 4, 2);
  // The trough: one step down, river pebbles under clear cold water, a rail along it.
  const N = KNEIPP;
  const pebbles = tiles('#9aa7a9', '#6f7b7d', 10, 0.25, 33);
  floorPatch(p, N, pebbles, 0.8, 0.003, N.floor);
  const rim = toon('#d7dfe1');
  blk(p, N.maxX - N.minX + 0.2, 0.06, 0.1, rim, (N.minX + N.maxX) / 2, B + 0.03, N.minZ - 0.05);
  blk(p, N.maxX - N.minX + 0.2, 0.06, 0.1, rim, (N.minX + N.maxX) / 2, B + 0.03, N.maxZ + 0.05);
  for (const z of [N.minZ, N.maxZ]) blk(p, N.maxX - N.minX, B - N.floor, 0.02, '#b9c6c9', (N.minX + N.maxX) / 2, (B + N.floor) / 2, z);
  for (const x of [N.minX, N.maxX]) blk(p, 0.02, B - N.floor, N.maxZ - N.minZ, '#b9c6c9', x, (B + N.floor) / 2, (N.minZ + N.maxZ) / 2);
  const coldTex = ripples('#7cc6dc', '#e6fbff', 43);
  const cold = mesh(new THREE.PlaneGeometry(N.maxX - N.minX, N.maxZ - N.minZ), new THREE.MeshBasicMaterial({ map: coldTex, color: '#cfefff', transparent: true, opacity: 0.55, depthWrite: false }), (N.minX + N.maxX) / 2, N.water, (N.minZ + N.maxZ) / 2, false);
  cold.rotation.x = -Math.PI / 2;
  cold.userData.noOutline = true;
  p.group.add(cold);
  const chrome = toon('#c3ccd1');
  const railLen = N.maxX - N.minX - 1.0;
  const handrail = mesh(new THREE.CylinderGeometry(0.025, 0.025, railLen, 8), chrome, (N.minX + N.maxX) / 2, B + 0.92, N.maxZ + 0.03, false);
  handrail.rotation.z = Math.PI / 2;
  p.still.add(handrail);
  for (const x of [N.minX + 0.55, (N.minX + N.maxX) / 2, N.maxX - 0.55]) cyl(p, 0.02, 0.02, 0.92, chrome, x, B + 0.46, N.maxZ + 0.03, 6);
  wallSign(p, '🦶 STORCHENGANG', 'Kneipp: im Storchenschritt durchs kalte Wasser', (N.minX + N.maxX) / 2, B + 2.3, K.minZ + 0.02, 0, 2.2, '#0f3b48', '#c8f4ff');
  // The showers: a rain head on an arm from the wall each, a coloured ring that lights while it runs, glass between them.
  const ringCol: Record<ShowerKind, string> = { tropic: '#5cf08a', storm: '#b48cff', ice: '#7fe7ff' };
  const rings = new Map<ShowerKind, THREE.MeshBasicMaterial>();
  // While one runs: a sheet of water falling from its head (mist for the ice shower), scrolled down as it falls.
  const curtains = new Map<ShowerKind, THREE.Mesh>();
  const fallTex = fallingWater();
  fallTex.repeat.set(2, 1);
  const clouds = new Map<ShowerKind, Cloud>();
  const flash = new THREE.PointLight('#d6c8ff', 0, 6, 1.6);
  flash.position.set(35.0, B + 2.4, 53.15);
  p.group.add(flash);
  for (const sh of BSHOWERS) {
    blk(p, 0.5, 0.04, 0.04, chrome, sh.x + 0.35, B + 2.45, sh.z);
    p.still.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20), chrome, sh.x, B + 2.42, sh.z, false));
    const ring = new THREE.MeshBasicMaterial({ color: '#2a3438', toneMapped: false });
    ring.userData.outlineParameters = { visible: false };
    const rm = mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 24), ring, sh.x, B + 2.4, sh.z, false);
    rm.rotation.x = Math.PI / 2;
    p.group.add(rm);
    rings.set(sh.kind, ring);
    const veil = mesh(new THREE.CylinderGeometry(0.26, sh.kind === 'ice' ? 0.55 : 0.34, 2.36, 18, 1, true), new THREE.MeshBasicMaterial({ map: fallTex, color: sh.kind === 'ice' ? '#ffffff' : sh.kind === 'storm' ? '#d9ccff' : '#d6fff0', transparent: true, opacity: sh.kind === 'ice' ? 0.35 : 0.55, depthWrite: false, side: THREE.DoubleSide }), sh.x, B + 1.2, sh.z, false);
    veil.visible = false;
    veil.userData.noOutline = true;
    veil.raycast = () => {};
    p.group.add(veil);
    curtains.set(sh.kind, veil);
    const c = new Cloud(sh.kind === 'ice' ? 160 : 260, sh.kind === 'ice' ? '#f4fbff' : '#cfeeff');
    if (sh.kind === 'ice') {
      c.lift = -0.25;
      c.drag = 1.2;
    } else {
      c.lift = -9;
      c.drag = 0.05;
    }
    p.group.add(c.points);
    clouds.set(sh.kind, c);
    picture(p, 0.9, 0.28, glow(sign(sh.name, '', '#0d1e24', ringCol[sh.kind], 256, 80)), K.maxX - 0.02, B + 1.9, sh.z, -Math.PI / 2);
  }
  for (const z of [52.4, 53.9]) {
    const glass = mesh(new THREE.BoxGeometry(1.6, 2.1, 0.03), toon('#bfe6f2', { transparent: true, opacity: 0.35 }), 35.2, B + 1.05, z, false);
    glass.userData.noOutline = true;
    p.group.add(glass);
  }
  // A drain in front of the showers.
  blk(p, 1.4, 0.01, 4.2, '#9fb0b4', 35.1, B + 0.006, 53.15);

  const running = new Set<ShowerKind>();
  let thunderT = 3;
  const v = new THREE.Vector3();

  return {
    setStation(id, state) {
      if (id !== 'salt') return;
      const s = state as WellnessView | null;
      if (s?.puffAt) puffAt = s.puffAt;
    },
    update(t, dt, people) {
      fishTex.offset.x = (t * 0.012) % 1;
      brine.offset.y = -(t * 0.25) % 1;
      coldTex.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
      fallTex.offset.y = (t * 1.6) % 1;
      // A burst of salt mist when someone works the pump (a few seconds of it), and a little all the time.
      if (puffAt && puffAt !== puffShown && Date.now() - puffAt < 8000) {
        puffShown = puffAt;
        mist.emit(120, { at: v.set(34.6, B + 1.0, 44.1), spread: { x: 0.4, y: 0.3, z: 1.4 }, vel: { x: -0.6, y: 0.2, z: 0 }, jitter: 0.35, life: 7, size0: 0.4, size1: 1.6, alpha: 0.35 });
      }
      if (Math.random() < dt * 2) mist.emit(1, { at: v.set(35.0, B + 1.6, 43.9), spread: { x: 0.1, y: 0.9, z: 2.6 }, vel: { x: -0.15, y: 0.02, z: 0 }, jitter: 0.08, life: 6, size0: 0.3, size1: 1.0, alpha: 0.12 });
      mist.update(dt);
      // The showers run while someone stands under one.
      running.clear();
      for (const sh of BSHOWERS) {
        const on = people.some((q) => q.y < -1.5 && Math.hypot(q.x - sh.x, q.z - sh.z) < 0.62);
        if (on) running.add(sh.kind);
        rings.get(sh.kind)!.color.set(on ? ringCol[sh.kind] : '#2a3438');
        curtains.get(sh.kind)!.visible = on;
        const c = clouds.get(sh.kind)!;
        if (on) {
          if (sh.kind === 'ice') c.emit(Math.ceil(dt * 30), { at: v.set(sh.x, B + 2.3, sh.z), spread: { x: 0.35, y: 0.05, z: 0.35 }, vel: { x: 0, y: -0.4, z: 0 }, jitter: 0.2, life: 3, size0: 0.2, size1: 0.9, alpha: 0.4 });
          else c.emit(Math.ceil(dt * (sh.kind === 'storm' ? 120 : 80)), { at: v.set(sh.x, B + 0.05, sh.z), spread: { x: 0.3, y: 0.01, z: 0.3 }, vel: { x: 0, y: 1.6, z: 0 }, jitter: 0.6, life: 0.35, size0: 0.08, size1: 0.14, alpha: 0.7 });
        }
        c.update(dt);
      }
      // The thunderstorm: a flash every few seconds while it runs.
      thunderT -= dt;
      if (running.has('storm') && thunderT <= 0) {
        thunderT = 3 + Math.random() * 4;
        flash.intensity = 30;
      }
      flash.intensity *= Math.exp(-dt * 9);
      return [...running];
    },
  };
}

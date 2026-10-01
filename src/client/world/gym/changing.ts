import * as THREE from 'three';
import { GYM_BOX, GYM_ROOM } from '../../../shared/gym';
import { CHANGING_BENCH, CHANGING_DOOR, CHANGING_LOCKERS, CHANGING_ROOM, CHANGING_SINKS, CHANGING_WALL, SHOWERS, SHOWER_PARTITIONS, SHOWER_PARTITION_FROM, SHOWER_ZONE, showerAt } from '../../../shared/gym-changing';
import { mesh, textPlane, toon } from '../toon';
import { blk, cyl, decal, picture, plant, seatable, tex, type GymParts } from './kit';
import { mirrorTexture } from './parts';
import { Cloud } from './particles';
import { lockerFront, tiles } from './textures';

/*
 * The gym's changing room (flrnoh fork, see FORK.md "Rooms, spa and detail" and
 * shared/gym-changing.ts): through the door by the lockers in the hall's west wall, which swings open
 * as someone comes up to it. Inside: rows of lockers, a bench to sit and lace up on, sinks under a
 * long mirror, a hair dryer, hooks with towels, a scale, and three tiled showers along the back wall
 * that run (water and a little steam) while someone stands under one. Colliders come from the shared
 * plan (gymFixtures).
 */

const C = CHANGING_ROOM;
const Wt = CHANGING_WALL;

export interface GymChanging {
  /** Every frame: everyone in the gym (you too), for the door and the showers. */
  update(t: number, dt: number, people: readonly { x: number; z: number }[]): void;
}

export function buildChanging(p: GymParts): GymChanging {
  const steel = toon('#8e989e');
  const cx = (C.minX + C.maxX) / 2;
  const cz = (C.minZ + C.maxZ) / 2;
  const w = C.maxX - C.minX;
  const d = C.maxZ - C.minZ;

  // ---- The shell: a light tiled floor, painted walls, a ceiling with a panel light ----------------
  const floorTex = tiles('#d9dedf', '#aab3b6', 10, 0.04, 141);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(w / 2, d / 2);
  decal(p, { minX: C.minX, maxX: GYM_ROOM.minX, minZ: C.minZ, maxZ: C.maxZ }, tex(floorTex), 0);
  const wall = toon('#e3e8e6');
  blk(p, Wt, C.height, d + 2 * Wt, wall, C.minX - Wt / 2, C.height / 2, cz);
  blk(p, w + Wt, C.height, Wt, wall, cx - Wt / 2, C.height / 2, C.minZ - Wt / 2);
  blk(p, w + Wt, C.height, Wt, wall, cx - Wt / 2, C.height / 2, C.maxZ + Wt / 2);
  // Its side of the hall's wall, either side of the door (the hall's own side is rooms.ts).
  const d0 = CHANGING_DOOR.z - CHANGING_DOOR.width / 2;
  const d1 = CHANGING_DOOR.z + CHANGING_DOOR.width / 2;
  blk(p, 0.02, C.height, d0 - C.minZ, wall, GYM_BOX.minX - 0.01, C.height / 2, (C.minZ + d0) / 2);
  blk(p, 0.02, C.height, C.maxZ - d1, wall, GYM_BOX.minX - 0.01, C.height / 2, (d1 + C.maxZ) / 2);
  blk(p, 0.02, C.height - 2.25, d1 - d0, wall, GYM_BOX.minX - 0.01, (C.height + 2.25) / 2, CHANGING_DOOR.z);
  // A lime line round the room at hand height, like the hall's.
  blk(p, 0.03, 0.06, d, '#a3e635', C.minX + 0.015, 1.14, cz);
  const ceiling = mesh(new THREE.PlaneGeometry(w + 2 * Wt, d + 2 * Wt), toon('#cfd6d4'), cx, C.height, cz, false);
  ceiling.rotation.x = Math.PI / 2;
  p.group.add(ceiling);
  for (const z of [38.6, 41.6]) {
    blk(p, 1.2, 0.04, 0.5, '#f2f5f3', cx, C.height - 0.02, z);
    const l = new THREE.PointLight('#f1f6ff', 4, 7, 1.3);
    l.position.set(cx, C.height - 0.3, z);
    p.group.add(l);
  }

  // ---- The door: a frosted leaf on a hinge at its south edge, swinging into the changing room -----
  const glass = toon('#dff1f6', { opacity: 0.6 });
  const hinge = new THREE.Group();
  hinge.position.set(GYM_BOX.minX - 0.02, 0, d1);
  const leafW = CHANGING_DOOR.width - 0.04;
  const leaf = new THREE.Group();
  leaf.add(mesh(new THREE.BoxGeometry(0.04, 2.15, leafW), toon('#7d8c96'), 0, 1.08, -leafW / 2, false));
  leaf.add(mesh(new THREE.BoxGeometry(0.05, 0.9, leafW - 0.3), glass, 0, 1.4, -leafW / 2, false));
  leaf.add(mesh(new THREE.BoxGeometry(0.1, 0.04, 0.22), steel, 0, 1.05, -leafW + 0.15, false));
  hinge.add(leaf);
  p.group.add(hinge);
  let open = 0;
  const sign = textPlane('🚿 Umkleide · Changing', { bg: '#0f1a12', color: '#f0f4f2', size: 34, border: '#a3e635' });
  sign.position.set(GYM_BOX.minX - 0.02, 2.5, CHANGING_DOOR.z);
  sign.rotation.y = -Math.PI / 2;
  sign.scale.setScalar(0.7);
  p.group.add(sign);

  // ---- Lockers along the west wall ----------------------------------------------------------------
  const L = CHANGING_LOCKERS;
  const lockLen = L.maxZ - L.minZ;
  blk(p, L.maxX - L.minX, L.top, lockLen, '#2d3a44', (L.minX + L.maxX) / 2, L.top / 2, (L.minZ + L.maxZ) / 2);
  const half = (lockLen - 0.1) / 2;
  picture(p, half, L.top - 0.1, tex(lockerFront(4, 3, 25)), L.maxX + 0.005, L.top / 2, L.minZ + 0.05 + half / 2, Math.PI / 2);
  picture(p, half, L.top - 0.1, tex(lockerFront(4, 3, 37)), L.maxX + 0.005, L.top / 2, L.minZ + 0.05 + half * 1.5, Math.PI / 2);
  blk(p, L.maxX - L.minX + 0.04, 0.05, lockLen, '#a3e635', (L.minX + L.maxX) / 2, L.top + 0.02, (L.minZ + L.maxZ) / 2);
  // A bag left on top, a locker standing open with a towel in it.
  blk(p, 0.4, 0.22, 0.3, '#3b5bdb', L.minX + 0.25, L.top + 0.13, 38.2);
  const openDoor = mesh(new THREE.BoxGeometry(0.02, 0.6, 0.44), toon('#3d4c57'), L.maxX + 0.2, 1.5, 40.1, false);
  openDoor.rotation.y = 0.9;
  p.group.add(openDoor);
  blk(p, 0.02, 0.6, 0.44, '#141a1f', L.maxX + 0.006, 1.5, 39.88);
  blk(p, 0.2, 0.08, 0.36, '#a3c9b8', L.maxX - 0.08, 1.3, 39.88);

  // ---- The bench, with a gym bag and a pair of trainers -------------------------------------------
  const B = CHANGING_BENCH;
  const bench = new THREE.Group();
  bench.add(mesh(new THREE.BoxGeometry(B.maxX - B.minX, 0.06, B.maxZ - B.minZ), toon('#b98a55'), (B.minX + B.maxX) / 2, B.top - 0.03, (B.minZ + B.maxZ) / 2, false));
  for (const z of [B.minZ + 0.2, (B.minZ + B.maxZ) / 2, B.maxZ - 0.2]) bench.add(mesh(new THREE.BoxGeometry(0.3, B.top - 0.06, 0.06), steel, (B.minX + B.maxX) / 2, (B.top - 0.06) / 2, z, false));
  p.still.add(bench);
  seatable(p, bench, 'gym-changing-bench', 1.6);
  blk(p, 0.3, 0.22, 0.5, '#c1443a', (B.minX + B.maxX) / 2, B.top + 0.11, B.maxZ - 0.35);
  for (const dz of [0, 0.14]) blk(p, 0.26, 0.09, 0.1, '#f4f4ee', B.maxX + 0.35, 0.045, 38.4 + dz);

  // ---- Sinks under a long mirror on the north wall, a hair dryer ----------------------------------
  const S = CHANGING_SINKS;
  const sw = S.maxX - S.minX;
  blk(p, sw, S.top, S.maxZ - S.minZ, '#eef1ee', (S.minX + S.maxX) / 2, S.top / 2, (S.minZ + S.maxZ) / 2);
  blk(p, sw + 0.04, 0.04, S.maxZ - S.minZ + 0.02, '#2b3238', (S.minX + S.maxX) / 2, S.top + 0.02, (S.minZ + S.maxZ) / 2);
  for (const x of [S.minX + 0.45, S.maxX - 0.45]) {
    cyl(p, 0.2, 0.16, 0.06, '#ffffff', x, S.top + 0.02, (S.minZ + S.maxZ) / 2 + 0.04, 16);
    cyl(p, 0.02, 0.02, 0.22, steel, x, S.top + 0.13, S.minZ + 0.08, 8);
    const spout = cyl(p, 0.015, 0.015, 0.14, steel, x, S.top + 0.23, S.minZ + 0.15, 6);
    spout.rotation.x = Math.PI / 2;
  }
  picture(p, sw, 1.1, tex(mirrorTexture()), (S.minX + S.maxX) / 2, S.top + 0.85, C.minZ + 0.01, 0);
  blk(p, 0.12, 0.22, 0.1, '#2b3238', S.maxX + 0.2, 1.4, C.minZ + 0.06);
  cyl(p, 0.05, 0.04, 0.2, '#c9d1d6', S.maxX + 0.2, 1.22, C.minZ + 0.14, 8).rotation.x = Math.PI / 2;

  // ---- Hooks with towels on the hall's wall, a scale, a plant -------------------------------------
  for (let i = 0; i < 4; i++) {
    const z = 40.75 + i * 0.32;
    cyl(p, 0.015, 0.015, 0.08, steel, GYM_BOX.minX - 0.05, 1.7, z, 6).rotation.z = Math.PI / 2;
    if (i !== 2) blk(p, 0.04, 0.55, 0.22, ['#f4f4ee', '#a3c9b8', '#f4f4ee', '#ffd36b'][i], GYM_BOX.minX - 0.06, 1.42, z);
  }
  blk(p, 0.32, 0.05, 0.32, '#2b3238', 5.55, 0.025, 41.4);
  blk(p, 0.18, 0.006, 0.08, '#a3e635', 5.55, 0.053, 41.32);
  plant(p, 5.65, 37.85, 1.2);

  // ---- The showers: tiled stalls along the south wall, a shower head and a mixer in each ----------
  const mosaic = tiles('#9fd3e0', '#6aa3b1', 8, 0.08, 151);
  mosaic.wrapS = mosaic.wrapT = THREE.RepeatWrapping;
  mosaic.repeat.set(4, 2);
  const tileMat = tex(mosaic);
  decal(p, { minX: C.minX, maxX: C.maxX, minZ: SHOWER_ZONE.minZ, maxZ: SHOWER_ZONE.maxZ }, tileMat, 0.004);
  const back = mosaic.clone();
  back.repeat.set(5, 2.2);
  back.needsUpdate = true;
  picture(p, w, 2.2, tex(back), cx, 1.1, C.maxZ - 0.01, Math.PI);
  for (const x of SHOWER_PARTITIONS) {
    const part = mesh(new THREE.BoxGeometry(0.08, 2.0, C.maxZ - SHOWER_PARTITION_FROM), tileMat, x, 1.0, (SHOWER_PARTITION_FROM + C.maxZ) / 2, false);
    p.group.add(part);
  }
  const streams: { cloud: Cloud; mist: Cloud; x: number; z: number; on: number; acc: number }[] = [];
  for (const s of SHOWERS) {
    // The riser, the head and the mixer, a drain under it.
    cyl(p, 0.02, 0.02, 1.0, steel, s.x, 1.7, C.maxZ - 0.05, 8);
    const arm = cyl(p, 0.018, 0.018, 0.4, steel, s.x, 2.2, C.maxZ - 0.22, 8);
    arm.rotation.x = Math.PI / 2;
    cyl(p, 0.11, 0.07, 0.05, '#c9d1d6', s.x, 2.17, s.z, 16);
    cyl(p, 0.05, 0.05, 0.04, steel, s.x + 0.25, 1.1, C.maxZ - 0.03, 10).rotation.x = Math.PI / 2;
    cyl(p, 0.07, 0.07, 0.004, '#4b555c', s.x, 0.006, s.z, 14);
    const cloud = new Cloud(200, '#bfe8ff');
    cloud.lift = -9;
    cloud.drag = 0;
    const mist = new Cloud(40, '#ffffff');
    mist.lift = 0.15;
    p.group.add(cloud.points, mist.points);
    streams.push({ cloud, mist, x: s.x, z: s.z, on: 0, acc: 0 });
  }
  const tmp = new THREE.Vector3();

  return {
    update(t, dt, people) {
      // The door swings open for anyone near it, on either side.
      const near = people.some((q) => Math.abs(q.x - GYM_BOX.minX) < 1.5 && Math.abs(q.z - CHANGING_DOOR.z) < 0.9);
      open += ((near ? 1 : 0) - open) * Math.min(1, dt * 6);
      hinge.rotation.y = open * 1.5;
      // A shower runs while someone stands under it.
      const under = new Set(people.map((q) => showerAt(q.x, q.z)).filter((i) => i >= 0));
      streams.forEach((s, i) => {
        s.on += ((under.has(i) ? 1 : 0) - s.on) * Math.min(1, dt * 4);
        s.acc += dt * 140 * s.on;
        const n = Math.floor(s.acc);
        s.acc -= n;
        if (n) s.cloud.emit(n, { at: tmp.set(s.x, 2.12, s.z), spread: { x: 0.08, y: 0, z: 0.08 }, vel: { x: 0, y: -0.5, z: 0 }, jitter: 0.12, life: 0.6, size0: 0.08, size1: 0.06, alpha: 0.9 });
        if (s.on > 0.5 && Math.random() < dt * 3) s.mist.emit(1, { at: tmp.set(s.x, 1.6, s.z), spread: { x: 0.3, y: 0.3, z: 0.3 }, vel: { x: 0, y: 0.1, z: 0 }, jitter: 0.05, life: 3, size0: 0.4, size1: 1.0, alpha: 0.14 });
        s.cloud.update(dt);
        s.mist.update(dt);
      });
      void t;
    },
  };
}

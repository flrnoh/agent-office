import * as THREE from 'three';
import { GYM_DOOR, GYM_ROOM, GYM_STATION_BY_ID, JUICE_BAR, type JuiceBarView } from '../../../shared/gym';
import type { WellnessView } from '../../../shared/gym-wellness';
import { CHANGING_DOOR, JUICE_COUNTER, JUICE_STOOL_X, JUICE_STOOL_ZS, LOCKERS, RECEPTION, SPA, STRETCH, TURF, TURNSTILE } from '../../../shared/gym-rooms';
import type { Interactable } from '../office';
import { mergeByMaterial, mesh, textPlane, toon } from '../toon';
import { blk, cyl, decal, picture, plant, seatable, speaker, tex, type GymParts } from './kit';
import { glow, mirrorTexture, neonSign, rubberFloor } from './parts';
import { WorkoutVideo, concrete, entranceMat, juiceMenu, lockerFront, logoPanel, planks, platform, poster, timetable, turf, weightTiles, windowView, zoneRubber } from './textures';

/*
 * The gym's hall itself (flrnoh fork, see FORK.md "Rooms, spa and detail"): the shell (a rubber floor
 * with a zone for each kind of training, walls with big windows onto the street, a ceiling of steel
 * beams, ducts, pendant lamps and a slow big fan), the lobby (reception, the logo wall, turnstiles),
 * the west wall (lockers and the changing-room door, the juice bar, the water fountain, towels,
 * plates, medicine balls), the functional turf lane and the stretch area along the south, mirrors,
 * posters, speakers and the TVs over the cardio deck playing a workout. Everything but the machines
 * (world/gym/interior.ts) and the spa (world/gym/spa.ts). Colliders come from shared/gym-rooms.ts.
 */

const R = GYM_ROOM;
const W = R.maxX - R.minX;
const D = R.maxZ - R.minZ;
const CX = (R.minX + R.maxX) / 2;
const CZ = (R.minZ + R.maxZ) / 2;
const H = R.height;
const T = 0.3;
const LIME = '#a3e635';

export interface GymRooms {
  setStation(id: string, state: unknown): void;
  /** Every frame: `people` are everyone in the gym (you too), for the turnstiles. */
  update(t: number, dt: number, people: readonly { x: number; z: number }[]): void;
}

export function buildGymRooms(p: GymParts, showCeiling: boolean): GymRooms {
  const steel = toon('#6b7883');
  const dark = toon('#1b2126');
  const white = toon('#eef1ee');
  const lime = toon(LIME);
  const wood = toon('#b98a55');

  // ---- The floor: rubber everywhere, a zone for each kind of training on top ---------------------
  const floorTex = rubberFloor();
  floorTex.repeat.set(W, D);
  decal(p, R, tex(floorTex), 0);
  const cardio = tex(zoneRubber('#1d3440', '#35e0d0', '#35e0d0'));
  (cardio.map as THREE.Texture).wrapS = (cardio.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  decal(p, { minX: 8.6, maxX: 18.3, minZ: 37.95, maxZ: 40.6 }, cardio, 0.004);
  decal(p, { minX: 24.35, maxX: 31.4, minZ: 37.95, maxZ: 40.6 }, cardio, 0.004);
  const wt = weightTiles();
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  wt.repeat.set(15, 6.6);
  decal(p, { minX: 8.3, maxX: 23.4, minZ: 43.7, maxZ: 50.3 }, tex(wt), 0.004);
  // Lifting platforms under the deadlift and the squat rack.
  const plat = tex(platform());
  for (const id of ['deadlift', 'squat']) {
    const s = GYM_STATION_BY_ID.get(id);
    if (s) decal(p, { minX: s.x - 1.25, maxX: s.x + 1.25, minZ: s.z - 0.95, maxZ: s.z + 0.95 }, plat, 0.008);
  }
  const turfTex = turf();
  turfTex.wrapS = THREE.RepeatWrapping;
  turfTex.repeat.set(1.6, 1);
  decal(p, TURF, tex(turfTex), 0.006);
  decal(p, STRETCH, tex(zoneRubber('#3a3350', '#c9a0ff', '#c9a0ff')), 0.004);
  const conc = concrete();
  conc.wrapS = conc.wrapT = THREE.RepeatWrapping;
  conc.repeat.set(3, 2);
  decal(p, { minX: 18.3, maxX: 24.4, minZ: R.minZ, maxZ: 40.4 }, tex(conc), 0.003);
  decal(p, { minX: GYM_DOOR.x - 1.2, maxX: GYM_DOOR.x + 1.2, minZ: R.minZ + 0.05, maxZ: R.minZ + 1.25 }, tex(entranceMat()), 0.008);
  const juiceWood = planks('#a8743f', 10, 5);
  juiceWood.wrapS = juiceWood.wrapT = THREE.RepeatWrapping;
  juiceWood.repeat.set(1.3, 3);
  decal(p, { minX: R.minX, maxX: 8.9, minZ: 40.9, maxZ: 47.1 }, tex(juiceWood), 0.004);

  // ---- The walls: a dark band below, a lime line, lighter above ----------------------------------
  const wallMat = toon('#66737c');
  const walls: [number, number, number, number][] = [
    [R.minX - T, R.maxX + T, R.minZ - T, R.minZ],
    [R.minX - T, R.maxX + T, R.maxZ, R.maxZ + T],
    [R.minX - T, R.minX, R.minZ, R.maxZ],
    [R.maxX, R.maxX + T, R.minZ, R.maxZ],
  ];
  for (const [x0, x1, z0, z1] of walls) {
    blk(p, x1 - x0, H, z1 - z0, wallMat, (x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    p.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, bottom: 0, top: H });
  }
  p.colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });
  p.colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });
  // Wainscot and lines round the room (the south and west are behind things, but show between them).
  const band = (x0: number, x1: number, z0: number, z1: number) => {
    const w = Math.max(0.03, x1 - x0);
    const d = Math.max(0.03, z1 - z0);
    blk(p, w, 1.1, d, '#232a30', (x0 + x1) / 2, 0.55, (z0 + z1) / 2);
    blk(p, w + 0.002, 0.08, d + 0.002, lime, (x0 + x1) / 2, 1.14, (z0 + z1) / 2);
    blk(p, w + 0.002, 0.05, d + 0.002, lime, (x0 + x1) / 2, 3.35, (z0 + z1) / 2);
  };
  band(R.minX, R.minX + 0.03, R.minZ, R.maxZ);
  band(R.minX, SPA.minX, R.maxZ - 0.03, R.maxZ);
  band(SPA.minX, R.maxX, R.maxZ - 0.03, R.maxZ);
  band(R.maxX - 0.03, R.maxX, R.minZ, R.maxZ);

  // ---- The north wall: two big windows onto the street, either side of the door ------------------
  const view = glow(windowView());
  const view2 = glow(windowView(1024, 320, 29));
  const win = (x0: number, x1: number, mat: THREE.Material) => {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    picture(p, w, 3.6, mat, cx, 2.6, R.minZ + 0.02, 0);
    // Frame, sill, a transom and mullions.
    blk(p, w + 0.16, 0.12, 0.28, '#c9d1d6', cx, 0.78, R.minZ + 0.1);
    blk(p, w + 0.16, 0.1, 0.1, '#2b3238', cx, 4.45, R.minZ + 0.05);
    blk(p, w, 0.07, 0.08, '#2b3238', cx, 3.35, R.minZ + 0.05);
    const n = Math.max(2, Math.round(w / 1.9));
    for (let i = 0; i <= n; i++) blk(p, 0.08, 3.7, 0.1, '#2b3238', x0 + (w * i) / n, 2.6, R.minZ + 0.05);
  };
  win(6.8, 18.3, view);
  win(24.6, 33.2, view2);

  // ---- The ceiling: steel beams, two ducts, a cable tray, pendant lamps, and a big slow fan -------
  let fan: THREE.Object3D | null = null;
  if (showCeiling) {
    const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T), toon('#1a2024'), CX, H, CZ, false);
    ceiling.rotation.x = Math.PI / 2;
    p.group.add(ceiling);
    for (const x of [8.5, 13, 17.5, 22, 26.5, 31]) {
      blk(p, 0.22, 0.42, D, '#2e363c', x, H - 0.21, CZ);
      blk(p, 0.36, 0.04, D, '#2e363c', x, H - 0.42, CZ);
    }
    const galv = toon('#a9b3b9');
    for (const z of [40.9, 49.6]) {
      const duct = mesh(new THREE.CylinderGeometry(0.27, 0.27, W - 0.8, 16), galv, CX, 4.95, z, false);
      duct.rotation.z = Math.PI / 2;
      p.still.add(duct);
      for (let x = R.minX + 1; x < R.maxX - 0.5; x += 1.6) {
        const ring = mesh(new THREE.TorusGeometry(0.285, 0.025, 6, 16), toon('#8e989e'), x, 4.95, z, false);
        ring.rotation.y = Math.PI / 2;
        p.still.add(ring);
      }
      for (let x = R.minX + 2.2; x < R.maxX - 1; x += 4.5) {
        cyl(p, 0.012, 0.012, H - 5.22, '#5a646b', x, (5.22 + H) / 2, z, 4);
        blk(p, 0.14, 0.3, 0.14, '#8e989e', x + 1.2, 4.6, z);
        blk(p, 0.45, 0.12, 0.45, '#8e989e', x + 1.2, 4.42, z);
        blk(p, 0.38, 0.02, 0.38, '#2b3238', x + 1.2, 4.35, z);
      }
    }
    blk(p, W - 1, 0.06, 0.35, '#7c868d', CX, 5.05, 44.1);
    // Pendant lamps: a cord, a dark dome, a warm glowing disc underneath (warmer over the spa).
    const cool = glow(null, '#f6f8ea');
    const warm = glow(null, '#ffd8a0');
    for (const x of [9, 13.5, 18, 22.5, 27, 31.5])
      for (const z of [38.5, 45.5, 52.5]) {
        const spa = x > SPA.minX && z > SPA.minZ;
        const y = spa ? 3.7 : 4.15;
        cyl(p, 0.008, 0.008, H - y - 0.2, '#111', x, (H + y + 0.2) / 2, z, 4);
        p.still.add(mesh(new THREE.CylinderGeometry(0.08, 0.36, 0.3, 14, 1, true), toon('#1e2a22'), x, y + 0.05, z, false));
        cyl(p, 0.1, 0.1, 0.1, '#1e2a22', x, y + 0.24, z, 10);
        const disc = mesh(new THREE.CircleGeometry(0.3, 16), spa ? warm : cool, x, y - 0.09, z, false);
        disc.rotation.x = Math.PI / 2;
        p.still.add(disc);
      }
    // The big fan over the strength floor, turning slowly.
    const blades = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = mesh(new THREE.BoxGeometry(2.7, 0.03, 0.26), toon('#c9d1d6'), 0, 0, 0, false);
      b.position.set(Math.cos((i / 6) * Math.PI * 2) * 1.45, 0, Math.sin((i / 6) * Math.PI * 2) * 1.45);
      b.rotation.y = -(i / 6) * Math.PI * 2;
      blades.add(b);
    }
    blades.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 14), toon(LIME), 0, 0, 0, false));
    fan = mergeByMaterial(blades);
    fan.position.set(15.5, 4.55, 47);
    p.group.add(fan);
    cyl(p, 0.04, 0.04, H - 4.6, '#2b3238', 15.5, (H + 4.6) / 2, 47, 6);
  }

  // ---- Hung neon signs over the zones (readable from both sides) --------------------------------
  const hangSign = (text: string, color: string, x: number, z: number, rotY: number, w: number, y = H - 1.0) => {
    const mat = glow(neonSign(text, color, 768, 160, '#0f1a12'));
    for (const s of [0, Math.PI]) {
      const m = picture(p, w, w / 4.8, mat, x, y, z, rotY + s);
      m.position.x += Math.sin(rotY + s) * 0.02;
      m.position.z += Math.cos(rotY + s) * 0.02;
    }
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) cyl(p, 0.006, 0.006, H - y - w / 9.6, '#111', x + Math.cos(rotY) * dx, (H + y + w / 9.6) / 2, z - Math.sin(rotY) * dx, 4);
  };
  hangSign('CARDIO', '#35e0d0', 13.2, 41.3, 0, 3.4);
  hangSign('CARDIO', '#35e0d0', 28.0, 41.3, 0, 2.8);
  hangSign('STRENGTH', LIME, 15.5, 43.3, 0, 3.8);

  // ---- The TVs over the cardio deck: a workout video, for whoever's running ----------------------
  const video = new WorkoutVideo();
  const screenMat = glow(video.texture);
  for (const x of [12.2, 28.0]) {
    blk(p, 1.72, 1.0, 0.08, '#0c0f11', x, 3.55, 37.02);
    picture(p, 1.6, 0.9, screenMat, x, 3.55, 37.07, 0);
    for (const dx of [-0.5, 0.5]) cyl(p, 0.015, 0.015, H - 4.05, '#2b3238', x + dx, (H + 4.05) / 2, 37.02, 4);
  }

  // ---- The lobby: reception, the logo wall, the turnstiles ---------------------------------------
  const Rc = RECEPTION;
  const counterH = 1.1;
  const recWood = tex(planks('#d8d2c4', 6, 41));
  const front = mesh(new THREE.BoxGeometry(Rc.counterX - Rc.minX, counterH - 0.06, Rc.returnZ - 36.9), recWood, (Rc.minX + Rc.counterX) / 2, (counterH - 0.06) / 2, (36.9 + Rc.returnZ) / 2, false);
  p.group.add(front);
  blk(p, Rc.counterX - Rc.minX + 0.08, 0.06, Rc.returnZ - 36.9 + 0.08, white, (Rc.minX + Rc.counterX) / 2, counterH - 0.03, (36.9 + Rc.returnZ) / 2);
  blk(p, Rc.maxX - Rc.minX, counterH - 0.06, Rc.maxZ - Rc.returnZ, '#d8d2c4', (Rc.minX + Rc.maxX) / 2, (counterH - 0.06) / 2, (Rc.returnZ + Rc.maxZ) / 2);
  blk(p, Rc.maxX - Rc.minX + 0.08, 0.06, Rc.maxZ - Rc.returnZ + 0.08, white, (Rc.minX + Rc.maxX) / 2, counterH - 0.03, (Rc.returnZ + Rc.maxZ) / 2);
  blk(p, 0.02, 0.08, Rc.returnZ - 36.9, lime, Rc.minX - 0.01, 0.9, (36.9 + Rc.returnZ) / 2);
  blk(p, Rc.maxX - Rc.minX, 0.08, 0.02, lime, (Rc.minX + Rc.maxX) / 2, 0.9, Rc.maxZ + 0.01);
  // A screen, a card reader, a bowl of apples and a staff chair behind.
  blk(p, 0.04, 0.34, 0.5, '#15191c', Rc.counterX - 0.18, counterH + 0.24, 37.6);
  blk(p, 0.12, 0.02, 0.2, '#15191c', Rc.counterX - 0.15, counterH + 0.01, 37.6);
  cyl(p, 0.02, 0.02, 0.1, '#15191c', Rc.counterX - 0.18, counterH + 0.05, 37.6, 6);
  picture(p, 0.44, 0.28, glow(null, '#2d6f5a'), Rc.counterX - 0.155, counterH + 0.24, 37.6, Math.PI / 2);
  blk(p, 0.14, 0.05, 0.1, '#2b3238', Rc.minX + 0.2, counterH + 0.03, 38.1);
  cyl(p, 0.16, 0.1, 0.08, white, Rc.minX + 0.25, counterH + 0.04, 37.2, 14);
  for (let i = 0; i < 5; i++) p.still.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), toon(i % 2 ? '#c1443a' : '#8cc63f'), Rc.minX + 0.21 + (i % 3) * 0.05, counterH + 0.12 + Math.floor(i / 3) * 0.05, 37.16 + (i % 2) * 0.07, false));
  cyl(p, 0.22, 0.22, 0.08, '#2b3238', 23.3, 0.55, 37.5, 12);
  cyl(p, 0.03, 0.03, 0.5, steel, 23.3, 0.27, 37.5, 6);
  blk(p, 0.4, 0.45, 0.06, '#2b3238', 23.3, 0.85, 37.73);
  picture(p, 2.6, 1.3, glow(logoPanel()), 22.95, 2.2, R.minZ + 0.03, 0);
  const tagline = textPlane('Reception · Empfang', { bg: '#0f1a12', color: LIME, size: 36 });
  tagline.position.set(Rc.minX - 0.01, 0.62, 37.65);
  tagline.rotation.y = -Math.PI / 2;
  tagline.scale.setScalar(0.32);
  p.group.add(tagline);
  // Turnstiles: steel posts with a lime light, glass flaps that swing open as someone comes through.
  const flaps: { obj: THREE.Object3D; x: number; side: number; open: number }[] = [];
  const flapMat = new THREE.MeshToonMaterial({ color: '#cdeefd', transparent: true, opacity: 0.45, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  const posts = TURNSTILE.posts;
  for (const x of posts) {
    blk(p, 0.16, 1.0, 0.5, steel, x, 0.5, TURNSTILE.z);
    blk(p, 0.17, 0.03, 0.36, glow(null, LIME), x, 1.01, TURNSTILE.z);
  }
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i] + 0.08;
    const b = posts[i + 1] - 0.08;
    const half = (b - a) / 2 - 0.02;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side < 0 ? a : b, 0.75, TURNSTILE.z);
      const flap = mesh(new THREE.BoxGeometry(half, 0.5, 0.02), flapMat, (-side * half) / 2, 0, 0, false);
      pivot.add(flap);
      p.group.add(pivot);
      flaps.push({ obj: pivot, x: (a + b) / 2, side, open: 0 });
    }
  }

  // ---- The west wall: lockers and the changing-room door -----------------------------------------
  const lockMat = tex(lockerFront(4, 3, 1));
  const lockMat2 = tex(lockerFront(4, 3, 13));
  blk(p, LOCKERS.depth, 2.0, LOCKERS.maxZ - LOCKERS.minZ, '#2d3a44', R.minX + LOCKERS.depth / 2, 1.0, (LOCKERS.minZ + LOCKERS.maxZ) / 2);
  const lockLen = (LOCKERS.maxZ - LOCKERS.minZ - 0.1) / 2;
  picture(p, lockLen, 1.9, lockMat, R.minX + LOCKERS.depth + 0.005, 1.0, LOCKERS.minZ + 0.05 + lockLen / 2, Math.PI / 2);
  picture(p, lockLen, 1.9, lockMat2, R.minX + LOCKERS.depth + 0.005, 1.0, LOCKERS.minZ + 0.05 + lockLen * 1.5, Math.PI / 2);
  blk(p, LOCKERS.depth + 0.04, 0.05, LOCKERS.maxZ - LOCKERS.minZ, lime, R.minX + LOCKERS.depth / 2, 2.02, (LOCKERS.minZ + LOCKERS.maxZ) / 2);
  // The bench in front of them.
  const bench = new THREE.Group();
  bench.add(mesh(new THREE.BoxGeometry(0.36, 0.06, 1.4), wood, 7.7, 0.44, 37.6, false));
  for (const z of [37.05, 38.15]) bench.add(mesh(new THREE.BoxGeometry(0.3, 0.41, 0.06), steel, 7.7, 0.205, z, false));
  p.still.add(bench);
  seatable(p, bench, 'gym-locker-bench', 1.3);
  // The changing-room door, with its sign.
  const cd = CHANGING_DOOR;
  blk(p, 0.06, 2.25, cd.width, '#7d8c96', R.minX + 0.03, 1.125, cd.z);
  blk(p, 0.07, 2.35, 0.08, lime, R.minX + 0.04, 1.175, cd.z - cd.width / 2 - 0.04);
  blk(p, 0.07, 2.35, 0.08, lime, R.minX + 0.04, 1.175, cd.z + cd.width / 2 + 0.04);
  blk(p, 0.07, 0.08, cd.width + 0.16, lime, R.minX + 0.04, 2.36, cd.z);
  blk(p, 0.06, 0.04, 0.22, steel, R.minX + 0.08, 1.05, cd.z + cd.width / 2 - 0.15);
  const cSign = textPlane('🚿 Umkleide · Changing', { bg: '#0f1a12', color: '#f0f4f2', size: 34, border: LIME });
  cSign.position.set(R.minX + 0.07, 2.65, cd.z);
  cSign.rotation.y = Math.PI / 2;
  cSign.scale.setScalar(0.8);
  p.group.add(cSign);
  plant(p, R.minX + 0.28, 40.58, 1.3);

  // ---- The juice bar ------------------------------------------------------------------------------
  const C = JUICE_COUNTER;
  const jz = (C.minZ + C.maxZ) / 2;
  const jl = C.maxZ - C.minZ;
  // The back bar against the wall: cupboards, two shelves of jars and bottles, a drinks fridge.
  blk(p, C.backMaxX - R.minX, 1.0, jl, '#e9e4da', (R.minX + C.backMaxX) / 2, 0.5, jz);
  blk(p, C.backMaxX - R.minX + 0.04, 0.04, jl + 0.04, '#3a2f26', (R.minX + C.backMaxX) / 2, 1.02, jz);
  for (const y of [1.55, 2.0]) blk(p, 0.3, 0.04, jl - 1.4, '#8a6a44', R.minX + 0.15, y, jz - 0.5);
  const jars = ['#a3e635', '#ff7ab0', '#ffd36b', '#ff9a52', '#7fd4ff', '#c9a0ff'];
  for (let i = 0; i < 14; i++) {
    const y = i < 7 ? 1.55 : 2.0;
    const z = C.minZ + 0.35 + (i % 7) * 0.62;
    cyl(p, 0.06, 0.06, 0.24, jars[i % jars.length], R.minX + 0.15, y + 0.14, z, 8);
    cyl(p, 0.065, 0.065, 0.03, '#e9e4da', R.minX + 0.15, y + 0.27, z, 8);
  }
  // The fridge at the south end: a glowing glass door full of bottles.
  blk(p, 0.4, 1.9, 0.9, '#d9dcdc', R.minX + 0.2, 0.95, C.maxZ - 0.5);
  picture(p, 0.78, 1.6, glow(null, '#dff4ff'), R.minX + 0.405, 1.0, C.maxZ - 0.5, Math.PI / 2);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) cyl(p, 0.03, 0.03, 0.2, jars[(r + i) % jars.length], R.minX + 0.36, 0.38 + r * 0.38, C.maxZ - 0.82 + i * 0.16, 6);
  // The counter: wood-clad, a white top with a lime edge, a foot rail.
  const cw = tex(planks('#a8743f', 8, 9));
  p.group.add(mesh(new THREE.BoxGeometry(C.maxX - C.minX, C.top - 0.06, jl), cw, (C.minX + C.maxX) / 2, (C.top - 0.06) / 2, jz, false));
  blk(p, C.maxX - C.minX + 0.14, 0.06, jl + 0.1, white, (C.minX + C.maxX) / 2 + 0.05, C.top - 0.03, jz);
  blk(p, 0.03, 0.06, jl + 0.1, lime, C.maxX + 0.125, C.top - 0.03, jz);
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, jl - 0.2, 8), steel, C.maxX + 0.18, 0.22, jz, false);
  rail.rotation.x = Math.PI / 2;
  p.still.add(rail);
  // On the counter: the blender, fruit bowls, cups and straws, a tip jar.
  const blenderX = (C.minX + C.maxX) / 2;
  const blenderZ = C.minZ + 0.7;
  blk(p, 0.2, 0.14, 0.2, '#2b3238', blenderX, C.top + 0.07, blenderZ);
  const jar = mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.3, 12), toon('#cdeefd', { opacity: 0.55 }), blenderX, C.top + 0.3, blenderZ, false);
  p.group.add(jar);
  const smoothie = mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.16, 12), toon('#ff7ab0'), blenderX, C.top + 0.23, blenderZ, false);
  p.group.add(smoothie);
  const bowl = (z: number, fruit: [string, number][]) => {
    cyl(p, 0.2, 0.12, 0.09, '#e9e4da', blenderX, C.top + 0.045, z, 16);
    let k = 0;
    for (const [color, n] of fruit)
      for (let i = 0; i < n; i++, k++) {
        const a = k * 2.4;
        const r = k === 0 ? 0 : 0.1;
        p.still.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), toon(color), blenderX + Math.cos(a) * r, C.top + 0.12 + (k > 5 ? 0.06 : 0), z + Math.sin(a) * r, false));
      }
  };
  bowl(C.minZ + 1.8, [
    ['#ff9a1f', 3],
    ['#8cc63f', 2],
    ['#c1443a', 2],
  ]);
  // Bananas: a few curved yellow capsules.
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.CapsuleGeometry(0.03, 0.16, 3, 6), toon('#ffd84a'), blenderX - 0.05 + i * 0.05, C.top + 0.04, C.minZ + 2.6, false);
    b.rotation.set(Math.PI / 2, 0, 0.3 - i * 0.2);
    p.still.add(b);
  }
  bowl(C.maxZ - 1.9, [
    ['#ffd84a', 2],
    ['#ff9a1f', 3],
    ['#6a2d6b', 2],
  ]);
  for (let i = 0; i < 4; i++) cyl(p, 0.05, 0.04, 0.12, i % 2 ? '#a3e635' : '#ffffff', blenderX + 0.12, C.top + 0.06 + i * 0.1, C.maxZ - 0.9, 10);
  cyl(p, 0.05, 0.05, 0.18, toon('#cdeefd', { opacity: 0.5 }), blenderX - 0.12, C.top + 0.09, C.maxZ - 0.9, 10);
  for (let i = 0; i < 5; i++) blk(p, 0.008, 0.22, 0.008, jars[i], blenderX - 0.12 + (i - 2) * 0.015, C.top + 0.2, C.maxZ - 0.9);
  cyl(p, 0.06, 0.06, 0.14, toon('#cdeefd', { opacity: 0.5 }), blenderX, C.top + 0.07, C.maxZ - 0.35, 10);
  // The menu board up on the wall, and the juice bar's own sign.
  const menu = picture(p, 3.0, 1.5, glow(juiceMenu()), R.minX + 0.03, 2.95, jz, Math.PI / 2);
  // Stools, facing the counter (seatable).
  for (let i = 0; i < JUICE_STOOL_ZS.length; i++) {
    const z = JUICE_STOOL_ZS[i];
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.08, 14), lime, JUICE_STOOL_X, 0.74, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), steel, JUICE_STOOL_X, 0.36, z, false));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 14), steel, JUICE_STOOL_X, 0.015, z, false));
    const ring = mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 16), steel, JUICE_STOOL_X, 0.3, z, false);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    p.still.add(g);
    seatable(p, g, `gym-stool-${i + 1}`, 0.9);
  }
  const jb: Interactable = { kind: 'gym-station', gymStation: JUICE_BAR.id, x: (C.minX + C.maxX) / 2 + 0.6, z: jz, y: 0, radius: 1.6 };
  p.interactables.push(jb);
  menu.userData.interact = jb;

  // ---- Along the west wall, south of the bar: water, towels, plates, medicine balls, posters -------
  blk(p, 0.42, 0.95, 0.56, '#c9d1d6', R.minX + 0.21, 0.475, 47.95);
  blk(p, 0.36, 0.06, 0.46, '#8e989e', R.minX + 0.24, 0.98, 47.95);
  cyl(p, 0.015, 0.015, 0.12, steel, R.minX + 0.3, 1.06, 47.95, 6);
  picture(p, 0.3, 0.3, glow(null, '#7fd4ff'), R.minX + 0.425, 0.6, 47.95, Math.PI / 2);
  cyl(p, 0.05, 0.05, 0.3, white, R.minX + 0.15, 1.3, 47.72, 10);
  // Towels: a rack of rolled towels in white and lime.
  blk(p, 0.4, 1.5, 0.9, '#3a444d', R.minX + 0.2, 0.75, 49.05);
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 4; i++) {
      const t = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), toon(r % 2 ? '#f4f4ee' : i % 2 ? '#f4f4ee' : LIME), R.minX + 0.24, 0.24 + r * 0.34, 48.72 + i * 0.22, false);
      t.rotation.z = Math.PI / 2;
      p.still.add(t);
    }
  // A plate rack: horns with bumper plates in the usual colours.
  blk(p, 0.5, 0.08, 1.7, '#2b3238', R.minX + 0.3, 0.04, 50.75);
  blk(p, 0.12, 1.2, 1.7, '#2b3238', R.minX + 0.06, 0.6, 50.75);
  const plates: [string, number][] = [
    ['#c1443a', 0.23],
    ['#2f6fd6', 0.22],
    ['#e6c229', 0.2],
    ['#2e9e4f', 0.18],
    ['#f4f4ee', 0.14],
    ['#1b1f23', 0.12],
  ];
  plates.forEach(([color, r], i) => {
    const z = 50.1 + (i % 3) * 0.55;
    const y = i < 3 ? 0.3 : 0.85;
    cyl(p, 0.025, 0.025, 0.4, steel, R.minX + 0.3, y, z, 6).rotation.z = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const pl = mesh(new THREE.CylinderGeometry(r, r, 0.05, 18), toon(color), R.minX + 0.18 + k * 0.06, y, z, false);
      pl.rotation.z = Math.PI / 2;
      p.still.add(pl);
    }
  });
  // Medicine balls on a three-tier rack in the south-west corner.
  blk(p, 0.55, 0.05, 1.5, '#2b3238', R.minX + 0.27, 0.35, 54.75);
  blk(p, 0.55, 0.05, 1.5, '#2b3238', R.minX + 0.27, 0.8, 54.75);
  blk(p, 0.55, 0.05, 1.5, '#2b3238', R.minX + 0.27, 1.25, 54.75);
  for (const z of [54.02, 55.48]) blk(p, 0.55, 1.3, 0.04, '#2b3238', R.minX + 0.27, 0.65, z);
  const ball = ['#2b3238', '#c1443a', '#2f6fd6', '#e6c229'];
  for (let t = 0; t < 3; t++) for (let i = 0; i < 4; i++) p.still.add(mesh(new THREE.SphereGeometry(0.15 - t * 0.02, 12, 8), toon(ball[(i + t) % 4]), R.minX + 0.28, 0.52 + t * 0.45 - t * 0.02, 54.25 + i * 0.34, false));
  // Posters.
  const posters: [string, string, string, string, number, number, number, number][] = [
    ['ONE MORE REP', 'no excuses', '#12181c', '#ffffff', R.minX + 0.03, 2.6, 49.0, Math.PI / 2],
    ['LEG DAY', 'every day is', '#a3e635', '#12181c', R.minX + 0.03, 2.6, 51.0, Math.PI / 2],
    ['STRONGER EVERY DAY', 'train · recover', '#2f6fd6', '#ffffff', R.minX + 0.03, 3.0, 37.6, Math.PI / 2],
    ['SWEAT SMILE REPEAT', '#flrnohfit', '#ff7ab0', '#12181c', SPA.minX - 0.02, 1.9, 44.0, -Math.PI / 2],
  ];
  for (const [big, small, bg, fg, x, y, z, rot] of posters) {
    picture(p, 0.9, 1.26, tex(poster(big, small, bg, fg, bg === '#a3e635' ? '#12181c' : LIME)), x, y, z, rot);
  }

  // ---- The south wall: a long mirror over the turf lane, the gym's name above it -----------------
  const mirror = new THREE.MeshToonMaterial({ map: mirrorTexture(), gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  picture(p, TURF.maxX - TURF.minX - 0.3, 2.4, mirror, (TURF.minX + TURF.maxX) / 2, 1.75, R.maxZ - 0.02, Math.PI);
  blk(p, TURF.maxX - TURF.minX - 0.2, 0.06, 0.05, '#2b3238', (TURF.minX + TURF.maxX) / 2, 2.97, R.maxZ - 0.03);
  blk(p, TURF.maxX - TURF.minX - 0.2, 0.06, 0.05, '#2b3238', (TURF.minX + TURF.maxX) / 2, 0.53, R.maxZ - 0.03);
  picture(p, 6.4, 1.33, glow(neonSign('FITNESS', LIME, 768, 160, '#0f1a12')), (TURF.minX + TURF.maxX) / 2, 4.2, R.maxZ - 0.03, Math.PI);
  // And one on the spa's wall, facing the strength floor.
  picture(p, 5.0, 2.2, mirror, SPA.minX - 0.01, 1.55, 47.8, -Math.PI / 2);
  blk(p, 0.04, 0.06, 5.1, '#2b3238', SPA.minX - 0.02, 2.67, 47.8);
  blk(p, 0.04, 0.06, 5.1, '#2b3238', SPA.minX - 0.02, 0.43, 47.8);
  // A bench along the spa wall (seatable).
  const sb = new THREE.Group();
  sb.add(mesh(new THREE.BoxGeometry(0.4, 0.06, 1.6), wood, SPA.minX - 0.2, 0.44, 44.0, false));
  for (const z of [43.35, 44.65]) sb.add(mesh(new THREE.BoxGeometry(0.34, 0.41, 0.06), steel, SPA.minX - 0.2, 0.205, z, false));
  p.still.add(sb);
  seatable(p, sb, 'gym-spa-bench', 1.3);

  // ---- The functional turf lane: sled, tyre, plyo boxes, kettlebells, battle ropes ----------------
  // A push sled: a base, two posts with plates, and angled handles.
  const sx = 12.2;
  const sz = 54.575;
  blk(p, 0.9, 0.08, 0.75, '#2b3238', sx, 0.06, sz);
  for (const dz of [-0.2, 0.2]) {
    cyl(p, 0.035, 0.035, 0.5, steel, sx - 0.2, 0.33, sz + dz, 8);
    const pl = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), toon(dz < 0 ? '#c1443a' : '#2f6fd6'), sx - 0.2, 0.18, sz + dz, false);
    p.still.add(pl);
    const handle = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), steel, sx + 0.18, 0.5, sz + dz * 1.4, false);
    handle.rotation.z = -0.55;
    p.still.add(handle);
  }
  // A big tractor tyre lying flat.
  const tyre = mesh(new THREE.TorusGeometry(0.46, 0.14, 10, 22), toon('#16191b'), 14.6, 0.14, 54.6, false);
  tyre.rotation.x = Math.PI / 2;
  p.still.add(tyre);
  // Plyo boxes: a big one and a smaller on top.
  const plyo = tex(planks('#c49a64', 4, 33));
  p.group.add(mesh(new THREE.BoxGeometry(0.95, 0.6, 0.8), plyo, 16.6, 0.3, 55.17, false));
  p.group.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.6), plyo, 16.55, 0.8, 55.2, false));
  // A kettlebell rack.
  blk(p, 1.8, 0.05, 0.45, '#2b3238', 18.9, 0.3, 55.45);
  blk(p, 1.8, 0.05, 0.45, '#2b3238', 18.9, 0.68, 55.45);
  for (const x of [18.03, 19.77]) blk(p, 0.04, 0.7, 0.45, '#2b3238', x, 0.35, 55.45);
  const kb = (x: number, y: number, z: number, color: string, s = 1) => {
    p.still.add(mesh(new THREE.SphereGeometry(0.1 * s, 10, 8), toon(color), x, y + 0.1 * s, z, false));
    const h = mesh(new THREE.TorusGeometry(0.06 * s, 0.015 * s, 6, 12, Math.PI), toon('#2b3238'), x, y + 0.2 * s, z, false);
    p.still.add(h);
  };
  const kbColors = ['#e6c229', '#2f6fd6', '#c1443a', '#2e9e4f', '#8a5cd6', '#2b3238', '#ff9a1f', '#1b1f23'];
  for (let i = 0; i < 8; i++) kb(18.15 + (i % 4) * 0.42, i < 4 ? 0.33 : 0.71, 55.45, kbColors[i], 0.9 + (i % 4) * 0.1);
  kb(20.0, 0, 54.0, '#c1443a', 1.1);
  kb(20.35, 0, 54.1, '#c1443a', 1.1);
  // Battle ropes, anchored to the spa wall, lying in waves along the turf.
  blk(p, 0.04, 0.3, 0.3, '#2b3238', SPA.minX - 0.02, 0.35, 54.7);
  for (const dz of [-0.28, 0.28]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      pts.push(new THREE.Vector3(SPA.minX - 0.05 - k * 3.9, 0.04 + (i === 0 ? 0.3 : 0), 54.7 + dz * (0.3 + k) + Math.sin(k * Math.PI * 3) * 0.14));
    }
    p.still.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.035, 6), toon('#1b1f23'), 0, 0, 0, false));
  }

  // ---- The stretch area: mats, foam rollers, blocks, a ball, the class timetable ------------------
  const matColors = ['#7c5cd6', '#3fa0c4', '#e08a3f', '#2e9e4f', '#c1443a', '#3fa0c4'];
  const mats: [number, number][] = [
    [12.6, 51.15],
    [12.6, 52.45],
    [14.9, 51.15],
    [21.0, 51.15],
    [21.0, 52.45],
    [23.1, 52.45],
  ];
  mats.forEach(([x, z], i) => blk(p, 1.8, 0.02, 0.62, matColors[i], x, 0.012, z));
  // The stretch studio's own three mats, round its station.
  const yoga = GYM_STATION_BY_ID.get('yoga');
  let yogaLight: THREE.MeshBasicMaterial | null = null;
  if (yoga) {
    for (let i = 0; i < 3; i++) blk(p, 0.62, 0.02, 1.8, ['#7c5cd6', '#3fa0c4', '#e08a3f'][i], yoga.x - 0.75 + i * 0.75, 0.013, yoga.z);
    const it: Interactable = { kind: 'gym-station', gymStation: yoga.id, x: yoga.x, z: yoga.z, y: 0, radius: 1.8 };
    p.interactables.push(it);
    yogaLight = glow(null, '#4b5a3a');
    const lamp = mesh(new THREE.SphereGeometry(0.06, 8, 6), yogaLight, yoga.x + 1.3, 0.1, yoga.z - 0.8, false);
    lamp.userData.interact = it;
    p.group.add(lamp);
    // A little speaker stand for the class, the instructor's spot.
    cyl(p, 0.16, 0.2, 0.45, '#3a444d', yoga.x + 1.35, 0.225, yoga.z + 0.7, 10);
  }
  const roller = (x: number, z: number, color: string, rot = 0) => {
    const r = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.45, 12), toon(color), x, 0.095, z, false);
    r.rotation.z = Math.PI / 2;
    r.rotation.y = rot;
    p.still.add(r);
  };
  roller(12.2, 51.2, '#2b3238');
  roller(21.4, 52.4, '#2f6fd6', 0.4);
  roller(15.3, 51.1, '#e08a3f', 1.2);
  blk(p, 0.23, 0.15, 0.1, '#c9a0ff', 13.3, 0.095, 52.4);
  blk(p, 0.23, 0.15, 0.1, '#c9a0ff', 13.3, 0.095, 52.55);
  p.still.add(mesh(new THREE.SphereGeometry(0.32, 16, 12), toon('#3fa0c4'), 23.5, 0.33, 51.2, false));
  // The shelf of rollers and blocks against the spa wall, and the timetable over it.
  blk(p, 0.45, 1.0, 1.8, '#3a444d', SPA.minX - 0.25, 0.5, 51.9);
  for (let i = 0; i < 6; i++) roller(SPA.minX - 0.25, 51.2 + i * 0.28 - (i > 2 ? 0 : 0), ['#2b3238', '#2f6fd6', '#e08a3f'][i % 3], Math.PI / 2);
  for (let i = 0; i < 6; i++) blk(p, 0.12, 0.15, 0.23, '#c9a0ff', SPA.minX - 0.3, 1.08, 51.2 + i * 0.28);
  picture(p, 1.8, 1.125, glow(timetable()), SPA.minX - 0.02, 1.95, 51.9, -Math.PI / 2);

  // ---- Speakers and plants round the hall ---------------------------------------------------------
  speaker(p, 10.0, 4.85, R.minZ + 0.2, 0);
  speaker(p, 30.5, 4.85, R.minZ + 0.2, 0);
  speaker(p, R.minX + 0.2, 4.0, 44.0, Math.PI / 2);
  speaker(p, R.minX + 0.2, 4.0, 52.0, Math.PI / 2);
  speaker(p, 11.0, 4.0, R.maxZ - 0.2, Math.PI);
  speaker(p, 23.0, 4.0, R.maxZ - 0.2, Math.PI);
  plant(p, 21.75, R.minZ + 0.25, 1.3, '#a3e635');
  plant(p, 18.1, 36.6, 1.1);

  // ---- Live bits ----------------------------------------------------------------------------------
  let blending = 0;
  let yogaIn = 0;
  const setStation = (id: string, state: unknown) => {
    if (id === JUICE_BAR.id) blending = (state as JuiceBarView | null)?.occupants?.length ?? 0;
    else if (id === 'yoga') yogaIn = (state as WellnessView | null)?.occupants?.length ?? 0;
  };
  const update = (t: number, dt: number, people: readonly { x: number; z: number }[]) => {
    video.update(t);
    if (fan) fan.rotation.y = t * 0.35;
    // The blender whirs while someone's at the bar.
    smoothie.rotation.y = blending ? t * 20 : 0;
    smoothie.scale.y = blending ? 1 + Math.sin(t * 17) * 0.06 : 1;
    if (yogaLight) yogaLight.color.set(yogaIn ? LIME : '#4b5a3a');
    // Turnstile flaps swing open for anyone coming through their lane.
    for (const f of flaps) {
      const near = people.some((q) => Math.abs(q.x - f.x) < 0.55 && Math.abs(q.z - TURNSTILE.z) < 1.1);
      f.open += ((near ? 1 : 0) - f.open) * Math.min(1, dt * 8);
      f.obj.rotation.y = f.side * f.open * (Math.PI / 2);
    }
  };
  return { setStation, update };
}

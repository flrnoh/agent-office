import * as THREE from 'three';
import { BASEMENT_FLOOR, BLOCKS, FOYER, GROTTO, GROTTO_GAP, GROTTO_POOL, GROTTO_ROOF, GROTTO_STEPS, HALL, HALL_CEILING, LAP_POOL, NORTH_BAND, POOL_LOUNGERS, THERME_PASSAGE, WATERFALL, cutOut, laneZ, type BRect } from '../../../../shared/gym-basement';
import type { Interactable } from '../../types';
import { mesh, toon } from '../../toon';
import { blk, cyl, picture, seatable, tex, type GymParts } from '../kit';
import { glow } from '../parts';
import { Cloud } from '../particles';
import { tiles } from '../textures';
import { floorPatch, panel, wallSign } from './shell';
import { fallingWater, laneFloor, laneRope, mosaic, paceClock, ripples, rock, sign, wrap } from './textures';

/*
 * The pool hall (flrnoh fork, see shared/gym-basement.ts): tall and bright under skylights, out past
 * the gym's south wall. The 25 m lap pool down its middle (four lanes, lane ropes, starting blocks at
 * the west end, backstroke flags, ladders, a pace clock), loungers along the north deck, a lifeguard's
 * chair, palms; at its east end the whirlpool grotto, a cave of rock with a waterfall into a bubbling
 * basin; in its south wall the passage to the thermal baths, closed for now behind a glass door.
 */

const B = BASEMENT_FLOOR;
const TALL = HALL_CEILING - B;

export interface PoolHall {
  /** The water's surface: what you look at to jump in. */
  surface: THREE.Mesh;
  update(t: number, dt: number, people: readonly { x: number; y: number; z: number }[]): void;
}

/** A lounger facing `rotY` (0: +z), seat `seatId`. */
function loungerAt(p: GymParts, x: number, z: number, rotY: number, frame: string, cushion: string, seatId: string) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.26, 0.7), toon(frame), 0, 0.13, 0, false));
  g.add(mesh(new THREE.BoxGeometry(1.35, 0.12, 0.64), toon(cushion), -0.25, 0.33, 0, false));
  const back = mesh(new THREE.BoxGeometry(0.72, 0.1, 0.64), toon(cushion), 0.62, 0.55, 0, false);
  back.rotation.z = 0.75;
  g.add(back);
  g.position.set(x, B, z);
  g.rotation.y = rotY + Math.PI / 2;
  p.still.add(g);
  seatable(p, g, seatId, 1.2);
}

/** A palm in a big pot standing on the floor at x, z. */
function palm(p: GymParts, x: number, z: number, h = 3.2) {
  cyl(p, 0.42, 0.34, 0.7, '#e2ddd2', x, B + 0.35, z, 14);
  const trunk = toon('#8b6a45');
  for (let i = 0; i < 6; i++) cyl(p, 0.1 - i * 0.008, 0.11 - i * 0.008, h / 6, trunk, x + Math.sin(i * 0.5) * 0.04, B + 0.7 + (h / 6) * (i + 0.5), z, 7);
  const leaf = toon('#3f9a4f');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const m = mesh(new THREE.ConeGeometry(0.16, 1.5, 4), leaf, x + Math.cos(a) * 0.6, B + 0.7 + h - 0.1, z + Math.sin(a) * 0.6, false);
    m.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    p.still.add(m);
  }
}

export function buildPoolHall(p: GymParts): PoolHall {
  const P = LAP_POOL;
  // ---- The deck: pale anti-slip tiles round the pool ----
  const deck = tiles('#e9e4da', '#cfc8ba', 4, 0.05, 101);
  for (const r of cutOut({ minX: HALL.minX, maxX: HALL.maxX, minZ: NORTH_BAND.maxZ + 0.3, maxZ: HALL.maxZ }, [P, GROTTO])) floorPatch(p, r, deck, 1.0);
  floorPatch(p, { minX: FOYER.minX, maxX: FOYER.maxX, minZ: NORTH_BAND.maxZ, maxZ: NORTH_BAND.maxZ + 0.3 }, deck, 1.0);
  // ---- The walls: deep blue mosaic up to head height, white above; the ceiling's skylights ----
  const blue = mosaic('#2f6fb4', 16, 0.14, 7);
  const white = mosaic('#f4f6f6', 8, 0.04, 11);
  const wall = (len: number, x: number, z: number, rotY: number) => {
    panel(p, blue, len, 2.2, x, B + 1.1, z, rotY, len / 1.5, 1.5);
    panel(p, white, len, TALL - 2.2, x, B + 2.2 + (TALL - 2.2) / 2, z, rotY, len / 3, (TALL - 2.2) / 3);
    blk(p, len, 0.08, 0.04, '#a3e635', x + Math.sin(rotY) * 0.02, B + 2.2, z + Math.cos(rotY) * 0.02, rotY);
  };
  const n = HALL.minZ + 0.002;
  wall(FOYER.minX - HALL.minX, (HALL.minX + FOYER.minX) / 2, n, 0);
  wall(HALL.maxX - FOYER.maxX, (FOYER.maxX + HALL.maxX) / 2, n, 0);
  wall(THERME_PASSAGE.minX - HALL.minX, (HALL.minX + THERME_PASSAGE.minX) / 2, HALL.maxZ - 0.002, Math.PI);
  wall(HALL.maxX - THERME_PASSAGE.maxX, (THERME_PASSAGE.maxX + HALL.maxX) / 2, HALL.maxZ - 0.002, Math.PI);
  // Over the passage to the baths: the wall goes on above it.
  const lintelH = HALL_CEILING - (B + THERME_PASSAGE.height);
  panel(p, white, THERME_PASSAGE.maxX - THERME_PASSAGE.minX, lintelH, (THERME_PASSAGE.minX + THERME_PASSAGE.maxX) / 2, HALL_CEILING - lintelH / 2, HALL.maxZ - 0.002, Math.PI, 1.3, lintelH / 3);
  wall(HALL.maxZ - HALL.minZ, HALL.minX + 0.002, (HALL.minZ + HALL.maxZ) / 2, Math.PI / 2);
  wall(HALL.maxZ - HALL.minZ, HALL.maxX - 0.002, (HALL.minZ + HALL.maxZ) / 2, -Math.PI / 2);
  // Over the foyer's opening: the hall's name.
  picture(p, 6.4, 1.0, glow(sign('SCHWIMMHALLE', 'Bahnen · Whirlpool-Grotte · Therme', '#0f3050', '#bfeaff', 1024, 160)), (FOYER.minX + FOYER.maxX) / 2, B + 3.5, HALL.minZ + 0.01, 0);
  const sky = glow(null, '#eaf6ff');
  for (const x of [10, 19.5, 29])
    for (const z of [61, 69, 77]) {
      const s = mesh(new THREE.PlaneGeometry(3.4, 2.4), sky, x, HALL_CEILING - 0.01, z, false);
      s.rotation.x = Math.PI / 2;
      p.still.add(s);
      blk(p, 3.6, 0.08, 2.6, '#c9d2d6', x, HALL_CEILING - 0.05, z);
    }
  const hallLight = new THREE.PointLight('#e6f4ff', 6, 30, 1.2);
  hallLight.position.set(19.5, B + 5.5, 69);
  p.group.add(hallLight);

  // ---- The lap pool: tiled walls and floor, the water, the coping, lane ropes, blocks, ladders, flags ----
  const depth = P.surface - P.floor;
  const poolWall = mosaic('#5bb6e3', 16, 0.1, 13);
  const inner = (len: number, x: number, z: number, rotY: number) => panel(p, poolWall, len, depth + 0.1, x, P.floor + (depth + 0.1) / 2, z, rotY, len / 1.2, depth / 1.2);
  inner(P.maxX - P.minX, (P.minX + P.maxX) / 2, P.minZ + 0.002, 0);
  inner(P.maxX - P.minX, (P.minX + P.maxX) / 2, P.maxZ - 0.002, Math.PI);
  inner(P.maxZ - P.minZ, P.minX + 0.002, (P.minZ + P.maxZ) / 2, Math.PI / 2);
  inner(P.maxZ - P.minZ, P.maxX - 0.002, (P.minZ + P.maxZ) / 2, -Math.PI / 2);
  const floor = mesh(new THREE.PlaneGeometry(P.maxX - P.minX, P.maxZ - P.minZ), tex(laneFloor(P.lanes)), (P.minX + P.maxX) / 2, P.floor + 0.002, (P.minZ + P.maxZ) / 2, false);
  floor.rotation.x = -Math.PI / 2;
  p.group.add(floor);
  // Lit from under the water along the long walls.
  const uw = glow(null, '#bff4ff');
  for (let x = P.minX + 2.5; x < P.maxX - 1; x += 5)
    for (const [z, r] of [
      [P.minZ + 0.01, 0],
      [P.maxZ - 0.01, Math.PI],
    ] as const) {
      const l = mesh(new THREE.CircleGeometry(0.16, 14), uw, x, P.surface - 0.5, z, false);
      l.rotation.y = r;
      p.still.add(l);
    }
  const waterTex = ripples('#3f9fd6', '#bdeeff', 7);
  waterTex.repeat.set((P.maxX - P.minX) / 4, (P.maxZ - P.minZ) / 4);
  const surface = mesh(new THREE.PlaneGeometry(P.maxX - P.minX, P.maxZ - P.minZ), new THREE.MeshBasicMaterial({ map: waterTex, color: '#cfefff', transparent: true, opacity: 0.6, depthWrite: false }), (P.minX + P.maxX) / 2, P.surface, (P.minZ + P.maxZ) / 2, false);
  surface.rotation.x = -Math.PI / 2;
  surface.renderOrder = 2;
  surface.userData.noOutline = true;
  p.group.add(surface);
  // The coping round the edge (white stone), with a blue tile line inside it.
  const coping = toon('#f6f4ee');
  const c = 0.35;
  blk(p, P.maxX - P.minX + 2 * c, 0.03, c, coping, (P.minX + P.maxX) / 2, B + 0.015, P.minZ - c / 2);
  blk(p, P.maxX - P.minX + 2 * c, 0.03, c, coping, (P.minX + P.maxX) / 2, B + 0.015, P.maxZ + c / 2);
  blk(p, c, 0.03, P.maxZ - P.minZ, coping, P.minX - c / 2, B + 0.015, (P.minZ + P.maxZ) / 2);
  blk(p, c, 0.03, P.maxZ - P.minZ, coping, P.maxX + c / 2, B + 0.015, (P.minZ + P.maxZ) / 2);
  // Lane ropes between the lanes, floating.
  const rope = laneRope();
  rope.repeat.set(P.maxX - P.minX, 1);
  const ropeMat = tex(rope);
  for (let lane = 1; lane < P.lanes; lane++) {
    const z = P.minZ + ((P.maxZ - P.minZ) / P.lanes) * lane;
    const r = mesh(new THREE.CylinderGeometry(0.06, 0.06, P.maxX - P.minX, 8), ropeMat, (P.minX + P.maxX) / 2, P.surface + 0.02, z, false);
    r.rotation.z = Math.PI / 2;
    p.group.add(r);
  }
  // Starting blocks at the west end, numbered, with their step behind.
  for (let lane = 0; lane < P.lanes; lane++) {
    const z = laneZ(lane);
    blk(p, BLOCKS.maxX - BLOCKS.minX, BLOCKS.top - B, BLOCKS.half * 2, '#f2f2f0', (BLOCKS.minX + BLOCKS.maxX) / 2, (BLOCKS.top + B) / 2, z);
    blk(p, BLOCKS.maxX - BLOCKS.minX + 0.04, 0.03, BLOCKS.half * 2 + 0.04, '#1e5bd8', (BLOCKS.minX + BLOCKS.maxX) / 2, BLOCKS.top + 0.015, z);
    blk(p, 0.35, BLOCKS.step - B, BLOCKS.half * 2, '#d9d6cf', BLOCKS.minX - 0.175, (BLOCKS.step + B) / 2, z);
    picture(p, 0.4, 0.3, glow(sign(String(lane + 1), '', '#1e5bd8', '#ffffff', 128, 96)), BLOCKS.maxX + 0.005, BLOCKS.top - 0.2, z, Math.PI / 2);
  }
  // Ladders: two chrome rails over the edge, at each long side.
  const chrome = toon('#c3ccd1');
  for (const x of [10.5, 28.5])
    for (const [z, d] of [
      [P.minZ, 1],
      [P.maxZ, -1],
    ] as const)
      for (const dx of [-0.25, 0.25]) {
        const rail = mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 12, Math.PI), chrome, x + dx, B + 0.3, z - d * 0.02, false);
        rail.rotation.y = Math.PI / 2;
        rail.rotation.x = d > 0 ? 0 : Math.PI;
        p.still.add(rail);
        cyl(p, 0.025, 0.025, 1.2, chrome, x + dx, B - 0.3, z + d * 0.26, 6);
      }
  // Backstroke flags: a line of little pennants across the pool five metres from each end.
  const flagCols = ['#e53935', '#f4f4f4', '#1e5bd8'];
  for (const x of [P.minX + 5, P.maxX - 5]) {
    for (const z of [P.minZ - 0.6, P.maxZ + 0.6]) cyl(p, 0.035, 0.035, 2.0, '#9aa4ab', x, B + 1.0, z, 6);
    const line = mesh(new THREE.CylinderGeometry(0.01, 0.01, P.maxZ - P.minZ + 1.2, 4), toon('#5a6168'), x, B + 1.95, (P.minZ + P.maxZ) / 2, false);
    line.rotation.x = Math.PI / 2;
    p.still.add(line);
    for (let i = 0; i * 0.5 < P.maxZ - P.minZ + 0.6; i++) {
      const f = mesh(new THREE.ConeGeometry(0.12, 0.28, 3), toon(flagCols[i % 3]), x, B + 1.78, P.minZ - 0.3 + i * 0.5, false);
      f.rotation.x = Math.PI;
      p.still.add(f);
    }
  }
  // The pace clock on the west wall, over the blocks, its red hand sweeping the seconds.
  picture(p, 1.4, 1.4, glow(paceClock()), HALL.minX + 0.03, B + 3.1, 69, Math.PI / 2);
  const clock = new THREE.Group();
  const hand = new THREE.Group();
  hand.add(mesh(new THREE.BoxGeometry(0.03, 0.6, 0.02), new THREE.MeshBasicMaterial({ color: '#e53935' }), 0, 0.26, 0, false));
  clock.add(hand);
  clock.position.set(HALL.minX + 0.05, B + 3.1, 69);
  clock.rotation.y = Math.PI / 2;
  p.group.add(clock);
  wallSign(p, '25 m', 'Bahnen · lanes 1–4', HALL.minX + 0.03, B + 4.3, 69, Math.PI / 2, 1.6, '#1e5bd8', '#ffffff');
  // The lifeguard's tall chair, a rescue ring on it.
  const lg = toon('#f2f2f0');
  for (const [dx, dz] of [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ])
    cyl(p, 0.04, 0.04, 1.8, lg, 19.5 + dx, B + 0.9, 62.1 + dz, 6);
  blk(p, 0.9, 0.08, 0.9, lg, 19.5, B + 1.8, 62.1);
  blk(p, 0.9, 0.7, 0.08, lg, 19.5, B + 2.2, 61.7);
  const ring = mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 18), toon('#ff5a3c'), 19.5, B + 1.3, 62.56, false);
  p.still.add(ring);
  // Loungers along the north deck, and palms.
  POOL_LOUNGERS.forEach((l, i) => loungerAt(p, l.x, l.z, 0, '#f2f2f0', i % 2 ? '#7fc7e8' : '#ffd36b', `gym-poolside-${i + 1}`));
  for (const [x, z] of [
    [5.4, 57.6],
    [17.0, 57.6],
    [34.0, 57.6],
    [5.4, 80.4],
    [33.0, 80.4],
    [12.0, 80.4],
  ])
    palm(p, x, z);

  // ---- The thermal baths' passage: tiled, a closed glass door, a coming-soon sign ----
  const T = THERME_PASSAGE;
  const tl = tiles('#d8cbb6', '#b5a68e', 4, 0.06, 103);
  floorPatch(p, { minX: T.minX, maxX: T.maxX, minZ: HALL.maxZ, maxZ: T.door }, tl, 1.0);
  panel(p, tl, T.door - HALL.maxZ, T.height, T.minX + 0.002, B + T.height / 2, (HALL.maxZ + T.door) / 2, Math.PI / 2, 4, 2);
  panel(p, tl, T.door - HALL.maxZ, T.height, T.maxX - 0.002, B + T.height / 2, (HALL.maxZ + T.door) / 2, -Math.PI / 2, 4, 2);
  const glass = mesh(new THREE.PlaneGeometry(T.maxX - T.minX, T.height), toon('#9fd8e6', { transparent: true, opacity: 0.55 }), (T.minX + T.maxX) / 2, B + T.height / 2, T.door, false);
  glass.rotation.y = Math.PI;
  glass.userData.noOutline = true;
  p.group.add(glass);
  blk(p, 0.06, T.height, 0.08, '#2a2f35', (T.minX + T.maxX) / 2, B + T.height / 2, T.door);
  picture(p, 3.2, 1.0, glow(sign('THERME', 'bald geöffnet · coming soon', '#3b2412', '#ffcf8a', 512, 160)), (T.minX + T.maxX) / 2, B + 1.6, T.door - 0.03, Math.PI);
  picture(p, 4.2, 0.9, glow(sign('→ THERME', 'Thermalbad · demnächst', '#3b2412', '#ffcf8a', 768, 160)), (T.minX + T.maxX) / 2, B + T.height + 0.7, HALL.maxZ - 0.01, Math.PI);
  // A barrier across in front of the door, red and white.
  for (const x of [T.minX + 0.3, T.maxX - 0.3]) cyl(p, 0.04, 0.05, 0.9, '#2a2f35', x, B + 0.45, T.door - 0.8, 6);
  const tape = mesh(new THREE.BoxGeometry(T.maxX - T.minX - 0.6, 0.08, 0.02), tex(stripes()), (T.minX + T.maxX) / 2, B + 0.82, T.door - 0.8, false);
  p.group.add(tape);

  // ---- The whirlpool grotto: rock walls and roof, the basin, the waterfall ----
  const G = GROTTO;
  const W = GROTTO_POOL;
  const rk = rock();
  const rockMat = tex(rk, '#ffffff');
  const boulder = (x: number, y: number, z: number, r: number, seed: number) => {
    const m = mesh(new THREE.DodecahedronGeometry(r, 0), rockMat, x, y, z, false);
    m.rotation.set(seed * 1.3, seed * 2.1, seed * 0.7);
    m.scale.set(1, 0.8 + (seed % 3) * 0.12, 1);
    p.group.add(m);
  };
  const rockWall = (r: BRect, seed: number) => {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    p.group.add(mesh(new THREE.BoxGeometry(w, GROTTO_ROOF - B, d), rockMat, (r.minX + r.maxX) / 2, (GROTTO_ROOF + B) / 2, (r.minZ + r.maxZ) / 2, false));
    const along = Math.max(w, d);
    for (let i = 0; i < along / 0.9; i++) {
      const k = (i + 0.5) / (along / 0.9);
      const x = w > d ? r.minX + w * k : (r.minX + r.maxX) / 2;
      const z = w > d ? (r.minZ + r.maxZ) / 2 : r.minZ + d * k;
      boulder(x, B + 0.4 + ((i * 37 + seed) % 5) * 0.35, z, 0.45 + ((i + seed) % 3) * 0.12, i + seed);
    }
  };
  rockWall({ minX: G.minX, maxX: G.maxX, minZ: G.minZ, maxZ: G.minZ + 0.6 }, 1);
  rockWall({ minX: G.minX, maxX: G.maxX, minZ: G.maxZ - 0.6, maxZ: G.maxZ }, 2);
  rockWall({ minX: G.minX, maxX: G.minX + 0.6, minZ: G.minZ, maxZ: GROTTO_GAP.minZ }, 3);
  rockWall({ minX: G.minX, maxX: G.minX + 0.6, minZ: GROTTO_GAP.maxZ, maxZ: G.maxZ }, 4);
  // Its roof: a slab of rock, lumpy underneath, dotted with little lights like a starry cave.
  p.group.add(mesh(new THREE.BoxGeometry(G.maxX - G.minX, 0.5, G.maxZ - G.minZ), rockMat, (G.minX + G.maxX) / 2, GROTTO_ROOF + 0.25, (G.minZ + G.maxZ) / 2, false));
  for (let i = 0; i < 14; i++) boulder(G.minX + 0.6 + ((i * 1.7) % (G.maxX - G.minX - 1.2)), GROTTO_ROOF - 0.05, G.minZ + 0.9 + ((i * 2.9) % (G.maxZ - G.minZ - 1.8)), 0.35 + (i % 3) * 0.1, i);
  const fairy = glow(null, '#ffe9a8');
  for (let i = 0; i < 40; i++) p.still.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), fairy, G.minX + 0.8 + ((i * 0.83) % (G.maxX - G.minX - 1.4)), GROTTO_ROOF - 0.04, G.minZ + 0.8 + ((i * 1.37) % (G.maxZ - G.minZ - 1.6)), false));
  // The grotto's floor: dark slate; the basin: teal tiles, lit from inside, warm water.
  const slate = tiles('#3d4648', '#2b3133', 3, 0.12, 107);
  // The whole cave's floor, the way in through the rock included (no gap to the hall's deck), open over the basin.
  for (const r of cutOut(G, [W])) floorPatch(p, r, slate, 1.0);
  // The cave's back wall is rock too, not the hall's tiles.
  const back = rk.clone();
  wrap(back, (G.maxZ - G.minZ) / 2, (GROTTO_ROOF - B) / 2);
  back.needsUpdate = true;
  picture(p, G.maxZ - G.minZ - 1.2, GROTTO_ROOF - B, tex(back, '#d8d0c4'), G.maxX - 0.04, (GROTTO_ROOF + B) / 2, (G.minZ + G.maxZ) / 2, -Math.PI / 2);
  const teal = mosaic('#1f8f8f', 12, 0.12, 19);
  const bd = B - W.floor;
  panel(p, teal, W.maxX - W.minX, bd, (W.minX + W.maxX) / 2, W.floor + bd / 2, W.minZ + 0.002, 0, 3, 1);
  panel(p, teal, W.maxX - W.minX, bd, (W.minX + W.maxX) / 2, W.floor + bd / 2, W.maxZ - 0.002, Math.PI, 3, 1);
  panel(p, teal, W.maxZ - W.minZ, bd, W.maxX - 0.002, W.floor + bd / 2, (W.minZ + W.maxZ) / 2, -Math.PI / 2, 3, 1);
  floorPatch(p, W, teal, 1.0, 0.003, W.floor);
  for (const [i, s] of GROTTO_STEPS.entries()) blk(p, s.maxX - s.minX, s.top - W.floor, W.maxZ - W.minZ, '#2a7f80', (s.minX + s.maxX) / 2, (s.top + W.floor) / 2 - i * 0.001, (W.minZ + W.maxZ) / 2);
  blk(p, 0.55, 0.45, W.maxZ - W.minZ - 0.6, '#2a7f80', 38.92, W.floor + 0.225, (W.minZ + W.maxZ) / 2);
  for (const z of [W.minZ - 0.125, W.maxZ + 0.125]) blk(p, W.maxX - W.minX, 0.5, 0.25, '#6f675e', (W.minX + W.maxX) / 2, B + 0.1, z);
  const warmTex = ripples('#29b3b0', '#d6fffb', 23);
  const warm = mesh(new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - W.minZ), new THREE.MeshBasicMaterial({ map: warmTex, color: '#d8fffa', transparent: true, opacity: 0.62, depthWrite: false }), (W.minX + W.maxX) / 2, W.water, (W.minZ + W.maxZ) / 2, false);
  warm.rotation.x = -Math.PI / 2;
  warm.renderOrder = 2;
  warm.userData.noOutline = true;
  p.group.add(warm);
  // E at the water (or the bench under it): down the steps and sit in the bubbles, the jets in your back.
  seatable(p, warm, 'gym-grotto-bench', 2.6);
  const grottoLight = new THREE.PointLight('#5ff0e0', 5, 8, 1.5);
  grottoLight.position.set((W.minX + W.maxX) / 2, B + 0.3, (W.minZ + W.maxZ) / 2);
  p.group.add(grottoLight);
  // The waterfall: a sheet of falling water down the east wall's rock into the basin, foam where it lands.
  const fallTex = fallingWater();
  const fh = WATERFALL.top - W.water;
  const fall = mesh(new THREE.PlaneGeometry(WATERFALL.width, fh), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false }), WATERFALL.x - 0.25, W.water + fh / 2, WATERFALL.z, false);
  fall.rotation.y = -Math.PI / 2;
  fall.userData.noOutline = true;
  p.group.add(fall);
  boulder(WATERFALL.x - 0.15, WATERFALL.top + 0.1, WATERFALL.z, 0.55, 5);
  const foam = new Cloud(160, '#ffffff');
  foam.lift = 0.4;
  foam.drag = 1.5;
  p.group.add(foam.points);
  const bubbles = new Cloud(200, '#effffd');
  bubbles.lift = 0.6;
  bubbles.drag = 0.4;
  p.group.add(bubbles.points);
  picture(p, 1.6, 0.5, glow(sign('🌊 WHIRLPOOL', 'Grotte · 36 °C', '#0e3a3a', '#a8fff4', 512, 160)), G.minX - 0.02, GROTTO_ROOF + 0.25, (GROTTO_GAP.minZ + GROTTO_GAP.maxZ) / 2, -Math.PI / 2);

  // Looking at the water (or the blocks) is looking at the pool: E there jumps in (client/gym-basement.ts).
  const poolIt: Interactable = { kind: 'gymstation', gymStation: 'lappool', gymAct: 'jump', x: (P.minX + P.maxX) / 2, z: (P.minZ + P.maxZ) / 2, y: B, radius: 14 };
  p.interactables.push(poolIt);
  surface.userData.interact = poolIt;

  const v = new THREE.Vector3();
  return {
    surface,
    update(t, dt, people) {
      waterTex.offset.set((t * 0.02) % 1, (t * 0.011) % 1);
      warmTex.offset.set((t * 0.05) % 1, (t * 0.04) % 1);
      fallTex.offset.y = (t * 1.2) % 1;
      hand.rotation.z = -(((Date.now() / 1000) % 60) / 60) * Math.PI * 2;
      foam.emit(Math.ceil(dt * 30), { at: v.set(WATERFALL.x - 0.4, W.water + 0.05, WATERFALL.z), spread: { x: 0.25, y: 0.02, z: WATERFALL.width / 2 }, vel: { x: -0.3, y: 0.2, z: 0 }, jitter: 0.25, life: 1.4, size0: 0.15, size1: 0.45, alpha: 0.5 });
      const busy = people.filter((q) => q.x > W.minX && q.x < W.maxX && q.z > W.minZ && q.z < W.maxZ && q.y < B - 0.2).length;
      bubbles.emit(Math.ceil(dt * (20 + busy * 25)), { at: v.set((W.minX + W.maxX) / 2 + 0.3, W.floor + 0.1, (W.minZ + W.maxZ) / 2), spread: { x: 1.4, y: 0.05, z: 1.7 }, vel: { x: 0, y: 0.5, z: 0 }, jitter: 0.15, life: 1.4, size0: 0.05, size1: 0.12, alpha: 0.7 });
      foam.update(dt);
      bubbles.update(dt);
    },
  };
}

/** Red and white barrier tape. */
function stripes(): THREE.CanvasTexture {
  const t = sign('', '', '#ffffff', '#ffffff', 128, 16);
  const g = (t.image as HTMLCanvasElement).getContext('2d')!;
  g.fillStyle = '#e53935';
  for (let x = -16; x < 128; x += 32) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 16);
    g.fill();
  }
  t.needsUpdate = true;
  return wrap(t, 6, 1);
}

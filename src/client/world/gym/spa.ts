import * as THREE from 'three';
import { GYM_ROOM, GYM_STATION_BY_ID } from '../../../shared/gym';
import type { WellnessView } from '../../../shared/gym-wellness';
import { CABIN_HEIGHT, JACUZZI, LOUNGER, LOUNGER_ZS, MASSAGE_OPENING, MASSAGE_ROOM, MASSAGE_TABLES, PLUNGE, SAUNA, SPA, SPA_DOOR, SPA_WALL, SPA_WALL_HEIGHT, STEAM, cabinWalls, inRect, type WalkInRoom } from '../../../shared/gym-rooms';
import type { Interactable } from '../office';
import { mesh, textPlane, toon } from '../toon';
import { blk, candle, cyl, decal, flameMat, picture, plant, seatable, tex, type GymParts } from './kit';
import { Cloud } from './particles';
import { canvasTexture, FONT, glow, neonSign } from './parts';
import { curtain, planks, tiles, water } from './textures';

/*
 * The gym's wellness spa (flrnoh fork, see FORK.md "Rooms, spa and detail"): behind its own wooden
 * walls in the south-east corner. Two walk-in cabins you go into through a glass door that swings
 * open as someone comes up: the Finnish sauna (two tiers of cedar benches you can sit on, a stove
 * with glowing stones, the bucket and ladle for an Aufguss, an hourglass, a thermometer, a warm dim
 * light, a heat shimmer, and a burst of steam everyone sees when someone pours) and the tiled steam
 * room (benches, a eucalyptus bowl, thick mist). Then a jacuzzi with bubbling water and steps, a cold
 * plunge full of ice, relaxation loungers with towels, and a massage room behind a curtain. Candles,
 * plants and soft light throughout. Colliders come from shared/gym-rooms.ts.
 */

const R = GYM_ROOM;
const IDLE = '#4b5a3a';
const ON = '#a3e635';

/** What the spa needs to know each frame: where you and your camera are, and where everyone is. */
export interface SpaView {
  me: { x: number; y: number; z: number } | null;
  cam: THREE.Vector3 | null;
  people: readonly { x: number; z: number }[];
}

export interface GymSpa {
  setStation(id: string, state: unknown): void;
  update(t: number, dt: number, view: SpaView): void;
  /** The walk-in room you're in, if any (for the page's hint and ambience). */
  roomAt(x: number, z: number): WalkInRoom | undefined;
}

interface Cabin {
  room: WalkInRoom;
  shell: THREE.Group;
  door: THREE.Object3D;
  open: number;
  cloud: Cloud;
  light: THREE.PointLight;
  base: number;
  puffAt: number;
  puffShown: number;
  burstUntil: number;
  emitAcc: number;
  occupied: number;
  dot: THREE.MeshBasicMaterial;
}

/** A round dial: the sauna's thermometer and hygrometer. */
function dial(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#6b4a2b';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f4ecd8';
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2a1e';
    g.lineWidth = 2;
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
      g.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
      g.stroke();
    }
    const needle = Math.PI * 0.75 + 0.85 * Math.PI * 1.5;
    g.strokeStyle = '#c1443a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(needle) * 42, 64 + Math.sin(needle) * 42);
    g.stroke();
    g.fillStyle = '#3a2a1e';
    g.font = `800 20px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('85 °C', 64, 96);
    g.font = `600 12px ${FONT}`;
    g.fillText('15 %', 64, 40);
  });
}

export function buildGymSpa(p: GymParts): GymSpa {
  // Bits of the sauna the frame animates.
  let stoveEmber: THREE.MeshBasicMaterial | null = null;
  let sandTop: THREE.Mesh | null = null;
  let sandBottom: THREE.Mesh | null = null;
  let bubblesAcc = 0;
  const steel = toon('#8e989e');
  const cedar = planks('#b07a45', 8, 51);
  cedar.wrapS = cedar.wrapT = THREE.RepeatWrapping;
  const light = planks('#c8935a', 5, 61);
  light.wrapS = light.wrapT = THREE.RepeatWrapping;
  const mosaic = tiles('#9fb8c2', '#6d8590', 8, 0.08, 71);
  mosaic.wrapS = mosaic.wrapT = THREE.RepeatWrapping;

  // ---- The spa's floor and its wooden partition ---------------------------------------------------
  const stone = tiles('#cbb8a0', '#9a8a76', 4, 0.07, 81);
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  stone.repeat.set((R.maxX - SPA.minX) / 1.2, (SPA.maxZ - SPA.minZ) / 1.2);
  decal(p, { minX: SPA.minX + SPA_WALL, maxX: R.maxX, minZ: SPA.minZ + SPA_WALL, maxZ: R.maxZ }, tex(stone), 0.007);
  const slat = planks('#c69c6d', 6, 91);
  slat.wrapS = slat.wrapT = THREE.RepeatWrapping;
  const partition = (x0: number, x1: number, z0: number, z1: number) => {
    const len = Math.max(x1 - x0, z1 - z0);
    const t = slat.clone();
    t.repeat.set(len / 2, 1.4);
    t.needsUpdate = true;
    p.group.add(mesh(new THREE.BoxGeometry(x1 - x0, SPA_WALL_HEIGHT, z1 - z0), tex(t), (x0 + x1) / 2, SPA_WALL_HEIGHT / 2, (z0 + z1) / 2, false));
    blk(p, x1 - x0 + 0.04, 0.06, z1 - z0 + 0.04, ON, (x0 + x1) / 2, SPA_WALL_HEIGHT + 0.03, (z0 + z1) / 2);
  };
  partition(SPA.minX, SPA.minX + SPA_WALL, SPA.minZ, SPA.maxZ);
  partition(SPA.minX, SPA_DOOR.minX, SPA.minZ, SPA.minZ + SPA_WALL);
  partition(SPA_DOOR.maxX, R.maxX, SPA.minZ, SPA.minZ + SPA_WALL);
  // Over the way in: a lintel, the sign, and a "quiet please".
  blk(p, SPA_DOOR.maxX - SPA_DOOR.minX, 0.5, SPA_WALL, '#c69c6d', (SPA_DOOR.minX + SPA_DOOR.maxX) / 2, SPA_WALL_HEIGHT - 0.25, SPA.minZ + SPA_WALL / 2);
  picture(p, 3.4, 0.71, glow(neonSign('WELLNESS SPA', '#ffd36b', 768, 160, '#1a140c')), (SPA_DOOR.minX + SPA_DOOR.maxX) / 2, SPA_WALL_HEIGHT + 0.5, SPA.minZ - 0.02, Math.PI);
  const quiet = textPlane('🤫 Ruhebereich · quiet please', { bg: '#1a140c', color: '#ffd36b', size: 30 });
  quiet.position.set(30.8, 1.8, SPA.minZ - 0.01);
  quiet.rotation.y = Math.PI;
  quiet.scale.setScalar(0.8);
  p.group.add(quiet);
  // Towels and candles by the way in, and a big plant.
  blk(p, 1.6, 1.4, 0.4, '#c69c6d', 25.8, 0.7, SPA.minZ + SPA_WALL + 0.2);
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 5; i++) {
      const t = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 10), toon(r === 1 ? '#f4f4ee' : '#e8dccb'), 25.15 + i * 0.32, 0.25 + r * 0.42, SPA.minZ + SPA_WALL + 0.22, false);
      t.rotation.x = Math.PI / 2;
      p.still.add(t);
    }
  for (const x of [25.3, 25.8, 26.3]) candle(p, x, 1.4, SPA.minZ + SPA_WALL + 0.2, 0.08 + (x % 1) * 0.05);
  plant(p, 28.97, SPA.minZ + SPA_WALL + 0.27, 1.25, '#c69c6d');

  // ---- Cabins: the sauna and the steam room --------------------------------------------------------
  const cabins: Cabin[] = [];
  const buildCabin = (room: WalkInRoom, outside: THREE.Material, inside: THREE.Material, glass: THREE.Material, lightColor: string, lightI: number) => {
    const shell = new THREE.Group();
    // The walls (west either side of the door, north) and the roof, from the shared plan.
    for (const f of cabinWalls(room)) {
      const h = f.top - (f.bottom ?? 0);
      shell.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, h, f.maxZ - f.minZ), f.id.endsWith('roof') ? toon('#3a2f26') : outside, (f.minX + f.maxX) / 2, (f.bottom ?? 0) + h / 2, (f.minZ + f.maxZ) / 2, false));
    }
    // Inside, the gym's own walls (east and south) are clad to match.
    const inn = room.inner;
    // (In front of the hall's wainscot, which runs round behind them.)
    const ew = picture(p, inn.maxZ - inn.minZ, CABIN_HEIGHT, inside, inn.maxX - 0.04, CABIN_HEIGHT / 2, (inn.minZ + inn.maxZ) / 2, -Math.PI / 2);
    shell.add(ew);
    if (inn.maxZ >= R.maxZ - 0.01) shell.add(picture(p, inn.maxX - inn.minX, CABIN_HEIGHT, inside, (inn.minX + inn.maxX) / 2, CABIN_HEIGHT / 2, inn.maxZ - 0.04, Math.PI));
    // The ceiling from inside.
    const ceil = picture(p, inn.maxX - inn.minX, inn.maxZ - inn.minZ, inside, (inn.minX + inn.maxX) / 2, CABIN_HEIGHT - 0.005, (inn.minZ + inn.maxZ) / 2, 0);
    ceil.rotation.x = Math.PI / 2;
    shell.add(ceil);
    p.group.add(shell);
    // The glass door: a leaf on a hinge at its north edge, swinging out into the spa.
    const d = room.door;
    const hinge = new THREE.Group();
    hinge.position.set(room.outer.minX - 0.01, 0, d.z - d.width / 2);
    const leaf = new THREE.Group();
    leaf.add(mesh(new THREE.BoxGeometry(0.03, 2.02, d.width - 0.06), glass, 0, 1.03, d.width / 2, false));
    const frame = room.machine === 'sauna' ? toon('#8a5a33') : steel;
    for (const [w, h, dz, y] of [
      [0.05, 2.06, 0.03, 1.03],
      [0.05, 2.06, d.width - 0.03, 1.03],
      [0.05, 0.06, d.width / 2, 2.04],
      [0.05, 0.06, d.width / 2, 0.03],
    ] as const)
      leaf.add(mesh(new THREE.BoxGeometry(w, h, 0.05), frame, 0, y, dz, false));
    leaf.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.05), room.machine === 'sauna' ? toon('#5b3a1e') : steel, -0.05, 1.05, d.width - 0.12, false));
    hinge.add(leaf);
    p.group.add(hinge);
    // A sign by the door.
    const sign = textPlane(room.machine === 'sauna' ? '🧖 SAUNA · 85 °C' : '💨 DAMPFBAD · 45 °C', { bg: room.machine === 'sauna' ? '#3a2412' : '#16262d', color: room.machine === 'sauna' ? '#ffcf8a' : '#cdeefd', size: 34 });
    sign.position.set(room.outer.minX - 0.01, 2.25, d.z);
    sign.rotation.y = -Math.PI / 2;
    sign.scale.setScalar(0.75);
    shell.add(sign);
    // The warm (or cool) light inside.
    const l = new THREE.PointLight(lightColor, lightI, 5, 1.6);
    l.position.set((inn.minX + inn.maxX) / 2, CABIN_HEIGHT - 0.4, (inn.minZ + inn.maxZ) / 2);
    p.group.add(l);
    // The clouds: the sauna's steam over the stove, the steam room's mist everywhere.
    const cloud = new Cloud(room.machine === 'sauna' ? 160 : 260, room.machine === 'sauna' ? '#fff3e6' : '#f2f8ff');
    cloud.bounds = new THREE.Box3(new THREE.Vector3(inn.minX + 0.1, 0.1, inn.minZ + 0.1), new THREE.Vector3(inn.maxX - 0.1, CABIN_HEIGHT - 0.15, inn.maxZ - 0.1));
    p.group.add(cloud.points);
    const dot = glow(null, IDLE);
    const lamp = mesh(new THREE.SphereGeometry(0.05, 8, 6), dot, room.outer.minX - 0.04, 2.0, d.z + d.width / 2 + 0.2, false);
    p.group.add(lamp);
    const c: Cabin = { room, shell, door: hinge, open: 0, cloud, light: l, base: lightI, puffAt: 0, puffShown: 0, burstUntil: 0, emitAcc: 0, occupied: 0, dot };
    cabins.push(c);
    return c;
  };

  // The sauna: cedar outside, lighter spruce inside, bronze-tinted glass.
  const saunaOut = tex(cedar.clone());
  (saunaOut.map as THREE.Texture).repeat.set(2, 1.2);
  (saunaOut.map as THREE.Texture).needsUpdate = true;
  const saunaIn = tex(light.clone());
  (saunaIn.map as THREE.Texture).repeat.set(2.5, 1.6);
  (saunaIn.map as THREE.Texture).needsUpdate = true;
  saunaIn.side = THREE.DoubleSide;
  const bronze = new THREE.MeshToonMaterial({ color: '#f0c996', transparent: true, opacity: 0.38, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  const sauna = buildCabin(SAUNA, saunaOut, saunaIn, bronze, '#ff9448', 4);
  /** Hung on the cabin's walls: goes with them when they lift away for a camera outside. */
  const onWall = <O extends THREE.Object3D>(o: O): O => (sauna.shell.add(o), o);
  {
    const inn = SAUNA.inner;
    // Duckboards on the floor.
    const duck = light.clone();
    duck.repeat.set(3, 3);
    duck.needsUpdate = true;
    decal(p, inn, tex(duck, '#e6c79c'), 0.012);
    // Benches: two tiers along the east wall and along the south wall, slatted tops, a backrest on the wall.
    const bench = tex(light.clone(), '#f0cf9f');
    (bench.map as THREE.Texture).repeat.set(1.5, 0.6);
    const benchBox = (x0: number, x1: number, z0: number, z1: number, top: number) => {
      const m = mesh(new THREE.BoxGeometry(x1 - x0, top, z1 - z0), bench, (x0 + x1) / 2, top / 2, (z0 + z1) / 2, false);
      p.group.add(m);
      blk(p, x1 - x0 + 0.02, 0.03, z1 - z0 + 0.02, '#e2b27a', (x0 + x1) / 2, top + 0.005, (z0 + z1) / 2);
      return m;
    };
    const lowE = benchBox(32.05, 32.85, inn.minZ, 54.05, 0.45);
    const highE = benchBox(32.85, R.maxX, inn.minZ, R.maxZ, 0.9);
    const lowS = benchBox(inn.minX, 32.85, 54.05, 54.85, 0.45);
    const highS = benchBox(inn.minX, 32.85, 54.85, R.maxZ, 0.9);
    seatable(p, lowE, 'gym-sauna-low-e', 1.4);
    seatable(p, highE, 'gym-sauna-high-e', 1.6);
    seatable(p, lowS, 'gym-sauna-low-s', 1.2);
    seatable(p, highS, 'gym-sauna-high-s', 1.5);
    // Backrest boards along the walls above the top tier.
    for (const y of [1.35, 1.55, 1.75]) {
      blk(p, 0.04, 0.12, inn.maxZ - inn.minZ, '#d19a60', R.maxX - 0.04, y, (inn.minZ + inn.maxZ) / 2);
      blk(p, 32.85 - inn.minX, 0.12, 0.04, '#d19a60', (inn.minX + 32.85) / 2, y, R.maxZ - 0.04);
    }
    // The stove: a steel box, a cage of stones on top, some glowing; a wooden guard rail round it.
    const sx = 30.45;
    const sz = 51.05;
    blk(p, 0.6, 0.55, 0.5, '#2b2f33', sx, 0.275, sz);
    blk(p, 0.64, 0.04, 0.54, '#1b1f23', sx, 0.56, sz);
    for (let i = 0; i < 4; i++) blk(p, 0.02, 0.3, 0.54, '#1b1f23', sx - 0.3 + i * 0.2, 0.72, sz);
    const rocks = ['#6b6f72', '#5a5e61', '#7c7f80', '#4d5053'];
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39;
      const r = 0.05 + (i % 5) * 0.045;
      p.still.add(mesh(new THREE.IcosahedronGeometry(0.06 + (i % 3) * 0.015, 0), toon(rocks[i % 4]), sx + Math.cos(a) * r, 0.62 + (i % 4) * 0.05, sz + Math.sin(a) * r * 0.8, false));
    }
    const ember = glow(null, '#ff6a2a');
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7 + 0.4;
      p.group.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), ember, sx + Math.cos(a) * 0.12, 0.64 + (i % 2) * 0.05, sz + Math.sin(a) * 0.1, false));
    }
    // A glowing slot at the front of the firebox.
    picture(p, 0.36, 0.08, ember, sx, 0.28, sz + 0.255, 0);
    for (const [x0, x1, z0, z1] of [
      [30.05, 30.85, 51.42, 51.45],
      [30.05, 30.08, inn.minZ, 51.45],
      [30.82, 30.85, inn.minZ, 51.45],
    ])
      for (const y of [0.35, 0.8]) blk(p, x1 - x0, 0.06, z1 - z0, '#d19a60', (x0 + x1) / 2, y, (z0 + z1) / 2);
    for (const [x, z] of [
      [30.065, 51.435],
      [30.835, 51.435],
    ])
      blk(p, 0.04, 0.9, 0.04, '#d19a60', x, 0.45, z);
    stoveEmber = ember;
    // The bucket and ladle: E there pours an Aufguss.
    const b = SAUNA.pour;
    const bucketMat = tex(planks('#b07a45', 6, 93));
    const bucket = mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 14), bucketMat, b.x, 0.13, b.z, false);
    p.group.add(bucket);
    for (const y of [0.05, 0.21]) {
      const band = mesh(new THREE.TorusGeometry(0.15 - (0.21 - y) * 0.12, 0.008, 4, 18), steel, b.x, y, b.z, false);
      band.rotation.x = Math.PI / 2;
      p.still.add(band);
    }
    const water2 = mesh(new THREE.CircleGeometry(0.14, 14), glow(null, '#9fd3e6'), b.x, 0.24, b.z, false);
    water2.rotation.x = -Math.PI / 2;
    p.group.add(water2);
    const ladle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), toon('#8a5a33'), b.x + 0.08, 0.42, b.z + 0.03, false);
    ladle.rotation.z = -0.35;
    p.still.add(ladle);
    cyl(p, 0.05, 0.04, 0.05, '#8a5a33', b.x - 0.01, 0.2, b.z + 0.03, 8);
    const pourIt: Interactable = { kind: 'gym-station', gymStation: SAUNA.station, gymAct: 'ladle', x: b.x, z: b.z, y: 0, radius: 1.3 };
    p.interactables.push(pourIt);
    bucket.userData.interact = pourIt;
    // An hourglass and the thermometer/hygrometer on the wall by the door, a lamp in the corner.
    const hx = inn.minX + 0.03;
    const hz = 53.45;
    onWall(blk(p, 0.04, 0.5, 0.2, '#8a5a33', hx, 1.55, hz));
    const glassMat = toon('#e8f4f8', { opacity: 0.45 });
    for (const [y, flip] of [
      [1.67, 1],
      [1.43, -1],
    ] as const) {
      const cone = mesh(new THREE.ConeGeometry(0.07, 0.2, 10, 1, true), glassMat, hx + 0.1, y, hz, false);
      if (flip > 0) cone.rotation.x = Math.PI;
      onWall(cone);
    }
    sandTop = mesh(new THREE.ConeGeometry(0.055, 0.12, 10), toon('#e6c27a'), hx + 0.1, 1.61, hz, false);
    sandTop.rotation.x = Math.PI;
    sandBottom = mesh(new THREE.ConeGeometry(0.06, 0.1, 10), toon('#e6c27a'), hx + 0.1, 1.38, hz, false);
    onWall(sandTop);
    onWall(sandBottom);
    for (const y of [1.3, 1.8]) onWall(blk(p, 0.2, 0.03, 0.2, '#8a5a33', hx + 0.1, y, hz));
    onWall(picture(p, 0.3, 0.3, tex(dial()), inn.minX + 0.02, 1.6, 54.0, Math.PI / 2));
    // The lamp: a wooden shade in the corner over the top bench, glowing behind its slats.
    onWall(blk(p, 0.3, 0.4, 0.3, '#8a5a33', R.maxX - 0.2, 2.1, R.maxZ - 0.2));
    onWall(picture(p, 0.22, 0.3, glow(null, '#ffb36b'), R.maxX - 0.2, 2.1, R.maxZ - 0.36, Math.PI));
    onWall(picture(p, 0.22, 0.3, glow(null, '#ffb36b'), R.maxX - 0.36, 2.1, R.maxZ - 0.2, -Math.PI / 2));
    // A towel on the top bench.
    blk(p, 0.5, 0.03, 0.7, '#f4f4ee', 33.25, 0.93, 51.6);
  }

  // The steam room: blue-grey mosaic, a frosted door.
  const stOut = tex(mosaic.clone(), '#b8ccd4');
  (stOut.map as THREE.Texture).repeat.set(3, 2);
  (stOut.map as THREE.Texture).needsUpdate = true;
  const stIn = tex(mosaic.clone());
  (stIn.map as THREE.Texture).repeat.set(4, 2.5);
  (stIn.map as THREE.Texture).needsUpdate = true;
  stIn.side = THREE.DoubleSide;
  const frost = new THREE.MeshToonMaterial({ color: '#f4fbff', transparent: true, opacity: 0.6, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  buildCabin(STEAM, stOut, stIn, frost, '#9fd8ff', 4);
  {
    const inn = STEAM.inner;
    const floorTiles = mosaic.clone();
    floorTiles.repeat.set(3, 3);
    floorTiles.needsUpdate = true;
    decal(p, inn, tex(floorTiles, '#c9dce3'), 0.012);
    const bench = tex(mosaic.clone(), '#d6e6ec');
    (bench.map as THREE.Texture).repeat.set(2, 0.5);
    const e = mesh(new THREE.BoxGeometry(R.maxX - 33.0, 0.45, inn.maxZ - inn.minZ), bench, (33.0 + R.maxX) / 2, 0.225, (inn.minZ + inn.maxZ) / 2, false);
    const s = mesh(new THREE.BoxGeometry(33.0 - 30.3, 0.45, inn.maxZ - 49.9), bench, (30.3 + 33.0) / 2, 0.225, (49.9 + inn.maxZ) / 2, false);
    p.group.add(e, s);
    seatable(p, e, 'gym-steam-e', 1.4);
    seatable(p, s, 'gym-steam-s', 1.3);
    // A tiled backrest ledge along the walls.
    blk(p, 0.08, 0.08, inn.maxZ - inn.minZ, '#c9dce3', R.maxX - 0.04, 1.0, (inn.minZ + inn.maxZ) / 2);
    // The eucalyptus bowl on its pedestal, and the steam nozzle in the corner below it.
    const b = STEAM.pour;
    const ped = mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.8, 12), stIn, b.x, 0.4, b.z, false);
    p.group.add(ped);
    cyl(p, 0.2, 0.12, 0.1, '#e8f0f2', b.x, 0.85, b.z, 14);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(i % 2 ? '#6a9f8a' : '#88b8a2'), b.x + Math.cos(i) * 0.1, 0.92, b.z + Math.sin(i) * 0.1, false);
      leaf.scale.set(1.6, 0.4, 0.7);
      p.still.add(leaf);
    }
    const bowlIt: Interactable = { kind: 'gym-station', gymStation: STEAM.station, gymAct: 'ladle', x: b.x, z: b.z, y: 0, radius: 1.3 };
    p.interactables.push(bowlIt);
    ped.userData.interact = bowlIt;
    cyl(p, 0.05, 0.05, 0.12, steel, 31.8, 0.3, inn.minZ + 0.06, 8).rotation.x = Math.PI / 2;
  }

  // ---- The jacuzzi: a raised round tub with steps, bubbling water, a light below ------------------
  const J = JACUZZI;
  const shellMat = tex(tiles('#e3ecef', '#b8c6cc', 6, 0.05, 101), '#ffffff');
  (shellMat.map as THREE.Texture).wrapS = (shellMat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
  (shellMat.map as THREE.Texture).repeat.set(6, 1);
  p.group.add(mesh(new THREE.CylinderGeometry(J.r, J.r + 0.02, J.rim, 32, 1, true), shellMat, J.x, J.rim / 2, J.z, false));
  const rim = mesh(new THREE.RingGeometry(J.r - 0.16, J.r + 0.02, 32), toon('#d6c3a5'), J.x, J.rim + 0.005, J.z, false);
  rim.rotation.x = -Math.PI / 2;
  p.still.add(rim);
  const waterTex = water('#2d9cc0', 'rgba(220,250,255,0.55)');
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.88, toneMapped: false });
  waterMat.userData.outlineParameters = { visible: false };
  const tub = mesh(new THREE.CircleGeometry(J.r - 0.16, 32), waterMat, J.x, J.rim - 0.08, J.z, false);
  tub.rotation.x = -Math.PI / 2;
  p.group.add(tub);
  const glowRing = mesh(new THREE.RingGeometry(J.r - 0.3, J.r - 0.2, 32), glow(null, '#7fe0ff'), J.x, J.rim - 0.07, J.z, false);
  glowRing.rotation.x = -Math.PI / 2;
  p.group.add(glowRing);
  // Steps up on the west side, and a grab rail.
  blk(p, 0.35, 0.18, 0.9, '#d6c3a5', J.x - J.r - 0.15, 0.09, J.z);
  blk(p, 0.25, 0.36, 0.9, '#d6c3a5', J.x - J.r + 0.02, 0.18, J.z);
  const railPts = [new THREE.Vector3(J.x - J.r - 0.3, 0, J.z + 0.5), new THREE.Vector3(J.x - J.r - 0.3, 0.95, J.z + 0.5), new THREE.Vector3(J.x - J.r + 0.1, 1.1, J.z + 0.5), new THREE.Vector3(J.x - J.r + 0.2, J.rim, J.z + 0.5)];
  p.still.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 16, 0.02, 6), steel, 0, 0, 0, false));
  for (const a of [0.6, 1.3, 2.1]) candle(p, J.x + Math.cos(a) * (J.r - 0.08), J.rim, J.z + Math.sin(a) * (J.r - 0.08), 0.09);
  const bubbles = new Cloud(120, '#ffffff');
  bubbles.lift = 0.02;
  bubbles.drag = 2;
  p.group.add(bubbles.points);
  const wisps = new Cloud(40, '#ffffff');
  wisps.lift = 0.08;
  p.group.add(wisps.points);
  const hottubIt: Interactable = { kind: 'gym-station', gymStation: 'hottub', x: J.x, z: J.z, y: 0, radius: J.r + 1.2 };
  p.interactables.push(hottubIt);
  tub.userData.interact = hottubIt;

  // ---- The cold plunge: a steel tub of ice water, a ladder, a frosty rim ---------------------------
  const P = PLUNGE;
  blk(p, P.half * 2, P.rim, P.half * 2, '#aeb9c0', P.x, P.rim / 2, P.z);
  blk(p, P.half * 2 + 0.08, 0.05, P.half * 2 + 0.08, '#eef6f8', P.x, P.rim + 0.02, P.z);
  const iceTex = water('#8fd8ef', 'rgba(255,255,255,0.7)', 111);
  const iceMat = new THREE.MeshBasicMaterial({ map: iceTex, toneMapped: false });
  iceMat.userData.outlineParameters = { visible: false };
  const iceWater = mesh(new THREE.PlaneGeometry(P.half * 2 - 0.1, P.half * 2 - 0.1), iceMat, P.x, P.rim + 0.03, P.z, false);
  iceWater.rotation.x = -Math.PI / 2;
  p.group.add(iceWater);
  const cubes: THREE.Mesh[] = [];
  const iceCube = toon('#e8fbff', { opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const c = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), iceCube, P.x - 0.45 + (i % 3) * 0.45 + ((i * 37) % 10) / 60, P.rim + 0.05, P.z - 0.45 + Math.floor(i / 3) * 0.45 + ((i * 53) % 10) / 70, false);
    c.rotation.y = i * 0.7;
    p.group.add(c);
    cubes.push(c);
  }
  for (const dx of [-0.2, 0.2]) {
    const pts = [new THREE.Vector3(P.x + dx, 0, P.z - P.half - 0.25), new THREE.Vector3(P.x + dx, 1.05, P.z - P.half - 0.25), new THREE.Vector3(P.x + dx, 1.1, P.z - P.half + 0.05), new THREE.Vector3(P.x + dx, P.rim - 0.3, P.z - P.half + 0.12)];
    p.still.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.02, 6), steel, 0, 0, 0, false));
  }
  const cold = textPlane('🧊 4 °C', { bg: '#12303a', color: '#cdeefd', size: 40 });
  cold.position.set(P.x, 0.5, P.z + P.half + 0.01);
  cold.scale.setScalar(0.6);
  p.group.add(cold);
  const plungeIt: Interactable = { kind: 'gym-station', gymStation: 'coldplunge', x: P.x, z: P.z, y: 0, radius: P.half + 1.2 };
  p.interactables.push(plungeIt);
  iceWater.userData.interact = plungeIt;

  // ---- Relaxation loungers along the west wall, a towel on each -----------------------------------
  const L = LOUNGER;
  LOUNGER_ZS.forEach((z, i) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(L.length, 0.3, L.width), toon('#8a6a44'), L.minX + L.length / 2, 0.15, z, false));
    g.add(mesh(new THREE.BoxGeometry(L.length - 0.5, 0.12, L.width - 0.06), toon('#efe6d6'), L.minX + 0.25 + (L.length - 0.5) / 2 + 0.25, 0.36, z, false));
    const back = mesh(new THREE.BoxGeometry(0.75, 0.1, L.width - 0.06), toon('#efe6d6'), L.minX + 0.35, 0.58, z, false);
    back.rotation.z = -0.75;
    g.add(back);
    // The towel, folded over the backrest, in a spa colour.
    const towel = mesh(new THREE.BoxGeometry(0.9, 0.03, L.width - 0.2), toon(i % 2 ? '#a3c9b8' : '#f4f4ee'), L.minX + 0.75, 0.46, z, false);
    towel.rotation.z = -0.3;
    g.add(towel);
    p.still.add(g);
    seatable(p, g, `gym-lounger-${i + 1}`, 1.2);
  });

  // ---- The massage room, behind a curtain ----------------------------------------------------------
  const M = MASSAGE_ROOM;
  const woodFloor = planks('#9c6b3f', 10, 121);
  woodFloor.wrapS = woodFloor.wrapT = THREE.RepeatWrapping;
  woodFloor.repeat.set(2, 2);
  decal(p, { minX: M.minX + 0.08, maxX: R.maxX, minZ: M.minZ, maxZ: M.maxZ - SPA_WALL }, tex(woodFloor), 0.012);
  const drape = tex(curtain('#b48fb8'), '#ffffff', { side: THREE.DoubleSide });
  for (const [z0, z1] of [
    [M.minZ, MASSAGE_OPENING.minZ],
    [MASSAGE_OPENING.maxZ, M.maxZ],
  ]) {
    // Folded curtains: a gently waving strip.
    const len = z1 - z0;
    const geo = new THREE.PlaneGeometry(len, 2.2, Math.max(4, Math.round(len * 10)), 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.035);
    geo.computeVertexNormals();
    const c = mesh(geo, drape, M.minX + 0.04, 1.15, (z0 + z1) / 2, false);
    c.rotation.y = Math.PI / 2;
    p.group.add(c);
  }
  const rail = mesh(new THREE.CylinderGeometry(0.02, 0.02, M.maxZ - M.minZ, 6), steel, M.minX + 0.04, 2.3, (M.minZ + M.maxZ) / 2, false);
  rail.rotation.x = Math.PI / 2;
  p.still.add(rail);
  for (const t of MASSAGE_TABLES) {
    const g = new THREE.Group();
    for (const dx of [-0.85, 0.85]) for (const dz of [-0.28, 0.28]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), toon('#8a6a44'), t.x + dx, 0.31, t.z + dz, false));
    g.add(mesh(new THREE.BoxGeometry(1.95, 0.12, 0.72), toon('#e8dccb'), t.x, 0.68, t.z, false));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.02, 0.6), toon('#f4f4ee'), t.x - 0.02, 0.75, t.z, false));
    // The face rest at the east end, a rolled towel at the other.
    const face = mesh(new THREE.TorusGeometry(0.1, 0.045, 6, 14), toon('#e8dccb'), t.x + 1.05, 0.7, t.z, false);
    face.rotation.x = Math.PI / 2;
    g.add(face);
    const roll = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), toon('#a3c9b8'), t.x - 0.75, 0.8, t.z, false);
    roll.rotation.x = Math.PI / 2;
    g.add(roll);
    p.still.add(g);
    const def = GYM_STATION_BY_ID.get(t.id);
    if (def) {
      const it: Interactable = { kind: 'gym-station', gymStation: t.id, x: t.x, z: t.z, y: 0, radius: 1.8 };
      p.interactables.push(it);
      g.traverse((o) => (o.userData.interact = it));
    }
  }
  // A shelf of oils and candles on the east wall between the tables, soft lilac light, a plant.
  blk(p, 0.3, 0.05, 1.2, '#8a6a44', R.maxX - 0.15, 1.2, 44.2);
  for (let i = 0; i < 5; i++) cyl(p, 0.035, 0.035, 0.18, ['#c9a0ff', '#ffd36b', '#a3c9b8', '#ff9a52', '#c9a0ff'][i], R.maxX - 0.15, 1.315, 43.75 + i * 0.2, 8);
  candle(p, R.maxX - 0.15, 1.225, 44.8, 0.1);
  candle(p, R.maxX - 0.15, 1.225, 43.6, 0.07);
  picture(p, 0.5, 0.35, glow(null, '#d9b8ff'), R.maxX - 0.02, 2.0, 44.2, -Math.PI / 2);
  const massageLight = new THREE.PointLight('#e0b8ff', 3, 4, 1.6);
  massageLight.position.set(31.8, 2.1, 44.2);
  p.group.add(massageLight);
  plant(p, R.maxX - 0.35, M.minZ + 0.35, 1.1, '#e8dccb');

  // A warm light over the spa's open part, and a few more candles and plants.
  const spaLight = new THREE.PointLight('#ffcf9a', 5, 9, 1.4);
  spaLight.position.set(27.0, 2.6, 48.5);
  p.group.add(spaLight);
  plant(p, SPA.minX + SPA_WALL + 0.3, R.maxZ - 0.35, 1.4, '#e8dccb');
  plant(p, SPA.minX + SPA_WALL + 0.3, 47.3, 1.0, '#e8dccb');

  // Occupancy lamps for the stations people use by E (the jacuzzi, the plunge, the tables).
  const dots = new Map<string, THREE.MeshBasicMaterial>();
  for (const [id, x, y, z] of [
    ['hottub', J.x + J.r + 0.02, 0.4, J.z],
    ['coldplunge', P.x + P.half + 0.02, 0.6, P.z],
    ['massage-1', MASSAGE_TABLES[0].x - 1.0, 0.72, MASSAGE_TABLES[0].z + 0.37],
    ['massage-2', MASSAGE_TABLES[1].x - 1.0, 0.72, MASSAGE_TABLES[1].z + 0.37],
  ] as const) {
    const m = glow(null, IDLE);
    p.group.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), m, x, y, z, false));
    dots.set(id, m);
  }
  const occupied = new Map<string, number>();

  // ---- Live state ---------------------------------------------------------------------------------
  const cabinOf = (id: string) => cabins.find((c) => c.room.station === id);
  const setStation = (id: string, state: unknown) => {
    const v = state as WellnessView | null;
    if (!v || v.kind !== 'wellness') return;
    const c = cabinOf(id);
    if (c) {
      c.occupied = v.occupants.length;
      if (v.puffAt && v.puffAt !== c.puffAt) {
        // The first view after coming in is just how it stands: no burst for an old Aufguss.
        if (c.puffAt || Date.now() - v.puffAt < 5000) c.burstUntil = -1;
        c.puffAt = v.puffAt;
      }
      return;
    }
    occupied.set(id, v.occupants.length);
  };

  const tmp = new THREE.Vector3();
  const update = (t: number, dt: number, view: SpaView) => {
    for (const c of cabins) {
      const r = c.room;
      // The door swings open for anyone near it, on either side.
      const near = view.people.some((q) => Math.abs(q.x - r.door.x) < 1.5 && Math.abs(q.z - r.door.z) < 0.9);
      c.open += ((near ? 1 : 0) - c.open) * Math.min(1, dt * 6);
      c.door.rotation.y = -c.open * 1.55;
      // Inside with the camera outside (third person): lift the walls and roof away so you can see in.
      const inside = !!view.me && inRect(r.inner, view.me.x, view.me.z) && view.me.y < 2;
      const camIn = !!view.cam && inRect(r.inner, view.cam.x, view.cam.z) && view.cam.y < CABIN_HEIGHT;
      c.shell.visible = !(inside && !camIn);
      c.dot.color.set(c.occupied ? ON : IDLE);
      // Clouds: an Aufguss is a thick burst rising off the stones (or out of the nozzle); between,
      // the sauna shimmers a little over the stove and the steam room keeps its mist.
      if (c.burstUntil < 0) c.burstUntil = t + 1.6;
      const burst = t < c.burstUntil;
      const inn = r.inner;
      if (r.machine === 'sauna') {
        c.emitAcc += dt * (burst ? 55 : 3);
        const n = Math.floor(c.emitAcc);
        c.emitAcc -= n;
        if (n)
          c.cloud.emit(n, {
            at: tmp.set(30.45, 0.95, 51.05),
            spread: { x: 0.2, y: 0.05, z: 0.15 },
            vel: { x: 0.15, y: burst ? 1.2 : 0.35, z: 0.25 },
            jitter: burst ? 0.35 : 0.06,
            life: burst ? 4.5 : 2.2,
            size0: burst ? 0.35 : 0.2,
            size1: burst ? 1.4 : 0.5,
            alpha: burst ? 0.55 : 0.1,
          });
        c.light.intensity = c.base * (1 + (burst ? 0.5 : 0) + Math.sin(t * 7) * 0.04 + Math.sin(t * 13.3) * 0.03);
      } else {
        c.emitAcc += dt * (burst ? 90 : 14);
        const n = Math.floor(c.emitAcc);
        c.emitAcc -= n;
        if (n)
          c.cloud.emit(n, {
            at: burst ? tmp.set(STEAM.pour.x, 0.95, STEAM.pour.z) : tmp.set((inn.minX + inn.maxX) / 2, 0.7, (inn.minZ + inn.maxZ) / 2),
            spread: burst ? { x: 0.15, y: 0.05, z: 0.15 } : { x: (inn.maxX - inn.minX) / 2 - 0.2, y: 0.5, z: (inn.maxZ - inn.minZ) / 2 - 0.2 },
            vel: burst ? { x: 0.3, y: 0.9, z: 0.3 } : { x: 0, y: 0.05, z: 0 },
            jitter: burst ? 0.4 : 0.12,
            life: burst ? 4 : 6.5,
            size0: 0.6,
            size1: burst ? 1.8 : 1.5,
            alpha: burst ? 0.5 : 0.26,
          });
      }
      c.cloud.update(dt);
    }
    // The stove's embers breathe; the candles flicker.
    if (stoveEmber) stoveEmber.color.setRGB(1, 0.36 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 7.7) * 0.05, 0.14);
    flameMat.color.setRGB(1, 0.78 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23) * 0.04, 0.4);
    // The hourglass runs a minute, then turns.
    if (sandTop && sandBottom) {
      const k = (t % 60) / 60;
      sandTop.scale.setScalar(Math.max(0.05, 1 - k));
      sandBottom.scale.setScalar(Math.max(0.05, k));
    }
    // The jacuzzi: rippling water, bubbles (more with someone in), a wisp of steam.
    const inTub = occupied.get('hottub') ?? 0;
    waterTex.offset.set(Math.sin(t * 0.7) * 0.05 + t * 0.02, Math.cos(t * 0.5) * 0.05);
    bubblesAcc += dt * (inTub ? 70 : 18);
    const nb = Math.floor(bubblesAcc);
    bubblesAcc -= nb;
    for (let i = 0; i < nb; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (J.r - 0.3);
      bubbles.emit(1, { at: tmp.set(J.x + Math.cos(a) * r, J.rim - 0.06, J.z + Math.sin(a) * r), spread: { x: 0.02, y: 0, z: 0.02 }, vel: { x: 0, y: 0.03, z: 0 }, jitter: 0.03, life: 0.7, size0: 0.05, size1: 0.12, alpha: 0.8 });
    }
    bubbles.update(dt);
    if (Math.random() < dt * 2) wisps.emit(1, { at: tmp.set(J.x, J.rim + 0.05, J.z), spread: { x: 0.6, y: 0, z: 0.6 }, vel: { x: 0, y: 0.15, z: 0 }, jitter: 0.05, life: 3, size0: 0.3, size1: 0.9, alpha: 0.12 });
    wisps.update(dt);
    iceTex.offset.set(Math.sin(t * 0.3) * 0.02, t * 0.005);
    cubes.forEach((c, i) => {
      c.position.y = P.rim + 0.05 + Math.sin(t * 1.6 + i) * 0.012;
      c.rotation.y += dt * 0.05 * (i % 2 ? 1 : -1);
    });
    for (const [id, m] of dots) m.color.set((occupied.get(id) ?? 0) ? ON : IDLE);
  };

  return { setStation, update, roomAt: (x, z) => cabins.find((c) => inRect(c.room.inner, x, z))?.room };
}

import * as THREE from 'three';
import { CORRIDOR_FLOOR, DOOR_HEIGHT, LOBBY, STUDIO_GLASS, WING_CEILING, WING_EAST_WALL, WING_WALL, doorOf } from '../../../shared/proberaum-layout';
import { REHEARSAL_ROOMS, WING_DOOR, ZONES, type RehearsalRoom } from '../../../shared/venue';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { ceilingTiles, checkerTexture, rubberTexture, wallTexture } from './paint';
import { POSTERS, flyerTexture, posterTexture, signTexture, stickerTexture } from './posters';
import { bake, box, picture, placed, tubeLight } from './props';

/*
 * The rehearsal wing's shell (flrnoh fork, see FORK.md "The rehearsal wing"): the rooms' walls (0.2 m,
 * double between neighbours, a doorway in each east wall), the wing's own tall east wall onto the
 * foyer and the hall with the way in, the lobby's and the corridor's floors and walls plastered with
 * stickers and posters, the low ceiling over all of it with its tubes and cable trays, the lights.
 * The rooms' insides (foam, carpets, brick) are rooms.ts and studio.ts.
 */

export interface Shell {
  group: THREE.Group;
  colliders: Collider[];
}

/** The wing's lights: warm in the lobby, cold tubes in the corridor. The rooms bring their own. */
const LIGHTS: { x: number; z: number; color: string; power: number; range: number }[] = [
  { x: -17.4, z: -12.4, color: '#ffd9a8', power: 2.2, range: 11 },
  { x: -12.2, z: 3, color: '#e8f1ff', power: 2.0, range: 16 },
];

export function buildShell(): Shell {
  const group = new THREE.Group();
  group.name = 'proberaum-shell';
  const colliders: Collider[] = [];
  const deco = new THREE.Group();
  const H = WING_CEILING;
  const paint = toon('#d9d4c7');

  /** A wall from (x0, z0) to (x1, z1) (axis-aligned), `y0`..`y1` high, of `mat`, solid if `solid`. */
  const wall = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material = paint, solid = true) => {
    const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, false);
    deco.add(m);
    if (solid && y0 < 1.8) colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: y1 });
  };

  // ---- The rooms' walls ----
  for (const r of REHEARSAL_ROOMS) roomWalls(r, wall);
  // The studio's glass wall: a sill, glass, a soffit over it; its doorway at the north end.
  const g = STUDIO_GLASS;
  const gx0 = g.x - 0.1;
  const gx1 = g.x + 0.1;
  wall(gx0, gx1, g.doorZ1, g.maxZ, 0, 0.9, toon('#30343a'));
  wall(gx0, gx1, g.doorZ1, g.maxZ, 2.4, H, toon('#30343a'), false);
  wall(gx0, gx1, g.doorZ0, g.doorZ1, DOOR_HEIGHT, H, toon('#30343a'), false);
  colliders.push({ minX: gx0, maxX: gx1, minZ: g.doorZ1, maxZ: g.maxZ, top: H });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, g.maxZ - g.doorZ1), new THREE.MeshBasicMaterial({ color: '#bfe3f2', transparent: true, opacity: 0.1, depthWrite: false }));
  glass.position.set(g.x, 1.65, (g.doorZ1 + g.maxZ) / 2);
  group.add(glass);
  for (let z = g.doorZ1; z <= g.maxZ + 0.01; z += (g.maxZ - g.doorZ1) / 3) deco.add(box(0.12, 1.5, 0.06, '#1f2226', g.x, 0.9, Math.min(z, g.maxZ - 0.03)));

  // ---- The wing's east wall onto the foyer and the hall, as tall as the hall, with the way in ----
  const E = WING_EAST_WALL;
  const outside = toon('#2c2a33');
  const doorTop = 2.6;
  const d0 = WING_DOOR.z - WING_DOOR.width / 2;
  const d1 = WING_DOOR.z + WING_DOOR.width / 2;
  wall(E.minX, E.maxX, ZONES.wing.minZ, d0, 0, E.height, outside);
  wall(E.minX, E.maxX, d1, ZONES.wing.maxZ, 0, E.height, outside);
  wall(E.minX, E.maxX, d0, d1, doorTop, E.height, outside, false);
  // Its inner face: paint up to the ceiling.
  deco.add(planeX(E.minX - 0.005, ZONES.wing.minZ, d0, 0, H, -1, wallTexture('#d9d4c7', 3), d0 - ZONES.wing.minZ));
  deco.add(planeX(E.minX - 0.005, d1, ZONES.wing.maxZ, 0, H, -1, wallTexture('#d9d4c7', 4), ZONES.wing.maxZ - d1));
  // The way in: a steel frame, PROBERÄUME · STUDIO over it on the foyer's side, the exit sign inside.
  for (const z of [d0 - 0.05, d1 + 0.05]) deco.add(box(0.26, doorTop, 0.1, '#3d4148', (E.minX + E.maxX) / 2, 0, z));
  deco.add(box(0.26, 0.12, WING_DOOR.width + 0.2, '#3d4148', (E.minX + E.maxX) / 2, doorTop - 0.06, WING_DOOR.z));
  const lightbox = picture(signTexture('PROBERÄUME · STUDIO', '#fff4d6', '#141414', 1024, 160), 2.6, 0.4, true);
  lightbox.rotation.y = Math.PI / 2;
  lightbox.position.set(E.maxX + 0.006, doorTop + 0.45, WING_DOOR.z);
  group.add(lightbox);
  const exit = picture(signTexture('🏃 AUSGANG · HALLE', '#ffffff', '#1b7f3a', 512, 128), 0.7, 0.18, true);
  exit.rotation.y = -Math.PI / 2;
  exit.position.set(E.minX - 0.01, doorTop + 0.2, WING_DOOR.z);
  group.add(exit);

  // ---- Floors ----
  const tiles = checkerTexture();
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set((LOBBY.maxX - LOBBY.minX) / 1.2, (LOBBY.maxZ - LOBBY.minZ) / 1.2);
  const lobbyFloor = new THREE.Mesh(new THREE.PlaneGeometry(LOBBY.maxX - LOBBY.minX, LOBBY.maxZ - LOBBY.minZ), new THREE.MeshToonMaterial({ map: tiles }));
  floorAt(lobbyFloor, LOBBY);
  group.add(lobbyFloor);
  const corridorTex = rubberTexture();
  corridorTex.wrapS = corridorTex.wrapT = THREE.RepeatWrapping;
  corridorTex.repeat.set((CORRIDOR_FLOOR.maxX - CORRIDOR_FLOOR.minX) / 2, (CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ) / 2);
  const corridor = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_FLOOR.maxX - CORRIDOR_FLOOR.minX, CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ), new THREE.MeshToonMaterial({ map: corridorTex }));
  floorAt(corridor, CORRIDOR_FLOOR);
  group.add(corridor);
  // A yellow line down its middle, worn.
  const line = mesh(new THREE.PlaneGeometry(0.06, CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ - 0.4), toon('#d8b23a'), (CORRIDOR_FLOOR.minX + CORRIDOR_FLOOR.maxX) / 2, 0.008, (CORRIDOR_FLOOR.minZ + CORRIDOR_FLOOR.maxZ) / 2, false);
  line.rotation.x = -Math.PI / 2;
  group.add(line);

  // ---- The ceiling: over the lobby, the corridor and every room; tiles, tubes and cable trays ----
  const ceilings = [LOBBY, CORRIDOR_FLOOR, ...REHEARSAL_ROOMS.map((r) => r.box)];
  for (const c of ceilings) {
    const tex = ceilingTiles();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set((c.maxX - c.minX) / 1.2, (c.maxZ - c.minZ) / 1.2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(c.maxX - c.minX, c.maxZ - c.minZ), new THREE.MeshToonMaterial({ map: tex }));
    p.position.set((c.minX + c.maxX) / 2, H, (c.minZ + c.maxZ) / 2);
    p.rotation.x = Math.PI / 2;
    group.add(p);
    colliders.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ, top: H + 0.2, bottom: H, fence: true });
  }
  for (let z = CORRIDOR_FLOOR.minZ + 1.5; z < CORRIDOR_FLOOR.maxZ - 0.5; z += 3.2) {
    const t = tubeLight(1.2);
    t.rotation.y = Math.PI / 2;
    t.position.set(-12.2, H, z);
    deco.add(t);
  }
  for (const [x, z] of [
    [-20.5, -13.6],
    [-16.4, -11.4],
    [-20.5, -10.8],
    [-13.2, -13.2],
  ])
    deco.add(placed(tubeLight(1.2, '#fff1d8'), x, H, z));
  // The cable tray along the corridor's east wall, cables sagging out of it.
  deco.add(box(0.3, 0.08, CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ, '#8b9097', E.minX - 0.17, H - 0.35, (CORRIDOR_FLOOR.minZ + CORRIDOR_FLOOR.maxZ) / 2));
  for (const [c, dx] of [
    ['#1d1d1d', 0.08],
    ['#c1121f', 0.0],
    ['#1d3557', -0.07],
  ] as const)
    deco.add(box(0.03, 0.03, CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ - 0.2, c, E.minX - 0.17 + dx, H - 0.29, (CORRIDOR_FLOOR.minZ + CORRIDOR_FLOOR.maxZ) / 2));

  // ---- Plastered: stickers and posters all down the corridor and round the lobby ----
  const len = CORRIDOR_FLOOR.maxZ - CORRIDOR_FLOOR.minZ;
  const corridorWest = REHEARSAL_ROOMS[0].box.maxX + 0.006;
  for (let i = 0; i < 4; i++) {
    const z0 = CORRIDOR_FLOOR.minZ + (i * len) / 4;
    const stE = picture(stickerTexture(100 + i, 0.8), len / 4, 1.2);
    stE.rotation.y = -Math.PI / 2;
    stE.position.set(E.minX - 0.008, 1.0, z0 + len / 8);
    group.add(stE);
  }
  // On the rooms' side between the doors (never over a door, its screen or its number).
  let from = CORRIDOR_FLOOR.minZ + 0.1;
  for (const [i, r] of REHEARSAL_ROOMS.entries()) {
    const to = r.door.z - r.door.width / 2 - 0.95;
    if (to - from > 0.6) {
      const stW = picture(stickerTexture(200 + i, 0.8), to - from, 1.0);
      stW.rotation.y = Math.PI / 2;
      stW.position.set(corridorWest + 0.002, 0.95, (from + to) / 2);
      group.add(stW);
    }
    from = r.door.z + r.door.width / 2 + 0.55;
  }
  let k = 0;
  for (let z = -7.6; z < 15; z += 2.35) {
    const p = POSTERS[k++ % POSTERS.length];
    const poster = picture(posterTexture(p, k), 0.62, 0.88);
    poster.rotation.y = -Math.PI / 2;
    poster.position.set(E.minX - 0.012, 1.65, z);
    poster.rotation.z = (k % 3) * 0.02 - 0.02;
    group.add(poster);
  }
  for (let i = 0; i < 3; i++) {
    const f = picture(flyerTexture(i + 2), 0.21, 0.3);
    f.rotation.y = Math.PI / 2;
    f.position.set(corridorWest + 0.004, 1.45, REHEARSAL_ROOMS[i].door.z + 1.35);
    f.rotation.x = (i - 1) * 0.06;
    group.add(f);
  }
  // A fire extinguisher, a first-aid box and a "Gehörschutz!" sign.
  deco.add(box(0.18, 0.04, 0.12, '#30343a', E.minX - 0.06, 0.95, 4.2));
  const ext = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 12), toon('#c1121f'), E.minX - 0.12, 0.7, 4.2);
  deco.add(ext, box(0.05, 0.1, 0.05, '#1d1d1d', E.minX - 0.12, 0.95, 4.2));
  deco.add(box(0.1, 0.32, 0.4, '#2a9d8f', E.minX - 0.05, 1.3, -6.2));
  deco.add(box(0.012, 0.1, 0.1, '#ffffff', E.minX - 0.106, 1.41, -6.2));
  const ear = picture(signTexture('GEHÖRSCHUTZ! 👂', '#1d1d1d', '#ffd166', 512, 128), 0.8, 0.2);
  ear.rotation.y = -Math.PI / 2;
  ear.position.set(E.minX - 0.01, 2.25, -6.2);
  group.add(ear);
  // The corridor's far end: the house's name, painted big.
  const endZ = CORRIDOR_FLOOR.maxZ;
  const mural = picture(signTexture('SCHALLWERK · PROBERÄUME', '#f1faee', '#1d3557', 1024, 256), 1.9, 0.48);
  mural.position.set(-12.2, 2.3, endZ - 0.012);
  mural.rotation.y = Math.PI;
  group.add(mural);

  // The lobby's walls (the building's north and west, linings of the wing's own): paint, grime, stickers.
  deco.add(planeZ(LOBBY.minZ + 0.008, LOBBY.minX, LOBBY.maxX, 0, H, 1, wallTexture('#cfc6b5', 5), LOBBY.maxX - LOBBY.minX));
  deco.add(planeX(LOBBY.minX + 0.008, LOBBY.minZ, LOBBY.maxZ, 0, H, 1, wallTexture('#cfc6b5', 6), LOBBY.maxZ - LOBBY.minZ));
  const stN = picture(stickerTexture(301, 1.2), 5, 1.4);
  stN.position.set(-16.2, 2.45, LOBBY.minZ + 0.012);
  group.add(stN);
  const stS = picture(stickerTexture(302, 1), 4.5, 1.6);
  stS.rotation.y = Math.PI;
  stS.position.set(-19.5, 2.3, LOBBY.maxZ - 0.008);
  group.add(stS);
  // The corridor's south end, painted.
  deco.add(planeZ(endZ - 0.006, CORRIDOR_FLOOR.minX, CORRIDOR_FLOOR.maxX, 0, H, -1, wallTexture('#d9d4c7', 7), 2));

  group.add(bake(deco));
  for (const L of LIGHTS) {
    const l = new THREE.PointLight(L.color, L.power, L.range, 1.4);
    l.position.set(L.x, H - 0.4, L.z);
    group.add(l);
  }
  return { group, colliders };
}

/** A room's four walls inside its box, a doorway in the east one, a lintel over it. */
function roomWalls(r: RehearsalRoom, wall: (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat?: THREE.Material, solid?: boolean) => void) {
  const B = r.box;
  const T = WING_WALL;
  const H = WING_CEILING;
  const d = doorOf(r);
  wall(B.minX, B.maxX, B.minZ, B.minZ + T, 0, H);
  wall(B.minX, B.maxX, B.maxZ - T, B.maxZ, 0, H);
  wall(B.minX, B.minX + T, B.minZ + T, B.maxZ - T, 0, H);
  wall(B.maxX - T, B.maxX, B.minZ + T, d.z - d.width / 2, 0, H);
  wall(B.maxX - T, B.maxX, d.z + d.width / 2, B.maxZ - T, 0, H);
  wall(B.maxX - T, B.maxX, d.z - d.width / 2, d.z + d.width / 2, DOOR_HEIGHT, H, undefined, false);
}

/** A floor plane over `z` (just above the building's floor). */
function floorAt(m: THREE.Mesh, z: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  m.rotation.x = -Math.PI / 2;
  m.position.set((z.minX + z.maxX) / 2, 0.004, (z.minZ + z.maxZ) / 2);
  m.receiveShadow = true;
}

/** A textured wall plane at x, from z0 to z1, y0 to y1, facing +x (dir 1) or -x (-1); the texture repeats every 2 m. */
export function planeX(x: number, z0: number, z1: number, y0: number, y1: number, dir: 1 | -1, tex: THREE.Texture, len: number): THREE.Mesh {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(len / 2, (y1 - y0) / 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, y1 - y0), new THREE.MeshToonMaterial({ map: tex }));
  m.rotation.y = (dir * Math.PI) / 2;
  m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

/** A textured wall plane at z, from x0 to x1, facing +z (dir 1) or -z (-1). */
export function planeZ(z: number, x0: number, x1: number, y0: number, y1: number, dir: 1 | -1, tex: THREE.Texture, len: number): THREE.Mesh {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(len / 2, (y1 - y0) / 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshToonMaterial({ map: tex }));
  m.rotation.y = dir > 0 ? 0 : Math.PI;
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  m.receiveShadow = true;
  return m;
}

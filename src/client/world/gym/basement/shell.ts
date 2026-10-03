import * as THREE from 'three';
import { BASEMENT_FLOOR, FOYER, HALL, HALL_CEILING, KNEIPP_DOOR, KNEIPP_ROOM, NORTH_BAND, REST, REST_DOOR, SALT, SALT_DOOR, SLAB, STAIR, STAIRWELL, STAIR_FOOT_Z, STAIR_RAIL, THERME_PASSAGE, basementFixtures, cutOut, type BFixture, type BRect } from '../../../../shared/gym-basement';
import { SPA } from '../../../../shared/gym-rooms';
import { mesh, toon } from '../../toon';
import { blk, cyl, decal, picture, tex, type GymParts } from '../kit';
import { glow } from '../parts';
import { tiles } from '../textures';
import { mosaic, sign, slats, wrap } from './textures';

/*
 * The basement's shell (flrnoh fork, see shared/gym-basement.ts): its floors, walls and ceilings, the
 * stair down from the spa with its rail and the signs to it, and the foyer at its foot (towels, a water
 * cooler, a bench, the signs to everything). The colliders are the shared plan's (basementFixtures),
 * so the page and the tests agree on what's solid; the rooms and the pool hall dress it (rooms.ts,
 * hall.ts).
 */

const B = BASEMENT_FLOOR;

/** A wall panel facing `rotY` (0: +z), its middle at x, y, z, `w` wide and `h` high, its texture tiled `rx` × `ry`. */
export function panel(p: GymParts, map: THREE.CanvasTexture, w: number, h: number, x: number, y: number, z: number, rotY: number, rx = w / 2, ry = h / 2, color = '#ffffff') {
  const t = map.clone();
  wrap(t, rx, ry);
  t.needsUpdate = true;
  return picture(p, w, h, tex(t, color), x, y, z, rotY);
}

/** A floor patch over `r` at the basement's floor (`lift` above it, so patches stack without flicker). */
export function floorPatch(p: GymParts, r: BRect, map: THREE.CanvasTexture, tile: number, lift = 0.004, y = B, color = '#ffffff') {
  const t = map.clone();
  wrap(t, (r.maxX - r.minX) / tile, (r.maxZ - r.minZ) / tile);
  t.needsUpdate = true;
  return decal(p, r, tex(t, color), y + lift);
}

/** A ceiling over `r` at `y`, facing down. */
function ceiling(p: GymParts, r: BRect, mat: THREE.Material, y: number) {
  const m = mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), mat, (r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2, false);
  m.rotation.x = Math.PI / 2;
  p.group.add(m);
  return m;
}

/** A sign plate on a wall, facing `rotY`. */
export function wallSign(p: GymParts, big: string, small: string, x: number, y: number, z: number, rotY: number, w = 1.6, bg = '#123047', fg = '#bfeaff') {
  const h = w * (160 / 512);
  return picture(p, w, h, glow(sign(big, small, bg, fg)), x, y, z, rotY);
}

export function buildShell(p: GymParts) {
  const fixtures = basementFixtures();
  for (const f of fixtures) p.colliders.push({ minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, bottom: f.bottom ?? B, top: f.top });
  const byId = (prefix: string) => fixtures.filter((f) => f.id.startsWith(prefix));

  // ---- Walls: plain plaster boxes; the rooms hang their own panels inside (rooms.ts, hall.ts) ----
  const plaster = toon('#d9d2c4');
  const wallBox = (f: BFixture, mat: THREE.Material) => {
    const bottom = f.bottom ?? B;
    blk(p, f.maxX - f.minX, f.top - bottom, f.maxZ - f.minZ, mat, (f.minX + f.maxX) / 2, (f.top + bottom) / 2, (f.minZ + f.maxZ) / 2);
  };
  for (const f of [...byId('bw-'), ...byId('hw-'), ...byId('therme-w'), ...byId('therme-e')]) wallBox(f, plaster);
  // The stairwell's walls up to the gym's floor; above it, up in the spa, a glass balustrade with a steel handrail on the east and south sides.
  for (const f of byId('well-')) wallBox({ ...f, minX: f.id === 'well-w' ? f.minX + 0.02 : f.minX, top: -0.005 }, plaster);
  const glass = toon('#cfeef6', { transparent: true, opacity: 0.32 });
  const chrome = toon('#c3ccd1');
  const H = STAIR_RAIL.height;
  const W = STAIRWELL;
  const t = STAIR_RAIL.thick;
  const balustrade = (x0: number, x1: number, z0: number, z1: number) => {
    const g = mesh(new THREE.BoxGeometry(x1 - x0, H - 0.1, z1 - z0), glass, (x0 + x1) / 2, (H - 0.1) / 2 + 0.02, (z0 + z1) / 2, false);
    g.userData.noOutline = true;
    p.group.add(g);
    blk(p, x1 - x0 + 0.04, 0.05, z1 - z0 + 0.04, chrome, (x0 + x1) / 2, H - 0.025, (z0 + z1) / 2);
    const along = Math.max(x1 - x0, z1 - z0);
    for (let k = 0; k <= Math.round(along / 1.0); k++) {
      const f = k / Math.round(along / 1.0);
      cyl(p, 0.025, 0.025, H, chrome, x1 - x0 > z1 - z0 ? x0 + (x1 - x0) * f : (x0 + x1) / 2, H / 2, x1 - x0 > z1 - z0 ? (z0 + z1) / 2 : z0 + (z1 - z0) * f, 8);
    }
  };
  balustrade(W.maxX - t, W.maxX, W.minZ, W.maxZ);
  balustrade(W.minX, W.maxX - t, W.maxZ - t, W.maxZ);
  // The stair's own wall on the east, under the spa's floor, up to the treads.
  blk(p, STAIRWELL.maxX - STAIR.maxX, 0.04, STAIRWELL.maxZ - STAIRWELL.minZ, '#bdb6a8', (STAIR.maxX + STAIRWELL.maxX) / 2, -0.02, (STAIRWELL.minZ + STAIRWELL.maxZ) / 2);
  // The gym floor's cut edge at the top of the stair.
  blk(p, STAIRWELL.maxX - STAIRWELL.minX, SLAB, 0.04, '#bdb6a8', (STAIRWELL.minX + STAIRWELL.maxX) / 2, -SLAB / 2, STAIRWELL.minZ - 0.02);

  // ---- Ceilings: the gym's floor seen from below over the band (open over the stair), and the pool hall's, tall ----
  const under = toon('#e9e6de');
  for (const r of cutOut(NORTH_BAND, [STAIRWELL])) ceiling(p, r, under, -SLAB - 0.002);
  ceiling(p, { minX: HALL.minX - 0.3, maxX: HALL.maxX + 0.3, minZ: NORTH_BAND.maxZ, maxZ: HALL.maxZ + 0.3 }, toon('#f2f4f4'), HALL_CEILING - 0.002);
  ceiling(p, { minX: THERME_PASSAGE.minX, maxX: THERME_PASSAGE.maxX, minZ: HALL.maxZ, maxZ: THERME_PASSAGE.maxZ }, under, B + THERME_PASSAGE.height - 0.002);
  // The stairwell's own walls and soffit, seen from the stair.
  const stone = tiles('#c9c2b4', '#a59d8e', 4, 0.05, 13);
  panel(p, stone, STAIRWELL.maxZ - STAIRWELL.minZ, -B, STAIR.minX + 0.002, B / 2, (STAIRWELL.minZ + STAIRWELL.maxZ) / 2, Math.PI / 2, 4, 4);
  panel(p, stone, STAIRWELL.maxZ - STAIRWELL.minZ, -B, STAIR.maxX - 0.002, B / 2, (STAIRWELL.minZ + STAIRWELL.maxZ) / 2, -Math.PI / 2, 4, 4);

  // ---- The stair: stone treads with a lime nosing, a steel handrail down the east side ----
  const tread = toon('#cfc8ba');
  const nosing = toon('#a3e635');
  const s = STAIR;
  for (let i = 0; i < s.steps - 1; i++) {
    const top = -(i + 1) * s.rise;
    const z0 = s.topZ + i * s.run;
    blk(p, s.maxX - s.minX, s.rise, s.run, tread, (s.minX + s.maxX) / 2, top - s.rise / 2, z0 + s.run / 2);
    blk(p, s.maxX - s.minX, 0.012, 0.04, nosing, (s.minX + s.maxX) / 2, top + 0.006, z0 + 0.02);
  }
  const len = STAIR_FOOT_Z - s.topZ;
  const steel = toon('#9aa4ab');
  const railX = s.maxX - 0.08;
  const slope = Math.atan2(-B, len);
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(len, -B), 8), steel, railX, B / 2 + 0.95, (s.topZ + STAIR_FOOT_Z) / 2, false);
  rail.rotation.x = slope - Math.PI / 2; // high at the top step (north), low at the foot
  p.still.add(rail);
  for (let k = 1; k < 7; k++) {
    const z = s.topZ + (len * k) / 7;
    const y = -((z - s.topZ) / s.run + 1) * s.rise;
    cyl(p, 0.018, 0.018, 0.95, steel, railX, y + 0.475, z, 6);
  }
  // Up in the spa: a sign over the way down, on the spa's west partition.
  wallSign(p, '↓ POOL · SPA', 'Schwimmbad · Ruheraum · Salzgrotte', SPA.minX + 0.17, 2.25, (STAIRWELL.minZ + STAIRWELL.maxZ) / 2, Math.PI / 2, 2.2, '#10303c', '#9ff0ff');

  // ---- The foyer at the stair's foot ----
  const slate = tiles('#4a5560', '#2f363d', 4, 0.1, 17);
  floorPatch(p, FOYER, slate, 2.4);
  const wood = slats();
  const fh = -SLAB - B;
  // Its walls: wooden slats on the quiet room's and the east rooms' sides, round the doors.
  panel(p, wood, REST_DOOR.z - REST_DOOR.width / 2 - FOYER.minZ, fh, FOYER.minX + 0.002, B + fh / 2, (FOYER.minZ + REST_DOOR.z - REST_DOOR.width / 2) / 2, Math.PI / 2, 4, 1);
  panel(p, wood, FOYER.maxZ - 0.3 - (REST_DOOR.z + REST_DOOR.width / 2), fh, FOYER.minX + 0.002, B + fh / 2, (REST_DOOR.z + REST_DOOR.width / 2 + FOYER.maxZ - 0.3) / 2, Math.PI / 2, 2, 1);
  const east = FOYER.maxX - 0.002;
  const spans: [number, number][] = [
    [FOYER.minZ, SALT_DOOR.z - SALT_DOOR.width / 2],
    [SALT_DOOR.z + SALT_DOOR.width / 2, KNEIPP_DOOR.z - KNEIPP_DOOR.width / 2],
    [KNEIPP_DOOR.z + KNEIPP_DOOR.width / 2, KNEIPP_ROOM.maxZ],
  ];
  for (const [z0, z1] of spans) panel(p, wood, z1 - z0, fh, east, B + fh / 2, (z0 + z1) / 2, -Math.PI / 2, Math.max(1, (z1 - z0) / 1.6), 1);
  panel(p, wood, FOYER.maxX - FOYER.minX, fh, (FOYER.minX + FOYER.maxX) / 2, B + fh / 2, FOYER.minZ + 0.002, 0, 4, 1);
  // Door frames, lit, and the signs over them.
  const frame = toon('#2a2f35');
  const door = (x: number, z: number, w: number, label: string, small: string, rotY: number) => {
    for (const d of [-1, 1]) blk(p, 0.12, 2.3, 0.12, frame, x, B + 1.15, z + d * (w / 2 + 0.06));
    blk(p, 0.12, 0.14, w + 0.24, frame, x, B + 2.3, z);
    wallSign(p, label, small, x + Math.sin(rotY) * 0.02, B + 2.75, z, rotY, 1.5);
  };
  door(FOYER.minX - 0.04, REST_DOOR.z, REST_DOOR.width, '🌙 RUHERAUM', 'Quiet room · bitte Ruhe', Math.PI / 2);
  door(FOYER.maxX + 0.04, SALT_DOOR.z, SALT_DOOR.width, '🧂 SALZGROTTE', 'Salt grotto · 24 °C', -Math.PI / 2);
  door(FOYER.maxX + 0.04, KNEIPP_DOOR.z, KNEIPP_DOOR.width, '🦶 KNEIPP & DUSCHEN', 'Kneipp walk · adventure showers', -Math.PI / 2);
  wallSign(p, '↓ SCHWIMMHALLE', '25 m · Whirlpool-Grotte · Therme', (FOYER.minX + FOYER.maxX) / 2, B + 2.8, FOYER.minZ + 0.02, 0, 2.4);
  // Recessed lights in the band's ceiling.
  const lamp = glow(null, '#fff6e0');
  for (const [x, z] of [
    [23.4, 41.8],
    [27.6, 41.8],
    [23.4, 48.5],
    [27.6, 48.5],
    [23.4, 53.6],
    [27.6, 53.6],
  ]) {
    const l = mesh(new THREE.CircleGeometry(0.16, 16), lamp, x, -SLAB - 0.01, z, false);
    l.rotation.x = Math.PI / 2;
    p.still.add(l);
  }
  // The towel shelf, stacked, and the water cooler and the bench.
  blk(p, 2.0, 1.4, 0.45, '#8a6a44', 27.6, B + 0.7, FOYER.minZ + 0.225);
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 6; i++) {
      const t = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10), toon(r === 1 ? '#bfe9ff' : '#f4f4ee'), 26.82 + i * 0.31, B + 0.25 + r * 0.42, FOYER.minZ + 0.25, false);
      t.rotation.x = Math.PI / 2;
      p.still.add(t);
    }
  blk(p, 0.4, 1.0, 0.4, '#e8ecef', 22.22, B + 0.5, 41.22);
  cyl(p, 0.15, 0.15, 0.34, toon('#7fd3ff', { transparent: true, opacity: 0.7 }), 22.22, B + 1.17, 41.22, 12);
  blk(p, 0.7, 0.08, 1.6, '#8a6a44', 22.35, B + 0.42, 44.5);
  for (const z of [43.85, 45.15]) blk(p, 0.6, 0.38, 0.08, '#2a2f35', 22.35, B + 0.19, z);
  return fixtures;
}

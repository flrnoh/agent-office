import * as THREE from 'three';
import { CITY_ROAD, CITY_WALK, STREETS } from '../../../shared/city';
import { BOLLARD_IN, BOLLARD_OFF, FURNITURE, stretchSpan, type Furniture } from '../../../shared/streetside';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G } from './kit';
import { buildPillars } from './pillars';

// flrnoh fork (see FORK.md): what stands along the city's streets at eye level (see town/index.ts):
// curbs along every road, and on the strip between the sidewalk and the buildings, street trees,
// benches, bins, bike stands and now and then a bus stop; bollards at the corners of the crossings.
// Laid out in shared/streetside.ts, only close by, where you walk: further off the haze has it.

/** How tall a curb stands over the road. */
const CURB = 0.14;

/** Lays the curbs and the street furniture into `group`; what's in the way goes in `colliders`. */
export function buildFurniture(group: THREE.Group, colliders: Collider[]) {
  const parts = new THREE.Group();
  const curb = toon('#b9b4a8');
  const ink = toon('#3d405b');
  const wood = toon('#a0693f');
  const trunk = toon('#7a5236');
  const leaves = [toon('#5aa65a'), toon('#4b9a55'), toon('#6dba5e')];
  const steel = toon('#9aa1ad');
  const glass = toon('#cfe8f5', { transparent: true, opacity: 0.45 });
  const red = toon('#d62828');
  const yellow = toon('#ffd60a');
  const h = CITY_ROAD / 2;

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.5, 1);
  const seatGeo = new THREE.BoxGeometry(1.8, 0.08, 0.5);
  const backGeo = new THREE.BoxGeometry(1.8, 0.45, 0.06);
  const legGeo = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  const binGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10);
  const bollardGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.85, 8);
  const hoopGeo = new THREE.TorusGeometry(0.42, 0.04, 6, 12, Math.PI);
  const postGeo = new THREE.BoxGeometry(0.08, 2.6, 0.08);
  const hydrantGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8);

  /** Something set down at (x, z), turned by `yaw` to face the street. */
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, yaw: number, lx = 0, lz = 0) => {
    const m = mesh(geo, mat, 0, 0, 0, false);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    m.position.set(x + lx * c + lz * s, y, z - lx * s + lz * c);
    m.rotation.y = yaw;
    parts.add(m);
  };
  const block = (x: number, z: number, rx: number, rz: number, top: number) => colliders.push({ minX: x - rx, maxX: x + rx, minZ: z - rz, maxZ: z + rz, bottom: G, top: G + top });

  /** Where a thing at `f` is drawn: `lx` along its front and `lz` toward the road. */
  const lay = (f: Furniture, geo: THREE.BufferGeometry, mat: THREE.Material, y: number, lx = 0, lz = 0) => put(geo, mat, f.x, y, f.z, f.yaw, lx, lz);

  for (const s of STREETS) {
    const { from, to, line, near } = stretchSpan(s);
    const len = to - from - 2 * (h + CITY_WALK);
    const at = (along: number, across: number): [number, number] => (s.alongX ? [along, line + across] : [line + across, along]);
    for (const side of [-1, 1]) {
      // The curb, from crossing to crossing, along the road's edge.
      const [cx, cz] = at((from + to) / 2, side * (h + 0.09));
      parts.add(mesh(new THREE.BoxGeometry(s.alongX ? len : 0.18, CURB, s.alongX ? 0.18 : len), curb, cx, G - 0.02 + CURB / 2, cz, false));
    }
    if (!near) continue;
    // Bollards at both ends, where the sidewalk meets the crossing.
    for (const end of [from + BOLLARD_IN, to - BOLLARD_IN]) {
      for (const side of [-1, 1]) {
        const [x, z] = at(end, side * BOLLARD_OFF);
        parts.add(mesh(bollardGeo, ink, x, G + 0.42, z, false));
      }
    }
  }
  // Between the lamps (see shared/streetside.ts): a tree, and every so often a bench with a bin, a
  // bike stand, or a bus stop.
  for (const f of FURNITURE) {
    const { x, z, yaw } = f;
    if (f.kind === 'tree') {
      const k = f.k;
      const t = mesh(trunkGeo, trunk, x, G + 1.3 * k, z, false);
      t.scale.setScalar(k);
      parts.add(t);
      const cr = mesh(crownGeo, leaves[f.leaf], x, G + 3.3 * k, z, false);
      cr.scale.set(k, k * 1.15, k);
      parts.add(cr);
      block(x, z, 0.25, 0.25, 2.6 * k);
    } else if (f.kind === 'bench') {
      // A bench facing the road, a bin beside it.
      lay(f, seatGeo, wood, G + 0.45);
      lay(f, backGeo, wood, G + 0.75, 0, -0.24);
      for (const lx of [-0.75, 0.75]) lay(f, legGeo, ink, G + 0.22, lx, 0);
      block(x, z, 0.95, 0.95, 0.9);
      lay(f, binGeo, ink, G + 0.42, 1.35, 0);
    } else if (f.kind === 'bikes') {
      // Bike stands: three hoops in a row, square to the road.
      for (const lx of [-0.9, 0, 0.9]) {
        const hoop = mesh(hoopGeo, steel, 0, 0, 0, false);
        hoop.position.set(x + lx * Math.cos(yaw), G, z - lx * Math.sin(yaw));
        hoop.rotation.y = yaw + Math.PI / 2;
        parts.add(hoop);
      }
    } else if (f.kind === 'bus') {
      // A bus stop: a glass shelter with a bench in it and the sign on a pole.
      for (const lx of [-1.4, 1.4]) lay(f, postGeo, steel, G + 1.3, lx, -0.6);
      lay(f, new THREE.BoxGeometry(3, 0.08, 1.5), steel, G + 2.62, 0, -0.1);
      lay(f, new THREE.BoxGeometry(2.8, 2.2, 0.04), glass, G + 1.2, 0, -0.62);
      lay(f, seatGeo, wood, G + 0.45, 0, -0.3);
      lay(f, new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), steel, G + 1.4, 2.1, 0.5);
      lay(f, new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16).rotateX(Math.PI / 2), yellow, G + 2.7, 2.1, 0.5);
      block(x, z, 1.6, 1.6, 2.7);
    } else if (f.kind === 'bin') {
      lay(f, binGeo, ink, G + 0.42);
      // A fire hydrant by it.
      lay(f, hydrantGeo, red, G + 0.35, 0.9, 0);
    }
  }
  group.add(mergeByMaterial(parts));
  // The advertising pillars and newspaper boxes (town/pillars.ts).
  buildPillars(group, colliders, FURNITURE);
}

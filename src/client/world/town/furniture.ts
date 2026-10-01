import * as THREE from 'three';
import { CITY_ROAD, CITY_WALK, LOTS, STREETS, stretchRect } from '../../../shared/city';
import { mulberry32 } from '../../../shared/rng';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G, LAMP_EVERY } from './kit';

// flrnoh fork (see FORK.md): what stands along the city's streets at eye level (see town/index.ts):
// curbs along every road, and on the strip between the sidewalk and the buildings, street trees,
// benches, bins, bike stands and now and then a bus stop; bollards at the corners of the crossings.
// Only close by, where you walk (CLOSE): further off the haze has it.

/** How far from the office the street furniture goes. */
const CLOSE = 200;
/** How tall a curb stands over the road. */
const CURB = 0.14;

/** Whether a building stands within `pad` of (x, z). */
const built = (x: number, z: number, pad: number) => LOTS.some((l) => Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(z - l.z) < l.d / 2 + pad);

/** Lays the curbs and the street furniture into `group`; what's in the way goes in `colliders`. */
export function buildFurniture(group: THREE.Group, colliders: Collider[]) {
  const r = mulberry32(20261001);
  const parts = new THREE.Group();
  const curb = toon('#b9b4a8');
  const ink = toon('#3d405b');
  const wood = toon('#a0693f');
  const trunk = toon('#7a5236');
  const leaves = [toon('#5aa65a'), toon('#4b9a55'), toon('#6dba5e')];
  const steel = toon('#9aa1ad');
  const glass = toon('#cfe8f5', { transparent: true, opacity: 0.45 });
  const red = toon('#d62828');
  const h = CITY_ROAD / 2;
  // On the lots' strip, just past the sidewalk.
  const out = h + CITY_WALK + 0.9;

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.5, 1);
  const seatGeo = new THREE.BoxGeometry(1.8, 0.08, 0.5);
  const backGeo = new THREE.BoxGeometry(1.8, 0.45, 0.06);
  const legGeo = new THREE.BoxGeometry(0.08, 0.45, 0.45);
  const binGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10);
  const bollardGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.85, 8);
  const hoopGeo = new THREE.TorusGeometry(0.42, 0.04, 6, 12, Math.PI);
  const postGeo = new THREE.BoxGeometry(0.08, 2.6, 0.08);

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

  for (const s of STREETS) {
    const rr = stretchRect(s);
    const from = s.alongX ? rr.minX : rr.minZ;
    const to = s.alongX ? rr.maxX : rr.maxZ;
    const line = s.alongX ? (rr.minZ + rr.maxZ) / 2 : (rr.minX + rr.maxX) / 2;
    const mid = (from + to) / 2;
    const near = Math.hypot(s.alongX ? mid : line, s.alongX ? line : mid) < CLOSE;
    const len = to - from - 2 * (h + CITY_WALK);
    const at = (along: number, across: number): [number, number] => (s.alongX ? [along, line + across] : [line + across, along]);
    for (const side of [-1, 1]) {
      // The curb, from crossing to crossing, along the road's edge.
      const [cx, cz] = at(mid, side * (h + 0.09));
      const c = mesh(new THREE.BoxGeometry(s.alongX ? len : 0.18, CURB, s.alongX ? 0.18 : len), curb, cx, G - 0.02 + CURB / 2, cz, false);
      parts.add(c);
      if (!near) continue;
      // Facing the street: the yaw that turns a thing's +z toward the road.
      const yaw = s.alongX ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const start = from + h + CITY_WALK + 4;
      // Between the lamps (which stand every LAMP_EVERY from 12 m in, see town/ground.ts): a tree, and
      // every so often a bench with a bin, a bike stand, or a bus stop.
      let slot = 0;
      for (let a = start + LAMP_EVERY / 2; a < to - h - CITY_WALK - 4; a += LAMP_EVERY / 2, slot++) {
        const [x, z] = at(a, side * out);
        if (built(x, z, 1.4)) continue;
        if (slot % 2 === 0) {
          const k = 0.85 + r() * 0.35;
          const t = mesh(trunkGeo, trunk, x, G + 1.3 * k, z, false);
          t.scale.setScalar(k);
          parts.add(t);
          const cr = mesh(crownGeo, leaves[Math.floor(r() * leaves.length)], x, G + 3.3 * k, z, false);
          cr.scale.set(k, k * 1.15, k);
          parts.add(cr);
          block(x, z, 0.25, 0.25, 2.6 * k);
          continue;
        }
        const pick = r();
        if (pick < 0.45) {
          // A bench facing the road, a bin beside it.
          put(seatGeo, wood, x, G + 0.45, z, yaw);
          put(backGeo, wood, x, G + 0.75, z, yaw, 0, -0.24);
          for (const lx of [-0.75, 0.75]) put(legGeo, ink, x, G + 0.22, z, yaw, lx, 0);
          block(x, z, 0.95, 0.95, 0.9);
          put(binGeo, ink, x, G + 0.42, z, yaw, 1.35, 0);
        } else if (pick < 0.7) {
          // Bike stands: three hoops in a row, square to the road.
          for (const lx of [-0.9, 0, 0.9]) {
            const hoop = mesh(hoopGeo, steel, 0, 0, 0, false);
            const c2 = Math.cos(yaw);
            const s2 = Math.sin(yaw);
            hoop.position.set(x + lx * c2, G, z - lx * s2);
            hoop.rotation.y = yaw + Math.PI / 2;
            parts.add(hoop);
          }
        } else if (pick < 0.82 && len > 30) {
          // A bus stop: a glass shelter with a bench in it and the sign on a pole.
          for (const lx of [-1.4, 1.4]) put(postGeo, steel, x, G + 1.3, z, yaw, lx, -0.6);
          put(new THREE.BoxGeometry(3, 0.08, 1.5), steel, x, G + 2.62, z, yaw, 0, -0.1);
          put(new THREE.BoxGeometry(2.8, 2.2, 0.04), glass, x, G + 1.2, z, yaw, 0, -0.62);
          put(seatGeo, wood, x, G + 0.45, z, yaw, 0, -0.3);
          put(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), steel, x, G + 1.4, z, yaw, 2.1, 0.5);
          put(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16).rotateX(Math.PI / 2), toon('#ffd60a'), x, G + 2.7, z, yaw, 2.1, 0.5);
          block(x, z, 1.6, 1.6, 2.7);
        } else {
          put(binGeo, ink, x, G + 0.42, z, yaw);
          // A fire hydrant by it.
          put(new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8), red, x, G + 0.35, z, yaw, 0.9, 0);
        }
      }
    }
    if (!near) continue;
    // Bollards at both ends, where the sidewalk meets the crossing.
    for (const end of [from + h + CITY_WALK + 0.6, to - h - CITY_WALK - 0.6]) {
      for (const side of [-1, 1]) {
        const [x, z] = at(end, side * (h + 0.45));
        parts.add(mesh(bollardGeo, ink, x, G + 0.42, z, false));
      }
    }
  }
  group.add(mergeByMaterial(parts));
}

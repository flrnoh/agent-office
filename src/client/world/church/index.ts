import * as THREE from 'three';
import { CHURCH, NAVE, TOWER } from '../../../shared/church';
import type { Fixture, StreetSite } from '../office/fixture';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G } from '../town/kit';

// flrnoh fork (see FORK.md, "Sounds of the city"): the little church on its park (shared/church.ts
// lays it out), whose bells strike the hours (features/citysound). A plastered nave under a red tiled
// gable roof, tall blue windows down its sides, and at its end, toward the office, a square tower with
// its belfry's louvres, round windows, a green copper spire and a gilt cross. You can't go in.

const PLASTER = '#efe6d2';
const TOWER_PLASTER = '#e6dac2';
const TILES = '#9c4433';
const COPPER = '#5c9a82';
const GLASS = '#34507e';
const DARK = '#3b2c25';
const GOLD = '#d9b44a';
const STONE = '#b7aa94';

/**
 * The church, built along +x from its tower (at -x) to the altar end, its middle at the origin and
 * its ground at 0; the caller turns it and sets it on the park.
 */
function buildChurch(): THREE.Group {
  const g = new THREE.Group();
  const halfLong = (NAVE.len + TOWER.w) / 2;
  const naveX = halfLong - NAVE.len / 2;
  const towerX = -halfLong + TOWER.w / 2;
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => g.add(mesh(geo, toon(color), x, y, z));
  // The nave, on a stone plinth.
  add(new THREE.BoxGeometry(NAVE.len, NAVE.eaves, NAVE.w), PLASTER, naveX, NAVE.eaves / 2, 0);
  add(new THREE.BoxGeometry(NAVE.len + 0.3, 0.6, NAVE.w + 0.3), STONE, naveX, 0.3, 0);
  // Its gable roof: a triangle along the nave, overhanging a little.
  const over = 0.5;
  const shape = new THREE.Shape([new THREE.Vector2(-NAVE.w / 2 - over, 0), new THREE.Vector2(NAVE.w / 2 + over, 0), new THREE.Vector2(0, NAVE.ridge - NAVE.eaves + 0.3)]);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: NAVE.len + over * 2, bevelEnabled: false });
  roof.rotateY(Math.PI / 2).translate(naveX - NAVE.len / 2 - over, NAVE.eaves - 0.15, 0);
  add(roof, TILES, 0, 0, 0);
  // The gable end wall, filling the triangle under the roof at the altar end.
  const gable = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-NAVE.w / 2, 0), new THREE.Vector2(NAVE.w / 2, 0), new THREE.Vector2(0, NAVE.ridge - NAVE.eaves)]));
  gable.rotateY(Math.PI / 2).translate(naveX + NAVE.len / 2 + 0.01, NAVE.eaves, 0);
  add(gable, PLASTER, 0, 0, 0);
  // Tall windows down both sides, and a round one in the gable.
  for (let k = 0; k < 4; k++) {
    const x = naveX - NAVE.len / 2 + 2.6 + k * 3.3;
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(1.1, 3, 0.12), GLASS, x, 3.3, s * (NAVE.w / 2 + 0.02));
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), GLASS, x, 4.8, s * (NAVE.w / 2 + 0.02));
    }
  }
  add(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16).rotateZ(Math.PI / 2), GLASS, naveX + NAVE.len / 2 + 0.06, NAVE.eaves + 1.2, 0);
  // The tower, a little proud of the nave's width, on its own plinth.
  add(new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.w), TOWER_PLASTER, towerX, TOWER.h / 2, 0);
  add(new THREE.BoxGeometry(TOWER.w + 0.3, 0.8, TOWER.w + 0.3), STONE, towerX, 0.4, 0);
  add(new THREE.BoxGeometry(TOWER.w + 0.3, 0.35, TOWER.w + 0.3), STONE, towerX, TOWER.h - 0.17, 0);
  // Its door, at the foot, facing away from the nave, with the step before it.
  add(new THREE.BoxGeometry(0.14, 3, 1.8), DARK, towerX - TOWER.w / 2 - 0.05, 1.5, 0);
  add(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2), DARK, towerX - TOWER.w / 2 - 0.05, 3, 0);
  add(new THREE.BoxGeometry(1, 0.2, 2.6), STONE, towerX - TOWER.w / 2 - 0.5, 0.1, 0);
  // On each side: a round window halfway up, and the belfry's louvred openings where the bells hang.
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const fx = towerX + nx * (TOWER.w / 2 + 0.03);
    const fz = nz * (TOWER.w / 2 + 0.03);
    const flat = (w: number, h: number) => (nx ? new THREE.BoxGeometry(0.1, h, w) : new THREE.BoxGeometry(w, h, 0.1));
    add(nx ? new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14).rotateZ(Math.PI / 2) : new THREE.CylinderGeometry(0.6, 0.6, 0.1, 14).rotateX(Math.PI / 2), GLASS, fx, 9.5, fz);
    add(flat(1.7, 2.6), DARK, fx, TOWER.belfry, fz);
    for (let k = 0; k < 4; k++) add(flat(1.8, 0.12), TOWER_PLASTER, fx + nx * 0.04, TOWER.belfry - 0.95 + k * 0.62, fz + nz * 0.04);
  }
  // The spire, square like the tower, in green copper, and the gilt cross on its tip.
  const spire = new THREE.ConeGeometry(TOWER.w * 0.72, TOWER.spire, 4).rotateY(Math.PI / 4);
  add(spire, COPPER, towerX, TOWER.h + TOWER.spire / 2, 0);
  const top = TOWER.h + TOWER.spire;
  add(new THREE.SphereGeometry(0.22, 8, 6), GOLD, towerX, top + 0.1, 0);
  add(new THREE.BoxGeometry(0.14, 1.8, 0.14), GOLD, towerX, top + 1, 0);
  add(new THREE.BoxGeometry(0.14, 0.14, 1.0), GOLD, towerX, top + 1.3, 0);
  return mergeByMaterial(g);
}

/** Fork: the church on its park, down on the street in the outlook with the city round it. */
export const church: Fixture<never, StreetSite> = (site) => {
  if (!CHURCH) return {};
  const built = buildChurch();
  built.position.set(CHURCH.x, G, CHURCH.z);
  built.rotation.y = CHURCH.alongX ? (CHURCH.dir > 0 ? 0 : Math.PI) : CHURCH.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  site.outlook.add(built);
  const colliders: Collider[] = CHURCH.solids.map((s) => ({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, bottom: G + s.bottom, top: G + s.top }));
  site.groundColliders.push(...colliders);
  return {};
};

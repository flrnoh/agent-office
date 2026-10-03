import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STREET_Y, streetBelow } from '../../../shared/layout';
import { THERME_NAME } from '../../../shared/therme';
import { STREET_DOME, STREET_TOWER, THERME_STREET_DOOR, THERME_STREET_HALL, THERME_STREET_HEIGHT } from '../../../shared/therme-street';
import type { Collider, Interactable } from '../types';
import type { Door } from '../office/shell';
import type { Fixture, StreetSite } from '../office/fixture';
import { mergeByColor, mesh, toon } from '../toon';
import { glow, rand, sign } from './kit';
import { buildPalms } from './palms';

/*
 * The thermal baths from the street (flrnoh fork, see shared/therme-street.ts, phase 7): south of the
 * gym, its front to the side street on the west. A long cream hall with bands of glass (lit warm
 * from inside at night), palms behind the glass of the west front, the glass dome on its steel ribs
 * over its middle, the slide tower at its east end with three tubes corkscrewing round it outside,
 * its name in big letters along the roof's west edge, the entrance under a canopy with glass doors
 * that slide apart. Built down on the street with the city, so it's there from every floor's street,
 * from the windows and from the roof.
 */

const G = STREET_Y;
const B = THERME_STREET_HALL;
const H = THERME_STREET_HEIGHT;

export interface ThermeExterior {
  door: Door;
  interactable: Interactable;
  setStreet(y: number): void;
  update(t: number): void;
}

export function buildThermeExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[]): ThermeExterior {
  const still = new THREE.Group();
  const r = rand(171);
  const W = B.maxX - B.minX;
  const D = B.maxZ - B.minZ;
  const cx = (B.minX + B.maxX) / 2;
  const cz = (B.minZ + B.maxZ) / 2;
  // The hall: cream walls, a darker plinth, a white cornice.
  still.add(mesh(new THREE.BoxGeometry(W, H, D), toon('#f1e6d3'), cx, G + H / 2, cz));
  still.add(mesh(new THREE.BoxGeometry(W + 0.2, 0.8, D + 0.2), toon('#b9a88c'), cx, G + 0.4, cz, false));
  still.add(mesh(new THREE.BoxGeometry(W + 0.6, 0.5, D + 0.6), toon('#ffffff'), cx, G + H + 0.25, cz, false));
  // Bands of glass along every side, lit from inside at night.
  const glass = new THREE.MeshToonMaterial({ color: '#9fd8e6', emissive: '#ffd9a0', emissiveIntensity: 0.15, gradientMap: toon('#ffffff').gradientMap });
  const band = (len: number, x: number, z: number, rotY: number, y0: number, h: number) => {
    const m = mesh(new THREE.PlaneGeometry(len, h), glass, x, G + y0 + h / 2, z, false);
    m.rotation.y = rotY;
    group.add(m);
  };
  band(W - 6, cx, B.minZ - 0.02, Math.PI, 5, 4.6);
  band(W - 6, cx, B.maxZ + 0.02, 0, 5, 4.6);
  band(D - 8, B.maxX + 0.02, cz, Math.PI / 2, 5, 4.6);
  // The west front: tall glass either side of the entrance, palms behind it.
  band((D - 8) / 2 - 3, B.minX - 0.02, B.minZ + 4 + ((D - 8) / 2 - 3) / 2, -Math.PI / 2, 0.8, 9.5);
  band((D - 8) / 2 - 3, B.minX - 0.02, B.maxZ - 4 - ((D - 8) / 2 - 3) / 2, -Math.PI / 2, 0.8, 9.5);
  // Mullions over the glass.
  for (let z = B.minZ + 4; z <= B.maxZ - 4; z += 3) still.add(mesh(new THREE.BoxGeometry(0.15, 10, 0.15), toon('#e9eef1'), B.minX - 0.08, G + 5.5, z, false));
  const grove = buildPalms(
    Array.from({ length: 6 }, (_, i) => ({ x: B.minX + 2.5 + (i % 2) * 2, z: B.minZ + 6 + i * 7.2, h: 7 + r() * 2, y: G })),
    173,
  );
  group.add(grove.group);
  // The dome: glass on ribs, over the middle of the roof.
  const Dm = STREET_DOME;
  const glassDome = new THREE.MeshToonMaterial({ color: '#bfe9f2', transparent: true, opacity: 0.45, side: THREE.DoubleSide, emissive: '#ffe2b0', emissiveIntensity: 0.12, gradientMap: toon('#ffffff').gradientMap });
  const dome = mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassDome, Dm.cx, G + H, Dm.cz, false);
  dome.scale.set(Dm.rx, Dm.rise, Dm.rz);
  dome.userData.noOutline = true;
  group.add(dome);
  const at = (phi: number, th: number) => new THREE.Vector3(Dm.cx + Dm.rx * Math.cos(phi) * Math.cos(th), G + H + Dm.rise * Math.sin(phi), Dm.cz + Dm.rz * Math.cos(phi) * Math.sin(th));
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const th = (i / 20) * Math.PI * 2;
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => at((k / 12) * (Math.PI / 2) * 0.985, th))), 16, 0.18, 5, false));
  }
  for (let k = 0; k < 4; k++) ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, j) => at((k / 4) * (Math.PI / 2), (j / 48) * Math.PI * 2)), true), 96, 0.16, 5, true));
  still.add(mesh(mergeGeometries(ribs)!, toon('#e9eef1'), 0, 0, 0, false));
  for (const g of ribs) g.dispose();
  // The slide tower and its tubes, corkscrewing round it down to the ground.
  const T = STREET_TOWER;
  still.add(mesh(new THREE.BoxGeometry(T.half * 2, T.h, T.half * 2), toon('#f5c518'), T.x, G + T.h / 2, T.z));
  const cap = mesh(new THREE.ConeGeometry(T.half * 1.6, 4, 4), toon('#e8505b'), T.x, G + T.h + 2, T.z, false);
  cap.rotation.y = Math.PI / 4;
  still.add(cap);
  for (const [k, color] of ['#e63946', '#7b2cbf', '#2a9d8f'].entries()) {
    const turns = 2.2 + k * 0.4;
    const rad = T.half + 2.2 + k * 1.6;
    const top = G + T.h - 2 - k * 4;
    const pts = Array.from({ length: 80 }, (_, i) => {
      const u = i / 79;
      const a = k * 2.1 + u * turns * Math.PI * 2;
      return new THREE.Vector3(T.x + Math.cos(a) * rad, top + (G + 1 - top) * u, T.z + Math.sin(a) * rad);
    });
    const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.7, 10, false), toon(color), 0, 0, 0, false);
    group.add(tube);
  }
  // The name along the roof's west edge, and over the doors.
  const name = mesh(new THREE.PlaneGeometry(30, 3.4), glow(sign(THERME_NAME.toUpperCase(), 'Thermalbad · Rutschen · Saunadorf · Lagune', '#3b2412', '#ffcf8a', 1024, 116)), B.minX - 0.6, G + H + 2.2, cz, false);
  name.rotation.y = -Math.PI / 2;
  group.add(name);
  still.add(mesh(new THREE.BoxGeometry(0.4, 3.8, 30.4), toon('#3b2412'), B.minX - 0.35, G + H + 2.2, cz, false));
  // The entrance: a canopy over glass doors that slide apart.
  const Dr = THERME_STREET_DOOR;
  still.add(mesh(new THREE.BoxGeometry(4, 0.3, 9), toon('#ffffff'), B.minX - 2, G + Dr.height + 0.9, Dr.z, false));
  for (const s of [-1, 1]) still.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, Dr.height + 0.9, 8), toon('#e9eef1'), B.minX - 3.8, G + (Dr.height + 0.9) / 2, Dr.z + s * 4.2, false));
  const leafMat = new THREE.MeshToonMaterial({ color: '#bfe3ef', transparent: true, opacity: 0.55, gradientMap: toon('#ffffff').gradientMap });
  const leaves = [-1, 1].map((s) => {
    const leaf = mesh(new THREE.BoxGeometry(0.06, Dr.height, Dr.width / 2), leafMat, B.minX - 0.05, G + Dr.height / 2, Dr.z + (s * Dr.width) / 4, false);
    leaf.userData.noOutline = true;
    group.add(leaf);
    return { leaf, s };
  });
  const lintel = mesh(new THREE.PlaneGeometry(Dr.width + 0.6, 0.7), glow(sign('EINGANG', 'Kasse · Eintritt frei', '#0f4c5c', '#ffe8a8', 512, 120)), B.minX - 0.05, G + Dr.height + 0.4, Dr.z, false);
  lintel.rotation.y = -Math.PI / 2;
  group.add(lintel);
  group.add(mergeByColor(still));

  colliders.push({ ...B, bottom: G, top: G + H + 1 });
  colliders.push({ minX: T.x - T.half - 4, maxX: T.x + T.half + 4, minZ: T.z - T.half - 4, maxZ: T.z + T.half + 4, bottom: G, top: G + T.h + 4 });
  for (const s of [-1, 1]) colliders.push({ minX: B.minX - 3.95, maxX: B.minX - 3.65, minZ: Dr.z + s * 4.2 - 0.15, maxZ: Dr.z + s * 4.2 + 0.15, bottom: G, top: G + Dr.height + 1 });

  const interactable: Interactable = { kind: 'thermestreet', x: B.minX - 1.2, z: Dr.z, y: G, radius: 2.6 };
  interactables.push(interactable);
  for (const { leaf } of leaves) leaf.userData.interact = interactable;
  lintel.userData.interact = interactable;
  // The doorway itself (the leaves slide away as you come up): an invisible box there to aim at.
  const way = mesh(new THREE.BoxGeometry(0.3, Dr.height, Dr.width), new THREE.MeshBasicMaterial({ visible: false }), B.minX + 0.1, G + Dr.height / 2, Dr.z, false);
  way.userData.interact = interactable;
  group.add(way);
  const door: Door = {
    x: B.minX - 0.3,
    y: G,
    z: Dr.z,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.z = Dr.z + (s * Dr.width) / 4 + s * e * (Dr.width / 2 - 0.1);
    },
  };
  return {
    door,
    interactable,
    setStreet(y) {
      door.y = y;
      interactable.y = y;
    },
    update(t) {
      grove.update(t);
    },
  };
}

/** Fork: the thermal baths' house on the street (see above). */
export const thermeOut: Fixture<never, StreetSite> = (site) => {
  const out = buildThermeExterior(site.outlook, site.groundColliders, site.interactables);
  site.doors.push(out.door);
  return { setLevel: (index) => out.setStreet(streetBelow(index)), update: (t) => out.update(t) };
};

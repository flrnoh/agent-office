import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOME, NORTH_BAND_Z, ROOFS, THERME_BOX, TWALL, ZONES, thermeWalls } from '../../../shared/therme';
import { mesh, toon } from '../toon';
import { blk, flat, tex, tiles, wrap, type ThermeParts } from './kit';

/*
 * The thermal baths' shell (flrnoh fork, see shared/therme.ts): the floor, the walls as the plan has
 * them, the roofs (the north band's, the sauna village's, the eaves round the dome, the slide hall's
 * high one with its trusses) and the glass dome over the Thermenparadies on its steel ribs and rings.
 * The sky shows through the dome (the place doesn't hide it), so it's day or night in there as it
 * is outside.
 */

const B = THERME_BOX;
const W = TWALL;
const PLASTER = '#efe6d6';
const SKIRT = '#cdb995';
const STEEL = '#e9eef1';

/** The floor: warm sandstone tiles everywhere, pale blue ones in the slide world. */
function floors(p: ThermeParts) {
  const all = { minX: B.minX - W, maxX: B.maxX + W, minZ: B.minZ - W, maxZ: B.maxZ + W };
  flat(p, all, tex(wrap(tiles('#e7d8bd', '#bfae8f', 4, 0.05, 11), (all.maxX - all.minX) / 2, (all.maxZ - all.minZ) / 2)), 0);
  const r = ZONES.rutschen;
  flat(p, r, tex(wrap(tiles('#cfe4ec', '#9fbfcc', 4, 0.05, 13), (r.maxX - r.minX) / 2, (r.maxZ - r.minZ) / 2)), 0.006);
}

/** The walls from the plan, plaster with a sandstone skirting along the bottom (just proud of it, so they never flicker). */
function walls(p: ThermeParts) {
  for (const f of thermeWalls()) {
    const bottom = f.bottom ?? 0;
    const w = f.maxX - f.minX;
    const d = f.maxZ - f.minZ;
    blk(p, w, f.top - bottom, d, PLASTER, (f.minX + f.maxX) / 2, (bottom + f.top) / 2, (f.minZ + f.maxZ) / 2);
    if (bottom === 0 && f.top > 2) blk(p, w + 0.03, 1.0, d + 0.03, SKIRT, (f.minX + f.maxX) / 2, 0.5, (f.minZ + f.maxZ) / 2);
  }
}

/** The ceilings under each part's roof; round the dome, the eaves are a frame with the dome's ellipse cut out. */
function roofs(p: ThermeParts) {
  const under = toon('#f4efe6');
  flat(p, { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: NORTH_BAND_Z }, under, ROOFS.band, true);
  flat(p, ZONES.dorf, under, ROOFS.dorf, true);
  flat(p, ZONES.rutschen, toon('#e3e9ec'), ROOFS.rutschen, true);
  // The slide hall's trusses, every 10 m across it.
  const r = ZONES.rutschen;
  for (let z = r.minZ + 5; z < r.maxZ; z += 10) {
    blk(p, r.maxX - r.minX, 0.5, 0.35, STEEL, (r.minX + r.maxX) / 2, ROOFS.rutschen - 0.6, z);
    blk(p, r.maxX - r.minX, 0.25, 0.25, STEEL, (r.minX + r.maxX) / 2, ROOFS.rutschen - 2.4, z);
    for (let x = r.minX + 3; x < r.maxX; x += 6) {
      const strut = blk(p, 0.14, 2.2, 0.14, STEEL, x, ROOFS.rutschen - 1.5, z);
      strut.rotation.z = ((x - r.minX) / 3) % 2 < 1 ? 0.6 : -0.6;
    }
  }
  // The eaves round the dome: the paradise's rectangle with the ellipse cut out, facing down.
  const z = ZONES.paradies;
  const shape = new THREE.Shape();
  shape.moveTo(z.minX, z.minZ);
  shape.lineTo(z.maxX, z.minZ);
  shape.lineTo(z.maxX, z.maxZ);
  shape.lineTo(z.minX, z.maxZ);
  shape.lineTo(z.minX, z.minZ);
  const hole = new THREE.Path();
  hole.absellipse(DOME.cx, DOME.cz, DOME.rx, DOME.rz, 0, Math.PI * 2, false, 0);
  shape.holes.push(hole);
  const eaves = mesh(new THREE.ShapeGeometry(shape, 48), toon('#f4efe6'), 0, ROOFS.paradies, 0, false);
  eaves.rotation.x = Math.PI / 2;
  p.still.add(eaves);
}

/** The dome: glass on a steel frame (ribs from the eaves to the crown, rings round it, a beam on the eaves). */
function dome(p: ThermeParts) {
  const H = DOME.top - DOME.spring;
  const at = (phi: number, theta: number) => new THREE.Vector3(DOME.cx + DOME.rx * Math.cos(phi) * Math.cos(theta), DOME.spring + H * Math.sin(phi), DOME.cz + DOME.rz * Math.cos(phi) * Math.sin(theta));
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < DOME.ribs; i++) {
    const theta = (i / DOME.ribs) * Math.PI * 2;
    const pts = Array.from({ length: 17 }, (_, k) => at((k / 16) * (Math.PI / 2) * 0.985, theta));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.22, 5, false));
  }
  for (let k = 0; k <= DOME.rings; k++) {
    const phi = (k / (DOME.rings + 1)) * (Math.PI / 2);
    const pts = Array.from({ length: 64 }, (_, j) => at(phi, (j / 64) * Math.PI * 2));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, k === 0 ? 0.45 : 0.18, 5, true));
  }
  // Where the ribs meet at the crown: a ring of steel round the lantern.
  geos.push(new THREE.CylinderGeometry(2.2, 2.6, 0.6, 16).translate(DOME.cx, DOME.top + 0.05, DOME.cz));
  const frame = mesh(mergeGeometries(geos)!, toon(STEEL), 0, 0, 0, false);
  for (const g of geos) g.dispose();
  p.still.add(frame);
  const glass = new THREE.MeshToonMaterial({ color: '#cdeef5', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, gradientMap: toon('#ffffff').gradientMap });
  const shell = mesh(new THREE.SphereGeometry(1, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass, DOME.cx, DOME.spring, DOME.cz, false);
  shell.scale.set(DOME.rx, H, DOME.rz);
  shell.userData.noOutline = true;
  shell.userData.outlineParameters = { visible: false };
  shell.renderOrder = 2;
  p.group.add(shell);
}

export function buildShell(p: ThermeParts) {
  floors(p);
  walls(p);
  roofs(p);
  dome(p);
}

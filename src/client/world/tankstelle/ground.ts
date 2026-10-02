import * as THREE from 'three';
import { DRIVEWAYS, PLANTER, STATION, STATION_PAVED, WASH } from '../../../shared/tankstelle';
import { canvasTexture } from '../texture';
import { mergeByMaterial, mesh, toon } from '../toon';
import { Flats, flat } from '../town/kit';
import { FONT, G, block } from './kit';

// flrnoh fork (see FORK.md "The petrol station"): the station's ground: grass round its edge and in
// the planter under the pylon, asphalt wherever a car may go (shared/tankstelle.ts STATION_PAVED),
// the driveways out across the sidewalks with their lowered curbs, curbs along the grass, and the
// markings: arrows, parking bays, the way into the wash and its yellow tyre guides.

const ASPHALT = '#4f535d';

/** Words painted on the ground at (x, z), `w` m across, reading toward +z turned by `rotY`. */
function painted(text: string, x: number, z: number, w: number, rotY = 0, color = '#ffffff'): THREE.Mesh {
  const tex = canvasTexture(512, 128, (g) => {
    g.fillStyle = color;
    g.font = `900 92px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
  });
  const mat = flat('#ffffff', 7, tex);
  mat.transparent = true;
  mat.alphaTest = 0.3;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
  m.rotation.set(-Math.PI / 2, 0, rotY);
  m.position.set(x, G + 0.012, z);
  m.receiveShadow = true;
  return m;
}

/** An arrow painted on the ground at (x, z), pointing north (`dir` -1) or south (1). */
function arrow(lines: Flats, x: number, z: number, dir: 1 | -1) {
  // The shaft, then the head in three strips narrowing to its point.
  lines.add(x - 0.15, x + 0.15, z - 1.6 * dir, z + 0.2 * dir, G + 0.01);
  for (let i = 0; i < 4; i++) {
    const half = 0.75 - i * 0.18;
    const z0 = z + (0.2 + i * 0.28) * dir;
    lines.add(x - half, x + half, Math.min(z0, z0 + 0.28 * dir), Math.max(z0, z0 + 0.28 * dir), G + 0.01);
  }
}

export function buildStationGround(group: THREE.Group) {
  const b = STATION;
  // Grass over the whole block, and the asphalt over it where cars go.
  const grass = new Flats();
  grass.add(b.minX, b.maxX, b.minZ, b.maxZ, G - 0.009);
  group.add(grass.mesh(flat('#86c56f', 2)));
  const asphalt = new Flats();
  const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  for (const r of STATION_PAVED) asphalt.add(clip(r.minX, b.minX, b.maxX), clip(r.maxX, b.minX, b.maxX), clip(r.minZ, b.minZ, b.maxZ), clip(r.maxZ, b.minZ, b.maxZ), G + 0.003);
  // North of the block the driveway runs over the city's flat sidewalk to its street.
  const north = DRIVEWAYS[2];
  asphalt.add(north.minX, north.maxX, north.minZ, b.minZ, G + 0.004);
  group.add(asphalt.mesh(flat(ASPHALT, 3)));

  const solid = new THREE.Group();
  // South, the office's street has raised sidewalks: the driveways cross them as lowered aprons.
  const apron = toon('#6b6f78');
  for (const d of DRIVEWAYS.slice(0, 2)) {
    // A centimeter out past the sidewalk's edges at both ends, so its ends and the sidewalk's aren't one plane.
    const z1 = (d.minX < -110 ? 22.3 : 23) + 0.01; // west of the town the scenic loop's road starts sooner
    block(solid, d.maxX - d.minX, 0.1, z1 - b.maxZ + 0.01, apron, (d.minX + d.maxX) / 2, (b.maxZ - 0.01 + z1) / 2, -0.05, false);
  }

  // Curbs along the grass (low enough to step over; a car's wheels don't notice them either).
  const curb = toon('#d8d4cb');
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const w = Math.max(0.18, Math.abs(x1 - x0));
    const d = Math.max(0.18, Math.abs(z1 - z0));
    block(solid, w, 0.13, d, curb, (x0 + x1) / 2, (z0 + z1) / 2, 0, false);
  };
  run(-113.5, 20, -105.5, 20); // between the driveways, along the street
  run(-133, 20, -121.5, 20);
  run(-97.5, 20, PLANTER.minX, 20);
  run(PLANTER.minX, PLANTER.minZ, PLANTER.minX, PLANTER.maxZ); // round the pylon's planter
  run(PLANTER.minX, PLANTER.minZ, -91, PLANTER.minZ);
  run(-91, -9, -91, PLANTER.minZ); // the east edge
  run(-133, WASH.hall.maxZ, -133, 20); // the west edge, south of the hall
  run(-133, -22, -131, -22); // the north edge either side of the way out of the wash
  run(-125, -22, -114.3, -22);
  run(-114.3, -22, -114.3, -21);

  // ---- Markings ----------------------------------------------------------------------------------
  const lines = new Flats();
  const yellow = new Flats();
  // Arrows: in at the east driveway, round under the canopy, and up the lane into the wash.
  arrow(lines, -101.5, 13.5, -1);
  arrow(lines, -116.6, -2.5, -1);
  arrow(lines, -117.5, 17.4, -1);
  arrow(lines, -128, 13.5, -1);
  arrow(lines, -128, 4.5, -1);
  // The parking bays in front of the shop, nose in: a line either side of each.
  for (const x of [-113, -110, -98.2, -95.2]) lines.add(x - 0.06, x + 0.06, -9, -4.2, G + 0.01);
  lines.add(-113, -95.2, -4.26, -4.14, G + 0.01);
  // A bay for the air and the water, and the vacuum's bays.
  lines.add(-96, -91.2, 3.2, 3.32, G + 0.01);
  lines.add(-96, -91.2, 8.8, 8.92, G + 0.01);
  for (const x of [-122.8, -119.4, -114.6]) lines.add(x - 0.06, x + 0.06, -21.5, -12.5, G + 0.01);
  // The wash: a yellow line down the lane, the stop line and chevrons on the marking.
  yellow.add(WASH.lane - 0.08, WASH.lane + 0.08, WASH.hall.maxZ, 16, G + 0.01);
  yellow.add(WASH.lane - 1.6, WASH.lane + 1.6, WASH.bay.z - 2.7, WASH.bay.z - 2.45, G + 0.011);
  for (let i = 0; i < 3; i++) {
    const z = WASH.bay.z + 1.8 - i * 0.9;
    yellow.add(WASH.lane - 0.9, WASH.lane - 0.2, z, z + 0.22, G + 0.011);
    yellow.add(WASH.lane + 0.2, WASH.lane + 0.9, z, z + 0.22, G + 0.011);
  }
  group.add(lines.mesh(flat('#f4f4f0', 6)), yellow.mesh(flat('#ffcf33', 6)));
  group.add(painted('EINFAHRT', -101.5, 17.6, 4.6, Math.PI));
  group.add(painted('WASCHSTRASSE', -128, 9.5, 6, Math.PI, '#ffcf33'));
  group.add(painted('STOP', WASH.lane, WASH.bay.z - 3.4, 2.6, Math.PI, '#ffcf33'));
  group.add(painted('AUSFAHRT', -128, -23.6, 4.2, Math.PI));
  group.add(painted('LUFT · WASSER', -93.6, 6, 4, -Math.PI / 2));
  group.add(painted('SAUGER', -118.6, -12, 3.2, Math.PI));

  // The tyre guides on the wash's floor: two low yellow rails the wheels run between.
  const guide = toon('#ffcf33');
  for (const dx of [-1.25, 1.25]) block(solid, 0.12, 0.1, 9, guide, WASH.lane + dx, WASH.bay.z + 2.5, 0, false);
  group.add(mergeByMaterial(solid));
  // A drain down the middle of the wash.
  group.add(mesh(new THREE.BoxGeometry(0.35, 0.02, 14), toon('#30333b'), WASH.lane, G + 0.008, WASH.bay.z, false));
}

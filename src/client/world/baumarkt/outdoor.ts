import * as THREE from 'three';
import { BAY, BLOCK, DRIVEWAY, GARDEN, GARDEN_GATE, GLASSHOUSE, HALL, LORRY, LOT, type Box } from '../../../shared/baumarkt';
import { CORRAL } from '../../../shared/baumarkt-play';
import { mulberry32 } from '../../../shared/rng';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G } from '../town/kit';
import { BLUE, ORANGE, box, signPlane, slab, writeSign } from './kit';
import { palletModel } from './models';

// flrnoh fork (see FORK.md "The Baumarkt"): round the hall: the car park with its bays and arrows and
// the driveway across the sidewalk, the pylon sign by the street, the trolley corral by the doors, the
// fenced garden centre (plants on tables, trees in pots, sacks of soil on pallets, a glasshouse roof)
// and the delivery bay with its lorry.

export function buildOutdoor(group: THREE.Group, colliders: Collider[], night: NightParts): THREE.MeshBasicMaterial[] {
  const r = mulberry32(20261003);
  const parts = new THREE.Group();
  const asphalt = toon('#5b606c');
  const white = toon('#f1f1f1');
  const yellow = toon('#ffd23f');
  const ink = toon('#2b2d36');
  const lit: THREE.MeshBasicMaterial[] = [];
  const flatOn = (b: Box, y: number, mat: THREE.Material) => parts.add(slab(b.minX, b.maxX, b.minZ, b.maxZ, G + y - 0.01, G + y, mat, false));

  // ---- The car park, the bay and the driveway --------------------------------------------------
  flatOn(LOT, 0.012, asphalt);
  flatOn(BAY, 0.012, asphalt);
  flatOn(DRIVEWAY, 0.016, asphalt);
  // Bays: a row along the front, nose to the street, and one facing the hall across the lane.
  const stall = 2.6;
  for (const [z0, z1] of [
    [LOT.maxZ - 5.6, LOT.maxZ - 0.6],
    [LOT.minZ + 5, LOT.minZ + 10],
  ]) {
    for (let k = 0; k <= 5; k++) parts.add(slab(LOT.minX + 1 + k * stall - 0.06, LOT.minX + 1 + k * stall + 0.06, z0, z1, G + 0.014, G + 0.02, white, false));
  }
  // A family bay by the doors, and the arrows down the lane.
  parts.add(slab(LOT.minX + 15.2, LOT.minX + 17.8, LOT.minZ + 5.2, LOT.minZ + 9.8, G + 0.014, G + 0.019, toon('#4ea8de'), false));
  for (const x of [LOT.minX + 6, LOT.minX + 14]) {
    const a = mesh(new THREE.ConeGeometry(0.6, 1.4, 3).rotateX(-Math.PI / 2).scale(1, 0.02, 1), white, x, G + 0.02, LOT.minZ + 12.5, false);
    a.rotation.y = -Math.PI / 2;
    parts.add(a);
  }
  // EINFAHRT painted at the driveway.
  const inWord = signPlane(4, 1, 400, (g, W, H) => writeSign(g, W, H, 'EINFAHRT', { bg: '#5b606c', fg: '#f1f1f1' }));
  inWord.rotation.x = -Math.PI / 2;
  inWord.position.set((DRIVEWAY.minX + DRIVEWAY.maxX) / 2, G + 0.022, LOT.maxZ - 2.5);
  group.add(inWord);
  // The hatched line where the forklift's bay ends.
  for (let x = BAY.minX + 0.2; x < BAY.maxX - 0.2; x += 0.6) parts.add(slab(x, x + 0.3, BAY.maxZ - 0.25, BAY.maxZ, G + 0.014, G + 0.02, (x - BAY.minX) % 1.2 < 0.6 ? yellow : ink, false));

  // ---- The pylon sign by the street ---------------------------------------------------------
  const px = DRIVEWAY.minX - 1.6;
  const pz = LOT.maxZ - 1.2;
  parts.add(box(0.35, 7, 0.35, toon('#6b7079'), px, G, pz));
  parts.add(box(2.9, 2.2, 0.5, toon(BLUE), px, G + 6.2, pz));
  colliders.push({ minX: px - 0.25, maxX: px + 0.25, minZ: pz - 0.25, maxZ: pz + 0.25, bottom: G, top: G + 8.4 });
  for (const side of [1, -1]) {
    const face = signPlane(2.7, 2, 512, (g, W, H) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      g.fillStyle = ORANGE;
      g.fillRect(0, H * 0.68, W, H * 0.32);
      g.fillStyle = BLUE;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${H * 0.25}px Nunito, sans-serif`;
      g.fillText('HAMMER', W / 2, H * 0.2);
      g.fillText('& CO', W / 2, H * 0.46);
      g.fillStyle = '#ffffff';
      g.font = `900 ${H * 0.15}px Nunito, sans-serif`;
      g.fillText('BAUMARKT', W / 2, H * 0.84);
    });
    face.position.set(px, G + 7.3, pz + side * 0.26);
    if (side < 0) face.rotation.y = Math.PI;
    lit.push(face.material);
    group.add(face);
  }

  // ---- The trolley corral: a blue roof on posts, rails either side ------------------------------
  const cx = CORRAL.x;
  const cz = CORRAL.z;
  const steel = toon('#9aa3ad');
  for (const sx of [-2, 2]) for (const sz of [-0.8, 0.8]) parts.add(box(0.08, 2.2, 0.08, steel, cx + sx, G, cz + sz));
  parts.add(slab(cx - 2.2, cx + 2.2, cz - 1, cz + 1, G + 2.2, G + 2.32, toon(BLUE)));
  for (const sz of [-0.75, 0.75]) {
    parts.add(slab(cx - 2, cx + 2, cz + sz - 0.03, cz + sz + 0.03, G + 0.85, G + 0.9, steel));
    colliders.push({ minX: cx - 2, maxX: cx + 2, minZ: cz + sz - 0.05, maxZ: cz + sz + 0.05, bottom: G, top: G + 0.9, fence: true });
  }
  const corralSign = signPlane(1.6, 0.4, 260, (g, W, H) => writeSign(g, W, H, '🛒 Einkaufswagen', { bg: ORANGE, fg: '#ffffff' }));
  corralSign.position.set(cx, G + 2.55, cz + 1.01);
  group.add(corralSign);

  // ---- The garden centre ----------------------------------------------------------------------
  const gd = GARDEN;
  flatOn(gd, 0.02, toon('#b9a88a'));
  const green = toon('#2d6a4f');
  const mesh_ = new THREE.MeshToonMaterial({ color: '#40916c', transparent: true, opacity: 0.35, depthWrite: false });
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = z0 === z1;
    const len = alongX ? x1 - x0 : z1 - z0;
    parts.add(mesh(new THREE.BoxGeometry(alongX ? len : 0.04, 1.8, alongX ? 0.04 : len), mesh_, (x0 + x1) / 2, G + 0.9, (z0 + z1) / 2, false));
    parts.add(slab(alongX ? x0 : x0 - 0.03, alongX ? x1 : x0 + 0.03, alongX ? z0 - 0.03 : z0, alongX ? z0 + 0.03 : z1, G + 1.78, G + 1.84, green));
    for (let a = 0; a <= len + 0.01; a += 2) parts.add(box(0.07, 1.85, 0.07, green, alongX ? x0 + a : x0, G, alongX ? z0 : z0 + a));
    colliders.push({ minX: Math.min(x0, x1) - 0.06, maxX: Math.max(x0, x1) + 0.06, minZ: Math.min(z0, z1) - 0.06, maxZ: Math.max(z0, z1) + 0.06, bottom: G, top: G + 1.85, fence: true });
  };
  fence(gd.minX, gd.minZ, gd.maxX, gd.minZ);
  fence(gd.minX, gd.maxZ, gd.maxX, gd.maxZ);
  fence(gd.maxX, gd.minZ, gd.maxX, gd.maxZ);
  fence(gd.minX, gd.minZ, gd.minX, GARDEN_GATE.z0);
  fence(gd.minX, GARDEN_GATE.z1, gd.minX, gd.maxZ);
  const gateSign = signPlane(4, 0.75, 480, (g, W, H) => writeSign(g, W, H, '🌻 GARTENCENTER', { bg: '#2d6a4f', fg: '#ffffff' }));
  gateSign.position.set(gd.minX - 0.05, G + 2.6, (GARDEN_GATE.z0 + GARDEN_GATE.z1) / 2);
  gateSign.rotation.y = -Math.PI / 2;
  group.add(gateSign);
  for (const z of [GARDEN_GATE.z0, GARDEN_GATE.z1]) parts.add(box(0.12, 2.3, 0.12, green, gd.minX, G, z));
  // The glasshouse roof: a ridge of glass on posts over the north half.
  const gh = GLASSHOUSE;
  const glass = new THREE.MeshToonMaterial({ color: '#d8f3dc', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  const ridgeH = 4.2;
  const eave = 3;
  const halfD = (gh.maxZ - gh.minZ) / 2;
  const slope = Math.atan2(ridgeH - eave, halfD);
  for (const s of [-1, 1]) {
    const pane = mesh(new THREE.BoxGeometry(gh.maxX - gh.minX, 0.04, Math.hypot(halfD, ridgeH - eave)), glass, (gh.minX + gh.maxX) / 2, G + (eave + ridgeH) / 2, (gh.minZ + gh.maxZ) / 2 + (s * halfD) / 2, false);
    pane.rotation.x = s * slope;
    parts.add(pane);
  }
  for (let x = gh.minX + 0.2; x <= gh.maxX; x += 2.6) for (const z of [gh.minZ + 0.2, gh.maxZ]) parts.add(box(0.08, eave, 0.08, steel, x, G, z));
  parts.add(slab(gh.minX, gh.maxX, (gh.minZ + gh.maxZ) / 2 - 0.05, (gh.minZ + gh.maxZ) / 2 + 0.05, G + ridgeH - 0.05, G + ridgeH + 0.05, steel));
  // Tables of potted plants under the glass, trees in pots along the east fence, sacks of soil on pallets by the gate.
  const table = toon('#8d6e63');
  const pot = toon('#c2603f');
  const leaves = ['#52b788', '#40916c', '#74c69d', '#2d6a4f'];
  const flowers = ['#ff4d6d', '#ffd166', '#c77dff', '#ffffff', '#ff9f1c', '#4cc9f0'];
  const leafGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const potGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.16, 8);
  for (let row = 0; row < 3; row++) {
    const tz = gh.minZ + 1.3 + row * 2.2;
    const tx0 = gd.minX + 1.5;
    const tx1 = gd.maxX - 3;
    parts.add(slab(tx0, tx1, tz - 0.45, tz + 0.45, G + 0.75, G + 0.8, table));
    for (const x of [tx0 + 0.1, tx1 - 0.1]) for (const z of [tz - 0.4, tz + 0.4]) parts.add(box(0.06, 0.75, 0.06, table, x, G, z));
    colliders.push({ minX: tx0, maxX: tx1, minZ: tz - 0.45, maxZ: tz + 0.45, bottom: G, top: G + 0.85 });
    for (let x = tx0 + 0.2; x < tx1 - 0.1; x += 0.28)
      for (const dz of [-0.22, 0.12]) {
        parts.add(mesh(potGeo, pot, x, G + 0.88, tz + dz, false));
        const leaf = mesh(leafGeo, toon(leaves[Math.floor(r() * leaves.length)]), x, G + 1.05, tz + dz, false);
        leaf.scale.setScalar(0.8 + r() * 0.5);
        parts.add(leaf);
        if (r() < 0.6) parts.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), toon(flowers[Math.floor(r() * flowers.length)]), x + 0.04, G + 1.15, tz + dz, false));
      }
  }
  for (let z = gd.minZ + 1.2; z < gd.maxZ - 1; z += 2.2) {
    const x = gd.maxX - 1.1;
    const k = 0.8 + r() * 0.4;
    parts.add(mesh(new THREE.CylinderGeometry(0.4, 0.32, 0.6, 10), toon('#6c584c'), x, G + 0.3, z));
    parts.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6 * k, 6), toon('#7a5236'), x, G + 0.6 + 0.8 * k, z));
    parts.add(mesh(new THREE.IcosahedronGeometry(0.75 * k, 1), toon(leaves[Math.floor(r() * leaves.length)]), x, G + 1.6 + 1.5 * k, z));
    colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42, bottom: G, top: G + 1 });
  }
  for (const [x, z] of [
    [gd.minX + 1.6, gd.maxZ - 1.8],
    [gd.minX + 3.2, gd.maxZ - 1.8],
    [gd.minX + 4.8, gd.maxZ - 1.8],
  ]) {
    const p = palletModel('soil');
    p.position.set(x, G, z);
    p.rotation.y = Math.PI / 2;
    parts.add(p);
    colliders.push({ minX: x - 0.65, maxX: x + 0.65, minZ: z - 0.45, maxZ: z + 0.45, bottom: G, top: G + 0.95 });
  }

  // ---- The delivery bay's lorry: a cab to the west, a curtain-sider open on its south side ---------
  const L = LORRY;
  const lz = (L.minZ + L.maxZ) / 2;
  const cabX = L.minX + 1.1;
  parts.add(box(2.2, 2.4, 2.4, toon('#f8f9fa'), cabX, G + 0.55, lz));
  parts.add(box(0.05, 0.9, 2.0, toon('#bfe3f2'), L.minX - 0.01, G + 1.8, lz));
  parts.add(box(2.24, 0.25, 2.44, toon(BLUE), cabX, G + 2.95, lz));
  parts.add(slab(L.minX + 2.3, L.maxX, L.minZ, L.maxZ, G + 1.0, G + 1.25, ink));
  // The box: its roof, the front and back, and the curtain pulled back to the north side.
  parts.add(slab(L.minX + 2.3, L.maxX, L.minZ, L.maxZ, G + 3.75, G + 3.9, toon(ORANGE)));
  parts.add(slab(L.minX + 2.3, L.minX + 2.45, L.minZ, L.maxZ, G + 1.25, G + 3.75, toon(ORANGE)));
  parts.add(slab(L.maxX - 0.15, L.maxX, L.minZ, L.maxZ, G + 1.25, G + 3.75, toon('#9aa3ad')));
  parts.add(slab(L.minX + 2.45, L.maxX - 0.15, L.minZ, L.minZ + 0.1, G + 1.25, G + 3.75, toon(ORANGE)));
  for (const x of [L.minX + 3.2, L.minX + 5.2, L.minX + 6.8]) parts.add(box(0.12, 2.5, 0.12, steel, x, G + 1.25, L.maxZ - 0.06));
  const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14).rotateX(Math.PI / 2);
  for (const x of [cabX, L.maxX - 2.4, L.maxX - 1.2]) for (const z of [L.minZ + 0.1, L.maxZ - 0.1]) parts.add(mesh(tyre, ink, x, G + 0.5, z));
  for (const x of [L.minX + 3.5, L.minX + 5.3]) {
    const p = palletModel(x < L.minX + 4 ? 'boxes' : 'bricks');
    p.position.set(x, G + 1.25, lz + 0.2);
    p.rotation.y = Math.PI / 2;
    parts.add(p);
  }
  const lorrySign = signPlane(5.2, 1.3, 640, (g, W, H) => writeSign(g, W, H, 'HAMMER & CO', { bg: ORANGE, fg: '#ffffff' }));
  lorrySign.position.set((L.minX + 2.45 + L.maxX) / 2, G + 3, L.minZ - 0.01);
  lorrySign.rotation.y = Math.PI;
  group.add(lorrySign);
  colliders.push({ ...L, bottom: G, top: G + 3.9 });

  // A lamp post or two over the car park, lit at night.
  const lampMat = bulb(night, '#fff1c1', 0);
  for (const [x, z] of [
    [LOT.minX + 0.4, LOT.minZ + 12],
    [LOT.maxX - 0.4, LOT.minZ + 12],
    [BAY.minX + 0.6, HALL.maxZ - 6],
  ]) {
    parts.add(box(0.14, 6, 0.14, toon('#6b7079'), x, G, z));
    parts.add(box(0.7, 0.12, 0.35, lampMat, x, G + 6, z, false));
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12, bottom: G, top: G + 6 });
  }
  // The block's own edge where nothing else is: a strip of lawn behind the hall and down its east side.
  const lawn = toon('#8fcf7a');
  parts.add(slab(BLOCK.minX, BLOCK.maxX, BLOCK.minZ, HALL.minZ - 0.2, G - 0.005, G + 0.004, lawn, false));
  parts.add(slab(HALL.maxX + 0.2, BLOCK.maxX, HALL.minZ, BLOCK.maxZ, G - 0.005, G + 0.004, lawn, false));
  group.add(mergeByMaterial(parts));
  return lit;
}

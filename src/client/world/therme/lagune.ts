import * as THREE from 'three';
import { cutOut } from '../../../shared/gym-basement';
import { poolEdges } from '../../../shared/swim';
import { ZONES } from '../../../shared/therme';
import { BRIDGE, HEDGE, ISLE, ISLE_PALMS, LAGOON, OUTSIDE_Z, RIVER, RIVER_SPEED, SHADES, SUN_LOUNGERS, laguneWater, riverFlow } from '../../../shared/therme-lagune';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { Cloud } from '../gym/particles';
import { planks, turf } from '../gym/textures';
import { mosaic, ripples } from '../gym/basement/textures';
import { blk, edgeWallsGeometry, mergeTextured, rand, rectsGeometry, tex, tiles, wrap, type ThermeParts } from './kit';
import { basin } from './paradies';
import { buildPalms } from './palms';

/*
 * The outdoor lagoon (flrnoh fork, see shared/therme-lagune.ts, phase 6): sand along the house and
 * round the lagoon, grass on the island, the lagoon's basin, the lazy river's channel whose water
 * runs the way its current goes (each arm its own surface), the footbridge onto the island,
 * loungers under sunshades, palms, a hedge round it all with trees beyond, lanterns for the night,
 * and steam off the warm water on cold days.
 */

export interface Lagune {
  /** Steam off the water: how much (0 none, on warm days; 1 a freezing night). */
  update(t: number, dt: number, steam: number, me: THREE.Vector3): void;
}

export function buildLagune(p: ThermeParts): Lagune {
  const L = ZONES.lagune;
  const r = rand(131);
  const out = { minX: L.minX, maxX: L.maxX, minZ: OUTSIDE_Z, maxZ: L.maxZ };
  // Sand everywhere outside but the water, grass on the island.
  const sand = wrap(tiles('#ecd9ad', '#e2cc9a', 8, 0.08, 133));
  p.group.add(mesh(rectsGeometry(cutOut(out, laguneWater()), 0.004, 3), tex(sand), 0, 0, 0, false));
  p.group.add(mesh(rectsGeometry([{ minX: ISLE.minX + 1, maxX: ISLE.maxX - 1, minZ: ISLE.minZ + 1, maxZ: ISLE.maxZ - 1 }], 0.01, 2), tex(wrap(turf())), 0, 0, 0, false));
  // The lagoon: one basin, its water lazy.
  const warm = ripples('#3fb0c4', '#dbfbff', 137);
  const lagoon = basin(p, LAGOON, warm, '#4cb4c8');
  // The river: its basin, and a surface for each arm, its ripples running with the current.
  const tl = wrap(mosaic('#3a9fb8', 16, 0.12, 139));
  p.group.add(mesh(rectsGeometry(RIVER.rects, RIVER.floor + 0.002, 2), tex(tl), 0, 0, 0, false));
  const edges = poolEdges(RIVER);
  p.group.add(mesh(edgeWallsGeometry(edges, RIVER.floor, 0, 2), tex(tl), 0, 0, 0, false));
  for (const e of edges) {
    const len = e.to - e.from;
    const mid = (e.from + e.to) / 2;
    const off = e.at + e.out * 0.2;
    if (e.axis === 'x') blk(p, len + 0.4, 0.04, 0.4, '#f3ede0', mid, 0.02, off);
    else blk(p, 0.4, 0.04, len + 0.4, '#f3ede0', off, 0.02, mid);
  }
  const arms: { tex: THREE.CanvasTexture; dir: { x: number; z: number } }[] = [];
  for (const rect of RIVER.rects) {
    const t = ripples('#3aa9c2', '#e2fdff', 141 + arms.length);
    const s = mesh(rectsGeometry([rect], RIVER.surface, 3), tex(t, '#ffffff', { transparent: true, opacity: 0.8, depthWrite: false }), 0, 0, 0, false);
    s.userData.noOutline = true;
    s.renderOrder = 1;
    p.group.add(s);
    arms.push({ tex: t, dir: riverFlow((rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2) });
  }
  // The footbridge: planks between two rails, a step up at each end.
  const wood = wrap(planks('#9a7048', 6, 143));
  const B = BRIDGE;
  const deck = mesh(new THREE.BoxGeometry(B.maxX - B.minX, B.top - B.bottom, B.maxZ - B.minZ - 1), tex(wood), (B.minX + B.maxX) / 2, (B.top + B.bottom) / 2, (B.minZ + B.maxZ) / 2, false);
  p.group.add(deck);
  for (const z of [B.minZ, B.maxZ]) blk(p, B.maxX - B.minX, B.step, 1, '#9a7048', (B.minX + B.maxX) / 2, B.step / 2, z);
  for (const x of [B.minX, B.maxX]) {
    blk(p, 0.08, 0.08, B.maxZ - B.minZ, '#6b4b2e', x, B.top + 1, (B.minZ + B.maxZ) / 2);
    for (let z = B.minZ + 0.3; z < B.maxZ; z += 1.2) blk(p, 0.08, 1, 0.08, '#6b4b2e', x, B.top + 0.5, z);
  }
  // Loungers under sunshades, palms.
  const cushions = ['#ffffff', '#ffd166', '#90e0ef', '#ff8fa3'];
  const pick = new THREE.MeshBasicMaterial({ visible: false });
  for (const [i, l] of SUN_LOUNGERS.entries()) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.72, 0.22, 1.95), toon('#f4f2ec'), 0, 0.11, 0, false));
    g.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 1.3), toon(cushions[i % cushions.length]), 0, 0.28, 0.28, false));
    const back = mesh(new THREE.BoxGeometry(0.66, 0.1, 0.72), toon(cushions[i % cushions.length]), 0, 0.5, -0.62, false);
    back.rotation.x = -0.75;
    g.add(back);
    g.position.set(l.x, 0, l.z);
    g.rotation.y = l.rotY;
    p.still.add(g);
    const it: Interactable = { kind: 'thermeseat', seatId: l.id, x: l.x, z: l.z, y: 0, radius: 1.4 };
    p.interactables.push(it);
    const box = mesh(new THREE.BoxGeometry(0.8, 0.7, 2), pick, l.x, 0.35, l.z, false);
    box.rotation.y = l.rotY;
    box.userData.interact = it;
    p.group.add(box);
  }
  for (const s of SHADES) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon('#e9e3d8'), s.x, 1.3, s.z, false));
    p.still.add(mesh(new THREE.ConeGeometry(1.9, 0.7, 10, 1, true), toon(s.color), s.x, 2.75, s.z, false));
  }
  const grove = buildPalms(ISLE_PALMS, 149);
  p.group.add(grove.group);
  // The hedge round it, and trees beyond, against the sky.
  const hedge = toon('#3f7d3a');
  p.still.add(mesh(new THREE.BoxGeometry(HEDGE.maxX - HEDGE.minX, HEDGE.height, 0.9), hedge, (HEDGE.minX + HEDGE.maxX) / 2, HEDGE.height / 2, L.maxZ + 0.3));
  for (const x of [HEDGE.minX + 0.3, HEDGE.maxX - 0.3]) p.still.add(mesh(new THREE.BoxGeometry(0.9, HEDGE.height, HEDGE.maxZ - OUTSIDE_Z), hedge, x, HEDGE.height / 2, (OUTSIDE_Z + HEDGE.maxZ) / 2));
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), toon('#5a3e24'), 70);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 7, 8), toon('#2f6b3a'), 70);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (let i = 0; i < 70; i++) {
    const side = i % 3;
    const x = side === 0 ? L.minX - 4 - r() * 14 : side === 1 ? L.maxX + 4 + r() * 12 : L.minX + r() * (L.maxX - L.minX);
    const z = side === 2 ? L.maxZ + 4 + r() * 14 : OUTSIDE_Z + 2 + r() * (L.maxZ - OUTSIDE_Z + 10);
    const k = 0.7 + r() * 0.7;
    trunks.setMatrixAt(i, m.compose(v.set(x, 1.5 * k, z), q, sc.set(k, k, k)));
    crowns.setMatrixAt(i, m.compose(v.set(x, 3 * k + 3.5 * k, z), q, sc.set(k, k, k)));
  }
  for (const im of [trunks, crowns]) {
    im.instanceMatrix.needsUpdate = true;
    p.group.add(im);
  }
  // Lanterns along the beach and round the lagoon.
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
  lamp.toneMapped = false;
  const lamps = new THREE.Group();
  for (let x = L.minX + 6; x < L.maxX; x += 12) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), toon('#2a2f35'), x, 1.5, 147.6, false));
    lamps.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), lamp, x, 3.1, 147.6, false));
  }
  p.group.add(mergeTextured(lamps));
  const steam = new Cloud(200, '#ffffff');
  steam.lift = 0.25;
  steam.drag = 0.4;
  p.group.add(steam.points);
  return {
    update: (t, dt, cold, me) => {
      lagoon.offset.x = (t * 0.01) % 1;
      lagoon.offset.y = (t * 0.008) % 1;
      // The river's ripples run with its current (a texture's offset goes against the way it looks to move).
      for (const a of arms) {
        a.tex.offset.x = (-(t * a.dir.x) / (3 * RIVER_SPEED) * 0.9) % 1;
        a.tex.offset.y = ((t * a.dir.z) / (3 * RIVER_SPEED) * 0.9) % 1;
      }
      grove.update(t);
      if (cold > 0 && me.z > OUTSIDE_Z - 20) {
        for (const rect of [...LAGOON.rects, ...RIVER.rects]) {
          const w = rect.maxX - rect.minX;
          const d = rect.maxZ - rect.minZ;
          if (r() < dt * cold * w * d * 0.012) steam.emit(1, { at: v.set((rect.minX + rect.maxX) / 2, LAGOON.surface + 0.1, (rect.minZ + rect.maxZ) / 2), spread: { x: w / 2, y: 0.05, z: d / 2 }, vel: { x: 0.1, y: 0.3, z: 0 }, jitter: 0.12, life: 4, size0: 0.4, size1: 1.8, alpha: 0.09 * cold });
        }
      }
      steam.update(dt);
    },
  };
}

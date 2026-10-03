import * as THREE from 'three';
import { cutOut } from '../../../shared/gym-basement';
import { DORF_FENCE, NORTH_BAND_Z, ROOFS, THERME_BOX, TWALL, ZONES, thermeWalls } from '../../../shared/therme';
import { BUCKETS, DORF_PATHS, DORF_TREES, FIRE_PIT, GARDEN_TUB, SAUNAS, TUB_POOL, dorfWater, fireLogs, LOG_TOP } from '../../../shared/therme-dorf';
import { HEDGE, OUTSIDE_Z } from '../../../shared/therme-lagune';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { Cloud } from '../gym/particles';
import { planks } from '../gym/textures';
import { blk, glow, rand, rectsGeometry, sign, tex, wrap, type ThermeParts } from './kit';
import { cladding, fenceBoards, gravel, lawn } from './textures';
import { poolEdges } from '../../../shared/swim';

/*
 * The sauna garden (flrnoh fork, see shared/therme-dorf.ts): the Saunadorf under the open sky. A
 * lawn with gravel paths between the huts, a larch fence round it, the north band's face to it clad
 * in wood (the dome's is glass: facade.ts), pines and birches, the hot tub in its cedar
 * surround, the fire pit with logs round it, the gush buckets on their frame, and a meadow and a
 * forest beyond the fence (and the lagoon's hedge) against the sky.
 */

export interface Garden {
  /** The buckets (tipped by E, swinging back). */
  tip(i: number): void;
  update(t: number, dt: number, cold: number, me: THREE.Vector3): void;
}

const D = ZONES.dorf;

/** A pine: a trunk and stacked cones. A birch: a pale trunk with dark marks and a round crown. */
function trees(p: ThermeParts, list: readonly { x: number; z: number; h: number; kind: 'pine' | 'birch' }[], seed: number) {
  const r = rand(seed);
  for (const t of list) {
    if (t.kind === 'pine') {
      p.still.add(mesh(new THREE.CylinderGeometry(0.16, 0.28, t.h * 0.45, 7), toon('#5a3e24'), t.x, t.h * 0.225, t.z, false));
      const tiers = 4;
      for (let k = 0; k < tiers; k++) {
        const w = (1 - k / (tiers + 0.6)) * t.h * 0.24;
        const c = mesh(new THREE.ConeGeometry(w, t.h * 0.34, 9), toon(k % 2 ? '#2f6b3a' : '#2a5f34'), t.x, t.h * (0.32 + k * 0.17), t.z, false);
        c.rotation.y = r() * 3;
        p.still.add(c);
      }
    } else {
      p.still.add(mesh(new THREE.CylinderGeometry(0.11, 0.17, t.h * 0.75, 7), toon('#efece4'), t.x, t.h * 0.375, t.z, false));
      for (let k = 0; k < 6; k++) p.still.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), toon('#2b2b2b'), t.x + (r() - 0.5) * 0.12, 0.6 + r() * t.h * 0.6, t.z + 0.12, false));
      for (let k = 0; k < 4; k++) {
        const s = t.h * (0.16 + r() * 0.08);
        p.still.add(mesh(new THREE.IcosahedronGeometry(s, 0), toon(k % 2 ? '#8fb54a' : '#7aa640'), t.x + (r() - 0.5) * s, t.h * (0.7 + r() * 0.2), t.z + (r() - 0.5) * s, false));
      }
    }
  }
}

export function buildGarden(p: ThermeParts): Garden {
  const r = rand(211);
  // The lawn everywhere but the water, gravel on the paths, a wooden porch before each hut's door.
  p.group.add(mesh(rectsGeometry(cutOut(D, dorfWater()), 0.004, 3), tex(lawn(213)), 0, 0, 0, false));
  p.group.add(mesh(rectsGeometry(DORF_PATHS, 0.012, 2.2), tex(gravel(215)), 0, 0, 0, false));
  const porch = wrap(planks('#a07850', 8, 217));
  const porches = SAUNAS.map((s) => {
    const b = s.box;
    const d = s.door;
    const w = 3;
    const deep = 1.8;
    return d.side === 'n' ? { minX: d.at - w / 2, maxX: d.at + w / 2, minZ: b.minZ - deep, maxZ: b.minZ } : d.side === 's' ? { minX: d.at - w / 2, maxX: d.at + w / 2, minZ: b.maxZ, maxZ: b.maxZ + deep } : d.side === 'e' ? { minX: b.maxX, maxX: b.maxX + deep, minZ: d.at - w / 2, maxZ: d.at + w / 2 } : { minX: b.minX - deep, maxX: b.minX, minZ: d.at - w / 2, maxZ: d.at + w / 2 };
  });
  p.group.add(mesh(rectsGeometry(porches, 0.02, 2.4), tex(porch), 0, 0, 0, false));
  // The fence: larch boards on the plan's fence lines, posts every 2.5 m with a lantern on each fourth, a cap along the top.
  const boards = tex(fenceBoards(219));
  for (const f of thermeWalls().filter((w) => (w.id.startsWith('w-dorf') || w.id.startsWith('s-dorf')) && w.top <= DORF_FENCE + 1e-6)) {
    const along = f.maxX - f.minX > f.maxZ - f.minZ;
    const len = along ? f.maxX - f.minX : f.maxZ - f.minZ;
    for (const side of [1, -1]) {
      const m = mesh(new THREE.PlaneGeometry(len, DORF_FENCE), boards, along ? (f.minX + f.maxX) / 2 : side > 0 ? f.maxX + 0.01 : f.minX - 0.01, DORF_FENCE / 2, along ? (side > 0 ? f.maxZ + 0.01 : f.minZ - 0.01) : (f.minZ + f.maxZ) / 2, false);
      m.rotation.y = along ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
      const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 2.4), uv.getY(i) * (DORF_FENCE / 2.4));
      p.group.add(m);
    }
    blk(p, along ? len + 0.1 : 0.55, 0.1, along ? 0.55 : len + 0.1, '#6b4b2e', (f.minX + f.maxX) / 2, DORF_FENCE + 0.05, (f.minZ + f.maxZ) / 2);
    for (let s = 0, k = 0; s <= len; s += 2.5, k++) {
      const x = along ? f.minX + s : (f.minX + f.maxX) / 2;
      const z = along ? (f.minZ + f.maxZ) / 2 : f.minZ + s;
      blk(p, 0.18, DORF_FENCE + 0.25, 0.18, '#5a3e24', x, (DORF_FENCE + 0.25) / 2, z);
    }
  }
  // The north band's face to the garden in wooden cladding (the dome's side is glass: facade.ts).
  const clad = tex(cladding(221));
  const W = TWALL / 2 + 0.01;
  const face = (x: number, z: number, w: number, h: number, rotY: number) => {
    const m = mesh(new THREE.PlaneGeometry(w, h), clad, x, h / 2, z, false);
    m.rotation.y = rotY;
    const uv = m.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 3), uv.getY(i) * (h / 3));
    p.group.add(m);
  };
  face((D.minX + D.maxX) / 2, NORTH_BAND_Z + W, D.maxX - D.minX, ROOFS.band, 0);
  // Over the door from the dome: the garden's name.
  const sg = mesh(new THREE.PlaneGeometry(4.4, 0.95), glow(sign('🧖 SAUNAGARTEN', 'Ruhe bitte · Handtuch unterlegen', '#3b2412', '#ffcf8a', 1024, 224)), D.maxX - W - 0.02, 4, 74, false);
  sg.rotation.y = -Math.PI / 2;
  p.group.add(sg);
  // The trees in the garden, and the forest beyond the fence and the lagoon's hedge.
  trees(p, DORF_TREES, 223);
  const beyond: { x: number; z: number; h: number; kind: 'pine' | 'birch' }[] = [];
  for (let i = 0; i < 46; i++) {
    const west = i % 2 === 0;
    beyond.push({ x: west ? -5 - r() * 22 : 2 + r() * 26, z: west ? NORTH_BAND_Z + r() * (HEDGE.maxZ + 10 - NORTH_BAND_Z) : THERME_BOX.maxZ + 4 + r() * 40, h: 9 + r() * 7, kind: r() > 0.25 ? 'pine' : 'birch' });
  }
  trees(p, beyond, 225);
  // A meadow round it all, outside the house and the lagoon's hedge.
  const house = { minX: THERME_BOX.minX - TWALL, maxX: THERME_BOX.maxX + TWALL, minZ: THERME_BOX.minZ - TWALL, maxZ: THERME_BOX.maxZ + TWALL };
  const lagoon = { minX: HEDGE.minX, maxX: HEDGE.maxX, minZ: OUTSIDE_Z - 0.5, maxZ: HEDGE.maxZ };
  p.group.add(mesh(rectsGeometry(cutOut({ minX: -110, maxX: 310, minZ: -40, maxZ: 290 }, [house, lagoon]), -0.02, 3), tex(lawn(227)), 0, 0, 0, false));
  // The hot tub (its basin and water: dorf.ts, like the pond's): a cedar deck round it, the water bubbling.
  const T = GARDEN_TUB;
  const cedar = wrap(planks('#8a5a3a', 6, 229));
  const edges = poolEdges(TUB_POOL);
  for (const e of edges) {
    const len = e.to - e.from;
    const mid = (e.from + e.to) / 2;
    const at = e.at + e.out * 0.7;
    p.group.add(mesh(new THREE.BoxGeometry(e.axis === 'x' ? len + 2.8 : 1.4, 0.05, e.axis === 'x' ? 1.4 : len + 2.8), tex(cedar), e.axis === 'x' ? mid : at, 0.025, e.axis === 'x' ? at : mid, false));
  }
  const bubbles = new Cloud(160, '#f2ffff');
  bubbles.lift = 0.7;
  bubbles.drag = 0.5;
  p.group.add(bubbles.points);
  const steam = new Cloud(120, '#ffffff');
  steam.lift = 0.25;
  steam.drag = 0.4;
  p.group.add(steam.points);
  // The fire pit: a ring of stones, logs crossed in it, the fire, logs round it to sit on.
  const F = FIRE_PIT;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = mesh(new THREE.DodecahedronGeometry(0.22, 0), toon(i % 2 ? '#8d877f' : '#7a746d'), F.x + Math.cos(a) * F.r, 0.18, F.z + Math.sin(a) * F.r, false);
    s.rotation.set(i, i * 2, 0);
    p.still.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), toon('#5a3e24'), F.x, 0.28, F.z, false);
    l.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI, 0);
    p.still.add(l);
  }
  for (const l of fireLogs()) {
    const m = mesh(new THREE.CylinderGeometry(LOG_TOP / 2, LOG_TOP / 2, 1.6, 10), toon('#7a5434'), l.x, LOG_TOP / 2, l.z, false);
    m.rotation.set(0, l.rotY, Math.PI / 2);
    p.still.add(m);
  }
  const flame = new THREE.MeshBasicMaterial({ color: '#ff8a3a' });
  flame.toneMapped = false;
  const flames = [0, 1, 2].map((k) => {
    const m = mesh(new THREE.ConeGeometry(0.28 - k * 0.06, 0.9 - k * 0.15, 7), flame, F.x + (k - 1) * 0.15, 0.7, F.z + (k % 2) * 0.12, false);
    m.userData.noOutline = true;
    p.group.add(m);
    return m;
  });
  const sparks = new Cloud(80, '#ffb347');
  sparks.lift = 1.2;
  sparks.drag = 0.6;
  p.group.add(sparks.points);
  // The gush buckets: a frame of two posts and a beam against the house, a bucket on a pivot under each.
  const pick = new THREE.MeshBasicMaterial({ visible: false });
  const buckets = BUCKETS.map((b, i) => {
    blk(p, 0.2, 3, 0.2, '#5a3e24', D.maxX - 0.7, 1.5, b.z);
    blk(p, 1.8, 0.16, 0.16, '#5a3e24', D.maxX - 1.5, 2.95, b.z);
    const pivot = new THREE.Group();
    pivot.position.set(b.x, 2.7, b.z);
    pivot.add(mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 12, 1, true), new THREE.MeshToonMaterial({ color: '#9a6a3a', side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap }), 0, -0.3, 0, false));
    for (const y of [-0.12, -0.45]) pivot.add(mesh(new THREE.TorusGeometry(0.3 + y * 0.12, 0.02, 4, 16), toon('#4a4a4a'), 0, y - 0.03, 0, false).rotateX(Math.PI / 2));
    p.group.add(pivot);
    p.still.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 4), toon('#d8d2c4'), D.maxX - 0.75, 1.9, b.z + 0.3, false));
    const it: Interactable = { kind: 'thermeuse', thermeUse: 'bucket', thermeIndex: i, x: b.x, z: b.z, y: 0, radius: 1.4 };
    p.interactables.push(it);
    const box = mesh(new THREE.BoxGeometry(1, 2.4, 1), pick, b.x, 1.2, b.z, false);
    box.userData.interact = it;
    box.userData.noOutline = true;
    p.group.add(box);
    return { pivot, tilt: 0 };
  });
  const v = new THREE.Vector3();
  return {
    tip: (i) => {
      if (buckets[i]) buckets[i].tilt = 1;
    },
    update: (t, dt, cold, me) => {
      const near = me.x < D.maxX + 30 && me.z < OUTSIDE_Z + 10;
      for (const [k, m] of flames.entries()) {
        m.scale.set(1 + Math.sin(t * 9 + k) * 0.1, 1 + Math.sin(t * 6.3 + k * 2) * 0.22, 1);
        flame.color.setHSL(0.06 + Math.sin(t * 5) * 0.015, 1, 0.55);
      }
      for (const b of buckets) {
        b.tilt = Math.max(0, b.tilt - dt * 0.7);
        b.pivot.rotation.x = b.tilt > 0 ? Math.sin((1 - b.tilt) * Math.PI) * 1.9 : 0;
      }
      if (near) {
        bubbles.emit(Math.ceil(dt * 36), { at: v.set((T.minX + T.maxX) / 2, TUB_POOL.surface - 0.05, (T.minZ + T.maxZ) / 2), spread: { x: 2.6, y: 0.02, z: 2.6 }, vel: { x: 0, y: 0.4, z: 0 }, jitter: 0.2, life: 1, size0: 0.08, size1: 0.18, alpha: 0.7 });
        if (r() < dt * (0.6 + cold * 4)) steam.emit(1, { at: v.set((T.minX + T.maxX) / 2, TUB_POOL.surface + 0.1, (T.minZ + T.maxZ) / 2), spread: { x: 2.6, y: 0.05, z: 2.6 }, vel: { x: 0, y: 0.3, z: 0 }, jitter: 0.1, life: 3.5, size0: 0.4, size1: 1.6, alpha: 0.08 + cold * 0.12 });
        if (r() < dt * 6) sparks.emit(1, { at: v.set(F.x, 0.9, F.z), spread: { x: 0.2, y: 0.1, z: 0.2 }, vel: { x: 0, y: 1.4, z: 0 }, jitter: 0.5, life: 1.6, size0: 0.06, size1: 0.02, alpha: 0.9 });
      }
      bubbles.update(dt);
      steam.update(dt);
      sparks.update(dt);
    },
  };
}

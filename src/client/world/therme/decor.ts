import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { poolEdges, type PoolDef, type PoolEdge } from '../../../shared/swim';
import { WELLENBAD } from '../../../shared/therme';
import { THERME_POOLS } from '../../../shared/therme-all';
import { POOL_SIGNS, SHOWERS, SHOWER_HEIGHT, SIGN_HEIGHT, depthOf, signWords } from '../../../shared/therme-pools';
import { DEEP, WAVE_POOL } from '../../../shared/therme-waves';
import { RIVER } from '../../../shared/therme-lagune';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { canvasTexture, FONT } from '../casino/parts';
import { Cloud } from '../gym/particles';
import { glow, mergeTextured, rand, rectsGeometry, type ThermeParts } from './kit';
import { caustics, depthMark, grate } from './textures';

/*
 * What every pool in the thermal baths has (flrnoh fork, see shared/therme-pools.ts): a rounded
 * stone coping with the overflow gutter's grate behind it, lights set into its walls under the
 * water, the light the water throws dancing on its floor, steel ladders, its depth on the coping,
 * and a sign on the deck saying what it is, how warm and how deep. The showers by the ways in (E
 * under one: a rinse) are here too.
 */

declare module '../types' {
  interface Interactable {
    /** Fork: something in the baths you use where it stands, for a 'thermeuse': a shower, a gush bucket, the ice fountain; which one. */
    thermeUse?: 'shower' | 'bucket' | 'ice';
    thermeIndex?: number;
  }
}

export interface PoolDecor {
  /** Water from a shower's head, or a bucket's tip, over (x, z) (a few seconds of it). */
  pour(x: number, z: number, from: number, hard: boolean): void;
  update(t: number, dt: number): void;
}

/** The natural waters: rocks and reeds round them, no stone coping, no grate, no ladder. */
const NATURAL = new Set(['therme-pond', 'therme-lagoon']);

/** The wave pool's beach runs straight out of the deck: no coping, no lights, no ladder there. */
const open = (def: PoolDef, e: PoolEdge) => def.id === WAVE_POOL.id && e.axis === 'x' && Math.abs(e.at - WELLENBAD.minZ) < 1e-6;

/** A point `n` out from edge `e` (into the deck; negative: over the water), `s` along it, at height y. */
const edgePoint = (e: PoolEdge, s: number, n: number, y: number) => (e.axis === 'x' ? new THREE.Vector3(s, y, e.at + e.out * n) : new THREE.Vector3(e.at + e.out * n, y, s));

/** Whether something solid stands at (x, z) on the deck (a ladder's top, a light's spot). */
const blocked = (p: ThermeParts, x: number, z: number, pad = 0.4) => p.colliders.some((c) => c.top > 0.05 && (c.bottom ?? 0) < 1.8 && (c.bottom ?? 0) > -0.05 && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad);

/** A sign's face: the pool's name on a coloured band, how warm and how deep under it, a note. */
function signFace(pool: string): THREE.CanvasTexture {
  const [big, small] = signWords(pool);
  const parts = small.split(' · ');
  return canvasTexture(1024, 512, (g) => {
    g.fillStyle = '#f7f4ec';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = pool.includes('pond') || pool.includes('plunge') || pool === 'kneipp' ? '#2b6f8a' : pool.includes('whirl') || pool.includes('tub') ? '#7a3f8f' : '#0f6e8c';
    g.fillRect(0, 0, 1024, 190);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 104px ${FONT}`;
    g.fillText(big, 512, 100, 980);
    g.fillStyle = '#16324f';
    g.font = `900 120px ${FONT}`;
    g.fillText(`${parts[0]}   ${parts[1]}`, 512, 300, 980);
    g.globalAlpha = 0.75;
    g.font = `700 54px ${FONT}`;
    g.fillText(parts.slice(2).join(' · '), 512, 430, 980);
  });
}

export function buildPoolDecor(p: ThermeParts): PoolDecor {
  const stone: THREE.BufferGeometry[] = [];
  const nose: THREE.BufferGeometry[] = [];
  const grates: { along: THREE.BufferGeometry[]; across: THREE.BufferGeometry[] } = { along: [], across: [] };
  const lights: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  const floors: THREE.BufferGeometry[] = [];
  const marks = new THREE.Group();
  const rocks: THREE.BufferGeometry[][] = [[], []];
  const rnd = rand(307);
  const markMats = new Map<string, THREE.MeshToonMaterial>();
  for (const def of THERME_POOLS) {
    const depth = depthOf(def);
    const edges = poolEdges(def).filter((e) => !open(def, e));
    let ladders = 0;
    const natural = NATURAL.has(def.id);
    for (const e of edges) {
      const len = e.to - e.from;
      const mid = (e.from + e.to) / 2;
      if (natural) {
        // Boulders along the bank, half in the water, every metre or so, big and small.
        for (let s = e.from + 0.4; s < e.to - 0.2; s += 0.7 + rnd() * 0.9) {
          const k = 0.25 + rnd() * 0.45;
          const at = edgePoint(e, s, (rnd() - 0.35) * 0.5, -0.05 + k * 0.25);
          const g = new THREE.DodecahedronGeometry(k, 0);
          g.scale(1.2, 0.6 + rnd() * 0.3, 1);
          g.rotateY(rnd() * 3);
          rocks[rnd() > 0.5 ? 0 : 1].push(g.translate(at.x, at.y, at.z));
        }
        if (def.id === 'therme-pond') continue;
      }
      // The coping: a slab of pale stone, its rounded nose over the water.
      const c = edgePoint(e, mid, 0.21, 0.03);
      stone.push(new THREE.BoxGeometry(e.axis === 'x' ? len + 0.84 : 0.42, 0.06, e.axis === 'x' ? 0.42 : len + 0.84).translate(c.x, c.y, c.z));
      const nz = edgePoint(e, mid, 0.01, 0.01);
      const cyl = new THREE.CylinderGeometry(0.05, 0.05, len, 6, 1);
      if (e.axis === 'x') cyl.rotateZ(Math.PI / 2);
      else cyl.rotateX(Math.PI / 2);
      nose.push(cyl.translate(nz.x, nz.y, nz.z));
      // The gutter's grate behind it (not along the river: its banks are sand).
      if (def.id !== RIVER.id && !natural) {
        const a = Math.min(e.from, e.to) - 0.2;
        const b = Math.max(e.from, e.to) + 0.2;
        const n0 = e.at + e.out * 0.44;
        const n1 = e.at + e.out * 0.68;
        const r = e.axis === 'x' ? { minX: a, maxX: b, minZ: Math.min(n0, n1), maxZ: Math.max(n0, n1) } : { minX: Math.min(n0, n1), maxX: Math.max(n0, n1), minZ: a, maxZ: b };
        (e.axis === 'x' ? grates.along : grates.across).push(rectsGeometry([r], 0.004, 0.7));
      }
      // Lights in the wall under the water, every 5 m (one in the middle of a short wall).
      const below = def.surface - Math.min(0.5, (def.surface - def.floor) * 0.45);
      const n = Math.max(1, Math.floor(len / 5));
      for (let k = 0; k < n; k++) {
        const s = e.from + ((k + 0.5) / n) * len;
        const at = edgePoint(e, s, -0.012, below);
        const disc = new THREE.CircleGeometry(0.17, 12);
        disc.rotateY(e.axis === 'x' ? (e.out > 0 ? Math.PI : 0) : e.out > 0 ? -Math.PI / 2 : Math.PI / 2);
        lights.push(disc.translate(at.x, at.y, at.z));
      }
      // The depth, on the coping, read from the deck.
      if (len >= 5 && def.id !== WAVE_POOL.id && !natural) {
        let mat = markMats.get(depth);
        if (!mat) {
          mat = new THREE.MeshToonMaterial({ map: depthMark(depth), gradientMap: toon('#ffffff').gradientMap });
          markMats.set(depth, mat);
        }
        for (const s of len > 16 ? [e.from + len * 0.25, e.from + len * 0.75] : [mid]) {
          const at = edgePoint(e, s, 0.24, 0.062);
          const m = mesh(new THREE.PlaneGeometry(0.5, 0.19), mat, at.x, at.y, at.z, false);
          m.rotation.order = 'YXZ';
          m.rotation.y = e.axis === 'x' ? (e.out > 0 ? Math.PI : 0) : e.out > 0 ? -Math.PI / 2 : Math.PI / 2;
          m.rotation.x = -Math.PI / 2;
          marks.add(m);
        }
      }
      // A steel ladder in the middle of a long wall (two a pool at most), where nothing stands on the deck.
      if (len >= 7 && ladders < 2 && def.surface - def.floor > 0.9 && !natural) {
        const top = edgePoint(e, mid, 0.6, 0);
        if (!blocked(p, top.x, top.z)) {
          ladders++;
          for (const side of [-0.28, 0.28]) {
            const pts = [
              [0.62, 0],
              [0.6, 0.82],
              [0.32, 1.02],
              [0.0, 0.82],
              [-0.12, 0.25],
              [-0.13, def.surface - 0.95],
            ].map(([n2, y]) => edgePoint(e, mid + side, n2, y));
            steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.028, 6, false));
          }
          for (const y of [def.surface - 0.28, def.surface - 0.58, def.surface - 0.88]) {
            const at = edgePoint(e, mid, -0.14, y);
            steel.push(new THREE.BoxGeometry(e.axis === 'x' ? 0.56 : 0.12, 0.04, e.axis === 'x' ? 0.12 : 0.56).translate(at.x, at.y, at.z));
          }
        }
      }
    }
    // The floor's moving light (the wave pool's deep end only: its beach is sand).
    for (const r of def.id === WAVE_POOL.id ? [DEEP] : def.rects) floors.push(rectsGeometry([r], def.floor + 0.012, 3.2));
  }
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, into: THREE.Group = p.group) => {
    if (!geos.length) return null;
    const m = mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)))!, mat, 0, 0, 0, false);
    for (const g of geos) g.dispose();
    into.add(m);
    return m;
  };
  // The coping in its own materials, without a toon outline (it would run as a black line along every pool's edge).
  for (const [geos, color] of [[stone, '#f4efe4'], [nose, '#e6dfcf']] as const) {
    const m = add(geos, new THREE.MeshToonMaterial({ color, gradientMap: toon('#ffffff').gradientMap }));
    if (m) m.userData.noOutline = true;
  }
  add(steel, toon('#dfe7ea'), p.still);
  add(rocks[0], toon('#8d877f'), p.still);
  add(rocks[1], toon('#a39a8c'), p.still);
  const gr = grate();
  const gr2 = gr.clone();
  gr2.rotation = Math.PI / 2;
  gr2.needsUpdate = true;
  add(grates.along, new THREE.MeshToonMaterial({ map: gr, gradientMap: toon('#ffffff').gradientMap }));
  add(grates.across, new THREE.MeshToonMaterial({ map: gr2, gradientMap: toon('#ffffff').gradientMap }));
  const lamp = new THREE.MeshBasicMaterial({ color: '#d9fbff' });
  lamp.toneMapped = false;
  const lit = add(lights, lamp);
  if (lit) lit.userData.noOutline = true;
  const ct = caustics();
  const cm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  cm.toneMapped = false;
  const shimmer = add(floors, cm);
  if (shimmer) shimmer.userData.noOutline = true;
  p.group.add(mergeTextured(marks));
  // The signs: a post and a board, the same face on both sides.
  const post = toon('#24414d');
  for (const s of POOL_SIGNS) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, SIGN_HEIGHT - 0.3, 8), post, 0, (SIGN_HEIGHT - 0.3) / 2, 0, false));
    g.add(mesh(new THREE.BoxGeometry(1.42, 0.74, 0.06), post, 0, SIGN_HEIGHT - 0.42, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 12), post, 0, 0.03, 0, false));
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    p.still.add(g);
    const face = glow(signFace(s.pool));
    for (const side of [1, -1]) {
      const m = mesh(new THREE.PlaneGeometry(1.34, 0.67), face, 0, SIGN_HEIGHT - 0.42, side * 0.032, false);
      m.rotation.y = side > 0 ? 0 : Math.PI;
      m.userData.noOutline = true;
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(s.x, 0, s.z);
      holder.rotation.y = s.rotY;
      p.group.add(holder);
    }
  }
  // The showers: a steel column, its head on an arm, a drain in the floor; E under one rinses you.
  const drain = toon('#8f9ca3');
  const pick = new THREE.MeshBasicMaterial({ visible: false });
  for (const [i, s] of SHOWERS.entries()) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, SHOWER_HEIGHT, 10), toon('#d9e2e6'), s.x, SHOWER_HEIGHT / 2, s.z, false));
    p.still.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), toon('#d9e2e6'), s.x, SHOWER_HEIGHT - 0.05, s.z + 0.25, false));
    p.still.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 14), toon('#c2cdd2'), s.x, SHOWER_HEIGHT - 0.1, s.z + 0.5, false));
    p.still.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), toon('#3fb6c9'), s.x, 1.2, s.z + 0.08, false));
    p.still.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.012, 18), drain, s.x, 0.006, s.z + 0.5, false));
    const it: Interactable = { kind: 'thermeuse', thermeUse: 'shower', thermeIndex: i, x: s.x, z: s.z + 0.5, y: 0, radius: 1.6 };
    p.interactables.push(it);
    const box = mesh(new THREE.BoxGeometry(0.9, 2.2, 1.1), pick, s.x, 1.1, s.z + 0.35, false);
    box.userData.interact = it;
    box.userData.noOutline = true;
    p.group.add(box);
  }
  const drops = new Cloud(500, '#e8fbff');
  drops.lift = -9;
  drops.drag = 0.2;
  p.group.add(drops.points);
  const pours: { x: number; z: number; from: number; left: number; hard: boolean }[] = [];
  const v = new THREE.Vector3();
  return {
    pour: (x, z, from, hard) => pours.push({ x, z, from, left: hard ? 0.9 : 4, hard }),
    update: (t, dt) => {
      ct.offset.set(Math.sin(t * 0.21) * 0.08 + t * 0.012, Math.cos(t * 0.17) * 0.08 + t * 0.009);
      lamp.color.setHSL(0.52, 0.6, 0.86 + Math.sin(t * 0.7) * 0.03);
      for (let i = pours.length - 1; i >= 0; i--) {
        const q = pours[i];
        q.left -= dt;
        drops.emit(Math.ceil(dt * (q.hard ? 420 : 160)), { at: v.set(q.x, q.from, q.z), spread: { x: q.hard ? 0.3 : 0.12, y: 0.02, z: q.hard ? 0.3 : 0.12 }, vel: { x: 0, y: q.hard ? -2.5 : -1.2, z: 0 }, jitter: q.hard ? 0.9 : 0.35, life: 0.8, size0: q.hard ? 0.09 : 0.05, size1: 0.04, alpha: 0.75 });
        if (q.left <= 0) pours.splice(i, 1);
      }
      drops.update(dt);
    },
  };
}

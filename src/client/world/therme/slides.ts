import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { poolEdges } from '../../../shared/swim';
import {
  LANDING, LANDING_POOL, LEVELS, LIFT_CORE, LIFT_DOOR, SLIDES, SLIDE_BOARD, SLIDE_KIOSK, SLIDE_RADIUS, TOWER, TOWER_ROOF, lanePath, slideFixtures, slideGate, type SlideDef,
} from '../../../shared/therme-slides';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { mosaic, ripples } from '../gym/basement/textures';
import { blk, edgeWallsGeometry, glow, rectsGeometry, sign, tex, wrap, type ThermeParts } from './kit';

/*
 * The Rutschenwelt (flrnoh fork, see shared/therme-slides.ts, phase 4): the slide tower (its legs,
 * three platforms round the lift's shaft, railings open where each slide goes off, a canopy), the
 * seven slides (closed tubes, open troughs, the racer's four lanes, the capsule at the top of the
 * Falltür, the black hole dark inside with rings of coloured light), their stilts, the landing pool,
 * the board with the best times on the east wall and the kiosk under it.
 */

declare module '../types' {
  interface Interactable {
    /** Fork: which of the baths' slides, and which of its lanes (the racer's), for a 'thermeslide'. */
    thermeSlide?: SlideDef['id'];
    thermeLane?: number;
    /** Fork: which platform (0..2; -1 the ground) a 'thermelift' door is on. */
    thermeLevel?: number;
  }
}

export interface SlideWorld {
  /** Each slide's curve per lane, for riding it (client/therme/slides.ts). */
  curves: Map<string, THREE.CatmullRomCurve3>;
  /** The board's face: redrawn with the boards. */
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  /** Black-hole rings: they flash as someone goes by. */
  rings: THREE.MeshBasicMaterial[];
  update(t: number, dt: number): void;
}

export const curveKey = (id: string, lane = 0) => `${id}:${lane}`;

/** A trough round `curve` (the lower part of a tube, `arc` of the way round: 1 is a closed tube), carried along without twisting. */
function troughGeometry(curve: THREE.Curve<THREE.Vector3>, r: number, segments: number, arc: number, radial = 14): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  let side = new THREE.Vector3();
  const t = new THREE.Vector3();
  const down = new THREE.Vector3();
  const p = new THREE.Vector3();
  const a0 = -Math.PI * arc;
  const ring = radial + 1;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    if (i === 0) side.crossVectors(t, up).normalize();
    // Keep the side square to the way down (transported, so loops and corkscrews don't flip it).
    side.addScaledVector(t, -side.dot(t)).normalize();
    if (!Number.isFinite(side.x) || side.lengthSq() < 0.5) side = new THREE.Vector3(1, 0, 0);
    down.crossVectors(side, t).normalize().negate();
    if (down.y > 0 && arc < 1) down.negate();
    for (let k = 0; k <= radial; k++) {
      const a = a0 + (2 * Math.PI * arc * k) / radial;
      // round from one side, under, to the other
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + down.x * r * c + side.x * r * s, p.y + down.y * r * c + side.y * r * s, p.z + down.z * r * c + side.z * r * s);
    }
    if (i < segments)
      for (let k = 0; k < radial; k++) {
        const a = i * ring + k;
        idx.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The tower: legs, the shaft, three platforms with their railings, a canopy on top, the lift's doors. */
function tower(p: ThermeParts) {
  const steel = '#dfe6ea';
  const T = TOWER;
  for (const f of slideFixtures()) {
    if (f.id.startsWith('deck-')) blk(p, f.maxX - f.minX, f.top - (f.bottom ?? 0), f.maxZ - f.minZ, '#f5c518', (f.minX + f.maxX) / 2, (f.top + (f.bottom ?? 0)) / 2, (f.minZ + f.maxZ) / 2);
    else if (f.id.startsWith('rail-')) {
      const y0 = f.bottom ?? 0;
      blk(p, f.maxX - f.minX, 0.06, f.maxZ - f.minZ, steel, (f.minX + f.maxX) / 2, f.top, (f.minZ + f.maxZ) / 2);
      blk(p, f.maxX - f.minX, 0.04, f.maxZ - f.minZ, steel, (f.minX + f.maxX) / 2, y0 + 0.55, (f.minZ + f.maxZ) / 2);
    } else if (f.id.startsWith('leg-')) blk(p, f.maxX - f.minX, f.top, f.maxZ - f.minZ, '#e8505b', (f.minX + f.maxX) / 2, f.top / 2, (f.minZ + f.maxZ) / 2);
  }
  // Cross-bracing between the legs, every level.
  for (const y of [4.5, 13, 21]) {
    for (const z of [T.minZ, T.maxZ]) {
      const b = blk(p, Math.hypot(T.maxX - T.minX, 8), 0.14, 0.14, steel, (T.minX + T.maxX) / 2, y, z);
      b.rotation.z = Math.atan2(8, T.maxX - T.minX);
    }
    for (const x of [T.minX, T.maxX]) {
      const b = blk(p, 0.14, 0.14, Math.hypot(T.maxZ - T.minZ, 8), steel, x, y, (T.minZ + T.maxZ) / 2);
      b.rotation.x = Math.atan2(8, T.maxZ - T.minZ);
    }
  }
  const C = LIFT_CORE;
  blk(p, C.maxX - C.minX, TOWER_ROOF, C.maxZ - C.minZ, '#2b8fd6', (C.minX + C.maxX) / 2, TOWER_ROOF / 2, (C.minZ + C.maxZ) / 2);
  // The canopy: a red pyramid roof with a flag.
  const roof = mesh(new THREE.ConeGeometry(9.5, 3.2, 4), toon('#e8505b'), (T.minX + T.maxX) / 2, TOWER_ROOF + 1.6, (T.minZ + T.maxZ) / 2, false);
  roof.rotation.y = Math.PI / 4;
  p.still.add(roof);
  blk(p, T.maxX - T.minX + 0.4, 0.3, T.maxZ - T.minZ + 0.4, '#e8505b', (T.minX + T.maxX) / 2, TOWER_ROOF, (T.minZ + T.maxZ) / 2);
  // The lift's doors, on the ground and each platform, and a sign by each saying what goes from there.
  for (const level of [-1, 0, 1, 2]) {
    const y = level < 0 ? 0 : LEVELS[level];
    const door = mesh(new THREE.PlaneGeometry(1.4, 2.2), toon('#c9d6df'), LIFT_DOOR.x, y + 1.1, C.maxZ + 0.02, false);
    p.group.add(door);
    // Its frame (round the edge, not across the middle: the crosshair would land on that, not the door).
    for (const sx of [-0.73, 0.73]) blk(p, 0.08, 2.3, 0.06, '#5b6770', LIFT_DOOR.x + sx, y + 1.15, C.maxZ + 0.04);
    const it: Interactable = { kind: 'thermelift', thermeLevel: level, x: LIFT_DOOR.x, z: C.maxZ + 0.4, y, radius: 2.5 };
    p.interactables.push(it);
    door.userData.interact = it;
    const words = level < 0 ? ['🛗 AUFZUG', 'zu den Rutschen'] : [`EBENE ${level + 1} · ${LEVELS[level]} m`, SLIDES.filter((s) => s.level === level).map((s) => `${s.emoji} ${s.name}`).join(' · ')];
    const m = mesh(new THREE.PlaneGeometry(2.8, 0.7), glow(sign(words[0], words[1], '#16324f', '#ffe08a', 1024, 256)), LIFT_DOOR.x, y + 2.75, C.maxZ + 0.03, false);
    p.group.add(m);
  }
}

/** One slide: its tube or trough (each lane), stilts down to the ground, its gate on the platform, its name over the gate. */
function slide(p: ThermeParts, s: SlideDef, curves: SlideWorld['curves'], rings: THREE.MeshBasicMaterial[]) {
  const lanes = s.lanes?.length ?? 1;
  const mat =
    s.dark
      ? new THREE.MeshBasicMaterial({ color: '#1a1830', side: THREE.DoubleSide })
      : new THREE.MeshToonMaterial({ color: s.color, side: THREE.DoubleSide, transparent: s.kind === 'tube', opacity: s.kind === 'tube' ? 0.82 : 1, gradientMap: toon('#ffffff').gradientMap });
  const stilts: THREE.BufferGeometry[] = [];
  for (let l = 0; l < lanes; l++) {
    const pts = lanePath(s, l).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    curves.set(curveKey(s.id, l), curve);
    const len = curve.getLength();
    const segs = Math.ceil(len * 2.2);
    const body = mesh(troughGeometry(curve, s.lanes ? 0.55 : SLIDE_RADIUS, segs, s.kind === 'open' ? 0.5 : 1, s.kind === 'open' ? 12 : 16), mat, 0, 0, 0, false);
    body.userData.noOutline = s.kind === 'tube';
    if (s.kind === 'tube') body.renderOrder = 1;
    p.group.add(body);
    // Stilts every few metres where it runs high, from the ground (or the pool's floor) up to under it.
    for (let d = 6; d < len - 2; d += 7) {
      const at = curve.getPointAt(d / len);
      if (at.y < 2.2) continue;
      if (at.x > TOWER.minX - 0.5 && at.x < TOWER.maxX + 0.5 && at.z > TOWER.minZ - 0.5 && at.z < TOWER.maxZ + 0.5) continue;
      const base = at.x > LANDING.minX && at.x < LANDING.maxX && at.z > LANDING.minZ && at.z < LANDING.maxZ ? LANDING_POOL.floor : 0;
      stilts.push(new THREE.CylinderGeometry(0.11, 0.13, at.y - SLIDE_RADIUS - base, 6).translate(at.x, (at.y - SLIDE_RADIUS + base) / 2, at.z));
    }
    // The black hole: rings of light inside, every few metres, in four colours (one mesh a colour).
    if (s.dark) {
      const byColour: THREE.BufferGeometry[][] = [[], [], [], []];
      const m4 = new THREE.Object3D();
      for (let d = 3, k = 0; d < len - 2; d += 3.5, k++) {
        const at = curve.getPointAt(d / len);
        const tg = curve.getTangentAt(d / len);
        m4.position.copy(at);
        m4.lookAt(at.clone().add(tg));
        m4.updateMatrix();
        byColour[k % 4].push(new THREE.TorusGeometry(SLIDE_RADIUS - 0.04, 0.035, 5, 18).applyMatrix4(m4.matrix));
      }
      ['#ff3dcb', '#3df2ff', '#ffe03d', '#7d3dff'].forEach((c, k) => {
        if (!byColour[k].length) return;
        const ringMat = new THREE.MeshBasicMaterial({ color: c });
        ringMat.toneMapped = false;
        rings.push(ringMat);
        const ring = mesh(mergeGeometries(byColour[k])!, ringMat, 0, 0, 0, false);
        ring.userData.noOutline = true;
        p.group.add(ring);
        for (const g of byColour[k]) g.dispose();
      });
    }
    // Its gate on the platform: E there goes down it.
    const start = pts[0];
    const it: Interactable = { kind: 'thermeslide', thermeSlide: s.id, thermeLane: l, x: start.x, z: start.z, y: LEVELS[s.level], radius: 2.2 };
    p.interactables.push(it);
    const pick = mesh(new THREE.BoxGeometry(1.3, 1.6, 1.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), start.x, LEVELS[s.level] + 0.7, start.z, false);
    pick.userData.interact = it;
    pick.userData.noOutline = true;
    p.group.add(pick);
  }
  if (stilts.length) {
    p.still.add(mesh(mergeGeometries(stilts)!, toon('#dfe6ea'), 0, 0, 0, false));
    for (const g of stilts) g.dispose();
  }
  // The name over its gate.
  const g = slideGate(s);
  const plate = mesh(new THREE.PlaneGeometry(2.6, 0.62), glow(sign(`${s.emoji} ${s.name.toUpperCase()}`, s.blurb, '#16324f', '#ffe08a', 1024, 248)), g.x, g.y + 2.4, g.z, false);
  plate.rotation.y = g.rotY + Math.PI;
  p.group.add(plate);
  // The Falltür's capsule: a see-through tube standing at the top, its floor the trapdoor.
  if (s.kind === 'capsule') {
    const st = lanePath(s, 0)[0];
    const glass = mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.4, 18, 1, true), new THREE.MeshToonMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap }), st[0], st[1] + 1.2, st[2], false);
    glass.userData.noOutline = true;
    p.group.add(glass);
    p.still.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.16, 18), toon('#f4a261'), st[0], st[1] + 2.45, st[2], false));
  }
}

export function buildSlides(p: ThermeParts): SlideWorld {
  tower(p);
  const curves = new Map<string, THREE.CatmullRomCurve3>();
  const rings: THREE.MeshBasicMaterial[] = [];
  for (const s of SLIDES) slide(p, s, curves, rings);
  // The landing pool: its basin, coping and water.
  const def = LANDING_POOL;
  const blue = wrap(mosaic('#2f9ec0', 16, 0.12, 111));
  p.group.add(mesh(rectsGeometry(def.rects, def.floor + 0.002, 2), tex(blue), 0, 0, 0, false));
  const edges = poolEdges(def);
  p.group.add(mesh(edgeWallsGeometry(edges, def.floor, 0, 2), tex(blue), 0, 0, 0, false));
  for (const e of edges) {
    const len = e.to - e.from;
    const mid = (e.from + e.to) / 2;
    const off = e.at + e.out * 0.2;
    if (e.axis === 'x') blk(p, len + 0.4, 0.04, 0.4, '#f3ede0', mid, 0.02, off);
    else blk(p, 0.4, 0.04, len + 0.4, '#f3ede0', off, 0.02, mid);
  }
  const water = ripples('#38b2d6', '#d6fbff', 53);
  const surface = mesh(rectsGeometry(def.rects, def.surface, 3), tex(water, '#ffffff', { transparent: true, opacity: 0.8, depthWrite: false }), 0, 0, 0, false);
  surface.userData.noOutline = true;
  surface.renderOrder = 1;
  p.group.add(surface);
  // The board on the east wall, and the kiosk under it.
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 700;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture });
  face.toneMapped = false;
  const B = SLIDE_BOARD;
  for (const s of [1, -1]) {
    const board = mesh(new THREE.PlaneGeometry(B.w, B.h), face, B.x, B.y, B.z + s * 0.12, false);
    board.rotation.y = s > 0 ? 0 : Math.PI;
    p.group.add(board);
  }
  blk(p, B.w + 0.4, B.h + 0.4, 0.2, '#16324f', B.x, B.y, B.z);
  for (const s of [-1, 1]) blk(p, 0.3, B.y + B.h / 2, 0.3, '#16324f', B.x + (s * B.w) / 2, (B.y + B.h / 2) / 2, B.z);
  const K = SLIDE_KIOSK;
  blk(p, 2, 1.2, 1.2, '#16324f', K.x, 0.6, K.z);
  const screen = mesh(new THREE.PlaneGeometry(1.6, 0.9), glow(sign('🏁 BESTZEITEN', 'E: Tafel & Fahrfoto', '#16324f', '#ffe08a', 768, 432)), K.x, 1.6, K.z - 0.61, false);
  screen.rotation.y = Math.PI;
  p.group.add(screen);
  const it: Interactable = { kind: 'thermeboard', x: K.x, z: K.z, y: 0, radius: 2.4 };
  p.interactables.push(it);
  screen.userData.interact = it;
  const kpick = mesh(new THREE.BoxGeometry(2.2, 2.2, 1.4), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), K.x, 1.1, K.z, false);
  kpick.userData.interact = it;
  p.group.add(kpick);
  return {
    curves,
    board: { canvas, texture },
    rings,
    update: (t) => {
      water.offset.x = (t * 0.04) % 1;
      water.offset.y = (t * 0.025) % 1;
    },
  };
}

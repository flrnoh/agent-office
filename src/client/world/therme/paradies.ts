import * as THREE from 'three';
import { poolEdges, type PoolDef } from '../../../shared/swim';
import {
  BACK_BAR, BAMBOO, BARTENDER, BAR_COUNTER, BAR_FLOOR, BAR_STOOLS, BUBBLE_LEDGES, CLIFF, ISLAND, LOUNGERS, PALMS, PARADIES_POOLS, PLANTER, THERMAL, THERMAL_POOL, WATERFALL, WHIRLPOOLS,
} from '../../../shared/therme-paradies';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { Cloud } from '../gym/particles';
import { fallingWater, mosaic, ripples, rock } from '../gym/basement/textures';
import { Person } from '../character';
import { blk, edgeWallsGeometry, glow, plane, rectsGeometry, sign, tex, wrap, type ThermeParts } from './kit';
import { buildBamboo, buildPalms, type Grove } from './palms';

/*
 * The Thermenparadies under the dome (flrnoh fork, see shared/therme-paradies.ts, phase 2): every
 * pool's water, mosaic basin and stone coping (one mesh each, laid by world position), the palm
 * island, the swim-up bar with its thatched roof and the bartender, loungers you lie on (kind
 * 'thermeseat'), the whirlpools and bubble ledges with their bubbles, the waterfall down the cliff.
 */

export interface Paradies {
  bartender: Person;
  /** The counter: E there (or swimming up to it) orders. */
  bar: Interactable;
  update(t: number, dt: number, me: THREE.Vector3): void;
}

/** A pool: its water (scrolling ripples), its basin's floor and walls in mosaic, its coping. */
function basin(p: ThermeParts, def: PoolDef, water: THREE.CanvasTexture, color: string): THREE.CanvasTexture {
  const tiles = wrap(mosaic(color, 16, 0.12, def.id.length));
  p.group.add(mesh(rectsGeometry(def.rects, def.floor + 0.002, 2), tex(tiles), 0, 0, 0, false));
  const edges = poolEdges(def);
  p.group.add(mesh(edgeWallsGeometry(edges, def.floor, 0, 2), tex(tiles), 0, 0, 0, false));
  const w = water.clone();
  w.needsUpdate = true;
  const wm = tex(w, '#ffffff', { transparent: true, opacity: 0.8, depthWrite: false });
  const surface = mesh(rectsGeometry(def.rects, def.surface, 3), wm, 0, 0, 0, false);
  surface.userData.noOutline = true;
  surface.renderOrder = 1;
  p.group.add(surface);
  // The coping: a pale stone kerb round the water, just proud of the deck.
  for (const e of edges) {
    const len = e.to - e.from;
    const mid = (e.from + e.to) / 2;
    const off = e.at + e.out * 0.2;
    if (e.axis === 'x') blk(p, len + 0.4, 0.04, 0.4, '#f3ede0', mid, 0.02, off);
    else blk(p, 0.4, 0.04, len + 0.4, '#f3ede0', off, 0.02, mid);
  }
  return w;
}

/** A lounger at (x, z) facing `rotY` (0: its foot toward +z), seat `id`. */
function lounger(p: ThermeParts, x: number, z: number, rotY: number, id: string, cushion: string) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.72, 0.24, 1.95), toon('#f4f2ec'), 0, 0.12, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 1.3), toon(cushion), 0, 0.3, 0.28, false));
  const back = mesh(new THREE.BoxGeometry(0.66, 0.1, 0.72), toon(cushion), 0, 0.52, -0.62, false);
  back.rotation.x = -0.75;
  g.add(back);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), toon('#ffffff'), 0, 0.37, 0.75, false)); // a folded towel
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  p.still.add(g);
  const it: Interactable = { kind: 'thermeseat', seatId: id, x, z, y: 0, radius: 1.4 };
  p.interactables.push(it);
  // A pick box for the crosshair (the lounger itself is merged away).
  const pick = mesh(new THREE.BoxGeometry(0.8, 0.7, 2), new THREE.MeshBasicMaterial({ visible: false }), x, 0.35, z, false);
  pick.rotation.y = rotY;
  pick.userData.interact = it;
  pick.userData.noOutline = true;
  p.group.add(pick);
}

/** The swim-up bar: the counter in the water, stools in front, the bar floor behind with the back bar and a thatched roof over it all. */
function swimBar(p: ThermeParts): { bartender: Person; bar: Interactable } {
  const C = BAR_COUNTER;
  const cx = (C.minX + C.maxX) / 2;
  const cz = (C.minZ + C.maxZ) / 2;
  const h = C.top - THERMAL.floor;
  blk(p, C.maxX - C.minX, h - 0.08, C.maxZ - C.minZ, '#c9a879', cx, THERMAL.floor + (h - 0.08) / 2, cz);
  blk(p, C.maxX - C.minX + 0.3, 0.08, C.maxZ - C.minZ + 0.3, '#7a4f2a', cx, C.top - 0.04, cz);
  for (const s of BAR_STOOLS) {
    const seat = THERMAL.surface - 0.35;
    blk(p, 0.12, seat - THERMAL.floor, 0.12, '#d9d4c8', s.x, (THERMAL.floor + seat) / 2, s.z);
    p.still.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), toon('#2f9fb0'), s.x, seat, s.z, false));
  }
  // The back bar: shelves of bottles, a fruit bowl, a blender.
  const B = BACK_BAR;
  blk(p, B.maxX - B.minX, B.top, B.maxZ - B.minZ, '#6a4426', (B.minX + B.maxX) / 2, B.top / 2, (B.minZ + B.maxZ) / 2);
  const bottles = ['#e85d75', '#f4a261', '#2a9d8f', '#e9c46a', '#8ecae6', '#ffb4a2'];
  for (let i = 0; i < 14; i++) p.still.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 7), toon(bottles[i % bottles.length]), B.minX - 0.1, B.top + 0.16, B.minZ + 0.4 + i * 0.52, false));
  // The roof: four posts and a thatched cone over the bar floor.
  const F = BAR_FLOOR;
  for (const [x, z] of [
    [F.minX + 0.3, F.minZ + 0.3],
    [F.maxX - 0.3, F.minZ + 0.3],
    [F.minX + 0.3, F.maxZ - 0.3],
    [F.maxX - 0.3, F.maxZ - 0.3],
  ])
    p.still.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 7), toon('#7a5a3a'), x, 1.7, z, false));
  const thatch = mesh(new THREE.ConeGeometry(4.6, 2.2, 10), toon('#c8a35a'), (F.minX + F.maxX) / 2 - 0.6, 4.4, (F.minZ + F.maxZ) / 2, false);
  thatch.scale.set(1, 1, 1.45);
  p.still.add(thatch);
  plane(p, 3.2, 0.7, glow(sign('🍹 SCHWIMMBAR', 'Cocktails im Wasser', '#0f4c5c', '#ffe8a8', 768, 168)), C.minX - 0.02, 2.6, cz, -Math.PI / 2);
  const bartender = new Person('Kai', '#f4a261', { skin: 3, hair: 2, style: 2 });
  bartender.root.position.set(BARTENDER.x, 0, BARTENDER.z);
  bartender.root.rotation.y = BARTENDER.rotY;
  bartender.showLabel(false);
  p.group.add(bartender.root);
  const bar: Interactable = { kind: 'thermebar', x: cx, z: cz, y: 0, radius: 5.5 };
  p.interactables.push(bar);
  const pick = mesh(new THREE.BoxGeometry(C.maxX - C.minX + 0.4, 1.6, C.maxZ - C.minZ + 0.4), new THREE.MeshBasicMaterial({ visible: false }), cx, C.top - 0.6, cz, false);
  pick.userData.interact = bar;
  pick.userData.noOutline = true;
  p.group.add(pick);
  return { bartender, bar };
}

/** The island: a sandy bed with boulders and the palms growing out of it. */
function island(p: ThermeParts) {
  const I = ISLAND;
  const sand = mesh(new THREE.BoxGeometry(I.maxX - I.minX - 1.2, 0.06, I.maxZ - I.minZ - 1.2), toon('#ead7a6'), (I.minX + I.maxX) / 2, 0.03, (I.minZ + I.maxZ) / 2, false);
  p.still.add(sand);
  const grass = mesh(new THREE.BoxGeometry(6, 0.08, 5), toon('#6fae5a'), (I.minX + I.maxX) / 2 + 1, 0.05, (I.minZ + I.maxZ) / 2 - 2, false);
  p.still.add(grass);
  for (const [x, z, r] of [
    [91, 58.5, 0.6],
    [104.6, 47.4, 0.5],
    [99, 57.8, 0.4],
  ])
    p.still.add(mesh(new THREE.DodecahedronGeometry(r, 0), toon('#9a8f7f'), x, r * 0.6, z, false));
}

/** The cliff south-east of the grotto, and the waterfall down it into the pool's notch. */
function waterfall(p: ThermeParts): { tex: THREE.CanvasTexture; foam: Cloud } {
  const C = CLIFF;
  const rk = tex(rock(71));
  const cliff = mesh(new THREE.BoxGeometry(C.maxX - C.minX, WATERFALL.top + 0.3, C.maxZ - C.minZ), rk, (C.minX + C.maxX) / 2, (WATERFALL.top + 0.3) / 2, (C.minZ + C.maxZ) / 2, false);
  p.group.add(cliff);
  for (let i = 0; i < 7; i++) {
    const m = mesh(new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.35, 0), rk, C.minX + 0.6 + i * 1.45, WATERFALL.top + 0.2 + (i % 2) * 0.3, (C.minZ + C.maxZ) / 2, false);
    m.rotation.set(i, i * 2, 0);
    p.group.add(m);
  }
  const fall = wrap(fallingWater(29));
  const fm = tex(fall, '#ffffff', { transparent: true, opacity: 0.85, depthWrite: false });
  const sheet = plane(p, WATERFALL.maxX - WATERFALL.minX, WATERFALL.top - THERMAL.surface, fm, (WATERFALL.minX + WATERFALL.maxX) / 2, (WATERFALL.top + THERMAL.surface) / 2, WATERFALL.z, 0);
  sheet.userData.noOutline = true;
  const foam = new Cloud(220, '#ffffff');
  foam.lift = 0.5;
  foam.drag = 1.4;
  p.group.add(foam.points);
  return { tex: fall, foam };
}

export function buildParadies(p: ThermeParts): Paradies {
  const water = ripples('#3fb6c9', '#bff4ff', 41);
  const warm = ripples('#46c2b8', '#d6fff4', 43);
  const waters: THREE.CanvasTexture[] = [basin(p, THERMAL_POOL, water, '#5fc4d6')];
  for (const w of WHIRLPOOLS) waters.push(basin(p, w, warm, '#48b1a8'));
  for (const def of PARADIES_POOLS) if (def !== THERMAL_POOL && !WHIRLPOOLS.includes(def)) waters.push(basin(p, def, warm, '#3b8f9e'));
  island(p);
  const { bartender, bar } = swimBar(p);
  LOUNGERS.forEach((l, i) => lounger(p, l.x, l.z, l.rotY, l.id, ['#f6c453', '#4fb0c6', '#f28c6b', '#8fd18a'][i % 4]));
  // Planters round the palms on the decks (the island's grow straight out of its bed).
  const inIsland = (x: number, z: number) => x > ISLAND.minX && x < ISLAND.maxX && z > ISLAND.minZ && z < ISLAND.maxZ;
  for (const pm of PALMS) if (!inIsland(pm.x, pm.z)) p.still.add(mesh(new THREE.CylinderGeometry(PLANTER / 2, PLANTER / 2 - 0.08, 0.55, 12), toon('#d8c9ad'), pm.x, 0.275, pm.z, false));
  const grove: Grove = buildPalms(PALMS.map((pm) => ({ ...pm, y: inIsland(pm.x, pm.z) ? 0 : 0.55 })));
  p.group.add(grove.group);
  p.group.add(buildBamboo(BAMBOO));
  // The bubble ledges: shallow benches along the north wall, jets under them.
  for (const l of BUBBLE_LEDGES) blk(p, l.maxX - l.minX, 0.12, l.maxZ - l.minZ, '#e8f6f8', (l.minX + l.maxX) / 2, THERMAL.surface - 0.55, (l.minZ + l.maxZ) / 2);
  const bubbles = new Cloud(420, '#f2ffff');
  bubbles.lift = 0.7;
  bubbles.drag = 0.5;
  p.group.add(bubbles.points);
  const fall = waterfall(p);
  const v = new THREE.Vector3();
  return {
    bartender,
    bar,
    update: (t, dt, me) => {
      for (const [i, w] of waters.entries()) {
        w.offset.x = (t * (i ? 0.05 : 0.012)) % 1;
        w.offset.y = (t * (i ? 0.03 : 0.008)) % 1;
      }
      fall.tex.offset.y = (t * 1.4) % 1;
      // Bubbles only where they'd be seen: the whirlpools, the ledges and the waterfall's foot, near you.
      for (const w of WHIRLPOOLS) {
        const r = w.rects[0];
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        if (Math.hypot(me.x - cx, me.z - cz) > 45) continue;
        bubbles.emit(Math.ceil(dt * 40), { at: v.set(cx, w.surface - 0.05, cz), spread: { x: 1.9, y: 0.02, z: 1.9 }, vel: { x: 0, y: 0.4, z: 0 }, jitter: 0.2, life: 1.0, size0: 0.08, size1: 0.18, alpha: 0.7 });
      }
      for (const l of BUBBLE_LEDGES)
        if (Math.hypot(me.x - (l.minX + l.maxX) / 2, me.z - l.minZ) < 40)
          bubbles.emit(Math.ceil(dt * 18), { at: v.set((l.minX + l.maxX) / 2, THERMAL.surface - 0.03, (l.minZ + l.maxZ) / 2), spread: { x: 1.8, y: 0.02, z: 0.5 }, vel: { x: 0, y: 0.35, z: 0 }, jitter: 0.15, life: 0.9, size0: 0.07, size1: 0.15, alpha: 0.6 });
      if (Math.hypot(me.x - (WATERFALL.minX + WATERFALL.maxX) / 2, me.z - WATERFALL.z) < 60)
        fall.foam.emit(Math.ceil(dt * 50), { at: v.set((WATERFALL.minX + WATERFALL.maxX) / 2, THERMAL.surface + 0.1, WATERFALL.z + 0.5), spread: { x: (WATERFALL.maxX - WATERFALL.minX) / 2, y: 0.1, z: 0.5 }, vel: { x: 0, y: 0.8, z: 0.4 }, jitter: 0.4, life: 1.2, size0: 0.3, size1: 0.8, alpha: 0.55 });
      bubbles.update(dt);
      fall.foam.update(dt);
      grove.update(t);
    },
  };
}

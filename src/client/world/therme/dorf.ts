import * as THREE from 'three';
import { poolEdges } from '../../../shared/swim';
import { cutOut } from '../../../shared/gym-basement';
import { ZONES } from '../../../shared/therme';
import {
  AUFGUSS_BOARD, DORF_POOLS, ICE_FOUNTAIN, JETTY, KNEIPP, KNEIPP_FLOOR, RUHEHAUS, SAUNAS, benches, dorfFixtures, dorfSeats, dorfWater, innerOf, masterSpot, stoveOf, type SaunaDef,
} from '../../../shared/therme-dorf';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { Cloud } from '../gym/particles';
import { planks } from '../gym/textures';
import { mosaic, ripples, rock, saltBricks } from '../gym/basement/textures';
import { Person } from '../character';
import { blk, edgeWallsGeometry, glow, rand, rectsGeometry, sign, tex, wrap, type ThermeParts } from './kit';

/*
 * The Saunadorf (flrnoh fork, see shared/therme-dorf.ts, phase 5): a wooden boardwalk floor, the huts
 * each in its own look (planed spruce, round Kelo logs, an earth sauna under a grass roof, glowing
 * salt bricks, white tiles for the steam bath, herbs hung up in the Bio-Sauna), their tiered benches,
 * stoves with glowing stones, warm light inside, signs over the doors with how hot; the cold pond with
 * its jetty and reeds, the plunge pool, the ice fountain, the Kneipp trough, the Ruhehaus with its
 * fireplace and loungers, the Aufguss board, the Saunameister and the steam.
 */

export interface Dorf {
  /** Each hut's walls, ceiling and roof (by sauna id, and 'ruhe'): lifted away while you're inside and your camera isn't. */
  shells: Map<string, THREE.Group>;
  /** The Saunameister, who comes to the sauna with the Aufguss on. */
  master: Person;
  /** The board's face, redrawn with the plan. */
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  /** Steam off the stones: where it billows (the sauna with the Aufguss), and how hard. */
  steam(sauna: SaunaDef | null, strength: number, dt: number): void;
  update(t: number, dt: number): void;
}

const LOOK: Record<SaunaDef['look'], { wall: string; roof: string; inside: string; light: string }> = {
  wood: { wall: '#b98a5a', roof: '#6b4b2e', inside: '#d9b58a', light: '#ffb36b' },
  log: { wall: '#8c6239', roof: '#5a3e24', inside: '#b98552', light: '#ffa95e' },
  earth: { wall: '#6f5a43', roof: '#5f8f3e', inside: '#8a6a4a', light: '#ff9a4d' },
  salt: { wall: '#e7b9a4', roof: '#7a5a48', inside: '#f3c2ad', light: '#ff9d7a' },
  tile: { wall: '#e9f1f3', roof: '#9aa9ad', inside: '#dfeef2', light: '#bfe9ff' },
  herbs: { wall: '#a88a5c', roof: '#5f7a3a', inside: '#c9a874', light: '#ffd27a' },
};

/** Logs for the Kelo sauna's walls: round ends of stripes. */
function logs(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const r = rand(5);
  for (let y = 0; y < 256; y += 32) {
    const grd = g.createLinearGradient(0, y, 0, y + 32);
    const k = 0.85 + r() * 0.2;
    grd.addColorStop(0, `rgb(${110 * k},${74 * k},${42 * k})`);
    grd.addColorStop(0.5, `rgb(${160 * k},${112 * k},${66 * k})`);
    grd.addColorStop(1, `rgb(${96 * k},${62 * k},${34 * k})`);
    g.fillStyle = grd;
    g.fillRect(0, y, 256, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return wrap(t);
}

/** A hut: its walls (the plan's, in its look), a pitched roof over its ceiling, the door's frame and glass, the sign, benches, stove, light. */
function hut(p: ThermeParts, s: SaunaDef, wallTex: THREE.Texture, steamRoom: boolean): THREE.Group {
  const shell = new THREE.Group();
  p.group.add(shell);
  const look = LOOK[s.look];
  const b = s.box;
  const wallMat = tex(wallTex, look.wall);
  const insideMat = tex(wallTex, look.inside);
  for (const f of dorfFixtures().filter((f) => f.id.startsWith(`${s.id}-`) && /-(n|s|e|w)-/.test(f.id))) {
    const bottom = f.bottom ?? 0;
    shell.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, f.top - bottom, f.maxZ - f.minZ), wallMat, (f.minX + f.maxX) / 2, (f.top + bottom) / 2, (f.minZ + f.maxZ) / 2, false));
  }
  // The inside's ceiling, and a lining on the walls in the inside's colour (just proud of them).
  const r = innerOf(b);
  const ceil = mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ), insideMat, (r.minX + r.maxX) / 2, s.height - 0.01, (r.minZ + r.maxZ) / 2, false);
  ceil.rotation.x = Math.PI / 2;
  shell.add(ceil);
  // The roof: pitched along the hut's longer side (the earth sauna's a grass mound).
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  if (s.look === 'earth') {
    const mound = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(look.roof), (b.minX + b.maxX) / 2, s.height, (b.minZ + b.maxZ) / 2, false);
    mound.scale.set(w * 0.62, 1.6, d * 0.62);
    shell.add(mound);
  } else {
    const along = w >= d;
    const len = (along ? w : d) + 0.6;
    const span = (along ? d : w) + 0.6;
    const shape = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, Math.min(2.2, span * 0.32))]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    const roof = mesh(g, toon(look.roof), (b.minX + b.maxX) / 2, s.height + 0.3, (b.minZ + b.maxZ) / 2, false);
    if (along) roof.rotation.y = Math.PI / 2;
    shell.add(roof);
  }
  // The benches, a step darker each tier up, and the stove with its stones.
  for (const f of benches(s)) blk(p, f.maxX - f.minX, 0.08, f.maxZ - f.minZ, '#c99a62', (f.minX + f.maxX) / 2, f.top - 0.04, (f.minZ + f.maxZ) / 2);
  for (const f of benches(s)) blk(p, f.maxX - f.minX - 0.02, f.top - 0.08, f.maxZ - f.minZ - 0.02, '#8a6238', (f.minX + f.maxX) / 2, (f.top - 0.08) / 2, (f.minZ + f.maxZ) / 2);
  const st = stoveOf(s);
  const sx = (st.minX + st.maxX) / 2;
  const sz = (st.minZ + st.maxZ) / 2;
  if (!steamRoom) {
    blk(p, st.maxX - st.minX, 0.75, st.maxZ - st.minZ, '#2b2b2e', sx, 0.375, sz);
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ff6a2a' });
    glowMat.toneMapped = false;
    p.group.add(mesh(new THREE.BoxGeometry(st.maxX - st.minX - 0.2, 0.06, st.maxZ - st.minZ - 0.2), glowMat, sx, 0.78, sz, false));
    for (let i = 0; i < 9; i++) p.still.add(mesh(new THREE.DodecahedronGeometry(0.13, 0), toon('#6e6a66'), sx - 0.3 + (i % 3) * 0.3, 0.86 + (i % 2) * 0.05, sz - 0.3 + Math.floor(i / 3) * 0.3, false));
    // A wooden bucket and ladle by it.
    p.still.add(mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.26, 10), toon('#a8743c'), st.maxX + 0.35, 0.13, sz, false));
  } else blk(p, st.maxX - st.minX, 0.9, st.maxZ - st.minZ, '#cfe6ec', sx, 0.45, sz);
  // Warm light inside: a strip along the ceiling's edge.
  const light = new THREE.MeshBasicMaterial({ color: look.light });
  light.toneMapped = false;
  p.group.add(mesh(new THREE.BoxGeometry(r.maxX - r.minX - 0.4, 0.05, 0.06), light, (r.minX + r.maxX) / 2, s.height - 0.25, r.minZ + 0.06, false));
  p.group.add(mesh(new THREE.BoxGeometry(r.maxX - r.minX - 0.4, 0.05, 0.06), light, (r.minX + r.maxX) / 2, s.height - 0.25, r.maxZ - 0.06, false));
  // The sign over the door, outside, and the door's glass (open: no collider, you walk in).
  const D = s.door;
  const horiz = D.side === 'n' || D.side === 's';
  const out = D.side === 'n' ? b.minZ - 0.03 : D.side === 's' ? b.maxZ + 0.03 : D.side === 'w' ? b.minX - 0.03 : b.maxX + 0.03;
  const rotY = D.side === 'n' ? Math.PI : D.side === 's' ? 0 : D.side === 'w' ? -Math.PI / 2 : Math.PI / 2;
  const signM = mesh(new THREE.PlaneGeometry(2.4, 0.6), glow(sign(`${s.emoji} ${s.name.toUpperCase()}`, `${s.temp} °C`, '#3b2412', '#ffcf8a', 768, 192)), horiz ? D.at : out, 2.55, horiz ? out : D.at, false);
  signM.rotation.y = rotY;
  shell.add(signM);
  const glass = mesh(new THREE.PlaneGeometry(0.66, 2.0), toon('#bfe3ef', { transparent: true, opacity: 0.4 }), 0, 1.0, 0, false);
  const hinge = new THREE.Group();
  hinge.add(glass);
  glass.position.x = 0.33;
  hinge.position.set(horiz ? D.at - 0.7 : out, 0, horiz ? out : D.at - 0.7);
  hinge.rotation.y = rotY + (horiz ? 0 : Math.PI / 2) - 1.2; // left standing open
  glass.userData.noOutline = true;
  shell.add(hinge);
  return shell;
}

export function buildDorf(p: ThermeParts): Dorf {
  const D = ZONES.dorf;
  const r = rand(29);
  // The boardwalk: planks over the whole village (but its water).
  const deck = wrap(planks('#a07850', 8, 31));
  p.group.add(mesh(rectsGeometry(cutOut(D, dorfWater()), 0.008, 2.4), tex(deck), 0, 0, 0, false));
  const wood = wrap(planks('#c9965f', 10, 37));
  const looks: Record<SaunaDef['look'], THREE.Texture> = { wood, log: logs(), earth: wrap(rock(91)), salt: wrap(saltBricks(43)), tile: wrap(mosaic('#e3f0f3', 12, 0.05, 19)), herbs: wood };
  const shells = new Map<string, THREE.Group>();
  for (const s of SAUNAS) shells.set(s.id, hut(p, s, looks[s.look], s.id === 'dampf'));
  // Bundles of herbs hung up in the Bio-Sauna.
  const bio = SAUNAS.find((s) => s.id === 'bio')!;
  for (let i = 0; i < 6; i++) p.still.add(mesh(new THREE.ConeGeometry(0.12, 0.45, 6), toon(i % 2 ? '#7a9a4a' : '#a2b45a'), innerOf(bio.box).minX + 1.5 + i * 1.4, bio.height - 0.4, innerOf(bio.box).maxZ - 0.3, false));
  // The Ruhehaus: wood, a fireplace with its fire, loungers along both walls, rugs.
  const R = RUHEHAUS;
  const ruhe = new THREE.Group();
  p.group.add(ruhe);
  shells.set('ruhe', ruhe);
  for (const f of dorfFixtures().filter((f) => f.id.startsWith('ruhe-') && /-(n|s|e|w)-/.test(f.id))) {
    const bottom = f.bottom ?? 0;
    ruhe.add(mesh(new THREE.BoxGeometry(f.maxX - f.minX, f.top - bottom, f.maxZ - f.minZ), tex(wood, '#b7895c'), (f.minX + f.maxX) / 2, (f.top + bottom) / 2, (f.minZ + f.maxZ) / 2, false));
  }
  const fire = dorfFixtures().find((f) => f.id === 'ruhe-fire')!;
  blk(p, fire.maxX - fire.minX, 2.8, fire.maxZ - fire.minZ, '#8a8580', (fire.minX + fire.maxX) / 2, 1.4, (fire.minZ + fire.maxZ) / 2);
  const flame = new THREE.MeshBasicMaterial({ color: '#ff8a3a' });
  flame.toneMapped = false;
  const flames = mesh(new THREE.ConeGeometry(0.35, 0.7, 7), flame, R.fire.x, 0.75, fire.maxZ + 0.05, false);
  p.group.add(flames);
  for (const s of dorfSeats().filter((s) => s.pose === 'lie')) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.72, 0.24, 1.95), toon('#7a5434'), 0, 0.12, 0, false));
    g.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 1.3), toon('#e9dcc4'), 0, 0.3, 0.28, false));
    const back = mesh(new THREE.BoxGeometry(0.66, 0.1, 0.72), toon('#e9dcc4'), 0, 0.52, -0.62, false);
    back.rotation.x = -0.75;
    g.add(back);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    p.still.add(g);
  }
  p.still.add(mesh(new THREE.BoxGeometry(4, 0.02, 7), toon('#8f3b2e'), (R.box.minX + R.box.maxX) / 2, 0.02, (R.box.minZ + R.box.maxZ) / 2 + 2, false));
  // Every seat (benches, loungers) as something to aim at: invisible boxes (nothing drawn, still picked).
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of dorfSeats()) {
    const it: Interactable = { kind: 'thermeseat', seatId: s.id, x: s.x, z: s.z, y: s.y, radius: 1.2 };
    p.interactables.push(it);
    const pick = mesh(new THREE.BoxGeometry(s.pose === 'lie' ? 0.8 : 0.7, 0.5, s.pose === 'lie' ? 2 : 0.6), pickMat, s.x, s.y + 0.2, s.z, false);
    pick.rotation.y = s.rotY;
    pick.userData.interact = it;
    p.group.add(pick);
  }
  // The pond, the plunge pool: their basins and their water (cold, green-blue).
  const cold = ripples('#46b3bd', '#d6fbf8', 59);
  const waters: THREE.CanvasTexture[] = [];
  for (const def of DORF_POOLS) {
    const tiles = wrap(mosaic('#3d7f86', 16, 0.1, 71));
    p.group.add(mesh(rectsGeometry(def.rects, def.floor + 0.002, 2), tex(tiles), 0, 0, 0, false));
    p.group.add(mesh(edgeWallsGeometry(poolEdges(def), def.floor, 0, 2), tex(tiles), 0, 0, 0, false));
    const w = cold.clone();
    w.needsUpdate = true;
    waters.push(w);
    const s = mesh(rectsGeometry(def.rects, def.surface, 3), tex(w, '#ffffff', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0, 0, false);
    s.userData.noOutline = true;
    s.renderOrder = 1;
    p.group.add(s);
  }
  // The jetty: planks on posts, out into the pond.
  p.group.add(mesh(rectsGeometry([JETTY], 0.01, 2.4), tex(deck, '#c79a66'), 0, 0, 0, false));
  for (let x = JETTY.minX + 0.4; x < JETTY.maxX; x += 1.8) for (const z of [JETTY.minZ + 0.15, JETTY.maxZ - 0.15]) p.still.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.9, 6), toon('#5a3e24'), x, -0.9, z, false));
  // Reeds and stones round the pond's west end.
  for (let i = 0; i < 40; i++) {
    const z = 53 + r() * 30;
    p.still.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 1 + r() * 0.6, 4), toon('#6f8f3a'), 18.4 + r() * 1.2, 0.5, z, false));
  }
  // The Kneipp trough: pebbles under a skin of water.
  p.group.add(mesh(rectsGeometry([KNEIPP], KNEIPP_FLOOR + 0.002, 1), tex(wrap(rock(97)), '#a39a8f'), 0, 0, 0, false));
  const kw = cold.clone();
  kw.needsUpdate = true;
  waters.push(kw);
  const ks = mesh(rectsGeometry([KNEIPP], -0.08, 2), tex(kw, '#ffffff', { transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, false);
  ks.userData.noOutline = true;
  p.group.add(ks);
  // The ice fountain: a stone bowl heaped with ice.
  p.still.add(mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.9, 12), toon('#9aa3a8'), ICE_FOUNTAIN.x, 0.45, ICE_FOUNTAIN.z, false));
  for (let i = 0; i < 14; i++) p.still.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), toon('#e6f7ff'), ICE_FOUNTAIN.x - 0.35 + r() * 0.7, 0.95 + r() * 0.15, ICE_FOUNTAIN.z - 0.35 + r() * 0.7, false));
  // A few pines and lanterns about the village.
  for (const [x, z] of [[33, 40], [20, 92], [52, 92], [33, 92], [52, 40], [17, 40]] as const) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), toon('#5a3e24'), x, 0.7, z, false));
    for (let k = 0; k < 3; k++) p.still.add(mesh(new THREE.ConeGeometry(1.2 - k * 0.3, 1.8, 8), toon('#2f6b3a'), x, 1.6 + k * 1.0, z, false));
  }
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffcf8a' });
  lamp.toneMapped = false;
  for (const [x, z] of [[54, 64], [54, 84], [40, 74], [32, 96], [32, 46], [42, 112]] as const) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), toon('#2a2f35'), x, 1.1, z, false));
    p.group.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), lamp, x, 2.3, z, false));
  }
  // The board by the way in.
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture });
  face.toneMapped = false;
  const B = AUFGUSS_BOARD;
  const boardM = mesh(new THREE.PlaneGeometry(B.w, B.h), face, B.x + 0.16, B.y, B.z, false);
  boardM.rotation.y = Math.PI / 2;
  p.group.add(boardM);
  blk(p, 0.3, B.y + B.h / 2, B.w + 0.2, '#3b2412', B.x, (B.y + B.h / 2) / 2, B.z);
  // The Saunameister, waiting by the way in till an Aufguss.
  const master = new Person('Saunameister', '#ffffff', { skin: 5, hair: 1, style: 0, beard: 3 });
  master.root.position.set(B.x - 1.5, 0, B.z + 2.5);
  master.showLabel(false);
  p.group.add(master.root);
  const towel = mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshToonMaterial({ color: '#ffffff', side: THREE.DoubleSide, gradientMap: toon('#ffffff').gradientMap }), 0, 2.1, 0.2, false);
  master.root.add(towel);
  const steam = new Cloud(260, '#f4f7fa');
  steam.lift = 0.5;
  steam.drag = 0.9;
  p.group.add(steam.points);
  const v = new THREE.Vector3();
  let towelOn = false;
  return {
    shells,
    master,
    board: { canvas, texture },
    steam: (s, strength, dt) => {
      towelOn = !!s && strength > 0;
      if (s && strength > 0) {
        const st = stoveOf(s);
        steam.emit(Math.ceil(dt * 60 * strength), { at: v.set((st.minX + st.maxX) / 2, 1.0, (st.minZ + st.maxZ) / 2), spread: { x: 0.4, y: 0.1, z: 0.4 }, vel: { x: 0, y: 1.2, z: 0 }, jitter: 0.6, life: 2.4, size0: 0.4, size1: 1.8, alpha: 0.35 });
        const m = masterSpot(s);
        master.root.position.set(m.x, 0, m.z);
      }
      steam.update(dt);
    },
    update: (t, dt) => {
      waters.forEach((w, i) => {
        w.offset.x = (t * (0.008 + i * 0.002)) % 1;
        w.offset.y = (t * 0.006) % 1;
      });
      flames.scale.set(1 + Math.sin(t * 11) * 0.08, 1 + Math.sin(t * 7.3) * 0.18, 1);
      flame.color.setHSL(0.06 + Math.sin(t * 5) * 0.015, 1, 0.55);
      master.update(dt, t, false, false);
      // The towel: wheeling over his head during an Aufguss, folded on his shoulder otherwise.
      towel.visible = true;
      if (towelOn) {
        towel.position.set(Math.cos(t * 6) * 0.5, 2.2 + Math.sin(t * 6) * 0.15, Math.sin(t * 6) * 0.5);
        towel.rotation.set(0, t * 6, 0.4);
      } else {
        towel.position.set(0.22, 1.45, 0);
        towel.rotation.set(0, 0, 1.4);
      }
    },
  };
}


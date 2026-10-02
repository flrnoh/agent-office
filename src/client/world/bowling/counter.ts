import * as THREE from 'three';
import { BOWLING_ROOM } from '../../../shared/bowling';
import { BACK_BAR, COUNTER, FRYER, ORDER_SPOT, SHOE_DESK, SHOE_SHELF, SHOE_SIZES, SHOE_SPOT, STAFF_GATE, TAPS, TILL, type Stand } from '../../../shared/bowling-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, FONT, glow, neonSign } from '../casino/parts';
import type { HouseLighting } from './lighting';
import { RETRO, drawStar } from './signs';
import { shoePair } from './shoes';

/*
 * The bowling centre's counter (flrnoh fork, see FORK.md "The bowling centre"), in ZONES.counter: a
 * cherry-red counter with a chrome edge and a boomerang formica top facing the lanes, the beer taps
 * and the till on it, the fryer and the chip warmer on the back bar, the shelf of rental shoes by size
 * behind, the shoe desk at its end toward the doors, the menu hanging over it. E at the counter orders,
 * E at the shoe desk rents shoes (client/bowling).
 */

export interface BowlingCounter {
  counter: Interactable;
  shoes: Interactable;
  /** The fryer's oil and the warmer's lamp: they shimmer. */
  update(t: number): void;
}

/** The formica: cream with little boomerangs and dots. */
function formica(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f3e9d2';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      g.save();
      g.translate((i * 37) % 128, (i * 71) % 128);
      g.rotate(i * 1.3);
      g.strokeStyle = [RETRO.teal, RETRO.cherry, '#8d99ae'][i % 3];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-8, 0);
      g.quadraticCurveTo(0, -7, 8, 0);
      g.stroke();
      g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The menu board over the counter. */
function menuTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 300, (g) => {
    g.fillStyle = '#16122e';
    g.fillRect(0, 0, 1024, 300);
    g.strokeStyle = RETRO.mustard;
    g.lineWidth = 8;
    g.strokeRect(6, 6, 1012, 288);
    g.textBaseline = 'middle';
    g.font = `italic 900 54px ${FONT}`;
    g.fillStyle = RETRO.mustard;
    g.textAlign = 'center';
    g.fillText('★ THEKE ★', 512, 50);
    g.font = `800 34px ${FONT}`;
    const rows: [string, string][] = [
      ['🍺 Bier vom Fass', '🍟 Pommes rot-weiß'],
      ['🚲 Radler', '🌭 Currywurst'],
      ['🧡 Spezi · 🥤 Cola', '🧀 Nachos mit Käse'],
    ];
    rows.forEach(([a, b], i) => {
      g.textAlign = 'left';
      g.fillStyle = '#fdf3dc';
      g.fillText(a, 60, 120 + i * 58);
      g.fillText(b, 560, 120 + i * 58);
    });
    g.textAlign = 'center';
    g.font = `700 24px ${FONT}`;
    g.fillStyle = RETRO.aqua;
    g.fillText('alles aufs Haus · Schuhe am Ende der Theke', 512, 278);
  });
}

/** The size labels over the shoe shelf's columns. */
function sizesTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 64, (g) => {
    g.fillStyle = RETRO.cream;
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = RETRO.ink;
    g.font = `900 40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    SHOE_SIZES.forEach((s, i) => g.fillText(String(s), ((i + 0.5) / SHOE_SIZES.length) * 1024, 34));
  });
}

/** An invisible box the aim can land on, carrying what it's for (see aimedAt in input/pointer.ts). */
const PICK = new THREE.MeshBasicMaterial({ visible: false });
function pick(g: THREE.Group, it: Interactable, b: { minX: number; maxX: number; minZ: number; maxZ: number }, y0: number, y1: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, y1 - y0, b.maxZ - b.minZ), PICK);
  m.position.set((b.minX + b.maxX) / 2, (y0 + y1) / 2, (b.minZ + b.maxZ) / 2);
  m.userData.interact = it;
  g.add(m);
}

const solid = (b: Stand, colliders: Collider[], fence = false) => colliders.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, bottom: 0, top: b.top, fence });

export function buildCounter(group: THREE.Group, colliders: Collider[], interactables: Interactable[], lighting: HouseLighting): BowlingCounter {
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const cherry = toon(RETRO.cherry);
  const chrome = toon('#d5dbe2');
  const steel = toon('#aeb6bf');
  const dark = toon('#2b2d42');
  const top = formica();
  const topMat = new THREE.MeshToonMaterial({ map: top, gradientMap });

  // ---- The counter and the shoe desk: a cherry body, a chrome band, the formica top, a kick plate, an underglow ----
  const underglow = glow(null, '#2a2040');
  lighting.tint(underglow.color, '#4a3a2a', RETRO.aqua, true);
  for (const b of [COUNTER, SHOE_DESK]) {
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    parts.add(mesh(box(w, b.top - 0.06, d), cherry, cx, (b.top - 0.06) / 2, cz));
    parts.add(mesh(box(w + 0.02, 0.1, d + 0.02), chrome, cx, 0.62, cz, false));
    parts.add(mesh(box(w, 0.12, d - 0.06), dark, cx, 0.06, cz, false));
    top.repeat.set(w / 1.2, d / 1.2);
    group.add(mesh(box(w + 0.16, 0.06, d + 0.16), topMat, cx, b.top - 0.03, cz));
    group.add(mesh(box(w, 0.03, d + 0.04), underglow, cx, 0.16, cz, false));
    solid(b, colliders);
  }
  // Ribbed chrome strips down the counter's front, every metre, and three starbursts on it.
  for (let x = COUNTER.minX + 0.5; x < COUNTER.maxX; x += 1) parts.add(mesh(box(0.05, 0.42, 0.03), chrome, x, 0.88, COUNTER.minZ - 0.015, false));
  const starTex = canvasTexture(128, 128, (g) => drawStar(g, 64, 64, 60, 8, RETRO.mustard, 0.2));
  const starMat = new THREE.MeshToonMaterial({ map: starTex, transparent: true, alphaTest: 0.1, gradientMap, emissive: new THREE.Color('#ffe14d') });
  lighting.level((v) => (starMat.emissiveIntensity = v), 0.05, 1.3);
  for (const x of [-17.5, -14.4, -11.3]) {
    const st = mesh(new THREE.PlaneGeometry(0.42, 0.42), starMat, x, 0.36, COUNTER.minZ - 0.02, false);
    st.rotation.y = Math.PI;
    group.add(st);
  }

  // ---- On the counter: the beer taps and the till -----------------------------------------------------
  const tapY = COUNTER.top;
  parts.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 12), chrome, TAPS.x, tapY + 0.21, TAPS.z));
  parts.add(mesh(box(0.7, 0.12, 0.12), chrome, TAPS.x, tapY + 0.46, TAPS.z));
  for (const [i, c] of [RETRO.cherry, RETRO.mustard, RETRO.teal].entries()) {
    const x = TAPS.x - 0.24 + i * 0.24;
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), chrome, x, tapY + 0.37, TAPS.z - 0.07));
    parts.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), toon(c), x, tapY + 0.62, TAPS.z));
  }
  parts.add(mesh(box(0.8, 0.03, 0.22), steel, TAPS.x, tapY + 0.015, TAPS.z - 0.12, false));
  // A cream cash register with a little green display.
  parts.add(mesh(box(0.46, 0.22, 0.4), toon('#f1e4c8'), TILL.x, tapY + 0.11, TILL.z));
  const keys = mesh(box(0.4, 0.06, 0.2), toon('#6c757d'), TILL.x, tapY + 0.25, TILL.z - 0.06);
  keys.rotation.x = -0.35;
  parts.add(keys);
  parts.add(mesh(box(0.3, 0.12, 0.06), dark, TILL.x, tapY + 0.33, TILL.z + 0.1));
  const display = glow(canvasTexture(64, 24, (g) => {
    g.fillStyle = '#062b12';
    g.fillRect(0, 0, 64, 24);
    g.fillStyle = '#5cff8a';
    g.font = `700 16px monospace`;
    g.fillText('0,00 €', 6, 18);
  }));
  const disp = mesh(new THREE.PlaneGeometry(0.26, 0.09), display, TILL.x, tapY + 0.335, TILL.z + 0.065, false);
  disp.rotation.y = Math.PI;
  group.add(disp);
  // Napkins, a ketchup and a mayo bottle on the counter.
  parts.add(mesh(box(0.16, 0.12, 0.12), steel, -17.8, tapY + 0.06, COUNTER.minZ + 0.25));
  parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 10), toon('#c1121f'), -17.5, tapY + 0.1, COUNTER.minZ + 0.25));
  parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 10), toon('#f8f1d0'), -17.38, tapY + 0.1, COUNTER.minZ + 0.25));

  // ---- The back bar: the fryer, the chip warmer, the glasses -----------------------------------------
  const bb = BACK_BAR;
  parts.add(mesh(box(bb.maxX - bb.minX, bb.top, bb.maxZ - bb.minZ), steel, (bb.minX + bb.maxX) / 2, bb.top / 2, (bb.minZ + bb.maxZ) / 2));
  solid(bb, colliders);
  // The fryer: two baskets in shimmering oil, a hood over it.
  parts.add(mesh(box(0.6, 0.12, 0.9), dark, FRYER.x, bb.top + 0.06, FRYER.z));
  const oil = toon('#d39b2a', { emissive: '#7a4a00' });
  const oilMesh = mesh(new THREE.PlaneGeometry(0.46, 0.76), oil, FRYER.x, bb.top + 0.125, FRYER.z, false);
  oilMesh.rotation.x = -Math.PI / 2;
  group.add(oilMesh);
  for (const s of [-1, 1]) {
    parts.add(mesh(box(0.34, 0.14, 0.3), toon('#c9ced4'), FRYER.x, bb.top + 0.2, FRYER.z + s * 0.19));
    const handle = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), dark, FRYER.x + 0.3, bb.top + 0.3, FRYER.z + s * 0.19);
    handle.rotation.z = -1.1;
    parts.add(handle);
  }
  parts.add(mesh(box(0.8, 0.5, 1.4), steel, -20.3, 2.4, FRYER.z));
  // The chip warmer: a glass box under an orange lamp, full of fries.
  const wz = 17.9;
  const lamp = glow(null, '#ffb347');
  group.add(mesh(box(0.5, 0.03, 0.8), lamp, -20.2, bb.top + 0.52, wz, false));
  const warmGlass = new THREE.MeshToonMaterial({ color: '#ffe8c2', transparent: true, opacity: 0.25, gradientMap, depthWrite: false });
  parts.add(mesh(box(0.55, 0.5, 0.85), warmGlass, -20.2, bb.top + 0.26, wz, false));
  const fries = toon('#f4c430');
  for (let i = 0; i < 26; i++) {
    const f = mesh(box(0.025, 0.025, 0.16), fries, -20.36 + (i % 5) * 0.08, bb.top + 0.04 + Math.floor(i / 13) * 0.03, wz - 0.3 + (i % 13) * 0.05, false);
    f.rotation.y = (i * 1.7) % Math.PI;
    parts.add(f);
  }
  // A shelf of glasses and a row of beer glasses upside down by the taps' end.
  parts.add(mesh(box(0.3, 0.04, 2.2), steel, -20.5, 1.85, 16.8));
  const glassMat = new THREE.MeshToonMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55, gradientMap });
  for (let i = 0; i < 9; i++) parts.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.16, 10), glassMat, -20.5, 1.95, 15.95 + i * 0.22, false));

  // ---- The shoe shelf by size, against the south wall; the sizes over it; SCHUHVERLEIH in neon -------
  const sh = SHOE_SHELF;
  const cols = SHOE_SIZES.length;
  const rows = 4;
  const cw = (sh.maxX - sh.minX) / cols;
  const shelfMat = toon('#7a4e2d');
  parts.add(mesh(box(sh.maxX - sh.minX, sh.top, 0.04), toon('#5c3a20'), (sh.minX + sh.maxX) / 2, sh.top / 2, sh.maxZ - 0.02, false));
  for (let r = 0; r <= rows; r++) parts.add(mesh(box(sh.maxX - sh.minX, 0.04, sh.maxZ - sh.minZ), shelfMat, (sh.minX + sh.maxX) / 2, 0.3 + r * ((sh.top - 0.4) / rows), (sh.minZ + sh.maxZ) / 2));
  for (let c = 0; c <= cols; c++) parts.add(mesh(box(0.03, sh.top - 0.3, sh.maxZ - sh.minZ), shelfMat, sh.minX + c * cw, 0.3 + (sh.top - 0.3) / 2, (sh.minZ + sh.maxZ) / 2));
  solid(sh, colliders);
  // A pair in nearly every cubby (a few out on rent), in the house's colours.
  const pairs = new THREE.Group();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if ((c * 7 + r * 3) % 5 === 0) continue;
      const pair = shoePair((c + r) % 3);
      pair.position.set(sh.minX + (c + 0.5) * cw, 0.33 + r * ((sh.top - 0.4) / rows), (sh.minZ + sh.maxZ) / 2);
      pair.rotation.y = Math.PI;
      pair.scale.setScalar(0.62 + c * 0.012);
      pairs.add(pair);
    }
  }
  group.add(mergeByMaterial(pairs));
  const sizes = mesh(new THREE.PlaneGeometry(sh.maxX - sh.minX, 0.2), new THREE.MeshToonMaterial({ map: sizesTexture(), gradientMap }), (sh.minX + sh.maxX) / 2, sh.top + 0.12, sh.minZ - 0.01, false);
  sizes.rotation.y = Math.PI;
  group.add(sizes);
  const neon = mesh(new THREE.PlaneGeometry(4.4, 1.0), glow(neonSign('SCHUHVERLEIH', RETRO.pink, 1024, 232, '#1a0d24')), (sh.minX + sh.maxX) / 2, 3.2, BOWLING_ROOM.maxZ - 0.04, false);
  neon.rotation.y = Math.PI;
  group.add(neon);

  // ---- The menu hanging over the counter on two chains ----------------------------------------------
  const mx = (COUNTER.minX + COUNTER.maxX) / 2;
  const menu = mesh(new THREE.PlaneGeometry(5, 1.46), glow(menuTexture()), mx, 3.1, COUNTER.minZ + 0.35, false);
  menu.rotation.y = Math.PI;
  group.add(menu);
  parts.add(mesh(box(5.1, 1.56, 0.06), dark, mx, 3.1, COUNTER.minZ + 0.39, false));
  for (const s of [-1, 1]) parts.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.1, 4), steel, mx + s * 2.3, 5.4, COUNTER.minZ + 0.39, false));
  // Pendant lamps over the counter: red enamel shades.
  const bulbMat = glow(null, '#fff1c8');
  lighting.tint(bulbMat.color, '#fff1c8', '#4a3550');
  for (const x of [-18, -15.6, -13.2, -10.8]) {
    parts.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.4, 4), dark, x, 5.3, COUNTER.maxZ + 0.4, false));
    parts.add(mesh(new THREE.ConeGeometry(0.26, 0.24, 18, 1, true), cherry, x, 3.5, COUNTER.maxZ + 0.4, false));
    group.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), bulbMat, x, 3.42, COUNTER.maxZ + 0.4, false));
  }

  // ---- Bar stools at the west end of the counter (the rest of it is for ordering) --------------------
  for (const x of [-18.8, -17.7, -16.6]) {
    parts.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 18), cherry, x, 0.8, COUNTER.minZ - 0.45));
    parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.76, 8), chrome, x, 0.38, COUNTER.minZ - 0.45));
    parts.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), chrome, x, 0.015, COUNTER.minZ - 0.45));
    parts.add(mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 16), chrome, x, 0.32, COUNTER.minZ - 0.45).rotateX(Math.PI / 2));
    colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: COUNTER.minZ - 0.65, maxZ: COUNTER.minZ - 0.25, bottom: 0, top: 0.85, fence: true });
  }

  // ---- The staff gate: a little swing door between the shoe desk and the wall ------------------------
  parts.add(mesh(box(0.05, 1, STAFF_GATE.maxZ - STAFF_GATE.minZ - 0.1), cherry, (STAFF_GATE.minX + STAFF_GATE.maxX) / 2, 0.5, (STAFF_GATE.minZ + STAFF_GATE.maxZ) / 2));
  parts.add(mesh(box(0.08, 0.06, STAFF_GATE.maxZ - STAFF_GATE.minZ - 0.1), chrome, (STAFF_GATE.minX + STAFF_GATE.maxX) / 2, 1.0, (STAFF_GATE.minZ + STAFF_GATE.maxZ) / 2));
  solid(STAFF_GATE, colliders, true);
  // A rubber mat behind the counter where the staff stand.
  const mat = mesh(new THREE.PlaneGeometry(COUNTER.maxX - COUNTER.minX, 1.4), toon('#2a2a33'), (COUNTER.minX + COUNTER.maxX) / 2, 0.006, COUNTER.maxZ + 0.75, false);
  mat.rotation.x = -Math.PI / 2;
  group.add(mat);

  group.add(mergeByMaterial(parts));

  // ---- What there is to use ----------------------------------------------------------------------------
  const counter: Interactable = { kind: 'bowlingcounter', x: ORDER_SPOT.x, z: ORDER_SPOT.z, radius: 3.5 };
  pick(group, counter, { minX: -16.2, maxX: COUNTER.maxX, minZ: COUNTER.minZ, maxZ: COUNTER.maxZ }, 0, COUNTER.top + 0.75);
  const shoes: Interactable = { kind: 'bowlingshoes', x: SHOE_SPOT.x, z: SHOE_SPOT.z, radius: 2.4 };
  pick(group, shoes, SHOE_DESK, 0, SHOE_DESK.top + 0.3);
  pick(group, shoes, sh, 0, sh.top + 0.3);
  interactables.push(counter, shoes);

  return {
    counter,
    shoes,
    update(t) {
      oil.emissiveIntensity = 0.5 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
    },
  };
}

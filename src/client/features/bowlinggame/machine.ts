import * as THREE from 'three';
import { BOWLING_ROOM, FOUL_LINE_Z, LANE_COUNT, LANE_X, ZONES } from '../../../shared/bowling';
import { GUTTER, HEAD_PIN_D, LANE_WIDTH, PIN_HEIGHT, PIT_D, laneName } from '../../../shared/bowling-game';
import { canvasTexture } from '../../world/texture';
import { mesh, toon } from '../../world/toon';
import { SURF } from './lanes3d';

/*
 * The machines at the far end (flrnoh fork, see FORK.md "Bowling lanes"): the masking unit over the
 * pins, a panel per lane with its number and a picture of its own (a rocket, a flamingo, pins in
 * shades, a ringed planet, a lightning ball, a sunset), lit from behind and fluorescent under the
 * black light; the dark soffit above it; and behind the curtain each lane's pinsetter: the sweep bar
 * that drops in front of the pins and rakes the deadwood into the pit, and the setting table that
 * lifts the standing pins, sets them back and brings a fresh rack down. Where the bar and the table
 * are is the lane's playback's (view.ts): `bar(lane, d, drop)` and `table(lane, drop)`.
 */

const zOf = (d: number) => FOUL_LINE_Z - d;
const W_ALL = LANE_WIDTH + 2 * GUTTER;
/** The masking unit's face: over the deck, a little in front of the head pin. */
export const MASK = { d: HEAD_PIN_D - 0.62, bottom: SURF + 0.92, top: SURF + 2.25 } as const;
/** Where the sweep bar waits (up inside the masking unit) and the setting table (above the deck). */
export const BAR_REST = { d: HEAD_PIN_D - 0.32, y: MASK.bottom + 0.05 } as const;
export const TABLE_REST_Y = MASK.bottom + 0.25;
/** The table's underside as it sets pins down (just over a standing pin's crown). */
export const TABLE_LOW_Y = SURF + PIN_HEIGHT + 0.015;

type Painter = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const star = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
};
/** A cartoon pin, `s` tall, standing at (x, y). */
const cartoonPin = (g: CanvasRenderingContext2D, x: number, y: number, s: number, shades = false) => {
  g.fillStyle = '#fbfaf6';
  g.beginPath();
  g.ellipse(x, y - s * 0.32, s * 0.16, s * 0.3, 0, 0, Math.PI * 2);
  g.ellipse(x, y - s * 0.82, s * 0.09, s * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - s * 0.06, y - s * 0.72, s * 0.12, s * 0.2);
  g.fillStyle = '#e0283c';
  g.fillRect(x - s * 0.065, y - s * 0.66, s * 0.13, s * 0.03);
  g.fillRect(x - s * 0.065, y - s * 0.6, s * 0.13, s * 0.03);
  if (shades) {
    g.fillStyle = '#111';
    g.fillRect(x - s * 0.1, y - s * 0.86, s * 0.2, s * 0.05);
    g.beginPath();
    g.arc(x - s * 0.05, y - s * 0.82, s * 0.045, 0, Math.PI);
    g.arc(x + s * 0.05, y - s * 0.82, s * 0.045, 0, Math.PI);
    g.fill();
  }
};
/** Each lane's picture on the masking unit. */
const PICTURES: Painter[] = [
  (g, w, h) => {
    // A rocket over the stars.
    g.fillStyle = '#fff7b0';
    for (let i = 0; i < 14; i++) star(g, (i * 97) % w, ((i * 53) % h) * 0.9 + 10, 4 + (i % 3) * 2);
    g.save();
    g.translate(w * 0.7, h * 0.55);
    g.rotate(-0.6);
    g.fillStyle = '#f2f2f6';
    g.beginPath();
    g.ellipse(0, 0, 26, 64, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff4d4d';
    g.beginPath();
    g.moveTo(-26, 20);
    g.lineTo(-44, 60);
    g.lineTo(-14, 44);
    g.moveTo(26, 20);
    g.lineTo(44, 60);
    g.lineTo(14, 44);
    g.fill();
    g.fillStyle = '#3ad1ff';
    g.beginPath();
    g.arc(0, -14, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffb02e';
    g.beginPath();
    g.moveTo(-14, 58);
    g.lineTo(0, 100);
    g.lineTo(14, 58);
    g.fill();
    g.restore();
  },
  (g, w, h) => {
    // A flamingo on one leg by a palm-pink sun.
    g.fillStyle = '#ffcf5a';
    g.beginPath();
    g.arc(w * 0.75, h * 0.42, 52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ff5fa8';
    g.fillStyle = '#ff5fa8';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(w * 0.62, h * 0.55, 40, 24, -0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(w * 0.66, h * 0.48);
    g.quadraticCurveTo(w * 0.72, h * 0.1, w * 0.62, h * 0.18);
    g.stroke();
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.62);
    g.lineTo(w * 0.62, h * 0.95);
    g.stroke();
    g.fillStyle = '#222';
    g.fillRect(w * 0.585, h * 0.16, 14, 6);
  },
  (g, w, h) => {
    // Three pins in shades, cool as anything.
    cartoonPin(g, w * 0.55, h * 0.95, 150, true);
    cartoonPin(g, w * 0.7, h * 0.95, 170, true);
    cartoonPin(g, w * 0.85, h * 0.95, 150, true);
  },
  (g, w, h) => {
    // A ringed planet and a moon.
    g.fillStyle = '#9d6bff';
    g.beginPath();
    g.arc(w * 0.72, h * 0.5, 50, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffd36b';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(w * 0.72, h * 0.5, 92, 22, -0.3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d8e6ff';
    g.beginPath();
    g.arc(w * 0.52, h * 0.25, 14, 0, Math.PI * 2);
    g.fill();
  },
  (g, w, h) => {
    // A ball with a lightning bolt.
    g.fillStyle = '#2a63ff';
    g.beginPath();
    g.arc(w * 0.7, h * 0.55, 56, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b1a44';
    for (const [x, y] of [[-14, -22], [8, -26], [-2, -6]]) {
      g.beginPath();
      g.arc(w * 0.7 + x, h * 0.55 + y, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffe93b';
    g.beginPath();
    g.moveTo(w * 0.52, h * 0.05);
    g.lineTo(w * 0.47, h * 0.45);
    g.lineTo(w * 0.53, h * 0.45);
    g.lineTo(w * 0.46, h * 0.95);
    g.lineTo(w * 0.6, h * 0.35);
    g.lineTo(w * 0.54, h * 0.35);
    g.closePath();
    g.fill();
  },
  (g, w, h) => {
    // A sunset over the sea with a palm.
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,120,80,0)');
    grad.addColorStop(1, 'rgba(255,90,140,.6)');
    g.fillStyle = grad;
    g.fillRect(w * 0.45, 0, w * 0.55, h);
    g.fillStyle = '#ffd25a';
    g.beginPath();
    g.arc(w * 0.75, h * 0.7, 46, Math.PI, 0);
    g.fill();
    g.fillStyle = '#1a1030';
    for (let i = 0; i < 4; i++) g.fillRect(w * 0.47, h * 0.72 + i * 12, w * 0.53, 4);
    g.fillRect(w * 0.6, h * 0.3, 8, h * 0.45);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(w * 0.6 + 4, h * 0.3, 46, 9, -0.9 + i * 0.45, 0, Math.PI * 2);
      g.fill();
    }
  },
];

/** A lane's panel: a deep colour, its number big on the left, its picture on the right. */
function panelTexture(lane: number): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const hues = ['#1b1446', '#3a0f3a', '#0f2c3a', '#2a1a4a', '#0d2050', '#3a1424'];
  return canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, hues[lane % hues.length]);
    grad.addColorStop(1, '#0b0b16');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    PICTURES[lane % PICTURES.length](g, W, H);
    g.font = '900 170px Nunito, ui-rounded, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#0b0b16';
    g.strokeText(laneName(lane), 40, H * 0.54);
    g.fillStyle = '#ffffff';
    g.fillText(laneName(lane), 40, H * 0.54);
    g.fillStyle = '#ffcf3a';
    g.fillRect(0, H - 10, W, 10);
    g.fillRect(0, 0, W, 6);
  });
}

export interface Machines {
  group: THREE.Group;
  /** The sweep bar on `lane`: `d` down the lane, `drop` 0 (up in the masking) to 1 (down on the deck). */
  bar(lane: number, d: number, drop: number): void;
  /** The setting table on `lane`: `drop` 0 (up) to 1 (its underside just over a pin's crown). Returns its underside's height. */
  table(lane: number, drop: number): number;
  /** Cosmic bowling's glow on the panels (0 off, 1 on). */
  glow(k: number): void;
}

export function buildMachines(parent: THREE.Object3D): Machines {
  const group = new THREE.Group();
  group.name = 'bowling-machines';
  parent.add(group);
  const west = ZONES.lanes.minX;
  const east = ZONES.lanes.maxX;
  const zMask = zOf(MASK.d);
  const dark = toon('#14141c');
  const frame = toon('#262635');
  // The soffit over the masking unit, up to well above anyone's eye line, and the fascia's lip.
  group.add(mesh(new THREE.BoxGeometry(east - west, BOWLING_ROOM.height - MASK.top, 0.12), dark, (west + east) / 2, (BOWLING_ROOM.height + MASK.top) / 2, zMask - 0.04, false));
  group.add(mesh(new THREE.BoxGeometry(east - west, 0.08, 0.4), frame, (west + east) / 2, MASK.bottom - 0.04, zMask - 0.15));
  // Under its lip, the light strip that lights the decks.
  const strip = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
  strip.userData.outlineParameters = { visible: false };
  group.add(mesh(new THREE.BoxGeometry(east - west - 0.2, 0.02, 0.06), strip, (west + east) / 2, MASK.bottom - 0.085, zMask - 0.25, false));

  const panels: THREE.MeshToonMaterial[] = [];
  const bars: THREE.Object3D[] = [];
  const tables: THREE.Object3D[] = [];
  const panelGeo = new THREE.PlaneGeometry(W_ALL + 0.3, MASK.top - MASK.bottom);
  const barMat = toon('#c8ccd6');
  const tableMat = toon('#3c3f4e');
  const machineMat = toon('#b8432f');
  for (let i = 0; i < LANE_COUNT; i++) {
    const x = LANE_X[i];
    const tex = panelTexture(i);
    const m = new THREE.MeshToonMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#5a5a5a') });
    panels.push(m);
    const p = mesh(panelGeo, m, x, (MASK.top + MASK.bottom) / 2, zMask + 0.01, false);
    p.rotation.x = -0.12;
    group.add(p);
    // Dividers between the panels.
    group.add(mesh(new THREE.BoxGeometry(0.08, MASK.top - MASK.bottom + 0.1, 0.12), frame, x + (W_ALL + 0.38) / 2, (MASK.top + MASK.bottom) / 2, zMask, false));
    // The sweep bar: a rake the lane's width, on two arms.
    const bar = new THREE.Group();
    bar.add(mesh(new THREE.BoxGeometry(W_ALL + 0.06, 0.1, 0.035), barMat, 0, 0.05, 0));
    for (const side of [-1, 1]) bar.add(mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), barMat, side * (W_ALL / 2 + 0.03), 0.5, 0.02));
    bar.position.set(x, BAR_REST.y, zOf(BAR_REST.d));
    group.add(bar);
    bars.push(bar);
    // The setting table: a grey deck with ten pin cups under it.
    const table = new THREE.Group();
    table.add(mesh(new THREE.BoxGeometry(W_ALL - 0.04, 0.07, 1.05), tableMat, 0, 0.035, 0));
    table.position.set(x, TABLE_REST_Y, zOf(HEAD_PIN_D + 0.4));
    group.add(table);
    tables.push(table);
    // The pinsetter behind the curtain: its red frame, a turret, the elevator wheel.
    const mz = zOf(PIT_D + 1.9);
    group.add(mesh(new THREE.BoxGeometry(W_ALL - 0.1, 2.2, 1.6), machineMat, x, SURF + 1.1, mz));
    const wheel = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 20), frame, x + 0.2, SURF + 1.3, mz + 0.82);
    group.add(wheel);
    group.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), frame, x, SURF + 2.3, mz));
  }
  // The back wall of the machine room, dark.
  group.add(mesh(new THREE.BoxGeometry(east - west, 3.2, 0.1), dark, (west + east) / 2, 1.6, ZONES.lanes.minZ + 0.06, false));

  return {
    group,
    bar(lane, d, drop) {
      const b = bars[lane];
      b.position.y = THREE.MathUtils.lerp(BAR_REST.y, SURF + 0.005, drop);
      b.position.z = zOf(d);
    },
    table(lane, drop) {
      const y = THREE.MathUtils.lerp(TABLE_REST_Y, TABLE_LOW_Y, drop);
      tables[lane].position.y = y;
      return y;
    },
    glow(k) {
      for (const m of panels) m.emissive.setScalar(0.35 + 0.6 * k);
    },
  };
}

import * as THREE from 'three';
import { ENTRANCE, FOYER, KINO, KT } from '../../../shared/kino-plan';
import { canvasTexture } from '../texture';
import { toon } from '../toon';
import { G, fit, glowing, plane, slab } from './kit';

// flrnoh fork (see FORK.md "The cinema"): the classic front of the cinema: a canopy out over the
// entrance with a lit board on its three sides (what's on now and next, live from the programme),
// rows of bulbs round it and under it that chase each other at night, and the tall KINO sign up the
// corner of the front, bulbs and all.

export interface Marquee {
  /** What the boards say: the film on now (or next, in the break) and the one after. */
  setTitles(now: string, next: string, at: string): void;
  /** Each frame: the bulbs (chasing at night) and the boards' light; `dark` 0 (day) – 1 (night). */
  update(t: number, dark: number): void;
}

/** How far the canopy reaches out over the forecourt, how wide it is, and how high its underside is. */
const OUT = 4.4;
const HALF = 6;
const UNDER = 3.6;
const BOARD = 1.9;

export function buildMarquee(g: THREE.Group): Marquee {
  const x0 = KINO.maxX;
  const x1 = x0 + OUT;
  const z = ENTRANCE.z;
  const brass = toon('#c9a227');
  const red = toon('#8d1b1b');
  // The canopy: a deep slab with a brass edge, its underside lit; it starts at the wall's face (inside
  // the wall its ends would share a plane with the stucco's).
  slab(g, red, x0 + KT / 2, x1, UNDER, UNDER + 0.45, z - HALF, z + HALF, true);
  slab(g, brass, x0 + KT / 2, x1 + 0.04, UNDER + 0.45, UNDER + 0.55, z - HALF - 0.04, z + HALF + 0.04);
  const under = glowing('#fff1c1');
  plane(g, under, (x0 + x1) / 2, UNDER - 0.01, z, OUT - 0.2, 2 * HALF - 0.2, 0).rotation.x = Math.PI / 2;

  // The boards: the front, and the two sides, each a lit panel with black letters in a frame.
  const front = new Board(1024, 256);
  const side = new Board(512, 256);
  const y = UNDER + 0.55 + BOARD / 2;
  slab(g, red, x1 - 0.25, x1 - 0.05, UNDER + 0.55, UNDER + 0.55 + BOARD + 0.3, z - HALF + 0.4, z + HALF - 0.4);
  plane(g, front.mat, x1 - 0.02, y, z, 2 * HALF - 1.2, BOARD - 0.25, Math.PI / 2);
  const sideW = OUT - 0.6;
  for (const s of [-1, 1]) {
    slab(g, red, x0 + 0.3, x1 - 0.25, UNDER + 0.55, UNDER + 0.55 + BOARD + 0.3, z + s * (HALF - 0.4) - 0.1, z + s * (HALF - 0.4) + 0.1);
    plane(g, side.mat, x0 + 0.3 + sideW / 2, y, z + s * (HALF - 0.4) + s * 0.11, sideW - 0.2, BOARD - 0.25, s > 0 ? 0 : Math.PI);
  }
  // A crest on top: KINO in red neon on a brass bar.
  const crest = canvasTexture(512, 128, (c) => {
    c.fillStyle = '#1a0d0d';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#ff3b3b';
    c.textAlign = 'center';
    c.shadowColor = '#ff6b6b';
    c.shadowBlur = 18;
    fit(c, 'LICHTSPIELE', 256, 92, 470, 84);
  });
  const crestMat = glowing('#ffffff', crest);
  slab(g, brass, x1 - 0.3, x1 - 0.1, UNDER + 0.85 + BOARD, UNDER + 1.75 + BOARD, z - 3.2, z + 3.2);
  plane(g, crestMat, x1 - 0.08, UNDER + 1.3 + BOARD, z, 6.2, 0.8, Math.PI / 2);

  // The tall sign up the corner: K I N O, one above the other, on both its faces.
  const bladeZ = KINO.maxZ - 4.5;
  const bladeMat = glowing('#ffffff', canvasTexture(128, 512, (c) => {
    c.fillStyle = '#7a0f14';
    c.fillRect(0, 0, 128, 512);
    c.strokeStyle = '#c9a227';
    c.lineWidth = 8;
    c.strokeRect(6, 6, 116, 500);
    c.fillStyle = '#fff6d6';
    c.textAlign = 'center';
    c.font = '900 104px Nunito, ui-rounded, system-ui, sans-serif';
    'KINO'.split('').forEach((ch, i) => c.fillText(ch, 64, 108 + i * 120));
  }));
  slab(g, red, x0, x0 + 1.5, UNDER + 0.2, FOYER.h + 4.5, bladeZ - 0.2, bladeZ + 0.2, true);
  for (const s of [-1, 1]) plane(g, bladeMat, x0 + 0.85, (UNDER + 0.2 + FOYER.h + 4.5) / 2, bladeZ + s * 0.21, 1.2, FOYER.h + 4.5 - UNDER - 0.6, s > 0 ? 0 : Math.PI);

  // The bulbs: round the canopy's edge, along the front board's top and bottom, up the blade sign.
  const spots: THREE.Vector3[] = [];
  for (let u = -HALF + 0.25; u <= HALF - 0.25; u += 0.5) spots.push(new THREE.Vector3(x1 + 0.05, G + UNDER + 0.22, z + u));
  for (let u = 0.25; u < OUT; u += 0.5) for (const s of [-1, 1]) spots.push(new THREE.Vector3(x1 - u, G + UNDER + 0.22, z + s * (HALF + 0.05)));
  for (let u = -HALF + 0.6; u <= HALF - 0.6; u += 0.45) for (const h of [UNDER + 0.62, UNDER + 0.48 + BOARD + 0.3]) spots.push(new THREE.Vector3(x1 + 0.02, G + h, z + u));
  for (let h = UNDER + 0.5; h < FOYER.h + 4.3; h += 0.42) for (const s of [-1, 1]) spots.push(new THREE.Vector3(x0 + 1.52, G + h, bladeZ + s * 0.12));
  // Under the canopy: a grid.
  for (let u = 0.8; u < OUT - 0.4; u += 1.1) for (let v = -HALF + 0.8; v <= HALF - 0.8; v += 1.1) spots.push(new THREE.Vector3(x0 + u, G + UNDER - 0.06, z + v));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), glowing('#ffffff'), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  const warm = new THREE.Color('#ffe08a');
  const dim = new THREE.Color('#6b5a33');
  const c = new THREE.Color();
  for (let i = 0; i < spots.length; i++) bulbs.setColorAt(i, warm);
  bulbs.frustumCulled = false;
  g.add(bulbs);

  let step = -1;
  let lastDark = -1;
  return {
    setTitles(now, next, at) {
      front.draw((c2, w, h) => {
        c2.fillStyle = '#1b1b1b';
        c2.textAlign = 'center';
        c2.font = '800 40px Nunito, ui-rounded, system-ui, sans-serif';
        c2.fillText(at, w / 2, 52);
        fit(c2, now.toUpperCase(), w / 2, 142, w - 60, 86);
        c2.fillStyle = '#8d1b1b';
        fit(c2, `DANACH: ${next.toUpperCase()}`, w / 2, 222, w - 80, 46);
      });
      side.draw((c2, w, h) => {
        c2.fillStyle = '#8d1b1b';
        c2.textAlign = 'center';
        fit(c2, 'JETZT', w / 2, 64, w - 40, 54);
        c2.fillStyle = '#1b1b1b';
        fit(c2, now.toUpperCase(), w / 2, 150, w - 40, 64);
        c2.fillStyle = '#555';
        fit(c2, `danach ${next}`, w / 2, 220, w - 40, 32, 700);
        void h;
      });
    },
    update(t, dark) {
      // By day they're on but plain; at night they chase round, one in three dark at a time.
      const chase = dark > 0.3;
      const s = chase ? Math.floor(t * 7) : -2;
      if (s === step && Math.abs(dark - lastDark) < 0.02) return;
      step = s;
      lastDark = dark;
      for (let i = 0; i < spots.length; i++) {
        const on = !chase || (i + s) % 3 !== 0;
        c.copy(on ? warm : dim).multiplyScalar(on ? 0.75 + 0.35 * dark : 1);
        bulbs.setColorAt(i, c);
      }
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
      under.color.setScalar(0.75 + 0.25 * dark);
      front.mat.color.setScalar(0.8 + 0.2 * dark);
      side.mat.color.setScalar(0.8 + 0.2 * dark);
    },
  };
}

/** A lit letter board: white, a thin frame, redrawn when what's on changes. */
class Board {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;

  constructor(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = glowing('#ffffff', this.tex);
  }

  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const { width: w, height: h } = this.canvas;
    g.fillStyle = '#fbf7ea';
    g.fillRect(0, 0, w, h);
    // The rails the letters hang on.
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = h / 4; y < h; y += h / 4) g.fillRect(0, y, w, 3);
    fn(g, w, h);
    this.tex.needsUpdate = true;
  }
}

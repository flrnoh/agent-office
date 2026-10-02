import * as THREE from 'three';
import type { FloorPalette } from '../../../../shared/floors';
import type { CeilingFinish, FloorFinish } from '../../../../shared/interiors';
import { mulberry32 } from '../../../../shared/rng';

// flrnoh fork (see FORK.md, "Each storey its own interior"): what a floor's laid with and what's over
// its head, painted onto the canvases the office already has: the planks' (512 px for 6 m, see
// floorTexture) and the ceiling tiles' (128 px for 1.2 m, see stack.ts). Every pattern repeats
// seamlessly at its canvas's edges.

type Ctx2D = CanvasRenderingContext2D;

/** Specks of `colors`, `n` of them up to `size` px, the same every time for `seed`. */
function specks(g: Ctx2D, n: number, size: number, colors: readonly string[], seed: number, w = 512, h = 512) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = 1 + rnd() * size;
    g.fillRect(rnd() * w, rnd() * h, s, s * (0.6 + rnd() * 0.8));
  }
}

/** The planks as they always were. */
function planks(g: Ctx2D, p: FloorPalette) {
  g.fillStyle = p.floor;
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 3; col++) {
      const x = col * 256 + offset;
      g.fillStyle = (row + col) % 3 === 0 ? p.floorAlt : p.floor;
      g.fillRect(x + 2, row * 64 + 2, 252, 60);
    }
    g.fillStyle = p.seam;
    g.fillRect(0, row * 64, 512, 3);
  }
}

/** Parquet in a zigzag: columns of short boards, every other column slanting the other way. */
function herringbone(g: Ctx2D, p: FloorPalette) {
  g.fillStyle = p.seam;
  g.fillRect(0, 0, 512, 512);
  const C = 64; // a column's width
  const S = 32; // a board's height, up the column
  for (let col = 0; col < 512 / C; col++) {
    const x0 = col * C;
    const dir = col % 2 ? 1 : -1;
    for (let k = -3; k < 512 / S + 3; k++) {
      const y = k * S;
      g.fillStyle = (k + col * 3) % 4 === 0 ? p.floorAlt : (k + col) % 5 === 0 ? shade(p.floor, -0.06) : p.floor;
      g.beginPath();
      // A board from one side of the column to the other, rising (or falling) its width.
      g.moveTo(x0 + 1, y + 1);
      g.lineTo(x0 + C - 1, y + 1 + dir * C * 0.5);
      g.lineTo(x0 + C - 1, y + S - 1 + dir * C * 0.5);
      g.lineTo(x0 + 1, y + S - 1);
      g.closePath();
      g.fill();
    }
  }
}

/** Polished concrete: mottled, specked, and cut into big slabs. */
function concrete(g: Ctx2D, p: FloorPalette) {
  g.fillStyle = p.floor;
  g.fillRect(0, 0, 512, 512);
  // Cloudy patches, each one wrapped round so the edges still meet.
  const rnd = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 30 + rnd() * 70;
    for (const [dx, dy] of [[0, 0], [-512, 0], [512, 0], [0, -512], [0, 512]]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, i % 2 ? `${p.floorAlt}cc` : `${shade(p.floor, 0.05)}aa`);
      grad.addColorStop(1, `${p.floor}00`);
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  specks(g, 900, 2.2, [shade(p.floor, -0.12), shade(p.floor, 0.1), p.seam], 11);
  // Saw cuts every 3 m.
  g.fillStyle = p.seam;
  g.fillRect(0, 0, 512, 2);
  g.fillRect(0, 256, 512, 2);
  g.fillRect(0, 0, 2, 512);
  g.fillRect(256, 0, 2, 512);
}

/** Tatami: mats twice as long as wide, in pairs that turn every block, edged in black cloth. */
function tatami(g: Ctx2D, p: FloorPalette) {
  g.fillStyle = p.seam;
  g.fillRect(0, 0, 512, 512);
  const mat = (x: number, y: number, w: number, h: number, alt: boolean) => {
    g.fillStyle = alt ? p.floorAlt : p.floor;
    g.fillRect(x + 3, y + 3, w - 6, h - 6);
    // The rush's weave, along the mat.
    g.fillStyle = shade(alt ? p.floorAlt : p.floor, -0.07);
    if (w > h) for (let yy = y + 6; yy < y + h - 4; yy += 4) g.fillRect(x + 4, yy, w - 8, 1);
    else for (let xx = x + 6; xx < x + w - 4; xx += 4) g.fillRect(xx, y + 4, 1, h - 8);
  };
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const x = bx * 256;
      const y = by * 256;
      if ((bx + by) % 2 === 0) {
        mat(x, y, 128, 256, false);
        mat(x + 128, y, 128, 256, true);
      } else {
        mat(x, y, 256, 128, true);
        mat(x, y + 128, 256, 128, false);
      }
    }
  }
}

/** Carpet tiles, the pile of every other one running the other way. */
function carpet(g: Ctx2D, p: FloorPalette) {
  const T = 64;
  for (let y = 0; y < 512; y += T) {
    for (let x = 0; x < 512; x += T) {
      const turned = (x / T + y / T) % 2 === 1;
      g.fillStyle = turned ? p.floorAlt : p.floor;
      g.fillRect(x, y, T, T);
      g.fillStyle = shade(turned ? p.floorAlt : p.floor, -0.06);
      for (let i = 3; i < T; i += 5) {
        if (turned) g.fillRect(x + i, y, 1, T);
        else g.fillRect(x, y + i, T, 1);
      }
      g.fillStyle = p.seam;
      g.fillRect(x, y, T, 1);
      g.fillRect(x, y, 1, T);
    }
  }
  specks(g, 500, 1.6, [shade(p.floor, 0.12), shade(p.floor, -0.15)], 23);
}

/** A dark poured floor with a faint glowing grid. */
function epoxy(g: Ctx2D, p: FloorPalette) {
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, p.floor);
  grad.addColorStop(0.5, p.floorAlt);
  grad.addColorStop(1, p.floor);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  specks(g, 300, 1.5, [shade(p.floor, 0.18)], 31);
  g.fillStyle = p.seam;
  for (let i = 0; i < 512; i += 128) {
    g.fillRect(i, 0, 2, 512);
    g.fillRect(0, i, 512, 2);
  }
}

/** Paints a floor's canvas (512 px square, 6 m) in its finish and its colors. */
export function paintFloorFinish(c: HTMLCanvasElement, p: FloorPalette, finish: FloorFinish) {
  const g = c.getContext('2d')!;
  g.save();
  const paint = { planks, herringbone, concrete, tatami, carpet, epoxy }[finish];
  paint(g, p);
  g.restore();
}

/** Paints the ceiling's canvas (128 px square, one 1.2 m tile) in its finish. */
export function paintCeiling(c: HTMLCanvasElement, finish: CeilingFinish) {
  const g = c.getContext('2d')!;
  const fill = (color: string) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
  };
  switch (finish) {
    case 'tiles':
      // As stack.ts first paints them.
      fill('#fbf7ef');
      g.fillStyle = '#e3dccf';
      g.fillRect(0, 0, 128, 5);
      g.fillRect(0, 0, 5, 128);
      g.fillStyle = '#efe8dc';
      for (let i = 0; i < 40; i++) g.fillRect(8 + ((i * 53) % 116), 8 + ((i * 97) % 116), 3, 2);
      break;
    case 'concrete':
      fill('#b9bcc1');
      specks(g, 120, 2, ['#a7abb1', '#c6c9cd', '#9ea2a8'], 41, 128, 128);
      // The formwork's seams and its tie holes.
      g.fillStyle = '#9da1a7';
      g.fillRect(0, 0, 128, 2);
      g.fillStyle = '#8c9096';
      for (const [x, y] of [[32, 32], [96, 32], [32, 96], [96, 96]]) g.fillRect(x - 2, y - 2, 4, 4);
      break;
    case 'boards':
      fill('#e6d3b3');
      for (let y = 0; y < 128; y += 32) {
        g.fillStyle = (y / 32) % 2 ? '#dcc6a1' : '#e9d8ba';
        g.fillRect(0, y + 2, 128, 29);
        g.fillStyle = '#c5ab82';
        g.fillRect(0, y, 128, 2);
      }
      break;
    case 'stucco':
      fill('#fdfcf8');
      specks(g, 60, 1.5, ['#f3f0e8'], 43, 128, 128);
      break;
    case 'dark':
      fill('#15161f');
      g.fillStyle = '#1d1f2c';
      g.fillRect(0, 0, 128, 3);
      g.fillRect(0, 0, 3, 128);
      break;
  }
}

/** `hex` a little lighter (`by` > 0) or darker. */
export function shade(hex: string, by: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + by)));
  return `#${c.getHexString()}`;
}

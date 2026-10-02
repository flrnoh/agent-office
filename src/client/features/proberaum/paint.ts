import * as THREE from 'three';

/*
 * The rehearsal wing's surfaces, drawn once onto canvases from fixed seeds (flrnoh fork, see FORK.md
 * "The rehearsal wing"): egg-crate and pyramid foam, Persian carpets for walls and floors, bare
 * brick, the corridor's speckled rubber floor, the studio's oak, absorber fabric. Posters, stickers,
 * flyers and the machines' fronts are posters.ts; the boards that change are boards.ts.
 */

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** A canvas texture, drawn once. `repeat` tiles it. */
export function canvasTex(w: number, h: number, draw: Draw, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** A seeded random number in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Handwriting, for whatever's written with a marker or a pen. */
export const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Bradley Hand", cursive';
/** Print, bold and condensed, for signs and posters. */
export const BOLD = '"Impact", "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
export const SANS = 'Nunito, "Helvetica Neue", Arial, sans-serif';

/** Egg-crate foam (`pyramid` the sharper studio/metal kind) in `base`, tiled 0.5 m a tile. */
export function foamTexture(base: string, pyramid: boolean): THREE.CanvasTexture {
  const c = new THREE.Color(base);
  const shade = (k: number) => `#${c.clone().multiplyScalar(k).getHexString()}`;
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = shade(0.75);
    g.fillRect(0, 0, w, w);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = i * s;
        const y = j * s;
        if (pyramid) {
          // Four faces lit from the top left: light, mid, dark, mid.
          const cx = x + s / 2;
          const cy = y + s / 2;
          const face = (pts: number[], k: number) => {
            g.fillStyle = shade(k);
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(pts[0], pts[1]);
            g.lineTo(pts[2], pts[3]);
            g.closePath();
            g.fill();
          };
          face([x, y, x + s, y], 1.25);
          face([x, y, x, y + s], 1.05);
          face([x + s, y, x + s, y + s], 0.7);
          face([x, y + s, x + s, y + s], 0.55);
        } else {
          // Round bumps, staggered every other one.
          const bx = x + s / 2 + ((j % 2) * s) / 2;
          for (const ox of [bx, bx - s]) {
            const gr = g.createRadialGradient(ox - s * 0.12, y + s * 0.35, s * 0.05, ox, y + s / 2, s * 0.55);
            gr.addColorStop(0, shade(1.3));
            gr.addColorStop(0.55, shade(0.95));
            gr.addColorStop(1, shade(0.6));
            g.fillStyle = gr;
            g.beginPath();
            g.ellipse(ox, y + s / 2, s * 0.48, s * 0.46, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
  });
}

const RUG_PALETTES = [
  ['#7a1f1f', '#1f2f5a', '#e8d8b0', '#c98a2b', '#3d1414'],
  ['#203a5c', '#8c2a2a', '#efe1c0', '#2f6b5a', '#0f1d30'],
  ['#5c2a5a', '#c7862d', '#f2e3c4', '#2c5c6e', '#2a1328'],
  ['#9b3b1e', '#24434f', '#ecd9a8', '#6b8a3a', '#3a1a0e'],
] as const;

/** A Persian carpet, `seed` picking its colours and motifs: a border round a field with a medallion. */
export function carpetTexture(seed: number, w = 512, h = 768): THREE.CanvasTexture {
  const r = rng(seed);
  const [field, border, light, accent, dark] = RUG_PALETTES[seed % RUG_PALETTES.length];
  return canvasTex(w, h, (g) => {
    g.fillStyle = dark;
    g.fillRect(0, 0, w, h);
    const b = w * 0.11;
    g.fillStyle = border;
    g.fillRect(b * 0.25, b * 0.25, w - b * 0.5, h - b * 0.5);
    // The border's running motif.
    g.fillStyle = light;
    for (let x = b * 0.6; x < w - b * 0.5; x += b * 0.7) for (const y of [b * 0.62, h - b * 0.62]) diamond(g, x, y, b * 0.22);
    for (let y = b * 1.3; y < h - b; y += b * 0.7) for (const x of [b * 0.62, w - b * 0.62]) diamond(g, x, y, b * 0.22);
    g.fillStyle = field;
    g.fillRect(b, b, w - b * 2, h - b * 2);
    // A small all-over pattern on the field.
    g.fillStyle = accent;
    g.globalAlpha = 0.55;
    const step = w * 0.09;
    for (let x = b + step / 2; x < w - b; x += step) for (let y = b + step / 2; y < h - b; y += step) if (r() < 0.8) flower(g, x, y, step * 0.22);
    g.globalAlpha = 1;
    // The medallion.
    const cx = w / 2;
    const cy = h / 2;
    for (const [k, col] of [
      [0.36, light],
      [0.3, border],
      [0.22, accent],
      [0.12, dark],
      [0.06, light],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(cx, cy - h * k * 0.75);
      g.lineTo(cx + w * k, cy);
      g.lineTo(cx, cy + h * k * 0.75);
      g.lineTo(cx - w * k, cy);
      g.closePath();
      g.fill();
    }
    // Corner pieces, and a worn patch or two.
    g.fillStyle = light;
    for (const [x, y] of [
      [b, b],
      [w - b, b],
      [b, h - b],
      [w - b, h - b],
    ])
      flower(g, x + (x < cx ? b * 0.6 : -b * 0.6), y + (y < cy ? b * 0.6 : -b * 0.6), b * 0.35);
    g.fillStyle = 'rgba(255,240,210,0.08)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(r() * w, r() * h, w * (0.05 + r() * 0.1), h * (0.03 + r() * 0.06), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Fringes.
    g.strokeStyle = '#e9dfc6';
    g.lineWidth = 2;
    for (let x = 4; x < w; x += 6)
      for (const y of [0, h]) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y + (y ? -b * 0.22 : b * 0.22));
        g.stroke();
      }
  });
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s, y);
  g.lineTo(x, y + s);
  g.lineTo(x - s, y);
  g.closePath();
  g.fill();
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.45, s * 0.25, a, 0, Math.PI * 2);
    g.fill();
  }
}

/** Old brick, dark, for the Metal-Keller, tiled 1 m a tile. */
export function brickTexture(): THREE.CanvasTexture {
  const r = rng(66);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2a2624';
    g.fillRect(0, 0, w, h);
    const bh = h / 8;
    const bw = w / 4;
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 5; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const k = 0.55 + r() * 0.35;
        g.fillStyle = `rgb(${Math.round(120 * k)},${Math.round(52 * k)},${Math.round(40 * k)})`;
        g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x + 3, row * bh + bh - 9, bw - 6, 6);
      }
  });
}

/** The corridor's rubber floor: grey with flecks, a yellow line along it. */
export function rubberTexture(): THREE.CanvasTexture {
  const r = rng(12);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4b4f55';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = ['#6b7079', '#353840', '#8a8f98', '#5c4b3c'][Math.floor(r() * 4)];
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(r() * w, r() * h, 12 + r() * 30, 6 + r() * 14, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Old linoleum tiles in a checkerboard, worn and scuffed, 1 m a tile of four. */
export function checkerTexture(a = '#7a2e22', b = '#d8cfbd'): THREE.CanvasTexture {
  const r = rng(44);
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? a : b;
        g.fillRect((i * w) / 4, (j * h) / 4, w / 4, h / 4);
      }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r() < 0.6 ? '30,20,10' : '255,250,240'},${0.04 + r() * 0.08})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 1 + r() * 9, 1 + r() * 4, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  });
}

/** Acoustic ceiling tiles: a grid of pale panels with pinholes, 1.2 m a tile. */
export function ceilingTiles(base = '#d8d4cb'): THREE.CanvasTexture {
  const r = rng(5);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 300; i++) g.fillRect(r() * w, r() * h, 1.5, 1.5);
    g.fillStyle = '#9a968e';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, 0, 3, h);
  });
}

/** Oak planks, for the studio's live room, tiled 2 m a tile. */
export function oakTexture(): THREE.CanvasTexture {
  const r = rng(31);
  return canvasTex(256, 256, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const k = 0.85 + r() * 0.25;
      g.fillStyle = `rgb(${Math.round(176 * k)},${Math.round(128 * k)},${Math.round(80 * k)})`;
      g.fillRect(0, (i * h) / n, w, h / n);
      g.strokeStyle = 'rgba(70,40,20,0.25)';
      g.lineWidth = 1;
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        const y = (i * h) / n + 4 + r() * (h / n - 8);
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.6, y + (r() - 0.5) * 6, w, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,20,10,0.5)';
      g.fillRect(0, ((i + 1) * h) / n - 1.5, w, 1.5);
      const cut = r() * w;
      g.fillRect(cut, (i * h) / n, 1.5, h / n);
    }
  });
}

/** Absorber fabric in `color`, a fine weave. */
export function fabricTexture(color: string): THREE.CanvasTexture {
  const r = rng(color.length * 977);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.05})`;
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
      g.fillRect(x, 0, 1, h);
    }
  });
}

/** Plain painted wall with grime near the floor and scuffs, tiled per 2 m. */
export function wallTexture(base: string, seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 30, 3 + r() * 10, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(30,30,30,0.18)';
    for (let i = 0; i < 14; i++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const x = r() * w;
      const y = h * (0.6 + r() * 0.4);
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8);
      g.stroke();
    }
  });
}

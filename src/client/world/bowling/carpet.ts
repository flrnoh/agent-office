import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { RETRO } from './signs';

/*
 * The bowling centre's carpet (flrnoh fork, see FORK.md "The bowling centre"): the classic 90s alley
 * carpet, drawn once: a deep navy ground thick with neon squiggles, triangles, rings, zigzags, stars
 * and confetti. Two canvases from the same shapes: the colours (`map`), and the shapes alone on black
 * (`glow`, the emissive map), which is what lights up under the UV tubes in cosmic bowling.
 */

const SIZE = 512;
const NEON = [RETRO.aqua, '#ff3fb4', '#ffe14d', '#9d5cff', '#7dff5c', '#ff8a3d'];

type Draw = (g: CanvasRenderingContext2D, color: string) => void;

function shapes(): { draw: Draw; color: string }[] {
  const r = mulberry32(19960301);
  const out: { draw: Draw; color: string }[] = [];
  const at = () => [r() * SIZE, r() * SIZE] as const;
  const color = () => NEON[Math.floor(r() * NEON.length)];
  // Each shape is drawn nine times round its spot, so the tile repeats without a seam.
  const tiled = (fn: (g: CanvasRenderingContext2D, x: number, y: number) => void): Draw => (g, c) => {
    g.strokeStyle = c;
    g.fillStyle = c;
    for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) fn(g, dx, dy);
  };
  for (let i = 0; i < 26; i++) {
    const [x, y] = at();
    const len = 50 + r() * 70;
    const rot = r() * Math.PI;
    const amp = 8 + r() * 10;
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.save();
        g.translate(x + dx, y + dy);
        g.rotate(rot);
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-len / 2, 0);
        for (let k = 1; k <= 4; k++) g.quadraticCurveTo(-len / 2 + (k - 0.5) * (len / 4), (k % 2 ? -1 : 1) * amp, -len / 2 + k * (len / 4), 0);
        g.stroke();
        g.restore();
      }),
    });
  }
  for (let i = 0; i < 18; i++) {
    const [x, y] = at();
    const s = 14 + r() * 18;
    const rot = r() * Math.PI * 2;
    const filled = r() < 0.4;
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.save();
        g.translate(x + dx, y + dy);
        g.rotate(rot);
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, -s);
        g.lineTo(s * 0.87, s * 0.5);
        g.lineTo(-s * 0.87, s * 0.5);
        g.closePath();
        if (filled) g.fill();
        else g.stroke();
        g.restore();
      }),
    });
  }
  for (let i = 0; i < 22; i++) {
    const [x, y] = at();
    const s = 7 + r() * 14;
    const ring = r() < 0.6;
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x + dx, y + dy, s, 0, Math.PI * 2);
        if (ring) g.stroke();
        else g.fill();
      }),
    });
  }
  for (let i = 0; i < 10; i++) {
    const [x, y] = at();
    const rot = r() * Math.PI;
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.save();
        g.translate(x + dx, y + dy);
        g.rotate(rot);
        g.lineWidth = 5;
        g.lineJoin = 'miter';
        g.beginPath();
        for (let k = 0; k <= 6; k++) g.lineTo(-36 + k * 12, k % 2 ? -9 : 9);
        g.stroke();
        g.restore();
      }),
    });
  }
  for (let i = 0; i < 16; i++) {
    const [x, y] = at();
    const s = 6 + r() * 8;
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const rr = k % 2 ? s * 0.35 : s;
          g.lineTo(x + dx + Math.cos(a) * rr, y + dy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }),
    });
  }
  for (let i = 0; i < 140; i++) {
    const [x, y] = at();
    out.push({
      color: color(),
      draw: tiled((g, dx, dy) => {
        g.fillRect(x + dx, y + dy, 3, 3);
      }),
    });
  }
  return out;
}

export interface CarpetTextures {
  map: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
}

/** The carpet's colours and its glow, `repeat` tiles across. */
export function carpetTextures(): CarpetTextures {
  const list = shapes();
  const paint = (ground: string, dim: number) => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d')!;
    g.fillStyle = ground;
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalAlpha = dim;
    for (const s of list) s.draw(g, s.color);
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { map: paint('#17143a', 0.85), glow: paint('#000000', 1) };
}

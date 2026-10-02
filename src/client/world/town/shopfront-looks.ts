import * as THREE from 'three';
import type { ShopKind } from '../../../shared/shops';
import { frontStyle, type FrontStyle } from '../../../shared/shopfronts';
import { canvasTexture, tilingCanvasTexture } from '../texture';

// flrnoh fork (see FORK.md "Shop fronts"): the pictures the shop fronts are made of (town/shopfronts.ts
// puts them up): the cladding round each kind's windows, its sign as a board, a lightbox or neon
// letters, the roller shutters, the house numbers and the sandwich boards' chalk. Each drawn once.

/** One tile of cladding is this many meters square. */
export const CLAD_TILE = 0.5;

/** The cladding round a kind's windows, tinted its own way (shared/shopfronts.ts). */
export function claddingTexture(k: ShopKind, style: FrontStyle = frontStyle(k.id)): THREE.CanvasTexture {
  // A kind without a row of its own: plaster in its own frame's color.
  const base = style === frontStyle('') ? k.frame : style.facadeColor;
  const c = new THREE.Color(base);
  const shade = (f: number) => `#${c.clone().multiplyScalar(f).getHexString()}`;
  return tilingCanvasTexture(64, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 64);
    switch (style.facade) {
      case 'wood':
        // Upright boards, with a groove between and a little grain.
        for (let x = 0; x < 64; x += 16) {
          g.fillStyle = shade(0.72);
          g.fillRect(x, 0, 2, 64);
          g.fillStyle = shade(1.12);
          g.fillRect(x + 2, 0, 1, 64);
          g.fillStyle = shade(0.9);
          for (let y = 4; y < 64; y += 11) g.fillRect(x + 5 + ((x + y) % 7), y, 1, 6);
        }
        break;
      case 'tiles':
        g.fillStyle = shade(0.82);
        for (let i = 0; i < 64; i += 16) {
          g.fillRect(i, 0, 1.5, 64);
          g.fillRect(0, i, 64, 1.5);
        }
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let x = 0; x < 64; x += 16) for (let y = 0; y < 64; y += 16) g.fillRect(x + 3, y + 3, 4, 2);
        break;
      case 'brick':
        g.fillStyle = shade(0.7);
        for (let row = 0; row < 8; row++) {
          g.fillRect(0, row * 8, 64, 1.5);
          for (let x = (row % 2) * 8; x < 64; x += 16) g.fillRect(x, row * 8, 1.5, 8);
        }
        break;
      case 'dark':
        g.fillStyle = shade(1.35);
        g.fillRect(0, 31, 64, 1);
        g.fillRect(31, 0, 1, 64);
        break;
      case 'colorful': {
        const cols = k.goods.length ? k.goods : [k.frame];
        cols.forEach((col, i) => {
          g.fillStyle = col;
          g.fillRect((i * 64) / cols.length, 0, 64 / cols.length + 1, 64);
        });
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let y = 8; y < 64; y += 16) for (let x = 8; x < 64; x += 16) g.fillRect(x - 2, y - 2, 4, 4);
        break;
      }
      case 'plaster':
        for (let i = 0; i < 60; i++) {
          g.fillStyle = i % 2 ? shade(0.93) : shade(1.06);
          g.fillRect((i * 37) % 64, (i * 23) % 64, 2, 2);
        }
        break;
    }
  });
}

/** The sign over the door: a painted board or a lightbox (its name on its own ground), or neon letters on nothing. */
export function signTexture(k: ShopKind, neon: boolean): THREE.CanvasTexture {
  return canvasTexture(512, 96, (g) => {
    if (!neon) {
      g.fillStyle = k.signBg;
      g.fillRect(0, 0, 512, 96);
      g.strokeStyle = k.ink;
      g.lineWidth = 6;
      g.strokeRect(6, 6, 500, 84);
    }
    let size = 58;
    const font = () => `bold ${size}px ${neon ? '"Trebuchet MS", system-ui, sans-serif' : 'system-ui, sans-serif'}`;
    g.font = font();
    while (g.measureText(k.sign).width > 470 && size > 30) {
      size -= 2;
      g.font = font();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (neon) {
      // A tube in the ink's color with a white-hot core, glowing round it.
      g.shadowColor = k.ink;
      g.shadowBlur = 18;
      g.strokeStyle = k.ink;
      g.lineWidth = 7;
      g.strokeText(k.sign, 256, 52);
      g.shadowBlur = 6;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.strokeText(k.sign, 256, 52);
      return;
    }
    g.fillStyle = k.ink;
    g.fillText(k.sign, 256, 52);
  });
}

/** Ribbed metal, a slat every few centimeters: the roller shutters. */
export function shutterTexture(): THREE.CanvasTexture {
  return tilingCanvasTexture(32, 32, (g) => {
    g.fillStyle = '#a7adb3';
    g.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 32; y += 8) {
      g.fillStyle = '#7d848b';
      g.fillRect(0, y, 32, 2);
      g.fillStyle = '#c4c9ce';
      g.fillRect(0, y + 2, 32, 1);
    }
  });
}

/** Blue enamel plates with white numbers 1…n, in a grid of `cols` by `cols` (see numberUV). */
export function numberAtlas(n: number): { tex: THREE.CanvasTexture; cols: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cell = 64;
  const tex = canvasTexture(cols * cell, cols * cell, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * cell;
      g.fillStyle = '#1d3d8f';
      g.fillRect(x + 2, y + 8, cell - 4, cell - 16);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.strokeRect(x + 6, y + 12, cell - 12, cell - 24);
      g.fillStyle = '#ffffff';
      g.font = `bold ${i + 1 > 99 ? 22 : 28}px system-ui, sans-serif`;
      g.fillText(String(i + 1), x + cell / 2, y + cell / 2 + 1);
    }
  });
  return { tex, cols };
}

/** A sandwich board's slate: two lines of chalk. */
export function chalkTexture(lines: [string, string]): THREE.CanvasTexture {
  return canvasTexture(128, 160, (g) => {
    g.fillStyle = '#2b2f2e';
    g.fillRect(0, 0, 128, 160);
    g.strokeStyle = '#8a6a48';
    g.lineWidth = 10;
    g.strokeRect(0, 0, 128, 160);
    g.fillStyle = '#f1efe6';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      let size = 20;
      g.font = `italic ${size}px "Comic Sans MS", "Chalkboard", cursive`;
      while (g.measureText(l).width > 108 && size > 10) g.font = `italic ${(size -= 1)}px "Comic Sans MS", "Chalkboard", cursive`;
      g.fillText(l, 64, 52 + i * 52);
    });
    g.strokeStyle = 'rgba(241,239,230,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(30, 80);
    g.lineTo(98, 80);
    g.stroke();
  });
}

import * as THREE from 'three';
import type { RecordDef } from '../../shared/records';
import { canvasTexture } from './texture';

// The record shop's sleeves (flrnoh fork, see FORK.md "Shops to walk into"): each record's cover,
// drawn from what shared/records.ts says about it (its colors, its kind of art, its band and title),
// so everyone sees the same one. Drawn once per record and kept: there are only a dozen.

const cache = new Map<string, { tex: THREE.CanvasTexture; url: string }>();

/** Draws `r`'s cover on a `S`-pixel square. */
export function drawSleeve(g: CanvasRenderingContext2D, r: RecordDef, S: number) {
  g.fillStyle = r.sleeve;
  g.fillRect(0, 0, S, S);
  g.fillStyle = r.ink;
  g.strokeStyle = r.ink;
  const c = S / 2;
  switch (r.art) {
    case 0:
      g.lineWidth = S * 0.025;
      for (let k = 1; k <= 6; k++) {
        g.beginPath();
        g.arc(c, c * 0.95, k * S * 0.06, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    case 1:
      for (let k = 0; k < 7; k++) g.fillRect(0, S * 0.12 + k * S * 0.1, S, S * 0.04);
      break;
    case 2:
      g.beginPath();
      g.arc(c, S * 0.62, S * 0.26, Math.PI, 0);
      g.fill();
      for (let k = 0; k < 4; k++) g.fillRect(S * 0.15, S * 0.66 + k * S * 0.05, S * 0.7, S * 0.018);
      break;
    case 3:
      g.lineWidth = S * 0.012;
      for (let k = 0; k <= 8; k++) {
        g.beginPath();
        g.moveTo(S * 0.1 + k * S * 0.1, S * 0.1);
        g.lineTo(S * 0.1 + k * S * 0.1, S * 0.8);
        g.moveTo(S * 0.1, S * 0.1 + k * S * 0.0875);
        g.lineTo(S * 0.9, S * 0.1 + k * S * 0.0875);
        g.stroke();
      }
      break;
    case 4:
      g.lineWidth = S * 0.03;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        for (let x = 0; x <= S; x += S / 32) g.lineTo(x, S * 0.2 + k * S * 0.13 + Math.sin((x / S) * Math.PI * 4 + k) * S * 0.04);
        g.stroke();
      }
      break;
    default:
      g.font = `900 ${S * 0.62}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(r.band.replace(/^(Die|The) /, '')[0], c, S * 0.46);
  }
  // The band and the title along the bottom.
  g.fillStyle = r.sleeve;
  g.fillRect(0, S * 0.8, S, S * 0.2);
  g.fillStyle = r.ink;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `800 ${S * 0.085}px system-ui, sans-serif`;
  g.fillText(r.band.toUpperCase(), S * 0.06, S * 0.89, S * 0.88);
  g.font = `500 ${S * 0.065}px system-ui, sans-serif`;
  g.fillText(r.title, S * 0.06, S * 0.965, S * 0.88);
}

function made(r: RecordDef) {
  let hit = cache.get(r.id);
  if (!hit) {
    const tex = canvasTexture(256, 256, (g) => drawSleeve(g, r, 256));
    hit = { tex, url: (tex.image as HTMLCanvasElement).toDataURL('image/png') };
    cache.set(r.id, hit);
  }
  return hit;
}

/** `r`'s sleeve as a texture (kept, shared). */
export const sleeveTexture = (r: RecordDef) => made(r).tex;
/** `r`'s sleeve as a picture, for the crate's window. */
export const sleeveUrl = (r: RecordDef) => made(r).url;

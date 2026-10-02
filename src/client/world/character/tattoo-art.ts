import * as THREE from 'three';
import { toonUnique } from '../toon';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): the tattoos' flash sheet. Each motif is
// drawn once on a small canvas (ink lines with a little color, the rest see-through) and shared by
// every character wearing it, so the textures live as long as the page and are never disposed.

const SIZE = 128;
const INK = '#1c2541';

type Draw = (g: CanvasRenderingContext2D) => void;

const line = (g: CanvasRenderingContext2D, w = 6) => {
  g.strokeStyle = INK;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
};

const star = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner: number) => {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
};

const heart = (g: CanvasRenderingContext2D, cx: number, cy: number, s: number) => {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
  g.closePath();
};

const ART: Record<string, Draw> = {
  anchor(g) {
    line(g, 8);
    g.beginPath();
    g.arc(64, 22, 10, 0, Math.PI * 2);
    g.moveTo(64, 32);
    g.lineTo(64, 108);
    g.moveTo(40, 46);
    g.lineTo(88, 46);
    g.moveTo(26, 78);
    g.quadraticCurveTo(34, 108, 64, 108);
    g.quadraticCurveTo(94, 108, 102, 78);
    g.stroke();
    g.fillStyle = INK;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(64 + s * 38, 70);
      g.lineTo(64 + s * 46, 86);
      g.lineTo(64 + s * 30, 82);
      g.closePath();
      g.fill();
    }
  },
  rose(g) {
    g.fillStyle = '#2d9a4b';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(64 + s * 26, 88, 20, 9, s * -0.5, 0, Math.PI * 2);
      g.fill();
    }
    line(g, 5);
    g.beginPath();
    g.moveTo(64, 70);
    g.lineTo(64, 120);
    g.stroke();
    g.fillStyle = '#d62839';
    g.beginPath();
    g.arc(64, 50, 30, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) g.lineTo(64 + Math.cos(a) * a * 1.9, 50 + Math.sin(a) * a * 1.9);
    g.stroke();
  },
  mama(g) {
    g.fillStyle = '#d62839';
    heart(g, 64, 56, 44);
    g.fill();
    line(g, 5);
    g.stroke();
    // The banner across it.
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.moveTo(10, 58);
    g.lineTo(118, 58);
    g.lineTo(110, 70);
    g.lineTo(118, 82);
    g.lineTo(10, 82);
    g.lineTo(18, 70);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    g.font = 'bold 22px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MAMA', 64, 71);
  },
  skull(g) {
    g.fillStyle = '#f4f1e8';
    line(g, 5);
    g.beginPath();
    g.arc(64, 54, 38, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(88, 100);
    g.lineTo(40, 100);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(64 + s * 16, 58, 11, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(64, 70);
    g.lineTo(58, 82);
    g.lineTo(70, 82);
    g.closePath();
    g.fill();
    for (const x of [50, 60, 70, 80]) {
      g.beginPath();
      g.moveTo(x - 2, 90);
      g.lineTo(x - 2, 100);
      g.stroke();
    }
  },
  swallow(g) {
    g.fillStyle = '#2a6fdb';
    line(g, 5);
    g.beginPath();
    g.moveTo(14, 40);
    g.quadraticCurveTo(50, 44, 60, 64);
    g.quadraticCurveTo(80, 50, 116, 30);
    g.quadraticCurveTo(96, 62, 76, 74);
    g.lineTo(104, 112);
    g.lineTo(80, 92);
    g.lineTo(70, 116);
    g.lineTo(62, 82);
    g.quadraticCurveTo(36, 72, 14, 40);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#d62839';
    g.beginPath();
    g.arc(64, 70, 8, 0, Math.PI * 2);
    g.fill();
  },
  tribal(g) {
    // A band that tiles round the arm: pointed flames over and under a middle line.
    g.fillStyle = INK;
    g.fillRect(0, 56, SIZE, 16);
    for (let i = 0; i < 4; i++) {
      const x = i * 32;
      g.beginPath();
      g.moveTo(x, 56);
      g.quadraticCurveTo(x + 18, 40, x + 26, 6);
      g.quadraticCurveTo(x + 24, 34, x + 32, 56);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(x + 16, 72);
      g.quadraticCurveTo(x + 30, 88, x + 38, 122);
      g.quadraticCurveTo(x + 28, 92, x + 12, 72);
      g.closePath();
      g.fill();
    }
  },
  robot(g) {
    line(g, 5);
    g.fillStyle = '#aab4c3';
    g.beginPath();
    g.roundRect(26, 34, 76, 62, 12);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(64, 34);
    g.lineTo(64, 16);
    g.stroke();
    g.fillStyle = '#ef476f';
    g.beginPath();
    g.arc(64, 14, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4cc9f0';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(64 + s * 17, 58, 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.moveTo(46, 80);
    g.lineTo(82, 80);
    g.stroke();
    for (const x of [55, 64, 73]) {
      g.beginPath();
      g.moveTo(x, 76);
      g.lineTo(x, 84);
      g.stroke();
    }
  },
  star(g) {
    line(g, 4);
    g.fillStyle = '#d62839';
    star(g, 64, 66, 54, 22);
    g.fill();
    // Every other point's half in ink: the sailor's star.
    g.fillStyle = INK;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      g.beginPath();
      g.moveTo(64, 66);
      g.lineTo(64 + Math.cos(a) * 54, 66 + Math.sin(a) * 54);
      g.lineTo(64 + Math.cos(b) * 22, 66 + Math.sin(b) * 22);
      g.closePath();
      g.fill();
    }
    star(g, 64, 66, 54, 22);
    g.stroke();
  },
  coffee(g) {
    line(g, 5);
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.roundRect(28, 52, 56, 58, 8);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(88, 78, 13, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.fillStyle = '#7f4f24';
    g.fillRect(34, 58, 44, 10);
    for (const x of [44, 58, 72]) {
      g.beginPath();
      g.moveTo(x, 44);
      g.bezierCurveTo(x - 8, 34, x + 8, 26, x, 14);
      g.stroke();
    }
  },
};

const materials = new Map<string, THREE.MeshToonMaterial>();

/** The see-through toon material a tattoo of `motif` is drawn with: lit like skin, no outline. */
export function tattooMaterial(motif: string): THREE.MeshToonMaterial {
  const hit = materials.get(motif);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (g) (ART[motif] ?? ART.star)(g);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (motif === 'tribal') tex.wrapS = THREE.RepeatWrapping;
  const m = toonUnique('#ffffff');
  m.map = tex;
  m.transparent = true;
  m.alphaTest = 0.08;
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  m.userData.outlineParameters = { visible: false };
  materials.set(motif, m);
  return m;
}

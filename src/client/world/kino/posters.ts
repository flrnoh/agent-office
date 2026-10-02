import * as THREE from 'three';
import { FILMS, runtime, type Film } from '../../../shared/kino';
import { canvasTexture } from '../texture';
import { fit, wrap } from './kit';

// flrnoh fork (see FORK.md "The cinema"): a poster for every film on the programme, drawn on a canvas
// from its colours and a motif of a few shapes, with its title, year, length and its licence and
// credit along the bottom (the Creative Commons films' credit, as their licence asks).

const W = 512;
const H = 768;
const cache = new Map<string, THREE.CanvasTexture>();

/** Film `i`'s poster (made once). */
export function posterTexture(i: number): THREE.CanvasTexture {
  const f = FILMS[i];
  let t = cache.get(f.id);
  if (!t) {
    t = canvasTexture(W, H, (g) => drawPoster(g, f));
    cache.set(f.id, t);
  }
  return t;
}

function drawPoster(g: CanvasRenderingContext2D, f: Film) {
  const [bg, ink, accent] = f.poster;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, shade(bg, -0.45));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // The motif, in the middle.
  g.save();
  g.translate(W / 2, 330);
  motif(g, f.motif, ink, accent);
  g.restore();
  // A frame.
  g.strokeStyle = accent;
  g.lineWidth = 10;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.textAlign = 'center';
  g.fillStyle = ink;
  // Above: silent or open movie.
  g.font = '800 26px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText(f.silent ? `STUMMFILM · ${f.year}` : `OPEN MOVIE · ${f.year}`, W / 2, 62);
  // The title, big.
  g.font = '900 64px Nunito, ui-rounded, system-ui, sans-serif';
  const lines = wrap(g, f.title.toUpperCase(), W - 70).slice(0, 2);
  lines.forEach((l, k) => fit(g, l, W / 2, 560 + k * 64 - (lines.length - 1) * 32, W - 60, 64));
  if (f.original) {
    g.font = 'italic 700 22px Georgia, serif';
    fit(g, f.original, W / 2, 625, W - 70, 22, 700, 'Georgia, serif');
  }
  g.font = '700 24px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText(`${f.by.split(' (')[0]} · ${runtime(f.seconds)}`, W / 2, 660);
  // The licence, and the credit.
  g.fillStyle = accent;
  g.fillRect(30, 684, W - 60, 56);
  g.fillStyle = shade(bg, -0.6);
  g.font = '800 20px Nunito, ui-rounded, system-ui, sans-serif';
  const credit = wrap(g, f.credit, W - 80).slice(0, 2);
  credit.forEach((l, k) => fit(g, l, W / 2, 707 + k * 24 - (credit.length - 1) * 10, W - 76, 20, 800));
}

/** A colour lighter (+) or darker (−) by `k`. */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return `#${c.getHexString()}`;
}

/** A few shapes for each film, about 300 px across, round (0, 0). */
function motif(g: CanvasRenderingContext2D, m: Film['motif'], ink: string, accent: string) {
  const circle = (x: number, y: number, r: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, rot: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  };
  const poly = (pts: number[], c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  };
  switch (m) {
    case 'bunny':
      circle(0, 40, 110, '#f1f1f1');
      ellipse(-45, -120, 28, 90, -0.15, '#f1f1f1');
      ellipse(45, -120, 28, 90, 0.15, '#f1f1f1');
      ellipse(-45, -120, 12, 60, -0.15, '#f4a6c0');
      ellipse(45, -120, 12, 60, 0.15, '#f4a6c0');
      circle(-38, 20, 12, ink);
      circle(38, 20, 12, ink);
      circle(0, 60, 14, '#f4a6c0');
      circle(150, 150, 34, accent);
      return;
    case 'moon':
      circle(0, 0, 140, '#f6f1d1');
      circle(-50, -40, 18, '#d9d1a3');
      circle(45, 50, 24, '#d9d1a3');
      circle(-30, 30, 10, ink);
      circle(30, 30, 10, ink);
      // The rocket, in its eye.
      poly([60, -40, 170, -110, 150, -60], accent);
      poly([150, -60, 170, -110, 200, -70], '#cfcfcf');
      return;
    case 'dragon':
      poly([-150, 60, -20, -140, 30, -40, 160, -100, 60, 40, 140, 120, -40, 60], accent);
      circle(-10, -20, 14, ink);
      return;
    case 'blossom':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ellipse(Math.cos(a) * 60, Math.sin(a) * 60, 60, 36, a, accent);
      }
      circle(0, 0, 34, '#ffd166');
      circle(-110, 130, 18, accent);
      circle(120, -120, 12, accent);
      return;
    case 'vampire':
      // The shadow on the stair: a long hand, claws and all.
      g.fillStyle = '#000';
      g.fillRect(-160, -170, 320, 340);
      poly([-40, 170, -10, -60, 10, -60, 30, 170], accent);
      for (let i = 0; i < 4; i++) poly([-30 + i * 20, -60, -40 + i * 22, -170, -25 + i * 22, -60], accent);
      return;
    case 'llama':
      ellipse(0, 70, 110, 60, 0, '#fff4e0');
      g.fillStyle = '#fff4e0';
      g.fillRect(50, -110, 40, 180);
      ellipse(80, -120, 48, 30, 0, '#fff4e0');
      poly([60, -150, 66, -190, 76, -148], '#fff4e0');
      circle(92, -126, 7, ink);
      for (const x of [-70, -30, 30, 70]) g.fillRect(x - 9, 110, 18, 70);
      return;
    case 'robot':
      g.fillStyle = '#9aa5b1';
      g.fillRect(-70, -150, 140, 120);
      g.fillRect(-100, -20, 200, 170);
      circle(-30, -95, 18, accent);
      circle(30, -95, 18, accent);
      g.fillStyle = accent;
      g.fillRect(-60, 40, 120, 12);
      return;
    case 'train':
      g.fillStyle = ink;
      g.fillRect(-160, 20, 300, 90);
      g.fillRect(60, -60, 80, 80);
      poly([-160, 110, -200, 150, -160, 150], ink);
      g.fillRect(-120, -40, 40, 60);
      for (const x of [-110, -40, 30, 100]) circle(x, 120, 30, accent);
      circle(-100, -80, 30, '#cfcfcf');
      circle(-70, -120, 22, '#e0e0e0');
      return;
    case 'sheep':
      for (let i = 0; i < 7; i++) circle(Math.cos(i) * 70, Math.sin(i * 1.7) * 40, 60, '#f4f1ea');
      ellipse(110, -10, 40, 30, 0.3, ink);
      for (let i = 0; i < 18; i++) circle(Math.cos(i * 2.1) * 220, Math.sin(i * 1.3) * 160, 4, accent);
      return;
    case 'machine':
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = i === 1 ? accent : ink;
        g.lineWidth = 22;
        g.beginPath();
        g.arc(-60 + i * 60, -40 + (i % 2) * 90, 70, 0, Math.PI * 2);
        g.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          circle(-60 + i * 60 + Math.cos(a) * 88, -40 + (i % 2) * 90 + Math.sin(a) * 88, 12, g.strokeStyle as string);
        }
      }
      return;
    case 'caligari':
      // Crooked houses leaning over a crooked street, and the sleepwalker in black between them.
      poly([-170, 160, -150, -60, -90, -150, -60, 160], accent);
      poly([60, 160, 100, -170, 170, -40, 160, 160], accent);
      poly([-60, 160, -20, -10, 30, -10, 60, 160], shade(ink, -0.3));
      poly([-14, 120, -6, -80, 6, -80, 14, 120], '#111111');
      circle(0, -95, 16, '#111111');
      for (const [x, y] of [[-120, -40], [-110, 40], [120, -80], [128, 20]]) poly([x - 10, y, x + 12, y - 16, x + 8, y + 18], '#f7d488');
      return;
    case 'mushroom':
      ellipse(0, -30, 150, 90, 0, accent);
      for (const [x, y] of [[-70, -60], [10, -80], [80, -40], [-20, -20]]) circle(x, y, 18, '#fefae0');
      g.fillStyle = '#fefae0';
      g.fillRect(-40, 0, 80, 140);
      circle(-15, 60, 8, ink);
      circle(15, 60, 8, ink);
      return;
  }
}

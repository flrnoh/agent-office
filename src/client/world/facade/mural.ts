import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';

// flrnoh fork (see FORK.md, "A facade for creatives"): the murals on the building's blank walls, the
// north and east ones. Each storey's stretch of wall is one painting, 56 px a meter: a story's worth
// of a whole wall (36.6 m by 7.1 m), painted once on a canvas and kept. Four of them, in the office's
// cartoon style (fat ink outlines, flat bright colors): an agent robot with a pencil, a rocket that
// ships it, a big idea, and rainbow waves round a </>. The storeys take turns with them.

const PX = 56;
const W = 2048;
const H = 400;
const INK = '#2b2d42';
const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#8a5cff', '#ff8a5b', '#4cc9f0', '#f72585'];

type G = CanvasRenderingContext2D;

/** A blob of color, wobbly round, with an ink outline. */
function blob(g: G, x: number, y: number, r: number, color: string, rnd: () => number, outline = true) {
  g.beginPath();
  const n = 9;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + rnd() * 0.35);
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8];
  });
  g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[(i + 1) % n];
    g.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  if (outline) {
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.stroke();
  }
}

/** Chunky letters: `text` in `color` with a fat ink outline and a drop shadow, `size` px tall, centered on (x, y), tilted `tilt`. */
function words(g: G, text: string, x: number, y: number, size: number, color: string, tilt = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.font = `900 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.fillStyle = INK;
  g.fillText(text, 7, 9);
  g.lineWidth = size * 0.16;
  g.strokeStyle = INK;
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  // A shine along the top of the letters.
  g.globalAlpha = 0.35;
  g.fillStyle = '#ffffff';
  g.fillText(text, -2, -size * 0.06);
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.fillText(text, 0, size * 0.02);
  g.restore();
}

/** A four-pointed sparkle. */
function sparkle(g: G, x: number, y: number, r: number, color: string) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
}

/** Paint flicked at the wall: a splat and its drops. */
function splat(g: G, x: number, y: number, r: number, color: string, rnd: () => number) {
  blob(g, x, y, r, color, rnd, false);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (1.2 + rnd() * 1.4);
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 3 + rnd() * r * 0.18, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  }
}

/** A wavy line of `color`, `w` px thick, from x0 to x1 round `y`. */
function squiggle(g: G, x0: number, x1: number, y: number, amp: number, w: number, color: string, phase = 0) {
  g.beginPath();
  for (let x = x0; x <= x1; x += 6) {
    const yy = y + Math.sin(x / 38 + phase) * amp;
    if (x === x0) g.moveTo(x, yy);
    else g.lineTo(x, yy);
  }
  g.lineCap = 'round';
  g.lineWidth = w + 8;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = w;
  g.strokeStyle = color;
  g.stroke();
}

/** A field of dots in a grid, `color`, over x0..x1, y0..y1. */
function dots(g: G, x0: number, y0: number, x1: number, y1: number, color: string) {
  g.fillStyle = color;
  for (let y = y0; y < y1; y += 18) for (let x = x0 + ((y / 18) % 2) * 9; x < x1; x += 18) {
    g.beginPath();
    g.arc(x, y, 3.5, 0, Math.PI * 2);
    g.fill();
  }
}

function rounded(g: G, x: number, y: number, w: number, h: number, r: number, fill: string, line = 7) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.stroke();
}

/** The background every mural starts from: a wash of the wall's color, big soft shapes, specks. */
function ground(g: G, rnd: () => number, base: string) {
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) blob(g, rnd() * W, rnd() * H, 90 + rnd() * 120, COLORS[(i * 3) % COLORS.length] + '55', rnd, false);
  dots(g, 1640, 30, 1990, 150, '#ffffff33');
  dots(g, 40, 260, 360, 380, '#ffffff33');
}

/** The agent: a robot with a screen for a face, waving a giant pencil, saying IDEAS. */
function robot(g: G, rnd: () => number) {
  ground(g, rnd, '#22263a');
  squiggle(g, 60, 1980, 330, 18, 26, '#06d6a0');
  squiggle(g, 60, 1980, 70, 12, 14, '#ffd166', 2);
  // The robot.
  const cx = 520;
  rounded(g, cx - 120, 150, 240, 190, 40, '#4cc9f0');
  rounded(g, cx - 150, 40, 300, 150, 46, '#e9ecef');
  rounded(g, cx - 120, 62, 240, 106, 30, '#1b1e2c', 5);
  for (const ex of [-55, 55]) {
    g.beginPath();
    g.arc(cx + ex, 105, 20, 0, Math.PI * 2);
    g.fillStyle = '#7cf29a';
    g.fill();
  }
  g.beginPath();
  g.arc(cx, 128, 34, 0.15 * Math.PI, 0.85 * Math.PI);
  g.lineWidth = 8;
  g.strokeStyle = '#7cf29a';
  g.stroke();
  g.beginPath();
  g.moveTo(cx, 40);
  g.lineTo(cx, 10);
  g.lineWidth = 7;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.arc(cx, 10, 13, 0, Math.PI * 2);
  g.fillStyle = '#ef476f';
  g.fill();
  g.stroke();
  // Its arm up, with a pencil as tall as it is.
  g.save();
  g.translate(cx + 160, 200);
  g.rotate(-0.5);
  rounded(g, -10, -120, 22, 140, 10, '#4cc9f0', 6);
  g.translate(10, -130);
  g.rotate(0.4);
  rounded(g, -26, -230, 52, 200, 6, '#ffd166', 6);
  rounded(g, -26, -250, 52, 30, 8, '#ef476f', 6);
  g.beginPath();
  g.moveTo(-26, -30);
  g.lineTo(26, -30);
  g.lineTo(0, 30);
  g.closePath();
  g.fillStyle = '#f6d7a7';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.moveTo(-8, 10);
  g.lineTo(8, 10);
  g.lineTo(0, 30);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  g.restore();
  words(g, 'IDEAS', 1150, 190, 190, '#ffd166', -0.06);
  words(g, 'welcome, humans & agents', 1150, 330, 54, '#ffffff', -0.03);
  for (let i = 0; i < 9; i++) sparkle(g, 820 + rnd() * 1150, 30 + rnd() * 120, 14 + rnd() * 18, COLORS[i % COLORS.length]);
  splat(g, 1780, 210, 70, '#ef476f', rnd);
  splat(g, 120, 140, 50, '#8a5cff', rnd);
  words(g, '★', 1800, 205, 110, '#ffd166');
}

/** A rocket going up off the wall in a trail of fire and stars: SHIP IT. */
function rocket(g: G, rnd: () => number) {
  ground(g, rnd, '#2a1e4a');
  for (let i = 0; i < 60; i++) {
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.4 + rnd() * 0.6;
    g.fillRect(rnd() * W, rnd() * H, 3, 3);
  }
  g.globalAlpha = 1;
  // The trail, swooping up from the bottom left.
  g.save();
  g.lineCap = 'round';
  for (const [w, color] of [[96, INK], [80, '#ff8a5b'], [52, '#ffd166'], [22, '#fff3b0']] as const) {
    g.beginPath();
    g.moveTo(-40, 400);
    g.bezierCurveTo(300, 380, 520, 320, 760, 170);
    g.lineWidth = w;
    g.strokeStyle = color;
    g.stroke();
  }
  g.restore();
  g.save();
  g.translate(820, 140);
  g.rotate(1.0);
  rounded(g, -60, -170, 120, 240, 60, '#e9ecef');
  g.beginPath();
  g.moveTo(-60, -110);
  g.quadraticCurveTo(0, -260, 60, -110);
  g.fillStyle = '#ef476f';
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.arc(0, -60, 32, 0, Math.PI * 2);
  g.fillStyle = '#4cc9f0';
  g.fill();
  g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 60, 10);
    g.lineTo(s * 110, 90);
    g.lineTo(s * 60, 70);
    g.closePath();
    g.fillStyle = '#ef476f';
    g.fill();
    g.stroke();
  }
  g.restore();
  words(g, 'SHIP IT!', 1400, 175, 200, '#06d6a0', 0.05);
  words(g, 'merged · deployed · celebrated', 1400, 325, 50, '#ffd166', 0.03);
  for (let i = 0; i < 6; i++) sparkle(g, 1000 + rnd() * 1000, 30 + rnd() * 340, 16 + rnd() * 20, COLORS[(i + 2) % COLORS.length]);
  // A planet, ringed.
  blob(g, 220, 110, 70, '#8a5cff', rnd);
  g.beginPath();
  g.ellipse(220, 110, 130, 26, -0.3, 0, Math.PI * 2);
  g.lineWidth = 9;
  g.strokeStyle = '#ffd166';
  g.stroke();
}

/** A giant light bulb having an idea, rays round it: MAKE STUFF. */
function bulbIdea(g: G, rnd: () => number) {
  ground(g, rnd, '#ffd166');
  // Rays out from the bulb right across the wall.
  const bx = 1500;
  const by = 170;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + Math.cos(a - 0.06) * 1400, by + Math.sin(a - 0.06) * 1400);
    g.lineTo(bx + Math.cos(a + 0.06) * 1400, by + Math.sin(a + 0.06) * 1400);
    g.closePath();
    g.fillStyle = i % 2 ? '#ffe28a' : '#ffbe3d';
    g.fill();
  }
  // The bulb.
  g.beginPath();
  g.arc(bx, by - 10, 120, 0.75 * Math.PI, 0.25 * Math.PI);
  g.lineTo(bx + 52, by + 150);
  g.lineTo(bx - 52, by + 150);
  g.closePath();
  g.fillStyle = '#fffbe6';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = INK;
  g.stroke();
  rounded(g, bx - 56, by + 150, 112, 70, 14, '#adb5bd');
  for (const y of [by + 172, by + 196]) {
    g.beginPath();
    g.moveTo(bx - 56, y);
    g.lineTo(bx + 56, y);
    g.lineWidth = 5;
    g.stroke();
  }
  // Its filament, a little heart.
  g.beginPath();
  g.moveTo(bx - 30, by + 60);
  g.bezierCurveTo(bx - 60, by - 10, bx - 10, by - 30, bx, by + 10);
  g.bezierCurveTo(bx + 10, by - 30, bx + 60, by - 10, bx + 30, by + 60);
  g.lineWidth = 8;
  g.strokeStyle = '#ef476f';
  g.stroke();
  words(g, 'MAKE', 520, 140, 200, '#ef476f', -0.08);
  words(g, 'STUFF', 640, 300, 170, '#118ab2', -0.04);
  splat(g, 1050, 90, 46, '#06d6a0', rnd);
  splat(g, 1900, 330, 56, '#8a5cff', rnd);
  for (let i = 0; i < 7; i++) sparkle(g, 900 + rnd() * 1100, 20 + rnd() * 360, 14 + rnd() * 16, '#ffffff');
}

/** Rainbow waves rolling along the wall round a big </>, and a paintbrush painting them. */
function waves(g: G, rnd: () => number) {
  ground(g, rnd, '#0b3954');
  const bands = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#8a5cff'];
  bands.forEach((c, i) => squiggle(g, -20, W + 20, 120 + i * 38, 34, 30, c, i * 0.5));
  words(g, '</>', 360, 200, 240, '#ffffff', -0.05);
  words(g, 'build · play · repeat', 1180, 70, 64, '#ffd166', 0.02);
  // The brush, leaving the last wave behind it.
  g.save();
  g.translate(1760, 300);
  g.rotate(-0.7);
  rounded(g, -16, -260, 32, 230, 14, '#c98b5a', 6);
  rounded(g, -24, -40, 48, 50, 6, '#adb5bd', 6);
  g.beginPath();
  g.moveTo(-24, 10);
  g.quadraticCurveTo(0, 110, 24, 10);
  g.closePath();
  g.fillStyle = '#8a5cff';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
  for (let i = 0; i < 8; i++) sparkle(g, rnd() * W, 300 + rnd() * 80, 12 + rnd() * 14, bands[i % bands.length]);
}

const PAINTERS = [robot, rocket, bulbIdea, waves];
const MADE: (THREE.MeshToonMaterial | undefined)[] = [];

/** Mural `i` (any whole number: they take turns), as a material, painted once and kept. */
export function mural(i: number): THREE.MeshToonMaterial {
  const k = ((i % PAINTERS.length) + PAINTERS.length) % PAINTERS.length;
  let m = MADE[k];
  if (!m) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    PAINTERS[k](c.getContext('2d')!, mulberry32(101 + k * 7));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    m = new THREE.MeshToonMaterial({ map: t });
    // A little light of its own, so it still reads at dusk; no cartoon outline on a flat wall.
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = t;
    m.emissiveIntensity = 0.12;
    m.userData.outlineParameters = { visible: false };
    MADE[k] = m;
  }
  return m;
}

/** How long a mural's canvas is, and how high, in meters. */
export const MURAL = { width: W / PX, height: H / PX } as const;

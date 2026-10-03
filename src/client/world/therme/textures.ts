import * as THREE from 'three';
import { canvasTexture, FONT } from '../casino/parts';
import { rand, wrap } from './kit';

/*
 * The thermal baths' own textures (flrnoh fork, see shared/therme.ts): drawn once on canvases, laid
 * by world position (kit.ts rectsGeometry) so they meet seamlessly. Grass and gravel for the sauna
 * garden and the lagoon, the garden's fence boards, the pools' overflow grates, the light the water
 * throws on a pool's floor, the hall's murals, the numbers on the copings.
 */

/** A lawn: green, uneven, blades and clover, a few daisies. */
export function lawn(seed = 3): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#5f9a45';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(80,140,58,0.5)' : 'rgba(110,170,70,0.35)';
        g.beginPath();
        g.arc(r() * 256, r() * 256, 8 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 2600; i++) {
        const x = r() * 256;
        const y = r() * 256;
        g.strokeStyle = r() > 0.5 ? 'rgba(40,90,30,0.55)' : 'rgba(150,205,100,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const x = r() * 256;
        const y = r() * 256;
        g.fillStyle = '#ffffff';
        for (let k = 0; k < 6; k++) g.fillRect(x + Math.cos(k) * 2.2 - 1, y + Math.sin(k) * 2.2 - 1, 2, 2);
        g.fillStyle = '#f6d34a';
        g.fillRect(x - 1, y - 1, 2, 2);
      }
    }),
  );
}

/** Gravel: pale pebbles, packed. */
export function gravel(seed = 5): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#cbbfa8';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1800; i++) {
        const k = 150 + r() * 90;
        g.fillStyle = `rgb(${k},${k * 0.95},${k * 0.86})`;
        g.beginPath();
        g.ellipse(r() * 256, r() * 256, 1.5 + r() * 2.6, 1.2 + r() * 2, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 500; i++) {
        g.fillStyle = 'rgba(70,60,50,0.35)';
        g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
      }
    }),
  );
}

/** The fence: upright boards, weathered larch, a gap of shadow between each. */
export function fenceBoards(seed = 7): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      const w = 256 / 8;
      for (let i = 0; i < 8; i++) {
        const k = 0.85 + r() * 0.25;
        g.fillStyle = `rgb(${158 * k},${118 * k},${80 * k})`;
        g.fillRect(i * w, 0, w - 3, 256);
        g.fillStyle = 'rgba(60,40,22,0.8)';
        g.fillRect(i * w + w - 3, 0, 3, 256);
        for (let j = 0; j < 9; j++) {
          g.strokeStyle = `rgba(90,62,36,${0.2 + r() * 0.25})`;
          g.lineWidth = 1;
          g.beginPath();
          const x = i * w + 3 + r() * (w - 9);
          g.moveTo(x, 0);
          g.bezierCurveTo(x + 3, 80, x - 3, 170, x + 1, 256);
          g.stroke();
        }
        // A knot or two.
        if (r() > 0.4) {
          g.fillStyle = 'rgba(80,52,28,0.7)';
          g.beginPath();
          g.ellipse(i * w + w / 2, r() * 256, 2.5, 5, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }),
  );
}

/** Wooden cladding: long horizontal boards, for the house's faces to the garden. */
export function cladding(seed = 9): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      const h = 256 / 10;
      for (let i = 0; i < 10; i++) {
        const k = 0.88 + r() * 0.2;
        g.fillStyle = `rgb(${120 * k},${84 * k},${54 * k})`;
        g.fillRect(0, i * h, 256, h - 2);
        g.fillStyle = 'rgba(40,26,14,0.7)';
        g.fillRect(0, i * h + h - 2, 256, 2);
      }
    }),
  );
}

/** The overflow gutter's grate: white bars across a dark channel. */
export function grate(): THREE.CanvasTexture {
  return wrap(
    canvasTexture(128, 32, (g) => {
      g.fillStyle = '#29424a';
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = '#eef3f2';
      for (let x = 0; x < 128; x += 8) g.fillRect(x, 0, 5, 32);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(0, 0, 128, 2);
      g.fillRect(0, 30, 128, 2);
    }),
  );
}

/** The light the water throws on a pool's floor: a net of bright wavy lines, on black (it's added on). */
export function caustics(seed = 11): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, 256, 256);
      g.lineCap = 'round';
      // Cells of a jittered grid, their edges drawn as soft bright curves (and again across the seams).
      const n = 7;
      const pts: [number, number][][] = [];
      for (let i = 0; i <= n; i++) {
        pts.push([]);
        for (let j = 0; j <= n; j++) {
          const jit = i === 0 || i === n || j === 0 || j === n ? 0 : 1;
          pts[i].push([(i / n) * 256 + (r() - 0.5) * 22 * jit, (j / n) * 256 + (r() - 0.5) * 22 * jit]);
        }
      }
      for (const [w, a] of [
        [7, 0.18],
        [3, 0.55],
        [1.4, 0.9],
      ] as const) {
        g.strokeStyle = `rgba(200,255,255,${a})`;
        g.lineWidth = w;
        for (let i = 0; i <= n; i++)
          for (let j = 0; j <= n; j++) {
            const p = pts[i][j];
            for (const [di, dj] of [
              [1, 0],
              [0, 1],
            ] as const) {
              const q = pts[i + di]?.[j + dj];
              if (!q) continue;
              const mx = (p[0] + q[0]) / 2 + (r() - 0.5) * 12;
              const my = (p[1] + q[1]) / 2 + (r() - 0.5) * 12;
              g.beginPath();
              g.moveTo(p[0], p[1]);
              g.quadraticCurveTo(mx, my, q[0], q[1]);
              g.stroke();
            }
          }
      }
    }),
  );
}

/** The hall's murals: a tropical shore at sunset, wide (drawn to repeat side by side). */
export function mural(seed = 13): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(1024, 256, (g) => {
      const sky = g.createLinearGradient(0, 0, 0, 170);
      sky.addColorStop(0, '#5fb4d9');
      sky.addColorStop(0.55, '#ffd6a0');
      sky.addColorStop(1, '#ff9f7a');
      g.fillStyle = sky;
      g.fillRect(0, 0, 1024, 256);
      // The sun, low over the sea.
      g.fillStyle = 'rgba(255,240,190,0.95)';
      g.beginPath();
      g.arc(560, 160, 46, 0, Math.PI * 2);
      g.fill();
      const sea = g.createLinearGradient(0, 160, 0, 256);
      sea.addColorStop(0, '#2f8fb3');
      sea.addColorStop(1, '#1d5f86');
      g.fillStyle = sea;
      g.fillRect(0, 165, 1024, 91);
      g.strokeStyle = 'rgba(255,230,180,0.6)';
      g.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const y = 170 + r() * 80;
        const x = 480 + (r() - 0.5) * 260;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 20 + r() * 40, y);
        g.stroke();
      }
      // Hills far off, islands.
      g.fillStyle = '#3f6f6a';
      for (const [x, w, h] of [
        [120, 260, 40],
        [820, 300, 55],
        [980, 160, 30],
      ] as const) {
        g.beginPath();
        g.ellipse(x, 168, w / 2, h, 0, Math.PI, 0);
        g.fill();
      }
      // Palms against the sky, at both ends (they meet across the seam).
      const palm = (x: number, h: number, lean: number) => {
        g.strokeStyle = '#3b2a22';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(x, 256);
        g.quadraticCurveTo(x + lean * 0.5, 256 - h * 0.6, x + lean, 256 - h);
        g.stroke();
        g.fillStyle = '#26413a';
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          g.beginPath();
          g.moveTo(x + lean, 256 - h);
          g.quadraticCurveTo(x + lean + Math.cos(a) * 40, 256 - h - 18 + Math.sin(a) * 10, x + lean + Math.cos(a) * 70, 256 - h + 20 + Math.abs(Math.sin(a)) * 16);
          g.quadraticCurveTo(x + lean + Math.cos(a) * 36, 256 - h + 2, x + lean, 256 - h);
          g.fill();
        }
      };
      palm(40, 190, 30);
      palm(110, 150, -20);
      palm(930, 200, -40);
      palm(1000, 140, 16);
      palm(300, 120, 14);
      palm(740, 130, -12);
    }),
  );
}

/** A depth mark for a pool's coping: "1,35 m" in blue on the stone. */
export function depthMark(text: string): THREE.CanvasTexture {
  return canvasTexture(256, 96, (g) => {
    g.fillStyle = '#f3ede0';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#1d5f86';
    g.font = `900 58px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 52);
  });
}

/** Leaves, for planting: a darker heart, veins. */
export function leafy(base: string, seed = 15): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(128, 128, (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
        g.beginPath();
        g.ellipse(r() * 128, r() * 128, 4 + r() * 8, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
}

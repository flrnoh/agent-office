import * as THREE from 'three';
import { FONT, canvasTexture } from '../parts';

/*
 * The basement's painted surfaces (flrnoh fork, see shared/gym-basement.ts): the pool's mosaic and its
 * lane lines, the quiet room's night sky and aquarium, the salt grotto's glowing bricks and its
 * graduation wall, the grotto's rock, the waterfall, the lane ropes and the pace clock's face. All
 * canvases drawn once; the moving ones (water, waterfall, fish) scroll their offset.
 */

export const wrap = (t: THREE.CanvasTexture, x = 1, y = 1) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
};

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Small square mosaic in shades of one colour: the pool's walls, the hall's walls. */
export function mosaic(base: string, n = 16, vary = 0.12, seed = 5): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#e8eef0';
    g.fillRect(0, 0, 256, 256);
    const s = 256 / n;
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const k = 1 + (r() - 0.5) * vary * 2;
        g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
        g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
  });
}

/** The lap pool's floor: pale blue tiles with a dark line down the middle of each lane and a T at each end. */
export function laneFloor(lanes: number): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (g) => {
    g.fillStyle = '#9fd7ea';
    g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    for (let y = 0; y <= 256; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
    g.fillStyle = '#1d3f73';
    const h = 256 / lanes;
    for (let i = 0; i < lanes; i++) {
      const y = h * (i + 0.5);
      g.fillRect(80, y - 5, 1024 - 160, 10);
      g.fillRect(70, y - 22, 10, 44);
      g.fillRect(1024 - 80, y - 22, 10, 44);
    }
  });
}

/** A lane rope: floats in red, white and blue, one set per metre. */
export function laneRope(): THREE.CanvasTexture {
  return wrap(
    canvasTexture(64, 16, (g) => {
      const cols = ['#e53935', '#f4f4f4', '#1e5bd8', '#f4f4f4'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i];
        g.fillRect(i * 16, 0, 15, 16);
      }
    }),
  );
}

/** The water's surface: light caustics on blue. */
export function ripples(base: string, light: string, seed = 31): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = light;
      g.lineWidth = 2;
      for (let i = 0; i < 70; i++) {
        const x = r() * 256;
        const y = r() * 256;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + 10, y - 8 * r(), x + 18, y + 8 * r(), x + 28 + 10 * r(), y + 2);
        g.stroke();
      }
    }),
  );
}

/** A night sky for the quiet room's ceiling: deep blue with a scatter of stars and a faint milky way. */
export function nightSky(seed = 77): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(1024, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 1024, 512);
    grd.addColorStop(0, '#060a1c');
    grd.addColorStop(0.5, '#0b1434');
    grd.addColorStop(1, '#050816');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(160,170,255,0.06)';
    for (let i = 0; i < 400; i++) {
      const t = r();
      g.beginPath();
      g.arc(t * 1024, 120 + t * 280 + (r() - 0.5) * 90, 6 + r() * 16, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 520; i++) {
      const big = r() < 0.06;
      g.fillStyle = big ? '#fff6d8' : `rgba(255,255,255,${0.35 + r() * 0.6})`;
      g.beginPath();
      g.arc(r() * 1024, r() * 512, big ? 2.2 : 0.6 + r() * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The aquarium's water: blue going deep, sand, weed and fish. Scrolled sideways (`offset.x`) so the fish swim. */
export function aquarium(seed = 9): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(1024, 256, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#2aa7d6');
      grd.addColorStop(1, '#073a62');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = '#d9c38f';
      g.beginPath();
      g.moveTo(0, 256);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 226 + Math.sin(x / 70) * 8);
      g.lineTo(1024, 256);
      g.fill();
      for (let i = 0; i < 26; i++) {
        const x = r() * 1024;
        g.strokeStyle = r() < 0.5 ? '#2f8f4e' : '#4fb067';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, 236);
        g.quadraticCurveTo(x + 14, 190, x - 6, 140 + r() * 40);
        g.stroke();
      }
      const fish = ['#ff8a3d', '#ffd23d', '#3dd6ff', '#ff5fa2', '#9cff6b'];
      for (let i = 0; i < 22; i++) {
        const x = r() * 1024;
        const y = 30 + r() * 170;
        const s = 6 + r() * 10;
        g.fillStyle = fish[i % fish.length];
        g.beginPath();
        g.ellipse(x, y, s * 1.6, s, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - s * 1.4, y);
        g.lineTo(x - s * 2.6, y - s);
        g.lineTo(x - s * 2.6, y + s);
        g.fill();
        g.fillStyle = '#111';
        g.beginPath();
        g.arc(x + s * 0.9, y - s * 0.2, 1.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 60; i++) {
        g.beginPath();
        g.arc(r() * 1024, r() * 220, 1 + r() * 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
}

/** Himalayan salt bricks, lit from behind: warm orange to pink, each a little different. */
export function saltBricks(seed = 41): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#b8714a';
      g.fillRect(0, 0, 256, 256);
      const rows = 8;
      const h = 256 / rows;
      for (let j = 0; j < rows; j++) {
        const off = j % 2 ? 32 : 0;
        for (let x = -off; x < 256; x += 64) {
          const k = r();
          // Lit from behind: bright in the middle, deeper toward the edges, with milky veins.
          const grd = g.createRadialGradient(x + 32, j * h + h / 2, 2, x + 32, j * h + h / 2, 40);
          grd.addColorStop(0, `hsl(${26 + k * 12}, 95%, ${84 + k * 8}%)`);
          grd.addColorStop(1, `hsl(${16 + k * 12}, ${70 + k * 15}%, ${62 + k * 10}%)`);
          g.fillStyle = grd;
          g.fillRect(x + 1.5, j * h + 1.5, 61, h - 3);
          g.strokeStyle = 'rgba(255,250,240,0.35)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 6, j * h + 4 + k * 20);
          g.quadraticCurveTo(x + 30, j * h + k * 30, x + 58, j * h + 8 + k * 16);
          g.stroke();
        }
      }
    }),
  );
}

/** Salt pebbles underfoot: white and pink grains. */
export function saltFloor(seed = 43): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#efe2d6';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() < 0.3 ? '#f2b9a0' : r() < 0.5 ? '#fff8f2' : '#d9c4b4';
        g.beginPath();
        g.arc(r() * 256, r() * 256, 1.5 + r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
}

/** The graduation wall's blackthorn: a tangle of twigs, wet with brine. */
export function blackthorn(seed = 47): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#3a2a1c';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 520; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const a = r() * Math.PI * 2;
        const l = 6 + r() * 22;
        g.strokeStyle = r() < 0.5 ? '#6b4f36' : '#8a6a4a';
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    }),
  );
}

/** Rough rock: grey-brown blotches for the grotto. */
export function rock(seed = 53): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#6f675e';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 260; i++) {
        const k = r();
        g.fillStyle = `rgba(${40 + k * 80},${36 + k * 70},${30 + k * 60},0.5)`;
        g.beginPath();
        g.ellipse(r() * 256, r() * 256, 4 + r() * 18, 3 + r() * 10, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
}

/** Falling water: white streaks on a see-through ground, scrolled down (`offset.y`) as it falls. */
export function fallingWater(seed = 61): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(128, 256, (g) => {
      g.clearRect(0, 0, 128, 256);
      g.fillStyle = 'rgba(190,235,255,0.35)';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 90; i++) {
        const x = r() * 128;
        const y = r() * 256;
        g.strokeStyle = `rgba(255,255,255,${0.4 + r() * 0.5})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 2, y + 20 + r() * 40);
        g.stroke();
      }
    }),
  );
}

/** The pace clock's face: 60 seconds round, big numbers every ten. */
export function paceClock(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#fbfbf6';
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1d3f73';
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = '#1d3f73';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 30px ${FONT}`;
    for (let s = 0; s < 60; s++) {
      const a = (s / 60) * Math.PI * 2 - Math.PI / 2;
      const big = s % 5 === 0;
      g.lineWidth = big ? 4 : 2;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * (big ? 98 : 106), 128 + Math.sin(a) * (big ? 98 : 106));
      g.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116);
      g.stroke();
      if (s % 10 === 0) g.fillText(String(s === 0 ? 60 : s), 128 + Math.cos(a) * 76, 128 + Math.sin(a) * 76);
    }
  });
}

/** A sign: big words, a smaller line, on a colour. */
export function sign(big: string, small: string, bg: string, fg: string, w = 512, h = 160): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${Math.round(h * 0.38)}px ${FONT}`;
    g.fillText(big, w / 2, small ? h * 0.4 : h / 2, w - 24);
    if (small) {
      g.globalAlpha = 0.8;
      g.font = `600 ${Math.round(h * 0.18)}px ${FONT}`;
      g.fillText(small, w / 2, h * 0.76, w - 24);
    }
  });
}

/** Warm wooden slats for the foyer's walls. */
export function slats(seed = 67): THREE.CanvasTexture {
  const r = rand(seed);
  return wrap(
    canvasTexture(256, 128, (g) => {
      g.fillStyle = '#3b2a1c';
      g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 16) {
        const k = r();
        g.fillStyle = `hsl(28, ${38 + k * 14}%, ${42 + k * 12}%)`;
        g.fillRect(x + 2, 0, 12, 128);
      }
    }),
  );
}

import * as THREE from 'three';

/*
 * The mini golf room's fluorescent paint (flrnoh fork, see FORK.md "Black-light mini golf"), drawn
 * on canvases once, the first time anyone goes in: the black carpet with its glowing confetti, the
 * felt's grain, and the murals round the walls (a jungle, outer space, the deep sea) in neon paint
 * that glows under the UV. All made up as it's drawn, from a fixed seed, so everyone sees the same.
 */

/** A little seeded random, so the paint's the same on every page. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const NEON = ['#39ff14', '#ff2bd6', '#00e5ff', '#fffb00', '#ff7a00', '#b14dff', '#00ffb3', '#ff3b3b'];

/** Paint that glows: drawn with a blur of its own colour round it. */
function glowing(g: CanvasRenderingContext2D, color: string, blur: number, draw: () => void) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.strokeStyle = color;
  draw();
  g.restore();
}

/** The black carpet with fluorescent squiggles, dots and triangles (a tile, 2 m across). */
export function carpetTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#07040f';
  g.fillRect(0, 0, 512, 512);
  const r = rng(7);
  for (let i = 0; i < 140; i++) {
    const color = NEON[Math.floor(r() * NEON.length)];
    const x = r() * 512;
    const y = r() * 512;
    const s = 4 + r() * 10;
    glowing(g, color, 6, () => {
      g.globalAlpha = 0.55 + r() * 0.35;
      g.lineWidth = 2.5;
      const kind = r();
      if (kind < 0.35) {
        g.beginPath();
        g.arc(x, y, s / 2, 0, Math.PI * 2);
        g.fill();
      } else if (kind < 0.6) {
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s, y + s);
        g.lineTo(x - s, y + s);
        g.closePath();
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(x - s * 1.5, y);
        for (let k = 1; k <= 4; k++) g.quadraticCurveTo(x - s * 1.5 + (k - 0.5) * s * 0.75, y + (k % 2 ? -s : s), x - s * 1.5 + k * s * 0.75, y);
        g.stroke();
      }
    });
  }
  return texture(c, true);
}

/** The felt's grain: light and dark flecks (multiplied with each hole's colour). */
export function feltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + (r() - 0.5) * 70;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return texture(c, true);
}

export type Mural = 'jungle' | 'space' | 'ocean' | 'entrance';

/** A wall's mural, `w` × `h` metres, at 80 px a metre (at most 4096 px across). */
export function muralTexture(kind: Mural, w: number, h: number, seed: number): THREE.CanvasTexture {
  const ppm = Math.min(80, 4096 / w);
  const [c, g] = canvas(Math.round(w * ppm), Math.round(h * ppm));
  const W = c.width;
  const H = c.height;
  const r = rng(seed);
  // A deep near-black, a little lighter at the bottom where the UV tubes reach.
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#05020c');
  bg.addColorStop(1, kind === 'ocean' ? '#03121c' : kind === 'jungle' ? '#04120a' : '#0b0520');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const lw = Math.max(2, ppm * 0.03);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'space' || kind === 'entrance') {
    // Stars, a nebula, planets with rings, a comet or two, a rocket.
    for (let i = 0; i < W / 3; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
      const s = r() * 2.2;
      g.fillRect(r() * W, r() * H, s, s);
    }
    for (let i = 0; i < 5; i++) {
      const x = r() * W;
      const y = r() * H;
      const neb = g.createRadialGradient(x, y, 0, x, y, H * (0.4 + r() * 0.5));
      const col = NEON[[1, 5, 2][i % 3]];
      neb.addColorStop(0, `${col}33`);
      neb.addColorStop(1, `${col}00`);
      g.fillStyle = neb;
      g.fillRect(0, 0, W, H);
    }
    const planets = Math.max(3, Math.round(w / 4));
    for (let i = 0; i < planets; i++) {
      const x = ((i + 0.3 + r() * 0.4) / planets) * W;
      const y = H * (0.25 + r() * 0.5);
      const rad = H * (0.08 + r() * 0.16);
      const col = NEON[Math.floor(r() * NEON.length)];
      glowing(g, col, ppm * 0.25, () => {
        g.lineWidth = lw;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.stroke();
      });
      // Bands across it.
      g.save();
      g.beginPath();
      g.arc(x, y, rad - lw, 0, Math.PI * 2);
      g.clip();
      for (let b = -2; b <= 2; b++) {
        glowing(g, NEON[Math.floor(r() * NEON.length)], ppm * 0.1, () => {
          g.globalAlpha = 0.5;
          g.fillRect(x - rad, y + b * rad * 0.35 - rad * 0.06, rad * 2, rad * 0.12);
        });
      }
      g.restore();
      if (r() < 0.6) {
        glowing(g, NEON[Math.floor(r() * NEON.length)], ppm * 0.2, () => {
          g.lineWidth = lw * 0.8;
          g.beginPath();
          g.ellipse(x, y, rad * 1.8, rad * 0.45, -0.25, 0, Math.PI * 2);
          g.stroke();
        });
      }
    }
    for (let i = 0; i < Math.round(w / 6) + 1; i++) {
      const x = r() * W;
      const y = r() * H * 0.6;
      const len = ppm * (1 + r() * 1.5);
      glowing(g, '#ffffff', ppm * 0.2, () => {
        const tail = g.createLinearGradient(x, y, x - len, y + len * 0.3);
        tail.addColorStop(0, '#ffffffcc');
        tail.addColorStop(1, '#00e5ff00');
        g.strokeStyle = tail;
        g.lineWidth = lw * 1.6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - len, y + len * 0.3);
        g.stroke();
        g.beginPath();
        g.arc(x, y, lw * 1.4, 0, Math.PI * 2);
        g.fill();
      });
    }
  }
  if (kind === 'jungle') {
    // Hanging vines and big leaves from the top, ferns from the bottom, flowers and parrots between.
    for (let i = 0; i < w * 2.2; i++) {
      const x = r() * W;
      const len = H * (0.2 + r() * 0.5);
      const col = NEON[[0, 6, 3][Math.floor(r() * 3)]];
      glowing(g, col, ppm * 0.15, () => {
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + ppm * 0.4, len * 0.3, x - ppm * 0.4, len * 0.6, x + ppm * 0.1 * (r() - 0.5), len);
        g.stroke();
        for (let k = 0.2; k < 1; k += 0.18) leaf(g, x + Math.sin(k * 7) * ppm * 0.2, len * k, ppm * 0.22, (k * 9) % 2 ? 0.6 : -0.6 + Math.PI, lw);
      });
    }
    for (let i = 0; i < w * 1.2; i++) {
      const x = r() * W;
      const col = NEON[[0, 6][Math.floor(r() * 2)]];
      glowing(g, col, ppm * 0.15, () => {
        for (let k = -3; k <= 3; k++) leaf(g, x, H, ppm * (0.6 + r() * 0.4), -Math.PI / 2 + k * 0.32, lw);
      });
    }
    for (let i = 0; i < w * 0.9; i++) {
      const x = r() * W;
      const y = H * (0.3 + r() * 0.5);
      const col = NEON[[1, 4, 3, 7][Math.floor(r() * 4)]];
      glowing(g, col, ppm * 0.2, () => {
        for (let p = 0; p < 5; p++) {
          g.beginPath();
          g.ellipse(x + Math.cos((p / 5) * Math.PI * 2) * ppm * 0.12, y + Math.sin((p / 5) * Math.PI * 2) * ppm * 0.12, ppm * 0.1, ppm * 0.05, (p / 5) * Math.PI * 2, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    for (let i = 0; i < Math.round(w / 5); i++) parrot(g, r() * W, H * (0.2 + r() * 0.4), ppm, lw, r);
  }
  if (kind === 'ocean') {
    // Light rays from above, jellyfish, fish in shoals, coral and kelp, bubbles.
    for (let i = 0; i < w / 2; i++) {
      const x = r() * W;
      const ray = g.createLinearGradient(x, 0, x + ppm, H);
      ray.addColorStop(0, '#00e5ff22');
      ray.addColorStop(1, '#00e5ff00');
      g.fillStyle = ray;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + ppm * 0.5, 0);
      g.lineTo(x + ppm * 1.6, H);
      g.lineTo(x + ppm * 0.6, H);
      g.fill();
    }
    for (let i = 0; i < w * 0.7; i++) {
      const x = r() * W;
      const col = NEON[[1, 5, 4][Math.floor(r() * 3)]];
      glowing(g, col, ppm * 0.2, () => {
        g.lineWidth = lw * 1.4;
        let y = H;
        let px = x;
        g.beginPath();
        g.moveTo(px, y);
        for (let k = 0; k < 5; k++) {
          const nx = px + (r() - 0.5) * ppm * 0.4;
          const ny = y - ppm * (0.12 + r() * 0.14);
          g.lineTo(nx, ny);
          px = nx;
          y = ny;
        }
        g.stroke();
      });
    }
    for (let i = 0; i < w * 0.6; i++) {
      const x = r() * W;
      glowing(g, '#00ffb3', ppm * 0.12, () => {
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x, H);
        g.bezierCurveTo(x + ppm * 0.3, H * 0.7, x - ppm * 0.3, H * 0.5, x + ppm * 0.1, H * (0.25 + r() * 0.2));
        g.stroke();
      });
    }
    for (let i = 0; i < Math.round(w / 2.5); i++) jellyfish(g, r() * W, H * (0.15 + r() * 0.45), ppm * (0.3 + r() * 0.25), NEON[[1, 5, 2, 3][Math.floor(r() * 4)]], lw, r);
    for (let i = 0; i < Math.round(w / 3); i++) {
      const x0 = r() * W;
      const y0 = H * (0.3 + r() * 0.45);
      const col = NEON[[3, 4, 2][Math.floor(r() * 3)]];
      for (let k = 0; k < 5; k++) fish(g, x0 + k * ppm * 0.35 + (r() - 0.5) * ppm * 0.2, y0 + (r() - 0.5) * ppm * 0.4, ppm * 0.16, col, lw);
    }
    for (let i = 0; i < w * 3; i++) {
      glowing(g, '#9ff6ff', 4, () => {
        g.globalAlpha = 0.5;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(r() * W, r() * H, 2 + r() * ppm * 0.05, 0, Math.PI * 2);
        g.stroke();
      });
    }
  }
  // Paint splatters everywhere.
  for (let i = 0; i < w * 2; i++) {
    const col = NEON[Math.floor(r() * NEON.length)];
    glowing(g, col, 8, () => {
      g.globalAlpha = 0.45;
      const x = r() * W;
      const y = r() * H;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(x + (r() - 0.5) * ppm * 0.2, y + (r() - 0.5) * ppm * 0.2, 1 + r() * ppm * 0.03, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
  return texture(c);
}

function leaf(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, lw: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.lineWidth = lw * 0.8;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.5, -s * 0.28, s, 0);
  g.quadraticCurveTo(s * 0.5, s * 0.28, 0, 0);
  g.stroke();
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s * 0.9, 0);
  g.stroke();
  g.restore();
}

function parrot(g: CanvasRenderingContext2D, x: number, y: number, ppm: number, lw: number, r: () => number) {
  const s = ppm * 0.45;
  const body = NEON[[7, 3, 2][Math.floor(r() * 3)]];
  glowing(g, body, ppm * 0.2, () => {
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(x, y, s * 0.35, s * 0.6, 0.2, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x + s * 0.1, y - s * 0.65, s * 0.22, 0, Math.PI * 2);
    g.stroke();
    // A long tail, and a wing.
    g.beginPath();
    g.moveTo(x - s * 0.1, y + s * 0.5);
    g.lineTo(x - s * 0.35, y + s * 1.5);
    g.lineTo(x + s * 0.05, y + s * 0.55);
    g.stroke();
  });
  glowing(g, '#fffb00', ppm * 0.1, () => {
    g.beginPath();
    g.moveTo(x + s * 0.3, y - s * 0.7);
    g.lineTo(x + s * 0.5, y - s * 0.6);
    g.lineTo(x + s * 0.3, y - s * 0.5);
    g.fill();
  });
}

function jellyfish(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, lw: number, r: () => number) {
  glowing(g, col, s * 0.4, () => {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(x, y, s * 0.5, Math.PI, 0);
    g.quadraticCurveTo(x, y + s * 0.15, x - s * 0.5, y);
    g.stroke();
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(x + k * s * 0.18, y + s * 0.08);
      g.bezierCurveTo(x + k * s * 0.18 + s * 0.15, y + s * 0.5, x + k * s * 0.18 - s * 0.15, y + s * 0.8, x + k * s * 0.18 + (r() - 0.5) * s * 0.2, y + s * (1 + r() * 0.5));
      g.stroke();
    }
  });
}

function fish(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, lw: number) {
  glowing(g, col, s * 0.5, () => {
    g.lineWidth = lw * 0.8;
    g.beginPath();
    g.ellipse(x, y, s, s * 0.45, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(x - s, y);
    g.lineTo(x - s * 1.6, y - s * 0.45);
    g.lineTo(x - s * 1.6, y + s * 0.45);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(x + s * 0.55, y - s * 0.1, lw * 0.6, 0, Math.PI * 2);
    g.fill();
  });
}

/** A neon sign: lines of text in glowing tube letters on black (or clear). */
export function signTexture(lines: { text: string; color: string; size: number }[], w: number, h: number, bg: string | null = '#05020c'): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  const total = lines.reduce((s, l) => s + l.size * 1.2, 0);
  let y = (h - total) / 2;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const l of lines) {
    g.font = `800 ${l.size}px "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif`;
    glowing(g, l.color, l.size * 0.35, () => {
      g.lineWidth = Math.max(2, l.size * 0.07);
      g.strokeText(l.text, w / 2, y, w * 0.94);
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.85;
      g.fillText(l.text, w / 2, y, w * 0.94);
    });
    y += l.size * 1.2;
  }
  return texture(c);
}

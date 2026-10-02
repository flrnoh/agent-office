import * as THREE from 'three';
import { canvasTexture } from '../casino/parts';
import { mulberry32 } from '../../../shared/rng';

/*
 * The Schallwerk's pictures (flrnoh fork, see FORK.md "The Schallwerk"): the brick and the corrugated
 * steel, the neon letters on the roof, the letter board over the doors, the gig posters, the house's
 * logo (on the merch, the backdrop, the foyer), the setlist and the band stickers backstage, the bar's
 * board. All drawn here, no images and nobody's logos: a made-up old power station turned club, with
 * made-up bands.
 */

/** The house's palette: brick, soot, signal red, sodium amber, cold steel, the club's violet and cyan. */
export const SW = { brick: '#8a3b26', brickDark: '#5e2618', mortar: '#b9a48c', soot: '#1d1b1f', red: '#ff2d3d', amber: '#ffb347', steel: '#5c6470', violet: '#8a2bff', cyan: '#2ee6ff', cream: '#f4ead8' } as const;
/** Tall, narrow and loud: the posters' and the letter board's type. */
export const BOLD = 'Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';

/** Old red brick in English bond, the mortar a little sooty, some bricks darker (fired hotter) than others. */
export function brickTexture(seed = 7, dark = 0): THREE.CanvasTexture {
  const r = mulberry32(seed);
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = SW.mortar;
    g.fillRect(0, 0, 256, 256);
    const rows = 16;
    const bh = 256 / rows;
    for (let row = 0; row < rows; row++) {
      const header = row % 2 === 1;
      const bw = header ? 16 : 32;
      const off = header ? 8 : (row % 4) * 8;
      for (let x = -off; x < 256; x += bw) {
        const k = r();
        const base = k < 0.15 ? [70, 30, 22] : k < 0.3 ? [150, 70, 45] : [128 + r() * 18, 52 + r() * 14, 34 + r() * 10];
        const d = 1 - dark * (0.5 + r() * 0.3);
        g.fillStyle = `rgb(${base[0] * d},${base[1] * d},${base[2] * d})`;
        g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
        // A little texture on each brick.
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x + 1, row * bh + bh - 4, bw - 2, 3);
      }
    }
    // Soot streaks running down from the top.
    for (let i = 0; i < 14; i++) {
      const x = r() * 256;
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, `rgba(20,16,18,${0.08 + dark * 0.2})`);
      grd.addColorStop(1, 'rgba(20,16,18,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 6 + r() * 14, 256);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Corrugated steel, dark and a bit weathered: vertical ribs. */
export function corrugatedTexture(color = '#2c3038'): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) {
      const grd = g.createLinearGradient(x, 0, x + 8, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0.25)');
      grd.addColorStop(1, 'rgba(255,255,255,0.10)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 8, 128);
    }
    g.fillStyle = 'rgba(160,90,40,0.12)';
    for (let i = 0; i < 30; i++) g.fillRect((i * 53) % 128, (i * 29) % 128, 2, 6 + (i % 5) * 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Raw concrete, for the floor inside and the loading dock. */
export function concreteTexture(tone = '#55524f'): THREE.CanvasTexture {
  const r = mulberry32(31);
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
    }
    // Saw cuts in a grid, and a few old stains.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    for (let i = 0; i < 5; i++) {
      const grd = g.createRadialGradient(r() * 256, r() * 256, 2, 128, 128, 90);
      grd.addColorStop(0, 'rgba(0,0,0,0.12)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The house's mark: a lightning bolt through three sound waves, and SCHALLWERK under it. `ink` on a see-through ground. */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, ink: string, word = true) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  const s = size;
  // The waves either side of the bolt.
  for (let i = 1; i <= 3; i++) {
    g.lineWidth = s * 0.045;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(0, -s * 0.18, s * (0.12 + i * 0.09), side < 0 ? Math.PI * 0.72 : -Math.PI * 0.28, side < 0 ? Math.PI * 1.28 : Math.PI * 0.28);
      g.stroke();
    }
  }
  // The bolt.
  g.beginPath();
  g.moveTo(s * 0.06, -s * 0.5);
  g.lineTo(-s * 0.1, -s * 0.14);
  g.lineTo(s * 0.02, -s * 0.14);
  g.lineTo(-s * 0.06, s * 0.14);
  g.lineTo(s * 0.12, -s * 0.24);
  g.lineTo(s * 0.0, -s * 0.24);
  g.closePath();
  g.fill();
  if (word) {
    g.font = `${s * 0.26}px ${BOLD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SCHALLWERK', 0, s * 0.36);
  }
  g.restore();
}

export function logoTexture(ink: string, bg: string | null = null, w = 512, h = 512): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    drawLogo(g, w / 2, h / 2, Math.min(w, h) * 0.9, ink);
  });
}

/** Neon letters on a see-through ground: a tube of `color` round each with its glow, a white-hot core. */
export function neonWord(text: string, color: string, w = 2048, h = 384, font = BOLD): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    let px = h * 0.8;
    g.font = `${px}px ${font}`;
    while (g.measureText(text).width > w * 0.92 && px > 20) g.font = `${(px -= 6)}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = h * 0.53;
    // The letters' steel backing channels, dark.
    g.lineJoin = 'round';
    g.strokeStyle = '#141419';
    g.lineWidth = px * 0.1;
    g.strokeText(text, w / 2, y);
    g.shadowColor = color;
    for (const blur of [px * 0.25, px * 0.1]) {
      g.shadowBlur = blur;
      g.fillStyle = color;
      g.fillText(text, w / 2, y);
    }
    g.shadowBlur = 0;
    g.lineWidth = Math.max(3, px * 0.03);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.strokeText(text, w / 2, y);
  });
}

/** The made-up bands on the posters, the letter board and the LED wall (nobody real). */
export const ACTS: readonly { name: string; genre: string; date: string; colors: [string, string, string] }[] = [
  { name: 'DIE MERGE-KONFLIKTE', genre: 'Punkrock', date: 'FR 09.10.', colors: ['#ff2d3d', '#111111', '#f4ead8'] },
  { name: 'NULL POINTER SISTERS', genre: 'Indie-Pop', date: 'SA 10.10.', colors: ['#2ee6ff', '#1b0f3b', '#ffd166'] },
  { name: 'KERNEL PANIK', genre: 'Industrial', date: 'DO 15.10.', colors: ['#c6ff00', '#0d0d0d', '#ffffff'] },
  { name: 'FEIERABEND ORCHESTER', genre: 'Brass & Balkan', date: 'SA 17.10.', colors: ['#ffb347', '#6d1420', '#fff3d6'] },
  { name: 'HEAP OVERFLOW', genre: 'Drum & Bass', date: 'FR 23.10.', colors: ['#8a2bff', '#05050f', '#2ee6ff'] },
  { name: 'GRÜNER BUILD', genre: 'Stadionrock', date: 'SA 31.10.', colors: ['#3ddc84', '#102a1a', '#f4ead8'] },
];

/** A gig poster: big type, a shape, the date, SCHALLWERK at the bottom. */
export function posterTexture(i: number): THREE.CanvasTexture {
  const a = ACTS[i % ACTS.length];
  const [fg, bg, ink] = a.colors;
  const r = mulberry32(100 + i);
  return canvasTexture(256, 360, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 360);
    // A bold shape behind: rays, rings or stripes.
    g.globalAlpha = 0.85;
    const kind = i % 3;
    if (kind === 0) {
      g.fillStyle = fg;
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        g.moveTo(128, 150);
        const a0 = (k / 14) * Math.PI * 2;
        g.arc(128, 150, 260, a0, a0 + Math.PI / 14);
        g.closePath();
        g.fill();
      }
    } else if (kind === 1) {
      g.strokeStyle = fg;
      for (let k = 1; k < 9; k++) {
        g.lineWidth = 6;
        g.beginPath();
        g.arc(128, 150, k * 16, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      g.fillStyle = fg;
      for (let k = 0; k < 10; k++) g.fillRect(0, 40 + k * 26 + r() * 8, 256, 9);
    }
    g.globalAlpha = 1;
    g.fillStyle = bg;
    g.fillRect(14, 196, 228, 150);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = a.name.split(' ');
    let y = 222;
    for (const w of words) {
      let px = 40;
      g.font = `${px}px ${BOLD}`;
      while (g.measureText(w).width > 220 && px > 12) g.font = `${(px -= 2)}px ${BOLD}`;
      g.fillText(w, 128, y);
      y += px * 0.95;
    }
    g.fillStyle = fg;
    g.font = `22px ${BOLD}`;
    g.fillText(`${a.date} · ${a.genre.toUpperCase()}`, 128, 318);
    g.fillStyle = ink;
    g.font = `16px ${BOLD}`;
    g.fillText('LIVE IM SCHALLWERK', 128, 340);
  });
}

/** The letter board's lines, white panel, black slotted letters, a red header strip. */
export function drawLetterBoard(g: CanvasRenderingContext2D, w: number, h: number, lines: string[]) {
  g.fillStyle = '#f6f1e4';
  g.fillRect(0, 0, w, h);
  // The slots the letters hang in.
  g.fillStyle = 'rgba(0,0,0,0.07)';
  const rows = Math.max(1, lines.length);
  const rowH = h / rows;
  for (let i = 0; i < rows; i++) g.fillRect(0, i * rowH + rowH * 0.12, w, 3);
  g.fillStyle = '#16161a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    let px = rowH * (i === 0 ? 0.86 : 0.7);
    g.font = `${px}px ${BOLD}`;
    while (g.measureText(line).width > w * 0.94 && px > 8) g.font = `${(px -= 2)}px ${BOLD}`;
    g.fillStyle = i === 0 ? '#c4121f' : '#16161a';
    g.fillText(line, w / 2, (i + 0.56) * rowH);
  });
}

/** The setlist taped to the wall backstage: made-up songs in thick marker. */
export function setlistTexture(): THREE.CanvasTexture {
  const songs = ['1. Kaltstart', '2. Grüner Build', '3. Merge-Konflikt', '4. Nachtschicht', '5. Stack Trace Blues', '6. Feierabend!', '— Zugabe —', '7. Strg+Z', '8. Ein Stockwerk mehr'];
  return canvasTexture(256, 360, (g) => {
    g.fillStyle = '#fbfaf4';
    g.fillRect(0, 0, 256, 360);
    g.fillStyle = 'rgba(200,200,170,0.5)';
    g.fillRect(90, 0, 76, 16); // the tape
    g.fillStyle = '#1b1b2f';
    g.font = 'bold 26px "Marker Felt", "Comic Sans MS", cursive';
    g.textAlign = 'center';
    g.fillText('SETLIST', 128, 46);
    g.font = 'bold 21px "Marker Felt", "Comic Sans MS", cursive';
    g.textAlign = 'left';
    songs.forEach((s, i) => {
      g.fillStyle = s.startsWith('—') ? '#c4121f' : '#1b1b2f';
      g.fillText(s, 24, 86 + i * 30);
    });
  });
}

/** A sheet of band stickers (made-up bands), slapped on at angles. */
export function stickersTexture(seed = 3): THREE.CanvasTexture {
  const r = mulberry32(seed);
  return canvasTexture(256, 256, (g) => {
    for (let i = 0; i < 16; i++) {
      const a = ACTS[i % ACTS.length];
      g.save();
      g.translate(20 + r() * 216, 20 + r() * 216);
      g.rotate((r() - 0.5) * 1.2);
      const w = 70 + r() * 40;
      const h = 26 + r() * 16;
      g.fillStyle = a.colors[i % 2 === 0 ? 0 : 1];
      if (i % 3 === 0) {
        g.beginPath();
        g.arc(0, 0, h * 0.9, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = a.colors[i % 2 === 0 ? 1 : 2];
      g.font = `${Math.round(h * 0.42)}px ${BOLD}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(i % 3 === 0 ? a.name.split(' ')[0].slice(0, 6) : a.name.split(' ').slice(-1)[0], 0, 0, w - 6);
      g.restore();
    }
  });
}

/**
 * Arched factory windows: by day dark old glass in its grid of glazing bars (`lit` false), at night
 * the warm light inside with a hint of the crowd's heads (`lit`, the emissive map).
 */
export function litWindowTexture(lit = true): THREE.CanvasTexture {
  return canvasTexture(64, 160, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, lit ? '#2a1626' : '#46566a');
    grd.addColorStop(0.45, lit ? '#ff9a4a' : '#2c3644');
    grd.addColorStop(1, lit ? '#ffcf7a' : '#3b4757');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 160);
    g.strokeStyle = 'rgba(20,10,10,0.75)';
    g.lineWidth = 3;
    // Glazing bars: a grid of small panes, as old factory windows have.
    for (let x = 16; x < 64; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 160);
      g.stroke();
    }
    for (let y = 20; y < 160; y += 20) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(64, y);
      g.stroke();
    }
    if (!lit) return;
    // Heads of the crowd along the bottom.
    g.fillStyle = 'rgba(30,15,20,0.8)';
    for (let x = 4; x < 64; x += 10) {
      g.beginPath();
      g.arc(x, 156, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** The bar's board: BAR in a red neon box, what's on tap. */
export function barBoardTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#121216';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#2b2b33';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 504, 248);
    g.fillStyle = '#f4ead8';
    g.font = 'bold 30px "Chalkboard SE", "Comic Sans MS", cursive';
    g.textAlign = 'left';
    const rows = ['Zwickl vom Fass', 'Helles · Radler', 'Mate · Spezi · Cola', 'Gin Tonic · Spritz', 'Obstler (Kurzer)', 'Wasser: immer'];
    rows.forEach((t, i) => g.fillText(t, 26, 46 + i * 37));
    g.textAlign = 'right';
    g.fillStyle = '#ffb347';
    rows.forEach((_, i) => g.fillText(i === 5 ? '♥' : 'aufs Haus', 490, 46 + i * 37));
  });
}

/** A soft round spot (for haloes, beams' ends, the mirror ball's spots), white on see-through. */
export function softDot(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A light beam's falloff: bright at the lamp (top), fading out along it and toward its edges. */
export function beamTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 256, (g) => {
    for (let x = 0; x < 64; x++) {
      const edge = Math.sin((x / 63) * Math.PI) ** 1.6;
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, `rgba(255,255,255,${0.95 * edge})`);
      grd.addColorStop(0.5, `rgba(255,255,255,${0.35 * edge})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 1, 256);
    }
  });
}

/** Haze: soft clouds, see-through, to lay through the hall's air. */
export function hazeTexture(): THREE.CanvasTexture {
  const r = mulberry32(77);
  return canvasTexture(256, 128, (g) => {
    for (let i = 0; i < 60; i++) {
      const x = r() * 256;
      const y = 20 + r() * 88;
      const rad = 20 + r() * 40;
      const grd = g.createRadialGradient(x, y, 1, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 128);
    }
  });
}

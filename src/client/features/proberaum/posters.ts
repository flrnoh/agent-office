import * as THREE from 'three';
import { BOLD, HAND, SANS, canvasTex, rng } from './paint';

/*
 * What's stuck, pinned and printed in the rehearsal wing (flrnoh fork, see FORK.md "The rehearsal
 * wing"): gig posters of made-up bands, a sheet of stickers for plastering the walls, flyers with
 * tear-off strips, the vending machine's and the string machine's fronts, the lockers, signs. Every
 * band and every word here is invented for the office.
 */

export interface PosterDef {
  band: string;
  line: string;
  bg: string;
  fg: string;
  accent: string;
  /** How the picture's drawn: a sunburst, a skull-less metal crest, a wave, a cassette, stars. */
  art: 'sun' | 'crest' | 'wave' | 'tape' | 'stars' | 'bolt';
  font?: string;
}

export const POSTERS: readonly PosterDef[] = [
  { band: 'VELVET FEEDBACK', line: 'Live im Schallwerk · Sa 21 Uhr', bg: '#f4e1b6', fg: '#2b1d3a', accent: '#d9472b', art: 'sun' },
  { band: 'KADAVERKRONE', line: 'Höllentour 2026 · Keller-Edition', bg: '#111111', fg: '#e8e8e8', accent: '#b3121b', art: 'crest', font: '"Copperplate", "Papyrus", serif' },
  { band: 'Die Lötkolben', line: 'Neues Album „Kurzschluss“', bg: '#ffe04d', fg: '#111', accent: '#1d4ed8', art: 'bolt' },
  { band: 'NEON LEMMINGS', line: 'Synth-Pop aus dem Proberaum 2', bg: '#1b0f3a', fg: '#ff4fd8', accent: '#36e7ff', art: 'wave' },
  { band: 'Kabelsalat', line: 'Unplugged? Niemals.', bg: '#e9efe6', fg: '#173d2b', accent: '#e07a1f', art: 'tape' },
  { band: 'STATIC PRETZELS', line: 'Bavarian Garage Rock · Eintritt frei', bg: '#2d5a8a', fg: '#fff4d6', accent: '#ffcf33', art: 'stars' },
  { band: 'Brummschleife', line: 'Doom aus Viechtach', bg: '#3a2f2a', fg: '#e6c79c', accent: '#8a2f1d', art: 'crest', font: '"Copperplate", serif' },
  { band: 'Feierabend Deluxe', line: 'Schlager-Punk · jeden Freitag', bg: '#ff8fab', fg: '#3b0a1f', accent: '#ffe066', art: 'sun' },
];

/** A gig poster (A2-ish: 512 × 724). */
export function posterTexture(p: PosterDef, seed = 1): THREE.CanvasTexture {
  const r = rng(seed * 31 + p.band.length);
  return canvasTex(512, 724, (g, w, h) => {
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.42;
    g.fillStyle = p.accent;
    g.strokeStyle = p.accent;
    switch (p.art) {
      case 'sun':
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.arc(cx, cy, w, a, a + Math.PI / 24);
          g.closePath();
          g.globalAlpha = 0.35;
          g.fill();
        }
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(cx, cy, w * 0.2, 0, Math.PI * 2);
        g.fill();
        break;
      case 'crest':
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(cx, cy - 150);
        g.lineTo(cx + 120, cy - 60);
        g.lineTo(cx + 90, cy + 110);
        g.lineTo(cx, cy + 170);
        g.lineTo(cx - 90, cy + 110);
        g.lineTo(cx - 120, cy - 60);
        g.closePath();
        g.stroke();
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.moveTo(cx + i * 40, cy - 100 + Math.abs(i) * 18);
          g.lineTo(cx + i * 20, cy + 120);
          g.stroke();
        }
        break;
      case 'wave':
        g.lineWidth = 6;
        for (let k = 0; k < 9; k++) {
          g.strokeStyle = k % 2 ? p.accent : p.fg;
          g.beginPath();
          for (let x = 0; x <= w; x += 8) g.lineTo(x, cy - 120 + k * 30 + Math.sin(x / 40 + k) * 26);
          g.stroke();
        }
        break;
      case 'tape':
        g.fillStyle = p.fg;
        g.fillRect(cx - 170, cy - 110, 340, 220);
        g.fillStyle = p.accent;
        g.fillRect(cx - 150, cy - 90, 300, 90);
        g.fillStyle = p.bg;
        for (const x of [cx - 70, cx + 70]) {
          g.beginPath();
          g.arc(x, cy + 40, 34, 0, Math.PI * 2);
          g.fill();
        }
        break;
      case 'stars':
        for (let i = 0; i < 40; i++) {
          g.fillStyle = r() < 0.5 ? p.accent : p.fg;
          star(g, r() * w, h * 0.12 + r() * h * 0.55, 6 + r() * 18);
        }
        break;
      case 'bolt':
        g.beginPath();
        g.moveTo(cx + 40, cy - 190);
        g.lineTo(cx - 90, cy + 20);
        g.lineTo(cx - 5, cy + 20);
        g.lineTo(cx - 50, cy + 200);
        g.lineTo(cx + 100, cy - 30);
        g.lineTo(cx + 15, cy - 30);
        g.closePath();
        g.fill();
        break;
    }
    g.fillStyle = p.fg;
    g.textAlign = 'center';
    fit(g, p.band, w - 40, 86, p.font ?? BOLD);
    g.fillText(p.band, cx, h * 0.84);
    g.font = `700 26px ${SANS}`;
    g.fillText(p.line, cx, h * 0.92);
    // Torn tape at the corners, a little wear.
    g.fillStyle = 'rgba(240,235,215,0.75)';
    for (const [x, y, a] of [
      [24, 18, -0.5],
      [w - 24, 18, 0.5],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillRect(-36, -12, 72, 24);
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 6; i++) g.fillRect(r() * w, 0, 2, h);
  });
}

function star(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fill();
}

/** Sets `g`'s font as big as `max` px fits `text` in `width`. */
export function fit(g: CanvasRenderingContext2D, text: string, width: number, max: number, family: string, weight = 900) {
  let size = max;
  do {
    g.font = `${weight} ${size}px ${family}`;
    size -= 2;
  } while (g.measureText(text).width > width && size > 10);
}

const STICKER_TEXTS = ['PROBE!', 'No Drummer\nNo Party', 'LAUTER!', 'Brummschleife', 'VELVET\nFEEDBACK', 'Kabelsalat', '♥ Analog', 'Gehörschutz\nist sexy', 'Die Lötkolben', 'KADAVER-\nKRONE', 'Stage\nDiver', 'Plektrum\nverloren?', '3. OG\nlinks', 'Zugabe!', 'Neon\nLemmings', '120 BPM', 'Bass ist\nBass', 'TAPE IT', '★ ★ ★', 'Ich war\nhier'];
const STICKER_COLORS = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#f4a261', '#ff70a6', '#2b2d42', '#ffffff', '#9b5de5', '#00bbf9'];

/**
 * A sheet of stickers on a clear background (1024 × 512), for plastering a wall: every shape and
 * colour, overlapping, some peeled. `seed` gives each wall its own.
 */
export function stickerTexture(seed: number, density = 1): THREE.CanvasTexture {
  const r = rng(seed);
  const t = canvasTex(1024, 512, (g, w, h) => {
    const n = Math.round(150 * density);
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const bg = STICKER_COLORS[Math.floor(r() * STICKER_COLORS.length)];
      const fg = bg === '#ffffff' || bg === '#ffd166' || bg === '#06d6a0' ? '#1d1d1d' : '#ffffff';
      const text = STICKER_TEXTS[Math.floor(r() * STICKER_TEXTS.length)];
      const s = 16 + r() * 22;
      g.save();
      g.translate(x, y);
      g.rotate((r() - 0.5) * 0.9);
      g.fillStyle = bg;
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      const shape = Math.floor(r() * 4);
      const lines = text.split('\n');
      g.font = `900 ${Math.round(s * 0.42)}px ${r() < 0.5 ? BOLD : SANS}`;
      const tw = Math.max(...lines.map((l) => g.measureText(l).width)) + s * 0.5;
      const th = lines.length * s * 0.46 + s * 0.4;
      g.beginPath();
      if (shape === 0) g.arc(0, 0, Math.max(tw, th) * 0.55, 0, Math.PI * 2);
      else if (shape === 1) g.roundRect(-tw / 2, -th / 2, tw, th, s * 0.25);
      else if (shape === 2) g.rect(-tw / 2, -th / 2, tw, th);
      else g.ellipse(0, 0, tw * 0.6, th * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      lines.forEach((l, k) => g.fillText(l, 0, (k - (lines.length - 1) / 2) * s * 0.46));
      // Peeled: a corner gone pale.
      if (r() < 0.25) {
        g.fillStyle = 'rgba(240,240,230,0.8)';
        g.beginPath();
        g.moveTo(tw / 2 - s * 0.3, -th / 2);
        g.lineTo(tw / 2, -th / 2);
        g.lineTo(tw / 2, -th / 2 + s * 0.3);
        g.fill();
      }
      g.restore();
    }
  });
  return t;
}

const FLYERS = [
  { title: 'Drummer sucht Band', body: 'Punk, Rock, alles\nmit Tempo. Eigenes Set.', tear: 'Drums 0170…' },
  { title: 'Bassist*in gesucht!', body: 'Indie-Band, probt\nDi + Do im Raum 2', tear: 'Bass 0151…' },
  { title: 'Verkaufe Combo-Amp', body: '50 Watt, Röhre, brummt\nnur ein bisschen', tear: 'Amp 0160…' },
  { title: 'Gesangsunterricht', body: 'Atmen, singen,\nnicht schreien (außer Metal)', tear: 'Sing 0176…' },
  { title: 'Wer hat mein Kabel?', body: 'Rotes Klinkenkabel, 6 m,\nhing an Haken 4', tear: 'Kabel 0157…' },
];

/** A flyer with tear-off strips (256 × 360). */
export function flyerTexture(i: number): THREE.CanvasTexture {
  const f = FLYERS[i % FLYERS.length];
  const r = rng(i + 5);
  return canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = ['#ffffff', '#fff7c2', '#d9f2ff', '#ffe0e6', '#e6ffd9'][i % 5];
    g.fillRect(0, 0, w, h - 70);
    g.fillStyle = '#1d1d1d';
    g.textAlign = 'center';
    fit(g, f.title, w - 24, 34, HAND, 700);
    g.fillText(f.title, w / 2, 56);
    g.font = `500 19px ${HAND}`;
    f.body.split('\n').forEach((l, k) => g.fillText(l, w / 2, 110 + k * 26));
    g.strokeStyle = '#1d1d1d';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w / 2, 200, 28, 0, Math.PI * 2);
    g.stroke();
    // The strips, a few torn off.
    const n = 7;
    for (let k = 0; k < n; k++) {
      if (r() < 0.35) continue;
      const x = (k * w) / n;
      g.fillStyle = ['#ffffff', '#fff7c2', '#d9f2ff', '#ffe0e6', '#e6ffd9'][i % 5];
      g.fillRect(x + 2, h - 70, w / n - 4, 70);
      g.save();
      g.translate(x + w / n / 2, h - 35);
      g.rotate(-Math.PI / 2);
      g.fillStyle = '#1d1d1d';
      g.font = `600 11px ${HAND}`;
      g.fillText(f.tear, 0, 4);
      g.restore();
    }
  });
}

/** The vending machine's front (256 × 480): a glass of rows of bottles and cans, the coin slot. */
export function vendingTexture(): THREE.CanvasTexture {
  return canvasTex(256, 480, (g, w, h) => {
    g.fillStyle = '#c1121f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = `900 30px ${BOLD}`;
    g.textAlign = 'center';
    g.fillText('KALT & LECKER', w / 2, 40);
    g.fillStyle = '#10141c';
    g.fillRect(14, 56, 170, 330);
    const items = ['#d62828', '#ff9f1c', '#8a5a12', '#3f7f3a', '#e9c46a', '#264653'];
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 4; col++) {
        const c = items[(row + col) % items.length];
        const x = 24 + col * 41;
        const y = 66 + row * 64;
        g.fillStyle = c;
        if (row % 2) g.fillRect(x + 6, y + 14, 24, 40);
        else {
          g.fillRect(x + 9, y + 18, 18, 36);
          g.fillRect(x + 14, y + 6, 8, 14);
        }
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(x + 10, y + 20, 3, 30);
        g.fillStyle = '#9aa0a6';
        g.fillRect(x, y + 56, 38, 3);
      }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(20, 56, 40, 330);
    g.fillStyle = '#2b2d42';
    g.fillRect(196, 70, 48, 120);
    g.fillStyle = '#39ff14';
    g.font = `700 16px monospace`;
    g.fillText('1,50', 220, 96);
    g.fillStyle = '#9aa0a6';
    for (let k = 0; k < 6; k++) g.fillRect(204 + (k % 2) * 18, 112 + Math.floor(k / 2) * 22, 14, 14);
    g.fillStyle = '#111';
    g.fillRect(212, 200, 16, 30);
    g.fillRect(24, 400, 150, 54);
    g.fillStyle = '#ffffff';
    g.font = `700 14px ${SANS}`;
    g.fillText('Mate · Spezi · Cola', w / 2, 474);
  });
}

/** The string machine's front (192 × 384): strings, sticks, picks, a 9-volt, earplugs, with prices. */
export function stringsTexture(): THREE.CanvasTexture {
  const items = [
    ['Saiten 10-46', '8 €'],
    ['Saiten 9-42', '7 €'],
    ['Bass-Saiten', '25 €'],
    ['Sticks 5A', '12 €'],
    ['Plektren x6', '3 €'],
    ['9V-Block', '4 €'],
    ['Ohrstöpsel', '1 €'],
    ['Gaffa', '9 €'],
  ];
  return canvasTex(192, 384, (g, w, h) => {
    g.fillStyle = '#1f3b57';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd166';
    g.textAlign = 'center';
    g.font = `900 24px ${BOLD}`;
    g.fillText('SAITEN-', w / 2, 30);
    g.fillText('AUTOMAT', w / 2, 56);
    items.forEach(([name, price], k) => {
      const y = 72 + k * 36;
      g.fillStyle = '#e8eef5';
      g.fillRect(12, y, w - 60, 30);
      g.fillStyle = '#1f3b57';
      g.font = `700 13px ${SANS}`;
      g.textAlign = 'left';
      g.fillText(name, 18, y + 20);
      g.fillStyle = '#ffd166';
      g.textAlign = 'right';
      g.fillText(price, w - 10, y + 20);
      g.fillStyle = '#9aa0a6';
      g.fillRect(w - 44, y + 4, 4, 22);
    });
  });
}

/** A row of six lockers' doors (768 × 512): numbers, vents, stickers, a padlock or two. */
export function lockerTexture(): THREE.CanvasTexture {
  const r = rng(9);
  return canvasTex(768, 512, (g, w, h) => {
    const n = 6;
    const lw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * lw;
      g.fillStyle = ['#5d7b6f', '#56746a', '#62806f'][i % 3];
      g.fillRect(x + 2, 0, lw - 4, h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 6; k++) g.fillRect(x + 24, 40 + k * 12, lw - 48, 5);
      g.fillStyle = '#f2f2f2';
      g.fillRect(x + lw / 2 - 22, 130, 44, 28);
      g.fillStyle = '#222';
      g.font = `800 20px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(String(i + 1), x + lw / 2, 151);
      g.fillStyle = '#c9c9c9';
      g.fillRect(x + lw - 30, 230, 10, 60);
      if (r() < 0.5) {
        g.fillStyle = '#d4a017';
        g.beginPath();
        g.roundRect(x + lw - 38, 290, 26, 30, 4);
        g.fill();
      }
      for (let k = 0; k < 3; k++) {
        g.save();
        g.translate(x + 20 + r() * (lw - 40), 330 + r() * 150);
        g.rotate((r() - 0.5) * 0.8);
        g.fillStyle = STICKER_COLORS[Math.floor(r() * STICKER_COLORS.length)];
        g.fillRect(-20, -12, 40, 24);
        g.restore();
      }
    }
  });
}

/** A lit sign: `text` in `fg` on `bg` (a lightbox, an exit sign). */
export function signTexture(text: string, fg: string, bg: string, w = 512, h = 128, font = BOLD): THREE.CanvasTexture {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fit(g, text, w - h * 0.4, h * 0.7, font);
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

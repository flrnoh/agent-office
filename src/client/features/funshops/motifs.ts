import { POSTCARD_MOTIFS, seeded, type MotifId } from '../../../shared/funshops';

// flrnoh fork (see FORK.md "Shops to walk into"): the fronts of the Post's postcards, the city drawn
// on a canvas: the skyline at night, the cinema, the park, the beach, the office, the arcade's neon.
// The same picture from the same motif on every page (seeded), so a card looks the same to both ends.

export const CARD_W = 480;
export const CARD_H = 300;

function sky(g: CanvasRenderingContext2D, top: string, bottom: string) {
  const s = g.createLinearGradient(0, 0, 0, CARD_H);
  s.addColorStop(0, top);
  s.addColorStop(1, bottom);
  g.fillStyle = s;
  g.fillRect(0, 0, CARD_W, CARD_H);
}

function skyline(g: CanvasRenderingContext2D, rnd: () => number, base: number, lit: number) {
  for (let x = -10; x < CARD_W;) {
    const w = 30 + rnd() * 50;
    const hh = 60 + rnd() * 150;
    g.fillStyle = `hsl(${230 + rnd() * 30}, 25%, ${12 + rnd() * 10}%)`;
    g.fillRect(x, base - hh, w, hh);
    for (let wy = base - hh + 8; wy < base - 8; wy += 12)
      for (let wx = x + 5; wx < x + w - 8; wx += 10)
        if (rnd() < lit) {
          g.fillStyle = rnd() < 0.8 ? '#ffd27a' : '#9ad1ff';
          g.fillRect(wx, wy, 5, 6);
        }
    x += w + 2;
  }
}

/** Draws motif `id` onto `g` (CARD_W × CARD_H), its name in a corner. */
export function drawMotif(g: CanvasRenderingContext2D, id: MotifId) {
  const rnd = seeded(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  g.save();
  switch (id) {
    case 'skyline':
      sky(g, '#0b1026', '#3a2a6a');
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
        g.fillRect(rnd() * CARD_W, rnd() * 140, 2, 2);
      }
      g.fillStyle = '#fdf6d8';
      g.beginPath();
      g.arc(390, 60, 26, 0, Math.PI * 2);
      g.fill();
      skyline(g, rnd, CARD_H, 0.35);
      break;
    case 'kino': {
      sky(g, '#1b1033', '#ff7b54');
      skyline(g, rnd, CARD_H - 40, 0.2);
      g.fillStyle = '#7a0019';
      g.fillRect(110, 110, 260, 190);
      g.fillStyle = '#ffe600';
      g.fillRect(90, 90, 300, 50);
      g.fillStyle = '#1d1d1d';
      g.font = 'bold 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('K I N O', 240, 128);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = i % 2 ? '#fff6a8' : '#ff9e00';
        g.beginPath();
        g.arc(100 + i * 21.5, 146, 4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2b0a12';
      g.fillRect(205, 220, 70, 80);
      break;
    }
    case 'park':
      sky(g, '#8ecae6', '#e0f4ff');
      g.fillStyle = '#6a994e';
      g.fillRect(0, 200, CARD_W, 100);
      g.fillStyle = '#d4a373';
      g.beginPath();
      g.moveTo(200, CARD_H);
      g.quadraticCurveTo(260, 230, 330, 200);
      g.lineTo(350, 200);
      g.quadraticCurveTo(290, 240, 280, CARD_H);
      g.fill();
      for (let i = 0; i < 7; i++) {
        const x = 30 + i * 70 + rnd() * 20;
        const y = 200 - rnd() * 20;
        g.fillStyle = '#6b4226';
        g.fillRect(x - 5, y - 40, 10, 50);
        g.fillStyle = `hsl(${95 + rnd() * 30}, 45%, ${30 + rnd() * 12}%)`;
        g.beginPath();
        g.arc(x, y - 60, 30 + rnd() * 12, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#8d6e63';
      g.fillRect(360, 240, 80, 8);
      g.fillRect(366, 248, 6, 18);
      g.fillRect(428, 248, 6, 18);
      break;
    case 'strand':
      sky(g, '#ff9e6d', '#ffd6a5');
      g.fillStyle = '#fff1b8';
      g.beginPath();
      g.arc(240, 175, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a6f97';
      g.fillRect(0, 175, CARD_W, 70);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = 'rgba(255,241,184,.55)';
        g.fillRect(200 + rnd() * 80 - 40, 182 + i * 7, 30 + rnd() * 40, 2);
      }
      g.fillStyle = '#e9c46a';
      g.fillRect(0, 245, CARD_W, 55);
      g.fillStyle = '#5c3d2e';
      g.fillRect(60, 160, 8, 90);
      g.fillStyle = '#386641';
      for (let a = 0; a < 5; a++) {
        g.beginPath();
        g.ellipse(64 + Math.cos(a * 1.3) * 30, 160 + Math.sin(a * 1.3) * 8, 34, 8, a * 1.3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'buero':
      sky(g, '#bde0fe', '#ffffff');
      skyline(g, rnd, CARD_H, 0.05);
      g.fillStyle = '#e5e5e5';
      g.fillRect(150, 40, 180, 260);
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++) {
          g.fillStyle = rnd() < 0.6 ? '#9ad1ff' : '#ffd27a';
          g.fillRect(164 + c * 33, 56 + r * 34, 22, 22);
        }
      g.fillStyle = '#2b2d42';
      g.fillRect(205, 270, 70, 30);
      g.fillStyle = '#e63946';
      g.font = 'bold 18px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('AGENT OFFICE', 240, 34);
      break;
    case 'spielhalle':
      sky(g, '#0b0b1a', '#1a1033');
      g.font = 'bold 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.shadowBlur = 24;
      g.shadowColor = '#ff00aa';
      g.fillStyle = '#ff7ad9';
      g.fillText('SPIELHALLE', 240, 120);
      g.shadowColor = '#00f0ff';
      g.fillStyle = '#9ff8ff';
      g.font = 'bold 34px system-ui, sans-serif';
      g.fillText('★ GREIFER ★ FOTOS ★', 240, 180);
      g.shadowBlur = 0;
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#ff2e88', '#3a86ff', '#7cff00', '#ffe600'][i];
        g.fillRect(40 + i * 110, 220, 70, 80);
        g.fillStyle = '#0b1320';
        g.fillRect(50 + i * 110, 230, 50, 36);
      }
      break;
  }
  g.restore();
  // The motif's name, like a printed postcard's.
  const name = POSTCARD_MOTIFS.find((m) => m.id === id)?.name ?? '';
  g.save();
  g.font = 'italic bold 18px Georgia, serif';
  g.textAlign = 'left';
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 4;
  g.fillText(`Grüße aus der Stadt · ${name}`, 14, CARD_H - 14);
  g.restore();
}

/** A motif as a canvas element of its own. */
export function motifCanvas(id: MotifId, cls = 'post-front'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  c.className = cls;
  drawMotif(c.getContext('2d')!, id);
  return c;
}

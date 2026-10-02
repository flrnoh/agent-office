import { GIG_KINDS, POSTER_COLORS, type Gig } from '../../../shared/venueshow';

// The SCHALLWERK's gig posters (flrnoh fork, see FORK.md "The show"), drawn on a canvas from the
// gig: its title big, what kind of night, the date and the time, a line of who else is playing, and
// the house's name, in one of six looks (a classic gig poster, neon, punk xerox, rave, seventies,
// Swiss minimal) in its colour. The poster wall in the hall hangs them, and the building's façade
// frames and marquee may too (gigs.ts, `gigPoster`).

export const POSTER_W = 512;
export const POSTER_H = 724;

const DAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const two = (n: number) => String(n).padStart(2, '0');
/** "FR 16.10.", "20:00" in the page's own time. */
export function gigDate(start: number): { day: string; date: string; time: string; long: string } {
  const d = new Date(start);
  const day = DAYS[d.getDay()];
  const date = `${two(d.getDate())}.${two(d.getMonth() + 1)}.`;
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return { day, date, time, long: `${day} ${date}${d.getFullYear()} · ${time} Uhr` };
}

const HEAVY = '"Impact", "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
const BLACK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const THIN = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** Splits `text` into lines that fit `width` at `font`'s size, as few and as big as it can (down to `min`). */
function fit(g: CanvasRenderingContext2D, text: string, width: number, font: (px: number) => string, max: number, min: number, maxLines = 3): { lines: string[]; px: number } {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  for (let px = max; px >= min; px -= 4) {
    g.font = font(px);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width <= width || !line) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= width)) return { lines, px };
  }
  g.font = font(min);
  return { lines: [text.toUpperCase().slice(0, 24)], px: min };
}

/** A seeded random, so a gig's poster is the same every time it's drawn. */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws `gig`'s poster onto `c` (POSTER_W × POSTER_H, or any size of that shape). */
export function drawPoster(c: HTMLCanvasElement, gig: Pick<Gig, 'id' | 'title' | 'kind' | 'start' | 'text' | 'style' | 'color'>): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const W = POSTER_W;
  const H = POSTER_H;
  g.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
  const accent = POSTER_COLORS[gig.color] ?? POSTER_COLORS[0];
  const r = seeded(gig.id || gig.title);
  const when = gigDate(gig.start);
  const kind = gig.kind === 'club' ? 'CLUBNACHT' : GIG_KINDS.konzert.toUpperCase();
  g.textBaseline = 'alphabetic';
  g.textAlign = 'center';
  g.shadowBlur = 0;
  const text = gig.text ?? '';
  switch (gig.style) {
    case 1: {
      // Neon: night blue, a grid running off to the horizon, the title in glowing tubes.
      g.fillStyle = '#07051a';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(179,136,255,0.35)';
      g.lineWidth = 2;
      for (let i = 0; i <= 12; i++) {
        g.beginPath();
        g.moveTo(W / 2 + (i - 6) * 18, H * 0.62);
        g.lineTo(W / 2 + (i - 6) * 120, H);
        g.stroke();
      }
      for (let k = 0; k < 7; k++) {
        const y = H * 0.62 + (H * 0.38 * (k / 7) ** 1.7);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      neon(g, 'SCHALLWERK', W / 2, 70, `40px ${BLACK}`, '#ffffff', accent);
      const t = fit(g, gig.title, W - 70, (px) => `${px}px ${BLACK}`, 92, 34);
      t.lines.forEach((l, i) => neon(g, l, W / 2, 210 + i * t.px * 1.05, `${t.px}px ${BLACK}`, '#fff6ff', accent));
      neon(g, `${when.day} ${when.date}`, W / 2, H * 0.6, `64px ${HEAVY}`, '#ffffff', '#3a86ff');
      neon(g, `${when.time} · ${kind}`, W / 2, H * 0.6 + 54, `30px ${BLACK}`, '#ffffff', '#ff3d81');
      if (text) neon(g, text.slice(0, 48), W / 2, H - 40, `20px ${THIN}`, '#ffffff', accent);
      break;
    }
    case 2: {
      // Punk: photocopied paper, ransom-note letters, tape, scrawl.
      g.fillStyle = '#efeadf';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
        g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
      }
      g.fillStyle = '#111';
      g.fillRect(0, H * 0.06, W, 64);
      g.fillStyle = '#efeadf';
      g.font = `46px ${HEAVY}`;
      g.fillText('SCHALLWERK PRÄSENTIERT', W / 2, H * 0.06 + 50);
      const t = fit(g, gig.title, W - 60, (px) => `${px}px ${HEAVY}`, 120, 40);
      let y = 190;
      for (const l of t.lines) {
        let x = (W - g.measureText(l).width) / 2;
        for (const ch of l) {
          const w = g.measureText(ch).width;
          g.save();
          g.translate(x + w / 2, y);
          g.rotate((r() - 0.5) * 0.22);
          const bg = r() < 0.5 ? accent : '#111';
          g.fillStyle = bg;
          g.fillRect(-w / 2 - 4, -t.px * 0.86, w + 8, t.px * 1.02);
          g.fillStyle = bg === '#111' ? '#efeadf' : '#111';
          g.fillText(ch, 0, 0);
          g.restore();
          x += w + 3;
        }
        y += t.px * 1.12;
      }
      tape(g, 40, 20, -0.3);
      tape(g, W - 120, H - 70, 0.25);
      g.fillStyle = '#111';
      g.font = `bold 58px ${HEAVY}`;
      g.fillText(`${when.day} ${when.date}`, W / 2, H * 0.72);
      g.font = `26px ${BLACK}`;
      g.fillText(`${when.time} · ${kind} · EINTRITT FREI`, W / 2, H * 0.72 + 44, W - 40);
      if (text) {
        g.font = `italic 22px ${THIN}`;
        g.fillText(text.slice(0, 44), W / 2, H * 0.86);
      }
      break;
    }
    case 3: {
      // Rave: an acid gradient, rings pulsing out of the middle, chrome type.
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, accent);
      grad.addColorStop(0.5, '#ff00aa');
      grad.addColorStop(1, '#00e5ff');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      for (let k = 14; k > 0; k--) {
        g.beginPath();
        g.arc(W / 2, H * 0.42, k * 30, 0, Math.PI * 2);
        g.fillStyle = k % 2 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)';
        g.fill();
      }
      const t = fit(g, gig.title, W - 60, (px) => `italic ${px}px ${BLACK}`, 96, 34);
      t.lines.forEach((l, i) => chrome(g, l, W / 2, H * 0.4 - ((t.lines.length - 1) * t.px) / 2 + i * t.px, `italic ${t.px}px ${BLACK}`));
      g.fillStyle = '#000';
      g.fillRect(0, H - 150, W, 150);
      g.fillStyle = '#fff';
      g.font = `52px ${HEAVY}`;
      g.fillText(`${when.day} ${when.date} · ${when.time}`, W / 2, H - 92);
      g.font = `24px ${BLACK}`;
      g.fillStyle = accent;
      g.fillText(`${kind} IM SCHALLWERK`, W / 2, H - 56);
      if (text) {
        g.fillStyle = '#fff';
        g.font = `18px ${THIN}`;
        g.fillText(text.slice(0, 50), W / 2, H - 24);
      }
      break;
    }
    case 4: {
      // Seventies: a sunset of stripes, rounded type, a starburst with the date.
      g.fillStyle = '#fbeed2';
      g.fillRect(0, 0, W, H);
      const stripes = ['#e85d04', '#f48c06', '#faa307', '#ffba08', accent];
      stripes.forEach((col, i) => {
        g.fillStyle = col;
        g.beginPath();
        g.arc(W / 2, H * 0.62, 300 - i * 46, Math.PI, 0);
        g.fill();
      });
      g.fillStyle = '#3d2c1e';
      g.fillRect(0, H * 0.62, W, H * 0.38);
      const t = fit(g, gig.title, W - 60, (px) => `${px}px ${BLACK}`, 84, 32);
      g.fillStyle = '#3d2c1e';
      t.lines.forEach((l, i) => g.fillText(l, W / 2, 110 + i * t.px * 1.05));
      g.fillStyle = '#fbeed2';
      g.font = `56px ${HEAVY}`;
      g.fillText(`${when.day} ${when.date}`, W / 2, H * 0.62 + 92);
      g.font = `30px ${BLACK}`;
      g.fillStyle = '#ffba08';
      g.fillText(`${when.time} · ${kind}`, W / 2, H * 0.62 + 140);
      g.fillStyle = '#fbeed2';
      g.font = `20px ${THIN}`;
      if (text) g.fillText(text.slice(0, 48), W / 2, H * 0.62 + 180);
      g.font = `26px ${BLACK}`;
      g.fillText('~ SCHALLWERK ~', W / 2, H - 24);
      break;
    }
    case 5: {
      // Swiss minimal: white, a big day number, a red bar, a strict grid of small type.
      g.fillStyle = '#f7f7f2';
      g.fillRect(0, 0, W, H);
      g.fillStyle = accent === '#f1faee' ? '#e63946' : accent;
      g.fillRect(36, 36, 18, H - 72);
      g.textAlign = 'left';
      g.fillStyle = '#111';
      g.font = `bold 230px ${THIN}`;
      g.fillText(two(new Date(gig.start).getDate()), 70, 250);
      g.font = `bold 34px ${THIN}`;
      g.fillText(`${when.day} ${when.date} ${when.time}`, 76, 300);
      const t = fit(g, gig.title, W - 110, (px) => `bold ${px}px ${THIN}`, 64, 26, 4);
      t.lines.forEach((l, i) => g.fillText(l, 76, 400 + i * t.px * 1.1));
      g.font = `20px ${THIN}`;
      g.fillStyle = '#555';
      if (text) g.fillText(text.slice(0, 46), 76, H - 110);
      g.fillStyle = '#111';
      g.font = `bold 22px ${THIN}`;
      g.fillText(`${kind} — SCHALLWERK`, 76, H - 60);
      g.textAlign = 'center';
      break;
    }
    default: {
      // The classic gig poster: the house's band on top, the title stacked huge, halftone dots, the date block.
      g.fillStyle = accent;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < H; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < W; x += 14) {
        const k = 1 - y / H;
        g.beginPath();
        g.arc(x, y, 1 + 4.5 * k * k, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#111';
      g.fillRect(0, 0, W, 76);
      g.fillStyle = accent;
      g.font = `52px ${HEAVY}`;
      g.fillText('SCHALLWERK', W / 2, 58);
      const t = fit(g, gig.title, W - 50, (px) => `${px}px ${HEAVY}`, 150, 46);
      g.fillStyle = '#111';
      t.lines.forEach((l, i) => g.fillText(l, W / 2, 110 + t.px + i * t.px * 0.95));
      g.fillStyle = '#111';
      g.fillRect(30, H - 220, W - 60, 190);
      g.fillStyle = '#fff';
      g.font = `72px ${HEAVY}`;
      g.fillText(`${when.day} ${when.date}`, W / 2, H - 140);
      g.font = `34px ${BLACK}`;
      g.fillStyle = accent;
      g.fillText(`${when.time} · ${kind}`, W / 2, H - 92);
      g.fillStyle = '#fff';
      g.font = `20px ${THIN}`;
      if (text) g.fillText(text.slice(0, 46), W / 2, H - 52);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function neon(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, core: string, glow: string) {
  g.font = font;
  g.shadowColor = glow;
  for (const blur of [28, 14, 6]) {
    g.shadowBlur = blur;
    g.fillStyle = glow;
    g.fillText(text, x, y);
  }
  g.shadowBlur = 0;
  g.fillStyle = core;
  g.fillText(text, x, y);
}

function chrome(g: CanvasRenderingContext2D, text: string, x: number, y: number, font: string) {
  g.font = font;
  const grad = g.createLinearGradient(0, y - 60, 0, y + 10);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#c9d2e3');
  grad.addColorStop(0.5, '#5b6274');
  grad.addColorStop(1, '#ffffff');
  g.lineWidth = 10;
  g.lineJoin = 'round';
  g.strokeStyle = '#111';
  g.strokeText(text, x, y);
  g.fillStyle = grad;
  g.fillText(text, x, y);
}

function tape(g: CanvasRenderingContext2D, x: number, y: number, a: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(240,230,170,0.75)';
  g.fillRect(0, 0, 110, 32);
  g.restore();
}

/** A fresh canvas with `gig`'s poster, `w` wide. */
export function gigPoster(gig: Pick<Gig, 'id' | 'title' | 'kind' | 'start' | 'text' | 'style' | 'color'>, w = POSTER_W): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((w * POSTER_H) / POSTER_W);
  return drawPoster(c, gig);
}

import { BALLS, laneName, type LaneView, type LeagueBoard } from '../../../shared/bowling-game';
import { sheet, score, type Celebration } from '../../../shared/bowling-score';

/*
 * What the bowling centre's screens show (flrnoh fork, see FORK.md "Bowling lanes"), drawn on
 * canvases: the overhead monitors' classic score sheet (a row per bowler, ten frames with their little
 * ball boxes, splits circled, the running totals, the bowler up lit), their celebrations (STRIKE!,
 * SPARE!, TURKEY!, a pin explosion, a split's two lonely pins), the consoles' screens, and the league's
 * big board. Cosmic bowling turns them neon.
 */

export const SHEET_W = 1024;
export const SHEET_H = 640;
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

interface Theme {
  bg: [string, string];
  grid: string;
  box: string;
  text: string;
  dim: string;
  up: string;
  mark: string;
  accent: string;
}
const DAY: Theme = { bg: ['#0e2a5c', '#071631'], grid: '#3d6bb8', box: '#0a1d3f', text: '#f2f6ff', dim: '#8fb0e6', up: '#ffd23a', mark: '#ff5a5a', accent: '#5ad1ff' };
const NEON: Theme = { bg: ['#14002b', '#05000f'], grid: '#ff3bd4', box: '#12002a', text: '#e9fffe', dim: '#9b7bff', up: '#b6ff3b', mark: '#3bf6ff', accent: '#ff3bd4' };

/** What a celebration says, big. */
export const CELEBRATION_TEXT: Record<Exclude<Celebration, null>, string> = {
  strike: 'STRIKE!',
  double: 'DOUBLE!',
  turkey: 'TURKEY!',
  hambone: 'HAMBONE!',
  perfect: 'PERFEKT! 300',
  spare: 'SPARE!',
  split: 'SPLIT…',
  foul: 'FOUL!',
};

export interface SheetShow {
  /** A celebration playing: which, and how far in (0–1). */
  party?: { kind: Exclude<Celebration, null> | 'gutter'; k: number; who: string } | null;
  cosmic: boolean;
  /** Who's rolling right now (the ball's on the lane). */
  rolling?: string | null;
}

/** A lane's score sheet, for its overhead monitor. */
export function drawSheet(g: CanvasRenderingContext2D, view: LaneView | null, show: SheetShow) {
  const T = show.cosmic ? NEON : DAY;
  const W = SHEET_W;
  const H = SHEET_H;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bg[0]);
  bg.addColorStop(1, T.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  // The header: the lane, the game, whose ball.
  g.fillStyle = T.accent;
  g.font = `900 46px ${FONT}`;
  g.textAlign = 'left';
  g.fillText(`BAHN ${view ? laneName(view.lane) : ''}`, 24, 38);
  g.font = `800 28px ${FONT}`;
  g.fillStyle = T.dim;
  g.textAlign = 'right';
  const up = view?.players.find((p) => p.id === view.up);
  g.fillText(view?.over ? 'Spiel vorbei · E an der Konsole: neues Spiel' : up ? `${show.rolling ? '🎳 ' : ''}${up.name} ist dran` : 'Frei · E an der Konsole: mitspielen', W - 24, 38);
  const players = view?.players ?? [];
  if (!players.length) {
    g.textAlign = 'center';
    g.fillStyle = T.text;
    g.font = `900 64px ${FONT}`;
    g.fillText('🎳 Bahn frei!', W / 2, H / 2 - 10);
    g.font = `700 30px ${FONT}`;
    g.fillStyle = T.dim;
    g.fillText('Bis zu sechs pro Bahn · Kugel an der Rückgabe', W / 2, H / 2 + 52);
  } else {
    const top = 76;
    const rowH = Math.min(92, (H - top - 12) / Math.max(players.length, 1));
    const nameW = 170;
    const totW = 110;
    const fw = (W - 24 - nameW - totW) / 10;
    players.forEach((p, i) => {
      const y = top + i * rowH;
      const isUp = p.id === view!.up;
      g.fillStyle = isUp ? (show.cosmic ? 'rgba(182,255,59,.16)' : 'rgba(255,210,58,.16)') : 'rgba(0,0,0,0)';
      g.fillRect(12, y, W - 24, rowH - 4);
      // The name, a dot of their colour, their ball's weight.
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(26, y + rowH / 2, 7, 0, Math.PI * 2);
      g.fill();
      g.textAlign = 'left';
      g.fillStyle = isUp ? T.up : T.text;
      g.font = `800 ${Math.min(30, rowH * 0.36)}px ${FONT}`;
      g.fillText(clipText(g, p.name, nameW - 34), 40, y + rowH * 0.4);
      g.fillStyle = T.dim;
      g.font = `700 ${Math.min(20, rowH * 0.24)}px ${FONT}`;
      g.fillText(`${BALLS[p.ball]?.lbs ?? 12} lbs`, 40, y + rowH * 0.75);
      const frames = sheet(p.rolls);
      for (let f = 0; f < 10; f++) {
        const x = 12 + nameW + f * fw;
        g.strokeStyle = T.grid;
        g.lineWidth = 2;
        g.fillStyle = T.box;
        g.fillRect(x, y, fw - 3, rowH - 4);
        g.strokeRect(x, y, fw - 3, rowH - 4);
        // The ball boxes along the top right.
        const boxes = f === 9 ? 3 : 2;
        const bw = Math.min(30, (fw - 3) / (f === 9 ? 3.2 : 2.4));
        const bh = Math.min(30, rowH * 0.38);
        for (let k = 0; k < boxes; k++) {
          const bx = x + fw - 3 - (boxes - k) * bw;
          g.strokeRect(bx, y, bw, bh);
          const m = frames[f].marks[k];
          if (!m) continue;
          g.textAlign = 'center';
          g.font = `900 ${bh * 0.8}px ${FONT}`;
          g.fillStyle = m === 'X' || m === '/' ? T.mark : m === 'F' ? '#ff9a3a' : T.text;
          if (m === 'X') {
            g.fillRect(bx + 3, y + 3, bw - 6, bh - 6);
            g.fillStyle = T.box;
            g.fillText('X', bx + bw / 2, y + bh / 2 + 1);
          } else if (m === '/') {
            g.beginPath();
            g.moveTo(bx + bw - 3, y + 3);
            g.lineTo(bx + 3, y + bh - 3);
            g.lineTo(bx + bw - 3, y + bh - 3);
            g.closePath();
            g.fill();
          } else g.fillText(m, bx + bw / 2, y + bh / 2 + 1);
          if (frames[f].splits[k]) {
            g.strokeStyle = T.mark;
            g.beginPath();
            g.arc(bx + bw / 2, y + bh / 2, bh * 0.42, 0, Math.PI * 2);
            g.stroke();
            g.strokeStyle = T.grid;
          }
        }
        const total = frames[f].total;
        if (total !== null) {
          g.textAlign = 'center';
          g.fillStyle = T.text;
          g.font = `800 ${Math.min(30, rowH * 0.36)}px ${FONT}`;
          g.fillText(String(total), x + (fw - 3) / 2, y + rowH * 0.7);
        }
      }
      // The total so far.
      g.textAlign = 'center';
      g.fillStyle = isUp ? T.up : T.text;
      g.font = `900 ${Math.min(40, rowH * 0.48)}px ${FONT}`;
      g.fillText(String(score(p.rolls)), W - 12 - totW / 2, y + rowH / 2);
    });
  }
  if (show.party) drawParty(g, show.party, T, show.cosmic);
}

function clipText(g: CanvasRenderingContext2D, text: string, w: number): string {
  if (g.measureText(text).width <= w) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > w) t = t.slice(0, -1);
  return `${t}…`;
}

/** A celebration over the sheet: the word big and bouncing, and pins flying (a strike) or two left (a split). */
function drawParty(g: CanvasRenderingContext2D, p: NonNullable<SheetShow['party']>, T: Theme, cosmic: boolean) {
  const W = SHEET_W;
  const H = SHEET_H;
  const k = p.k;
  const fade = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
  g.save();
  g.globalAlpha = fade * 0.88;
  g.fillStyle = cosmic ? '#0a0018' : '#04112b';
  g.fillRect(0, 0, W, H);
  g.globalAlpha = fade;
  const big = p.kind === 'strike' || p.kind === 'double' || p.kind === 'turkey' || p.kind === 'hambone' || p.kind === 'perfect';
  // Pins: flying out for a strike, wobbling for a spare, two alone for a split, a sad ball in the gutter.
  const cx = W / 2;
  const cy = H * 0.62;
  for (let i = 0; i < 10; i++) {
    const row = i < 1 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3;
    const col = i - [0, 1, 3, 6][row];
    const px = cx + (col - row / 2) * 56;
    const py = cy - row * 40;
    let x = px;
    let y = py;
    let rot = 0;
    if (big) {
      const a = (i * 2.4 + 1) % (Math.PI * 2);
      const t = Math.min(1, k * 1.6);
      x += Math.cos(a) * 520 * t;
      y += Math.sin(a) * 260 * t - 380 * t + 520 * t * t;
      rot = t * (i % 2 ? 9 : -9);
    } else if (p.kind === 'split' && i !== 6 && i !== 9) continue;
    else if (p.kind === 'gutter') break;
    else if (p.kind === 'spare') rot = Math.sin(k * 30 + i) * 0.2 * (1 - k);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    pinShape(g, 0, 0, 70, cosmic);
    g.restore();
  }
  if (p.kind === 'gutter') {
    g.fillStyle = cosmic ? '#3bf6ff' : '#5ad1ff';
    const bx = W * 0.15 + k * W * 0.7;
    g.beginPath();
    g.arc(bx, cy, 34, 0, Math.PI * 2);
    g.fill();
  }
  const bounce = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.18;
  g.translate(W / 2, H * 0.3);
  g.scale(bounce, bounce);
  g.textAlign = 'center';
  g.font = `900 ${big ? 150 : 120}px ${FONT}`;
  g.lineWidth = 14;
  g.strokeStyle = cosmic ? '#2a0050' : '#0b1a44';
  const text = p.kind === 'gutter' ? 'GUTTER…' : CELEBRATION_TEXT[p.kind];
  g.strokeText(text, 0, 0);
  const grad = g.createLinearGradient(0, -70, 0, 70);
  grad.addColorStop(0, cosmic ? '#b6ff3b' : '#fff27a');
  grad.addColorStop(1, cosmic ? '#ff3bd4' : '#ff8a1d');
  g.fillStyle = p.kind === 'split' || p.kind === 'gutter' || p.kind === 'foul' ? T.dim : grad;
  g.fillText(text, 0, 0);
  g.font = `800 40px ${FONT}`;
  g.fillStyle = T.text;
  g.fillText(p.who, 0, 100);
  g.restore();
}

/** A pin for the screens: `s` tall, its base at (x, y). */
function pinShape(g: CanvasRenderingContext2D, x: number, y: number, s: number, cosmic: boolean) {
  g.fillStyle = cosmic ? '#efe6ff' : '#fbfaf6';
  g.beginPath();
  g.ellipse(x, y - s * 0.32, s * 0.17, s * 0.3, 0, 0, Math.PI * 2);
  g.ellipse(x, y - s * 0.83, s * 0.1, s * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - s * 0.065, y - s * 0.74, s * 0.13, s * 0.22);
  g.fillStyle = cosmic ? '#ff3bd4' : '#e0283c';
  g.fillRect(x - s * 0.07, y - s * 0.67, s * 0.14, s * 0.035);
  g.fillRect(x - s * 0.07, y - s * 0.6, s * 0.14, s * 0.035);
}

// ---- The consoles' screens ----------------------------------------------------------------------

export const CONSOLE_W = 320;
export const CONSOLE_H = 200;
/** A console's screen: the lane, who's on and who's up. */
export function drawConsole(g: CanvasRenderingContext2D, view: LaneView | null, lane: number, cosmic: boolean) {
  const T = cosmic ? NEON : DAY;
  g.fillStyle = T.bg[1];
  g.fillRect(0, 0, CONSOLE_W, CONSOLE_H);
  g.fillStyle = T.accent;
  g.font = `900 34px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText(`Bahn ${laneName(lane)}`, 14, 10);
  g.font = `700 20px ${FONT}`;
  const players = view?.players ?? [];
  g.fillStyle = T.dim;
  g.textAlign = 'right';
  g.fillText(`${players.length}/6`, CONSOLE_W - 14, 18);
  g.textAlign = 'left';
  players.slice(0, 6).forEach((p, i) => {
    g.fillStyle = p.id === view?.up ? T.up : T.text;
    g.fillText(`${p.id === view?.up ? '▶ ' : ''}${p.name}`.slice(0, 22), 14, 56 + i * 23);
    g.textAlign = 'right';
    g.fillText(String(score(p.rolls)), CONSOLE_W - 14, 56 + i * 23);
    g.textAlign = 'left';
  });
  if (!players.length) {
    g.fillStyle = T.text;
    g.fillText('Frei – E zum Mitspielen', 14, 70);
  }
}

// ---- The league board ---------------------------------------------------------------------------

export const BOARD_W = 1024;
export const BOARD_H = 648;

/** The ISO week number of a Monday (YYYY-MM-DD). */
export function isoWeek(monday: string): number {
  const [y, m, d] = monday.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 3)); // its Thursday decides the year
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** The league's big board on the wall: this week's table, last week's champion, the all-time records. */
export function drawBoard(g: CanvasRenderingContext2D, b: LeagueBoard | null, cosmic: boolean) {
  const T = cosmic ? NEON : DAY;
  const W = BOARD_W;
  const H = BOARD_H;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, cosmic ? '#1a0036' : '#2a0f12');
  bg.addColorStop(1, cosmic ? '#05000f' : '#120608');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = cosmic ? '#ff3bd4' : '#d4a24c';
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = cosmic ? '#b6ff3b' : '#ffd36b';
  g.font = `900 52px ${FONT}`;
  g.fillText(`🏆 Wochenliga${b ? ` · KW ${isoWeek(b.week)}` : ''}`, 30, 52);
  g.font = `700 22px ${FONT}`;
  g.fillStyle = T.dim;
  g.fillText('Schnitt der besten 3 Spiele (Mo–So)', 34, 96);
  const rows = b?.table ?? [];
  if (!rows.length) {
    g.fillStyle = T.text;
    g.font = `800 30px ${FONT}`;
    g.fillText('Noch keiner diese Woche – auf geht’s!', 34, 160);
  }
  rows.slice(0, 8).forEach((r, i) => {
    const y = 140 + i * 50;
    g.fillStyle = i === 0 ? (cosmic ? '#b6ff3b' : '#ffd36b') : T.text;
    g.font = `900 30px ${FONT}`;
    g.fillText(`${i + 1}.`, 34, y);
    g.font = `800 30px ${FONT}`;
    g.fillText(clipText(g, r.name, 300), 84, y);
    g.textAlign = 'right';
    g.fillText(r.avg.toFixed(1), 540, y);
    g.font = `700 20px ${FONT}`;
    g.fillStyle = T.dim;
    g.fillText(`${Math.min(r.games, 3)}/3 · best ${r.best}`, 540, y + 22);
    g.textAlign = 'left';
  });
  // The right column: the champion, and the records.
  const x = 590;
  g.fillStyle = cosmic ? '#ff3bd4' : '#ffd36b';
  g.font = `900 30px ${FONT}`;
  g.fillText('👑 Champion letzte Woche', x, 150);
  g.fillStyle = T.text;
  g.font = `800 34px ${FONT}`;
  g.fillText(b?.champion ? clipText(g, `${b.champion.name} · ${b.champion.avg.toFixed(1)}`, 400) : '–', x, 196);
  const rec = (y: number, label: string, value: string) => {
    g.fillStyle = T.dim;
    g.font = `700 22px ${FONT}`;
    g.fillText(label, x, y);
    g.fillStyle = T.text;
    g.font = `800 28px ${FONT}`;
    g.fillText(clipText(g, value, 400), x, y + 32);
  };
  const high = b?.high[0];
  const avg = b?.average[0];
  const strikes = b?.strikes[0];
  const perfect = b?.perfect[0];
  rec(268, 'Höchstes Spiel', high ? `${high.score} · ${high.name}` : '–');
  rec(350, 'Bester Schnitt (ab 5 Spielen)', avg ? `${avg.avg.toFixed(1)} · ${avg.name}` : '–');
  rec(432, 'Meiste Strikes', strikes ? `${strikes.strikes} · ${strikes.name}` : '–');
  rec(514, 'Perfekte Spiele (300)', perfect ? `${perfect.count}× ${perfect.name}` : 'noch keins');
  g.fillStyle = T.dim;
  g.font = `700 20px ${FONT}`;
  g.fillText('E: Liga & Bestenliste', x, 606);
}

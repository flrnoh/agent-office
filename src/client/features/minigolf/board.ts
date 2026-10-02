import type * as THREE from 'three';
import { COURSE_PAR, HOLES } from '../../../shared/minigolf-holes';
import { MG_COLORS, cardTotal, toPar, type MgView } from '../../../shared/minigolf';

/*
 * The scorecard board on the mini golf's south wall (flrnoh fork, see FORK.md "Black-light mini
 * golf"), in glowing chalk on black: who's out on the course, on which hole, how they stand; the best
 * rounds ever and this week; the holes in one. Drawn again whenever it changes.
 */

const FONT = '"Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif';

function neon(g: CanvasRenderingContext2D, color: string, blur: number, draw: () => void) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.strokeStyle = color;
  draw();
  g.restore();
}

export function drawBoard(board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }, view: MgView | null) {
  const c = board.canvas;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.fillStyle = '#06020f';
  g.fillRect(0, 0, W, H);
  // Faint grid of a scorecard.
  g.strokeStyle = 'rgba(177,77,255,0.12)';
  g.lineWidth = 1;
  for (let y = 120; y < H; y += 44) {
    g.beginPath();
    g.moveTo(30, y);
    g.lineTo(W - 30, y);
    g.stroke();
  }
  g.textBaseline = 'middle';
  neon(g, '#ff2bd6', 22, () => {
    g.font = `900 58px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('SCHWARZLICHT-MINIGOLF', W / 2, 52);
  });
  neon(g, '#c9a6ff', 6, () => {
    g.font = `700 22px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(`9 Bahnen · Par ${COURSE_PAR} · max. 7 Schläge pro Bahn`, W / 2, 98);
  });
  // Left: who's out on the course.
  const left = 40;
  neon(g, '#00e5ff', 10, () => {
    g.font = `800 30px ${FONT}`;
    g.textAlign = 'left';
    g.fillText('Auf dem Platz', left, 148);
  });
  const players = [...(view?.players ?? [])].sort((a, b) => (b.hole || 99) - (a.hole || 99)).slice(0, 9);
  if (!players.length) {
    neon(g, '#8d74b8', 4, () => {
      g.font = `600 24px ${FONT}`;
      g.fillText('Noch frei – Schläger & Bälle am Eingang!', left, 196);
    });
  }
  players.forEach((p, i) => {
    const y = 196 + i * 44;
    const color = MG_COLORS[p.color % MG_COLORS.length][0];
    neon(g, color, 14, () => {
      g.beginPath();
      g.arc(left + 12, y, 10, 0, Math.PI * 2);
      g.fill();
    });
    neon(g, '#ffffff', 4, () => {
      g.font = `800 26px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(p.name.length > 16 ? `${p.name.slice(0, 15)}…` : p.name, left + 34, y);
    });
    neon(g, color, 8, () => {
      g.font = `700 24px ${FONT}`;
      g.textAlign = 'right';
      const where = p.hole ? `Bahn ${p.hole}${p.rolling ? ' ●' : ''}` : 'fertig';
      g.fillText(where, left + 470, y);
      g.fillText(`${cardTotal(p.card)} (${toPar(p.card)})`, left + 620, y);
    });
  });
  // Right: the best rounds, this week's, and the holes in one.
  const right = W / 2 + 130;
  const list = (title: string, color: string, y0: number, rows: MgView['best']) => {
    neon(g, color, 10, () => {
      g.font = `800 30px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(title, right, y0);
    });
    if (!rows.length) {
      neon(g, '#8d74b8', 4, () => {
        g.font = `600 22px ${FONT}`;
        g.fillText('– noch frei –', right, y0 + 44);
      });
    }
    rows.slice(0, 5).forEach((r, i) => {
      const y = y0 + 44 + i * 38;
      neon(g, '#ffffff', 4, () => {
        g.font = `700 24px ${FONT}`;
        g.textAlign = 'left';
        g.fillText(`${i + 1}. ${r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name}`, right, y);
      });
      neon(g, color, 8, () => {
        g.textAlign = 'right';
        g.font = `800 26px ${FONT}`;
        g.fillText(String(r.total), W - 40, y);
      });
    });
  };
  list('🏆 Bestenliste', '#fffb00', 148, view?.best ?? []);
  list('📅 Diese Woche', '#39ff14', 148 + 44 + 5 * 38 + 20, view?.week ?? []);
  neon(g, '#ff7a00', 12, () => {
    g.font = `800 24px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(`★ ${view?.aces ?? 0} Hole-in-One${view?.aces === 1 ? '' : 's'} ★   ·   ${HOLES.length} Bahnen, alle verschieden   ·   Tab: Scorekarte`, W / 2, H - 30);
  });
  board.texture.needsUpdate = true;
}

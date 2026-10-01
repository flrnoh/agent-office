import * as THREE from 'three';
import { SUIT_SYMBOL, isRed, rankLabel, type PokerView } from '../../../shared/casino-poker';
import { FONT } from './parts';

/*
 * The poker table's felt in the room (flrnoh fork, see shared/casino-poker.ts): "Texas Hold'em"
 * when nobody's playing, and the board and the pot while a hand's on, so people walking past see
 * the game. Redrawn only when the board or the pot changes.
 */

const W = 512;
const H = 256;
const FELT = '#1b5f8a';

export interface PokerFelt {
  texture: THREE.CanvasTexture;
  set(state: unknown): void;
}

export function pokerFelt(): PokerFelt {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let drawn = '';

  const draw = (v: PokerView | null) => {
    const board = v?.board ?? [];
    const pot = v && v.street !== 'idle' ? v.pot : 0;
    const key = `${board.join('')}|${pot}`;
    if (key === drawn) return;
    drawn = key;
    g.fillStyle = FELT;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,225,150,0.75)';
    g.lineWidth = 5;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (!board.length && !pot) {
      g.fillStyle = 'rgba(255,235,180,0.85)';
      g.font = `900 ${Math.floor(H * 0.14)}px ${FONT}`;
      g.fillText('TEXAS HOLD’EM', W / 2, H * 0.55);
      g.font = `700 ${Math.floor(H * 0.07)}px ${FONT}`;
      g.fillText('No limit · play chips only', W / 2, H * 0.72);
    } else {
      // Five places for the board, the cards dealt so far face up.
      const cw = 64;
      const ch = 92;
      const gap = 12;
      const x0 = (W - (5 * cw + 4 * gap)) / 2;
      const y0 = 44;
      for (let i = 0; i < 5; i++) {
        const x = x0 + i * (cw + gap);
        const c = board[i];
        g.lineWidth = 3;
        if (!c) {
          g.strokeStyle = 'rgba(255,231,176,0.35)';
          g.setLineDash([6, 5]);
          g.strokeRect(x, y0, cw, ch);
          g.setLineDash([]);
          continue;
        }
        g.fillStyle = '#fffdf6';
        g.fillRect(x, y0, cw, ch);
        g.strokeStyle = '#2b2d42';
        g.strokeRect(x, y0, cw, ch);
        g.fillStyle = isRed(c) ? '#c8102e' : '#1d1f33';
        g.font = `900 34px ${FONT}`;
        g.fillText(rankLabel(c), x + cw / 2, y0 + 30);
        g.font = `900 32px ${FONT}`;
        g.fillText(SUIT_SYMBOL[c[1]], x + cw / 2, y0 + 66);
      }
      if (pot) {
        g.fillStyle = '#ffe7b0';
        g.font = `900 28px ${FONT}`;
        g.fillText(`POT ${pot.toLocaleString('en-US')}`, W / 2, y0 + ch + 36);
      }
    }
    texture.needsUpdate = true;
  };
  draw(null);

  return {
    texture,
    set(state) {
      const v = state && typeof state === 'object' && (state as PokerView).kind === 'poker' ? (state as PokerView) : null;
      draw(v);
    },
  };
}

import { SAUNA_BY_ID, type SaunaId } from '../../shared/therme-dorf';

// The Saunadorf's Aufguss board (flrnoh fork, see shared/therme-dorf.ts): the next Aufgüsse by the
// office's clock, the one on now at the top, glowing.

const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

export function drawAufgussBoard(board: { canvas: HTMLCanvasElement; texture: { needsUpdate: boolean } }, plan: readonly { sauna: SaunaId; start: number; running: boolean }[], now: number) {
  const { canvas } = board;
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#2a1a0f';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9965f';
  g.lineWidth = 10;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = '#ffcf8a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 54px ${FONT}`;
  g.fillText('🔥 AUFGUSSPLAN', W / 2, 62);
  g.font = `600 24px ${FONT}`;
  g.globalAlpha = 0.75;
  g.fillText('Saunadorf · bitte Ruhe', W / 2, 104);
  g.globalAlpha = 1;
  plan.forEach((a, i) => {
    const s = SAUNA_BY_ID.get(a.sauna)!;
    const y = 170 + i * 82;
    if (a.running) {
      g.fillStyle = 'rgba(255,140,60,0.25)';
      g.fillRect(24, y - 34, W - 48, 68);
    }
    g.textAlign = 'left';
    g.fillStyle = a.running ? '#ffffff' : '#f3dcc0';
    g.font = `800 36px ${FONT}`;
    const time = new Date(a.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    g.fillText(a.running ? 'JETZT' : time, 44, y);
    g.fillText(`${s.emoji} ${s.name}`, 210, y);
    g.textAlign = 'right';
    g.font = `600 28px ${FONT}`;
    const mins = Math.max(0, Math.ceil((a.start - now) / 60_000));
    g.fillText(a.running ? `${s.temp} °C` : `in ${mins} min`, W - 44, y);
  });
  board.texture.needsUpdate = true;
}

/** The entrance hall's info board: when the next waves come, and the next Aufgüsse. */
export function drawInfoBoard(board: { canvas: HTMLCanvasElement; texture: { needsUpdate: boolean } }, waves: { big: string; small: string }, plan: readonly { sauna: SaunaId; start: number; running: boolean }[]) {
  const { canvas } = board;
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#10303f';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3fb6c9';
  g.lineWidth = 10;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#bff4ff';
  g.font = `900 40px ${FONT}`;
  g.fillText('🌊 WELLENBAD', W / 2, 54);
  g.fillStyle = '#ffffff';
  g.font = `800 34px ${FONT}`;
  g.fillText(`${waves.big} · ${waves.small}`, W / 2, 104, W - 40);
  g.fillStyle = '#ffcf8a';
  g.font = `900 40px ${FONT}`;
  g.fillText('🔥 AUFGÜSSE IM SAUNADORF', W / 2, 176);
  plan.slice(0, 3).forEach((a, i) => {
    const s = SAUNA_BY_ID.get(a.sauna)!;
    const time = a.running ? 'jetzt' : new Date(a.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    g.fillStyle = a.running ? '#ffffff' : '#f3dcc0';
    g.font = `700 32px ${FONT}`;
    g.fillText(`${time} · ${s.emoji} ${s.name}`, W / 2, 236 + i * 62);
  });
  board.texture.needsUpdate = true;
}

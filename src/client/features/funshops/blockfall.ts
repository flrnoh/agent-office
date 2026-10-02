import { Blocks, H, W, paintScreen } from '../cabinet/blocks';
import { h, openModal } from '../../ui/dom';
import './ui.css';

// flrnoh fork (see FORK.md "Shops to walk into"): a cabinet in the Spielhalle plays the office's own
// arcade game, BLOCKFALL (features/cabinet/blocks.ts), for you alone: no high-score table, nobody
// watching (that's the lounge's cabinet). ← → move, ↑ or X turns, Z turns back, ↓ drops softly,
// Space drops, C holds, P pauses. ✕ or Esc closes it, straight back to the game.

export function openBlockfall(opts: { sound(kind: 'land' | 'clear' | 'over', lines?: number): void }) {
  const canvas = h('canvas', {
    width: W,
    height: H,
    style: 'width:100%;max-width:640px;display:block;margin:0 auto;border-radius:10px',
  }) as HTMLCanvasElement;
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h(
    'div.modal.claw-modal',
    { role: 'dialog', 'aria-label': 'BLOCKFALL' },
    h('header', {}, h('h2', {}, '🕹️ BLOCKFALL'), close),
    h('div.body', {}, canvas),
    h('footer', {}, h('span.grow', {}, '← → move · ↑/X turn · Z back · ↓ soft · Space drop · C hold · P pause · Enter: new game')),
  );
  let game = new Blocks();
  let raf = 0;
  let last = performance.now() / 1000;
  let over = false;
  const hook = () => (game.onLand = (n) => opts.sound(n ? 'clear' : 'land', n));
  hook();
  const g = canvas.getContext('2d')!;
  const modal = openModal(el, {
    doing: '🕹️ playing BLOCKFALL in the Spielhalle',
    onClose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
    },
  });
  close.addEventListener('click', () => modal.close());
  function onKey(e: KeyboardEvent) {
    if (e.code === 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && e.code !== 'ArrowDown') return;
    if (e.code === 'Enter' && game.over) {
      game = new Blocks();
      over = false;
      return hook();
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') game.press(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') game.press(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyX' || e.code === 'KeyW') game.rotate(1);
    else if (e.code === 'KeyZ') game.rotate(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') game.softDrop(true);
    else if (e.code === 'Space') game.hardDrop();
    else if (e.code === 'KeyC') game.hold();
    else if (e.code === 'KeyP') game.pause(game.state !== 'paused');
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') game.release(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') game.release(1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') game.softDrop(false);
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  function frame() {
    const now = performance.now() / 1000;
    game.update(Math.min(0.1, now - last));
    last = now;
    if (game.over && !over) {
      over = true;
      opts.sound('over');
    }
    paintScreen(g, {
      frame: game.frame(),
      player: 'Du',
      scores: [],
      prompt: game.over ? 'ENTER: NOCHMAL' : undefined,
      t: now,
    });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return modal;
}

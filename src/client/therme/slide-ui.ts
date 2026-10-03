import { LEVELS, SLIDES, rideTime, type SlideBoards } from '../../shared/therme-slides';
import { h, openModal } from '../ui/dom';
import type { RidePhoto } from './slides';

// The Rutschenwelt's windows (flrnoh fork, see shared/therme-slides.ts): the lift's buttons, and at the
// kiosk every slide's board with your last ride photo to save. Each has a ✕ top right; ✕ or Esc goes
// straight back to the game.

const closeButton = () => h('button.btn.close', { 'aria-label': 'Schließen' }, '✕');

/** The lift: down to the ground, or up to a platform (what goes from each). */
export function openLift(here: number, go: (level: number) => void) {
  const close = closeButton();
  const stops = [-1, 0, 1, 2].filter((l) => l !== here);
  const list = h(
    'ul.svc-list',
    {},
    ...stops.map((l) => {
      const li = h(
        'li',
        { tabindex: 0, role: 'button', title: l < 0 ? 'Nach unten' : `Ebene ${l + 1}` },
        h('span.jb-icon', { style: 'font-size:26px' }, l < 0 ? '⬇️' : '⬆️'),
        h('div.svc-main', {}, h('div.svc-title', {}, l < 0 ? 'Unten · Landebecken' : `Ebene ${l + 1} · ${LEVELS[l]} m`), h('div.svc-meta', {}, l < 0 ? 'zurück auf den Boden' : SLIDES.filter((s) => s.level === l).map((s) => `${s.emoji} ${s.name}`).join(' · '))),
      );
      const pick = () => {
        modal.close();
        go(l);
      };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          pick();
        }
      });
      return li;
    }),
  );
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': 'Aufzug' }, h('header', {}, h('h2', {}, '🛗 Aufzug · Rutschenturm'), close), h('div.body', {}, list));
  const modal = openModal(el, { doing: '🛗 in the slide tower lift' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (list.querySelector('li') as HTMLElement | null)?.focus(), 30);
}

/** Every slide's board (the best ten), and your last ride's photo to save. */
export function openBoards(boards: SlideBoards, photo: RidePhoto | null, you: string) {
  const close = closeButton();
  const body = h('div.body', { style: 'display:grid;gap:14px;max-height:70vh;overflow:auto' });
  if (photo) {
    const src = photo.canvas.toDataURL('image/jpeg', 0.92);
    body.append(
      h('img', { src, alt: 'Dein Fahrfoto', style: 'width:100%;max-width:720px;border-radius:10px;justify-self:center' }),
      h('a.btn.primary', { download: `thermenwelt-fahrfoto-${photo.slide}.jpg`, href: src, style: 'justify-self:center' }, '💾 Foto speichern'),
    );
  } else body.append(h('p', { style: 'opacity:.75;text-align:center' }, 'Noch kein Fahrfoto: rutsch eine Runde, kurz vor dem Ende blitzt es.'));
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px' });
  for (const s of SLIDES) {
    const rows = boards[s.id] ?? [];
    grid.append(
      h(
        'div',
        { style: 'background:rgba(255,255,255,.05);border-radius:10px;padding:10px' },
        h('strong', {}, `${s.emoji} ${s.name}`),
        h('div', { style: 'opacity:.7;font-size:.85em;margin-bottom:6px' }, s.blurb),
        h(
          'ol',
          { style: 'margin:0;padding-left:1.4em' },
          ...(rows.length ? rows.map((r) => h('li', { style: r.name === you ? 'font-weight:800;color:#ffd166' : '' }, `${r.name} · ${rideTime(r.ms)}`)) : [h('li', { style: 'opacity:.6' }, 'noch frei')]),
        ),
      ),
    );
  }
  body.append(grid);
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': 'Bestzeiten', style: 'width:min(92vw,980px)' }, h('header', {}, h('h2', {}, '🏁 Bestzeiten · Rutschenwelt'), close), body);
  const modal = openModal(el, { doing: '🏁 at the slides’ board' });
  close.addEventListener('click', () => modal.close());
}

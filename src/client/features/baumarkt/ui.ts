import { PAINTS, TOOLS, type ToolId } from '../../../shared/baumarkt-play';
import { h, openModal } from '../../ui/dom';
import './ui.css';

// The Baumarkt's two windows (flrnoh fork, see FORK.md "The Baumarkt"): the tool wall (E there: take a
// tool to try, or put back the one you hold) and the paint shaker's colour chart (E at the paint
// counter). ✕ top right or Esc closes either, straight back to looking around.

/** A list item that does `pick` on a click, Enter or Space. */
function choice(icon: string | HTMLElement, title: string, meta: string, pick: () => void, on = false): HTMLElement {
  const li = h(`li${on ? '.on' : ''}`, { tabindex: 0, role: 'button', title }, typeof icon === 'string' ? h('span.jb-icon', { style: 'font-size:26px' }, icon) : icon, h('div.svc-main', {}, h('div.svc-title', {}, title), h('div.svc-meta', {}, meta)));
  li.addEventListener('click', pick);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // (or the office's own Enter, with the window gone, would open the chat)
      e.stopPropagation();
      pick();
    }
  });
  return li;
}

function frame(title: string, label: string, body: HTMLElement, footer: string, doing: string) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h('div.modal.jukebox.bm-window', { role: 'dialog', 'aria-label': label }, h('header', {}, h('h2', {}, title), close), body, h('footer', {}, h('span.grow', {}, footer)));
  const modal = openModal(el, { doing });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]') as HTMLElement | null)?.focus(), 30);
  return modal;
}

export function openToolWall(o: { holding: ToolId | null; pick(id: ToolId): void; putBack(): void }) {
  const body = h('div.body', {});
  const modal = frame('🔨 Werkzeugwand', 'The tool wall', body, 'Zum Ausprobieren: click to use it, Q puts it back. It stays in the store.', '🔨 at the Baumarkt’s tool wall');
  const list = h(
    'ul.svc-list',
    {},
    ...TOOLS.map((t) =>
      choice(t.emoji, t.name, t.blurb, () => {
        modal.close();
        o.pick(t.id);
      }, t.id === o.holding),
    ),
    ...(o.holding
      ? [
          choice('↩️', 'Put it back', 'Hang what you hold back on the wall', () => {
            modal.close();
            o.putBack();
          }),
        ]
      : []),
  );
  body.append(list);
}

export function openPaints(o: { mix(i: number): void }) {
  const body = h('div.body', {});
  const modal = frame('🎨 Farbmischmaschine', 'The paint shaker', body, 'Pick a colour: it goes in the shaker, and the can’s yours. Alles aufs Haus.', '🎨 at the Baumarkt’s paint shaker');
  const grid = h(
    'ul.svc-list.bm-paints',
    {},
    ...PAINTS.map((p, i) =>
      choice(h('span.bm-swatch', { style: `background:${p.color}` }), p.name, 'one litre, matt', () => {
        modal.close();
        o.mix(i);
      }),
    ),
  );
  body.append(grid);
}

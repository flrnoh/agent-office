import { BOWLING_MENU, SHOE_SIZES } from '../../shared/bowling-house';
import { DRINK_BY_ID, type Drink } from '../../shared/rooftop';
import { h, openModal } from '../ui/dom';
import './ui.css';

// The bowling centre's two little windows (flrnoh fork, see FORK.md "The bowling centre"): the counter's
// menu (beer, soft drinks, fries, currywurst, nachos, all on the house) and the shoe rental's sizes.

/** Picks one with a click, Enter or Space, without the office's own Enter opening the chat. */
function pickable(el: HTMLElement, pick: () => void) {
  el.addEventListener('click', pick);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick();
    }
  });
}

/** What it does for you, for the menu. */
function effect(d: Drink): string {
  if (d.strength > 0) return '🍺 goes to your head a little';
  if (d.strength < 0) return '🥨 soaks up a beer';
  return 'no alcohol';
}

/** The counter: what you pick is poured or fried and handed over. `cut`: you've had enough beer for now. */
export function openBowlingCounter(opts: { cut: boolean; order(d: Drink): void }) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const items = BOWLING_MENU.map((id) => DRINK_BY_ID.get(id)).filter((d): d is Drink => !!d);
  const row = (d: Drink) => {
    const beer = d.strength > 0;
    const li = h(
      'li',
      { tabindex: 0, role: 'button', title: `${d.name} bestellen`, class: beer && opts.cut ? 'bw-off' : '' },
      h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
      h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, beer && opts.cut ? 'Toni says you’ve had enough for now' : `${d.blurb} · ${effect(d)}`)),
    );
    pickable(li, () => {
      if (beer && opts.cut) return;
      modal.close();
      opts.order(d);
    });
    return li;
  };
  const drinks = items.filter((d) => !['pommes', 'currywurst', 'nachos'].includes(d.id));
  const food = items.filter((d) => ['pommes', 'currywurst', 'nachos'].includes(d.id));
  const heading = (text: string, first = false) => h('h3', { style: `margin:${first ? 0 : 16}px 0 8px;font-size:15px` }, text);
  const body = h('div.body', {}, heading('🍺 Vom Fass & aus der Flasche', true), h('ul.svc-list', {}, ...drinks.map(row)), heading('🍟 Aus der Fritteuse'), h('ul.svc-list', {}, ...food.map(row)));
  const el = h('div.modal.jukebox.bw-counter', { role: 'dialog', 'aria-label': 'Theke' }, h('header', {}, h('h2', {}, '🎳 Theke'), close), body, h('footer', {}, h('span.grow', {}, 'Alles aufs Haus. Mit zur Bahn nehmen, oder mit ins Büro.')));
  const modal = openModal(el, { doing: '🍟 at the bowling counter' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]:not(.bw-off)') as HTMLElement | null)?.focus(), 30);
}

/** The shoe rental: pick your size (EU), or give back the pair you're wearing. */
export function openShoeRental(opts: { wearing: number | null; rent(size: number): void; giveBack(): void }) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const sizes = SHOE_SIZES.map((s) => {
    const b = h('button.btn.bw-size', { type: 'button', class: s === opts.wearing ? 'on' : '', title: `Größe ${s}` }, String(s));
    pickable(b, () => {
      modal.close();
      if (s !== opts.wearing) opts.rent(s);
    });
    return b;
  });
  const back = opts.wearing
    ? h('button.btn.bw-back', { type: 'button' }, `👟 Größe ${opts.wearing} zurückgeben`)
    : null;
  if (back)
    pickable(back, () => {
      modal.close();
      opts.giveBack();
    });
  const el = h(
    'div.modal.bw-shoes',
    { role: 'dialog', 'aria-label': 'Schuhverleih' },
    h('header', {}, h('h2', {}, '👟 Schuhverleih'), close),
    h('div.body', {}, h('p.bw-note', {}, opts.wearing ? 'Andere Größe? Tauschen ist kein Problem.' : 'Welche Größe? Ohne Bowlingschuhe geht’s nicht auf die Bahn.'), h('div.bw-sizes', {}, ...sizes), back),
    h('footer', {}, h('span.grow', {}, 'Frisch desinfiziert. Beim Rausgehen bleiben sie hier.')),
  );
  const modal = openModal(el, { doing: '👟 renting bowling shoes' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (el.querySelector('.bw-size.on, .bw-size') as HTMLElement | null)?.focus(), 30);
}

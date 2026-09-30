import { CAFE_ITEMS, type CafeItem } from '../../shared/cafe';
import { h, openModal } from './dom';

// The café up on the padel hall's gallery (flrnoh fork, see FORK.md "The padel hall"): E at its
// counter opens the menu, like the kitchen fridge's (ui/fridge.ts). Pick something and it's handed
// over the counter into your hand.

export interface CafeOptions {
  order(item: CafeItem): void;
  /** Closed without ordering (✕ or Esc), or after. */
  onClose?(): void;
}

/** What it does for you, for the menu. */
function effect(d: CafeItem): string {
  if (d.coffee) return '☕ a minute of buzz';
  if (d.caffeine > 0) return '☕ a little buzz';
  if (d.strength < 0) return d.section === 'cakes' ? '🥨 soaks up a beer' : '💧 clears your head a little';
  if (d.section === 'cakes') return 'a few bites';
  return 'no alcohol';
}

/** The menu at the counter: coffee, cold drinks, cakes and bakes. */
export function openCafe(opts: CafeOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const list = (section: CafeItem['section']) =>
    h(
      'ul.svc-list',
      {},
      ...CAFE_ITEMS.filter((d) => d.section === section).map((d) => {
        const li = h(
          'li',
          { tabindex: 0, role: 'button', title: `Order a ${d.name}` },
          h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
          h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, `${d.blurb} · ${effect(d)}`)),
        );
        const pick = () => {
          modal.close();
          opts.order(d);
        };
        li.addEventListener('click', pick);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            // (or the office's own Enter, with the menu gone, would open the chat)
            e.stopPropagation();
            pick();
          }
        });
        return li;
      }),
    );
  const heading = (text: string, first = false) => h('h3', { style: `margin:${first ? 0 : 16}px 0 8px;font-size:15px` }, text);
  const body = h('div.body', {}, heading('☕ Coffee & tea', true), list('coffee'), heading('🥤 Cold drinks'), list('cold'), heading('🍰 Cakes & bakes'), list('cakes'));
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Café menu' },
    h('header', {}, h('h2', {}, '☕ Café Netzroller'), close),
    body,
    h('footer', {}, h('span.grow', {}, 'Everything’s on the house. Take it to a table by the railing, or along to the office.')),
  );
  const modal = openModal(el, { doing: '☕ at the café', onClose: () => opts.onClose?.() });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]') as HTMLElement | null)?.focus(), 30);
}

import { TANK_ITEMS, type TankItem } from '../../../shared/tankshop';
import { BRAND } from '../../../shared/tankstelle';
import { h, openModal } from '../../ui/dom';

// The FLOGGE OIL shop's till (flrnoh fork, see FORK.md "The petrol station"): E at the counter opens
// it, like the beach kiosk's menu (features/beach/ui.ts). Pick something and the cashier hands it over.

export interface TankShopOptions {
  order(item: TankItem): void;
  /** Closed (bought something, ✕ or Esc). */
  onClose?(): void;
}

/** What it does for you, for the menu. */
function effect(d: TankItem): string {
  if (d.coffee) return '☕ a minute of quicker feet';
  if (d.caffeine) return '⚡ a jolt of buzz';
  if (d.strength < 0) return '🥨 soaks up a beer';
  if (d.glass === 'newspaper') return '📰 something to read';
  return 'for the road';
}

export function openTankShop(opts: TankShopOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const list = h(
    'ul.svc-list',
    {},
    ...TANK_ITEMS.map((d) => {
      const li = h(
        'li',
        { tabindex: 0, role: 'button', title: `${d.name}, please` },
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
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': `${BRAND} Shop` },
    h('header', {}, h('h2', {}, `🛒 ${BRAND} Shop`), close),
    h('div.body', {}, list),
    h('footer', {}, h('span.grow', {}, 'Geht aufs Haus: there’s no money in the office. Gute Fahrt!')),
  );
  const modal = openModal(el, { doing: '🛒 at the petrol station', onClose: () => opts.onClose?.() });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (list.querySelector('li') as HTMLElement | null)?.focus(), 30);
}

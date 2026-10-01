import { KIOSK_ITEMS, type KioskItem } from '../../../shared/kiosk';
import { h, openModal } from '../../ui/dom';

// The beach kiosk's menu (flrnoh fork, see FORK.md "A day at the beach"): E at its counter opens it,
// like the padel hall café's (ui/cafe.ts). Pick something and Uschi hands it over the counter.

export interface KioskOptions {
  /** Had enough beer: the Radler stays in the fridge. */
  cutOff: boolean;
  order(item: KioskItem): void;
  /** Closed (ordered, ✕ or Esc). */
  onClose?(): void;
}

/** What it does for you, for the menu. */
function effect(d: KioskItem): string {
  if (d.strength > 0) return '🌀 goes down easy';
  if (d.treat === 'brainfreeze') return '🥶 careful: brain freeze';
  if (d.treat === 'spicy') return '🔥 mit scharf';
  if (d.treat === 'seagull') return '🐦 mind the seagulls';
  if (d.treat === 'tropical') return '🏝️ holiday feeling';
  if (d.strength < 0) return '🥨 soaks up a beer';
  return 'no alcohol';
}

export function openKiosk(opts: KioskOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const list = (section: KioskItem['section']) =>
    h(
      'ul.svc-list',
      {},
      ...KIOSK_ITEMS.filter((d) => d.section === section).map((d) => {
        const refused = opts.cutOff && d.strength > 0;
        const li = h(
          'li',
          {
            tabindex: refused ? -1 : 0,
            role: 'button',
            'aria-disabled': String(refused),
            title: refused ? "You've had enough: how about an Eistee?" : `Order ${d.name}`,
            style: refused ? 'opacity:.45;cursor:not-allowed' : '',
          },
          h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
          h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, `${d.blurb} · ${effect(d)}`)),
        );
        const pick = () => {
          if (refused) return;
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
  const body = h(
    'div.body',
    {},
    opts.cutOff ? h('p.setting-note', { style: 'margin:0 0 12px;font-weight:800' }, "🙅 Uschi says you've had enough beer for now. Pommes soak it up.") : null,
    heading('🍟 Imbiss', true),
    list('food'),
    heading('🍦 Eis'),
    list('ice'),
    heading('🥥 Drinks'),
    list('drinks'),
  );
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Kiosk zur Möwe' },
    h('header', {}, h('h2', {}, '🍟 Kiosk zur Möwe'), close),
    body,
    h('footer', {}, h('span.grow', {}, 'Alles aufs Haus. Take it down to the water, or along to the office.')),
  );
  const modal = openModal(el, { doing: '🍟 at the beach kiosk', onClose: () => opts.onClose?.() });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]') as HTMLElement | null)?.focus(), 30);
}

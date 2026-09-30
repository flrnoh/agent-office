import { FRIDGE_ITEMS, type FridgeItem } from '../../shared/fridge';
import { h, openModal } from './dom';

// The kitchen fridge (flrnoh fork, see FORK.md): E at it opens the door on this, like the rooftop
// bar's menu (ui/bar.ts). Pick a bottle, a can or a snack and it's in your hand.

export interface FridgeOptions {
  /** Had enough: the beer stays in the fridge. */
  cutOff: boolean;
  grab(item: FridgeItem): void;
  /** The door swings shut (grabbed something, ✕ or Esc). */
  onClose?(): void;
}

/** What it does to you, for the list. */
function effect(d: FridgeItem): string {
  if (d.strength > 0) return d.strength >= 0.2 ? '🌀 a beer’s worth' : '🌀 goes down easy';
  if (d.strength < 0) return d.section === 'snacks' ? '🥨 soaks up the beer' : '💧 sobers you up a little';
  if (d.caffeine >= 30) return '⚡ a proper buzz';
  if (d.caffeine > 0) return '☕ a little buzz';
  return d.section === 'snacks' ? 'a few bites' : 'no alcohol';
}

/** The open fridge: drinks on the top shelves, snacks at the bottom. */
export function openFridge(opts: FridgeOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const shelf = (section: FridgeItem['section']) =>
    h(
      'ul.svc-list',
      {},
      ...FRIDGE_ITEMS.filter((d) => d.section === section).map((d) => {
        const refused = opts.cutOff && d.strength > 0;
        const li = h(
          'li',
          {
            tabindex: refused ? -1 : 0,
            role: 'button',
            'aria-disabled': String(refused),
            title: refused ? "You've had enough: have a Sprudel" : `Grab a ${d.name}`,
            style: refused ? 'opacity:.45;cursor:not-allowed' : '',
          },
          h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
          h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, `${d.blurb} · ${effect(d)}`)),
        );
        const pick = () => {
          if (refused) return;
          modal.close();
          opts.grab(d);
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
    opts.cutOff ? h('p.setting-note', { style: 'margin:0 0 12px;font-weight:800' }, "🙅 You've had enough beer for now. There's Sprudel, and a Brezn soaks it up.") : null,
    heading('🥤 Drinks', true),
    shelf('drinks'),
    heading('🥨 Snacks'),
    shelf('snacks'),
  );
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Fridge' },
    h('header', {}, h('h2', {}, '🧊 Fridge'), close),
    body,
    h('footer', {}, h('span.grow', {}, 'Help yourself. Whatever you grab comes along, up to the roof too.')),
  );
  const modal = openModal(el, { onClose: () => opts.onClose?.() });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]') as HTMLElement | null)?.focus(), 30);
}

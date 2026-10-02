import { BIKE_KINDS, BIKES, type BikeKind } from '../../../shared/ride';
import { h, openModal } from '../../ui/dom';

// The bike shop's counter (flrnoh fork, see FORK.md "Shops to walk into"): pick a bike to rent, or
// give back the one you have. Its ✕ is top right; ✕ or Esc goes straight back to the game.

export interface RentOptions {
  keeper: string;
  /** The bike you have out now, if any. */
  rented: BikeKind | null;
  rent(k: BikeKind): void;
  giveBack(): void;
}

export function openRental(o: RentOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const body = h('div.body', {});
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': 'Fahrradladen' }, h('header', {}, h('h2', {}, '🚲 Fahrradverleih'), close), body, h('footer', {}, h('span.grow', {}, `Leihen ist umsonst. ${o.keeper} will's nur heil zurück.`)));
  const modal = openModal(el, { doing: '🚲 at the bike shop' });
  close.addEventListener('click', () => modal.close());
  const row = (icon: string, title: string, meta: string, go: () => void) => {
    const li = h('li', { tabindex: 0, role: 'button', title }, h('span.jb-icon', { style: 'font-size:26px' }, icon), h('div.svc-main', {}, h('div.svc-title', {}, title), h('div.svc-meta', {}, meta)));
    const pick = () => {
      modal.close();
      go();
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
  };
  body.replaceChildren(
    o.rented ? h('p.setting-note', { style: 'margin:0 0 12px;font-weight:800' }, `You have the ${BIKES[o.rented].name} out. Swap it, or give it back.`) : '',
    h('ul.svc-list', {}, ...BIKE_KINDS.map((k) => row(BIKES[k].emoji, BIKES[k].name, `${BIKES[k].blurb} · up to ${Math.round(BIKES[k].tuning.top * 3.6)} km/h`, () => o.rent(k))), ...(o.rented ? [row('↩️', 'Give it back', 'Leave it here with the others', o.giveBack)] : [])),
  );
  setTimeout(() => (body.querySelector('li') as HTMLElement | null)?.focus(), 30);
}

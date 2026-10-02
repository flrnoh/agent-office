import { DRINK_BY_ID, type Drink, type DrinkId } from '../../../shared/rooftop';
import { FLAVOURS, iceId, type FlavourKey } from '../../../shared/shopwares-food';
import { MENUS } from '../../../shared/shopwares';
import { h, openModal } from '../../ui/dom';

// The ice cream parlour's window (flrnoh fork, see FORK.md "Shops to walk into", food round 2): a
// cone or a cup, two or three scoops of six flavours, or one of the specials. ✕ top right; ✕ or Esc
// goes straight back to the game.

export interface IcePickOptions {
  keeper: string;
  order(item: Drink): void;
}

/** Picking your ice cream at the parlour's counter: everything's free. */
export function openIcePicker(o: IcePickOptions) {
  let cone = true;
  let scoops: FlavourKey[] = [];
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const body = h('div.body', {});
  const done = h('button.btn.primary', { type: 'button', disabled: true }, 'Bitte!');
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': 'Eisdiele' }, h('header', {}, h('h2', {}, '🍨 Eiscafé Venezia'), close), body, h('footer', {}, h('span.grow', {}, `Alles aufs Haus. ${o.keeper} freut sich.`), done));
  const modal = openModal(el, { doing: '🍨 picking ice cream' });
  close.addEventListener('click', () => modal.close());
  const pick = (d: Drink | undefined) => {
    if (!d) return;
    modal.close();
    o.order(d);
  };
  done.addEventListener('click', () => scoops.length >= 2 && pick(DRINK_BY_ID.get(iceId(cone, scoops) as DrinkId)));
  const chip = (label: string, on: boolean, click: () => void, color?: string) => {
    const b = h('button.btn', { type: 'button', 'aria-pressed': String(on), style: `${on ? 'outline:3px solid var(--accent, #2a9d8f);' : ''}display:inline-flex;gap:6px;align-items:center;margin:0 6px 6px 0` }, color ? h('span', { style: `display:inline-block;width:16px;height:16px;border-radius:50%;background:${color};border:1px solid #0003` }) : '', label);
    b.addEventListener('click', click);
    return b;
  };
  const render = () => {
    const names = scoops.map((k) => FLAVOURS.find((f) => f.k === k)!.name);
    done.toggleAttribute('disabled', scoops.length < 2);
    done.textContent = scoops.length < 2 ? 'Mindestens 2 Kugeln' : `${scoops.length} Kugeln im ${cone ? 'Hörnchen' : 'Becher'}, bitte!`;
    body.replaceChildren(
      h('h3', { style: 'margin:0 0 8px;font-size:15px' }, 'Hörnchen oder Becher?'),
      h('div', {}, chip('🍦 Hörnchen', cone, () => ((cone = true), render())), chip('🍨 Becher', !cone, () => ((cone = false), render()))),
      h('h3', { style: 'margin:12px 0 8px;font-size:15px' }, `Sorten (2 oder 3 Kugeln): ${names.length ? names.join(', ') : 'noch keine'}`),
      h(
        'div',
        {},
        ...FLAVOURS.map((f) => chip(`${f.name}${scoops.includes(f.k) ? ` ×${scoops.filter((k) => k === f.k).length}` : ''}`, scoops.includes(f.k), () => {
          scoops = scoops.length >= 3 ? [f.k] : [...scoops, f.k];
          render();
        }, f.color)),
        scoops.length ? chip('↺ Nochmal', false, () => ((scoops = []), render())) : '',
      ),
      h('h3', { style: 'margin:12px 0 8px;font-size:15px' }, 'Spezialitäten'),
      h(
        'ul.svc-list',
        {},
        ...MENUS.eisdiele.map((id) => {
          const d = DRINK_BY_ID.get(id)!;
          const li = h('li', { tabindex: 0, role: 'button', title: d.name }, h('span.jb-icon', { style: 'font-size:26px' }, d.emoji), h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, d.blurb)));
          li.addEventListener('click', () => pick(d));
          li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              pick(d);
            }
          });
          return li;
        }),
      ),
    );
  };
  render();
  setTimeout(() => (body.querySelector('button') as HTMLElement | null)?.focus(), 30);
}

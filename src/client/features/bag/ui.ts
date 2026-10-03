import { BAG_SLOTS, keptItem } from '../../../shared/bag';
import type { ShopItemId } from '../../../shared/shopwares';
import { h, openModal, type Modal } from '../../ui/dom';
import './ui.css';

// The rucksack's window (flrnoh fork, see FORK.md "The rucksack"): U opens it. What's in your hand
// on top, then the rucksack's twelve places. Click a thing for what to do with it: take it in hand,
// put it down in front of you, or give it to someone standing near you.

export interface BagWindow {
  /** What's in it now, and in your hand (a thing to keep, or null). */
  items(): readonly ShopItemId[];
  hand(): ShopItemId | null;
  /** People near enough to hand something to: id and name. */
  near(): { id: string; name: string }[];
  stow(): void;
  take(slot: number): void;
  /** Puts down what's in hand (no slot) or a slot's thing, in front of you. */
  drop(slot?: number): void;
  give(to: string, slot?: number): void;
}

export interface OpenBag {
  /** Draws it again (the rucksack changed). */
  refresh(): void;
  close(): void;
}

export function openBag(w: BagWindow): OpenBag {
  /** The thing whose choices are open: 'hand', a slot, or none. */
  let chosen: 'hand' | number | null = null;
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const body = h('div.body.bag-body', {});

  const btn = (label: string, run: () => void, title?: string) => {
    const b = h('button.btn', { title: title ?? label }, label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      run();
    });
    return b;
  };

  /** What you can do with the chosen thing. */
  function choices(slot?: number): HTMLElement {
    const near = w.near();
    const gift = near.length
      ? near.map((p) => btn(`🎁 ${p.name}`, () => (w.give(p.id, slot), modal.close()), `Give it to ${p.name}`))
      : [h('span.bag-hint', {}, '🎁 Stand next to someone to give it to them')];
    const first = slot === undefined ? btn('🎒 Put in rucksack', () => w.stow()) : btn('✋ Take in hand', () => (w.take(slot), modal.close()));
    return h('div.bag-choices', {}, first, btn('⬇️ Put down here', () => (w.drop(slot), modal.close()), 'Put it down in front of you: it stays there'), ...gift);
  }

  function card(id: ShopItemId | null, which: 'hand' | number): HTMLElement {
    const item = id ? keptItem(id) : null;
    const on = chosen === which && !!item;
    const el = h(
      `div.bag-slot${item ? '' : '.empty'}${on ? '.on' : ''}`,
      { role: item ? 'button' : undefined, tabindex: item ? 0 : undefined, title: item ? item.blurb : undefined },
      h('span.bag-emoji', {}, item ? item.emoji : ''),
      h('span.bag-name', {}, item ? item.name : ''),
    );
    if (item) {
      const pick = () => {
        chosen = on ? null : which;
        draw();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          pick();
        }
      });
    }
    return el;
  }

  function draw() {
    const items = w.items();
    const hand = w.hand();
    if (chosen === 'hand' && !hand) chosen = null;
    if (typeof chosen === 'number' && !items[chosen]) chosen = null;
    const parts: (HTMLElement | null)[] = [
      h('h3.bag-head', {}, '✋ In your hand'),
      hand ? card(hand, 'hand') : h('p.bag-hint', {}, 'Nothing to keep in your hand. Flowers, books, toys, pets, records and plush from town go in here.'),
      chosen === 'hand' ? choices() : null,
      h('h3.bag-head', {}, `🎒 Rucksack · ${items.length}/${BAG_SLOTS}`),
      h('div.bag-grid', {}, ...Array.from({ length: BAG_SLOTS }, (_, i) => card(items[i] ?? null, i))),
      typeof chosen === 'number' ? choices(chosen) : null,
    ];
    body.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  const el = h(
    'div.modal.bag',
    { role: 'dialog', 'aria-label': 'Rucksack' },
    h('header', {}, h('h2', {}, '🎒 Rucksack'), close),
    body,
    h('footer', {}, h('span.grow', {}, 'Q puts what you hold in the rucksack · Shift+Q puts it down in front of you · E picks your things up again')),
  );
  draw();
  const modal: Modal = openModal(el, {});
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('.bag-slot[tabindex="0"]') as HTMLElement | null)?.focus(), 30);
  return { refresh: draw, close: () => modal.close() };
}

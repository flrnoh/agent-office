import { START_CHIPS } from '../../../shared/casino';
import { h, openModal } from '../dom';
import { chipText, type CasinoUi, type CasinoUiContext } from './registry';
import './casino.css';

/** The emoji each kind of table goes by. */
export const TABLE_ICON = { roulette: '🎡', blackjack: '🃏', poker: '♠️', slots: '🎰' } as const;

/** A table that isn't dealing yet: who's sitting at it, and "Coming soon". */
export function openComingSoon(ctx: CasinoUiContext): CasinoUi {
  const seated = h('p.casino-note', {});
  const show = (state: unknown) => {
    const names = ((state as { seated?: unknown })?.seated ?? []) as string[];
    seated.textContent = names.length > 1 ? `At the table: ${names.join(', ')}` : 'You have the table to yourself.';
  };
  show(ctx.state);
  const el = h(
    'div.modal.casino-modal',
    { role: 'dialog', 'aria-label': ctx.table.name },
    h('header', {}, h('h2', {}, `${TABLE_ICON[ctx.table.kind]} ${ctx.table.name}`)),
    h(
      'div.body',
      {},
      h('div.casino-soon', {}, h('div.casino-soon-big', {}, 'Coming soon'), h('p', {}, `The dealer is still learning the rules. Pull up a chair anyway: the ${ctx.table.name.toLowerCase()} table opens in the next phase.`)),
      seated,
    ),
    h('footer', {}, h('span.grow', {}, `Play chips only: nothing to buy, nothing to cash out. Below ${chipText(START_CHIPS)}? The cashier tops you back up once a day.`)),
  );
  const modal = openModal(el, { doing: `at the ${ctx.table.name.toLowerCase()} table`, onClose: () => ctx.closed() });
  return { table: show, wallet() {}, result: () => false, close: () => modal.close() };
}

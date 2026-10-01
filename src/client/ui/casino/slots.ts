import { PAYTABLE, SLOT_BETS, SPIN_MS, THREE_OF_A_KIND, type SlotBet, type SlotsResult, type SlotsView } from '../../../shared/casino-slots';
import { h, openModal } from '../dom';
import { Reels, drawReels } from './reels';
import { chipText, registerCasinoUi, type CasinoUi, type CasinoUiContext } from './registry';
import './casino.css';

/*
 * A slot machine's window (flrnoh fork, see shared/casino-slots.ts): the reels, what to stake,
 * Spin (Space), your chips and the paytable. The office draws the result; the reels spin and land
 * on it, and only then does the window say how it went.
 */

const BET_KEY = 'agent-office.casino.slotBet';

function savedBet(): SlotBet {
  try {
    const n = Number(localStorage.getItem(BET_KEY));
    return (SLOT_BETS as readonly number[]).includes(n) ? (n as SlotBet) : 5;
  } catch {
    return 5;
  }
}

export function openSlots(ctx: CasinoUiContext): CasinoUi {
  const view = ctx.state as SlotsView | null;
  const reels = new Reels(view?.stops ?? [0, 0, 0]);
  let chips = ctx.chips;
  let nextTopUpAt = ctx.nextTopUpAt;
  let bet: SlotBet = savedBet();
  /** Asked the office to spin, and it hasn't answered yet. */
  let asked = false;
  /** What to say once the reels land, and what it did to your chips. */
  let landing: { text: string; won: number; bet: number } | null = null;
  let flashUntil = 0;
  /** What the balance shows while a spin's in the air: the stake gone, the win not yet in. */
  let shown: number | null = null;

  const canvas = h('canvas.casino-reels', { width: 540, height: 300, 'aria-hidden': 'true' });
  const g = canvas.getContext('2d')!;
  const balance = h('span.casino-chips', {}, '');
  const message = h('div.casino-message', { role: 'status', 'aria-live': 'polite' }, 'Pick a stake and pull the lever: Space spins.');
  const spinBtn = h('button.btn.primary.casino-spin', { type: 'button', title: 'Spin (Space)' }, '🎰 Spin');
  const betBtns = SLOT_BETS.map((b) => h('button.btn.casino-bet', { type: 'button', title: `Stake ${b} (${SLOT_BETS.indexOf(b) + 1})` }, `${b}`));
  const topUp = h('span.grow', {}, '');

  const render = () => {
    balance.textContent = `🪙 ${chipText(shown ?? chips)}`;
    betBtns.forEach((b, i) => b.classList.toggle('on', SLOT_BETS[i] === bet));
    const busy = asked || reels.spinning;
    spinBtn.toggleAttribute('disabled', busy);
    spinBtn.textContent = busy ? '🎰 Spinning…' : `🎰 Spin · ${bet}`;
    topUp.textContent = nextTopUpAt ? `Play chips only. Your daily top-up comes ${new Date(nextTopUpAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Play chips only: nothing to buy, nothing to cash out.';
  };

  const spin = () => {
    if (asked || reels.spinning) return;
    if (chips < bet) {
      message.textContent = chips ? `You only have ${chipText(chips)} chips: stake less.` : 'Out of chips: the cashier tops you up tomorrow.';
      ctx.sound('lose');
      return;
    }
    asked = true;
    shown = chips - bet;
    message.textContent = 'Good luck…';
    ctx.act('spin', bet);
    render();
  };
  spinBtn.addEventListener('click', spin);
  betBtns.forEach((b, i) =>
    b.addEventListener('click', () => {
      if (asked || reels.spinning) return;
      bet = SLOT_BETS[i];
      try {
        localStorage.setItem(BET_KEY, String(bet));
      } catch {
        // fine: it just won't be remembered
      }
      ctx.sound('chip');
      render();
    }),
  );

  const pays = h(
    'table.casino-paytable',
    {},
    h('caption', {}, 'Pays (times your stake)'),
    ...PAYTABLE.map((p) => h('tr', {}, h('td', {}, p.symbols), h('td', {}, `× ${p.pays}`))),
  );
  const el = h(
    'div.modal.casino-modal.casino-slots',
    { role: 'dialog', 'aria-label': ctx.table.name },
    h('header', {}, h('h2', {}, `🎰 ${ctx.table.name}`), balance),
    h(
      'div.body',
      {},
      h('div.casino-cabinet', {}, canvas, message),
      h('div.casino-controls', {}, h('span.casino-label', {}, 'Stake'), h('div.seg', {}, ...betBtns), spinBtn),
      h('details.casino-pays', {}, h('summary', {}, 'Paytable'), pays, h('p.casino-note', {}, 'About 95% of what goes in comes back out, over a long night. The house always wins in the end.')),
    ),
    h('footer', {}, topUp),
  );

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (typing) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      spin();
    } else if (['1', '2', '3', '4'].includes(e.key)) betBtns[Number(e.key) - 1]?.click();
  };
  window.addEventListener('keydown', onKey, true);

  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const turning = reels.update(now);
    if (reels.landed.length) ctx.sound('reel');
    if (!turning && landing) {
      const l = landing;
      landing = null;
      shown = null;
      message.textContent = l.text;
      if (l.won) {
        flashUntil = now + 2500;
        ctx.sound(l.won >= l.bet * THREE_OF_A_KIND.star ? 'jackpot' : 'win');
      } else ctx.sound('lose');
      el.classList.toggle('won', l.won > 0);
      render();
    }
    drawReels(g, reels, canvas.width, canvas.height, { win: now < flashUntil && Math.floor(now / 160) % 2 === 0 });
  };
  const modal = openModal(el, {
    doing: 'playing the slots',
    onClose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();
  frame();
  setTimeout(() => spinBtn.focus(), 30);

  return {
    table(state) {
      const s = state as SlotsView | null;
      // Nobody's spinning it (or it's settled): stand where the office says, unless ours is still landing.
      if (s && !s.spinning && !reels.spinning && !asked && !landing) reels.snap(s.stops);
    },
    wallet(n, next) {
      chips = n;
      nextTopUpAt = next;
      render();
    },
    result(text, _delta, data) {
      const r = data as SlotsResult | undefined;
      if (!r || !Array.isArray(r.stops)) {
        // Refused (not enough chips, too quick, somebody else's machine): say why, right here.
        asked = false;
        shown = null;
        message.textContent = text;
        render();
        return true;
      }
      asked = false;
      el.classList.remove('won');
      landing = { text, won: r.won, bet: r.bet };
      reels.spin(r.stops, SPIN_MS, performance.now());
      ctx.sound('spin');
      render();
      return true;
    },
    close: () => modal.close(),
  };
}

registerCasinoUi('slots', openSlots);

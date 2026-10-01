import { MAX_BET, MIN_BET } from '../../../shared/casino';
import { BET_MS, BJ_CHIPS, RESULTS_MS, TURN_MS, cardLabel, isBlackjack, suitOf, totalText, type BlackjackHandView, type BlackjackResult, type BlackjackView, type Card, type HandOutcome } from '../../../shared/casino-blackjack';
import { h, openModal } from '../dom';
import { chipText, registerCasinoUi, type CasinoUi, type CasinoUiContext } from './registry';
import './casino.css';
import './blackjack.css';

/*
 * A blackjack table's window (flrnoh fork, see shared/casino-blackjack.ts): the dealer's hand, every
 * seat's hands with their bets and totals, a countdown for the betting window or the hand in play,
 * your bet (chip buttons, rebet) and your moves: Hit H, Stand S, Double D, Split P. The office
 * deals and decides; the window only shows what its view says and asks.
 */

const BET_KEY = 'agent-office.casino.bjBet';

function savedBet(): number {
  try {
    const n = Number(localStorage.getItem(BET_KEY));
    return Number.isInteger(n) && n >= MIN_BET && n <= MAX_BET ? n : 10;
  } catch {
    return 10;
  }
}

const OUTCOME: Record<HandOutcome, string> = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };

function cardEl(c: Card | null) {
  if (!c) return h('span.bj-card.back', { title: 'Face down' }, '');
  const red = suitOf(c) === 'h' || suitOf(c) === 'd';
  return h(`span.bj-card${red ? '.red' : ''}`, {}, cardLabel(c));
}

function handEl(hand: BlackjackHandView, current: boolean) {
  const bj = isBlackjack(hand.cards, hand.split);
  return h(
    `div.bj-hand${current ? '.current' : ''}${hand.outcome ? `.${hand.outcome}` : ''}`,
    {},
    h('div.bj-cards', {}, ...hand.cards.map(cardEl)),
    h(
      'div.bj-hand-meta',
      {},
      h('span.bj-total', {}, totalText(hand.cards, bj)),
      h('span.bj-bet', {}, `🪙 ${chipText(hand.bet)}${hand.doubled ? ' ×2' : ''}`),
      ...(hand.outcome ? [h('span.bj-outcome', {}, `${OUTCOME[hand.outcome]}${hand.paid ? ` +${chipText(hand.paid)}` : ''}`)] : []),
    ),
  );
}

export function openBlackjack(ctx: CasinoUiContext): CasinoUi {
  let view = ctx.state as BlackjackView | null;
  let chips = ctx.chips;
  let nextTopUpAt = ctx.nextTopUpAt;
  let draft = savedBet();
  /** When the view came in, so the countdown runs on between views. */
  let viewAt = performance.now();

  const balance = h('span.casino-chips', {}, '');
  const status = h('div.bj-status', { role: 'status', 'aria-live': 'polite' }, '');
  const bar = h('div.bj-timer-fill', {});
  const timer = h('div.bj-timer', {}, bar);
  const dealerCards = h('div.bj-cards', {});
  const dealerTotal = h('span.bj-total', {});
  const seatsEl = h('div.bj-seats', {});
  const message = h('div.bj-message', { role: 'status', 'aria-live': 'polite' }, '');

  const hitBtn = h('button.btn.primary', { type: 'button', title: 'Hit (H)' }, 'Hit', h('span.bj-key', {}, 'H'));
  const standBtn = h('button.btn', { type: 'button', title: 'Stand (S)' }, 'Stand', h('span.bj-key', {}, 'S'));
  const doubleBtn = h('button.btn', { type: 'button', title: 'Double down (D)' }, 'Double', h('span.bj-key', {}, 'D'));
  const splitBtn = h('button.btn', { type: 'button', title: 'Split the pair (P)' }, 'Split', h('span.bj-key', {}, 'P'));
  const moves = h('div.bj-moves', {}, hitBtn, standBtn, doubleBtn, splitBtn);

  const betInput = h('input.bj-bet-input', { type: 'number', min: String(MIN_BET), max: String(MAX_BET), step: '1', value: String(draft), 'aria-label': 'Your bet' }) as HTMLInputElement;
  const chipBtns = BJ_CHIPS.map((c) => h('button.btn.casino-bet', { type: 'button', title: `Add ${c}` }, `+${c}`));
  const clearDraft = h('button.btn', { type: 'button', title: 'Start the bet over' }, '0');
  const betBtn = h('button.btn.primary', { type: 'button', title: 'Put the bet down (Enter)' }, 'Bet');
  const rebetBtn = h('button.btn', { type: 'button', title: 'Bet what you bet last hand (R)' }, 'Rebet');
  const takeBack = h('button.btn', { type: 'button', title: 'Take your bet back' }, 'Take back');
  const betting = h('div.bj-betting', {}, h('span.casino-label', {}, 'Bet'), betInput, h('div.seg', {}, ...chipBtns, clearDraft), betBtn, rebetBtn, takeBack);
  const topUp = h('span.grow', {}, '');

  const setDraft = (n: number) => {
    draft = Math.max(0, Math.min(MAX_BET, Math.floor(n) || 0));
    betInput.value = String(draft);
    try {
      if (draft) localStorage.setItem(BET_KEY, String(draft));
    } catch {
      // fine: it just won't be remembered
    }
  };

  const mySeat = () => (view && view.you !== undefined ? view.seats[view.you] : null);

  const render = () => {
    balance.textContent = `🪙 ${chipText(chips)}`;
    topUp.textContent = nextTopUpAt
      ? `Play chips only. Your daily top-up comes ${new Date(nextTopUpAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`
      : 'Dealer stands on all 17s · blackjack pays 3 to 2 · play chips only';
    const v = view;
    if (!v) {
      status.textContent = 'Taking a seat…';
      return;
    }
    dealerCards.replaceChildren(...(v.dealer.length ? v.dealer.map(cardEl) : [h('span.bj-empty', {}, 'No cards yet')]));
    const shown = v.dealer.filter((c): c is Card => !!c);
    dealerTotal.textContent = shown.length ? (v.dealer.includes(null) ? `showing ${totalText(shown)}` : totalText(shown, isBlackjack(shown))) : '';
    seatsEl.replaceChildren(
      ...v.seats.map((s, i) => {
        if (!s) return h('div.bj-seat.empty', {}, h('div.bj-name', {}, `Seat ${i + 1}`), h('div.bj-empty', {}, 'free'));
        const turn = v.turn?.seat === i;
        return h(
          `div.bj-seat${i === v.you ? '.you' : ''}${turn ? '.turn' : ''}${s.gone ? '.gone' : ''}`,
          {},
          h('div.bj-name', {}, `${s.name}${i === v.you ? ' (you)' : ''}${s.gone ? ' · left' : ''}`),
          ...(s.hands.length ? s.hands.map((hand, k) => handEl(hand, turn && v.turn?.hand === k)) : [h('div.bj-empty', {}, s.bet ? `🪙 ${chipText(s.bet)} down` : v.phase === 'betting' ? 'no bet yet' : 'sitting out')]),
        );
      }),
    );
    const me = mySeat();
    const myTurn = v.phase === 'playing' && v.turn?.seat === v.you;
    const can = v.can ?? { hit: false, stand: false, double: false, split: false };
    hitBtn.disabled = !can.hit;
    standBtn.disabled = !can.stand;
    doubleBtn.disabled = !can.double;
    splitBtn.disabled = !can.split;
    moves.hidden = v.phase !== 'playing' || !me?.hands.length;
    betting.hidden = v.phase !== 'betting';
    rebetBtn.disabled = !v.lastBet || me?.bet === v.lastBet;
    rebetBtn.textContent = v.lastBet ? `Rebet ${chipText(v.lastBet)}` : 'Rebet';
    takeBack.disabled = !me?.bet;
    betBtn.textContent = me?.bet ? 'Change bet' : 'Bet';
    const turnName = v.turn ? v.seats[v.turn.seat]?.name : undefined;
    status.textContent =
      v.phase === 'betting'
        ? v.left === undefined
          ? v.seated.length
            ? 'Place your bets: the cards come once someone does'
            : 'Place your bets'
          : me?.bet
            ? `Your bet is down: ${chipText(me.bet)}`
            : 'Place your bets'
        : v.phase === 'playing'
          ? myTurn
            ? 'Your turn'
            : `${turnName ?? 'Someone'} is playing`
          : v.phase === 'dealer'
            ? 'The dealer plays'
            : 'This round is done';
    el.classList.toggle('my-turn', myTurn);
  };

  const tickTimer = () => {
    const v = view;
    if (!v || v.left === undefined) {
      timer.hidden = true;
      return;
    }
    const total = v.phase === 'betting' ? BET_MS : v.phase === 'playing' ? TURN_MS : v.phase === 'results' ? RESULTS_MS : 0;
    const left = Math.max(0, v.left - (performance.now() - viewAt));
    timer.hidden = !total || v.phase === 'dealer';
    bar.style.width = `${Math.min(100, (left / (total || 1)) * 100)}%`;
    bar.dataset.secs = String(Math.ceil(left / 1000));
    timer.title = `${Math.ceil(left / 1000)} s`;
    timer.classList.toggle('hurry', left < 5000 && v.phase === 'playing');
  };

  const move = (action: 'hit' | 'stand' | 'double' | 'split') => {
    if (!view?.can?.[action]) return;
    ctx.sound('chip');
    ctx.act(action);
  };
  const placeBet = () => {
    setDraft(Number(betInput.value));
    if (!draft) {
      message.textContent = `A bet is ${MIN_BET} to ${MAX_BET} chips.`;
      return;
    }
    if (draft > chips + (mySeat()?.bet ?? 0)) {
      message.textContent = chips ? `You only have ${chipText(chips)} chips.` : 'Out of chips: the cashier tops you up tomorrow.';
      return;
    }
    ctx.sound('chip');
    ctx.act('bet', draft);
  };
  hitBtn.addEventListener('click', () => move('hit'));
  standBtn.addEventListener('click', () => move('stand'));
  doubleBtn.addEventListener('click', () => move('double'));
  splitBtn.addEventListener('click', () => move('split'));
  betBtn.addEventListener('click', placeBet);
  rebetBtn.addEventListener('click', () => {
    ctx.sound('chip');
    ctx.act('rebet');
  });
  takeBack.addEventListener('click', () => ctx.act('clear'));
  chipBtns.forEach((b, i) => b.addEventListener('click', () => setDraft(draft + BJ_CHIPS[i])));
  clearDraft.addEventListener('click', () => setDraft(0));
  betInput.addEventListener('change', () => setDraft(Number(betInput.value)));
  betInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      placeBet();
    }
  });

  const el = h(
    'div.modal.casino-modal.casino-bj',
    { role: 'dialog', 'aria-label': ctx.table.name },
    h('header', {}, h('h2', {}, `🃏 ${ctx.table.name}`), balance),
    h(
      'div.body',
      {},
      h(
        'div.bj-felt',
        {},
        h('div.bj-top', {}, status, timer),
        h('div.bj-dealer', {}, h('div.bj-name', {}, 'Dealer ', dealerTotal), dealerCards),
        h('div.bj-rules', {}, 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17s'),
        seatsEl,
      ),
      message,
      moves,
      betting,
    ),
    h('footer', {}, topUp),
  );

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    const act = k === 'h' ? 'hit' : k === 's' ? 'stand' : k === 'd' ? 'double' : k === 'p' ? 'split' : null;
    if (act && view?.phase === 'playing') {
      e.preventDefault();
      e.stopPropagation();
      move(act);
    } else if (view?.phase === 'betting' && (k === 'enter' || k === 'r')) {
      e.preventDefault();
      e.stopPropagation();
      if (k === 'r') rebetBtn.click();
      else placeBet();
    }
  };
  window.addEventListener('keydown', onKey, true);
  const timerLoop = setInterval(tickTimer, 100);

  const modal = openModal(el, {
    doing: 'playing blackjack',
    onClose: () => {
      clearInterval(timerLoop);
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();
  tickTimer();

  return {
    table(state) {
      const was = view;
      view = state as BlackjackView | null;
      viewAt = performance.now();
      // A new round's cards: clear what the last one said.
      if (view && was && view.round !== was.round) message.textContent = '';
      if (view && was && view.phase === 'playing' && view.turn?.seat === view.you && !(was.phase === 'playing' && was.turn?.seat === was.you)) ctx.sound('chip');
      render();
      tickTimer();
    },
    wallet(n, next) {
      chips = n;
      nextTopUpAt = next;
      render();
    },
    result(text, delta, data) {
      message.textContent = text;
      const r = data as BlackjackResult | undefined;
      if (r && Array.isArray(r.hands)) {
        if (r.hands.some((h) => h.outcome === 'blackjack')) ctx.sound('jackpot');
        else if ((delta ?? 0) > 0) ctx.sound('win');
        else if ((delta ?? 0) < 0) ctx.sound('lose');
      }
      return true;
    },
    close: () => modal.close(),
  };
}

registerCasinoUi('blackjack', openBlackjack);

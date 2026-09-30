import { START_CHIPS } from '../../../shared/casino';
import {
  BIG_BLIND,
  DEFAULT_BUY_IN,
  MAX_BUY_IN,
  MIN_BUY_IN,
  SMALL_BLIND,
  SUIT_SYMBOL,
  TURN_MS,
  isRed,
  rankLabel,
  type Card,
  type PokerResult,
  type PokerSeatView,
  type PokerView,
} from '../../../shared/casino-poker';
import { h, openModal } from '../dom';
import { chipText, registerCasinoUi, type CasinoUi, type CasinoUiContext } from './registry';
import './casino.css';
import './poker.css';

/*
 * The poker table's window (flrnoh fork, see shared/casino-poker.ts): the oval table with everyone
 * round it (you at the bottom), the board and the pot in the middle, your cards, and what you can
 * do when it's your turn: fold, check or call, bet or raise (a slider, and ½ pot, pot, all-in).
 * Sitting down you choose how many chips to bring; getting up (✕, Esc) puts what's left back in
 * your wallet. The office deals and keeps every rule: this only shows its view and asks.
 */

const BUY_KEY = 'agent-office.casino.pokerBuyIn';

function savedBuyIn(): number {
  try {
    const n = Number(localStorage.getItem(BUY_KEY));
    return Number.isInteger(n) && n >= MIN_BUY_IN && n <= MAX_BUY_IN ? n : DEFAULT_BUY_IN;
  } catch {
    return DEFAULT_BUY_IN;
  }
}

/** A card: face up, or its back. */
function cardEl(c: Card | null, big = false): HTMLElement {
  if (!c) return h(`span.pk-card.back${big ? '.big' : ''}`, { 'aria-label': 'face down card' });
  return h(`span.pk-card${isRed(c) ? '.red' : ''}${big ? '.big' : ''}`, { 'aria-label': `${rankLabel(c)} of ${({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as Record<string, string>)[c[1]]}` }, h('b', {}, rankLabel(c)), h('i', {}, SUIT_SYMBOL[c[1]]));
}

const STATUS_TEXT: Record<PokerSeatView['status'], string> = { waiting: 'Waiting', in: '', folded: 'Folded', allin: 'All-in', out: 'Buying in…', sitout: 'Sitting out' };

export function openPoker(ctx: CasinoUiContext): CasinoUi {
  let view = (ctx.state as PokerView | null) ?? null;
  let chips = ctx.chips;
  /** When whoever's turn it is runs out of time (performance.now()), from the view's turnMs. */
  let turnEnds = 0;
  let nextAt = 0;
  let buyIn = savedBuyIn();
  let raiseTo = 0;
  /** The hand and turn the raise slider was last set for (a new turn resets it to the minimum). */
  let raiseFor = '';
  let wasMyTurn = false;
  let lastHand = -1;

  const balance = h('span.casino-chips', {}, '');
  const felt = h('div.pk-felt', {});
  const board = h('div.pk-board', {});
  const pot = h('div.pk-pot', {});
  const summary = h('div.pk-summary', { role: 'status', 'aria-live': 'polite' });
  felt.append(h('div.pk-center', {}, pot, board, summary));
  const seatsEl = h('div.pk-seats', {});
  const tableEl = h('div.pk-table', {}, felt, seatsEl);

  const mine = h('div.pk-mine', {});
  const message = h('div.pk-message', { role: 'status', 'aria-live': 'polite' });

  // ---- Buying in ----
  const buyRange = h('input.pk-range', { type: 'range', min: MIN_BUY_IN, max: MAX_BUY_IN, step: 10, 'aria-label': 'Chips to bring to the table' }) as HTMLInputElement;
  const buyNum = h('input.pk-num', { type: 'number', min: MIN_BUY_IN, max: MAX_BUY_IN, step: 1, 'aria-label': 'Chips to bring' }) as HTMLInputElement;
  const buyBtn = h('button.btn.primary', { type: 'button' }, '');
  const buyNote = h('p.casino-note', {}, '');
  const buyPanel = h('div.pk-panel.pk-buy', {}, h('div.pk-panel-title', {}, 'Bring chips to the table'), h('div.pk-row', {}, buyRange, buyNum, buyBtn), buyNote);

  // ---- Acting ----
  const foldBtn = h('button.btn.pk-fold', { type: 'button' }, 'Fold');
  const callBtn = h('button.btn.pk-call', { type: 'button' }, 'Check');
  const raiseBtn = h('button.btn.primary.pk-raise', { type: 'button' }, 'Raise');
  const raiseRange = h('input.pk-range', { type: 'range', step: 5, 'aria-label': 'Bet or raise to' }) as HTMLInputElement;
  const raiseNum = h('input.pk-num', { type: 'number', step: 1, 'aria-label': 'Bet or raise to' }) as HTMLInputElement;
  const halfBtn = h('button.btn.pk-quick', { type: 'button' }, '½ pot');
  const potBtn = h('button.btn.pk-quick', { type: 'button' }, 'Pot');
  const allBtn = h('button.btn.pk-quick', { type: 'button' }, 'All-in');
  const sizing = h('div.pk-row.pk-sizing', {}, raiseRange, raiseNum, h('div.pk-quicks', {}, halfBtn, potBtn, allBtn));
  const actPanel = h('div.pk-panel.pk-act', {}, h('div.pk-row.pk-buttons', {}, foldBtn, callBtn, raiseBtn), sizing);

  // ---- Between hands ----
  const backBtn = h('button.btn.primary', { type: 'button' }, "I'm back");
  const sitOutBtn = h('button.btn', { type: 'button' }, 'Sit out');
  const topUpBtn = h('button.btn', { type: 'button' }, 'Add chips');
  const botBtn = h('button.btn', { type: 'button' }, '');
  const extras = h('div.pk-row.pk-extras', {}, backBtn, sitOutBtn, topUpBtn, botBtn);
  let showTopUp = false;

  const footer = h('span.grow', {}, `No-limit Hold'em · blinds ${SMALL_BLIND}/${BIG_BLIND} · buy in ${MIN_BUY_IN}–${MAX_BUY_IN}. Play chips only; getting up puts your stack back in your wallet.`);

  const el = h(
    'div.modal.casino-modal.casino-poker',
    { role: 'dialog', 'aria-label': ctx.table.name },
    h('header', {}, h('h2', {}, `♠️ ${ctx.table.name}`), balance),
    h('div.body', {}, tableEl, mine, message, buyPanel, actPanel, extras),
    h('footer', {}, footer),
  );

  const me = () => view?.you;
  const mySeat = () => view?.seats.find((s) => s.you);
  const toAct = () => me()?.toAct;

  const clampRaise = (n: number) => {
    const a = toAct();
    if (!a) return n;
    return Math.max(a.minTo, Math.min(a.maxTo, Math.round(n)));
  };
  /** Bets sized to the pot: to what total a raise of `frac` of the pot (after calling) comes. */
  const potSized = (frac: number) => {
    const a = toAct();
    if (!a || !view) return 0;
    const current = a.bet + a.toCall;
    return clampRaise(current + (view.pot + a.toCall) * frac);
  };

  const renderSeats = () => {
    seatsEl.replaceChildren();
    if (!view) return;
    const n = ctx.table.seats;
    const base = mySeat()?.seat ?? 0;
    // Narrow: the seats come in from the sides so they stay on screen.
    const rx = tableEl.clientWidth && tableEl.clientWidth < 480 ? 35 : 44;
    for (const s of view.seats) {
      const d = (s.seat - base + n) % n;
      // You at the bottom, the others round the table clockwise.
      const a = Math.PI / 2 + (d / n) * Math.PI * 2;
      const x = 50 + Math.cos(a) * rx;
      const y = 50 + Math.sin(a) * 41;
      const cards = s.cards?.length ? s.cards.map((c) => cardEl(c)) : s.hasCards ? [cardEl(null), cardEl(null)] : [];
      const status = s.won ? `Wins ${chipText(s.won)}` : s.status === 'in' ? (s.last ?? '') : s.status === 'folded' || s.status === 'allin' ? STATUS_TEXT[s.status] : STATUS_TEXT[s.status];
      const timer = s.turn ? h('div.pk-timer', {}, h('div.pk-timer-bar', {})) : null;
      const seat = h(
        `div.pk-seat${s.turn ? '.turn' : ''}${s.you ? '.you' : ''}${s.status === 'folded' || s.status === 'sitout' || s.status === 'out' ? '.dim' : ''}${s.won ? '.won' : ''}`,
        { style: `left:${x}%;top:${y}%` },
        h('div.pk-cards', {}, ...cards),
        h('div.pk-name', {}, s.name, s.dealer ? h('span.pk-dealer', { title: 'Dealer button' }, 'D') : null),
        h('div.pk-stack', {}, `🪙 ${chipText(s.stack)}`),
        h('div.pk-status', {}, status),
        s.hand ? h('div.pk-hand', {}, s.hand) : null,
        timer,
      );
      seatsEl.append(seat);
      if (s.bet > 0) {
        // The bet in front of them, toward the middle.
        const bx = 50 + Math.cos(a) * (rx - 17);
        const by = 50 + Math.sin(a) * 22;
        seatsEl.append(h('div.pk-bet', { style: `left:${bx}%;top:${by}%` }, chipText(s.bet)));
      }
    }
  };

  const render = () => {
    balance.textContent = `🪙 ${chipText(chips)}`;
    const v = view;
    const you = me();
    // The middle: the pot, the board, how the last hand went.
    board.replaceChildren(...(v?.board ?? []).map((c) => cardEl(c)), ...Array.from({ length: 5 - (v?.board.length ?? 0) }, () => h('span.pk-card.slot', {})));
    const sides = v?.pots.length ? ` · ${v.pots.map((p, i) => `${i ? `side ${i}` : 'main'} ${chipText(p)}`).join(' · ')}` : '';
    pot.textContent = v && v.pot ? `Pot ${chipText(v.pot)}${sides}` : v && v.seats.length < 2 ? 'Waiting for players' : '';
    const waitMs = nextAt ? Math.max(0, nextAt - performance.now()) : 0;
    summary.textContent = v?.summary ?? (v && (v.street === 'idle' || v.street === 'showdown') ? (waitMs > 0 ? `Next hand in ${Math.ceil(waitMs / 1000)}…` : v.seats.filter((s) => s.stack > 0 && s.status !== 'sitout').length < 2 ? 'A hand starts when two players have chips' : '') : '');
    renderSeats();

    // Your cards, big.
    const seat = mySeat();
    mine.replaceChildren();
    if (seat?.cards?.length) mine.append(h('div.pk-mycards', {}, ...seat.cards.map((c) => cardEl(c, true))), h('div.pk-myhand', {}, you?.hand ?? (seat.status === 'folded' ? 'Folded' : '')));

    // Buying in: no chips in front of you.
    const out = !you || you.status === 'out';
    buyPanel.hidden = !(out || showTopUp);
    if (!buyPanel.hidden) {
      const stack = you?.stack ?? 0;
      const min = stack > 0 ? 1 : MIN_BUY_IN;
      const max = Math.min(MAX_BUY_IN - stack, chips);
      buyRange.min = String(min);
      buyRange.max = String(Math.max(min, max));
      buyNum.min = String(min);
      buyNum.max = String(Math.max(min, max));
      if (document.activeElement !== buyNum) buyNum.value = String(Math.min(Math.max(buyIn, min), Math.max(min, max)));
      buyRange.value = buyNum.value;
      const enough = max >= min;
      buyBtn.toggleAttribute('disabled', !enough);
      buyRange.toggleAttribute('disabled', !enough);
      buyNum.toggleAttribute('disabled', !enough);
      buyBtn.textContent = stack > 0 ? `Add ${chipText(Number(buyNum.value))}` : `Sit in with ${chipText(Number(buyNum.value))}`;
      buyNote.textContent = !enough
        ? chips < MIN_BUY_IN && stack === 0
          ? `You need ${MIN_BUY_IN} chips to sit in, and have ${chipText(chips)}. Below ${chipText(START_CHIPS)}, the cashier tops you back up once a day.`
          : `Your stack is at the table's most (${MAX_BUY_IN}).`
        : stack > 0
          ? `You have ${chipText(stack)} in front of you: add up to ${chipText(max)}.`
          : `From your wallet (${chipText(chips)}). Getting up puts what's left back.`;
    }

    // Your turn.
    const a = toAct();
    actPanel.hidden = !a;
    if (a && v) {
      const key = `${v.hand}|${v.board.length}|${a.minTo}|${a.maxTo}`;
      if (raiseFor !== key) {
        raiseFor = key;
        raiseTo = a.minTo;
      }
      raiseTo = clampRaise(raiseTo);
      callBtn.textContent = a.canCheck ? 'Check' : a.toCall >= a.stack ? `All-in ${chipText(a.toCall)}` : `Call ${chipText(a.toCall)}`;
      const opening = a.bet + a.toCall === 0;
      raiseBtn.hidden = !a.canRaise;
      sizing.hidden = !a.canRaise || a.minTo >= a.maxTo;
      raiseRange.min = raiseNum.min = String(a.minTo);
      raiseRange.max = raiseNum.max = String(a.maxTo);
      raiseRange.value = String(raiseTo);
      if (document.activeElement !== raiseNum) raiseNum.value = String(raiseTo);
      raiseBtn.textContent = raiseTo >= a.maxTo ? `All-in ${chipText(a.maxTo)}` : `${opening ? 'Bet' : 'Raise to'} ${chipText(raiseTo)}`;
    }

    // Between hands, and the house bot.
    const status = you?.status;
    backBtn.hidden = status !== 'sitout';
    sitOutBtn.hidden = !you || status === 'sitout' || status === 'out';
    topUpBtn.hidden = !you || status === 'out' || (you.stack ?? 0) >= MAX_BUY_IN || (v !== null && v.street !== 'idle' && v.street !== 'showdown' && status !== 'folded' && status !== 'waiting');
    topUpBtn.textContent = showTopUp ? 'Done' : 'Add chips';
    botBtn.textContent = v?.bot ? 'Send 🤖 House away' : 'Invite 🤖 House';
    botBtn.hidden = !you || (!v?.bot && (v?.seats.length ?? 0) >= ctx.table.seats);
    extras.hidden = [backBtn, sitOutBtn, topUpBtn, botBtn].every((b) => b.hidden);
    tickTimers();
  };

  /** The turn clock and the countdown to the next hand, between the office's views. */
  const tickTimers = () => {
    const bar = seatsEl.querySelector<HTMLElement>('.pk-timer-bar');
    if (bar) {
      const left = Math.max(0, turnEnds - performance.now());
      bar.style.width = `${(left / TURN_MS) * 100}%`;
      bar.classList.toggle('low', left < 8000);
    }
    if (nextAt && view && !view.summary && (view.street === 'idle' || view.street === 'showdown')) {
      const waitMs = Math.max(0, nextAt - performance.now());
      summary.textContent = waitMs > 0 ? `Next hand in ${Math.ceil(waitMs / 1000)}…` : '';
    }
  };
  const timer = window.setInterval(tickTimers, 200);

  const setView = (v: PokerView | null) => {
    view = v;
    turnEnds = v?.turnMs !== undefined ? performance.now() + v.turnMs : 0;
    nextAt = v?.nextMs !== undefined ? performance.now() + v.nextMs : 0;
    if (v && v.hand !== lastHand) {
      if (lastHand >= 0 && v.street === 'preflop') message.textContent = '';
      lastHand = v.hand;
    }
    const myTurn = !!v?.you?.toAct;
    if (myTurn && !wasMyTurn) {
      ctx.sound('chip');
      message.textContent = 'Your turn';
    } else if (!myTurn && wasMyTurn && message.textContent === 'Your turn') message.textContent = '';
    wasMyTurn = myTurn;
    render();
  };

  // ---- Wiring ----
  const act = (action: string, data?: unknown) => {
    ctx.act(action, data);
  };
  buyRange.addEventListener('input', () => {
    buyNum.value = buyRange.value;
    buyIn = Number(buyRange.value);
    render();
  });
  buyNum.addEventListener('input', () => {
    const n = Number(buyNum.value);
    if (Number.isInteger(n)) {
      buyIn = n;
      buyRange.value = String(n);
      buyBtn.textContent = (me()?.stack ?? 0) > 0 ? `Add ${chipText(n)}` : `Sit in with ${chipText(n)}`;
    }
  });
  buyBtn.addEventListener('click', () => {
    const n = Math.floor(Number(buyNum.value));
    if (!Number.isFinite(n)) return;
    if ((me()?.stack ?? 0) === 0) {
      try {
        localStorage.setItem(BUY_KEY, String(n));
      } catch {
        // fine: not remembered
      }
    }
    showTopUp = false;
    ctx.sound('chip');
    act('buyin', n);
  });
  foldBtn.addEventListener('click', () => act('fold'));
  callBtn.addEventListener('click', () => {
    const a = toAct();
    if (!a) return;
    if (!a.canCheck) ctx.sound('chip');
    act(a.canCheck ? 'check' : 'call');
  });
  raiseBtn.addEventListener('click', () => {
    const a = toAct();
    if (!a) return;
    ctx.sound('chip');
    if (raiseTo >= a.maxTo) act('allin');
    else act('raise', raiseTo);
  });
  raiseRange.addEventListener('input', () => {
    raiseTo = clampRaise(Number(raiseRange.value));
    render();
  });
  raiseNum.addEventListener('change', () => {
    raiseTo = clampRaise(Number(raiseNum.value));
    render();
  });
  halfBtn.addEventListener('click', () => {
    raiseTo = potSized(0.5);
    render();
  });
  potBtn.addEventListener('click', () => {
    raiseTo = potSized(1);
    render();
  });
  allBtn.addEventListener('click', () => {
    const a = toAct();
    if (!a) return;
    raiseTo = a.maxTo;
    render();
  });
  backBtn.addEventListener('click', () => act('back'));
  sitOutBtn.addEventListener('click', () => act('sitout'));
  topUpBtn.addEventListener('click', () => {
    showTopUp = !showTopUp;
    render();
  });
  botBtn.addEventListener('click', () => act('bot'));

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key === 'Enter' && e.target === buyNum) buyBtn.click();
      else if (e.key === 'Enter' && e.target === raiseNum) {
        raiseTo = clampRaise(Number(raiseNum.value));
        raiseBtn.click();
      }
      return;
    }
    // F folds, C checks or calls, R bets or raises (what the slider says).
    const a = toAct();
    if (!a) return;
    if (e.key === 'f' || e.key === 'F') foldBtn.click();
    else if (e.key === 'c' || e.key === 'C') callBtn.click();
    else if ((e.key === 'r' || e.key === 'R') && a.canRaise) raiseBtn.click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  const modal = openModal(el, {
    doing: 'at the poker table',
    onClose: () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  setView(view);
  setTimeout(() => (buyPanel.hidden ? null : buyBtn.focus()), 30);

  return {
    table(state) {
      setView((state as PokerView | null) ?? null);
    },
    wallet(n) {
      chips = n;
      render();
    },
    result(text, delta, data) {
      const r = data as PokerResult | undefined;
      // (how the hand went for everyone is in the middle of the table already: here, what it did to you)
      message.textContent = r && typeof r.won === 'number' && r.won === 0 ? (r.net < 0 ? `You lose ${chipText(-r.net)}` : '') : text;
      message.classList.toggle('good', !!r && r.won > 0);
      if (r && typeof r.won === 'number') {
        if (r.won > 0) ctx.sound('win');
        else if ((delta ?? 0) < 0) ctx.sound('lose');
      }
      return true;
    },
    close: () => modal.close(),
  };
}

registerCasinoUi('poker', openPoker);

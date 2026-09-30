import { BET_MS, PAYOUT_MS, ROULETTE_CHIPS, ROUND_MAX, SEAT_COLORS, SPIN_MS, betLabel, betNumbers, betOdds, colorOf, type RouletteResult, type RouletteView } from '../../../shared/casino-roulette';
import { h, openModal } from '../dom';
import { chipText, registerCasinoUi, type CasinoUi, type CasinoUiContext } from './registry';
import { WheelClock, drawWheel } from './roulette-wheel';
import './casino.css';
import './roulette.css';

/*
 * The roulette table's window (flrnoh fork, see shared/casino-roulette.ts): the layout to put chips
 * on (click; right-click or a long press takes yours off a spot), which chip you bet with, undo /
 * clear / repeat, the countdown, the little wheel, the last numbers and who's at the table. The
 * office runs the rounds; the window only shows the number once the ball has landed.
 */

const CHIP_KEY = 'agent-office.casino.rouletteChip';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SVG = 'http://www.w3.org/2000/svg';

type Chip = (typeof ROULETTE_CHIPS)[number];

function savedChip(): Chip {
  try {
    const n = Number(localStorage.getItem(CHIP_KEY));
    return (ROULETTE_CHIPS as readonly number[]).includes(n) ? (n as Chip) : 5;
  } catch {
    return 5;
  }
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/** Chips as a chip can say it: 25, 250, 1k. */
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

// ---- The layout ---------------------------------------------------------------------------------
// In board units: the zero on the left, 12 columns of three numbers (3 on top, 1 at the bottom),
// "2 to 1" at the right end of each row, the dozens under the grid, the even-money bets under those.

const CW = 40;
const CH = 40;
const X0 = CW; // where the numbers start (the zero is left of them)
const GRID_W = 12 * CW;
const W = X0 + GRID_W + 50;
const H = 3 * CH + 40 + 40;

const cellOf = (n: number) => {
  const c = Math.floor((n - 1) / 3);
  const r = 2 - ((n - 1) % 3);
  return { x: X0 + c * CW, y: r * CH, c, r };
};

interface Spot {
  key: string;
  /** Where its chips sit. */
  cx: number;
  cy: number;
  /** Its hit area. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A painted cell (numbers and outside bets), or only a hit area between cells (splits, corners, streets, lines). */
  cell?: { fill: string; label: string; size?: number };
}

function spots(): Spot[] {
  const out: Spot[] = [];
  const cell = (key: string, x: number, y: number, w: number, hh: number, fill: string, label: string, size?: number) => out.push({ key, cx: x + w / 2, cy: y + hh / 2, x, y, w, h: hh, cell: { fill, label, size } });
  const zone = (key: string, cx: number, cy: number, w: number, hh: number) => out.push({ key, cx, cy, x: cx - w / 2, y: cy - hh / 2, w, h: hh });
  // The cells first (so the zones between them lie on top).
  cell('n:0', 0, 0, CW, 3 * CH, '#157a3c', '0');
  for (let n = 1; n <= 36; n++) {
    const { x, y } = cellOf(n);
    cell(`n:${n}`, x, y, CW, CH, colorOf(n) === 'red' ? '#b3122e' : '#141414', String(n));
  }
  for (let r = 0; r < 3; r++) cell(`column:${3 - r}`, X0 + GRID_W, r * CH, 50, CH, '#12663a', '2:1', 13);
  for (let d = 1; d <= 3; d++) cell(`dozen:${d}`, X0 + (d - 1) * 4 * CW, 3 * CH, 4 * CW, 40, '#12663a', `${['1st', '2nd', '3rd'][d - 1]} 12`, 15);
  const even: [string, string, string][] = [
    ['low', '1–18', '#12663a'],
    ['even', 'EVEN', '#12663a'],
    ['red', '◆', '#b3122e'],
    ['black', '◆', '#141414'],
    ['odd', 'ODD', '#12663a'],
    ['high', '19–36', '#12663a'],
  ];
  even.forEach(([key, label, fill], i) => cell(key, X0 + i * 2 * CW, 3 * CH + 40, 2 * CW, 40, fill, label, 14));
  // Between the numbers: splits, corners, streets and six-lines.
  for (let n = 1; n <= 36; n++) {
    const { x, y, c, r } = cellOf(n);
    if (c < 11) zone(`split:${n}-${n + 3}`, x + CW, y + CH / 2, 12, 24);
    if (r > 0) zone(`split:${n}-${n + 1}`, x + CW / 2, y, 24, 12);
    if (r > 0 && c < 11) zone(`corner:${n}`, x + CW, y, 14, 14);
    if (r === 2) {
      zone(`street:${c + 1}`, x + CW / 2, 3 * CH, 24, 12);
      if (c < 11) zone(`line:${c + 1}`, x + CW, 3 * CH, 14, 12);
    }
  }
  for (const n of [1, 2, 3]) zone(`split:0-${n}`, X0, cellOf(n).y + CH / 2, 12, 24);
  zone('corner:0', X0, 3 * CH, 14, 12);
  return out;
}

export function openRoulette(ctx: CasinoUiContext): CasinoUi {
  let view = (ctx.state as RouletteView | null) ?? null;
  const clock = new WheelClock();
  if (view?.kind === 'roulette') clock.set(view);
  let chips = ctx.chips;
  let nextTopUpAt = ctx.nextTopUpAt;
  let chip: Chip = savedChip();
  /** The round whose spin we've heard (sound), and whose landing we've shown. */
  let spunRound = view?.phase === 'spinning' ? view.round : -1;
  let landedRound = view && view.phase !== 'spinning' ? view.round : -1;
  let note = '';
  let noteUntil = 0;

  const say = (text: string, ms = 4000) => {
    note = text;
    noteUntil = performance.now() + ms;
    renderStatus();
  };

  // -- Pieces --
  const balance = h('span.casino-chips', {}, '');
  const phaseText = h('div.roulette-phase', { role: 'status', 'aria-live': 'polite' }, '');
  const bar = h('div.roulette-bar-fill', {});
  const barWrap = h('div.roulette-bar', { 'aria-hidden': 'true' }, bar);
  const mineText = h('span.roulette-mine', {}, '');
  const wheelCanvas = h('canvas.roulette-wheel', { width: 180, height: 180, 'aria-hidden': 'true' });
  const wg = wheelCanvas.getContext('2d')!;
  const bigNumber = h('div.roulette-number', { 'aria-hidden': 'true' }, '');
  const history = h('div.roulette-history', { 'aria-label': 'Last numbers' });
  const players = h('div.roulette-players', {});

  const board = svg('svg', { viewBox: `-4 -4 ${W + 8} ${H + 8}`, class: 'roulette-layout', role: 'group', 'aria-label': 'Betting layout' });
  const cells = svg('g');
  const zones = svg('g');
  const chipLayer = svg('g', { class: 'roulette-chips' });
  board.append(cells, chipLayer, zones);
  const spotByKey = new Map<string, Spot>();
  const cellEls = new Map<string, SVGRectElement>();
  for (const s of spots()) {
    spotByKey.set(s.key, s);
    const title = svg('title', {}, `${betLabel(s.key)} · pays ${betOdds(s.key)} to 1`);
    if (s.cell) {
      const rect = svg('rect', { x: s.x + 1, y: s.y + 1, width: s.w - 2, height: s.h - 2, rx: 3, fill: s.cell.fill, class: 'roulette-cell' });
      const text = svg('text', { x: s.cx, y: s.cy, class: 'roulette-cell-label', 'font-size': s.cell.size ?? 16 }, s.cell.label);
      if (s.key === 'red' || s.key === 'black') text.setAttribute('font-size', '22');
      if (s.key === 'red') text.setAttribute('fill', '#ff8a9d');
      const g = svg('g', { class: 'roulette-spot', 'data-key': s.key, tabindex: 0, role: 'button', 'aria-label': betLabel(s.key) }, rect, text, title);
      cellEls.set(s.key, rect);
      cells.append(g);
    } else {
      zones.append(svg('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 3, class: 'roulette-zone', 'data-key': s.key }, title));
    }
  }

  // -- Placing and taking back --
  const place = (key: string) => {
    if (view?.phase !== 'betting') return say(view?.phase === 'idle' || !view ? 'The wheel is resting: take a seat to start a round' : 'No more bets: wait for the next round');
    const mine = myBets();
    const onSpot = mine.find((b) => b.key === key)?.amount ?? 0;
    const total = mine.reduce((s, b) => s + b.amount, 0);
    if (chips < chip) return say(chips ? `You only have ${chipText(chips)} chips: pick a smaller chip` : 'Out of chips: the cashier tops you up tomorrow');
    if (total + chip > ROUND_MAX) return say(`At most ${chipText(ROUND_MAX)} chips a round`);
    if (onSpot + chip > 500) return say(`At most 500 on one spot`);
    ctx.act('bet', { key, amount: chip });
    ctx.sound('chip');
  };
  const takeBack = (key: string) => {
    if (view?.phase !== 'betting') return;
    if (!myBets().some((b) => b.key === key)) return;
    ctx.act('remove', { key });
    ctx.sound('chip');
  };
  const keyAt = (t: EventTarget | null): string | null => {
    const el = t instanceof Element ? t.closest('[data-key]') : null;
    return el?.getAttribute('data-key') ?? null;
  };
  let pressTimer = 0;
  let pressedKey: string | null = null;
  let longPressed = false;
  board.addEventListener('click', (e) => {
    const key = keyAt(e.target);
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (key) place(key);
  });
  board.addEventListener('contextmenu', (e) => {
    const key = keyAt(e.target);
    if (!key) return;
    e.preventDefault();
    takeBack(key);
  });
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    pressedKey = keyAt(e.target);
    longPressed = false;
    clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      if (!pressedKey) return;
      longPressed = true;
      takeBack(pressedKey);
    }, 500);
  });
  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressedKey = null;
  };
  board.addEventListener('pointerup', cancelPress);
  board.addEventListener('pointercancel', cancelPress);
  board.addEventListener('pointerleave', cancelPress);
  board.addEventListener('keydown', (e) => {
    const key = keyAt(e.target);
    if (!key) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      place(key);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      takeBack(key);
    }
  });

  // -- Controls --
  const chipBtns = ROULETTE_CHIPS.map((c, i) => h('button.btn.casino-bet.roulette-chip-btn', { type: 'button', title: `Bet with ${c} (${i + 1})`, 'data-v': c }, String(c)));
  chipBtns.forEach((b, i) =>
    b.addEventListener('click', () => {
      chip = ROULETTE_CHIPS[i];
      try {
        localStorage.setItem(CHIP_KEY, String(chip));
      } catch {
        // fine: it just won't be remembered
      }
      renderControls();
    }),
  );
  const undoBtn = h('button.btn', { type: 'button', title: 'Take back the last chips (Z)' }, '↶ Undo');
  const clearBtn = h('button.btn', { type: 'button', title: 'Take all your chips off' }, 'Clear');
  const rebetBtn = h('button.btn', { type: 'button', title: 'Last round’s bets again (R)' }, '↻ Repeat');
  undoBtn.addEventListener('click', () => {
    if (view?.phase !== 'betting' || !myBets().length) return;
    ctx.act('undo');
    ctx.sound('chip');
  });
  clearBtn.addEventListener('click', () => {
    if (view?.phase !== 'betting' || !myBets().length) return;
    ctx.act('clear');
    ctx.sound('chip');
  });
  rebetBtn.addEventListener('click', () => {
    if (view?.phase !== 'betting' || myBets().length) return;
    ctx.act('rebet');
    ctx.sound('chip');
  });

  const topUp = h('span.grow', {}, '');
  const el = h(
    'div.modal.casino-modal.roulette-modal',
    { role: 'dialog', 'aria-label': ctx.table.name },
    h('header', {}, h('h2', {}, `🎡 ${ctx.table.name}`), balance),
    h(
      'div.body',
      {},
      h('div.roulette-top', {}, h('div.roulette-wheel-wrap', {}, wheelCanvas, bigNumber), h('div.roulette-side', {}, phaseText, barWrap, history, players)),
      h('div.roulette-board', {}, board),
      h(
        'div.casino-controls.roulette-controls',
        {},
        h('span.casino-label', {}, 'Chip'),
        h('div.seg', {}, ...chipBtns),
        h('div.roulette-actions', {}, undoBtn, clearBtn, rebetBtn),
        mineText,
      ),
      h('p.casino-note', {}, 'Click a spot to bet · right-click or long-press to take your chips off. A number pays 35 to 1, a split 17, a street 11, a corner 8, a line 5, dozens and columns 2, red/black, odd/even and 1–18/19–36 even money. Zero: the even-money bets lose. Up to 500 on a spot, 1,000 a round.'),
    ),
    h('footer', {}, topUp),
  );

  // -- Rendering --
  const myBets = () => (view && view.you !== undefined ? view.bets.filter((b) => b.seat === view!.you) : []);

  const renderChips = () => {
    const bets = view?.bets ?? [];
    const stacks = new Map<string, typeof bets>();
    for (const b of bets) stacks.set(b.key, [...(stacks.get(b.key) ?? []), b]);
    const nodes: SVGElement[] = [];
    for (const [key, list] of stacks) {
      const s = spotByKey.get(key);
      if (!s) continue;
      list.forEach((b, i) => {
        const x = s.cx + i * 5;
        const y = s.cy - i * 5;
        const mine = b.seat === view?.you;
        const color = SEAT_COLORS[b.seat % SEAT_COLORS.length];
        nodes.push(
          svg(
            'g',
            { class: `roulette-chip${mine ? ' mine' : ''}` },
            svg('circle', { cx: x, cy: y, r: 11.5, fill: color }),
            svg('circle', { cx: x, cy: y, r: 8.5, fill: 'none', class: 'roulette-chip-ring' }),
            svg('text', { x, y: y + 0.5, class: 'roulette-chip-amt' }, short(b.amount)),
            svg('text', { x: x + 9, y: y - 9, class: 'roulette-chip-who' }, (b.name.trim()[0] ?? '?').toUpperCase()),
            svg('title', {}, `${b.name}: ${b.amount} on ${betLabel(b.key)}`),
          ),
        );
      });
    }
    chipLayer.replaceChildren(...nodes);
    // The winning number and every bet it wins, lit.
    const lit = view?.phase === 'payout' && view.number !== undefined ? view.number : null;
    for (const [key, rect] of cellEls) rect.classList.toggle('won', lit !== null && !!betNumbers(key)?.includes(lit));
  };

  const renderSide = () => {
    history.replaceChildren(
      ...(view?.history ?? []).map((n, i) => h(`span.roulette-ball.${colorOf(n)}${i === 0 ? '.latest' : ''}`, { title: `${n} ${colorOf(n)}` }, String(n))),
    );
    if (!view?.history.length) history.append(h('span.roulette-empty', {}, 'No numbers yet'));
    const totals = new Map<number, number>();
    for (const b of view?.bets ?? []) totals.set(b.seat, (totals.get(b.seat) ?? 0) + b.amount);
    const won = new Map((view?.winners ?? []).map((w) => [w.seat, w.won]));
    players.replaceChildren(
      ...(view?.players ?? []).map((p) =>
        h(
          `span.roulette-player${p.seat === view?.you ? '.you' : ''}`,
          {},
          h('i', { style: `background:${SEAT_COLORS[p.seat % SEAT_COLORS.length]}` }, (p.name.trim()[0] ?? '?').toUpperCase()),
          p.seat === view?.you ? 'You' : p.name,
          won.has(p.seat) ? h('b.won', {}, ` +${chipText(won.get(p.seat)!)}`) : totals.has(p.seat) ? h('b', {}, ` ${chipText(totals.get(p.seat)!)}`) : '',
        ),
      ),
    );
  };

  const renderControls = () => {
    balance.textContent = `🪙 ${chipText(chips)}`;
    chipBtns.forEach((b, i) => b.classList.toggle('on', ROULETTE_CHIPS[i] === chip));
    const betting = view?.phase === 'betting';
    const mine = myBets();
    const total = mine.reduce((s, b) => s + b.amount, 0);
    undoBtn.toggleAttribute('disabled', !betting || !mine.length);
    clearBtn.toggleAttribute('disabled', !betting || !mine.length);
    rebetBtn.toggleAttribute('disabled', !betting || mine.length > 0);
    mineText.textContent = `Your bets: ${chipText(total)} / ${chipText(ROUND_MAX)}`;
    board.classList.toggle('closed', !betting);
    topUp.textContent = nextTopUpAt ? `Play chips only. Your daily top-up comes ${new Date(nextTopUpAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Play chips only: nothing to buy, nothing to cash out.';
  };

  let lastStatus = '';
  const renderStatus = () => {
    const now = performance.now();
    const left = clock.left(now);
    let text: string;
    let frac = 0;
    const phase = view?.phase ?? 'idle';
    const landed = view && landedRound === view.round && view.phase === 'payout' && view.number !== undefined;
    if (phase === 'betting') {
      text = `Place your bets · ${Math.ceil(left / 1000)}s`;
      frac = left / BET_MS;
    } else if (phase === 'spinning') {
      text = 'No more bets · rolling…';
      frac = left / SPIN_MS;
    } else if (phase === 'payout' && landed) {
      text = `${view!.number} ${colorOf(view!.number!)}`;
      frac = left / PAYOUT_MS;
    } else text = 'The wheel is resting';
    if (note && now < noteUntil) text = note;
    else note = '';
    if (text !== lastStatus) {
      lastStatus = text;
      phaseText.textContent = text;
    }
    phaseText.className = `roulette-phase ${phase}${note ? ' note' : ''}`;
    bar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    barWrap.className = `roulette-bar ${phase}`;
    bigNumber.textContent = landed ? String(view!.number) : '';
    bigNumber.className = `roulette-number ${landed ? colorOf(view!.number!) : ''}`;
  };

  const render = () => {
    renderControls();
    renderChips();
    renderSide();
    renderStatus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (['1', '2', '3', '4'].includes(e.key)) chipBtns[Number(e.key) - 1]?.click();
    else if (e.key === 'z' || e.key === 'Z') undoBtn.click();
    else if (e.key === 'r' || e.key === 'R') rebetBtn.click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  let raf = 0;
  let lastDraw = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    renderStatus();
    // The little wheel: every frame while it spins, a few times a second otherwise.
    if (view?.phase === 'spinning' || now - lastDraw > 120) {
      lastDraw = now;
      drawWheel(wg, wheelCanvas.width, clock.pose(now), FONT);
    }
  };

  const modal = openModal(el, {
    doing: 'playing roulette',
    onClose: () => {
      cancelAnimationFrame(raf);
      clearTimeout(pressTimer);
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();
  frame();

  return {
    table(state) {
      const s = state as RouletteView | null;
      if (!s || s.kind !== 'roulette') return;
      view = s;
      clock.set(s);
      if (s.phase === 'spinning' && spunRound !== s.round) {
        spunRound = s.round;
        if (myBets().length || s.bets.some((b) => b.seat === s.you)) ctx.sound('spin');
      }
      if (s.phase === 'payout' && landedRound !== s.round) {
        landedRound = s.round;
        ctx.sound('reel');
      }
      render();
    },
    wallet(n, next) {
      chips = n;
      nextTopUpAt = next;
      renderControls();
    },
    result(text, _delta, data) {
      const r = data as RouletteResult | undefined;
      if (!r || typeof r.number !== 'number') {
        // Turned down (a limit, too quick, not enough chips): say why, right here.
        say(text);
        ctx.sound('lose');
        return true;
      }
      if (r.won) ctx.sound(r.won >= r.staked * 10 && r.won >= 100 ? 'jackpot' : 'win');
      else ctx.sound('lose');
      el.classList.toggle('won', r.won > r.staked);
      setTimeout(() => el.classList.remove('won'), 2500);
      // The toast says it (winnings or not); the status line shows the number.
      return false;
    },
    close: () => modal.close(),
  };
}

registerCasinoUi('roulette', openRoulette);

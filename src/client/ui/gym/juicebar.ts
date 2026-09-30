import { SMOOTHIES, STAMINA_MAX, type JuiceBarView, type FitnessProfile } from '../../../shared/gym';
import { h, openModal } from '../dom';
import { distText, num, registerGymUi, xpText, type GymUi, type GymUiContext } from './registry';
import './gym.css';

/*
 * The juice bar's window (flrnoh fork, see shared/gym.ts and server/gym/juicebar.ts): the gym's
 * cashier. Your fitness at a glance, the building's leaderboard, and a smoothie for a quick energy
 * top-up. Nothing costs anything.
 */

export function openJuiceBar(ctx: GymUiContext): GymUi {
  let view = ctx.state as JuiceBarView | null;
  let profile = ctx.profile;

  const xpFill = h('i');
  const xpBar = h('div.gym-bar', {}, xpFill);
  const xpCap = h('span.val', {}, '');
  const enFill = h('i');
  const enBar = h('div.gym-bar.energy', {}, enFill);
  const enCap = h('span.val', {}, '');
  const rankLine = h('div', { style: 'font-weight:900;font-size:18px' }, '');
  const tallies = h('div.gym-readout', { style: 'flex-wrap:wrap;gap:14px 12px' });
  const board = h('table.gym-board');
  const message = h('div.gym-message', { style: 'min-height:0;margin:0' }, '');

  const stat = (n: string, cap: string) => h('div', {}, h('div.num', { style: 'font-size:20px' }, n), h('div.cap', {}, cap));

  const renderProfile = (p: FitnessProfile) => {
    profile = p;
    rankLine.textContent = `${p.rank} · Level ${p.level}`;
    xpFill.style.width = `${Math.min(100, (p.levelXp / p.levelSpan) * 100)}%`;
    xpCap.textContent = `${num(p.levelXp)} / ${num(p.levelSpan)}`;
    const st = Math.max(0, Math.min(STAMINA_MAX, p.stamina));
    enFill.style.width = `${(st / STAMINA_MAX) * 100}%`;
    enCap.textContent = `${Math.round(st)}`;
    tallies.replaceChildren(
      stat(num(p.totals.workouts), 'workouts'),
      stat(distText(p.totals.meters), 'distance'),
      stat(num(p.totals.calories), 'kcal'),
      stat(num(p.totals.volume), 'volume'),
      stat(`${Math.round(p.totals.relaxSecs / 60)}m`, 'relaxed'),
      stat(`🔥 ${p.streak}`, 'day streak'),
    );
  };

  const renderBoard = () => {
    const rows = view?.board ?? [];
    board.replaceChildren(
      h('caption', {}, '🏆 Leaderboard'),
      h('tr', {}, h('th', {}, '#'), h('th', {}, 'Name'), h('th', {}, 'Rank'), h('th', { style: 'text-align:right' }, 'XP')),
      ...(rows.length
        ? rows.map((r, i) => h('tr', { class: r.you ? 'you' : '' }, h('td.n', {}, `${i + 1}`), h('td', {}, r.name), h('td.rank', {}, `${r.rank} · Lv ${r.level}`), h('td.xp', {}, xpText(r.xp))))
        : [h('tr', {}, h('td', { colspan: '4', style: 'color:var(--muted)' }, 'Be the first to break a sweat.'))]),
    );
  };

  const menu = h(
    'div.gym-menu',
    {},
    ...SMOOTHIES.map((s) => {
      const b = h('button.btn.gym-smoothie', { type: 'button', title: s.note }, h('span.ic', {}, s.icon), h('span', {}, h('b', {}, s.name), h('small', {}, `+${s.energy} energy`)));
      b.addEventListener('click', () => {
        ctx.act('order', { smoothie: s.id });
        ctx.sound('sip');
      });
      return b;
    }),
  );

  const el = h(
    'div.modal.gym-modal.gym-juicebar',
    { role: 'dialog', 'aria-label': 'Juice bar' },
    h('header', {}, h('h2', {}, '🥤 Juice bar'), rankLine),
    h(
      'div.body',
      {},
      h('div.gym-barrow', {}, h('span.cap', {}, 'Level'), xpBar, xpCap),
      h('div.gym-barrow', {}, h('span.cap', {}, 'Energy'), enBar, enCap),
      tallies,
      h('div', { style: 'margin-top:14px' }, board),
      h('div', { style: 'margin-top:14px' }, h('span.gym-label', {}, 'Smoothies'), menu, message),
      h('p.gym-note', {}, 'Everything here is on the house. Work out to climb the leaderboard; nothing to buy, nothing to cash out.'),
    ),
  );

  const modal = openModal(el, {
    doing: 'at the juice bar',
    onClose: () => ctx.closed(),
  });
  renderProfile(profile);
  renderBoard();

  return {
    station(state) {
      const s = state as JuiceBarView | null;
      if (!s || s.kind !== 'juicebar') return;
      view = s;
      renderBoard();
    },
    profile(p) {
      renderProfile(p);
    },
    result(text) {
      message.textContent = text;
      return true;
    },
    close: () => modal.close(),
  };
}

registerGymUi('juicebar', openJuiceBar);

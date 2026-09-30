import { CARDIO_MACHINES, INTENSITIES, type CardioView, type Intensity } from '../../../shared/gym-cardio';
import { STAMINA_MAX } from '../../../shared/gym';
import { h, openModal } from '../dom';
import { distText, num, registerGymUi, type GymUi, type GymUiContext } from './registry';
import './gym.css';

/*
 * A cardio machine's window (flrnoh fork, see shared/gym-cardio.ts): pick a pace and go. The office
 * runs the session on its clock and streams the distance, calories and speed back; this just draws
 * the readout and the pace buttons. Start/stop with Space, the pace with 1–4. The reference gym
 * window: the strength, wellness and juice-bar windows follow its shape.
 */

const LABEL: Record<Intensity, string> = { easy: 'Easy', steady: 'Steady', hard: 'Hard', sprint: 'Sprint' };

export function openCardio(ctx: GymUiContext): GymUi {
  const m = CARDIO_MACHINES[ctx.station.machine] ?? CARDIO_MACHINES.treadmill;
  let view = ctx.state as CardioView | null;
  let profile = ctx.profile;
  let intensity: Intensity = view?.intensity ?? 'steady';
  let running = view?.running ?? false;

  const distEl = h('div.num', {}, '0');
  const calEl = h('div.num', {}, '0');
  const timeEl = h('div.num', {}, '0:00');
  const readout = h(
    'div.gym-readout',
    {},
    h('div', {}, distEl, h('div.cap', {}, m.unit === 'm' ? 'distance' : m.unit)),
    h('div', {}, calEl, h('div.cap', {}, 'kcal')),
    h('div', {}, timeEl, h('div.cap', {}, 'time')),
  );
  const pace = h('i');
  const paceBar = h('div.gym-bar.power', {}, pace);
  const energy = h('i');
  const energyBar = h('div.gym-bar.energy', {}, energy);
  const energyVal = h('span.val', {}, '');
  const message = h('div.gym-message', { role: 'status', 'aria-live': 'polite' }, 'Pick a pace and press Start (Space).');
  const goBtn = h('button.btn.primary.gym-go', { type: 'button', title: 'Start / stop (Space)' }, '▶ Start');
  const paceBtns = INTENSITIES.map((i) => h('button.btn.gym-opt', { type: 'button', title: `${LABEL[i]} (${INTENSITIES.indexOf(i) + 1})` }, LABEL[i]));

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const render = () => {
    distEl.textContent = m.unit === 'm' ? distText(view?.meters ?? 0) : num(view?.meters ?? 0);
    calEl.textContent = num(view?.calories ?? 0);
    timeEl.textContent = mmss(view?.secs ?? 0);
    const topSpeed = m.speed.sprint;
    pace.style.width = `${Math.min(100, ((view?.speed ?? 0) / topSpeed) * 100)}%`;
    const st = Math.max(0, Math.min(STAMINA_MAX, profile.stamina));
    energy.style.width = `${(st / STAMINA_MAX) * 100}%`;
    energyVal.textContent = `${Math.round(st)}`;
    paceBtns.forEach((b, i) => b.classList.toggle('on', INTENSITIES[i] === intensity));
    goBtn.textContent = running ? '⏹ Stop' : '▶ Start';
    goBtn.classList.toggle('stop', running);
  };

  const setPace = (i: Intensity) => {
    intensity = i;
    if (running) ctx.act('set', { intensity });
    ctx.sound('run');
    render();
  };
  const toggle = () => {
    if (running) {
      ctx.act('stop');
      running = false;
      message.textContent = 'Session banked — nice work.';
    } else {
      ctx.act('start', { intensity });
      running = true;
      message.textContent = `${m.icon} Go! Push the pace with 1–4.`;
    }
    render();
  };
  goBtn.addEventListener('click', toggle);
  paceBtns.forEach((b, i) => b.addEventListener('click', () => setPace(INTENSITIES[i])));

  const el = h(
    'div.modal.gym-modal.gym-cardio',
    { role: 'dialog', 'aria-label': ctx.station.name },
    h('header', {}, h('h2', {}, `${m.icon} ${ctx.station.name}`), h('span.gym-stat.energy', {}, `⚡ Lv ${profile.level}`)),
    h(
      'div.body',
      {},
      h('div.gym-panel', {}, readout, message),
      h('div.gym-barrow', {}, h('span.cap', {}, 'Pace'), paceBar, h('span.val', {}, '')),
      h('div.gym-barrow', {}, h('span.cap', {}, 'Energy'), energyBar, energyVal),
      h('div.gym-controls', {}, h('span.gym-label', {}, 'Pace'), h('div.seg', {}, ...paceBtns), goBtn),
      h('p.gym-note', {}, 'Calories earn fitness points. Run low on energy and you drop to a walk — recover in the wellness area.'),
    ),
  );

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (['1', '2', '3', '4'].includes(e.key)) paceBtns[Number(e.key) - 1]?.click();
  };
  window.addEventListener('keydown', onKey, true);

  const modal = openModal(el, {
    doing: `on the ${ctx.station.name.toLowerCase()}`,
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();
  setTimeout(() => goBtn.focus(), 30);

  return {
    station(state) {
      const s = state as CardioView | null;
      if (!s || s.kind !== 'cardio') return;
      view = s;
      running = s.running;
      if (s.running) intensity = s.intensity;
      render();
    },
    profile(p) {
      profile = p;
      render();
    },
    result(text) {
      message.textContent = text;
      ctx.sound('cheer');
      return true;
    },
    close: () => modal.close(),
  };
}

registerGymUi('cardio', openCardio);

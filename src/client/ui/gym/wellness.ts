import { WELLNESS_SPOTS, type WellnessView } from '../../../shared/gym-wellness';
import { STAMINA_MAX } from '../../../shared/gym';
import { h, openModal } from '../dom';
import { registerGymUi, type GymUi, type GymUiContext } from './registry';
import './gym.css';

/*
 * A wellness spot's window (flrnoh fork, see shared/gym-wellness.ts): the sauna, steam room, jacuzzi,
 * cold plunge, a massage lounger or the stretch studio. Just being in one tops your energy back up
 * (you watch the bar climb); where it makes sense, pour water on the stones or hold a pose (Space)
 * for a little more and a puff of steam.
 */

export function openWellness(ctx: GymUiContext): GymUi {
  const spot = WELLNESS_SPOTS[ctx.station.machine] ?? WELLNESS_SPOTS.sauna;
  let view = ctx.state as WellnessView | null;
  let profile = ctx.profile;
  let lastPuff = view?.puffAt ?? 0;

  const energy = h('i');
  const energyBar = h('div.gym-bar.energy', {}, energy);
  const energyVal = h('span.val', {}, '');
  const message = h('div.gym-message', { role: 'status', 'aria-live': 'polite' }, spot.note);
  const occ = h('div.gym-occupants');
  const actBtn = spot.action ? h('button.btn.primary.gym-go', { type: 'button', title: 'Space' }, spot.action === 'pose' ? '🧘 Hold pose' : '💧 Pour water') : null;

  const render = () => {
    const st = Math.max(0, Math.min(STAMINA_MAX, profile.stamina));
    energy.style.width = `${(st / STAMINA_MAX) * 100}%`;
    energyVal.textContent = `${Math.round(st)} / ${STAMINA_MAX}`;
    occ.replaceChildren(...(view?.occupants ?? []).map((n) => h('span.gym-chip', {}, n)));
  };

  const doAction = () => {
    if (!spot.action) return;
    ctx.act(spot.action);
    ctx.sound(spot.action === 'pose' ? 'whoosh' : 'splash');
  };
  actBtn?.addEventListener('click', doAction);

  const el = h(
    'div.modal.gym-modal.gym-wellness',
    { role: 'dialog', 'aria-label': ctx.station.name },
    h('header', {}, h('h2', {}, `${spot.icon} ${ctx.station.name}`), h('span.gym-stat', {}, spot.temp)),
    h(
      'div.body',
      {},
      h('div.gym-panel', {}, h('div.gym-readout', {}, h('div', {}, h('div.num', {}, spot.icon), h('div.cap', {}, ctx.station.name))), message),
      h('div.gym-barrow', {}, h('span.cap', {}, 'Energy'), energyBar, energyVal),
      h('div.gym-controls', {}, h('span.gym-label', {}, `Guests (${view?.occupants.length ?? 0}/${view?.seats ?? ctx.station.seats})`), ...(actBtn ? [actBtn] : [])),
      occ,
      h('p.gym-note', {}, 'Relax to recover the energy your workouts spend — and earn a little for looking after yourself.'),
    ),
  );

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat || !spot.action) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      doAction();
    }
  };
  window.addEventListener('keydown', onKey, true);

  const modal = openModal(el, {
    doing: `in the ${ctx.station.name.toLowerCase()}`,
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();

  return {
    station(state) {
      const s = state as WellnessView | null;
      if (!s || s.kind !== 'wellness') return;
      view = s;
      if (s.puffAt && s.puffAt !== lastPuff) {
        lastPuff = s.puffAt;
        el.classList.add('gym-won');
        window.setTimeout(() => el.classList.remove('gym-won'), 900);
      }
      render();
    },
    profile(p) {
      profile = p;
      render();
    },
    result(text) {
      message.textContent = text;
      return true;
    },
    close: () => modal.close(),
  };
}

registerGymUi('wellness', openWellness);

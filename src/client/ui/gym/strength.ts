import { EXERCISES, MAX_TARGET, MIN_TARGET, comfyWeight, type SetResult, type StrengthView } from '../../../shared/gym-strength';
import { STAMINA_MAX } from '../../../shared/gym';
import { SET_TAIL, REP_PEAK, repPeakAt, repSeconds } from '../../../shared/gym-motion';
import { h, openModal } from '../dom';
import { num, registerGymUi, xpText, type GymUi, type GymUiContext } from './registry';
import './gym.css';

/*
 * A strength station's window (flrnoh fork, see shared/gym-strength.ts): load the bar, pick how many
 * reps to go for, and grind out the set. The office decides how it goes; the window shows each rep
 * landing (clean or a form break) and what you banked. Space goes for a set; the arrows change the
 * weight and target.
 */

export function openStrength(ctx: GymUiContext): GymUi {
  const ex = EXERCISES[ctx.station.machine] ?? EXERCISES.bench;
  let view = ctx.state as StrengthView | null;
  let profile = ctx.profile;
  let weight = view?.weight ?? comfyWeight(ex, profile.level);
  let target = 8;
  let asked = false;
  let anim = 0;

  const weightAmt = h('span.amt', {}, '');
  const targetAmt = h('span.amt', {}, '');
  const dots = h('div.gym-readout', { style: 'font-size:22px;letter-spacing:4px;min-height:1.4em;justify-content:center' });
  const message = h('div.gym-message', { role: 'status', 'aria-live': 'polite' }, `Load the bar and go for a set.`);
  const best = h('p.gym-note', {}, '');
  const energy = h('i');
  const energyBar = h('div.gym-bar.energy', {}, energy);
  const energyVal = h('span.val', {}, '');
  const goBtn = h('button.btn.primary.gym-go', { type: 'button', title: 'Go for a set (Space)' }, '🏋️ Set');

  const wMinus = h('button.btn.gym-opt', { type: 'button', title: 'Lighter (↓)' }, '−');
  const wPlus = h('button.btn.gym-opt', { type: 'button', title: 'Heavier (↑)' }, '+');
  const tMinus = h('button.btn.gym-opt', { type: 'button', title: 'Fewer reps (←)' }, '−');
  const tPlus = h('button.btn.gym-opt', { type: 'button', title: 'More reps (→)' }, '+');

  const render = () => {
    weightAmt.textContent = `${weight} ${ex.unit}`;
    targetAmt.textContent = `${target} reps`;
    const st = Math.max(0, Math.min(STAMINA_MAX, profile.stamina));
    energy.style.width = `${(st / STAMINA_MAX) * 100}%`;
    energyVal.textContent = `${Math.round(st)}`;
    const busy = asked || !!view?.working;
    goBtn.toggleAttribute('disabled', busy);
    goBtn.textContent = busy ? '🏋️ …' : '🏋️ Set';
    const bv = view?.bestVolume ?? 0;
    best.textContent = bv ? `Best set here: ${num(bv)} ${ex.unit}·reps. Heavier earns more, but risks the last reps.` : 'Heavier earns more volume, but risks the last reps.';
  };

  const changeWeight = (d: number) => {
    weight = Math.max(ex.step, Math.min(ex.max, weight + d * ex.step));
    ctx.sound('clank');
    render();
  };
  const changeTarget = (d: number) => {
    target = Math.max(MIN_TARGET, Math.min(MAX_TARGET, target + d));
    render();
  };
  const go = () => {
    if (asked || view?.working) return;
    if (profile.stamina < 3) {
      message.textContent = "You're spent — recover in the wellness area.";
      ctx.sound('buzzer');
      return;
    }
    asked = true;
    message.textContent = 'Here we go…';
    dots.replaceChildren();
    ctx.act('set', { weight, target });
    render();
  };
  wMinus.addEventListener('click', () => changeWeight(-1));
  wPlus.addEventListener('click', () => changeWeight(1));
  tMinus.addEventListener('click', () => changeTarget(-1));
  tPlus.addEventListener('click', () => changeTarget(1));
  goBtn.addEventListener('click', go);

  const el = h(
    'div.modal.gym-modal.gym-strength',
    { role: 'dialog', 'aria-label': ctx.station.name },
    h('header', {}, h('h2', {}, `${ex.icon} ${ctx.station.name}`), h('span.gym-stat.energy', {}, `⚡ Lv ${profile.level}`)),
    h(
      'div.body',
      {},
      h('div.gym-panel', {}, dots, message),
      h('div.gym-barrow', {}, h('span.cap', {}, 'Energy'), energyBar, energyVal),
      h(
        'div.gym-controls',
        {},
        h('span.gym-step', {}, h('span.cap', {}, 'Weight'), wMinus, weightAmt, wPlus),
        h('span.gym-step', {}, h('span.cap', {}, 'Reps'), tMinus, targetAmt, tPlus),
        goBtn,
      ),
      best,
    ),
  );

  const clearAnim = () => {
    if (anim) window.clearTimeout(anim);
    anim = 0;
  };
  /** Fills a dot per rep, clean or broken, then says how it went. */
  const play = (res: SetResult, text: string) => {
    clearAnim();
    dots.replaceChildren();
    const spans = res.form.map(() => h('span', {}, '•'));
    dots.append(...spans);
    let i = 0;
    const tick = () => {
      if (i < res.form.length) {
        const ok = res.form[i];
        spans[i].textContent = ok ? '🟢' : '🔴';
        ctx.sound(ok ? 'rep' : 'buzzer');
        i++;
        // At the lifter's tempo (shared/gym-motion.ts): each dot lands as the rep reaches the top.
        const rep = repSeconds(ctx.station.machine);
        anim = window.setTimeout(tick, (i >= res.form.length ? (1 - REP_PEAK) * rep + SET_TAIL : rep) * 1000);
      } else {
        anim = 0;
        message.textContent = text;
        if (res.reps >= res.target) {
          el.classList.add('gym-won');
          ctx.sound('cheer');
          window.setTimeout(() => el.classList.remove('gym-won'), 1400);
        }
      }
    };
    anim = window.setTimeout(tick, repPeakAt(ctx.station.machine, 0) * 1000);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      go();
    } else if (e.key === 'ArrowUp') changeWeight(1);
    else if (e.key === 'ArrowDown') changeWeight(-1);
    else if (e.key === 'ArrowRight') changeTarget(1);
    else if (e.key === 'ArrowLeft') changeTarget(-1);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey, true);

  const modal = openModal(el, {
    doing: `on the ${ctx.station.name.toLowerCase()}`,
    onClose: () => {
      clearAnim();
      window.removeEventListener('keydown', onKey, true);
      ctx.closed();
    },
  });
  render();
  setTimeout(() => goBtn.focus(), 30);

  return {
    station(state) {
      const s = state as StrengthView | null;
      if (!s || s.kind !== 'strength') return;
      view = s;
      if (!asked && !s.working) weight = s.weight;
      render();
    },
    profile(p) {
      profile = p;
      render();
    },
    result(text, xp, data) {
      const res = data as SetResult | undefined;
      asked = false;
      if (!res || !Array.isArray(res.form)) {
        // Refused (too soon, not your station, out of energy): say why.
        message.textContent = text;
        render();
        return true;
      }
      play(res, `${text}${xp ? ` · +${xpText(xp)} XP` : ''}`);
      render();
      return true;
    },
    close: () => modal.close(),
  };
}

registerGymUi('strength', openStrength);

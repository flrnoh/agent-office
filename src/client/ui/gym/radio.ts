import { GYM_CHANNELS, GYM_DEFAULT_CHANNEL, GYM_DEFAULT_VOLUME, GYM_VOLUME_MAX, type GymRadioView } from '../../../shared/gym-radio';
import { h, openModal } from '../dom';
import { registerGymUi, type GymUi, type GymUiContext } from './registry';
import './gym.css';
import './radio.css';

/*
 * Gym FM's window (flrnoh fork, see shared/gym-radio.ts and server/gym/radio.ts): E at the sound system
 * on the reception counter. A card per station to put on, and the speakers' volume, both for everyone
 * in the gym (each person's own music volume still applies on top). Nobody sits at it: closing it is
 * just closing it.
 */

/** How often the slider tells the office while you drag it (the gym's rate limit is 4 a second). */
const SLIDE_MS = 300;

export function openGymRadio(ctx: GymUiContext): GymUi {
  let view = ctx.state as GymRadioView | null;
  const cards = new Map<string, HTMLButtonElement>();
  const list = h('div.gymfm-list');
  for (const c of GYM_CHANNELS) {
    const b = h('button.btn.gymfm-card', { type: 'button', title: c.url ? `${c.name}: ${c.genre}` : 'Switch the radio off' }, h('span.ic', {}, c.emoji), h('span.txt', {}, h('b', {}, c.name), h('small', {}, c.genre)), h('span.live', {}, '● ON AIR')) as HTMLButtonElement;
    b.addEventListener('click', () => {
      if (view?.channel === c.id) return;
      ctx.act('tune', { channel: c.id });
      ctx.sound('ding');
    });
    cards.set(c.id, b);
    list.append(b);
  }
  const slider = h('input.gymfm-slider', { type: 'range', min: '0', max: String(GYM_VOLUME_MAX * 100), step: '5', 'aria-label': 'Speaker volume for everyone in the gym' }) as HTMLInputElement;
  const pct = h('span.gymfm-pct', {}, '');
  const who = h('div.gymfm-who', {}, '');
  const message = h('div.gym-message', { style: 'min-height:1.2em;font-size:14px;margin-top:8px' }, '');

  // While you drag: the number follows at once, the office hears a few times a second and once more on letting go.
  let dragging = false;
  let lastSent = 0;
  let pending = 0;
  const send = () => {
    window.clearTimeout(pending);
    lastSent = performance.now();
    ctx.act('volume', { volume: Number(slider.value) / 100 });
  };
  slider.addEventListener('input', () => {
    dragging = true;
    pct.textContent = `${slider.value} %`;
    const wait = SLIDE_MS - (performance.now() - lastSent);
    window.clearTimeout(pending);
    if (wait <= 0) send();
    else pending = window.setTimeout(send, wait);
  });
  slider.addEventListener('change', () => {
    dragging = false;
    send();
  });

  const render = () => {
    const channel = view?.channel ?? GYM_DEFAULT_CHANNEL;
    for (const [id, b] of cards) b.classList.toggle('on', id === channel);
    const vol = Math.round((view?.volume ?? GYM_DEFAULT_VOLUME) * 100);
    if (!dragging) {
      slider.value = String(vol);
      pct.textContent = `${vol} %`;
    }
    const bits = [view?.by ? `Station picked by ${view.by}` : '', view?.volumeBy ? `volume set by ${view.volumeBy}` : ''].filter(Boolean);
    who.textContent = bits.join(' · ');
  };

  const el = h(
    'div.modal.gym-modal.gymfm',
    { role: 'dialog', 'aria-label': 'Gym FM' },
    h('header', {}, h('h2', {}, '📻 Gym FM'), h('span.gym-stat', {}, 'for everyone in the gym')),
    h(
      'div.body',
      {},
      h('span.gym-label', {}, 'Station'),
      list,
      h('div.gymfm-vol', {}, h('span.gym-label', {}, '🔊 Speakers'), slider, pct),
      who,
      message,
      h('p.gym-note', {}, 'It plays on the gym floor, quieter in the changing room. The wellness spa and the basement stay quiet. Your own jukebox volume (☰ → Settings) still applies on top.'),
    ),
  );

  const modal = openModal(el, { doing: 'picking the gym radio', onClose: () => ctx.closed() });
  render();

  return {
    station(state) {
      const s = state as GymRadioView | null;
      if (!s || s.kind !== 'radio') return;
      view = s;
      render();
    },
    profile() {},
    result(text) {
      message.textContent = text;
      return true;
    },
    close: () => modal.close(),
  };
}

registerGymUi('radio', openGymRadio);

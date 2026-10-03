/**
 * flrnoh fork (see FORK.md "The phone"): your phone. I takes it out (everyone sees it in your hand,
 * held out in front of you) and opens it on its home screen: the time, the network, and the apps the
 * features put on it (apps.ts): the Waymo robotaxis, the bus departures, the town's map. Tap one to
 * open it, ‹ for home, ✕ or Esc (or I again) to put it away and look about again.
 */
import { PHONE_THROTTLE_MS } from '../../../shared/phone';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { h, openModal, type Modal } from '../../ui/dom';
import type { Person } from '../../world/character';
import { phoneApps, type PhoneApp } from './apps';
import { holdPhone } from './prop';
import './ui.css';

export interface PhoneDeps {
  /** The people on your floor, by id (see features/peers). */
  remotes(): ReadonlyMap<string, { person: Person }>;
}

const clock = () => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export function installPhone(ctx: Ctx, deps: PhoneDeps) {
  let modal: Modal | null = null;
  let leave: (() => void) | void;
  let ticker = 0;

  // ---- Out or away, as everyone sees it ------------------------------------------------------------
  let sent = false;
  let sentAt = 0;
  const tell = (on: boolean) => {
    if (on === sent) return;
    // Out and straight away again: the office takes it no more often than PHONE_THROTTLE_MS.
    const wait = Math.max(0, sentAt + PHONE_THROTTLE_MS + 20 - performance.now());
    window.setTimeout(() => {
      const now = !!modal;
      if (now === sent) return;
      sent = now;
      sentAt = performance.now();
      ctx.net.send({ t: 'phone.hold', on: now });
    }, wait);
  };
  ctx.messages.on('welcome', () => {
    sent = false;
    if (modal) tell(true);
  });
  ctx.messages.on('phone.held', (msg) => {
    const p = store.peers.get(msg.id);
    if (p) {
      if (msg.on) p.phone = true;
      else delete p.phone;
    }
    const r = deps.remotes().get(msg.id);
    if (r) holdPhone(r.person, msg.on);
  });

  // ---- The phone ---------------------------------------------------------------------------------
  const time = h('span.phone-time', {}, clock());
  const screen = h('div.phone-screen', {});
  const title = h('span.phone-title', {}, '');
  const backBtn = h('button.phone-back', { type: 'button', 'aria-label': 'Home' }, '‹');
  const bar = h('div.phone-appbar.hidden', {}, backBtn, title);
  const el = h(
    'div.phone',
    {},
    h('div.phone-status', {}, time, h('span.phone-notch', {}), h('span.phone-net', {}, 'Flogge 5G ▮▮▮ 🔋')),
    bar,
    screen,
    h('div.phone-homebar', {}),
  );
  backBtn.addEventListener('click', () => home());
  const host = { close: () => modal?.close(), home: () => home() };

  function leaveApp() {
    if (typeof leave === 'function') leave();
    leave = undefined;
  }

  function home() {
    leaveApp();
    bar.classList.add('hidden');
    screen.replaceChildren(
      h(
        'div.phone-home',
        {},
        ...phoneApps().map((a) => {
          const badge = a.badge?.();
          const tile = h('button.phone-app', { type: 'button', 'data-app': a.id }, h('span.phone-icon', { style: `background:${a.color}` }, a.icon, ...(badge ? [h('span.phone-badge', {}, badge)] : [])), h('span.phone-label', {}, a.name));
          tile.addEventListener('click', () => openApp(a));
          return tile;
        }),
      ),
    );
  }

  function openApp(a: PhoneApp) {
    leaveApp();
    title.textContent = a.name;
    bar.classList.remove('hidden');
    const body = h('div.phone-app-body', {});
    screen.replaceChildren(body);
    leave = a.open(body, host);
  }

  /** Takes the phone out, on its home screen or straight in app `id`. */
  function open(id?: string) {
    if (modal) {
      const a = id && phoneApps().find((x) => x.id === id);
      if (a) openApp(a);
      return;
    }
    modal = openModal(el, {
      doing: '📱 on the phone',
      onClose: () => {
        leaveApp();
        modal = null;
        clearInterval(ticker);
        holdPhone(ctx.me, false);
        tell(false);
      },
    });
    time.textContent = clock();
    ticker = window.setInterval(() => (time.textContent = clock()), 5000);
    holdPhone(ctx.me, true);
    tell(true);
    const a = id && phoneApps().find((x) => x.id === id);
    if (a) openApp(a);
    else home();
  }

  /** The press that took it out, so the same press doesn't put it away again (below). */
  let opening: KeyboardEvent | null = null;
  ctx.keys.bind({
    code: 'KeyI',
    repeat: false,
    run: (e) => {
      opening = e;
      open();
    },
  });
  // I again, with the phone open (the modal has the keys then), unless you're typing in it.
  window.addEventListener('keydown', (e) => {
    if (!modal || e === opening || e.code !== 'KeyI' || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    modal.close();
  });

  return {
    open,
    close: () => modal?.close(),
    isOpen: () => !!modal,
  };
}

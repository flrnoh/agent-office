import type { VenueMode } from '../../shared/venue';
import { ANNOUNCEMENTS, EFFECTS, FX_COOLDOWN_MS, FX_NAMES, MERCH, SCENES, SCENE_NAMES, type MerchId, type VenueFx, type VenueLights, type VenueScene } from '../../shared/venue-house';
import { DRINK_BY_ID, type Drink, type DrinkId } from '../../shared/rooftop';
import { h, openModal } from '../ui/dom';
import { shirtTexture } from '../world/venue/foyer';
import './ui.css';

// The Schallwerk's windows (flrnoh fork, see FORK.md "The Schallwerk"): the bar's menu (and the rider
// fridge's), the merch stand, the Lichtpult at the light desk, the announcements at the sound desk.
// Each has a ✕ top right, and ✕ or Esc goes straight back to the game.

/** Picks one with a click, Enter or Space, without the office's own Enter opening the chat. */
function pickable(el: HTMLElement, pick: () => void) {
  el.addEventListener('click', pick);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick();
    }
  });
}

const closeButton = () => h('button.btn.close', { 'aria-label': 'Schließen' }, '✕');

/** What it does to you, for the menu. */
function effect(d: Drink): string {
  if (d.strength > 0.4) return '🥃 haut rein';
  if (d.strength > 0) return '🍺 steigt ein bisschen zu Kopf';
  if (d.strength < 0) return '💧 macht den Kopf klarer';
  return 'alkoholfrei';
}

/**
 * The bar's menu (or the rider's): what you pick is poured and handed over. `cut`: you've had enough
 * for now, nothing with alcohol. Grouped into beer, longdrinks and shots, and the soft ones.
 */
export function openVenueMenu(opts: { title: string; doing: string; footer: string; menu: readonly DrinkId[]; cut: boolean; cutNote: string; order(d: Drink): void }) {
  const close = closeButton();
  const items = opts.menu.map((id) => DRINK_BY_ID.get(id)).filter((d): d is Drink => !!d);
  const row = (d: Drink) => {
    const off = d.strength > 0 && opts.cut;
    const li = h(
      'li',
      { tabindex: 0, role: 'button', title: `${d.name} bestellen`, class: off ? 'vn-off' : '' },
      h('span.jb-icon', { style: 'font-size:26px' }, d.emoji),
      h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, off ? opts.cutNote : `${d.blurb} · ${effect(d)}`)),
    );
    pickable(li, () => {
      if (off) return;
      modal.close();
      opts.order(d);
    });
    return li;
  };
  const groups: [string, (d: Drink) => boolean][] = [
    ['🍺 Bier', (d) => d.strength > 0 && d.strength < 0.3 && (d.glass === 'pint' || d.glass === 'bottle')],
    ['🍸 Longdrinks & Kurze', (d) => d.strength > 0 && !(d.strength < 0.3 && (d.glass === 'pint' || d.glass === 'bottle'))],
    ['🧉 Ohne', (d) => d.strength <= 0],
  ];
  const body = h('div.body', {});
  for (const [name, test] of groups) {
    const list = items.filter(test);
    if (!list.length) continue;
    body.append(h('h3.vn-h', {}, name), h('ul.svc-list', {}, ...list.map(row)));
  }
  const el = h('div.modal.jukebox.vn-menu', { role: 'dialog', 'aria-label': opts.title }, h('header', {}, h('h2', {}, opts.title), close), body, h('footer', {}, h('span.grow', {}, opts.footer)));
  const modal = openModal(el, { doing: opts.doing });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (body.querySelector('li[tabindex="0"]:not(.vn-off)') as HTMLElement | null)?.focus(), 30);
}

/** The merch stand: a shirt or the hoodie to wear (everyone sees it), taking it off, a poster to take home. */
export function openMerch(opts: { wearing: MerchId | null; wear(id: MerchId | null): void; poster(): string }) {
  const close = closeButton();
  const cards = MERCH.map((m) => {
    const img = h('img.vn-shirt', { src: (shirtTexture(m).image as HTMLCanvasElement).toDataURL(), alt: m.name });
    const on = m.id === opts.wearing;
    const card = h('button.btn.vn-card', { type: 'button', class: on ? 'on' : '', title: on ? 'Hast du an' : `${m.name} anziehen` }, img, h('strong', {}, `${m.emoji} ${m.name}`), h('span', {}, m.blurb), h('em', {}, on ? '✓ Hast du an' : '0 € · Anziehen'));
    pickable(card, () => {
      modal.close();
      if (!on) opts.wear(m.id);
    });
    return card;
  });
  const off = opts.wearing ? h('button.btn.vn-wide', { type: 'button' }, '🔄 Wieder ausziehen') : null;
  if (off)
    pickable(off, () => {
      modal.close();
      opts.wear(null);
    });
  const poster = h('a.btn.primary.vn-wide', { href: '#', download: 'schallwerk-poster.png' }, '🖼️ Poster mitnehmen (PNG)');
  poster.addEventListener('click', () => {
    (poster as HTMLAnchorElement).href = opts.poster();
  });
  const el = h(
    'div.modal.vn-merch',
    { role: 'dialog', 'aria-label': 'Merch' },
    h('header', {}, h('h2', {}, '👕 Merch'), close),
    h('div.body', {}, h('p.vn-note', {}, 'Alles aufs Haus. Was du anziehst, sehen alle, auch zurück im Büro.'), h('div.vn-cards', {}, ...cards), off, poster),
    h('footer', {}, h('span.grow', {}, 'SCHALLWERK · Merch-Stand')),
  );
  const modal = openModal(el, { doing: '👕 at the merch stand' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (el.querySelector('.vn-card:not(.on)') as HTMLElement | null)?.focus(), 30);
}

export interface LightDeskState {
  mode: VenueMode;
  lights: VenueLights;
  /** When each effect was last fired (office clock, ms). */
  fired: Partial<Record<VenueFx, number>>;
  now: number;
}

/** The Lichtpult: concert or club for the whole house, the scenes, lasers and mirror ball, the effects. It follows the house live. */
export function openLightDesk(opts: { state(): LightDeskState; watch(fn: () => void): () => void; mode(m: VenueMode): void; scene(s: VenueScene): void; laser(on: boolean): void; ball(on: boolean): void; fx(f: VenueFx): void }) {
  const close = closeButton();
  const modeBtns = (['konzert', 'club'] as const).map((m) => {
    const b = h('button.btn.vn-mode', { type: 'button', 'data-mode': m }, m === 'konzert' ? '🎸 Konzert' : '🪩 Club');
    pickable(b, () => opts.mode(m));
    return b;
  });
  const sceneBtns = SCENES.map((s) => {
    const b = h('button.btn.vn-scene', { type: 'button', 'data-scene': s }, SCENE_NAMES[s]);
    pickable(b, () => opts.scene(s));
    return b;
  });
  const laser = h('button.btn.vn-toggle', { type: 'button' }, '🟩 Laser');
  pickable(laser, () => opts.laser(!opts.state().lights.laser));
  const ball = h('button.btn.vn-toggle', { type: 'button' }, '🪩 Spiegelkugel');
  pickable(ball, () => opts.ball(!opts.state().lights.ball));
  const fxBtns = EFFECTS.map((f) => {
    const b = h('button.btn.vn-fx', { type: 'button', 'data-fx': f }, FX_NAMES[f]);
    pickable(b, () => opts.fx(f));
    return b;
  });
  const refresh = () => {
    const s = opts.state();
    for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === s.mode);
    for (const b of sceneBtns) b.classList.toggle('on', b.dataset.scene === s.lights.scene);
    laser.classList.toggle('on', s.lights.laser);
    ball.classList.toggle('on', s.lights.ball);
    for (const b of fxBtns) {
      const f = b.dataset.fx as VenueFx;
      const left = (s.fired[f] ?? -Infinity) + FX_COOLDOWN_MS[f] - s.now;
      b.classList.toggle('loading', left > 0);
      b.style.setProperty('--load', String(Math.max(0, Math.min(1, left / FX_COOLDOWN_MS[f]))));
    }
  };
  refresh();
  const off = opts.watch(refresh);
  const timer = window.setInterval(refresh, 200);
  const el = h(
    'div.modal.vn-desk',
    { role: 'dialog', 'aria-label': 'Lichtpult' },
    h('header', {}, h('h2', {}, '🎛️ Lichtpult'), close),
    h(
      'div.body',
      {},
      h('h3.vn-h', {}, 'Das Haus heute'),
      h('div.vn-row', {}, ...modeBtns),
      h('h3.vn-h', {}, 'Szene'),
      h('div.vn-grid', {}, ...sceneBtns),
      h('h3.vn-h', {}, 'Effekte'),
      h('div.vn-row', {}, laser, ball),
      h('div.vn-grid', {}, ...fxBtns),
    ),
    h('footer', {}, h('span.grow', {}, 'Für alle im Schallwerk. „Auto“ geht mit der Musik.')),
  );
  const modal = openModal(el, {
    doing: '🎛️ at the light desk',
    onClose: () => {
      off();
      window.clearInterval(timer);
    },
  });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (el.querySelector('.vn-scene.on') as HTMLElement | null)?.focus(), 30);
}

/** The sound desk: an announcement over the PA for everyone inside, and the way to the Lichtpult. */
export function openAnnouncements(opts: { say(n: number): void; lights(): void }) {
  const close = closeButton();
  const rows = ANNOUNCEMENTS.map((text, n) => {
    const li = h('li', { tabindex: 0, role: 'button', title: 'Durchsagen' }, h('span.jb-icon', { style: 'font-size:22px' }, '📣'), h('div.svc-main', {}, h('div.svc-title', {}, text)));
    pickable(li, () => {
      modal.close();
      opts.say(n);
    });
    return li;
  });
  const toLights = h('button.btn.vn-wide', { type: 'button' }, '🎛️ Zum Lichtpult');
  pickable(toLights, () => {
    modal.close();
    opts.lights();
  });
  const el = h('div.modal.jukebox.vn-menu', { role: 'dialog', 'aria-label': 'Mischpult' }, h('header', {}, h('h2', {}, '🎚️ Mischpult · Durchsagen'), close), h('div.body', {}, h('ul.svc-list', {}, ...rows), toLights), h('footer', {}, h('span.grow', {}, 'Ding-dong: alle im Haus hören’s.')));
  const modal = openModal(el, { doing: '🎚️ at the sound desk' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (el.querySelector('li') as HTMLElement | null)?.focus(), 30);
}

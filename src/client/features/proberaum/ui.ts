import { BAND_NAME_MAX, BOOK_MINUTES, PIN_COLORS, PIN_MAX, SETLIST_MAX, bandName, roomName, type ProbeView, type ProbeYou, type ProberaumClientMsg, type RoomView } from '../../../shared/proberaum';
import { REHEARSAL_ROOMS, type RehearsalRoomId } from '../../../shared/venue';
import { h, openModal, type Modal } from '../../ui/dom';
import { clock } from './boards';
import './ui.css';

/*
 * The rehearsal wing's windows (flrnoh fork, see FORK.md "The rehearsal wing"): the booking window
 * (every room: book, extend, let go, who's in the band, who's knocking), the Schwarzes Brett, a
 * room's setlist, the band name generator, the polaroids, and the little machines' menus. Each has
 * its ✕; ✕ and Esc go straight back to the game. They follow the wing as it changes (`refresh`).
 */

export interface ProbeApi {
  view(): ProbeView | null;
  you(): ProbeYou;
  /** Your peer id, and who's in a room right now (from where everyone stands). */
  me(): string;
  inside(room: RehearsalRoomId): { id: string; name: string }[];
  send(msg: ProberaumClientMsg): void;
  /** The band name you'd book with (kept on this page). */
  bandIdea(): string;
  setBandIdea(name: string): void;
  sound(kind: 'dice' | 'pin' | 'marker'): void;
}

/** Picks with a click, Enter or Space, without the office's own Enter opening the chat. */
function pickable<T extends HTMLElement>(el: T, pick: () => void): T {
  el.addEventListener('click', pick);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick();
    }
  });
  return el;
}
const btn = (label: string, cls: string, pick: () => void, title?: string) => pickable(h('button', { type: 'button', class: `btn ${cls}`, title }, label), pick);
/** Keys typed in a window's fields stay there (not the office's: E, Space, the arrows). */
const keepKeys = (el: HTMLElement) => el.addEventListener('keydown', (e) => e.key !== 'Escape' && e.stopPropagation());

export class ProbeUi {
  private modal: Modal | null = null;
  private render: (() => void) | null = null;

  constructor(private readonly api: ProbeApi) {}

  get open() {
    return !!this.modal;
  }

  /** The wing changed: whatever window is open follows. */
  refresh() {
    this.render?.();
  }

  close() {
    this.modal?.close();
  }

  private show(el: HTMLElement, doing: string, render: () => void, focus?: HTMLElement) {
    this.close();
    const modal = openModal(el, {
      doing,
      onClose: () => {
        if (this.modal === modal) {
          this.modal = null;
          this.render = null;
        }
      },
    });
    this.modal = modal;
    this.render = render;
    render();
    setTimeout(() => focus?.focus(), 30);
  }

  // ---- Booking ---------------------------------------------------------------------------------------

  /** Every room, `room` first in view. */
  booking(room?: RehearsalRoomId) {
    const { api } = this;
    const name = h('input', { type: 'text', maxlength: BAND_NAME_MAX, placeholder: 'Bandname', value: api.bandIdea() });
    keepKeys(name);
    name.addEventListener('input', () => api.setBandIdea(name.value));
    const dice = btn('🎲', '', () => {
      name.value = bandName(Math.floor(Math.random() * 1e9));
      api.setBandIdea(name.value);
      api.sound('dice');
    }, 'Bandname würfeln');
    const cards = h('div.pb-cards');
    const el = h(
      'div.modal.pb-window.pb-booking',
      { role: 'dialog', 'aria-label': 'Proberäume buchen' },
      h('header', {}, h('h2', {}, '🎸 Proberäume')),
      h('div.body', {}, h('label', {}, 'Eure Band'), h('div.pb-row', {}, name, dice), cards),
      h('footer', {}, h('span.grow', {}, `Ein Raum pro Person, ${BOOK_MINUTES.join(' / ')} Min. Gebucht heißt: nur eure Band kommt rein – andere klopfen.`)),
    );
    const render = () => {
      const v = api.view();
      cards.replaceChildren(...REHEARSAL_ROOMS.map((r) => this.card(r.id, v?.rooms.find((x) => x.id === r.id), name)));
      if (room) {
        cards.querySelector(`[data-room="${room}"]`)?.classList.add('focus');
        cards.querySelector(`[data-room="${room}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    this.show(el, '🎸 booking a rehearsal room', render, name);
  }

  private card(id: RehearsalRoomId, r: RoomView | undefined, name: HTMLInputElement): HTMLElement {
    const { api } = this;
    const you = api.you();
    const b = r?.booking ?? null;
    const mine = you.booked === id;
    const band = you.band.includes(id);
    const now = api.view()?.now ?? Date.now();
    const chip = h('span.pb-chip', { class: b ? 'busy' : 'free' }, b ? `bis ${clock(b.until)}` : 'frei');
    const out = h('div.pb-card', { 'data-room': id }, h('div.pb-card-head', {}, h('b', {}, roomName(id)), chip, r?.rec ? h('span.pb-chip.rec', {}, '● REC') : r?.playing ? h('span.pb-chip.play', {}, '▶ läuft') : ''));
    if (b) {
      out.append(h('div.pb-band', {}, `„${b.band}“`), h('div.pb-meta', {}, `gebucht von ${b.by} · noch ${Math.max(0, Math.ceil((b.until - now) / 60_000))} Min.`));
      const members = h('div.pb-members');
      b.members.forEach((m, i) => {
        const c = h('span.pb-member', {}, m);
        if (mine && i > 0) c.append(btn('✕', 'pb-x', () => api.send({ t: 'probe.member', room: id, id: api.inside(id).find((p) => p.name === m)?.id ?? m, add: false }), `${m} aus der Band nehmen`));
        members.append(c);
      });
      out.append(members);
      if (r?.knocks.length) {
        const k = h('div.pb-knocks', {}, '🚪 Klopft: ');
        for (const x of r.knocks) k.append(band ? btn(`${x.name} reinlassen`, 'primary', () => api.send({ t: 'probe.letin', room: id, id: x.id })) : h('span', {}, x.name));
        out.append(k);
      }
    }
    const actions = h('div.pb-actions');
    if (mine) {
      actions.append(h('span.pb-label', {}, 'Verlängern ab jetzt:'), ...BOOK_MINUTES.map((m) => btn(`${m} Min.`, '', () => api.send({ t: 'probe.book', room: id, minutes: m, band: name.value }))), btn('Freigeben', 'danger', () => api.send({ t: 'probe.release', room: id })));
      const here = api.inside(id).filter((p) => !b?.members.includes(p.name));
      if (here.length) out.append(h('div.pb-knocks', {}, 'Im Raum: ', ...here.map((p) => btn(`+ ${p.name} in die Band`, '', () => api.send({ t: 'probe.member', room: id, id: p.id, add: true })))));
      out.append(h('div.pb-row', {}, btn('Bandname übernehmen', '', () => api.send({ t: 'probe.band', name: name.value }), 'Den Namen oben für eure Buchung nehmen')));
    } else if (b) {
      actions.append(h('span.pb-meta', {}, band ? '🎸 Du bist in der Band – rein mit dir.' : 'Belegt. An der Tür kannst du klopfen.'));
    } else if (you.booked) {
      actions.append(h('span.pb-meta', {}, `Du hast schon ${roomName(you.booked)} – ein Raum pro Person.`));
    } else {
      actions.append(h('span.pb-label', {}, 'Buchen:'), ...BOOK_MINUTES.map((m) => btn(`${m} Min.`, 'primary', () => api.send({ t: 'probe.book', room: id, minutes: m, band: name.value }))));
    }
    out.append(actions);
    return out;
  }

  // ---- The Schwarzes Brett -------------------------------------------------------------------------

  notes() {
    const { api } = this;
    const text = h('textarea', { rows: 3, maxlength: PIN_MAX, placeholder: 'Drummer sucht Band? Verkaufe Amp? Schreib’s hin.' });
    keepKeys(text);
    let color = 0;
    const swatches = h('div.pb-swatches', {}, ...PIN_COLORS.map((c, i) => pickable(h('span.swatch', { style: `background:${c}`, class: i === 0 ? 'sel' : '', tabindex: 0, title: 'Papier' }), () => {
      color = i;
      swatches.querySelectorAll('.swatch').forEach((s, k) => s.classList.toggle('sel', k === i));
    })));
    const count = h('span.pb-meta', {}, `0 / ${PIN_MAX}`);
    text.addEventListener('input', () => (count.textContent = `${text.value.length} / ${PIN_MAX}`));
    const list = h('ul.pb-pins');
    const pin = btn('📌 Anpinnen', 'primary', () => {
      if (!text.value.trim()) return;
      api.send({ t: 'probe.pin', text: text.value, color });
      api.sound('pin');
      text.value = '';
      count.textContent = `0 / ${PIN_MAX}`;
    });
    const el = h(
      'div.modal.pb-window',
      { role: 'dialog', 'aria-label': 'Schwarzes Brett' },
      h('header', {}, h('h2', {}, '📌 Schwarzes Brett')),
      h('div.body', {}, text, h('div.pb-row', {}, swatches, count, pin), list),
      h('footer', {}, h('span.grow', {}, 'Drei Zettel pro Person; der älteste fliegt runter, wenn du einen vierten anpinnst.')),
    );
    const render = () => {
      const v = api.view();
      const mineIds = new Set(api.you().pins);
      const pins = [...(v?.pins ?? [])].reverse();
      list.replaceChildren(...(pins.length ? pins.map((p) => h('li', { style: `background:${p.color}` }, h('div.pb-pin-text', {}, p.text), h('div.pb-meta', {}, `– ${p.by}`), mineIds.has(p.id) ? btn('Abnehmen', '', () => api.send({ t: 'probe.unpin', id: p.id })) : '')) : [h('li.empty', {}, 'Noch nichts angepinnt.')]));
    };
    this.show(el, '📌 at the Schwarzes Brett', render, text);
  }

  // ---- A room's setlist ------------------------------------------------------------------------------

  setlist(room: RehearsalRoomId, may: boolean) {
    const { api } = this;
    const r = api.view()?.rooms.find((x) => x.id === room);
    const text = h('textarea', { rows: 10, maxlength: SETLIST_MAX, placeholder: '1. Intro\n2. Der schnelle\n3. Die Ballade\n…' });
    text.value = r?.setlist ?? '';
    text.disabled = !may;
    keepKeys(text);
    const el = h(
      'div.modal.pb-window',
      { role: 'dialog', 'aria-label': 'Setlist' },
      h('header', {}, h('h2', {}, `📝 Setlist · ${roomName(room)}`)),
      h('div.body', {}, text, may ? '' : h('p.setting-note', {}, 'Der Raum ist gebucht: die Setlist schreibt die Band.')),
      h('footer', {}, h('span.grow', {}, r?.setlistBy ? `zuletzt von ${r.setlistBy}` : 'Steht danach auf dem Whiteboard, für alle im Raum.'), may ? btn('Wegwischen', '', () => (text.value = '')) : '', may ? btn('Speichern', 'primary', () => {
        api.send({ t: 'probe.setlist', room, text: text.value });
        api.sound('marker');
        this.close();
      }) : ''),
    );
    this.show(el, '📝 writing the setlist', () => {}, may ? text : undefined);
  }

  // ---- The band name generator -----------------------------------------------------------------------

  bandname(current: string, roll: () => string) {
    const { api } = this;
    let name = current;
    const big = h('div.pb-bandname', {}, `„${name}“`);
    const take = btn('Für meine Buchung', '', () => api.send({ t: 'probe.band', name }), 'Eure gebuchte Band heißt dann so');
    const el = h(
      'div.modal.pb-window',
      { role: 'dialog', 'aria-label': 'Bandname-Generator' },
      h('header', {}, h('h2', {}, '🎲 Bandname-Generator')),
      h('div.body', {}, big),
      h('footer', {}, h('span.grow', {}, 'Klingt gut? Merk ihn dir fürs Buchen.'), take, btn('Merken', '', () => {
        api.setBandIdea(name);
        this.close();
      }), btn('🎲 Würfeln', 'primary', () => {
        name = roll();
        big.textContent = `„${name}“`;
        api.sound('dice');
      })),
    );
    this.show(el, '🎲 rolling band names', () => (take.style.display = api.you().booked ? '' : 'none'), el.querySelector('.btn.primary') as HTMLElement);
  }

  // ---- The polaroid wall -----------------------------------------------------------------------------

  polaroids() {
    const { api } = this;
    const list = h('ul.pb-polaroids');
    const el = h('div.modal.pb-window', { role: 'dialog', 'aria-label': 'Polaroid-Wand' }, h('header', {}, h('h2', {}, '📸 Hier haben geprobt')), h('div.body', {}, list), h('footer', {}, h('span.grow', {}, 'Wer einen Raum bucht, landet hier an der Wand.')));
    this.show(el, '📸 at the polaroid wall', () => {
      const ps = [...(api.view()?.polaroids ?? [])].reverse();
      list.replaceChildren(...(ps.length ? ps.map((p) => h('li', {}, h('b', {}, p.band), h('span.pb-meta', {}, `${roomName(p.room)} · ${new Date(p.at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} · ${p.names.join(', ')}`))) : [h('li.empty', {}, 'Noch keiner. Buch einen Raum!')]));
    });
  }

  // ---- A machine's menu ------------------------------------------------------------------------------

  /** A small menu (the drinks machine, the string machine, the backline counter): pick one and it's done. */
  menu(title: string, note: string, items: { emoji: string; name: string; meta: string; pick(): void }[]) {
    const ul = h('ul.svc-list');
    for (const it of items)
      ul.append(
        pickable(h('li', { tabindex: 0, role: 'button' }, h('span.jb-icon', { style: 'font-size:24px' }, it.emoji), h('div.svc-main', {}, h('div.svc-title', {}, it.name), h('div.svc-meta', {}, it.meta))), () => {
          this.close();
          it.pick();
        }),
      );
    const el = h('div.modal.pb-window', { role: 'dialog', 'aria-label': title }, h('header', {}, h('h2', {}, title)), h('div.body', {}, ul), h('footer', {}, h('span.grow', {}, note)));
    this.show(el, title, () => {}, ul.querySelector('li') as HTMLElement);
  }
}

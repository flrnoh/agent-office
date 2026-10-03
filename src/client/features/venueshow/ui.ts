import { DJ_SET_SITES, parseDjSetUrl } from '../../../shared/djset';
import { GIG_DEFAULT_MS, GIG_KINDS, GIG_TEXT_MAX, GIG_TITLE_MAX, HOUSE_STYLES, POSTER_COLORS, POSTER_STYLES, type Gig, type GigInput, type HouseStyle, type VenueDjState, type VenueShowClientMsg } from '../../../shared/venueshow';
import type { DjSetPlayer } from '../../djset';
import { partyVolumeControls, skipControls } from '../../ui/djcontrols';
import { h, openModal, toast } from '../../ui/dom';
import { drawPoster, gigDate, gigPoster } from './posters';
import { drawTicket, myPhotos, tickets } from './souvenirs';
import './ui.css';

// The SCHALLWERK show's windows and panels (flrnoh fork, see FORK.md "The show"): the programme
// (what's coming, the team putting gigs in, your ticket stubs and photos), the DJ desk, the banner
// when a gig starts, the crowd's keys along the bottom and a photo popping up. Windows have their ✕
// top right; ✕ or Esc goes straight back to looking around.

const two = (n: number) => String(n).padStart(2, '0');
const dateValue = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const timeValue = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** A button that wants a second click before it does something you can't take back. */
function sure(b: HTMLButtonElement, then: () => void) {
  if (b.dataset.sure) return then();
  b.dataset.sure = '1';
  b.textContent = '🗑️ Absagen?';
  setTimeout(() => {
    delete b.dataset.sure;
    b.textContent = '🗑️';
  }, 3000);
}
const download = (href: string, name: string) => h('a.btn', { href, download: name, style: 'text-decoration:none' }, '💾 Speichern');

export interface ProgrammeOptions {
  gigs(): Gig[];
  live(): Gig | null;
  /** The team may put gigs in; guests look. */
  team: boolean;
  send(m: VenueShowClientMsg): void;
  watch(fn: () => void): () => void;
  /** Open at your souvenirs. */
  souvenirs?: boolean;
}

/** The programme: what's on, and for the team, putting a gig in, changing it, taking it out; your souvenirs. */
export function openProgramme(o: ProgrammeOptions) {
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)' }, '✕');
  let tab: 'programm' | 'andenken' = o.souvenirs ? 'andenken' : 'programm';
  let editing: Gig | null = null;
  let formOpen = false;
  const tabs = h('div.vs-tabs');
  const body = h('div.body');
  const el = h('div.modal.vs-prog', { role: 'dialog', 'aria-label': 'Schallwerk-Programm' }, h('header', {}, h('h2', {}, '🎸 Schallwerk · Programm'), close), tabs, body);

  const render = () => {
    tabs.replaceChildren(
      h('button.btn', { type: 'button', class: tab === 'programm' ? 'primary' : '', onclick: () => ((tab = 'programm'), render()) }, '📅 Programm'),
      h('button.btn', { type: 'button', class: tab === 'andenken' ? 'primary' : '', onclick: () => ((tab = 'andenken'), render()) }, `🎟️ Andenken (${tickets().length + myPhotos().length})`),
    );
    if (tab === 'andenken') return body.replaceChildren(...souvenirs());
    const gigs = o.gigs();
    const live = o.live();
    body.replaceChildren(
      ...(live ? [h('div.vs-live', {}, h('span.vs-dot'), `Jetzt live: ${live.title}`)] : []),
      ...(gigs.length ? gigs.map(row) : [h('p.empty', {}, 'Noch nichts im Kalender.')]),
      ...(o.team ? [formOpen ? form() : h('button.btn.primary.vs-new', { type: 'button', onclick: () => ((editing = null), (formOpen = true), render()) }, '➕ Neuer Termin')] : [h('p.setting-note', {}, 'Den Kalender pflegt das Team.')]),
    );
  };

  const row = (g: Gig) => {
    const when = gigDate(g.start);
    const thumb = gigPoster(g, 96);
    thumb.className = 'vs-thumb';
    return h(
      'div.vs-gig',
      { class: o.live()?.id === g.id ? 'live' : '' },
      thumb,
      h(
        'div.vs-gig-main',
        {},
        h('div.vs-gig-title', {}, g.title),
        h('div.vs-gig-meta', {}, `${GIG_KINDS[g.kind]} · ${when.long} bis ${timeValue(g.end)}`),
        ...(g.text ? [h('div.vs-gig-text', {}, g.text)] : []),
        h('div.vs-gig-by', {}, `eingetragen von ${g.by || 'jemandem'}`),
      ),
      ...(o.team
        ? [
            h('div.vs-gig-actions', {}, h('button.btn', { type: 'button', title: 'Ändern', onclick: () => ((editing = g), (formOpen = true), render()) }, '✏️'), h('button.btn.danger', { type: 'button', title: 'Absagen', onclick: (e: Event) => sure(e.currentTarget as HTMLButtonElement, () => o.send({ t: 'gig.delete', id: g.id })) }, '🗑️')),
          ]
        : []),
    );
  };

  /** The form for a new gig, or the one being changed. */
  const form = () => {
    const g = editing;
    const start0 = g?.start ?? (() => {
      const d = new Date(Date.now() + 86400_000);
      d.setHours(20, 0, 0, 0);
      return d.getTime();
    })();
    const title = h('input', { type: 'text', maxlength: GIG_TITLE_MAX, placeholder: 'Swallow’s Rose live · Techno-Nacht …', value: g?.title ?? '' }) as HTMLInputElement;
    const kind = h('select', {}, ...(['konzert', 'club'] as const).map((k) => h('option', { value: k, selected: (g?.kind ?? 'konzert') === k }, GIG_KINDS[k]))) as HTMLSelectElement;
    const date = h('input', { type: 'date', value: dateValue(start0) }) as HTMLInputElement;
    const from = h('input', { type: 'time', value: timeValue(start0) }) as HTMLInputElement;
    const to = h('input', { type: 'time', value: timeValue(g?.end ?? start0 + GIG_DEFAULT_MS) }) as HTMLInputElement;
    const text = h('input', { type: 'text', maxlength: GIG_TEXT_MAX, placeholder: 'Support: … · Einlass 19 Uhr (optional)', value: g?.text ?? '' }) as HTMLInputElement;
    let style = g?.style ?? 0;
    let color = g?.color ?? 0;
    const styles = h('div.vs-styles');
    const swatches = h('div.vs-swatches');
    const preview = document.createElement('canvas');
    preview.width = 200;
    preview.height = 283;
    preview.className = 'vs-preview';
    const input = (): GigInput | null => {
      const [y, m, d] = date.value.split('-').map(Number);
      const [fh, fm] = from.value.split(':').map(Number);
      const [th, tm] = to.value.split(':').map(Number);
      if (![y, m, d, fh, fm, th, tm].every(Number.isFinite)) return null;
      const start = new Date(y, m - 1, d, fh, fm).getTime();
      let end = new Date(y, m - 1, d, th, tm).getTime();
      // Past midnight: the next day.
      if (end <= start) end += 86400_000;
      return { ...(g ? { id: g.id } : {}), title: title.value, kind: kind.value as Gig['kind'], start, end, style, color, ...(text.value.trim() ? { text: text.value } : {}) };
    };
    const paint = () => {
      const i = input();
      styles.replaceChildren(...POSTER_STYLES.map((s, k) => h('button.btn', { type: 'button', class: k === style ? 'primary' : '', onclick: () => ((style = k), paint()) }, s)));
      swatches.replaceChildren(...POSTER_COLORS.map((c, k) => h('button.vs-swatch', { type: 'button', class: k === color ? 'on' : '', style: `background:${c}`, title: c, 'aria-label': `Farbe ${k + 1}`, onclick: () => ((color = k), paint()) })));
      drawPoster(preview, { id: g?.id ?? 'neu', title: title.value || 'Dein Abend', kind: (i?.kind ?? 'konzert') as Gig['kind'], start: i?.start ?? start0, text: text.value, style, color });
    };
    for (const f of [title, kind, date, from, to, text]) f.addEventListener('input', paint);
    paint();
    const save = h('button.btn.primary', { type: 'button' }, g ? '💾 Speichern' : '➕ In den Kalender');
    save.addEventListener('click', () => {
      const i = input();
      if (!i || !title.value.trim()) return toast('Titel, Datum und Uhrzeit, bitte', 'warn');
      o.send({ t: 'gig.save', gig: i });
      formOpen = false;
      editing = null;
      render();
    });
    return h(
      'div.vs-form',
      {},
      h('h3', {}, g ? `„${g.title}“ ändern` : 'Neuer Termin'),
      h(
        'div.vs-form-grid',
        {},
        h('div.vs-fields', {}, h('label', {}, 'Titel', title), h('label', {}, 'Was', kind), h('div.vs-when', {}, h('label', {}, 'Datum', date), h('label', {}, 'Beginn', from), h('label', {}, 'Ende', to)), h('label', {}, 'Zeile fürs Plakat', text), h('label', {}, 'Plakat'), styles, swatches),
        preview,
      ),
      h('div.vs-form-actions', {}, h('button.btn', { type: 'button', onclick: () => ((formOpen = false), (editing = null), render()) }, 'Abbrechen'), save),
      h('p.setting-note', {}, 'Wenn er anfängt, sagt das Büro auf allen Etagen Bescheid, und das Haus stellt auf Konzert oder Club. Echte Uhrzeit, nicht die Büro-Uhr.'),
    );
  };

  const souvenirs = () => {
    const t = tickets();
    const p = myPhotos();
    return [
      h('h3.vs-h', {}, '🎟️ Deine Tickets'),
      ...(t.length
        ? t.map((x) => {
            const c = drawTicket(x);
            return h('div.vs-souvenir', {}, Object.assign(c, { className: 'vs-ticket' }), download(c.toDataURL('image/png'), `schallwerk-ticket-${x.id}.png`));
          })
        : [h('p.empty', {}, 'Bei einem Gig im Schallwerk dabei sein, und das Ticket ist deins.')]),
      h('h3.vs-h', {}, '📸 Deine Konzertfotos'),
      ...(p.length ? p.map((x, i) => h('div.vs-souvenir', {}, h('img.vs-photo', { src: x.url, alt: x.caption }), download(x.url, `schallwerk-foto-${i + 1}.jpg`))) : [h('p.empty', {}, 'K drücken im Schallwerk: ein Foto mit Blitz, für dich zum Mitnehmen.')]),
    ];
  };

  const unwatch = o.watch(() => !formOpen && render());
  const m = openModal(el, { doing: '🎸 im Schallwerk-Programm', onClose: unwatch });
  close.addEventListener('click', () => m.close());
  render();
}

// ---- The DJ desk ------------------------------------------------------------------------------------

export interface DeskOptions {
  state(): VenueDjState;
  you: string;
  title(): string;
  phase(): string;
  send(m: VenueShowClientMsg): void;
  watch(fn: () => void): () => void;
  tap(): number | null;
  /** The booth's player here, for where the set is and how long. */
  player: DjSetPlayer;
  /** Whether you may set the house's volume (the team); guests see it. */
  host: boolean;
}

/** The DJ desk: who's at the decks, a set of your own or the house mix, the buttons; take the decks or give them back. */
export function openDjDesk(o: DeskOptions) {
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Schließen', title: 'Schließen (Esc)' }, '✕');
  // What's on and the DJ's buttons, built anew on every change (above and below skipping); the sliders are kept, so one in your hand stays there.
  const body = h('div.vs-part');
  const lower = h('div.vs-part');
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… · soundcloud.com/… · mixcloud.com/…', 'aria-label': 'Link zu einem DJ-Set', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  let tapping = '';
  const send = (m: VenueShowClientMsg) => o.send(m);
  // Skipping through the set (the DJ's), and the house's volume (the team's), kept across renders so a drag isn't cut off.
  const skip = skipControls({ player: o.player, lang: 'de', seek: (at) => send({ t: 'venuedj.seek', at }) });
  const volume = partyVolumeControls({ lang: 'de', host: o.host, setVolume: (v) => send({ t: 'venuedj.volume', volume: v }) });
  const volumeHead = volume.head('🔊 Lautstärke im ganzen Haus');
  const volumeNote = h('p.setting-note');
  const skipBox = h('div.vs-part', {}, h('label', {}, 'Im Set spulen'), skip.el);
  const volumeBox = h('div.vs-part', {}, volumeHead, volume.row, volumeNote);
  const el = h('div.modal.vs-desk', { role: 'dialog', 'aria-label': 'DJ-Pult' }, h('header', {}, h('h2', {}, '🎧 DJ-Pult · Schallwerk'), close), h('div.body', {}, body, skipBox, lower, volumeBox), h('footer', {}, h('span.grow', {}, 'H am Pult: Airhorn · T: Tempo tippen')));
  const play = () => {
    const r = parseDjSetUrl(url.value);
    if ('error' in r) {
      toast(r.error, 'warn');
      return url.focus();
    }
    send({ t: 'venuedj.play', url: url.value.trim() });
    url.value = '';
  };
  url.addEventListener('keydown', (e) => e.key === 'Enter' && play());
  const tapOnce = () => {
    const bpm = o.tap();
    tapping = bpm ? `🥁 ${Math.round(bpm)} BPM… (aufhören zum Senden)` : 'weiter im Takt tippen…';
    render();
  };
  const render = () => {
    const s = o.state();
    const mine = s.dj?.id === o.you;
    const now = s.set ? `🎶 ${o.title()} · von ${DJ_SET_SITES[s.set.kind]}${s.by ? ` · aufgelegt von ${s.by}` : ''}${o.phase() ? ` · ${o.phase()}` : ''}` : `🏠 Hausmix: ${HOUSE_STYLES[s.house.style].name}, ${HOUSE_STYLES[s.house.style].bpm} BPM (generiert)`;
    const beat = s.tap ? `🥁 ${Math.round(s.tap.bpm)} BPM, getippt` : s.beats?.status === 'ready' ? `🥁 ${Math.round(s.beats.bpm ?? 0)} BPM gehört` : s.beats?.status === 'pending' ? '🥁 hört gerade nach dem Takt…' : s.set ? '🥁 Takt unbekannt: tipp ihn ein' : '';
    body.replaceChildren(
      h('div.vs-now', {}, h('div.vs-now-who', {}, s.dj ? (mine ? '🎧 Du stehst am Pult' : `🎧 Am Pult: ${s.dj.name}`) : '🎧 Das Pult ist frei'), h('div.vs-now-what', {}, now)),
      ...(mine
        ? [
            h('label', {}, 'Ein Set auflegen'),
            h('div.vs-row', {}, url, h('button.btn.primary', { type: 'button', onclick: play }, '▶️ Auflegen')),
            h('p.setting-note', {}, 'Ein Link von YouTube, SoundCloud oder Mixcloud. Er läuft für das ganze Haus (in den Proberäumen nur gedämpft), bei allen vom selben Moment an; Licht und Crowd gehen im Takt mit, sobald das Büro ihn gehört hat.'),
            ...(s.set ? [h('div.vs-row', {}, h('button.btn', { type: 'button', onclick: () => send({ t: 'venuedj.stop' }) }, '🏠 Zurück zum Hausmix'), h('span.grow', {}, tapping || beat), h('button.btn', { type: 'button', onclick: tapOnce }, '🥁 Tippen'), ...(s.tap ? [h('button.btn', { type: 'button', onclick: () => send({ t: 'venuedj.tap', bpm: 0, at: Date.now() }) }, '↺ Gehörter Takt')] : []))] : []),
          ]
        : s.dj
          ? [h('p.setting-note', {}, 'Wenn das Pult frei wird, kannst du übernehmen.')]
          : [h('button.btn.primary', { type: 'button', onclick: () => send({ t: 'venuedj.take' }) }, '🎧 Pult übernehmen'), h('p.setting-note', {}, 'Ein DJ zur Zeit. Im Club-Modus läuft sonst der Hausmix von allein.')]),
    );
    lower.replaceChildren(
      ...(mine
        ? [
            h('label', {}, 'Hausmix'),
            h('div.vs-row', {}, ...(Object.keys(HOUSE_STYLES) as HouseStyle[]).map((k) => h('button.btn', { type: 'button', class: s.house.style === k ? 'primary' : '', onclick: () => send({ t: 'venuedj.house', style: k }) }, `${HOUSE_STYLES[k].name} · ${HOUSE_STYLES[k].bpm}`))),
            h('label', {}, 'Knöpfe'),
            h(
              'div.vs-row',
              {},
              h('button.btn', { type: 'button', onclick: () => send({ t: 'venuedj.fx', fx: 'horn' }) }, '📯 Airhorn'),
              h('button.btn', { type: 'button', disabled: !!s.set, title: s.set ? 'Nur im Hausmix' : 'Vier Takte Build-up, dann der Drop', onclick: () => send({ t: 'venuedj.fx', fx: 'drop' }) }, '🚀 Drop!'),
              h('button.btn.danger', { type: 'button', title: 'Die Crowd teilt sich … und rennt aufeinander zu', onclick: () => send({ t: 'venuedj.fx', fx: 'wod' }) }, '💀 Wall of Death'),
            ),
            h('div.vs-row.vs-end', {}, h('button.btn', { type: 'button', onclick: () => (send({ t: 'venuedj.leave' }), m.close()) }, '👋 Pult abgeben')),
          ]
        : []),
    );
    lower.classList.toggle('hidden', !mine);
    skipBox.classList.toggle('hidden', !mine || !s.set);
    volume.paint(s.volume);
    skip.render();
    volumeNote.textContent = [s.volumeBy && `Zuletzt gestellt von ${s.volumeBy}.`, o.host ? 'Hausmix und jedes Set spielen für alle im Schallwerk so laut; deine eigene Lautstärke kommt obendrauf. Über 100 % wird es für alle lauter, 200 % ist Disco.' : 'Die Lautstärke stellt das Team.'].filter(Boolean).join(' ');
  };
  el.addEventListener('keydown', (e) => {
    if (e.target === url || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyH') {
      e.preventDefault();
      send({ t: 'venuedj.fx', fx: 'horn' });
    } else if (e.code === 'KeyT' && !e.repeat && o.state().set) {
      e.preventDefault();
      tapOnce();
    }
  });
  const unwatch = o.watch(render);
  const m = openModal(el, { doing: '🎧 am DJ-Pult im Schallwerk', onClose: () => (unwatch(), skip.stop()) });
  close.addEventListener('click', () => m.close());
  render();
  return m;
}

// ---- The banner when a gig starts, the keys, a photo ---------------------------------------------------

/** "Jetzt im Schallwerk: …" with a button to go there (Enter too), for a while; ✕ takes it away. */
export class GigBanner {
  readonly el = h('div.vs-banner.hidden', { role: 'status', 'aria-live': 'polite' });
  private timer = 0;
  private go: (() => void) | null = null;

  show(gig: Gig, inside: boolean, go: () => void) {
    clearTimeout(this.timer);
    const poster = gigPoster(gig, 70);
    poster.className = 'vs-banner-poster';
    this.go = inside ? null : go;
    const x = h('button.vs-banner-x', { type: 'button', 'aria-label': 'Ausblenden', onclick: () => this.hide() }, '✕');
    this.el.replaceChildren(
      poster,
      h('div.vs-banner-main', {}, h('div.vs-banner-kicker', {}, inside ? '🎸 Es geht los!' : '🎸 Jetzt im Schallwerk'), h('div.vs-banner-title', {}, gig.title), h('div.vs-banner-meta', {}, `${GIG_KINDS[gig.kind]} · bis ${timeValue(gig.end)} Uhr${gig.text ? ` · ${gig.text}` : ''}`)),
      ...(inside ? [] : [h('button.btn.primary', { type: 'button', onclick: () => this.goNow() }, 'Hingehen ⏎')]),
      x,
    );
    this.el.classList.remove('hidden');
    this.timer = window.setTimeout(() => this.hide(), inside ? 9000 : 30_000);
  }

  /** Enter while it's up: off to the venue. */
  goNow(): boolean {
    if (!this.go || this.el.classList.contains('hidden')) return false;
    const go = this.go;
    this.hide();
    go();
    return true;
  }

  hide() {
    clearTimeout(this.timer);
    this.go = null;
    this.el.classList.add('hidden');
  }
}

/** The crowd's keys along the bottom, while you're on the floor. */
export function crowdKeys(): { el: HTMLElement; show(keys: [string, string][] | null): void } {
  const el = h('div.vs-keys.hidden');
  let last = '';
  return {
    el,
    show(keys) {
      const k = JSON.stringify(keys);
      if (k === last) return;
      last = k;
      el.classList.toggle('hidden', !keys);
      if (keys) el.replaceChildren(...keys.map(([key, what]) => h('span.vs-key', {}, h('kbd', {}, key), what)));
    },
  };
}

/** A photo you just took, popping up for a moment. */
export function photoPop(url: string, caption: string) {
  const el = h('div.vs-pop', {}, h('img', { src: url, alt: caption }), h('div', {}, '📸 In deinen Andenken (E am Plakat)'));
  document.getElementById('hud')?.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3800);
}

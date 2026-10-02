import { SONGS } from '../../../shared/karaoke-songs';
import { songSeconds } from '../../../shared/karaoke-music';
import { KARAOKE_HINT, parseKaraokeLink, pickTitle, type KaraokeBoard, type KaraokeClientMsg, type KaraokeState } from '../../../shared/karaoke';
import { h, openModal, toast } from '../../ui/dom';
import './ui.css';

// The karaoke bar's windows and panels (flrnoh fork, see FORK.md "Karaoke"): the song book (the
// bar's own songs, your own YouTube link, the list, the week's kings, and ending your song or giving
// your mic back), and on the screen's edge the call to the stage when it's your turn and the 🔥
// rating after a song. The window has its ✕ top right; ✕ or Esc goes straight back to looking around.

const STYLE: Record<string, string> = { ballad: '🌙 Ballade', blues: '🎷 Blues', schlager: '🍻 Schlager', anthem: '🎳 Hymne', tango: '💃 Tango' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export interface BookOptions {
  state(): KaraokeState;
  you(): string;
  name(id: string): string;
  send(m: KaraokeClientMsg): void;
  /** Calls `fn` whenever the bar changes; returns how to stop. */
  watch(fn: () => void): () => void;
  /** Open at the week's kings. */
  charts?: boolean;
}

/** The song book: pick a song (or paste a link), see the list, and the week's kings. */
export function openSongBook(o: BookOptions) {
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, '✕');
  const now = h('div.kk-now');
  const songs = h('div.kk-songs');
  const list = h('ol.kk-queue');
  const charts = h('div.kk-charts');
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… (ein Karaoke-Video)', 'aria-label': 'Link zu einem YouTube-Karaoke-Video', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const add = h('button.btn.primary', { type: 'button' }, '🎤 Eintragen');
  const el = h(
    'div.modal.kk-book',
    { role: 'dialog', 'aria-label': 'Karaoke' },
    h('header', {}, h('h2', {}, o.charts ? '👑 Karaoke-Charts' : '🎤 Karaoke · Songbuch'), close),
    h(
      'div.body',
      {},
      now,
      h('h3.kk-h', {}, 'Die Songs der Bar'),
      songs,
      h('h3.kk-h', {}, 'Oder ein Karaoke-Video von YouTube'),
      h('div.kk-link', {}, url, add),
      h('p.setting-note', {}, `${KARAOKE_HINT} (such auf YouTube nach dem Song mit „Karaoke“ dahinter): es läuft für alle auf dem großen Bildschirm, der Text kommt im Video.`),
      h('h3.kk-h', {}, 'Die Liste'),
      list,
      h('h3.kk-h', {}, '👑 König(in) der Woche'),
      charts,
    ),
    h('footer', {}, h('span.grow', {}, 'Auf der Bühne mit Mikro bist du für alle laut zu hören (Sprachchat: V). B klatscht, Shift+B jubelt.')),
  );
  const send = (m: KaraokeClientMsg) => o.send(m);
  const render = () => {
    const s = o.state();
    const me = o.you();
    const t = s.turn;
    const mine = s.queue.filter((e) => e.who === me).length;
    const myMic = s.mics.indexOf(me);
    // What's on, and what you can do about your part in it.
    const status = !t
      ? s.queue.length
        ? 'Gleich geht’s weiter.'
        : 'Die Bühne ist frei: trag dich ein!'
      : t.phase === 'up'
        ? `${t.who === me ? 'Du bist' : `${t.name} ist`} dran: ${pickTitle(t.pick)}`
        : t.phase === 'singing'
          ? `🎤 ${t.name} singt ${pickTitle(t.pick)}`
          : `🔥 Die Bewertung für ${t.name} läuft`;
    now.replaceChildren(
      h('div.kk-status', {}, status),
      h(
        'div.kk-actions',
        {},
        ...(t && t.who === me && t.phase === 'up' ? [h('button.btn', { type: 'button', onclick: () => send({ t: 'karaoke.stop' }) }, '⏭️ Diesmal aussetzen')] : []),
        ...(t && t.who === me && t.phase === 'singing' ? [h('button.btn.danger', { type: 'button', onclick: () => send({ t: 'karaoke.stop' }) }, '⏹️ Song beenden')] : []),
        ...(myMic >= 0 ? [h('button.btn', { type: 'button', onclick: () => send({ t: 'karaoke.mic', mic: myMic, take: false }) }, `🎤 Mikro ${myMic + 1} zurückgeben`)] : []),
      ),
    );
    songs.replaceChildren(
      ...SONGS.map((song) =>
        h(
          'div.kk-song',
          {},
          h('div.kk-song-main', {}, h('div.kk-song-title', {}, song.title), h('div.kk-song-meta', {}, `${song.artist} · ${STYLE[song.style] ?? song.style} · ${mmss(songSeconds(song))}`), h('div.kk-song-blurb', {}, song.blurb)),
          h('button.btn', { type: 'button', disabled: mine >= 2, title: mine >= 2 ? 'Höchstens zwei Songs pro Person in der Liste' : 'In die Liste', onclick: () => send({ t: 'karaoke.queue', song: song.id }) }, 'Eintragen'),
        ),
      ),
    );
    add.disabled = mine >= 2;
    list.replaceChildren(
      ...(s.queue.length
        ? s.queue.map((e) =>
            h(
              'li',
              { class: e.who === me ? 'mine' : '' },
              h('span.kk-who', {}, e.name),
              h('span.kk-what', {}, `${e.pick.kind === 'video' ? '▶️ ' : '♪ '}${pickTitle(e.pick)}`),
              ...(e.who === me ? [h('button.btn.kk-x', { type: 'button', title: 'Wieder austragen', 'aria-label': 'Wieder austragen', onclick: () => send({ t: 'karaoke.unqueue', id: e.id }) }, '✕')] : []),
            ),
          )
        : [h('li.empty', {}, 'Noch niemand auf der Liste.')]),
    );
    charts.replaceChildren(chartsTable(s.board));
  };
  const submit = () => {
    const r = parseKaraokeLink(url.value);
    if ('error' in r) {
      toast(r.error, 'warn');
      return url.focus();
    }
    send({ t: 'karaoke.queue', url: url.value.trim() });
    url.value = '';
  };
  add.addEventListener('click', submit);
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  const unwatch = o.watch(render);
  const m = openModal(el, { doing: '🎤 im Karaoke-Songbuch', onClose: unwatch });
  close.addEventListener('click', () => m.close());
  render();
  if (o.charts) setTimeout(() => charts.scrollIntoView({ block: 'start' }), 30);
}

function chartsTable(b: KaraokeBoard): HTMLElement {
  if (!b.top.length) return h('p.empty', {}, 'Diese Woche hat noch niemand gesungen.');
  return h(
    'div',
    {},
    h(
      'table.kk-table',
      {},
      h('tr', {}, h('th', {}, ''), h('th', {}, 'Name'), h('th', {}, 'Songs'), h('th', {}, 'Ø 🔥'), h('th', {}, 'Punkte')),
      ...b.top.map((l, i) => h('tr', { class: i === 0 ? 'king' : '' }, h('td', {}, i === 0 ? '👑' : `${i + 1}.`), h('td', {}, l.name), h('td', {}, String(l.songs)), h('td', {}, l.avg.toFixed(1)), h('td', {}, l.points.toFixed(1)))),
    ),
    ...(b.last ? [h('p.setting-note', {}, `Letzte Woche: ${b.last.name} mit ${b.last.points.toFixed(1)} 🔥`)] : []),
  );
}

/** The panel at the screen's edge: called to the stage, holding a mic, the rating. Null hides it. */
export class KaraokePanel {
  readonly el = h('div.kk-panel.hidden', { 'aria-live': 'polite' });
  private key = '';

  constructor(private rate: (stars: number) => void) {}

  show(p: { kind: 'up'; title: string; secs: number } | { kind: 'mic'; mic: number; onStage: boolean; singing: boolean } | { kind: 'rate'; who: string; voted: number } | null) {
    const key = JSON.stringify(p);
    if (key === this.key) return;
    this.key = key;
    this.el.classList.toggle('hidden', !p);
    if (!p) return this.el.replaceChildren();
    if (p.kind === 'up') {
      this.el.className = 'kk-panel up';
      this.el.replaceChildren(h('div.kk-big', {}, '🎤 Du bist dran!'), h('div', {}, `${p.title}: ab auf die Bühne und ein Mikro nehmen (E am Ständer).`), h('div.kk-small', {}, `noch ${p.secs} s`));
    } else if (p.kind === 'mic') {
      this.el.className = 'kk-panel mic';
      this.el.replaceChildren(h('div', {}, `🎤 Mikro ${p.mic + 1} in der Hand`), h('div.kk-small', {}, p.onStage ? (p.singing ? 'Auf der Bühne: alle hören dich (Sprachchat: V)' : 'Auf der Bühne: du bist auf der Anlage') : 'Stell dich auf die Bühne, dann hören dich alle'));
    } else {
      this.el.className = 'kk-panel rate';
      this.el.replaceChildren(
        h('div', {}, `Wie war ${p.who}?`),
        h(
          'div.kk-flames',
          {},
          ...[1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: n <= p.voted ? 'on' : '', title: `${n} von 5`, onclick: () => this.rate(n) }, h('span', {}, '🔥'), h('span.kk-n', {}, String(n)))),
        ),
        h('div.kk-small', {}, p.voted ? `Du hast ${p.voted} gegeben` : 'Drück 1 bis 5'),
      );
    }
  }
}

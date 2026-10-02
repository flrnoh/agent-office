import { FILMS, kinoAt, kinoComing, runtime } from '../../../shared/kino';
import { KINO_SNACKS, type KinoSnack } from '../../../shared/kino-snacks';
import { TV_HINT, TV_SITES, parseTvUrl } from '../../../shared/tv';
import type { Net } from '../../net';
import type { TvStreams } from '../../tv';
import { h, openModal, toast } from '../../ui/dom';

// The cinema's windows (flrnoh fork, see FORK.md "The cinema"): the counter (snacks, and what's on
// today), Saal 1's programme with every film's licence and source, and Saal 2's lectern (put on a
// YouTube or Twitch link for everyone in there). Each has its ✕ top right; ✕ or Esc goes back to
// looking around.

const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Today's programme in Saal 1, as a list: now (or next) and the five after it, with their licences. */
function programme(now: number): HTMLElement {
  const k = kinoAt(now);
  const rows = [{ film: k.film, at: k.startsAt, now: true }, ...kinoComing(now, 5).map((c) => ({ ...c, now: false }))];
  return h(
    'ul.svc-list',
    {},
    ...rows.map((r) => {
      const f = FILMS[r.film];
      const when = r.now ? (k.phase === 'film' ? `läuft seit ${clock(r.at)}` : `gleich, um ${clock(r.at)}`) : clock(r.at);
      return h(
        'li',
        {},
        h('span.jb-icon', { style: 'font-size:22px' }, f.silent ? '🎞️' : '🎬'),
        h(
          'div.svc-main',
          {},
          h('div.svc-title', { style: 'white-space:normal' }, `${f.title} (${f.year})`),
          h('div.svc-meta', { style: 'white-space:normal' }, `${when} · ${runtime(f.seconds)} · ${f.credit} · `, h('a', { href: f.source, target: '_blank', rel: 'noopener noreferrer' }, f.licenceUrl ? 'licence & source' : 'source')),
        ),
      );
    }),
  );
}

export interface CounterOptions {
  now(): number;
  order(item: KinoSnack): void;
}

/** E at the counter: popcorn, nachos, a cola, and what's on. */
export function openCounter(o: CounterOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const list = h(
    'ul.svc-list',
    {},
    ...KINO_SNACKS.map((d) => {
      const li = h('li', { tabindex: 0, role: 'button', title: `Order ${d.name}` }, h('span.jb-icon', { style: 'font-size:26px' }, d.emoji), h('div.svc-main', {}, h('div.svc-title', {}, d.name), h('div.svc-meta', {}, d.blurb)));
      const pick = () => {
        modal.close();
        o.order(d);
      };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          pick();
        }
      });
      return li;
    }),
  );
  const body = h('div.body', {}, h('h3', { style: 'margin:0 0 8px;font-size:15px' }, '🍿 Snacks'), list, h('h3', { style: 'margin:16px 0 8px;font-size:15px' }, '🎬 Heute in Saal 1'), programme(o.now()));
  const el = h('div.modal.jukebox', { role: 'dialog', 'aria-label': 'Kasse & Snacks' }, h('header', {}, h('h2', {}, '🎟️ Kasse & Snacks'), close), body, h('footer', {}, h('span.grow', {}, 'Eintritt frei, alles aufs Haus. Take it in with you, or along to the office.')));
  const modal = openModal(el, { doing: '🍿 at the cinema counter' });
  close.addEventListener('click', () => modal.close());
  setTimeout(() => (list.querySelector('li') as HTMLElement | null)?.focus(), 30);
}

/** E at Saal 1's screen: the programme, with every film's licence and where it comes from. */
export function openProgramme(now: number) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Programme' },
    h('header', {}, h('h2', {}, '🎬 Saal 1 · Programm'), close),
    h('div.body', {}, programme(now), h('p.setting-note', {}, 'Open movies of the Blender Foundation (Creative Commons) and silent classics in the public domain, straight from Wikimedia Commons. They run back to back on the office clock: everyone in the hall sees the same moment, and coming in late you’re right where it is now.')),
  );
  const modal = openModal(el, { doing: '🎬 reading the programme' });
  close.addEventListener('click', () => modal.close());
}

export interface Saal2Options {
  net: Net;
  screen: TvStreams;
  watchBig(): void;
  openVolume(): void;
  watch(fn: () => void): () => void;
}

const STATUS: Record<string, string> = {
  loading: 'starting…',
  playing: '🔊 playing',
  blocked: '🖱️ click anywhere to hear it',
  held: '⏸️ paused by you',
  failed: "can't play here",
  ended: 'it has ended',
  away: '⏸️ waiting till you’re in Saal 2',
  off: '',
};

/** E at Saal 2's lectern: put on a YouTube or Twitch link for everyone in there, stop it, watch it big. */
export function openSaal2(o: Saal2Options) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const now = h('div.jb-now');
  const actions = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… · twitch.tv/…', 'aria-label': 'Link to a video or stream', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const play = h('button.btn.primary', { type: 'button' }, '▶️ Put it on');
  const volume = h('button.btn', { type: 'button' }, '🔈 Your volume');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Saal 2' },
    h('header', {}, h('h2', {}, '🎬 Saal 2'), close),
    h('div.body', {}, now, actions, h('label', { style: 'margin-top:16px' }, 'Put on a film'), h('div.webhook', {}, url, play), h('p.setting-note', {}, `${TV_HINT}: a video, a live channel or a past broadcast. It plays on Saal 2's screen for everyone in there, from the same moment.`)),
    h('footer', {}, h('span.grow', {}, 'You hear it inside Saal 2.'), volume),
  );
  let modal: { close(): void } | null = null;
  const render = () => {
    const s = o.screen.current();
    const set = s.set;
    const phase = o.screen.phase();
    const problem = phase === 'failed' && o.screen.problem() ? ` (${o.screen.problem()})` : '';
    now.replaceChildren(
      h('span.jb-disc', {}, set ? '🎬' : '⬛'),
      h(
        'div.svc-main',
        {},
        h('div.svc-title', { style: 'white-space:normal' }, set ? o.screen.titleNow() : 'Nothing on'),
        h('div.svc-meta', { style: 'white-space:normal' }, set ? [`from ${TV_SITES[set.kind]}${set.live ? ', live' : ''}`, s.by && `put on by ${s.by}`, (STATUS[phase] ?? '') + problem].filter(Boolean).join(' · ') : [s.by && `${s.by} turned it off`].filter(Boolean).join(' · ') || 'Paste a link below'),
      ),
    );
    actions.replaceChildren(
      ...(set
        ? [
            ...(phase !== 'failed' && phase !== 'ended' ? [h('button.btn', { type: 'button', onclick: () => (modal?.close(), o.watchBig()) }, '🎬 Watch full screen')] : []),
            h('button.btn', { type: 'button', title: 'Turn it off, for everyone in Saal 2', onclick: () => o.net.send({ t: 'kino.stop' }) }, '⏹️ Stop'),
            h('a.btn', { href: set.url, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none' }, `↗ Open on ${TV_SITES[set.kind]}`),
          ]
        : []),
    );
    actions.classList.toggle('hidden', !set);
  };
  const send = () => {
    const r = parseTvUrl(url.value);
    if ('error' in r) {
      toast(r.error.replace('The TV only plays', 'Saal 2 only plays'), 'warn');
      return url.focus();
    }
    o.net.send({ t: 'kino.play', url: url.value.trim() });
    url.value = '';
  };
  play.addEventListener('click', send);
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
  const unwatch = o.watch(render);
  const m = openModal(el, { doing: '🎬 at the lectern in Saal 2', onClose: unwatch });
  modal = m;
  close.addEventListener('click', () => m.close());
  volume.addEventListener('click', () => {
    m.close();
    o.openVolume();
  });
  render();
  setTimeout(() => url.focus(), 30);
}

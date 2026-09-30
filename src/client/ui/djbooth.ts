import { DJ_SET_HINT, DJ_SET_SITES, parseDjSetUrl } from '../../shared/djset';
import type { DjSetPlayer } from '../djset';
import type { Net } from '../net';
import { h, openModal, toast } from './dom';

/*
 * The DJ booth's window (flrnoh fork, see FORK.md): what's playing on the roof, a box to paste a
 * YouTube, SoundCloud or Mixcloud set into for everyone up there, the house DJ back, and the air horn.
 */

export interface DjBoothOptions {
  net: Net;
  player: DjSetPlayer;
  /** What the house DJ is up to, for when no set is on. */
  house(): string;
  horn(): void;
  openVolume(): void;
  /** Called when anything the window shows changes; returns how to stop listening. */
  watch(fn: () => void): () => void;
}

const STATUS: Record<string, string> = {
  loading: 'starting…',
  playing: '🔊 playing',
  blocked: '🖱️ click anywhere to hear it',
  failed: "can't play here, so you hear the house DJ",
  ended: 'the set has ended, so you hear the house DJ',
  away: 'paused while you are off the roof',
  off: '',
};

export function openDjBooth(o: DjBoothOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const now = h('div.jb-now');
  const actions = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… · soundcloud.com/… · mixcloud.com/…', 'aria-label': 'Link to a DJ set', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const play = h('button.btn.primary', { type: 'button' }, '▶️ Play set');
  const horn = h('button.btn', { type: 'button', title: 'Everyone on the roof hears it (H at the booth)' }, '📯 Air horn');
  const volume = h('button.btn', { type: 'button' }, '🔈 Your volume');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'DJ booth' },
    h('header', {}, h('h2', {}, '🎧 DJ booth'), close),
    h(
      'div.body',
      {},
      now,
      actions,
      h('label', { style: 'margin-top:16px' }, 'Put on a set'),
      h('div.webhook', {}, url, play),
      h('p.setting-note', {}, `${DJ_SET_HINT}. It plays from the booth for everyone on the roof, from the same moment.`),
    ),
    h('footer', {}, h('span.grow', {}, 'Louder the closer you are to the booth.'), horn, volume),
  );

  const render = () => {
    const s = o.player.current();
    const set = s.set;
    const phase = o.player.phase();
    const problem = phase === 'failed' && o.player.problem() ? ` (${o.player.problem()})` : '';
    now.replaceChildren(
      h('span.jb-disc', { class: phase === 'playing' || !set ? 'spin' : '' }, set ? '🎶' : '💿'),
      h(
        'div.svc-main',
        {},
        h('div.svc-title', { style: 'white-space:normal' }, set ? o.player.titleNow() : 'DJ Merge Conflict, the house DJ'),
        h(
          'div.svc-meta',
          { style: 'white-space:normal' },
          set
            ? [`from ${DJ_SET_SITES[set.kind]}`, s.by && `put on by ${s.by}`, (STATUS[phase] ?? '') + problem].filter(Boolean).join(' · ')
            : [`drum & bass · ${o.house()}`, s.by && `${s.by} gave the decks back`].filter(Boolean).join(' · '),
        ),
      ),
    );
    actions.replaceChildren(
      ...(set
        ? [
            h('button.btn', { type: 'button', title: 'Stop the set, for everyone on the roof', onclick: () => o.net.send({ t: 'dj.stop' }) }, '🏠 Back to the house DJ'),
            h('a.btn', { href: set.url, target: '_blank', rel: 'noopener noreferrer', title: 'Opens in a new tab', style: 'text-decoration:none' }, `↗ Open on ${DJ_SET_SITES[set.kind]}`),
          ]
        : []),
    );
    actions.classList.toggle('hidden', !set);
  };

  const send = () => {
    const r = parseDjSetUrl(url.value);
    if ('error' in r) {
      toast(r.error, 'warn');
      return url.focus();
    }
    o.net.send({ t: 'dj.play', url: url.value.trim() });
    url.value = '';
  };
  play.addEventListener('click', send);
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
  horn.addEventListener('click', () => o.horn());
  // H blows it here too, as at the booth (not while typing a link).
  el.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && e.target !== url && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      o.horn();
    }
  });

  const unwatch = o.watch(render);
  const modal = openModal(el, { doing: '🎧 at the DJ booth', onClose: unwatch });
  close.addEventListener('click', () => modal.close());
  volume.addEventListener('click', () => {
    modal.close();
    o.openVolume();
  });
  render();
  setTimeout(() => url.focus(), 30);
}

import { TV_HINT, TV_SITES, parseTvUrl } from '../../shared/tv';
import type { Net } from '../net';
import type { TvStreams } from '../tv';
import { h, openModal, toast } from './dom';

/*
 * The office TV's window (flrnoh fork, see FORK.md): E at the TV. Watch whoever's sharing their
 * screen, put a YouTube or Twitch link on for everyone on the floor, turn it off, watch it big, or
 * share your own screen (which goes first on the TV, the stream waiting until it's done).
 */

export interface TvMenuOptions {
  net: Net;
  tv: TvStreams;
  /** Who's sharing their screen on this floor (not you), if anyone. */
  sharer(): string | undefined;
  /** Whether you're sharing yours. */
  sharing(): boolean;
  watchShare(): void;
  toggleShare(): void;
  watchBig(): void;
  openVolume(): void;
  /** Called when anything the window shows changes; returns how to stop listening. */
  watch(fn: () => void): () => void;
}

const STATUS: Record<string, string> = {
  loading: 'starting…',
  playing: '🔊 playing',
  blocked: '🖱️ click anywhere to hear it',
  held: '⏸️ paused by you',
  failed: "can't play here",
  ended: 'it has ended',
  away: '⏸️ waiting while a screen is shared',
  off: '',
};

export function openTvMenu(o: TvMenuOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const now = h('div.jb-now');
  const actions = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… · twitch.tv/…', 'aria-label': 'Link to a video or stream', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const play = h('button.btn.primary', { type: 'button' }, '▶️ Put it on');
  const share = h('button.btn', { type: 'button' });
  const volume = h('button.btn', { type: 'button' }, '🔈 Your volume');
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'Office TV' },
    h('header', {}, h('h2', {}, '📺 Office TV'), close),
    h(
      'div.body',
      {},
      now,
      actions,
      h('label', { style: 'margin-top:16px' }, 'Put on a stream'),
      h('div.webhook', {}, url, play),
      h('p.setting-note', {}, `${TV_HINT}: a video, a live channel or a past broadcast. It plays on this floor's TV for everyone here, from the same moment. A shared screen goes first.`),
    ),
    h('footer', {}, h('span.grow', {}, 'Louder the closer you are to the TV.'), share, volume),
  );

  let modal: { close(): void } | null = null;
  const render = () => {
    const s = o.tv.current();
    const set = s.set;
    const phase = o.tv.phase();
    const sharer = o.sharer();
    const problem = phase === 'failed' && o.tv.problem() ? ` (${o.tv.problem()})` : '';
    now.replaceChildren(
      h('span.jb-disc', {}, sharer ? '🖥️' : set ? '📺' : '⬛'),
      h(
        'div.svc-main',
        {},
        h('div.svc-title', { style: 'white-space:normal' }, set ? o.tv.titleNow() : sharer ? `${sharer}'s screen` : 'Nothing on'),
        h(
          'div.svc-meta',
          { style: 'white-space:normal' },
          set
            ? [`from ${TV_SITES[set.kind]}${set.live ? ', live' : ''}`, s.by && `put on by ${s.by}`, sharer ? `waiting while ${sharer} shares their screen` : (STATUS[phase] ?? '') + problem].filter(Boolean).join(' · ')
            : sharer
              ? 'is on the TV'
              : [s.by && `${s.by} turned it off`].filter(Boolean).join(' · ') || 'Put a stream on, or share your screen',
        ),
      ),
    );
    actions.replaceChildren(
      ...(sharer ? [h('button.btn.primary', { type: 'button', onclick: () => (modal?.close(), o.watchShare()) }, `🖥️ Watch ${sharer}'s screen`)] : []),
      ...(set
        ? [
            ...(!sharer && phase !== 'failed' && phase !== 'ended' ? [h('button.btn', { type: 'button', onclick: () => (modal?.close(), o.watchBig()) }, '📺 Watch full screen')] : []),
            h('button.btn', { type: 'button', title: 'Turn the stream off, for everyone on the floor', onclick: () => o.net.send({ t: 'tv.stop' }) }, '⏹️ Stop stream'),
            h('a.btn', { href: set.url, target: '_blank', rel: 'noopener noreferrer', title: 'Opens in a new tab', style: 'text-decoration:none' }, `↗ Open on ${TV_SITES[set.kind]}`),
          ]
        : []),
    );
    actions.classList.toggle('hidden', !sharer && !set);
    share.textContent = o.sharing() ? '🛑 Stop sharing' : '🖥️ Share your screen';
  };

  const send = () => {
    const r = parseTvUrl(url.value);
    if ('error' in r) {
      toast(r.error, 'warn');
      return url.focus();
    }
    o.net.send({ t: 'tv.play', url: url.value.trim() });
    url.value = '';
  };
  play.addEventListener('click', send);
  url.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
  share.addEventListener('click', () => {
    modal?.close();
    o.toggleShare();
  });

  const unwatch = o.watch(render);
  const m = openModal(el, { doing: '📺 at the TV', onClose: unwatch });
  modal = m;
  close.addEventListener('click', () => m.close());
  volume.addEventListener('click', () => {
    m.close();
    o.openVolume();
  });
  render();
  setTimeout(() => url.focus(), 30);
}

/** The stream big, with its player's own controls: the same player, laid over this window (see TvStreams.watch). */
export function openTvBig(tv: TvStreams, watch: (fn: () => void) => () => void) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const title = h('h2', {});
  const note = h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-weight:800;padding:16px;text-align:center' });
  const spot = h('div', { style: 'position:relative;width:min(100%, calc((100vh - 120px) * 16 / 9));aspect-ratio:16/9;margin:0 auto;background:#000' }, note);
  const el = h('div.modal.viewer', { role: 'dialog', 'aria-label': 'Office TV' }, h('header', {}, title, close), spot);
  const render = () => {
    title.textContent = `📺 ${tv.titleNow() || 'Office TV'}`;
    const phase = tv.phase();
    note.textContent = phase === 'failed' ? `Can't play it here${tv.problem() ? `: ${tv.problem()}` : ''}` : phase === 'ended' ? 'It has ended' : phase === 'away' ? 'Waiting while a screen is shared' : !tv.current().set ? 'The stream was turned off' : 'Starting…';
  };
  const unwatch = watch(render);
  const modal = openModal(el, {
    doing: '📺 watching the TV',
    onClose: () => {
      unwatch();
      tv.watch(null);
    },
  });
  close.addEventListener('click', () => modal.close());
  tv.watch(spot);
  render();
}

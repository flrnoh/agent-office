import { DJ_SET_HINT, DJ_SET_SITES, parseDjSetUrl } from '../../shared/djset';
import type { DjSetPlayer } from '../djset';
import type { Net } from '../net';
import { store } from '../state';
import { partyVolumeControls, skipControls } from './djcontrols';
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
  /** A tap on the beat; the tempo once there are enough in time (sent to everyone), else null. */
  tap(): number | null;
  /** Back to the set's own beat, as the office heard it. */
  untap(): void;
  /** The party's volume (0–2, 2 is Disco) for everyone on the roof: the team's to set. */
  setVolume(v: number): void;
  /** Skip to `at` seconds into the set, for everyone on the roof. */
  seek(at: number): void;
}

const STATUS: Record<string, string> = {
  loading: 'starting…',
  playing: '🔊 playing',
  blocked: '🖱️ click anywhere to hear it',
  failed: "can't play here, so you hear the house DJ",
  ended: '🤫 the set is over: quiet till someone puts on the next one (or the house DJ)',
  away: 'paused while you are off the roof',
  off: '',
};

export function openDjBooth(o: DjBoothOptions) {
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const now = h('div.jb-now');
  const tempo = h('div.svc-meta', { style: 'white-space:normal;margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  // How the set's video for the LED wall is coming on (YouTube sets only).
  const wallVideo = h('div.svc-meta', { style: 'white-space:normal;margin-top:6px' });
  /** The tempo you're tapping, till it's sent. */
  let tapping = '';
  let tapDone = 0;
  const actions = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
  const url = h('input', { type: 'text', placeholder: 'https://youtube.com/watch?v=… · soundcloud.com/… · mixcloud.com/…', 'aria-label': 'Link to a DJ set', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const play = h('button.btn.primary', { type: 'button' }, '▶️ Play set');
  const horn = h('button.btn', { type: 'button', title: 'Everyone on the roof hears it (H at the booth)' }, '📯 Air horn');
  const volume = h('button.btn', { type: 'button' }, '🔈 Your volume');
  // The party's volume, for everyone on the roof: the team sets it, guests see it.
  const host = !store.me.guest;
  const party = partyVolumeControls({ lang: 'en', host, setVolume: o.setVolume });
  const partyNote = h('p.setting-note');
  // Skipping through the set, for everyone up here.
  const skip = skipControls({ player: o.player, lang: 'en', seek: o.seek });
  const el = h(
    'div.modal.jukebox',
    { role: 'dialog', 'aria-label': 'DJ booth' },
    h('header', {}, h('h2', {}, '🎧 DJ booth'), close),
    h(
      'div.body',
      {},
      now,
      actions,
      tempo,
      wallVideo,
      skip.el,
      party.head('🔊 Party volume, for everyone on the roof'),
      party.row,
      partyNote,
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
    // The tempo the lights go by: heard from the set, or tapped.
    const b = s.beats;
    const heard =
      s.tap ? `🥁 ${Math.round(s.tap.bpm)} BPM, tapped at the booth`
      : b?.status === 'ready' ? `🥁 ${Math.round(b.bpm ?? 0)} BPM: the lights go by the set's own beat`
      : b?.status === 'pending' ? '🥁 listening to the set for its beat…'
      : b?.status === 'failed' ? `🥁 couldn't hear the set's beat (${b.why ?? 'no reason'}): tap it in`
      : '🥁 tap the beat in for the lights';
    tempo.replaceChildren(
      h('span.grow', {}, tapping || heard),
      h('button.btn', { type: 'button', title: 'Tap on every beat, four times or more (T)', onclick: tapOnce }, '🥁 Tap'),
      ...(s.tap ? [h('button.btn', { type: 'button', title: "Back to the beat the office heard in the set", onclick: () => o.untap() }, "↺ The set's own beat")] : []),
    );
    tempo.classList.toggle('hidden', !set);
    const v = s.video;
    wallVideo.textContent =
      v?.status === 'ready' ? "📺 the set's video comes on the LED wall now and then"
      : v?.status === 'pending' ? "📺 fetching the set's video for the LED wall…"
      : v?.status === 'failed' ? `📺 no video on the LED wall (${v.why ?? 'no reason'})`
      : '';
    wallVideo.classList.toggle('hidden', !set || !v);
    // The party's volume, unless it's under your hand right now.
    party.paint(s.volume ?? 1);
    skip.render();
    partyNote.textContent = [s.volumeBy && `Set by ${s.volumeBy}.`, host ? 'The house DJ and every set play at this for everyone up here; your own volume comes on top. Past 100% it gets louder for everyone and carries across the whole terrace; 200% is Disco.' : 'The hosts set it for everyone up here.']
      .filter(Boolean)
      .join(' ');
  };
  function tapOnce() {
    const bpm = o.tap();
    tapping = bpm ? `🥁 ${Math.round(bpm)} BPM… (stop tapping to send it)` : 'keep tapping on the beat…';
    clearTimeout(tapDone);
    tapDone = window.setTimeout(() => ((tapping = ''), render()), 2000);
    render();
  }

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
  // H blows it here too, as at the booth, and T taps the tempo (not while typing a link).
  el.addEventListener('keydown', (e) => {
    if (e.target === url || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyH') {
      e.preventDefault();
      o.horn();
    } else if (e.code === 'KeyT' && !e.repeat && o.player.current().set) {
      e.preventDefault();
      tapOnce();
    }
  });

  const unwatch = o.watch(render);
  const modal = openModal(el, { doing: '🎧 at the DJ booth', onClose: () => (unwatch(), skip.stop()) });
  close.addEventListener('click', () => modal.close());
  volume.addEventListener('click', () => {
    modal.close();
    o.openVolume();
  });
  render();
  setTimeout(() => url.focus(), 30);
}

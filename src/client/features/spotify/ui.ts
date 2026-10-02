// flrnoh fork (see FORK.md "Spotify"): the Spotify window (U, or 🎧 in the ☰ menu). Not set up yet:
// how to set it up. Signed out: connect. Signed in: what's playing with its controls and volume,
// search, your playlists and liked songs; click something to put it on here.
import './ui.css';
import { h, openModal } from '../../ui/dom';
import { clientId, onLocalhost, redirectUri, signedIn } from './auth';
import type { OfficePlayer, Playable, Trouble } from './player';
import { likedSongs, myPlaylists, search } from './player';

export interface SpotifyWindowDeps {
  player: OfficePlayer;
  connect(): Promise<void>;
  disconnect(): void;
  volume(): number;
  setVolume(v: number): void;
  ducking(): boolean;
  setDucking(on: boolean): void;
  /** Called on every change of the player, to redraw; returns how to stop. */
  watch(fn: () => void): () => void;
}

const TROUBLE: Record<Trouble, string> = {
  premium: 'Spotify spielt hier nur mit Spotify Premium.',
  allowlist: 'Dein Spotify-Konto ist für die Büro-App noch nicht freigeschaltet: Florian muss dich im Spotify-Dashboard unter „User Management“ eintragen (Name und Spotify-E-Mail).',
  auth: 'Die Spotify-Anmeldung ist abgelaufen: bitte neu verbinden.',
  browser: 'Dieser Browser kann Spotify nicht abspielen (Safari auf dem iPhone kann es nicht; Chrome, Firefox, Edge oder Safari auf dem Mac gehen).',
  other: 'Spotify hat beim Abspielen einen Fehler gemeldet. Nochmal versuchen?',
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function openSpotify(d: SpotifyWindowDeps) {
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close' }, '✕');
  const body = h('div.body.sp-body');
  const foot = h('span.grow');
  const el = h('div.modal.spotify', { role: 'dialog', 'aria-label': 'Spotify' }, h('header', {}, h('h2', {}, '🎧 Spotify'), close), body, h('footer', {}, foot));
  let stopWatching = () => {};
  let tick = 0;
  const modal = openModal(el, {
    doing: '🎧 picking music',
    onClose: () => {
      stopWatching();
      clearInterval(tick);
    },
  });
  close.addEventListener('click', () => modal.close());

  const say = (text: string, tone: 'info' | 'bad' = 'info') => h(`p.sp-note.${tone}`, {}, text);

  async function show() {
    const id = await clientId();
    if (!id) return showSetup();
    if (!(await signedIn())) return showSignIn();
    showPlayer();
  }

  function showSetup() {
    foot.textContent = 'Jeder hört über sein eigenes Spotify Premium.';
    body.replaceChildren(
      say('Spotify ist im Büro noch nicht eingerichtet. Einmal, durch Florian:'),
      h(
        'ol.sp-steps',
        {},
        h('li', {}, 'Auf ', h('a', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener' }, 'developer.spotify.com/dashboard'), ' eine App anlegen („Agent Office“), mit „Web API“ und „Web Playback SDK“.'),
        h('li', {}, 'Als Redirect URI eintragen: ', h('code', {}, redirectUri())),
        h('li', {}, 'Die Client ID im Büro-Ordner ablegen: ', h('code', {}, '~/agent-office/.agent-office/spotify.json'), ' mit ', h('code', {}, '{"clientId": "…"}'), '.'),
        h('li', {}, 'Unter „User Management“ alle eintragen, die hier Spotify hören sollen (bis zu 5, jeder mit Premium).'),
      ),
      h('button.btn.sp-again', { type: 'button', onclick: () => void show() }, 'Nochmal schauen'),
    );
  }

  function showSignIn(error?: string) {
    foot.textContent = 'Spotify Premium nötig. Die Anmeldung bleibt in diesem Browser.';
    const btn = h('button.btn.primary.sp-connect', { type: 'button' }, 'Mit Spotify verbinden');
    btn.addEventListener('click', () => {
      btn.setAttribute('disabled', '');
      btn.textContent = 'Warte auf Spotify…';
      d.connect().then(
        () => show(),
        (err: Error) => showSignIn(err.message),
      );
    });
    body.replaceChildren(
      say('Hör deine Musik im Büro: Playlists, Alben, Suche. Sie läuft weiter, wo du auch hingehst, wie Kopfhörer.'),
      ...(onLocalhost() ? [say(`Spotify nimmt „localhost“ nicht an: öffne das Büro über http://127.0.0.1:${location.port || 80} (und trag diese Adresse mit /spotify-callback.html als Redirect URI ein).`, 'bad')] : []),
      ...(error ? [say(error, 'bad')] : []),
      btn,
    );
  }

  function showPlayer() {
    const p = d.player;
    foot.replaceChildren(
      h('span', {}, 'Läuft über dein Spotify, nur bei dir. '),
      h('button.sp-link', { type: 'button', onclick: () => (d.disconnect(), void show()) }, 'Abmelden'),
    );
    // What's playing.
    const cover = h('div.sp-cover');
    const title = h('div.sp-title');
    const artist = h('div.sp-artist');
    const bar = h('div.sp-bar', { title: 'Klicken zum Springen' }, h('div.sp-fill'));
    const time = h('div.sp-time');
    const playBtn = h('button.btn.sp-play', { type: 'button', 'aria-label': 'Play/Pause', onclick: () => p.toggle() }, '▶');
    const controls = h(
      'div.sp-controls',
      {},
      h('button.btn', { type: 'button', 'aria-label': 'Zurück', onclick: () => p.previous() }, '⏮'),
      playBtn,
      h('button.btn', { type: 'button', 'aria-label': 'Weiter', onclick: () => p.next() }, '⏭'),
    );
    const vol = h('input.sp-volume', { type: 'range', min: '0', max: '100', value: String(Math.round(d.volume() * 100)), 'aria-label': 'Lautstärke' }) as HTMLInputElement;
    vol.addEventListener('input', () => d.setVolume(Number(vol.value) / 100));
    const duck = h('input', { type: 'checkbox' }) as HTMLInputElement;
    duck.checked = d.ducking();
    duck.addEventListener('change', () => d.setDucking(duck.checked));
    const here = h('button.btn', { type: 'button', title: 'Was auf deinem Handy oder Rechner läuft, hier weiterspielen' }, '📲 Hierher holen');
    here.addEventListener('click', () => void p.bringHere().catch(showError));
    const trouble = h('div');
    const now = h(
      'div.sp-now',
      {},
      cover,
      h('div.sp-meta', {}, title, artist, bar, time),
      h('div.sp-side', {}, controls, h('label.sp-vol', {}, '🔈', vol)),
    );
    bar.addEventListener('click', (e) => {
      const t = p.now.track;
      if (!t) return;
      const r = bar.getBoundingClientRect();
      p.seek(((e.clientX - r.left) / r.width) * t.duration);
    });

    // Search, and your own music when there's nothing searched.
    const q = h('input.sp-search', { type: 'search', placeholder: 'Songs, Playlists, Alben suchen…', 'aria-label': 'Suchen' }) as HTMLInputElement;
    const results = h('div.sp-results');
    let seq = 0;
    let timer = 0;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void runSearch(), 350);
    });
    // Typing here mustn't walk you about or open the chat.
    q.addEventListener('keydown', (e) => e.stopPropagation());

    async function runSearch() {
      const n = ++seq;
      const text = q.value.trim();
      results.replaceChildren(say('Lädt…'));
      try {
        if (!text) {
          const [lists, liked] = await Promise.all([myPlaylists(), likedSongs().catch(() => [])]);
          if (n !== seq) return;
          results.replaceChildren(section('Deine Playlists', lists), section('Lieblingssongs', liked, true));
          return;
        }
        const r = await search(text);
        if (n !== seq) return;
        results.replaceChildren(section('Songs', r.tracks, true), section('Playlists', r.playlists), section('Alben', r.albums));
      } catch (err) {
        if (n === seq) results.replaceChildren(problem(err));
      }
    }

    function section(name: string, items: Playable[], rows = false): HTMLElement {
      if (!items.length) return h('div');
      return h(
        'section.sp-section',
        {},
        h('h3', {}, name),
        h(
          rows ? 'ul.sp-rows' : 'ul.sp-tiles',
          {},
          ...items.map((it) => {
            const li = h(
              'li',
              { tabindex: 0, role: 'button', title: `${it.name} abspielen` },
              it.image ? h('img', { src: it.image, alt: '', loading: 'lazy' }) : h('span.sp-noimg', {}, '♪'),
              h('div.sp-item', {}, h('div.sp-item-name', {}, it.name), h('div.sp-item-sub', {}, it.sub)),
            );
            const go = () => void p.play(it).catch(showError);
            li.addEventListener('click', go);
            li.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                go();
              }
            });
            return li;
          }),
        ),
      );
    }

    function problem(err: unknown): HTMLElement {
      const t = (err as { trouble?: Trouble }).trouble;
      return say(t ? TROUBLE[t] : (err as Error).message, 'bad');
    }
    function showError(err: unknown) {
      trouble.replaceChildren(problem(err));
    }

    body.replaceChildren(now, trouble, h('div.sp-row', {}, here, h('label.sp-duck', {}, duck, ' Büromusik aus, solange Spotify läuft')), q, results);
    void runSearch();

    const draw = () => {
      const n = p.now;
      const t = n.track;
      title.textContent = t ? t.name : p.device ? 'Nichts läuft' : 'Verbinde…';
      artist.textContent = t ? t.artists : p.device ? 'Such dir was aus, oder hol die Musik von deinem Handy hierher' : '';
      cover.replaceChildren(t?.image ? h('img', { src: t.image, alt: '' }) : h('span', {}, '🎧'));
      playBtn.textContent = n.paused ? '▶' : '⏸';
      controls.classList.toggle('dim', !t);
      if (p.trouble) trouble.replaceChildren(say(TROUBLE[p.trouble], 'bad'));
      else if (trouble.firstChild && trouble.textContent === TROUBLE.premium) trouble.replaceChildren();
      progress();
    };
    const progress = () => {
      const t = p.now.track;
      const at = p.position();
      (bar.firstChild as HTMLElement).style.width = t ? `${((at / t.duration) * 100).toFixed(2)}%` : '0';
      time.textContent = t ? `${mmss(at)} / ${mmss(t.duration)}` : '';
    };
    stopWatching = d.watch(draw);
    tick = window.setInterval(progress, 500);
    draw();
  }

  void show();
}

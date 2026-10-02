/**
 * flrnoh fork (see FORK.md "Spotify"): your own Spotify in the office, through Spotify's Web Playback
 * SDK. Signed in with your Spotify Premium account, the page is a Spotify device ("Agent Office · you"):
 * U (or 🎧 in the ☰ menu) opens the window to search, pick a playlist, or bring over what's playing on
 * your phone. It keeps playing wherever you go, like headphones, and while it plays the office's own
 * music (jukebox, speakers, DJ, TV) goes quiet for you, unless you say otherwise. Only you hear it.
 */
import type { HudAction } from '../../ui/menu';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { signIn, signOut, signedIn } from './auth';
import { OfficePlayer } from './player';
import { openSpotify } from './ui';

const PREFS_KEY = 'spotify-prefs';

interface Prefs {
  volume: number;
  /** The office's music off while Spotify plays. */
  duck: boolean;
}

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return { volume: typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : 0.6, duck: p.duck !== false };
  } catch {
    return { volume: 0.6, duck: true };
  }
}

let open: (() => void) | null = null;
let playing = () => false;
let nowTitle = () => '';

/** The 🎧 entry in the ☰ menu, up on the top bar with the song while one plays (see features/hud). */
export const spotifyAction: HudAction = {
  id: 'spotify',
  icon: '🎧',
  label: 'Spotify',
  section: 'Together',
  key: 'U',
  on: () => playing(),
  status: () => playing(),
  chip: () => nowTitle(),
  title: () => (playing() ? `🎧 ${nowTitle()}` : 'Deine Musik von Spotify, nur für dich (Premium)'),
  run: () => open?.(),
};

export function installSpotify(ctx: Ctx) {
  const prefs = loadPrefs();
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage blocked
    }
  };
  const watchers = new Set<() => void>();
  let ducked = false;
  let lastChip = '';

  const player = new OfficePlayer(
    () => `Agent Office${store.profile.name ? ` · ${store.profile.name}` : ''}`,
    () => prefs.volume,
    () => changed(),
  );

  /** The office's music, on or off for you as Spotify plays (your own settings otherwise). */
  function duck() {
    const want = prefs.duck && !player.now.paused && !!player.now.track;
    if (want === ducked) return;
    ducked = want;
    ctx.sound.setMusicVolume(ctx.settings.music, want || ctx.settings.musicMuted);
  }

  function changed() {
    duck();
    for (const fn of watchers) fn();
    const chip = playing() ? nowTitle() : '';
    if (chip !== lastChip) {
      lastChip = chip;
      ctx.hud.refresh();
    }
  }

  playing = () => !player.now.paused && !!player.now.track;
  nowTitle = () => {
    const t = player.now.track;
    if (!t) return '';
    const s = `${t.name} · ${t.artists}`;
    return s.length > 32 ? `${s.slice(0, 31)}…` : s;
  };

  open = () =>
    openSpotify({
      player,
      connect: async () => {
        await signIn();
        await player.start();
      },
      disconnect: () => {
        player.stop();
        signOut();
        duck();
      },
      volume: () => prefs.volume,
      setVolume: (v) => {
        prefs.volume = v;
        player.setVolume(v);
        savePrefs();
      },
      ducking: () => prefs.duck,
      setDucking: (on) => {
        prefs.duck = on;
        savePrefs();
        duck();
      },
      watch: (fn) => {
        watchers.add(fn);
        return () => watchers.delete(fn);
      },
    });

  ctx.keys.bind({ code: 'KeyU', run: () => open?.() });
  // Signed in already: be a Spotify device from the start, so the phone can hand the music over.
  void signedIn().then((yes) => {
    if (yes) player.start().catch(() => {});
  });
  window.addEventListener('pagehide', () => player.stop());

  return { open: () => open?.(), player };
}

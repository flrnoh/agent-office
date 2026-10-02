// flrnoh fork (see FORK.md "Spotify"): the office page as a Spotify device ("Agent Office"), through
// Spotify's Web Playback SDK, and the bits of the Web API the window uses (search, your playlists,
// play this, bring the music over here). Spotify plays it in its own protected audio, so it can't go
// through the office's sound (no speakers, no echo in the rooms): it's like headphones on.

import { signOut, token } from './auth';

const SDK = 'https://sdk.scdn.co/spotify-player.js';
const API = 'https://api.spotify.com/v1';

export interface Track {
  uri: string;
  name: string;
  artists: string;
  image?: string;
  /** ms */
  duration: number;
}

export interface NowPlaying {
  track: Track | null;
  paused: boolean;
  /** ms, at `at` (performance.now()) */
  position: number;
  at: number;
}

/** Something to put on: a song, a playlist, an album. */
export interface Playable {
  uri: string;
  kind: 'track' | 'playlist' | 'album';
  name: string;
  sub: string;
  image?: string;
}

/** Why it can't play, in words for the window. */
export type Trouble = 'premium' | 'allowlist' | 'auth' | 'browser' | 'other';

/** The SDK's own types, as far as they're used. */
interface SdkState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { uri: string; name: string; duration_ms: number; artists: { name: string }[]; album: { images: { url: string; width?: number }[] } } | null };
}
interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(ev: string, fn: (arg: any) => void): void;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(v: number): Promise<void>;
  activateElement(): Promise<void>;
}
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume: number }) => SdkPlayer };
  }
}

let sdkP: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  sdkP ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onerror = () => {
      sdkP = null;
      reject(new Error('Spotify-Player konnte nicht geladen werden'));
    };
    document.head.append(s);
  });
  return sdkP;
}

/** A call to the Web API, signed in; null for 204. Throws an Error with `trouble` on what the window should say. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const r = await fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  if (r.status === 204 || r.status === 202) return null;
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string; reason?: string } }) | null;
  if (!r.ok) {
    const msg = j?.error?.message ?? `Spotify: ${r.status}`;
    const err = new Error(msg) as Error & { trouble?: Trouble };
    // 403 in development mode: the account isn't on the app's list of users. PREMIUM_REQUIRED: no Premium.
    err.trouble = j?.error?.reason === 'PREMIUM_REQUIRED' ? 'premium' : r.status === 403 ? 'allowlist' : r.status === 401 ? 'auth' : 'other';
    if (r.status === 401) signOut();
    throw err;
  }
  return j;
}

const image = (imgs: { url: string; width?: number | null }[] | undefined) => {
  if (!imgs?.length) return undefined;
  // The smallest that's still at least 64 px, else the first.
  const fit = [...imgs].filter((i) => (i.width ?? 300) >= 64).sort((a, b) => (a.width ?? 300) - (b.width ?? 300));
  return (fit[0] ?? imgs[0]).url;
};

interface ApiTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album?: { images: { url: string; width?: number }[] };
}
interface ApiList {
  uri: string;
  name: string;
  images?: { url: string; width?: number }[] | null;
  owner?: { display_name?: string };
  artists?: { name: string }[];
  tracks?: { total?: number };
}

const fromTrack = (t: ApiTrack): Playable => ({ uri: t.uri, kind: 'track', name: t.name, sub: t.artists.map((a) => a.name).join(', '), image: image(t.album?.images) });
const fromList = (kind: 'playlist' | 'album') => (l: ApiList): Playable => ({
  uri: l.uri,
  kind,
  name: l.name,
  sub: kind === 'album' ? (l.artists ?? []).map((a) => a.name).join(', ') : `Playlist${l.owner?.display_name ? ` · ${l.owner.display_name}` : ''}`,
  image: image(l.images ?? undefined),
});

/** Songs, playlists and albums for a search. */
export async function search(q: string): Promise<{ tracks: Playable[]; playlists: Playable[]; albums: Playable[] }> {
  const j = await api<{ tracks?: { items: (ApiTrack | null)[] }; playlists?: { items: (ApiList | null)[] }; albums?: { items: (ApiList | null)[] } }>(`/search?${new URLSearchParams({ q, type: 'track,playlist,album', limit: '8' })}`);
  return {
    tracks: (j?.tracks?.items ?? []).filter((x): x is ApiTrack => !!x).map(fromTrack),
    playlists: (j?.playlists?.items ?? []).filter((x): x is ApiList => !!x).slice(0, 6).map(fromList('playlist')),
    albums: (j?.albums?.items ?? []).filter((x): x is ApiList => !!x).slice(0, 6).map(fromList('album')),
  };
}

/** Your own playlists (and the ones you follow), and your liked songs as the first. */
export async function myPlaylists(): Promise<Playable[]> {
  const j = await api<{ items: (ApiList | null)[] }>('/me/playlists?limit=40');
  return (j?.items ?? []).filter((x): x is ApiList => !!x).map(fromList('playlist'));
}

/** Your liked songs, newest first. */
export async function likedSongs(): Promise<Playable[]> {
  const j = await api<{ items: { track: ApiTrack | null }[] }>('/me/tracks?limit=30');
  return (j?.items ?? []).map((i) => i.track).filter((t): t is ApiTrack => !!t).map(fromTrack);
}

/** The office's Spotify device, made once you're signed in. */
export class OfficePlayer {
  device: string | null = null;
  now: NowPlaying = { track: null, paused: true, position: 0, at: 0 };
  trouble: Trouble | null = null;
  private p: SdkPlayer | null = null;
  private starting: Promise<void> | null = null;

  constructor(
    private readonly name: () => string,
    private readonly volume: () => number,
    private readonly changed: () => void,
  ) {}

  /** Loads the SDK and connects as a device (again: idempotent). */
  start(): Promise<void> {
    this.starting ??= this.connect().catch((err) => {
      this.starting = null;
      throw err;
    });
    return this.starting;
  }

  private async connect() {
    await loadSdk();
    if (!window.Spotify) throw new Error('Spotify-Player fehlt');
    const p = new window.Spotify.Player({
      name: this.name(),
      volume: this.volume(),
      getOAuthToken: (cb) => {
        token().then(cb, () => {
          this.trouble = 'auth';
          this.changed();
        });
      },
    });
    p.addListener('ready', ({ device_id }: { device_id: string }) => {
      this.device = device_id;
      this.trouble = null;
      this.changed();
    });
    p.addListener('not_ready', () => {
      this.device = null;
      this.changed();
    });
    p.addListener('player_state_changed', (s: SdkState | null) => {
      const t = s?.track_window.current_track;
      this.now = {
        track: t ? { uri: t.uri, name: t.name, artists: t.artists.map((a) => a.name).join(', '), image: image(t.album.images), duration: s?.duration || t.duration_ms } : null,
        paused: !s || s.paused,
        position: s?.position ?? 0,
        at: performance.now(),
      };
      this.changed();
    });
    const fail = (why: Trouble) => () => {
      this.trouble = why;
      this.changed();
    };
    p.addListener('account_error', fail('premium'));
    p.addListener('authentication_error', fail('auth'));
    p.addListener('initialization_error', fail('browser'));
    p.addListener('playback_error', fail('other'));
    this.p = p;
    if (!(await p.connect())) throw new Error('Keine Verbindung zu Spotify');
  }

  /** Where the song is now (ms), counting on from the last state while it plays. */
  position(): number {
    const n = this.now;
    if (!n.track) return 0;
    return Math.min(n.track.duration, n.position + (n.paused ? 0 : performance.now() - n.at));
  }

  /** Puts `what` on here; a song from a list starts that list at it. */
  async play(what: Playable, context?: Playable) {
    await this.start();
    await this.p?.activateElement();
    const device = await this.waitForDevice();
    const body = what.kind === 'track' ? (context ? { context_uri: context.uri, offset: { uri: what.uri } } : { uris: [what.uri] }) : { context_uri: what.uri };
    await api(`/me/player/play?device_id=${encodeURIComponent(device)}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  /** Takes over what's playing on your phone or computer, here. */
  async bringHere() {
    await this.start();
    await this.p?.activateElement();
    const device = await this.waitForDevice();
    await api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device], play: true }) });
  }

  toggle = () => void this.p?.activateElement().then(() => this.p?.togglePlay());
  pause = () => void this.p?.pause();
  next = () => void this.p?.nextTrack();
  previous = () => void this.p?.previousTrack();
  seek = (ms: number) => void this.p?.seek(Math.max(0, Math.round(ms)));
  setVolume = (v: number) => void this.p?.setVolume(Math.max(0, Math.min(1, v)));

  /** Lets go of the device (signing out). */
  stop() {
    this.p?.disconnect();
    this.p = null;
    this.device = null;
    this.starting = null;
    this.now = { track: null, paused: true, position: 0, at: 0 };
    this.changed();
  }

  private async waitForDevice(): Promise<string> {
    for (let i = 0; i < 50 && !this.device; i++) await new Promise((r) => setTimeout(r, 100));
    if (!this.device) throw new Error('Der Spotify-Player im Büro ist noch nicht bereit');
    return this.device;
  }
}

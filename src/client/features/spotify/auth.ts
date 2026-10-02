// flrnoh fork (see FORK.md "Spotify"): signing in to Spotify from the page, with PKCE (no client
// secret anywhere). A popup goes to Spotify's sign-in; it comes back to /spotify-callback.html, which
// hands the code to this page and closes. The tokens stay in this browser (localStorage) and are
// refreshed as they run out. The office itself only says which Spotify app to use (/api/spotify).

const STORE_KEY = 'spotify-auth';
/** The callback page (public/spotify-callback.html) answers on this channel. */
const CHANNEL = 'spotify-auth';

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ');

interface Saved {
  clientId: string;
  access: string;
  refresh: string;
  /** When the access token runs out (ms since the epoch). */
  expires: number;
}

/** Where Spotify sends you back to: this office's own page for it. Spotify won't take `localhost` (only 127.0.0.1). */
export const redirectUri = () => `${location.origin}/spotify-callback.html`;
export const onLocalhost = () => location.hostname === 'localhost';

let clientIdP: Promise<string | null> | null = null;

/** The Spotify app the office signs in with (null until one's set up in spotify.json). */
export function clientId(): Promise<string | null> {
  clientIdP ??= fetch('/api/spotify', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ clientId: string | null }>) : { clientId: null }))
    .then((j) => j.clientId)
    .catch(() => null)
    .then((id) => {
      // Not set up yet: ask again next time (it may be by then).
      if (!id) clientIdP = null;
      return id;
    });
  return clientIdP;
}

function load(): Saved | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Saved | null;
    return s && typeof s.access === 'string' && typeof s.refresh === 'string' ? s : null;
  } catch {
    return null;
  }
}

function save(s: Saved | null) {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // storage blocked: signed in until the page goes
  }
  memory = s;
}

let memory: Saved | null = load();

/** Signed in (with the office's current app). */
export async function signedIn(): Promise<boolean> {
  const id = await clientId();
  return !!id && !!memory && memory.clientId === id;
}

export function signOut() {
  save(null);
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return b64url(bytes).slice(0, n);
}

/** Opens Spotify's sign-in in a popup, and resolves once it's come back and the tokens are in. */
export async function signIn(): Promise<void> {
  const id = await clientId();
  if (!id) throw new Error('Spotify ist im Büro noch nicht eingerichtet');
  const verifier = randomString(64);
  const state = randomString(16);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge, redirect_uri: redirectUri(), state }).toString();
  // The callback page answers on a channel rather than to window.opener: going through Spotify's
  // sign-in can cut the popup off from its opener, but it's still this office's origin when it's back.
  const channel = new BroadcastChannel(CHANNEL);
  const popup = window.open(url.toString(), 'spotify-login', 'width=480,height=760');
  if (!popup) {
    channel.close();
    throw new Error('Das Anmeldefenster wurde blockiert: Popups für das Büro erlauben');
  }
  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.close();
      reject(new Error('Die Anmeldung hat zu lange gedauert'));
    }, 10 * 60_000);
    channel.onmessage = (e: MessageEvent) => {
      const d = e.data as { code?: string; state?: string; error?: string };
      if (d?.state !== state && !d?.error) return;
      clearTimeout(timeout);
      channel.close();
      if (d.error) reject(new Error(d.error === 'access_denied' ? 'Abgebrochen' : `Spotify sagt: ${d.error}`));
      else if (!d.code) reject(new Error('Die Anmeldung kam nicht richtig zurück'));
      else resolve(d.code);
    };
  });
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: id, code_verifier: verifier });
  save({ clientId: id, access: t.access_token, refresh: t.refresh_token ?? '', expires: Date.now() + t.expires_in * 1000 });
}

interface TokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenReply> {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = (await r.json().catch(() => ({}))) as Partial<TokenReply> & { error?: string; error_description?: string };
  if (!r.ok || !j.access_token || !j.expires_in) throw new Error(j.error_description || j.error || `Spotify-Anmeldung fehlgeschlagen (${r.status})`);
  return j as TokenReply;
}

let refreshing: Promise<string> | null = null;

/** A good access token: the saved one, or a fresh one when it's about to run out. Throws when signed out. */
export async function token(): Promise<string> {
  const s = memory;
  if (!s) throw new Error('Nicht bei Spotify angemeldet');
  if (Date.now() < s.expires - 60_000) return s.access;
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: s.clientId })
    .then((t) => {
      save({ clientId: s.clientId, access: t.access_token, refresh: t.refresh_token || s.refresh, expires: Date.now() + t.expires_in * 1000 });
      return t.access_token;
    })
    .catch((err) => {
      // The refresh token's no good any more (revoked, the app changed): signed out.
      save(null);
      throw err;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

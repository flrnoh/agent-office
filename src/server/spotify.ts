import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Spotify in the office (flrnoh fork, see FORK.md "Spotify"): the page plays through Spotify's Web
 * Playback SDK, each person signed in with their own Spotify Premium account. The office only says
 * which Spotify app to sign in with: its Client ID, from the app made at developer.spotify.com. The
 * sign-in itself (PKCE, no client secret) and the tokens stay in each browser; nothing of anyone's
 * Spotify goes through the office.
 *
 * The ID: `<office>/.agent-office/spotify.json` = {"clientId": "..."}, or the environment's
 * SPOTIFY_CLIENT_ID. Read on each ask, so it's there without a restart.
 */

const CLIENT_ID = /^[0-9a-f]{32}$/i;

/** The Spotify app's Client ID, or null when there's none (or it doesn't look like one). */
export function readSpotifyClientId(dataDir: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.SPOTIFY_CLIENT_ID?.trim();
  if (fromEnv) return CLIENT_ID.test(fromEnv) ? fromEnv : null;
  const file = path.join(dataDir, 'spotify.json');
  if (!existsSync(file)) return null;
  try {
    const id = String((JSON.parse(readFileSync(file, 'utf8')) as { clientId?: unknown }).clientId ?? '').trim();
    return CLIENT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

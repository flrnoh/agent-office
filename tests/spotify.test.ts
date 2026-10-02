// flrnoh fork (see FORK.md "Spotify"): which Spotify app the office signs in with.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { guestMayFetch } from '../src/server/guests.js';
import { forkRoutes } from '../src/server/http/routes/fork.js';
import { routes } from '../src/server/http/routes/index.js';
import { readSpotifyClientId } from '../src/server/spotify.js';

const ID = '0123456789abcdef0123456789abcdef';

test('the Client ID comes from spotify.json or SPOTIFY_CLIENT_ID, and only when it looks like one', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-spotify-'));
  assert.equal(readSpotifyClientId(dir, {}), null, 'nothing set up');
  writeFileSync(path.join(dir, 'spotify.json'), JSON.stringify({ clientId: ` ${ID} ` }));
  assert.equal(readSpotifyClientId(dir, {}), ID);
  assert.equal(readSpotifyClientId(dir, { SPOTIFY_CLIENT_ID: ID.toUpperCase() }), ID.toUpperCase(), 'the environment first');
  assert.equal(readSpotifyClientId(dir, { SPOTIFY_CLIENT_ID: 'nope' }), null);
  for (const bad of ['{', '{"clientId": "short"}', '{"clientId": 42}', '[]']) {
    writeFileSync(path.join(dir, 'spotify.json'), bad);
    assert.equal(readSpotifyClientId(dir, {}), null, bad);
  }
});

test('guests may ask which Spotify app to use (they play from their own account)', () => {
  assert.equal(
    guestMayFetch('/api/spotify', new URL('http://x/api/spotify'), () => false),
    true,
  );
});

test('the office answers /api/spotify, signed in', () => {
  assert.ok(routes.includes(forkRoutes.spotify), 'in the route table');
  assert.equal(forkRoutes.spotify.auth, 'session');
});

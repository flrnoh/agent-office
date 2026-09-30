import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RADIO_STATIONS, radioSources, stationById, stationByUrl } from '../src/shared/radio.js';
import { STREAM, trackTitle } from '../src/shared/jukebox.js';
import { Jukebox } from '../src/server/jukebox.js';
import { checkHost, firstInPlaylist, isPlaylistUrl, isPrivateAddress, radioRequestShape, radioTarget } from '../src/server/radio.js';
import { guestMayFetch } from '../src/server/guests.js';

// Radio stations on the jukebox are this fork's own (see FORK.md).

test('every station has an id, a name, a genre, an emoji and an http(s) stream', () => {
  const ids = new Set<string>();
  assert.ok(RADIO_STATIONS.length >= 10);
  for (const s of RADIO_STATIONS) {
    assert.match(s.id, /^[a-z0-9-]+$/, `${s.id} is a plain id`);
    assert.ok(!ids.has(s.id), `${s.id} is listed once`);
    ids.add(s.id);
    assert.ok(s.name.trim() && s.genre.trim() && s.emoji.trim(), `${s.id} has a name, genre and emoji`);
    assert.equal(new URL(s.url).protocol, 'https:', `${s.name} streams over https`);
    assert.equal(stationById(s.id), s);
    assert.equal(stationByUrl(s.url), s);
  }
  assert.equal(stationById('nope'), undefined);
  assert.equal(stationById(42), undefined);
  assert.ok(stationById('bob'), 'Radio BOB! is in');
});

test('the jukebox tunes to a station, names it, and remembers it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jukebox-'));
  const j = new Jukebox(dir);
  assert.deepEqual(j.play({ station: 'bob' }, 'Flo'), { changed: true });
  const s = j.state();
  assert.equal(s.track, STREAM);
  assert.equal(s.station, 'bob');
  assert.equal(s.url, stationById('bob')!.url);
  assert.equal(j.title(), 'Radio BOB!');
  assert.equal(trackTitle(s), 'Radio BOB!');
  assert.equal(new Jukebox(dir).state().station, 'bob', 'still tuned in after a restart');
  assert.ok('error' in j.play({ station: 'pirate' }, 'Flo'));
  // A pasted link that is a built-in station counts as that station; any other has none.
  j.play({ url: stationById('swr3')!.url }, 'Flo');
  assert.equal(j.state().station, 'swr3');
  j.play({ url: 'https://example.com/live.mp3' }, 'Flo');
  assert.equal(j.state().station, undefined);
  j.play({ track: 'rainy-window' }, 'Flo');
  assert.equal(j.state().station, undefined);
  assert.equal(j.state().url, undefined);
});

test('the proxy streams only a built-in station or the stream on that floor right now', () => {
  const q = (s: string) => new URLSearchParams(s);
  const floors: Record<string, string> = { one: 'http://radio.example.com/live' };
  const floorStream = (id: string) => floors[id];
  assert.deepEqual(radioTarget(q('station=bob'), floorStream), { url: stationById('bob')!.url });
  assert.equal((radioTarget(q('station=nope'), floorStream) as { status: number }).status, 404);
  assert.deepEqual(radioTarget(q(`floor=one&u=${encodeURIComponent(floors.one)}`), floorStream), { url: floors.one });
  // Not what's on: any other address, a floor with no stream, or no floor at all.
  assert.equal((radioTarget(q(`floor=one&u=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`), floorStream) as { status: number }).status, 409);
  assert.equal((radioTarget(q('floor=one'), floorStream) as { status: number }).status, 409);
  assert.equal((radioTarget(q(`floor=two&u=${encodeURIComponent(floors.one)}`), floorStream) as { status: number }).status, 404);
  assert.equal((radioTarget(q(`url=${encodeURIComponent(floors.one)}`), floorStream) as { status: number }).status, 400);

  assert.equal(radioRequestShape(q('station=bob')), true);
  assert.equal(radioRequestShape(q('station=nope')), false);
  assert.equal(radioRequestShape(q('floor=one&u=x')), true);
  assert.equal(radioRequestShape(q('floor=one')), false);
  assert.equal(radioRequestShape(q('url=http://127.0.0.1/')), false);
});

test('guests may listen to the radio, under the same rules', () => {
  const url = (s: string) => new URL(s, 'http://x');
  const no = () => false;
  assert.equal(guestMayFetch('/api/radio', url('/api/radio?station=bob'), no), true);
  assert.equal(guestMayFetch('/api/radio', url('/api/radio?floor=f&u=https%3A%2F%2Fexample.com%2Fa.mp3'), no), true);
  assert.equal(guestMayFetch('/api/radio', url('/api/radio?station=nope'), no), false);
  assert.equal(guestMayFetch('/api/radio', url('/api/radio?url=http%3A%2F%2F127.0.0.1%3A4600%2F'), no), false);
});

test('private, loopback and link-local addresses are off limits', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1', '64:ff9b::a00:1', '[::1]', 'not-an-ip']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} is off limits`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '64:ff9b::808:808']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} is out on the internet`);
  }
  const dns = (map: Record<string, string[]>) => async (h: string) => {
    if (!map[h]) throw new Error('ENOTFOUND');
    return map[h];
  };
  const resolve = dns({ 'radio.example': ['93.184.216.34'], 'sneaky.example': ['93.184.216.34', '127.0.0.1'], localhost: ['127.0.0.1', '::1'] });
  assert.deepEqual(await checkHost('radio.example', resolve), { ok: true });
  assert.ok('error' in (await checkHost('sneaky.example', resolve)), 'one private address is enough to refuse');
  assert.ok('error' in (await checkHost('localhost', resolve)));
  assert.ok('error' in (await checkHost('127.0.0.1', resolve)));
  assert.ok('error' in (await checkHost('[::1]', resolve)));
  assert.ok('error' in (await checkHost('nowhere.example', resolve)));
  assert.deepEqual(await checkHost('8.8.8.8', resolve), { ok: true });
});

test('the page plays https straight from the station and http through the office', () => {
  const bob = stationById('bob')!;
  assert.deepEqual(radioSources({ url: bob.url, station: 'bob' }, 'f', true), { src: bob.url, fallback: '/api/radio?station=bob' });
  const http = 'http://radio.example.com/live';
  assert.deepEqual(radioSources({ url: http }, 'f', true), { src: `/api/radio?floor=f&u=${encodeURIComponent(http)}` });
  assert.deepEqual(radioSources({ url: http }, 'f', false), { src: http, fallback: `/api/radio?floor=f&u=${encodeURIComponent(http)}` });
  assert.deepEqual(radioSources({ url: 'https://example.com/a.mp3' }, null, true), { src: 'https://example.com/a.mp3' });
  assert.equal(radioSources({}, 'f', true), null);
});

test('playlists: the first stream they list', () => {
  assert.equal(isPlaylistUrl('https://example.com/listen.pls'), true);
  assert.equal(isPlaylistUrl('https://example.com/listen.M3U'), true);
  assert.equal(isPlaylistUrl('https://example.com/live.mp3'), false);
  assert.equal(isPlaylistUrl('https://example.com/hls.m3u8'), false);
  assert.equal(isPlaylistUrl(undefined), false);
  const pls = '[playlist]\nNumberOfEntries=2\nFile1=http://stream.example.com:8000/live\nTitle1=Live\nFile2=http://backup.example.com/live\n';
  assert.equal(firstInPlaylist(pls, 'https://example.com/listen.pls'), 'http://stream.example.com:8000/live');
  const m3u = '#EXTM3U\n#EXTINF:-1,Live\n\nhttps://stream.example.com/live.mp3\n';
  assert.equal(firstInPlaylist(m3u, 'https://example.com/listen.m3u'), 'https://stream.example.com/live.mp3');
  assert.equal(firstInPlaylist('live.mp3\n', 'https://example.com/radio/listen.m3u'), 'https://example.com/radio/live.mp3');
  assert.equal(firstInPlaylist('file:///etc/passwd\n', 'https://example.com/x.m3u'), undefined);
  assert.equal(firstInPlaylist('#EXTM3U\n', 'https://example.com/x.m3u'), undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Turn, fetchTurnIce, readTurnKey, usableIce, TURN_TTL_S } from '../src/server/turn.js';

const KEY = { keyId: 'abcdef0123456789abcdef0123456789', apiToken: 'tok_0123456789abcdef0123456789' };
const CF_ANSWER = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp', 'javascript:alert(1)'],
      username: 'u',
      credential: 'c',
    },
  ],
};

test('no key: no TURN, and the office keeps its own STUN servers', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-turn-'));
  assert.equal(readTurnKey(dir, {}), undefined);
  const t = new Turn(undefined, [{ urls: ['stun:stun.l.google.com:19302'] }]);
  assert.equal(t.enabled, false);
  assert.deepEqual(t.servers(), [{ urls: ['stun:stun.l.google.com:19302'] }]);
});

test('the key comes from turn.json or the environment, and a malformed one is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-turn-'));
  writeFileSync(path.join(dir, 'turn.json'), JSON.stringify(KEY), { mode: 0o600 });
  assert.deepEqual(readTurnKey(dir, {}), KEY);
  assert.deepEqual(readTurnKey(dir, { CF_TURN_KEY_ID: 'zzzz0000yyyy1111', CF_TURN_API_TOKEN: 'another_token_1234567' }), { keyId: 'zzzz0000yyyy1111', apiToken: 'another_token_1234567' });
  writeFileSync(path.join(dir, 'turn.json'), JSON.stringify({ keyId: 'x y', apiToken: 'short' }), { mode: 0o600 });
  assert.equal(readTurnKey(dir, {}), undefined);
});

test('only usable ICE URLs reach the browser: no port 53, nothing but stun/turn/turns', () => {
  const ice = usableIce(CF_ANSWER.iceServers);
  assert.deepEqual(ice, [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ]);
  assert.deepEqual(usableIce('nope'), []);
});

test('credentials are asked for with the key, and handed out after the office’s own servers', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => CF_ANSWER };
  };
  const t = new Turn(KEY, [{ urls: ['stun:stun.l.google.com:19302'] }], fetchFn);
  assert.equal(await t.refresh(), true);
  t.stop();
  assert.equal(calls[0].url, `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY.keyId}/credentials/generate-ice-servers`);
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, `Bearer ${KEY.apiToken}`);
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { ttl: TURN_TTL_S });
  const servers = t.servers();
  assert.equal(servers.length, 3);
  assert.ok(servers.some((s) => s.username === 'u' && s.credential === 'c'));
});

test('a failed fetch keeps voice working on STUN and is retried', async () => {
  const t = new Turn(KEY, [{ urls: ['stun:x.example:3478'] }], async () => ({ ok: false, status: 401, json: async () => ({}) }));
  assert.equal(await t.refresh(), false);
  t.stop();
  assert.deepEqual(t.servers(), [{ urls: ['stun:x.example:3478'] }]);
  await assert.rejects(fetchTurnIce(KEY, async () => ({ ok: true, status: 201, json: async () => ({ iceServers: [{ urls: 'stun:only.example:3478' }] }) })), /no TURN/);
});

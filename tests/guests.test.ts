import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUEST_MSGS, GUEST_QUIET, TEAM_ONLY_MSGS, guestMayFetch } from '../src/server/guests.js';

// The guest role is this fork's own (see FORK.md). These tests make an upstream update stop and ask
// before guests get anything new.

test('every message is sorted into exactly one list', () => {
  for (const t of GUEST_MSGS) {
    assert.ok(!TEAM_ONLY_MSGS.has(t), `${t} is both a guest's and the team's only`);
    assert.ok(!GUEST_QUIET.has(t), `${t} is both allowed and quietly dropped`);
  }
  for (const t of GUEST_QUIET) assert.ok(!TEAM_ONLY_MSGS.has(t), `${t} is both quietly dropped and refused`);
});

test('guests never get the keyboard, hiring, GitHub or accounts', () => {
  for (const t of ['term.input', 'worker.prompt', 'worker.spawn', 'worker.kill', 'station.prompt', 'queue.add', 'meeting.start', 'gh.merge', 'changes.commit', 'accounts.invite', 'accounts.role', 'signins.start', 'upgrade.start']) {
    assert.ok(!GUEST_MSGS.has(t), `guests must not send ${t}`);
  }
});

test('guests fetch only the page, whiteboard pictures and pictures on a wall', () => {
  const url = (s: string) => new URL(s, 'http://x');
  const onAWall = (u: string) => u === 'https://example.com/cat.png';
  assert.equal(guestMayFetch('/', url('/'), onAWall), true);
  assert.equal(guestMayFetch('/assets/main.js', url('/assets/main.js'), onAWall), true);
  assert.equal(guestMayFetch('/api/whiteboard/file', url('/api/whiteboard/file?id=1'), onAWall), true);
  assert.equal(guestMayFetch('/api/image', url(`/api/image?url=${encodeURIComponent('https://example.com/cat.png')}`), onAWall), true);
  assert.equal(guestMayFetch('/api/image', url(`/api/image?url=${encodeURIComponent('http://127.0.0.1:4600/api/health')}`), onAWall), false);
  for (const p of ['/api/docs', '/api/search', '/api/term/drop', '/api/changes/file', '/api/gh/pull', '/api/whoever-comes-next']) {
    assert.equal(guestMayFetch(p, url(p), onAWall), false, `${p} is refused to guests`);
  }
});

/**
 * The /api routes someone has looked at for guests. Anything new is refused to guests anyway, but it
 * may be something their page needs to draw the office: look, then add it here (and to
 * guestMayFetch if guests need it).
 */
const REVIEWED_API = [
  '/api/*', '/api/agents/grok/models', '/api/agents/opencode/models', '/api/changes/file', '/api/claim', '/api/docs', '/api/docs*',
  '/api/docs/file', '/api/docs/picture', '/api/gh/*', '/api/gh/issue', '/api/gh/labels', '/api/gh/pull', '/api/gh/pull/diff',
  '/api/health', '/api/image', '/api/join', '/api/link', '/api/login', '/api/logout', '/api/search', '/api/term/drop',
  '/api/whiteboard/file', '/api/whoami',
];

test('no /api route has been added upstream without a look at what guests need', () => {
  const server = readFileSync(new URL('../src/server/server.ts', import.meta.url), 'utf8');
  const routes = new Set(
    [...server.matchAll(/p === '(\/api\/[^']*)'|p\.startsWith\('(\/api\/[^']*)'\)/g)].map((m) => m[1] ?? `${m[2]}*`),
  );
  const unreviewed = [...routes].filter((r) => !REVIEWED_API.includes(r));
  assert.deepEqual(unreviewed, [], `new /api routes to review for guests (tests/guests.test.ts): ${unreviewed.join(', ')}`);
});

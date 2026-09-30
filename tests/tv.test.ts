import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hms, parseStart } from '../src/shared/embeds.js';
import { parseTvUrl, sameTvStream, tvTitle, type TvStream } from '../src/shared/tv.js';
import { CHANGE_EVERY } from '../src/server/embeds.js';
import { OfficeTv, tvMessage } from '../src/server/tv.js';
import { applyQuad, lineBlocked, quadMatrix } from '../src/client/tvquad.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const ok = (raw: string): TvStream => {
  const r = parseTvUrl(raw);
  assert.ok(!('error' in r), `${raw}: ${'error' in r ? r.error : ''}`);
  return r as TvStream;
};
const refused = (raw: unknown): string => {
  const r = parseTvUrl(raw);
  assert.ok('error' in r, `${String(raw)} should be refused`);
  return r.error;
};

test('YouTube links: every way of writing one video, and where to begin', () => {
  for (const raw of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
  ]) {
    const s = ok(raw);
    assert.equal(s.kind, 'youtube');
    assert.equal(s.id, 'dQw4w9WgXcQ');
    assert.equal(s.start, 0);
    assert.equal(s.live, undefined);
  }
  assert.equal(ok('https://youtu.be/dQw4w9WgXcQ?t=90').start, 90);
  assert.equal(ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s').start, 3723);
  assert.equal(ok('https://www.youtube.com/embed/dQw4w9WgXcQ?start=42').start, 42);
  assert.equal(ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=1:30').start, 90);
  assert.equal(ok('https://youtu.be/dQw4w9WgXcQ?t=90').url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
  assert.match(refused('https://www.youtube.com/playlist?list=PL123'), /one YouTube video/);
  assert.match(refused('https://www.youtube.com/@somebody'), /one YouTube video/);
});

test('Twitch links: a channel plays live, a past broadcast from its t=', () => {
  for (const raw of ['https://www.twitch.tv/Monstercat', 'twitch.tv/monstercat', 'https://m.twitch.tv/monstercat/', 'https://player.twitch.tv/?channel=monstercat&parent=example.com']) {
    const s = ok(raw);
    assert.deepEqual({ kind: s.kind, id: s.id, live: s.live, start: s.start }, { kind: 'twitch', id: 'monstercat', live: true, start: 0 });
    assert.equal(s.url, 'https://www.twitch.tv/monstercat');
  }
  for (const raw of ['https://www.twitch.tv/videos/2245678901', 'https://www.twitch.tv/monstercat/video/2245678901', 'https://player.twitch.tv/?video=v2245678901&parent=x.com']) {
    const s = ok(raw);
    assert.equal(s.kind, 'twitch');
    assert.equal(s.id, '2245678901');
    assert.equal(s.live, undefined);
  }
  const vod = ok('https://www.twitch.tv/videos/2245678901?t=1h2m3s');
  assert.equal(vod.start, 3723);
  assert.equal(vod.url, 'https://www.twitch.tv/videos/2245678901?t=1h2m3s');
  assert.equal(ok('https://www.twitch.tv/videos/2245678901?t=02h00m10s').start, 7210);
  // Twitch's own pages, lists and clips aren't something to put on.
  for (const raw of ['https://www.twitch.tv/directory', 'https://www.twitch.tv/videos', 'https://www.twitch.tv/monstercat/videos', 'https://www.twitch.tv/settings', 'https://www.twitch.tv/', 'https://www.twitch.tv/a', 'https://www.twitch.tv/videos/abc']) refused(raw);
  assert.match(refused('https://clips.twitch.tv/SomeClipSlug'), /clips/);
  assert.match(refused('https://www.twitch.tv/monstercat/clip/SomeClipSlug'), /clips/);
});

test('anything else is refused: other sites, lookalike hosts, other schemes, odd links', () => {
  for (const raw of [
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be.evil.com/dQw4w9WgXcQ',
    'https://twitch.tv.evil.com/monstercat',
    'https://eviltwitch.tv/monstercat',
    'https://www.twitch.tv.example/monstercat',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'https://user:pw@www.twitch.tv/monstercat',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://soundcloud.com/forss/flickermood',
    '',
    42,
    null,
    `https://www.twitch.tv/${'a'.repeat(3000)}`,
  ])
    refused(raw);
  assert.match(refused('https://vimeo.com/1'), /only plays YouTube and Twitch/);
  assert.match(refused('ftp://youtube.com/x'), /Only web links play on the TV/);
});

test('t= in all its spellings, and back', () => {
  assert.equal(parseStart('90'), 90);
  assert.equal(parseStart('90s'), 90);
  assert.equal(parseStart('1h2m3s'), 3723);
  assert.equal(parseStart('2m'), 120);
  assert.equal(parseStart('1:02:03'), 3723);
  assert.equal(parseStart('soon'), undefined);
  assert.equal(parseStart(''), undefined);
  assert.equal(hms(3723), '1h2m3s');
  assert.equal(hms(65), '1m5s');
  assert.equal(hms(7), '7s');
  assert.equal(hms(3600), '1h0m0s');
});

test('titles and repeats', () => {
  const live = ok('https://twitch.tv/monstercat');
  assert.equal(tvTitle(live), 'monstercat live on Twitch');
  assert.equal(tvTitle(ok('https://www.twitch.tv/videos/1')), 'a Twitch video');
  assert.equal(tvTitle({ ...live, title: 'Late show' }), 'Late show');
  assert.ok(sameTvStream(ok('https://youtu.be/dQw4w9WgXcQ'), ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ')));
  assert.ok(!sameTvStream(ok('https://youtu.be/dQw4w9WgXcQ'), ok('https://youtu.be/dQw4w9WgXcQ?t=5')));
  assert.ok(!sameTvStream(null, live));
});

const tmp = () => mkdtempSync(path.join(tmpdir(), 'agent-office-tv-'));

test('the TV plays, keeps a repeat going, stops and remembers, in tv.json', async () => {
  const dir = tmp();
  try {
    const tv = new OfficeTv(dir, async () => 'Never Gonna Give You Up');
    assert.equal(tv.state().set, null);
    const r = tv.play('https://youtu.be/dQw4w9WgXcQ?t=30', 'Ann');
    assert.ok('changed' in r && r.changed);
    const started = tv.state().startedAt;
    await (r as { titled: Promise<void> }).titled;
    assert.equal(tv.state().set?.title, 'Never Gonna Give You Up');
    assert.equal(tv.state().set?.start, 30);
    assert.equal(tv.state().by, 'Ann');
    assert.deepEqual(tv.play('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'Bob'), { changed: false });
    assert.equal(tv.state().startedAt, started);
    assert.ok('error' in tv.play('https://evil.com/x', 'Bob'));

    const saved = JSON.parse(readFileSync(path.join(dir, 'tv.json'), 'utf8'));
    assert.equal(saved.set.id, 'dQw4w9WgXcQ');
    const again = new OfficeTv(dir, async () => undefined);
    assert.equal(again.state().set?.title, 'Never Gonna Give You Up');
    assert.equal(again.state().startedAt, started);

    // A Twitch channel after it: live, nothing to seek.
    tv.play('https://www.twitch.tv/monstercat', 'Cat');
    assert.equal(new OfficeTv(dir).state().set?.live, true);

    assert.equal(tv.stop('Dan'), true);
    assert.equal(tv.stop('Dan'), false);
    assert.equal(tv.state().by, 'Dan');
    assert.equal(new OfficeTv(dir).state().set, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hand-edited tv.json only brings back links the TV would take', () => {
  const dir = tmp();
  try {
    writeFileSync(path.join(dir, 'tv.json'), JSON.stringify({ set: { kind: 'twitch', id: 'x"><img>', url: 'javascript:alert(1)' }, by: 'Eve', startedAt: 5 }));
    assert.equal(new OfficeTv(dir).state().set, null);
    writeFileSync(path.join(dir, 'tv.json'), '{ broken');
    assert.equal(new OfficeTv(dir).state().set, null);
    writeFileSync(path.join(dir, 'tv.json'), JSON.stringify({ set: { kind: 'youtube', id: 'evil', url: 'https://www.twitch.tv/monstercat' }, startedAt: 5 }));
    const s = new OfficeTv(dir).state().set;
    assert.equal(s?.kind, 'twitch');
    assert.equal(s?.id, 'monstercat');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tv.play and tv.stop: on a floor of the office, not too often, told to everyone on the floor', async () => {
  const dir = tmp();
  try {
    const tv = new OfficeTv(dir, async (s) => (s.kind === 'youtube' ? 'A Video' : undefined));
    const sent: ServerMsg[] = [];
    const warned: string[] = [];
    const hooks = (id: string, office = true) => ({ id, who: id, office, toFloor: (m: ServerMsg) => sent.push(m), warn: (t: string) => warned.push(t) });

    tvMessage(undefined, { t: 'tv.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, hooks('roof'));
    assert.match(warned.pop()!, /floor/);
    tvMessage(tv, { t: 'tv.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, hooks('castle', false));
    assert.equal(tv.state().set, null);
    assert.match(warned.pop()!, /office/);

    tvMessage(tv, { t: 'tv.play', url: 'https://evil.com/' }, hooks('ann'));
    assert.equal(tv.state().set, null);
    assert.match(warned.pop()!, /YouTube and Twitch/);

    tvMessage(tv, { t: 'tv.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, hooks('ann'));
    assert.equal(tv.state().set?.id, 'dQw4w9WgXcQ');
    assert.equal(sent[0].t, 'tv');
    await new Promise((r) => setTimeout(r, 10));
    const toast = sent.find((m) => m.t === 'toast');
    assert.ok(toast && toast.t === 'toast' && toast.text === '📺 ann put on A Video', JSON.stringify(toast));

    // The same again: already on, and it doesn't use up a turn.
    tvMessage(tv, { t: 'tv.play', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, hooks('bob'));
    assert.match(warned.pop()!, /already/);
    // Straight away again: too soon.
    tvMessage(tv, { t: 'tv.play', url: 'https://twitch.tv/monstercat' }, hooks('ann'));
    assert.equal(tv.state().set?.id, 'dQw4w9WgXcQ');
    assert.match(warned.pop()!, /moment/);
    // Someone else may.
    tvMessage(tv, { t: 'tv.play', url: 'https://twitch.tv/monstercat' }, hooks('bob'));
    assert.equal(tv.state().set?.id, 'monstercat');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(sent.some((m) => m.t === 'toast' && m.text === '📺 bob put on monstercat live on Twitch'));
    tvMessage(tv, { t: 'tv.stop' }, hooks('cat'));
    assert.equal(tv.state().set, null);
    assert.ok(sent.some((m) => m.t === 'toast' && m.text === '📺 cat turned the TV off'));
    // Nothing on: stopping it again says nothing and uses up nothing.
    const before = sent.length;
    tvMessage(tv, { t: 'tv.stop' }, hooks('dan'));
    assert.equal(sent.length, before);
    assert.ok(tv.allow('dan'));
    assert.ok(tv.allow('ann', Date.now() + CHANGE_EVERY + 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the player is bent onto the TV: each corner of the box lands on its corner of the screen', () => {
  const quad = [[100, 50], [700, 90], [680, 420], [120, 380]] as const;
  const m = quadMatrix(1280, 720, quad);
  assert.ok(m);
  const corners = [[0, 0], [1280, 0], [1280, 720], [0, 720]] as const;
  corners.forEach(([x, y], i) => {
    const [X, Y] = applyQuad(m, x, y);
    assert.ok(Math.abs(X - quad[i][0]) < 1e-3 && Math.abs(Y - quad[i][1]) < 1e-3, `corner ${i}: ${X},${Y}`);
  });
  // A plain rectangle is just a scale and a move.
  const flat = quadMatrix(1280, 720, [[10, 20], [650, 20], [650, 380], [10, 380]])!;
  assert.deepEqual(applyQuad(flat, 640, 360).map((v) => Math.round(v)), [330, 200]);
  // Edge-on: nothing to lay out.
  assert.equal(quadMatrix(1280, 720, [[0, 0], [0, 0], [0, 0], [0, 0]]), null);
});

test('a wall between you and the TV hides the player; fences and things beside the line do not', () => {
  const wall = { minX: 4, maxX: 4.3, minZ: -10, maxZ: 10, top: 3 };
  const eye = { x: 0, y: 1.6, z: 0 };
  const tv = { x: 10, y: 2.2, z: 0 };
  assert.equal(lineBlocked([wall], eye, tv), true);
  assert.equal(lineBlocked([{ ...wall, fence: true }], eye, tv), false);
  assert.equal(lineBlocked([{ ...wall, top: 1 }], eye, tv), false);
  assert.equal(lineBlocked([{ ...wall, minZ: 2, maxZ: 5 }], eye, tv), false);
  assert.equal(lineBlocked([{ ...wall, minX: 12, maxX: 13 }], eye, tv), false);
  assert.equal(lineBlocked([], eye, tv), false);
});

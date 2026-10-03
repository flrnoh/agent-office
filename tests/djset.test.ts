import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { djSetSeekable, parseDjSetUrl, parseStart, sameDjSet, djSetTitle, seekSpot, setClock, type DjSet } from '../src/shared/djset.js';
import { DJ_CHANGE_EVERY, DjBooth, djMessage } from '../src/server/djset.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const ok = (raw: string): DjSet => {
  const r = parseDjSetUrl(raw);
  assert.ok(!('error' in r), `${raw}: ${'error' in r ? r.error : ''}`);
  return r as DjSet;
};
const refused = (raw: unknown) => {
  const r = parseDjSetUrl(raw);
  assert.ok('error' in r, `${String(raw)} should be refused`);
  return r.error;
};

test('YouTube: watch, youtu.be, live, shorts, music and mobile links, with t=', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&feature=share`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/live/${id}?feature=shared`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `http://www.youtube.com/watch?v=${id}`,
    `www.youtube.com/watch?v=${id}`,
    `  https://WWW.YOUTUBE.COM/watch?v=${id}  `,
  ]) {
    const s = ok(u);
    assert.equal(s.kind, 'youtube');
    assert.equal(s.id, id);
    assert.equal(s.start, 0);
    assert.equal(s.url, `https://www.youtube.com/watch?v=${id}`);
  }
  assert.equal(ok(`https://youtu.be/${id}?t=90`).start, 90);
  assert.equal(ok(`https://www.youtube.com/watch?v=${id}&t=1h2m3s`).start, 3723);
  assert.equal(ok(`https://www.youtube.com/watch?v=${id}&t=125s`).start, 125);
  assert.equal(ok(`https://www.youtube.com/watch?v=${id}#t=2m`).start, 120);
  assert.equal(ok(`https://www.youtube.com/watch?v=${id}&t=90`).url, `https://www.youtube.com/watch?v=${id}&t=90s`);
});

test('YouTube links that are not one video are refused', () => {
  refused('https://www.youtube.com/playlist?list=PL123');
  refused('https://www.youtube.com/@somechannel');
  refused('https://www.youtube.com/watch?v=short');
  refused('https://youtu.be/');
  refused('https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>');
});

test('SoundCloud tracks, sets and short links', () => {
  const t = ok('https://soundcloud.com/forss/flickermood');
  assert.deepEqual([t.kind, t.id, t.url, t.start], ['soundcloud', 'https://soundcloud.com/forss/flickermood', 'https://soundcloud.com/forss/flickermood', 0]);
  const set = ok('https://m.soundcloud.com/some-dj/sets/summer-mix-2026?si=x&utm_source=clipboard');
  assert.equal(set.id, 'https://soundcloud.com/some-dj/sets/summer-mix-2026');
  assert.equal(ok('https://soundcloud.com/forss/flickermood#t=1:30').start, 90);
  const short = ok('https://on.soundcloud.com/AbC123xyz');
  assert.equal(short.id, 'https://on.soundcloud.com/AbC123xyz');
  refused('https://soundcloud.com/forss');
  refused('https://soundcloud.com/forss/tracks');
  refused('https://soundcloud.com/discover/sets');
  refused('https://soundcloud.com/forss/sets');
  refused('https://soundcloud.com/a/b/c');
});

test('Mixcloud shows', () => {
  const m = ok('https://www.mixcloud.com/spartacus/party-time/');
  assert.deepEqual([m.kind, m.id, m.url], ['mixcloud', '/spartacus/party-time/', 'https://www.mixcloud.com/spartacus/party-time/']);
  assert.equal(ok('mixcloud.com/some_dj/deep-house-sessions-12').id, '/some_dj/deep-house-sessions-12/');
  assert.equal(ok('https://m.mixcloud.com/Caf%C3%A9DJ/nuit/').id, '/Caf%C3%A9DJ/nuit/');
  refused('https://www.mixcloud.com/spartacus/');
  refused('https://www.mixcloud.com/live/spartacus/');
  refused('https://www.mixcloud.com/discover/house/');
});

test('other sites, lookalikes and other schemes are refused', () => {
  for (const u of [
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be.evil.com/dQw4w9WgXcQ',
    'https://evil.com/?https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com@evil.com/watch?v=dQw4w9WgXcQ',
    'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://soundcloud.com.evil.com/a/b',
    'https://mixcloud.co/a/b/',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'javascript:alert(1)',
    'JavaScript:alert(document.cookie)//youtube.com/watch?v=dQw4w9WgXcQ',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
    'not a link at all',
    '',
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${'a'.repeat(3000)}`,
  ]) refused(u);
  refused(undefined);
  refused(42);
  refused({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.match(refused('https://example.com/set.mp3'), /YouTube, SoundCloud and Mixcloud/);
});

test('start times', () => {
  assert.equal(parseStart('90'), 90);
  assert.equal(parseStart('90s'), 90);
  assert.equal(parseStart('1:02:03'), 3723);
  assert.equal(parseStart('4:05'), 245);
  assert.equal(parseStart('1h'), 3600);
  assert.equal(parseStart('abc'), undefined);
  assert.equal(parseStart(''), undefined);
  assert.equal(parseStart('999999999'), undefined);
});

test('same set, and its title', () => {
  const a = ok('https://youtu.be/dQw4w9WgXcQ');
  assert.ok(sameDjSet(a, ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=zzz')));
  assert.ok(!sameDjSet(a, ok('https://youtu.be/dQw4w9WgXcQ?t=60')));
  assert.ok(!sameDjSet(a, null));
  assert.equal(djSetTitle(a), 'a YouTube set');
  assert.equal(djSetTitle({ ...a, title: 'Boiler Room' }), 'Boiler Room');
});

const tmp = () => mkdtempSync(path.join(tmpdir(), 'agent-office-dj-'));

test('the booth plays, keeps a repeat going, stops and remembers', async () => {
  const dir = tmp();
  try {
    const booth = new DjBooth(dir, async () => 'Boiler Room: Somebody');
    assert.equal(booth.state().set, null);
    const r = booth.play('https://youtu.be/dQw4w9WgXcQ', 'Ann');
    assert.ok('changed' in r && r.changed);
    const started = booth.state().startedAt;
    await (r as { titled: Promise<void> }).titled;
    assert.equal(booth.state().set?.title, 'Boiler Room: Somebody');
    assert.equal(booth.state().by, 'Ann');

    // The same set again plays on, from where it is.
    assert.deepEqual(booth.play('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Bob'), { changed: false });
    assert.equal(booth.state().startedAt, started);
    assert.equal(booth.state().by, 'Ann');
    assert.ok('error' in booth.play('https://evil.com/x', 'Bob'));

    const saved = JSON.parse(readFileSync(path.join(dir, 'dj.json'), 'utf8'));
    assert.equal(saved.set.id, 'dQw4w9WgXcQ');
    const again = new DjBooth(dir, async () => undefined);
    assert.equal(again.state().set?.id, 'dQw4w9WgXcQ');
    assert.equal(again.state().set?.title, 'Boiler Room: Somebody');
    assert.equal(again.state().startedAt, started);

    assert.equal(booth.stop('Cat'), true);
    assert.equal(booth.stop('Cat'), false);
    assert.equal(booth.state().set, null);
    assert.equal(booth.state().by, 'Cat');
    assert.equal(new DjBooth(dir).state().set, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a title that comes back after another set went on is dropped', async () => {
  const dir = tmp();
  try {
    let answer!: (t: string) => void;
    const booth = new DjBooth(dir, () => new Promise((resolve) => (answer = resolve)));
    const first = booth.play('https://youtu.be/dQw4w9WgXcQ', 'Ann') as { titled: Promise<void> };
    const firstAnswer = answer;
    booth.play('https://soundcloud.com/forss/flickermood', 'Bob');
    firstAnswer('Old title');
    await first.titled;
    assert.equal(booth.state().set?.kind, 'soundcloud');
    assert.equal(booth.state().set?.title, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a hand-edited dj.json only brings back links the booth would take', () => {
  const dir = tmp();
  try {
    writeFileSync(path.join(dir, 'dj.json'), JSON.stringify({ set: { kind: 'youtube', id: 'x"><img>', url: 'javascript:alert(1)' }, by: 'Eve', startedAt: 5 }));
    assert.equal(new DjBooth(dir).state().set, null);
    writeFileSync(path.join(dir, 'dj.json'), '{ broken');
    assert.equal(new DjBooth(dir).state().set, null);
    writeFileSync(path.join(dir, 'dj.json'), JSON.stringify({ set: { kind: 'youtube', id: 'evil', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'T' }, startedAt: 5 }));
    assert.equal(new DjBooth(dir).state().set?.id, 'dQw4w9WgXcQ');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dj.play and dj.stop: only from the roof, not too often, told to everyone up there', async () => {
  const dir = tmp();
  try {
    const booth = new DjBooth(dir, async () => 'A Set');
    const sent: ServerMsg[] = [];
    const warned: string[] = [];
    const hooks = (id: string, onRoof: boolean) => ({ id, who: id, onRoof, toRoof: (m: ServerMsg) => sent.push(m), warn: (t: string) => warned.push(t) });

    djMessage(booth, { t: 'dj.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, hooks('downstairs', false));
    assert.equal(booth.state().set, null);
    assert.match(warned.pop()!, /roof/);

    djMessage(booth, { t: 'dj.play', url: 'https://evil.com/' }, hooks('ann', true));
    assert.equal(booth.state().set, null);
    assert.match(warned.pop()!, /YouTube/);

    djMessage(booth, { t: 'dj.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, hooks('ann', true));
    assert.equal(booth.state().set?.id, 'dQw4w9WgXcQ');
    assert.equal(sent[0].t, 'dj');
    await new Promise((r) => setTimeout(r, 10));
    const toast = sent.find((m) => m.t === 'toast');
    assert.ok(toast && toast.t === 'toast' && toast.text === '🎧 ann put on a set: A Set');

    // Straight away again: too soon.
    djMessage(booth, { t: 'dj.stop' }, hooks('ann', true));
    assert.ok(booth.state().set);
    assert.match(warned.pop()!, /moment/);
    // Someone else may.
    djMessage(booth, { t: 'dj.stop' }, hooks('bob', true));
    assert.equal(booth.state().set, null);
    assert.ok(booth.allow('ann', Date.now() + DJ_CHANGE_EVERY + 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pasting the set that is already on neither restarts it nor uses up your turn', () => {
  const dir = tmp();
  try {
    const booth = new DjBooth(dir, async () => undefined);
    const warned: string[] = [];
    const c = { id: 'ann', who: 'Ann', onRoof: true, toRoof: () => {}, warn: (t: string) => warned.push(t) };
    djMessage(booth, { t: 'dj.play', url: 'https://youtu.be/dQw4w9WgXcQ' }, { ...c, id: 'bob' });
    const started = booth.state().startedAt;
    djMessage(booth, { t: 'dj.play', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, c);
    assert.deepEqual(warned, ['That set is already on']);
    assert.equal(booth.state().startedAt, started);
    djMessage(booth, { t: 'dj.stop' }, c);
    assert.equal(booth.state().set, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dj.seek: skips the set for everyone on the roof, from its link\'s start on; not a SoundCloud set, not from downstairs', () => {
  const dir = tmp();
  try {
    const booth = new DjBooth(dir, async () => undefined);
    const sent: ServerMsg[] = [];
    const warned: string[] = [];
    const c = (id: string, onRoof = true) => ({ id, who: id, onRoof, toRoof: (m: ServerMsg) => sent.push(m), warn: (t: string) => warned.push(t) });
    djMessage(booth, { t: 'dj.seek', at: 60 }, c('ann'));
    assert.match(warned.pop()!, /first/, 'nothing on yet');
    djMessage(booth, { t: 'dj.play', url: 'https://youtu.be/dQw4w9WgXcQ?t=30' }, c('ann'));
    const before = booth.state().startedAt;
    djMessage(booth, { t: 'dj.seek', at: 600 }, c('bob', false));
    assert.match(warned.pop()!, /roof/);
    assert.equal(booth.state().startedAt, before, 'not from downstairs');

    sent.length = 0;
    djMessage(booth, { t: 'dj.seek', at: 630 }, c('bob'));
    const s = booth.state();
    const at = 30 + (Date.now() - s.startedAt) / 1000;
    assert.ok(Math.abs(at - 630) < 1, `everyone is at 10:30 now, not ${at}`);
    assert.equal(s.by, 'ann', 'still the set ann put on');
    assert.equal(sent[0].t, 'dj');
    assert.ok(sent.some((m) => m.t === 'toast' && /bob skipped the set to 10:30/.test(m.text)));
    // Saved: the office comes back to the same spot after a restart.
    assert.equal(new DjBooth(dir, async () => undefined).state().startedAt, s.startedAt);

    // Not before where the link starts it, and nothing silly.
    djMessage(booth, { t: 'dj.seek', at: 0 }, c('cid'));
    assert.ok(Math.abs(booth.state().startedAt - Date.now()) < 50, 'back to the link\'s start');
    for (const bad of [-5, Number.NaN, 1e9, '60' as unknown as number]) {
      const was = booth.state().startedAt;
      djMessage(booth, { t: 'dj.seek', at: bad }, c(`x${String(bad)}`));
      assert.equal(booth.state().startedAt, was, String(bad));
    }
    // Clicks in quick succession go through, a flood doesn't.
    djMessage(booth, { t: 'dj.seek', at: 100 }, c('dan'));
    djMessage(booth, { t: 'dj.seek', at: 200 }, c('dan'));
    assert.ok(Math.abs(30 + (Date.now() - booth.state().startedAt) / 1000 - 100) < 1, 'the second, straight after, waits');

    djMessage(booth, { t: 'dj.play', url: 'https://soundcloud.com/someone/sets/a-night' }, c('eve'));
    djMessage(booth, { t: 'dj.seek', at: 300 }, c('eve2'));
    assert.match(warned.pop()!, /SoundCloud set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a spot in a set: whole seconds, up to twelve hours; its clock; which sets can be skipped', () => {
  assert.equal(seekSpot(61.4), 61);
  assert.equal(seekSpot(-1), null);
  assert.equal(seekSpot(13 * 3600), null);
  assert.equal(seekSpot('5'), null);
  assert.equal(setClock(65), '1:05');
  assert.equal(setClock(3729), '1:02:09');
  assert.equal(setClock(-3), '0:00');
  assert.ok(djSetSeekable(ok('https://youtu.be/dQw4w9WgXcQ')));
  assert.ok(djSetSeekable(ok('https://soundcloud.com/someone/a-track')));
  assert.ok(!djSetSeekable(ok('https://soundcloud.com/someone/sets/a-night')));
  assert.ok(djSetSeekable(ok('https://www.mixcloud.com/someone/a-show/')));
});

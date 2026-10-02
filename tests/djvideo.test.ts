// flrnoh fork (see FORK.md "The set's video on the LED wall"): the YouTube set's video, fetched after
// its beats, kept a few at a time, handed out in pieces, and on the LED wall now and then.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { DjBooth } from '../src/server/djset.js';
import { DjVideoJobs, KEEP_VIDEOS, type FetchVideo } from '../src/server/djvideo/index.js';
import { VIDEO_FORMAT } from '../src/server/djvideo/fetch.js';
import { parseRange, serveVideo } from '../src/server/djvideo/serve.js';
import { BeatsError } from '../src/server/djbeats/fetch.js';
import { guestMayFetch } from '../src/server/guests.js';
import { roleMayFetch } from '../src/server/party.js';
import { videoTurn } from '../src/client/features/rooftop/videoturn.js';
import type { DjSet } from '../src/shared/djset.js';
import type { DjBeats } from '../src/shared/djbeats.js';

const later = () => new Promise((r) => setTimeout(r, 5));
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ao-djvideo-'));

function beatsOf(url: string): DjBeats {
  const bytes = Buffer.from(new Uint8Array(8).fill(100)).toString('base64');
  return { v: 1, url, duration: 30, bpm: 120, beats: [500, 500, 500, 500, 500, 500, 500, 500], downbeat: 0, kick: bytes, hi: bytes, energy: bytes, sections: [[0, 0]] };
}

/** A stand-in for yt-dlp: writes a few bytes where fetch.ts would, when let go. */
function fakeFetch() {
  const asked: string[] = [];
  const stopped: string[] = [];
  const waiting = new Map<string, () => void>();
  const fetch: FetchVideo = (set, dir, name, signal) => {
    asked.push(set.url);
    signal.addEventListener('abort', () => stopped.push(set.url));
    return new Promise((resolve) =>
      waiting.set(set.url, () => {
        const f = path.join(dir, `${name}.dl.mp4`);
        writeFileSync(f, `video of ${set.url}`);
        resolve(f);
      }),
    );
  };
  return { fetch, asked, stopped, release: (url: string) => waiting.get(url)!() };
}

test("the booth fetches a YouTube set's video after its beats, never alongside, and lets go of it for another", async () => {
  const dir = tmp();
  try {
    let hearIt: (() => void) | null = null;
    const hear = (set: DjSet) => new Promise<DjBeats>((resolve) => (hearIt = () => resolve(beatsOf(set.url))));
    const v = fakeFetch();
    const booth = new DjBooth(dir, async () => undefined, hear, v.fetch);
    let told = 0;
    booth.onBeats = () => told++;
    booth.play('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'Flo');
    const url = booth.state().set!.url;
    // Coming, but not yet: the beats first.
    assert.deepEqual(booth.state().video, { status: 'pending' });
    assert.deepEqual(v.asked, []);
    assert.equal(booth.videoFile(), null);
    hearIt!();
    await later();
    assert.deepEqual(v.asked, [url]);
    v.release(url);
    await later();
    const state = booth.state().video;
    assert.equal(state?.status, 'ready');
    assert.equal(state?.key, DjVideoJobs.key(url));
    const file = booth.videoFile()!;
    assert.equal(path.dirname(file), path.join(dir, 'dj-video'));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(path.join(dir, 'dj-video')), [path.basename(file)]);
    assert.ok(told >= 3);

    // Another set while its video is being fetched: that one's let go of, and what it fetched is thrown away.
    booth.play('https://www.youtube.com/watch?v=bbbbbbbbbbb', 'Flo');
    hearIt!();
    await later();
    const b = booth.state().set!.url;
    assert.deepEqual(v.asked, [url, b]);
    booth.play('https://www.youtube.com/watch?v=ccccccccccc', 'Flo');
    assert.deepEqual(v.stopped, [b]);
    v.release(b);
    await later();
    assert.equal(existsSync(path.join(dir, 'dj-video', `${DjVideoJobs.key(b)}.mp4`)), false);

    // The first one again: ready at once, from what was kept, and not fetched again.
    booth.play('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'Flo');
    assert.equal(booth.state().video?.status, 'ready');
    assert.equal(v.asked.filter((u) => u === url).length, 1);
    booth.stop('Flo');
    assert.equal(booth.state().video, undefined);
    assert.equal(booth.videoFile(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SoundCloud and Mixcloud sets have no video, and the house DJ none either', async () => {
  const dir = tmp();
  try {
    const v = fakeFetch();
    const booth = new DjBooth(dir, async () => undefined, async (set) => beatsOf(set.url), v.fetch);
    assert.equal(booth.state().video, undefined);
    booth.play('https://soundcloud.com/someone/a-set', 'Flo');
    await later();
    booth.play('https://www.mixcloud.com/someone/a-show/', 'Flo');
    await later();
    assert.equal(booth.state().video, undefined);
    assert.equal(booth.videoFile(), null);
    assert.deepEqual(v.asked, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a video that can't be fetched says why, and isn't tried again and again", async () => {
  const dir = tmp();
  try {
    let tries = 0;
    const booth = new DjBooth(dir, async () => undefined, async (set) => beatsOf(set.url), async () => {
      tries++;
      throw new BeatsError('YouTube has no small H.264 copy of it');
    });
    booth.play('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'Flo');
    await later();
    assert.deepEqual(booth.state().video, { status: 'failed', why: 'YouTube has no small H.264 copy of it' });
    booth.play('https://www.youtube.com/watch?v=bbbbbbbbbbb', 'Flo');
    await later();
    booth.play('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'Flo');
    await later();
    assert.equal(booth.state().video?.status, 'failed');
    assert.equal(tries, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('only the last few videos are kept, the one put on again counting as new', async () => {
  const dir = tmp();
  try {
    const v = fakeFetch();
    const jobs = new DjVideoJobs(dir, () => {}, v.fetch);
    const yt = (id: string): DjSet => ({ kind: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, start: 0 });
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'];
    let t = Date.now() / 1000 - 1000;
    for (const id of ids) {
      jobs.want(yt(id), true);
      v.release(yt(id).url);
      await later();
      // Each older than the next.
      utimesSync(jobs.fileOf(yt(id).url)!, t, t);
      t += 10;
    }
    // The first one again: kept, and now the newest.
    jobs.want(yt(ids[0]), true);
    jobs.want(yt('ddddddddddd'), true);
    v.release(yt('ddddddddddd').url);
    await later();
    const kept = readdirSync(jobs.dir).sort();
    assert.equal(kept.length, KEEP_VIDEOS);
    assert.deepEqual(kept, [ids[0], ids[2], 'ddddddddddd'].map((id) => `${DjVideoJobs.key(yt(id).url)}.mp4`).sort());
    assert.equal(jobs.statusOf(yt(ids[1]).url), undefined);
    // A fetch cut short by a restart leaves nothing behind.
    writeFileSync(path.join(jobs.dir, 'x.dl.mp4.part'), 'half');
    new DjVideoJobs(dir, () => {});
    assert.equal(existsSync(path.join(jobs.dir, 'x.dl.mp4.part')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('yt-dlp is asked for small H.264 MP4 only, as one file', () => {
  for (const part of VIDEO_FORMAT.split('/')) {
    assert.match(part, /^bv\*\[height<=(144|240|360)\]\[vcodec\^=avc1\]\[ext=mp4\]\[protocol=https\]$/);
  }
  assert.ok(VIDEO_FORMAT.startsWith('bv*[height<=144]'));
});

test('Range headers: a piece, from somewhere to the end, the last bytes, and the bad ones', () => {
  assert.equal(parseRange(undefined, 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=90-500', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-500', 100), { start: 0, end: 99 });
  // Several at once: the whole file.
  assert.equal(parseRange('bytes=0-1,5-6', 100), null);
  for (const bad of ['bytes=100-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=a-b', 'items=0-1', 'bytes=1.5-2']) {
    assert.equal(parseRange(bad, 100), 'bad', bad);
  }
});

test('the video is served whole, in pieces (206), or refused (416)', async () => {
  const dir = tmp();
  const file = path.join(dir, 'v.mp4');
  writeFileSync(file, Buffer.from('0123456789abcdefghij'));
  const server = http.createServer((req, res) => serveVideo(req, res, req.url === '/gone' ? path.join(dir, 'gone.mp4') : file));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    let r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'video/mp4');
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    assert.equal(r.headers.get('content-length'), '20');
    assert.equal(await r.text(), '0123456789abcdefghij');
    r = await fetch(`${base}/`, { headers: { range: 'bytes=10-14' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), 'bytes 10-14/20');
    assert.equal(r.headers.get('content-length'), '5');
    assert.equal(await r.text(), 'abcde');
    r = await fetch(`${base}/`, { headers: { range: 'bytes=15-' } });
    assert.equal(r.status, 206);
    assert.equal(await r.text(), 'fghij');
    r = await fetch(`${base}/`, { headers: { range: 'bytes=20-' } });
    assert.equal(r.status, 416);
    assert.equal(r.headers.get('content-range'), 'bytes */20');
    await r.arrayBuffer();
    r = await fetch(`${base}/`, { method: 'HEAD', headers: { range: 'bytes=0-1' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-length'), '2');
    r = await fetch(`${base}/gone`);
    assert.equal(r.status, 404);
    await r.arrayBuffer();
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guests and party guests may fetch the video, as they do the beats', () => {
  const url = new URL('http://x/api/dj/video?v=abc');
  const onAWall = () => false;
  assert.equal(guestMayFetch('/api/dj/video', url, onAWall), true);
  assert.equal(roleMayFetch('guest', '/api/dj/video', url, onAWall), true);
  assert.equal(roleMayFetch('party', '/api/dj/video', url, onAWall), true);
});

test('the LED wall shows the video now and then, the same on every screen', () => {
  const frame = (bar: number, part: 'intro' | 'build' | 'drop' | 'breakdown', sinceDrop = Infinity, track = 0) => ({ beats: bar * 4 + 0.5, part, sinceDrop, track });
  // In a groove or a breakdown: 16 to 32 bars of every 64, in one go.
  for (const part of ['intro', 'breakdown'] as const) {
    for (let block = 0; block < 12; block++) {
      const on = Array.from({ length: 64 }, (_, b) => videoTurn(frame(block * 64 + b, part), false));
      const bars = on.filter(Boolean).length;
      assert.ok(bars >= 16 && bars <= 32, `${part} block ${block}: ${bars} bars`);
      const first = on.indexOf(true);
      assert.ok(on.slice(first, first + bars).every(Boolean), 'all in one go');
    }
  }
  // Not always the same bars.
  const starts = new Set(Array.from({ length: 12 }, (_, block) => Array.from({ length: 64 }, (_, b) => videoTurn(frame(block * 64 + b, 'intro'), false)).join()));
  assert.ok(starts.size > 1);
  // In a drop: the first two bars of each sixteen, but never while FLOGGE OFFICE flashes.
  assert.equal(videoTurn(frame(32, 'drop', 20), false), true);
  assert.equal(videoTurn(frame(33, 'drop', 22), false), true);
  assert.equal(videoTurn(frame(34, 'drop', 24), false), false);
  assert.equal(videoTurn(frame(32, 'drop', 3), false), false);
  // Never through a build; always for anyone who'd rather nothing flashed.
  for (let b = 0; b < 64; b++) assert.equal(videoTurn(frame(b, 'build'), false), false);
  assert.equal(videoTurn(frame(5, 'build'), true), true);
  // The same frame, the same answer.
  assert.equal(videoTurn(frame(100, 'intro', Infinity, 3), false), videoTurn(frame(100, 'intro', Infinity, 3), false));
});

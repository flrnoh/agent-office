// flrnoh fork (see FORK.md): hearing a DJ set (server/djbeats/analyse.ts) and the frame the roof moves to (client/features/djset/frame.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, FeatureStream, RATE } from '../src/server/djbeats/analyse.js';
import { BEAT_PARTS, beatTimes, fromBase64, isDjBeats, type DjBeats } from '../src/shared/djbeats.js';
import { BeatsError } from '../src/server/djbeats/fetch.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DjBooth, djMessage } from '../src/server/djset.js';
import type { DjSet } from '../src/shared/djset.js';
import type { ServerMsg } from '../src/shared/protocol.js';
import { SetBeats, gridFrame } from '../src/client/features/djset/frame.js';

/** A made-up house track: a kick on every beat, claps on the 2 and 4, a bassline, and a breakdown with neither kick nor bass. */
function track(bpm: number, seconds: number, breakdown: [number, number], offset = 0.25): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const beat = 60 / bpm;
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const quiet = t >= breakdown[0] && t < breakdown[1];
    const k = Math.floor((t - offset) / beat);
    const since = t - offset - k * beat;
    let v = 0.08 * Math.sin(2 * Math.PI * 440 * t) * (0.6 + 0.4 * Math.sin(t)); // a pad, all the way through
    if (!quiet && t >= offset) {
      v += 0.8 * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-since * 30)) * since) * Math.exp(-since * 9); // kick
      if (k % 2 === 1) v += 0.25 * noise() * Math.exp(-since * 25); // clap
      v += 0.2 * Math.sin(2 * Math.PI * 55 * t) * (since > beat / 2 ? 1 : 0.3); // bass
    }
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

function hear(samples: Float32Array) {
  const fs = new FeatureStream();
  // In uneven chunks of bytes, as they come off a pipe.
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((v, i) => view.setInt16(i * 2, Math.round(v * 32767), true));
  for (let i = 0; i < bytes.length; i += 4097) fs.pushBytes(bytes.subarray(i, i + 4097));
  return analyse(fs.finish(), 'https://soundcloud.com/a/b');
}

test('finds the tempo and lands on the kicks', () => {
  const bpm = 124;
  const r = hear(track(bpm, 150, [60, 90]));
  assert.ok(isDjBeats(r));
  assert.ok(Math.abs(r.bpm - bpm) < 0.6, `heard ${r.bpm} BPM`);
  const beat = 60 / bpm;
  const times = beatTimes(r);
  let off = 0;
  let n = 0;
  for (const t of times) {
    if (t < 1 || (t > 59 && t < 91) || t > 149) continue;
    const k = Math.round((t - 0.25) / beat);
    off += Math.abs(t - (0.25 + k * beat));
    n++;
  }
  assert.ok(n > 150, `only ${n} beats`);
  assert.ok(off / n < 0.02, `beats ${Math.round((off / n) * 1000)} ms off the kicks on average`);
});

test('hears the breakdown, the build and the drop', () => {
  const r = hear(track(126, 160, [64, 102]));
  const times = beatTimes(r);
  const at = (s: number) => {
    let part = 0;
    for (const [b, p] of r.sections) if (times[b] <= s) part = p;
    return BEAT_PARTS[part];
  };
  assert.equal(at(75), 'breakdown');
  assert.equal(at(99), 'build');
  assert.equal(at(106), 'drop');
  // The kick is hard on the beats and gone in the breakdown.
  const kick = fromBase64(r.kick);
  const i = times.findIndex((t) => t > 30);
  const j = times.findIndex((t) => t > 80);
  assert.ok(kick[i] > 150 && kick[j] < 80, `kick ${kick[i]} vs ${kick[j]} in the breakdown`);
});

test('the claps fix which beat a bar starts on', () => {
  const r = hear(track(128, 60, [200, 200], 0.5));
  // Claps on every other beat from the first kick (at 0.5 s): bars start on the beats in between.
  const first = beatTimes(r).findIndex((t) => Math.abs(t - 0.5) < 0.05);
  assert.ok(first >= 0);
  assert.equal(r.downbeat % 2, first % 2);
});

// ---- The booth: hearing the set that's on, and tapped tempos ------------------------------------


function fake(url: string): DjBeats {
  // 120 BPM, 64 beats: eight bars of groove, four of breakdown, two of build, then the drop.
  const beats = Array.from({ length: 64 }, (_, i) => (i ? 500 : 250));
  const bytes = (v: number) => Buffer.from(new Uint8Array(64).fill(v)).toString('base64');
  return { v: 1, url, duration: 33, bpm: 120, beats, downbeat: 0, kick: bytes(200), hi: bytes(100), energy: bytes(180), sections: [[0, 0], [32, 3], [48, 1], [56, 2]] };
}

const later = () => new Promise((r) => setTimeout(r, 5));

test('the booth hears the set that is on, and stops hearing one taken off', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-djbeats-'));
  try {
    const asked: string[] = [];
    const stopped: string[] = [];
    let release: (() => void) | null = null;
    const booth = new DjBooth(dir, async () => undefined, (set: DjSet, signal) => {
      asked.push(set.url);
      signal.addEventListener('abort', () => stopped.push(set.url));
      return new Promise((resolve) => (release = () => resolve(fake(set.url))));
    });
    let told = 0;
    booth.onBeats = () => told++;
    booth.play('https://soundcloud.com/someone/a-set', 'Flo');
    assert.equal(booth.state().beats?.status, 'pending');
    assert.equal(booth.heard(), null);
    release!();
    await later();
    assert.equal(booth.state().beats?.status, 'ready');
    assert.equal(booth.state().beats?.bpm, 120);
    assert.equal(booth.heard()?.url, 'https://soundcloud.com/someone/a-set');
    assert.ok(told >= 2);
    // Another set while one's being heard: the first is let go.
    booth.play('https://soundcloud.com/someone/b-set', 'Flo');
    booth.play('https://soundcloud.com/someone/c-set', 'Flo');
    assert.deepEqual(stopped, ['https://soundcloud.com/someone/b-set']);
    // Put on again later: ready at once, from what it kept.
    booth.play('https://soundcloud.com/someone/a-set', 'Flo');
    assert.equal(booth.state().beats?.status, 'ready');
    assert.equal(asked.filter((u) => u.endsWith('a-set')).length, 1);
    booth.stop('Flo');
    assert.equal(booth.state().beats, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a set the office could not hear says why', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-djbeats-'));
  try {
    const booth = new DjBooth(dir, async () => undefined, async () => {
      throw new BeatsError('yt-dlp is not installed on the office');
    });
    booth.play('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Flo');
    await later();
    assert.deepEqual(booth.state().beats, { status: 'failed', why: 'yt-dlp is not installed on the office' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tapping the tempo: only on the roof, with a set on, a real tempo, and not too often', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-djbeats-'));
  try {
    const booth = new DjBooth(dir, async () => undefined, () => new Promise(() => {}));
    const sent: ServerMsg[] = [];
    const warned: string[] = [];
    const hooks = (onRoof = true, id = 'a') => ({ id, who: 'Flo', onRoof, toRoof: (m: ServerMsg) => sent.push(m), warn: (t: string) => warned.push(t) });
    djMessage(booth, { t: 'dj.tap', bpm: 128, at: 1000 }, hooks());
    assert.match(warned.pop()!, /once a set is on/);
    booth.play('https://soundcloud.com/someone/a-set', 'Flo');
    djMessage(booth, { t: 'dj.tap', bpm: 128, at: 1000 }, hooks(false));
    assert.match(warned.pop()!, /roof/);
    djMessage(booth, { t: 'dj.tap', bpm: 128.04, at: 1000.4 }, hooks());
    assert.deepEqual(booth.state().tap, { bpm: 128, at: 1000 });
    assert.ok(sent.some((m) => m.t === 'dj'));
    djMessage(booth, { t: 'dj.tap', bpm: 130, at: 2000 }, hooks());
    assert.match(warned.pop()!, /moment/);
    djMessage(booth, { t: 'dj.tap', bpm: 900, at: 2000 }, hooks(true, 'b'));
    assert.equal(booth.state().tap?.bpm, 128);
    djMessage(booth, { t: 'dj.tap', bpm: 0, at: 0 }, hooks(true, 'c'));
    assert.equal(booth.state().tap, undefined);
    // A new set forgets the last one's tempo.
    booth.tap(100, 5);
    booth.play('https://soundcloud.com/someone/b-set', 'Flo');
    assert.equal(booth.state().tap, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the roof's frame follows the heard set: the beat, the parts, the drop landing", () => {
  const b = new SetBeats(fake('x'));
  // On a beat: the kick's just hit.
  const on = b.frame(0.25 + 4 * 0.5, 0.2);
  assert.ok(on.beat > 0.99 && on.kick > 0.7);
  assert.equal(on.part, 'intro');
  // Half a beat later it has faded.
  assert.ok(b.frame(0.25 + 4.5 * 0.5, 0.2).kick < 0.1);
  assert.equal(b.frame(0.25 + 40 * 0.5, 0.2).part, 'breakdown');
  const build = b.frame(0.25 + 52 * 0.5, 0.2);
  assert.equal(build.part, 'build');
  assert.ok(Math.abs(build.rise - 0.5) < 0.01);
  const drop = b.frame(0.25 + 57 * 0.5, 0.2);
  assert.equal(drop.part, 'drop');
  assert.ok(Math.abs(drop.sinceDrop - 0.5) < 0.01);
  assert.notEqual(drop.hue, on.hue);
  // Bars count from the downbeat, past the end it keeps the tempo.
  assert.equal(on.beats % 4, 0);
  assert.ok(Math.abs(b.frame(0.25 + 70 * 0.5, 0).beats - 256 - 70) < 0.01);
  // A tapped grid: on its beats, in time.
  const g = gridFrame(10, 120, 0, 0);
  assert.ok(g.beat > 0.99 && g.bpm === 120);
});

test("the party's volume: the team sets it from anywhere, for everyone on the roof, and it's kept", () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-djvolume-'));
  try {
    const booth = new DjBooth(dir, async () => undefined, () => new Promise(() => {}));
    assert.equal(booth.state().volume, undefined);
    const sent: ServerMsg[] = [];
    const hooks = { id: 'a', who: 'Flo', onRoof: false, toRoof: (m: ServerMsg) => sent.push(m), warn: () => assert.fail('no warning') };
    djMessage(booth, { t: 'dj.volume', volume: 0.456 }, hooks);
    assert.equal(booth.state().volume, 0.46);
    assert.equal(booth.state().volumeBy, 'Flo');
    assert.equal(sent.length, 1);
    // The same again, or no volume at all: nothing sent.
    djMessage(booth, { t: 'dj.volume', volume: 0.46 }, hooks);
    djMessage(booth, { t: 'dj.volume', volume: 7 }, hooks);
    djMessage(booth, { t: 'dj.volume', volume: Number.NaN }, hooks);
    assert.equal(sent.length, 1);
    djMessage(booth, { t: 'dj.volume', volume: 0 }, hooks);
    assert.equal(booth.state().volume, 0);
    // After a restart, still silent.
    const again = new DjBooth(dir, async () => undefined, () => new Promise(() => {}));
    assert.equal(again.state().volume, 0);
    // Guests and party guests can't touch it.
    assert.ok(TEAM_ONLY_MSGS.has('dj.volume') && !GUEST_MSGS.has('dj.volume'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

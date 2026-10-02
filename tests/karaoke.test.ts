import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZONES } from '../src/shared/bowling.js';
import { SONGS, SONG_BY_ID } from '../src/shared/karaoke-songs.js';
import { BEATS_PER_BAR, melodyBeats, noteMidi, parseChord, songAt, songSeconds, splitSyllables, sungNotes, timeline } from '../src/shared/karaoke-music.js';
import {
  CHARTS,
  KARAOKE_BAR,
  KJ_DESK,
  LEAD_MS,
  MICS,
  PER_PERSON,
  RATE_MS,
  SCREEN,
  STAGE,
  STAGE_STEP,
  TABLES,
  UP_MS,
  inKaraoke,
  onStage,
  parseKaraokeLink,
  pickTitle,
  singersOf,
  weekKey,
  type KaraokeServerMsg,
  type KaraokeState,
} from '../src/shared/karaoke.js';
import { Karaoke, type KaraokeMember } from '../src/server/bowling/karaoke.js';
import { KaraokeCharts } from '../src/server/bowling/karaoke-board.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

// flrnoh fork (see FORK.md "Karaoke").

test('the bar\'s own songs: two verses and a chorus each, every line fits its melody and its bars', () => {
  assert.ok(SONGS.length >= 4);
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
  for (const s of SONGS) {
    const t = timeline(s);
    assert.equal(t.lines.length, (s.verse.melody.length + s.chorus.melody.length) * 2, s.id);
    for (const sec of [s.verse, s.chorus]) {
      for (const m of sec.melody) assert.ok(melodyBeats(m) <= sec.barsPerLine * BEATS_PER_BAR + 1e-9, `${s.id}: ${m}`);
      for (const c of sec.chords) assert.ok(parseChord(c), `${s.id}: ${c}`);
    }
    // Both verses sing the verse's melody: line by line the same number of syllables.
    for (const v of s.verses) v.forEach((line, i) => assert.equal(splitSyllables(line).length, sungNotes(s.verse.melody[i]), `${s.id}: ${line}`));
    s.refrain.forEach((line, i) => assert.equal(splitSyllables(line).length, sungNotes(s.chorus.melody[i]), `${s.id}: ${line}`));
    // Short (a couple of minutes), singable (C4 to E5 or so), and in time order.
    const secs = songSeconds(s);
    assert.ok(secs > 45 && secs < 150, `${s.id} runs ${secs}s`);
    for (const n of t.melody) assert.ok(n.midi >= noteMidi('A3') && n.midi <= noteMidi('F5'), `${s.id}: ${n.midi}`);
    for (let i = 1; i < t.lines.length; i++) assert.ok(t.lines[i].at >= t.lines[i - 1].end - 1e-9);
    for (const l of t.lines) for (let i = 1; i < l.syllables.length; i++) assert.ok(l.syllables[i].at >= l.syllables[i - 1].at + l.syllables[i - 1].len - 1e-9);
  }
});

test('reading a song: syllables, notes, chords, and where in it a moment is', () => {
  assert.deepEqual(splitSyllables('Grü|ner Build'), [
    { text: 'Grü', space: false },
    { text: 'ner', space: true },
    { text: 'Build', space: true },
  ]);
  assert.equal(noteMidi('C4'), 60);
  assert.equal(noteMidi('F#4'), 66);
  assert.equal(noteMidi('Bb3'), 58);
  assert.deepEqual(parseChord('Am'), { root: 9, tones: [0, 3, 7] });
  assert.deepEqual(parseChord('G7'), { root: 7, tones: [0, 4, 7, 10] });
  assert.equal(parseChord('H7'), null);
  const s = SONG_BY_ID.get('gruener-build')!;
  const t = timeline(s);
  assert.equal(t.lines[0].text, 'Die ganze Nacht hab ich gewartet');
  assert.equal(t.lines[0].at, s.intro.length * BEATS_PER_BAR);
  assert.equal(songAt(s, 0).part, 'intro');
  const first = t.lines[0].syllables[0];
  assert.equal(songAt(s, ((first.at + 0.1) * 60) / s.bpm).line, 0);
  assert.equal(songAt(s, songSeconds(s) + 1).line, t.lines.length);
  // The blues swings: an offbeat eighth lands two thirds into its beat.
  const blues = timeline(SONG_BY_ID.get('merge-konflikt-blues')!);
  assert.ok(blues.melody.some((n) => Math.abs((n.at % 1) - 2 / 3) < 1e-6));
});

test('everything the bar stands in is inside the karaoke zone', () => {
  const Z = ZONES.karaoke;
  const inZone = (x: number, z: number) => x >= Z.minX && x <= Z.maxX && z >= Z.minZ && z <= Z.maxZ;
  for (const b of [STAGE, STAGE_STEP, KARAOKE_BAR]) assert.ok(inZone(b.minX, b.minZ) && inZone(b.maxX, b.maxZ));
  for (const p of [...MICS, ...TABLES, KJ_DESK, SCREEN, CHARTS]) assert.ok(inZone(p.x, p.z));
  for (const m of MICS) assert.ok(onStage(m.x, m.z));
  assert.ok(!onStage(10, 8));
  assert.ok(inKaraoke(10, 8) && !inKaraoke(-10, 8));
});

test('karaoke links: one YouTube video, nothing else', () => {
  const v = parseKaraokeLink('youtu.be/dQw4w9WgXcQ?t=12');
  assert.ok(!('error' in v));
  assert.equal(v.kind, 'youtube');
  assert.equal(v.start, 12);
  assert.ok('error' in parseKaraokeLink('https://twitch.tv/somebody'));
  assert.ok('error' in parseKaraokeLink('javascript:alert(1)'));
  assert.ok('error' in parseKaraokeLink('https://www.youtube.com/playlist?list=abc'));
  assert.equal(pickTitle({ kind: 'song', id: 'strike' }), 'Strike!');
});

test('the ISO week', () => {
  assert.equal(weekKey(new Date(2026, 9, 2, 12).getTime()), '2026-W40');
  assert.equal(weekKey(new Date(2027, 0, 1, 12).getTime()), '2026-W53');
  assert.equal(weekKey(new Date(2026, 0, 5, 12).getTime()), '2026-W02');
});

test('guests and party guests may sing, and see the bar', () => {
  for (const t of ['karaoke.hello', 'karaoke.queue', 'karaoke.unqueue', 'karaoke.mic', 'karaoke.stop', 'karaoke.done', 'karaoke.rate', 'karaoke.cheer']) {
    assert.ok(GUEST_MSGS.has(t), t);
    assert.ok(PARTY_MSGS.has(t), t);
  }
  for (const t of ['karaoke', 'karaoke.cheer', 'karaoke.rated']) assert.ok(PARTY_SEES_MSGS.has(t), t);
});

/** A bar with a clock of its own, and what it sent. */
function bar(present: string[], dataDir?: string) {
  let now = new Date(2026, 9, 2, 20).getTime();
  const all: KaraokeServerMsg[] = [];
  const toasts: string[] = [];
  const one = new Map<string, unknown[]>();
  const k = new Karaoke({
    toAll: (m) => (m.t === 'toast' ? toasts.push(m.text) : all.push(m)),
    toOne: (id, m) => {
      one.set(id, [...(one.get(id) ?? []), m]);
      if (m.t === 'toast') toasts.push(`@${id} ${m.text}`);
    },
    present: () => present,
    now: () => now,
    timer: false,
    dataDir,
  });
  const state = (): KaraokeState => {
    const last = [...all].reverse().find((m) => m.t === 'karaoke');
    return last && last.t === 'karaoke' ? last.state : k.state();
  };
  return { k, all, toasts, one, state, later: (ms: number) => ((now += ms), k.tick()) };
}

const ann: KaraokeMember = { id: 'a', name: 'Ann', owner: 'name:Ann' };
const bob: KaraokeMember = { id: 'b', name: 'Bob', owner: 'account:bob' };
const cat: KaraokeMember = { id: 'c', name: 'Cat', owner: 'name:Cat' };

test('a turn: queued, called up, the mic taken, sung, rated, on the board', () => {
  const b = bar(['a', 'b', 'c']);
  b.k.message(ann, { t: 'karaoke.queue', song: 'strike' });
  let s = b.state();
  assert.equal(s.turn?.who, 'a');
  assert.equal(s.turn?.phase, 'up');
  assert.ok(b.toasts.some((t) => t.startsWith('@a') && t.includes('Du bist dran')));
  // Bob queues behind her.
  b.k.message(bob, { t: 'karaoke.queue', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.equal(b.state().queue.length, 1);
  // She takes mic 1: the song starts LEAD_MS on, and runs as long as the song.
  b.k.message(ann, { t: 'karaoke.mic', mic: 0, take: true });
  s = b.state();
  assert.equal(s.turn?.phase, 'singing');
  assert.deepEqual(s.mics, ['a', null]);
  const len = songSeconds(SONG_BY_ID.get('strike')!) * 1000;
  assert.ok(s.turn!.until - s.turn!.startedAt >= len);
  assert.equal(s.turn!.startedAt, new Date(2026, 9, 2, 20).getTime() + LEAD_MS);
  // Cat joins for a duet; the mic Ann has isn't Cat's to take.
  b.k.message(cat, { t: 'karaoke.mic', mic: 0, take: true });
  assert.ok(b.toasts.some((t) => t.startsWith('@c') && t.includes('Ann')));
  b.k.message(cat, { t: 'karaoke.mic', mic: 1, take: true });
  assert.deepEqual(singersOf(b.state()), ['a', 'c']);
  // Not over yet.
  b.later(LEAD_MS + len - 5000);
  assert.equal(b.state().turn?.phase, 'singing');
  b.later(6000);
  s = b.state();
  assert.equal(s.turn?.phase, 'rating');
  // Singers can't rate themselves; Bob gives it 4, which is everyone who can: done.
  b.k.message(ann, { t: 'karaoke.rate', stars: 5 });
  assert.equal(b.state().turn?.votes, 0);
  b.k.message(bob, { t: 'karaoke.rate', stars: 9 });
  assert.equal(b.state().turn?.votes, 0);
  b.k.message(bob, { t: 'karaoke.rate', stars: 4 });
  const rated = b.all.find((m) => m.t === 'karaoke.rated');
  assert.deepEqual(rated, { t: 'karaoke.rated', name: 'Ann & Cat', title: 'Strike!', avg: 4, votes: 1, king: true });
  s = b.state();
  assert.deepEqual(
    s.board.top.map((l) => [l.name, l.songs, l.points]),
    [
      ['Ann', 1, 4],
      ['Cat', 1, 4],
    ],
  );
  // Bob's next: called up.
  assert.equal(s.turn?.who, 'b');
  assert.equal(s.turn?.phase, 'up');
});

test('a video ends when the singer\'s page says so; one that will not play is skipped unrated', () => {
  const b = bar(['a', 'b']);
  b.k.message(ann, { t: 'karaoke.queue', url: 'youtu.be/dQw4w9WgXcQ' });
  b.k.message(ann, { t: 'karaoke.mic', mic: 1, take: true });
  assert.equal(b.state().turn?.phase, 'singing');
  // Only the singer's page ends it.
  b.k.message(bob, { t: 'karaoke.done' });
  assert.equal(b.state().turn?.phase, 'singing');
  b.later(40_000);
  b.k.message(ann, { t: 'karaoke.done' });
  assert.equal(b.state().turn?.phase, 'rating');
  b.later(RATE_MS + 10);
  assert.equal(b.state().turn, null);
  // Nobody voted: it counts as a song sung, with no points.
  assert.deepEqual(b.state().board.top.map((l) => [l.name, l.songs, l.points]), [['Ann', 1, 0]]);
  b.later(2000);
  b.k.message(ann, { t: 'karaoke.queue', url: 'youtu.be/dQw4w9WgXcQ' });
  b.k.message(ann, { t: 'karaoke.mic', mic: 1, take: true });
  // (She still holds mic 2, so being called up starts it straight away.)
  assert.equal(b.state().turn?.phase, 'singing');
  b.k.message(ann, { t: 'karaoke.done', failed: true });
  assert.equal(b.state().turn, null);
});

test('called up and not there: skipped; the next is called', () => {
  const b = bar(['a', 'b']);
  b.k.message(ann, { t: 'karaoke.queue', song: 'strike' });
  b.later(1600);
  b.k.message(bob, { t: 'karaoke.queue', song: 'kaffee-tango' });
  b.later(UP_MS - 3000);
  assert.equal(b.state().turn?.who, 'a');
  b.later(2000);
  assert.equal(b.state().turn?.who, 'b');
  assert.ok(b.toasts.some((t) => t.includes('Ann ist nicht aufgetaucht')));
});

test('the queue: a couple each, your own out again, nothing unknown', () => {
  const b = bar(['a', 'b']);
  b.k.message(ann, { t: 'karaoke.queue', song: 'nope' });
  assert.equal(b.state().turn, null);
  b.k.message(ann, { t: 'karaoke.queue', song: 'strike' });
  for (let i = 0; i < PER_PERSON + 1; i++) {
    b.later(2000);
    b.k.message(ann, { t: 'karaoke.queue', song: 'feierabendbier' });
  }
  assert.equal(b.state().queue.length, PER_PERSON);
  // Too quick.
  b.k.message(bob, { t: 'karaoke.queue', song: 'strike' });
  b.k.message(bob, { t: 'karaoke.queue', song: 'strike' });
  assert.equal(b.state().queue.filter((e) => e.who === 'b').length, 1);
  const bobs = b.state().queue.find((e) => e.who === 'b')!;
  b.k.message(ann, { t: 'karaoke.unqueue', id: bobs.id });
  assert.equal(b.state().queue.length, PER_PERSON + 1);
  b.k.message(bob, { t: 'karaoke.unqueue', id: bobs.id });
  assert.equal(b.state().queue.length, PER_PERSON);
});

test('leaving the centre lets go: songs out of the queue, the mic back, the turn over', () => {
  const b = bar(['a', 'b']);
  b.k.message(ann, { t: 'karaoke.queue', song: 'strike' });
  b.k.message(bob, { t: 'karaoke.queue', song: 'strike' });
  b.k.message(ann, { t: 'karaoke.mic', mic: 0, take: true });
  b.k.message(bob, { t: 'karaoke.mic', mic: 1, take: true });
  b.k.leave('a');
  const s = b.state();
  assert.deepEqual(s.mics, [null, 'b']);
  // Bob was holding a mic already: his turn starts at once.
  assert.equal(s.turn?.who, 'b');
  assert.equal(s.turn?.phase, 'singing');
  // Putting the mic back ends your own song.
  b.later(5000);
  b.k.message(bob, { t: 'karaoke.mic', mic: 1, take: false });
  assert.equal(b.state().turn, null);
  assert.deepEqual(b.state().mics, [null, null]);
});

test('applause goes to everyone else, not too fast', () => {
  const b = bar(['a', 'b']);
  b.k.message(ann, { t: 'karaoke.cheer', kind: 'whoo' });
  b.k.message(ann, { t: 'karaoke.cheer', kind: 'clap' });
  assert.deepEqual(
    b.all.filter((m) => m.t === 'karaoke.cheer'),
    [{ t: 'karaoke.cheer', id: 'a', kind: 'whoo' }],
  );
  b.k.message(ann, { t: 'karaoke.hello' });
  assert.equal((b.one.get('a') ?? []).length, 1);
});

test('the week\'s board is saved, ranked by points, and a new week starts afresh with last week\'s king', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'karaoke-'));
  try {
    let now = new Date(2026, 9, 2, 20).getTime();
    const c = new KaraokeCharts(dir, () => now);
    c.record('name:Ann', 'Ann', 4, 3);
    c.record('account:bob', 'Bob', 5, 2);
    c.record('name:Ann', 'Ann', 3.5, 2);
    assert.deepEqual(
      c.board().top.map((l) => [l.name, l.songs, l.avg, l.points, l.best]),
      [
        ['Ann', 2, 3.8, 7.5, 4],
        ['Bob', 1, 5, 5, 5],
      ],
    );
    assert.ok(c.leads('name:Ann'));
    const file = path.join(dir, 'karaoke.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    // Read back.
    const again = new KaraokeCharts(dir, () => now);
    assert.deepEqual(again.board(), c.board());
    // A week on: the board's empty, Ann was last week's queen.
    now += 7 * 86_400_000;
    const b = again.board();
    assert.equal(b.top.length, 0);
    assert.deepEqual(b.last, { week: '2026-W40', name: 'Ann', points: 7.5 });
    assert.ok(JSON.parse(readFileSync(file, 'utf8')).last);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

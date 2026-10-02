import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Proberaum, type ProbePresent } from '../src/server/venue/proberaum.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_SEES_MSGS } from '../src/server/party.js';
import { ABANDON_MS, KNOCK_MS, PINS_EACH, PROBE_CLIENT_MSGS, PROBE_SERVER_MSGS, TAKES_KEPT, TAKE_MS_MAX, type ProbeView, type ProbeYou, type ProberaumClientMsg, type ProberaumServerMsg } from '../src/shared/proberaum.js';
import { doorOf, inner, roomById } from '../src/shared/proberaum-layout.js';
import { INSTRUMENT_SPOTS, type RehearsalRoomId } from '../src/shared/venue.js';

// The rehearsal wing on the office's side (flrnoh fork, see FORK.md "The rehearsal wing"): booking
// (one room each, running out, let go of), the doors and knocking, the setlists, the Schwarzes Brett,
// the tip jar, the recorders (record, stop, play, loop, over a take, delete, limits), kept on disk.

function wing(dataDir?: string) {
  let now = Date.UTC(2026, 9, 2, 18, 0, 0);
  const people = new Map<string, ProbePresent>();
  const got = new Map<string, ProberaumServerMsg[]>();
  const w = new Proberaum({ now: () => now, present: () => [...people.values()], send: (id, m) => got.get(id)?.push(m), dataDir });
  const come = (id: string, x = -12, z = -12) => {
    people.set(id, { id, owner: `name:${id}`, name: id[0].toUpperCase() + id.slice(1), x, z });
    got.set(id, []);
  };
  const at = (id: string, x: number, z: number) => Object.assign(people.get(id)!, { x, z });
  /** Inside room `r`, in its middle by the door side (clear of the instruments). */
  const into = (id: string, r: RehearsalRoomId) => {
    const I = inner(roomById(r));
    at(id, I.maxX - 1, (I.minZ + I.maxZ) / 2);
  };
  /** In the corridor at `r`'s door. */
  const atDoor = (id: string, r: RehearsalRoomId) => at(id, doorOf(roomById(r)).outX, doorOf(roomById(r)).z);
  const send = (id: string, m: ProberaumClientMsg) => {
    const p = people.get(id)!;
    return w.message({ id, owner: p.owner, name: p.name }, m);
  };
  const last = (id: string) => [...got.get(id)!].reverse().find((m) => m.t === 'probe') as Extract<ProberaumServerMsg, { t: 'probe' }> | undefined;
  const view = (id: string): ProbeView => last(id)!.view;
  const you = (id: string): ProbeYou => last(id)!.you;
  const room = (id: string, r: RehearsalRoomId) => view(id).rooms.find((x) => x.id === r)!;
  return { w, people, got, come, at, into, atDoor, send, view, you, room, now: () => now, advance: (ms: number) => (now += ms) };
}

test('a room is booked for 30, 60 or 120 minutes, one a person, and runs out', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  assert.equal(t.send('anna', { t: 'probe.book', room: 'probe1', minutes: 45, band: 'X' }), undefined, 'odd lengths do nothing');
  t.send('anna', { t: 'probe.look' });
  assert.equal(t.room('anna', 'probe1').booking, null);
  t.send('anna', { t: 'probe.book', room: 'probe1', minutes: 60, band: '  Die   Fehlgriffe ' });
  const b = t.room('anna', 'probe1').booking!;
  assert.equal(b.band, 'Die Fehlgriffe');
  assert.equal(b.until - t.now(), 60 * 60_000);
  assert.deepEqual(t.you('anna').booked, 'probe1');
  assert.deepEqual(t.you('ben').booked, null);
  assert.match(String(t.send('ben', { t: 'probe.book', room: 'probe1', minutes: 30, band: '' })), /gebucht/, 'someone else has it');
  assert.match(String(t.send('anna', { t: 'probe.book', room: 'probe2', minutes: 30, band: '' })), /schon Proberaum 1/, 'one room each');
  // Your own again: from now, for that long.
  t.advance(10 * 60_000);
  t.send('anna', { t: 'probe.book', room: 'probe1', minutes: 120, band: '' });
  assert.equal(t.room('anna', 'probe1').booking!.until - t.now(), 120 * 60_000);
  assert.equal(t.room('anna', 'probe1').booking!.band, 'Die Fehlgriffe', 'the name stays');
  // Ben's own, with the default name.
  t.send('ben', { t: 'probe.book', room: 'studio', minutes: 30, band: '' });
  assert.equal(t.room('ben', 'studio').booking!.band, 'Bens Band');
  assert.match(String(t.send('ben', { t: 'probe.release', room: 'probe1' })), /Nur Anna/);
  t.advance(31 * 60_000);
  t.w.tick();
  assert.equal(t.room('ben', 'studio').booking, null, 'run out');
  assert.ok(t.room('ben', 'probe1').booking, 'still booked');
  t.send('anna', { t: 'probe.release', room: 'probe1' });
  assert.equal(t.room('ben', 'probe1').booking, null, 'let go');
  // The polaroid wall has both bands.
  assert.deepEqual(t.view('anna').polaroids.map((p) => p.band), ['Die Fehlgriffe', 'Bens Band']);
});

test('a booking nobody of the band is around for goes after a quarter of an hour', () => {
  const t = wing();
  t.come('anna');
  t.send('anna', { t: 'probe.book', room: 'probe2', minutes: 120, band: 'A' });
  t.come('ben');
  t.people.delete('anna');
  t.advance(ABANDON_MS - 1000);
  t.w.tick();
  t.send('ben', { t: 'probe.look' });
  assert.ok(t.room('ben', 'probe2').booking, 'not yet');
  t.advance(2000);
  t.w.tick();
  assert.equal(t.room('ben', 'probe2').booking, null);
});

test('whoever is in the room when it is booked is in the band; the booker adds and removes', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  t.come('cem');
  t.into('anna', 'probe3');
  t.into('ben', 'probe3');
  t.send('anna', { t: 'probe.book', room: 'probe3', minutes: 30, band: 'Kadaverkrone' });
  assert.deepEqual(t.room('anna', 'probe3').booking!.members, ['Anna', 'Ben']);
  assert.deepEqual(t.you('ben').band, ['probe3']);
  assert.match(String(t.send('anna', { t: 'probe.member', room: 'probe3', id: 'cem', add: true })), /im Raum/, 'only someone in there');
  t.into('cem', 'probe3');
  assert.match(String(t.send('ben', { t: 'probe.member', room: 'probe3', id: 'cem', add: true })), /bestimmt Anna/, 'only the booker');
  t.send('anna', { t: 'probe.member', room: 'probe3', id: 'cem', add: true });
  assert.deepEqual(t.room('anna', 'probe3').booking!.members, ['Anna', 'Ben', 'Cem']);
  t.send('anna', { t: 'probe.member', room: 'probe3', id: 'ben', add: false });
  assert.deepEqual(t.room('anna', 'probe3').booking!.members, ['Anna', 'Cem']);
  t.send('anna', { t: 'probe.member', room: 'probe3', id: 'anna', add: false });
  assert.deepEqual(t.room('anna', 'probe3').booking!.members, ['Anna', 'Cem'], 'the booker stays');
});

test('doors: open to all while free; while booked only the band (or someone inside) opens; knock and be let in', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  t.come('cem');
  assert.equal(t.send('ben', { t: 'probe.door', room: 'probe1', open: true }), undefined);
  t.send('ben', { t: 'probe.look' });
  assert.equal(t.room('ben', 'probe1').door, false, 'too far from the door');
  t.atDoor('ben', 'probe1');
  t.send('ben', { t: 'probe.door', room: 'probe1', open: true });
  assert.equal(t.room('ben', 'probe1').door, true, 'free: anyone');
  t.send('ben', { t: 'probe.door', room: 'probe1', open: false });
  t.into('anna', 'probe1');
  t.send('anna', { t: 'probe.book', room: 'probe1', minutes: 30, band: 'A' });
  assert.match(String(t.send('ben', { t: 'probe.door', room: 'probe1', open: true })), /klopf an/);
  assert.equal(t.room('ben', 'probe1').door, false);
  // Knock: everyone hears it, the band sees who.
  t.send('ben', { t: 'probe.knock', room: 'probe1' });
  assert.ok(t.got.get('anna')!.some((m) => m.t === 'probe.knocked' && m.name === 'Ben'));
  assert.deepEqual(t.room('anna', 'probe1').knocks, [{ id: 'ben', name: 'Ben' }]);
  assert.match(String(t.send('cem', { t: 'probe.letin', room: 'probe1', id: 'ben' })), /nur die Band/);
  t.send('anna', { t: 'probe.letin', room: 'probe1', id: 'ben' });
  assert.equal(t.room('anna', 'probe1').door, true, 'the door opens');
  assert.deepEqual(t.room('anna', 'probe1').booking!.members, ['Anna', 'Ben']);
  assert.deepEqual(t.room('anna', 'probe1').knocks, []);
  // Someone inside who isn't in the band can always get out.
  t.send('anna', { t: 'probe.door', room: 'probe1', open: false });
  t.into('cem', 'probe1');
  t.send('cem', { t: 'probe.door', room: 'probe1', open: true });
  assert.equal(t.room('cem', 'probe1').door, true);
  // A knock goes stale, and goes when the knocker leaves.
  t.atDoor('cem', 'probe1');
  t.send('anna', { t: 'probe.door', room: 'probe1', open: false });
  t.send('cem', { t: 'probe.knock', room: 'probe1' });
  assert.equal(t.room('anna', 'probe1').knocks.length, 1);
  t.advance(KNOCK_MS + 10);
  t.w.tick();
  assert.equal(t.room('anna', 'probe1').knocks.length, 0);
  t.send('cem', { t: 'probe.knock', room: 'probe1' });
  t.w.leave('cem');
  assert.equal(t.room('anna', 'probe1').knocks.length, 0);
  assert.match(String(t.send('anna', { t: 'probe.letin', room: 'probe1', id: 'cem' })), /klopft gerade keiner/);
});

test('the setlist is the room’s, written by whoever is in it (the band while it’s booked), cleaned', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  assert.match(String(t.send('anna', { t: 'probe.setlist', room: 'probe2', text: 'x' })), /in Proberaum 2 sein/);
  t.into('anna', 'probe2');
  t.send('anna', { t: 'probe.setlist', room: 'probe2', text: '1. Intro\n2. Lauter Song\u0007\n' + 'x'.repeat(900) });
  const s = t.room('anna', 'probe2');
  assert.ok(s.setlist.startsWith('1. Intro\n2. Lauter Song'));
  assert.ok(s.setlist.length <= 600);
  assert.equal(s.setlistBy, 'Anna');
  t.send('anna', { t: 'probe.book', room: 'probe2', minutes: 30, band: 'A' });
  t.into('ben', 'probe2');
  assert.match(String(t.send('ben', { t: 'probe.setlist', room: 'probe2', text: 'mine' })), /Band/);
});

test('the Schwarzes Brett: notes cleaned and kept short, three each, your own taken down; the tip jar', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  t.send('anna', { t: 'probe.pin', text: 'Drummer sucht Band!\nGern Punk.', color: 2 });
  assert.equal(t.view('anna').pins[0].text, 'Drummer sucht Band!\nGern Punk.');
  assert.match(String(t.send('anna', { t: 'probe.pin', text: 'again', color: 0 })), /warten/);
  for (let i = 0; i < PINS_EACH + 1; i++) {
    t.advance(10_000);
    t.send('anna', { t: 'probe.pin', text: `Zettel ${i} ${'y'.repeat(300)}`, color: 9 });
  }
  const mine = t.view('anna').pins;
  assert.equal(mine.length, PINS_EACH);
  assert.ok(mine.every((p) => p.text.length <= 140));
  assert.deepEqual(t.you('anna').pins.length, PINS_EACH);
  t.send('ben', { t: 'probe.unpin', id: mine[0].id });
  assert.equal(t.view('anna').pins.length, PINS_EACH, 'not his');
  t.send('anna', { t: 'probe.unpin', id: mine[0].id });
  assert.equal(t.view('anna').pins.length, PINS_EACH - 1);
  t.send('ben', { t: 'probe.tip' });
  t.send('ben', { t: 'probe.tip' });
  const tipped = t.got.get('anna')!.filter((m) => m.t === 'probe.tipped');
  assert.equal(tipped.length, 1, 'one coin at a time');
});

const note = (spot: string, pitch = 60) => {
  const s = INSTRUMENT_SPOTS.find((x) => x.id === spot)!;
  return { kind: s.kind, pitch, vel: 0.9 };
};

test('the recorder keeps what the room plays between start and stop, plays it back for everyone, loops, records over a take', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  t.into('anna', 'studio');
  assert.match(String(t.send('ben', { t: 'probe.rec', room: 'studio', bpm: 120, click: true, countIn: true })), /im Studio sein|in Studio sein/);
  t.send('anna', { t: 'probe.rec', room: 'studio', bpm: 120, click: true, countIn: true });
  const rec = t.room('anna', 'studio').rec!;
  assert.equal(rec.by, 'Anna');
  assert.equal(rec.startAt - t.now(), 300 + 2000, 'four beats at 120 to count in');
  assert.match(String(t.send('anna', { t: 'probe.rec', room: 'studio', bpm: 120, click: false, countIn: false })), /nimmt schon auf/);
  t.advance(2300);
  t.w.heard('studio-drums', note('studio-drums', 36));
  t.advance(500);
  t.w.heard('studio-guitar', note('studio-guitar', 52));
  t.w.heard('probe1-guitar', note('probe1-guitar', 52)); // another room's: not this take's
  t.w.heard('studio-mic', { kind: 'drums', pitch: 1, vel: 1 }); // the mic plays no notes
  t.w.heard('studio-guitar', { kind: 'bass', pitch: 40, vel: 1 }); // not what stands there
  t.advance(1000);
  t.send('anna', { t: 'probe.recstop', room: 'studio', keep: true, name: '' });
  const takes = t.view('anna').takes;
  assert.equal(takes.length, 1);
  assert.equal(takes[0].name, 'Studio – Take 1');
  assert.equal(takes[0].notes, 2);
  assert.deepEqual(takes[0].kinds, ['drums', 'guitar']);
  assert.ok(takes[0].dur >= 1500);
  assert.deepEqual(t.you('anna').takes, [takes[0].id]);
  // Played back: to everyone in the Schallwerk (the pages in the room sound it), from a moment on.
  t.send('anna', { t: 'probe.play', room: 'studio', take: takes[0].id, loop: true });
  const played = t.got.get('ben')!.find((m) => m.t === 'probe.playing') as Extract<ProberaumServerMsg, { t: 'probe.playing' }>;
  assert.equal(played.take!.evs.length, 2);
  assert.deepEqual(played.take!.evs[0], [0, 'studio-drums', 36, 0.9, 0]);
  assert.equal(played.loop, true);
  assert.ok(played.startAt > t.now());
  assert.equal(t.room('anna', 'studio').playing!.take, takes[0].id);
  // A loop goes on past the end, till it's stopped.
  t.advance(10_000);
  t.w.tick();
  assert.ok(t.room('anna', 'studio').playing);
  // Over it: the take plays along, and the new one has both.
  t.send('anna', { t: 'probe.rec', room: 'studio', bpm: 100, click: false, countIn: false, over: takes[0].id });
  assert.equal(t.room('anna', 'studio').rec!.over, takes[0].id);
  assert.equal(t.room('anna', 'studio').playing!.loop, false);
  t.advance(400);
  t.w.heard('studio-guitar', note('studio-guitar', 55));
  t.advance(2000);
  t.send('anna', { t: 'probe.recstop', room: 'studio', keep: true, name: 'Mit Gitarre' });
  const both = t.view('anna').takes.find((x) => x.name === 'Mit Gitarre')!;
  assert.equal(both.notes, 3);
  assert.equal(t.room('anna', 'studio').playing, null);
  // Once through, it stops by itself.
  t.send('anna', { t: 'probe.play', room: 'studio', take: both.id, loop: false });
  t.advance(both.dur + 2000);
  t.w.tick();
  assert.equal(t.room('anna', 'studio').playing, null);
  // Nothing played: nothing kept.
  t.send('anna', { t: 'probe.rec', room: 'studio', bpm: 100, click: false, countIn: false });
  t.advance(3000);
  t.send('anna', { t: 'probe.recstop', room: 'studio', keep: true });
  assert.equal(t.view('anna').takes.length, 2);
});

test('takes: only who made one renames or deletes it; each room keeps its last ones; a take stops at its longest or with the room empty', () => {
  const t = wing();
  t.come('anna');
  t.come('ben');
  t.into('anna', 'probe1');
  t.into('ben', 'probe1');
  for (let i = 0; i < TAKES_KEPT + 2; i++) {
    t.send('anna', { t: 'probe.rec', room: 'probe1', bpm: 100, click: false, countIn: false });
    t.advance(400);
    t.w.heard('probe1-keys', note('probe1-keys', 60 + (i % 12)));
    t.advance(100);
    t.send('anna', { t: 'probe.recstop', room: 'probe1', keep: true });
  }
  const takes = t.view('anna').takes;
  assert.equal(takes.length, TAKES_KEPT);
  assert.equal(takes[0].name, 'Proberaum 1 – Take 3', 'the oldest went');
  assert.match(String(t.send('ben', { t: 'probe.take', take: takes[0].id, del: true })), /Nur wer/);
  t.send('anna', { t: 'probe.take', take: takes[0].id, name: 'Gute Version' });
  assert.equal(t.view('anna').takes[0].name, 'Gute Version');
  t.send('ben', { t: 'probe.play', room: 'probe1', take: takes[0].id, loop: true });
  t.send('anna', { t: 'probe.take', take: takes[0].id, del: true });
  assert.equal(t.view('anna').takes.length, TAKES_KEPT - 1);
  assert.equal(t.room('anna', 'probe1').playing, null, 'its playback stops');
  // At its longest: stopped and kept.
  t.send('ben', { t: 'probe.rec', room: 'probe1', bpm: 100, click: false, countIn: false });
  t.advance(400);
  t.w.heard('probe1-drums', note('probe1-drums', 38));
  t.advance(TAKE_MS_MAX);
  t.w.tick();
  assert.equal(t.room('anna', 'probe1').rec, null);
  assert.equal(t.view('anna').takes.at(-1)!.by, 'Ben');
  // Everyone out: stopped and kept.
  t.send('ben', { t: 'probe.rec', room: 'probe1', bpm: 100, click: false, countIn: false });
  t.advance(400);
  t.w.heard('probe1-bass', note('probe1-bass', 40));
  t.at('anna', -12, 0);
  t.at('ben', -12, 0);
  t.advance(1000);
  t.w.tick();
  assert.equal(t.room('anna', 'probe1').rec, null);
  // Booked: only the band records and plays.
  t.into('anna', 'probe1');
  t.send('anna', { t: 'probe.book', room: 'probe1', minutes: 30, band: 'A' });
  t.into('ben', 'probe1');
  assert.match(String(t.send('ben', { t: 'probe.rec', room: 'probe1', bpm: 100, click: false, countIn: false })), /nur die Band/);
  assert.match(String(t.send('ben', { t: 'probe.play', room: 'probe1', take: takes[1].id, loop: false })), /nur die Band/);
});

test('it is all kept in proberaum.json and proberaum-takes.json (0600)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'proberaum-'));
  try {
    const t = wing(dir);
    t.come('anna');
    t.into('anna', 'probe2');
    t.send('anna', { t: 'probe.book', room: 'probe2', minutes: 60, band: 'Velvet Feedback' });
    t.send('anna', { t: 'probe.setlist', room: 'probe2', text: 'Opener' });
    t.send('anna', { t: 'probe.pin', text: 'Bassist gesucht', color: 1 });
    t.send('anna', { t: 'probe.rec', room: 'probe2', bpm: 90, click: false, countIn: false });
    t.advance(400);
    t.w.heard('probe2-bass', note('probe2-bass', 41));
    t.send('anna', { t: 'probe.recstop', room: 'probe2', keep: true, name: 'Riff' });
    for (const f of ['proberaum.json', 'proberaum-takes.json']) assert.equal(statSync(path.join(dir, f)).mode & 0o777, 0o600, f);
    assert.ok(readFileSync(path.join(dir, 'proberaum.json'), 'utf8').includes('Velvet Feedback'));
    const u = wing(dir);
    u.come('anna');
    u.send('anna', { t: 'probe.look' });
    const r = u.room('anna', 'probe2');
    assert.equal(r.booking!.band, 'Velvet Feedback');
    assert.equal(r.setlist, 'Opener');
    assert.equal(u.view('anna').pins[0].text, 'Bassist gesucht');
    assert.equal(u.view('anna').takes[0].name, 'Riff');
    assert.deepEqual(u.you('anna'), { booked: 'probe2', band: ['probe2'], takes: [u.view('anna').takes[0].id], pins: [u.view('anna').pins[0].id] });
    assert.equal(u.view('anna').polaroids[0].band, 'Velvet Feedback');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guests and party guests may use the wing; party guests hear all of it', () => {
  for (const t of PROBE_CLIENT_MSGS) assert.ok(GUEST_MSGS.has(t), t);
  for (const t of PROBE_SERVER_MSGS) assert.ok(PARTY_SEES_MSGS.has(t), t);
});

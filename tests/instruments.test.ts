import test from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_PIECES, INSTRUMENT_SPOTS, REHEARSAL_ROOMS, VENUE, WING_CORRIDOR, venueRoomAt, type InstrumentNote } from '../src/shared/venue.js';
import { BPM, JAM_ROOMS, NOTE_RATE, NO_JAM, PITCH_RANGE, RateBucket, SPOT_BY_ID, TONES, applyJam, cleanNote, heardIn, isRelease, micsOnPa, toneOf } from '../src/shared/instruments.js';
import { CHORD_KEYS, DRUM_KEYS, GROOVES, KEYS_KEYS, LEAD_HOME, LEAD_TOP, bassRoot, chordOf, grooveHits, guitarChord, leadPitch, leaveKeys, stepBeat } from '../src/shared/instruments-play.js';
import { Instruments } from '../src/server/venue/instruments.js';
import { instrumentsHandlers, instrumentsHooks } from '../src/server/ws/handlers/instruments.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';

const spot = (id: string) => SPOT_BY_ID.get(id)!;
const at = (id: string, name = id) => ({ id: name, name, x: spot(id).x, z: spot(id).z });

// ---- Notes ---------------------------------------------------------------------------------------------

test('a note is only taken as the instrument can play it', () => {
  assert.deepEqual(cleanNote('guitar', { kind: 'guitar', pitch: 52, vel: 0.8 }), { kind: 'guitar', pitch: 52, vel: 0.8 });
  assert.deepEqual(cleanNote('guitar', { kind: 'guitar', pitch: 52, vel: 0.8, len: 0.2, extra: 'x' }), { kind: 'guitar', pitch: 52, vel: 0.8, len: 0.2 });
  assert.deepEqual(cleanNote('drums', { kind: 'drums', pitch: DRUM_PIECES.snare, vel: 1, len: 3 }), { kind: 'drums', pitch: 38, vel: 1 }, 'the drums ring as long as they ring');
  // The wrong kind, out of range, not whole, not finite, no velocity.
  assert.equal(cleanNote('guitar', { kind: 'keys', pitch: 60, vel: 1 }), null);
  assert.equal(cleanNote('mic', { kind: 'mic', pitch: 60, vel: 1 }), null);
  assert.equal(cleanNote('bass', { kind: 'bass', pitch: PITCH_RANGE.bass[1] + 1, vel: 1 }), null);
  assert.equal(cleanNote('keys', { kind: 'keys', pitch: 60.5, vel: 1 }), null);
  assert.equal(cleanNote('keys', { kind: 'keys', pitch: 60, vel: Number.NaN }), null);
  assert.equal(cleanNote('keys', { kind: 'keys', pitch: 60, vel: 1.2 }), null);
  assert.equal(cleanNote('keys', { kind: 'keys', pitch: 60, vel: 1, len: 99 }), null);
  assert.equal(cleanNote('keys', { kind: 'keys', pitch: 60, vel: 1, len: '1' }), null);
  assert.equal(cleanNote('drums', { kind: 'drums', pitch: 40, vel: 1 }), null, 'not a piece of the kit');
  assert.equal(cleanNote('drums', { kind: 'drums', pitch: 36, vel: 0 }), null, 'a drum is never let go of');
  assert.equal(cleanNote('keys', null), null);
  // A key let go of: velocity 0.
  const off = cleanNote('keys', { kind: 'keys', pitch: 60, vel: 0 })!;
  assert.ok(off && isRelease(off));
});

test('a note goes over the wire and comes back the same', () => {
  const n: InstrumentNote = { kind: 'keys', pitch: 64, vel: 0.78, len: 0.5 };
  assert.deepEqual(cleanNote('keys', JSON.parse(JSON.stringify({ t: 'instr.note', spot: 'stage-keys', note: n })).note), n);
});

test('the rate bucket lets a burst through, then the steady rate', () => {
  const b = new RateBucket(undefined, undefined, 0);
  let n = 0;
  while (b.take(0)) n++;
  assert.equal(n, NOTE_RATE.burst);
  assert.equal(b.take(5), false);
  let later = 0;
  for (let i = 0; i < 1000; i++) if (b.take(1000)) later++;
  assert.equal(later, NOTE_RATE.perSec, 'a second refills perSec');
});

// ---- Who plays what (the office's) -------------------------------------------------------------------------

test('one player per instrument, one instrument per player, taken only standing at it', () => {
  const i = new Instruments();
  assert.deepEqual(i.take(at('stage-guitar1', 'ann'), 'stage-guitar1'), { ok: true, changed: true });
  assert.deepEqual(i.take(at('stage-guitar1', 'ann'), 'stage-guitar1'), { ok: true, changed: false });
  const taken = i.take(at('stage-guitar1', 'ben'), 'stage-guitar1');
  assert.ok('error' in taken && taken.error.includes('ann'), 'held by someone else');
  assert.ok('error' in i.take({ id: 'ben', name: 'ben', x: 0, z: -10 }, 'stage-drums'), 'too far away');
  assert.ok('error' in i.take(at('stage-drums', 'ben'), 'nope'), 'no such spot');
  // Taking another puts the first back.
  i.take({ ...at('stage-bass', 'ann') }, 'stage-bass');
  assert.deepEqual(i.state(), { 'stage-bass': 'ann' });
  assert.equal(i.spotOf('ann'), 'stage-bass');
  assert.equal(i.leave('ann'), true);
  assert.equal(i.leave('ann'), false);
  assert.deepEqual(i.state(), {});
});

test("the office takes only the holder's notes, the instrument's own, standing at it, not too many", () => {
  const i = new Instruments();
  const ann = at('stage-guitar1', 'ann');
  i.take(ann, 'stage-guitar1');
  const g = (pitch: number) => ({ kind: 'guitar', pitch, vel: 0.9 });
  assert.deepEqual(i.note(ann, 'stage-guitar1', g(52), 0), { note: { kind: 'guitar', pitch: 52, vel: 0.9 } });
  assert.deepEqual(i.note(ann, 'stage-drums', { kind: 'drums', pitch: 36, vel: 1 }, 0), { refused: 'spot' });
  assert.deepEqual(i.note(ann, 'stage-guitar1', { kind: 'drums', pitch: 36, vel: 1 }, 0), { refused: 'note' });
  assert.deepEqual(i.note(at('stage-guitar1', 'ben'), 'stage-guitar1', g(52), 0), { refused: 'spot' });
  // A flood: the burst, then nothing until the bucket refills.
  let ok = 1;
  for (let k = 0; k < 500; k++) if ('note' in i.note(ann, 'stage-guitar1', g(52), 10)) ok++;
  assert.equal(ok, NOTE_RATE.burst);
  assert.ok('note' in i.note(ann, 'stage-guitar1', g(52), 1000));
  // Walked off: the guitar goes back on its stand.
  assert.deepEqual(i.note({ ...ann, x: ann.x + 10 }, 'stage-guitar1', g(52), 2000), { refused: 'away' });
  assert.deepEqual(i.state(), {});
});

test("a room's jam: tempo, click, key and count-in, from the room's own", () => {
  const i = new Instruments();
  assert.equal(i.setJam('lobby', { bpm: 100 }, 0), null);
  assert.equal(i.setJam('hall', { nothing: true }, 0), null);
  const j = i.setJam('probe2', { bpm: 999, key: -1, minor: false }, 5000)!;
  assert.equal(j.bpm, BPM.max);
  assert.equal(j.key, 11);
  assert.equal(j.minor, false);
  assert.equal(j.at, 5000, 'a new tempo starts its beat now');
  assert.deepEqual(i.jam('hall'), NO_JAM, 'each room its own');
  const c = i.setJam('probe2', { click: true }, 6000)!;
  assert.equal(c.at, 6000);
  const n = i.setJam('probe2', { countIn: true }, 6100)!;
  const beat = 60000 / n.bpm;
  assert.ok(n.countIn >= 6100 && Number.isInteger(Math.round((n.countIn - n.at) / beat)), 'the count-in on a beat of the grid');
  assert.deepEqual(Object.keys(i.allJams()), ['probe2']);
  assert.deepEqual(applyJam(NO_JAM, { bpm: 3 }, 0)?.bpm, BPM.min);
});

test("a spot's sound: only its player switches it, only to one it has", () => {
  const i = new Instruments();
  i.take(at('stage-keys', 'ann'), 'stage-keys');
  assert.equal(i.setTone('ann', 'stage-keys', 'organ'), true);
  assert.equal(i.setTone('ann', 'stage-keys', 'organ'), false);
  assert.equal(i.setTone('ann', 'stage-keys', 'drive'), false);
  assert.equal(i.setTone('ben', 'stage-keys', 'pad'), false);
  assert.deepEqual(i.allTones(), { 'stage-keys': 'organ' });
  assert.equal(toneOf(spot('stage-keys'), i.allTones()), 'organ');
  assert.equal(toneOf(spot('stage-guitar1'), i.allTones()), TONES.guitar[0]);
});

// ---- The handlers: through a little office ----------------------------------------------------------------

function office() {
  const sent: { to: string; m: { t: string } }[] = [];
  const warned: string[] = [];
  const clients = new Map<string, Client>();
  const ctx = {
    clients,
    toVenue: (m: { t: string }, except?: string) => {
      for (const c of clients.values()) if (c.peer.floor === VENUE && c.id !== except) sent.push({ to: c.id, m });
    },
    sendTo: (c: Client, m: { t: string }) => sent.push({ to: c.id, m }),
    warn: (c: Client, e: string) => warned.push(`${c.id}: ${e}`),
  } as unknown as Ctx;
  const join = (id: string, where: string | { x: number; z: number }, floor = VENUE) => {
    const p = typeof where === 'string' ? spot(where) : where;
    const c = { id, peer: { id, name: id, floor, x: p.x, z: p.z } } as unknown as Client;
    clients.set(id, c);
    return c;
  };
  const got = (id: string, t: string) => sent.filter((s) => s.to === id && s.m.t === t).map((s) => s.m as Record<string, unknown>);
  return { ctx, sent, warned, join, got };
}

test('take, play, everyone else in the venue hears it, nobody outside; leaving frees it', () => {
  const o = office();
  const ann = o.join('ann', 'stage-guitar1');
  const ben = o.join('ben', 'stage-drums');
  const cleo = o.join('cleo', 'probe1-mic');
  const dan = o.join('dan', { x: 0, z: 0 }, 'floor-1');
  instrumentsHandlers['instr.take'](o.ctx, ann, { t: 'instr.take', spot: 'stage-guitar1' });
  instrumentsHandlers['instr.take'](o.ctx, ben, { t: 'instr.take', spot: 'stage-guitar1' });
  assert.ok(o.warned.some((w) => w.startsWith('ben:')), 'ben is told who has it');
  assert.deepEqual(o.got('cleo', 'instr.state').at(-1), { t: 'instr.state', players: { 'stage-guitar1': 'ann' } });
  instrumentsHandlers['instr.take'](o.ctx, dan, { t: 'instr.take', spot: 'stage-keys' });
  assert.equal(o.got('ann', 'instr.state').length, 1, 'not from outside the venue');
  o.sent.length = 0;
  instrumentsHandlers['instr.note'](o.ctx, ann, { t: 'instr.note', spot: 'stage-guitar1', note: { kind: 'guitar', pitch: 52, vel: 0.9 } });
  assert.deepEqual(o.got('ben', 'instr.note'), [{ t: 'instr.note', id: 'ann', spot: 'stage-guitar1', note: { kind: 'guitar', pitch: 52, vel: 0.9 } }]);
  assert.equal(o.got('cleo', 'instr.note').length, 1, 'everyone in the venue gets it (their page decides who hears it)');
  assert.equal(o.got('ann', 'instr.note').length, 0, 'not back to whoever played it');
  assert.equal(o.got('dan', 'instr.note').length, 0);
  // A late joiner: who plays what, the jams, the sounds.
  const eve = o.join('eve', { x: 0, z: -12 });
  instrumentsHandlers['instr.hello'](o.ctx, eve, { t: 'instr.hello' });
  assert.deepEqual(o.got('eve', 'instr.state'), [{ t: 'instr.state', players: { 'stage-guitar1': 'ann' } }]);
  assert.equal(o.got('eve', 'instr.jam').length, 1);
  assert.equal(o.got('eve', 'instr.tones').length, 1);
  // Out of the venue: the guitar's free again, and everyone still inside told.
  instrumentsHooks.leaving!(o.ctx, ann, undefined);
  assert.deepEqual(o.got('ben', 'instr.state').at(-1), { t: 'instr.state', players: {} });
  // Gone from the office.
  instrumentsHandlers['instr.take'](o.ctx, ben, { t: 'instr.take', spot: 'stage-drums' });
  instrumentsHooks.closed!(o.ctx, ben);
  assert.deepEqual(o.got('cleo', 'instr.state').at(-1), { t: 'instr.state', players: {} });
});

test("a room's jam only from someone in that room or playing in it", () => {
  const o = office();
  const ann = o.join('ann', 'probe2-drums');
  const ben = o.join('ben', 'stage-drums');
  instrumentsHandlers['instr.jam'](o.ctx, ben, { t: 'instr.jam', room: 'probe2', change: { bpm: 90 } });
  assert.equal(o.got('ann', 'instr.jam').length, 0);
  instrumentsHandlers['instr.jam'](o.ctx, ann, { t: 'instr.jam', room: 'probe2', change: { bpm: 90 } });
  assert.equal((o.got('ben', 'instr.jam')[0].jams as Record<string, { bpm: number }>).probe2.bpm, 90);
});

// ---- Who hears what -----------------------------------------------------------------------------------------

test("a rehearsal room's sound stays in it; the hall's fills the hall, muffled out in the wing", () => {
  for (const r of REHEARSAL_ROOMS) {
    const mid = { x: (r.box.minX + r.box.maxX) / 2, z: (r.box.minZ + r.box.maxZ) / 2 };
    assert.deepEqual(heardIn(mid.x, mid.z, r.id), { gain: 1, muffled: false }, `${r.id} hears itself`);
    assert.equal(heardIn(mid.x, mid.z, 'hall').gain, 0, `${r.id} doesn't hear the hall`);
    assert.equal(heardIn(2.5, 0, r.id).gain, 0, `the hall doesn't hear ${r.id}`);
    for (const o of REHEARSAL_ROOMS) if (o !== r) assert.equal(heardIn(mid.x, mid.z, o.id).gain, 0, `${r.id} doesn't hear ${o.id}`);
  }
  assert.deepEqual(heardIn(2.5, 0, 'hall'), { gain: 1, muffled: false });
  assert.deepEqual(heardIn(0, 14, 'hall'), { gain: 1, muffled: false }, 'backstage');
  const corridor = heardIn((WING_CORRIDOR.minX + WING_CORRIDOR.maxX) / 2, 0, 'hall');
  assert.ok(corridor.muffled && corridor.gain > 0 && corridor.gain < 0.5, 'the corridor gets the hall through the door');
  assert.equal(heardIn((WING_CORRIDOR.minX + WING_CORRIDOR.maxX) / 2, 0, 'probe2').gain, 0, 'not the room beside it');
  // Every spot is heard at itself.
  for (const s of INSTRUMENT_SPOTS) assert.ok(heardIn(s.x, s.z, s.room).gain > 0, s.id);
});

test('the mics on your PA are those of the room you are in', () => {
  const players = { 'stage-mic1': 'ann', 'stage-mic2': 'ben', 'probe1-mic': 'cleo', 'stage-guitar1': 'dan', 'probe2-drums': 'eve' };
  assert.deepEqual(micsOnPa('hall', players), ['ann', 'ben']);
  assert.deepEqual(micsOnPa('probe1', players), ['cleo']);
  assert.deepEqual(micsOnPa('probe2', players), []);
  assert.deepEqual(micsOnPa(venueRoomAt(-19, -5.9), players), ['cleo']);
});

// ---- Playing on a computer keyboard -------------------------------------------------------------------------

test('the key maps: no key twice, E never a note but on the keyboard, Esc always stops', () => {
  for (const code of Object.keys(DRUM_KEYS)) assert.ok(!leaveKeys('drums').includes(code), code);
  for (const code of [...LEAD_HOME, ...LEAD_TOP, ...CHORD_KEYS]) assert.ok(!leaveKeys('guitar').includes(code), code);
  assert.equal(new Set([...LEAD_HOME, ...LEAD_TOP, ...CHORD_KEYS]).size, LEAD_HOME.length + LEAD_TOP.length + CHORD_KEYS.length);
  for (const k of ['drums', 'guitar', 'bass', 'keys', 'mic'] as const) assert.ok(leaveKeys(k).includes('Escape'));
  assert.ok(!('Escape' in KEYS_KEYS));
  assert.equal(KEYS_KEYS.KeyE, 16, "the keyboard's E is the upper octave's E");
  // Two and a half octaves, every semitone once on each row.
  const lower = Object.entries(KEYS_KEYS).filter(([c]) => !/^(?:Key[QWERTYUIOP]|Digit|Bracket|Equal)/.test(c)).map(([, s]) => s);
  assert.deepEqual([...lower].sort((a, b) => a - b), [...Array(17)].map((_, i) => i));
});

test('the chords in the room key, as a guitarist grabs them', () => {
  assert.equal(chordOf(4, true, 0).name, 'Em');
  assert.equal(chordOf(4, true, 2).name, 'G');
  assert.equal(chordOf(4, true, 7).name, 'H', 'the dominant in minor');
  assert.equal(chordOf(0, false, 4).name, 'G');
  assert.equal(chordOf(0, false, 6).name, 'H°');
  assert.equal(chordOf(0, false, 7).name, 'Bb', 'the flat seventh in major');
  assert.deepEqual(guitarChord(4, 'min', true), [40, 47, 52, 59], 'E5 on the low strings');
  assert.deepEqual(guitarChord(4, 'min', false), [40, 47, 52, 55, 59, 64], 'Em, the open shape');
  assert.deepEqual(guitarChord(0, 'maj', false), [48, 55, 60, 64, 67], 'C, A shape at the third fret');
  for (let key = 0; key < 12; key++)
    for (const minor of [true, false])
      for (let slot = 0; slot < 8; slot++) {
        const c = chordOf(key, minor, slot);
        for (const power of [true, false]) for (const p of guitarChord(c.root, c.quality, power)) assert.ok(p >= PITCH_RANGE.guitar[0] && p <= PITCH_RANGE.guitar[1]);
        const b = bassRoot(c.root);
        assert.ok(b >= PITCH_RANGE.bass[0] && b <= PITCH_RANGE.bass[1] && b % 12 === c.root);
      }
});

test('the lead rows play the pentatonic in the key, in range', () => {
  assert.equal(leadPitch('guitar', 'KeyA', 4, true), 52, 'E3 on the home row');
  assert.equal(leadPitch('guitar', 'KeyS', 4, true), 55, 'then G');
  assert.equal(leadPitch('guitar', 'KeyQ', 4, true), 64, 'the top row an octave up');
  assert.equal(leadPitch('bass', 'KeyA', 4, true), 28, 'the bass from low E');
  assert.equal(leadPitch('guitar', 'KeyE', 4, true), undefined);
  for (let key = 0; key < 12; key++)
    for (const code of [...LEAD_HOME, ...LEAD_TOP])
      for (const kind of ['guitar', 'bass'] as const) {
        const p = leadPitch(kind, code, key, false);
        if (p !== undefined) assert.ok(cleanNote(kind, { kind, pitch: p, vel: 1 }), `${kind} ${code} in ${key}`);
      }
});

test('the grooves are a bar of sixteenths each, with a kick and a backbeat', () => {
  for (const g of GROOVES) {
    for (const bar of Object.values(g.steps)) assert.equal(bar.length, 16, g.name);
    const all = [...Array(16)].flatMap((_, s) => grooveHits(g, s).map((h) => h.piece));
    assert.ok(all.includes('kick') && all.includes('snare'), g.name);
    for (let s = 1; s < 16; s++) assert.ok(stepBeat(g, s) > stepBeat(g, s - 1) && stepBeat(g, s) < 4, `${g.name} ${s}`);
  }
});

test('every jam room has a drum kit to count in', () => {
  for (const r of JAM_ROOMS) assert.ok(INSTRUMENT_SPOTS.some((s) => s.room === r && s.kind === 'drums'), r);
});

// ---- Guests and party guests -----------------------------------------------------------------------------------

test('guests and party guests may play everything, and see and hear it', () => {
  for (const t of Object.keys(instrumentsHandlers)) {
    assert.ok(GUEST_MSGS.has(t), `${t} is open to guests`);
    assert.ok(PARTY_MSGS.has(t), `${t} is open to party guests`);
  }
  for (const t of ['instr.state', 'instr.note', 'instr.jam', 'instr.tones']) assert.ok(PARTY_SEES_MSGS.has(t), t);
});

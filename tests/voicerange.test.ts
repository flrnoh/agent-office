import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_RANGE_DEFAULT,
  VOICE_RANGE_MAX,
  VOICE_RANGE_MIN,
  VOICE_RANGE_PRESETS,
  heardVolume,
  nextVoicePreset,
  sendsVoice,
  stepVoiceRange,
  voiceRangeOf,
  voiceRangeWord,
} from '../src/shared/voicerange.js';
import { voiceRangeMessage } from '../src/server/fork/voicerange.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

// flrnoh fork (see FORK.md "Hörkreise"): voice carries as far as the speaker's circle, and no further.

test('a circle is always in range, whatever a page sends', () => {
  assert.equal(voiceRangeOf(0), VOICE_RANGE_MIN);
  assert.equal(voiceRangeOf(-5), VOICE_RANGE_MIN);
  assert.equal(voiceRangeOf(1e9), VOICE_RANGE_MAX);
  for (const v of [NaN, Infinity, '12', null, undefined, {}]) assert.equal(voiceRangeOf(v), VOICE_RANGE_DEFAULT, String(v));
  assert.equal(voiceRangeOf(7.04), 7);
});

test(', and . step down to the smallest and up to the biggest, and back the same way', () => {
  let r = VOICE_RANGE_DEFAULT;
  for (let i = 0; i < 40; i++) r = stepVoiceRange(r, -1);
  assert.equal(r, VOICE_RANGE_MIN);
  for (let i = 0; i < 40; i++) r = stepVoiceRange(r, 1);
  assert.equal(r, VOICE_RANGE_MAX);
  assert.ok(stepVoiceRange(10, 1) > 10 && stepVoiceRange(10, -1) < 10);
});

test('the top bar goes round the presets', () => {
  let r = VOICE_RANGE_PRESETS[0] as number;
  const seen = [r];
  for (let i = 0; i < VOICE_RANGE_PRESETS.length; i++) seen.push((r = nextVoicePreset(r)));
  assert.deepEqual(seen, [...VOICE_RANGE_PRESETS, VOICE_RANGE_PRESETS[0]]);
  assert.equal(nextVoicePreset(VOICE_RANGE_DEFAULT), 30);
  assert.equal(nextVoicePreset(9), 15, 'from between two, the next one up');
});

test('in the circle you hear them, louder the closer; outside nothing at all', () => {
  for (const r of [VOICE_RANGE_MIN, 2, 5, 15, 60]) {
    assert.equal(heardVolume(0, r), 1, `${r}: right next to them`);
    assert.ok(heardVolume(r, r) > 0.3, `${r}: at the edge still heard`);
    assert.equal(heardVolume(r + 1, r), 0, `${r}: past the edge`);
    assert.equal(heardVolume(r + 50, r), 0);
    let last = 2;
    for (let d = 0; d <= r + 1; d += 0.1) {
      const v = heardVolume(d, r);
      assert.ok(v <= last + 1e-9 && v >= 0 && v <= 1, `${r} at ${d}: ${v}`);
      last = v;
    }
  }
  // Someone who never said: the default.
  assert.equal(heardVolume(VOICE_RANGE_DEFAULT + 2, undefined), 0);
  assert.equal(heardVolume(3, undefined), 1);
});

test('your voice is only sent into your circle, with a little slack so the edge does not cut in and out', () => {
  assert.ok(sendsVoice(1, 2, false));
  assert.ok(!sendsVoice(4, 2, false), 'two whispering: someone 4 m off gets nothing');
  assert.ok(sendsVoice(3.2, 2, true), 'already sending: still, just past the edge');
  assert.ok(!sendsVoice(3.2, 2, false), 'not sending yet: not till they are nearly in');
  // Everyone who hears it at all gets it.
  for (const r of [VOICE_RANGE_MIN, 5, 15, 60]) for (let d = 0; d < r + 3; d += 0.25) if (heardVolume(d, r) > 0) assert.ok(sendsVoice(d, r, false), `${r} at ${d}`);
});

test('the circle in words', () => {
  assert.equal(voiceRangeWord(1.5), 'Flüstern · 1,5 m');
  assert.equal(voiceRangeWord(5), 'Gespräch · 5 m');
  assert.equal(voiceRangeWord(15), 'Raum · 15 m');
  assert.equal(voiceRangeWord(30), 'Rufen · 30 m');
  assert.equal(voiceRangeWord(60), 'Megafon · 60 m');
});

test('the office keeps your circle and tells everyone, guests and party guests too', () => {
  const sent: unknown[] = [];
  const ctx = { broadcast: (m: unknown, except?: string) => sent.push([m, except]) };
  const c = { id: 'a', peer: { id: 'a' } as { id: string; voiceRange?: number }, throttles: new Map<string, number>() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (range: unknown) => (c.throttles.clear(), voiceRangeMessage(ctx as any, c as any, { t: 'voice.range', range } as any));
  send(VOICE_RANGE_DEFAULT);
  assert.equal(sent.length, 0, 'the default again says nothing');
  send(2);
  assert.equal(c.peer.voiceRange, 2);
  assert.deepEqual(sent.pop(), [{ t: 'voice.ranged', id: 'a', range: 2 }, 'a']);
  send(2);
  assert.equal(sent.length, 0, 'the same again says nothing');
  send(1000);
  assert.equal(c.peer.voiceRange, VOICE_RANGE_MAX);
  send('loud');
  assert.equal(c.peer.voiceRange, undefined, 'back to the default: nothing kept');
  assert.deepEqual(sent.pop(), [{ t: 'voice.ranged', id: 'a', range: VOICE_RANGE_DEFAULT }, 'a']);
  // Spam: dropped within the throttle.
  sent.length = 0;
  c.throttles.clear();
  voiceRangeMessage(ctx as never, c as never, { t: 'voice.range', range: 3 });
  voiceRangeMessage(ctx as never, c as never, { t: 'voice.range', range: 4 });
  assert.equal(sent.length, 1);
  assert.ok(GUEST_MSGS.has('voice.range') && PARTY_MSGS.has('voice.range'));
  assert.ok(PARTY_SEES_MSGS.has('voice.ranged'));
});

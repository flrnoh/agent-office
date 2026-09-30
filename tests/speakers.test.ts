import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Jukebox } from '../src/server/jukebox.js';
import { SPEAKERS, SPEAKER_REF, SPEAKER_STEPS, builtSpeakers, falloff, hearSpeakers, speakerGain, speakerPresence, speakerStep, streamVolume } from '../src/client/speakers.js';
import { BALCONY, FLOOR, LOFT, MEETING_ROOM, STREET_Y, WALL_HEIGHT, WING, inWing, wingRowZ } from '../src/shared/layout.js';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const ear = (x: number, z: number, y = 1.4, fx = 0, fz = -1) => ({ x, y, z, fx, fz });

test('the speakers hang inside the office, under its ceilings, and the back office’s only once it’s built', () => {
  assert.ok(SPEAKERS.length >= 8);
  for (const s of SPEAKERS) {
    assert.ok(s.y < s.ceiling && s.y > 2, `${s.id} hangs under its ceiling, over heads`);
    if (s.wing) assert.ok(inWing(s.x, s.z, s.wing), `${s.id} is in its row of the back office`);
    else assert.ok(s.x > FLOOR.minX && s.x < FLOOR.maxX && s.z > FLOOR.minZ && s.z < FLOOR.maxZ, `${s.id} is in the room`);
  }
  assert.equal(builtSpeakers(0).length, SPEAKERS.length - WING.rows);
  assert.equal(builtSpeakers(1).length, SPEAKERS.length - WING.rows + 1);
  assert.equal(builtSpeakers(WING.rows).length, SPEAKERS.length);
  // One each in the loft and the meeting room.
  assert.ok(SPEAKERS.some((s) => s.y > LOFT.y && s.x > LOFT.minX && s.z > LOFT.minZ));
  assert.ok(SPEAKERS.some((s) => s.y < MEETING_ROOM.height && s.x > MEETING_ROOM.minX && s.z > MEETING_ROOM.minZ));
});

test('falloff is the panners’ inverse curve: 1 up to ref, then half at ref + ref/rolloff', () => {
  near(falloff(0, 2, 1), 1);
  near(falloff(2, 2, 1), 1);
  near(falloff(4, 2, 1), 0.5);
  assert.ok(falloff(20, 2, 1) < falloff(10, 2, 1));
});

test('the speakers reach all of the office, and nothing outside it but a little on the balcony', () => {
  near(speakerPresence({ x: 0, y: 1.4, z: 0 }, 0), 1);
  near(speakerPresence({ x: 14, y: LOFT.y + 1.4, z: 10 }, 0), 1);
  // Down in the garage, out on the street, above the ceiling (the roof is another place altogether).
  near(speakerPresence({ x: 0, y: STREET_Y + 1.4, z: 0 }, 0), 0);
  near(speakerPresence({ x: 0, y: 1.4, z: 27 }, 0), 0);
  near(speakerPresence({ x: 0, y: WALL_HEIGHT + 2, z: 0 }, 0), 0);
  // On the balcony: some, less than inside.
  const balcony = speakerPresence({ x: (BALCONY.minX + BALCONY.maxX) / 2, y: 1.4, z: (BALCONY.minZ + BALCONY.maxZ) / 2 }, 0);
  assert.ok(balcony > 0 && balcony < 0.4, `balcony ${balcony}`);
  // The back office counts once it's built out, and not before.
  const back = { x: 15.7, y: 1.4, z: wingRowZ(1) };
  near(speakerPresence(back, 1), 1);
  assert.ok(speakerPresence(back, 0) < 0.4);
});

test('wherever you are on the floor, the nearest speaker is loud enough', () => {
  for (let x = FLOOR.minX + 0.5; x < FLOOR.maxX; x += 1.5) {
    for (let z = FLOOR.minZ + 0.5; z < FLOOR.maxZ; z += 1.5) {
      const { level } = hearSpeakers(ear(x, z), 0);
      assert.ok(level > 0.5 && level <= 1, `(${x}, ${z}): ${level}`);
    }
  }
  // Right under one it's full; in the back office, its own speaker keeps it up.
  const s = SPEAKERS[0];
  near(hearSpeakers(ear(s.x, s.z, s.y - SPEAKER_REF + 0.5), 0).level, 1);
  assert.ok(hearSpeakers(ear(15.7, wingRowZ(2)), 2).level > hearSpeakers(ear(15.7, wingRowZ(2)), 1).level);
});

test('it’s the nearest speaker’s level, never the sum of them', () => {
  for (const [x, z] of [[0, 0], [-6, 0], [10, -5], [-14, 10]]) {
    const { level } = hearSpeakers(ear(x, z), 0);
    const nearest = Math.min(...builtSpeakers(0).map((s) => Math.hypot(s.x - x, s.y - 1.4, s.z - z)));
    near(level, falloff(nearest, SPEAKER_REF, 0.45));
  }
});

test('panned lightly towards the nearest speakers: right is right, and never past halfway', () => {
  // The lounge speaker hangs at x 13.5, z 3. Standing west of it facing north (-z), it's on the right.
  const right = hearSpeakers(ear(9, 3, 1.4, 0, -1), 0);
  assert.ok(right.pan > 0.1, `pan ${right.pan}`);
  // Turned round (facing +z), it's on the left.
  const left = hearSpeakers(ear(9, 3, 1.4, 0, 1), 0);
  assert.ok(left.pan < -0.1, `pan ${left.pan}`);
  for (let x = -17; x < 18; x += 2.5) for (let z = -12; z < 13; z += 2.5) assert.ok(Math.abs(hearSpeakers(ear(x, z, 1.4, 1, 0), 0).pan) <= 0.5);
  // Nothing at all outside, so nothing to pan.
  assert.deepEqual(hearSpeakers(ear(0, 40), 0), { level: 0, pan: 0 });
});

test('your speaker volume: squared like the other sliders, silent muted, with the music muted, or switched off on the floor', () => {
  near(speakerGain(0.4, false, false), 0.16);
  near(speakerGain(1, false, false), 1);
  near(speakerGain(2, false, false), 1);
  near(speakerGain(-1, false, false), 0);
  near(speakerGain(0.8, true, false), 0);
  near(speakerGain(0.8, false, true), 0);
  near(speakerGain(0.8, false, false, false), 0);
});

test('a stream is as loud as the louder of the jukebox and the speakers, one element, never over 1', () => {
  // By the jukebox the jukebox wins; across the room the speakers do.
  near(streamVolume(1, 0.25, 0.9, 0.16), 0.25);
  near(streamVolume(0.1, 0.25, 0.9, 0.16), 0.144);
  // Speakers off: just the jukebox, as before.
  near(streamVolume(0.1, 0.25, 0.9, 0), 0.025);
  near(streamVolume(1, 1, 1, 1), 1);
  near(streamVolume(3, 1, 0, 0), 1);
});

test('the jukebox window’s steps pick the nearest level, and off when muted', () => {
  assert.equal(SPEAKER_STEPS[0].level, 0);
  assert.equal(speakerStep(0.4, false), 2);
  assert.equal(speakerStep(0.4, true), 0);
  assert.equal(speakerStep(0, false), 0);
  assert.equal(speakerStep(0.9, false), 3);
  assert.equal(speakerStep(0.1, false), 1);
  for (let i = 1; i < SPEAKER_STEPS.length; i++) assert.equal(speakerStep(SPEAKER_STEPS[i].level, false), i);
});

test('the floor’s speaker switch: off is saved with the jukebox, stays off through a new tune, and comes back on', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'speakers-'));
  try {
    const j = new Jukebox(dir);
    assert.equal(j.state().speakersOff, undefined);
    assert.equal(j.setSpeakers(true), false);
    assert.equal(j.setSpeakers(false), true);
    assert.equal(j.state().speakersOff, true);
    j.play({ track: 'coffee-break' }, 'Flo');
    j.stop('Flo');
    assert.equal(new Jukebox(dir).state().speakersOff, true);
    assert.equal(j.setSpeakers(true), true);
    assert.equal(new Jukebox(dir).state().speakersOff, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

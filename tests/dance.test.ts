import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DANCE_BY_ID,
  DANCE_MOVES,
  FREESTYLE_GROOVE,
  FREESTYLE_HIGH,
  danceCounts,
  danceSeed,
  danceTempo,
  freestyleAt,
  isDance,
  type DanceBeat,
} from '../src/shared/dance.js';
import { ROOF } from '../src/shared/rooftop.js';
import { danceLeft, danceMessage } from '../src/server/fork/dance.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import { Dancer, shapeAt, type DanceFrame, type Shape } from '../src/client/features/dance/poses.js';
import { DANCE_KEYS } from '../src/client/features/dance/ui.js';

// flrnoh fork (see FORK.md "Dancing on the roof"): dancing up there, for as long as you like, on the beat.

const beat = (beats: number, over: Partial<DanceBeat> = {}): DanceBeat => ({ beats, part: 'intro', energy: 0.5, rise: 0, sinceDrop: Infinity, ...over });
const frame = (beats: number, over: Partial<DanceFrame> = {}): DanceFrame => ({ beats, beat: 0, kick: 0, snare: 0, energy: 0.6, part: 'intro', rise: 0, sinceDrop: Infinity, track: 0, hue: 0.3, ...over });

test('the moves: thirteen distinct ones and Freestyle, and only those are a dance', () => {
  assert.equal(DANCE_MOVES.length, 13);
  const ids = DANCE_MOVES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  for (const m of DANCE_MOVES) assert.ok(m.emoji && m.label && m.about, m.id);
  for (const id of [...ids, 'freestyle']) assert.ok(isDance(id), id);
  for (const x of ['dance', '', 'FREESTYLE', null, undefined, 3, {}, '__proto__', 'toString']) assert.equal(isDance(x), false, String(x));
  assert.equal(DANCE_BY_ID.size, 14);
  // The picker's keys: 1–9 and 0 for the first ten, F for Freestyle, none twice.
  const keys = [...DANCE_KEYS.values()];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(DANCE_KEYS.get(DANCE_MOVES[0].id), '1');
  assert.equal(DANCE_KEYS.get(DANCE_MOVES[9].id), '0');
  assert.equal(DANCE_KEYS.get('freestyle'), 'F');
});

test('drum and bass is danced half-time, a house set on its own beat', () => {
  assert.equal(danceCounts({ beats: 100 }), 50, 'the house DJ: 172 bpm');
  assert.equal(danceTempo({}), 86 / 60);
  assert.equal(danceCounts({ beats: 100, bpm: 124 }), 100);
  assert.equal(danceTempo({ bpm: 124 }), 124 / 60);
  assert.equal(danceCounts({ beats: 100, bpm: 174 }), 50);
  // Whole counts land on a beat either way.
  assert.equal(danceCounts({ beats: 64, bpm: 172 }) % 1, 0);
});

test('Freestyle picks the same move on every page, and follows the music', () => {
  const a = danceSeed('peer-a');
  const b = danceSeed('peer-b');
  assert.equal(danceSeed('peer-a'), a, 'a seed is the same every time');
  assert.notEqual(a, b);
  // The same beat and person: the same pick, whoever works it out.
  for (let beats = 0; beats < 2000; beats += 13.37) assert.equal(freestyleAt(beat(beats), a), freestyleAt(beat(beats), a));
  // The parts of a track.
  assert.equal(freestyleAt(beat(10, { part: 'breakdown' }), a), 'sway');
  assert.equal(freestyleAt(beat(10, { part: 'build', rise: 0.5 }), a), 'rise');
  assert.equal(freestyleAt(beat(10, { part: 'drop', energy: 1, sinceDrop: 0.2 }), a), 'jump');
  assert.notEqual(freestyleAt(beat(10, { part: 'drop', energy: 1, sinceDrop: 30 }), a), 'jump');
  // In the drop the moves with go in them; else the cooler ones.
  for (let beats = 0; beats < 4000; beats += 7) {
    const high = freestyleAt(beat(beats, { part: 'drop', energy: 1, sinceDrop: 30 }), a);
    assert.ok(FREESTYLE_HIGH.includes(high as never), high);
    const groove = freestyleAt(beat(beats), b);
    assert.ok(FREESTYLE_GROOVE.includes(groove as never), groove);
  }
});

test('Freestyle holds a move for bars at a time, never the same twice running, and goes through many', () => {
  for (const id of ['a', 'b', 'c', 'flo', 'guest-7']) {
    const seed = danceSeed(id);
    const seen = new Set<string>();
    let prev = '';
    let changes = 0;
    let held = 0;
    let shortest = Infinity;
    // A beat at a time through a long intro, at 172 (half-time: two beats a count).
    for (let beats = 0; beats < 4000; beats++) {
      const now = freestyleAt(beat(beats), seed);
      seen.add(now);
      if (now !== prev && prev) {
        changes++;
        shortest = Math.min(shortest, held);
        held = 0;
      }
      held++;
      prev = now;
    }
    assert.ok(changes > 20, `${id}: it changes (${changes})`);
    assert.ok(shortest >= 16, `${id}: two bars of counts at least (${shortest} beats)`);
    assert.ok(seen.size >= 5, `${id}: many moves (${seen.size})`);
  }
  // Two people don't dance the same thing all along.
  let same = 0;
  for (let beats = 0; beats < 4000; beats += 16) if (freestyleAt(beat(beats), danceSeed('x')) === freestyleAt(beat(beats), danceSeed('y'))) same++;
  assert.ok(same < 250 * 0.6, `x and y mostly differ (${same}/250 the same)`);
});

/** A body as the Person has it: the legs hang from the body (rig.ts' HIPS), the arms from the shoulders. */
function bones() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  root.add(body);
  body.add(head);
  head.position.y = 1.32;
  const limb = (x: number, y: number) => {
    const o = new THREE.Group();
    o.position.set(x, y, 0);
    body.add(o);
    const foot = new THREE.Object3D();
    foot.position.y = -0.42;
    o.add(foot);
    return { o, foot };
  };
  const legR = limb(-0.12, 0.42);
  const legL = limb(0.12, 0.42);
  const armR = limb(-0.33, 0.9);
  const armL = limb(0.33, 0.9);
  return { b: { root, body, head, armR: armR.o, armL: armL.o, legR: legR.o, legL: legL.o }, feet: [legR.foot, legL.foot] };
}

const lowestFoot = (feet: THREE.Object3D[]) => Math.min(...feet.map((f) => (f.parent!.parent!.parent!.updateMatrixWorld(true), f.getWorldPosition(new THREE.Vector3()).y)));

test('every move keeps a foot on the floor (bar the hops), moves, and lands its hits on the beat', () => {
  for (const id of [...DANCE_MOVES.map((m) => m.id), 'sway', 'rise', 'jump'] as const) {
    const { b, feet } = bones();
    const d = new Dancer(danceSeed('a'));
    const dance = DANCE_MOVES.some((m) => m.id === id) ? id : 'freestyle';
    const over: Partial<DanceFrame> = id === 'sway' ? { part: 'breakdown' } : id === 'rise' ? { part: 'build', rise: 0.6 } : id === 'jump' ? { part: 'drop', energy: 1, sinceDrop: 0 } : { bpm: 124 };
    let lo = Infinity;
    let hi = -Infinity;
    const armAt: number[] = [];
    for (let i = 0; i < 240; i++) {
      const beats = i / 20;
      const f = frame(beats, { ...over, ...(id === 'jump' ? { sinceDrop: beats * 0.35 } : {}) });
      d.pose(b as never, 1 / 60, f, dance as never, true);
      const y = lowestFoot(feet);
      if (i > 60) {
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      armAt.push(b.armR.rotation.z + b.armL.rotation.z + b.armR.rotation.x + b.head.rotation.x + b.body.position.x + b.legR.rotation.x);
      for (const v of [b.armR.rotation.x, b.armL.rotation.z, b.body.position.y, b.head.rotation.x]) assert.ok(Number.isFinite(v), `${id} finite`);
    }
    assert.ok(lo > -0.04, `${id}: no foot through the floor (${lo.toFixed(3)})`);
    const hops = ['handsup', 'jump', 'macarena'].includes(id);
    if (!hops) assert.ok(lo < 0.05, `${id}: a foot on the floor (${lo.toFixed(3)})`);
    // It moves.
    const spread = Math.max(...armAt.slice(60)) - Math.min(...armAt.slice(60));
    assert.ok(spread > 0.15, `${id} moves (${spread.toFixed(2)})`);
    assert.ok(hi < 0.8, `${id}: not flying off (${hi.toFixed(2)})`);
  }
  // The bounce is down on the beat: the Two-Step's knees are most bent on a whole count, straightest half way.
  const s = {} as Shape;
  shapeAt(s, 'twostep', frame(8, { bpm: 124 }));
  const onBeat = s.crouch;
  shapeAt(s, 'twostep', frame(8.5, { bpm: 124 }));
  assert.ok(onBeat > 0.25 && s.crouch < 0.01, `${onBeat} ${s.crouch}`);
  // The Robot snaps: the same pose all through a count, a new one on the next.
  shapeAt(s, 'robot', frame(4.3, { bpm: 124 }));
  const a = s.ro;
  shapeAt(s, 'robot', frame(4.9, { bpm: 124 }));
  assert.equal(s.ro, a);
  shapeAt(s, 'robot', frame(5.3, { bpm: 124 }));
  assert.notEqual(s.ro, a);
});

test('the same beat poses the same on every page, and reduced motion tones it down', () => {
  const run = (motion: boolean) => {
    const { b } = bones();
    const d = new Dancer(danceSeed('same'));
    for (let i = 0; i < 300; i++) d.pose(b as never, 1 / 60, frame(i / 30, { part: 'drop', energy: 1, sinceDrop: 40 }), 'freestyle', motion);
    return { r: [b.armR.rotation.z, b.armL.rotation.z, b.body.position.y, b.head.rotation.x], pick: d.pick, lift: b.body.position.y, b };
  };
  assert.deepEqual(run(true).r, run(true).r);
  assert.equal(run(true).pick, run(true).pick);
  // Reduced motion: never off the floor.
  const { b } = bones();
  const d = new Dancer(1);
  for (let i = 0; i < 300; i++) {
    d.pose(b as never, 1 / 60, frame(i / 30, { part: 'drop', energy: 1, sinceDrop: (i / 30) * 0.35 }), 'handsup', false);
    assert.ok(b.body.position.y <= 0.001, 'no hops');
  }
});

test('the office keeps your move up on the roof and tells everyone, guests and party guests too', () => {
  const sent: unknown[] = [];
  const ctx = { broadcast: (m: unknown, except?: string) => sent.push([m, except]) };
  const c = { id: 'a', peer: { id: 'a', floor: ROOF } as { id: string; floor?: string; dance?: string }, throttles: new Map<string, number>() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (move: unknown) => (c.throttles.clear(), danceMessage(ctx as any, c as any, { t: 'dance.set', move } as any));
  send('robot');
  assert.equal(c.peer.dance, 'robot');
  assert.deepEqual(sent.pop(), [{ t: 'dance.moved', id: 'a', move: 'robot' }, 'a']);
  send('robot');
  assert.equal(sent.length, 0, 'the same again says nothing');
  send('freestyle');
  assert.deepEqual(sent.pop(), [{ t: 'dance.moved', id: 'a', move: 'freestyle' }, 'a']);
  send('breakdance-on-the-ceiling');
  assert.equal(c.peer.dance, undefined, 'not a move: stops');
  assert.deepEqual(sent.pop(), [{ t: 'dance.moved', id: 'a', move: null }, 'a']);
  send(null);
  assert.equal(sent.length, 0, 'not dancing already');
  // Only on the roof.
  c.peer.floor = 'floor-1';
  send('floss');
  assert.equal(c.peer.dance, undefined);
  assert.equal(sent.length, 0);
  c.peer.floor = ROOF;
  // Spam: dropped within the throttle (the page waits until the pick settles).
  c.throttles.clear();
  danceMessage(ctx as never, c as never, { t: 'dance.set', move: 'vogue' });
  danceMessage(ctx as never, c as never, { t: 'dance.set', move: 'floss' });
  assert.equal(sent.length, 1);
  assert.equal(c.peer.dance, 'vogue');
  // Off the roof: no more dancing, and everyone told.
  sent.length = 0;
  danceLeft(ctx as never, c as never);
  assert.equal(c.peer.dance, undefined);
  assert.deepEqual(sent.pop(), [{ t: 'dance.moved', id: 'a', move: null }, 'a']);
  danceLeft(ctx as never, c as never);
  assert.equal(sent.length, 0, 'not dancing: nothing to say');
  // Guests and party guests dance too, and party guests see everyone else dance.
  assert.ok(GUEST_MSGS.has('dance.set') && PARTY_MSGS.has('dance.set'));
  assert.ok(PARTY_SEES_MSGS.has('dance.moved'));
});

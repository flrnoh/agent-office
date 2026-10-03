import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WELLENBAD } from '../src/shared/therme.js';
import { thermeFixtures, thermeWhereabouts } from '../src/shared/therme-all.js';
import { BEACH, DEEP, WAVES, WAVE_POOL, WAVE_WATER, beachFloorAt, beachSteps, nextWaves, waveBoard, waveFlow, waveStrength, waveSwell, wavesLeft } from '../src/shared/therme-waves.js';
import { inPoolAt, overPool } from '../src/shared/swim.js';
import { Swimmer, type SwimBody } from '../src/client/swim/index.js';
import { STEP } from '../src/client/player/collide.js';

// The wave pool (flrnoh fork, see FORK.md "The thermal baths", phase 3): waves by the office's
// clock, the beach stepping down into the water, swimmers lifted and carried shoreward.

const RUN0 = 3 * WAVES.every; // an office time a run starts at

test('the waves run every so often for so long, easing in and out, the same for everyone at the same moment', () => {
  assert.equal(waveStrength(RUN0 - 1000), 0, 'calm before');
  assert.equal(waveStrength(RUN0), 0, 'and from nothing');
  assert.ok(waveStrength(RUN0 + WAVES.ramp / 2) > 0.3 && waveStrength(RUN0 + WAVES.ramp / 2) < 0.7, 'building up');
  assert.equal(waveStrength(RUN0 + WAVES.run / 2), 1, 'full in the middle');
  assert.equal(waveStrength(RUN0 + WAVES.run + 1), 0, 'calm after');
  assert.equal(nextWaves(RUN0 - 5000), RUN0);
  assert.equal(nextWaves(RUN0 + 5000), RUN0, 'running now');
  assert.equal(nextWaves(RUN0 + WAVES.run + 5000), RUN0 + WAVES.every);
  assert.equal(wavesLeft(RUN0 + 10_000), WAVES.run - 10_000);
  assert.equal(wavesLeft(RUN0 - 10_000), 0);
  const now = RUN0 + 40_000;
  assert.equal(waveSwell(90, 110, now), waveSwell(90, 110, now), 'one clock, one sea');
  assert.equal(waveSwell(90, 110, RUN0 - 1), 0);
  let top = 0;
  for (let t = RUN0; t < RUN0 + WAVES.run; t += 333) for (let z = DEEP.minZ; z < DEEP.maxZ; z += 1.7) top = Math.max(top, Math.abs(waveSwell(97, z, t)));
  assert.ok(top > WAVES.height * 0.9 && top <= WAVES.height + 1e-9, `how high they get: ${top}`);
  assert.equal(waveSwell(WELLENBAD.minX - 1, 110, now), 0, 'not outside the pool');
  assert.ok(waveFlow(0, 0, now).z < 0, 'toward the beach');
  assert.equal(waveFlow(0, 0, RUN0 - 1).z === 0 || Object.is(waveFlow(0, 0, RUN0 - 1).z, -0), true, 'no current when calm');
});

test('the board says when, and for how long', () => {
  assert.deepEqual(waveBoard(RUN0 - 65_000), { big: 'Wellen in 1:05', small: 'alle 8 Minuten · 2 Minuten lang' });
  assert.deepEqual(waveBoard(RUN0 + 30_000), { big: '🌊 WELLEN!', small: 'noch 1:30' });
});

test('the beach steps down from the deck into the water a walkable step at a time, to the deep water', () => {
  const steps = beachSteps();
  let above = 0;
  for (const s of steps) {
    assert.ok(above - s.top <= STEP + 1e-9 && above - s.top > 0, `a step of ${above - s.top}`);
    above = s.top;
  }
  assert.equal(above, BEACH.bottom);
  assert.equal(steps.at(-1)!.maxZ, DEEP.minZ);
  assert.ok(steps.filter((s) => s.top < WAVE_WATER.surface).length >= 10, 'most of it under the water: you wade in');
  assert.equal(beachFloorAt(97, BEACH.minZ + 0.5), steps[0].top);
  assert.equal(beachFloorAt(97, DEEP.minZ + 1), undefined);
  // The deep water is the pool; the beach isn't (you wade there, on your feet).
  assert.ok(overPool(WAVE_POOL, 97, DEEP.minZ + 1) && !overPool(WAVE_POOL, 97, BEACH.maxZ - 1));
  assert.equal(thermeWhereabouts(97, -0.4, BEACH.minZ + 4), '🏖️ am Wellenstrand');
  assert.equal(thermeWhereabouts(97, WAVE_WATER.surface - WAVE_POOL.sink, 110), '🌊 im Wellenbad');
});

function swimmerAt(x: number, z: number, now: () => number) {
  const keys = new Set<string>();
  const colliders = thermeFixtures().map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom }));
  const p: SwimBody = { pos: new THREE.Vector3(x, WAVE_WATER.surface - 0.2, z), colliders, grounded: false, stepOffset: 0, vy: 0, view: 'first', camYaw: 0, facing: 0, moving: false, rig: null, seat: null, holding: (...c) => c.some((k) => keys.has(k)), stopWalking() {} };
  const s = new Swimmer(p, () => [WAVE_POOL], { stroke() {}, out() {} }, now);
  s.tick(0.05);
  return { p, s, keys };
}

test('in the waves: lifted with the surface, carried toward the beach, kept in the deep by its last step', () => {
  let now = RUN0 + WAVES.run / 2;
  const { p, s } = swimmerAt(97, 110, () => now);
  assert.ok(s.swimming);
  const z0 = p.pos.z;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 200; i++) {
    now += 50;
    p.rig?.(0.05);
    if (i > 40) {
      lo = Math.min(lo, p.pos.y);
      hi = Math.max(hi, p.pos.y);
    }
  }
  assert.ok(hi - lo > 0.4, `rides up and down (${(hi - lo).toFixed(2)} m)`);
  assert.ok(p.pos.z < z0 - 3, `carried shoreward (${z0} → ${p.pos.z.toFixed(1)})`);
  for (let i = 0; i < 1200; i++) {
    now += 50;
    p.rig?.(0.05);
  }
  // Up against the beach: still in the deep, or a wave washed you up onto the beach, on your feet there.
  if (s.swimming) assert.ok(p.pos.z >= DEEP.minZ && inPoolAt(WAVE_POOL, p.pos.x, p.pos.y, p.pos.z), `still swimming in the deep (${p.pos.z.toFixed(2)})`);
  else assert.ok(!p.rig && p.pos.z < DEEP.minZ && p.pos.z > BEACH.minZ, `washed up on the beach (${p.pos.z.toFixed(2)})`);
});

test('at the beach\'s edge in calm water, E climbs out onto its last step', () => {
  const now = RUN0 - 60_000;
  const { p, s, keys } = swimmerAt(97, DEEP.minZ + 3, () => now);
  p.camYaw = 0; // W goes north (-z), to the beach
  keys.add('KeyW');
  for (let i = 0; i < 60; i++) p.rig?.(0.05);
  keys.clear();
  assert.ok(s.swimming && p.pos.z >= DEEP.minZ, `kept in the deep by the step (${p.pos.z.toFixed(2)})`);
  assert.ok(s.atEdge);
  s.climbOut();
  assert.ok(!s.swimming && p.pos.z < DEEP.minZ && p.pos.z > BEACH.maxZ - 1);
});

test('calm water: no lift, no current', () => {
  const now = RUN0 - 60_000;
  const { p } = swimmerAt(97, 110, () => now);
  for (let i = 0; i < 100; i++) p.rig?.(0.05);
  assert.ok(Math.abs(p.pos.z - 110) < 1e-6);
  assert.ok(Math.abs(p.pos.y - (WAVE_WATER.surface - WAVE_POOL.sink)) < 0.06);
});

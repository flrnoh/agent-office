import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Sea } from '../src/client/features/beach/swim.js';
import { waterEdge } from '../src/shared/beach.js';
import { LIGHTHOUSE } from '../src/shared/scenic.js';
import type { PlayerController } from '../src/client/player/index.js';

// Swimming back ashore (flrnoh fork, see FORK.md "A day at the beach"): the ground under the street
// is one slab right across the world, the sea too, and a swimmer's feet are down in it.

const STREET = -3.6;
const GROUND = { minX: -900, maxX: 900, minZ: -900, maxZ: 900, bottom: STREET - 1, top: STREET };
const TOWER = { minX: LIGHTHOUSE.x - 3.8, maxX: LIGHTHOUSE.x + 3.8, minZ: LIGHTHOUSE.z - 3.8, maxZ: LIGHTHOUSE.z + 3.8, bottom: STREET - 1, top: STREET + 30 };

function swimmer(x: number, z: number) {
  const keys = new Set<string>();
  const p = {
    pos: new THREE.Vector3(x, STREET, z),
    colliders: [GROUND, TOWER],
    grounded: true,
    stepOffset: 0,
    vy: 0,
    enabled: true,
    view: 'first',
    camYaw: -Math.PI / 2, // W goes east (+x), back to the beach
    facing: 0,
    moving: false,
    rig: null as ((dt: number) => void) | null,
    keys,
    holding: (...codes: string[]) => codes.some((c) => keys.has(c)),
    stopWalking() {},
  };
  const outs: string[] = [];
  const sea = new Sea(p as unknown as PlayerController, { stroke() {}, out: (how) => outs.push(how) });
  sea.enter(STREET, 0);
  return { p, sea, outs, swim: (secs: number) => {
    keys.add('KeyW');
    for (let i = 0; i < secs * 20 && sea.active; i++) p.rig?.(0.05);
    keys.clear();
  } };
}

test('a swimmer out by the lighthouse swims back to the beach and walks out', () => {
  const s = swimmer(LIGHTHOUSE.x + 8, LIGHTHOUSE.z);
  assert.ok(s.sea.swimming);
  s.swim(40);
  assert.equal(s.sea.active, false, `still in the water at x ${s.p.pos.x.toFixed(1)}`);
  assert.deepEqual(s.outs, ['beach']);
  assert.ok(s.p.pos.x > waterEdge(LIGHTHOUSE.z) - 1);
  assert.equal(s.p.pos.y, STREET);
});

test('the lighthouse still stands in a swimmer\'s way', () => {
  const s = swimmer(LIGHTHOUSE.x - 8, LIGHTHOUSE.z);
  s.swim(10);
  assert.equal(s.sea.active, true);
  assert.ok(s.p.pos.x < TOWER.minX, `swam through the lighthouse to x ${s.p.pos.x.toFixed(1)}`);
  assert.ok(s.p.pos.y < STREET - 0.5, 'still down in the water');
});

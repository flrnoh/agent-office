import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, LOTS, PARK_TREES, STREETS } from '../src/shared/city.js';
import { LANDMARKS, landmarkBox } from '../src/shared/landmarks.js';

// flrnoh fork (see FORK.md): the landmarks' blocks (shared/landmarks.ts).

test('each landmark has a whole city block of its own, with streets round it and nothing of the city on it', () => {
  for (const l of LANDMARKS) {
    const block = BLOCKS.find((b) => b.i === l.i && b.j === l.j);
    assert.equal(block?.kind, 'landmark', `${l.id}'s block`);
    const box = landmarkBox(l.id);
    for (const lot of LOTS) assert.ok(Math.abs(lot.x - box.x) > box.maxX - box.x || Math.abs(lot.z - box.z) > box.maxZ - box.z, `a building on ${l.id}'s block`);
    for (const t of PARK_TREES) assert.ok(t.x < box.minX || t.x > box.maxX || t.z < box.minZ || t.z > box.maxZ, `a park tree on ${l.id}'s block`);
    // A street along at least two of its sides.
    const sides = [STREETS.some((s) => s.alongX && s.a === l.i - 1 && s.b === l.j - 1), STREETS.some((s) => s.alongX && s.a === l.i - 1 && s.b === l.j) || l.j === 0, STREETS.some((s) => !s.alongX && s.a === l.i - 1 && s.b === l.j - 1), STREETS.some((s) => !s.alongX && s.a === l.i && s.b === l.j - 1)];
    assert.ok(sides.filter(Boolean).length >= 2, `${l.id} has streets round it`);
  }
  assert.equal(new Set(LANDMARKS.map((l) => `${l.i},${l.j}`)).size, LANDMARKS.length, 'one landmark a block');
});

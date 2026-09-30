import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACK_MS, Doorbell, RING_GAP_MS } from '../src/client/doorbell.js';
import type { PeerInfo } from '../src/shared/protocol.js';

const peer = (id: string, name: string) => ({ id, name }) as PeerInfo;
const bell = () => {
  const rings: number[] = [];
  const notes: string[] = [];
  const d = new Doorbell(() => rings.push(1), (t) => notes.push(t));
  return { d, rings, notes };
};

test('someone new coming in rings and says who', () => {
  const { d, rings, notes } = bell();
  assert.equal(d.joined(peer('a', 'Ada'), 'me', 1000), true);
  assert.equal(rings.length, 1);
  assert.deepEqual(notes, ['🔔 Ada came in']);
});

test('you, and people already here when you arrived, never ring', () => {
  const { d, rings } = bell();
  d.know([peer('b', 'Bo')]);
  assert.equal(d.joined(peer('me', 'Flo'), 'me', 1000), false);
  assert.equal(d.joined(peer('b2', 'Bo'), 'me', 2000), false, "a second tab of someone who's here");
  assert.equal(rings.length, 0);
});

test('a reload (gone and back within a while) is not an arrival; a real return later is', () => {
  const { d, rings } = bell();
  d.joined(peer('a', 'Ada'), 'me', 0);
  d.left('a', 10_000);
  assert.equal(d.joined(peer('a2', 'Ada'), 'me', 12_000), false);
  d.left('a2', 20_000);
  assert.equal(d.joined(peer('a3', 'Ada'), 'me', 20_000 + BACK_MS + 1), true);
  assert.equal(rings.length, 2);
});

test('leaving one of two tabs does not count as leaving', () => {
  const { d } = bell();
  d.know([peer('a', 'Ada'), peer('a2', 'Ada')]);
  d.left('a', 1000);
  d.left('a2', 1000 + BACK_MS + 5);
  assert.equal(d.joined(peer('a3', 'Ada'), 'me', 1000 + BACK_MS + 10), false, 'she only left at the second tab');
});

test('a crowd arriving at once rings once, but everyone is named', () => {
  const { d, rings, notes } = bell();
  d.joined(peer('a', 'Ada'), 'me', 0);
  d.joined(peer('b', 'Bo'), 'me', 500);
  d.joined(peer('c', 'Cy'), 'me', RING_GAP_MS + 1);
  assert.equal(rings.length, 2);
  assert.equal(notes.length, 3);
});

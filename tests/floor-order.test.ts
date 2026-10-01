import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Building, type FloorDef } from '../src/server/building.js';
import { moveId, reorderById, reorderMap } from '../src/shared/floor-order.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';

// Floors in any order (flrnoh fork, see FORK.md).

function office(t: { after(fn: () => void): void }, ids = ['api', 'web', 'docs']) {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-office-floor-order-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, '.agent-office');
  mkdirSync(dataDir);
  const defs: FloorDef[] = ids.map((id, i) => {
    const dir = path.join(root, 'acme', id);
    mkdirSync(dir, { recursive: true });
    return { id, name: id, repo: `acme/${id}`, dir, palette: i, addedBy: 'Sam', addedAt: 1 };
  });
  writeFileSync(path.join(dataDir, 'floors.json'), JSON.stringify(defs));
  return { root, dataDir };
}

const saved = (dataDir: string) => (JSON.parse(readFileSync(path.join(dataDir, 'floors.json'), 'utf8')) as FloorDef[]).map((d) => d.id);
const ids = (b: Building) => b.list().map((d) => d.id);

test('floors go in the order asked for, saved and still so after a restart', (t) => {
  const { root, dataDir } = office(t);
  const building = new Building(dataDir, root);

  assert.equal(building.reorder(['docs', 'api', 'web']), true);
  assert.deepEqual(ids(building), ['docs', 'api', 'web']);
  assert.deepEqual(saved(dataDir), ['docs', 'api', 'web']);
  assert.deepEqual(ids(new Building(dataDir, root)), ['docs', 'api', 'web']);
});

test("the same order again changes nothing and isn't saved", (t) => {
  const { root, dataDir } = office(t);
  const building = new Building(dataDir, root);
  writeFileSync(path.join(dataDir, 'floors.json'), '"left alone"');

  assert.equal(building.reorder(['api', 'web', 'docs']), false);
  assert.equal(building.reorder([]), false);
  assert.equal(readFileSync(path.join(dataDir, 'floors.json'), 'utf8'), '"left alone"');
});

test('unknown ids, repeats and junk are ignored; floors left out keep their places', (t) => {
  const { root, dataDir } = office(t, ['a', 'b', 'c', 'd']);
  const building = new Building(dataDir, root);

  // Only b and d are named: they swap places, a and c stay put.
  assert.equal(building.reorder(['nope', 'd', 42, null, 'd', 'b', { id: 'a' }]), true);
  assert.deepEqual(ids(building), ['a', 'd', 'c', 'b']);
  assert.deepEqual(saved(dataDir), ['a', 'd', 'c', 'b']);
  // Nothing it knows: nothing moves.
  assert.equal(building.reorder(['x', 'y']), false);
});

test('reorderById keeps unnamed items in their slots and says when nothing moved', () => {
  const id = (s: string) => s;
  assert.deepEqual(reorderById(['a', 'b', 'c'], id, ['c', 'b', 'a']), ['c', 'b', 'a']);
  assert.deepEqual(reorderById(['a', 'x', 'b', 'c'], id, ['c', 'a']), ['c', 'x', 'b', 'a']);
  assert.equal(reorderById(['a', 'b'], id, ['a', 'b']), undefined);
  assert.equal(reorderById(['a', 'b'], id, ['b']), undefined);
  assert.equal(reorderById([], id, ['a']), undefined);
});

test('the open floors (a Map) follow floors.json, even with a floor whose checkout is gone', () => {
  // floors.json knows x, but its checkout is gone so it never opened.
  const defs = ['a', 'x', 'b', 'c'];
  const open = new Map([['a', 1], ['b', 2], ['c', 3]]);
  const order = ['c', 'a', 'b'];
  const nextDefs = reorderById(defs, (s) => s, order)!;
  assert.equal(reorderMap(open, order), true);
  assert.deepEqual([...open.keys()], ['c', 'a', 'b']);
  assert.deepEqual(nextDefs.filter((d) => open.has(d)), [...open.keys()], 'the same relative order in both');
  assert.equal(reorderMap(open, order), false);
});

test('moveId moves one floor to a place, clamped', () => {
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'b', 99), ['a', 'c', 'b']);
  assert.deepEqual(moveId(['a', 'b', 'c'], 'b', -5), ['b', 'a', 'c']);
  assert.deepEqual(moveId(['a', 'b'], 'zz', 0), ['a', 'b']);
});

test("guests can't rearrange the floors", () => {
  assert.ok(TEAM_ONLY_MSGS.has('floor.order'));
  assert.ok(!GUEST_MSGS.has('floor.order'));
});

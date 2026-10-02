import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INTERIORS, INTERIOR_BY_ID, defaultInterior, interiorFor, isInterior } from '../src/shared/interiors.js';
import { MAX_FLOORS } from '../src/shared/floors.js';
import { Interiors } from '../src/server/interiors.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { partyFloorInfo } from '../src/server/party.js';

// Each storey its own interior (flrnoh fork, see FORK.md).

const HEX = /^#[0-9a-f]{6}$/i;

test('every interior is complete: its own id, colors that are colors, a rug color per pod, six chairs', () => {
  assert.equal(new Set(INTERIORS.map((s) => s.id)).size, INTERIORS.length);
  assert.ok(INTERIORS.length >= 8);
  for (const s of INTERIORS) {
    assert.match(s.id, /^[a-z]+$/, s.id);
    assert.ok(s.name && s.emoji && s.blurb, s.id);
    if (s.id !== 'klassik') assert.ok(s.accent, `${s.id} has an accent of its own`);
    for (const c of [s.desk, s.deskLeg, s.wood, s.sofa, s.pot, s.loungeRug, ...(s.accent ? [s.accent] : []), ...s.chairs, ...s.rugs.colors, ...Object.values(s.paint ?? {})]) assert.match(c, HEX, `${s.id}: ${c}`);
    assert.equal(s.chairs.length, 6, s.id);
    assert.equal(s.rugs.colors.length, 4, s.id);
    assert.ok(s.plantScale > 0.5 && s.plantScale < 2, s.id);
  }
});

test('the bottom floor is the office as it always was; no two floors one over the other are furnished alike', () => {
  const klassik = defaultInterior(0);
  assert.equal(klassik.id, 'klassik');
  assert.equal(klassik.paint, undefined, 'the bottom floor keeps its own palette');
  assert.equal(klassik.floor, 'planks');
  assert.equal(klassik.lamp, 'cone');
  for (let i = 1; i < MAX_FLOORS; i++) {
    assert.notEqual(defaultInterior(i).id, defaultInterior(i - 1).id, `floors ${i - 1} and ${i}`);
    assert.notEqual(defaultInterior(i).id, 'klassik', `floor ${i}`);
  }
  // Every other interior turns up within the first few floors.
  assert.deepEqual(new Set(Array.from({ length: INTERIORS.length }, (_, i) => defaultInterior(i).id)), new Set(INTERIORS.map((s) => s.id)));
  assert.equal(defaultInterior(-3).id, 'klassik');
  assert.equal(defaultInterior(Number.NaN).id, 'klassik');
});

test("a floor's pick wins over its place; an unknown pick is ignored", () => {
  assert.equal(interiorFor(0, 'neon').id, 'neon');
  assert.equal(interiorFor(3, 'klassik').id, 'klassik');
  assert.equal(interiorFor(2, null).id, defaultInterior(2).id);
  assert.equal(interiorFor(2, 'nope').id, defaultInterior(2).id);
  assert.equal(isInterior('zen'), true);
  assert.equal(isInterior('__proto__'), false);
  assert.equal(isInterior(42), false);
  assert.equal(INTERIOR_BY_ID.get('loft')?.walls.finish, 'brick');
});

test('picks are kept in interiors.json, only known ones, and survive a restart', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-interiors-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = new Interiors(dir);
  assert.equal(a.of('api'), undefined);
  assert.equal(a.set('api', 'altbau'), true);
  assert.equal(a.set('api', 'altbau'), false, 'the same again changes nothing');
  assert.equal(a.set('web', 'disco'), false, 'not an interior');
  assert.equal(a.set('web', 7), false);
  assert.equal(a.set('web', 'jungle'), true);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'interiors.json'), 'utf8')), { api: 'altbau', web: 'jungle' });
  const b = new Interiors(dir);
  assert.equal(b.of('api'), 'altbau');
  assert.equal(b.set('api', null), true, 'back to its place');
  assert.equal(b.set('api', null), false);
  assert.equal(new Interiors(dir).of('api'), undefined);
  assert.equal(new Interiors(dir).of('web'), 'jungle');
});

test("a broken or tampered interiors.json doesn't stop the office", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-interiors-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'interiors.json'), '{ nope');
  assert.equal(new Interiors(dir).of('api'), undefined);
  writeFileSync(path.join(dir, 'interiors.json'), JSON.stringify({ api: 'neon', web: 'mansion', docs: 3 }));
  const i = new Interiors(dir);
  assert.equal(i.of('api'), 'neon');
  assert.equal(i.of('web'), undefined);
  assert.equal(i.of('docs'), undefined);
});

test("guests can't refurnish a floor; party guests still see how it's furnished", () => {
  assert.ok(TEAM_ONLY_MSGS.has('floor.interior'));
  assert.ok(!GUEST_MSGS.has('floor.interior'));
  const f = { id: 'a', name: 'a', dir: '/x', palette: 1, interior: 'zen', addedBy: 'x', addedAt: 1, workers: 0, busy: 0, waiting: 0, people: 0, wing: 0 };
  assert.equal(partyFloorInfo(f).interior, 'zen');
  assert.equal('interior' in partyFloorInfo({ ...f, interior: undefined }), false);
});

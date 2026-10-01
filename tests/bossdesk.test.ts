// Fork: the boss's desk up in the loft (see FORK.md, "Working at the boss desk").
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BEANBAGS, BOSS_DESK, DESK_BY_ID, LOFT, SEATS, beanbagsOut, builtDesks, nextFreeSeat, vacantSeats } from '../src/shared/layout.js';
import { OFFICE_PLAN, planOf } from '../src/shared/maps/index.js';
import { readHireRequest } from '../src/server/office-workers.js';
import { callsForDog } from '../src/server/dog.js';
import { Ledger } from '../src/server/usage.js';
import { WorkerManager } from '../src/server/workers.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

test('the boss desk is a place a worker can be, up in the loft, on the office map only', () => {
  assert.equal(DESK_BY_ID.get('boss'), BOSS_DESK);
  assert.ok(BOSS_DESK.boss);
  assert.equal(BOSS_DESK.y, LOFT.y);
  assert.ok(BOSS_DESK.x > LOFT.minX && BOSS_DESK.x < LOFT.maxX && BOSS_DESK.z > LOFT.minZ && BOSS_DESK.z < LOFT.maxZ, 'inside the loft');
  assert.equal(OFFICE_PLAN.byId.get('boss'), BOSS_DESK);
  assert.ok(!OFFICE_PLAN.desks.includes(BOSS_DESK) && !OFFICE_PLAN.overflow.includes(BOSS_DESK), 'not one of the desks handed out');
  assert.equal(planOf('castle').byId.has('boss'), false, 'the castle has no loft');
});

test('nobody is ever handed the boss desk: not a new hire, the queue, nor a bean bag count', () => {
  assert.ok(!SEATS.includes(BOSS_DESK));
  const none = () => false;
  assert.notEqual(nextFreeSeat(none)?.id, 'boss');
  // Every seat taken but the boss's: still nothing free.
  const allButBoss = (id: string) => id !== 'boss';
  assert.equal(nextFreeSeat(allButBoss, 2), undefined);
  assert.ok(!builtDesks(2).includes(BOSS_DESK));
  // The boss desk being free doesn't keep the bean bags in (or out).
  assert.deepEqual(beanbagsOut(allButBoss, 0), new Set(BEANBAGS.map((b) => b.id)));
  assert.ok(vacantSeats([]).has('boss'));
  assert.ok(!vacantSeats([{ deskId: 'boss' }]).has('boss'));
});

test('workers asking the office to hire can’t put anyone at the boss desk', () => {
  assert.equal(typeof readHireRequest({ prompt: 'x', desk: 'boss' }, ['claude']), 'string');
  assert.equal(typeof readHireRequest({ prompt: 'x', desk: 'desk-3' }, ['claude']), 'object');
});

test('the dog doesn’t run up to the boss desk', () => {
  const w = { status: 'needs_input', acked: false, deskId: 'boss' } as WorkerInfo;
  assert.equal(callsForDog(w), false);
  assert.equal(callsForDog({ ...w, deskId: 'desk-1' }), true);
});

test('a shell can be opened at the boss desk, once', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-office-boss-'));
  const data = path.join(root, 'data');
  mkdirSync(data, { recursive: true });
  const events = { update() {}, remove() {}, data() {}, screen() {}, toast() {} };
  const workers = new WorkerManager(root, data, 'claude', [], { url: 'http://127.0.0.1:1', token: '' }, events, new Ledger(data, { pauseHiring: false }, () => {}, () => {}));
  t.after(() => {
    workers.shutdown();
    rmSync(root, { recursive: true, force: true });
  });
  const w = workers.spawn('boss', 'test', undefined, false, 'shell');
  assert.equal(typeof w, 'object', String(w));
  if (typeof w === 'string') return;
  assert.equal(w.deskId, 'boss');
  assert.equal(w.kind, 'shell');
  assert.match(workers.spawn('boss', 'test', undefined, false, 'shell') as string, /taken/);
});

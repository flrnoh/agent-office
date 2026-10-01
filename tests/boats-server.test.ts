// flrnoh fork (see FORK.md "A day at the beach"): the jetty's crafts on the server: seats, who drives,
// checking where they go, the horn, each floor's own jetty, and who may send and see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRAFTS, CRAFT_SPECS, moored, type BoatServerMsg } from '../src/shared/boats.js';
import { waterEdge } from '../src/shared/beach.js';
import { Marina, Marinas, boatMessage } from '../src/server/boats.js';
import { GUEST_MSGS, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';

const BOAT = CRAFTS.findIndex((c) => c.kind === 'boat');
const SKI = CRAFTS.findIndex((c) => c.kind === 'jetski');
const sea = (z = 240) => ({ x: waterEdge(z) - 40, z, rotY: 1, speed: 5, steer: 0.1 });

test('one person a seat, and one seat a person', () => {
  const m = new Marina();
  assert.ok(m.enter('ann', SKI, 0));
  assert.ok(!m.enter('bob', SKI, 0), 'the jetski is taken');
  assert.ok(!m.enter('bob', SKI, 1), 'and it has only the one seat');
  assert.ok(m.enter('bob', BOAT, 0));
  assert.ok(m.enter('cid', BOAT, 2));
  assert.deepEqual(m.seatOf('cid'), { craft: BOAT, seat: 2 });
  // Moving to another seat lets go of the first.
  assert.ok(m.enter('cid', BOAT, 3));
  assert.equal(m.state()[BOAT].riders[2], null);
  assert.equal(m.state()[BOAT].riders[3], 'cid');
  assert.ok(!m.enter('dan', 99, 0) && !m.enter('dan', BOAT, -1) && !m.enter('dan', BOAT, 1.5));
  assert.ok(m.leave('ann'));
  assert.ok(!m.leave('ann'));
  assert.equal(m.state()[SKI].riders[0], null);
});

test('only the driver drives, and only on open water; speed and steering are clamped', () => {
  const m = new Marina();
  m.enter('ann', BOAT, 1);
  assert.equal(m.drive('ann', BOAT, sea()), undefined, 'a passenger can’t');
  m.enter('bob', BOAT, 0);
  const t = CRAFT_SPECS.boat.tuning;
  const now = m.drive('bob', BOAT, { ...sea(), speed: 500, steer: -9, rotY: 7 });
  assert.ok(now);
  assert.equal(now.speed, t.top);
  assert.equal(now.steer, -t.steer);
  assert.ok(Math.abs(now.rotY - Math.atan2(Math.sin(7), Math.cos(7))) < 1e-9);
  assert.equal(m.drive('bob', BOAT, { ...sea(), x: waterEdge(240) + 5 }), undefined, 'not up the beach');
  assert.equal(m.drive('bob', BOAT, { ...sea(), x: NaN }), undefined);
  assert.equal(m.drive('bob', SKI, sea()), undefined, 'not someone else’s craft');
  // Getting off at the helm leaves it where it is, stopped.
  m.leave('bob');
  const left = m.state()[BOAT];
  assert.equal(left.speed, 0);
  assert.equal(left.x, sea().x);
});

test('the horn, not too often', () => {
  let clock = 0;
  const m = new Marina(() => clock);
  assert.equal(m.horn('ann'), undefined, 'nobody aboard, no horn');
  m.enter('ann', SKI, 0);
  assert.equal(m.horn('ann'), SKI);
  clock += 100;
  assert.equal(m.horn('ann'), undefined);
  clock += 400;
  assert.equal(m.horn('ann'), SKI);
});

test('every floor has its own jetty, moored until someone takes a craft out', () => {
  const ms = new Marinas();
  assert.deepEqual(ms.view('a'), moored());
  assert.equal(ms.view(undefined), undefined);
  ms.of('a').enter('ann', SKI, 0);
  assert.equal(ms.view('a')![SKI].riders[0], 'ann');
  assert.equal(ms.view('b')![SKI].riders[0], null);
  assert.ok(!ms.leave('b', 'ann'));
  assert.ok(ms.leave('a', 'ann'));
  assert.ok(!ms.leave(undefined, 'ann'));
});

test('boat messages: an answer to whoever asked, the news to the floor, moves only from the driver', () => {
  const ms = new Marinas();
  const sent: BoatServerMsg[] = [];
  const told: { m: BoatServerMsg; droppable?: boolean }[] = [];
  const d = (id: string, floor: string | undefined = 'f') => ({ id, floor, send: (m: BoatServerMsg) => sent.push(m), toNeighbors: (m: BoatServerMsg, droppable?: boolean) => told.push({ m, droppable }) });
  boatMessage(ms, { t: 'boat.enter', craft: SKI, seat: 0 }, d('ann'));
  assert.deepEqual(sent.pop(), { t: 'boats', boats: ms.of('f').state(), answer: true });
  assert.equal(told.pop()?.m.t, 'boats');
  // Someone else asks for the same seat: an answer, and no news.
  boatMessage(ms, { t: 'boat.enter', craft: SKI, seat: 0 }, d('bob'));
  assert.equal(sent.pop()?.t, 'boats');
  assert.equal(told.length, 0);
  boatMessage(ms, { t: 'boat.drive', craft: SKI, ...sea() }, d('ann'));
  const move = told.pop();
  assert.equal(move?.m.t, 'boat.move');
  assert.equal(move?.droppable, true);
  boatMessage(ms, { t: 'boat.drive', craft: SKI, ...sea() }, d('bob'));
  assert.equal(told.length, 0);
  boatMessage(ms, { t: 'boat.horn' }, d('ann'));
  assert.deepEqual(told.pop()?.m, { t: 'boat.horn', craft: SKI });
  // Not on a floor (the roof, a place across the street): nothing at all.
  boatMessage(ms, { t: 'boat.enter', craft: BOAT, seat: 0 }, d('cid', ''));
  assert.equal(sent.length + told.length, 0);
  // Junk from a page.
  boatMessage(ms, { t: 'boat.enter', craft: 'x' as unknown as number, seat: 0 }, d('dan'));
  assert.equal((sent.pop() as Extract<BoatServerMsg, { t: 'boats' }>).boats.flatMap((c) => c.riders).filter(Boolean).length, 1);
  boatMessage(ms, { t: 'boat.leave' }, d('ann'));
  assert.equal(told.pop()?.m.t, 'boats');
});

test('guests and party guests take the boats out too, and see everyone else’s', () => {
  for (const t of ['boat.enter', 'boat.leave', 'boat.drive', 'boat.horn']) {
    assert.ok(GUEST_MSGS.has(t), `guests send ${t}`);
    assert.ok(PARTY_MSGS.has(t), `party guests send ${t}`);
    assert.ok(!TEAM_ONLY_MSGS.has(t));
  }
  for (const t of ['boats', 'boat.move', 'boat.horn']) assert.ok(PARTY_SEES_MSGS.has(t), `party guests see ${t}`);
});

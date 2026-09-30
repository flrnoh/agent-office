import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CAR_LEN, COUNTDOWN_MS, LAPS, MAX_SPEED, MIN_LAP_MS, OFF_LIMIT, RIVALS, Race, SEG, TRACK, autopilot, lapText, ordinal, segmentAt, type RaceEvent } from '../src/shared/racing.js';
import { RIG, RIG_KEPT, RIG_SEAT, checkRigFrame, checkRigResult, insertScore, onRig, type RigScore } from '../src/shared/rig.js';
import { CLOCK_SLACK, RELAY_EVERY, RigTable, Rigs, rigMessage, type RigHooks } from '../src/server/rig.js';
import { SEATING_BY_ID, seatHere } from '../src/shared/layout.js';
import { officeNav, pathLength, type Pt } from '../src/shared/nav.js';
import type { ServerMsg } from '../src/shared/protocol.js';

const STEP = 1 / 60;
/** Runs `race` on `drive` until `until` says stop (or a lot of steps went by), with what happened on the way. */
function run(race: Race, until: (r: Race) => boolean, drive: (r: Race) => Parameters<Race['step']>[1] = (r) => autopilot(r), max = 60 * 600): RaceEvent[] {
  const events: RaceEvent[] = [];
  for (let n = 0; n < max && !until(race); n++) {
    race.step(STEP, drive(race));
    events.push(...race.drain());
  }
  return events;
}

// ---- The race ----------------------------------------------------------------------------------

test('the track is one closed loop: it ends where it starts, level, with a lap a sensible length', () => {
  const segs = TRACK.segments;
  assert.equal(TRACK.length, segs.length * SEG);
  assert.equal(segs[segs.length - 1].y2, 0, 'back down to the start line');
  assert.equal(segs[0].y1, 0);
  for (let i = 1; i < segs.length; i++) assert.ok(Math.abs(segs[i].y1 - segs[i - 1].y2) < 1e-6, `segment ${i} carries on from the last`);
  assert.equal(segmentAt(TRACK, TRACK.length * 2 + SEG * 5.5).index, 5, 'any lap finds the same segment');
  assert.ok(segs.some((s) => s.curve > 3) && segs.some((s) => s.curve < -3), 'bends both ways');
  assert.ok(MIN_LAP_MS > 20_000 && MIN_LAP_MS < 60_000, `the quickest lap there can be is ${MIN_LAP_MS} ms`);
});

test('the lights count down 3, 2, 1 before anyone moves, then it is GO', () => {
  const race = new Race();
  assert.equal(race.phase, 'count');
  assert.equal(race.t, -COUNTDOWN_MS);
  const events = run(race, (r) => r.t >= -500, () => ({ steer: 0, gas: 1, brake: 0, boost: true }));
  assert.equal(race.phase, 'count');
  assert.equal(race.dist, 0, 'no creeping over the line on the gas');
  assert.ok(race.rivals.every((r) => r.speed === 0));
  assert.deepEqual(events, ['count', 'count', 'count']);
  const go = run(race, (r) => r.phase === 'race');
  assert.deepEqual(go, ['go']);
  assert.ok(race.t >= 0 && race.t < 20);
});

test('a race is three laps, each timed from the line, and the flag drops on the third', () => {
  const race = new Race();
  const events = run(race, (r) => r.phase === 'done');
  assert.equal(race.phase, 'done');
  assert.equal(race.laps.length, LAPS);
  assert.equal(events.filter((e) => e === 'lap' || e === 'best').length, LAPS - 1);
  assert.equal(events.filter((e) => e === 'finish').length, 1);
  assert.ok(race.dist >= TRACK.length * LAPS);
  // Each lap is about what the distance takes at the speeds driven: none quicker than can be.
  for (const lap of race.laps) assert.ok(lap >= MIN_LAP_MS, `${lapText(lap)} is no quicker than the quickest there can be`);
  // A standing start makes the first lap the slowest.
  assert.ok(race.laps[0] > race.laps[1]);
  assert.equal(race.total, race.laps.reduce((a, b) => a + b, 0));
  assert.equal(race.t, race.total, 'the clock stops at the flag');
  assert.equal(race.best, Math.min(...race.laps));
  // Nothing more happens to your laps after the flag.
  run(race, () => false, undefined, 300);
  assert.equal(race.laps.length, LAPS);
});

test('the lap time counts from when the nose crossed the line, not the step after', () => {
  const race = new Race();
  run(race, (r) => r.phase === 'race');
  // Put the car just short of the line at a known speed: it crosses 1/4 of the way into the next step.
  race.dist = TRACK.length - MAX_SPEED * STEP * 0.25;
  race.speed = MAX_SPEED;
  race.x = 0;
  const before = race.t;
  race.step(STEP, { steer: 0, gas: 1, brake: 0, boost: false });
  assert.equal(race.laps.length, 1);
  assert.ok(Math.abs(race.laps[0] - (before + STEP * 250)) <= 2, `lap ${race.laps[0]} ms, crossed at ${before + STEP * 250}`);
});

test('the gas takes you up to top speed and no further; the boost past it, until it runs out', () => {
  const race = new Race();
  run(race, (r) => r.phase === 'race');
  const flat = { steer: 0, gas: 1, brake: 0, boost: false };
  race.boost = 0;
  run(race, () => false, (r) => ({ ...flat, steer: autopilot(r).steer }), 60 * 8);
  assert.ok(race.speed <= MAX_SPEED && race.speed > MAX_SPEED * 0.95, `flat out at ${race.speed}`);
  const topped = race.speed;
  race.boost = 1;
  run(race, () => false, (r) => ({ ...flat, steer: autopilot(r).steer, boost: true }), 60);
  assert.ok(race.speed > topped, 'the boost goes faster');
  assert.ok(race.boost < 1, 'and uses the meter');
  run(race, (r) => r.boost === 0, (r) => ({ ...flat, steer: autopilot(r).steer, boost: true }));
  race.step(STEP, { ...flat, boost: true });
  assert.equal(race.boosting, false, 'an empty meter is no boost');
  run(race, () => false, (r) => ({ ...flat, steer: autopilot(r).steer }), 60 * 4);
  assert.ok(race.speed <= MAX_SPEED, 'back down to top speed');
  assert.ok(race.boost > 0, 'the meter fills again');
});

test('off the road you slow right down, and the walls stop you going further', () => {
  const race = new Race();
  run(race, (r) => r.phase === 'race');
  race.speed = MAX_SPEED;
  race.x = 1.5;
  run(race, () => false, () => ({ steer: 0, gas: 1, brake: 0, boost: false }), 60 * 2);
  assert.ok(Math.abs(race.x) > 1, 'still on the grass');
  assert.ok(race.speed <= OFF_LIMIT + 1, `down to ${race.speed}`);
  race.x = 2.3;
  const events = run(race, () => false, () => ({ steer: 1, gas: 1, brake: 0, boost: false }), 60 * 3);
  assert.ok(Math.abs(race.x) <= 2.4 + 1e-9);
  assert.ok(events.includes('wall'));
});

test('running into the back of a rival bumps you back behind it, slower than it', () => {
  const race = new Race();
  run(race, (r) => r.phase === 'race');
  const rival = race.rivals[0];
  rival.dist = race.dist + CAR_LEN * 0.5;
  rival.x = race.x;
  rival.speed = MAX_SPEED * 0.5;
  race.speed = MAX_SPEED;
  race.step(STEP, { steer: 0, gas: 1, brake: 0, boost: false });
  assert.deepEqual(race.drain(), ['bump']);
  assert.ok(race.speed < MAX_SPEED * 0.5);
  assert.ok(race.dist < rival.dist, 'behind it');
});

test('where you are in the race counts the rivals ahead; a quick driver finishes first', () => {
  const race = new Race();
  run(race, (r) => r.phase === 'race');
  race.step(STEP);
  assert.equal(race.place, RIVALS.length + 1, 'from the back of the grid');
  run(race, (r) => r.phase === 'done');
  assert.equal(race.place, 1, 'the autopilot wins');
  assert.equal(ordinal(race.place), '1st');
  // Crawling round, you finish last.
  const slow = new Race();
  run(slow, (r) => r.phase === 'done', (r) => ({ ...autopilot(r), gas: r.speed < MAX_SPEED * 0.55 ? 1 : 0 }), 60 * 1200);
  assert.equal(slow.phase, 'done');
  assert.equal(slow.place, RIVALS.length + 1);
});

test('a race and its frame agree, and a frame survives the trip through the office', () => {
  const race = new Race();
  run(race, (r) => r.laps.length === 1);
  const f = race.frame();
  assert.equal(f.phase, 'race');
  assert.deepEqual(f.laps, race.laps);
  assert.equal(f.cars.length, RIVALS.length * 3);
  assert.deepEqual(checkRigFrame(JSON.parse(JSON.stringify(f))), f);
  assert.equal(checkRigFrame({ ...f, cars: f.cars.slice(1) }), null, 'every rival');
  assert.equal(checkRigFrame({ ...f, speed: MAX_SPEED * 10 }), null, 'no warp speed');
  assert.equal(checkRigFrame({ ...f, phase: 'won' }), null);
  assert.equal(checkRigFrame({ ...f, laps: [1, 2, 3, 4] }), null, 'no fourth lap');
  assert.equal(checkRigFrame(null), null);
});

test('lap times read like a stopwatch', () => {
  assert.equal(lapText(0), '0:00.00');
  assert.equal(lapText(83_456), '1:23.45');
  assert.equal(lapText(29_999), '0:29.99');
  assert.deepEqual([1, 2, 3, 4, 6].map(ordinal), ['1st', '2nd', '3rd', '4th', '6th']);
});

// ---- The tables ----------------------------------------------------------------------------------

const score = (name: string, ms: number, at = 1): RigScore => ({ name, color: '#ef476f', ms, at });

test('a time goes on the table in order, one per driver, and only a quicker one replaces theirs', () => {
  let list: RigScore[] = [];
  ({ list } = insertScore(list, score('Ada', 90_000)));
  let r = insertScore(list, score('Bo', 85_000));
  assert.equal(r.rank, 1);
  list = r.list;
  r = insertScore(list, score('Ada', 95_000));
  assert.equal(r.rank, 0, 'slower than her own');
  assert.deepEqual(r.list, list);
  r = insertScore(list, score('Ada', 80_000));
  assert.equal(r.rank, 1);
  assert.deepEqual(
    r.list.map((s) => [s.name, s.ms]),
    [
      ['Ada', 80_000],
      ['Bo', 85_000],
    ],
  );
  // A tie goes to whoever got there first.
  r = insertScore(r.list, score('Cy', 80_000, 2));
  assert.equal(r.rank, 2);
  assert.equal(insertScore(list, score('Dee', 0)).rank, 0, 'no zero times');
});

test('the table keeps only the quickest few', () => {
  let list: RigScore[] = [];
  for (let i = 0; i < RIG_KEPT; i++) list = insertScore(list, score(`d${i}`, 60_000 + i * 1000)).list;
  assert.equal(list.length, RIG_KEPT);
  assert.equal(insertScore(list, score('slow', 99_000)).rank, 0);
  const quick = insertScore(list, score('quick', 30_000));
  assert.equal(quick.rank, 1);
  assert.equal(quick.list.length, RIG_KEPT);
  assert.ok(!quick.list.some((s) => s.name === `d${RIG_KEPT - 1}`), 'the slowest drops off');
});

test('the building’s tables are still there after a restart, and a broken file is a fresh start', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-rig-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = new RigTable(dir);
  assert.deepEqual(before.record('Ada', '#06d6a0', [31_000, 29_000, 29_500]), { race: 1, lap: 1 });
  assert.deepEqual(before.record('Bo', '#4f86f7', [32_000, 30_000, 30_500]), { race: 2, lap: 2 });
  assert.deepEqual(before.record('Bo', '#4f86f7', [40_000, 40_000, 40_000]), { race: 0, lap: 0 });
  const after = new RigTable(dir);
  assert.deepEqual(
    after.top().races.map((s) => [s.name, s.ms, s.color]),
    [
      ['Ada', 89_500, '#06d6a0'],
      ['Bo', 92_500, '#4f86f7'],
    ],
  );
  assert.deepEqual(
    after.top().laps.map((s) => [s.name, s.ms]),
    [
      ['Ada', 29_000],
      ['Bo', 30_000],
    ],
  );
  assert.ok(JSON.parse(readFileSync(path.join(dir, 'rig.json'), 'utf8')).races.length === 2);
  writeFileSync(path.join(dir, 'rig.json'), '{nope');
  assert.deepEqual(new RigTable(dir).top(), { races: [], laps: [] });
});

// ---- The office's side ---------------------------------------------------------------------------

/** A page's hooks, recording what the office sent where. */
function hooks(id: string, floor: string | undefined, log: { to: string; msg: ServerMsg | string }[]): RigHooks {
  return {
    id,
    who: id.toUpperCase(),
    color: '#ef476f',
    floor,
    send: (msg) => log.push({ to: id, msg }),
    toNeighbors: (msg) => log.push({ to: `others-of-${id}`, msg }),
    changed: () => log.push({ to: 'floor', msg: 'changed' }),
    tablesChanged: () => log.push({ to: 'building', msg: 'tables' }),
    toastFloor: (text) => log.push({ to: 'floor', msg: `toast: ${text}` }),
    warn: (text) => log.push({ to: id, msg: `warn: ${text}` }),
  };
}

function rigs(t: TestContext): Rigs {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-office-rig-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new Rigs(new RigTable(dir));
}

test('one driver at a time on each floor: the next one is told who has it, and can have it once they get out', (t) => {
  const r = rigs(t);
  const log: { to: string; msg: ServerMsg | string }[] = [];
  rigMessage(r, { t: 'rig.play' }, hooks('ada', 'f1', log));
  assert.equal(r.state('f1').driver?.id, 'ada');
  rigMessage(r, { t: 'rig.play' }, hooks('bo', 'f1', log));
  assert.equal(r.state('f1').driver?.id, 'ada', 'still hers');
  assert.ok(log.some((l) => l.to === 'bo' && typeof l.msg === 'string' && l.msg.includes('ADA is at the wheel')));
  assert.ok(log.some((l) => l.to === 'bo' && typeof l.msg === 'object' && l.msg.t === 'rig'), 'and who is');
  // Another floor has its own rig.
  rigMessage(r, { t: 'rig.play' }, hooks('bo', 'f2', log));
  assert.equal(r.state('f2').driver?.id, 'bo');
  rigMessage(r, { t: 'rig.leave' }, hooks('ada', 'f1', log));
  assert.equal(r.state('f1').driver, null);
  rigMessage(r, { t: 'rig.play' }, hooks('cy', 'f1', log));
  assert.equal(r.state('f1').driver?.id, 'cy');
  // Gone from the office (or off the floor): out of the rig, and the floor hears it.
  assert.deepEqual(r.leave('cy'), ['f1']);
  assert.equal(r.state('f1').driver, null);
  assert.deepEqual(r.leave('cy'), []);
  // Nowhere to race without a floor.
  rigMessage(r, { t: 'rig.play' }, hooks('dee', undefined, log));
  assert.ok(log.some((l) => l.to === 'dee' && typeof l.msg === 'string' && l.msg.startsWith('warn:')));
});

test("the driver's race goes out to the others on the floor, not too often, and nobody else's does", (t) => {
  const r = rigs(t);
  assert.ok(r.enter('f1', { id: 'ada', name: 'Ada', color: '#ef476f' }) === null);
  const race = new Race();
  const f = race.frame();
  assert.equal(r.frame('bo', 'f1', f, 1000), null, 'not the driver');
  assert.equal(r.frame('ada', 'f1', { ...f, x: 99 }, 1000), null, 'not a frame');
  assert.deepEqual(r.frame('ada', 'f1', f, 1000), f);
  assert.equal(r.frame('ada', 'f1', f, 1000 + RELAY_EVERY / 2), null, 'too soon after the last');
  assert.deepEqual(r.frame('ada', 'f1', { ...f, phase: 'race', t: 10 }, 1000 + RELAY_EVERY / 2), { ...f, phase: 'race', t: 10 }, 'but the green always goes out');
  assert.ok(r.frame('ada', 'f1', f, 1000 + RELAY_EVERY * 3));
  // Someone walking in sees the race as it is.
  assert.deepEqual(r.view('f1').frame, f);
  assert.equal(r.view('f2').frame, null);
});

test('a finished race goes on the tables only when it adds up with what the office saw', (t) => {
  const r = rigs(t);
  const log: { to: string; msg: ServerMsg | string }[] = [];
  const ada = hooks('ada', 'f1', log);
  rigMessage(r, { t: 'rig.play' }, ada);
  const race = new Race();
  run(race, (x) => x.phase === 'done');
  const laps = race.laps;
  const total = race.total;
  // No green seen: nothing goes on.
  assert.equal(r.finish('ada', 'f1', { laps }, 0).ok, false);
  const t0 = 1_000_000;
  r.frame('ada', 'f1', { ...race.frame(), phase: 'count', t: -3000, laps: [] }, t0 - 3000);
  r.frame('ada', 'f1', { ...race.frame(), phase: 'race', t: 0, laps: [] }, t0);
  // Quicker than the office's own clock allows: turned down.
  assert.equal(r.finish('ada', 'f1', { laps }, t0 + total - CLOCK_SLACK - 1000).ok, false);
  // Laps that couldn't be driven: turned down.
  assert.equal(checkRigResult({ laps: [1000, 1000, 1000] }), null);
  assert.equal(checkRigResult({ laps: laps.slice(1) }), null);
  assert.equal(r.finish('bo', 'f1', { laps }, t0 + total).ok, false, 'not the driver');
  const ok = r.finish('ada', 'f1', { laps }, t0 + total + 200);
  assert.ok(ok.ok);
  assert.equal(r.finish('ada', 'f1', { laps }, t0 + total + 300).ok, false, 'once per race');
  // Through the message: on the tables, the building told, and a toast for the record.
  const r2 = rigs(t);
  rigMessage(r2, { t: 'rig.play' }, ada);
  r2.frame('ada', 'f1', { ...race.frame(), phase: 'count', t: -3000, laps: [] }, Date.now() - total - 4000);
  r2.frame('ada', 'f1', { ...race.frame(), phase: 'race', t: 0, laps: [] }, Date.now() - total - 1000);
  log.length = 0;
  rigMessage(r2, { t: 'rig.finish', result: { laps } }, ada);
  assert.equal(r2.state('f1').scores.races[0]?.ms, total);
  assert.equal(r2.state('f1').scores.laps[0]?.ms, Math.min(...laps));
  assert.ok(log.some((l) => l.to === 'building'));
  assert.ok(log.some((l) => typeof l.msg === 'string' && l.msg.includes('OFFICE GP record')));
  // A new race (the lights again) can go on too.
  r2.frame('ada', 'f1', { ...race.frame(), phase: 'count', t: -3000, laps: [] });
  assert.equal(r2.finish('ada', 'f1', { laps }).ok, false, 'not before its green');
});

// ---- Where it stands -----------------------------------------------------------------------------

test('the rig has a seat you sit in on a floor, and the way round it stays open', () => {
  const seat = SEATING_BY_ID.get(RIG_SEAT);
  assert.ok(seat);
  assert.ok(seatHere(`${RIG_SEAT}:0`, false));
  assert.equal(seatHere(`${RIG_SEAT}:0`, true), undefined, 'not up on the roof');
  assert.ok(onRig(`${RIG_SEAT}:0`));
  assert.ok(!onRig('couch:1') && !onRig(undefined));
  // You get out behind it, onto open floor.
  const nav = officeNav(0);
  assert.ok(nav.walkable(seat.x, seat.z + seat.out), 'somewhere to stand up');
  // It's in the way itself, but the way from the lounge to the arcade, the jukebox and the meeting room's door goes round it.
  assert.ok(!nav.walkable(RIG.x, (RIG.minZ + RIG.maxZ) / 2));
  for (const to of [
    [16.3, 7.05],
    [16.1, 5.4],
    [10.7, 7.6],
  ] as Pt[]) {
    const way = nav.route([14.5, 2.5], to);
    const end = way[way.length - 1];
    assert.ok(Math.hypot(end[0] - to[0], end[1] - to[1]) < 0.5, `gets to ${to}`);
    for (let i = 1; i < way.length; i++) assert.ok(nav.clearLine(way[i - 1], way[i]), `a clear way to ${to}`);
    assert.ok(pathLength(way) < Math.hypot(to[0] - 14.5, to[1] - 2.5) * 1.6, `not the long way round to ${to}`);
  }
});

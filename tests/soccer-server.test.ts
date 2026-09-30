import test from 'node:test';
import assert from 'node:assert/strict';
import { KICK_GAP_MS, Soccer } from '../src/server/soccer/index.js';
import { SOCCER_ARRIVAL, backInSoccer, soccerView } from '../src/server/soccer/place.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_SEES_MSGS } from '../src/server/party.js';
import { KICKOFF_MS, MAX_PER_TEAM, PITCH, PITCH_CX, SOCCER, SOCCER_ENTRY, SOCCER_ROOM, isSoccerMsg, type SoccerServerMsg } from '../src/shared/soccer.js';
import { KICK_MAX } from '../src/shared/soccer-ball.js';
import type { FloorView, ServerMsg } from '../src/shared/protocol.js';

// The soccer hall's game on the server (flrnoh fork, see FORK.md "The soccer hall"): who's in, the
// teams, kicks, the ball's snapshots, goals and the match, on a fake clock with fake positions.

function hall() {
  let now = 1_000_000;
  const pos = new Map<string, { x: number; z: number }>();
  const got = new Map<string, ServerMsg[]>();
  const s = new Soccer({ where: (id) => pos.get(id) ?? null, now: () => now, timer: false });
  const add = (id: string, name = id) => {
    got.set(id, []);
    pos.set(id, { x: SOCCER_ENTRY.x, z: SOCCER_ENTRY.z });
    s.enter({ id, name, send: (m) => got.get(id)!.push(m) });
  };
  const inbox = (id: string) => got.get(id)! as SoccerServerMsg[];
  const last = <K extends SoccerServerMsg['t']>(id: string, t: K) => inbox(id).filter((m): m is Extract<SoccerServerMsg, { t: K }> => m.t === t).at(-1);
  const tick = (ms: number) => {
    for (let i = 0; i < Math.round(ms / (1000 / 30)); i++) {
      now += 1000 / 30;
      s.tick(1 / 30);
    }
  };
  return { s, pos, add, inbox, last, tick, advance: (ms: number) => (now += ms) };
}

test('coming in you see the match and the ball; the teams fill up evenly, five a side at most', () => {
  const h = hall();
  h.add('ann', 'Ann');
  assert.equal(h.inbox('ann')[0].t, 'soccer');
  assert.equal(h.inbox('ann')[1].t, 'soccer.ball');
  const names = ['ann', 'bob', 'cat', 'dan', 'eve', 'fay', 'gus', 'hal', 'ivy', 'jo', 'kim'];
  for (const n of names.slice(1)) h.add(n);
  const teams = names.map((n) => h.s.join(n));
  assert.deepEqual(
    teams.slice(0, 10).map((r) => (r.ok ? r.team : r.reason)),
    ['red', 'blue', 'red', 'blue', 'red', 'blue', 'red', 'blue', 'red', 'blue'],
  );
  assert.deepEqual(h.s.counts(), { red: MAX_PER_TEAM, blue: MAX_PER_TEAM });
  assert.deepEqual(teams[10], { ok: false, reason: 'The pitch is full: 5 a side' });
  // Joining twice keeps your team.
  assert.deepEqual(h.s.join('bob'), { ok: true, team: 'blue' });
  // Leaving the pitch frees the place; the next one goes where there's room.
  assert.ok(h.s.leavePitch('bob'));
  assert.deepEqual(h.s.join('kim'), { ok: true, team: 'blue' });
  // Everyone in the hall sees who plays for whom.
  const view = h.last('ann', 'soccer')!.state;
  assert.equal(view.players.length, 10);
  assert.ok(view.players.some((p) => p.id === 'kim' && p.team === 'blue'));
  assert.ok(!view.players.some((p) => p.id === 'bob'));
  // Only people in the hall can join.
  assert.deepEqual(h.s.join('nobody'), { ok: false, reason: 'Come into the hall first' });
});

test('leaving the hall (or the office) takes you off the pitch; a team emptying pauses the match', () => {
  const h = hall();
  h.add('ann');
  h.add('bob');
  h.s.join('ann');
  h.s.join('bob');
  h.tick(100);
  assert.equal(h.s.match.phase, 'kickoff');
  h.tick(KICKOFF_MS + 100);
  assert.equal(h.s.match.phase, 'play');
  h.s.leave('bob');
  assert.ok(!h.s.has('bob'));
  assert.deepEqual(h.s.counts(), { red: 1, blue: 0 });
  h.tick(100);
  assert.equal(h.s.match.phase, 'paused');
  assert.equal(h.last('ann', 'soccer')!.state.phase, 'paused');
  // Back in and on the pitch: blue again, and it kicks off.
  h.add('bob');
  assert.deepEqual(h.s.join('bob'), { ok: true, team: 'blue' });
  h.tick(100);
  assert.equal(h.s.match.phase, 'kickoff');
  // The last one out: the match is gone and the ball back on the spot.
  h.s.leave('ann');
  h.s.leave('bob');
  assert.equal(h.s.match.phase, 'waiting');
  assert.deepEqual(h.s.match.score, { red: 0, blue: 0 });
});

test('kicks: only players, only close to the ball, only so often, only when their team may', () => {
  const h = hall();
  h.add('ann');
  h.add('bob');
  h.add('cat');
  // Nobody playing yet: watching isn't kicking.
  assert.equal(h.s.kick('ann', 1, 0, 0), 'not playing');
  h.s.join('ann');
  // Practice (only one team): ann may kick, from close by.
  h.pos.set('ann', { x: PITCH_CX + 3, z: 0 });
  assert.equal(h.s.kick('ann', 1, 0, 0), 'too far');
  h.pos.set('ann', { x: PITCH_CX, z: -0.8 });
  assert.equal(h.s.kick('ann', 'hard', 0, 0), 'bad kick');
  assert.equal(h.s.kick('ann', Number.NaN, 0, 0), 'bad kick');
  assert.equal(h.s.kick('ann', 7, 0, -2), null);
  // Clamped: full power, no loft, north (+z).
  assert.ok(Math.abs(h.s.ball.vz - KICK_MAX) < 1e-9 && h.s.ball.vy === 0);
  const kicked = h.last('bob', 'soccer.ball')!;
  assert.equal(kicked.hit, 'kick');
  assert.equal(kicked.by, 'ann');
  // Straight away again: too soon (and the ball's gone anyway).
  assert.equal(h.s.kick('ann', 1, 0, 0), 'too soon');
  h.tick(KICK_GAP_MS);
  assert.equal(h.s.kick('ann', 1, 0, 0), 'too far');
  // A match on: in the kickoff's freeze nobody kicks.
  h.s.join('bob');
  h.tick(100);
  assert.equal(h.s.match.phase, 'kickoff');
  assert.deepEqual([h.s.ball.x, h.s.ball.z], [PITCH_CX, 0]);
  h.pos.set('bob', { x: PITCH_CX, z: 0.8 });
  h.advance(KICK_GAP_MS);
  assert.equal(h.s.kick('bob', 0.5, Math.PI, 0), 'not now');
  h.tick(KICKOFF_MS);
  assert.equal(h.s.match.phase, 'play');
  // After it, the kicking-off team first.
  const kicker = h.s.match.kickoff;
  const [first, second] = kicker === 'red' ? ['ann', 'bob'] : ['bob', 'ann'];
  h.pos.set('ann', { x: PITCH_CX, z: -0.8 });
  h.advance(KICK_GAP_MS);
  assert.equal(h.s.kick(second, 0.3, 0, 0), 'not now');
  assert.equal(h.s.kick(first, 0.3, first === 'ann' ? 0 : Math.PI, 0), null);
  // Kicks from people who aren't in the hall do nothing at all.
  h.s.message('zed', { t: 'soccer.kick', power: 1, dir: 0, loft: 0 });
});

test('the ball goes out while it moves, a goal is seen, scored and told to everyone, and the ball comes back for the kickoff', () => {
  const h = hall();
  h.add('ann', 'Ann');
  h.add('bob', 'Bob');
  h.add('cat', 'Cat');
  h.s.join('ann'); // red: attacks the south goal
  h.s.join('bob'); // blue
  h.tick(KICKOFF_MS + 200);
  assert.equal(h.s.match.phase, 'play');
  // Keep blue well away; ann walks up to the ball (kicking off, or after the moment for the others).
  h.pos.set('bob', { x: PITCH.minX + 1, z: -10 });
  h.tick(3100);
  h.pos.set('ann', { x: PITCH_CX, z: -0.8 });
  h.tick(100);
  const before = h.inbox('cat').filter((m) => m.t === 'soccer.ball').length;
  assert.equal(h.s.kick('ann', 0.8, 0, 0), null);
  // Down the pitch into the south goal.
  h.pos.set('ann', { x: PITCH.maxX - 1, z: -5 });
  h.tick(1000);
  // About 15 a second while it rolls (one more for each thing it hits).
  const snaps = h.inbox('cat').filter((m) => m.t === 'soccer.ball').length - before;
  assert.ok(snaps >= 14 && snaps <= 20, `${snaps} snapshots in 1 s`);
  h.tick(1500);
  assert.deepEqual(h.s.match.score, { red: 1, blue: 0 });
  const goal = h.inbox('cat').find((m) => m.t === 'soccer' && m.event?.kind === 'goal') as Extract<SoccerServerMsg, { t: 'soccer' }>;
  assert.ok(goal);
  assert.match(goal.event!.text!, /GOAL! Red \(Ann\) · Red 1:0 Blue/);
  assert.deepEqual(goal.state.score, { red: 1, blue: 0 });
  // Celebration, then the kickoff: the ball's back on the spot, blue to kick off.
  h.tick(3200);
  assert.equal(h.s.match.phase, 'kickoff');
  assert.equal(h.s.match.kickoff, 'blue');
  assert.deepEqual([h.s.ball.x, h.s.ball.z, h.s.ball.vz], [PITCH_CX, 0, 0]);
});

test('running into the ball dribbles it', () => {
  const h = hall();
  h.add('ann');
  h.s.join('ann');
  // Practice: ann runs north from just behind the ball, a move every 66 ms at 6 m/s.
  let z = -1.2;
  h.pos.set('ann', { x: PITCH_CX, z });
  h.tick(100);
  for (let i = 0; i < 6; i++) {
    z += 6 * 0.066;
    h.pos.set('ann', { x: PITCH_CX, z });
    h.tick(66);
  }
  assert.ok(h.s.ball.vz > 3, `ball at ${h.s.ball.vz} m/s`);
  assert.ok(h.s.ball.z > z, 'ahead of her');
  // Someone watching from the side of the pitch doesn't touch it.
  const w = hall();
  w.add('bob');
  w.pos.set('bob', { x: PITCH_CX, z: -0.3 });
  w.tick(200);
  assert.equal(w.s.ball.vz, 0);
});

test('the place: its id, where you arrive, the view, reconnecting, and the messages sorted for guests and party guests', () => {
  assert.equal(SOCCER, '@soccer');
  assert.ok(SOCCER_ARRIVAL.x > SOCCER_ROOM.minX && SOCCER_ARRIVAL.x < SOCCER_ROOM.maxX && SOCCER_ARRIVAL.z > SOCCER_ROOM.minZ && SOCCER_ARRIVAL.z < PITCH.minZ);
  assert.equal(soccerView({ floor: 'x' } as FloorView).floor, SOCCER);
  assert.ok(backInSoccer(SOCCER, 1));
  assert.ok(!backInSoccer(SOCCER, 0));
  assert.ok(!backInSoccer('@hall', 1));
  for (const t of ['soccer.join', 'soccer.leave', 'soccer.kick']) {
    assert.ok(GUEST_MSGS.has(t), t);
    assert.ok(isSoccerMsg(t));
  }
  assert.ok(!isSoccerMsg('padel.join'));
  assert.ok(PARTY_SEES_MSGS.has('soccer') && PARTY_SEES_MSGS.has('soccer.ball'));
});

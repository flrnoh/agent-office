import test from 'node:test';
import assert from 'node:assert/strict';
import { Soccer } from '../src/server/soccer/index.js';
import { SoccerMatch } from '../src/server/soccer/match.js';
import { MatchStats } from '../src/server/soccer/stats.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_SEES_MSGS } from '../src/server/party.js';
import { KICKOFF_FIRST_MS, KICKOFF_MS, MARKS, PITCH, PITCH_CX, SOCCER_ENTRY, isSoccerMsg, type SoccerServerMsg } from '../src/shared/soccer.js';
import { mvpScore } from '../src/shared/soccer-stats.js';
import { rollDistance } from '../src/shared/soccer-ball.js';
import {
  BALL_HIT_R,
  CONTACT_STEP_MS,
  FOOT_AHEAD,
  FREEKICK_RING,
  RED_OUT_MS,
  RING_MS,
  SETUP_MS,
  SET_PIECE_MS,
  SLIDE,
  SLIDE_EDGE,
  SLIDE_MS,
  SPOT_EDGE,
  WIN_V,
  cardFor,
  firstContact,
  foulSpot,
  inPenaltyArea,
  isPenalty,
  makeSlide,
  mayTakeSetPiece,
  penaltyPlaces,
  penaltySpot,
  pokeOf,
  ringPush,
  slideAt,
  slideLength,
  slideLow,
  slideRefused,
  slideSpeed,
  slideTravel,
} from '../src/shared/soccer-tackle.js';
import { CARD_AFTER_MS, REACT_MS, TACKLE_CHEER_MS, calloutFor, cardCallout, cueOf, react, calmCrowd } from '../src/client/world/soccer/matchday.js';

// Slide tackles and fouls in the soccer hall (flrnoh fork, see FORK.md "The soccer hall"): the slide's
// curve, what it hits first, where a free kick or a penalty is taken, the set pieces' phases on a fake
// clock, cards, the office checking slides, the stats, and every page drawing the same curve.

// ---- The curve -----------------------------------------------------------------------------------

test('a slide goes 3.5 m in 0.45 s, slowing all the way, then lies and gets up (1.25 s in all)', () => {
  const s = makeSlide(0, 0, 0);
  assert.equal(s.d, SLIDE.dist);
  assert.equal(SLIDE_MS, 1250);
  assert.equal(slideTravel(s.d, 0), 0);
  assert.ok(Math.abs(slideTravel(s.d, SLIDE.moveMs) - 3.5) < 1e-9);
  assert.equal(slideTravel(s.d, SLIDE_MS), 3.5);
  let last = 0;
  let lastV = Infinity;
  for (let ms = 10; ms < SLIDE.moveMs; ms += 10) {
    const t = slideTravel(s.d, ms);
    const v = slideSpeed(s.d, ms);
    assert.ok(t > last, 'it keeps going');
    assert.ok(v < lastV, 'slowing');
    last = t;
    lastV = v;
  }
  // It leaves at a sprint and a half, and stops dead.
  assert.ok(slideSpeed(s.d, 0) > 11 && slideSpeed(s.d, 0) < 13);
  assert.equal(slideSpeed(s.d, SLIDE.moveMs), 0);
  assert.deepEqual(
    [0, 200, 449, 450, 849, 850, 1249, 1250].map((ms) => slideAt(s, ms).part),
    ['slide', 'slide', 'slide', 'lie', 'lie', 'up', 'up', 'done'],
  );
  // Facing +z it ends 3.5 m on.
  const end = slideAt(s, SLIDE_MS);
  assert.ok(Math.abs(end.x) < 1e-9 && Math.abs(end.z - 3.5) < 1e-9);
  // Low while it's on, standing again at the end.
  assert.equal(slideLow(0), 0);
  assert.equal(slideLow(300), 1);
  assert.equal(slideLow(SLIDE_MS), 0);
});

test('a slide never goes through the boards: it stops short of them, wherever it starts and whichever way', () => {
  for (let i = 0; i < 400; i++) {
    const x = PITCH.minX + Math.random() * (PITCH.maxX - PITCH.minX);
    const z = PITCH.minZ + Math.random() * (PITCH.maxZ - PITCH.minZ);
    const s = makeSlide(x, z, Math.random() * Math.PI * 4 - Math.PI * 2);
    for (const ms of [0, 100, 300, SLIDE.moveMs, SLIDE_MS]) {
      const p = slideAt(s, ms);
      assert.ok(p.x >= PITCH.minX + SLIDE_EDGE - 1e-6 && p.x <= PITCH.maxX - SLIDE_EDGE + 1e-6, `x ${p.x}`);
      assert.ok(p.z >= PITCH.minZ + SLIDE_EDGE - 1e-6 && p.z <= PITCH.maxZ - SLIDE_EDGE + 1e-6, `z ${p.z}`);
    }
  }
  // Right up against the east boards, sliding into them: nowhere to go.
  assert.equal(slideLength(PITCH.maxX - SLIDE_EDGE, 0, Math.PI / 2), 0);
  // 1.4 m from them: 1 m of it.
  assert.ok(Math.abs(slideLength(PITCH.maxX - 1.4, 0, Math.PI / 2) - 1) < 1e-9);
});

test("every page draws the same curve: from the office's numbers on the wire, to the millimetre", () => {
  const h = hall();
  h.add('ann', 'Ann');
  h.add('bob', 'Bob');
  h.s.join('ann');
  h.s.join('bob');
  h.pos.set('ann', { x: 1.234567, z: -2.345678 });
  h.tick(100);
  h.s.message('ann', { t: 'soccer.slide', dir: 0.7777777, x: 1.3, z: -2.2 });
  const m = h.last('bob', 'soccer.slide')!;
  assert.ok(m && m.no === undefined);
  const wire = { x: m.x, z: m.z, dir: m.dir, d: m.d };
  for (const ms of [0, 50, 123, 300, 449, 800, 1200]) {
    const office = h.s.tackles.where('ann', h.now() + ms)!;
    const page = slideAt(wire, ms);
    // The office's own curve and the one every page draws from the wire are the same.
    assert.ok(Math.abs(office.x - page.x) < 1e-12 && Math.abs(office.z - page.z) < 1e-12, `at ${ms}`);
  }
  // The start the page said was close enough to where the office had her: taken.
  assert.equal(m.x, 1.3);
  assert.equal(m.z, -2.2);
  // Pure: the same start and the same way, the same slide.
  assert.deepEqual(makeSlide(2, 3, 1), makeSlide(2, 3, 1));
});

// ---- What it hits first --------------------------------------------------------------------------

const still = (x: number, z: number) => ({ x, z, y: 0, vx: 0, vz: 0 });
const opp = (id: string, x: number, z: number) => ({ id, x, z, vx: 0, vz: 0 });

test('contacts: the ball in front of the man is won cleanly; from behind, the legs come first: a foul', () => {
  const s = makeSlide(0, 0, 0);
  // Coming at him from the front: the ball's between (it's 0.6 m ahead of him, toward the slider).
  const front = firstContact(s, -1, SLIDE_MS, still(0, 2.4), [opp('bob', 0, 3)]);
  assert.equal(front?.kind, 'ball');
  // Through him from behind: the ball's past him.
  const back = firstContact(s, -1, SLIDE_MS, still(0, 3.6), [opp('bob', 0, 3)]);
  assert.equal(back?.kind, 'legs');
  assert.equal(back?.kind === 'legs' && back.id, 'bob');
  // The ball counts when it's within BALL_HIT_R of the boot (FOOT_AHEAD in front of the body).
  const hit = firstContact(s, -1, SLIDE_MS, still(0, 2), [])!;
  assert.ok(Math.abs(slideAt(s, hit.ms).z + FOOT_AHEAD - 2) < BALL_HIT_R + 0.05);
  // Too high to slide into, or nobody about: a whiff.
  assert.equal(firstContact(s, -1, SLIDE_MS, { ...still(0, 2), y: 0.8 }, []), null);
  assert.equal(firstContact(s, -1, SLIDE_MS, null, []), null);
  // Only in the slide's active part: something it would reach later doesn't count.
  assert.equal(firstContact(s, -1, SLIDE_MS, still(0, 4.6), []), null);
  // Looked for in pieces (the office, tick by tick), it finds the same contact at the same moment.
  let found = null;
  for (let t = -1, n = 0; !found && n < 20; n++) {
    found = firstContact(s, t, t + 1000 / 30, still(0, 2.4), [opp('bob', 0, 3)]);
    t += 1000 / 30;
  }
  assert.deepEqual(found, front);
});

test('contacts: the ball and the legs in the same instant: the ball wins', () => {
  const s = makeSlide(0, 0, 0);
  // Both already touching at the first moment it looks.
  const c = firstContact(s, -1, SLIDE_MS, still(0, 0.8), [opp('bob', 0, 0.85)]);
  assert.equal(c?.kind, 'ball');
  assert.equal(c?.ms, 0);
  // The grid is fixed, so a tie is a tie everywhere.
  assert.ok(CONTACT_STEP_MS < 5);
});

test("a poke: the ball on along the slide; late (slow) it's won, rolling to just past where the slider stops", () => {
  const s = makeSlide(0, 0, 0);
  const early = pokeOf(s, 100);
  assert.ok(!early.won && early.vz >= 7 && Math.abs(early.vx) < 1e-9);
  const lateMs = 380;
  assert.ok(slideSpeed(s.d, lateMs) < WIN_V);
  const late = pokeOf(s, lateMs);
  assert.ok(late.won);
  const left = s.d - slideTravel(s.d, lateMs);
  assert.ok(Math.abs(rollDistance(late.vz) - (left + 0.6)) < 0.01);
});

// ---- Where the set piece is ----------------------------------------------------------------------

test('a free kick is taken where the foul was, kept 2 m inside the boards; the penalty areas and spots', () => {
  assert.deepEqual(foulSpot(1, 2), { x: 1, z: 2 });
  assert.deepEqual(foulSpot(PITCH.maxX - 0.3, PITCH.minZ + 0.5), { x: PITCH.maxX - SPOT_EDGE, z: PITCH.minZ + SPOT_EDGE });
  assert.deepEqual(foulSpot(-50, 50), { x: PITCH.minX + SPOT_EDGE, z: PITCH.maxZ - SPOT_EDGE });
  // The north penalty area: within 5 m of the goal line between the posts.
  assert.ok(inPenaltyArea(PITCH_CX, PITCH.minZ + 4.9, 'north'));
  assert.ok(!inPenaltyArea(PITCH_CX, PITCH.minZ + 5.1, 'north'));
  assert.ok(inPenaltyArea(PITCH_CX + 1.5 + 3, PITCH.minZ + 3.9, 'north'), 'in the arc off the post');
  assert.ok(!inPenaltyArea(PITCH_CX + 1.5 + 4, PITCH.minZ + 4, 'north'), 'outside the arc, in the corner');
  assert.ok(!inPenaltyArea(PITCH_CX, PITCH.minZ - 0.2, 'north'), 'behind the line');
  assert.ok(!inPenaltyArea(PITCH_CX, PITCH.minZ + 2, 'south'));
  assert.ok(inPenaltyArea(PITCH_CX, PITCH.maxZ - 2, 'south'));
  // A foul is a penalty in the fouler's own area: red defends the north goal.
  assert.ok(isPenalty('red', 0, PITCH.minZ + 2));
  assert.ok(!isPenalty('blue', 0, PITCH.minZ + 2));
  assert.deepEqual(penaltySpot('north'), { x: PITCH_CX, z: PITCH.minZ + MARKS.spot });
  assert.deepEqual(penaltySpot('south'), { x: PITCH_CX, z: PITCH.maxZ - MARKS.spot });
  const places = penaltyPlaces('north');
  assert.ok(places.keeper.z < PITCH.minZ + 1 && places.keeper.rotY === 0);
  assert.ok(places.taker.z > penaltySpot('north').z && places.taker.rotY === Math.PI);
  // The ring: someone inside it is put on its edge; outside, they stay.
  const out = ringPush(0.5, 1, 0, 0, FREEKICK_RING)!;
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - FREEKICK_RING) < 0.1);
  assert.equal(ringPush(0, 3.5, 0, 0, FREEKICK_RING), null);
  // Near the boards it's still out of the ring, and on the pitch.
  const edge = ringPush(PITCH.maxX - 0.5, 0, PITCH.maxX - 2, 0, FREEKICK_RING)!;
  assert.ok(Math.hypot(edge.x - (PITCH.maxX - 2), edge.z) >= FREEKICK_RING - 0.01 && edge.x <= PITCH.maxX - 0.4);
});

// ---- The set pieces' phases ----------------------------------------------------------------------

function playing() {
  const m = new SoccerMatch();
  let now = 1_000_000;
  m.update(now, { red: 1, blue: 1 });
  now += KICKOFF_MS;
  m.update(now, { red: 1, blue: 1 });
  assert.equal(m.phase, 'play');
  return { m, at: () => now, on: (ms: number) => (now += ms) };
}

test('a foul stops play: a free kick, the clock stopped, ready after a moment, played on by the fouled team', () => {
  const { m, at, on } = playing();
  on(10_000);
  const clock = m.clock(at());
  assert.ok(m.foul(at(), { kind: 'freekick', team: 'blue', x: 1, z: 2 }));
  assert.equal(m.phase, 'freekick');
  on(500);
  assert.equal(m.clock(at()), clock, 'the clock stopped');
  const v = m.view(at()).setPiece!;
  assert.equal(v.team, 'blue');
  assert.equal(v.ring, FREEKICK_RING);
  assert.equal(v.ringMs, RING_MS - 500);
  assert.equal(v.readyMs, SETUP_MS - 500);
  assert.ok(!m.canTouch('blue', at()) && !m.canTouch('red', at()), 'nobody runs it along');
  assert.ok(!m.setPieceKick('blue', 'bob', at()), 'not ready yet');
  on(SETUP_MS);
  assert.ok(m.setPieceKick('blue', 'bob', at()));
  assert.ok(!m.setPieceKick('red', 'ann', at()), 'not the fouling team');
  const ev = m.taken(at());
  assert.deepEqual(ev, [{ kind: 'restart', team: 'blue' }]);
  assert.equal(m.phase, 'play');
  assert.equal(m.setPiece, null);
  on(1000);
  assert.equal(m.clock(at()), clock - 1000, 'running again');
  // No fouls outside play.
  m.update(at(), { red: 0, blue: 1 });
  assert.equal(m.phase, 'paused');
  assert.ok(!m.foul(at(), { kind: 'freekick', team: 'red', x: 0, z: 0 }));
});

test('a set piece nobody takes goes on by itself after 8 s; a penalty only its taker may take', () => {
  const { m, at, on } = playing();
  m.foul(at(), { kind: 'penalty', team: 'red', x: 0, z: 7.5, taker: 'ann', keeper: 'bob' });
  assert.equal(m.phase, 'penalty');
  on(SETUP_MS);
  assert.ok(m.setPieceKick('red', 'ann', at()));
  assert.ok(!m.setPieceKick('red', 'cat', at()), "a teammate isn't the taker");
  assert.ok(!m.setPieceKick('blue', 'bob', at()));
  on(SET_PIECE_MS - SETUP_MS - 1);
  assert.deepEqual(m.update(at(), { red: 1, blue: 1 }), []);
  on(1);
  const ev = m.update(at(), { red: 1, blue: 1 });
  assert.equal(ev[0].kind, 'restart');
  assert.match(ev[0].text!, /Penalty not taken: play on/);
  assert.equal(m.phase, 'play');
  assert.ok(m.canTouch('blue', at()) && m.canTouch('red', at()));
  assert.ok(mayTakeSetPiece({ kind: 'freekick', team: 'red', x: 0, z: 0 }, 'red', 'anyone'));
});

// ---- Cards and stats -----------------------------------------------------------------------------

test('cards: the second foul in a match is a yellow card, the third a red; tackles count for the man of the match', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(cardFor), [undefined, undefined, 'yellow', 'red', 'red']);
  const st = new MatchStats();
  const ann = { owner: 'name:Ann', name: 'Ann', team: 'red' as const };
  const bob = { owner: 'name:Bob', name: 'Bob', team: 'blue' as const };
  assert.deepEqual(st.foul(ann, bob), { fouls: 1 });
  assert.equal(st.cardOf('name:Ann'), undefined);
  assert.deepEqual(st.foul(ann, bob), { fouls: 2, card: 'yellow' });
  assert.equal(st.cardOf('name:Ann'), 'yellow');
  st.tackle('name:Bob', 'Bob', 'blue');
  st.tackle('name:Bob', 'Bob', 'blue');
  assert.deepEqual(st.foul(ann, bob), { fouls: 3, card: 'red' });
  const v = st.view();
  const a = v.players.find((p) => p.name === 'Ann')!;
  const b = v.players.find((p) => p.name === 'Bob')!;
  assert.deepEqual([a.fouls, a.card, a.tackles], [3, 'red', 0]);
  assert.deepEqual([b.fouled, b.tackles], [3, 2]);
  assert.deepEqual([v.teams.red.fouls, v.teams.blue.tackles], [3, 2]);
  // A fresh match: fresh cards.
  st.reset();
  assert.equal(st.cardOf('name:Ann'), undefined);
  // MVP: +1 per tackle won.
  assert.equal(mvpScore({ goals: 1, assists: 0, onTarget: 1, saves: 0, tackles: 3 }), 7);
  assert.equal(mvpScore({ goals: 1, assists: 0, onTarget: 1, saves: 0 }), 4);
  assert.equal(RED_OUT_MS, 60_000);
});

// ---- The office ----------------------------------------------------------------------------------

function hall() {
  let now = 1_000_000;
  const pos = new Map<string, { x: number; z: number; rotY?: number }>();
  const got = new Map<string, SoccerServerMsg[]>();
  const s = new Soccer({ where: (id) => pos.get(id) ?? null, now: () => now, timer: false });
  const add = (id: string, name = id) => {
    got.set(id, []);
    pos.set(id, { x: SOCCER_ENTRY.x, z: SOCCER_ENTRY.z });
    s.enter({ id, name, send: (m) => got.get(id)!.push(m as SoccerServerMsg) });
  };
  const inbox = (id: string) => got.get(id)!;
  const last = <K extends SoccerServerMsg['t']>(id: string, t: K) => inbox(id).filter((m): m is Extract<SoccerServerMsg, { t: K }> => m.t === t).at(-1);
  const tick = (ms: number) => {
    for (let i = 0; i < Math.round(ms / (1000 / 30)); i++) {
      now += 1000 / 30;
      s.tick(1 / 30);
    }
  };
  return { s, pos, add, inbox, last, tick, now: () => now };
}

/** Ann (red) and Bob (blue) on the pitch, the match in play and the kickoff's first touch over. */
function match() {
  const h = hall();
  h.add('ann', 'Ann');
  h.add('bob', 'Bob');
  h.s.join('ann');
  h.s.join('bob');
  h.pos.set('ann', { x: 0, z: -3 });
  h.pos.set('bob', { x: 0, z: 3 });
  h.tick(100);
  h.tick(KICKOFF_MS + KICKOFF_FIRST_MS + 200);
  assert.equal(h.s.match.phase, 'play');
  return h;
}

/** Bob with the ball at his feet at (x, z), facing `rotY` (it's kept in front of him). */
function bobHasIt(h: ReturnType<typeof hall>, x: number, z: number, rotY: number) {
  h.pos.set('bob', { x, z, rotY });
  Object.assign(h.s.ball, { x: x + Math.sin(rotY) * 0.55, z: z + Math.cos(rotY) * 0.55, y: 0, vx: 0, vz: 0, vy: 0 });
  h.s.poss.id = 'bob';
  h.tick(100);
  assert.equal(h.s.poss.id, 'bob');
}

const events = (h: ReturnType<typeof hall>, id: string) => h.inbox(id).flatMap((m) => (m.t === 'soccer' && m.event ? [m.event] : []));

test('the office: a clean slide wins the ball off the man: poked on, a tackle won', () => {
  const h = match();
  bobHasIt(h, 0, 3, Math.PI); // facing Ann: the ball's between them
  h.pos.set('ann', { x: 0, z: 0 });
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  assert.equal(h.last('bob', 'soccer.slide')?.id, 'ann');
  h.tick(400);
  assert.equal(h.s.match.phase, 'play', 'no foul');
  assert.equal(h.s.poss.id, null, 'Bob lost it');
  assert.ok(h.s.ball.z > 3.5, 'poked on past him');
  const ev = events(h, 'bob').find((e) => e.kind === 'tackle');
  assert.equal(ev?.id, 'ann');
  assert.equal(ev?.team, 'red');
  const line = h.s.match.stats.view().players.find((p) => p.name === 'Ann')!;
  assert.equal(line.tackles, 1);
  // While sliding Ann can't kick (or run it along).
  assert.equal(h.s.kick('ann', 0.5, 0, 0), 'sliding');
});

test('the office: a late slide into the legs is a foul: the whistle, a free kick at the spot, the opponents kept off', () => {
  const h = match();
  bobHasIt(h, 1, 3, 0); // running away from Ann: the ball's past him
  h.pos.set('ann', { x: 1, z: 0.5 });
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  h.tick(400);
  assert.equal(h.s.match.phase, 'freekick');
  const ev = events(h, 'bob').find((e) => e.kind === 'foul')!;
  assert.deepEqual([ev.id, ev.victim, ev.team, ev.penalty, ev.card], ['ann', 'bob', 'blue', false, undefined]);
  assert.match(ev.text!, /Foul by Ann on Bob: Free kick for Blue/);
  // The ball's at the spot (where Bob was), dead still, nobody's.
  assert.ok(Math.abs(h.s.ball.x - 1) < 0.3 && Math.abs(h.s.ball.z - 3) < 0.3);
  assert.equal(h.s.poss.id, null);
  const v = h.last('ann', 'soccer')!.state;
  assert.equal(v.setPiece?.kind, 'freekick');
  assert.equal(v.setPiece?.team, 'blue');
  // Ann (fouling team) may not touch it, even standing on it; Bob not before it's ready.
  h.pos.set('ann', { x: h.s.ball.x, z: h.s.ball.z - 0.6 });
  h.tick(1500); // Ann's up again
  assert.equal(h.s.kick('ann', 0.5, 0, 0), 'not now');
  h.pos.set('bob', { x: h.s.ball.x, z: h.s.ball.z - 0.5 });
  h.tick(100);
  // Ann standing right by the ball doesn't take it (nobody runs it along at a set piece).
  assert.equal(h.s.poss.id, null);
  assert.equal(h.s.kick('bob', 0.3, 0, 0), null);
  assert.equal(h.s.match.phase, 'play');
  assert.ok(events(h, 'ann').some((e) => e.kind === 'restart'));
  const stats = h.s.match.stats.view().players;
  assert.equal(stats.find((p) => p.name === 'Ann')!.fouls, 1);
  assert.equal(stats.find((p) => p.name === 'Bob')!.fouled, 1);
});

test('the office: a foul in your own penalty area is a penalty: the spot, the fouled player the taker, the keeper picked', () => {
  const h = match();
  // Bob (blue) runs at the north goal, Red's: Ann slides into him from behind in her own area.
  bobHasIt(h, 0, PITCH.minZ + 2.5, Math.PI);
  h.pos.set('ann', { x: 0, z: PITCH.minZ + 5.5 });
  h.s.message('ann', { t: 'soccer.slide', dir: Math.PI });
  h.tick(400);
  assert.equal(h.s.match.phase, 'penalty');
  const ev = events(h, 'bob').find((e) => e.kind === 'foul')!;
  assert.equal(ev.penalty, true);
  const sp = h.last('bob', 'soccer')!.state.setPiece!;
  assert.deepEqual([sp.kind, sp.team, sp.taker, sp.keeper], ['penalty', 'blue', 'bob', 'ann']);
  assert.deepEqual({ x: h.s.ball.x, z: h.s.ball.z }, penaltySpot('north'));
  // Only the taker: after the moment to get ready, from the spot.
  h.tick(SETUP_MS + 1200);
  h.pos.set('bob', { x: 0, z: penaltySpot('north').z + 0.8 });
  h.tick(100);
  assert.equal(h.s.kick('bob', 1, Math.PI, 0), null);
  assert.equal(h.s.match.phase, 'play');
});

test('the office: the second foul is a yellow card (on the scoreboard), the third a red: off the pitch for a minute', () => {
  const h = match();
  const foul = (then: 'freekick' | 'paused' = 'freekick') => {
    h.tick(SLIDE.cooldownMs + 100);
    bobHasIt(h, 1, 3, 0);
    h.pos.set('ann', { x: 1, z: 0.5 });
    h.s.message('ann', { t: 'soccer.slide', dir: 0 });
    h.tick(400);
    assert.equal(h.s.match.phase, then);
    const ev = events(h, 'bob').filter((e) => e.kind === 'foul').at(-1)!;
    if (then !== 'freekick') return ev;
    // Taken quickly, play on.
    h.tick(SETUP_MS + 900);
    h.pos.set('bob', { x: h.s.ball.x, z: h.s.ball.z - 0.5 });
    h.tick(50);
    assert.equal(h.s.kick('bob', 0.2, Math.PI / 2, 0), null);
    return ev;
  };
  assert.equal(foul().card, undefined);
  const second = foul();
  assert.equal(second.card, 'yellow');
  assert.match(second.text!, /🟨 yellow card/);
  assert.equal(h.last('bob', 'soccer')!.state.players.find((p) => p.id === 'ann')?.card, 'yellow');
  // The red card leaves Red empty: the match waits.
  const third = foul('paused');
  assert.equal(third.card, 'red');
  assert.equal(h.s.teamOf('ann'), undefined, 'sent off');
  assert.ok(events(h, 'bob').some((e) => e.kind === 'leave' && /sent off/.test(e.text ?? '')));
  const no = h.s.join('ann');
  assert.ok(!no.ok && /Sent off/.test(no.reason));
  h.tick(RED_OUT_MS + 100);
  assert.deepEqual(h.s.join('ann'), { ok: true, team: 'red' });
});

test('the office: a free kick nobody takes goes on by itself after 8 s', () => {
  const h = match();
  bobHasIt(h, 1, 3, 0);
  h.pos.set('ann', { x: 1, z: 0.5 });
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  h.tick(400);
  assert.equal(h.s.match.phase, 'freekick');
  h.tick(SET_PIECE_MS + 200);
  assert.equal(h.s.match.phase, 'play');
  assert.ok(events(h, 'ann').some((e) => e.kind === 'restart' && /not taken/.test(e.text ?? '')));
});

test('the office checks a slide: on the pitch, on a team, one every 2 s, not in the other team’s kickoff', () => {
  const h = hall();
  h.add('ann', 'Ann');
  h.add('bob', 'Bob');
  h.add('cat', 'Cat');
  // Not on a team: no.
  h.s.message('cat', { t: 'soccer.slide', dir: 0 });
  assert.equal(h.last('cat', 'soccer.slide')?.no, 'not playing');
  h.s.join('ann');
  h.s.join('bob');
  // Off the pitch (still by the doors): no.
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  assert.equal(h.last('ann', 'soccer.slide')?.no, 'off the pitch');
  h.pos.set('ann', { x: 0, z: -3 });
  h.pos.set('bob', { x: 0, z: 3 });
  h.tick(100);
  assert.equal(h.s.match.phase, 'kickoff');
  assert.equal(h.s.match.kickoff, 'red');
  // Blue may not slide in Red's kickoff; Red may.
  h.tick(700);
  h.s.message('bob', { t: 'soccer.slide', dir: Math.PI });
  assert.equal(h.last('bob', 'soccer.slide')?.no, 'kickoff');
  assert.equal(slideRefused('kickoff', 'blue', 'red'), 'kickoff');
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  assert.equal(h.last('bob', 'soccer.slide')?.id, 'ann');
  assert.ok(h.s.tackles.sliding('ann', h.now()));
  // Again at once: still sliding; once up, still too soon.
  h.tick(700);
  assert.equal(h.s.tackles.start('ann', 'red', { x: 0, z: -3 }, 0, {}, h.now()).ok, false);
  h.tick(700);
  const again = h.s.tackles.start('ann', 'red', { x: 0, z: -3 }, 0, {}, h.now());
  assert.deepEqual(again, { ok: false, reason: 'too soon' });
  h.tick(700);
  assert.equal(h.s.tackles.start('ann', 'red', { x: 0, z: -3 }, 0, {}, h.now()).ok, true);
  // Not at a set piece, a goal or full time.
  for (const phase of ['freekick', 'penalty', 'goal', 'over'] as const) assert.equal(slideRefused(phase, 'red'), 'not now');
  for (const phase of ['play', 'waiting', 'paused'] as const) assert.equal(slideRefused(phase, 'red'), null);
  // A start far from where the office has you isn't believed; a bad way isn't a slide.
  h.tick(SLIDE.cooldownMs + 100);
  const far = h.s.tackles.start('ann', 'red', { x: 0, z: -3 }, 0, { x: 5, z: 5 }, h.now());
  assert.ok(far.ok && far.slide.x === 0 && far.slide.z === -3);
  h.tick(SLIDE.cooldownMs + 100);
  assert.deepEqual(h.s.tackles.start('ann', 'red', { x: 0, z: -3 }, Number.NaN, {}, h.now()), { ok: false, reason: 'bad slide' });
});

test('in practice (no match) a slide still pokes the ball, but nobody fouls', () => {
  const h = hall();
  h.add('ann', 'Ann');
  h.add('bob', 'Bob');
  h.s.join('ann');
  h.pos.set('ann', { x: 0, z: 0.5 });
  h.pos.set('bob', { x: 0, z: 3 }); // watching, not on a team
  Object.assign(h.s.ball, { x: 0, z: 3.6, y: 0, vx: 0, vz: 0, vy: 0 });
  h.tick(100);
  assert.equal(h.s.match.phase, 'waiting');
  h.s.message('ann', { t: 'soccer.slide', dir: 0 });
  h.tick(400);
  assert.equal(h.s.match.phase, 'waiting');
  assert.ok(!events(h, 'ann').some((e) => e.kind === 'foul'));
});

// ---- Guests, the crowd and the announcer ---------------------------------------------------------

test('guests and party guests slide too, and see everyone’s slides', () => {
  assert.ok(isSoccerMsg('soccer.slide'));
  assert.ok(GUEST_MSGS.has('soccer.slide'));
  assert.ok(PARTY_SEES_MSGS.has('soccer.slide'));
});

test('the crowd whistles a foul and cheers a clean tackle; the announcer calls the foul, the penalty and the card', () => {
  assert.deepEqual(cueOf({ kind: 'foul', team: 'blue', who: 'Ann' }), { kind: 'foul' });
  assert.deepEqual(cueOf({ kind: 'tackle', team: 'red', id: 'ann' }), { kind: 'tackle', team: 'red' });
  const boo = react(calmCrowd(0), { kind: 'foul' }, 1000);
  assert.equal(boo.act, 'boo');
  assert.equal(boo.until, 1000 + REACT_MS.boo);
  const cheer = react(calmCrowd(0), { kind: 'tackle', team: 'red' }, 1000);
  assert.deepEqual([cheer.act, cheer.team, cheer.until], ['cheer', 'red', 1000 + TACKLE_CHEER_MS]);
  // A tackle doesn't cut a goal's cheer short.
  const goal = react(calmCrowd(0), { kind: 'goal', team: 'blue' }, 1000);
  assert.equal(react(goal, { kind: 'tackle', team: 'red' }, 1500), goal);
  const view = { phase: 'freekick' as const, score: { red: 1, blue: 0 }, clockMs: 0, running: false, players: [] };
  assert.deepEqual(calloutFor({ kind: 'foul', team: 'red', who: 'Bob' }, view), { head: 'FOUL!', sub: 'FREISTOSS für Rot – Foul von Bob', team: 'red', horn: false });
  assert.equal(calloutFor({ kind: 'foul', team: 'blue', who: 'Ann', penalty: true }, view)!.head, 'ELFMETER!');
  assert.equal(cardCallout({ kind: 'foul', team: 'red', who: 'Bob', card: 'yellow' })!.head, '🟨 Gelbe Karte – Bob');
  assert.equal(cardCallout({ kind: 'foul', team: 'red', who: 'Bob', card: 'red' })!.head, '🟥 Rote Karte – Bob');
  assert.equal(cardCallout({ kind: 'foul', team: 'red', who: 'Bob' }), null);
  assert.ok(CARD_AFTER_MS > 1000);
});

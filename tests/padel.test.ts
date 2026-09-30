import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_R, HALF_L, PEV, SERVICE, backEdge, netHeight, sideEdge, type Slot } from '../src/shared/padel/court.js';
import { PADEL, PHASE, flight, launch, mayHit, newPadel, padel, serveSpots, serviceBox, type PadelState } from '../src/shared/padel/game.js';
import { GAMES_TO_WIN, awardPoint, golden, newScore, pointsLine, receiverFor, serverFor } from '../src/shared/padel/rules.js';
import { seeded } from '../src/shared/tablegames/game.js';

// ---- Scoring -----------------------------------------------------------------------------------

test('padel scoring: 15, 30, 40, game; the golden point at deuce; first to four games', () => {
  const sc = newScore();
  assert.equal(awardPoint(sc, 0), 'point');
  assert.equal(pointsLine(sc), '15–0');
  awardPoint(sc, 0);
  awardPoint(sc, 1);
  assert.equal(pointsLine(sc), '30–15');
  assert.equal(awardPoint(sc, 0), 'point');
  assert.equal(pointsLine(sc), '40–15');
  assert.equal(awardPoint(sc, 0), 'game');
  assert.deepEqual(sc.games, [1, 0]);
  assert.deepEqual(sc.points, [0, 0]);
  // 40–40: no advantage, the next point takes the game.
  for (let i = 0; i < 3; i++) {
    awardPoint(sc, 0);
    awardPoint(sc, 1);
  }
  assert.ok(golden(sc));
  assert.equal(pointsLine(sc), 'Golden point');
  assert.equal(awardPoint(sc, 1), 'game');
  assert.deepEqual(sc.games, [1, 1]);
  // The match: the fourth game.
  const m = newScore();
  m.games = [GAMES_TO_WIN - 1, 2];
  m.points = [3, 0];
  assert.equal(awardPoint(m, 0), 'match');
  assert.equal(m.win, 0);
  assert.deepEqual(m.games, [4, 2]);
  // Nothing more after it.
  assert.equal(awardPoint(m, 1), 'match');
  assert.deepEqual(m.games, [4, 2]);
});

test('padel serving: the teams by turns a game each, the players within a team by turns, diagonally from the right first', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => serverFor([Math.ceil(n / 2), Math.floor(n / 2)])), [0, 2, 1, 3, 0]);
  assert.equal(receiverFor(0, [0, 0]), 2);
  assert.equal(receiverFor(0, [1, 0]), 3);
  assert.equal(receiverFor(3, [1, 1]), 0);
  // The receiver stands across the diagonal from the server, deep in the other half.
  const spots = serveSpots({ games: [0, 0], points: [0, 0] });
  assert.ok(spots[0][1] > SERVICE && spots[0][0] > 0, 'the server is behind the service line on the right (team 0 faces -z: +x)');
  assert.ok(spots[2][1] < -SERVICE && spots[2][0] < 0, 'the receiver is across the diagonal');
  const box = serviceBox({ games: [0, 0], points: [0, 0] });
  assert.deepEqual(box, { minX: -5, maxX: 0, minZ: -SERVICE, maxZ: 0 });
  assert.deepEqual(serviceBox({ games: [0, 0], points: [1, 0] }), { minX: 0, maxX: 5, minZ: -SERVICE, maxZ: 0 });
});

// ---- The court's edges ------------------------------------------------------------------------

test('padel court: glass to 3 m at the back and the side ends, fence above it and along the sides, openings at the net', () => {
  assert.equal(backEdge(1), 'glass');
  assert.equal(backEdge(3.5), 'fence');
  assert.equal(backEdge(4.5), 'open');
  assert.equal(sideEdge(-9, 2.5), 'glass');
  assert.equal(sideEdge(9, 3.5), 'fence');
  assert.equal(sideEdge(5, 1), 'fence');
  assert.equal(sideEdge(5, 3.2), 'open');
  assert.equal(sideEdge(1, 1), 'open', 'the opening beside the net');
  assert.equal(sideEdge(0, 0.5), 'fence', 'round the net post');
  assert.ok(netHeight(0) < netHeight(4.9));
  assert.equal(netHeight(0), 0.88);
});

// ---- The rules in play --------------------------------------------------------------------------

/** A rally already going: `last` hit it, the ball where and how given, the players well away. */
function rally(o: { last: 0 | 1; b: number[]; bounces?: number; crossed?: boolean; serve?: boolean }): PadelState {
  const s = newPadel();
  s.phase = PHASE.rally;
  s.last = o.last;
  s.lastSlot = o.last * 2;
  s.b = o.b as PadelState['b'];
  s.bounces = o.bounces ?? 0;
  s.crossed = o.crossed === false ? 0 : 1;
  s.serveBall = o.serve ? 1 : 0;
  return s;
}

/** Runs it until the point's over (or `max` seconds), with nobody swinging. What happened, in order. */
function play(s: PadelState, max = 6): number[] {
  const rng = seeded(7);
  const kinds: number[] = [];
  for (let t = 0; t < max && s.phase === PHASE.rally; t += 1 / 60) {
    const ev: number[] = [];
    padel.step(s, 1 / 60, ev, rng);
    for (let i = 0; i < ev.length; i += 3) kinds.push(ev[i]);
  }
  return kinds;
}

test('padel rules: in, then a second bounce, is the hitter’s point', () => {
  const s = rally({ last: 0, b: [0, 1.2, -1, 0, 1, -4], crossed: true });
  const kinds = play(s);
  assert.equal(kinds.filter((k) => k === PEV.bounce).length >= 2, true);
  assert.deepEqual(s.points, [1, 0]);
  assert.equal(s.phase, PHASE.dead);
});

test('padel rules: straight into the other side’s glass, before the bounce, is out', () => {
  const s = rally({ last: 0, b: [0, 1.5, -4, 0, 2, -22], crossed: true });
  const kinds = play(s);
  assert.equal(kinds[0], PEV.glass);
  assert.deepEqual(s.points, [0, 1]);
});

test('padel rules: after its bounce the ball may come off the glass and stays in play', () => {
  const s = rally({ last: 0, b: [0, 0.3, -7.6, 0, -1, -10], crossed: true });
  const kinds = play(s);
  const bounce = kinds.indexOf(PEV.bounce);
  const glass = kinds.indexOf(PEV.glass);
  assert.ok(bounce >= 0 && glass > bounce, `a bounce, then the glass: ${kinds}`);
  // The glass didn't end it: the second bounce did, and it's still the hitter's point.
  assert.ok(kinds.lastIndexOf(PEV.bounce) > glass);
  assert.deepEqual(s.points, [1, 0]);
});

test('padel rules: the fence is the end of the point — out before the bounce, a winner after it', () => {
  const before = rally({ last: 0, b: [3, 1, -5, 12, 0.5, 0], crossed: true });
  assert.ok(play(before).includes(PEV.fence));
  assert.deepEqual(before.points, [0, 1]);
  const after = rally({ last: 0, b: [3, 1, -5, 12, 0.5, 0], crossed: true, bounces: 1 });
  assert.ok(play(after).includes(PEV.fence));
  assert.deepEqual(after.points, [1, 0]);
  // Over the back wall's glass into the wire on top: the same.
  const high = rally({ last: 1, b: [0, 3.4, 9.5, 0, 0, 12], crossed: true, bounces: 1 });
  assert.ok(play(high).includes(PEV.fence));
  assert.deepEqual(high.points, [0, 1]);
});

test('padel rules: into the net and down on your own side is the other side’s point', () => {
  const s = rally({ last: 0, b: [0, 0.5, 2, 0, 0, -10], crossed: false });
  const kinds = play(s);
  assert.equal(kinds[0], PEV.net);
  assert.deepEqual(s.points, [0, 1]);
});

test('padel rules: out through an opening after the bounce is a winner, before it out', () => {
  const after = rally({ last: 1, b: [3, 0.8, 0.95, 14, 0, 0], crossed: true, bounces: 1 });
  assert.ok(play(after).includes(PEV.out));
  assert.deepEqual(after.points, [0, 1]);
  const before = rally({ last: 1, b: [3, 0.8, 0.95, 14, 0, 0], crossed: true });
  play(before);
  assert.deepEqual(before.points, [1, 0]);
});

test('padel rules: a serve has to land in the box across; a fault, then a double fault', () => {
  const s = newPadel();
  const rng = seeded(3);
  /** Serves, and once it's struck sends it where `to` says (x, z), and runs on until the ball's dead. */
  const serve = (to: [number, number] | null) => {
    padel.input(s, 0, [1, -2, -4, 0]);
    const kinds: number[] = [];
    let sent = false;
    for (let t = 0; t < 5 && s.phase !== PHASE.dead; t += 1 / 120) {
      if (to && !sent && s.phase === PHASE.rally && s.serveBall) {
        sent = true;
        const v = launch(s.b[0], s.b[1], s.b[2], to[0], to[1], { vh: 10 });
        s.b[3] = v[0];
        s.b[4] = v[1];
        s.b[5] = v[2];
      }
      if (!to && s.bounces === 1) return kinds;
      const ev: number[] = [];
      padel.step(s, 1 / 120, ev, () => 0.5);
      for (let i = 0; i < ev.length; i += 3) kinds.push(ev[i]);
    }
    return kinds;
  };
  // Aimed into the box: it lands there, and it's in play.
  const box = serviceBox(s);
  assert.ok(box.maxX === 0 && box.minZ === -SERVICE);
  serve(null);
  assert.equal(s.bounces, 1, 'the serve came down in the box');
  assert.equal(s.phase, PHASE.rally);
  // Long, past the service line: a fault, the second serve.
  Object.assign(s, newPadel());
  const one = serve([-2, -8.5]);
  assert.ok(one.includes(PEV.fault), `a fault: ${one}`);
  assert.equal(s.second, 1);
  assert.deepEqual(s.points, [0, 0]);
  for (let i = 0; i < 200 && s.phase === PHASE.dead; i++) padel.step(s, 1 / 60, [], rng);
  assert.equal(s.phase, PHASE.serve);
  // Into the wrong box: the double fault is the receivers' point.
  serve([2, -4]);
  assert.deepEqual(s.points, [0, 1]);
  assert.equal(s.second, 0);
});

test('padel rules: who may hit — not twice for a side, no volley on the return of serve, volleys otherwise fine', () => {
  const s = rally({ last: 0, b: [0, 1.2, -3, 0, 0, -5], crossed: true });
  assert.ok(mayHit(s, 1), 'a volley');
  assert.ok(!mayHit(s, 0), 'not the side that just hit it');
  s.serveBall = 1;
  assert.ok(!mayHit(s, 1), 'no volley on the return of serve');
  s.bounces = 1;
  assert.ok(mayHit(s, 1), 'after its bounce, fine');
  // A swing in reach sends it back over.
  const r = rally({ last: 0, b: [0.6, 1.0, -6, 0, 0, -2], crossed: true, bounces: 1 });
  r.p[2] = [0, -6.3, 0, 0, 0, 0];
  r.p[3] = [-3, -5, 0, 0, 0, 0];
  r.aim[2] = [2, 7, 0];
  padel.input(r, 2 as Slot, [1, 2, 7, 0]);
  const ev: number[] = [];
  for (let i = 0; i < 40 && r.last === 0; i++) padel.step(r, 1 / 60, ev, seeded(1));
  assert.equal(r.last, 1, 'team 1 hit it');
  assert.ok(r.b[5] > 0, 'toward the other half');
});

// ---- Physics ---------------------------------------------------------------------------------------

test('padel physics: a drive lands where it was aimed, over the net; each bounce is lower than the last', () => {
  const from = [1, 1, 7] as const;
  const v = launch(from[0], from[1], from[2], -2, -6, { vh: 14, clear: 0.2 });
  const path = flight([from[0], from[1], from[2], ...v], 3, 1 / 240);
  const land = path.find((q) => q.bounced === 1)!;
  assert.ok(Math.abs(land.x + 2) < 0.2 && Math.abs(land.z + 6) < 0.3, `landed at ${land.x.toFixed(2)}, ${land.z.toFixed(2)}`);
  const atNet = path.find((q) => q.z <= 0)!;
  assert.ok(atNet.y > netHeight(atNet.x) + BALL_R, `over the net at ${atNet.y.toFixed(2)}`);
  // Drop a ball: every bounce lower, and it stays in the court.
  const drop = flight([0, 2, -5, 0, 0, 0], 4, 1 / 240);
  const tops: number[] = [];
  for (let i = 1; i < drop.length - 1; i++) if (drop[i].y > 0.05 && drop[i].y > drop[i - 1].y && drop[i].y >= drop[i + 1].y) tops.push(drop[i].y);
  assert.ok(tops.length >= 2);
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] < tops[i - 1]);
  assert.ok(Math.abs(tops[0] - 2 * PADEL.floorBounce ** 2) < 0.1, `the first bounce back up to ${tops[0].toFixed(2)} m`);
  // Off the back glass it comes back slower.
  const wall = flight([0, 1.5, -8, 0, 3, -10], 1, 1 / 240);
  const back = wall.find((q, i) => i > 0 && q.z > wall[i - 1].z)!;
  assert.ok(back, 'it came back off the glass');
  assert.ok(wall.every((q) => q.z >= -HALF_L));
});

test('padel snapshots: encode and decode round trip', () => {
  const s = newPadel();
  const rng = seeded(11);
  for (let i = 0; i < 400; i++) {
    for (const slot of [0, 1, 2, 3] as Slot[]) for (const a of padel.cpu(s, slot, rng)) padel.input(s, slot, a);
    padel.step(s, 1 / 60, [], rng);
  }
  const a = padel.encode(s);
  assert.ok(a.length <= 96 && a.every(Number.isFinite));
  const d = padel.decode(a);
  assert.deepEqual(padel.encode(d), a);
});

// ---- The computer -------------------------------------------------------------------------------

test('padel: four computer players play a whole match, in a handful of minutes, with real rallies', () => {
  for (const seed of [1, 2, 3]) {
    const rng = seeded(seed);
    const s = padel.init();
    let t = 0;
    let points = 0;
    let glass = 0;
    while (s.win === -1 && t < 20 * 60) {
      for (const slot of [0, 1, 2, 3] as Slot[]) for (const a of padel.cpu(s, slot, rng)) padel.input(s, slot, a);
      const ev: number[] = [];
      padel.step(s, 1 / 60, ev, rng);
      for (let i = 0; i < ev.length; i += 3) {
        if (ev[i] === PEV.point) points++;
        if (ev[i] === PEV.glass) glass++;
      }
      assert.ok(s.b.every(Number.isFinite) && s.p.flat().every(Number.isFinite));
      t += 1 / 60;
    }
    assert.notEqual(s.win, -1, `seed ${seed}: the match ended`);
    assert.equal(s.games[s.win], GAMES_TO_WIN);
    assert.ok(t > 3 * 60 && t < 12 * 60, `seed ${seed}: ${(t / 60).toFixed(1)} minutes`);
    assert.ok(s.hits / points > 3, `seed ${seed}: ${(s.hits / points).toFixed(1)} shots a point`);
    assert.ok(glass > 10, 'balls come off the glass');
  }
});

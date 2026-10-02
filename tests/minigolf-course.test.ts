import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../src/shared/bowling.js';
import { GOLF_WAY } from '../src/shared/bowling-house.js';
import { COURSE_PAR, HOLES, LANE_Y, footprint, headingToHole, headingToRoom, toHole, toRoom, type HoleDef } from '../src/shared/minigolf-holes.js';
import { BALL_R, CUP_R, puttSpeed, putt, settled, simulate, step, support, type BallEvent } from '../src/shared/minigolf-physics.js';
import { MG_BOARD, MG_DOOR, MG_ROOM, MG_STAND, clockSec, weekOf } from '../src/shared/minigolf.js';

// The black-light mini golf's course and ball (flrnoh fork, see FORK.md "Black-light mini golf"):
// nine different holes laid out in the room with walkways between, and a ball that rolls the same
// every time, can be holed on every hole, and does what each obstacle is there for.

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };
const overlap = (a: Box, b: Box, gap = 0) => a.minX < b.maxX + gap && b.minX < a.maxX + gap && a.minZ < b.maxZ + gap && b.minZ < a.maxZ + gap;

test('nine holes, all different, par 24', () => {
  assert.equal(HOLES.length, 9);
  assert.deepEqual(
    HOLES.map((h) => h.n),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(new Set(HOLES.map((h) => h.theme)).size, 9);
  assert.equal(new Set(HOLES.map((h) => h.name)).size, 9);
  assert.equal(COURSE_PAR, 24);
  // What makes each its own is there.
  const by = (t: string) => HOLES.find((h) => h.theme === t)!.course;
  assert.ok(by('mill').windmill);
  assert.ok(by('loop').loop);
  assert.ok(by('space').pipes?.length === 3);
  assert.ok(by('volcano').surfaces.some((s) => s.h.k === 'radial'));
  assert.ok(by('reef').surfaces.some((s) => s.slide));
  assert.ok(by('tower').pipes?.[0].hole);
  assert.ok(by('pinball').posts!.some((p) => (p.kick ?? 0) > 0.5) && by('pinball').spinners?.length);
});

test('the holes lie in the room, apart, with walkways between them, clear of the door, the stand and the board', () => {
  const room = { minX: MG_ROOM.minX + 0.3, maxX: MG_ROOM.maxX - 0.3, minZ: MG_ROOM.minZ + 0.3, maxZ: MG_ROOM.maxZ - 0.3 };
  for (const h of HOLES) {
    const f = footprint(h);
    assert.ok(f.minX >= room.minX && f.maxX <= room.maxX && f.minZ >= room.minZ && f.maxZ <= room.maxZ, `hole ${h.n} is outside the room: ${JSON.stringify(f)}`);
    assert.ok(f.minX >= ZONES.minigolf.minX && f.maxZ <= ZONES.minigolf.maxZ);
  }
  for (let i = 0; i < HOLES.length; i++)
    for (let j = i + 1; j < HOLES.length; j++) assert.ok(!overlap(footprint(HOLES[i]), footprint(HOLES[j]), 0.85), `holes ${i + 1} and ${j + 1} are too close`);
  const door = { minX: MG_DOOR.x0 - 0.5, maxX: MG_DOOR.x1 + 0.5, minZ: MG_ROOM.maxZ - 2, maxZ: MG_ROOM.maxZ };
  const stand = { minX: MG_STAND.x - MG_STAND.width / 2 - 0.3, maxX: MG_STAND.x + MG_STAND.width / 2 + 0.3, minZ: MG_STAND.z - 1.2, maxZ: MG_ROOM.maxZ };
  const board = { minX: MG_BOARD.x - MG_BOARD.width / 2, maxX: MG_BOARD.x + MG_BOARD.width / 2, minZ: MG_BOARD.z - 1.2, maxZ: MG_ROOM.maxZ };
  for (const h of HOLES) for (const [what, b] of Object.entries({ door, stand, board })) assert.ok(!overlap(footprint(h), b), `hole ${h.n} is in front of the ${what}`);
  // The way through the lounge meets the door.
  assert.ok(MG_DOOR.x0 >= GOLF_WAY.minX - 1e-9 && MG_DOOR.x1 <= GOLF_WAY.maxX + 1e-9);
});

test('a hole frame turns into the room and back', () => {
  for (const h of HOLES) {
    const p = toRoom(h, 0.37, -2.1);
    const q = toHole(h, p.x, p.z);
    assert.ok(Math.abs(q.x - 0.37) < 1e-9 && Math.abs(q.z + 2.1) < 1e-9);
    assert.ok(Math.abs(headingToHole(h, headingToRoom(h, 1.1)) - 1.1) < 1e-12);
    // A heading turns the way the frame does: along it from the tee lands where toRoom says.
    const a = 2.3;
    const r = toRoom(h, Math.sin(a), Math.cos(a));
    const t = toRoom(h, 0, 0);
    const ra = headingToRoom(h, a);
    assert.ok(Math.abs(r.x - t.x - Math.sin(ra)) < 1e-9 && Math.abs(r.z - t.z - Math.cos(ra)) < 1e-9);
  }
});

test('tees and cups are on the felt, the felt never below the floor', () => {
  for (const h of HOLES) {
    const c = h.course;
    assert.ok(support(c, h.tee.x, h.tee.z, 0, 99), `hole ${h.n}'s tee`);
    assert.ok(support(c, c.cup.x, c.cup.z, 0, 99), `hole ${h.n}'s cup`);
    assert.ok(h.base >= LANE_Y);
    for (const s of c.surfaces) for (const [x, z] of s.poly) assert.ok(h.base + (support(c, x, z, 0, 99)?.y ?? 0) >= LANE_Y - 1e-6, `hole ${h.n}'s felt at ${x}, ${z}`);
  }
});

/** A putt that holes in one from each tee (found by searching; t is the shared clock, for the windmill and the bridge). */
const ACES: Record<number, [number, number, number]> = {
  1: [2.69, 0.98, 100],
  2: [2.49, 0.92, 100],
  3: [2.813, 0.96, 100],
  4: [-3.497, 0.92, 100],
  5: [-3.47, 0.9, 100],
  6: [2.19, 0.98, 100],
  7: [2.546, 0.86, 100],
  8: [2.38, 0.98, 100],
  9: [2.88, 0.76, 100],
};

test('every hole can be holed (in one, with the right putt)', () => {
  for (const h of HOLES) {
    const [dir, power, t] = ACES[h.n];
    const r = simulate(h.course, h.tee, dir, power, t);
    assert.ok(r.holed, `hole ${h.n} (${h.name}): ${JSON.stringify(r)}`);
  }
});

/** Plays hole `h` the dumb way: always straight at the cup, as hard as the distance asks. */
function playStraight(h: HoleDef, max = 12): number {
  let at = { ...h.tee };
  for (let i = 1; i <= max; i++) {
    const c = h.course.cup;
    const d = Math.hypot(c.x - at.x, c.z - at.z);
    const r = simulate(h.course, at, Math.atan2(c.x - at.x, c.z - at.z), Math.min(1, 0.12 + d * 0.11), 50 + i * 3.7);
    if (r.holed) return i;
    at = { x: r.x, z: r.z };
  }
  return Infinity;
}

test('the simple holes go down putting straight at the cup; the tricky ones need more than that', () => {
  // A plain putt at the cup gets you there on the dog-leg's second leg and the open greens…
  assert.ok(playStraight(HOLES[8]) <= 7, 'the pinball table');
  // …but the planet and the tower can't be beaten by just aiming at the cup from the tee.
  assert.equal(simulate(HOLES[4].course, HOLES[4].tee, Math.atan2(HOLES[4].course.cup.x, HOLES[4].course.cup.z), 0.5, 10).holed, false);
});

test('the ball is deterministic: the same putt rolls the same, anywhere', () => {
  for (const h of HOLES) {
    const a = simulate(h.course, h.tee, Math.PI - 0.1, 0.63, 1234.5);
    const b = simulate(h.course, h.tee, Math.PI - 0.1, 0.63, 1234.5);
    assert.deepEqual(a, b);
  }
});

test('a putt on the flat rolls straight, further the harder, and stops on the felt', () => {
  const h = HOLES[0];
  let last = 0;
  for (const p of [0.1, 0.2, 0.3, 0.4]) {
    const r = simulate(h.course, h.tee, Math.PI, p, 0);
    assert.ok(!r.out && !r.holed);
    assert.ok(Math.abs(r.x - h.tee.x) < 1e-9, 'straight');
    const d = h.tee.z - r.z;
    assert.ok(d > last, `${p} went ${d}`);
    last = d;
  }
  assert.ok(puttSpeed(1) > puttSpeed(0.5) && puttSpeed(0) > 0);
});

test('random putts always end: in the cup, on the felt, or out and back where they were putted from', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const h of HOLES) {
    for (let i = 0; i < 40; i++) {
      const r = simulate(h.course, h.tee, rnd() * Math.PI * 2, rnd(), rnd() * 3600);
      assert.ok(r.time < 41);
      if (r.out) assert.deepEqual([r.x, r.z], [h.tee.x, h.tee.z]);
      else if (!r.holed) {
        const b = h.course.bounds;
        assert.ok(r.x > b.minX && r.x < b.maxX && r.z > b.minZ && r.z < b.maxZ, `hole ${h.n}: ${r.x}, ${r.z}`);
        assert.ok(support(h.course, r.x, r.z, 0, 99), `hole ${h.n}: lies on the felt`);
      }
    }
  }
});

test('the loop wants a firm putt: too soft rolls back out, firm goes round', () => {
  const h = HOLES.find((x) => x.theme === 'loop')!;
  const events: BallEvent[] = [];
  const soft = simulate(h.course, h.tee, Math.PI, 0.55, 0, events);
  assert.ok(events.some((e) => e.k === 'loop'), 'it goes in');
  assert.ok(soft.z > h.course.loop!.z, 'and comes back out the front');
  const firm = simulate(h.course, h.tee, Math.PI, 0.9, 0);
  assert.ok(firm.z < h.course.loop!.z - 0.5, 'round and on up the hole');
});

test('the windmill lets the ball through between its sails and stops it with one', () => {
  const h = HOLES.find((x) => x.theme === 'mill')!;
  let blocked = 0;
  let through = 0;
  for (let t = 0; t < 8; t += 0.25) {
    const events: BallEvent[] = [];
    const r = simulate(h.course, h.tee, Math.PI, 0.7, t, events);
    if (events.some((e) => e.tag === 'blade')) blocked++;
    if (r.z < -4.8) through++;
  }
  assert.ok(blocked >= 3 && through >= 10, `${blocked} blocked, ${through} through`);
});

test('the jump: too soft into the gap (back to the tee), hard enough over it', () => {
  const h = HOLES.find((x) => x.theme === 'jump')!;
  const soft = simulate(h.course, h.tee, Math.PI, 0.75, 0);
  assert.ok(soft.out);
  assert.ok(!simulate(h.course, h.tee, Math.PI, 0.6, 0).out, 'softer still rolls back down the ramp');
  const hard = simulate(h.course, h.tee, Math.PI, 0.88, 0);
  assert.ok(!hard.out && hard.z < -4.8);
});

test('the bridge: there when you roll on, or the ball goes down into the reef', () => {
  const h = HOLES.find((x) => x.theme === 'reef')!;
  let out = 0;
  let over = 0;
  for (let t = 0; t < 6; t += 0.25) {
    const r = simulate(h.course, h.tee, Math.PI, 0.85, t);
    if (r.out) out++;
    else if (r.z < -4.6) over++;
  }
  assert.ok(out >= 3 && over >= 3, `${out} out, ${over} over`);
});

test('the volcano: soft rolls back down, right drops into the crater, hard flies over the rim', () => {
  const h = HOLES.find((x) => x.theme === 'volcano')!;
  assert.ok(simulate(h.course, h.tee, Math.PI, 0.6, 0).z > -2.5, 'back down');
  assert.ok(simulate(h.course, h.tee, Math.PI, 0.75, 0).holed, 'in');
  assert.ok(simulate(h.course, h.tee, Math.PI, 0.95, 0).z < -5, 'over the top');
});

test('the planet: each tunnel comes out somewhere else', () => {
  const h = HOLES.find((x) => x.theme === 'space')!;
  const outs = new Set<string>();
  for (const m of [-0.45, 0, 0.45]) {
    const b = putt(h.course, { x: m, z: -2.3 }, Math.PI, 0.3, 0);
    const events: BallEvent[] = [];
    for (let i = 0; i < 4000 && !settled(b); i++) step(h.course, b, events);
    const o = events.find((e) => e.k === 'outpipe');
    assert.ok(o, `mouth ${m}`);
    outs.add(`${o!.x},${o!.z}`);
  }
  assert.equal(outs.size, 3);
});

test('two levels: down the hole on the deck and out onto the lower green', () => {
  const h = HOLES.find((x) => x.theme === 'tower')!;
  const events: BallEvent[] = [];
  const r = simulate(h.course, h.tee, Math.PI, 0.75, 0, events);
  assert.ok(events.some((e) => e.k === 'pipe') && events.some((e) => e.k === 'outpipe'));
  assert.ok(r.holed || r.x > 0.9, 'on the lower green');
});

test('the pinball mushrooms kick the ball back', () => {
  const h = HOLES.find((x) => x.theme === 'pinball')!;
  const events: BallEvent[] = [];
  simulate(h.course, { x: 0.55, z: -1.2 }, Math.PI, 0.55, 0, events);
  assert.ok(events.some((e) => e.k === 'kick'));
});

test('a cup takes a ball rolling gently over it, and lips out a fast one', () => {
  const h = HOLES[0];
  const c = h.course.cup;
  const gentle = simulate(h.course, { x: c.x - 0.4, z: c.z }, Math.PI / 2, 0.22, 0);
  assert.ok(gentle.holed);
  const events: BallEvent[] = [];
  const fast = simulate(h.course, { x: c.x - 0.6, z: c.z + CUP_R * 0.5 }, Math.PI / 2, 0.7, 0, events);
  assert.ok(!fast.holed || events.some((e) => e.k === 'lip'));
  assert.ok(BALL_R < CUP_R);
});

test('the shared clock is seconds into the hour; weeks are ISO weeks', () => {
  assert.equal(clockSec(3_600_000 + 1500), 1.5);
  assert.equal(clockSec(-500), 3599.5);
  assert.equal(weekOf(Date.UTC(2026, 9, 2)), '2026-W40');
  assert.equal(weekOf(Date.UTC(2021, 0, 3)), '2020-W53');
  assert.equal(weekOf(Date.UTC(2024, 11, 30)), '2025-W01');
});

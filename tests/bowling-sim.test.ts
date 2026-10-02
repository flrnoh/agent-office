import test from 'node:test';
import assert from 'node:assert/strict';
import { BowlSim, PinState, bowl, fullRack, lean, maskOf } from '../src/shared/bowling-sim.js';
import { BALLS, FULL_RACK, HEAD_PIN_D, LANE_HALF, OIL_D, PIN_SPOTS, PIT_D, boardU, cleanThrow, slideEnd, uBoard, type ThrowParams } from '../src/shared/bowling-game.js';
import { isSplit } from '../src/shared/bowling-score.js';

const at = (...ns: number[]) => ns.map((n) => ({ n: n - 1, u: PIN_SPOTS[n - 1].u, d: PIN_SPOTS[n - 1].d }));
const throwOf = (p: Partial<ThrowParams>): ThrowParams => ({ u: 0, back: 4, power: 0.6, line: 0, spin: 0, ...p });
/** Runs the ball (no pins) down to `d`, and where it is there. */
function ballAt(p: ThrowParams, d: number, lbs = 14) {
  const s = new BowlSim(p, lbs, []);
  let rolledAt = -1;
  while (!s.done && s.ball.d < d) {
    s.step();
    const b = s.ball;
    if (rolledAt < 0 && Math.abs(b.vu + b.cu) + Math.abs(b.vd + b.cd) < 1e-9) rolledAt = b.d;
  }
  return { ...s.ball, rolledAt };
}

test('the same throw gives the same pins, every time and after the wire', () => {
  const p = throwOf({ u: boardU(11), line: -0.007, spin: 0.75, power: 0.64 });
  const a = bowl(p, 14, fullRack());
  const b = bowl(cleanThrow(JSON.parse(JSON.stringify(p)))!, 14, fullRack());
  assert.deepEqual(a, b);
  // And step by step: the page plays the same steps the office counted.
  const s = new BowlSim(p, 14, fullRack());
  while (!s.done) s.step();
  assert.deepEqual(s.standing(), a.standing);
});

test('a ball with no spin goes straight; with spin it skids through the oil and hooks in the dry back end', () => {
  const straight = ballAt(throwOf({ u: 0, spin: 0 }), HEAD_PIN_D);
  assert.ok(Math.abs(straight.u) < 0.002, `straight stays on board 20 (${uBoard(straight.u)})`);
  const p = throwOf({ u: boardU(10), spin: 1, power: 0.6 });
  const oilEnd = ballAt(p, OIL_D);
  const pins = ballAt(p, HEAD_PIN_D);
  const inOil = uBoard(oilEnd.u) - 10;
  const total = uBoard(pins.u) - 10;
  assert.ok(total > 10 && total < 22, `a full hook moves it 10–22 boards left (${total.toFixed(1)})`);
  assert.ok(inOil < total / 2, `most of it in the back end (${inOil.toFixed(1)} of ${total.toFixed(1)} in the oil)`);
  assert.ok(pins.rolledAt > OIL_D, `it rolls only once it's off the oil (${pins.rolledAt.toFixed(1)} m)`);
  // A back-up ball curls the other way; more pace, less hook.
  assert.ok(uBoard(ballAt(throwOf({ u: 0, spin: -1 }), HEAD_PIN_D).u) < 12);
  const fast = uBoard(ballAt(throwOf({ u: boardU(10), spin: 1, power: 1 }), HEAD_PIN_D).u) - 10;
  assert.ok(fast < total, 'a faster ball hooks less');
});

test('over the edge it drops into the gutter and knocks nothing', () => {
  const r = bowl(throwOf({ u: LANE_HALF - 0.06, line: 0.03 }), 14, fullRack());
  assert.ok(r.gutter);
  assert.equal(r.knocked, 0);
  const s = new BowlSim(throwOf({ u: -LANE_HALF + 0.06, line: -0.03 }), 10, fullRack());
  const seen = new Set<string>();
  while (!s.done) {
    s.step();
    for (const e of s.events) seen.add(e.k);
  }
  assert.ok(seen.has('gutter') && seen.has('pit') && !seen.has('pin'));
});

test('a good pocket hit with a hook strikes; head-on leaves something', () => {
  assert.equal(bowl({ u: 0.2973, back: 4, power: 0.65, line: -0.005, spin: 0.8 }, 14, fullRack()).knocked, 10);
  assert.equal(bowl({ u: 0.2162, back: 4, power: 0.65, line: -0.015, spin: 0.8 }, 14, fullRack()).knocked, 10);
  const head = bowl(throwOf({ u: 0, spin: 0 }), 14, fullRack());
  assert.ok(head.knocked < 10 && head.knocked >= 5, `head-on knocks ${head.knocked}`);
});

test('over a range of throws: strikes, splits and misses all happen, and pins only ever go down', () => {
  let strikes = 0;
  let splits = 0;
  let open = 0;
  for (let b = 5; b <= 25; b += 2)
    for (const spin of [0, 0.5, 1])
      for (const line of [-0.02, -0.01, 0, 0.01]) {
        const r = bowl(throwOf({ u: boardU(b), spin, line, power: 0.62 }), 14, fullRack());
        assert.ok(r.knocked >= 0 && r.knocked <= 10);
        assert.ok(r.secs > 1.5 && r.secs <= 9.01, `settles in time (${r.secs})`);
        if (r.knocked === 10) strikes++;
        else if (isSplit(maskOf(r.standing))) splits++;
        else open++;
      }
  assert.ok(strikes > 5, `strikes ${strikes}`);
  assert.ok(splits > 3, `splits ${splits}`);
  assert.ok(open > 20, `the rest ${open}`);
});

test('the second ball faces only what stood, where it stood', () => {
  // The 10 pin alone, picked up from the right side straight on.
  assert.equal(bowl(throwOf({ u: boardU(5), power: 0.6 }), 14, at(10)).knocked, 1);
  // Straight down the middle between the 7 and the 10: nothing.
  const split = bowl(throwOf({ u: 0 }), 14, at(7, 10));
  assert.equal(split.knocked, 0);
  assert.deepEqual(split.standing.map((p) => p.n + 1).sort((a, b) => a - b), [7, 10]);
  // A moved pin stays where it was moved to.
  const moved = [{ n: 4, u: 0.02, d: Math.round((PIN_SPOTS[4].d + 0.03) * 1e4) / 1e4 }];
  assert.deepEqual(bowl(throwOf({ u: boardU(35) }), 14, moved).standing, moved);
});

test('stepping over the foul line is a foul', () => {
  assert.ok(slideEnd(1, 1) > 0, 'right up to the line at full pace: over it');
  assert.ok(slideEnd(4, 1) < 0, 'from the dots: behind it');
  assert.equal(bowl(throwOf({ back: 1, power: 1 }), 14, fullRack()).foul, true);
  assert.equal(bowl(throwOf({ back: 4, power: 1 }), 14, fullRack()).foul, false);
});

test('falling pins go over smoothly and land; nothing leaves the deck sideways past the kickbacks', () => {
  assert.equal(lean(0), 0);
  assert.equal(lean(1), 1);
  assert.ok(lean(0.5) > 0.6 && lean(0.5) < 0.75);
  const s = new BowlSim(throwOf({ u: 0.2973, power: 0.65, line: -0.005, spin: 0.8 }), 14, fullRack());
  while (!s.done) {
    s.step();
    for (const p of s.pins) {
      assert.ok(p.s >= 0 && p.s <= 1);
      if (p.state !== PinState.Gone) assert.ok(Math.abs(p.u) < 0.8 && p.d <= PIT_D + 0.03);
    }
  }
  assert.ok(s.pins.every((p) => p.state === PinState.Down || p.state === PinState.Gone));
});

test('the page’s numbers are made safe', () => {
  assert.equal(cleanThrow(null), null);
  assert.equal(cleanThrow({ u: 0, back: 4, power: 'x', line: 0, spin: 0 }), null);
  assert.equal(cleanThrow({ u: 0, back: 4, power: NaN, line: 0, spin: 0 }), null);
  const c = cleanThrow({ u: 9, back: 99, power: 7, line: -1, spin: 3 })!;
  assert.ok(c.u < LANE_HALF && c.back < 5 && c.power === 1 && c.line > -0.1 && c.spin === 1);
  assert.equal(maskOf(fullRack()), FULL_RACK);
  assert.ok(BALLS.every((b, i) => b.id === i));
});

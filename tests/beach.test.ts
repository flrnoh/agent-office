// flrnoh fork (see FORK.md "A day at the beach"): the sea, swimming, the jetty, the boats' water and
// the kiosk's menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JETTY, SAILBOATS, SEA_LEVEL, SWIM_OUT, SWIM_SINK, WADE, atLadder, inSea, inSwimZone, onWater, seaDepth, swimDepth, swimmingAt, wadingAt, waterEdge } from '../src/shared/beach.js';
import { CRAFTS, CRAFT_SPECS, craftFits, craftPoint, moored, steerCraft } from '../src/shared/boats.js';
import { KIOSK_ITEMS, isKioskBite, isKioskGlass, isKioskItem } from '../src/shared/kiosk.js';
import { heldAnywhere, holdSeconds, isSnack } from '../src/shared/fridge.js';
import { DRINK_BY_ID, ROOF } from '../src/shared/rooftop.js';
import { LIGHTHOUSE, LOOP, LOOP_PAVED, PIER, onLoop, shoreX } from '../src/shared/scenic.js';
import { heldDrink, keepsHeld } from '../src/server/held.js';

const STREET = -3.6;

test('the sea starts at the water’s edge and gets deeper over the first few meters out', () => {
  for (const z of [120, 200, PIER.z + 20, 300]) {
    const edge = waterEdge(z);
    assert.equal(edge, shoreX(z));
    assert.equal(seaDepth(edge + 5, z), 0, 'dry sand');
    assert.equal(inSea(edge + 1, z), false);
    assert.ok(inSea(edge - 1, z));
    assert.ok(seaDepth(edge - 1, z) > 0 && seaDepth(edge - 1, z) < SWIM_SINK * 0.5, 'ankle deep at first');
    assert.equal(seaDepth(edge - WADE - 1, z), SWIM_SINK, 'out of your depth past the shallows');
    assert.ok(!swimDepth(edge - 2, z));
    assert.ok(swimDepth(edge - WADE - 2, z));
    // Deeper the further out, never past swimming depth.
    let last = 0;
    for (let x = edge; x > edge - 30; x -= 0.5) {
      const d = seaDepth(x, z);
      assert.ok(d >= last && d <= SWIM_SINK);
      last = d;
    }
  }
});

test('the road and the beach stay dry: nobody swims on the scenic loop', () => {
  for (const p of LOOP) {
    assert.equal(inSea(p.x, p.z), false, `the road at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    assert.equal(onWater(p.x, p.z), false);
  }
  // The town, the office and the far side of the world are no sea either.
  assert.equal(inSea(0, 0), false);
  assert.equal(inSea(-300, 2000), false);
});

test('a swimmer is someone in deep water, well down in it, on their floor’s street', () => {
  const x = waterEdge(200) - 15;
  assert.ok(swimmingAt(x, STREET - SWIM_SINK, 200, STREET));
  assert.ok(!swimmingAt(x, STREET, 200, STREET), 'standing on the water (a reload mid-swim) is not swimming');
  assert.ok(!swimmingAt(x, STREET - SWIM_SINK, 200, STREET + 4.3), 'the street of another floor');
  assert.ok(!swimmingAt(waterEdge(200) - 1, STREET - 0.3, 200, STREET), 'paddling at the edge');
  assert.ok(wadingAt(waterEdge(200) - 1, STREET - 0.3, 200, STREET));
  assert.ok(!wadingAt(waterEdge(200) - 1, STREET + 0.28, 200, STREET), 'up on the jetty over the water');
  assert.ok(!wadingAt(10, STREET - 0.3, 10, STREET), 'not in the sea');
});

test('the buoys keep swimmers within reach of the jetty’s ladder and its diving board', () => {
  assert.ok(inSwimZone(JETTY.ladder.x, JETTY.ladder.z));
  assert.ok(inSwimZone(JETTY.board.x0 - 2, JETTY.z), 'room to land off the diving board');
  assert.ok(!inSwimZone(waterEdge(200) - SWIM_OUT - 1, 200));
  assert.ok(inSwimZone(waterEdge(200) - SWIM_OUT + 1, 200));
  // The ladder goes down into deep water off the jetty's far end, and the board reaches out past it.
  assert.ok(swimDepth(JETTY.ladder.x, JETTY.ladder.z + 0.8));
  assert.ok(atLadder(JETTY.ladder.x, JETTY.ladder.z + 0.8));
  assert.ok(!atLadder(JETTY.ladder.x + 4, JETTY.ladder.z + 0.8));
  assert.ok(JETTY.board.x0 < JETTY.x1 && JETTY.board.x1 > JETTY.x1);
  assert.ok(JETTY.board.top > JETTY.deck && JETTY.board.top - JETTY.deck <= 0.3, 'a step up from the deck, no jump needed');
  assert.ok(Math.abs(JETTY.ladder.top.z - JETTY.z) < JETTY.width / 2, 'climbing out puts you on the deck');
  assert.ok(SEA_LEVEL < 0 && SEA_LEVEL > -0.3);
});

test('boats keep to open water: not the shallows, the pier, the lighthouse’s rocks or the road', () => {
  assert.ok(onWater(waterEdge(150) - 20, 150));
  assert.ok(!onWater(waterEdge(150) - 1, 150), 'the shallows');
  assert.ok(!onWater(waterEdge(150) + 10, 150), 'the beach');
  assert.ok(!onWater((JETTY.x0 + JETTY.x1) / 2, JETTY.z), 'the pier');
  assert.ok(!onWater(JETTY.board.x0 + 0.5, JETTY.z), 'the diving board');
  assert.ok(!onWater(LIGHTHOUSE.x, LIGHTHOUSE.z), 'the lighthouse');
  assert.ok(!onWater(NaN, 0));
  for (const p of LOOP) if (onLoop(p.x + 0.5, p.z)) assert.ok(!onWater(p.x, p.z));
  assert.ok(LOOP_PAVED > 0);
});

test('every craft starts moored on open water by the jetty, clear of the others and the sailboats', () => {
  const states = moored();
  CRAFTS.forEach((c, i) => {
    assert.ok(craftFits(i, c), `${c.name} fits where it's moored`);
    assert.equal(states[i].riders.length, CRAFT_SPECS[c.kind].seats.length);
    assert.ok(states[i].riders.every((r) => r === null));
    // Within reach of someone on the jetty's deck.
    const deckEdge = JETTY.z + JETTY.width / 2;
    assert.ok(c.z - deckEdge < 3.6, `${c.name} is alongside the jetty`);
    for (const [x, z] of SAILBOATS) assert.ok(Math.hypot(c.x - x, c.z - z) > 20);
    CRAFTS.forEach((o, j) => j !== i && assert.ok(Math.hypot(c.x - o.x, c.z - o.z) > 3.5));
  });
  assert.equal(CRAFTS.filter((c) => c.kind === 'jetski').length, 2);
  assert.equal(CRAFT_SPECS.jetski.seats.length, 1, 'a jetski is for one');
  assert.ok(CRAFT_SPECS.boat.seats.length >= 3, 'the motorboat takes a few');
});

test('a craft drives like a car, no faster than its top speed, and craftPoint turns with it', () => {
  for (let i = 0; i < CRAFTS.length; i++) {
    const t = CRAFT_SPECS[CRAFTS[i].kind].tuning;
    let p = { x: CRAFTS[i].x, z: CRAFTS[i].z, rotY: CRAFTS[i].rotY, speed: 0, steer: 0 };
    for (let k = 0; k < 600; k++) p = steerCraft(i, p, { gas: 1, turn: 0.3, brake: false }, 1 / 60);
    assert.ok(p.speed <= t.top + 1e-9 && p.speed > t.top * 0.5);
    for (let k = 0; k < 600; k++) p = steerCraft(i, p, { gas: 0, turn: 0, brake: true }, 1 / 60);
    assert.equal(p.speed, 0);
  }
  const bow = craftPoint({ x: 0, z: 0, rotY: Math.PI / 2 }, 0, 2);
  assert.ok(Math.abs(bow.x - 2) < 1e-9 && Math.abs(bow.z) < 1e-9);
});

test('the kiosk’s menu: held anywhere like the fridge’s, eaten in bites or sipped, one Radler', () => {
  assert.ok(KIOSK_ITEMS.length >= 8);
  for (const d of KIOSK_ITEMS) {
    assert.ok(isKioskItem(d.id));
    assert.ok(isKioskGlass(d.glass));
    assert.equal(DRINK_BY_ID.get(d.id), d, `${d.id} is a drink the office knows`);
    assert.ok(heldAnywhere(d.id));
    assert.ok(keepsHeld(d.id), 'comes along to another floor');
    assert.equal(heldDrink(d.id, 'some-floor'), d.id, 'may be held on a floor');
    assert.equal(heldDrink(d.id, ROOF), d.id, 'and up on the roof');
    assert.equal(holdSeconds(d), d.seconds);
    assert.equal(isSnack(d), isKioskBite(d));
    assert.ok(d.says && d.blurb && d.emoji);
  }
  const by = (id: string) => KIOSK_ITEMS.find((d) => d.id === id)!;
  assert.ok(isSnack(by('pommes')) && isSnack(by('currywurst')) && isSnack(by('softeis')));
  assert.ok(!isSnack(by('eistee')) && !isSnack(by('slush')) && !isSnack(by('kokosnuss')));
  assert.deepEqual(KIOSK_ITEMS.filter((d) => d.strength > 0).map((d) => d.id), ['strandradler']);
  assert.ok(!isKioskItem('helles') && !isKioskItem('beer'));
});

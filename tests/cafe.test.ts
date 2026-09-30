import test from 'node:test';
import assert from 'node:assert/strict';
import { CAFE_BY_ID, CAFE_ITEMS, isCafeGlass, isCafeItem } from '../src/shared/cafe';
import { FRIDGE_BY_ID, heldAnywhere, holdSeconds, isFridgeItem, isSnack } from '../src/shared/fridge';
import { DRINKS, DRINK_BY_ID, ROOF, isDrink } from '../src/shared/rooftop';
import { HALL } from '../src/shared/hall';
import { heldDrink, keepsHeld } from '../src/server/held';

// The padel hall's café (flrnoh fork, see FORK.md "The padel hall"): its menu, and what the server
// lets you hold where.

test('the menu: German café flavour, each with its own id apart from the bar’s and the fridge’s', () => {
  const names = CAFE_ITEMS.map((d) => d.name);
  for (const n of ['Cappuccino', 'Latte Macchiato', 'Espresso', 'Chai Latte', 'Iced Coffee', 'Apfelschorle', 'Iso drink', 'Käsekuchen', 'Apfelstrudel', 'Brezn', 'Bananenbrot']) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => n.startsWith('Weißbier') && /alcohol-free/.test(n)));
  assert.equal(new Set(CAFE_ITEMS.map((d) => d.id)).size, CAFE_ITEMS.length);
  for (const d of CAFE_ITEMS) {
    assert.ok(!FRIDGE_BY_ID.has(d.id as never), `${d.id} is the fridge's`);
    assert.ok(!DRINKS.some((b) => b.id === d.id), `${d.id} is the bar's`);
    assert.equal(DRINK_BY_ID.get(d.id), d, `${d.id} is in the lookup`);
  }
  assert.deepEqual([...new Set(CAFE_ITEMS.map((d) => d.section))].sort(), ['cakes', 'coffee', 'cold']);
});

test('nothing at the café goes to your head; the coffees give the machine’s buzz, the chai a little', () => {
  for (const d of CAFE_ITEMS) assert.ok(d.strength <= 0, `${d.id} has no alcohol`);
  for (const id of ['cappuccino', 'latte', 'espresso', 'icedcoffee'] as const) assert.ok(CAFE_BY_ID.get(id)!.coffee, id);
  for (const d of CAFE_ITEMS) if (d.section !== 'coffee') assert.ok(!d.coffee && d.caffeine === 0, d.id);
  const chai = CAFE_BY_ID.get('chai')!;
  assert.ok(!chai.coffee && chai.caffeine > 0 && chai.caffeine < 60);
  // A Brezn soaks up a beer, and an Iso drink clears your head a little, like water.
  assert.ok(CAFE_BY_ID.get('cafebrezn')!.strength < 0);
  assert.ok(CAFE_BY_ID.get('iso')!.strength < 0);
});

test('cakes go in a few bites, coffees are sipped for longer; every glass has a shape', () => {
  const cake = CAFE_BY_ID.get('kaesekuchen')!;
  const latte = CAFE_BY_ID.get('latte')!;
  assert.ok(isSnack(cake) && !isSnack(latte));
  assert.ok(holdSeconds(cake) < holdSeconds(latte));
  assert.equal(holdSeconds(latte), latte.seconds);
  for (const d of CAFE_ITEMS) assert.ok(isCafeGlass(d.glass) || d.glass === 'pretzel', d.id);
});

test('isCafeItem knows only the café’s; everything you can hold is still a drink', () => {
  assert.ok(isCafeItem('cappuccino') && isCafeItem('bananenbrot'));
  assert.ok(!isCafeItem('helles') && !isCafeItem('beer'));
  assert.ok(!isFridgeItem('cappuccino'));
  assert.ok(isDrink('cappuccino') && isDrink('weissbier'));
  assert.ok(heldAnywhere('cappuccino') && heldAnywhere('helles') && !heldAnywhere('beer'));
  for (const v of ['', 'latte ', 'LATTE', null, undefined, 3, {}, 'constructor', '__proto__', 'toString']) {
    assert.ok(!isCafeItem(v), String(v));
    assert.ok(!heldAnywhere(v), String(v));
  }
});

test('the server: a coffee or a cake may be held anywhere, and comes along', () => {
  for (const floor of [HALL, 'my-project', ROOF, undefined]) {
    assert.equal(heldDrink('cappuccino', floor), 'cappuccino');
    assert.equal(heldDrink('kaesekuchen', floor), 'kaesekuchen');
  }
  // The bar's glasses still only up on the roof, not in the hall.
  assert.equal(heldDrink('beer', HALL), undefined);
  assert.equal(heldDrink('mojito', ROOF), 'mojito');
  assert.equal(heldDrink('espresso2', HALL), undefined);
  assert.ok(keepsHeld('latte') && keepsHeld('cafebrezn'));
  assert.ok(!keepsHeld('wine'));
});

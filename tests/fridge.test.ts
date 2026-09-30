import test from 'node:test';
import assert from 'node:assert/strict';
import { FRIDGE_BY_ID, FRIDGE_ITEMS, holdSeconds, isFridgeItem, isSnack, sipEvery } from '../src/shared/fridge';
import { BOOZE_LIMIT, DRINKS, DRINK_BY_ID, ROOF, isDrink } from '../src/shared/rooftop';
import { heldDrink, keepsHeld } from '../src/server/held';

// The kitchen fridge (flrnoh fork, see FORK.md): its items, and what the server lets you hold where.

test('the fridge has drinks and snacks, each with its own id apart from the bar’s', () => {
  const drinks = FRIDGE_ITEMS.filter((d) => d.section === 'drinks').map((d) => d.id);
  const snacks = FRIDGE_ITEMS.filter((d) => d.section === 'snacks').map((d) => d.id);
  for (const id of ['helles', 'radler', 'cola', 'spezi', 'limo', 'sprudel', 'mate', 'energy']) assert.ok(drinks.includes(id as never), id);
  for (const id of ['brezn', 'crisps', 'chocolate', 'apple', 'leberkas']) assert.ok(snacks.includes(id as never), id);
  assert.equal(new Set(FRIDGE_ITEMS.map((d) => d.id)).size, FRIDGE_ITEMS.length);
  for (const d of DRINKS) assert.ok(!FRIDGE_BY_ID.has(d.id as never), `${d.id} is the bar's`);
});

test('the bar’s menu is unchanged, and the lookup knows both', () => {
  assert.deepEqual(
    DRINKS.map((d) => d.id),
    ['beer', 'wine', 'martini', 'maitai', 'shot', 'mojito', 'water'],
  );
  for (const d of [...DRINKS, ...FRIDGE_ITEMS]) assert.equal(DRINK_BY_ID.get(d.id), d);
});

test('isDrink knows everything you can hold, isFridgeItem only the fridge’s', () => {
  assert.ok(isDrink('beer') && isDrink('helles') && isDrink('brezn'));
  assert.ok(isFridgeItem('helles') && isFridgeItem('leberkas'));
  assert.ok(!isFridgeItem('beer') && !isFridgeItem('martini'));
  for (const v of ['', 'vodka', null, undefined, 3, {}, 'constructor', '__proto__']) {
    assert.ok(!isDrink(v), String(v));
    assert.ok(!isFridgeItem(v), String(v));
  }
});

test('only the beers go to your head, the Radler less, and none alone past the limit', () => {
  const helles = FRIDGE_BY_ID.get('helles')!;
  const radler = FRIDGE_BY_ID.get('radler')!;
  assert.ok(helles.strength > radler.strength && radler.strength > 0);
  assert.ok(helles.strength < BOOZE_LIMIT);
  for (const d of FRIDGE_ITEMS) if (d.id !== 'helles' && d.id !== 'radler') assert.ok(d.strength <= 0, `${d.id} has no alcohol`);
  // A Brezn soaks it up; so does Sprudel.
  assert.ok(FRIDGE_BY_ID.get('brezn')!.strength < 0);
  assert.ok(FRIDGE_BY_ID.get('sprudel')!.strength < 0);
  // A little caffeine, never more than a cup's minute.
  for (const d of FRIDGE_ITEMS) assert.ok(d.caffeine >= 0 && d.caffeine < 60, d.id);
  assert.ok(FRIDGE_BY_ID.get('energy')!.caffeine > FRIDGE_BY_ID.get('cola')!.caffeine);
});

test('snacks go in a few quick bites, drinks are sipped for longer', () => {
  const brezn = FRIDGE_BY_ID.get('brezn')!;
  const helles = FRIDGE_BY_ID.get('helles')!;
  assert.ok(isSnack(brezn) && !isSnack(helles) && !isSnack(DRINK_BY_ID.get('beer')!));
  assert.ok(holdSeconds(brezn) < holdSeconds(helles));
  assert.equal(holdSeconds(DRINK_BY_ID.get('martini')!), 45);
  assert.ok(sipEvery(brezn, 1) < sipEvery(helles, 0));
});

test('the server: the fridge’s things anywhere, the bar’s drinks only on the roof', () => {
  assert.equal(heldDrink('helles', 'my-project'), 'helles');
  assert.equal(heldDrink('brezn', undefined), 'brezn');
  assert.equal(heldDrink('helles', ROOF), 'helles');
  assert.equal(heldDrink('beer', ROOF), 'beer');
  assert.equal(heldDrink('beer', 'my-project'), undefined);
  assert.equal(heldDrink('martini', undefined), undefined);
  assert.equal(heldDrink(null, ROOF), undefined);
  assert.equal(heldDrink('vodka', ROOF), undefined);
});

test('the server: a bottle from the fridge comes along to another floor, a glass from the bar stays', () => {
  assert.ok(keepsHeld('helles'));
  assert.ok(keepsHeld('apple'));
  assert.ok(!keepsHeld('beer'));
  assert.ok(!keepsHeld(undefined));
});

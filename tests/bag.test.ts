// flrnoh fork (see FORK.md "The rucksack"): what you keep of what you buy, the rucksack, putting
// things down and picking them up, and giving them away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BAG_SLOTS, PLACED_PER_OWNER, keepable, spotNear } from '../src/shared/bag.js';
import { heldAnywhere, holdSeconds } from '../src/shared/fridge.js';
import { SHOP_ITEMS } from '../src/shared/shopwares.js';
import '../src/server/ws/handlers/index.js'; // the order the server loads them in (fork/office.ts and the handlers name each other)
import { Bags } from '../src/server/fork/bag.js';
import { bagHandlers, bagHooks } from '../src/server/ws/handlers/bag.js';
import { Booze } from '../src/client/features/bar/booze.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';
import type { ServerMsg } from '../src/shared/protocol.js';

test('flowers, books, toys, pets, records and plush are kept; food and drink are not', () => {
  for (const id of ['rosenstrauss', 'sonnenblume', 'krimi', 'teddy', 'goldfisch', 'wellensittich', 'fotostreifen']) assert.ok(keepable(id), id);
  for (const id of ['semmel', 'doener', 'zwickl', 'ayran', 'helles', 'brezn', 'water', 'nope', 42]) assert.ok(!keepable(id), String(id));
  assert.ok(SHOP_ITEMS.filter((i) => i.section === 'Platten').every((i) => keepable(i.id)));
  assert.ok(SHOP_ITEMS.filter((i) => i.bite || i.strength !== 0).every((i) => !keepable(i.id)));
  for (const i of SHOP_ITEMS.filter((i) => i.keep)) assert.ok(heldAnywhere(i.id));
});

test('a thing to keep never runs out in your hand, and buying something else asks to put it away', () => {
  const b = new Booze();
  const rose = SHOP_ITEMS.find((i) => i.id === 'rosenstrauss')!;
  const doener = SHOP_ITEMS.find((i) => i.id === 'doener')!;
  assert.ok(holdSeconds(rose) > 0);
  b.drink(rose, 0);
  assert.equal(b.holding(100000)?.id, 'rosenstrauss');
  const swapped: string[] = [];
  b.onSwap = (d) => swapped.push(d.id);
  b.drink(doener, 100000);
  assert.deepEqual(swapped, ['rosenstrauss']);
  b.drink(doener, 100001); // food in hand isn't kept
  assert.deepEqual(swapped, ['rosenstrauss']);
  assert.equal(b.holding(100100), null); // and still runs out
  b.hold(rose);
  assert.equal(b.holding(1e9)?.id, 'rosenstrauss');
});

test('a spot to put something down must be within reach', () => {
  const at = { x: 0, y: 0, z: 0 };
  assert.deepEqual(spotNear({ x: 1, y: 0.75, z: 1, rotY: 3 }, at), { x: 1, y: 0.75, z: 1, rotY: 3 });
  assert.equal(spotNear({ x: 5, y: 0, z: 0, rotY: 0 }, at), null);
  assert.equal(spotNear({ x: 0, y: 4, z: 0, rotY: 0 }, at), null);
  assert.equal(spotNear({ x: Number.NaN, y: 0, z: 0, rotY: 0 }, at), null);
  assert.equal(spotNear('here', at), null);
});

test('the rucksack holds twelve things, and things put down are kept in bags.json', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ao-bags-'));
  try {
    const bags = new Bags(dir);
    for (let i = 0; i < BAG_SLOTS; i++) assert.ok(bags.put('account:a', 'teddy'));
    assert.ok(!bags.put('account:a', 'teddy'));
    assert.equal(bags.take('account:a', 0), 'teddy');
    assert.ok(bags.put('account:a', 'krimi', 0));
    assert.equal(bags.of('account:a')[0], 'krimi');
    const p = bags.place('f1', 'account:a', 'Flo', 'rosenstrauss', { x: 1, y: 0.75, z: 2, rotY: 0 });
    assert.equal(bags.on('f1', 'account:a')[0].mine, true);
    assert.equal(bags.on('f1', 'account:b')[0].mine, false);
    assert.equal(bags.pick('f1', p.id, 'account:b'), undefined);
    bags.save();
    const again = new Bags(dir);
    assert.equal(again.of('account:a').length, BAG_SLOTS);
    assert.equal(again.on('f1', 'account:a')[0].item, 'rosenstrauss');
    assert.equal(again.pick('f1', p.id, 'account:a')?.item, 'rosenstrauss');
    assert.deepEqual(again.on('f1', 'account:a'), []);
    for (let i = 0; i < PLACED_PER_OWNER; i++) again.place('f2', 'account:a', 'Flo', 'teddy', { x: 0, y: 0, z: 0, rotY: 0 });
    assert.match(again.full('f3', 'account:a') ?? '', /pick some up/);
    assert.equal(again.full('f3', 'account:b'), null);
    assert.ok(JSON.parse(readFileSync(path.join(dir, 'bags.json'), 'utf8')).bags);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The handlers, against a little office ---------------------------------------------------------

function office() {
  const sent: { to: string; m: ServerMsg }[] = [];
  const warned: { to: string; text: string }[] = [];
  const clients = new Map<string, Client>();
  const ctx = {
    bags: new Bags(),
    clients,
    sendTo: (c: Client, m: ServerMsg) => sent.push({ to: c.id, m }),
    broadcast: (m: ServerMsg) => sent.push({ to: '*', m }),
    warn: (c: Client, text: string) => warned.push({ to: c.id, text }),
  } as unknown as Ctx;
  const join = (id: string, name: string, at = { x: 0, z: 0 }) => {
    const c = { id, accountId: id, out: false, throttles: new Map(), peer: { id, name, floor: 'f1', x: at.x, y: 0, z: at.z, rotY: 0 } } as unknown as Client;
    clients.set(id, c);
    return c;
  };
  const to = (id: string, t: string) => sent.filter((s) => s.to === id && s.m.t === t).map((s) => s.m as Extract<ServerMsg, { t: 'bag' }>);
  return { ctx, sent, warned, join, to };
}

test('stow, take, drop, pick and give, as the office does them', () => {
  const { ctx, sent, warned, join, to } = office();
  const flo = join('flo', 'Flo');
  const mane = join('mane', 'Mane', { x: 2, z: 0 });
  flo.peer.drink = 'rosenstrauss';

  // Stowing only what's in hand.
  bagHandlers['bag.stow'](ctx, flo, { t: 'bag.stow', item: 'teddy' });
  assert.equal(flo.peer.drink, 'rosenstrauss');
  bagHandlers['bag.stow'](ctx, flo, { t: 'bag.stow', item: 'rosenstrauss' });
  assert.equal(flo.peer.drink, undefined);
  assert.deepEqual(to('flo', 'bag').at(-1), { t: 'bag', items: ['rosenstrauss'], did: 'stow', hand: null });

  // Taking it out swaps it with what's in hand.
  flo.peer.drink = 'teddy';
  bagHandlers['bag.take'](ctx, flo, { t: 'bag.take', slot: 0 });
  assert.equal(flo.peer.drink, 'rosenstrauss');
  assert.deepEqual(ctx.bags.of('account:flo'), ['teddy']);

  // Down on the desk in front, seen by everyone on the floor; only Flo picks it up.
  bagHandlers['bag.drop'](ctx, flo, { t: 'bag.drop', spot: { x: 0.8, y: 0.75, z: 0, rotY: 0 } });
  assert.equal(flo.peer.drink, undefined);
  const added = sent.filter((s) => s.m.t === 'placed.add');
  assert.deepEqual(added.map((s) => s.to).sort(), ['flo', 'mane']);
  const id = (added[0].m as Extract<ServerMsg, { t: 'placed.add' }>).item.id;
  bagHandlers['bag.pick'](ctx, mane, { t: 'bag.pick', id });
  assert.match(warned.at(-1)!.text, /Flo’s/);
  bagHandlers['bag.pick'](ctx, flo, { t: 'bag.pick', id });
  assert.equal(flo.peer.drink, 'rosenstrauss');

  // Too far to put down there.
  bagHandlers['bag.drop'](ctx, flo, { t: 'bag.drop', spot: { x: 9, y: 0, z: 0, rotY: 0 } });
  assert.equal(flo.peer.drink, 'rosenstrauss');

  // Given to Mane: into Mane's rucksack.
  bagHandlers['bag.give'](ctx, flo, { t: 'bag.give', to: 'mane' });
  assert.equal(flo.peer.drink, undefined);
  assert.deepEqual(ctx.bags.of('account:mane'), ['rosenstrauss']);
  assert.deepEqual(to('mane', 'bag.gift').at(-1), { t: 'bag.gift', from: 'Flo', item: 'rosenstrauss' } as never);

  // From the rucksack, to someone too far away: refused.
  mane.peer.x = 20;
  flo.throttles.clear();
  bagHandlers['bag.give'](ctx, flo, { t: 'bag.give', to: 'mane', slot: 0 });
  assert.deepEqual(ctx.bags.of('account:flo'), ['teddy']);

  // Leaving with a thing in hand: it goes in the rucksack.
  flo.peer.drink = 'krimi';
  bagHooks.closed!(ctx, flo);
  assert.deepEqual(ctx.bags.of('account:flo'), ['teddy', 'krimi']);
});

test('a full rucksack: what was in hand goes down where asked, else it stays in hand', () => {
  const { ctx, join, sent, to } = office();
  const flo = join('flo', 'Flo');
  for (let i = 0; i < BAG_SLOTS; i++) ctx.bags.put('account:flo', 'teddy');
  flo.peer.drink = 'sonnenblume';
  bagHandlers['bag.stow'](ctx, flo, { t: 'bag.stow', item: 'sonnenblume' });
  assert.equal(flo.peer.drink, 'sonnenblume');
  bagHandlers['bag.stow'](ctx, flo, { t: 'bag.stow', item: 'sonnenblume', spill: { x: 0.5, y: 0, z: 0.5, rotY: 0 } });
  assert.equal(flo.peer.drink, undefined);
  assert.equal(ctx.bags.on('f1', 'account:flo')[0].item, 'sonnenblume');
  assert.ok(sent.some((s) => s.m.t === 'placed.add'));
  // Making way for something just bought: the page's hand (the new thing) is left alone.
  assert.ok(!('hand' in to('flo', 'bag').at(-1)!));
  ctx.bags.take('account:flo', 0);
  flo.peer.drink = 'tulpen';
  bagHandlers['bag.stow'](ctx, flo, { t: 'bag.stow', item: 'tulpen', spill: { x: 0, y: 0, z: 0, rotY: 0 } });
  assert.deepEqual(to('flo', 'bag').at(-1), { t: 'bag', items: ctx.bags.of('account:flo'), did: 'stow' });
});

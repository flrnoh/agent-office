import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CHUTE, GRIP, PILE, POSTCARDS_PER_DAY, POSTCARD_TEXT_MAX, clawAim, clawDrop, clawGrab, clawPile, cleanPostcardText, isPlush } from '../src/shared/funshops.js';
import { SHOPS } from '../src/shared/shops.js';
import { shopRoom } from '../src/shared/shop-rooms.js';
import { DRINK_BY_ID } from '../src/shared/rooftop.js';
import { heldAnywhere } from '../src/shared/fridge.js';
import { GUEST_MSGS } from '../src/server/guests.js';
import { PARTY_MSGS, PARTY_SEES_MSGS } from '../src/server/party.js';
import { Postcards, postRecipients } from '../src/server/postcards.js';

// The Spielhalle and the Post (flrnoh fork, see FORK.md "Shops to walk into").

const arcade = SHOPS.find((s) => s.kind === 'spielhalle')!;
const post = SHOPS.find((s) => s.kind === 'post')!;

test('the Spielhalle has cabinets, a claw machine and a photo booth; the Post its counter and PO boxes', () => {
  for (const s of SHOPS.filter((x) => x.kind === 'spielhalle')) {
    const at = shopRoom(s).stations.map((t) => t.at);
    assert.ok(at.includes('cabinet') && at.includes('claw') && at.includes('booth') && at.includes('counter'), `spielhalle ${s.i}: ${at}`);
  }
  for (const s of SHOPS.filter((x) => x.kind === 'post')) assert.ok(shopRoom(s).stations.some((t) => t.at === 'pobox'));
});

test('the claw pile is the same for everyone, out of the chute and apart', () => {
  const a = clawPile(arcade.i);
  assert.deepEqual(a, clawPile(arcade.i));
  assert.equal(a.length, PILE);
  assert.notDeepEqual(a, clawPile(arcade.i + 1));
  for (const p of a) {
    assert.ok(isPlush(p.id));
    assert.ok(p.x > 0 && p.x < 1 && p.z > 0 && p.z < 1);
    assert.ok(Math.hypot(p.x - CHUTE.x, p.z - CHUTE.z) >= CHUTE.r + p.r);
    for (const o of a) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= (o.r + p.r) * 0.9 - 1e-9);
  }
});

test('a grab: dead centre holds GRIP of the time, the edge never, a miss nothing; the same roll the same answer', () => {
  const pile = clawPile(arcade.i);
  const p = pile[0];
  const centre = clawAim(pile, p.x, p.z);
  assert.equal(centre.plush, p);
  assert.ok(Math.abs(centre.chance - GRIP) < 1e-9);
  assert.equal(clawGrab(pile, p.x, p.z, GRIP - 0.01).won, p.id);
  assert.equal(clawGrab(pile, p.x, p.z, GRIP + 0.01).won, null);
  // Just inside its edge: hardly ever.
  assert.ok(clawAim(pile, p.x + p.r * 0.95, p.z).chance < 0.1);
  // Nowhere near anything (the chute's corner).
  assert.deepEqual(clawGrab(pile, CHUTE.x, CHUTE.z, 0), {
    won: null,
    near: null,
  });
  for (let i = 0; i < 50; i++) {
    const x = ((i * 37) % 100) / 100;
    const z = ((i * 61) % 100) / 100;
    assert.deepEqual(clawGrab(pile, x, z, 0.3), clawGrab(pile, x, z, 0.3));
  }
});

test('claw.drop: only a Spielhalle, finite numbers, clamped into the glass', () => {
  assert.deepEqual(clawDrop({ shop: arcade.i, x: 0.5, z: 0.5 }), {
    shop: arcade.i,
    x: 0.5,
    z: 0.5,
  });
  assert.deepEqual(clawDrop({ shop: arcade.i, x: -3, z: 9 }), {
    shop: arcade.i,
    x: 0.04,
    z: 0.96,
  });
  assert.equal(clawDrop({ shop: post.i, x: 0.5, z: 0.5 }), null);
  assert.equal(clawDrop({ shop: 99999, x: 0.5, z: 0.5 }), null);
  assert.equal(clawDrop({ shop: arcade.i + 0.5, x: 0.5, z: 0.5 }), null);
  assert.equal(clawDrop({ shop: arcade.i, x: NaN, z: 0.5 }), null);
  assert.equal(clawDrop({ shop: arcade.i, x: '0.5' as unknown as number, z: 0.5 }), null);
});

test('the prizes and the photo strip are held like the shops’ things, each id its own', () => {
  for (const id of ['plushkatze', 'plushhase', 'plushdino', 'plushpanda', 'plushkrake', 'fotostreifen']) {
    assert.ok(DRINK_BY_ID.get(id as never), id);
    assert.ok(heldAnywhere(id), id);
  }
});

test('postcard text: control and invisible characters out, lines kept (at most 6), clipped', () => {
  assert.equal(cleanPostcardText('  Hallo\u0000 ‮Welt​  '), 'Hallo Welt');
  assert.equal(cleanPostcardText('a\r\n\r\n\r\nb'), 'a\n\nb');
  assert.equal(cleanPostcardText('1\n2\n3\n4\n5\n6\n7\n8'), '1\n2\n3\n4\n5\n6');
  assert.equal(cleanPostcardText('x'.repeat(1000)).length, POSTCARD_TEXT_MAX);
  assert.equal(cleanPostcardText(42), '');
  assert.equal(cleanPostcardText('   \n  '), '');
  assert.equal(cleanPostcardText('<b>hi</b>'), '<b>hi</b>', 'kept as text: the page shows it as text, never as HTML');
});

test('postcards: checked, counted per day, waiting until collected, kept on disk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'postcards-'));
  try {
    let now = new Date(2026, 9, 2, 12).getTime();
    const p = new Postcards(dir, () => now);
    const ada = { key: 'account:ada', name: 'Ada' };
    const bob = { key: 'name:Bob', name: 'Bob', online: false };
    assert.deepEqual(p.send(ada, undefined, 'skyline', 'hi'), {
      error: 'Who’s that? Pick someone from the list',
    });
    assert.ok('error' in p.send(ada, { ...ada, online: true }, 'skyline', 'hi'), 'not to yourself');
    assert.ok('error' in p.send(ada, bob, 'nope', 'hi'), 'a motif of the city');
    assert.ok('error' in p.send(ada, bob, 'kino', ' ​ '), 'something written');
    for (let i = 0; i < POSTCARDS_PER_DAY; i++) assert.ok(!('error' in p.send(ada, bob, 'kino', `Karte ${i}`)));
    assert.equal(p.left(ada.key), 0);
    assert.ok('error' in p.send(ada, bob, 'kino', 'one too many'));
    // Kept on disk: a new office reads them back.
    const again = new Postcards(dir, () => now);
    assert.equal(again.left(ada.key), 0);
    const cards = again.collect(bob.key);
    assert.equal(cards.length, POSTCARDS_PER_DAY);
    assert.equal(cards[0].from, 'Ada');
    assert.equal(cards[0].motif, 'kino');
    assert.ok(!('toKey' in cards[0]), 'who they are to the office stays on the server');
    assert.equal(again.collect(bob.key).length, 0, 'handed over once');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'postcards.json'), 'utf8')).waiting.length, 0);
    // The next day, ten more.
    now += 24 * 3600_000;
    assert.equal(again.left(ada.key), POSTCARDS_PER_DAY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recipients: the accounts and who’s in, never yourself; party guests only who’s in', () => {
  const accounts = [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bea' },
  ];
  const online = [
    { key: 'account:a', name: 'Ada' },
    { key: 'name:Gast', name: 'Gast' },
    { key: 'account:me', name: 'Me' },
  ];
  const all = postRecipients({
    me: 'account:me',
    party: false,
    accounts,
    online,
  });
  assert.deepEqual(
    all.map((r) => [r.key, r.online]),
    [
      ['account:a', true],
      ['name:Gast', true],
      ['account:b', false],
    ],
  );
  const party = postRecipients({
    me: 'account:me',
    party: true,
    accounts,
    online,
  });
  assert.deepEqual(
    party.map((r) => r.key),
    ['account:a', 'name:Gast'],
  );
});

test('guests and party guests may play the claw machine and send postcards, and see it all', () => {
  for (const t of ['claw.drop', 'post.recipients', 'post.send', 'post.check']) {
    assert.ok(GUEST_MSGS.has(t), t);
    assert.ok(PARTY_MSGS.has(t), t);
  }
  for (const t of ['claw', 'post.recipients', 'post.sent', 'post.cards']) assert.ok(PARTY_SEES_MSGS.has(t), t);
});

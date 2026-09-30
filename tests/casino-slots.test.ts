import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PAYTABLE, REELS, REEL_STOPS, SLOT_BETS, SLOT_SYMBOLS, SPIN_MS, THREE_OF_A_KIND, slotLine, slotPays, type SlotsResult, type SlotsView } from '../src/shared/casino-slots.js';
import { START_CHIPS, type CasinoServerMsg } from '../src/shared/casino.js';
import { Casino, type CasinoPlayer } from '../src/server/casino/index.js';

// The slot machines (flrnoh fork): the paytable pays back about 95%, worked out exactly here over
// every combination of the three reels' stops.

test('each reel holds every symbol as often as its weight says', () => {
  for (const reel of REELS) {
    assert.equal(reel.length, REEL_STOPS);
    for (const s of SLOT_SYMBOLS) assert.equal(reel.filter((r) => r === s.id).length, s.weight, s.id);
  }
  assert.notDeepEqual(REELS[0], REELS[1], 'the reels are in different orders');
});

test('the paytable pays back about 95% (exact enumeration)', () => {
  let paid = 0;
  let hits = 0;
  for (let a = 0; a < REEL_STOPS; a++) {
    for (let b = 0; b < REEL_STOPS; b++) {
      for (let c = 0; c < REEL_STOPS; c++) {
        const p = slotPays(slotLine([a, b, c]));
        paid += p;
        if (p) hits++;
      }
    }
  }
  const n = REEL_STOPS ** 3;
  const rtp = paid / n;
  assert.ok(rtp > 0.94 && rtp < 0.96, `RTP ${rtp}`);
  assert.equal(rtp, 0.949920654296875);
  assert.ok(hits / n > 0.2, `hit rate ${hits / n}`);
});

test('what lines pay', () => {
  assert.equal(slotPays(['diamond', 'diamond', 'diamond']), 200);
  assert.equal(slotPays(['seven', 'seven', 'seven']), 100);
  assert.equal(slotPays(['cherry', 'cherry', 'cherry']), THREE_OF_A_KIND.cherry);
  assert.equal(slotPays(['cherry', 'cherry', 'bell']), 4);
  assert.equal(slotPays(['cherry', 'bell', 'cherry']), 1);
  assert.equal(slotPays(['bell', 'cherry', 'cherry']), 0);
  assert.equal(slotPays(['lemon', 'lemon', 'bell']), 0);
  assert.equal(PAYTABLE[0].pays, 200);
});

/** A casino with one machine and one player, and a scripted "random". */
function setup(draws: number[]) {
  const d = mkdtempSync(path.join(tmpdir(), 'casino-slots-'));
  const t = { now: 1_000_000 };
  const casino = new Casino(d, { now: () => t.now, random: () => draws.shift() ?? 0, manualTick: true });
  const got: CasinoServerMsg[] = [];
  const ada: CasinoPlayer = { id: 'c1', owner: 'name:Ada', name: 'Ada', send: (m) => got.push(m) };
  casino.enter(ada);
  casino.message('c1', { t: 'casino.sit', table: 'slots-1' });
  return { d, t, casino, got, done: () => (casino.stop(), rmSync(d, { recursive: true, force: true })) };
}
const find = (s: string) => REELS[0].indexOf(s as never);
const stopOf = (reel: number, s: string) => REELS[reel].indexOf(s as never);

test('a spin: the stake goes, the line pays, the result and the reels go out', () => {
  // Three diamonds.
  const s = setup([stopOf(0, 'diamond'), stopOf(1, 'diamond'), stopOf(2, 'diamond')]);
  try {
    s.got.length = 0;
    s.casino.message('c1', { t: 'casino.act', table: 'slots-1', action: 'spin', data: 10 });
    const wallet = s.got.filter((m) => m.t === 'casino.wallet').at(-1);
    assert.deepEqual(wallet, { t: 'casino.wallet', chips: START_CHIPS - 10 + 2000 });
    const result = s.got.find((m) => m.t === 'casino.result');
    assert.ok(result && result.t === 'casino.result');
    assert.equal(result.delta, 1990);
    assert.equal((result.data as SlotsResult).won, 2000);
    assert.match(result.text, /💎 💎 💎/);
    const view = s.got.filter((m) => m.t === 'casino.table' && m.table === 'slots-1').at(-1);
    assert.ok(view && view.t === 'casino.table');
    const v = view.state as SlotsView;
    assert.equal(v.spinning, true);
    assert.equal(v.player, 'Ada');
    // Still turning: no second spin yet.
    s.got.length = 0;
    s.casino.message('c1', { t: 'casino.act', table: 'slots-1', action: 'spin', data: 10 });
    assert.match((s.got.find((m) => m.t === 'casino.result') as { text: string }).text, /still turning/);
    // Stopped once SPIN_MS has gone by.
    s.t.now += SPIN_MS;
    s.got.length = 0;
    s.casino.tick();
    const after = s.got.find((m) => m.t === 'casino.table' && m.table === 'slots-1');
    assert.equal((after as { state: SlotsView }).state.spinning, false);
  } finally {
    s.done();
  }
});

test('a losing spin only takes the stake; stakes are only the machine’s', () => {
  const s = setup([find('lemon'), stopOf(1, 'bell'), stopOf(2, 'seven')]);
  try {
    s.casino.message('c1', { t: 'casino.act', table: 'slots-1', action: 'spin', data: 25 });
    assert.equal(s.casino.wallets.chips('name:Ada'), START_CHIPS - 25);
    s.t.now += SPIN_MS;
    s.casino.tick();
    for (const bad of [0, 2, 26, 1000, -5, 2.5, '10', null]) {
      s.t.now += 1000;
      s.got.length = 0;
      s.casino.message('c1', { t: 'casino.act', table: 'slots-1', action: 'spin', data: bad });
      assert.match((s.got.find((m) => m.t === 'casino.result') as { text: string }).text, /Pick a stake/, String(bad));
    }
    assert.equal(s.casino.wallets.chips('name:Ada'), START_CHIPS - 25);
    assert.deepEqual([...SLOT_BETS], [1, 5, 10, 25]);
  } finally {
    s.done();
  }
});

test('out of chips: no spin, and nothing below zero', () => {
  const s = setup([]);
  try {
    s.casino.wallets.debit('name:Ada', START_CHIPS - 3);
    s.got.length = 0;
    s.casino.message('c1', { t: 'casino.act', table: 'slots-1', action: 'spin', data: 5 });
    assert.match((s.got.find((m) => m.t === 'casino.result') as { text: string }).text, /only have 3 chips/);
    assert.equal(s.casino.wallets.chips('name:Ada'), 3);
  } finally {
    s.done();
  }
});

test('the window’s reels land exactly on the stops the office drew', async () => {
  const { Reels } = await import('../src/client/ui/casino/reels.js');
  const r = new Reels([3, 30, 12]);
  r.spin([7, 1, 31], SPIN_MS, 1000);
  assert.equal(r.spinning, true);
  assert.equal(r.update(1000 + SPIN_MS * 0.3), true);
  const landed: number[] = [];
  for (let t = 1000; t <= 1000 + SPIN_MS; t += 50) {
    r.update(t);
    landed.push(...r.landed);
  }
  assert.equal(r.update(1000 + SPIN_MS), false);
  assert.deepEqual(r.pos, [7, 1, 31]);
  assert.deepEqual(landed, [0, 1, 2], 'left to right, once each');
  assert.equal(r.spinning, false);
});

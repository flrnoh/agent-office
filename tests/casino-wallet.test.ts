import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { START_CHIPS } from '../src/shared/casino.js';
import { Wallets, dayOf, nextMidnight } from '../src/server/casino/wallets.js';

// The casino's play chips (flrnoh fork): a wallet each, never below nothing, topped up once a day.

const dir = () => mkdtempSync(path.join(tmpdir(), 'casino-wallet-'));
/** A clock that starts on a Tuesday at noon, local time. */
const clock = () => {
  const t = { now: new Date(2026, 8, 29, 12, 0, 0).getTime() };
  return { t, now: () => t.now };
};

test('a new wallet starts with START_CHIPS', () => {
  const d = dir();
  try {
    const w = new Wallets(d);
    assert.equal(w.open('name:Ada').chips, START_CHIPS);
    assert.equal(w.open('name:Ada').toppedUp, 0);
    assert.equal(w.open('name:Ada').nextTopUpAt, undefined, 'nothing to top up at START_CHIPS');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('never below nothing: a debit it cannot cover takes nothing', () => {
  const d = dir();
  try {
    const w = new Wallets(d);
    assert.equal(w.debit('name:Ada', START_CHIPS + 1), false);
    assert.equal(w.chips('name:Ada'), START_CHIPS);
    assert.equal(w.debit('name:Ada', START_CHIPS), true);
    assert.equal(w.chips('name:Ada'), 0);
    assert.equal(w.debit('name:Ada', 1), false);
    assert.equal(w.chips('name:Ada'), 0);
    // Nothing odd gets through either.
    for (const n of [-5, 1.5, Number.NaN, Infinity]) assert.equal(w.debit('name:Bo', n), false, String(n));
    w.credit('name:Bo', -100);
    w.credit('name:Bo', 2.5);
    assert.equal(w.chips('name:Bo'), START_CHIPS);
    w.credit('name:Bo', 250);
    assert.equal(w.chips('name:Bo'), START_CHIPS + 250);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('topped back up to START_CHIPS once a day, only when below it', () => {
  const d = dir();
  try {
    const c = clock();
    const w = new Wallets(d, c.now);
    w.debit('name:Ada', 900);
    const low = w.open('name:Ada');
    assert.equal(low.chips, 100);
    assert.equal(low.toppedUp, 0, 'not the same day it was opened');
    assert.equal(low.nextTopUpAt, nextMidnight(c.t.now));
    // The next morning: back up to START_CHIPS, once.
    c.t.now += 20 * 3600_000;
    const up = w.open('name:Ada');
    assert.deepEqual([up.chips, up.toppedUp], [START_CHIPS, 900]);
    w.debit('name:Ada', 500);
    assert.equal(w.open('name:Ada').chips, 500, 'no second top-up the same day');
    // The day after, today's top-up comes before anything else; up past START_CHIPS it never takes chips away.
    c.t.now += 24 * 3600_000;
    w.credit('name:Ada', 5000);
    assert.equal(w.open('name:Ada').chips, 6000);
    c.t.now += 24 * 3600_000;
    assert.deepEqual([w.open('name:Ada').chips, w.open('name:Ada').toppedUp], [6000, 0]);
    assert.equal(dayOf(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('wallets are saved (0600) and come back; a broken file starts over', () => {
  const d = dir();
  try {
    const w = new Wallets(d);
    w.debit('account:a1', 300);
    w.credit('name:Bo', 42);
    const file = path.join(d, 'casino.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const again = new Wallets(d);
    assert.equal(again.chips('account:a1'), START_CHIPS - 300);
    assert.equal(again.chips('name:Bo'), START_CHIPS + 42);
    // Tampered-with entries are dropped, the rest kept.
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    saved.wallets['name:Cheat'] = { chips: -50, day: '2026-09-29' };
    saved.wallets['name:Odd'] = { chips: 'lots', day: 'today' };
    writeFileSync(file, JSON.stringify(saved));
    const third = new Wallets(d);
    assert.equal(third.chips('name:Cheat'), START_CHIPS, 'a bad entry is a fresh wallet');
    assert.equal(third.chips('account:a1'), START_CHIPS - 300);
    writeFileSync(file, '{not json');
    assert.equal(new Wallets(d).chips('account:a1'), START_CHIPS);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

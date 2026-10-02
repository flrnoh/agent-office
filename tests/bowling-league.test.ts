import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIN_GAMES, berlinDate, champion, leagueBoard, myGames, weekBefore, weekOf, weekTable, type LeagueGame } from '../src/shared/bowling-league.js';
import { BowlingLeague } from '../src/server/bowling/league.js';

/** Noon on a day in Berlin (UTC+1 or +2): plenty of room either side. */
const day = (iso: string, hh = 12) => Date.parse(`${iso}T${String(hh).padStart(2, '0')}:00:00+02:00`);
const g = (owner: string, score: number, at: number, strikes = 0, spares = 0): LeagueGame => ({ owner, name: owner.replace('name:', ''), score, strikes, spares, at });

test('the league week runs Monday to Sunday on Berlin’s clock', () => {
  // Thursday 1 October 2026: the week of Monday 28 September.
  assert.equal(weekOf(day('2026-10-01')), '2026-09-28');
  assert.equal(weekOf(day('2026-09-28', 0) + 60_000), '2026-09-28', 'just after midnight Monday in Berlin');
  // 23:30 on Sunday in Berlin is still last week, though it's Sunday 21:30 in UTC.
  assert.equal(weekOf(Date.parse('2026-10-04T23:30:00+02:00')), '2026-09-28');
  assert.equal(weekOf(Date.parse('2026-10-05T00:30:00+02:00')), '2026-10-05');
  // Across the clocks going back (25 October 2026) and the new year.
  assert.equal(weekOf(Date.parse('2026-10-25T12:00:00+01:00')), '2026-10-19');
  assert.equal(weekOf(Date.parse('2027-01-01T12:00:00+01:00')), '2026-12-28');
  assert.equal(weekBefore('2026-01-05'), '2025-12-29');
  assert.deepEqual(berlinDate(Date.parse('2026-10-04T23:30:00+02:00')), { y: 2026, m: 10, d: 4, wd: 6 });
});

test('the week’s table: the average of each person’s best three, a missing game counting 0', () => {
  const w = day('2026-09-30');
  const games = [
    g('name:Ann', 150, w), g('name:Ann', 210, w + 1), g('name:Ann', 180, w + 2), g('name:Ann', 90, w + 3),
    g('name:Ben', 240, w), // one great game: 80
    g('name:Cem', 170, w), g('name:Cem', 160, w + 1), g('name:Cem', 165, w + 2),
    g('name:Ann', 300, day('2026-09-20')), // last week's: not this one
  ];
  const t = weekTable(games, '2026-09-28');
  assert.deepEqual(t.map((r) => [r.name, r.avg, r.games, r.best]), [['Ann', 180, 4, 210], ['Cem', 165, 3, 170], ['Ben', 80, 1, 240]]);
});

test('last week’s champion wears the crown this week', () => {
  const games = [g('name:Ann', 150, day('2026-09-22')), g('name:Ben', 200, day('2026-09-23')), g('name:Cem', 290, day('2026-09-30'))];
  assert.deepEqual(champion(games, day('2026-10-01')), { name: 'Ben', owner: 'name:Ben', avg: 66.7 });
  assert.equal(champion(games, day('2026-10-15')), null, 'a week nobody bowled in has no champion after it');
  const { board, championOwner } = leagueBoard(games, day('2026-10-01'));
  assert.equal(championOwner, 'name:Ben');
  assert.deepEqual(board.champion, { name: 'Ben', avg: 66.7 });
  assert.ok(!('owner' in board.table[0]), 'nobody’s account goes out on the wire');
});

test('all time: high games, the best averages from enough games, strikes and perfect games', () => {
  const t = day('2026-09-01');
  const games: LeagueGame[] = [];
  for (let i = 0; i < MIN_GAMES; i++) games.push(g('name:Ann', 150 + i, t + i, 3, 4));
  for (let i = 0; i < MIN_GAMES - 1; i++) games.push(g('name:Ben', 250, t + 100 + i, 9, 1));
  games.push(g('name:Cem', 300, t + 500, 12, 0));
  const { board: b } = leagueBoard(games, t + 1000);
  assert.deepEqual(b.high.slice(0, 2).map((x) => [x.name, x.score]), [['Cem', 300], ['Ben', 250]]);
  assert.deepEqual(b.average.map((r) => r.name), ['Ann'], `only those with ${MIN_GAMES} games or more`);
  assert.equal(b.average[0].avg, 152);
  assert.deepEqual(b.strikes.map((s) => s.name), ['Ben', 'Ann', 'Cem']);
  assert.deepEqual(b.perfect, [{ name: 'Cem', count: 1 }]);
  const mine = myGames(games, 'name:Ann', 'Ann');
  assert.equal(mine.count, MIN_GAMES);
  assert.equal(mine.high, 154);
  assert.equal(mine.games[0].score, 154, 'newest first');
  assert.equal(mine.strikes, 3 * MIN_GAMES);
});

test('the book is saved as bowling.json (0600) and read back; a broken file starts over', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bowling-'));
  const a = new BowlingLeague(dir);
  a.record(g('account:7', 187, day('2026-09-30'), 4, 3));
  const file = path.join(dir, 'bowling.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).games.length, 1);
  const b = new BowlingLeague(dir);
  assert.equal(b.size, 1);
  assert.equal(b.mine('account:7', 'Flo').high, 187);
  writeFileSync(file, '{ nope');
  assert.equal(new BowlingLeague(dir).size, 0);
  writeFileSync(file, JSON.stringify({ games: [{ owner: 'x', name: 'X', score: 999, strikes: 1, spares: 1, at: 5 }, { owner: 3 }] }));
  const c = new BowlingLeague(dir);
  assert.equal(c.size, 1);
  assert.equal(c.mine('x', 'X').high, 300, 'scores are kept within a game’s');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Roll } from '../src/shared/bowling-game.js';
import { celebration, finished, isSplit, leaveName, marks, pinsUp, position, score, sheet, strikeRun } from '../src/shared/bowling-score.js';

const rolls = (...pins: (number | 'F')[]): Roll[] => pins.map((p) => (p === 'F' ? { pins: 0, foul: true } : { pins: p }));
const repeat = <T>(n: number, ...v: T[]): T[] => Array.from({ length: n }, () => v).flat();
/** Pins standing, by their numbers (1–10), as a mask. */
const left = (...pins: number[]) => pins.reduce((m, p) => m | (1 << (p - 1)), 0);

test('a perfect game is 300: twelve strikes, X in every box', () => {
  const r = rolls(...repeat(12, 10));
  assert.equal(score(r), 300);
  assert.ok(finished(r));
  const s = sheet(r);
  assert.deepEqual(s.map((f) => f.total), [30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  assert.deepEqual(s[9].marks, ['X', 'X', 'X']);
  assert.equal(celebration(r), 'perfect');
  assert.deepEqual(marks(r), { strikes: 12, spares: 0 });
});

test('eleven strikes and a nine is 299', () => {
  const r = rolls(...repeat(11, 10), 9);
  assert.equal(score(r), 299);
  assert.deepEqual(sheet(r)[9].marks, ['X', 'X', '9']);
});

test('all spares: 5 and 5 every frame, a 5 at the end, is 150', () => {
  const r = rolls(...repeat(21, 5));
  assert.equal(score(r), 150);
  assert.ok(finished(r));
  assert.deepEqual(sheet(r)[0].marks, ['5', '/']);
  assert.deepEqual(sheet(r)[9].marks, ['5', '/', '5']);
  assert.deepEqual(marks(r), { strikes: 0, spares: 10 });
});

test('a gutter game is 0, twenty dashes', () => {
  const r = rolls(...repeat(20, 0));
  assert.equal(score(r), 0);
  assert.ok(finished(r));
  assert.deepEqual(sheet(r)[3].marks, ['-', '-']);
  assert.equal(sheet(r)[9].marks.length, 2);
});

test('nine and a miss every frame is 90', () => {
  const r = rolls(...repeat(10, 9, 0));
  assert.equal(score(r), 90);
  assert.deepEqual(sheet(r)[0].marks, ['9', '-']);
});

test('strikes and spares wait for their bonus balls before their total shows', () => {
  let r = rolls(10);
  assert.equal(sheet(r)[0].total, null);
  r = rolls(10, 7);
  assert.equal(sheet(r)[0].total, null);
  r = rolls(10, 7, 2);
  assert.deepEqual(sheet(r).slice(0, 2).map((f) => f.total), [19, 28]);
  r = rolls(6, 4);
  assert.equal(sheet(r)[0].total, null);
  r = rolls(6, 4, 8);
  assert.equal(sheet(r)[0].total, 18);
  assert.equal(score(rolls(10, 10, 10)), 30, 'a turkey counts the first frame only so far');
});

test('the classic sample game adds up to 167', () => {
  // X 7/ 9- X -8 8/ F6 X X X81
  const r: Roll[] = rolls(10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 'F', 6, 10, 10, 10, 8, 1);
  assert.deepEqual(sheet(r).map((f) => f.total), [20, 39, 48, 66, 74, 84, 90, 120, 148, 167]);
  assert.deepEqual(sheet(r)[6].marks, ['F', '6']);
  assert.ok(finished(r));
});

test('the tenth frame: a strike gets two more balls, a spare one, an open frame none', () => {
  const nine = repeat(9, 10);
  assert.ok(!finished(rolls(...nine, 10, 10)));
  assert.ok(finished(rolls(...nine, 10, 10, 10)));
  assert.ok(!finished(rolls(...nine, 7, 3)));
  assert.ok(finished(rolls(...nine, 7, 3, 4)));
  assert.ok(finished(rolls(...nine, 7, 2)));
  assert.deepEqual(position(rolls(...nine, 7, 2)), { frame: 9, ball: 2, fullRack: false, done: true });
  // Strike, then 7: the third ball faces the 3 left. Strike, 7, spare.
  const r = rolls(...nine, 10, 7, 3);
  assert.deepEqual(sheet(r)[9].marks, ['X', '7', '/']);
  assert.equal(score(r), 30 * 7 + 30 + 27 + 20);
  assert.equal(pinsUp(rolls(...nine, 10, 7)), 3);
  assert.equal(pinsUp(rolls(...nine, 10, 10)), 10);
  assert.equal(pinsUp(rolls(...nine, 6, 4)), 10);
  // Spare then strike, two strikes and a 9.
  assert.deepEqual(sheet(rolls(...nine, 6, 4, 10))[9].marks, ['6', '/', 'X']);
  assert.deepEqual(sheet(rolls(...nine, 10, 10, 9))[9].marks, ['X', 'X', '9']);
  assert.deepEqual(sheet(rolls(...nine, 10, 0, 10))[9].marks, ['X', '-', '/']);
});

test('fouls count nothing; after a foul on the first ball all ten on the second is a spare', () => {
  const r = rolls('F', 10, 5, 0);
  assert.deepEqual(sheet(r)[0].marks, ['F', '/']);
  assert.equal(sheet(r)[0].total, 15);
  assert.deepEqual(position(rolls('F')), { frame: 0, ball: 1, fullRack: true, done: false }, 'the rack is set again after a foul');
  assert.equal(pinsUp(rolls('F')), 10);
  assert.equal(pinsUp(rolls(7)), 3);
  assert.deepEqual(sheet(rolls(7, 'F'))[0].marks, ['7', 'F']);
  assert.equal(sheet(rolls(7, 'F'))[0].total, 7);
  // In the tenth: a foul first, all ten: a spare and a third ball.
  const nine = repeat(9, 0, 0).flat();
  const t = rolls(...nine, 'F', 10, 4);
  assert.ok(finished(t));
  assert.deepEqual(sheet(t)[9].marks, ['F', '/', '4']);
  assert.equal(score(t), 14);
  // A strike, then a foul: the third ball faces a full rack again, and all ten is a spare.
  const u = rolls(...nine, 10, 'F', 10);
  assert.deepEqual(sheet(u)[9].marks, ['X', 'F', '/']);
  assert.equal(score(u), 20);
  assert.equal(position(rolls(...nine, 10, 'F')).fullRack, true);
});

test('where the game stands, ball by ball', () => {
  assert.deepEqual(position([]), { frame: 0, ball: 0, fullRack: true, done: false });
  assert.deepEqual(position(rolls(3)), { frame: 0, ball: 1, fullRack: false, done: false });
  assert.deepEqual(position(rolls(3, 4)), { frame: 1, ball: 0, fullRack: true, done: false });
  assert.deepEqual(position(rolls(10)), { frame: 1, ball: 0, fullRack: true, done: false });
  assert.equal(pinsUp(rolls(...repeat(12, 10))), 0);
});

test('strike runs and what the monitors celebrate', () => {
  assert.equal(celebration(rolls(10)), 'strike');
  assert.equal(celebration(rolls(10, 10)), 'double');
  assert.equal(celebration(rolls(10, 10, 10)), 'turkey');
  assert.equal(celebration(rolls(10, 10, 10, 10)), 'hambone');
  assert.equal(strikeRun(rolls(10, 10, 3)), 0);
  assert.equal(celebration(rolls(4, 6)), 'spare');
  assert.equal(celebration(rolls('F')), 'foul');
  assert.equal(celebration(rolls(4, 3)), null);
  assert.equal(celebration([{ pins: 8, left: left(7, 10) }]), 'split');
});

test('splits: the head pin down and the pins left apart', () => {
  for (const s of [[7, 10], [4, 6], [2, 7], [3, 10], [5, 7], [5, 10], [6, 7, 10], [4, 6, 7, 10], [7, 9], [8, 10], [4, 9], [5, 6], [4, 5]]) assert.ok(isSplit(left(...s)), `${s.join('-')} is a split`);
  for (const s of [[1, 2, 4, 7], [2, 8], [3, 9], [2, 4, 5, 8], [6, 10], [4, 7], [10], [7], [3, 5, 6], [8, 9], [9, 10], [5, 8], [3, 6, 10]]) assert.ok(!isSplit(left(...s)), `${s.join('-')} isn't`);
  assert.ok(!isSplit(left(1, 7, 10)), 'never with the head pin up');
  assert.equal(leaveName(left(7, 10)), '7-10');
  // On the sheet: the first ball's mark is circled.
  const r: Roll[] = [{ pins: 8, left: left(7, 10) }, { pins: 1 }];
  assert.deepEqual(sheet(r)[0].splits, [true, false]);
});

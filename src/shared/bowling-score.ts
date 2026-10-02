// Ten-pin scoring (flrnoh fork, see FORK.md "Bowling lanes"): frames, strikes and spares with their
// bonus balls, the tenth frame's extra balls, fouls, splits, and what the sheet shows. Pure; the
// office scores with it and the monitors draw it.

import { FULL_RACK, PIN_COUNT, PIN_SPOTS, type Roll } from './bowling-game.js';

export const FRAMES = 10;

/** Where a game stands: the frame (0–9) and ball (0–2) up next, whether that ball faces a full rack, and whether it's over. */
export interface Position {
  frame: number;
  ball: number;
  fullRack: boolean;
  done: boolean;
}

/** Walks the rolls frame by frame. */
export function position(rolls: readonly Roll[]): Position {
  let i = 0;
  for (let frame = 0; frame < FRAMES; frame++) {
    if (frame < FRAMES - 1) {
      if (i >= rolls.length) return { frame, ball: 0, fullRack: true, done: false };
      if (rolls[i].pins === PIN_COUNT) {
        i += 1;
        continue;
      }
      if (i + 1 >= rolls.length) return { frame, ball: 1, fullRack: !!rolls[i].foul, done: false };
      i += 2;
      continue;
    }
    // The tenth: a strike or a spare earns more balls, and the rack's set fresh after each mark.
    const a = rolls[i];
    const b = rolls[i + 1];
    const c = rolls[i + 2];
    if (!a) return { frame, ball: 0, fullRack: true, done: false };
    if (!b) return { frame, ball: 1, fullRack: a.pins === PIN_COUNT || !!a.foul, done: false };
    const marked = a.pins === PIN_COUNT || a.pins + b.pins === PIN_COUNT;
    if (!marked) return { frame, ball: 2, fullRack: false, done: true };
    if (!c) {
      const fresh = (a.pins === PIN_COUNT && b.pins === PIN_COUNT) || (a.pins < PIN_COUNT && a.pins + b.pins === PIN_COUNT) || (a.pins === PIN_COUNT && !!b.foul);
      return { frame, ball: 2, fullRack: fresh, done: false };
    }
    return { frame, ball: 3, fullRack: false, done: true };
  }
  return { frame: FRAMES, ball: 0, fullRack: true, done: true };
}

/** Whether a game is over. */
export const finished = (rolls: readonly Roll[]) => position(rolls).done;

/** How many pins are up for the next ball (10 on a full rack). */
export function pinsUp(rolls: readonly Roll[]): number {
  const p = position(rolls);
  if (p.done) return 0;
  if (p.fullRack) return PIN_COUNT;
  return PIN_COUNT - rolls[rolls.length - 1].pins;
}

/** One frame on the sheet. */
export interface FrameView {
  /** What each ball shows: X, /, -, F, a digit, or '' for not yet. */
  marks: string[];
  /** Whether that ball left a split (the mark's circled). */
  splits: boolean[];
  /** The running total, once it's known. */
  total: number | null;
}

/** The whole sheet: ten frames, each with its marks and running total. */
export function sheet(rolls: readonly Roll[]): FrameView[] {
  const frames: FrameView[] = [];
  let i = 0;
  let run = 0;
  const pins = (k: number) => (k < rolls.length ? rolls[k].pins : null);
  const mark = (r: Roll, prevPins: number | null): string => {
    if (r.foul) return 'F';
    if (prevPins === null) return r.pins === PIN_COUNT ? 'X' : r.pins === 0 ? '-' : String(r.pins);
    if (prevPins + r.pins === PIN_COUNT) return '/';
    return r.pins === 0 ? '-' : String(r.pins);
  };
  const split = (r: Roll, first: boolean) => first && r.left !== undefined && !r.foul && isSplit(r.left);
  for (let f = 0; f < FRAMES; f++) {
    const view: FrameView = { marks: [], splits: [], total: null };
    frames.push(view);
    if (i >= rolls.length) continue;
    if (f < FRAMES - 1) {
      const a = rolls[i];
      if (a.pins === PIN_COUNT) {
        view.marks.push('X');
        view.splits.push(false);
        const b1 = pins(i + 1);
        const b2 = pins(i + 2);
        if (b1 !== null && b2 !== null) view.total = run += PIN_COUNT + b1 + b2;
        i += 1;
        continue;
      }
      view.marks.push(mark(a, null));
      view.splits.push(split(a, true));
      const b = rolls[i + 1];
      if (!b) continue;
      // After a foul on the first ball the rack's reset: all ten on the second is still a spare.
      view.marks.push(mark(b, a.pins));
      view.splits.push(false);
      if (a.pins + b.pins === PIN_COUNT) {
        const b1 = pins(i + 2);
        if (b1 !== null) view.total = run += PIN_COUNT + b1;
      } else view.total = run += a.pins + b.pins;
      i += 2;
      continue;
    }
    // The tenth frame: up to three balls, each scored against the rack it faced. After a foul the
    // rack's set again, but the next ball finishes the "frame" of it: all ten then is a spare.
    const tenth = rolls.slice(i, i + 3);
    let prev: number | null = null; // pins counted so far on the current rack, null on a fresh one
    let fresh = true;
    for (const r of tenth) {
      view.marks.push(mark(r, prev));
      view.splits.push(split(r, fresh));
      if (prev === null) {
        prev = r.foul ? 0 : r.pins === PIN_COUNT ? null : r.pins;
        fresh = !!r.foul || r.pins === PIN_COUNT;
      } else {
        prev = null;
        fresh = true;
      }
    }
    if (finished(rolls)) view.total = run += tenth.reduce((s, r) => s + r.pins, 0);
  }
  return frames;
}

/** The score as it stands: every frame whose total is known, plus what's down in the open one. */
export function score(rolls: readonly Roll[]): number {
  const s = sheet(rolls);
  let known = 0;
  for (const f of s) if (f.total !== null) known = f.total;
  return known;
}

/** The final score (or what the sheet adds up to so far, bonuses counted only once they're bowled). */
export function total(rolls: readonly Roll[]): number {
  return score(rolls);
}

/** Strikes and spares in a game (the tenth's bonus balls included). */
export function marks(rolls: readonly Roll[]): { strikes: number; spares: number } {
  let strikes = 0;
  let spares = 0;
  for (const f of sheet(rolls)) for (const m of f.marks) m === 'X' ? strikes++ : m === '/' ? spares++ : 0;
  return { strikes, spares };
}

/** Strikes in a row up to the last ball (0 if it wasn't one). */
export function strikeRun(rolls: readonly Roll[]): number {
  const flat = sheet(rolls).flatMap((f) => f.marks);
  let n = 0;
  for (let k = flat.length - 1; k >= 0 && flat[k] === 'X'; k--) n++;
  return n;
}

/** What a ball just did, for the monitors' celebrations. */
export type Celebration = 'perfect' | 'strike' | 'double' | 'turkey' | 'hambone' | 'spare' | 'split' | 'foul' | null;
export function celebration(rolls: readonly Roll[]): Celebration {
  if (!rolls.length) return null;
  const flat = sheet(rolls).flatMap((f) => f.marks.map((m, k) => ({ m, split: f.splits[k] })));
  const it = flat[flat.length - 1];
  if (!it) return null;
  if (finished(rolls) && score(rolls) === 300) return 'perfect';
  if (it.m === 'F') return 'foul';
  if (it.m === 'X') {
    const run = strikeRun(rolls);
    return run >= 4 ? 'hambone' : run === 3 ? 'turkey' : run === 2 ? 'double' : 'strike';
  }
  if (it.m === '/') return 'spare';
  if (it.split) return 'split';
  return null;
}

// ---- Splits --------------------------------------------------------------------------------------

/** Pins next to each other (a foot apart), and those one behind the other two rows apart (2-8, 3-9, 1-5: sleepers, no split). */
const linked = (a: number, b: number) => {
  const p = PIN_SPOTS[a];
  const q = PIN_SPOTS[b];
  const dr = Math.abs(p.row - q.row);
  const dc = Math.abs(p.col - q.col);
  return (dr === 0 && dc === 2) || (dr === 1 && dc === 1) || (dr === 2 && dc === 0);
};
/** The pin just ahead of and between two side by side (5-6: the 3; 8-9: the 5), or -1. */
const aheadOf = (a: number, b: number) => {
  const p = PIN_SPOTS[a];
  const q = PIN_SPOTS[b];
  if (p.row !== 2 || q.row !== 2 || Math.abs(p.col - q.col) !== 2) return -1;
  const col = (p.col + q.col) / 2;
  return PIN_SPOTS.findIndex((s) => s.row === p.row - 1 && s.col === col);
};

/**
 * Whether what's left standing (`left`, bit n is pin n+1) is a split: the head pin is down, two or
 * more pins stand, and they're apart (a pin down between them: 7-10, 4-6, 2-7, 3-10, 5-7) or two side
 * by side in the middle row have the pin just ahead of them down (4-5, 5-6). The 2-8 and 3-9 (one
 * behind another) and the back row's neighbours (8-9, 9-10) aren't.
 */
export function isSplit(left: number): boolean {
  if (left & 1) return false;
  const up: number[] = [];
  for (let n = 0; n < PIN_COUNT; n++) if (left & (1 << n)) up.push(n);
  if (up.length < 2) return false;
  // Apart: not all one group.
  const seen = new Set([up[0]]);
  const queue = [up[0]];
  while (queue.length) {
    const a = queue.pop()!;
    for (const b of up) if (!seen.has(b) && linked(a, b)) (seen.add(b), queue.push(b));
  }
  if (seen.size < up.length) return true;
  for (const a of up)
    for (const b of up) {
      const f = a < b ? aheadOf(a, b) : -1;
      if (f >= 0 && !(left & (1 << f))) return true;
    }
  return false;
}

/** The pins standing as numbers 1–10, for the sheet ("7-10"). */
export function leaveName(left: number): string {
  const out: number[] = [];
  for (let n = 0; n < PIN_COUNT; n++) if (left & (1 << n)) out.push(n + 1);
  return out.join('-');
}

export { FULL_RACK };

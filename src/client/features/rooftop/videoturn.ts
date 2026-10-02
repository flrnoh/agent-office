import type { DjFrame } from '../../dnb';

/*
 * When the LED wall shows the DJ set's own video (flrnoh fork, see FORK.md "The set's video on the
 * LED wall"): now and then, not all the time, and by the frame alone, so every screen on the roof
 * agrees. In a groove (intro) or a breakdown, 16 or 32 bars out of every 64; in a drop, just the
 * first two bars of each sixteen, never while FLOGGE OFFICE flashes as it lands; never through a
 * build (that's the tunnel and the countdown's). Anyone who'd rather nothing flashed gets it all along.
 */

/** Which 16–32 bars of each 64 the video has in a groove or a breakdown: [first bar, how many], picked per 64 bars. */
const WINDOWS: readonly [number, number][] = [
  [16, 16],
  [16, 32],
  [32, 16],
  [32, 32],
  [8, 16],
  [24, 32],
];

/** The same number on every screen for the same 64 bars. */
function pick(n: number): number {
  return (Math.imul(n + 0x9e37, 0x85ebca6b) >>> 13) % WINDOWS.length;
}

/** Whether it's the video's turn on the wall. `calm`: reduce motion, where it stays on in place of the plasma. */
export function videoTurn(f: Pick<DjFrame, 'beats' | 'part' | 'sinceDrop' | 'track'>, calm: boolean): boolean {
  if (calm) return true;
  // FLOGGE OFFICE as a drop lands is the wall's own (see ledwall.ts' words).
  if (f.sinceDrop < 8) return false;
  const bar = Math.floor(f.beats / 4);
  if (f.part === 'build') return false;
  if (f.part === 'drop') return ((bar % 16) + 16) % 16 < 2;
  const block = Math.floor(bar / 64);
  const [from, bars] = WINDOWS[pick(block + f.track)];
  const inBlock = bar - block * 64;
  return inBlock >= from && inBlock < from + bars;
}

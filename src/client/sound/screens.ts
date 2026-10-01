import { DJ_BOOTH } from '../../shared/layout';
import type { AudioCore } from './core';
import type { Pos } from './places';

// flrnoh fork: how loud the players that play outside Web Audio should be where you stand.

/**
 * How loud a DJ set playing in an embedded player (see client/djset.ts) is where you stand, 0–1:
 * `musicGain` (your music volume), fading with distance from the booth as the house DJ does.
 */
export function djSetVolume(a: AudioCore, musicGain: number): number {
  const l = a.listener;
  const d = Math.max(7, Math.hypot(l.x - DJ_BOOTH.x, l.y - 2.2, l.z - DJ_BOOTH.z));
  return Math.min(1, musicGain * (7 / (7 + 0.8 * (d - 7))));
}

/**
 * How loud a stream on the office TV (see client/tv.ts) is where you stand, 0–1: your music and
 * master volume, fading with distance from `at` (the TV) and gone beyond 30 m.
 */
export function tvVolume(a: AudioCore, at: Pos, musicGain: number): number {
  const l = a.listener;
  const d = Math.max(6, Math.hypot(l.x - at.x, l.y - at.y, l.z - at.z));
  if (d > 30) return 0;
  return Math.min(1, a.masterGain() * musicGain * (6 / (6 + 0.5 * (d - 6))) * Math.min(1, (30 - d) / 6));
}

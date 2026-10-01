import { RIG } from '../../shared/rig';
import type { RaceEvent } from '../../shared/racing';
import type { AudioCore } from './core';
import { hiss } from './hiss';

// ---- The racing rig (flrnoh fork, see ui/rig.ts) -----------------------------------------------------

/**
 * The rig's TV: the countdown's beeps and the green, a lap (a quicker one gets a third note), the
 * chequered flag's fanfare, and a knock into a rival or the wall. From the TV, and soft: the lounge
 * only hears it from close by.
 */
export function rig(a: AudioCore, kind: RaceEvent) {
  const ctx = a.ctx;
  if (!ctx) return;
  a.count(`rig.${kind}`);
  const at = { x: RIG.x, y: RIG.screen.y, z: RIG.screen.z };
  const out = a.panner(at, 1, 1.8);
  out.connect(a.ambience);
  const t0 = ctx.currentTime + 0.01;
  if (kind === 'count') a.blip(out, t0, 440, 1, 0.16, 0.08, 'square');
  else if (kind === 'go') a.blip(out, t0, 880, 1, 0.45, 0.09, 'square');
  else if (kind === 'lap' || kind === 'best') (kind === 'best' ? [660, 880, 1175] : [660, 880]).forEach((f, i) => a.blip(out, t0 + i * 0.09, f, 1, 0.1, 0.07, 'square'));
  else if (kind === 'finish') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => a.blip(out, t0 + i * 0.12, f, 1, i === 5 ? 0.4 : 0.11, 0.08, 'square'));
  else {
    a.blip(out, t0, kind === 'wall' ? 70 : 110, 0.5, 0.18, 0.12);
    hiss(a, out, t0, kind === 'wall' ? 700 : 1400, 0.9, [
      [0.01, 0.06],
      [0.2, 0],
    ]);
  }
}

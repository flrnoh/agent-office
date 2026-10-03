import { POOL_DEFAULTS, type PoolDef } from './swim.js';
import { WELLENBAD, type TFixture, type TRect } from './therme.js';

/*
 * The wave pool (flrnoh fork, see FORK.md "The thermal baths", phase 3): the Thermenparadies's south
 * half, a beach running down into it at its north end (you wade in, step by step) and the deep water
 * beyond, where the waves run. They run by the office's clock (`store.officeNow()` on the page), every
 * page working out the same surface at the same moment, so nothing goes over the wire: every
 * WAVE_EVERY a horn, a few seconds' build-up, WAVE_RUN of waves rolling in toward the beach, lifting
 * whoever swims and carrying them shoreward, then calm again.
 */

const W = WELLENBAD;

/** The beach: from the deck (y 0) at its north edge down in steps into the water, to the deep water's edge. */
export const BEACH = { minX: W.minX, maxX: W.maxX, minZ: W.minZ, maxZ: W.minZ + 12, steps: 12, bottom: -1.2 } as const;
/** The deep water, past the beach. */
export const DEEP: TRect = { minX: W.minX, maxX: W.maxX, minZ: BEACH.maxZ, maxZ: W.maxZ };
export const WAVE_WATER = { surface: -0.12, floor: -2.3 } as const;

/** How the waves go: every so often (ms), for so long, how high (m), how long from crest to crest (m), how many seconds a wave takes to pass. */
export const WAVES = { every: 8 * 60_000, run: 2 * 60_000, ramp: 8_000, height: 0.45, length: 9, period: 3.4 } as const;
/** How hard the waves carry a swimmer toward the beach (m/s at full height). */
export const WAVE_PUSH = 0.55;

/** The beach's steps, highest first: each one `rise` lower and a metre further in, solid down to the deep floor. */
export function beachSteps(): TFixture[] {
  const n = BEACH.steps;
  const run = (BEACH.maxZ - BEACH.minZ) / n;
  return Array.from({ length: n }, (_, i) => ({ id: `beach-${i}`, minX: BEACH.minX, maxX: BEACH.maxX, minZ: BEACH.minZ + i * run, maxZ: BEACH.minZ + (i + 1) * run, bottom: WAVE_WATER.floor - 0.3, top: (BEACH.bottom * (i + 1)) / n }));
}

/** The floor's height under (x, z) on the beach (its step's top), or undefined off it. */
export function beachFloorAt(x: number, z: number): number | undefined {
  if (x < BEACH.minX || x > BEACH.maxX || z < BEACH.minZ || z >= BEACH.maxZ) return undefined;
  const i = Math.min(BEACH.steps - 1, Math.floor(((z - BEACH.minZ) / (BEACH.maxZ - BEACH.minZ)) * BEACH.steps));
  return (BEACH.bottom * (i + 1)) / BEACH.steps;
}

/** How far into the wave cycle `now` (office ms) is. */
const into = (now: number) => ((now % WAVES.every) + WAVES.every) % WAVES.every;

/** How strong the waves are at `now`: 0 calm, 1 full, easing in and out at either end of a run. */
export function waveStrength(now: number): number {
  const t = into(now);
  if (t >= WAVES.run) return 0;
  const k = Math.min(1, t / WAVES.ramp, (WAVES.run - t) / WAVES.ramp);
  return k * k * (3 - 2 * k);
}

/** When the next run of waves starts (office ms), from `now`; `now` itself while they're running. */
export function nextWaves(now: number): number {
  const t = into(now);
  return t < WAVES.run ? now - t : now - t + WAVES.every;
}

/** How long (ms) the waves still run at `now`, or 0 when calm. */
export const wavesLeft = (now: number) => Math.max(0, WAVES.run - into(now));

/** How far the surface is lifted at (x, z) at `now`: waves rolling toward the beach (−z), lower over the shallows. */
export function waveSwell(x: number, z: number, now: number): number {
  const s = waveStrength(now);
  if (!s || z < W.minZ || z > W.maxZ || x < W.minX || x > W.maxX) return 0;
  const k = (Math.PI * 2) / WAVES.length;
  const w = (Math.PI * 2) / WAVES.period;
  // Shallower toward the beach, and fading in from the back wall.
  const shore = Math.min(1, Math.max(0.25, (z - BEACH.minZ) / (BEACH.maxZ - BEACH.minZ + 6)));
  const back = Math.min(1, (W.maxZ - z) / 3);
  // A little slant across, so they don't come in as one ruler-straight line.
  return WAVES.height * s * shore * back * Math.sin(k * (z + 0.08 * (x - W.minX)) + (w * now) / 1000);
}

/** Which way the water carries you at (x, z) at `now`: toward the beach while the waves run. */
export function waveFlow(_x: number, _z: number, now: number): { x: number; z: number } {
  const s = waveStrength(now);
  return { x: 0, z: -WAVE_PUSH * s };
}

export const WAVE_POOL: PoolDef = {
  ...POOL_DEFAULTS,
  id: 'therme-waves',
  rects: [DEEP],
  surface: WAVE_WATER.surface,
  floor: WAVE_WATER.floor,
  sink: 1.25,
  deck: 0,
  speed: 1.5,
  fast: 2.3,
  swell: waveSwell,
  flow: waveFlow,
  // Climbing out onto the beach is onto its lowest step, not the deck's height.
  climbOut: (x, z) => (z < DEEP.minZ + 2 ? { x, z: DEEP.minZ - 0.5 } : z > DEEP.maxZ - 1.5 ? { x, z: DEEP.maxZ + 0.45 } : x < DEEP.minX + 1.5 ? { x: DEEP.minX - 0.45, z } : { x: DEEP.maxX + 0.45, z }),
};

/** Where the wave board stands (over the beach, facing it), and its size. */
export const WAVE_BOARD = { x: (W.minX + W.maxX) / 2, z: W.minZ - 2.6, w: 6, h: 2.2, y: 4.2 } as const;

/** What the board says at `now`: the waves running (and for how long), or when they're next. */
export function waveBoard(now: number): { big: string; small: string } {
  const left = wavesLeft(now);
  const mmss = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  if (left > 0) return { big: '🌊 WELLEN!', small: `noch ${mmss(left)}` };
  return { big: `Wellen in ${mmss(nextWaves(now) - now)}`, small: 'alle 8 Minuten · 2 Minuten lang' };
}

/** Every solid thing of the wave pool: the beach's steps and the deep floor. */
export function waveFixtures(): TFixture[] {
  return [...beachSteps(), { id: 'waves-floor', ...DEEP, bottom: WAVE_WATER.floor - 0.3, top: WAVE_WATER.floor }];
}

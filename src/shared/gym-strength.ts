// The strength floor (flrnoh fork, see shared/gym.ts): benches, racks, machines and the heavy bag.
// You pick a weight and how many reps to go for; the office works the set out rep by rep — heavier
// than you're used to (for your level) and the odds of grinding out the last few reps drop, and a
// tired body (low energy) folds sooner. Volume (weight × reps) is what earns fitness points, with a
// bonus for hitting your target. Pure and shared, so the server runs it and the tests check it.

import { STAMINA_MAX } from './gym.js';

/** What each piece of strength kit is: how it reads, and how heavy it goes. */
export interface Exercise {
  name: string;
  icon: string;
  unit: string;
  /** The weight a level-1 lifter is comfortable with (their reps rarely fail here). */
  base: number;
  /** How much heavier they get comfortable with per level. */
  perLevel: number;
  /** The step the weight selector moves in. */
  step: number;
  /** The heaviest the selector allows. */
  max: number;
  /** Fitness points per unit of volume lifted. */
  xpPerVolume: number;
  /** How the window and the toast talk about a rep. */
  verb: string;
}

export const EXERCISES: Record<string, Exercise> = {
  bench: { name: 'Bench press', icon: '🏋️', unit: 'kg', base: 30, perLevel: 2.2, step: 5, max: 300, xpPerVolume: 0.012, verb: 'press' },
  squat: { name: 'Squat', icon: '🦵', unit: 'kg', base: 40, perLevel: 3, step: 5, max: 400, xpPerVolume: 0.01, verb: 'squat' },
  deadlift: { name: 'Deadlift', icon: '🏋️', unit: 'kg', base: 50, perLevel: 3.4, step: 10, max: 450, xpPerVolume: 0.009, verb: 'pull' },
  legpress: { name: 'Leg press', icon: '🦿', unit: 'kg', base: 80, perLevel: 5, step: 10, max: 600, xpPerVolume: 0.006, verb: 'press' },
  latpull: { name: 'Lat pulldown', icon: '🔻', unit: 'kg', base: 30, perLevel: 2, step: 5, max: 200, xpPerVolume: 0.013, verb: 'pull' },
  shoulder: { name: 'Shoulder press', icon: '💪', unit: 'kg', base: 20, perLevel: 1.6, step: 2.5, max: 150, xpPerVolume: 0.016, verb: 'press' },
  cable: { name: 'Cable machine', icon: '🪢', unit: 'kg', base: 20, perLevel: 1.6, step: 5, max: 150, xpPerVolume: 0.016, verb: 'rep' },
  dumbbell: { name: 'Dumbbells', icon: '🏋️', unit: 'kg', base: 10, perLevel: 1, step: 2, max: 60, xpPerVolume: 0.02, verb: 'curl' },
  bag: { name: 'Heavy bag', icon: '🥊', unit: 'combo', base: 6, perLevel: 0.5, step: 1, max: 40, xpPerVolume: 0.05, verb: 'combo' },
};

/** The most reps a set may go for (a script can't ask for a million). */
export const MAX_TARGET = 20;
export const MIN_TARGET = 1;
/** Energy a single rep costs, before the weight makes it dearer. */
const REP_STAMINA = 2.2;

/** The weight `exercise` starts you at for your level, rounded to its step: the window's default. */
export function comfyWeight(exercise: Exercise, level: number): number {
  const raw = exercise.base + Math.max(0, level - 1) * exercise.perLevel;
  return Math.min(exercise.max, Math.round(raw / exercise.step) * exercise.step);
}

/** Whether `weight` is one the selector could produce for this exercise. */
export function validWeight(exercise: Exercise, weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 && weight <= exercise.max && Math.abs(weight / exercise.step - Math.round(weight / exercise.step)) < 1e-6;
}

export interface SetResult {
  /** Reps completed with good form. */
  reps: number;
  target: number;
  weight: number;
  volume: number;
  xp: number;
  /** True if the set ended early: the last rep's form broke. */
  failed: boolean;
  /** Energy the set cost. */
  staminaSpent: number;
  /** Each attempted rep, true for a clean one (for the window to animate). */
  form: boolean[];
}

/**
 * Works a set out rep by rep. Each rep's odds fall the heavier the weight is over what's comfortable
 * for `level`, and with the fatigue that builds through the set on top of how tired you already are
 * (`stamina`). The first form break ends the set. Pure: `random` is 0…n-1, like the casino's.
 */
export function simulateSet(
  opts: { exercise: Exercise; weight: number; target: number; level: number; stamina: number },
  random: (n: number) => number,
): SetResult {
  const { exercise, weight, level } = opts;
  const target = Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.floor(opts.target)));
  const comfy = comfyWeight(exercise, level);
  // How far over (or under) your comfortable weight this is: 0 at comfy, 1 at twice comfy.
  const over = Math.max(-0.5, (weight - comfy) / comfy);
  const form: boolean[] = [];
  let reps = 0;
  let failed = false;
  let stamina = opts.stamina;
  let staminaSpent = 0;
  for (let i = 0; i < target; i++) {
    const fatigue = i * 0.05 + (1 - stamina / STAMINA_MAX) * 0.35;
    // Base odds: comfy weight ≈ 0.97, and every 10% over knocks ~9% off, before fatigue.
    const p = Math.max(0.03, Math.min(0.995, 0.97 - over * 0.9 - fatigue));
    const clean = random(10000) < Math.round(p * 10000);
    form.push(clean);
    const cost = REP_STAMINA * (1 + Math.max(0, over));
    stamina = Math.max(0, stamina - cost);
    staminaSpent += cost;
    if (!clean) {
      failed = true;
      break;
    }
    reps++;
  }
  const volume = Math.round(weight * reps);
  const hit = reps >= target;
  const xp = Math.round(volume * exercise.xpPerVolume) + (hit ? Math.round(target * 1.5) : 0);
  return { reps, target, weight, volume, xp, failed, staminaSpent: Math.round(staminaSpent), form };
}

/** What the server sends everyone about a strength station. */
export interface StrengthView {
  kind: 'strength';
  machine: string;
  /** Who's on it, if anyone. */
  player?: string;
  /** The weight they last had loaded (so the plates on the bar look right to onlookers). */
  weight: number;
  /** A set is being worked right now (the lifter animates): when it ends. */
  working: boolean;
  until?: number;
  /** How their last set went, for the window and the felt to show. */
  last?: { reps: number; target: number; weight: number; volume: number; xp: number; failed: boolean };
  /** Their best single-set volume on this machine. */
  bestVolume?: number;
}

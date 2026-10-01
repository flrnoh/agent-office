// The cardio deck (flrnoh fork, see shared/gym.ts): treadmills, bikes, a rower and a cross-trainer,
// along the front windows. You start a session and pick how hard to go; the office runs it on its
// clock, piling up distance and calories while you're on it and burning energy the harder you push.
// When you run out of puff you drop to a walk by yourself. Calories are what earn fitness points.
// Pure and shared, so the server steps the session and the tests check the sums.

import { STAMINA_MAX } from './gym.js';

/** How hard you're going. */
export type Intensity = 'easy' | 'steady' | 'hard' | 'sprint';
export const INTENSITIES: readonly Intensity[] = ['easy', 'steady', 'hard', 'sprint'];

export function isIntensity(v: unknown): v is Intensity {
  return typeof v === 'string' && (INTENSITIES as readonly string[]).includes(v);
}

/** What each cardio machine is: how it reads, how fast it goes and how it tires you. */
export interface CardioMachine {
  name: string;
  icon: string;
  /** What the distance is called and how it's shown. */
  unit: string;
  /** Metres a second at each intensity, at full energy. */
  speed: Record<Intensity, number>;
  /** Calories burned per metre. */
  calPerMeter: number;
  /** A word for the effort, on the toast. */
  verb: string;
}

export const CARDIO_MACHINES: Record<string, CardioMachine> = {
  treadmill: { name: 'Treadmill', icon: '🏃', unit: 'm', speed: { easy: 1.6, steady: 3.0, hard: 4.4, sprint: 6.2 }, calPerMeter: 0.9, verb: 'run' },
  bike: { name: 'Exercise bike', icon: '🚴', unit: 'm', speed: { easy: 3.5, steady: 6.5, hard: 9.5, sprint: 13 }, calPerMeter: 0.35, verb: 'ride' },
  rower: { name: 'Rowing machine', icon: '🚣', unit: 'm', speed: { easy: 2.2, steady: 3.6, hard: 5.0, sprint: 6.8 }, calPerMeter: 0.8, verb: 'row' },
  elliptical: { name: 'Cross-trainer', icon: '🏃', unit: 'm', speed: { easy: 2.0, steady: 3.4, hard: 4.8, sprint: 6.4 }, calPerMeter: 0.7, verb: 'stride' },
};

/** Energy burned per second at each intensity. */
const STAMINA_COST: Record<Intensity, number> = { easy: 0.15, steady: 0.5, hard: 1.1, sprint: 2.4 };
/** Fitness points per calorie burned. */
export const XP_PER_CALORIE = 0.6;

/** A cardio session as it stands. */
export interface CardioSession {
  intensity: Intensity;
  meters: number;
  calories: number;
  secs: number;
}

/**
 * Moves a session on by `dt` seconds. With little energy left, high intensities can't be held: the
 * effective pace eases towards a walk, and once the tank's empty you can only walk (easy). Returns
 * the new session, the energy it spent and the speed right now (for the belt/wheel animation).
 */
export function cardioStep(session: CardioSession, dt: number, stamina: number, machine: CardioMachine): { session: CardioSession; staminaSpent: number; speed: number } {
  const want = session.intensity;
  // Below a quarter tank the body can't sustain the hard efforts: fade towards easy.
  const puff = Math.max(0, Math.min(1, stamina / (STAMINA_MAX * 0.25)));
  const eff = stamina <= 0 ? 'easy' : want;
  const full = machine.speed[eff];
  const easy = machine.speed.easy;
  const speed = eff === 'easy' ? easy : easy + (full - easy) * puff;
  const meters = speed * dt;
  const calories = meters * machine.calPerMeter;
  const staminaSpent = Math.min(stamina, STAMINA_COST[eff] * dt * (eff === 'easy' ? 1 : puff * 0.7 + 0.3));
  return {
    session: {
      intensity: session.intensity,
      meters: session.meters + meters,
      calories: session.calories + calories,
      secs: session.secs + dt,
    },
    staminaSpent,
    speed,
  };
}

/** The fitness points a finished session is worth. */
export function cardioXp(session: CardioSession): number {
  return Math.round(session.calories * XP_PER_CALORIE);
}

/** What the server sends everyone about a cardio machine. */
export interface CardioView {
  kind: 'cardio';
  machine: string;
  player?: string;
  running: boolean;
  intensity: Intensity;
  meters: number;
  calories: number;
  secs: number;
  /** Metres a second right now, for onlookers' belts and wheels to turn at. */
  speed: number;
}

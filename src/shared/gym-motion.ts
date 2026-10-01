// How the gym's cardio and strength equipment moves (flrnoh fork, see FORK.md "The gym" → Equipment).
// Pure and shared: the server times a strength set by it (so everyone's lifter finishes the set when
// the office says it's done), the set's window ticks its reps by it, and the 3D machines and the
// people on them (client/world/gym/equipment.ts) turn the stations' views into a tempo, a rep phase,
// how high the weight stack is and which plates are on the bar. The tests check the sums.

/** Seconds a strength set takes to get going (unracking the bar, gripping the handles) before the first rep. */
export const SET_LEAD = 0.7;
/** Seconds after the last rep to rack the bar / let the stack down. */
export const SET_TAIL = 0.6;

/** A natural tempo for one rep (up and down) on each piece of strength kit, in seconds. The bag's "rep" is a combo. */
export const REP_SECONDS: Record<string, number> = {
  bench: 1.5,
  squat: 1.7,
  deadlift: 1.9,
  legpress: 1.4,
  latpull: 1.3,
  shoulder: 1.3,
  cable: 1.25,
  dumbbell: 1.2,
  bag: 1.1,
};

export function repSeconds(machine: string): number {
  return REP_SECONDS[machine] ?? 1.4;
}

/** How many reps a set tried: the clean ones, plus the one whose form broke. */
export function setAttempts(last: { reps: number; failed: boolean } | undefined): number {
  if (!last) return 0;
  return Math.max(0, Math.floor(last.reps)) + (last.failed ? 1 : 0);
}

/** How long a set of `attempts` reps takes on `machine`, in ms: the lead-in, the reps and racking it. */
export function setDurationMs(machine: string, attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.round((SET_LEAD + n * repSeconds(machine) + SET_TAIL) * 1000);
}

/** When the i-th rep (0-based) of a set reaches the top of its movement, in seconds from the set's start: where its `rep` sound lands. */
export function repPeakAt(machine: string, i: number): number {
  return SET_LEAD + (i + REP_PEAK) * repSeconds(machine);
}

/** How far into a rep (0…1) the far point of the movement is: a quick push, a slower way back. */
export const REP_PEAK = 0.42;

const smooth = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};

/** How far along its movement a clean rep is, `u` of the way through it: 0 → 1 (the far point) → 0. */
export function repExtent(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < REP_PEAK ? smooth(u / REP_PEAK) : 1 - smooth((u - REP_PEAK) / (1 - REP_PEAK));
}

/** A rep whose form broke: it grinds up to about halfway, stalls, and sinks back. */
export function failExtent(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.55) return 0.5 * smooth(u / 0.55);
  if (u < 0.7) return 0.5 - 0.04 * Math.sin(((u - 0.55) / 0.15) * Math.PI * 3);
  return 0.5 * (1 - smooth((u - 0.7) / 0.3));
}

/**
 * A rep whose form breaks on a lift that goes down first (bench, squat): all the way down, a grind
 * back up that stalls, and the spotter (or the safeties) help it the rest of the way.
 */
export function grindExtent(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.4) return smooth(u / 0.4);
  if (u < 0.75) return 1 - 0.35 * smooth((u - 0.4) / 0.35) + 0.03 * Math.sin(((u - 0.4) / 0.35) * Math.PI * 5);
  return 0.65 * (1 - smooth((u - 0.75) / 0.25));
}

/** Lifts that start at the top and go down first: a broken rep there is stuck at the bottom, not halfway up. */
export const DOWN_FIRST: ReadonlySet<string> = new Set(['bench', 'squat', 'legpress']);

/** Where a set is, `elapsed` seconds after it started. */
export interface SetMotion {
  /** Getting set up, working reps, racking it, or over. */
  stage: 'lead' | 'rep' | 'tail' | 'done';
  /** Which rep (0-based) is under way; the last one after the reps. */
  rep: number;
  /** How far along the movement (0 at the start position, 1 at the far point). */
  extent: number;
  /** How far the weight's out of the rack / in the hands (0 racked, 1 held), easing in and out. */
  hold: number;
  /** This rep is the one whose form breaks. */
  failing: boolean;
  /** How far through the current rep (0…1), for moves with a rhythm of their own (a combo on the bag). */
  u: number;
}

export function setMotion(machine: string, elapsed: number, attempts: number, failed: boolean): SetMotion {
  const rep = repSeconds(machine);
  const n = Math.max(0, Math.floor(attempts));
  const reps = n * rep;
  if (elapsed < 0 || n === 0) return { stage: elapsed < 0 ? 'lead' : 'done', rep: 0, extent: 0, hold: 0, failing: false, u: 0 };
  if (elapsed < SET_LEAD) return { stage: 'lead', rep: 0, extent: 0, hold: smooth(elapsed / SET_LEAD), failing: false, u: 0 };
  const e = elapsed - SET_LEAD;
  if (e < reps) {
    const i = Math.min(n - 1, Math.floor(e / rep));
    const u = (e - i * rep) / rep;
    const failing = failed && i === n - 1;
    return { stage: 'rep', rep: i, extent: failing ? (DOWN_FIRST.has(machine) ? grindExtent(u) : failExtent(u)) : repExtent(u), hold: 1, failing, u };
  }
  const t = e - reps;
  if (t < SET_TAIL) return { stage: 'tail', rep: n - 1, extent: 0, hold: 1 - smooth(t / SET_TAIL), failing: false, u: 0 };
  return { stage: 'done', rep: n - 1, extent: 0, hold: 0, failing: false, u: 0 };
}

// ---- Weight stacks and plates -------------------------------------------------------------------

/** How many of a selectorized machine's `plates` the pin picks up for `weight` (of at most `max`): at least one. */
export function stackPlates(weight: number, max: number, plates: number): number {
  if (!(max > 0) || plates < 1) return 1;
  const k = Math.max(0, Math.min(1, weight / max));
  return Math.max(1, Math.min(plates, Math.ceil(k * plates)));
}

/** The plates on each side of a barbell loaded to `weight` kg (a 20 kg bar): biggest first, at most `most` of them. */
export function barPlates(weight: number, most = 6): number[] {
  const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
  let side = Math.max(0, (weight - 20) / 2);
  const out: number[] = [];
  for (const p of PLATES) {
    while (side >= p - 1e-9 && out.length < most) {
      out.push(p);
      side -= p;
    }
  }
  return out;
}

/** The dumbbell a set on the rack is done with, one of the sizes on the rack (kg), nearest to `weight`. */
export function nearestSize(weight: number, sizes: readonly number[]): number {
  let best = sizes[0] ?? weight;
  for (const s of sizes) if (Math.abs(s - weight) < Math.abs(best - weight)) best = s;
  return best;
}

// ---- Cardio ---------------------------------------------------------------------------------------

/**
 * How many movement cycles a second (strides, pedal turns, strokes) the cardio `machine` goes through
 * at `speed` metres a second: a relaxed walk to a sprint on the treadmill, 50–110 rpm on the bike,
 * 20–34 strokes a minute on the rower.
 */
export function cardioHz(machine: string, speed: number): number {
  const v = Math.max(0, speed);
  if (v <= 0.01) return 0;
  switch (machine) {
    case 'bike':
      return Math.min(1.9, 0.8 + v * 0.07);
    case 'rower':
      return Math.min(0.62, 0.3 + v * 0.045);
    case 'elliptical':
      return Math.min(1.5, 0.6 + v * 0.12);
    default:
      // A stride is two steps: ~0.9 strides/s strolling, ~1.5 flat out.
      return Math.min(1.6, 0.72 + v * 0.13);
  }
}

/** On the treadmill: walking below this speed (m/s), running above it. */
export const RUN_SPEED = 2.4;

/**
 * Eases `current` toward `target` over time (a belt spinning up or winding down rather than jumping):
 * `rate` is how quickly, per second.
 */
export function ease(current: number, target: number, dt: number, rate = 3): number {
  return current + (target - current) * Math.min(1, Math.max(0, dt) * rate);
}

/** The rowing stroke, `u` of the way through a cycle: how far the seat and the handle are back (0 at the catch, 1 at the finish). */
export function rowStroke(u: number): { seat: number; handle: number; lean: number } {
  const x = ((u % 1) + 1) % 1;
  // Drive: legs, then back, then arms (a third of the cycle). Recovery: arms, back, then legs (the rest).
  if (x < 0.35) {
    const d = x / 0.35;
    return { seat: smooth(d / 0.7), handle: smooth(d), lean: smooth((d - 0.3) / 0.5) };
  }
  const r = (x - 0.35) / 0.65;
  return { seat: 1 - smooth((r - 0.3) / 0.7), handle: 1 - smooth(r / 0.55), lean: 1 - smooth(r / 0.45) };
}

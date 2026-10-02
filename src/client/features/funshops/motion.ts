import type { PlushId } from '../../../shared/funshops';

// flrnoh fork (see FORK.md "Shops to walk into"): what moves in the Spielhalle, shared between the
// claw machine's window (claw.ts) and the machine in the shop (decor.ts): a drop as it plays out over
// a few seconds, the same on every page that heard of it, and where the claw hangs while you aim.

/** A drop in a shop's claw machine: where, when it started (page seconds), and what it grabs once the office says. */
export interface ClawRun {
  x: number;
  z: number;
  t0: number;
  /** Undefined until the office answers (it does long before the claw closes). */
  won?: PlushId | null;
  /** Where the claw was when the drop started. */
  fromX: number;
  fromZ: number;
}

/** The latest drop in each shop's machine, by the shop's place in SHOPS. */
export const clawRuns = new Map<number, ClawRun>();
/** Where you hold the claw while you aim, in the machine you're playing. */
export const clawAimAt = new Map<number, { x: number; z: number }>();
/** The booths whose curtain is drawn (yours, while you take your photos). */
export const boothDrawn = new Set<number>();

/** The claw's resting place: over the chute. */
export const CLAW_HOME = { x: 0.14, z: 0.14 };

/** How long each part of a drop takes (s): over to it, down, closing, up, back to the chute, opening. */
const STEPS = [0.7, 1.1, 0.4, 1.0, 1.0, 0.5] as const;
export const CLAW_RUN_SECONDS = STEPS.reduce((a, b) => a + b, 0);

export interface ClawPose {
  x: number;
  z: number;
  /** How far down (0 up at the rail, 1 down on the pile). */
  down: number;
  /** How far the prongs are shut (0 open, 1 shut). */
  shut: number;
  /** It has the plush with it (the office said so, and it's on the way up or over). */
  carrying: boolean;
  /** Done: the plush has dropped down the chute (if it won), the claw is home. */
  done: boolean;
}

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** Where a drop has the claw `now` (page seconds). */
export function clawPose(run: ClawRun, now: number): ClawPose {
  let t = now - run.t0;
  const k = (i: number) => {
    const s = STEPS[i];
    const r = ease(t / s);
    t -= s;
    return r;
  };
  const over = k(0);
  const x0 = run.fromX + (run.x - run.fromX) * over;
  const z0 = run.fromZ + (run.z - run.fromZ) * over;
  if (t < 0) return { x: x0, z: z0, down: 0, shut: 0, carrying: false, done: false };
  const down = k(1);
  if (t < 0) return { x: run.x, z: run.z, down, shut: 0, carrying: false, done: false };
  const shut = k(2);
  if (t < 0) return { x: run.x, z: run.z, down: 1, shut, carrying: false, done: false };
  const won = !!run.won;
  // A miss: the prongs slip half open on the way up.
  const up = k(3);
  if (t < 0)
    return {
      x: run.x,
      z: run.z,
      down: 1 - up,
      shut: won ? 1 : 1 - up * 0.6,
      carrying: won,
      done: false,
    };
  const back = k(4);
  const x = run.x + (CLAW_HOME.x - run.x) * back;
  const z = run.z + (CLAW_HOME.z - run.z) * back;
  if (t < 0) return { x, z, down: 0, shut: won ? 1 : 0.4, carrying: won, done: false };
  const open = k(5);
  return {
    x: CLAW_HOME.x,
    z: CLAW_HOME.z,
    down: 0,
    shut: (won ? 1 : 0.4) * (1 - open),
    carrying: won && t < 0,
    done: t >= 0,
  };
}

/** Where the claw hangs in shop `shop`'s machine now: a drop playing out, the aim of whoever plays, or home. */
export function clawNow(shop: number, now: number): ClawPose {
  const run = clawRuns.get(shop);
  if (run && now - run.t0 < CLAW_RUN_SECONDS + 0.1) return clawPose(run, now);
  const aim = clawAimAt.get(shop) ?? CLAW_HOME;
  return { x: aim.x, z: aim.z, down: 0, shut: 0, carrying: false, done: true };
}

import { EXERCISES, MAX_TARGET, MIN_TARGET, comfyWeight, simulateSet, validWeight, type Exercise, type StrengthView } from '../../shared/gym-strength.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * A strength station (flrnoh fork, see shared/gym-strength.ts): a bench, a rack, a machine or the
 * heavy bag. Whoever's on it picks a weight and a target number of reps (`set`, data: {weight,
 * target}); the office grinds the set out rep by rep, spends the energy it costs, banks the volume
 * as fitness points, and everyone sees the lifter work through it for a moment.
 */
export class StrengthStation implements GymGame {
  readonly kind = 'strength' as const;
  readonly seats = 1;
  private player: Seated | null = null;
  private weight: number;
  private working = false;
  private until = 0;
  private last: StrengthView['last'];
  private bestVolume = 0;
  private ex: Exercise;

  constructor(
    readonly id: string,
    readonly machine: string,
  ) {
    this.ex = EXERCISES[machine] ?? EXERCISES.bench;
    this.weight = comfyWeight(this.ex, 1);
  }

  private prKey() {
    return `vol:${this.machine}`;
  }

  sit(p: Seated, ctx: GymContext) {
    this.player = p;
    this.weight = comfyWeight(this.ex, ctx.level(p.owner));
    this.bestVolume = ctx.pr(p.owner, this.prKey());
    this.last = undefined;
    ctx.changed();
  }

  stand(owner: string, ctx: GymContext) {
    if (this.player?.owner !== owner) return;
    this.player = null;
    this.working = false;
    ctx.changed();
  }

  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void {
    if (this.player?.owner !== p.owner) return 'Step onto the station first';
    if (action === 'weight') {
      const w = (data as { weight?: unknown })?.weight;
      if (!validWeight(this.ex, w)) return `Weights go up in ${this.ex.step} ${this.ex.unit}`;
      this.weight = w;
      ctx.changed();
      return;
    }
    if (action !== 'set') return 'Load the bar and go for a set';
    if (this.working) return 'Finish this set first';
    const d = (data ?? {}) as { weight?: unknown; target?: unknown };
    if (!validWeight(this.ex, d.weight)) return `Weights go up in ${this.ex.step} ${this.ex.unit}`;
    const target = d.target;
    if (typeof target !== 'number' || !Number.isInteger(target) || target < MIN_TARGET || target > MAX_TARGET) return `Aim for ${MIN_TARGET}–${MAX_TARGET} reps`;
    if (ctx.stamina(p.owner) < 3) return "You're spent — recover in the wellness area";
    this.weight = d.weight;
    const res = simulateSet({ exercise: this.ex, weight: d.weight, target, level: ctx.level(p.owner), stamina: ctx.stamina(p.owner) }, ctx.random);
    ctx.addStamina(p.owner, -res.staminaSpent);
    if (res.xp) ctx.award(p.owner, res.xp, { volume: res.volume, reps: res.reps });
    ctx.countWorkout(p.owner);
    if (res.volume > this.bestVolume) {
      this.bestVolume = res.volume;
      ctx.setPr(p.owner, this.prKey(), res.volume);
    }
    this.last = { reps: res.reps, target: res.target, weight: res.weight, volume: res.volume, xp: res.xp, failed: res.failed };
    this.working = true;
    this.until = ctx.now() + Math.max(700, Math.min(3500, res.form.length * 340));
    const hit = res.reps >= res.target;
    const said = res.reps === 0 ? `couldn't lift ${res.weight} ${this.ex.unit}` : `${res.reps}${hit ? '' : `/${res.target}`} ${res.reps === 1 ? 'rep' : 'reps'} at ${res.weight} ${this.ex.unit}${hit ? ' ✅' : res.failed ? ' — form broke' : ''}`;
    ctx.result(p.owner, `${this.ex.icon} ${said}`, res.xp, res);
    ctx.changed();
  }

  tick(now: number, ctx: GymContext) {
    if (this.working && now >= this.until) {
      this.working = false;
      ctx.changed();
    }
  }

  view(): StrengthView {
    return {
      kind: 'strength',
      machine: this.machine,
      ...(this.player ? { player: this.player.name } : {}),
      weight: this.weight,
      working: this.working,
      ...(this.working ? { until: this.until } : {}),
      ...(this.last ? { last: this.last } : {}),
      ...(this.bestVolume ? { bestVolume: this.bestVolume } : {}),
    };
  }
}

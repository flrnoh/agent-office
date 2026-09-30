import { CARDIO_MACHINES, cardioStep, isIntensity, XP_PER_CALORIE, type CardioSession, type CardioView, type Intensity } from '../../shared/gym-cardio.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * A cardio machine (flrnoh fork, see shared/gym-cardio.ts): a treadmill, a bike, a rower or the
 * cross-trainer. You `start` a session and set how hard to go; the office runs it on its clock
 * (tick), piling up distance and calories and spending energy the harder you push, and turns the
 * calories into fitness points as you go. `stop`, standing up or leaving banks the session.
 */
export class CardioMachine implements GymGame {
  readonly kind = 'cardio' as const;
  readonly seats = 1;
  private player: Seated | null = null;
  private running = false;
  private session: CardioSession = { intensity: 'steady', meters: 0, calories: 0, secs: 0 };
  private lastTick = 0;
  private speed = 0;
  /** Fractional XP not yet whole, and whole XP banked this session (for the toast). */
  private xpAccum = 0;
  private sessionXp = 0;
  private m: (typeof CARDIO_MACHINES)[string];

  constructor(
    readonly id: string,
    readonly machine: string,
  ) {
    this.m = CARDIO_MACHINES[machine] ?? CARDIO_MACHINES.treadmill;
  }

  private reset() {
    this.running = false;
    this.session = { intensity: 'steady', meters: 0, calories: 0, secs: 0 };
    this.speed = 0;
    this.xpAccum = 0;
    this.sessionXp = 0;
  }

  sit(p: Seated, ctx: GymContext) {
    this.player = p;
    this.reset();
    ctx.changed();
  }

  stand(owner: string, ctx: GymContext) {
    if (this.player?.owner !== owner) return;
    this.bank(owner, ctx);
    this.player = null;
    ctx.changed();
  }

  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void {
    if (this.player?.owner !== p.owner) return 'Step onto the machine first';
    const intensity = (data as { intensity?: unknown })?.intensity;
    if (action === 'start') {
      if (this.running) return;
      this.reset();
      this.running = true;
      if (isIntensity(intensity)) this.session.intensity = intensity;
      this.lastTick = ctx.now();
      ctx.changed();
      return;
    }
    if (action === 'set') {
      if (!isIntensity(intensity)) return 'Pick a pace';
      this.session.intensity = intensity;
      ctx.changed();
      return;
    }
    if (action === 'stop') {
      if (!this.running) return;
      this.bank(p.owner, ctx);
      ctx.changed();
      return;
    }
    return 'Start a session first';
  }

  /** Ends the session and banks the distance, the calories and the last of the XP. */
  private bank(owner: string, ctx: GymContext) {
    if (!this.running) return;
    this.running = false;
    this.speed = 0;
    const s = this.session;
    const rem = Math.floor(this.xpAccum);
    this.xpAccum -= rem;
    this.sessionXp += rem;
    ctx.award(owner, rem, { meters: Math.round(s.meters), calories: Math.round(s.calories) });
    if (s.secs >= 5 && s.meters >= 5) {
      ctx.countWorkout(owner);
      const dist = s.meters >= 1000 ? `${(s.meters / 1000).toFixed(2)} km` : `${Math.round(s.meters)} m`;
      ctx.result(owner, `${this.m.icon} ${this.m.verb} ${dist} · ${Math.round(s.calories)} kcal`, this.sessionXp);
    }
    this.session = { intensity: s.intensity, meters: 0, calories: 0, secs: 0 };
    this.sessionXp = 0;
  }

  tick(now: number, ctx: GymContext) {
    if (!this.running || !this.player) return;
    const dt = Math.max(0, Math.min(1.5, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (dt <= 0) return;
    const before = this.session.calories;
    const step = cardioStep(this.session, dt, ctx.stamina(this.player.owner), this.m);
    this.session = step.session;
    this.speed = step.speed;
    if (step.staminaSpent) ctx.addStamina(this.player.owner, -step.staminaSpent);
    this.xpAccum += (this.session.calories - before) * XP_PER_CALORIE;
    const whole = Math.floor(this.xpAccum);
    if (whole > 0) {
      this.xpAccum -= whole;
      this.sessionXp += whole;
      ctx.award(this.player.owner, whole);
    }
    ctx.changed();
  }

  view(): CardioView {
    return {
      kind: 'cardio',
      machine: this.machine,
      ...(this.player ? { player: this.player.name } : {}),
      running: this.running,
      intensity: this.session.intensity,
      meters: Math.round(this.session.meters),
      calories: Math.round(this.session.calories),
      secs: Math.round(this.session.secs),
      speed: Math.round(this.speed * 100) / 100,
    };
  }
}

import { ACTION_STAMINA, ACTION_XP, WELLNESS_SPOTS, type WellnessView } from '../../shared/gym-wellness.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * A wellness spot (flrnoh fork, see shared/gym-wellness.ts): the sauna, the steam room, the jacuzzi,
 * the cold plunge, a massage lounger or the stretch studio. Several people share the bigger ones.
 * Just being in one gives your energy back over time and earns a trickle of recovery XP; the cold
 * plunge hits you with a bracing burst the moment you get in; and where it makes sense you can pour
 * water on the stones or flow through a pose (`ladle` / `pose`) for a little more and a puff of steam.
 */
export class WellnessSpot implements GymGame {
  readonly kind = 'wellness' as const;
  private occ = new Map<string, { name: string; secs: number; xpAccum: number }>();
  private lastTick = 0;
  private puffAt = 0;
  private spot: (typeof WELLNESS_SPOTS)[string];

  constructor(
    readonly id: string,
    readonly machine: string,
    readonly seats: number,
  ) {
    this.spot = WELLNESS_SPOTS[machine] ?? WELLNESS_SPOTS.sauna;
  }

  sit(p: Seated, ctx: GymContext) {
    if (this.occ.has(p.owner)) return;
    this.occ.set(p.owner, { name: p.name, secs: 0, xpAccum: 0 });
    if (this.spot.coldBurst) {
      ctx.addStamina(p.owner, this.spot.coldBurst);
      ctx.result(p.owner, `${this.spot.icon} Brrr! +${this.spot.coldBurst} energy`, undefined);
    }
    if (this.lastTick === 0) this.lastTick = ctx.now();
    ctx.changed();
  }

  stand(owner: string, ctx: GymContext) {
    const o = this.occ.get(owner);
    if (!o) return;
    this.occ.delete(owner);
    const xp = Math.floor(o.xpAccum);
    ctx.award(owner, xp, { relaxSecs: Math.round(o.secs) });
    ctx.changed();
  }

  act(p: Seated, action: string, _data: unknown, ctx: GymContext): string | void {
    if (!this.occ.has(p.owner)) return 'Step in first';
    if (!this.spot.action || action !== this.spot.action) return this.spot.action === 'pose' ? 'Hold a pose to earn a little more' : 'Nothing to do but relax';
    ctx.award(p.owner, ACTION_XP);
    ctx.addStamina(p.owner, ACTION_STAMINA);
    this.puffAt = ctx.now();
    ctx.result(p.owner, this.spot.action === 'pose' ? `${this.spot.icon} Nice stretch · +${ACTION_XP} XP` : `${this.spot.icon} Löyly! +${ACTION_XP} XP`, ACTION_XP);
    ctx.changed();
  }

  tick(now: number, ctx: GymContext) {
    if (!this.occ.size) return;
    const dt = Math.max(0, Math.min(2, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (dt <= 0) return;
    for (const [owner, o] of this.occ) {
      ctx.addStamina(owner, this.spot.regenPerSec * dt);
      o.secs += dt;
      o.xpAccum += (this.spot.xpPerMin / 60) * dt;
      const whole = Math.floor(o.xpAccum);
      if (whole > 0) {
        o.xpAccum -= whole;
        ctx.award(owner, whole);
      }
    }
  }

  view(): WellnessView {
    return {
      kind: 'wellness',
      machine: this.machine,
      occupants: [...this.occ.values()].map((o) => o.name),
      seats: this.seats,
      ...(this.puffAt ? { puffAt: this.puffAt } : {}),
    };
  }
}

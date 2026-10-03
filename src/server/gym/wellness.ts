import { ACTION_STAMINA, ACTION_XP, WELLNESS_SPOTS, type WellnessView } from '../../shared/gym-wellness.js';
import { AUFGUSS_BOOST_MS, WALK_IN_BY_STATION, aufgussWait, isSoak, onBenchIn, walkInFactor, type AnyWalkIn } from '../../shared/gym-rooms.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * A wellness spot (flrnoh fork, see shared/gym-wellness.ts): the sauna, the steam room, the jacuzzi,
 * the cold plunge, a massage lounger or the stretch studio. Several people share the bigger ones.
 * Just being in one gives your energy back over time and earns a trickle of recovery XP; the cold
 * plunge hits you with a bracing burst the moment you get in; and where it makes sense you can pour
 * water on the stones or flow through a pose (`ladle` / `pose`) for a little more and a puff of steam.
 *
 * The sauna and the steam room are walk-in rooms (shared/gym-rooms.ts): the gym puts you on them
 * while you stand inside (by where the office last saw you, see Gym.moved), not by gym.sit. Sitting on
 * one of their benches recovers a bit faster, and a ladle of water on the stones there is an Aufguss
 * for the whole room: a wave of heat that lifts everyone's recovery inside for a while, and one per
 * room every AUFGUSS_COOLDOWN_MS, whoever pours.
 */
export class WellnessSpot implements GymGame {
  readonly kind = 'wellness' as const;
  private occ = new Map<string, { name: string; secs: number; xpAccum: number }>();
  private lastTick = 0;
  private puffAt = 0;
  private puffBy = '';
  private spot: (typeof WELLNESS_SPOTS)[string];
  /** The cabin, for the sauna and the steam room: you walk in instead of sitting down. */
  readonly room: AnyWalkIn | undefined;
  /** Fork: the jacuzzi, the plunge, a massage table: who's in which of its places (soakPlace), '' for empty. */
  private slots: string[] | null;

  constructor(
    readonly id: string,
    readonly machine: string,
    readonly seats: number,
  ) {
    this.spot = WELLNESS_SPOTS[machine] ?? WELLNESS_SPOTS.sauna;
    this.room = WALK_IN_BY_STATION.get(id);
    this.slots = isSoak(id) ? Array.from({ length: seats }, () => '') : null;
  }

  sit(p: Seated, ctx: GymContext) {
    if (this.occ.has(p.owner)) return;
    this.occ.set(p.owner, { name: p.name, secs: 0, xpAccum: 0 });
    // Into the first free place (the office checks there is one before it asks).
    if (this.slots) {
      const free = this.slots.indexOf('');
      if (free >= 0) this.slots[free] = p.name;
    }
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
    if (this.slots) {
      const at = this.slots.indexOf(o.name);
      if (at >= 0) this.slots[at] = '';
    }
    const xp = Math.floor(o.xpAccum);
    ctx.award(owner, xp, { relaxSecs: Math.round(o.secs) });
    ctx.changed();
  }

  act(p: Seated, action: string, _data: unknown, ctx: GymContext): string | void {
    if (!this.occ.has(p.owner)) return 'Step in first';
    if (!this.spot.action || action !== this.spot.action) return this.spot.action === 'pose' ? 'Hold a pose to earn a little more' : 'Nothing to do but relax';
    if (this.room) return this.aufguss(p, ctx);
    ctx.award(p.owner, ACTION_XP);
    ctx.addStamina(p.owner, ACTION_STAMINA);
    this.puffAt = ctx.now();
    ctx.result(p.owner, this.spot.action === 'pose' ? `${this.spot.icon} Nice stretch · +${ACTION_XP} XP` : `${this.spot.icon} Löyly! +${ACTION_XP} XP`, ACTION_XP);
    ctx.changed();
  }

  /** A ladle of water on the stones (or a burst of eucalyptus steam): everyone in the room gets the heat. */
  private aufguss(p: Seated, ctx: GymContext): string | void {
    const now = ctx.now();
    const wait = aufgussWait(this.puffAt, now);
    if (wait > 0) return `The stones are still hissing · next Aufguss in ${Math.ceil(wait / 1000)} s`;
    this.puffAt = now;
    this.puffBy = p.name;
    ctx.award(p.owner, ACTION_XP);
    const secs = Math.round(AUFGUSS_BOOST_MS / 1000);
    const what = this.room!.machine === 'sauna' ? 'Aufguss' : this.room!.machine === 'salt' ? 'salt mist' : 'Eucalyptus burst'; // fork: the basement's salt grotto
    for (const owner of this.occ.keys()) {
      ctx.addStamina(owner, ACTION_STAMINA);
      if (owner === p.owner) ctx.result(owner, `${this.spot.icon} ${what}! Löyly for everyone · +${ACTION_XP} XP · ${secs} s of extra heat`, ACTION_XP, { aufguss: true });
      else ctx.result(owner, `${this.spot.icon} ${p.name} poured an ${what} · ${secs} s of extra heat`, undefined, { aufguss: true });
    }
    ctx.changed();
  }

  tick(now: number, ctx: GymContext) {
    if (!this.occ.size) return;
    const dt = Math.max(0, Math.min(2, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (dt <= 0) return;
    for (const [owner, o] of this.occ) {
      // In a walk-in room: a little faster on a bench, and more in an Aufguss's heat.
      const k = this.room ? walkInFactor(onBenchIn(this.room, ctx.seatKey(owner)), this.puffAt, now) : 1;
      ctx.addStamina(owner, this.spot.regenPerSec * k * dt);
      o.secs += dt;
      o.xpAccum += (this.spot.xpPerMin / 60) * k * dt;
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
      ...(this.puffBy ? { puffBy: this.puffBy } : {}),
      ...(this.room ? { walkIn: true } : {}),
      ...(this.slots ? { slots: [...this.slots] } : {}),
    };
  }
}

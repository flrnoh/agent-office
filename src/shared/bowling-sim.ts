// A ball down a lane and the pins it meets (flrnoh fork, see FORK.md "Bowling lanes"): a small rigid
// body simulation in the lane's own frame (shared/bowling-game.ts: u across, d down the lane), on
// the lane's plane. Fixed steps and nothing but + - * / and square roots, so the office (which counts
// the pins) and every page in the centre (which plays the ball back) get the very same pins from the
// same throw: no trigonometry, no random numbers, no clock.
//
// The ball skids, hooks and rolls: it carries a contact velocity `c` (how its surface moves where it
// touches the lane, from its spin). The slip, ball velocity plus contact velocity, is what friction
// works on: it slows the ball and spins it up until it rolls (slip 0). Side spin is slip across the
// lane: friction turns it into the hook. The first 40 feet are oiled (little friction: it skids), the
// back end dry (it grabs and hooks). Over a lane edge it drops into the gutter.
//
// A pin stands, falls, lies or is gone (into the pit). Standing it's a disc of its belly's width;
// falling or lying it's a capsule from its base to its head, swept round as it topples, so a falling
// pin knocks its neighbours down ("pin action"). Hit hard enough a pin falls the way it's knocked;
// a nudge only wobbles it. The kickbacks beside the deck throw pins back across it.

import { BALL_RADIUS, DECK_D, GUTTER, LANE_HALF, OIL_D, PIN_BELLY, PIN_COUNT, PIN_HEIGHT, PIN_MASS, PIN_SPOTS, PIT_D, ballKg, ballSpeed, slideEnd, type StandingPin, type ThrowParams } from './bowling-game.js';

export const SIM_HZ = 300;
export const SIM_DT = 1 / SIM_HZ;
const G = 9.81;
/** How fast side spin skids the ball across at full hook (m/s at its contact point). */
const SPIN_C = 1.8;
/** How far the ball rolls rather than skids as it leaves the hand. */
const ROLL_START = 0.1;
const MU_OIL = 0.012;
const MU_DRY = 0.3;
/** Slowing down once it rolls (m/s²). */
const ROLLING = 0.09;
const PIN_R = PIN_BELLY;
/** A falling or lying pin's thickness. */
const PIN_BODY = 0.052;
/** The pin's head stands this high (its length when it lies). */
const PIN_LEN = PIN_HEIGHT - 0.02;
/** How hard a pin must be hit (m/s it's given) to go over; less, it wobbles. */
const KNOCK = 0.6;
const E_BALL = 0.5;
const E_PIN = 0.5;
const E_KICK = 0.55;
/** Where the kickbacks stand: the pin deck's sides, past the gutters. */
const KICKBACK = LANE_HALF + GUTTER - 0.02;
/** Give up waiting for everything to settle after this long. */
const MAX_SECS = 9;

/** Where a pin is at: standing, going over, lying, or gone into the pit. */
export const PinState = { Standing: 0, Falling: 1, Down: 2, Gone: 3 } as const;
export type PinState = (typeof PinState)[keyof typeof PinState];

export interface SimPin {
  n: number;
  u: number;
  d: number;
  vu: number;
  vd: number;
  state: PinState;
  /** How far it's gone over (0 standing, 1 flat), and how fast. */
  s: number;
  sv: number;
  /** Which way it's falling or lies (unit, from its base to its head). */
  du: number;
  dd: number;
  /** A lying pin spins round as it slides (rad/s). */
  spin: number;
  /** A nudged pin wobbles (how far it rocks, eased off), for the eye only. */
  wob: number;
}

export interface SimBall {
  u: number;
  d: number;
  vu: number;
  vd: number;
  cu: number;
  cd: number;
  kg: number;
  gutter: boolean;
  /** In the pit, or stopped on the lane. */
  done: boolean;
  /** How far it's turned (rad), for the eye: rolling distance over radius. */
  turn: number;
}

/** What happened in a step, for the sounds. */
export type SimEvent = { k: 'pin'; u: number; d: number; s: number } | { k: 'down'; n: number; u: number; d: number } | { k: 'gutter'; u: number; d: number } | { k: 'pit'; u: number; d: number } | { k: 'pinpit'; u: number; d: number } | { k: 'kick'; u: number; d: number };

/** A smooth stand-in for sin(s·π/2) (0 at 0, 1 at 1): how far out the head is as a pin goes over. */
export const lean = (s: number) => s * (1.5 - 0.5 * s * s);
const leanRate = (s: number) => 1.5 - 1.5 * s * s;

export class BowlSim {
  readonly ball: SimBall;
  readonly pins: SimPin[];
  readonly foul: boolean;
  t = 0;
  /** Steps everything's been still for. */
  private still = 0;
  done = false;
  events: SimEvent[] = [];
  /** The ball's in among the pins (reached the deck). */
  reached = false;

  constructor(params: ThrowParams, lbs: number, standing: readonly StandingPin[]) {
    const speed = ballSpeed(params.power, lbs);
    const n = Math.sqrt(1 + params.line * params.line);
    const vu = (speed * params.line) / n;
    const vd = speed / n;
    const end = slideEnd(params.back, params.power);
    this.foul = end > 0;
    // Over the outside of the slide foot, a hand's width short of it.
    const d0 = end - 0.12;
    // Side spin across the line of the ball, toward +u for a hook to the left.
    const pu = vd / speed;
    const pd = -vu / speed;
    this.ball = {
      u: params.u,
      d: d0,
      vu,
      vd,
      cu: -ROLL_START * vu + params.spin * SPIN_C * pu,
      cd: -ROLL_START * vd + params.spin * SPIN_C * pd,
      kg: ballKg(lbs),
      gutter: false,
      done: false,
      turn: 0,
    };
    this.pins = standing.map((p) => ({ n: p.n, u: p.u, d: p.d, vu: 0, vd: 0, state: PinState.Standing, s: 0, sv: 0, du: 0, dd: 1, spin: 0, wob: 0 }));
  }

  /** One step of SIM_DT. The step's events are in `events`. */
  step(): void {
    this.events = [];
    if (this.done) return;
    this.t += SIM_DT;
    this.stepBall();
    for (const p of this.pins) this.stepPin(p);
    this.collide();
    // Settled: the ball's gone, nothing moves.
    const moving = !this.ball.done || this.pins.some((p) => p.state === PinState.Falling || (p.state !== PinState.Gone && p.vu * p.vu + p.vd * p.vd > 0.0009));
    this.still = moving ? 0 : this.still + 1;
    if (this.still > SIM_HZ * 0.25 || this.t > MAX_SECS) this.done = true;
  }

  private stepBall() {
    const b = this.ball;
    if (b.done) return;
    const dt = SIM_DT;
    if (b.gutter) {
      // Down the channel, slowing a little, nowhere near the pins.
      const sp = Math.sqrt(b.vd * b.vd);
      const slow = Math.max(0, sp - 0.25 * dt) / Math.max(sp, 1e-9);
      b.vd *= slow;
      b.d += b.vd * dt;
      b.turn += (b.vd * dt) / BALL_RADIUS;
      if (b.d > PIT_D + BALL_RADIUS) this.toPit();
      return;
    }
    // Friction on the slip: oiled up front, dry in the back end (a metre to go from one to the other).
    const dry = Math.min(1, Math.max(0, (b.d - OIL_D) / 1.2));
    const mu = MU_OIL + (MU_DRY - MU_OIL) * dry;
    const su = b.vu + b.cu;
    const sd = b.vd + b.cd;
    const slip = Math.sqrt(su * su + sd * sd);
    const a = mu * G * dt;
    if (slip > 1e-6) {
      if (3.5 * a >= slip) {
        // It grabs: rolling from here on.
        b.vu -= su / 3.5;
        b.vd -= sd / 3.5;
        b.cu = -b.vu;
        b.cd = -b.vd;
      } else {
        const fu = (-a * su) / slip;
        const fd = (-a * sd) / slip;
        b.vu += fu;
        b.vd += fd;
        b.cu += 2.5 * fu;
        b.cd += 2.5 * fd;
      }
    }
    // Rolling resistance.
    const sp = Math.sqrt(b.vu * b.vu + b.vd * b.vd);
    if (sp > 1e-9) {
      const k = Math.max(0, sp - ROLLING * dt) / sp;
      b.vu *= k;
      b.vd *= k;
      b.cu *= k;
      b.cd *= k;
    }
    b.u += b.vu * dt;
    b.d += b.vd * dt;
    b.turn += (sp * dt) / BALL_RADIUS;
    if (Math.abs(b.u) > LANE_HALF && b.d < PIT_D) {
      // Over the edge: into the gutter, rolling on straight down it.
      b.gutter = true;
      b.u = b.u > 0 ? LANE_HALF + GUTTER * 0.42 : -(LANE_HALF + GUTTER * 0.42);
      b.vu = 0;
      this.events.push({ k: 'gutter', u: b.u, d: b.d });
    } else if (b.d > PIT_D + BALL_RADIUS * 0.5) this.toPit();
    else if (sp < 0.05) b.done = true; // a ball that died on the lane (the sweep takes it)
    if (b.d > DECK_D - 0.4) this.reached = true;
  }

  private toPit() {
    const b = this.ball;
    b.done = true;
    this.events.push({ k: 'pit', u: b.u, d: b.d });
  }

  private stepPin(p: SimPin) {
    if (p.state === PinState.Gone) return;
    const dt = SIM_DT;
    if (p.state === PinState.Falling) {
      // Over it goes, faster and faster.
      p.sv += 38 * (p.s + 0.06) * dt;
      p.s += p.sv * dt;
      if (p.s >= 1) {
        p.s = 1;
        p.state = PinState.Down;
        p.sv = 0;
        this.events.push({ k: 'down', n: p.n, u: p.u, d: p.d });
      }
    }
    if (p.state === PinState.Down && p.spin !== 0) {
      // Spinning round as it slides: the axis turns (a small rotation, kept unit length).
      const w = p.spin * dt;
      const du = p.du - p.dd * w;
      const dd = p.dd + p.du * w;
      const l = Math.sqrt(du * du + dd * dd);
      p.du = du / l;
      p.dd = dd / l;
      p.spin *= Math.max(0, 1 - 2.2 * dt);
    }
    const sp = Math.sqrt(p.vu * p.vu + p.vd * p.vd);
    if (sp > 1e-9) {
      const mu = p.state === PinState.Standing ? 0.55 : p.state === PinState.Falling ? 0.2 : 0.38;
      const k = Math.max(0, sp - mu * G * dt) / sp;
      p.vu *= k;
      p.vd *= k;
    }
    p.u += p.vu * dt;
    p.d += p.vd * dt;
    p.wob *= Math.max(0, 1 - 3 * dt);
    if (p.d > PIT_D + 0.02) {
      p.state = PinState.Gone;
      this.events.push({ k: 'pinpit', u: p.u, d: p.d });
      return;
    }
    if (Math.abs(p.u) > LANE_HALF + 0.015 && p.state === PinState.Standing) this.knock(p, p.u > 0 ? 1 : -1, 0, 1.5); // off the deck's edge
    if (Math.abs(p.u) > KICKBACK) {
      // Off the kickback and back across the deck.
      p.u = p.u > 0 ? KICKBACK : -KICKBACK;
      if (p.u * p.vu > 0) {
        if (Math.abs(p.vu) > 0.4) this.events.push({ k: 'kick', u: p.u, d: p.d });
        p.vu = -p.vu * E_KICK;
      }
    }
    if (p.d < DECK_D - 3) {
      p.d = DECK_D - 3;
      p.vd = Math.max(0, p.vd);
    }
  }

  /** Over it goes, the way (`du`, `dd`) points, starting at `rate`. */
  private knock(p: SimPin, du: number, dd: number, rate: number) {
    if (p.state !== PinState.Standing) return;
    const l = Math.sqrt(du * du + dd * dd);
    if (l < 1e-9) return;
    p.state = PinState.Falling;
    p.du = du / l;
    p.dd = dd / l;
    p.sv = Math.min(7, Math.max(0.8, rate));
  }

  /** Where a pin's body is for a collision: a disc standing, else a capsule from its base to its head. */
  private shape(p: SimPin) {
    if (p.state === PinState.Standing) return { au: p.u, ad: p.d, bu: p.u, bd: p.d, r: PIN_R };
    const reach = PIN_LEN * lean(p.s);
    return { au: p.u, ad: p.d, bu: p.u + p.du * reach, bd: p.d + p.dd * reach, r: PIN_BODY };
  }

  private collide() {
    const b = this.ball;
    const live = this.pins.filter((p) => p.state !== PinState.Gone);
    if (!b.done && !b.gutter && b.d > DECK_D - 1) for (const p of live) this.ballPin(b, p);
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const p = live[i];
        const q = live[j];
        const du = q.u - p.u;
        const dd = q.d - p.d;
        if (du * du + dd * dd > (PIN_LEN + 0.15) * (PIN_LEN + 0.15)) continue;
        if (p.state !== PinState.Standing && q.state !== PinState.Standing) continue; // two lying pins pass over each other
        this.pinPin(p, q);
      }
  }

  private ballPin(b: SimBall, p: SimPin) {
    const s = this.shape(p);
    const [cu, cd, t] = closest(s.au, s.ad, s.bu, s.bd, b.u, b.d);
    const nu0 = cu - b.u;
    const nd0 = cd - b.d;
    const dist = Math.sqrt(nu0 * nu0 + nd0 * nd0);
    const reach = BALL_RADIUS + s.r;
    if (dist >= reach || dist < 1e-9) return;
    const nu = nu0 / dist;
    const nd = nd0 / dist;
    const [pu, pd] = this.pointVel(p, t);
    const rel = (pu - b.vu) * nu + (pd - b.vd) * nd;
    const imB = 1 / b.kg;
    const imP = 1 / PIN_MASS;
    // Apart first (the pin takes most of it).
    const push = reach - dist;
    b.u -= nu * push * (imB / (imB + imP));
    b.d -= nd * push * (imB / (imB + imP));
    p.u += nu * push * (imP / (imB + imP));
    p.d += nd * push * (imP / (imB + imP));
    if (rel >= 0) return;
    const j = (-(1 + E_BALL) * rel) / (imB + imP);
    b.vu -= j * imB * nu;
    b.vd -= j * imB * nd;
    this.hit(p, j * imP, nu, nd, (b.vu - pu) * -nd + (b.vd - pd) * nu);
  }

  private pinPin(p: SimPin, q: SimPin) {
    const a = this.shape(p);
    const c = this.shape(q);
    let pu: number, pd: number, qu: number, qd: number, tp = 0, tq = 0;
    if (p.state === PinState.Standing) {
      [qu, qd, tq] = closest(c.au, c.ad, c.bu, c.bd, p.u, p.d);
      pu = p.u;
      pd = p.d;
    } else {
      [pu, pd, tp] = closest(a.au, a.ad, a.bu, a.bd, q.u, q.d);
      qu = q.u;
      qd = q.d;
    }
    const nu0 = qu - pu;
    const nd0 = qd - pd;
    const dist = Math.sqrt(nu0 * nu0 + nd0 * nd0);
    const reach = a.r + c.r;
    if (dist >= reach || dist < 1e-9) return;
    const nu = nu0 / dist;
    const nd = nd0 / dist;
    const push = (reach - dist) / 2;
    p.u -= nu * push;
    p.d -= nd * push;
    q.u += nu * push;
    q.d += nd * push;
    const [vpu, vpd] = this.pointVel(p, tp);
    const [vqu, vqd] = this.pointVel(q, tq);
    const rel = (vqu - vpu) * nu + (vqd - vpd) * nd;
    if (rel >= 0) return;
    const j = (-(1 + E_PIN) * rel) / (2 / PIN_MASS);
    const tang = (vpu - vqu) * -nd + (vpd - vqd) * nu;
    this.hit(q, j / PIN_MASS, nu, nd, tang);
    this.hit(p, j / PIN_MASS, -nu, -nd, -tang);
  }

  /** How fast a pin's body moves at `t` along it (0 its base, 1 its head): a falling pin's head swings out. */
  private pointVel(p: SimPin, t: number): [number, number] {
    if (p.state !== PinState.Falling || t <= 0) return [p.vu, p.vd];
    const swing = PIN_LEN * leanRate(p.s) * p.sv * t;
    return [p.vu + p.du * swing, p.vd + p.dd * swing];
  }

  /** `p` is given `dv` (m/s) along (`nu`, `nd`): it slides off, and goes over if it's hard enough. */
  private hit(p: SimPin, dv: number, nu: number, nd: number, tangent: number) {
    p.vu += dv * nu;
    p.vd += dv * nd;
    if (dv > 0.15) this.events.push({ k: 'pin', u: p.u, d: p.d, s: dv });
    if (p.state === PinState.Standing) {
      if (dv > KNOCK) this.knock(p, p.vu + nu * 0.5, p.vd + nd * 0.5, 1 + dv * 1.6);
      else p.wob = Math.min(1, p.wob + dv * 3);
    }
    // A glancing blow sets a pin spinning as it goes.
    p.spin += Math.max(-25, Math.min(25, tangent * 6));
  }

  /** Runs on to the end. */
  run(): this {
    while (!this.done) this.step();
    return this;
  }

  /** Pins still standing at the end (or now), where they stand. */
  standing(): StandingPin[] {
    return this.pins.filter((p) => p.state === PinState.Standing && Math.abs(p.u) <= LANE_HALF + 0.015).map((p) => ({ n: p.n, u: round(p.u), d: round(p.d) }));
  }
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/** The point on segment a–b closest to (pu, pd), and how far along it is (0–1). */
function closest(au: number, ad: number, bu: number, bd: number, pu: number, pd: number): [number, number, number] {
  const eu = bu - au;
  const ed = bd - ad;
  const len = eu * eu + ed * ed;
  if (len < 1e-12) return [au, ad, 0];
  const t = Math.max(0, Math.min(1, ((pu - au) * eu + (pd - ad) * ed) / len));
  return [au + eu * t, ad + ed * t, t];
}

/** A full rack, every pin on its spot. */
export const fullRack = (): StandingPin[] => PIN_SPOTS.map((s, n) => ({ n, u: s.u, d: s.d }));

/** The outcome of a throw at `pins` (what's standing), the way the office counts it. */
export function bowl(params: ThrowParams, lbs: number, pins: readonly StandingPin[]): { standing: StandingPin[]; knocked: number; foul: boolean; secs: number; gutter: boolean } {
  const sim = new BowlSim(params, lbs, pins).run();
  const standing = sim.standing();
  return { standing, knocked: pins.length - standing.length, foul: sim.foul, secs: Math.round(sim.t * 1000) / 1000, gutter: sim.ball.gutter };
}

/** Bit n set for each pin n standing. */
export const maskOf = (pins: readonly StandingPin[]) => pins.reduce((m, p) => m | (1 << p.n), 0);

export { PIN_COUNT };

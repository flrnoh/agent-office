import {
  type Ball,
  type Footer,
  type KickSpec,
  type Possession,
  SIM_DT,
  ballFromWire,
  centreBall,
  cushion,
  kick,
  mayTake,
  stepBall,
  touchBall,
} from '../../shared/soccer-ball';
import type { BallWire } from '../../shared/soccer';

/*
 * The soccer hall's ball on this page (flrnoh fork, see FORK.md "The soccer hall"). Two ways of showing it:
 *
 * - Played back (everyone else's ball): the office sends it ~15 times a second with the physics step
 *   it's from (`k`); this page shows it INTERP_MS behind the office's clock, between the two snapshots
 *   either side (a curve through their positions and speeds), and runs the same physics on from the
 *   newest one for up to EXTRAP_MS when the next is late.
 * - Predicted (yours): right after your kick, and while you dribble it, this page runs the ball itself,
 *   in the very same SIM_DT steps as the office (shared/soccer-ball.ts: the same kick, the same touches,
 *   the same physics), so it goes the moment you kick and stays at your feet as you run. The office's
 *   snapshots still come: after a kick each is run on by the line's round trip and the ball eased
 *   toward it (a big difference, somebody else touched it: it goes there); while you dribble, only
 *   someone else having it takes it off you.
 *
 * Switching between the two, and any correction, is kept as an offset that melts away over a few frames
 * rather than the ball jumping; only a big one (a kickoff, a reconnect) snaps.
 */

/** Further off than this (m), the ball just goes where it is. */
const SNAP = 2.5;
/** How fast a correction melts away (per second). */
const MELT = 10;
/** Played back this far behind the office's clock (ms), and run on past the newest snapshot at most this long. */
export const INTERP_MS = 100;
export const EXTRAP_MS = 250;
/** After your kick, this page runs the ball itself for this long (ms), then plays back the office's again. */
const LOCAL_MS = 900;
/** After taking the ball on this page, how long the office may take to agree (ms) before it's given up. */
const CLAIM_MS = 450;
/** Snapshots kept (about 1.5 s). */
const KEEP = 24;

interface Snap {
  /** On the office's clock (ms). */
  t: number;
  b: Ball;
}

const copy = (b: Ball): Ball => ({ x: b.x, z: b.z, y: b.y, vx: b.vx, vz: b.vz, vy: b.vy });

export class BallView {
  /** Where the ball is on this page: predicted, or played back. */
  readonly b: Ball = centreBall();
  /** What's shown: `b` plus the correction still melting. */
  readonly shown = { x: this.b.x, y: this.b.y, z: this.b.z };
  private off = { x: 0, y: 0, z: 0 };
  private snaps: Snap[] = [];
  /** This page's clock (performance.now) minus the office's, as low as seen (the line's delay in it). */
  private clockOff: number | null = null;
  /** Who the office says is dribbling it. */
  controller: string | null = null;
  /** Predicted: until when (ms), and whether you're dribbling it here. */
  private localUntil = 0;
  readonly poss: Possession = { id: null };
  private claimedAt = 0;
  private acc = 0;
  private prev: Ball = centreBall();
  /** The round trip to the office (s), measured by your kicks coming back. */
  rtt = 0.1;
  private kickSentAt = 0;

  /** Whether this page is running the ball itself right now. */
  get predicting(): boolean {
    return this.poss.id !== null || performance.now() < this.localUntil;
  }

  /** A snapshot from the office: the ball `w` at its step `k`, `c` dribbling it; `mine` when it's your own kick coming back. */
  snapshot(w: BallWire, k: number | undefined, c: string | undefined, mine = false, now = performance.now()) {
    const b = ballFromWire(w);
    const t = (k ?? 0) * SIM_DT * 1000;
    const last = this.snaps.at(-1);
    // The office started over (a restart): forget what was.
    if (last && t < last.t - 1000) {
      this.snaps = [];
      this.clockOff = null;
    }
    const o = now - t;
    this.clockOff = this.clockOff === null || o < this.clockOff ? o : this.clockOff + (o - this.clockOff) * 0.02;
    if (!last || t > last.t) this.snaps.push({ t, b });
    else if (t === last.t) last.b = b;
    if (this.snaps.length > KEEP) this.snaps.shift();
    this.controller = c ?? null;
    // Your kick never came back (the office said no): after a while the office's ball is played back again.
    if (this.kickSentAt && now - this.kickSentAt > LOCAL_MS) this.kickSentAt = 0;
    if (mine && this.kickSentAt) {
      const rtt = Math.min(0.5, Math.max(0.02, (now - this.kickSentAt) / 1000));
      this.rtt += (rtt - this.rtt) * 0.5;
      this.kickSentAt = 0;
    }
    if (!this.predicting) return;
    if (this.poss.id) {
      // You're dribbling it here: the office has it off you only when somebody else has it (or it's far off: a kickoff).
      const other = this.controller && this.controller !== this.poss.id;
      const late = !this.controller && now - this.claimedAt > CLAIM_MS;
      if (other || late || Math.hypot(b.x - this.b.x, b.z - this.b.z) > SNAP + 1) this.release(now);
      return;
    }
    // Flying after your kick: the office's ball, run on by the round trip, is where this one should be
    // (once the office has had the kick: the snapshots before it still show the ball at your feet).
    if (this.kickSentAt) return;
    const ahead = copy(b);
    let steps = Math.round(this.rtt / SIM_DT);
    while (steps-- > 0) stepBall(ahead, SIM_DT);
    const d = Math.hypot(ahead.x - this.b.x, ahead.z - this.b.z, ahead.y - this.b.y);
    const w8 = d > 1.5 ? 1 : 0.3;
    this.nudge(ahead, w8);
    if (this.controller) this.localUntil = 0;
  }

  /** Moves the predicted ball `w` of the way to `to` (position and speed), the difference melting away on screen. */
  private nudge(to: Ball, w: number) {
    const before = { x: this.shown.x, y: this.shown.y, z: this.shown.z };
    this.b.x += (to.x - this.b.x) * w;
    this.b.z += (to.z - this.b.z) * w;
    this.b.y += (to.y - this.b.y) * w;
    this.b.vx += (to.vx - this.b.vx) * w;
    this.b.vz += (to.vz - this.b.vz) * w;
    this.b.vy += (to.vy - this.b.vy) * w;
    Object.assign(this.prev, this.b);
    this.keep(before);
  }

  /** Keeps what's shown where it was, as an offset to melt (unless it's far off). */
  private keep(before: { x: number; y: number; z: number }) {
    const ox = before.x - this.b.x;
    const oy = before.y - this.b.y;
    const oz = before.z - this.b.z;
    this.off = Math.hypot(ox, oy, oz) > SNAP ? { x: 0, y: 0, z: 0 } : { x: ox, y: oy, z: oz };
    this.show(1);
  }

  /** Your own kick, before the office has it: the ball goes at once, predicted from here. */
  kick(k: KickSpec, now = performance.now()) {
    this.startLocal();
    this.poss.id = null;
    kick(this.b, k.power, k.dir, k.loft, k.lift);
    Object.assign(this.prev, this.b);
    this.localUntil = now + LOCAL_MS;
    this.kickSentAt = now;
  }

  /** Whether `me` could take the ball here now (see update: it's taken on this page at once). */
  canTake(me: Footer): boolean {
    return mayTake(this.b, me);
  }

  /** You take the ball on this page (a first touch), before the office agrees. */
  claim(me: Footer, now = performance.now()) {
    this.startLocal();
    this.poss.id = me.id;
    this.claimedAt = now;
    cushion(this.b, me);
    Object.assign(this.prev, this.b);
  }

  /** Back to playing the office's ball back. */
  release(now = performance.now()) {
    const before = { x: this.shown.x, y: this.shown.y, z: this.shown.z };
    this.poss.id = null;
    this.localUntil = 0;
    this.played(now);
    this.keep(before);
  }

  private startLocal() {
    if (this.predicting) return;
    this.acc = 0;
    Object.assign(this.prev, this.b);
  }

  /**
   * On by `dt` seconds. `me` is you on the pitch (for dribbling here), when you may touch the ball.
   * Returns how far it moved along the floor (for rolling it).
   */
  update(dt: number, me: Footer | null, now = performance.now()): { dx: number; dz: number } {
    const x0 = this.shown.x;
    const z0 = this.shown.z;
    let frac = 1;
    if (this.predicting) {
      if (this.poss.id && (!me || me.id !== this.poss.id)) this.release(now);
    }
    if (this.predicting) {
      this.acc = Math.min(this.acc + Math.min(dt, 0.1), 0.2);
      while (this.acc >= SIM_DT - 1e-9) {
        this.acc -= SIM_DT;
        Object.assign(this.prev, this.b);
        if (this.poss.id && me) {
          touchBall(this.b, [me], this.poss, SIM_DT);
          // Lost it here (it ran away from you): it rolls on a moment, then the office's again.
          if (!this.poss.id) this.localUntil = now + 300;
        }
        stepBall(this.b, SIM_DT);
      }
      frac = this.acc / SIM_DT;
      if (!this.predicting) this.release(now);
    } else {
      this.played(now);
    }
    const k = Math.exp(-dt * MELT);
    this.off.x *= k;
    this.off.y *= k;
    this.off.z *= k;
    this.show(frac);
    return { dx: this.shown.x - x0, dz: this.shown.z - z0 };
  }

  /** Played back: the office's ball INTERP_MS behind its clock, between the snapshots either side, or run on from the newest. */
  private played(now: number) {
    const s = this.snaps;
    if (!s.length || this.clockOff === null) return;
    const t = now - this.clockOff - INTERP_MS;
    let i = s.length - 1;
    while (i > 0 && s[i].t > t) i--;
    const a = s[i];
    const n = s[i + 1];
    if (n && t >= a.t) {
      // Between two: a curve through both positions with their speeds (the ball's own path, near enough).
      const span = (n.t - a.t) / 1000;
      const u = Math.min(1, Math.max(0, (t - a.t) / (n.t - a.t)));
      // A bounce or a board in between bends the path: straight between them then.
      const bent = Math.hypot(n.b.vx - a.b.vx, n.b.vz - a.b.vz, n.b.vy - a.b.vy) > 4;
      for (const key of ['x', 'z', 'y'] as const) {
        const vk = key === 'x' ? 'vx' : key === 'z' ? 'vz' : 'vy';
        const p0 = a.b[key];
        const p1 = n.b[key];
        if (bent) this.b[key] = p0 + (p1 - p0) * u;
        else {
          const m0 = a.b[vk] * span;
          const m1 = n.b[vk] * span;
          const u2 = u * u;
          const u3 = u2 * u;
          this.b[key] = (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
        }
        this.b[vk] = a.b[vk] + (n.b[vk] - a.b[vk]) * u;
      }
      this.b.y = Math.max(0, this.b.y);
    } else {
      // Past the newest (or before the oldest): the newest, run on a little.
      Object.assign(this.b, a.b);
      const ahead = Math.min(EXTRAP_MS, Math.max(0, t - a.t)) / 1000;
      let steps = Math.floor(ahead / SIM_DT);
      while (steps-- > 0) stepBall(this.b, SIM_DT);
    }
    Object.assign(this.prev, this.b);
  }

  private show(frac: number) {
    const p = this.prev;
    const b = this.b;
    this.shown.x = p.x + (b.x - p.x) * frac + this.off.x;
    this.shown.y = Math.max(0, p.y + (b.y - p.y) * frac + this.off.y);
    this.shown.z = p.z + (b.z - p.z) * frac + this.off.z;
  }
}

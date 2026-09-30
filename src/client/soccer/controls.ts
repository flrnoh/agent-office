/*
 * The soccer hall's kick button (flrnoh fork, see FORK.md "The soccer hall"), without the page round it
 * so the tests can time it: a tap passes, a hold charges a shot (full after CHARGE_MS), and a kick let
 * go of while the ball's still coming waits for it (BUFFER_MS), or goes a moment after it's gone by.
 */

/** Let go sooner than this (ms), it's a pass; held longer, a shot. */
export const TAP_MS = 180;
/** Held this long (ms), a shot's at full power. */
export const CHARGE_MS = 900;
/** A kick let go of this long (ms) before the ball's in reach waits for it; this long after it was, it still goes. */
export const BUFFER_MS = 200;

/** A kick let go of: a lob (the right button), a shot (held) or a pass (tapped), how charged, and until when it waits for the ball. */
export interface KickIntent {
  lob: boolean;
  shot: boolean;
  charge: number;
  until: number;
}

export class KickButton {
  /** Held down: since when, a lob, and by what (a mouse button, a key), so only that one lets go of it. */
  press: { t0: number; lob: boolean; by: string } | null = null;
  pending: KickIntent | null = null;

  /** Pressed at `t` (ms). False when one's already held. */
  down(t: number, lob: boolean, by: string): boolean {
    if (this.press) return false;
    this.press = { t0: t, lob, by };
    return true;
  }

  /** Let go at `t`: the kick it makes waits in `pending` (see fire). Null when `by` wasn't what held it. */
  up(t: number, by: string): KickIntent | null {
    const p = this.press;
    if (!p || p.by !== by) return null;
    this.press = null;
    const held = t - p.t0;
    this.pending = { lob: p.lob, shot: held >= TAP_MS, charge: Math.min(1, Math.max(0, held / CHARGE_MS)), until: t + BUFFER_MS };
    return this.pending;
  }

  /** How charged the held kick is at `t` (0..1). */
  charge(t: number): number {
    return this.press ? Math.min(1, Math.max(0, (t - this.press.t0) / CHARGE_MS)) : 0;
  }

  /** Whether it's been held long enough at `t` to be a shot (the meter shows). */
  charging(t: number): boolean {
    return !!this.press && t - this.press.t0 >= TAP_MS;
  }

  /**
   * The waiting kick, if it goes now (at `t`): when the ball's in reach now, or was at `reachAt` no more
   * than BUFFER_MS ago. Dropped once it's waited too long, or when kicking isn't `allowed`.
   */
  fire(t: number, inReach: boolean, reachAt: number, allowed = true): KickIntent | null {
    const k = this.pending;
    if (!k) return null;
    if (t > k.until || !allowed) {
      this.pending = null;
      return null;
    }
    if (!inReach && t - reachAt > BUFFER_MS) return null;
    this.pending = null;
    return k;
  }

  cancel() {
    this.press = null;
    this.pending = null;
  }
}

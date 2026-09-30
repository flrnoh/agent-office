import { COOLDOWN_MS, NO_BUNGEE, bungeeDay, bungeeDuration, type BungeeState } from '../shared/bungee.js';
import { roofDrop } from '../shared/layout.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';

/*
 * Bungee off the roof (flrnoh fork, see FORK.md; the jump itself is shared/bungee.ts). The office keeps
 * who's on the rope and since when, one at a time, and counts the day's jumps. Every browser on the
 * roof works out the fall from `startedAt` and `drop`, so it only says so once, when someone jumps.
 */

export class BungeeRope {
  private on: BungeeState = { ...NO_BUNGEE };
  /** When each person's last jump is over (ms), for the cooldown. */
  private doneAt = new Map<string, number>();
  private day = '';
  private count = 0;

  constructor(private now: () => number = Date.now) {}

  /** Jumps since midnight on the office's clock. */
  today(): number {
    const d = bungeeDay(this.now());
    if (d !== this.day) {
      this.day = d;
      this.count = 0;
    }
    return this.count;
  }

  /** The rope as everyone on the roof sees it: nobody on it once the last jump's over. */
  state(): BungeeState {
    const today = this.today();
    if (this.on.jumper && this.now() >= this.on.startedAt + bungeeDuration(this.on.drop) * 1000) this.on = { ...NO_BUNGEE };
    return { ...this.on, today };
  }

  /** `id` jumps off a roof `drop` meters over the street: refused while someone's on the rope, or too soon after their last. */
  jump(p: { id: string; name: string; color: string }, drop: number): { ok: true; state: BungeeState } | { error: string } {
    const now = this.now();
    const cur = this.state();
    if (cur.jumper === p.id) return { error: "You're already on the rope" };
    if (cur.jumper) return { error: `Someone's on the rope — ${cur.name} is jumping` };
    const done = this.doneAt.get(p.id) ?? 0;
    if (now < done + COOLDOWN_MS) return { error: 'Catch your breath first — a few seconds' };
    const today = this.today() + 1;
    this.count = today;
    this.on = { jumper: p.id, name: p.name.slice(0, 32), color: p.color.slice(0, 16), startedAt: now, drop, today };
    this.doneAt.set(p.id, now + bungeeDuration(drop) * 1000);
    if (this.doneAt.size > 500) for (const [id, at] of this.doneAt) if (at + COOLDOWN_MS < now) this.doneAt.delete(id);
    return { ok: true, state: { ...this.on } };
  }

  /** `id` left the roof or the office: off the rope (true when they were on it). */
  leave(id: string): boolean {
    if (this.on.jumper !== id) return false;
    this.on = { ...NO_BUNGEE };
    return true;
  }
}

export interface BungeeHooks {
  id: string;
  who: string;
  color: string;
  onRoof: boolean;
  /** How many floors the roof stands on: the street is roofDrop of that below. */
  floors: number;
  toRoof(msg: ServerMsg): void;
  warn(text: string): void;
}

/** bungee.jump from someone's page: only from up on the roof, one on the rope at a time. */
export function bungeeMessage(rope: BungeeRope, _msg: Extract<ClientMsg, { t: 'bungee.jump' }>, c: BungeeHooks) {
  if (!c.onRoof) return c.warn('The bungee jetty is up on the roof');
  const r = rope.jump({ id: c.id, name: c.who, color: c.color }, roofDrop(Math.max(1, c.floors)));
  if ('error' in r) return c.warn(r.error);
  c.toRoof({ t: 'bungee', state: r.state });
}

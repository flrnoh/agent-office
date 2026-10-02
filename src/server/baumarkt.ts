import { onBaumarkt } from '../shared/baumarkt.js';
import {
  CORRAL,
  FORK_TUNING,
  LIFT_MAX,
  MIX_MS,
  PAINTS,
  TOOL_BY_ID,
  TROLLEY_COUNT,
  corralSlot,
  forkPoseOk,
  freshBaumarkt,
  isHeldId,
  liftStep,
  paintOf,
  type BaumarktClientMsg,
  type BaumarktServerMsg,
  type BaumarktState,
  type HeldId,
  type ToolId,
} from '../shared/baumarkt-play.js';

// HAMMER & CO, the DIY store on each floor's street (flrnoh fork, see FORK.md "The Baumarkt"): who's on
// the forklift and where its driver says it is, the pallets it lifts and sets down (worked out here,
// from where the forks go: shared/baumarkt-play.ts liftStep), who pushes which trolley, what everyone
// holds, and the paint shaker. In memory: everything's back in its place after a restart.

/** How often one person's tool goes off, at most (ms), and the forklift's horn. */
const USE_EVERY = 220;
const HORN_EVERY = 500;
/** Letting go of a trolley this close to the corral parks it back in its slot. */
const CORRAL_REACH = 3.2;

/** Where someone is on the street (their last `move`). */
export type Where = () => { x: number; z: number } | undefined;

/** One floor's Baumarkt. */
export class Baumarkt {
  private s: BaumarktState = freshBaumarkt();
  private used = new Map<string, number>();
  private mixed = new Map<string, number>();
  private mixingUntil = 0;
  private horned = 0;

  constructor(private now = () => Date.now()) {}

  state(): BaumarktState {
    const s = this.s;
    return { fork: { ...s.fork }, pallets: s.pallets.map((p) => ({ ...p })), trolleys: s.trolleys.map((t) => ({ ...t })), held: { ...s.held } };
  }

  /** `id` gets on the forklift, if nobody's on it (and lets go of any trolley). */
  forkEnter(id: string): boolean {
    if (this.s.fork.driver) return false;
    this.trolleyLet(id);
    this.s.fork.driver = id;
    return true;
  }

  /** `id` gets off: the forklift stops where it is, whatever's on its forks stays up there. */
  forkLeave(id: string): boolean {
    const f = this.s.fork;
    if (f.driver !== id) return false;
    Object.assign(f, { driver: null, speed: 0, steer: 0 });
    return true;
  }

  /** The driver says where the forklift has got to and how high its forks are: what the office has now, or nothing (not theirs, off the area). */
  forkDrive(id: string, p: { x: number; z: number; rotY: number; speed: number; steer: number; lift: number }) {
    const f = this.s.fork;
    if (f.driver !== id || !forkPoseOk(p)) return undefined;
    const before = f.lift;
    Object.assign(f, {
      x: p.x,
      z: p.z,
      rotY: Math.atan2(Math.sin(p.rotY), Math.cos(p.rotY)),
      speed: Math.min(FORK_TUNING.top, Math.max(-FORK_TUNING.reverse, p.speed)),
      steer: Math.min(FORK_TUNING.steer, Math.max(-FORK_TUNING.steer, p.steer)),
      lift: Math.min(LIFT_MAX, Math.max(0, p.lift)),
    });
    const was = f.carrying;
    f.carrying = liftStep(f, before, f.lift, f.carrying, this.s.pallets);
    return { pose: { x: f.x, z: f.z, rotY: f.rotY, speed: f.speed, steer: f.steer, lift: f.lift, carrying: f.carrying }, changed: was !== f.carrying };
  }

  forkHorn(id: string): boolean {
    const now = this.now();
    if (this.s.fork.driver !== id || now - this.horned < HORN_EVERY) return false;
    this.horned = now;
    return true;
  }

  /** `id` takes trolley `i`, if nobody has it (and lets go of any other). */
  trolleyGrab(id: string, i: number): boolean {
    const t = this.s.trolleys[i];
    if (!t || t.by || this.s.fork.driver === id) return false;
    this.trolleyLet(id);
    t.by = id;
    return true;
  }

  trolleyPush(id: string, i: number, p: { x: number; z: number; rotY: number }): boolean {
    const t = this.s.trolleys[i];
    if (!t || t.by !== id || ![p.x, p.z, p.rotY].every(Number.isFinite) || !onBaumarkt(p.x, p.z, 1)) return false;
    Object.assign(t, { x: p.x, z: p.z, rotY: Math.atan2(Math.sin(p.rotY), Math.cos(p.rotY)) });
    return true;
  }

  /** `id` lets go of their trolley: where it is, or back in its slot when it's by the corral. */
  trolleyLet(id: string): boolean {
    const i = this.s.trolleys.findIndex((t) => t.by === id);
    if (i < 0) return false;
    const t = this.s.trolleys[i];
    t.by = null;
    if (Math.hypot(t.x - CORRAL.x, t.z - CORRAL.z) < CORRAL_REACH) Object.assign(t, corralSlot(i));
    return true;
  }

  /** `id` takes `item` in hand (null puts it back): a tool when they're here, a can only of the paint they mixed. */
  hold(id: string, item: unknown, where: Where): HeldId | null | undefined {
    if (item === null) {
      if (!this.s.held[id]) return undefined;
      delete this.s.held[id];
      return null;
    }
    if (!isHeldId(item)) return undefined;
    const at = where();
    if (!at || !onBaumarkt(at.x, at.z, 2)) return undefined;
    const paint = paintOf(item);
    if (paint >= 0 && this.mixed.get(id) !== paint) return undefined;
    if (this.s.held[id] === item) return undefined;
    this.s.held[id] = item;
    return item;
  }

  /** `id` uses what's in their hand (a tool), unless they only just did. */
  use(id: string): HeldId | undefined {
    const item = this.s.held[id];
    if (!item || !TOOL_BY_ID.has(item as ToolId)) return undefined;
    const now = this.now();
    if (now - (this.used.get(id) ?? -Infinity) < USE_EVERY) return undefined;
    this.used.set(id, now);
    return item;
  }

  /** `id` puts a can of `paint` in the shaker: only here, and only while it's not shaking someone else's. */
  mix(id: string, paint: unknown, where: Where): number | undefined {
    if (typeof paint !== 'number' || !Number.isInteger(paint) || paint < 0 || paint >= PAINTS.length) return undefined;
    const at = where();
    const now = this.now();
    if (!at || !onBaumarkt(at.x, at.z, 2) || now < this.mixingUntil) return undefined;
    this.mixingUntil = now + MIX_MS - 200;
    this.mixed.set(id, paint);
    return paint;
  }

  /** `id` left the floor (or the office): off the forklift, their trolley let go, what they held put back. Whether anything changed. */
  leave(id: string): boolean {
    const off = this.forkLeave(id);
    const let_ = this.trolleyLet(id);
    const held = !!this.s.held[id];
    delete this.s.held[id];
    this.used.delete(id);
    this.mixed.delete(id);
    return off || let_ || held;
  }
}

/** Every floor's Baumarkt, made when someone first uses it. */
export class Baumaerkte {
  private byFloor = new Map<string, Baumarkt>();

  constructor(private now = () => Date.now()) {}

  of(floorId: string): Baumarkt {
    let b = this.byFloor.get(floorId);
    if (!b) this.byFloor.set(floorId, (b = new Baumarkt(this.now)));
    return b;
  }

  view(floorId: string | undefined): BaumarktState | undefined {
    if (!floorId) return undefined;
    return this.byFloor.get(floorId)?.state() ?? freshBaumarkt();
  }

  leave(floorId: string | undefined, id: string): boolean {
    return !!floorId && !!this.byFloor.get(floorId)?.leave(id);
  }
}

export interface BaumarktDeps {
  id: string;
  floor: string | undefined;
  where: Where;
  send(m: BaumarktServerMsg): void;
  /** To everyone else on their floor; `droppable` for the many moves. */
  toNeighbors(m: BaumarktServerMsg, droppable?: boolean): void;
}

const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : -1);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** A bm.* message from someone's page. */
export function baumarktMessage(all: Baumaerkte, msg: BaumarktClientMsg, d: BaumarktDeps) {
  if (!d.floor) return;
  const b = all.of(d.floor);
  const everyone = (m: BaumarktServerMsg) => {
    d.send(m);
    d.toNeighbors(m);
  };
  /** A change of who has what: everyone else hears it all, and they hear back either way. */
  const answer = (changed: boolean) => {
    if (changed) d.toNeighbors({ t: 'baumarkt', state: b.state() });
    d.send({ t: 'baumarkt', state: b.state(), answer: true });
  };
  switch (msg.t) {
    case 'bm.fork.enter':
      return answer(b.forkEnter(d.id));
    case 'bm.fork.leave':
      return answer(b.forkLeave(d.id));
    case 'bm.fork.drive': {
      const r = b.forkDrive(d.id, { x: num(msg.x), z: num(msg.z), rotY: num(msg.rotY), speed: num(msg.speed), steer: num(msg.steer), lift: num(msg.lift) });
      if (!r) return;
      // A pallet picked up or set down goes to everyone, the driver too (their page agrees, or learns).
      if (r.changed) everyone({ t: 'baumarkt', state: b.state() });
      else d.toNeighbors({ t: 'bm.fork', ...r.pose }, true);
      return;
    }
    case 'bm.fork.horn':
      if (b.forkHorn(d.id)) d.toNeighbors({ t: 'bm.fork.horn' });
      return;
    case 'bm.trolley.grab':
      return answer(int(msg.i) < TROLLEY_COUNT && b.trolleyGrab(d.id, int(msg.i)));
    case 'bm.trolley.let':
      return answer(b.trolleyLet(d.id));
    case 'bm.trolley.push': {
      const i = int(msg.i);
      const p = { x: num(msg.x), z: num(msg.z), rotY: num(msg.rotY) };
      if (b.trolleyPush(d.id, i, p)) d.toNeighbors({ t: 'bm.trolley', i, ...p }, true);
      return;
    }
    case 'bm.hold': {
      const item = b.hold(d.id, msg.item, d.where);
      if (item !== undefined) everyone({ t: 'bm.held', id: d.id, item });
      return;
    }
    case 'bm.use': {
      const item = b.use(d.id);
      if (item) d.toNeighbors({ t: 'bm.used', id: d.id, item });
      return;
    }
    case 'bm.mix': {
      const paint = b.mix(d.id, msg.paint, d.where);
      if (paint !== undefined) everyone({ t: 'bm.mixing', id: d.id, paint });
      return;
    }
  }
}

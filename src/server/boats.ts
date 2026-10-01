import { CRAFTS, moored, specOf, type BoatClientMsg, type BoatServerMsg, type CraftState } from '../shared/boats.js';
import { onWater } from '../shared/beach.js';
import type { CarPose } from '../shared/garage.js';

// The jetskis and the motorboat at each floor's jetty (flrnoh fork, see FORK.md "A day at the beach"):
// who's in which seat, and where its driver last said it is. Like the garage (garage.ts), each
// driver's page drives its own craft and the office passes it on. Nothing is saved: when the office
// restarts, everything's back at its mooring.

/** How often one person can sound a horn, at most (ms). */
const HORN_EVERY = 400;

/** One floor's jetty. */
export class Marina {
  private crafts = moored();
  private horned = new Map<string, number>();

  constructor(private now = () => Date.now()) {}

  /** Every craft as it is now, for the floor's pages. */
  state(): CraftState[] {
    return this.crafts.map((c) => ({ ...c, riders: [...c.riders] }));
  }

  /** The craft `id` is in, and which seat. */
  seatOf(id: string): { craft: number; seat: number } | undefined {
    for (let i = 0; i < this.crafts.length; i++) {
      const seat = this.crafts[i].riders.indexOf(id);
      if (seat >= 0) return { craft: i, seat };
    }
    return undefined;
  }

  /** `id` gets into `seat` of craft `craft`, out of wherever they were: only if it's free. Says whether anything changed. */
  enter(id: string, craft: number, seat: number): boolean {
    const c = this.crafts[craft];
    if (!c || !Number.isInteger(seat) || seat < 0 || seat >= c.riders.length || c.riders[seat]) return false;
    this.leave(id);
    c.riders[seat] = id;
    return true;
  }

  /** `id` gets out (or left the floor, or the office). A craft nobody's driving drifts to a stop where it is. Says whether they were in one. */
  leave(id: string): boolean {
    this.horned.delete(id);
    const at = this.seatOf(id);
    if (!at) return false;
    const c = this.crafts[at.craft];
    c.riders[at.seat] = null;
    if (at.seat === 0) Object.assign(c, { speed: 0, steer: 0 });
    return true;
  }

  /** The driver of craft `craft` says where it's got to: where the office has it now, to pass on. Nothing from anyone else, or from off the water. */
  drive(id: string, craft: number, pose: CarPose): CarPose | undefined {
    const c = this.crafts[craft];
    const spec = specOf(craft);
    if (!c || !spec || c.riders[0] !== id) return undefined;
    const { x, z, rotY, speed, steer } = pose;
    if (![x, z, rotY, speed, steer].every(Number.isFinite) || !onWater(x, z)) return undefined;
    const t = spec.tuning;
    Object.assign(c, {
      x,
      z,
      rotY: Math.atan2(Math.sin(rotY), Math.cos(rotY)),
      speed: Math.min(t.top, Math.max(-t.reverse, speed)),
      steer: Math.min(t.steer, Math.max(-t.steer, steer)),
    });
    return { x: c.x, z: c.z, rotY: c.rotY, speed: c.speed, steer: c.steer };
  }

  /** `id` sounds the horn of the craft they're in, unless they only just did. */
  horn(id: string): number | undefined {
    const at = this.seatOf(id);
    if (!at) return undefined;
    const now = this.now();
    if (now - (this.horned.get(id) ?? -Infinity) < HORN_EVERY) return undefined;
    this.horned.set(id, now);
    return at.craft;
  }
}

/** Every floor's jetty, made when someone first uses it. */
export class Marinas {
  private byFloor = new Map<string, Marina>();

  constructor(private now = () => Date.now()) {}

  of(floorId: string): Marina {
    let m = this.byFloor.get(floorId);
    if (!m) this.byFloor.set(floorId, (m = new Marina(this.now)));
    return m;
  }

  /** What a floor's jetty looks like, for someone arriving on it (moored, if nobody's been out yet). */
  view(floorId: string | undefined): CraftState[] | undefined {
    if (!floorId) return undefined;
    return this.byFloor.get(floorId)?.state() ?? moored();
  }

  /** `id` is gone from floor `floorId` (left it, or the office): out of any craft there. Whether they were in one. */
  leave(floorId: string | undefined, id: string): boolean {
    return !!floorId && !!this.byFloor.get(floorId)?.leave(id);
  }
}

export interface BoatDeps {
  id: string;
  /** The floor they're on (a project floor; not the roof or a place across the street). */
  floor: string | undefined;
  send(m: BoatServerMsg): void;
  /** To everyone else on their floor; `droppable` for the many moves. */
  toNeighbors(m: BoatServerMsg, droppable?: boolean): void;
}

const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : -1);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

/** A boat.* message from someone's page. */
export function boatMessage(marinas: Marinas, msg: BoatClientMsg, d: BoatDeps) {
  if (!d.floor) return;
  const marina = marinas.of(d.floor);
  switch (msg.t) {
    case 'boat.enter':
    case 'boat.leave': {
      const changed = msg.t === 'boat.enter' ? int(msg.craft) < CRAFTS.length && marina.enter(d.id, int(msg.craft), int(msg.seat)) : marina.leave(d.id);
      // They hear back either way: someone who didn't get in learns who did.
      if (changed) d.toNeighbors({ t: 'boats', boats: marina.state() });
      d.send({ t: 'boats', boats: marina.state(), answer: true });
      return;
    }
    case 'boat.drive': {
      const craft = int(msg.craft);
      const now = marina.drive(d.id, craft, { x: num(msg.x), z: num(msg.z), rotY: num(msg.rotY), speed: num(msg.speed), steer: num(msg.steer) });
      if (now) d.toNeighbors({ t: 'boat.move', craft, ...now }, true);
      return;
    }
    case 'boat.horn': {
      const craft = marina.horn(d.id);
      if (craft !== undefined) d.toNeighbors({ t: 'boat.horn', craft });
      return;
    }
  }
}

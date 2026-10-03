/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): everyone else riding a city bus, as your
 * page draws them. The office keeps where in which bus each is (`PeerInfo.bus`, shared/busride.ts) and
 * the bus is where the office's clock has it on every page, so they're put right where they stand or
 * sit in it, this very frame, rather than a step behind it as following their `move`s would.
 * features/peers asks `aboardBus` for each of them every frame.
 */
import { BUS_RUNS, poseOf, type BusPose } from '../../../shared/citybus';
import { FLOOR_Y, SEATS, SEAT_HIPS } from '../../../shared/buscabin';
import type { PeerInfo } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import type { Person } from '../../world/character';

let streetY = () => 0;
const pose: BusPose = { x: 0, z: 0, yaw: 0, s: 0, doors: 0, stop: -1, speed: 0 };
/** Who we've sat down in a bus, so we stand them up again once they're off it. */
const seated = new Set<string>();

/** Where in the world (x, z) in bus `run`'s own frame is, as it is now in `p`. */
export function busWorld(p: BusPose, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/**
 * Where `peer` is in the bus they ride, this frame (their feet, which way they face, whether they sit),
 * or undefined if they're on no bus; sits `person` down in a seat or stands them up as they go.
 */
export function aboardBus(id: string, peer: PeerInfo, person: Person): { x: number; y: number; z: number; rotY: number; seated: boolean } | undefined {
  const ride = peer.bus;
  const run = ride && BUS_RUNS[ride.run];
  if (!ride || !run) {
    if (seated.delete(id)) person.sit(null);
    return undefined;
  }
  poseOf(run, store.officeNow() / 1000, pose);
  const seat = ride.seat !== undefined ? SEATS[ride.seat] : undefined;
  const [x, z] = busWorld(pose, seat ? seat.x + 0.02 : ride.x, seat ? seat.z : ride.z);
  if (seat) {
    seated.add(id);
    person.sit(SEAT_HIPS);
  } else if (seated.delete(id)) person.sit(null);
  return { x, y: streetY() + FLOOR_Y, z, rotY: pose.yaw + (seat ? seat.rotY : ride.r), seated: !!seat };
}

/** Keeps everyone's `bus` up to date and knows where the street is (installCityBus). */
export function followRiders(ctx: Ctx) {
  streetY = () => ctx.player.street;
  ctx.messages.on('bus.rode', (msg) => {
    const p = store.peers.get(msg.id);
    if (!p) return;
    if (msg.ride) p.bus = msg.ride;
    else delete p.bus;
  });
}

/** The seats someone else sits in, in bus `run`. */
export function takenSeats(run: number): Set<number> {
  const out = new Set<number>();
  for (const p of store.peers.values()) if (p.id !== store.you && p.bus?.run === run && p.bus.seat !== undefined && store.onMyFloor(p)) out.add(p.bus.seat);
  return out;
}

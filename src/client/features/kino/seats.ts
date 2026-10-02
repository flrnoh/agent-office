import { KINO_SEATS, SEAT_BY_KEY, type KinoSeat } from '../../../shared/kino-plan';
import type { SeatPlace } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Kino } from '../../world/kino';
import type { Interactable } from '../../world/types';

// The cinema's seats (flrnoh fork, see FORK.md "The cinema"): E at one sits you down in it, facing the
// screen; walking off gets you up. Nobody tells the office: like the swimmers at the beach, every page
// works out who sits where from where they are (still, right on a seat's spot), and sits them down.

declare module '../../world/types' {
  interface InteractKinds {
    kinoseat: true;
  }
}

/** How close to a seat's spot someone must be standing still to be sitting in it. */
const ON_SEAT = 0.22;

export function kinoSeats(ctx: Ctx, parts: Pick<Parts, 'peers'>, kino: () => Kino) {
  /** Whose body sits in which seat now (by peer id), so it's stood up again once they've gone. */
  const sitting = new Map<string, Person>();

  /** The seat someone at (x, y, z) is sitting in, if they're right on one's spot. */
  function seatAt(x: number, y: number, z: number): KinoSeat | undefined {
    const street = ctx.player.street;
    return KINO_SEATS.find((s) => Math.abs(s.x - x) < ON_SEAT && Math.abs(s.z - z) < ON_SEAT && Math.abs(street + s.y - y) < 0.3);
  }

  /** Whether someone else on the floor is in it. */
  function taken(s: KinoSeat): boolean {
    const street = ctx.player.street;
    for (const p of store.peers.values()) {
      if (p.id === store.you || !store.onMyFloor(p) || p.moving) continue;
      if (Math.abs(s.x - p.x) < ON_SEAT && Math.abs(s.z - p.z) < ON_SEAT && Math.abs(street + s.y - p.y) < 0.3) return true;
    }
    return false;
  }

  function placeOf(s: KinoSeat): SeatPlace {
    return { key: s.key, seatId: s.key, x: s.x, y: ctx.player.street + s.y, z: s.z, rotY: s.rotY, hips: s.hips, out: s.out };
  }

  const label = (s: KinoSeat) => `💺 Saal ${s.hall} · Reihe ${s.row}, Platz ${s.key.split('s').pop()}`;

  ctx.interactions.define('kinoseat', {
    reach: 3,
    hint: (it) => {
      const s = SEAT_BY_KEY.get(it.seatId ?? '');
      if (!s) return { k: '', parts: [] };
      if (ctx.player.seat?.seatId === s.key) return { k: `${s.key}|sitting`, parts: [hintTitle(label(s)), aside('enjoy the film'), key('W A S D', 'Get up')] };
      const full = taken(s);
      return { k: `${s.key}|${full}`, parts: [hintTitle(label(s)), full ? aside('taken') : key('E', 'Sit down')] };
    },
    use: onE((it) => {
      const s = SEAT_BY_KEY.get(it.seatId ?? '');
      if (!s) return;
      if (ctx.player.seat?.seatId === s.key) {
        ctx.player.stand();
        ctx.player.onStand?.();
        return;
      }
      if (taken(s)) return toast('Somebody’s sitting there', 'warn');
      ctx.player.sit(placeOf(s));
      ctx.me.sit(s.hips);
    }),
  });

  /** The seats' interactables, at the street's height on this floor, and the ones within reach of you. */
  const near: Interactable[] = [];
  function nearSeats(): Interactable[] {
    near.length = 0;
    const p = ctx.player.pos;
    const street = ctx.player.street;
    for (const s of KINO_SEATS) {
      if (Math.abs(s.x - p.x) > 3 || Math.abs(s.z - p.z) > 3) continue;
      const it = kino().seats.get(s.key)!;
      it.y = street + s.y;
      near.push(it);
    }
    return near;
  }

  /** Each frame near the cinema: everyone else on a seat's spot sits down in it, and gets up once they're off it. */
  function poseOthers(here: boolean) {
    const remotes = parts.peers.remotes;
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      const s = here && p && !p.moving && !p.seat ? seatAt(p.x, p.y, p.z) : undefined;
      if (s) {
        r.person.sit(s.hips);
        r.person.root.rotation.y = s.rotY;
        sitting.set(id, r.person);
      } else if (sitting.has(id)) {
        sitting.get(id)!.sit(null);
        sitting.delete(id);
      }
    }
    for (const [id, person] of sitting) {
      if (!remotes.has(id)) {
        person.sit(null);
        sitting.delete(id);
      }
    }
  }

  return { nearSeats, poseOthers, seatAt };
}

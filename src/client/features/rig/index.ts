/**
 * flrnoh fork (see FORK.md): the racing rig next to the arcade cabinet (ui/rig.ts): OFFICE GP up close,
 * sitting in its seat, and on its TV for everyone else on the floor.
 */
import { LAPS, lapText, ordinal } from '../../../shared/racing';
import { RIG_SEAT } from '../../../shared/rig';
import type { SeatDef, SeatPlace } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { clip, toast } from '../../ui/dom';
import { RacingRig } from '../../ui/rig';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    rig: true;
  }
}

export interface RigDeps {
  /** The free place on a seat nearest you (see features/seating). */
  freePlace(seat: SeatDef): SeatPlace | null;
  /** Up off whatever you're sitting on (see features/seating). */
  standUp(): void;
}

export function installRig(ctx: Ctx, deps: RigDeps) {
  const { player } = ctx;
  const rig = new RacingRig(ctx.office.rig, ctx.net, {
    sit: () => sitInRig(),
    stand: () => {
      if (player.seat?.seatId === RIG_SEAT) deps.standUp();
    },
    seated: () => player.seat?.seatId === RIG_SEAT,
    sound: (e) => ctx.sound.rig(e),
  });

  /** Into the rig's seat, if nobody else is in it. Says whether you're in. */
  function sitInRig(): boolean {
    const seat = ctx.plan().seatingById.get(RIG_SEAT);
    if (!seat) return false;
    if (player.seat?.seatId === RIG_SEAT) return true;
    const place = deps.freePlace(seat);
    if (!place) {
      toast('Someone is sitting in the rig right now', 'warn');
      return false;
    }
    player.sit(place);
    ctx.me.sit(place.hips);
    ctx.net.send({ t: 'sit', seat: place.key });
    return true;
  }

  ctx.ticks.add('play', ({ dt }) => {
    rig.update(ctx.camera, dt);
    ctx.me.wheel = player.seat?.seatId === RIG_SEAT;
  });
  // With the camera up at its screen, the race has the screen: no hands drawn over it.
  ctx.view.add({ covers: () => rig.zoomed });

  ctx.interactions.define('rig', {
    reach: 4,
    hint: () => {
      const r = store.rig;
      const d = r.driver;
      if (d && d.id !== store.you) {
        const f = store.rigFrame;
        const how = f ? (f.phase === 'done' ? ` · ${ordinal(f.place)} 🏁` : f.phase === 'race' ? ` · lap ${Math.min(LAPS, f.laps.length + 1)}/${LAPS} · ${ordinal(f.place)}` : ' · on the grid') : '';
        return { k: `${d.name}|${how}`, parts: [hintTitle('🏎️ Racing rig'), aside(`▶ ${clip(d.name, 24)} is racing${how}`), key('E', 'Watch')] };
      }
      const best = r.scores.races[0];
      const about = best ? `🏆 ${clip(best.name, 24)} · ${lapText(best.ms)}` : 'no times yet';
      return { k: about, parts: [hintTitle('🏎️ Racing rig'), aside(about), key('E', 'Race')] };
    },
    use: onE(() => rig.play()),
  });

  /** Its engine, whoever's at the wheel, on your floor of the office (see features/cars). */
  const engine = () => (!ctx.upTop() && ctx.inOffice() ? rig.engine() : null);

  return { rig, engine, stop: () => rig.stop() };
}

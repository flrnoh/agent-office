/**
 * flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER, the roller coaster wound round the office tower
 * (coaster/ride.ts): its station off the roof's north edge (E there gets you in, or out again before it
 * goes; E at the monitor shows the ride photo), the train's messages, your keys while you're in (an
 * activity: H or Space hands up), the field of view, and the whole thing each frame after everyone's
 * moved, from the roof, every floor and the street (not from the places across the street).
 */
import { CASINO } from '../../../shared/casino';
import { GYM } from '../../../shared/gym';
import { HALL } from '../../../shared/hall';
import { roofDrop, streetBelow } from '../../../shared/layout';
import { SOCCER } from '../../../shared/soccer';
import { BOWLING } from '../../../shared/bowling'; // fork: nor in the bowling centre
import { VENUE } from '../../../shared/venue'; // fork: nor in the Schallwerk
import type { Ctx } from '../../core/context';
import { builtFloors } from '../../core/floors';
import { aside, hintTitle, key } from '../../core/hint';
import { noOutline } from '../../core/outline';
import { CoasterRide } from '../../coaster/ride';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import type { Rooftop } from '../rooftop/world';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    coaster: true;
    coasterphoto: true;
  }
}

export interface CoasterFeatureDeps {
  /** The roof, once it's built (see features/rooftop). */
  roof(): Rooftop | null;
  /** How many floors the roof stands on (see features/rooftop). */
  roofFloors(): number;
  /** Someone else's body, by their id (see features/peers). */
  bodyOf(id: string): import('three').Object3D | undefined;
}

export function installCoaster(ctx: Ctx, deps: CoasterFeatureDeps): CoasterRide {
  // From below too: on a floor of the office, its balcony or the street, the roof's deck is the tower's
  // top, (count - index) storeys over your floor; not from the places across the street.
  const lift = (): number | null => {
    if (ctx.upTop()) return ctx.inOffice() ? 0 : null;
    const f = store.floor;
    if (!ctx.inOffice() || f === CASINO || f === GYM || f === HALL || f === SOCCER || f === BOWLING || f === VENUE) return null;
    const { index, count } = ctx.office.stack.state;
    return count >= 1 ? streetBelow(index) + roofDrop(count) : null;
  };
  const coaster = new CoasterRide({
    scene: ctx.scene,
    camera: ctx.camera,
    renderer: ctx.renderer,
    player: ctx.player,
    me: ctx.me.root,
    night: ctx.office.night,
    you: () => store.you,
    officeNow: () => store.officeNow(),
    lift,
    upTop: () => ctx.upTop(),
    storeys: () => deps.roofFloors(),
    roof: () => deps.roof(),
    bodyOf: deps.bodyOf,
    lookOf: (id) => store.peers.get(id)?.look,
    noOutline,
    world: () => ctx.world(),
    bottom: () => builtFloors()[0],
    send: (m) => ctx.net.send(m),
    toast,
    firstPerson: () => ctx.player.view === 'first',
    dark: () => ctx.sky.lampsOn,
    reduceMotion: () => ctx.reduceMotion.matches,
    sound: ctx.sound,
  });
  ctx.messages.onAny((msg) => coaster.onMessage(msg));
  ctx.interactions.define('coaster', {
    reach: 6,
    hint: () => coaster.hint(hintTitle, key, aside, 'coaster'),
    use: (it, k) => coaster.use(it, k),
  });
  ctx.interactions.define('coasterphoto', {
    reach: 3.5,
    hint: () => coaster.hint(hintTitle, key, aside, 'coasterphoto'),
    use: (it, k) => coaster.use(it, k),
  });
  // In the train: H or Space hands up, E out (in the station), nothing else in reach.
  ctx.activities.add({
    id: 'coaster',
    active: () => coaster.riding,
    stop: (why) => {
      if (why === 'taken' || why === 'map' || why === 'trip') coaster.stop();
    },
    key: (e) => coaster.key(e),
    hint: (el) =>
      ctx.hint.draw(el, `coaster|${coaster.out}|${coaster.state.seats.find((r) => r?.id === store.you)?.hands}`, () =>
        coaster.out
          ? [h('span.title', {}, '🎢 DER BRECHER'), key('H', coaster.state.seats.find((r) => r?.id === store.you)?.hands ? 'Hände runter' : 'Hände hoch!'), aside('Maus: umschauen')]
          : [h('span.title', {}, '🎢 Festhalten!'), aside('gleich geht’s los'), key('E', 'Aussteigen')],
      ),
    takesCamera: true,
    hidesHands: true,
  });
  ctx.view.add({ fov: (f) => coaster.fov(f) });
  ctx.ticks.add('others', ({ dt, t }) => coaster.update(dt, t));
  return coaster;
}

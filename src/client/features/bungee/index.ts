/**
 * flrnoh fork (see FORK.md): bungee off the roof (bungee.ts, world/bungee.ts): a jetty over the
 * street, one jumper at a time; on the rope, F flips and nothing else is in reach.
 */
import { CASINO } from '../../../shared/casino';
import { GYM } from '../../../shared/gym';
import { HALL } from '../../../shared/hall';
import { roofDrop, streetBelow } from '../../../shared/layout';
import { SOCCER } from '../../../shared/soccer';
import { BOWLING } from '../../../shared/bowling';
import type { Ctx } from '../../core/context';
import { noOutline } from '../../core/outline';
import { aside, hintTitle, key } from '../../core/hint';
import { Bungee } from '../../bungee';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Rooftop } from '../rooftop/world';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    bungee: true;
  }
}

export interface BungeeFeatureDeps {
  /** The roof, once it's built (see features/rooftop). */
  roof(): Rooftop | null;
  /** How many floors the roof stands on (see features/rooftop). */
  roofFloors(): number;
  /** Someone else's body, by their id (see features/peers). */
  bodyOf(id: string): import('three').Object3D | undefined;
}

export function installBungee(ctx: Ctx, deps: BungeeFeatureDeps): Bungee {
  // From below too: on a floor of the office, its balcony or the street, the roof's deck is the tower's
  // top (world/tower.ts), (count - index) storeys over your floor; not from the places across the street.
  const below = (): number | null => {
    const f = store.floor;
    if (ctx.upTop() || !ctx.inOffice() || f === CASINO || f === GYM || f === HALL || f === SOCCER || f === BOWLING) return null;
    const { index, count } = ctx.office.stack.state;
    return count >= 1 ? streetBelow(index) + roofDrop(count) : null;
  };
  const bungee = new Bungee({
    scene: ctx.scene,
    camera: ctx.camera,
    player: ctx.player,
    me: ctx.me.root,
    bodyOf: deps.bodyOf,
    you: () => store.you,
    officeNow: () => store.officeNow(),
    jetty: () => deps.roof()?.bungee ?? null,
    below,
    lookOf: (id) => store.peers.get(id)?.look,
    noOutline,
    drop: () => roofDrop(deps.roofFloors()),
    send: (m) => ctx.net.send(m),
    toast,
    sound: ctx.sound,
  });
  ctx.messages.onAny((msg) => bungee.onMessage(msg));
  // On the rope, F flips and nothing else is in reach.
  ctx.keys.add('activity', (e) => bungee.key(e));
  ctx.interactions.define('bungee', {
    reach: 3.5,
    hint: () => bungee.hint(hintTitle, key, aside),
    use: (it, k) => void bungee.use(it, k),
  });
  // The jumper on the rope, and your camera if it's you.
  ctx.ticks.add('others', () => bungee.update(ctx.upTop(), ctx.player.view === 'first'));
  return bungee;
}

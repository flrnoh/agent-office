/**
 * flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): trying things on.
 * E at the boutique's racks or in a changing cubicle opens the clothes window (ui/wardrobe.ts), at
 * the optician's wall of glasses (or the table of frames, or the counter) the mirror; what you keep
 * is saved as your look and shirt color and sent like a change in the character window, so everyone
 * sees it. A cubicle's curtain is drawn while someone's in it (decor-wear.ts asks `inside`).
 */
import { SHOPS, type Shop } from '../../../shared/shops';
import { shopRoom, type Station } from '../../../shared/shop-rooms';
import type { Look } from '../../../shared/avatar';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { saveProfile, store, type Profile } from '../../state';
import { toast } from '../../ui/dom';
import { openBoutique, openOptiker } from '../../ui/wardrobe';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { cubicles } from './decor-wear';

declare module '../../world/types' {
  interface InteractKinds {
    shoprack: true;
    shopcubicle: true;
    shopglasses: true;
  }
}

export interface WearDeps {
  keeperOf(shop: number): Person | undefined;
  counterAt(s: Shop): { x: number; y: number; z: number };
  /** Your character and your hands, as `p` has them (core/you.ts). */
  showMyProfile(p: Profile): void;
}

export function wearShops(ctx: Ctx, deps: WearDeps) {
  // Who's where on the street, for the cubicles' curtains: you and everyone on your floor.
  cubicles.who = () => {
    const street = ctx.player.street;
    const out: { x: number; z: number }[] = [];
    if (Math.abs(ctx.player.pos.y - street) < 1.5) out.push({ x: ctx.player.pos.x, z: ctx.player.pos.z });
    for (const p of store.peers.values()) if (p.id !== store.you && store.onMyFloor(p) && Math.abs(p.y - street) < 1.5) out.push({ x: p.x, z: p.z });
    return out;
  };

  function keep(look: Look, color: string) {
    const p: Profile = { ...store.profile, color, look };
    store.profile = p;
    saveProfile(p);
    deps.showMyProfile(p);
    ctx.net.send({ t: 'profile', name: p.name, color: p.color, look });
  }

  function boutique(s: Shop) {
    const keeper = deps.keeperOf(s.i);
    keeper?.say('Probier ruhig an!', 2.5);
    openBoutique({
      look: store.profile.look,
      color: store.profile.color,
      onSave: (look, color) => {
        ctx.sound.shop('till', deps.counterAt(s));
        keeper?.reach();
        keeper?.say('Steht dir!', 3);
        keep(look, color);
        toast('🛍️ Neue Klamotten!');
      },
    });
  }

  function optiker(s: Shop) {
    const keeper = deps.keeperOf(s.i);
    keeper?.say('Na, welche darf’s sein?', 2.5);
    openOptiker({
      look: store.profile.look,
      color: store.profile.color,
      onSave: (look, color) => {
        ctx.sound.shop('till', deps.counterAt(s));
        keeper?.reach();
        keeper?.say(look.specs ? 'Jetzt sehen Sie wieder scharf!' : 'Ganz ohne? Auch gut.', 3);
        keep(look, color);
        toast(look.specs ? '👓 Neue Brille!' : '👀 Brille abgesetzt');
      },
    });
  }

  /** The counter: the boutique's clothes, the optician's glasses. */
  const counter = (s: Shop) => (s.kind === 'optiker' ? optiker(s) : boutique(s));

  const shopOf = (it: Interactable) => (it.shop !== undefined ? SHOPS[it.shop] : undefined);
  const stationOf = (it: Interactable): Station | undefined => {
    const s = shopOf(it);
    return s && it.station !== undefined ? shopRoom(s).stations[it.station] : undefined;
  };
  const use = onE((it) => {
    const s = shopOf(it);
    if (s) counter(s);
  });

  ctx.interactions.define('shoprack', {
    reach: 2.4,
    hint: () => ({ k: 'rack', parts: [hintTitle('👚 Kleiderstange'), aside('Hoodies, Hemden, Sakkos, Lederjacken, Kleider, Hüte'), key('E', 'Anprobieren')] }),
    use,
  });
  ctx.interactions.define('shopcubicle', {
    reach: 1.8,
    hint: (it) => {
      const t = stationOf(it);
      const s = shopOf(it);
      const inIt = !!(s && t && cubicles.holds(s, t.n, ctx.player.pos.x, ctx.player.pos.z));
      return { k: `cubicle|${inIt}`, parts: [hintTitle('🚪 Umkleidekabine'), aside(inIt ? 'Vorhang zu' : 'rein, Vorhang zu'), key('E', 'Umziehen')] };
    },
    use,
  });
  ctx.interactions.define('shopglasses', {
    reach: 2.4,
    hint: () => ({ k: 'glasses', parts: [hintTitle('👓 Brillen'), aside('rund, eckig, Nerd, Pilot, Cat-Eye'), key('E', 'Aufsetzen')] }),
    use,
  });

  return { counter };
}

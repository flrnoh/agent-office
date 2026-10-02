/**
 * flrnoh fork (see FORK.md "Shops to walk into", food round 2): what E does in the ice cream parlour,
 * the sushi bar and the supermarket (the butcher's counter is a menu like the others', index.ts).
 * The parlour's counter opens the flavour picker (ui-food.ts); at the sushi bar you take the plate
 * passing in front of you off the belt (shared/shop-rooms-food.ts: the same plates for everyone, on the
 * office clock; one you took is hidden on your page only, as nobody else is told); at the supermarket
 * you take a trolley at the bay by the door (trolley.ts: everyone sees it), put things in at the
 * shelves, and the checkout rings them up: beep, beep, a receipt. E with nothing to use lets go of it.
 */
import { DRINK_BY_ID, type Drink } from '../../../shared/rooftop';
import { SHOPS, SHOP_KIND_BY_ID, shopPoint, type Shop } from '../../../shared/shops';
import { shopRoom, type Station } from '../../../shared/shop-rooms';
import { BELT_SPEED, beltOf, plateAt } from '../../../shared/shop-rooms-food';
import { MARKET_AISLES, TROLLEY_MAX, aisleGood, euros, receipt } from '../../../shared/trolley';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { setBeltClock, takePlate } from './decor-food';
import { trolleyCarts } from './trolley';
import { openIcePicker } from './ui-food';

declare module '../../world/types' {
  interface InteractKinds {
    shopbelt: true;
    shoptrolleys: true;
    shopaisle: true;
  }
}

/** The interaction kinds of these shops' stations (index.ts's KIND_OF takes them in). */
export const FOOD_KIND_OF = { belt: 'shopbelt', trolleys: 'shoptrolleys', aisle: 'shopaisle' } as const;

export interface FoodDeps {
  /** Over the counter and into your hand (index.ts's serve). */
  serve(s: Shop, d: Drink): void;
  keeperOf(shop: number): Person | undefined;
  personOf(id: string): Person | undefined;
  onStreet(): boolean;
  /** What you're aiming at or standing at, if anything. */
  target(): Interactable | null;
}

export function shopFood(ctx: Ctx, deps: FoodDeps) {
  const officeNow = () => store.officeNow() / 1000;
  setBeltClock(officeNow);
  const carts = trolleyCarts(ctx, { personOf: deps.personOf, onStreet: deps.onStreet });
  const shopOf = (it: Interactable) => (it.shop !== undefined ? SHOPS[it.shop] : undefined);
  const stationOf = (it: Interactable): Station | undefined => {
    const s = shopOf(it);
    return s && it.station !== undefined ? shopRoom(s).stations[it.station] : undefined;
  };
  const near = (s: Shop, t: Station) => {
    const p = shopPoint(s, t.u, t.v);
    return { x: p.x, y: ctx.player.street + 1.1, z: p.z };
  };

  // ---- The sushi bar's belt ------------------------------------------------------------------------
  /** The plate passing in front of `u` on shop `s`'s belt right now. */
  function plateBy(s: Shop, u: number) {
    const bt = beltOf(shopRoom(s));
    return bt ? plateAt(s.i, bt, u, officeNow(), 0.5) : null;
  }
  function takeFromBelt(s: Shop, t: Station) {
    const bt = beltOf(shopRoom(s));
    const got = bt && plateAt(s.i, bt, t.u, officeNow(), 0.5);
    if (!bt || !got) {
      deps.keeperOf(s.i)?.say('Moment, der nächste kommt gleich!', 2.5);
      return toast('🍣 Nothing passing right in front of you: wait for the next plate');
    }
    // Gone from the belt on your page until it'd have come round again (the chef puts a new one on).
    takePlate(s.i, got.k, officeNow() + bt.len / BELT_SPEED - 2);
    const d = DRINK_BY_ID.get(got.plate);
    if (d) deps.serve(s, d);
  }

  // ---- The supermarket -----------------------------------------------------------------------------
  const taken = new Map<number, number>();
  function fromShelf(s: Shop, t: Station) {
    const aisle = MARKET_AISLES[t.n];
    if (!carts.have()) return toast(`🛒 Get a trolley first: they're by the door`, 'warn');
    if (carts.items().length >= TROLLEY_MAX) return toast('🛒 Your trolley is full: off to the checkout!', 'warn');
    const k = taken.get(t.n) ?? (s.i + t.n) % aisle.goods.length;
    taken.set(t.n, k + 1);
    const good = aisleGood(t.n, k);
    if (!carts.add(good.id)) return;
    ctx.sound.shop('pop', near(s, t));
    toast(`${good.emoji} ${good.name} in the trolley (${carts.items().length}/${TROLLEY_MAX})`);
  }
  function trolleyBay(s: Shop, t: Station) {
    if (carts.have()) {
      carts.letGo();
      return toast('🛒 Trolley back in the bay');
    }
    carts.take();
    void t;
    void s;
    toast('🛒 Push it about: E at a shelf puts something in, E at the checkout pays, E anywhere else lets go');
  }
  let ringing = false;
  function checkout(s: Shop) {
    const cashier = deps.keeperOf(s.i);
    const t = shopRoom(s).stations.find((x) => x.at === 'counter')!;
    if (ringing) return;
    if (!carts.have() || !carts.items().length) {
      cashier?.say('Der Nächste, bitte!', 2.5);
      return toast(carts.have() ? '🛒 Your trolley is empty: fill it at the shelves first' : '🛒 Take a trolley at the door and fill it at the shelves', 'warn');
    }
    const items = carts.empty();
    const bill = receipt(items);
    ringing = true;
    cashier?.say('Grüß Gott! Sammeln Sie Treuepunkte?', 2.5);
    items.forEach((_, i) => window.setTimeout(() => ctx.sound.shop('beep', near(s, t)), 500 + i * 320));
    const end = 700 + items.length * 320;
    window.setTimeout(() => {
      ringing = false;
      ctx.sound.shop('receipt', near(s, t));
      cashier?.reach();
      cashier?.say(`Das macht ${euros(bill.cents)}. Ach was, geht aufs Haus!`, 3.5);
      const lines = bill.lines.map((l) => `${l.n > 1 ? `${l.n}× ` : ''}${l.good.emoji} ${l.good.name}  ${euros(l.cents)}`);
      const el = toast(`🧾 ${SHOP_KIND_BY_ID.get(s.kind)!.sign}\n${lines.join('\n')}\nSUMME ${euros(bill.cents)} · bezahlt: aufs Haus`);
      el.style.whiteSpace = 'pre-line';
    }, end);
  }

  // ---- What E does at each ---------------------------------------------------------------------------
  ctx.interactions.define('shopbelt', {
    reach: 2.2,
    hint: (it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      const got = s && t ? plateBy(s, t.u) : null;
      const d = got ? DRINK_BY_ID.get(got.plate) : undefined;
      return { k: `belt|${it.shop}|${it.station}|${got?.k ?? '-'}`, parts: [hintTitle('🍣 Laufband'), aside(d ? `${d.emoji} ${d.name} going by` : 'waiting for the next plate'), key('E', 'Take the plate')] };
    },
    use: onE((it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      if (s && t) takeFromBelt(s, t);
    }),
  });
  ctx.interactions.define('shoptrolleys', {
    reach: 2.4,
    hint: () => ({ k: `trolleys|${carts.have()}`, parts: [hintTitle('🛒 Einkaufswagen'), aside(carts.have() ? 'put yours back' : 'push it round the shop'), key('E', carts.have() ? 'Put it back' : 'Take a trolley')] }),
    use: onE((it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      if (s && t) trolleyBay(s, t);
    }),
  });
  ctx.interactions.define('shopaisle', {
    reach: 2.4,
    hint: (it) => {
      const t = stationOf(it);
      const a = MARKET_AISLES[t?.n ?? 0];
      return { k: `aisle|${it.shop}|${it.station}|${carts.have()}|${carts.items().length}`, parts: [hintTitle(`${a.emoji} ${a.name}`), aside(carts.have() ? `${carts.items().length}/${TROLLEY_MAX} in your trolley` : 'you need a trolley (by the door)'), key('E', 'Into the trolley')] };
    },
    use: onE((it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      if (s && t) fromShelf(s, t);
    }),
  });
  // E with nothing to use while you push a trolley: you let go of it.
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !carts.have() || deps.target() || ctx.activities.busy()) return false;
    carts.letGo();
    toast('🛒 You let go of the trolley');
    return true;
  });

  return {
    carts,
    /** The counter of shop `s`, if it's one of these that does something of its own there; whether it did. */
    counter(s: Shop): boolean {
      switch (s.kind) {
        case 'eisdiele': {
          const keeper = deps.keeperOf(s.i);
          keeper?.say('Ciao! Welche Sorten?', 2.5);
          openIcePicker({
            keeper: SHOP_KIND_BY_ID.get(s.kind)!.keeper.name,
            order: (d) => {
              const t = shopRoom(s).stations[0];
              ctx.sound.shop('scoop', near(s, t));
              deps.serve(s, d);
            },
          });
          return true;
        }
        case 'sushi': {
          const t = shopRoom(s).stations.find((x) => x.at === 'counter')!;
          takeFromBelt(s, t);
          return true;
        }
        case 'supermarkt':
          checkout(s);
          return true;
        default:
          return false;
      }
    },
    /** For checks: the plate in front of station `n` of shop `i` now. */
    plateBy: (i: number, u: number) => plateBy(SHOPS[i], u),
  };
}

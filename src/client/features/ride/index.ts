/**
 * flrnoh fork (see FORK.md "Shops to walk into"): bikes from the bike shop, and what the pet shop and
 * the laundromat do. Rent a bike at the bike shop's counter and you're on it outside its door: ride
 * the city's streets and sidewalks (rider.ts), ring the bell, hop; E gets you off (it waits where you
 * left it, E to get back on), and it's taken back when you walk into a bike shop again or the rental's
 * up. Everyone sees you riding (riders.ts: PeerInfo.bike, your own `move`), and the budgie from the pet
 * shop on your shoulder. The laundromat's machines and vending machine are laundry.ts.
 */
import { SHOPS, SHOP_KIND_BY_ID, shopPoint, shopYaw, type Shop } from '../../../shared/shops';
import { insideShop } from '../../../shared/shop-rooms';
import { BIKES, RENTAL_SECONDS, WASH_SECONDS, type BikeKind } from '../../../shared/ride';
import { startWash } from '../shops/decor-ride';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { h, toast } from '../../ui/dom';
import { bikeModel, disposeBike, type BikeModel } from '../../world/bike';
import type { Interactable } from '../../world/types';
import type { Person } from '../../world/character';
import type { Booze } from '../bar/booze';
import { openLaundromat } from './laundry';
import { Rider } from './rider';
import { ridersOnBikes } from './riders';
import { openRental } from './ui';

declare module '../../world/types' {
  interface InteractKinds {
    parkedbike: true;
  }
}

export interface RideDeps {
  personOf(id: string): Person | undefined;
  booze(): Booze;
  /** Hands over shop `shop`'s thing `id` like its counter would (features/shops). */
  serve(shop: number, id: string): void;
  /** In a place across the street (the casino, the gym, a hall). */
  inPlace(): boolean;
}

export function installRide(ctx: Ctx, deps: RideDeps) {
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !deps.inPlace();
  const me = () => ({ x: ctx.player.pos.x, y: ctx.player.pos.y + 0.8, z: ctx.player.pos.z });
  const rider = new Rider(ctx.player, {
    bump: (speed) => {
      ctx.sound.ride('bump', me());
      ctx.shake(Math.min(0.3, speed * 0.03));
    },
    hop: () => undefined,
    land: (hard) => {
      ctx.sound.ride('land', me());
      if (hard) ctx.shake(0.12);
    },
  });
  /** The bike you've rented: which, from which shop, since when (seconds on the page's clock). */
  let rented: { kind: BikeKind; shop: number; since: number } | null = null;
  /** Where it waits while you're off it (only you see it standing there). */
  let parked: { x: number; z: number; rotY: number; model: BikeModel } | null = null;
  const now = () => performance.now() / 1000;

  function tell(bike: BikeKind | null) {
    ctx.net.send({ t: 'bike.ride', bike });
  }
  function unpark() {
    if (parked) disposeBike(parked.model);
    parked = null;
  }
  /** Up onto bike `k` at (x, z), facing `rotY`. */
  function mount(k: BikeKind, x: number, z: number, rotY: number) {
    ctx.activities.stopAll('start', ['cyclist']);
    if (ctx.player.seat) ctx.player.stand();
    ctx.player.pos.set(x, ctx.player.street, z);
    rider.mount(k, rotY);
    riders.mine(k);
    tell(k);
  }
  /** Off the bike: it waits where you got off. */
  function getOff(park = true) {
    const k = rider.bike;
    if (!k) return;
    rider.dismount();
    riders.mine(null);
    tell(null);
    if (park && rented) {
      unpark();
      const model = bikeModel(k);
      const p = ctx.player.pos;
      // Beside you, on its stand.
      const rotY = ctx.player.facing;
      const x = p.x + Math.cos(rotY) * 0.7;
      const z = p.z - Math.sin(rotY) * 0.7;
      model.group.position.set(x, p.y, z);
      model.group.rotation.set(0, rotY, 0.08);
      ctx.scene.add(model.group);
      parked = { x, z, rotY, model };
    }
  }
  /** The bike goes back to the shop: you're off it, and it's gone. */
  function giveBack(why: string) {
    getOff(false);
    unpark();
    if (rented) toast(why);
    rented = null;
  }

  // ---- The counter ---------------------------------------------------------------------------------
  function counter(s: Shop): boolean {
    if (s.kind !== 'fahrrad') return false;
    const k = SHOP_KIND_BY_ID.get(s.kind)!;
    openRental({
      keeper: k.keeper.name,
      rented: rented?.kind ?? null,
      rent: (kind) => {
        unpark();
        rented = { kind, shop: s.i, since: now() };
        // Out the door with it, onto the sidewalk, facing along the street.
        const out = shopPoint(s, s.doorU, -1.6);
        const along = s.doorU > s.len / 2 ? 1 : -1;
        mount(kind, out.x, out.z, shopYaw(s, along, 0));
        ctx.sound.ride('bell', me());
        toast(`${BIKES[kind].emoji} ${BIKES[kind].name}: W to pedal, A/D to steer, H rings the bell, E gets you off`);
      },
      giveBack: () => giveBack(`🚲 ${k.keeper.name} takes the bike back. Danke!`),
    });
    return true;
  }

  // ---- Riding: the keys and the hint bar ------------------------------------------------------------
  ctx.activities.add({
    id: 'cyclist',
    active: () => rider.active,
    // Walking somewhere by itself, a trip to another floor, sitting down: off the bike first.
    stop: () => getOff(),
    key: (e) => {
      if (e.code === 'KeyE') {
        if (!e.repeat) getOff();
        return true;
      }
      if (e.code === 'KeyH') {
        if (!e.repeat) {
          ctx.sound.ride('bell', me());
          ctx.net.send({ t: 'bike.bell' });
        }
        return true;
      }
      if (e.code === 'Space') {
        if (!e.repeat) rider.hop();
        return true;
      }
      return false;
    },
    hint: (el) => {
      const k = rider.bike!;
      const left = rented ? Math.max(0, Math.ceil((RENTAL_SECONDS - (now() - rented.since)) / 60)) : 0;
      ctx.hint.draw(el, `bike|${k}|${left}`, () => [
        h('span.title', {}, `${BIKES[k].emoji} ${BIKES[k].name}`),
        aside(`${left} min left on the rental`),
        key('W S', 'Pedal, brake'),
        key('A D', 'Steer'),
        key('Space', k === 'bmx' ? 'Jump' : 'Hop'),
        key('H', 'Bell'),
        key('E', 'Get off'),
      ]);
    },
  });

  // Your parked bike, to get back on.
  ctx.usables.add({ usable: () => (parked && onStreet() ? [{ kind: 'parkedbike', x: parked.x, z: parked.z, y: ctx.player.street, radius: 1.6 } satisfies Interactable] : []) });
  ctx.interactions.define('parkedbike', {
    reach: 2.2,
    hint: () => (rented ? { k: `parked|${rented.kind}`, parts: [hintTitle(`${BIKES[rented.kind].emoji} Your ${BIKES[rented.kind].name}`), aside('rented from the bike shop'), key('E', 'Get on')] } : { k: '', parts: [] }),
    use: onE(() => {
      if (!parked || !rented) return;
      const { x, z, rotY } = parked;
      unpark();
      mount(rented.kind, x, z, rotY);
    }),
  });

  // ---- Each frame: off the street means off the bike; back at a bike shop, or out of time, it goes back.
  let checkIn = 0;
  ctx.ticks.add('world', ({ dt }) => {
    if (rider.active && !onStreet()) getOff(false);
    if (!rented || (checkIn -= dt) > 0) return;
    checkIn = 0.5;
    const p = ctx.player.pos;
    if (now() - rented.since > RENTAL_SECONDS) return giveBack('🚲 Your rental’s up: the bike shop came for it');
    if (!rider.active && SHOPS.some((s) => s.kind === 'fahrrad' && insideShop(s, p.x, p.z))) giveBack('🚲 You brought the bike back. Danke!');
  });

  const riders = ridersOnBikes(ctx, { rider, personOf: deps.personOf, booze: deps.booze });
  openLaundromat(ctx, { serve: deps.serve });

  return {
    /** The bike shop's counter (features/shops): whether it was that. */
    counter,
    /** On a bike right now (and how it's going), for checks. */
    riding: () => rider.bike,
    going: () => ({ speed: rider.speed, meters: rider.meters, steer: rider.steer }),
    /** Rents bike `k` at shop `i` straight away, for checks. */
    rent: (i: number, k: BikeKind) => {
      const s = SHOPS[i];
      rented = { kind: k, shop: i, since: now() };
      const out = shopPoint(s, s.doorU, -1.6);
      mount(k, out.x, out.z, shopYaw(s, s.doorU > s.len / 2 ? 1 : -1, 0));
    },
    getOff: () => getOff(),
    /** Starts a wash in laundromat `i`'s machine `n`, for checks. */
    wash: (i: number, n: number) => startWash(i, n, Date.now() + WASH_SECONDS * 1000),
  };
}

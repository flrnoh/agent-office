/**
 * flrnoh fork (see FORK.md "Shops to walk into"): the city's shops, open. Walk in through any shop's
 * door (shared/shops.ts lays them out; world/town/shops.ts draws their fronts and rooms) and there's
 * the shop: a counter with someone behind it, shelves, tables, and one thing to do with E. What
 * stands in a shop is only built for the handful nearest you (interior.ts, decor.ts) and let go of
 * again as you walk on. What you're handed is held like the fridge's things (everyone sees it); the
 * barber and the tattoo studio change your look (saved and sent like a change in the character
 * window); toys are for playing with (toys.ts); records for listening to (ui.ts, sound.ts).
 */
import * as THREE from 'three';
import { CAFE_BY_ID, type CafeItemId } from '../../../shared/cafe';
import { FRIDGE_BY_ID, type FridgeItemId } from '../../../shared/fridge';
import type { Look } from '../../../shared/avatar';
import { RECORD_BY_ID, crateDig, type RecordDef } from '../../../shared/records';
import { DRINK_BY_ID, type Drink } from '../../../shared/rooftop';
import { SHOP_H, SHOPS, SHOP_KIND_BY_ID, shopPoint, type Shop } from '../../../shared/shops';
import { insideShop, shopRoom, shopSeatKey, stationAt, type Station } from '../../../shared/shop-rooms';
import { MENUS, SHOP_ITEM_BY_ID, isToy, type ShopItemId } from '../../../shared/shopwares';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import { saveProfile, store, type Profile } from '../../state';
import { openBarber } from '../../ui/barber';
import { modalOpen, toast } from '../../ui/dom';
import { openInkStudio, type InkWork } from '../../ui/inkstudio';
import { Person } from '../../world/character';
import { setFogShop, setShopLights } from '../../world/fogbox';
import type { Interactable } from '../../world/types';
import type { Booze } from '../bar/booze';
import type { Caffeine } from '../coffee/caffeine';
import { at, buildInterior, interiorLight, yawOf, type Interior } from './interior';
import { toyBox } from './toys';
import { wearShops } from './wear'; // the boutique and the optician
import { openCrate, openHeadphones, openReading, openShopMenu } from './ui';
import type { CafeItem } from '../../../shared/cafe';

declare module '../../world/types' {
  interface InteractKinds {
    shopcounter: true;
    shopchair: true;
    shopcrate: true;
    shoplisten: true;
    shopshelf: true;
  }
}

export interface ShopsDeps {
  booze(): Booze;
  caffeine(): Caffeine;
  /** A coffee or a cake, handed over like the padel hall café's (features/fridge). */
  serveFromCafe(d: CafeItem): void;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
  personOf(id: string): Person | undefined;
  /** Your character and your hands, as `p` has them (core/you.ts). */
  showMyProfile(p: Profile): void;
  /** What you're aiming at or standing at, if anything (input/pointer.ts). */
  target(): Interactable | null;
  /** In a place across the street (the casino, the gym, a hall). */
  inPlace(): boolean;
}

/** How near (m, from the camera) a shop's inside is built, how many at most, and how far before it goes. */
const NEAR = 40;
const MAX = 6;
const FAR = 52;

interface Open {
  int: Interior;
  keeper: Person;
  items: Interactable[];
}

const KIND_OF: Record<Station['at'], Interactable['kind']> = { counter: 'shopcounter', chair: 'shopchair', crate: 'shopcrate', listen: 'shoplisten', shelf: 'shopshelf', rack: 'shoprack', cubicle: 'shopcubicle', glasses: 'shopglasses' }; // rack, cubicle, glasses: wear.ts

export function installShops(ctx: Ctx, deps: ShopsDeps) {
  const open = new Map<number, Open>();
  let items: Interactable[] = [];
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !deps.inPlace();
  const toys = toyBox(ctx, { personOf: deps.personOf, nameOf: (id) => store.peers.get(id)?.name ?? 'Someone' });
  const now = () => performance.now() / 1000;

  // ---- Building the insides of the shops near you, and letting go of the rest ---------------------
  const v = new THREE.Vector3();
  let since = 0;
  function nearby(): Shop[] {
    if (!onStreet()) return [];
    const c = ctx.camera.position;
    // Down on the street (or near it), not looking down from a floor high up.
    if (c.y > ctx.player.street + 30) return [];
    return SHOPS.map((s) => {
      const p = shopPoint(s, s.len / 2, s.depth / 2);
      return { s, d: Math.hypot(p.x - c.x, p.z - c.z) };
    })
      .filter((o) => o.d < NEAR)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX)
      .map((o) => o.s);
  }
  function close(i: number) {
    const o = open.get(i);
    if (!o) return;
    o.int.dispose();
    open.delete(i);
  }
  function build(s: Shop) {
    const int = buildInterior(s);
    const room = shopRoom(s);
    const k = int.kind.keeper;
    const keeper = new Person(k.name, k.shirt, { skin: k.skin, hair: k.hair, style: k.style });
    keeper.showLabel(false);
    noOutline(keeper.root);
    // On a step behind the counter, so they're seen over it.
    keeper.root.position.copy(at(room.keeper.u, 0.3, room.keeper.v));
    keeper.root.rotation.y = yawOf(0, -1);
    int.group.add(keeper.root);
    const list: Interactable[] = room.stations.map((t, n) => {
      const w = stationAt(s, t);
      return { kind: KIND_OF[t.at], x: w.x, z: w.z, y: ctx.player.street, radius: t.r, shop: s.i, station: n };
    });
    int.hits.forEach((hit, n) => (hit.userData.interact = list[n]));
    ctx.office.town.group.add(int.group);
    open.set(s.i, { int, keeper, items: list });
  }
  function refresh() {
    const want = nearby();
    const keep = new Set(want.map((s) => s.i));
    const c = ctx.camera.position;
    for (const [i, o] of open) {
      const p = shopPoint(o.int.shop, o.int.shop.len / 2, o.int.shop.depth / 2);
      if (!keep.has(i) && (Math.hypot(p.x - c.x, p.z - c.z) > FAR || !onStreet() || open.size > MAX)) close(i);
    }
    // One a go, so walking along a street never builds a whole row in one frame.
    const next = want.find((s) => !open.has(s.i));
    if (next && open.size < MAX) build(next);
    items = [...open.values()].flatMap((o) => o.items);
  }
  ctx.usables.add({ usable: () => (onStreet() ? items : []) });

  // ---- Each frame: the keepers, what moves, the light, the fog, the camera in a shop --------------
  /** The shop you're in, if any. */
  let inside: Shop | null = null;
  const lights: { min: [number, number, number]; max: [number, number, number] }[] = [];
  const warm = new THREE.Color();
  ctx.ticks.add('world', ({ dt, t }) => {
    since += dt;
    if (since > 0.25) {
      since = 0;
      refresh();
    }
    interiorLight(ctx.sky.lampsOn);
    // The lights in the shops whose insides are built: on everyone and everything in there.
    const street = ctx.player.street;
    lights.length = 0;
    for (const o of open.values()) {
      const r = o.int.shop.rect;
      lights.push({ min: [r.minX, street - 0.2, r.minZ], max: [r.maxX, street + SHOP_H, r.maxZ] });
    }
    setShopLights(onStreet() ? lights : [], warm.setRGB(1, 0.86, 0.68).multiplyScalar(0.55 + 1.5 * ctx.sky.lampsOn));
    const p = ctx.player.pos;
    for (const o of open.values()) {
      for (const it of o.items) it.y = ctx.player.street;
      for (const l of o.int.live) l.update(t, dt);
      // The keeper turns a little toward whoever's at the counter.
      const local = o.int.group.worldToLocal(v.set(p.x, p.y, p.z));
      const k = o.keeper.root;
      const near = Math.hypot(local.x - k.position.x, local.z - k.position.z) < 7 && Math.abs(p.y - ctx.player.street) < 2;
      const want = near ? Math.atan2(local.x - k.position.x, local.z - k.position.z) : 0;
      const turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(want), Math.cos(want))));
      k.rotation.y += Math.atan2(Math.sin(turn - k.rotation.y), Math.cos(turn - k.rotation.y)) * Math.min(1, dt * 3);
      o.keeper.update(dt, t, false, false);
    }
    // In through a door: its bell rings.
    const now = onStreet() && Math.abs(p.y - ctx.player.street) < 1.5 ? (SHOPS.find((s) => insideShop(s, p.x, p.z)) ?? null) : null;
    if (now !== inside) {
      if (now) {
        const d = shopPoint(now, now.doorU, 0.2);
        ctx.sound.shop('door', { x: d.x, y: ctx.player.street + 2.3, z: d.z });
      } else if (listening) stopListening();
      inside = now;
    }
    setFogShop(inside ? { min: [inside.rect.minX, street - 0.1, inside.rect.minZ], max: [inside.rect.maxX, street + SHOP_H, inside.rect.maxZ] } : null);
  });
  // In a shop, the camera behind you stays in the room (outside it you'd see its walls, and under the
  // floors over it the office's camera would duck down to the floor).
  const tgt = new THREE.Vector3();
  ctx.ticks.add('moved', () => {
    const pl = ctx.player;
    if (!inside || pl.view !== 'third' || pl.rig) return;
    const r = inside.rect;
    const m = 0.45;
    tgt.set(pl.pos.x, pl.pos.y + 1.3 + (pl.seat ? pl.seat.hips - 0.9 : 0), pl.pos.z);
    const c = ctx.camera.position;
    const k = Math.cos(pl.camPitch) * pl.camDist;
    c.set(
      THREE.MathUtils.clamp(tgt.x + Math.sin(pl.camYaw) * k, r.minX + m, r.maxX - m),
      THREE.MathUtils.clamp(tgt.y + Math.sin(pl.camPitch) * pl.camDist, pl.pos.y + 0.6, ctx.player.street + SHOP_H - 0.35),
      THREE.MathUtils.clamp(tgt.z + Math.cos(pl.camYaw) * k, r.minZ + m, r.maxZ - m),
    );
    ctx.camera.lookAt(tgt);
  });

  // ---- What the shops hand over ------------------------------------------------------------------
  const keeperOf = (shop: number) => open.get(shop)?.keeper;
  const counterAt = (s: Shop) => {
    const c = stationAt(s, shopRoom(s).stations[0]);
    return { x: c.x, y: ctx.player.street + 1.2, z: c.z };
  };

  const wear = wearShops(ctx, { keeperOf, counterAt, showMyProfile: deps.showMyProfile });

  /** Over the counter and into your hand, with whatever it does to you after. */
  function serve(s: Shop, d: Drink) {
    const keeper = keeperOf(s.i);
    const item = SHOP_ITEM_BY_ID.get(d.id as ShopItemId);
    keeper?.reach();
    keeper?.say(item?.says ?? 'Bitteschön!', 3);
    ctx.sound.shop(s.kind === 'doener' && d.id.startsWith('d') ? 'sizzle' : 'till', counterAt(s));
    window.setTimeout(() => {
      const cafe = CAFE_BY_ID.get(d.id as CafeItemId);
      if (cafe) return deps.serveFromCafe(cafe);
      const t = now();
      deps.booze().drink(d, t);
      deps.caffeine().top(t, FRIDGE_BY_ID.get(d.id as FridgeItemId)?.caffeine ?? item?.caffeine ?? 0);
      deps.reach();
      if (ctx.player.view === 'first') ctx.hands.sip();
      const fridge = FRIDGE_BY_ID.get(d.id as FridgeItemId);
      if (fridge) ctx.sound.opener(fridge.glass === 'bottle' || fridge.glass === 'can' ? fridge.glass : 'bite');
      toast(`${d.emoji} ${d.name}${item ? '' : '. Bitteschön!'}`);
      switch (item?.treat) {
        case 'spicy':
          window.setTimeout(() => {
            ctx.shake(0.25);
            ctx.me.say('🔥 Scharf!', 2.5);
            toast('🌶️ Mit scharf! Your eyes are watering');
          }, 2200);
          break;
        case 'sober':
          ctx.sound.shop('rattle', counterAt(s));
          toast('💊 Your head clears up, quicker than it would have');
          break;
        case 'fresh':
          toast('🍬 Whoa, menthol. You can breathe again');
          break;
        case 'read':
          openReading(d);
          break;
        case 'toy':
          toast(`${d.emoji} Click (or E) to play with it`);
          break;
        case 'listen':
          toast('🎧 Put it on at the listening station, or just carry it about');
          break;
      }
    }, 600);
  }

  // ---- The barber and the tattoo studio -----------------------------------------------------------
  function applyLook(look: Look) {
    const p: Profile = { ...store.profile, look };
    store.profile = p;
    saveProfile(p);
    deps.showMyProfile(p);
    ctx.net.send({ t: 'profile', name: p.name, color: p.color, look });
  }
  function barber(s: Shop) {
    const keeper = keeperOf(s.i);
    keeper?.say('Was darf’s sein?', 2.5);
    openBarber({
      look: store.profile.look,
      color: store.profile.color,
      onSave: (look) => {
        ctx.sound.shop('snip', counterAt(s));
        keeper?.reach();
        keeper?.say('Steht dir super!', 3);
        applyLook(look);
        toast('💈 Frisch geschnitten!');
      },
    });
  }
  function inkStudio(s: Shop) {
    const keeper = keeperOf(s.i);
    keeper?.say('Was soll’s werden?', 2.5);
    openInkStudio({
      look: store.profile.look,
      color: store.profile.color,
      onSave: (look: Look, what: InkWork) => {
        const where = { x: ctx.player.pos.x, y: ctx.player.pos.y + 1, z: ctx.player.pos.z };
        keeper?.reach();
        if (what === 'piercing') {
          ctx.sound.shop('pop', where);
          keeper?.say('Pieks! Schon vorbei.', 2.5);
          applyLook(look);
          toast('💍 Gestochen!');
          return;
        }
        // The machine buzzes a moment, then it's there (or gone, under the laser).
        ctx.sound.shop('buzz', where);
        keeper?.say(what === 'laser' ? 'Das zwickt jetzt kurz…' : 'Halt still…', 2.5);
        window.setTimeout(() => {
          applyLook(look);
          toast(what === 'laser' ? '🔦 Weggelasert.' : '🖋️ Frisch gestochen! Schön eincremen.');
        }, 2400);
      },
    });
  }

  /** Sits you down in shop `s`'s chair `t`, facing its mirror, for the barber or the tattoo artist. */
  function sitIn(s: Shop, t: Station) {
    const w = stationAt(s, t);
    if (!w.seat) return;
    const key = shopSeatKey(s.i, t.n);
    const taken = [...store.peers.values()].some((p) => p.id !== store.you && p.seat === key && store.onMyFloor(p));
    if (taken) return toast('Someone’s in that chair already', 'warn');
    if (ctx.player.seat?.key !== key) {
      ctx.player.sit({ key, seatId: key.replace(/:0$/, ''), x: w.seat.x, y: ctx.player.street, z: w.seat.z, rotY: w.seat.rotY, hips: w.seat.hips, out: 0.7 });
      ctx.me.sit(w.seat.hips);
      ctx.net.send({ t: 'sit', seat: key });
    }
    if (s.kind === 'tattoo') inkStudio(s);
    else barber(s);
  }

  // ---- Records: the crates and the listening station ---------------------------------------------
  let listening: { shop: number; rec: RecordDef } | null = null;
  function stopListening() {
    if (!listening) return;
    listening = null;
    ctx.sound.headphones(null);
  }
  function listen(s: Shop) {
    const held = deps.booze().holding(now());
    const rec = (held && RECORD_BY_ID.get(held.id)) || crateDig(s.i, 0, Math.floor(now() / 60))[0];
    if (!held || !RECORD_BY_ID.get(held.id)) keeperOf(s.i)?.say(`Hör mal hier rein: ${rec.band}!`, 3);
    listening = { shop: s.i, rec };
    deps.reach();
    ctx.sound.headphones({ tune: rec.tune, seed: rec.seed });
    openHeadphones(rec, stopListening);
  }

  // ---- Using things ------------------------------------------------------------------------------
  const shopOf = (it: Interactable) => (it.shop !== undefined ? SHOPS[it.shop] : undefined);
  const stationOf = (it: Interactable) => {
    const s = shopOf(it);
    return s && it.station !== undefined ? shopRoom(s).stations[it.station] : undefined;
  };
  function counter(s: Shop) {
    const k = SHOP_KIND_BY_ID.get(s.kind)!;
    if (s.kind === 'boutique' || s.kind === 'optiker') return wear.counter(s);
    if (s.kind === 'friseur' || s.kind === 'tattoo') {
      const chair = shopRoom(s).stations.find((t) => t.at === 'chair');
      return chair ? sitIn(s, chair) : s.kind === 'tattoo' ? inkStudio(s) : barber(s);
    }
    keeperOf(s.i)?.say(s.kind === 'doener' ? 'Was darf’s sein, Chef?' : 'Grüß Gott!', 2);
    openShopMenu({ kind: k, keeper: k.keeper.name, items: MENUS[s.kind], cutOff: deps.booze().cutOff(now()), order: (d) => serve(s, d) });
  }
  const label = (it: Interactable) => {
    const s = shopOf(it);
    return s ? SHOP_KIND_BY_ID.get(s.kind)! : null;
  };
  ctx.interactions.define('shopcounter', {
    reach: 3.2,
    hint: (it) => {
      const k = label(it);
      if (!k) return { k: '', parts: [] };
      const cut = deps.booze().cutOff(now()) && it.shop !== undefined && SHOPS[it.shop].kind === 'bar';
      return { k: `shop|${it.shop}|${cut}`, parts: [hintTitle(`${k.emoji} ${k.name}`), aside(cut ? 'you’ve had enough' : `${k.keeper.name} is here`), key('E', k.verb)] };
    },
    use: onE((it) => {
      const s = shopOf(it);
      if (s) counter(s);
    }),
  });
  ctx.interactions.define('shopchair', {
    reach: 2.5,
    hint: (it) => {
      const k = label(it);
      if (!k) return { k: '', parts: [] };
      const sitting = ctx.player.seat?.key === shopSeatKey(it.shop ?? -1, stationOf(it)?.n ?? -1);
      const what = k.id === 'tattoo' ? 'Tattoo, Piercing, Laser' : 'Haare, Farbe, Bart';
      return { k: `chair|${it.shop}|${sitting}`, parts: [hintTitle(`${k.emoji} ${k.id === 'tattoo' ? 'Tattoo chair' : 'Barber chair'}`), aside(what), key('E', sitting ? 'Choose' : 'Sit down'), ...(sitting ? [key('W A S D', 'Get up')] : [])] };
    },
    use: onE((it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      if (s && t) sitIn(s, t);
    }),
  });
  ctx.interactions.define('shopcrate', {
    reach: 2.5,
    hint: () => ({ k: 'crate', parts: [hintTitle('💿 Plattenkiste'), aside('records to dig through'), key('E', 'Dig')] }),
    use: onE((it) => {
      const s = shopOf(it);
      const t = stationOf(it);
      if (!s || !t) return;
      openCrate({
        shop: s.i,
        crate: t.n,
        pick: (r) => {
          const d = DRINK_BY_ID.get(r.id as ShopItemId);
          if (d) serve(s, d);
        },
      });
    }),
  });
  ctx.interactions.define('shoplisten', {
    reach: 2.5,
    hint: () => ({ k: `listen|${!!listening}`, parts: [hintTitle('🎧 Hörstation'), aside(listening ? `${listening.rec.band}: ${listening.rec.title}` : 'headphones on, only you hear it'), key('E', listening ? 'Take them off' : 'Listen')] }),
    use: onE((it) => {
      const s = shopOf(it);
      if (!s) return;
      if (listening) stopListening();
      else listen(s);
    }),
  });
  ctx.interactions.define('shopshelf', {
    reach: 2.5,
    hint: () => ({ k: 'shelf', parts: [hintTitle('📚 Bücherregal'), aside('crime, novels, cookbooks, comics'), key('E', 'Take a book')] }),
    use: onE((it) => {
      const s = shopOf(it);
      if (s) counter(s);
    }),
  });

  // ---- Playing with what you hold: a toy, a book or the paper -------------------------------------
  /** Plays with (or reads) what's in your hand, if it's for that; whether it did. */
  function useHeld(): boolean {
    if (modalOpen() || !onStreet() && !ctx.inOffice()) return false;
    const d = deps.booze().holding(now());
    if (!d) return false;
    if (isToy(d.id)) {
      toys.use(d.id);
      if (d.id === 'papierflieger') deps.booze().letGo();
      return true;
    }
    if (SHOP_ITEM_BY_ID.get(d.id as ShopItemId)?.treat === 'read') {
      openReading(d);
      return true;
    }
    return false;
  }
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyE' || e.repeat || deps.target() || ctx.activities.busy()) return false;
    return useHeld();
  });

  return {
    /** A click with nothing to use: plays with the toy in your hand (input/pointer.ts). */
    useHeld,
    /** The shops whose insides are built now, for checks. */
    open: () => [...open.keys()],
    serve: (i: number, id: string) => {
      const d = DRINK_BY_ID.get(id as ShopItemId);
      if (d) serve(SHOPS[i], d);
    },
    counter: (i: number) => counter(SHOPS[i]),
    sitIn: (i: number, n = 0) => {
      const t = shopRoom(SHOPS[i]).stations.find((x) => x.at === 'chair' && x.n === n);
      if (t) sitIn(SHOPS[i], t);
    },
    listen: (i: number) => listen(SHOPS[i]),
    toys,
  };
}

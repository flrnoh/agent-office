/**
 * flrnoh fork (see FORK.md "Shop fronts"): the shops from outside, on the office's clock. Each frame the
 * fronts (world/town/shopfronts.ts) are told the hour of the office's day: at closing time a shop's
 * shutter comes down, its door locks ("Geschlossen — öffnet um 7:00" at it), what's out front goes in and
 * its sign goes dark; neon stutters on the clock, so everyone sees it at the same moment. The café
 * tables out front are for sitting at: E at a chair sits you down, walking off gets you up. Nobody tells
 * the office: like the cinema's seats, every page sits whoever's still on a chair's spot down in it.
 */
import { SHOP_KIND_BY_ID, SHOPS, shopAt, shopPoint } from '../../../shared/shops';
import { insideShop } from '../../../shared/shop-rooms';
import { opensAt, skyHour } from '../../../shared/shopfronts';
import { OUTSIDE_SEATS, OUTSIDE_SEAT_BY_KEY, type OutsideSeat } from '../../../shared/shop-outside';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';

declare module '../../world/types' {
  interface InteractKinds {
    shopdoor: true;
    cafeseat: true;
  }
}

/** How close to a chair's spot someone must be standing still to be sitting on it. */
const ON_SEAT = 0.22;
/** How near (m) the locked doors and the chairs are offered. */
const REACH = 3;

export function installShopFronts(ctx: Ctx, parts: Pick<Parts, 'peers'>) {
  const fronts = () => ctx.office.town.fronts;
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && Math.abs(ctx.player.pos.y - ctx.player.street) < 1.5;
  /** For a look from the console: this hour of the office's day instead of the clock's. */
  let forced: number | null = null;
  const hour = () => forced ?? (store.sky ? skyHour(store.officeNow(), store.sky.utcOffset) : 12);
  const sitting = new Map<string, Person>();

  // ---- The locked doors --------------------------------------------------------------------------
  ctx.interactions.define('shopdoor', {
    reach: REACH,
    hint: (it) => {
      const s = SHOPS[it.shop ?? -1];
      const k = s && SHOP_KIND_BY_ID.get(s.kind);
      if (!s || !k) return { k: '', parts: [] };
      return { k: `door|${s.i}`, parts: [hintTitle(`🔒 ${k.emoji} ${k.name}`), aside(`Geschlossen — öffnet um ${opensAt(s.kind)}`)] };
    },
    use: onE((it) => {
      const s = SHOPS[it.shop ?? -1];
      if (s) toast(`🔒 Geschlossen — öffnet um ${opensAt(s.kind)}`, 'warn');
    }),
  });

  // ---- The café chairs ---------------------------------------------------------------------------
  const seatAt = (x: number, z: number) => OUTSIDE_SEATS.find((s) => Math.abs(s.x - x) < ON_SEAT && Math.abs(s.z - z) < ON_SEAT);
  function taken(s: OutsideSeat): boolean {
    for (const p of store.peers.values()) {
      if (p.id === store.you || !store.onMyFloor(p) || p.moving) continue;
      if (Math.abs(s.x - p.x) < ON_SEAT && Math.abs(s.z - p.z) < ON_SEAT && Math.abs(ctx.player.street - p.y) < 0.6) return true;
    }
    return false;
  }
  const label = (s: OutsideSeat) => {
    const k = SHOP_KIND_BY_ID.get(SHOPS[s.shop].kind);
    return `🪑 ${k ? `${k.name}, draußen` : 'Draußen sitzen'}`;
  };
  ctx.interactions.define('cafeseat', {
    reach: 2.5,
    hint: (it) => {
      const s = OUTSIDE_SEAT_BY_KEY.get(it.seatId ?? '');
      if (!s) return { k: '', parts: [] };
      if (ctx.player.seat?.seatId === s.key) return { k: `${s.key}|sitting`, parts: [hintTitle(label(s)), aside('watching the street go by'), key('W A S D', 'Get up')] };
      const full = taken(s);
      return { k: `${s.key}|${full}`, parts: [hintTitle(label(s)), full ? aside('taken') : key('E', 'Sit down')] };
    },
    use: onE((it) => {
      const s = OUTSIDE_SEAT_BY_KEY.get(it.seatId ?? '');
      if (!s) return;
      if (ctx.player.seat?.seatId === s.key) {
        ctx.player.stand();
        ctx.player.onStand?.();
        return;
      }
      if (taken(s)) return toast('Somebody’s sitting there', 'warn');
      ctx.player.sit({ key: s.key, seatId: s.key, x: s.x, y: ctx.player.street, z: s.z, rotY: s.rotY, hips: s.hips, out: 0.6 });
      ctx.me.sit(s.hips);
    }),
  });

  // ---- What there is to use: the locked doors and the open cafés' chairs near you -------------------
  const near: Interactable[] = [];
  ctx.usables.add({
    usable: () => {
      near.length = 0;
      if (!onStreet()) return near;
      const p = ctx.player.pos;
      const f = fronts();
      for (const s of SHOPS) {
        if (f.isOpen(s.i)) continue;
        const d = shopPoint(s, s.doorU, -0.6);
        if (Math.abs(d.x - p.x) > REACH || Math.abs(d.z - p.z) > REACH) continue;
        near.push({ kind: 'shopdoor', x: d.x, z: d.z, y: ctx.player.street, radius: 1.3, shop: s.i });
      }
      for (const s of OUTSIDE_SEATS) {
        if (Math.abs(s.x - p.x) > REACH || Math.abs(s.z - p.z) > REACH || !f.isOpen(s.shop)) continue;
        near.push({ kind: 'cafeseat', x: s.x, z: s.z, y: ctx.player.street, radius: 0.5, seatId: s.key });
      }
      return near;
    },
  });

  // ---- Each frame --------------------------------------------------------------------------------
  ctx.ticks.add('world', ({ t, dt }) => {
    if (!ctx.inOffice()) return;
    const p = ctx.player.pos;
    const room = shopAt(p.x, p.z);
    const inside = room && insideShop(room, p.x, p.z, -0.3) ? room.i : -1;
    fronts().update(store.officeNow() / 1000, dt, hour(), ctx.sky.lampsOn, inside);
    void t;
    // A chair whose café has shut: up you get.
    const mine = OUTSIDE_SEAT_BY_KEY.get(ctx.player.seat?.seatId ?? '');
    if (mine && !fronts().isOpen(mine.shop)) {
      ctx.player.stand();
      ctx.player.onStand?.();
    }
    poseOthers(onStreet());
  });

  /** Everyone else on a chair's spot sits down on it, and gets up once they're off it. */
  function poseOthers(here: boolean) {
    const remotes = parts.peers.remotes;
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      const s = here && p && !p.moving && !p.seat && Math.abs(p.y - ctx.player.street) < 0.6 ? seatAt(p.x, p.z) : undefined;
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

  return {
    /** For a look from the console: the shops as at this hour (0–24), or null for the clock's. */
    showHour(h: number | null) {
      forced = h;
    },
    hour,
    stats: () => fronts().stats(),
  };
}

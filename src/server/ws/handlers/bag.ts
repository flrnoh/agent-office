// flrnoh fork (see FORK.md "The rucksack"): putting what you bought in your rucksack, taking it out,
// putting it down somewhere, picking it up again and giving it away. Guests and party guests may do
// all of it (guests.ts, party.ts): it's play. The office keeps what's in each hand (`peer.drink`), so
// it checks what someone stows, drops or gives is what they hold.
import { GIVE_REACH, keepable, slotOf, spotNear, type BagClientMsg, type BagDid, type Spot } from '../../../shared/bag.js';
import type { ShopItemId } from '../../../shared/shopwares.js';
import type { Ctx } from '../../office/context.js';
import { throttle, type Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import type { FeatureHooks, HandlerMap } from './types.js';

/** `c`'s rucksack, to every page they have open; what they asked that's `did` and their `hand`, to this one only. */
function bagTo(ctx: Ctx, c: Client, did?: BagDid, hand?: ShopItemId | null) {
  const key = owner(c);
  const items = ctx.bags.of(key);
  for (const o of ctx.clients.values()) {
    if (o.out || owner(o) !== key) continue;
    ctx.sendTo(o, o === c && did ? { t: 'bag', items, did, ...(hand !== undefined && { hand }) } : { t: 'bag', items });
  }
}

/** What `c` holds now, for everyone. */
function holds(ctx: Ctx, c: Client, item: ShopItemId | null) {
  if (item) c.peer.drink = item;
  else delete c.peer.drink;
  ctx.broadcast({ t: 'peer.act', id: c.id, drink: item }, c.id, true);
}

/** The thing `c` holds, if it's one to keep. */
const heldKeep = (c: Client): ShopItemId | null => (keepable(c.peer.drink) ? c.peer.drink : null);

/** Puts `item` down at `spot` where `c` is, and tells everyone there. False (with a note) when there's no room. */
function putDown(ctx: Ctx, c: Client, item: ShopItemId, spot: Spot): boolean {
  const floor = c.peer.floor;
  if (!floor) return false;
  const key = owner(c);
  const full = ctx.bags.full(floor, key);
  if (full) {
    ctx.warn(c, full);
    return false;
  }
  const p = ctx.bags.place(floor, key, c.peer.name, item, spot);
  for (const o of ctx.clients.values()) if (o.peer.floor === floor) ctx.sendTo(o, { t: 'placed.add', item: ctx.bags.view(p, owner(o)) });
  return true;
}

/** Where `c` stands, as somewhere to put a thing down. */
const feet = (c: Client): Spot => ({ x: c.peer.x, y: c.peer.y, z: c.peer.z, rotY: c.peer.rotY });

export const bagHandlers = {
  'bag.look'(ctx, c) {
    if (!throttle(c, 'bag.look', 200)) return;
    bagTo(ctx, c);
    const floor = c.peer.floor;
    if (floor) ctx.sendTo(c, { t: 'placed', floor, items: ctx.bags.on(floor, owner(c)) });
  },
  'bag.stow'(ctx, c, msg) {
    const item = heldKeep(c);
    if (!item || msg.item !== item) return bagTo(ctx, c);
    if (!ctx.bags.put(owner(c), item)) {
      // Full: put down where they asked (buying something else with this in hand), else it stays in hand.
      const spot = msg.spill && spotNear(msg.spill, c.peer);
      if (!spot) return ctx.warn(c, 'Your rucksack is full'), bagTo(ctx, c);
      if (!putDown(ctx, c, item, spot)) return bagTo(ctx, c);
      holds(ctx, c, null);
      return bagTo(ctx, c, 'drop');
    }
    holds(ctx, c, null);
    // Making way for something just bought (`spill`): that's in their hand already, so the hand isn't theirs to clear.
    bagTo(ctx, c, 'stow', msg.spill ? undefined : null);
  },
  'bag.take'(ctx, c, msg) {
    const key = owner(c);
    const slot = slotOf(msg.slot, ctx.bags.of(key).length);
    if (slot === null) return bagTo(ctx, c);
    const item = ctx.bags.take(key, slot)!;
    const was = heldKeep(c);
    if (was) ctx.bags.put(key, was, slot); // what was in hand takes its place
    holds(ctx, c, item);
    bagTo(ctx, c, 'take', item);
  },
  'bag.drop'(ctx, c, msg) {
    const spot = spotNear(msg.spot, c.peer);
    if (!spot || !throttle(c, 'bag.drop', 250)) return bagTo(ctx, c);
    const key = owner(c);
    if (msg.slot !== undefined) {
      const slot = slotOf(msg.slot, ctx.bags.of(key).length);
      if (slot === null) return bagTo(ctx, c);
      const item = ctx.bags.of(key)[slot];
      if (!putDown(ctx, c, item, spot)) return;
      ctx.bags.take(key, slot);
      return bagTo(ctx, c, 'drop');
    }
    const item = heldKeep(c);
    if (!item || !putDown(ctx, c, item, spot)) return bagTo(ctx, c);
    holds(ctx, c, null);
    bagTo(ctx, c, 'drop', null);
  },
  'bag.pick'(ctx, c, msg) {
    const floor = c.peer.floor;
    const p = floor && typeof msg.id === 'string' ? ctx.bags.find(floor, msg.id) : undefined;
    if (!floor || !p) return;
    if (p.owner !== owner(c)) return ctx.warn(c, `That’s ${p.by}’s: only they can pick it up`);
    if (Math.hypot(p.x - c.peer.x, p.z - c.peer.z) > 4) return;
    // A thing to keep already in hand goes in the rucksack first; with no room for it, this stays put.
    const was = heldKeep(c);
    if (was && !ctx.bags.put(owner(c), was)) return ctx.warn(c, 'Your hands are full and so is your rucksack');
    ctx.bags.pick(floor, p.id, owner(c));
    for (const o of ctx.clients.values()) if (o.peer.floor === floor) ctx.sendTo(o, { t: 'placed.gone', id: p.id });
    holds(ctx, c, p.item);
    bagTo(ctx, c, 'pick', p.item);
  },
  'bag.give'(ctx, c, msg) {
    const to = typeof msg.to === 'string' ? ctx.clients.get(msg.to) : undefined;
    if (!to || to === c || to.out || to.peer.floor !== c.peer.floor || Math.hypot(to.peer.x - c.peer.x, to.peer.z - c.peer.z) > GIVE_REACH) {
      return ctx.warn(c, 'Go a little closer to them to hand it over');
    }
    if (owner(to) === owner(c)) return ctx.warn(c, 'That’s you, on another page');
    if (!throttle(c, 'bag.give', 400)) return;
    const key = owner(c);
    const slot = msg.slot === undefined ? null : slotOf(msg.slot, ctx.bags.of(key).length);
    const item = msg.slot === undefined ? heldKeep(c) : slot === null ? null : ctx.bags.of(key)[slot];
    if (!item) return bagTo(ctx, c);
    if (!ctx.bags.put(owner(to), item)) return ctx.warn(c, `${to.peer.name}’s rucksack is full`);
    if (slot !== null) {
      ctx.bags.take(key, slot);
      bagTo(ctx, c, 'give');
    } else {
      holds(ctx, c, null);
      bagTo(ctx, c, 'give', null);
    }
    bagTo(ctx, to);
    ctx.sendTo(to, { t: 'bag.gift', from: c.peer.name, item });
  },
} satisfies HandlerMap<BagClientMsg>;

/** Leaving the office with a thing to keep in hand: it goes in the rucksack (or down at their feet), so a reload doesn't lose it. */
export const bagHooks: FeatureHooks = {
  closed(ctx, c) {
    const item = heldKeep(c);
    if (item && !ctx.bags.put(owner(c), item)) putDown(ctx, c, item, feet(c));
  },
};

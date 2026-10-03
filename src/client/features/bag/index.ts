import * as THREE from 'three';
import { DROP_REACH, GIVE_REACH, keepable, keptItem, type Spot } from '../../../shared/bag';
import type { ShopItemId } from '../../../shared/shopwares';
import type { Drink } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { modalOpen, toast } from '../../ui/dom';
import type { Booze } from '../bar/booze';
import { openBag, type OpenBag } from './ui';
import { PlacedThings } from './world';

// The rucksack (flrnoh fork, see FORK.md "The rucksack"): what you buy in town that isn't eaten or
// drunk (flowers, books, toys, pets, records, plush, the photo strip) stays in your hand until you put
// it away. Q puts it in your rucksack, Shift+Q puts it down in front of you (on the desk or the
// counter you look at), U opens the rucksack: take a thing in hand, put it down, or give it to someone
// near you. Buying something else with a thing in hand puts that in the rucksack by itself. Things put
// down stay where they are for good, everyone sees them, and E at one of yours picks it up again.

declare module '../../world/types' {
  interface InteractKinds {
    placed: true;
  }
  interface Interactable {
    /** Fork: which thing put down, for 'placed' (features/bag). */
    placedId?: string;
  }
}

export interface BagDeps {
  /** What's in your hand (see features/bar). */
  booze(): Booze;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
}

const CENTER = new THREE.Vector2(0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export function installBag(ctx: Ctx, deps: BagDeps) {
  let items: ShopItemId[] = [];
  let win: OpenBag | null = null;
  /** What to say once the office has done what you asked (it answers with your rucksack). */
  let saying: string | null = null;
  /** What made way for something you just bought, till the office says where it went. */
  let swapped: string | null = null;
  const placed = new PlacedThings();
  ctx.scene.add(placed.root);
  ctx.usables.add({ usable: () => placed.interactables(), pickable: () => placed.root, anywhere: true });

  /** The thing to keep in your hand, if you hold one. */
  function hand(): Drink | null {
    const d = deps.booze().holding(performance.now() / 1000);
    return d && keepable(d.id) ? d : null;
  }

  // ---- Where something goes down ------------------------------------------------------------------

  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const shown = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p === placed.root) return false;
    return (o as THREE.Mesh).isMesh === true;
  };

  /**
   * Where Shift+Q (or ⬇️ in the rucksack) puts a thing: on the top you look at (a desk, a counter, the
   * floor) when it's within reach, else a step ahead of you, on whatever's there. Turned to face you.
   */
  function dropSpot(): Spot {
    const p = ctx.player.pos;
    const facing = ctx.player.facing;
    const rotY = facing + Math.PI;
    if (ctx.player.view === 'first') {
      ray.setFromCamera(CENTER, ctx.camera);
      ray.far = 3.5;
      for (const hit of ray.intersectObject(ctx.scene, true)) {
        if (!shown(hit.object)) continue;
        if (!hit.face) break;
        normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        const q = hit.point;
        if (normal.y > 0.7 && Math.hypot(q.x - p.x, q.z - p.z) <= DROP_REACH && q.y > p.y - 1 && q.y < p.y + 2) return { x: q.x, y: q.y, z: q.z, rotY };
        break;
      }
    }
    const x = p.x + Math.sin(facing) * 0.8;
    const z = p.z + Math.cos(facing) * 0.8;
    ray.set(from.set(x, p.y + 1.4, z), DOWN);
    ray.far = 2;
    for (const hit of ray.intersectObject(ctx.scene, true)) {
      if (!shown(hit.object) || hit.point.y < p.y - 0.4 || hit.point.y > p.y + 1.35) continue;
      return { x, y: hit.point.y, z, rotY };
    }
    return { x, y: p.y, z, rotY };
  }

  // ---- Asking the office -------------------------------------------------------------------------

  function stow() {
    const d = hand();
    if (!d) return toast('🎒 Nothing in your hand to put away', 'warn');
    saying = `🎒 ${d.emoji} ${d.name} is in your rucksack`;
    ctx.net.send({ t: 'bag.stow', item: d.id as ShopItemId });
  }
  function take(slot: number) {
    const id = items[slot];
    if (!id) return;
    saying = `✋ ${keptItem(id).emoji} ${keptItem(id).name} in hand`;
    deps.reach();
    ctx.net.send({ t: 'bag.take', slot });
  }
  function drop(slot?: number) {
    const id = slot === undefined ? (hand()?.id as ShopItemId | undefined) : items[slot];
    if (!id) return toast('Nothing in your hand to put down', 'warn');
    if (ctx.trip()) return toast('Wait till you’re there', 'warn');
    saying = `⬇️ ${keptItem(id).emoji} ${keptItem(id).name} stays here. E picks it up again`;
    deps.reach();
    ctx.net.send(slot === undefined ? { t: 'bag.drop', spot: dropSpot() } : { t: 'bag.drop', spot: dropSpot(), slot });
  }
  function give(to: string, slot?: number) {
    const id = slot === undefined ? (hand()?.id as ShopItemId | undefined) : items[slot];
    if (!id) return;
    saying = `🎁 You gave ${store.peers.get(to)?.name ?? 'them'} ${keptItem(id).emoji} ${keptItem(id).name}`;
    deps.reach();
    ctx.net.send(slot === undefined ? { t: 'bag.give', to } : { t: 'bag.give', to, slot });
  }
  /** People near enough to hand something to. */
  function near() {
    const p = ctx.player.pos;
    return [...store.peers.values()]
      .filter((o) => o.id !== store.you && store.onMyFloor(o) && Math.hypot(o.x - p.x, o.z - p.z) <= GIVE_REACH)
      .map((o) => ({ id: o.id, name: o.name }));
  }

  function showBag() {
    win?.close();
    win = openBag({ items: () => items, hand: () => (hand()?.id as ShopItemId | undefined) ?? null, near, stow, take, drop, give });
  }

  // Buying something else with a thing in hand: it goes in the rucksack (or down here, if that's full).
  deps.booze().onSwap = (was) => {
    swapped = `${was.emoji} ${was.name}`;
    ctx.net.send({ t: 'act', drink: was.id }); // (bought a moment ago: the office may not know it's in hand yet)
    ctx.net.send({ t: 'bag.stow', item: was.id as ShopItemId, spill: dropSpot() });
  };

  // ---- Keys --------------------------------------------------------------------------------------

  // Q (before the office's own Q, which is for an issue card): away in the rucksack; Shift+Q: put down.
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyQ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (!hand() || ctx.carrying() || ctx.holdingBall() || ctx.activities.busy() || modalOpen()) return false;
    if (e.shiftKey) drop();
    else stow();
    return true;
  });
  ctx.keys.bind({ code: 'KeyU', run: () => showBag() });

  ctx.interactions.define('placed', {
    reach: 3,
    hint: (it) => {
      const v = placed.get(it.placedId);
      if (!v) return { k: 'placed', parts: [] };
      const item = keptItem(v.item);
      return {
        k: `placed|${v.id}|${v.mine}`,
        parts: [hintTitle(`${item.emoji} ${item.name}`), aside(v.mine ? 'yours, put down here' : `${v.by}’s`), ...(v.mine ? [key('E', 'Pick up')] : [])],
      };
    },
    use: onE((it) => {
      const v = placed.get(it.placedId);
      if (!v) return;
      if (!v.mine) return toast(`${keptItem(v.item).emoji} That’s ${v.by}’s: only they can pick it up`);
      saying = `✋ ${keptItem(v.item).emoji} ${keptItem(v.item).name} picked up`;
      ctx.net.send({ t: 'bag.pick', id: v.id });
    }),
  });

  // ---- What the office says ------------------------------------------------------------------------

  ctx.messages.on('bag', (msg) => {
    items = msg.items;
    if (msg.hand !== undefined) deps.booze().hold(msg.hand ? keptItem(msg.hand) : null);
    if (msg.did && swapped) {
      toast(msg.did === 'stow' ? `🎒 ${swapped} went in your rucksack` : `🎒 Your rucksack is full: ${swapped} stays here. E picks it up again`);
      swapped = null;
    } else if (msg.did) {
      ctx.sound.paper();
      if (saying) toast(saying);
      saying = null;
    }
    win?.refresh();
    ctx.hint.invalidate();
  });
  ctx.messages.on('bag.gift', (msg) => {
    const item = keptItem(msg.item);
    ctx.sound.paper();
    toast(`🎁 ${msg.from} gave you ${item.emoji} ${item.name}: it’s in your rucksack (U)`);
  });
  ctx.messages.on('placed', (msg) => {
    if (msg.floor === store.floor) placed.set(msg.items);
    ctx.hint.invalidate();
  });
  ctx.messages.on('placed.add', (msg) => {
    placed.add(msg.item);
    ctx.hint.invalidate();
  });
  ctx.messages.on('placed.gone', (msg) => {
    placed.remove(msg.id);
    ctx.hint.invalidate();
  });
  // Arriving anywhere (or back after a reload): your rucksack, and what stands here.
  ctx.messages.onAny((msg) => {
    if (msg.t !== 'welcome' && msg.t !== 'floor.enter') return;
    placed.set([]);
    ctx.net.send({ t: 'bag.look' });
  });

  ctx.ticks.add('world', ({ dt }) => placed.update(dt));

  return { showBag, items: () => items };
}

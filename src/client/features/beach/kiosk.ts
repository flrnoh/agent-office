import type { KioskItem } from '../../../shared/kiosk';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import { toast } from '../../ui/dom';
import { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import type { KioskSpot } from '../../world/scenic/kiosk';
import { G } from '../../world/scenic/kit';
import type { Booze } from '../bar/booze';
import { openKiosk } from './ui';

// The snack shack on the beach, open (flrnoh fork, see FORK.md "A day at the beach"): Uschi behind the
// counter, keeping an eye on whoever comes up, and E at the counter for the menu (ui.ts). What you
// order she hands over with a word and a ding of the bell; it's held like the fridge's things (see
// shared/kiosk.ts), and some of it does a little something to you: ice cream's brain freeze, the
// Currywurst's heat, a seagull after your fries.

declare module '../../world/types' {
  interface InteractKinds {
    kiosk: true;
  }
}

export interface KioskDeps {
  booze(): Booze;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
  /** Down on your floor's street, where the beach is (not up on the roof, in a place, or on a trip). */
  onStreet(): boolean;
}

export function beachKiosk(ctx: Ctx, deps: KioskDeps) {
  const spot = (): KioskSpot | undefined => ctx.office.scenic?.kiosk;
  const it: Interactable = { kind: 'kiosk', x: 0, z: 0, y: 0, radius: 2.6 };
  let uschi: Person | null = null;
  const timers: number[] = [];

  /** Uschi, made the first time the beach is near: behind the counter, in the scenic loop's group (she goes down with the street). */
  function vendor(s: KioskSpot): Person {
    if (uschi) return uschi;
    const p = new Person('Uschi', '#ff8fab', { skin: 2, hair: 3, style: 5 });
    // On the duckboard behind the counter, so she can see over it.
    p.root.position.set(s.vendor.x, G + 0.3, s.vendor.z);
    p.root.rotation.y = s.vendor.rotY;
    // Her name tag would sit up in the roof: the sign over the counter says whose kiosk it is.
    p.showLabel(false);
    noOutline(p.root);
    ctx.office.scenic.group.add(p.root);
    return (uschi = p);
  }

  ctx.usables.add({ usable: () => (deps.onStreet() && spot() ? [it] : []) });

  ctx.ticks.add('world', ({ dt, t }) => {
    const s = spot();
    if (!s || !deps.onStreet()) return;
    Object.assign(it, { x: s.counter.x, z: s.counter.z, y: ctx.player.street });
    const p = ctx.player.pos;
    const far = Math.hypot(p.x - s.x, p.z - s.z);
    if (far > 160 && !uschi) return;
    const u = vendor(s);
    u.root.visible = far < 160;
    if (!u.root.visible) return;
    // She turns a little toward whoever's at the counter, and back to the road otherwise.
    const look = far < 9 ? Math.atan2(p.x - s.vendor.x, p.z - s.vendor.z) : s.vendor.rotY;
    const turn = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(look - s.vendor.rotY), Math.cos(look - s.vendor.rotY))));
    const want = s.vendor.rotY + turn;
    u.root.rotation.y += Math.atan2(Math.sin(want - u.root.rotation.y), Math.cos(want - u.root.rotation.y)) * Math.min(1, dt * 3);
    u.update(dt, t, false, false);
  });

  function soundAt(): { x: number; y: number; z: number } {
    const s = spot()!;
    return { x: s.hatch.x, y: ctx.player.street + 1.2, z: s.hatch.z };
  }

  /** Over the counter and into your hand, with whatever it does to you after. */
  function order(d: KioskItem) {
    const s = spot();
    if (!s) return;
    const at = soundAt();
    ctx.sound.beach('bell', at);
    if (d.glass === 'fries' || d.glass === 'currywurst' || d.glass === 'fishroll') ctx.sound.beach('sizzle', at);
    uschi?.reach();
    uschi?.say(d.says, 3);
    timers.push(
      window.setTimeout(() => {
        const now = performance.now() / 1000;
        deps.booze().drink(d, now);
        deps.reach();
        if (d.glass === 'radlercan') ctx.sound.opener('can');
        else if (d.glass === 'coconut' || d.glass === 'slush' || d.glass === 'icetea') ctx.sound.beach('slurp', at);
        else ctx.sound.opener('bite');
        if (ctx.player.view === 'first') ctx.hands.sip();
        toast(`${d.emoji} ${d.name}. ${d.says}`);
        treat(d);
      }, 650),
    );
  }

  /** What it does to you, a moment after the first bite. */
  function treat(d: KioskItem) {
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const me = ctx.player.pos;
    switch (d.treat) {
      case 'brainfreeze':
        later(2400, () => {
          ctx.shake(0.45, true);
          ctx.me.say('🥶 Brain freeze!', 2.5);
          toast('🥶 Brain freeze! Slower next time…');
        });
        return;
      case 'spicy':
        later(2000, () => {
          ctx.shake(0.25);
          ctx.me.say('🔥 Scharf!', 2.5);
          toast('🔥 Mit scharf indeed: your ears are glowing');
        });
        return;
      case 'seagull':
        if (Math.random() < 0.5) return;
        later(3000, () => {
          ctx.sound.beach('gull', { x: me.x + 3, y: me.y + 6, z: me.z });
          toast('🐦 A seagull swoops past… and misses. Hold on tight!');
        });
        return;
      case 'tropical':
        later(1500, () => {
          ctx.sound.beach('gull', { x: me.x - 10, y: me.y + 8, z: me.z + 6 });
          toast('🏝️ Urlaubsfeeling. Is that the sea calling?');
        });
        return;
    }
  }

  ctx.interactions.define('kiosk', {
    reach: 3,
    hint: () => {
      const cut = deps.booze().cutOff(performance.now() / 1000);
      return { k: `kiosk|${cut}`, parts: [hintTitle('🍟 Kiosk zur Möwe'), aside('Uschi’s frying · fries, Currywurst, ice cream'), key('E', 'Order')] };
    },
    use: onE(() => {
      if (!spot()) return;
      ctx.sound.beach('bell', soundAt(), 0.5);
      openKiosk({ cutOff: deps.booze().cutOff(performance.now() / 1000), order });
    }),
  });

  return {
    /** Uschi, once she's there (for screenshots). */
    vendor: () => uschi,
    order,
  };
}

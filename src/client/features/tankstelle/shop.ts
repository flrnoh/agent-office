import type { TankItem } from '../../../shared/tankshop';
import { CASHIER, COUNTER } from '../../../shared/tankstelle';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import { toast } from '../../ui/dom';
import { Person } from '../../world/character';
import { G, hitBox } from '../../world/tankstelle/kit';
import type { Interactable } from '../../world/types';
import type { Booze } from '../bar/booze';
import type { Caffeine } from '../coffee/caffeine';
import { openTankShop } from './ui';

// The petrol station's shop (flrnoh fork, see FORK.md "The petrol station"): Jacqueline behind the
// counter, keeping an eye on whoever comes in, and E at the counter for the till (ui.ts). What you
// pick she scans (beep), rings up (ka-ching, all on the house) and hands over: held like the kitchen
// fridge's things, a coffee with the kitchen machine's buzz, the energy drink a jolt of it.

declare module '../../world/types' {
  interface InteractKinds {
    tankshop: true;
  }
}

export interface TankShopDeps {
  booze(): Booze;
  caffeine(): Caffeine;
  reach(): void;
  onStreet(): boolean;
}

export function tankShop(ctx: Ctx, deps: TankShopDeps) {
  const it: Interactable = { kind: 'tankshop', x: (COUNTER.minX + COUNTER.maxX) / 2, z: COUNTER.maxZ + 0.3, y: 0, radius: 2.4 };
  let cashier: Person | null = null;
  const timers: number[] = [];

  /** The cashier, made the first time you're near: behind the counter, in the station's group (she goes down with the street). */
  function vendor(): Person {
    if (cashier) return cashier;
    const p = new Person('Jacqueline', '#0b7a83', { skin: 1, hair: 6, style: 2 });
    p.root.position.set(CASHIER.x, G, CASHIER.z);
    p.root.rotation.y = CASHIER.rotY;
    p.showLabel(false);
    noOutline(p.root);
    ctx.office.tankstelle.group.add(p.root);
    return (cashier = p);
  }

  ctx.usables.add({ usable: () => (deps.onStreet() ? [it] : []) });
  // Aimed at in first person: the counter, the till on it, and the cashier over it.
  hitBox(ctx.office.tankstelle.group, { ...COUNTER, minZ: COUNTER.minZ - 1.4 }, 2, it);

  ctx.ticks.add('world', ({ dt, t }) => {
    if (!deps.onStreet()) return;
    it.y = ctx.player.street;
    const p = ctx.player.pos;
    const far = Math.hypot(p.x - CASHIER.x, p.z - CASHIER.z);
    if (far > 120 && !cashier) return;
    const u = vendor();
    u.root.visible = far < 120;
    if (!u.root.visible) return;
    // She looks up at whoever's at the counter, else out of the window.
    const look = far < 8 ? Math.atan2(p.x - CASHIER.x, p.z - CASHIER.z) : CASHIER.rotY;
    const turn = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(look - CASHIER.rotY), Math.cos(look - CASHIER.rotY))));
    const want = CASHIER.rotY + turn;
    u.root.rotation.y += Math.atan2(Math.sin(want - u.root.rotation.y), Math.cos(want - u.root.rotation.y)) * Math.min(1, dt * 3);
    u.update(dt, t, false, false);
  });

  const at = () => ({ x: it.x, y: ctx.player.street + 1.1, z: COUNTER.minZ });

  /** Scanned, rung up and handed over the counter, with whatever it does to you. */
  function order(d: TankItem) {
    const where = at();
    ctx.sound.tankstelle('beep', where);
    cashier?.reach();
    cashier?.say(d.says, 3);
    timers.push(
      window.setTimeout(() => ctx.sound.tankstelle('till', where), 350),
      window.setTimeout(() => {
        const now = performance.now() / 1000;
        deps.booze().drink(d, now);
        const caffeine = deps.caffeine();
        let jittery = false;
        if (d.coffee) jittery = caffeine.drink(now);
        else caffeine.top(now, d.caffeine);
        deps.reach();
        if (d.glass === 'tallcan') ctx.sound.opener('can');
        else if (d.bites) ctx.sound.opener('bite');
        if (ctx.player.view === 'first') ctx.hands.sip();
        if (jittery) toast(`${d.emoji} ${d.name}… one cup too many, you’ve got the jitters!`, 'warn');
        else toast(`${d.emoji} ${d.name}. ${d.says}${d.coffee ? ' · a minute of quicker feet' : ''}`);
      }, 800),
    );
  }

  ctx.interactions.define('tankshop', {
    reach: 3,
    hint: () => ({ k: 'tankshop', parts: [hintTitle('🛒 Shop counter'), aside('Kaffee, Bockwurst, Chips, the paper'), key('E', 'Buy something')] }),
    use: onE(() => {
      ctx.sound.tankstelle('beep', at());
      openTankShop({ order });
    }),
  });

  return {
    /** The cashier, once she's there (for screenshots). */
    cashier: () => cashier,
    order,
  };
}

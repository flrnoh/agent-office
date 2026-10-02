import { SHOPS, SHOP_KIND_BY_ID } from '../../../shared/shops';
import { shopRoom, stationAt } from '../../../shared/shop-rooms';
import { WASH_SECONDS, busyMachine } from '../../../shared/ride';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';
import { startWash, washLeft } from '../shops/decor-ride';
import { openShopMenu } from '../shops/ui';

// The laundromat (flrnoh fork, see FORK.md "Shops to walk into"): E at a free washing machine starts
// a wash (its drum churns and spins, the lamp's green, it rumbles; done in WASH_SECONDS, with a ding),
// E at the vending machine gets you a drink or a snack. The plastic chairs are shop chairs (features/
// shops): sit and wait.

declare module '../../world/types' {
  interface InteractKinds {
    shopwasher: true;
    shopvending: true;
  }
}

const VENDING = ['cola', 'spezi', 'mate', 'chocolate', 'crisps', 'gummibaerchen'] as const;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) === 60 ? 0 : Math.ceil(s % 60)).padStart(2, '0')}`;

export function openLaundromat(ctx: Ctx, deps: { serve(shop: number, id: string): void }) {
  const machine = (it: Interactable) => {
    const s = it.shop !== undefined ? SHOPS[it.shop] : undefined;
    const t = s && it.station !== undefined ? shopRoom(s).stations[it.station] : undefined;
    return s && t ? { s, t } : null;
  };
  ctx.interactions.define('shopwasher', {
    reach: 2.0,
    hint: (it) => {
      const m = machine(it);
      if (!m) return { k: '', parts: [] };
      const left = washLeft(m.s.i, m.t.n);
      const theirs = !left && busyMachine(m.s.i, m.t.n, Date.now());
      return {
        k: `washer|${it.shop}|${m.t.n}|${Math.ceil(left)}|${theirs}`,
        parts: [hintTitle(`🫧 Waschmaschine ${m.t.n + 1}`), aside(left ? `your wash · ${clock(left)} to go` : theirs ? 'somebody’s wash is going round' : 'free · 60°, Buntwäsche'), ...(left || theirs ? [] : [key('E', 'Start a wash')])],
      };
    },
    use: onE((it) => {
      const m = machine(it);
      if (!m) return;
      if (washLeft(m.s.i, m.t.n) || busyMachine(m.s.i, m.t.n, Date.now())) return toast('That one’s running. Try a free one (the lamp’s off)', 'warn');
      startWash(m.s.i, m.t.n, Date.now() + WASH_SECONDS * 1000);
      const w = stationAt(m.s, m.t);
      const at = { x: w.x, y: ctx.player.street + 0.5, z: w.z };
      ctx.sound.ride('coin', at);
      window.setTimeout(() => ctx.sound.ride('wash', at), 400);
      toast(`🫧 Washing: ${WASH_SECONDS} seconds. Have a seat on a plastic chair`);
      window.setTimeout(() => {
        ctx.sound.ride('ding', at);
        toast(`👕 Your wash in machine ${m.t.n + 1} is done. Fresh!`);
      }, WASH_SECONDS * 1000);
    }),
  });
  ctx.interactions.define('shopvending', {
    reach: 2.2,
    hint: () => ({ k: 'vending', parts: [hintTitle('🥤 Automat'), aside('drinks and snacks, on the house'), key('E', 'Pick something')] }),
    use: onE((it) => {
      const s = it.shop !== undefined ? SHOPS[it.shop] : undefined;
      if (!s) return;
      const k = SHOP_KIND_BY_ID.get(s.kind)!;
      const w = stationAt(s, shopRoom(s).stations[it.station ?? 0]);
      ctx.sound.ride('coin', { x: w.x, y: ctx.player.street + 1, z: w.z });
      openShopMenu({ kind: { ...k, name: 'Automat', emoji: '🥤' }, keeper: 'The machine', items: VENDING, cutOff: false, order: (d) => deps.serve(s.i, d.id) });
    }),
  });
}

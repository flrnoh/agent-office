import { SOLIDS, localPoint, onBaumarkt, rectHits } from '../../../shared/baumarkt';
import { CORRAL, TROLLEY, TROLLEY_COUNT } from '../../../shared/baumarkt-play';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { h, toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';

// The shopping trolleys at the Baumarkt (flrnoh fork, see FORK.md "The Baumarkt"): E at one (in the
// corral by the doors, or wherever someone left it) and you push it about in front of you; E or Q lets
// go, and by the corral it rolls back into its slot. It stays on the block. Everyone on the floor sees
// it go, the office keeps who has which and where it was left.

declare module '../../world/types' {
  interface InteractKinds {
    trolley: true;
  }
  interface Interactable {
    /** Fork: which of the Baumarkt's trolleys (shared/baumarkt-play.ts), for a 'trolley'. */
    trolley?: number;
  }
}

const SEND_EVERY = 0.08;

export function trolleyPushing(ctx: Ctx, deps: { onStreet(): boolean }) {
  let pushing: number | null = null;
  let pending = 0;
  let clock = 0;
  let sent = { at: -Infinity, x: 0, z: 0, rotY: 0 };
  const its: Interactable[] = Array.from({ length: TROLLEY_COUNT }, (_, i) => ({ kind: 'trolley', x: 0, z: 0, y: 0, radius: 1.5, trolley: i }));

  ctx.usables.add({
    usable: () => {
      if (!deps.onStreet() || pushing !== null) return [];
      const ts = store.baumarkt.trolleys;
      return its.filter((it) => {
        const t = ts[it.trolley!];
        // Someone else's trolley isn't yours to take (nor to aim at).
        it.off = !t || !!t.by;
        if (it.off) return false;
        Object.assign(it, { x: t!.x, z: t!.z, y: ctx.player.street });
        return true;
      });
    },
  });

  function grab(i: number) {
    const t = store.baumarkt.trolleys[i];
    if (!t || t.by || pushing !== null || ctx.trip()) return;
    if (ctx.carrying()) return toast('🗂️ Your hands are full: put the card back first (Q)', 'warn');
    ctx.activities.stopAll('start');
    pushing = i;
    t.by = store.you;
    pending++;
    ctx.net.send({ t: 'bm.trolley.grab', i });
    ctx.sound.baumarkt('rattle', { x: t.x, y: ctx.player.street + 0.6, z: t.z });
    ctx.hint.invalidate();
  }

  function letGo(tell = true) {
    if (pushing === null) return;
    const t = store.baumarkt.trolleys[pushing];
    if (t && t.by === store.you) t.by = null;
    pushing = null;
    if (tell) {
      pending++;
      ctx.net.send({ t: 'bm.trolley.let' });
      if (t && Math.hypot(t.x - CORRAL.x, t.z - CORRAL.z) < 3.2) ctx.sound.baumarkt('rattle', { x: CORRAL.x, y: ctx.player.street + 0.6, z: CORRAL.z });
    }
    ctx.hint.invalidate();
  }

  ctx.interactions.define('trolley', {
    reach: 1.8,
    hint: () => ({ k: 'trolley', parts: [hintTitle('🛒 Einkaufswagen'), aside('no coin needed'), key('E', 'Push it')] }),
    use: onE((it) => {
      if (it.trolley !== undefined) grab(it.trolley);
    }),
  });

  ctx.activities.add({
    id: 'trolley',
    active: () => pushing !== null,
    stop: () => letGo(),
    key: (e) => {
      if (e.code !== 'KeyE' && e.code !== 'KeyQ') return false;
      if (!e.repeat) letGo();
      return true;
    },
    hint: (el) => ctx.hint.draw(el, 'trolley-push', () => [h('span.title', {}, '🛒 Einkaufswagen'), aside('push it about · back in the corral by the doors'), key('W A S D', 'Push'), key('E', 'Let go')]),
  });

  /** In front of you as you go, square to where you're facing, a little closer when something's in the way. */
  ctx.ticks.add('moved', ({ dt }) => {
    clock += dt;
    if (pushing === null) return;
    const t = store.baumarkt.trolleys[pushing];
    const p = ctx.player;
    if (!t || !deps.onStreet()) return letGo();
    const facing = { x: p.pos.x, z: p.pos.z, rotY: p.facing };
    let at = localPoint(facing, 0, TROLLEY.AHEAD);
    for (const ahead of [TROLLEY.AHEAD, 0.8, 0.65]) {
      at = localPoint(facing, 0, ahead);
      if (!SOLIDS.some((b) => rectHits({ ...at, rotY: p.facing }, TROLLEY.HALF_W, TROLLEY.HALF_L, b))) break;
    }
    if (!onBaumarkt(at.x, at.z, 0.8)) {
      toast('🛒 The trolley stays at the Baumarkt', 'warn');
      return letGo();
    }
    Object.assign(t, { x: at.x, z: at.z, rotY: p.facing });
    const moved = Math.abs(at.x - sent.x) + Math.abs(at.z - sent.z) > 0.02 || Math.abs(p.facing - sent.rotY) > 0.01;
    if (moved && clock - sent.at > SEND_EVERY) {
      sent = { at: clock, x: at.x, z: at.z, rotY: p.facing };
      ctx.net.send({ t: 'bm.trolley.push', i: pushing, x: at.x, z: at.z, rotY: p.facing });
    }
  });

  ctx.messages.on('baumarkt', (msg) => {
    if (msg.answer) pending = Math.max(0, pending - 1);
    if (pending > 0 || pushing === null) return;
    const t = store.baumarkt.trolleys[pushing];
    if (t?.by !== store.you) {
      toast('🛒 Someone else grabbed that trolley first', 'warn');
      letGo(false);
    }
  });
  ctx.messages.onAny((msg) => {
    if (msg.t === 'welcome' || msg.t === 'floor.enter') {
      pushing = null;
      pending = 0;
    }
  });

  return { pushing: () => pushing, letGo, grab, interactables: its };
}

// flrnoh fork (see FORK.md "Shops to walk into"): the Spielhalle's claw machine and the Post's
// postcards. Guests and party guests may do all of it (guests.ts, party.ts): it's play.
import { CLAW_EVERY, clawDrop, clawGrab, clawPile, type ClawClientMsg, type PostClientMsg } from '../../../shared/funshops.js';
import type { Ctx } from '../../office/context.js';
import { throttle, type Client } from '../../office/client.js';
import { owner } from '../../fork/office.js';
import { postRecipients } from '../../postcards.js';
import type { HandlerMap } from './types.js';

/** Who `c` may send a card to now. */
function recipientsOf(ctx: Ctx, c: Client) {
  const seen = new Set<string>();
  const online: { key: string; name: string }[] = [];
  for (const o of ctx.clients.values()) {
    const key = owner(o);
    if (o.out || seen.has(key)) continue;
    seen.add(key);
    online.push({ key, name: o.peer.name });
  }
  const accounts = ctx.accounts.state(new Set()).accounts.map((a) => ({ id: a.id, name: a.name }));
  return postRecipients({ me: owner(c), party: c.party, accounts, online });
}

/** Hands `key` the cards waiting for them, on every page they have open. */
function deliver(ctx: Ctx, key: string) {
  const to = [...ctx.clients.values()].filter((o) => !o.out && owner(o) === key);
  if (!to.length) return;
  const cards = ctx.postcards.collect(key);
  if (cards.length) for (const o of to) ctx.sendTo(o, { t: 'post.cards', cards });
}

export const funshopHandlers = {
  'claw.drop'(ctx, c, msg) {
    // A drop in a Spielhalle's claw machine: the office rolls, everyone near sees the claw go.
    const d = clawDrop(msg);
    if (!d || !throttle(c, 'claw', CLAW_EVERY * 1000 - 300)) return;
    const { won } = clawGrab(clawPile(d.shop), d.x, d.z, Math.random());
    const m = {
      t: 'claw' as const,
      id: c.id,
      name: c.peer.name,
      shop: d.shop,
      x: d.x,
      z: d.z,
      won,
    };
    ctx.sendTo(c, m);
    ctx.toNeighbors(c, m);
  },
  'post.recipients'(ctx, c) {
    if (!throttle(c, 'post.recipients', 500)) return;
    ctx.sendTo(c, {
      t: 'post.recipients',
      list: recipientsOf(ctx, c),
      left: ctx.postcards.left(owner(c)),
    });
  },
  'post.send'(ctx, c, msg) {
    if (!throttle(c, 'post.send', 1500)) return ctx.warn(c, 'One card at a time, the post office is busy');
    const to = recipientsOf(ctx, c).find((r) => r.key === msg.to);
    const card = ctx.postcards.send({ key: owner(c), name: c.peer.name }, to, msg.motif, msg.text);
    if ('error' in card) return ctx.warn(c, card.error);
    ctx.sendTo(c, {
      t: 'post.sent',
      to: card.to,
      left: ctx.postcards.left(owner(c)),
    });
    deliver(ctx, card.toKey);
  },
  'post.check'(ctx, c) {
    if (!throttle(c, 'post.check', 2000)) return;
    deliver(ctx, owner(c));
  },
} satisfies HandlerMap<ClawClientMsg | PostClientMsg>;

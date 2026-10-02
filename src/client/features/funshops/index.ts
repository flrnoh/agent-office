/**
 * flrnoh fork (see FORK.md "Shops to walk into"): two more kinds of shop in the city. The SPIELHALLE:
 * the office's own arcade cabinets in a row (BLOCKFALL, for you alone: blockfall.ts), a claw machine
 * (claw.ts: you aim, the office rolls, everyone near sees the claw go, a plush for your hand) and a
 * photo booth (booth.ts: four shots of you in poses you pick, a strip to download and to hold). The
 * POST: write a postcard of the city at the counter to anyone the office knows (post.ts); cards for
 * you come as a toast and a window, at once when you're in, else the next time you are.
 * The shops' own feature (features/shops) builds the rooms (decor.ts here draws what's in these two)
 * and hands the counters over (`special`).
 */
import { EmoteBucket, type EmoteId } from '../../../shared/emotes';
import { PLUSH_BY_ID, type ClawServerMsg, type Postcard, type Recipient } from '../../../shared/funshops';
import { SHOPS, shopPoint, type Shop } from '../../../shared/shops';
import { insideShop, shopRoom } from '../../../shared/shop-rooms';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { openBlockfall } from './blockfall';
import { openBooth } from './booth';
import { openClaw } from './claw';
import { boothDrawn, clawRuns } from './motion';
import { openPostcard, openPostcardWriter } from './post';

declare module '../../world/types' {
  interface InteractKinds {
    shopcabinet: true;
    shopclaw: true;
    shopbooth: true;
    shoppobox: true;
  }
}

export interface FunShopsDeps {
  /** Hands over shop `i`'s thing `id` like its counter would (features/shops). */
  serve(i: number, id: string): void;
  /** The keeper behind shop `i`'s counter, while its inside is built. */
  keeper(i: number): Person | undefined;
}

export function installFunShops(ctx: Ctx, deps: FunShopsDeps) {
  const shopOf = (it: Interactable): Shop | undefined => (it.shop !== undefined ? SHOPS[it.shop] : undefined);
  const near = (s: Shop) => {
    const c = shopPoint(s, s.len / 2, s.depth / 2);
    return { x: c.x, y: ctx.player.street + 1.2, z: c.z };
  };

  // ---- The Spielhalle: cabinets, the claw machine, the photo booth -------------------------------
  ctx.interactions.define('shopcabinet', {
    reach: 2.2,
    hint: () => ({
      k: 'cabinet-hall',
      parts: [hintTitle('🕹️ BLOCKFALL'), aside('the office’s own game, just for you'), key('E', 'Play')],
    }),
    use: onE(() => openBlockfall({ sound: (kind, lines) => ctx.sound.arcade(kind, lines) })),
  });

  /** The claw window you have open, to hand the office's answer to. */
  let claw: { shop: number; answered(won: ClawServerMsg['won']): void } | null = null;
  ctx.interactions.define('shopclaw', {
    reach: 2.2,
    hint: () => ({
      k: 'claw',
      parts: [hintTitle('🧸 Greifautomat'), aside('plush toys, if the claw holds'), key('E', 'Play')],
    }),
    use: onE((it) => {
      const s = shopOf(it);
      if (s) playClaw(s);
    }),
  });
  function playClaw(s: Shop) {
    const w = openClaw({
      shop: s.i,
      drop: (x, z) => ctx.net.send({ t: 'claw.drop', shop: s.i, x, z }),
      won: (id) => {
        deps.serve(s.i, id);
        deps.keeper(s.i)?.say('Na also! Glückwunsch!', 3);
      },
      sound: (kind) => {
        if (kind === 'drop') ctx.sound.shop('whoosh', near(s));
        else if (kind === 'win') ctx.sound.shop('squeak', near(s));
        else if (kind === 'miss') ctx.sound.shop('pop', near(s));
      },
    });
    claw = { shop: s.i, answered: w.answered };
  }
  // Someone's drop: the claw moves on every page near it; the player's window hears the answer.
  ctx.messages.on('claw', (msg) => {
    const now = performance.now() / 1000;
    if (msg.id === store.you) return claw?.shop === msg.shop ? claw.answered(msg.won) : undefined;
    const prev = clawRuns.get(msg.shop);
    clawRuns.set(msg.shop, {
      x: msg.x,
      z: msg.z,
      fromX: prev?.x ?? 0.14,
      fromZ: prev?.z ?? 0.14,
      t0: now,
      won: msg.won,
    });
    const s = SHOPS[msg.shop];
    const p = ctx.player.pos;
    if (msg.won && s && insideShop(s, p.x, p.z)) window.setTimeout(() => toast(`🧸 ${msg.name} won a ${PLUSH_BY_ID.get(msg.won!)?.name ?? 'plush'}!`), 4800);
  });

  const emotes = new EmoteBucket();
  ctx.interactions.define('shopbooth', {
    reach: 1.8,
    hint: (it) => ({
      k: `booth|${boothDrawn.has(it.shop ?? -1)}`,
      parts: [hintTitle('📸 Fotoautomat'), aside('four photos, a strip to take home'), key('E', 'Step in')],
    }),
    use: onE((it) => {
      const s = shopOf(it);
      if (s) stepIn(s);
    }),
  });
  function stepIn(s: Shop) {
    if (boothDrawn.has(s.i)) return;
    boothDrawn.add(s.i);
    ctx.sound.shop('whoosh', near(s));
    openBooth({
      name: store.profile.name,
      color: store.profile.color,
      look: store.profile.look,
      pose: (id: EmoteId) => {
        if (!emotes.take(performance.now())) return;
        ctx.me.emote(id);
        ctx.net.send({ t: 'emote', emote: id });
      },
      shutter: () => ctx.sound.shop('pop', near(s)),
      done: () => {
        deps.serve(s.i, 'fotostreifen');
        toast('📸 Your photo strip: download it, or just carry it about');
      },
      closed: () => boothDrawn.delete(s.i),
    });
  }

  // ---- The Post ------------------------------------------------------------------------------------
  let asked: ((r: { list: Recipient[]; left: number }) => void) | null = null;
  ctx.messages.on('post.recipients', (msg) => {
    asked?.({ list: msg.list, left: msg.left });
    asked = null;
  });
  ctx.messages.on('post.sent', (msg) => {
    toast(`📮 Your card to ${msg.to} is in the post (${msg.left} left today)`);
  });
  const seen = new Set<string>();
  ctx.messages.on('post.cards', (msg) => {
    for (const card of msg.cards as Postcard[]) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      const t = toast(`💌 A postcard from ${card.from}! Click to read it`);
      t.style.cursor = 'pointer';
      t.addEventListener('click', () => openPostcard(card));
      ctx.sound.shop('door', {
        x: ctx.player.pos.x,
        y: ctx.player.pos.y + 1.5,
        z: ctx.player.pos.z,
      });
    }
    // The newest straight away, unless you're busy in another window.
    const last = msg.cards[msg.cards.length - 1];
    if (last && !document.querySelector('#modal-root .backdrop')) openPostcard(last);
  });
  // Cards that came while you were away: asked for once you're in.
  let checked = false;
  ctx.messages.on('welcome', () => {
    if (checked) return;
    checked = true;
    window.setTimeout(() => ctx.net.send({ t: 'post.check' }), 1500);
  });

  function writeCard(s: Shop) {
    const keeper = deps.keeper(s.i);
    keeper?.say('Eine Postkarte? Gern!', 2.5);
    openPostcardWriter({
      keeper: 'Frau Wimmer',
      recipients: () =>
        new Promise((resolve) => {
          asked = resolve;
          ctx.net.send({ t: 'post.recipients' });
        }),
      send: (to, motif, text) => {
        ctx.net.send({ t: 'post.send', to: to.key, motif, text });
        keeper?.reach();
        keeper?.say('Geht heute noch raus!', 3);
        ctx.sound.shop('till', near(s));
      },
    });
  }
  ctx.interactions.define('shoppobox', {
    reach: 2.2,
    hint: () => ({
      k: 'pobox',
      parts: [hintTitle('📬 Postfächer'), aside('cards for you come to your hand'), key('E', 'Look in yours')],
    }),
    use: onE(() => {
      const before = seen.size;
      ctx.net.send({ t: 'post.check' });
      window.setTimeout(() => seen.size === before && toast('📭 Leer: nothing for you yet'), 900);
    }),
  });

  return {
    /** E at a counter: the Post's writes a card (the Spielhalle's is a snack menu, the shops' own). */
    counter(s: Shop): boolean {
      if (s.kind !== 'post') return false;
      writeCard(s);
      return true;
    },
    /** For checks from the console: the Spielhalle's and the Post's nearest you. */
    nearest(kind: 'spielhalle' | 'post') {
      const p = ctx.player.pos;
      return SHOPS.filter((s) => s.kind === kind).sort((a, b) => dist(a, p) - dist(b, p))[0]?.i;
    },
    stations: (i: number) => shopRoom(SHOPS[i]).stations,
    /** Opens shop `i`'s claw machine, photo booth or postcard window, as E there would. */
    claw: (i: number) => playClaw(SHOPS[i]),
    booth: (i: number) => stepIn(SHOPS[i]),
    write: (i: number) => writeCard(SHOPS[i]),
    card: (c: Postcard) => openPostcard(c),
  };
}

const dist = (s: Shop, p: { x: number; z: number }) => {
  const d = shopPoint(s, s.doorU, 0);
  return Math.hypot(d.x - p.x, d.z - p.z);
};

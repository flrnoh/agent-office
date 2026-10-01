/**
 * flrnoh fork (see FORK.md): the kitchen fridge next to the coffee machine (ui/fridge.ts): drinks and
 * snacks that come along wherever you go; and what the padel hall café's counter hands over.
 */
import type { CafeItem } from '../../../shared/cafe';
import type { FridgeItem } from '../../../shared/fridge';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { toast } from '../../ui/dom';
import { openFridge } from '../../ui/fridge';
import type { Booze } from '../bar/booze';
import type { Caffeine } from '../coffee/caffeine';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    fridge: true;
  }
}

export interface FridgeDeps {
  booze(): Booze;
  caffeine(): Caffeine;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
}

export function installFridge(ctx: Ctx, deps: FridgeDeps) {
  /** E at the fridge: the door opens on drinks and snacks. */
  function showFridge() {
    ctx.sound.fridgeDoor(true);
    openFridge({ cutOff: deps.booze().cutOff(performance.now() / 1000), grab, onClose: () => ctx.sound.fridgeDoor(false) });
  }

  /** Out of the fridge and into your hand: opened (or bitten into), a beer to your head, a cola's little buzz. */
  function grab(d: FridgeItem) {
    const now = performance.now() / 1000;
    deps.booze().drink(d, now);
    deps.caffeine().top(now, d.caffeine);
    deps.reach();
    ctx.sound.opener(d.glass === 'bottle' || d.glass === 'can' ? d.glass : 'bite');
    if (ctx.player.view === 'first') ctx.hands.sip();
    toast(`${d.emoji} ${d.name}. ${d.says}`);
  }

  /** Handed over the padel hall café's counter (hall.ts): a coffee's buzz like the kitchen machine's, a cake in bites. */
  function serveFromCafe(d: CafeItem) {
    const now = performance.now() / 1000;
    deps.booze().drink(d, now);
    const caffeine = deps.caffeine();
    let jittery = false;
    if (d.coffee) jittery = caffeine.drink(now);
    else caffeine.top(now, d.caffeine);
    deps.reach();
    if (ctx.player.view === 'first') ctx.hands.sip();
    if (jittery) toast(`${d.emoji} ${d.name}… one cup too many, you’ve got the jitters!`, 'warn');
    else toast(`${d.emoji} ${d.name}. ${d.says}${d.coffee ? ' · a minute of quicker feet' : ''}`);
  }

  ctx.interactions.define('fridge', {
    reach: 3,
    hint: () => {
      const cut = deps.booze().cutOff(performance.now() / 1000);
      return { k: String(cut), parts: [hintTitle('🧊 Fridge'), aside(cut ? "you've had enough beer" : 'drinks and snacks'), key('E', 'Grab something')] };
    },
    use: onE(() => showFridge()),
  });

  return { serveFromCafe };
}

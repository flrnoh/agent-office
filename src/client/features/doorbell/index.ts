/** flrnoh fork (see FORK.md): a ding-dong when a person comes into the office (doorbell.ts). */
import type { Ctx } from '../../core/context';
import { Doorbell } from '../../doorbell';
import { store } from '../../state';
import { toast } from '../../ui/dom';

export function installDoorbell(ctx: Ctx) {
  const doorbell = new Doorbell(() => ctx.sound.doorbell(), (text) => toast(text));
  // Whoever's already here doesn't ring, nor do the people on a floor you go to.
  ctx.messages.on('welcome', (msg) => doorbell.know(msg.peers));
  ctx.messages.on('floor.enter', (msg) => doorbell.know(msg.peers));
  ctx.messages.on('peer.join', (msg) => doorbell.joined(msg.peer, store.you));
  ctx.messages.on('peer.leave', (msg) => doorbell.left(msg.id));
}

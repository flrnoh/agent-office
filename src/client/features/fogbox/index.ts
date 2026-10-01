/** flrnoh fork (see FORK.md): the fog stays outside, not in the office's rooms (world/fogbox.ts). */
import type { Ctx } from '../../core/context';
import { setFogRooms } from '../../world/fogbox';

export function installFogbox(ctx: Ctx, deps: { officeWing(): number }) {
  // Before the sky's drawn with it (see updateSky in core/loop.ts).
  ctx.ticks.add('world', () => setFogRooms(!ctx.upTop() && ctx.inOffice(), deps.officeWing()));
}

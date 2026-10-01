/**
 * flrnoh fork (see FORK.md): the pool table, the kicker, air hockey and table tennis on the roof
 * (tablegames/): E at one steps up to it, and the camera's over the table while you play.
 */
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key } from '../../core/hint';
import { TableGames } from '../../tablegames/play';
import type { Rooftop } from '../rooftop/world';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    table: true;
  }
}

export interface TableGamesDeps {
  /** The roof, once it's built (see features/rooftop). */
  roof(): Rooftop | null;
}

export function installTableGames(ctx: Ctx, deps: TableGamesDeps): TableGames {
  const tables = new TableGames({ net: ctx.net, camera: ctx.camera, canvas: ctx.canvas, player: ctx.player, sound: ctx.sound, view: () => deps.roof()?.tables ?? null });
  ctx.interactions.define('table', {
    reach: 4,
    hint: (it) => {
      if (!it.table) return { k: '', parts: [] };
      const t = tables.hint(it.table);
      return { k: `${t.aside}|${t.action}`, parts: [hintTitle(t.title), aside(t.aside), key('E', t.action)] };
    },
    use: (it, k) => {
      if (k === 'E' && it.table) tables.use(it.table);
    },
  });
  // The table games, and the camera at one.
  ctx.ticks.add('play', ({ dt }) => tables.update(dt));
  // Over the table, the game has the screen: no hands drawn over it.
  ctx.view.add({ covers: () => tables.zoomed });
  return tables;
}

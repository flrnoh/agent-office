// flrnoh fork (see FORK.md): the HTTP routes this fork adds.
import { radioTarget } from '../../radio.js';
import { send } from '../util.js';
import type { Route } from '../router.js';

export const forkRoutes = {
  radio: {
    method: 'GET',
    path: '/api/radio',
    auth: 'session',
    handle(ctx, { req, res, url }) {
      // A jukebox stream through the office, for https pages and http streams (radio.ts).
      const target = radioTarget(url.searchParams, (id) => ctx.floors.get(id)?.jukebox.state().url);
      if ('error' in target) return send(res, target.status, { error: target.error });
      return ctx.radio.pipe(req, res, target.url);
    },
  },
  djBeats: {
    method: 'GET',
    path: '/api/dj/beats',
    auth: 'session',
    handle(ctx, { res }) {
      // What the office heard in the DJ set that's on (server/djbeats/), for the roof's lights.
      const b = ctx.djBooth.heard();
      return b ? send(res, 200, b) : send(res, 404, { error: 'not heard yet' });
    },
  },
} satisfies Record<string, Route>;

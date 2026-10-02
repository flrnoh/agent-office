// flrnoh fork (see FORK.md): the HTTP routes this fork adds.
import { radioTarget } from '../../radio.js';
import { readSpotifyClientId } from '../../spotify.js';
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
  spotify: {
    method: 'GET',
    path: '/api/spotify',
    auth: 'session',
    // Which Spotify app the page signs in with (spotify.ts); null until one's set up.
    handle: (ctx, { res }) => send(res, 200, { clientId: readSpotifyClientId(ctx.cfg.dataDir) }),
  },
} satisfies Record<string, Route>;

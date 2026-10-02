// flrnoh fork (see FORK.md): the HTTP routes this fork adds.
import { serveVideo } from '../../djvideo/serve.js';
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
  djVideo: {
    path: '/api/dj/video',
    auth: 'session',
    handle(ctx, { req, res }) {
      // The YouTube set's own video, small, for the roof's LED wall (server/djvideo/): only ever the
      // copy of the set that's on, whatever's asked (?v= only keeps browsers' caches apart).
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only' }, { allow: 'GET, HEAD' });
      const file = ctx.djBooth.videoFile();
      return file ? serveVideo(req, res, file) : send(res, 404, { error: 'no video for the set that is on' });
    },
  },
} satisfies Record<string, Route>;

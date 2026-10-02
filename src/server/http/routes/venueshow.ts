// flrnoh fork (see FORK.md "The show"): what the office heard in the SCHALLWERK's DJ set, for the house's lights and crowd.
import { showOf } from '../../ws/handlers/venueshow.js';
import { send } from '../util.js';
import type { Route } from '../router.js';

export const venueShowRoutes = {
  beats: {
    method: 'GET',
    path: '/api/venue/beats',
    auth: 'session',
    handle(ctx, { res }) {
      const b = showOf(ctx).booth.heard();
      return b ? send(res, 200, b) : send(res, 404, { error: 'not heard yet' });
    },
  },
} satisfies Record<string, Route>;

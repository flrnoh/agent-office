// flrnoh fork (see FORK.md "Shops to walk into", food round 2): who pushes a supermarket trolley on
// your floor, and what's in it, as the office last said (shared/trolley.ts). Your own isn't in here
// (the office passes it on to the others only); features/shops/trolley.ts draws them all.
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** By who pushes it (a PeerInfo id): what's in their trolley. */
    trolleys: Map<string, string[]>;
  }
  interface Topics {
    trolleys: true;
  }
}

export const trolleys: Slice = {
  init(s) {
    s.trolleys = new Map();
  },
  on: {
    trolley(s, m) {
      if (m.items) s.trolleys.set(m.id, m.items);
      else s.trolleys.delete(m.id);
      return ['trolleys'];
    },
    'peer.leave'(s, m) {
      if (!s.trolleys.delete(m.id)) return;
      return ['trolleys'];
    },
  },
  enter(s, v) {
    s.trolleys = new Map(Object.entries(v.trolleys ?? {}));
    return ['trolleys'];
  },
};

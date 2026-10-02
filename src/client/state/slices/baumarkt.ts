// flrnoh fork (see FORK.md "The Baumarkt"): the forklift, its pallets, the trolleys and who holds what
// at the Baumarkt on your floor's street.
import { forkMid, freshBaumarkt, type BaumarktState } from '../../../shared/baumarkt-play';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /**
     * The Baumarkt as the office last said (see shared/baumarkt-play.ts), and when (performance.now())
     * the forklift's driver last said where it is. Its moves and the trolleys' change it without a word.
     */
    baumarkt: BaumarktState;
    baumarktAt: number;
  }
  interface Topics {
    baumarkt: true;
  }
}

export const baumarkt: Slice = {
  init(s) {
    s.baumarkt = freshBaumarkt();
    s.baumarktAt = 0;
  },
  on: {
    baumarkt(s, m) {
      s.baumarkt = m.state;
      s.baumarktAt = performance.now();
      return ['baumarkt'];
    },
    'bm.fork'(s, m) {
      const f = s.baumarkt.fork;
      Object.assign(f, { x: m.x, z: m.z, rotY: m.rotY, speed: m.speed, steer: m.steer, lift: m.lift, carrying: m.carrying });
      const pal = s.baumarkt.pallets[m.carrying];
      if (pal) Object.assign(pal, forkMid(f), { y: m.lift });
      s.baumarktAt = performance.now();
    },
    'bm.trolley'(s, m) {
      const t = s.baumarkt.trolleys[m.i];
      if (t) Object.assign(t, { x: m.x, z: m.z, rotY: m.rotY });
    },
    'bm.held'(s, m) {
      if (m.item) s.baumarkt.held[m.id] = m.item;
      else delete s.baumarkt.held[m.id];
      return ['baumarkt'];
    },
  },
  enter(s, v) {
    s.baumarkt = v.baumarkt ?? freshBaumarkt();
    s.baumarktAt = performance.now();
    return ['baumarkt'];
  },
};

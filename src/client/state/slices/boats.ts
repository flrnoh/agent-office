// flrnoh fork (see FORK.md "A day at the beach"): the jetskis and the motorboat at your floor's jetty.
import { moored, type CraftState } from '../../../shared/boats';
import type { Slice, Store } from '../store';

declare module '../store' {
  interface Store {
    /**
     * The crafts at the jetty, as the office last said (see shared/boats.ts), and when (performance.now())
     * each one's driver last said where it is. Their moves change them without a word, like the cars'.
     */
    boats: CraftState[];
    boatsAt: number[];
    /** The craft `id` (a PeerInfo id) is in on this floor, and which seat (0 drives). */
    boatOf(id: string): { craft: number; seat: number } | undefined;
  }
  interface Topics {
    boats: true;
  }
}

function setBoats(s: Store, boats: CraftState[]) {
  s.boats = boats;
  const now = performance.now();
  s.boatsAt = boats.map(() => now);
}

export const boats: Slice = {
  init(s) {
    s.boats = moored();
    s.boatsAt = [];
  },
  methods: {
    boatOf(id) {
      for (let i = 0; i < this.boats.length; i++) {
        const seat = this.boats[i].riders.indexOf(id);
        if (seat >= 0) return { craft: i, seat };
      }
      return undefined;
    },
  },
  on: {
    boats(s, m) {
      setBoats(s, m.boats);
      return ['boats'];
    },
    'boat.move'(s, m) {
      const c = s.boats[m.craft];
      if (!c) return;
      Object.assign(c, { x: m.x, z: m.z, rotY: m.rotY, speed: m.speed, steer: m.steer });
      s.boatsAt[m.craft] = performance.now();
    },
  },
  enter(s, v) {
    setBoats(s, v.boats ?? moored());
    return ['boats'];
  },
};

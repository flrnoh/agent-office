// flrnoh fork (see FORK.md): the racing rig on your floor (ui/rig.ts).
import { EMPTY_RIG, type RigFrame, type RigState } from '../../../shared/rig';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Who's at the racing rig on your floor and the building's tables. */
    rig: RigState;
    /** Their race as it last came in. */
    rigFrame: RigFrame | null;
  }
  interface Topics {
    rig: true;
    rigFrame: true;
  }
}

export const rig: Slice = {
  init(s) {
    s.rig = { driver: null, scores: EMPTY_RIG.scores };
    s.rigFrame = null;
  },
  on: {
    rig(s, m) {
      // Nobody at the wheel any more: their race goes with them.
      if (!m.state.driver || m.state.driver.id !== s.rig.driver?.id) s.rigFrame = null;
      s.rig = m.state;
      return ['rig'];
    },
    'rig.frame'(s, m) {
      s.rigFrame = m.frame;
      return ['rigFrame'];
    },
  },
  enter(s, v) {
    const r = v.rig ?? EMPTY_RIG;
    s.rig = { driver: r.driver, scores: r.scores };
    s.rigFrame = r.frame;
    return ['rig', 'rigFrame'];
  },
};

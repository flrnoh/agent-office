// flrnoh fork (see FORK.md "The petrol station"): your floor's petrol station, as the office last said:
// the pumps filling which car, the car in the wash, the cars still shiny from it. Times are turned
// into this page's clock (performance.now()) as they come in, so the litres and the wash's phase run on.
import type { FillState, TankState, WashState } from '../../../shared/tankstelle-play';
import type { Slice, Store } from '../store';

export interface Tank {
  /** Each fill going, and when it started on this page's clock. */
  fills: (FillState & { at: number })[];
  wash: (WashState & { at: number }) | null;
  /** Car → until when (this page's clock) it's extra shiny. */
  shine: Map<number, number>;
}

declare module '../store' {
  interface Store {
    tank: Tank;
  }
  interface Topics {
    tankstelle: true;
  }
}

/** The office's word, on this page's clock. */
function localTank(v: TankState | undefined, now = performance.now()): Tank {
  return {
    fills: (v?.fills ?? []).map((f) => ({ ...f, at: now - f.elapsed })),
    wash: v?.wash ? { ...v.wash, at: now - v.wash.elapsed } : null,
    shine: new Map((v?.shine ?? []).map((s) => [s.car, now + s.left])),
  };
}

export const tankstelle: Slice = {
  init(s) {
    s.tank = localTank(undefined);
  },
  on: {
    tankstelle(s: Store, m) {
      s.tank = localTank(m.state);
      return ['tankstelle'];
    },
  },
  enter(s, v) {
    s.tank = localTank(v.tankstelle);
    return ['tankstelle'];
  },
};

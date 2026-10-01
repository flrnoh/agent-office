/**
 * flrnoh fork (see FORK.md "Working at the boss desk"): the boss desk's own worker or shell, on the
 * boss's monitor up in the loft (ui/bossdesk.ts), and Minesweeper once it's gone home. Its chair's E
 * opens it (see features/seating).
 */
import type { WorkerInfo } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import { BossDesk } from '../../ui/bossdesk';
import type { Arcade } from '../arcade/ui';

export interface BossDeskDeps {
  arcade: Arcade;
  hire(deskId: string): void;
  shell(deskId: string): void;
  terminal(workerId: string): void;
  resume(w: WorkerInfo): void;
  sendHome(workerId: string): void;
}

export function installBossDesk(ctx: Ctx, deps: BossDeskDeps): BossDesk {
  const bossDesk = new BossDesk(ctx.office.bossScreen, { hire: deps.hire, shell: deps.shell, terminal: deps.terminal, resume: deps.resume, sendHome: deps.sendHome, play: () => deps.arcade.play() });
  ctx.ticks.add('play', () => bossDesk.update());
  return bossDesk;
}

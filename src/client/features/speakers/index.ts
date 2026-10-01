/** flrnoh fork (see FORK.md): the speakers all over the office that play the jukebox too (world/speakers.ts, sound/speakers.ts). */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { buildSpeakers } from '../../world/speakers';

export interface SpeakersDeps {
  /** How many rows the office's back office is built out where you are (see core/worlds.ts). */
  officeWing(): number;
}

export function installSpeakers(ctx: Ctx, deps: SpeakersDeps) {
  const speakers = buildSpeakers();
  ctx.office.group.add(speakers.group);
  const here = () => !ctx.upTop() && ctx.inOffice();
  // Where they are for what you hear, before you hear it (see listen in core/loop.ts).
  ctx.ticks.add('play', () => ctx.sound.setSpeakerRoom(here() ? { wing: deps.officeWing(), on: !store.jukebox.speakersOff } : null));
  ctx.ticks.add('world', ({ dt }) => {
    if (here()) speakers.update(dt, deps.officeWing(), ctx.sound.beat(), store.jukebox.on, !store.jukebox.speakersOff);
  });
}

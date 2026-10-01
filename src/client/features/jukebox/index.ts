import { trackTitle } from '../../../shared/jukebox';
import { radioSources } from '../../../shared/radio'; // flrnoh fork
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { saveSettings, store } from '../../state';
import { clip } from '../../ui/dom';
import { openJukebox } from './ui';
import type { SettingsPane } from '../../ui/settings';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    jukebox: true;
  }
}

export interface JukeboxDeps {
  /** Settings, open at `pane` (the music's volume is under Sound). */
  showSettings(pane?: SettingsPane): void;
}

/** The jukebox on your floor, the office's own: what's on, and E to put a song on. */
export function installJukebox(ctx: Ctx, deps: JukeboxDeps) {
  // The jukebox on your floor: everyone there hears it from the same bar, and its lights say what's on.
  // It's the office's: on a map of its own there's none to hear.
  function playJukebox() {
    const j = store.jukebox;
    // flrnoh fork: http streams go through the office on an https page (shared/radio.ts).
    const src = radioSources(j, store.floor, location.protocol === 'https:');
    ctx.sound.setJukebox(j.on && ctx.inOffice() ? { track: j.track, url: src?.src, fallback: src?.fallback, startedAt: j.startedAt, since: j.since } : null);
    ctx.office.jukebox.show(j.on, trackTitle(j));
  }
  store.on('jukebox', playJukebox);
  ctx.interactions.define('jukebox', {
    reach: 4,
    hint: () => {
      const j = store.jukebox;
      const what = j.on ? trackTitle(j) : '';
      return { k: `${j.on}|${what}`, parts: [hintTitle('🎵 Jukebox'), aside(j.on ? `♪ ${clip(what, 40)}` : 'off'), key('E', j.on ? 'Change the song' : 'Put on a song')] };
    },
    use: onE(() => showJukebox()),
  });

  function showJukebox() {
    // flrnoh fork: your speaker volume in the jukebox's window too.
    const { settings } = ctx;
    const speakers = { get: () => settings, set: (level: number, muted: boolean) => (Object.assign(settings, { speakers: level, speakersMuted: muted }), saveSettings(settings), ctx.sound.setSpeakerVolume(level, muted)) };
    openJukebox(ctx.net, () => deps.showSettings('sound'), speakers);
  }

  return { playJukebox };
}

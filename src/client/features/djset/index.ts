/**
 * flrnoh fork (see FORK.md): a DJ set someone put on at the roof's booth, from YouTube, SoundCloud or
 * Mixcloud, in place of the house DJ, for everyone up there (djset.ts, ui/djbooth.ts). The booth
 * itself, its hint and E, are features/bar's; it asks here what's on.
 */
import type { Ctx } from '../../core/context';
import { djFrame } from '../../dnb';
import { DjSetPlayer } from '../../djset';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { openDjBooth } from '../../ui/djbooth';
import type { SettingsPane } from '../../ui/settings';
import type { Interactable } from '../../world/types';

export interface DjSetDeps {
  /** How far into the house DJ's set it is (see features/rooftop). */
  djAt(): number;
  /** E at the booth's 📯 button: the air horn (see features/bar). */
  horn(): void;
  /** Settings, open at `pane`. */
  showSettings(pane?: SettingsPane): void;
  /** What you're pointing at (see input/pointer.ts): H at the booth is the air horn. */
  target(): Interactable | null;
}

export function installDjSets(ctx: Ctx, deps: DjSetDeps) {
  const watchers = new Set<() => void>();
  const djSets = new DjSetPlayer({ now: () => store.officeNow(), volume: () => ctx.sound.djSetVolume(), toast, changed: () => (houseDj(), watchers.forEach((fn) => fn())) });
  /** The house DJ plays on the roof unless a set does. */
  function houseDj() {
    ctx.sound.setDj(ctx.upTop() && !djSets.silencesHouse() ? deps.djAt : null);
  }
  /** Up on the roof, or back down (see setPlace in core/travel.ts). */
  function setUp(up: boolean) {
    djSets.setUp(up);
    houseDj();
  }
  ctx.messages.on('welcome', (msg) => void (msg.dj && djSets.set(msg.dj)));
  ctx.messages.on('floor.enter', (msg) => void (msg.dj && djSets.set(msg.dj)));
  ctx.messages.on('dj', (msg) => djSets.set(msg.state));
  // At the DJ booth on the roof, H is the air horn (elsewhere it's the controls, see features/hud).
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyH' || !ctx.upTop() || deps.target()?.kind !== 'dj') return false;
    if (!e.repeat) deps.horn();
    return true;
  });

  /** E at the DJ booth: what's playing, a set of your own, the air horn. */
  function showDjBooth() {
    openDjBooth({ net: ctx.net, player: djSets, house: () => djFrame(deps.djAt()).part, horn: deps.horn, openVolume: () => deps.showSettings('sound'), watch: (fn) => (watchers.add(fn), () => watchers.delete(fn)) });
  }

  /** What the booth's hint says is on, when it's a set of someone's (else the house DJ's). */
  function playing(): string | null {
    if (!djSets.silencesHouse() || !djSets.current().set) return null;
    return `🎶 ${djSets.titleNow()}${djSets.phase() === 'blocked' ? ' · click to hear it' : ''}`;
  }

  return { djSets, setUp, showDjBooth, playing };
}

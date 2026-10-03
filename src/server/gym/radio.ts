import { GYM_CHANNEL_BY_ID, GYM_DEFAULT_CHANNEL, GYM_RADIO_COOLDOWN_MS, nextChannel, type GymRadioView } from '../../shared/gym-radio.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * Gym FM (flrnoh fork, see shared/gym-radio.ts): the station the gym's speakers play, one for everyone
 * inside. Nobody sits at it: E at the sound system behind reception tunes the next station (`next`),
 * or a given one (`tune`, data: {channel}), a few seconds apart whoever turns the dial.
 */
export class GymRadio implements GymGame {
  readonly kind = 'radio' as const;
  readonly seats = 0;
  /** Used from where you stand, without stepping on (index.ts lets its acts through). */
  readonly walkUp = true;
  private channel = GYM_DEFAULT_CHANNEL;
  private by = '';
  private at = 0;

  constructor(readonly id: string) {}

  sit(): string {
    return 'Press E at the sound system to change the station';
  }

  stand() {}

  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void {
    const now = ctx.now();
    if (this.at && now - this.at < GYM_RADIO_COOLDOWN_MS) return 'The radio just changed: give it a second';
    let to: string | undefined;
    if (action === 'next') to = nextChannel(this.channel).id;
    else if (action === 'tune') {
      const id = (data as { channel?: unknown } | null)?.channel;
      to = typeof id === 'string' && GYM_CHANNEL_BY_ID.has(id) ? id : undefined;
      if (!to) return 'No such station';
    } else return 'Turn the dial';
    if (to === this.channel) return;
    this.channel = to;
    this.by = p.name;
    this.at = now;
    const c = GYM_CHANNEL_BY_ID.get(to)!;
    ctx.result(p.owner, c.url ? `📻 Gym FM · ${c.name} · ${c.genre}` : '📻 Gym FM · off');
    ctx.changed();
  }

  tick() {}

  view(): GymRadioView {
    return { kind: 'radio', channel: this.channel, ...(this.by ? { by: this.by, at: this.at } : {}) };
  }
}

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GYM_CHANNEL_BY_ID, GYM_DEFAULT_CHANNEL, GYM_DEFAULT_VOLUME, GYM_RADIO_COOLDOWN_MS, clampGymVolume, nextChannel, type GymRadioView } from '../../shared/gym-radio.js';
import type { GymContext, GymGame, Seated } from './game.js';

/*
 * Gym FM (flrnoh fork, see shared/gym-radio.ts): the station the gym's speakers play, and how loud, one
 * for everyone inside. Nobody sits at it: E at the sound system behind reception opens the picker,
 * whose buttons send `tune` (data: {channel}, a built-in one only) or `next`, a moment apart whoever
 * picks, and whose slider sends `volume` (data: {volume}, 0…GYM_VOLUME_MAX). Both are kept in
 * gym-radio.json in the data folder, so a restart doesn't put it back.
 */
export class GymRadio implements GymGame {
  readonly kind = 'radio' as const;
  readonly seats = 0;
  /** Used from where you stand, without stepping on (index.ts lets its acts through). */
  readonly walkUp = true;
  private channel = GYM_DEFAULT_CHANNEL;
  private volume = GYM_DEFAULT_VOLUME;
  private by = '';
  private at = 0;
  private volumeBy = '';
  private readonly file: string | null;

  /** `dataDir`: where it keeps its station and volume (none: it forgets them on a restart). */
  constructor(
    readonly id: string,
    dataDir?: string,
  ) {
    this.file = dataDir ? path.join(dataDir, 'gym-radio.json') : null;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { channel?: unknown; volume?: unknown };
      if (typeof saved.channel === 'string' && GYM_CHANNEL_BY_ID.has(saved.channel)) this.channel = saved.channel;
      this.volume = clampGymVolume(saved.volume) ?? GYM_DEFAULT_VOLUME;
    } catch {
      // a broken file: the defaults it is
    }
  }

  sit(): string {
    return 'Press E at the sound system to pick a station';
  }

  stand() {}

  act(p: Seated, action: string, data: unknown, ctx: GymContext): string | void {
    if (action === 'volume') {
      const v = clampGymVolume((data as { volume?: unknown } | null)?.volume);
      if (v === undefined) return 'No such volume';
      if (v === this.volume) return;
      this.volume = v;
      this.volumeBy = p.name;
      this.save();
      ctx.changed();
      return;
    }
    let to: string | undefined;
    if (action === 'next') to = nextChannel(this.channel).id;
    else if (action === 'tune') {
      const id = (data as { channel?: unknown } | null)?.channel;
      to = typeof id === 'string' && GYM_CHANNEL_BY_ID.has(id) ? id : undefined;
      if (!to) return 'No such station';
    } else return 'Pick a station';
    if (to === this.channel) return;
    const now = ctx.now();
    if (this.at && now - this.at < GYM_RADIO_COOLDOWN_MS) return 'The radio just changed: give it a second';
    this.channel = to;
    this.by = p.name;
    this.at = now;
    this.save();
    const c = GYM_CHANNEL_BY_ID.get(to)!;
    ctx.result(p.owner, c.url ? `📻 Gym FM · ${c.name} · ${c.genre}` : '📻 Gym FM · off');
    ctx.changed();
  }

  tick() {}

  view(): GymRadioView {
    return { kind: 'radio', channel: this.channel, volume: this.volume, ...(this.by ? { by: this.by, at: this.at } : {}), ...(this.volumeBy ? { volumeBy: this.volumeBy } : {}) };
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ channel: this.channel, volume: this.volume }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('gym: could not save the radio', err);
    }
  }
}

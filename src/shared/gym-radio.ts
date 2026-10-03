import { RECEPTION } from './gym-rooms.js';

/*
 * Gym FM (flrnoh fork, see FORK.md "The gym's basement"): the gym's music, a live radio stream through
 * the speakers in the hall, the same station for everyone in there. The sound system stands on the
 * reception counter: E at it tunes the next station (the gym keeps it, server/gym/radio.ts). It plays in the
 * hall and quieter in the changing room; the wellness spa and the basement stay quiet.
 *
 * Every address was checked to answer with audio (HTTP 200, audio/mpeg) when it was added; stations
 * move their streams now and then, so check again with curl when one goes quiet.
 */

export interface GymChannel {
  id: string;
  name: string;
  /** A few words on what it plays. */
  genre: string;
  /** Empty: off. */
  url: string;
}

export const GYM_CHANNELS: readonly GymChannel[] = [
  { id: 'workout', name: 'I♥WORKOUT', genre: 'Workout beats', url: 'https://streams.ilovemusic.de/iloveradio23.mp3' },
  { id: 'hardstyle', name: 'I♥HARDSTYLE', genre: 'Hardstyle', url: 'https://streams.ilovemusic.de/iloveradio21.mp3' },
  { id: 'mainstage', name: 'I♥MAINSTAGE', genre: 'Festival EDM', url: 'https://streams.ilovemusic.de/iloveradio22.mp3' },
  { id: 'bass', name: 'I♥BASS', genre: 'Bass & dubstep', url: 'https://streams.ilovemusic.de/iloveradio29.mp3' },
  { id: 'off', name: 'Off', genre: 'Silence', url: '' },
];
export const GYM_CHANNEL_BY_ID = new Map(GYM_CHANNELS.map((c) => [c.id, c]));
/** What it plays until someone tunes it. */
export const GYM_DEFAULT_CHANNEL = GYM_CHANNELS[0].id;
/** How long after a change before the next one (whoever turns the dial). */
export const GYM_RADIO_COOLDOWN_MS = 3000;

/** The sound system on the reception counter: its station id (it's no GYM_STATIONS machine), and where it stands (E there). */
export const GYM_RADIO = { id: 'radio', x: RECEPTION.minX + 0.25, z: 37.05, top: 1.1 } as const;

/** The channel after `id` on the dial (round to the first after the last). */
export function nextChannel(id: string): GymChannel {
  const i = GYM_CHANNELS.findIndex((c) => c.id === id);
  return GYM_CHANNELS[(i + 1) % GYM_CHANNELS.length];
}

/** What everyone in the gym is told about the radio. */
export interface GymRadioView {
  kind: 'radio';
  channel: string;
  /** Who tuned it last, and when (the office's clock). */
  by?: string;
  at?: number;
}

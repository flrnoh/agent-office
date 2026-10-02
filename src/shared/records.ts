import { mulberry32 } from './rng.js';

// The record shop's records (flrnoh fork, see FORK.md "Shops to walk into"): made up once from a seed,
// so every page has the same crates, the same sleeves (client/features/shops/sleeves.ts draws them)
// and the same music on each (the jukebox's own synthesizer plays one of its tunes with the record's
// own melody, see TunePlayer's `seed`).

export type RecordId = `platte-${number}`;

export interface RecordDef {
  id: RecordId;
  band: string;
  title: string;
  genre: string;
  year: number;
  /** The sleeve's ground and its ink. */
  sleeve: string;
  ink: string;
  /** How the sleeve's drawn: 0 rings, 1 stripes, 2 a sun, 3 a grid, 4 waves, 5 a big letter. */
  art: number;
  /** Which of the jukebox's tunes it is, and the seed of its melody. */
  tune: string;
  seed: number;
}

const BANDS = ['Die Regenpfeifer', 'Neon Dackel', 'Kassettenkinder', 'Hochnebel', 'Brezn Brothers', 'Funkloch', 'The Merge Conflicts', 'Bayerwald Boogie', 'Lo-Fi Lenz', 'Schwarzer Kater', 'Isar Disco', 'Gute Stube'];
const TITLES = ['Nachtbus', 'Sommer in Zwiesel', 'Kaffee & Kippen', 'Stromausfall', 'Weißwurstäquator', 'Leise Lieder', 'Grüner Build', 'Föhn', 'Zweite Halbzeit', 'Mondschein-Späti', 'Dachterrasse', 'Endlich Freitag'];
const GENRES = ['Lo-fi', 'Krautrock', 'Disco', 'Jazz', 'Indie', 'Synthpop', 'Funk', 'Ambient'];
const PALETTE = [
  ['#ef233c', '#edf2f4'],
  ['#ffb703', '#023047'],
  ['#8338ec', '#ffbe0b'],
  ['#06d6a0', '#073b4c'],
  ['#f15bb5', '#fee440'],
  ['#2b2d42', '#ef233c'],
  ['#e9c46a', '#264653'],
  ['#00bbf9', '#f15bb5'],
];
const TUNES = ['rainy-window', 'coffee-break', 'late-commit', 'green-build'];

function press(): RecordDef[] {
  const r = mulberry32(20261002);
  return BANDS.map((band, i) => {
    const [sleeve, ink] = PALETTE[Math.floor(r() * PALETTE.length)];
    return {
      id: `platte-${i + 1}` as RecordId,
      band,
      title: TITLES[(i * 5) % TITLES.length],
      genre: GENRES[Math.floor(r() * GENRES.length)],
      year: 1968 + Math.floor(r() * 56),
      sleeve,
      ink,
      art: Math.floor(r() * 6),
      tune: TUNES[i % TUNES.length],
      seed: 1 + Math.floor(r() * 9999),
    };
  });
}

export const RECORDS: readonly RecordDef[] = press();
export const RECORD_BY_ID = new Map<string, RecordDef>(RECORDS.map((d) => [d.id, d]));

/** The few records on top of crate `n` in shop `shop`: four of them, the same for everyone. */
export function crateDig(shop: number, n: number, dig: number): RecordDef[] {
  const r = mulberry32(shop * 977 + n * 131 + dig * 7919 + 1);
  const pool = [...RECORDS];
  const out: RecordDef[] = [];
  while (out.length < 4 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

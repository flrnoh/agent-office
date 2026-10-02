// The cinema on its own block behind the office (flrnoh fork, see FORK.md "The cinema"): what's on
// in the big hall (Saal 1), and when. Only films that may be shown: the Blender Foundation's open
// movies (Creative Commons, their credit on the screen and the posters) and silent classics that
// are in the public domain in Germany and the USA alike (made before 1930, and everyone who counts
// as an author of it under German law, its director and its writers, dead more than 70 years: so no
// Chaplin, Keaton or Metropolis, public domain in the USA but not here). Each plays straight from Wikimedia Commons' own copy (a WebM the viewer's browser
// streams, sent with CORS so it can go onto the screen as a texture); nothing is kept in the office.
//
// The programme runs back to back on the office's clock, round and round from KINO_EPOCH: a short
// break (lights up, curtain shut, the next film on the screen) and then the film. Everyone in the
// hall sees the same moment; coming in late you're straight at where it is now.

import type { TvState } from './tv.js';

export interface Film {
  id: string;
  title: string;
  /** Its original title, when the poster says that too. */
  original?: string;
  year: number;
  /** Who made it, for the credit. */
  by: string;
  /** How long it runs, in whole seconds (Commons' copy, rounded down). */
  seconds: number;
  /** Its licence, as its source states it: "CC BY 3.0", or "Public domain". */
  licence: string;
  /** The licence's own page (none for the public domain). */
  licenceUrl?: string;
  /** The credit shown on the screen before it, on its poster and on the marquee's side. */
  credit: string;
  /** Where it streams from (a 720p WebM of Wikimedia Commons' transcode). */
  url: string;
  /** Its file page on Commons, where the licence and the source are. */
  source: string;
  /** No sound track: a silent film (the hall's piano hum plays under it). */
  silent?: true;
  /** The poster's colours: its background, its ink, and an accent. */
  poster: readonly [string, string, string];
  /** What the poster shows, in a few shapes (see client/world/kino/posters.ts). */
  motif: 'bunny' | 'moon' | 'dragon' | 'blossom' | 'vampire' | 'llama' | 'robot' | 'train' | 'sheep' | 'machine' | 'caligari' | 'mushroom';
}

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/transcoded';
/** Commons' 720p VP9 transcode of a file at `path` (its hash folders and its name, as Commons writes them). */
const transcode = (path: string) => `${COMMONS}/${path}/${path.split('/').pop()}.720p.vp9.webm`;
const page = (name: string) => `https://commons.wikimedia.org/wiki/File:${name}`;
const CC_BY = (v: string) => `https://creativecommons.org/licenses/by/${v}/`;

/** The programme, in the order it runs. Checked 2026-10-02: every url answers 206 with CORS. */
export const FILMS: readonly Film[] = [
  {
    id: 'bbb', title: 'Big Buck Bunny', year: 2008, by: 'Blender Foundation', seconds: 634, licence: 'CC BY 3.0', licenceUrl: CC_BY('3.0'),
    credit: '(c) copyright 2008, Blender Foundation · www.bigbuckbunny.org · CC BY 3.0',
    url: transcode('c/c0/Big_Buck_Bunny_4K.webm'), source: page('Big_Buck_Bunny_4K.webm'), poster: ['#8fd16a', '#1d3b12', '#ffd23f'], motif: 'bunny',
  },
  {
    id: 'lune', title: 'A Trip to the Moon', original: 'Le Voyage dans la Lune', year: 1902, by: 'Georges Méliès', seconds: 766, licence: 'Public domain',
    credit: 'Georges Méliès, 1902 · public domain', silent: true,
    url: transcode('6/6d/Le_Voyage_dans_la_Lune_%281902%29.webm'), source: page('Le_Voyage_dans_la_Lune_(1902).webm'), poster: ['#14213d', '#fca311', '#e5e5e5'], motif: 'moon',
  },
  {
    id: 'sintel', title: 'Sintel', year: 2010, by: 'Blender Foundation (Durian Open Movie project)', seconds: 888, licence: 'CC BY 3.0', licenceUrl: CC_BY('3.0'),
    credit: '(c) copyright Blender Foundation · durian.blender.org · CC BY 3.0',
    url: transcode('f/f1/Sintel_movie_4K.webm'), source: page('Sintel_movie_4K.webm'), poster: ['#2b2d42', '#edf2f4', '#ef233c'], motif: 'dragon',
  },
  {
    id: 'spring', title: 'Spring', year: 2019, by: 'Andy Goralczyk / Blender Foundation', seconds: 464, licence: 'CC BY 4.0', licenceUrl: CC_BY('4.0'),
    credit: 'Spring · Blender Animation Studio · cloud.blender.org · CC BY 4.0',
    url: transcode('a/a5/Spring_-_Blender_Open_Movie.webm'), source: page('Spring_-_Blender_Open_Movie.webm'), poster: ['#a8dadc', '#1d3557', '#f4a6c0'], motif: 'blossom',
  },
  {
    id: 'nosferatu', title: 'Nosferatu', original: 'Nosferatu, eine Symphonie des Grauens', year: 1922, by: 'F. W. Murnau / Henrik Galeen', seconds: 5518, licence: 'Public domain',
    credit: 'F. W. Murnau, 1922 · public domain', silent: true,
    url: transcode('7/78/Nosferatu_%281922%29.webm'), source: page('Nosferatu_(1922).webm'), poster: ['#0b0b0b', '#e9e4d0', '#7a0d0d'], motif: 'vampire',
  },
  {
    id: 'llamigos', title: 'Caminandes: Llamigos', year: 2016, by: 'Blender Institute', seconds: 150, licence: 'CC BY 3.0', licenceUrl: CC_BY('3.0'),
    credit: 'Caminandes 3: Llamigos · Blender Institute · caminandes.com · CC BY 3.0',
    url: transcode('a/ab/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm'), source: page('Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm'), poster: ['#f6bd60', '#5b3a29', '#84a59d'], motif: 'llama',
  },
  {
    id: 'tos', title: 'Tears of Steel', year: 2012, by: 'Blender Foundation', seconds: 734, licence: 'CC BY 3.0', licenceUrl: CC_BY('3.0'),
    credit: '(CC) Blender Foundation · mango.blender.org · CC BY 3.0',
    url: transcode('c/cb/Tears_of_Steel_1080p.webm'), source: page('Tears_of_Steel_1080p.webm'), poster: ['#1b263b', '#e0e1dd', '#4cc9f0'], motif: 'robot',
  },
  {
    id: 'train', title: 'The Great Train Robbery', year: 1903, by: 'Edwin S. Porter', seconds: 807, licence: 'Public domain',
    credit: 'Edwin S. Porter, 1903 · Library of Congress · public domain', silent: true,
    url: transcode('d/d7/The_Great_Train_Robbery_%281903%29.webm'), source: page('The_Great_Train_Robbery_(1903).webm'), poster: ['#e9d8a6', '#3d2b1f', '#ae2012'], motif: 'train',
  },
  {
    id: 'cosmos', title: 'Cosmos Laundromat', year: 2015, by: 'Blender Foundation', seconds: 730, licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    credit: 'Cosmos Laundromat: First Cycle · Blender Foundation · gooseberry.blender.org · CC BY-SA 3.0',
    url: transcode('3/36/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm'), source: page('Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm'), poster: ['#3a0ca3', '#f1faee', '#f72585'], motif: 'sheep',
  },
  {
    id: 'ed', title: 'Elephants Dream', year: 2006, by: 'Orange Open Movie Team (Blender Foundation)', seconds: 658, licence: 'CC BY 2.5', licenceUrl: CC_BY('2.5'),
    credit: '(c) copyright 2006, Blender Foundation / Netherlands Media Art Institute · elephantsdream.org · CC BY 2.5',
    url: transcode('a/a2/Elephants_Dream_%282006%29.webm'), source: page('Elephants_Dream_(2006).webm'), poster: ['#6c584c', '#f0ead2', '#dda15e'], motif: 'machine',
  },
  {
    id: 'caligari', title: 'The Cabinet of Dr. Caligari', original: 'Das Cabinet des Dr. Caligari', year: 1920, by: 'Robert Wiene (written by Carl Mayer and Hans Janowitz)', seconds: 4523, licence: 'Public domain',
    credit: 'Robert Wiene, 1920 · public domain', silent: true,
    url: transcode('b/ba/Das_Cabinet_des_Dr._Caligari.webm'), source: page('Das_Cabinet_des_Dr._Caligari.webm'), poster: ['#2b2118', '#e9d8a6', '#bb3e03'], motif: 'caligari',
  },
  {
    id: 'sprite', title: 'Sprite Fright', year: 2021, by: 'Blender Studio', seconds: 629, licence: 'CC BY 4.0', licenceUrl: CC_BY('4.0'),
    credit: 'Sprite Fright · Blender Studio · studio.blender.org · CC BY 4.0',
    url: transcode('7/76/Sprite_Fright_-_Blender_Open_Movie-full_movie.webm'), source: page('Sprite_Fright_-_Blender_Open_Movie-full_movie.webm'), poster: ['#2d6a4f', '#fefae0', '#ff7b00'], motif: 'mushroom',
  },
];

/** The break before each film: house lights up, the curtain shut, the next film's card on it (s). */
export const KINO_BREAK = 60;
/** Where the programme started going round: 1 January 2026, midnight UTC (ms). */
export const KINO_EPOCH = Date.UTC(2026, 0, 1);

/** One film's place in the round: its break starts at `at`, the film at `at + KINO_BREAK` (s from the round's start). */
interface Slot {
  film: number;
  at: number;
}

const SLOTS: readonly Slot[] = (() => {
  let at = 0;
  return FILMS.map((f, film) => {
    const s = { film, at };
    at += KINO_BREAK + f.seconds;
    return s;
  });
})();

/** How long the whole programme takes, round once (s). */
export const KINO_ROUND = SLOTS.length ? SLOTS[SLOTS.length - 1].at + KINO_BREAK + FILMS[FILMS.length - 1].seconds : 0;

export interface KinoNow {
  /** Which of FILMS is on, or next once the break is over. */
  film: number;
  /** 'break' before it (lights up), 'film' while it runs. */
  phase: 'break' | 'film';
  /** How far into the film it is (s); during the break, how long until it starts, as a negative number. */
  offset: number;
  /** When the film starts and ends, on the office's clock (ms). */
  startsAt: number;
  endsAt: number;
  /** The one after it. */
  next: number;
}

/** What's on in Saal 1 at `now` (ms on the office's clock): the same for everyone, round and round. */
export function kinoAt(now: number): KinoNow {
  const s = (now - KINO_EPOCH) / 1000;
  const round = Math.floor(s / KINO_ROUND);
  const into = s - round * KINO_ROUND;
  // The last slot that started before now (SLOTS is in order, and the first starts at 0).
  let i = 0;
  while (i + 1 < SLOTS.length && SLOTS[i + 1].at <= into) i++;
  const slot = SLOTS[i];
  const filmAt = slot.at + KINO_BREAK;
  const offset = into - filmAt;
  const base = KINO_EPOCH + round * KINO_ROUND * 1000;
  const startsAt = base + filmAt * 1000;
  return {
    film: slot.film,
    phase: offset < 0 ? 'break' : 'film',
    offset,
    startsAt,
    endsAt: startsAt + FILMS[slot.film].seconds * 1000,
    next: (slot.film + 1) % FILMS.length,
  };
}

/** The next `n` starts after the one on at `now` (for the programme board): which film, and when (ms). */
export function kinoComing(now: number, n: number): { film: number; at: number }[] {
  const out: { film: number; at: number }[] = [];
  let t = kinoAt(now).endsAt + 1;
  for (let k = 0; k < n; k++) {
    const k2 = kinoAt(t);
    out.push({ film: k2.film, at: k2.startsAt });
    t = k2.endsAt + 1;
  }
  return out;
}

/** "1 h 32 min" or "11 min", for posters and the programme. */
export function runtime(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.max(1, m)} min`;
}

// ---- Saal 2: put on your own link, like the office TV ---------------------------------------------

/** What's on in Saal 2: the office TV's kind of link (YouTube or Twitch), its own per floor. */
export type KinoScreenState = TvState;

export type KinoClientMsg =
  /** Put a YouTube or Twitch link on in Saal 2, for everyone in there (see shared/tv.ts for what plays). */
  | { t: 'kino.play'; url: string }
  /** Turn Saal 2's screen off. */
  | { t: 'kino.stop' };

/** What's on in Saal 2 changed (to everyone on the floor: the street is theirs). */
export type KinoServerMsg = { t: 'kino'; state: KinoScreenState };

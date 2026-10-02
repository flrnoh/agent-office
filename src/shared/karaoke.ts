// The karaoke bar in the bowling centre (flrnoh fork, see FORK.md "Karaoke"): a stage against the
// east wall with two mics, a big lyrics screen over it, a song list everyone in the centre queues up
// in, the singer on the PA, applause and a rating after each song, and the week's karaoke kings.
// Shared by the server (server/bowling/karaoke.ts keeps the queue, the mics and the board) and the
// page (features/karaoke/). Everything here is in the centre's interior coordinates (shared/bowling.ts).

import { ZONES } from './bowling.js';
import { readWebLink, youtubeVideo } from './embeds.js';
import { SONG_BY_ID } from './karaoke-songs.js';
import type { TvStream } from './tv.js';

// ---- Where everything stands (inside ZONES.karaoke) ------------------------------------------------

const Z = ZONES.karaoke;

/** The stage: a riser against the east wall. Standing on it with a mic puts you on the PA. */
export const STAGE = { minX: 16.2, maxX: Z.maxX, minZ: 4.2, maxZ: 13.2, top: 0.5 } as const;
/** The step up onto its front (west) edge. */
export const STAGE_STEP = { minX: 15.55, maxX: STAGE.minX, minZ: 6.4, maxZ: 11, top: 0.25 } as const;
export const STAGE_MID_Z = (STAGE.minZ + STAGE.maxZ) / 2;
/** The two mic stands on the stage: mic 1 the lead's, mic 2 for a duet. */
export const MICS = [
  { x: 17.6, z: STAGE_MID_Z - 0.95 },
  { x: 17.6, z: STAGE_MID_Z + 0.95 },
] as const;
/** The big screen on the wall over the stage: its middle, and how big (16:9). */
export const SCREEN = { x: Z.maxX - 0.12, y: 4.35, z: STAGE_MID_Z, w: 6.2, h: 3.4875 } as const;
/** The prompter at the stage's front edge, tilted up at whoever's singing. */
export const PROMPTER = { x: 16.55, z: STAGE_MID_Z, w: 1.1, h: 0.62 } as const;
/** The little bar along the mini golf room's wall: its counter. */
export const KARAOKE_BAR = { minX: 6, maxX: 12.6, minZ: 2.35, maxZ: 3.0, top: 1.08 } as const;
/** The bistro tables in front of the stage. */
export const TABLES = [
  { x: 7.4, z: 6.4 },
  { x: 10.6, z: 6.0 },
  { x: 7.2, z: 10.2 },
  { x: 10.4, z: 9.8 },
  { x: 7.6, z: 14.2 },
  { x: 10.8, z: 13.8 },
] as const;
/** The karaoke jockey's desk by the stage, with the song book on it. */
export const KJ_DESK = { x: 14.6, z: 14.3 } as const;
/** The week's karaoke kings, on the east wall south of the stage (facing west). */
export const CHARTS = { x: Z.maxX - 0.06, y: 2.4, z: 15.6, w: 2.4, h: 1.7 } as const;

/** Whether (x, z) is up on the stage (what counts as being on the PA, with a mic). */
export function onStage(x: number, z: number): boolean {
  return x >= STAGE.minX - 0.15 && x <= STAGE.maxX && z >= STAGE.minZ && z <= STAGE.maxZ;
}

/** Whether (x, z) is in the karaoke bar (its zone), with a little slack round it. */
export function inKaraoke(x: number, z: number, slack = 0): boolean {
  return x >= Z.minX - slack && x <= Z.maxX + slack && z >= Z.minZ - slack && z <= Z.maxZ + slack;
}

// ---- The queue, the turn, the board ----------------------------------------------------------------

/** What someone wants to sing: one of the bar's own songs, or a YouTube karaoke video. */
export type KaraokePick = { kind: 'song'; id: string } | { kind: 'video'; video: TvStream };

export interface KaraokeEntry {
  /** Its number in the queue (for taking it out again). */
  id: number;
  /** Who queued it (a client id) and their name. */
  who: string;
  name: string;
  pick: KaraokePick;
}

/** `up`: called to the stage, waiting for them to take a mic; `singing`; `rating`: the room votes. */
export type KaraokePhase = 'up' | 'singing' | 'rating';

export interface KaraokeTurn extends KaraokeEntry {
  phase: KaraokePhase;
  /** When the song starts (singing) or the phase began, on the office's clock (ms). */
  startedAt: number;
  /** When this phase ends on its own (ms; 0 while a video sings, which ends when it's over). */
  until: number;
  /** In the rating: how many have voted, and the average so far (1–5). */
  votes?: number;
  avg?: number;
}

export interface KaraokeLeader {
  name: string;
  /** Songs sung this week, and the average 🔥 they got. */
  songs: number;
  avg: number;
  /** The week's score: every rated song's average added up. */
  points: number;
  /** The best-rated song this week. */
  best: number;
}

export interface KaraokeBoard {
  /** The ISO week it's for, `2026-W40`. */
  week: string;
  top: KaraokeLeader[];
  /** Last week's king or queen. */
  last?: { week: string; name: string; points: number };
}

export interface KaraokeState {
  queue: KaraokeEntry[];
  turn: KaraokeTurn | null;
  /** Who holds mic 1 and mic 2 (client ids). */
  mics: [string | null, string | null];
  board: KaraokeBoard;
}

export type CheerKind = 'clap' | 'whoo';

export type KaraokeClientMsg =
  /** Came into the bowling centre: send me how the bar is. */
  | { t: 'karaoke.hello' }
  /** Into the queue: one of the bar's songs (`song`) or a YouTube link (`url`). */
  | { t: 'karaoke.queue'; song?: string; url?: string }
  /** Out of the queue again (your own entry). */
  | { t: 'karaoke.unqueue'; id: number }
  /** Take a mic off its stand (or put it back). */
  | { t: 'karaoke.mic'; mic: number; take: boolean }
  /** The singer ends their song (or gives up their turn). */
  | { t: 'karaoke.stop' }
  /** The singer's page: their video has ended (or won't play at all: `failed`). */
  | { t: 'karaoke.done'; failed?: boolean }
  /** 1–5 🔥 for the song just sung. */
  | { t: 'karaoke.rate'; stars: number }
  /** Applause. */
  | { t: 'karaoke.cheer'; kind: CheerKind };

export type KaraokeServerMsg =
  /** How the bar is now (to everyone in the centre). */
  | { t: 'karaoke'; state: KaraokeState }
  /** Someone clapped or cheered. */
  | { t: 'karaoke.cheer'; id: string; kind: CheerKind }
  /** A song's rating is in. */
  | { t: 'karaoke.rated'; name: string; title: string; avg: number; votes: number; king: boolean };

/** How long someone called up has to take a mic (ms). */
export const UP_MS = 60_000;
/** How long the room has to rate a song (ms). */
export const RATE_MS = 14_000;
/** Between taking the mic and the song starting, so everyone's band starts together (ms). */
export const LEAD_MS = 2_000;
/** A video ends at the latest after this long (ms). */
export const VIDEO_MAX_MS = 15 * 60_000;
/** A song stopped before this long (ms) isn't rated. */
export const MIN_RATED_MS = 30_000;
export const QUEUE_MAX = 20;
export const PER_PERSON = 2;
/** One clap or cheer per person per this many ms. */
export const CHEER_GAP = 350;
/** How many make the board. */
export const BOARD_SIZE = 5;

export const KARAOKE_HINT = 'Paste a link to a YouTube karaoke video';

/** A pasted link as a YouTube video for the karaoke screen, or why not. */
export function parseKaraokeLink(raw: unknown): TvStream | { error: string } {
  const link = readWebLink(raw, KARAOKE_HINT, 'on the karaoke screen');
  if ('error' in link) return link;
  const yt = youtubeVideo(link);
  if (!yt) return { error: `Only YouTube videos play on the karaoke screen. ${KARAOKE_HINT}` };
  return 'error' in yt ? yt : { kind: 'youtube', ...yt };
}

/** What a pick's called: the song's title, or the video's (once known). */
export function pickTitle(p: KaraokePick): string {
  if (p.kind === 'song') return SONG_BY_ID.get(p.id)?.title ?? 'a song';
  return p.video.title || 'a YouTube video';
}

/** The ISO week `ms` falls in (local time), as `2026-W40`. */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getDay() + 6) % 7; // Monday 0
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** The singers in a turn: the mics' holders while it's sung (the lead first). */
export function singersOf(s: Pick<KaraokeState, 'turn' | 'mics'>): string[] {
  const t = s.turn;
  if (!t || t.phase === 'up') return [];
  const out = [t.who];
  for (const m of s.mics) if (m && !out.includes(m)) out.push(m);
  return out;
}

export const NO_KARAOKE: KaraokeState = { queue: [], turn: null, mics: [null, null], board: { week: '', top: [] } };

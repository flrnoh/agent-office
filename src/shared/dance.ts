/*
 * flrnoh fork (see FORK.md "Dancing on the roof"): up on the roof anyone can dance, for as long as they
 * like, to whatever's on: the house DJ or a set someone put on at the booth. Not an emote that's over
 * in a few seconds: you start (B), pick a move (1–0, Q E, or the picker over the hint bar) and keep
 * going until you walk off. Every move is a function of the set's beat count, and every page counts
 * the same beats off the office's clock, so whoever watches you sees you hit the same beat you do.
 *
 * What's shared here: the moves (the server only keeps one of these ids per person, `dance` on the
 * peer), Freestyle's choices (which move when, from the music and who's dancing, the same on every
 * page) and the messages. The poses themselves are the page's (features/dance/poses.ts).
 */

/** The moves, in the order the keys and the picker have them: 1–9 and 0 the first ten. */
export const DANCE_MOVES = [
  { id: 'twostep', emoji: '👟', label: 'Two-Step', about: 'Side to side, snapping along' },
  { id: 'runningman', emoji: '🏃', label: 'Running Man', about: 'Knee up, slide back, every beat' },
  { id: 'robot', emoji: '🤖', label: 'Robot', about: 'Stiff, one snap a beat' },
  { id: 'shuffle', emoji: '🌀', label: 'Shuffle', about: 'Melbourne Shuffle, cutting shapes' },
  { id: 'disco', emoji: '🪩', label: 'Disco-Fieber', about: 'Saturday Night Fever: up, down, across' },
  { id: 'armwave', emoji: '🌊', label: 'Arm Wave', about: 'A wave from one hand through the other' },
  { id: 'floss', emoji: '🦷', label: 'Floss', about: 'Hips one way, arms the other' },
  { id: 'handsup', emoji: '🙌', label: 'Hands Up', about: 'Jumpstyle: hands in the air, kicks on the beat' },
  { id: 'headbang', emoji: '🤘', label: 'Headbang', about: 'Horns up, head down on every beat' },
  { id: 'vogue', emoji: '💅', label: 'Vogue', about: 'Frame the face, strike a pose every beat' },
  { id: 'moonwalk', emoji: '🌙', label: 'Moonwalk', about: 'Gliding back on the spot' },
  { id: 'bounce', emoji: '🧢', label: 'Hip-Hop Bounce', about: 'The Dougie: bounce, lean, brush the hair' },
  { id: 'macarena', emoji: '💃', label: 'Macarena', about: 'Sixteen counts of arms, then a hop round' },
] as const;

export type DanceMove = (typeof DANCE_MOVES)[number];
export type DanceMoveId = DanceMove['id'];
/** What someone dances: one move all along, or Freestyle, which picks them as the music goes. */
export type DanceId = DanceMoveId | 'freestyle';

export const FREESTYLE = { id: 'freestyle', emoji: '✨', label: 'Freestyle', about: 'Follows the music: a new move every few bars, hands up when it drops' } as const;

export const DANCE_BY_ID = new Map<string, DanceMove | typeof FREESTYLE>([...DANCE_MOVES.map((m) => [m.id, m] as const), [FREESTYLE.id, FREESTYLE]]);

/** A move someone may dance (anything else isn't one). */
export function isDance(x: unknown): x is DanceId {
  return typeof x === 'string' && DANCE_BY_ID.has(x);
}

/** How often (ms) the office takes a change of move from one person; the page waits a little longer before it sends. */
export const DANCE_THROTTLE_MS = 100;
export const DANCE_SEND_MS = 140;

// ---- The beat ---------------------------------------------------------------------------------------

/** What the dancing needs of the roof's music (the page's DjFrame has all of it). */
export interface DanceBeat {
  /** Beats since the set began (fractional). */
  beats: number;
  part: 'intro' | 'build' | 'drop' | 'breakdown';
  /** How hard it's going, 0–1. */
  energy: number;
  /** 0 → 1 through a build. */
  rise: number;
  /** Seconds since the drop landed (Infinity outside a drop). */
  sinceDrop: number;
  /** A set's own tempo; the house DJ plays drum and bass at 172. */
  bpm?: number;
}

/** The house DJ's tempo, when a frame doesn't say (client/dnb.ts' DJ_BPM). */
export const HOUSE_BPM = 172;
/** Faster than this, people dance half-time: drum and bass at 172 is danced at 86. */
const HALF_TIME_OVER = 140;

/** Beats a second the moves go at: the set's tempo, half of it when that's too fast to dance to. */
export function danceTempo(f: Pick<DanceBeat, 'bpm'>): number {
  const bpm = Math.min(200, Math.max(60, f.bpm ?? HOUSE_BPM));
  return (bpm > HALF_TIME_OVER ? bpm / 2 : bpm) / 60;
}

/** The counts the moves go by: the set's beats, or every other one when it's danced half-time. Whole numbers land on a beat. */
export function danceCounts(f: Pick<DanceBeat, 'beats' | 'bpm'>): number {
  const bpm = Math.min(200, Math.max(60, f.bpm ?? HOUSE_BPM));
  return bpm > HALF_TIME_OVER ? f.beats / 2 : f.beats;
}

// ---- Freestyle --------------------------------------------------------------------------------------

/** What Freestyle does besides the moves: swaying through a breakdown, rising with a build, jumping as the drop lands. */
export type FreestylePick = DanceMoveId | 'sway' | 'rise' | 'jump';

/** For the drop: the moves with the most go in them. */
export const FREESTYLE_HIGH: readonly DanceMoveId[] = ['runningman', 'shuffle', 'handsup', 'headbang', 'floss', 'bounce', 'twostep'];
/** For the groove (the intro, and how a set without a drop goes on): the cooler ones. */
export const FREESTYLE_GROOVE: readonly DanceMoveId[] = ['twostep', 'bounce', 'robot', 'armwave', 'disco', 'vogue', 'moonwalk', 'macarena', 'shuffle'];

/** A number from a person's id, the same on every page: who picks what. */
export function danceSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Mixes two numbers into one (0 … 2³²). */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Counts in a bar. */
const BAR = 4;
/** How long Freestyle sticks with a move: four bars, or two for some (by the seed), and a new one at the next. */
function segmentOf(counts: number, seed: number): number {
  const bars = seed % 3 === 0 ? 2 : 4;
  const offset = (seed >>> 3) % 2 ? 2 : 0; // not everyone changes on the same bar
  return Math.floor((Math.floor(counts / BAR) + offset) / bars);
}

/** The move Freestyle dances in segment `seg` out of `pool`: never the one just before it. */
function pickFrom(pool: readonly DanceMoveId[], seed: number, seg: number): DanceMoveId {
  const at = (s: number) => mix(seed, s) % pool.length;
  let i = at(seg);
  if (i === at(seg - 1)) i = (i + 1 + (mix(seed, seg + 7919) % (pool.length - 1))) % pool.length;
  return pool[i];
}

/**
 * What Freestyle dances now, for someone with `seed` (danceSeed of their id): the same on every page,
 * since it only goes by the set's beats and the seed.
 *
 * - The drop lands: a jump with both hands up (its first beat and a bit).
 * - A breakdown: swaying, hands up waving through its second half.
 * - A build: crouching lower and lower, pumping, clapping overhead at the top.
 * - The drop: the moves with the most go; the rest of the time the cooler ones. A new one every
 *   two or four bars (by the seed), never the same twice running.
 */
export function freestyleAt(f: DanceBeat, seed: number): FreestylePick {
  const beatLen = 60 / Math.min(200, Math.max(60, f.bpm ?? HOUSE_BPM));
  if (f.part === 'drop' && f.sinceDrop < beatLen * 2.5) return 'jump';
  if (f.part === 'breakdown') return 'sway';
  if (f.part === 'build') return 'rise';
  const seg = segmentOf(danceCounts(f), seed);
  return pickFrom(f.part === 'drop' && f.energy > 0.7 ? FREESTYLE_HIGH : FREESTYLE_GROOVE, seed, seg);
}

/** What someone's doing, under their name tag and in the people list (client/ui/whereabouts.ts). */
export function danceWhereabouts(id: DanceId): string {
  return `🕺 dancing: ${DANCE_BY_ID.get(id)?.label ?? id}`;
}

// ---- The messages ----------------------------------------------------------------------------------

export type DanceClientMsg =
  /** You dance this move now, or stop (null). Only up on the roof. */
  { t: 'dance.set'; move: DanceId | null };

export type DanceServerMsg =
  /** Someone started dancing, changed their move, or stopped (null). */
  { t: 'dance.moved'; id: string; move: DanceId | null };

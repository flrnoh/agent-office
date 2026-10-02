// What the office heard in a DJ set (flrnoh fork, see FORK.md): its beats, how hard each one hits,
// and where the breakdowns, builds and drops are, so the roof's lights, LED wall and DJ move to a
// set someone put on as they do to the house DJ. The server works it out from the set's audio
// (server/djbeats/); every browser on the roof gets it (GET /api/dj/beats) and turns it into the
// same DjFrame the house DJ gives (client/features/djset/frame.ts).

/** The parts of a set, as the house DJ's (client/dnb.ts). */
export type BeatPart = 'intro' | 'build' | 'drop' | 'breakdown';
export const BEAT_PARTS: readonly BeatPart[] = ['intro', 'build', 'drop', 'breakdown'];

export interface DjBeats {
  v: 1;
  /** The set's link (DjSet.url) it was heard from. */
  url: string;
  /** How long the audio is, in seconds. */
  duration: number;
  /** Its tempo, the median over the set. */
  bpm: number;
  /** Each beat, in ms from the top: the first one, then the gaps between them. */
  beats: number[];
  /** Which beat (0–3) the first bar starts on. */
  downbeat: number;
  /** Per beat, 0–255, base64: how hard the kick hits, the claps and hats, and how loud it is overall. */
  kick: string;
  hi: string;
  energy: string;
  /** Where each part starts: [beat, part index in BEAT_PARTS], in order. */
  sections: [number, number][];
}

/** How the analysis of the set that's on is going, for everyone on the roof (DjSetState.beats). */
export interface DjBeatsStatus {
  status: 'pending' | 'ready' | 'failed';
  /** Its tempo, once ready. */
  bpm?: number;
  /** Why it failed, in a few words. */
  why?: string;
}

/** A tempo someone tapped at the booth: `at` is a beat, on the office's clock (ms). */
export interface DjTap {
  bpm: number;
  at: number;
}

/** Tempos a tap may set. */
export const TAP_MIN_BPM = 60;
export const TAP_MAX_BPM = 200;

export function validTap(bpm: unknown, at: unknown): bpm is number {
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm >= TAP_MIN_BPM && bpm <= TAP_MAX_BPM && typeof at === 'number' && Number.isFinite(at) && at > 0;
}

/** The beat times in seconds. */
export function beatTimes(b: Pick<DjBeats, 'beats'>): Float64Array {
  const out = new Float64Array(b.beats.length);
  let t = 0;
  for (let i = 0; i < b.beats.length; i++) {
    t += b.beats[i];
    out[i] = t / 1000;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Whether something read back (from the cache, or the office) is a DjBeats this code can use. */
export function isDjBeats(x: unknown): x is DjBeats {
  const b = x as DjBeats;
  return (
    !!b && b.v === 1 && typeof b.url === 'string' && typeof b.bpm === 'number' && typeof b.duration === 'number' && Array.isArray(b.beats) &&
    b.beats.every((n) => typeof n === 'number') && typeof b.kick === 'string' && typeof b.hi === 'string' && typeof b.energy === 'string' &&
    Array.isArray(b.sections) && b.sections.every((s) => Array.isArray(s) && typeof s[0] === 'number' && typeof s[1] === 'number')
  );
}

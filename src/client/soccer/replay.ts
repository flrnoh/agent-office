import { REPLAY, replayContentAt, replayPlaybackMs } from '../../shared/soccer-stats';

/*
 * The soccer hall's instant replay (flrnoh fork, see FORK.md "The soccer hall"), the part without
 * three.js: every page keeps the last few seconds of what it showed (the ball, and where each player
 * stood and faced) in a ReplayBuffer, cuts the moments round a goal out of it as a clip, and plays
 * the clip back on the replay's clock (REPLAY: real speed, the last bit in slow motion). SoccerShow
 * (show.ts) puts the bodies and the ball where the clip says and flies the camera.
 */

/** Someone at a moment: [id, x, z, facing]. */
export type ReplayPlayer = [string, number, number, number];

export interface ReplayFrame {
  /** When (ms, the page's clock). */
  t: number;
  /** The ball: x, y (its bottom), z. */
  ball: [number, number, number];
  players: ReplayPlayer[];
}

export interface ReplayClip {
  from: number;
  to: number;
  frames: ReplayFrame[];
  /** Kicks in it: when, and who. */
  kicks: { t: number; id: string }[];
}

export interface ReplaySample {
  ball: { x: number; y: number; z: number };
  players: Map<string, { x: number; z: number; rotY: number; speed: number }>;
}

const lerpAngle = (a: number, b: number, k: number) => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
};

export class ReplayBuffer {
  private frames: ReplayFrame[] = [];
  private kicks: { t: number; id: string }[] = [];

  /** Keeps `keepMs` back; a frame at most every `gapMs`. */
  constructor(
    readonly keepMs = 7000,
    readonly gapMs = 30,
  ) {}

  get size(): number {
    return this.frames.length;
  }

  /** What the page shows at `t` (frames closer together than gapMs are skipped). */
  record(t: number, ball: [number, number, number], players: ReplayPlayer[]) {
    const last = this.frames.at(-1);
    if (last && t - last.t < this.gapMs) return;
    this.frames.push({ t, ball: [ball[0], ball[1], ball[2]], players: players.map((p) => [p[0], p[1], p[2], p[3]]) });
    this.trim(t);
  }

  /** Someone kicked the ball at `t` (the replay shows their leg go too). */
  kick(t: number, id: string) {
    this.kicks.push({ t, id });
    this.trim(t);
  }

  /** Forgets what's older than keepMs before `now`. */
  trim(now: number) {
    const cut = now - this.keepMs;
    let i = 0;
    while (i < this.frames.length && this.frames[i].t < cut) i++;
    if (i) this.frames.splice(0, i);
    let k = 0;
    while (k < this.kicks.length && this.kicks[k].t < cut) k++;
    if (k) this.kicks.splice(0, k);
  }

  clear() {
    this.frames = [];
    this.kicks = [];
  }

  /** The frames from `from` to `to` (and one either side, to run on from), or null with too little to show. */
  clip(from: number, to: number): ReplayClip | null {
    const fs = this.frames;
    let a = fs.findIndex((f) => f.t >= from);
    if (a < 0) return null;
    if (a > 0) a -= 1;
    let b = fs.length - 1;
    while (b > a && fs[b - 1].t > to) b--;
    const frames = fs.slice(a, b + 1);
    if (frames.length < 2 || frames.at(-1)!.t - frames[0].t < 500) return null;
    return { from: Math.max(from, frames[0].t), to: Math.min(to, frames.at(-1)!.t), frames, kicks: this.kicks.filter((k) => k.t >= from && k.t <= to) };
  }
}

/** Where everything was at `t` in `clip` (between two frames, in between). */
export function sampleClip(clip: ReplayClip, t: number): ReplaySample {
  const fs = clip.frames;
  let i = 0;
  while (i < fs.length - 2 && fs[i + 1].t <= t) i++;
  const a = fs[i];
  const b = fs[Math.min(i + 1, fs.length - 1)];
  const span = b.t - a.t;
  const k = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  const ball = { x: a.ball[0] + (b.ball[0] - a.ball[0]) * k, y: a.ball[1] + (b.ball[1] - a.ball[1]) * k, z: a.ball[2] + (b.ball[2] - a.ball[2]) * k };
  const players = new Map<string, { x: number; z: number; rotY: number; speed: number }>();
  const next = new Map(b.players.map((p) => [p[0], p]));
  for (const p of a.players) {
    const q = next.get(p[0]) ?? p;
    const speed = span > 0 ? Math.hypot(q[1] - p[1], q[2] - p[2]) / (span / 1000) : 0;
    players.set(p[0], { x: p[1] + (q[1] - p[1]) * k, z: p[2] + (q[2] - p[2]) * k, rotY: lerpAngle(p[3], q[3], k), speed });
  }
  return { ball, players };
}

/** A replay being played: `at(now)` says where in the clip it is (the clip's clock), whether that's slow motion, or that it's done. */
export class ReplayRun {
  readonly length = replayPlaybackMs();
  constructor(
    readonly clip: ReplayClip,
    readonly startedAt: number,
  ) {}

  at(now: number): { t: number; slow: boolean; progress: number } | null {
    const c = replayContentAt(now - this.startedAt);
    if (c === null) return null;
    const span = REPLAY.backMs + REPLAY.afterMs;
    // The clip's start lines up with the span's: a shorter clip plays its end (the goal) on time.
    const t = this.clip.to - span + c;
    return { t: Math.max(this.clip.from, Math.min(this.clip.to, t)), slow: c > span - REPLAY.slowMs, progress: Math.min(1, (now - this.startedAt) / this.length) };
  }
}

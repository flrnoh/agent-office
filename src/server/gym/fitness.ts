import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { levelFor, rankFor, xpForLevel, MAX_LEVEL, MAX_XP, STAMINA_MAX, STAMINA_REGEN, type FitnessProfile, type LeaderRow } from '../../shared/gym.js';
import type { GymTallies } from './game.js';

/*
 * The gym's fitness profiles (flrnoh fork, see FORK.md): everyone who works out has one, kept by who
 * they are (`account:<id>`, or `name:<name>` on the shared password), saved in the office's data
 * folder as gym.json. It holds their fitness points (XP → level), their energy (which comes back
 * over time on its own and faster in the wellness area), their lifetime tallies, their personal
 * bests and their daily streak. Nothing is ever spent or bought: it only ever grows (energy aside).
 */

interface Tallies {
  workouts: number;
  meters: number;
  calories: number;
  volume: number;
  reps: number;
  relaxSecs: number;
}

interface Profile {
  name: string;
  xp: number;
  /** Energy last time it moved, and when that was: the rest since is added on read. */
  stamina: number;
  staminaAt: number;
  totals: Tallies;
  /** Personal bests, per key (e.g. a machine's heaviest set). */
  prs: Record<string, number>;
  /** Days worked out in a row, and the last day (dayOf) one counted. */
  streak: number;
  streakDay: string;
}

/** Profiles kept at most: the busiest office won't come near it, and a flood of made-up names can't fill the disk. */
const PROFILES_KEPT = 5000;
/** At most this often is gym.json actually written (it changes every tick while people work out). */
const SAVE_EVERY = 4000;

const emptyTallies = (): Tallies => ({ workouts: 0, meters: 0, calories: 0, volume: 0, reps: 0, relaxSecs: 0 });

/** A day on the office's clock, as YYYY-MM-DD in its local time: the streak goes by it. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The day before `day` (YYYY-MM-DD → YYYY-MM-DD), for the streak. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  return dayOf(t.getTime());
}

export class Fitness {
  private all = new Map<string, Profile>();
  private file: string;
  private dirty = false;
  private lastSave = 0;

  constructor(
    dataDir: string,
    private now: () => number = Date.now,
  ) {
    this.file = path.join(dataDir, 'gym.json');
    this.load();
  }

  /** `owner`'s profile, made if new, its name kept fresh. */
  private open(owner: string, name?: string): Profile {
    let p = this.all.get(owner);
    if (!p) {
      p = { name: name ?? owner, xp: 0, stamina: STAMINA_MAX, staminaAt: this.now(), totals: emptyTallies(), prs: {}, streak: 0, streakDay: '' };
      this.all.set(owner, p);
      this.trim();
      this.markDirty();
    } else if (name && name !== p.name) {
      p.name = name;
      this.markDirty();
    }
    return p;
  }

  /** Makes sure `owner` has a profile (and their name is current). Call it when they walk in. */
  ensure(owner: string, name: string) {
    this.open(owner, name);
  }

  /** Energy `p` has right now: what was stored, plus the rest since, capped. */
  private curStamina(p: Profile): number {
    const rested = (this.now() - p.staminaAt) / 1000 * STAMINA_REGEN;
    return Math.max(0, Math.min(STAMINA_MAX, p.stamina + rested));
  }

  stamina(owner: string): number {
    return this.curStamina(this.open(owner));
  }

  /** Sets energy relative to now: fixes what the rest has brought it to, then adds `delta`. */
  addStamina(owner: string, delta: number) {
    const p = this.open(owner);
    const next = Math.max(0, Math.min(STAMINA_MAX, this.curStamina(p) + delta));
    p.stamina = next;
    p.staminaAt = this.now();
    this.markDirty();
  }

  level(owner: string): number {
    return levelFor(this.open(owner).xp);
  }

  addXp(owner: string, xp: number) {
    if (!Number.isFinite(xp) || xp <= 0) return;
    const p = this.open(owner);
    p.xp = Math.min(MAX_XP, p.xp + Math.round(xp));
    this.markDirty();
  }

  addTallies(owner: string, t: GymTallies) {
    const p = this.open(owner);
    for (const k of Object.keys(p.totals) as (keyof Tallies)[]) {
      const v = t[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) p.totals[k] = Math.min(Number.MAX_SAFE_INTEGER, p.totals[k] + v);
    }
    this.markDirty();
  }

  pr(owner: string, key: string): number {
    return this.open(owner).prs[key] ?? 0;
  }

  setPr(owner: string, key: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) return;
    const p = this.open(owner);
    if (value > (p.prs[key] ?? 0)) {
      p.prs[key] = Math.round(value);
      this.markDirty();
    }
  }

  /** A real workout happened now: one more, and the daily streak carries on (or restarts). */
  countWorkout(owner: string) {
    const p = this.open(owner);
    p.totals.workouts += 1;
    const today = dayOf(this.now());
    if (p.streakDay !== today) {
      p.streak = p.streakDay === dayBefore(today) ? p.streak + 1 : 1;
      p.streakDay = today;
    }
    this.markDirty();
  }

  /** `owner`'s profile as the page and the leaderboard read it. */
  profile(owner: string): FitnessProfile {
    const p = this.open(owner);
    const level = levelFor(p.xp);
    const base = xpForLevel(level);
    const next = level >= MAX_LEVEL ? base : xpForLevel(level + 1);
    return {
      xp: p.xp,
      level,
      rank: rankFor(level),
      levelXp: p.xp - base,
      levelSpan: Math.max(1, next - base),
      stamina: Math.round(this.curStamina(p)),
      totals: { ...p.totals },
      streak: p.streakDay === dayOf(this.now()) || p.streakDay === dayBefore(dayOf(this.now())) ? p.streak : 0,
    };
  }

  /** The top `top` by XP, with `you` flagged (and always included if they've any XP). */
  leaderboard(top: number, you: string): LeaderRow[] {
    const rows = [...this.all.entries()]
      .filter(([, p]) => p.xp > 0)
      .sort((a, b) => b[1].xp - a[1].xp)
      .map(([owner, p]) => {
        const level = levelFor(p.xp);
        return { owner, name: p.name, level, rank: rankFor(level), xp: p.xp, you: owner === you };
      });
    const head = rows.slice(0, top);
    // If you're on the board but not in the top slice, tack your line on the end so you always see it.
    if (!head.some((r) => r.you)) {
      const mine = rows.find((r) => r.you);
      if (mine) head.push(mine);
    }
    return head.map(({ name, level, rank, xp, you: y }) => ({ name, level, rank, xp, ...(y ? { you: true } : {}) }));
  }

  private trim() {
    for (const k of this.all.keys()) {
      if (this.all.size <= PROFILES_KEPT) break;
      this.all.delete(k);
    }
  }

  private markDirty() {
    this.dirty = true;
  }

  /** Writes gym.json if it's changed and it's been a while (or `force`). Driven by the gym's tick. */
  flush(force = false) {
    if (!this.dirty) return;
    const now = this.now();
    if (!force && now - this.lastSave < SAVE_EVERY) return;
    this.dirty = false;
    this.lastSave = now;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ profiles: Object.fromEntries(this.all) }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk issues shouldn't take the office down
    }
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      if (!saved || typeof saved !== 'object') return;
      for (const [owner, raw] of Object.entries((saved as { profiles?: unknown }).profiles ?? {})) {
        if (typeof owner !== 'string' || owner.length > 200) continue;
        const r = (raw ?? {}) as Partial<Profile>;
        if (typeof r.xp !== 'number' || !Number.isFinite(r.xp) || r.xp < 0) continue;
        const totals = { ...emptyTallies(), ...(r.totals && typeof r.totals === 'object' ? r.totals : {}) };
        for (const k of Object.keys(totals) as (keyof Tallies)[]) if (typeof totals[k] !== 'number' || !Number.isFinite(totals[k]) || totals[k] < 0) totals[k] = 0;
        const prs: Record<string, number> = {};
        if (r.prs && typeof r.prs === 'object') for (const [k, v] of Object.entries(r.prs)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) prs[k] = v;
        this.all.set(owner, {
          name: typeof r.name === 'string' ? r.name.slice(0, 80) : owner,
          xp: Math.min(MAX_XP, Math.floor(r.xp)),
          stamina: typeof r.stamina === 'number' && Number.isFinite(r.stamina) ? Math.max(0, Math.min(STAMINA_MAX, r.stamina)) : STAMINA_MAX,
          staminaAt: typeof r.staminaAt === 'number' && Number.isFinite(r.staminaAt) ? r.staminaAt : this.now(),
          totals,
          prs,
          streak: typeof r.streak === 'number' && Number.isFinite(r.streak) && r.streak > 0 ? Math.floor(r.streak) : 0,
          streakDay: typeof r.streakDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.streakDay) ? r.streakDay : '',
        });
      }
      this.trim();
    } catch {
      // a broken file just means everyone starts over
    }
  }
}

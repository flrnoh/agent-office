import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_CHIPS, START_CHIPS } from '../../shared/casino.js';

/*
 * The casino's chips (flrnoh fork, see FORK.md): play money only. Everyone has a wallet, kept by
 * who they are (`account:<id>`, or `name:<name>` on the shared password), saved in the office's
 * data folder as casino.json. It starts at START_CHIPS, never goes below nothing, and once a day
 * (by the office's clock) it's topped back up to START_CHIPS if it's below that.
 */

interface Wallet {
  chips: number;
  /** The day (see dayOf) it was last topped up, or opened. */
  day: string;
}

/** Wallets kept at most: the busiest office won't come near it, and a flood of made-up names can't fill the disk. */
const WALLETS_KEPT = 5000;

/** A day on the office's clock, as YYYY-MM-DD in its local time: top-ups go by it. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The next midnight after `ms`, in the office's local time: when the next top-up comes. */
export function nextMidnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export class Wallets {
  private all = new Map<string, Wallet>();
  private file: string;

  constructor(
    dataDir: string,
    private now: () => number = Date.now,
  ) {
    this.file = path.join(dataDir, 'casino.json');
    this.load();
  }

  /**
   * `owner`'s chips, after today's top-up if they're owed one: `toppedUp` says so, and by how much.
   * Someone new gets a wallet with START_CHIPS.
   */
  open(owner: string): { chips: number; toppedUp: number; nextTopUpAt?: number } {
    const today = dayOf(this.now());
    let w = this.all.get(owner);
    let toppedUp = 0;
    if (!w) {
      w = { chips: START_CHIPS, day: today };
      this.all.set(owner, w);
      this.trim();
      this.save();
    } else if (w.day !== today && w.chips < START_CHIPS) {
      toppedUp = START_CHIPS - w.chips;
      w.chips = START_CHIPS;
      w.day = today;
      this.save();
    }
    return { chips: w.chips, toppedUp, ...(w.chips < START_CHIPS ? { nextTopUpAt: nextMidnight(this.now()) } : {}) };
  }

  chips(owner: string): number {
    return this.open(owner).chips;
  }

  /** Takes `n` chips from `owner`: false (and nothing taken) when they don't have that many. */
  debit(owner: string, n: number): boolean {
    if (!Number.isInteger(n) || n < 0) return false;
    const w = this.wallet(owner);
    if (w.chips < n) return false;
    w.chips -= n;
    this.save();
    return true;
  }

  /** Gives `owner` `n` chips (winnings, a stake back). */
  credit(owner: string, n: number) {
    if (!Number.isInteger(n) || n <= 0) return;
    const w = this.wallet(owner);
    w.chips = Math.min(MAX_CHIPS, w.chips + n);
    this.save();
  }

  private wallet(owner: string): Wallet {
    this.open(owner);
    return this.all.get(owner)!;
  }

  /** The oldest-opened wallets go once there are too many (a Map keeps the order they came in). */
  private trim() {
    for (const k of this.all.keys()) {
      if (this.all.size <= WALLETS_KEPT) break;
      this.all.delete(k);
    }
  }

  private load() {
    if (!existsSync(this.file)) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      if (!saved || typeof saved !== 'object') return;
      for (const [owner, w] of Object.entries((saved as { wallets?: unknown }).wallets ?? {})) {
        const { chips, day } = (w ?? {}) as Partial<Wallet>;
        if (typeof owner !== 'string' || owner.length > 200) continue;
        if (typeof chips !== 'number' || !Number.isInteger(chips) || chips < 0 || typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        this.all.set(owner, { chips: Math.min(chips, MAX_CHIPS), day });
      }
      this.trim();
    } catch {
      // a broken file just means everyone starts over
    }
  }

  /** Written to a file beside it and moved over it, so a crash mid-write never leaves half a file. */
  private save() {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ wallets: Object.fromEntries(this.all) }), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}

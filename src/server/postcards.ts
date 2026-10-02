import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { POSTCARDS_PER_DAY, cleanPostcardText, isMotif, postDay, type Postcard, type Recipient } from '../shared/funshops.js';

/*
 * The post office's postcards (flrnoh fork, see FORK.md "Shops to walk into"): anyone in the office
 * (guests and party guests too: it's play) writes a card at the Post's counter to someone the office
 * knows. Kept in the office's data folder as postcards.json: the cards not yet delivered and how many
 * each sender sent today. A card is handed over as soon as its recipient is in (at once if they're
 * online), then dropped. Who's who goes by `account:<id>`, or `name:<name>` on the shared password,
 * like the casino's wallets.
 */

interface Waiting extends Postcard {
  /** Who it's for, and who sent it (their keys). */
  toKey: string;
  fromKey: string;
}

interface Saved {
  waiting: Waiting[];
  /** How many each sender sent on `day`. */
  sent: Record<string, { day: string; n: number }>;
}

/** Cards waiting at most (the oldest go first), so a flood can't fill the disk. */
const WAITING_KEPT = 2000;

export class Postcards {
  private data: Saved = { waiting: [], sent: {} };
  private file: string;

  constructor(
    dataDir: string,
    private now: () => number = Date.now,
  ) {
    this.file = path.join(dataDir, 'postcards.json');
    try {
      if (existsSync(this.file)) {
        const d = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>;
        this.data = {
          waiting: Array.isArray(d.waiting) ? d.waiting.filter((c) => c && isMotif(c.motif) && typeof c.toKey === 'string') : [],
          sent: d.sent && typeof d.sent === 'object' ? d.sent : {},
        };
      }
    } catch {
      // A broken file: start empty (the cards in it are lost, nothing else is).
    }
  }

  /** How many cards `fromKey` may still send today. */
  left(fromKey: string): number {
    const s = this.data.sent[fromKey];
    return s && s.day === postDay(this.now()) ? Math.max(0, POSTCARDS_PER_DAY - s.n) : POSTCARDS_PER_DAY;
  }

  /**
   * A card from `from` to `to` (one of the recipients `from` may write to): checked, cleaned up,
   * counted against today's cards, and waiting for its recipient. An error says why not.
   */
  send(from: { key: string; name: string }, to: Recipient | undefined, motif: unknown, text: unknown): Waiting | { error: string } {
    if (!to) return { error: 'Who’s that? Pick someone from the list' };
    if (to.key === from.key) return { error: 'A card to yourself? Write to someone else' };
    if (!isMotif(motif)) return { error: 'Pick a picture for the front' };
    const clean = cleanPostcardText(text);
    if (!clean) return { error: 'Write a line or two on the back first' };
    if (this.left(from.key) <= 0)
      return {
        error: `That’s ${POSTCARDS_PER_DAY} cards today: the post goes again tomorrow`,
      };
    const now = this.now();
    const day = postDay(now);
    const s = this.data.sent[from.key];
    this.data.sent[from.key] = { day, n: s && s.day === day ? s.n + 1 : 1 };
    // Yesterday's counts are no use: drop them.
    for (const [k, v] of Object.entries(this.data.sent)) if (v.day !== day) delete this.data.sent[k];
    const card: Waiting = {
      id: randomUUID(),
      from: from.name.slice(0, 40),
      to: to.name.slice(0, 40),
      motif,
      text: clean,
      at: now,
      toKey: to.key,
      fromKey: from.key,
    };
    this.data.waiting.push(card);
    if (this.data.waiting.length > WAITING_KEPT) this.data.waiting.splice(0, this.data.waiting.length - WAITING_KEPT);
    this.save();
    return card;
  }

  /** The cards waiting for `key`, handed over (and so no longer waiting). */
  collect(key: string): Postcard[] {
    const mine = this.data.waiting.filter((c) => c.toKey === key);
    if (!mine.length) return [];
    this.data.waiting = this.data.waiting.filter((c) => c.toKey !== key);
    this.save();
    return mine.map(({ toKey: _t, fromKey: _f, ...c }) => c);
  }

  private save() {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.file);
    } catch {
      // Out of disk or the folder's gone: the cards are still delivered while the office runs.
    }
  }
}

/**
 * Who someone may send a card to: everyone with an account (by name, not for party guests: they
 * see none of the team they haven't met), and everyone in the office now; never themselves. Sorted
 * by who's online, then by name.
 */
export function postRecipients(o: { me: string; party: boolean; accounts: readonly { id: string; name: string }[]; online: readonly { key: string; name: string }[] }): Recipient[] {
  const out = new Map<string, Recipient>();
  const onlineKeys = new Set(o.online.map((p) => p.key));
  if (!o.party)
    for (const a of o.accounts)
      out.set(`account:${a.id}`, {
        key: `account:${a.id}`,
        name: a.name,
        online: onlineKeys.has(`account:${a.id}`),
      });
  for (const p of o.online) if (!out.has(p.key)) out.set(p.key, { key: p.key, name: p.name, online: true });
  out.delete(o.me);
  return [...out.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

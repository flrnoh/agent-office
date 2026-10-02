import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { forOwner, sanitizeLook, type Look } from '../../shared/avatar.js';
import type { Ctx } from '../office/context.js';
import type { Client } from '../office/client.js';

// flrnoh fork (see FORK.md "Your look follows your account"): what each account looks like, so it's the
// same from any browser or device. Kept in .agent-office/account-looks.json by account id: the shirt
// color and the Look, saved whenever they change (the character window, the barber, the boutique…).
// The shared office password has no account, so its looks stay in each browser as before.

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export interface AccountLook {
  color: string;
  look: Look;
}

export class AccountLooks {
  private file: string;
  private stamp = '';
  private looks = new Map<string, AccountLook>();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'account-looks.json');
    this.sync();
  }

  get(accountId: string | undefined): AccountLook | undefined {
    if (!accountId) return undefined;
    this.sync();
    const l = this.looks.get(accountId);
    return l && { color: l.color, look: { ...l.look } };
  }

  /** Remembers `look` for the account; nothing is written when it's what was there. */
  set(accountId: string, color: string, look: Look) {
    this.sync();
    const was = this.looks.get(accountId);
    if (was && was.color === color && JSON.stringify(was.look) === JSON.stringify(look)) return;
    this.looks.set(accountId, { color, look: { ...look } });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.looks), null, 2) + '\n', { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
    this.stamp = '';
    this.sync();
  }

  private sync() {
    let stamp = '';
    try {
      const st = statSync(this.file);
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {
      // nobody's saved yet
    }
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    this.looks.clear();
    if (!stamp) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, { color?: unknown; look?: unknown }>;
      for (const [id, v] of Object.entries(saved)) {
        if (!v || typeof v.color !== 'string' || !COLOR_RE.test(v.color) || !v.look || typeof v.look !== 'object') continue;
        const look = sanitizeLook(v.look as Record<string, unknown>, { skin: 0, hair: 0, style: 0 });
        this.looks.set(id, { color: v.color, look });
      }
    } catch (err) {
      console.error(`agent-office: couldn't read ${this.file}: ${(err as Error).message}`);
    }
  }
}

/**
 * A connection's look, settled: the smoking jacket off anyone who isn't an admin, and for an account,
 * its saved look (`arriving`: put on what the account last wore, else remember what they came in with;
 * otherwise remember what they just changed to).
 */
export function settleLook(ctx: Ctx, c: Client, arriving = false) {
  c.peer.look = forOwner(c.peer.look, c.admin);
  if (!c.accountId) return;
  const saved = arriving ? ctx.looks.get(c.accountId) : undefined;
  if (saved) {
    c.peer.color = saved.color;
    c.peer.look = forOwner(saved.look, c.admin);
  } else ctx.looks.set(c.accountId, c.peer.color, c.peer.look);
}

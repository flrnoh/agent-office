// flrnoh fork (see FORK.md "Your look follows your account"): an account's look from any browser, and
// the smoking jacket that only the office's admins wear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OWNER_TOP, TOP_STYLES, forOwner, sanitizeLook, type Look } from '../src/shared/avatar.js';
import { AccountLooks, settleLook } from '../src/server/fork/looks.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';

const base: Look = { skin: 1, hair: 2, style: 3 };

function tmp() {
  return mkdtempSync(path.join(os.tmpdir(), 'ao-looks-'));
}

test('the smoking jacket is the last top, and only an admin keeps it', () => {
  assert.equal(TOP_STYLES[OWNER_TOP], 'Smoking jacket');
  assert.equal(OWNER_TOP, TOP_STYLES.length - 1, 'the wardrobe hides it by cutting the list short');
  const smoking = sanitizeLook({ ...base, top: OWNER_TOP, legs: 2 }, base);
  assert.equal(smoking.top, OWNER_TOP, 'a valid top as far as the wire goes');
  assert.deepEqual(forOwner(smoking, true), smoking);
  assert.deepEqual(forOwner(smoking, false), { ...base, legs: 2 }, 'back to a T-shirt, the rest kept');
  const blazer = { ...base, top: 3 };
  assert.equal(forOwner(blazer, false), blazer, 'anything else is left alone');
});

test('looks are kept by account in a file only the office reads, and survive a restart', () => {
  const dir = tmp();
  try {
    const a = new AccountLooks(dir);
    assert.equal(a.get('u1'), undefined);
    assert.equal(a.get(undefined), undefined);
    a.set('u1', '#123456', { ...base, top: OWNER_TOP });
    const file = path.join(dir, 'account-looks.json');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const b = new AccountLooks(dir);
    assert.deepEqual(b.get('u1'), { color: '#123456', look: { ...base, top: OWNER_TOP } });
    // A copy each time: changing it changes nothing kept.
    b.get('u1')!.look.skin = 5;
    assert.equal(b.get('u1')!.look.skin, 1);
    // Edited on disk while running (or broken): re-read, and junk entries skipped.
    writeFileSync(file, JSON.stringify({ u1: { color: 'nope', look: base }, u2: { color: '#abcdef', look: { skin: 99, hair: 1, style: 1 } } }));
    assert.equal(b.get('u1'), undefined);
    assert.equal(b.get('u2')!.color, '#abcdef');
    assert.ok(Number.isInteger(b.get('u2')!.look.skin));
    writeFileSync(file, '{');
    assert.equal(b.get('u2'), undefined, 'unreadable: nothing, rather than a crash');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arriving, an account puts on its saved look; changing it saves it; the smoking stays an admin’s', () => {
  const dir = tmp();
  try {
    const looks = new AccountLooks(dir);
    const ctx = { looks } as unknown as Ctx;
    const client = (accountId: string | undefined, admin: boolean, look: Look, color = '#4f86f7') => ({ accountId, admin, peer: { color, look } }) as unknown as Client;

    // First time anywhere: what they came in with is remembered.
    const first = client('u1', true, { ...base, top: OWNER_TOP }, '#111111');
    settleLook(ctx, first, true);
    assert.deepEqual(looks.get('u1'), { color: '#111111', look: { ...base, top: OWNER_TOP } });

    // Another browser, with its own idea of a look: the account's wins.
    const elsewhere = client('u1', true, { skin: 4, hair: 4, style: 4 });
    settleLook(ctx, elsewhere, true);
    assert.equal(elsewhere.peer.color, '#111111');
    assert.deepEqual(elsewhere.peer.look, { ...base, top: OWNER_TOP });

    // A change (the barber, the boutique, the character window) is saved for next time.
    elsewhere.peer.look = { ...base, top: OWNER_TOP, hat: 3 };
    settleLook(ctx, elsewhere);
    assert.equal(looks.get('u1')!.look.hat, 3);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'account-looks.json'), 'utf8')).u1.look.hat, 3);

    // A member asking for the smoking jacket gets a T-shirt, and that's what's saved.
    const member = client('u2', false, { ...base, top: OWNER_TOP });
    settleLook(ctx, member, true);
    assert.equal(member.peer.look.top, undefined);
    assert.equal(looks.get('u2')!.look.top, undefined);
    // An admin made a member since: their saved smoking comes off too.
    const demoted = client('u1', false, base);
    settleLook(ctx, demoted, true);
    assert.equal(demoted.peer.look.top, undefined);

    // The shared password (no account): checked, but nothing saved.
    const shared = client(undefined, true, { ...base, top: OWNER_TOP });
    settleLook(ctx, shared, true);
    assert.equal(shared.peer.look.top, OWNER_TOP, 'the shared password is an admin’s');
    const sharedMember = client(undefined, false, { ...base, top: OWNER_TOP });
    settleLook(ctx, sharedMember);
    assert.equal(sharedMember.peer.look.top, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

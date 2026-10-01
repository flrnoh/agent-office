import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Accounts } from '../src/server/accounts.js';
import { accountRole } from '../src/shared/protocol.js';

const fresh = () => new Accounts(mkdtempSync(path.join(tmpdir(), 'ao-accounts-')));

test('a role from the wire or a file: admin and guest as they are, anything else a member', () => {
  assert.equal(accountRole('admin'), 'admin');
  assert.equal(accountRole('guest'), 'guest');
  assert.equal(accountRole('member'), 'member');
  assert.equal(accountRole('root'), 'member');
  assert.equal(accountRole(undefined), 'member');
});

test('a guest invite makes a guest account, and it stays one in the file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-accounts-'));
  const accounts = new Accounts(dir);
  const invite = accounts.invite('Flo', 'guest', 'Ada');
  assert.ok(typeof invite !== 'string');
  assert.equal(invite.role, 'guest');
  const a = await accounts.join(invite.token, '', 'correct horse');
  assert.ok(typeof a !== 'string');
  assert.equal(a.role, 'guest');
  const saved = JSON.parse(readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  assert.equal(saved.accounts[0].role, 'guest');
});

test('a guest can be made a member and back', async () => {
  const accounts = fresh();
  const invite = accounts.invite('Flo', 'guest');
  assert.ok(typeof invite !== 'string');
  const a = await accounts.join(invite.token, 'Bo', 'correct horse');
  assert.ok(typeof a !== 'string');
  assert.equal(accounts.setRole(a.id, 'member')?.role, 'member');
  assert.equal(accounts.setRole(a.id, 'guest')?.role, 'guest');
});

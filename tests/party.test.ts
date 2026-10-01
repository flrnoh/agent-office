import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Accounts } from '../src/server/accounts.js';
import { accountRole, type FloorView, type ServerMsg, type WorkerInfo } from '../src/shared/protocol.js';
import { GUEST_MSGS, GUEST_QUIET, TEAM_ONLY_MSGS } from '../src/server/guests.js';
import {
  PARTY_MSGS,
  PARTY_NEVER_MSGS,
  PARTY_QUIET,
  PARTY_REDACT_MSGS,
  PARTY_SEES_MSGS,
  partyGate,
  partyJson,
  partyNote,
  partyView,
  roleMayFetch,
  watchesOnly,
} from '../src/server/party.js';

// The party guest is this fork's own (see FORK.md, "Party guests"): friends at a party on the roof
// who see none of the work. These tests pin what they may send and, above all, what they get.

test('the party role goes over the wire and through files', () => {
  assert.equal(accountRole('party'), 'party');
  assert.equal(accountRole('guest'), 'guest');
  assert.equal(accountRole('partygoer'), 'member');
  assert.equal(watchesOnly('party'), true);
  assert.equal(watchesOnly('guest'), true);
  assert.equal(watchesOnly('member'), false);
  assert.equal(watchesOnly(undefined), false);
});

test('a party invite makes a party account, kept in the file, and roles go to party and back', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-party-'));
  const accounts = new Accounts(dir);
  const invite = accounts.invite('Flo', 'party', 'Party1');
  assert.ok(typeof invite !== 'string');
  assert.equal(invite.role, 'party');
  const a = await accounts.join(invite.token, '', 'correct horse');
  assert.ok(typeof a !== 'string');
  assert.equal(a.role, 'party');
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'accounts.json'), 'utf8')).accounts[0].role, 'party');
  assert.equal(accounts.setRole(a.id, 'member')?.role, 'member');
  assert.equal(accounts.setRole(a.id, 'party')?.role, 'party');
});

test('a party guest sends what a guest may, but never watches a terminal or draws on the whiteboard', () => {
  for (const t of PARTY_MSGS) assert.ok(GUEST_MSGS.has(t), `${t} is a party guest's but not a guest's`);
  for (const t of ['worker.attach', 'worker.detach', 'wb.open', 'wb.update', 'wb.pointer', 'wb.close']) assert.ok(!PARTY_MSGS.has(t), `party guests must not send ${t}`);
  for (const t of ['move', 'act', 'chat', 'voice', 'rtc', 'emote', 'sit', 'floor.go', 'golf', 'toss', 'dj.play', 'jukebox.play', 'cabinet.play', 'cabinet.frame', 'ball.throw', 'car.drive', 'dog.pet', 'gong', 'horn', 'ping']) {
    assert.ok(PARTY_MSGS.has(t), `party guests play: ${t}`);
  }
  for (const t of TEAM_ONLY_MSGS) assert.ok(!PARTY_MSGS.has(t), `${t} is for the team`);
  for (const t of GUEST_QUIET) assert.ok(PARTY_QUIET.has(t), `${t}, dropped quietly for guests, is for party guests too`);
});

test('every server message is sorted into exactly one of sees, redact and never', () => {
  for (const t of PARTY_SEES_MSGS) {
    assert.ok(!PARTY_NEVER_MSGS.has(t), `${t} is both seen and never sent`);
    assert.ok(!PARTY_REDACT_MSGS.has(t), `${t} is both seen and redacted`);
  }
  for (const t of PARTY_NEVER_MSGS) assert.ok(!PARTY_REDACT_MSGS.has(t), `${t} is both redacted and never sent`);
  for (const t of ['screen', 'term.data', 'term.snapshot', 'term.typing', 'queue', 'changes', 'changes.diff', 'usage', 'limits', 'services', 'wb.update', 'gh.merged']) {
    assert.ok(PARTY_NEVER_MSGS.has(t), `${t} never goes to a party guest`);
  }
});

const worker = (over: Partial<WorkerInfo> = {}): WorkerInfo => ({
  id: 'w1',
  kind: 'agent',
  provider: 'claude',
  model: 'opus',
  deskId: 'd1',
  name: 'Pixel',
  color: '#ff0000',
  status: 'needs_input',
  acked: false,
  waitingSince: 1,
  createdBy: 'Florian',
  createdAt: 1,
  prompt: 'Fix the secret login bug',
  worktree: { path: '.agent-office/worktrees/x', branch: 'office/pixel', base: 'abc' },
  pr: { number: 12, url: 'https://github.com/x/y/pull/12' },
  title: 'secret title',
  sessionId: 'sess',
  cols: 80,
  rows: 24,
  viewers: ['Florian'],
  viewerIds: ['abc'],
  activity: 'Editing src/secret.ts',
  action: 'edit',
  task: { name: 'Secret task', summary: 'working on the secret' },
  usage: { input: 1, output: 2, cacheWrite: 0, cacheRead: 0, cost: 4.2, calls: 3 },
  lastInput: { by: 'Florian', at: 2 },
  ...over,
});

const view = (): FloorView => ({
  floor: 'f1',
  project: { name: 'website', dir: '/Users/x/secret', branch: 'main', remote: 'git@github.com:x/secret.git', agentCmd: 'claude', defaultProvider: 'claude', agentProviders: ['claude'] },
  workers: [worker()],
  issues: { items: [{ number: 7, title: 'Secret issue', state: 'OPEN', url: 'https://github.com/x/secret/issues/7', author: 'x', labels: [{ name: 'bug', color: '#f00' }], assignees: ['x'], createdAt: 'a', updatedAt: 'b', body: 'secret body', comments: 3 }], fetchedAt: 1, loading: false, error: 'secret error' },
  pulls: { items: [], fetchedAt: 1, loading: false },
  queue: { tasks: [{ id: 't', title: 'Secret task', prompt: 'secret prompt', addedBy: 'x', addedAt: 1, status: 'queued' }], maxWorkers: 2 },
  decor: [],
  plan: { wing: 1, labels: { d1: { text: 'Secret project', color: '#fff' } } },
  services: { items: [{ port: 5173, host: '127.0.0.1', pid: 1, command: 'vite secret', workerId: 'w1', since: 1 }], port: 4600 },
  dog: null,
  jukebox: { on: false, track: 't', startedAt: 0, elapsed: 0 } as FloorView['jukebox'],
  cabinet: { player: null, scores: [], frame: null },
  whiteboard: { elements: [{ id: 'e', secret: 'note' } as never], people: ['p'] },
  meeting: { current: { title: 'Secret meeting' } as never, past: [] },
  ball: {},
  cars: [],
  jail: { prisoners: [], bones: 0 },
});

/** The JSON a party guest gets, parsed; undefined when it's dropped. */
const got = (msg: ServerMsg): Record<string, unknown> | undefined => {
  const out = partyJson(JSON.stringify(msg));
  return out === undefined ? undefined : JSON.parse(out);
};
const noSecret = (x: unknown, what: string) => assert.ok(!/secret|Fix the|Editing|pull\/12|Florian|4\.2/i.test(JSON.stringify(x)), `${what} leaks: ${JSON.stringify(x)}`);

test('the welcome carries the building and its people, none of the work', () => {
  const welcome = {
    t: 'welcome',
    you: 'me',
    peers: [{ id: 'p', name: 'Anna', color: '#fff', look: { skin: 0, hair: 0, style: 0 }, x: 0, y: 0, z: 0, rotY: 0, moving: false, voice: false, muted: true, sharing: false, doing: "in Pixel's secret terminal", carrying: { issue: 7, title: 'Secret issue' } }],
    floors: [{ id: 'f1', name: 'website', repo: 'x/secret', dir: '/Users/x/secret', branch: 'secret-branch', palette: 0, addedBy: 'Florian', addedAt: 1, workers: 1, busy: 1, waiting: 1, people: 2, wing: 0 }],
    projectsDir: { dir: '~/secret', custom: true },
    ice: [],
    chat: [{ from: 'a', name: 'Anna', color: '#fff', text: 'cheers!', at: 1 }],
    invites: true,
    version: 'v',
    upgrade: { available: true, phase: 'idle', latest: { sha: 's', subject: 'secret', date: 'd' } },
    usage: { total: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, cost: 4.2, calls: 1 }, today: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, cost: 4.2, calls: 1 }, day: 'd', pauseHiring: false },
    limits: { windows: [{ label: 'secret week', pct: 50 }], at: 1 },
    me: { account: { name: 'Party1', role: 'party' }, admin: false, guest: true, party: true },
    notify: { webhook: { kind: 'slack', hint: 'secret', by: 'Florian', at: 1 } },
    machine: { cpu: 50, cores: 8, memUsed: 1, memTotal: 2, history: [[1, 2]], workers: 1, pressure: 'secret' },
    sky: { lat: 0, lon: 0, utcOffset: 0, weather: 'clear', intensity: 0 },
    theme: { pick: 'auto', active: null },
    map: { pick: 'office', custom: [] },
    prompts: { custom: { x: { text: 'secret prompt', by: 'Florian', at: 1 } } },
    leaveOnMerge: { on: true, by: 'Florian', at: 1 },
    ...view(),
  } as unknown as ServerMsg;
  const w = got(welcome)!;
  assert.ok(w, 'the welcome gets through');
  noSecret(w, 'the welcome');
  assert.equal((w.workers as WorkerInfo[])[0].name, 'Pixel', 'workers still sit at their desks');
  assert.equal((w.workers as WorkerInfo[])[0].status, 'working', 'waiting on someone shows as busy');
  assert.equal((w.issues as { items: unknown[] }).items.length, 1, 'the board shows there are notes');
  assert.deepEqual((w.queue as { tasks: unknown[] }).tasks, []);
  assert.deepEqual((w.chat as { text: string }[])[0].text, 'cheers!', 'chat stays');
  assert.equal((w.me as { party: boolean }).party, true);
});

test('floor.enter, worker.update, gh boards, peers and plans are redacted', () => {
  noSecret(got({ t: 'floor.enter', peers: [], ...view() }), 'floor.enter');
  const u = got({ t: 'worker.update', worker: worker() })!;
  noSecret(u, 'worker.update');
  assert.equal((u.worker as WorkerInfo).deskId, 'd1');
  const issues = got({ t: 'gh.issues', state: view().issues })!;
  noSecret(issues, 'gh.issues');
  assert.equal((issues.state as { items: { title: string }[] }).items[0].title, '');
  noSecret(got({ t: 'gh.pulls', state: { items: [{ title: 'Secret PR' } as never], fetchedAt: 1, loading: false } }), 'gh.pulls');
  noSecret(got({ t: 'peer.update', peer: { id: 'p', doing: 'secret' } as never }), 'peer.update');
  noSecret(got({ t: 'plan', plan: view().plan }), 'plan');
  noSecret(got({ t: 'meeting', state: view().meeting }), 'meeting');
  assert.deepEqual(got({ t: 'gong', why: 'merged', by: 'Anna', pr: 12 }), { t: 'gong', why: 'merged', by: 'Anna' });
});

test('terminals, screens, queue, changes, spend and settings never reach a party guest', () => {
  const never: ServerMsg[] = [
    { t: 'term.data', workerId: 'w1', data: 'secret output' },
    { t: 'term.snapshot', workerId: 'w1', data: 'secret', cols: 80, rows: 24 },
    { t: 'screen', workerId: 'w1', cols: 80, rows: 24, lines: { 0: [['secret', -1, -1, 0]] }, full: true, cursor: [0, 0] },
    { t: 'term.typing', workerId: 'w1', id: 'p' },
    { t: 'queue', state: view().queue },
    { t: 'changes', state: { workerId: 'w1', dir: '', base: 'main', ahead: 0, files: [], more: 0, at: 1 } },
    { t: 'changes.diff', workerId: 'w1', path: 'x', diff: 'secret', truncated: false },
    { t: 'usage', state: { total: worker().usage!, today: worker().usage!, day: 'd', pauseHiring: false } },
    { t: 'services', state: view().services },
    { t: 'wb.update', elements: [] },
    { t: 'gh.merged', number: 12 },
    { t: 'prompts', state: { custom: {} } },
  ];
  for (const m of never) assert.equal(partyJson(JSON.stringify(m)), undefined, `${m.t} is dropped`);
  // Its type not first: still dropped.
  assert.equal(partyJson(JSON.stringify({ workerId: 'w1', data: 'secret', t: 'term.data' })), undefined);
  // Unreadable, or a type nobody knows: dropped.
  assert.equal(partyJson('not json'), undefined);
  assert.equal(partyJson(JSON.stringify({ t: 'something.new', secret: 1 })), undefined);
  assert.equal(partyView({ t: 'nope' } as unknown as ServerMsg), undefined);
});

test('play passes as it is, and only play toasts do', () => {
  for (const m of [
    { t: 'peer.move', id: 'p', x: 1, y: 0, z: 2, rotY: 0, moving: true },
    { t: 'chat', from: 'p', name: 'Anna', color: '#fff', text: 'Prost!', at: 1 },
    { t: 'jukebox', state: { on: true, track: 't', startedAt: 0, elapsed: 0 } },
    { t: 'pong', at: 1, now: 2 },
  ]) {
    const json = JSON.stringify(m);
    assert.equal(partyJson(json), json, `${m.t} passes`);
  }
  assert.ok(got({ t: 'toast', text: '🏆 Anna set a new arcade high score: 1,200', level: 'info' }));
  assert.ok(got({ t: 'toast', text: '🎧 Anna put on a set', level: 'info' }));
  assert.equal(got({ t: 'toast', text: '📋 Pixel finished issue #12', level: 'info' }), undefined);
  assert.equal(got({ t: 'toast', text: 'Florian hired Pixel for issue #12', level: 'info' }), undefined);
});

test('the gate on the socket filters only while its client is a party guest, and their own notes get past it', () => {
  const sent: string[] = [];
  const ws = { send: (d: string) => sent.push(d), readyState: 1, OPEN: 1 } as never;
  let party = false;
  partyGate(ws, () => party);
  const send = (m: ServerMsg) => (ws as { send: (d: string) => void }).send(JSON.stringify(m));
  send({ t: 'term.data', workerId: 'w1', data: 'x' });
  assert.equal(sent.length, 1, 'a member gets the terminal');
  party = true;
  send({ t: 'term.data', workerId: 'w1', data: 'x' });
  send({ t: 'toast', text: '📋 queued', level: 'info' });
  assert.equal(sent.length, 1, 'a party guest does not');
  send({ t: 'peer.leave', id: 'p' });
  assert.equal(sent.length, 2);
  partyNote(ws, 'Take the elevator to a floor first');
  assert.equal(JSON.parse(sent[2]).text, 'Take the elevator to a floor first');
});

test('party guests fetch less than guests: not even the whiteboard', () => {
  const url = (s: string) => new URL(s, 'http://x');
  const onAWall = () => true;
  assert.equal(roleMayFetch('member', '/api/docs', url('/api/docs'), onAWall), true);
  assert.equal(roleMayFetch('guest', '/api/whiteboard/file', url('/api/whiteboard/file'), onAWall), true);
  assert.equal(roleMayFetch('party', '/api/whiteboard/file', url('/api/whiteboard/file'), onAWall), false);
  assert.equal(roleMayFetch('party', '/', url('/'), onAWall), true);
  for (const p of ['/api/docs', '/api/search', '/api/term/drop', '/api/changes/file', '/api/gh/pull', '/api/gh/issue']) {
    assert.equal(roleMayFetch('party', p, url(p), onAWall), false, `${p} is refused to party guests`);
  }
});

#!/usr/bin/env node
// End-to-end check of the party guest (flrnoh fork, FORK.md "Party guests") against a throwaway
// office: `npm run build && node tests/party-e2e.mjs`. It starts its own office on port 4711 in a
// temporary git repository under $TMPDIR (never the real one on 4600), hires only a SHELL (never a
// Claude agent), and stops the office again at the end. Exits 0 when every check passes.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'agent-office.js');
const PORT = 4711;
const BASE = `http://localhost:${PORT}`;
const ORIGIN = { origin: BASE };
const PASSWORD = 'testpass123';
const SECRET = 'SECRET_PARTY_LEAK';
const ROOF = '@roof';

const tmp = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'ao-party-e2e-'));
const repo = path.join(tmp, 'repo');
const home = path.join(tmp, 'home');
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? '  ✔' : '  ✘'} ${what}`);
  if (!ok) failures.push(what);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync('mkdir', ['-p', repo, home]);
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });

const office = spawn(process.execPath, [BIN, repo, '--port', String(PORT), '--password', PASSWORD, '--no-open', '--home', home], {
  env: { ...process.env, AGENT_OFFICE_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
office.stdout.on('data', (d) => (log += d));
office.stderr.on('data', (d) => (log += d));

const cli = (...args) => execFileSync(process.execPath, [BIN, 'accounts', ...args, '-d', repo], { encoding: 'utf8', env: { ...process.env, AGENT_OFFICE_HOME: home } });
const cookieOf = (res) => (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')]).map((c) => c.split(';')[0]).join('; ');
const post = (p, body, cookie) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

/** A socket that keeps every frame it gets. */
function connect(cookie, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?name=${name}&color=%234f86f7`, { headers: { cookie, ...ORIGIN } });
    const c = { ws, frames: [], msgs: [], send: (m) => ws.send(JSON.stringify(m)) };
    ws.on('message', (d) => {
      const s = d.toString();
      c.frames.push(s);
      c.msgs.push(JSON.parse(s));
    });
    ws.on('open', () => resolve(c));
    ws.on('error', reject);
  });
}
const waitFor = async (c, pred, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = c.msgs.find(pred);
    if (m) return m;
    await sleep(50);
  }
  return undefined;
};
const inviteToken = (out) => /\/join#([A-Za-z0-9_-]+)/.exec(out)?.[1];

try {
  // The office is up.
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);
    if (!up) await sleep(200);
  }
  if (!up) throw new Error(`the office didn't start:\n${log}`);

  // A party invite and a guest invite, from the command line.
  const partyToken = inviteToken(cli('invite', 'Party1', '--party'));
  const guestToken = inviteToken(cli('invite', 'Guest1', '--guest'));
  check(!!partyToken && !!guestToken, 'accounts invite --party and --guest print invite links');
  const peek = await post('/api/join', { token: partyToken, peek: true }).then((r) => r.json());
  check(peek.role === 'party', 'the party invite says it is one');

  const admin = cookieOf(await post('/api/login', { password: PASSWORD }));
  const party = cookieOf(await post('/api/join', { token: partyToken, name: 'Party1', password: 'partypass123' }));
  const guest = cookieOf(await post('/api/join', { token: guestToken, name: 'Guest1', password: 'guestpass123' }));
  check(!!admin && !!party && !!guest, 'admin logs in; party guest and guest join');
  check(cli('list').includes('party'), 'accounts list shows the party guest');

  // HTTP: a party guest gets the page, none of the work.
  for (const p of ['/api/docs', '/api/search?q=secret', '/api/gh/issue?number=1', '/api/whiteboard/file?id=x']) {
    const r = await fetch(BASE + p, { headers: { cookie: party } });
    check(r.status === 403, `party guest is refused ${p} (${r.status})`);
  }
  check((await fetch(`${BASE}/api/whoami`, { headers: { cookie: party } }).then((r) => r.json())).me?.party === true, '/api/whoami says party');

  const a = await connect(admin, 'Admin');
  const aw = await waitFor(a, (m) => m.t === 'welcome');
  const floor = aw?.floor;
  check(!!floor && floor !== ROOF, 'the admin arrives on the office floor');

  const p = await connect(party, 'Party1');
  const pw = await waitFor(p, (m) => m.t === 'welcome');
  check(pw?.floor === ROOF, `the party guest arrives on the rooftop bar (${pw?.floor})`);
  check(pw?.me?.party === true && pw?.me?.guest === true, 'the welcome tells the page it is a party guest');
  check(!JSON.stringify(pw).includes(repo), 'the welcome carries no path of the project');

  const g = await connect(guest, 'Guest1');
  await waitFor(g, (m) => m.t === 'welcome');

  // The admin opens a shell at a desk and types into it.
  const { SEATS } = await import(path.join(ROOT, 'dist/server/shared/layout.js'));
  a.send({ t: 'worker.spawn', deskId: SEATS[0].id, kind: 'shell' });
  const hired = await waitFor(a, (m) => m.t === 'worker.update' && m.worker.kind === 'shell');
  check(!!hired, 'the admin opened a shell');
  const wid = hired?.worker.id;
  a.send({ t: 'worker.attach', workerId: wid });
  await waitFor(a, (m) => m.t === 'term.snapshot' && m.workerId === wid);
  a.send({ t: 'term.input', workerId: wid, data: `echo ${SECRET}\r` });
  check(!!(await waitFor(a, (m) => (m.t === 'term.data' || m.t === 'term.snapshot') && m.workerId === wid && m.data.includes(SECRET))), 'the admin sees the output');

  // The party guest takes the elevator down to the floor, where the shell's laptop is.
  p.send({ t: 'floor.go', floor });
  const enter = await waitFor(p, (m) => m.t === 'floor.enter' && m.floor === floor);
  check(!!enter, 'the party guest can ride down to the floor');
  const seen = enter?.workers.find((w) => w.id === wid);
  check(!!seen && seen.name === hired?.worker.name, 'the worker still sits at its desk, by name');
  check(!!seen && !seen.createdBy && !seen.activity && !seen.task && !seen.lastInput && !seen.viewers.length, 'without who hired it, what it does, or who watches');

  // It can't watch: attaching is refused with a note, and no terminal comes.
  p.send({ t: 'worker.attach', workerId: wid });
  check(!!(await waitFor(p, (m) => m.t === 'toast' && m.text.includes('party'))), 'attaching is refused with a party note');
  a.send({ t: 'term.input', workerId: wid, data: `echo ${SECRET} again\r` });

  // Play: a drink and a word in the chat reach the admin.
  p.send({ t: 'floor.go', floor: ROOF });
  await waitFor(p, (m) => m.t === 'floor.enter' && m.floor === ROOF);
  await sleep(700); // past the act rate limit
  p.send({ t: 'act', drink: 'beer' });
  check(!!(await waitFor(a, (m) => m.t === 'peer.act' && m.drink === 'beer')), 'the party guest takes a drink, and the admin sees it');
  p.send({ t: 'chat', text: 'Prost!' });
  check(!!(await waitFor(a, (m) => m.t === 'chat' && m.text === 'Prost!')), 'the party guest chats');

  // Work only a party guest might try: refused.
  p.send({ t: 'queue.add', prompt: 'x' });
  p.send({ t: 'wb.open' });
  await sleep(300);

  // The guest (unchanged) still watches the terminal.
  g.send({ t: 'worker.attach', workerId: wid });
  check(!!(await waitFor(g, (m) => m.t === 'term.snapshot' && m.workerId === wid && m.data.includes(SECRET))), 'a guest still watches the terminal');

  await sleep(1500);
  const NEVER = ['term.data', 'term.snapshot', 'screen', 'term.typing', 'gh.merged', 'queue', 'changes', 'changes.diff', 'usage', 'limits', 'services', 'machine', 'signins', 'wb.update', 'wb.people', 'upgrade', 'notify', 'prompts'];
  const types = new Set(p.msgs.map((m) => m.t));
  const leaked = NEVER.filter((t) => types.has(t));
  check(!leaked.length, `the party guest got none of ${NEVER.join(', ')} (got: ${[...types].join(', ')})`);
  check(!p.frames.some((f) => f.includes(SECRET)), 'no frame to the party guest has the terminal output in it');
  check(!p.frames.some((f) => f.includes(repo)), 'no frame to the party guest has the project path in it');
  for (const m of p.msgs.filter((x) => x.t === 'gh.issues' || x.t === 'gh.pulls')) check(!m.state.error && m.state.items.every((i) => !i.title), `${m.t} comes blank`);
  check(g.msgs.some((m) => m.t === 'screen' && m.workerId === wid), "the guest on the floor gets the laptop's screen (so the party guest's lack of it is the filter)");
  const toasts = p.msgs.filter((m) => m.t === 'toast').map((m) => m.text);
  check(toasts.every((t) => t.startsWith('🎉')), `the party guest's toasts are its own notes only (${toasts.join(' | ')})`);
  const workers = p.msgs.filter((m) => m.t === 'worker.update').map((m) => m.worker);
  check(workers.every((w) => !w.activity && !w.task && !w.prompt && !w.usage && !w.lastInput && !w.createdBy), 'worker updates carry no work');

  // Made a member, the page is told (and reloads); its socket gets everything again.
  cli('role', 'Party1', 'member');
  check(cli('role', 'Party1', 'party').includes('party guest'), 'accounts role <name> party');
} catch (err) {
  failures.push(String(err?.stack ?? err));
  console.error(err);
} finally {
  office.kill('SIGTERM');
  await new Promise((r) => {
    const t = setTimeout(() => {
      office.kill('SIGKILL');
      r();
    }, 8000);
    office.on('exit', () => {
      clearTimeout(t);
      r();
    });
  });
  // The shell's terminal host may outlive the office: stop anything still running from the temp folder.
  try {
    execFileSync('pkill', ['-f', tmp]);
  } catch {
    // nothing left
  }
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  if (process.env.E2E_LOG) console.error(log);
  process.exit(1);
}
console.log('\nparty e2e: all checks passed');

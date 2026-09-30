import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Accounts } from './accounts.js';
import { officeHome } from './config.js';

// flrnoh fork: who holds the keys to the office's own car (Flogge's Bulli, `owned` in CARS). Kept in
// .agent-office/car-keys.json as account ids, set with `agent-office car keys <name>...`, and
// re-read when that file changes, so it works while the office runs. With nobody named, the keys
// hang by the door for every admin (and the shared office password, which is an admin's).

interface Saved {
  /** Account ids. Missing or empty: every admin. */
  owners?: string[];
}

export class CarKeys {
  private file: string;
  private stamp = '';
  private owners: string[] = [];

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'car-keys.json');
    this.sync();
  }

  /** The accounts named as keyholders; empty means every admin. */
  list(): string[] {
    this.sync();
    return [...this.owners];
  }

  /** Whether a connection (signed in as `accountId`, or on the shared password with none) may drive an owned car. */
  mayDrive(accountId: string | undefined, admin: boolean): boolean {
    this.sync();
    return this.owners.length ? !!accountId && this.owners.includes(accountId) : admin;
  }

  /** Only these accounts drive it from now on; none hands the keys back to every admin. */
  set(ids: string[]) {
    const owners = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(owners.length ? { owners } : {}, null, 2) + '\n');
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
      // nobody named yet
    }
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    this.owners = [];
    if (!stamp) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved;
      if (Array.isArray(saved.owners)) this.owners = saved.owners.filter((id): id is string => typeof id === 'string' && !!id);
    } catch (err) {
      // Unreadable: nobody named, so it's the admins' again, rather than nobody's.
      console.error(`agent-office: couldn't read ${this.file}: ${(err as Error).message}`);
    }
  }
}

const HELP = `Usage: agent-office car [command] [options]

Who may drive the office's own car, Flogge's Bulli (anyone may ride along):

  agent-office car                     Who holds the keys
  agent-office car keys <name>...      Only these accounts drive it
  agent-office car keys --admins       Back to the default: every admin, and the shared password

Options:
  -d, --dir <dir>   The office's directory (as for \`agent-office accounts\`)
  -h, --help        Show this help

Works while the office runs: it picks up the change within seconds.
`;

/** `agent-office car`: exits 0 when done, 1 when it couldn't, 2 for a usage error. */
export function carCommand(argv: string[]): number {
  let dir = existsSync(path.join(process.cwd(), '.agent-office', 'config.json')) ? process.cwd() : officeHome();
  let admins = false;
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      process.stdout.write(HELP);
      return 0;
    } else if (a === '-d' || a === '--dir') {
      if (!argv[i + 1]) return usage('--dir needs a value');
      dir = path.resolve(argv[++i]);
    } else if (a === '--admins') admins = true;
    else if (a.startsWith('-')) return usage(`unknown option ${a}`);
    else args.push(a);
  }
  const dataDir = path.join(dir, '.agent-office');
  try {
    statSync(dataDir);
  } catch {
    console.error(`agent-office car: no office has run in ${dir} yet — start it once with \`agent-office\` there`);
    return 1;
  }
  const accounts = new Accounts(dataDir);
  if (accounts.unreadableFile) return fail(`${accounts.unreadableFile} couldn't be read — fix or move it first`);
  const keys = new CarKeys(dataDir);
  const [cmd = 'show', ...names] = args;
  switch (cmd) {
    case 'show': {
      const owners = keys.list();
      if (!owners.length) console.log("🚐 Flogge's Bulli: every admin holds the keys (and the shared office password).");
      else console.log(`🚐 Flogge's Bulli: ${owners.map((id) => accounts.get(id)?.name ?? `(a revoked account, ${id})`).join(', ')} hold${owners.length === 1 ? 's' : ''} the keys.`);
      return 0;
    }
    case 'keys': {
      if (admins) {
        if (names.length) return usage('--admins takes no names');
        keys.set([]);
        console.log("🚐 The Bulli's keys are back with every admin.");
        return 0;
      }
      if (!names.length) return usage('keys needs a name (or --admins)');
      const ids: string[] = [];
      for (const n of names) {
        const a = accounts.byName(n);
        if (!a) return fail(`there's no account called ${n}`);
        ids.push(a.id);
      }
      keys.set(ids);
      console.log(`🚐 Only ${names.map((n) => accounts.byName(n)!.name).join(', ')} drive${ids.length === 1 ? 's' : ''} the Bulli now.`);
      return 0;
    }
    default:
      return usage(`unknown command ${cmd}`);
  }
}

function usage(msg: string): number {
  console.error(`agent-office car: ${msg}\n`);
  process.stderr.write(HELP);
  return 2;
}

function fail(msg: string): number {
  console.error(`agent-office car: ${msg}`);
  return 1;
}

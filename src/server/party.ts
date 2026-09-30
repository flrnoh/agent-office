import type { WebSocket } from 'ws';
import type {
  AccountRole,
  ClientMsg,
  FloorInfo,
  FloorView,
  GhIssue,
  GhPull,
  GhState,
  PeerInfo,
  ServerMsg,
  UsageState,
  WorkerInfo,
  WorkerStatus,
} from '../shared/protocol.js';
import { GUEST_MSGS, GUEST_QUIET, guestMayFetch } from './guests.js';

/*
 * The party guest (flrnoh fork, see FORK.md): friends invited to a party on the rooftop bar. They
 * walk through the whole building, drink, eat, play every game, chat and talk, but neither see nor
 * change anything of the work. A guest watches the terminals; a party guest doesn't even do that.
 *
 * Two sides, both on the office's side, whatever a party guest's page does:
 * - What they may SEND: a guest's messages (guests.ts) without the few that look at work
 *   (PARTY_EXCLUDED). Every message type is sorted for guests already, and so for party guests too.
 * - What they GET: every message the office sends them goes through `partyGate` on their socket,
 *   which passes it (PARTY_SEES), redacts it (PARTY_REDACT) or drops it (PARTY_NEVER). A message type
 *   upstream adds is in none of them, and then the server doesn't compile (see `partyAllSorted`)
 *   until someone decides what a party guest may see of it. Anything the gate can't read is dropped.
 */

// --- What a party guest may send ---------------------------------------------------------------

/** What a guest may send but a party guest may not: watching a terminal, the whiteboard (it may hold work notes). */
const PARTY_EXCLUDED = ['worker.attach', 'worker.detach', 'wb.open', 'wb.close', 'wb.update', 'wb.pointer'] as const satisfies readonly ClientMsg['t'][];
/** Of those, what the page may send by itself (closing something): dropped without a word. */
const PARTY_EXCLUDED_QUIET = ['worker.detach', 'wb.close', 'wb.pointer', 'wb.update'] as const satisfies readonly (typeof PARTY_EXCLUDED)[number][];

/** All a party guest may send: a guest's messages but those in PARTY_EXCLUDED. */
export const PARTY_MSGS: ReadonlySet<string> = new Set([...GUEST_MSGS].filter((t) => !(PARTY_EXCLUDED as readonly string[]).includes(t)));
/** Dropped without a note: what a guest's page sends by itself, and closing what a party guest can't open. */
export const PARTY_QUIET: ReadonlySet<string> = new Set([...GUEST_QUIET, ...PARTY_EXCLUDED_QUIET]);

/** The roles that only look on (guests) or only party: kept out of workers' dev servers and most of /api. */
export const watchesOnly = (role: AccountRole | undefined): boolean => role === 'guest' || role === 'party';

/**
 * What a signed-in page may load besides the page itself. Admins and members anything; guests what
 * guestMayFetch says; party guests that without the whiteboard's pictures.
 */
export function roleMayFetch(role: AccountRole | undefined, p: string, url: URL, onAWall: (imageUrl: string) => boolean): boolean {
  if (role === 'party') return p !== '/api/whiteboard/file' && guestMayFetch(p, url, onAWall);
  if (role === 'guest') return guestMayFetch(p, url, onAWall);
  return true;
}

// --- What a party guest gets ---------------------------------------------------------------------

type T = ServerMsg['t'];
type Of<K extends T> = Extract<ServerMsg, { t: K }>;

/** Play, people and the building: passed on as they are. */
const PARTY_SEES = [
  'peer.move', 'peer.leave', 'peer.act', 'golf', 'toss', 'peer.emote', 'worker.remove',
  'horn', 'dj', 'rtc', 'chat', 'decor', 'dog', 'ball', 'cars', 'car.move', 'car.honk',
  'jukebox', 'cabinet', 'cabinet.frame', 'rig', 'rig.frame', 'tv', 'sky', 'theme', 'map', 'sit.refused', 'me', 'pong',
] as const satisfies readonly T[];

/** The work, the machine and the office's settings: never sent to a party guest. */
const PARTY_NEVER = [
  // Terminals, and what a worker changed
  'screen', 'term.snapshot', 'term.data', 'term.typing', 'worker.worktree', 'changes', 'changes.diff',
  // GitHub
  'gh.merged', 'gh.commented', 'gh.closed', 'gh.labeled',
  // The whiteboard may hold work notes
  'wb.update', 'wb.people', 'wb.pointer',
  // Queue (the welcome carries an empty one), spend, plan limits, the machine, services
  'queue', 'usage', 'limits', 'machine', 'services',
  // The office's settings, the team, accounts and sign-ins
  'floor.repos', 'floor.added', 'projectsDir', 'team', 'team.invited', 'upgrade', 'notify',
  'prompts', 'leaveOnMerge', 'accounts', 'accounts.invited', 'signins', 'signins.needed',
] as const satisfies readonly T[];

type Redacted = Exclude<T, (typeof PARTY_SEES)[number] | (typeof PARTY_NEVER)[number]>;

const EMPTY_USAGE = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, calls: 0 };
const NO_USAGE: UsageState = { total: EMPTY_USAGE, today: EMPTY_USAGE, day: '', pauseHiring: false };

/**
 * A worker as a party guest sees it: someone at a desk, busy or not, with a name. Not what it's on,
 * its prompt, tools, branch, pull request, spend, or who typed or watches; and never waiting on anyone.
 */
export function partyWorker(w: WorkerInfo): WorkerInfo {
  const status: WorkerStatus = w.status === 'needs_input' ? 'working' : w.status === 'done' ? 'idle' : w.status;
  return {
    id: w.id,
    kind: w.kind,
    deskId: w.deskId,
    name: w.name,
    color: w.color,
    status,
    acked: true,
    createdBy: '',
    createdAt: w.createdAt,
    cols: w.cols,
    rows: w.rows,
    viewers: [],
    viewerIds: [],
    ...(w.meeting !== undefined ? { meeting: w.meeting } : {}),
    ...(w.workedMs !== undefined ? { workedMs: w.workedMs } : {}),
    ...(w.workingSince !== undefined ? { workingSince: w.workingSince } : {}),
    ...(w.via ? { via: w.via } : {}),
  };
}

/** Someone else: without what they have open ("in Pixel's terminal", "reading PR #12") or the issue card in their hands. */
export function partyPeer(p: PeerInfo): PeerInfo {
  const { doing: _doing, carrying: _carrying, ...rest } = p;
  return rest;
}

/** A floor on the elevator panel: its name and who's there, not its checkout, repository, branch or who's waiting. */
export function partyFloorInfo(f: FloorInfo): FloorInfo {
  return {
    id: f.id,
    name: f.name,
    dir: '',
    palette: f.palette,
    ...(f.cloning ? { cloning: true } : {}),
    ...(f.local ? { local: true } : {}),
    addedBy: '',
    addedAt: 0,
    workers: f.workers,
    busy: 0,
    waiting: 0,
    people: f.people,
    wing: f.wing,
  };
}

/** Notes on the wall board: that there are some, not what they say. */
const blankIssue = (i: GhIssue, n: number): GhIssue => ({
  number: n + 1, title: '', state: i.state, url: '', author: '', labels: [], assignees: [], createdAt: '', updatedAt: '', body: '', comments: 0,
});
const blankPull = (p: GhPull, n: number): GhPull => ({
  number: n + 1, title: '', state: p.state, isDraft: false, url: '', author: '', labels: [], reviewDecision: '', headRefName: '', baseRefName: '',
  createdAt: '', updatedAt: '', additions: 0, deletions: 0, checks: 'none', body: '', closes: [],
});
const blankGh = <I>(s: GhState<I>, blank: (item: I, n: number) => I): GhState<I> => ({ items: s.items.map(blank), fetchedAt: s.fetchedAt, loading: s.loading });

/** A floor as a party guest walks into it: the rooms, the games and the people; none of the work. */
export function partyFloorView<V extends FloorView>(v: V): V {
  return {
    ...v,
    project: v.project && { name: v.project.name, dir: '', agentCmd: '', defaultProvider: v.project.defaultProvider, agentProviders: [] },
    workers: v.workers.map(partyWorker),
    issues: blankGh(v.issues, blankIssue),
    pulls: blankGh(v.pulls, blankPull),
    queue: { tasks: [], maxWorkers: 0 },
    plan: { wing: v.plan.wing, labels: {} },
    services: { items: [], port: 0 },
    whiteboard: { elements: [], people: [] },
    meeting: { current: null, past: [] },
  };
}

/**
 * Every field of a floor view, sorted: shown as it is (play, people, the building) or blanked above in
 * `partyFloorView`. A field upstream adds to FloorView is in neither, and then the server doesn't
 * compile (the error names it) until someone decides: blank it in partyFloorView, or list it here.
 */
const VIEW_AS_IS = ['floor', 'decor', 'dog', 'jukebox', 'cabinet', 'ball', 'cars', 'jail', 'dj', 'rig', 'tv'] as const satisfies readonly (keyof FloorView)[];
const VIEW_BLANKED = ['project', 'workers', 'issues', 'pulls', 'queue', 'plan', 'services', 'whiteboard', 'meeting'] as const satisfies readonly (keyof FloorView)[];
type UnsortedView = Exclude<keyof FloorView, (typeof VIEW_AS_IS)[number] | (typeof VIEW_BLANKED)[number]>;
export const partyViewSorted: [UnsortedView] extends [never] ? true : { unsortedFloorViewField: UnsortedView } = true;

/**
 * Toasts go to everyone on a floor, and most are about the work ("Pixel finished issue #12"): a
 * party guest only gets the ones about play. What they did themselves comes back to them by
 * `partyNote`, past the gate.
 */
const PARTY_TOASTS = ['🏆', '🎵', '📻', '⏭️', '🔇', '🎧', '🐶', '🖼️'];

/**
 * Every other message: what's left of it for a party guest, or undefined to drop it. A message type
 * nobody sorted yet shows up here first, as a property missing from this object: sort it (see below).
 */
const PARTY_REDACT: { [K in Redacted]: (m: Of<K>) => Of<K> | undefined } = {
  welcome: (m) => ({
    ...partyFloorView(m),
    peers: m.peers.map(partyPeer),
    floors: m.floors.map(partyFloorInfo),
    projectsDir: { dir: '', custom: false },
    invites: false,
    upgrade: { available: false, phase: 'idle' },
    usage: NO_USAGE,
    limits: { windows: [], at: 0 },
    notify: {},
    machine: { cpu: 0, cores: 0, memUsed: 0, memTotal: 0, history: [], workers: 0 },
    prompts: { custom: {} },
    leaveOnMerge: { on: false },
  }),
  'floor.enter': (m) => ({ ...partyFloorView(m), peers: m.peers.map(partyPeer) }),
  floors: (m) => ({ t: 'floors', floors: m.floors.map(partyFloorInfo) }),
  'peer.join': (m) => ({ t: 'peer.join', peer: partyPeer(m.peer) }),
  'peer.update': (m) => ({ t: 'peer.update', peer: partyPeer(m.peer) }),
  'worker.update': (m) => ({ t: 'worker.update', worker: partyWorker(m.worker) }),
  'gh.issues': (m) => ({ t: 'gh.issues', state: blankGh(m.state, blankIssue) }),
  'gh.pulls': (m) => ({ t: 'gh.pulls', state: blankGh(m.state, blankPull) }),
  // The gong still rings (a merge is a party too), without the pull request's number.
  gong: (m) => ({ t: 'gong', why: m.why, ...(m.by ? { by: m.by } : {}) }),
  toast: (m) => (PARTY_TOASTS.some((e) => m.text.startsWith(e)) ? m : undefined),
  plan: (m) => ({ t: 'plan', plan: { wing: m.plan.wing, labels: {} } }),
  meeting: () => ({ t: 'meeting', state: { current: null, past: [] } }),
};

type Sorted = (typeof PARTY_SEES)[number] | (typeof PARTY_NEVER)[number] | keyof typeof PARTY_REDACT;
type Unsorted = Exclude<T, Sorted>;
/**
 * Fails to compile when upstream (or a feature of this fork) adds a message the office sends and
 * nobody has decided what a party guest sees of it: the error names it. Play or people → PARTY_SEES;
 * anything of the work → PARTY_NEVER; a mix → PARTY_REDACT, with what's left of it.
 */
export const partyAllSorted: [Unsorted] extends [never] ? true : { unsorted: Unsorted } = true;

export const PARTY_SEES_MSGS: ReadonlySet<string> = new Set<string>(PARTY_SEES);
export const PARTY_NEVER_MSGS: ReadonlySet<string> = new Set<string>(PARTY_NEVER);
export const PARTY_REDACT_MSGS: ReadonlySet<string> = new Set<string>(Object.keys(PARTY_REDACT));

/** What a party guest gets of `msg`: itself, a redacted copy, or undefined (dropped). Unknown types are dropped. */
export function partyView(msg: ServerMsg): ServerMsg | undefined {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return undefined;
  if (PARTY_SEES_MSGS.has(msg.t)) return msg;
  if (!Object.hasOwn(PARTY_REDACT, msg.t)) return undefined;
  const redact = PARTY_REDACT[msg.t as Redacted] as (m: ServerMsg) => ServerMsg | undefined;
  return redact(msg);
}

/** Most messages are serialized with their type first: those a party guest sees as they are pass without parsing. */
const TYPE_FIRST = /^\{"t":"([^"\\]{1,40})"/;

/** The JSON a party guest gets for `json` (one ServerMsg), or undefined to drop it. */
export function partyJson(json: string): string | undefined {
  const t = TYPE_FIRST.exec(json)?.[1];
  if (t !== undefined && PARTY_SEES_MSGS.has(t)) return json;
  if (t !== undefined && PARTY_NEVER_MSGS.has(t)) return undefined;
  let msg: ServerMsg;
  try {
    msg = JSON.parse(json) as ServerMsg;
  } catch {
    return undefined;
  }
  const out = partyView(msg);
  if (!out) return undefined;
  return out === msg ? json : JSON.stringify(out);
}

type Send = (data: unknown, ...rest: unknown[]) => void;
const rawSends = new WeakMap<WebSocket, Send>();

/**
 * The one way out to a party guest: every frame the office sends on `ws` (sendTo, broadcast,
 * toFloor, toNeighbors, terminal output, whatever upstream adds) goes through partyJson while
 * `isParty()`. Anything but a text frame is dropped for them.
 */
export function partyGate(ws: WebSocket, isParty: () => boolean): void {
  const raw = ws.send.bind(ws) as Send;
  rawSends.set(ws, raw);
  (ws as { send: Send }).send = (data: unknown, ...rest: unknown[]) => {
    if (!isParty()) return raw(data, ...rest);
    const out = typeof data === 'string' ? partyJson(data) : undefined;
    if (out !== undefined) return raw(out, ...rest);
    // Dropped: a callback still hears it's done, as ws would say.
    const cb = rest.find((r): r is () => void => typeof r === 'function');
    cb?.();
  };
}

/** A note to this party guest alone about what they just did (a refusal, a warning), past the gate's toast filter. */
export function partyNote(ws: WebSocket, text: string, level: 'info' | 'warn' | 'error' = 'warn'): void {
  const raw = rawSends.get(ws);
  if (raw && ws.readyState === ws.OPEN) raw(JSON.stringify({ t: 'toast', text, level } satisfies ServerMsg));
}

/** What a party guest hears when they try something of the work. */
export const PARTY_REFUSED = '🎉 You’re here for the party: grab a drink, play, dance — the work stays with the team';

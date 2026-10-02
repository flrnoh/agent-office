import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COUNTDOWN_MS, SEATS, type CoasterClientMsg, type CoasterLeader, type CoasterRider, type CoasterState, type CoasterTypist } from '../shared/coaster.js';
import { rideDuration } from '../shared/coaster-track.js';
import { routeStoreys } from '../shared/coaster-route.js';

/*
 * DER BRECHER, the roller coaster round the office tower (flrnoh fork, see FORK.md "Der Brecher"; the
 * track and the ride are shared/coaster-*.ts). The office keeps the train: who's in which seat, the
 * countdown once the first one's in, when it went (everyone works out where it is from that), whose
 * hands are up, and when it's back. It tells the whole building whenever any of that changes: the
 * train's seen from every floor's windows, the balconies and the street. And it keeps everyone's
 * rides and their best hands-up ride in coaster.json (0600, written beside it and moved over it).
 */

export interface CoasterPerson {
  id: string;
  /** Who they are to the records (`account:<id>` or `name:<name>`). */
  owner: string;
  name: string;
  color: string;
}

interface Seat extends CoasterRider {
  owner: string;
  /** When their hands went up (office ms), or null while they're down. */
  up: number | null;
  /** How long they've had them up this ride (ms). */
  held: number;
  lastHands: number;
}

export interface CoasterDeps {
  now?: () => number;
  /** Where coaster.json is kept (none in the tests: in memory). */
  dataDir?: string;
  /** Something changed: tell the building. */
  changed(state: CoasterState): void;
  /** How many storeys the building has now (the track's laid for it when the train goes). */
  storeys(): number;
  /** The ground floor's workers at their desks now (the tunnel runs over their heads). */
  typists(): CoasterTypist[];
  /** Runs `fn` in `ms` (setTimeout, or the tests' clock); hands back a way to cancel it. */
  later?(fn: () => void, ms: number): () => void;
}

interface Record {
  name: string;
  rides: number;
  /** The longest they held their hands up through one ride (s). */
  hands: number;
}

/** People kept at most (the oldest go first). */
const KEPT = 5000;
/** Hands up and down no more often than this (ms). */
const HANDS_EVERY = 150;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0);

/** Everyone's rides, and their best hands-up ride. */
export class CoasterRecords {
  private all = new Map<string, Record>();
  total = 0;
  private file: string | null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'coaster.json') : null;
    if (!this.file || !existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { total?: unknown; riders?: { [owner: string]: { name?: unknown; rides?: unknown; hands?: unknown } } };
      this.total = Math.floor(count(raw.total));
      for (const [owner, r] of Object.entries(raw.riders ?? {})) {
        if (typeof owner !== 'string' || !r || typeof r !== 'object') continue;
        this.all.set(owner, { name: typeof r.name === 'string' ? r.name.slice(0, 32) : '?', rides: Math.floor(count(r.rides)), hands: Math.round(count(r.hands) * 10) / 10 });
      }
    } catch {
      // A broken file starts the counts again rather than stopping the office.
    }
  }

  /** A ride's over: everyone who was on it gets it on their record. */
  record(riders: { owner: string; name: string; hands: number }[]) {
    if (!riders.length) return;
    this.total += 1;
    for (const r of riders) {
      const was = this.all.get(r.owner) ?? { name: r.name, rides: 0, hands: 0 };
      this.all.delete(r.owner);
      this.all.set(r.owner, { name: r.name.slice(0, 32), rides: was.rides + 1, hands: Math.max(was.hands, Math.round(r.hands * 10) / 10) });
    }
    while (this.all.size > KEPT) this.all.delete(this.all.keys().next().value!);
    this.save();
  }

  get(owner: string): CoasterLeader | undefined {
    const r = this.all.get(owner);
    return r && { ...r };
  }

  /** The station's board: the most rides first (then the longest hands up), and whoever has the longest hands-up ride if they're not on it already. */
  leaders(n = 5): CoasterLeader[] {
    const all = [...this.all.values()];
    const top = all.sort((a, b) => b.rides - a.rides || b.hands - a.hands || a.name.localeCompare(b.name)).slice(0, n);
    const hands = [...this.all.values()].sort((a, b) => b.hands - a.hands)[0];
    if (hands && hands.hands > 0 && !top.includes(hands)) top.push(hands);
    return top.map((r) => ({ ...r }));
  }

  private save() {
    if (!this.file) return;
    const riders = Object.fromEntries(this.all);
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ total: this.total, riders }, null, 1), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

export class Coaster {
  private phase: CoasterState['phase'] = 'load';
  private at = 0;
  private storeys = 1;
  private seats: (Seat | null)[] = Array(SEATS).fill(null);
  private ride = 0;
  private typists: CoasterTypist[] = [];
  private halted = 0;
  private timer: (() => void) | null = null;
  private watch: (() => void) | null = null;
  readonly records: CoasterRecords;
  private now: () => number;

  constructor(private d: CoasterDeps) {
    this.now = d.now ?? Date.now;
    this.records = new CoasterRecords(d.dataDir);
    this.storeys = routeStoreys(d.storeys());
    this.ride = this.records.total;
  }

  /** The train as everyone sees it. */
  state(): CoasterState {
    return {
      phase: this.phase,
      at: this.at,
      storeys: this.storeys,
      seats: this.seats.map((s) => (s ? { id: s.id, name: s.name, color: s.color, hands: s.up !== null } : null)),
      rides: this.records.total,
      ride: this.ride,
      leaders: this.records.leaders(),
      typists: this.phase === 'ride' ? this.typists : [],
      halted: this.halted,
    };
  }

  /** Who's in seat `seat`, or where `id` sits (-1 for nowhere). */
  seatOf(id: string): number {
    return this.seats.findIndex((s) => s?.id === id);
  }

  /** `p` gets in: into `seat` if it's free, else the frontmost free one. Only while the train's in the station. */
  board(p: CoasterPerson, seat?: number): { ok: true; seat: number } | { error: string } {
    if (this.phase === 'ride') return { error: 'The train’s out: wait for it to come back' };
    if (this.seatOf(p.id) >= 0) return { error: 'You’re in already: hold on tight' };
    let at = Number.isInteger(seat) && seat! >= 0 && seat! < SEATS && !this.seats[seat!] ? seat! : -1;
    if (at < 0) at = this.seats.findIndex((s) => !s);
    if (at < 0) return { error: 'The train’s full: catch the next one' };
    this.seats[at] = { id: p.id, owner: p.owner, name: p.name.slice(0, 32), color: p.color.slice(0, 16), hands: false, up: null, held: 0, lastHands: 0 };
    if (this.phase === 'load') {
      this.phase = 'count';
      this.halted = 0;
      this.at = this.now() + COUNTDOWN_MS;
      this.schedule(() => this.dispatch(), COUNTDOWN_MS);
    }
    this.d.changed(this.state());
    return { ok: true, seat: at };
  }

  /** `id` gets out again before the train goes (true when they were in). */
  leave(id: string): boolean {
    const at = this.seatOf(id);
    if (at < 0 || this.phase === 'ride') return false;
    this.seats[at] = null;
    if (this.phase === 'count' && this.seats.every((s) => !s)) {
      this.phase = 'load';
      this.at = this.now();
      this.cancel();
    }
    this.d.changed(this.state());
    return true;
  }

  /** `id` left the roof or the office: out of their seat, whatever the train's doing (true when they were in). */
  gone(id: string): boolean {
    if (this.phase !== 'ride') return this.leave(id);
    const at = this.seatOf(id);
    if (at < 0) return false;
    this.seats[at] = null;
    this.d.changed(this.state());
    return true;
  }

  /** Hands up (or down), riding. */
  hands(id: string, up: boolean): boolean {
    const s = this.seats[this.seatOf(id)];
    const now = this.now();
    if (!s || this.phase !== 'ride' || now < this.at || (s.up !== null) === up || now - s.lastHands < HANDS_EVERY) return false;
    s.lastHands = now;
    if (up) s.up = now;
    else {
      s.held += now - (s.up ?? now);
      s.up = null;
    }
    this.d.changed(this.state());
    return true;
  }

  /** The countdown's over: off it goes, laid for the building as it is now. */
  private dispatch() {
    if (this.phase !== 'count') return;
    this.phase = 'ride';
    this.at = this.now();
    this.storeys = routeStoreys(this.d.storeys());
    this.typists = this.d.typists().slice(0, 40);
    this.ride += 1;
    this.schedule(() => this.back(), rideDuration(this.storeys) * 1000);
    this.watchHeight();
    this.d.changed(this.state());
  }

  /**
   * While it's out, the building mustn't change height under it: a floor added or taken off moves the
   * roof, the station, the drop and the tube, and the train would run through the tower. So it's
   * brought straight back into the station (a ride for everyone in it), laid for the new height.
   */
  private watchHeight() {
    this.watch?.();
    this.watch = this.later(() => {
      this.watch = null;
      if (this.phase !== 'ride') return;
      if (routeStoreys(this.d.storeys()) !== this.storeys) {
        this.halted = this.ride;
        this.back();
      } else this.watchHeight();
    }, 200);
  }

  /** Whether the building is still the height the ride was laid for (it's checked every 200 ms while it's out). */
  checkHeight() {
    if (this.phase === 'ride' && routeStoreys(this.d.storeys()) !== this.storeys) {
      this.halted = this.ride;
      this.back();
    }
  }

  /** Back in the station: everyone gets it on their record, and out. */
  private back() {
    if (this.phase !== 'ride') return;
    const now = this.now();
    const riders = this.seats.filter((s): s is Seat => !!s).map((s) => ({ owner: s.owner, name: s.name, hands: (s.held + (s.up !== null ? now - s.up : 0)) / 1000 }));
    this.records.record(riders);
    this.seats = Array(SEATS).fill(null);
    this.phase = 'load';
    this.at = now;
    this.storeys = routeStoreys(this.d.storeys());
    this.typists = [];
    this.cancel();
    this.watch?.();
    this.watch = null;
    this.d.changed(this.state());
  }

  private later(fn: () => void, ms: number): () => void {
    const later =
      this.d.later ??
      ((f: () => void, t: number) => {
        const h = setTimeout(f, t);
        h.unref?.();
        return () => clearTimeout(h);
      });
    return later(fn, ms);
  }

  private schedule(fn: () => void, ms: number) {
    this.cancel();
    this.timer = this.later(fn, ms);
  }

  private cancel() {
    this.timer?.();
    this.timer = null;
  }

  stop() {
    this.cancel();
    this.watch?.();
    this.watch = null;
  }
}

export interface CoasterHooks extends CoasterPerson {
  onRoof: boolean;
  warn(text: string): void;
}

/** A coaster message from someone's page: getting in only up on the roof, at the station. */
export function coasterMessage(coaster: Coaster, msg: CoasterClientMsg, c: CoasterHooks) {
  if (msg.t === 'coaster.board') {
    if (!c.onRoof) return c.warn('DER BRECHER leaves from the roof');
    const r = coaster.board(c, typeof msg.seat === 'number' ? msg.seat : undefined);
    if ('error' in r) c.warn(r.error);
  } else if (msg.t === 'coaster.leave') coaster.leave(c.id);
  else if (msg.t === 'coaster.hands') coaster.hands(c.id, msg.up === true);
}


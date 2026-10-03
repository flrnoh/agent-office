import {
  CPU_SERVE,
  HIT_SLACK,
  IDLE_SPOT,
  PAUSE,
  SET_PAUSE,
  ballAt,
  cpuServe,
  cpuTouch,
  flightAt,
  flightEnd,
  freshState,
  hitOk,
  isHitKind,
  npcBench,
  npcHome,
  pointOf,
  serveSpot,
  setWinner,
  sideOf,
  type Flight,
  type HitKind,
  type VolleyClientMsg,
  type VolleyServerMsg,
  type VolleySide,
  type VolleyState,
} from '../shared/volley.js';

// Beach volleyball at each floor's beach (flrnoh fork, see FORK.md "A day at the beach"; the game is
// shared/volley.ts). The office keeps the score, says when a ball's down and who won the point, and
// plays the computer team (Kalle, Jette, Ole and Fiete) for any side nobody's on: when they play the
// ball, from where, and how. People's pages send their hits, which go to everyone on the floor; the
// ball's flight is worked out from the hit, so that's all anyone needs. With nobody on the court but
// someone on the beach, the computer plays both sides: a show rally. With nobody about, it rests.

/** How soon after their last hit someone can hit again (ms): a hit is a press. */
const HIT_EVERY = 180;

/** One floor's court. */
export class BeachCourt {
  state: VolleyState = freshState();
  /** Everyone on the beach (on the court or about it). */
  private near = new Set<string>();
  /** The next thing that happens by itself: the computer's touch, the ball down, the next serve. */
  private next: { at: number; run: () => void } | null = null;
  /** How many times in a row the side that last hit it has touched it. */
  private touches = 0;
  private lastSide: VolleySide | null = null;
  private hitAt = new Map<string, number>();

  constructor(
    private readonly now: () => number,
    /** Tells everyone on the floor how the court is now (`by`: whose hit it was, for their page to skip). */
    private readonly changed: (m: VolleyServerMsg) => void,
    private readonly rand: () => number = Math.random,
  ) {}

  /** Whether anything's due by itself (the office's timer only looks at these). */
  get busy(): boolean {
    return this.next !== null;
  }

  private tell(by?: string) {
    this.changed({ t: 'volley', state: this.state, ...(by ? { by } : {}) });
  }

  private humans(side: VolleySide): number {
    return Object.values(this.state.players).filter((s) => s === side).length;
  }

  /** `id` is on side `side` of the court, about it (-1), or gone (null). Says whether they've only just come down to the beach. */
  stand(id: string, side: VolleySide | -1 | null): boolean {
    const had = Object.keys(this.state.players).length > 0;
    const wasNear = this.near.has(id);
    const before = this.state.players[id];
    if (side === null) this.near.delete(id);
    else this.near.add(id);
    if (side === 0 || side === 1) this.state.players[id] = side;
    else delete this.state.players[id];
    if (before === this.state.players[id] && wasNear === this.near.has(id)) return false;
    this.rethink(had);
    return side !== null && !wasNear;
  }

  /** `id` left the floor (or the office). */
  leave(id: string) {
    if (!this.near.has(id) && !(id in this.state.players)) return;
    const had = Object.keys(this.state.players).length > 0;
    this.near.delete(id);
    delete this.state.players[id];
    this.hitAt.delete(id);
    this.rethink(had);
  }

  /** Who plays which side now: people where they are, the computer where nobody is; nobody about, the court rests. */
  private rethink(hadPlayers: boolean) {
    const s = this.state;
    const people = this.humans(0) + this.humans(1);
    if (!this.near.size) {
      this.state = freshState();
      this.next = null;
      this.lastSide = null;
      return this.tell();
    }
    const cpu: [boolean, boolean] = [this.humans(0) === 0, this.humans(1) === 0];
    const same = cpu[0] === s.cpu[0] && cpu[1] === s.cpu[1];
    s.cpu = cpu;
    if (people > 0 && !hadPlayers) {
      // People onto an empty court: a new set, and they serve.
      this.reset();
      this.serve(this.humans(0) ? 0 : 1);
    } else if (people === 0 && (hadPlayers || s.ball.k === 'idle')) {
      // Nobody on it, but someone's watching: the computer plays a show rally.
      this.reset();
      this.serve(0);
    } else if (!same) {
      // Someone's taken over (or left) a side mid-rally: whatever the computer was going to do there, it's theirs now.
      if (s.ball.k === 'fly') return this.fly(s.ball.f, s.ball.kind, s.ball.by, false);
      if (s.ball.k === 'serve') this.serve(s.ball.side);
      else this.placeNpcs();
    }
    this.tell();
  }

  private reset() {
    this.state.score = [0, 0];
    this.state.won = -1;
    this.lastSide = null;
    this.touches = 0;
  }

  /** The computer players a side the computer plays wait in their spots; the others watch from the side. */
  private placeNpcs() {
    this.state.npcs.forEach((n, i) => {
      const p = this.state.cpu[i < 2 ? 0 : 1] ? npcHome(i) : npcBench(i);
      Object.assign(n, p, { at: 0 });
    });
  }

  /** The ball over `side`'s serving spot: theirs to serve (the computer's after a moment). */
  private serve(side: VolleySide) {
    this.placeNpcs();
    this.state.ball = { k: 'serve', side };
    this.lastSide = null;
    this.touches = 0;
    if (!this.state.cpu[side]) {
      this.next = null;
      return;
    }
    const npc = side === 0 ? 0 : 2;
    const spot = serveSpot(side);
    Object.assign(this.state.npcs[npc], { x: spot.x + 0.2, z: spot.z + (side === 0 ? -0.5 : 0.5), at: this.now() + 800 });
    this.next = {
      at: this.now() + CPU_SERVE,
      run: () => this.fly({ p: spot, v: cpuServe(side, this.rand), t0: this.now(), side }, 'serve', `npc:${npc}`),
    };
  }

  /** A ball in the air: what happens next (the computer playing it, or it coming down), and everyone told. */
  private fly(f: Flight, kind: HitKind, by: string, fresh = true) {
    const s = this.state;
    if (fresh) {
      this.touches = this.lastSide === f.side ? this.touches + 1 : 1;
      this.lastSide = f.side;
    }
    s.ball = { k: 'fly', f, kind, by };
    const end = flightEnd(f);
    const lands = sideOf(end.z);
    this.placeNpcs();
    const touch = s.cpu[lands] ? cpuTouch(f, kind, lands, this.lastSide === lands ? this.touches : 0, this.rand) : null;
    if (touch) {
      const at = f.t0 + touch.s * 1000;
      Object.assign(s.npcs[touch.npc], { x: touch.at.x, z: touch.at.z + (lands === 0 ? -0.35 : 0.35), at });
      this.next = { at, run: () => this.fly({ p: touch.at, v: touch.v, t0: at, side: lands }, touch.kind, `npc:${touch.npc}`) };
    } else {
      this.next = { at: f.t0 + end.s * 1000, run: () => this.down(f) };
    }
    this.tell(fresh && !by.startsWith('npc:') ? by : undefined);
  }

  /** The ball's down: whose point, and the next serve (or the set's over). */
  private down(f: Flight) {
    const s = this.state;
    const end = flightEnd(f);
    const { won, why } = pointOf(f, end);
    s.score[won]++;
    s.ball = { k: 'down', x: end.x, y: 0.11, z: end.z, won, why };
    const set = setWinner(s.score);
    s.won = set;
    this.placeNpcs();
    this.next = {
      at: this.now() + (set >= 0 ? SET_PAUSE : PAUSE),
      run: () => {
        if (set >= 0) this.reset();
        this.serve(set >= 0 ? ((1 - set) as VolleySide) : won);
        this.tell();
      },
    };
    this.tell();
  }

  /** Whatever's due by now happens. */
  tick() {
    for (let i = 0; i < 4 && this.next && this.now() >= this.next.at; i++) {
      const run = this.next.run;
      this.next = null;
      run();
    }
  }

  /**
   * `id` hit the ball (their page says from where, and how hard): only someone on the court, near
   * where the office has the ball (allowing for the wire), not twice in a blink. A serve only from the
   * side that has it; the idle ball by the post starts a rally. Says whether it counted.
   */
  hit(id: string, p: unknown, v: unknown, kind: unknown): boolean {
    if (!hitOk(p, v) || !isHitKind(kind)) return false;
    const side = this.state.players[id];
    if (side === undefined) return false;
    const now = this.now();
    if (now - (this.hitAt.get(id) ?? -Infinity) < HIT_EVERY) return false;
    const b = this.state.ball;
    const near = (q: { x: number; y: number; z: number }, slack = HIT_SLACK) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) <= slack;
    if (b.k === 'down') return false;
    if (b.k === 'serve' && (b.side !== side || !near(serveSpot(side), HIT_SLACK + 1))) return false;
    if (b.k === 'idle' && !near(IDLE_SPOT, HIT_SLACK + 1)) return false;
    if (b.k === 'fly' && ![0, 150, 300, 450, 600].some((ago) => near(flightAt(b.f, now - ago)))) return false;
    this.hitAt.set(id, now);
    const v3 = v as { x: number; y: number; z: number };
    this.fly({ p: { x: p.x, y: p.y, z: p.z }, v: { x: v3.x, y: v3.y, z: v3.z }, t0: now, side: sideOf(p.z) }, b.k === 'fly' ? kind : 'serve', id);
    return true;
  }

  /** Where the office has the ball now (for tests). */
  ball() {
    return ballAt(this.state.ball, this.now());
  }
}

/** Every floor's court, made when someone first comes down to the beach. */
export class Beaches {
  private byFloor = new Map<string, BeachCourt>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly send: (floorId: string, m: VolleyServerMsg) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  of(floorId: string): BeachCourt {
    let c = this.byFloor.get(floorId);
    if (!c) this.byFloor.set(floorId, (c = new BeachCourt(this.now, (m) => this.send(floorId, m))));
    return c;
  }

  /** `id` is gone from floor `floorId` (left it, or the office). */
  leave(floorId: string | undefined, id: string) {
    if (floorId) this.byFloor.get(floorId)?.leave(id);
  }

  start(every = 50) {
    this.timer ??= setInterval(() => {
      for (const c of this.byFloor.values()) if (c.busy) c.tick();
    }, every);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

const SIDES = new Set<unknown>([0, 1, -1, null]);

/** A volley.* message from someone's page on floor `floorId`; `answer` goes to them alone. */
export function volleyMessage(beaches: Beaches, floorId: string | undefined, id: string, msg: VolleyClientMsg, answer: (m: VolleyServerMsg) => void) {
  if (!floorId) return;
  const court = beaches.of(floorId);
  if (msg.t === 'volley.stand') {
    // Someone just come down to the beach hears how the court is, even if nothing changed for anyone else.
    if (SIDES.has(msg.side) && court.stand(id, msg.side as VolleySide | -1 | null)) answer({ t: 'volley', state: court.state });
    return;
  }
  court.hit(id, msg.p, msg.v, msg.kind);
}

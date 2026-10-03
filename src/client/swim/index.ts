import type * as THREE from 'three';
import { atEdge, climbOutAt, inPoolAt, overPool, poolAt, surfaceAt, wallTouched, type PoolDef } from '../../shared/swim';
import { stepTo, type Body } from '../player/collide';
import type { Person } from '../world/character';
import { seaPose } from '../features/beach/poses';

/*
 * Swimming, one controller for every pool (flrnoh fork, see FORK.md "Swimming"; the pools are data,
 * shared/swim.ts PoolDef). Jump in (or E at the water for a header) and the pool holds you
 * (PlayerController.rig): slower going, your head bobbing at its surface, lifted by its waves and
 * carried by its current if it has them, E at a wall to climb out onto its deck. A pool that times
 * lengths times each one wall to wall and keeps your best in this browser. Everyone in a pool is
 * posed swimming from where they are (inPoolAt), so nothing new goes over the wire.
 */

/** What of you the water moves (the PlayerController; a stub in the tests). */
export interface SwimBody extends Body {
  pos: THREE.Vector3;
  rig: ((dt: number) => void) | null;
  seat: unknown;
  vy: number;
  moving: boolean;
  facing: number;
  camYaw: number;
  view: 'first' | 'third';
  holding(...codes: string[]): boolean;
  stopWalking(): void;
}

export interface SwimHooks {
  /** Into the water at (x, z), `strength` 0..1 how hard. */
  splash?(x: number, z: number, strength: number): void;
  stroke(x: number, z: number): void;
  out(): void;
  /** A length done: what to say. */
  lap?(text: string): void;
}

export class Swimmer {
  swimming = false;
  /** The pool you're in. */
  pool: PoolDef | null = null;
  private dunk = 0;
  private strokeT = 0;
  private t = 0;
  /** How high you've been since you were last on your feet: how hard you go in. */
  private peak = -Infinity;
  /** The wall the length you're swimming started from, and when. */
  private from: 'lo' | 'hi' | null = null;
  private since = 0;
  private lengths = 0;
  private posed = new Map<Person, { moving: boolean }>();

  constructor(
    private player: SwimBody,
    /** The pools where you are now. */
    private pools: () => readonly PoolDef[],
    private hooks: SwimHooks,
    /** The office's clock (ms), which waves and currents keep time by. */
    private now: () => number = Date.now,
  ) {}

  /** At a wall, near enough to climb out. */
  get atEdge(): boolean {
    return this.swimming && !!this.pool && atEdge(this.pool, this.player.pos.x, this.player.pos.z);
  }

  /** E at the water from the deck: a header in, toward the middle of the nearest stretch of `def`. */
  jumpIn(def: PoolDef | undefined = this.pools()[0]) {
    const p = this.player;
    if (!def || this.swimming || p.rig || p.seat || p.pos.y < def.deck - 0.2) return;
    const d = (r: PoolDef['rects'][number]) => Math.hypot(p.pos.x - Math.min(r.maxX, Math.max(r.minX, p.pos.x)), p.pos.z - Math.min(r.maxZ, Math.max(r.minZ, p.pos.z)));
    const r = [...def.rects].sort((a, b) => d(a) - d(b))[0];
    const clamp = (v: number, lo: number, hi: number, m: number) => (hi - lo > 2 * m ? Math.min(hi - m, Math.max(lo + m, v)) : (lo + hi) / 2);
    p.stopWalking();
    p.pos.set(clamp(p.pos.x, r.minX, r.maxX, 1.2), Math.max(p.pos.y, def.deck) + 0.9, clamp(p.pos.z, r.minZ, r.maxZ, 1.0));
    p.vy = 3.2;
    p.grounded = false;
  }

  /** Every frame where there are pools: into the water once you're over one and below its surface. */
  tick(_dt: number) {
    const p = this.player;
    if (this.swimming) return;
    if (p.rig || p.seat) {
      this.peak = p.pos.y;
      return;
    }
    this.peak = Math.max(this.peak, p.pos.y);
    const def = poolAt(this.pools(), p.pos.x, p.pos.z, 0.2);
    if (def && p.pos.y < def.surface) {
      const jump = Math.min(1, Math.max(0, (this.peak - def.surface) / def.jumpScale));
      this.into(def, jump);
      this.hooks.splash?.(p.pos.x, p.pos.z, 0.35 + 0.65 * jump);
      this.peak = p.pos.y;
      return;
    }
    if (p.grounded) this.peak = p.pos.y;
  }

  /** Into `def`'s water where you are, `jump` 0..1 how hard you went in. */
  into(def: PoolDef, jump: number) {
    if (this.swimming) return;
    const p = this.player;
    this.swimming = true;
    this.pool = def;
    this.dunk = def.dunk.base + def.dunk.extra * jump;
    this.from = null;
    p.stopWalking();
    p.vy = 0;
    p.rig = (dt) => this.step(dt);
  }

  /** Out of the water's hold where you are (something else moved you, or you left the place). */
  leave() {
    if (!this.swimming) return;
    this.swimming = false;
    this.pool = null;
    this.dunk = 0;
    if (this.player.rig) this.player.rig = null;
  }

  /** Up over the nearest wall onto the deck. */
  climbOut() {
    const def = this.pool;
    if (!def || !this.atEdge) return;
    const p = this.player;
    const at = climbOutAt(def, p.pos.x, p.pos.z);
    this.leave();
    p.pos.set(at.x, def.deck, at.z);
    p.vy = 0;
    p.grounded = true;
    this.hooks.out();
  }

  /** Along (dx, dz), past what's in the way as the pool has it (its walls at your height, or at its own). */
  private move(def: PoolDef, dx: number, dz: number) {
    const p = this.player;
    const sunk = p.pos.y;
    if (def.wallsAt !== undefined) p.pos.y = def.wallsAt;
    stepTo(p, p.pos.x + dx, p.pos.z);
    stepTo(p, p.pos.x, p.pos.z + dz);
    p.pos.y = sunk;
  }

  private step(dt: number) {
    const p = this.player;
    const def = this.pool;
    if (!def) return;
    this.t += dt;
    let ix = 0;
    let iz = 0;
    if (p.holding('KeyW', 'ArrowUp')) iz -= 1;
    if (p.holding('KeyS', 'ArrowDown')) iz += 1;
    if (p.holding('KeyA', 'ArrowLeft')) ix -= 1;
    if (p.holding('KeyD', 'ArrowRight')) ix += 1;
    const steering = ix !== 0 || iz !== 0;
    p.moving = steering;
    if (p.view === 'first') p.facing = Math.atan2(Math.sin(p.camYaw + Math.PI), Math.cos(p.camYaw + Math.PI));
    const now = this.now();
    if (steering) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      const sin = Math.sin(p.camYaw);
      const cos = Math.cos(p.camYaw);
      const dx = ix * cos + iz * sin;
      const dz = -ix * sin + iz * cos;
      const speed = p.holding('ShiftLeft', 'ShiftRight') ? def.fast : def.speed;
      p.grounded = false;
      this.move(def, dx * speed * dt, dz * speed * dt);
      if (p.view === 'third') {
        const want = Math.atan2(dx, dz);
        p.facing += Math.atan2(Math.sin(want - p.facing), Math.cos(want - p.facing)) * Math.min(1, dt * 8);
      }
      this.strokeT += dt;
      if (this.strokeT > def.strokeEvery) {
        this.strokeT = 0;
        this.hooks.stroke(p.pos.x, p.pos.z);
      }
    }
    // The current carries you along, swimming or not (the walls still keep you in).
    const f = def.flow?.(p.pos.x, p.pos.z, now);
    if (f && (f.x || f.z)) this.move(def, f.x * dt, f.z * dt);
    this.dunk *= Math.exp(-dt * 2.5);
    const want = surfaceAt(def, p.pos.x, p.pos.z, now) - def.sink - this.dunk + Math.sin(this.t * 2.2) * 0.04;
    p.pos.y += (want - p.pos.y) * Math.min(1, dt * 9);
    // Carried out of the water's reach by its waves or its current (onto a beach): back on your feet.
    if ((def.swell || def.flow) && !overPool(def, p.pos.x, p.pos.z)) this.leave();
    else this.timeLengths(def);
  }

  /** Wall to wall: a length, timed. */
  private timeLengths(def: PoolDef) {
    const L = def.lengths;
    if (!L) return;
    const { x, z } = this.player.pos;
    const wall = wallTouched(def, x, z);
    if (!wall) return;
    const now = performance.now();
    if (this.from && wall !== this.from) {
      const secs = (now - this.since) / 1000;
      this.lengths++;
      let best = Infinity;
      try {
        best = Number(localStorage.getItem(L.key)) || Infinity;
        if (secs < best) localStorage.setItem(L.key, secs.toFixed(1));
      } catch {
        // private mode: no best kept
      }
      const record = secs < best ? ' · 🏅 personal best!' : Number.isFinite(best) ? ` · best ${best.toFixed(1)} s` : '';
      const where = L.where?.(x, z);
      this.hooks.lap?.(`🏊 Length ${this.lengths}${where ? ` · ${where}` : ''} · ${L.meters} m in ${secs.toFixed(1)} s${record}`);
    }
    if (wall !== this.from || !this.from) this.since = now;
    this.from = wall;
  }

  /** Poses whoever is swimming (you and everyone else, by where their feet are), and lets go of whoever got out. */
  pose(bodies: readonly { person: Person; moving: boolean; x: number; y: number; z: number }[]) {
    const pools = this.pools();
    const now = new Set<Person>();
    for (const b of bodies) {
      const def = pools.find((d) => inPoolAt(d, b.x, b.y, b.z));
      if (!def) continue;
      now.add(b.person);
      const st = this.posed.get(b.person);
      if (st) {
        st.moving = b.moving;
        continue;
      }
      const mine = { moving: b.moving };
      const phase = this.posed.size * 0.9 + 0.4;
      this.posed.set(b.person, mine);
      b.person.setWorkout((bones, _dt, tt) => seaPose(bones, def.sink, mine.moving, tt, phase));
    }
    for (const person of [...this.posed.keys()])
      if (!now.has(person)) {
        person.setWorkout(null);
        this.posed.delete(person);
      }
  }

  /** Out of the place: nobody's posed by its pools any more, and you're out of the water. */
  release() {
    for (const person of this.posed.keys()) person.setWorkout(null);
    this.posed.clear();
    this.leave();
  }
}


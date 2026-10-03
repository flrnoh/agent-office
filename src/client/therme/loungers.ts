import { LOUNGERS, LOUNGER_HIPS } from '../../shared/therme-paradies';
import { dorfSeats } from '../../shared/therme-dorf';
import { SUN_LOUNGERS } from '../../shared/therme-lagune';
import type { SeatPlace } from '../../shared/layout';
import type { Person } from '../world/character';
import { liePose } from '../features/lounging';
import { toast } from '../ui/dom';

// The thermal baths' seats (flrnoh fork, see shared/therme-paradies.ts, shared/therme-dorf.ts): the
// loungers by the pools and in the Ruhehaus (you lie back on them, hands behind your head: the roof's
// and the gym's liePose) and the saunas' benches, tier by tier (you sit). As the Schallwerk's sofas
// (client/venue/seats.ts) nobody tells the office: E sits or lays you down (W A S D gets you up), and
// every page sits or lays down whoever stands still on one's spot.

interface Seat {
  id: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  pose: 'sit' | 'lie';
}

const SEATS: readonly Seat[] = [...[...LOUNGERS, ...SUN_LOUNGERS].map((l) => ({ ...l, y: 0, pose: 'lie' as const })), ...dorfSeats()];
const BY_ID = new Map(SEATS.map((s) => [s.id, s]));
/** How close to a seat's spot someone must stand still to be on it. */
const ON_SEAT = 0.3;
/** How high your hips are over a seat's top: a bench's edge, a lounger's cushion. */
const HIPS = { sit: 0.42, lie: LOUNGER_HIPS } as const;

export const thermeSeat = (id: string) => BY_ID.get(id);

export interface LoungerHost {
  you(): string;
  people(): { id: string; x: number; y: number; z: number; moving: boolean; person: Person | undefined }[];
  player: { seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void };
  me(): Person;
  /** Whether one of the baths' other bathers lies there (client/therme/bathers.ts). */
  npc?(id: string): boolean;
}

export class ThermeLoungers {
  private posed = new Map<string, Person>();
  private mine: Person | null = null;

  constructor(private host: LoungerHost) {}

  taken(id: string): boolean {
    const l = BY_ID.get(id);
    if (!l) return true;
    if (this.host.npc?.(id)) return true;
    return this.host.people().some((p) => p.id !== this.host.you() && !p.moving && Math.abs(p.x - l.x) < ON_SEAT && Math.abs(p.z - l.z) < ON_SEAT && Math.abs(p.y - l.y) < 0.3);
  }

  /** E at a seat: down you sit or lie (or up again, if it's yours). */
  lie(id: string) {
    if (this.host.player.seat?.seatId === id) return this.host.player.stand();
    const l = BY_ID.get(id);
    if (!l) return;
    if (this.taken(id)) return toast(l.pose === 'lie' ? 'Die Liege ist schon belegt' : 'Da sitzt schon jemand', 'warn');
    this.host.player.sit({ key: id, seatId: id, x: l.x, y: l.y, z: l.z, rotY: l.rotY, hips: HIPS[l.pose], out: l.pose === 'lie' ? 0.8 : 0.55 });
  }

  private place(person: Person, s: Seat, phase: number) {
    person.sit(HIPS[s.pose]);
    if (s.pose === 'lie') person.setWorkout((b, _dt, t) => liePose(b, LOUNGER_HIPS, 'recline', t, phase));
  }

  private lift(person: Person, s: Seat | undefined) {
    person.sit(null);
    if (s?.pose === 'lie') person.setWorkout(null);
  }

  /** Each frame: you on yours, and everyone else standing still on one, sitting or lying; up again once off it. */
  pose() {
    const me = this.host.me();
    const seat = this.host.player.seat ? BY_ID.get(this.host.player.seat.seatId ?? '') : undefined;
    if (seat && !this.mine) {
      this.place(me, seat, 0.4);
      this.mine = me;
    } else if (!seat && this.mine) {
      this.mine.setWorkout(null);
      this.mine = null;
    }
    const seen = new Set<string>();
    for (const p of this.host.people()) {
      if (p.id === this.host.you() || !p.person) continue;
      const s = !p.moving ? SEATS.find((q) => Math.abs(q.x - p.x) < ON_SEAT && Math.abs(q.z - p.z) < ON_SEAT && Math.abs(p.y - q.y) < 0.4) : undefined;
      if (!s) continue;
      seen.add(p.id);
      if (!this.posed.has(p.id)) this.place(p.person, s, this.posed.size * 1.3 + 1);
      p.person.root.rotation.y = s.rotY;
      this.posed.set(p.id, p.person);
    }
    for (const [id, person] of this.posed) {
      if (seen.has(id)) continue;
      this.lift(person, { pose: 'lie' } as Seat);
      this.posed.delete(id);
    }
  }

  /** Out of the baths: nobody's drawn on a seat any more. */
  clear() {
    for (const person of this.posed.values()) this.lift(person, { pose: 'lie' } as Seat);
    this.posed.clear();
    if (this.mine) this.mine.setWorkout(null);
    this.mine = null;
  }
}

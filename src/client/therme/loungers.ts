import { LOUNGERS, LOUNGER_HIPS } from '../../shared/therme-paradies';
import type { SeatPlace } from '../../shared/layout';
import type { Person } from '../world/character';
import { liePose } from '../features/lounging';
import { toast } from '../ui/dom';

// The thermal baths' loungers (flrnoh fork, see shared/therme-paradies.ts), as the Schallwerk's sofas
// (client/venue/seats.ts): nobody tells the office; E lays you down on one (W A S D gets you up), and
// every page lays down whoever stands still on a lounger's spot. Lying is the roof's and the gym's
// (features/lounging liePose), hands behind your head.

const BY_ID = new Map(LOUNGERS.map((l) => [l.id, l]));
/** How close to a lounger's spot someone must stand still to be lying on it. */
const ON_SEAT = 0.3;

export interface LoungerHost {
  you(): string;
  people(): { id: string; x: number; y: number; z: number; moving: boolean; person: Person | undefined }[];
  player: { seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void };
  me(): Person;
}

export class ThermeLoungers {
  private lying = new Map<string, Person>();
  private mine: Person | null = null;

  constructor(private host: LoungerHost) {}

  taken(id: string): boolean {
    const l = BY_ID.get(id);
    if (!l) return true;
    return this.host.people().some((p) => p.id !== this.host.you() && !p.moving && Math.abs(p.x - l.x) < ON_SEAT && Math.abs(p.z - l.z) < ON_SEAT);
  }

  /** E at a lounger: down you lie (or up again, if it's yours). */
  lie(id: string) {
    if (this.host.player.seat?.seatId === id) return this.host.player.stand();
    const l = BY_ID.get(id);
    if (!l) return;
    if (this.taken(id)) return toast('Die Liege ist schon belegt', 'warn');
    this.host.player.sit({ key: id, seatId: id, x: l.x, y: 0, z: l.z, rotY: l.rotY, hips: LOUNGER_HIPS, out: 0.8 });
  }

  private lay(person: Person, phase: number) {
    person.sit(LOUNGER_HIPS);
    person.setWorkout((b, _dt, t) => liePose(b, LOUNGER_HIPS, 'recline', t, phase));
  }

  /** Each frame: you on yours, and everyone else standing still on one, lying back; up again once off it. */
  pose() {
    const me = this.host.me();
    const onMine = !!this.host.player.seat && BY_ID.has(this.host.player.seat.seatId ?? '');
    if (onMine && !this.mine) {
      this.lay(me, 0.4);
      this.mine = me;
    } else if (!onMine && this.mine) {
      this.mine.setWorkout(null);
      this.mine = null;
    }
    const seen = new Set<string>();
    for (const p of this.host.people()) {
      if (p.id === this.host.you() || !p.person) continue;
      const l = !p.moving ? LOUNGERS.find((q) => Math.abs(q.x - p.x) < ON_SEAT && Math.abs(q.z - p.z) < ON_SEAT && Math.abs(p.y) < 0.4) : undefined;
      if (!l) continue;
      seen.add(p.id);
      if (!this.lying.has(p.id)) this.lay(p.person, this.lying.size * 1.3 + 1);
      p.person.root.rotation.y = l.rotY;
      this.lying.set(p.id, p.person);
    }
    for (const [id, person] of this.lying) {
      if (seen.has(id)) continue;
      person.sit(null);
      person.setWorkout(null);
      this.lying.delete(id);
    }
  }

  /** Out of the baths: nobody's drawn lying any more. */
  clear() {
    for (const person of this.lying.values()) {
      person.sit(null);
      person.setWorkout(null);
    }
    this.lying.clear();
    if (this.mine) this.mine.setWorkout(null);
    this.mine = null;
  }
}

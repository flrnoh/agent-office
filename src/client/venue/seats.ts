import { sofaSeats } from '../../shared/venue-house';
import type { SeatPlace } from '../../shared/layout';
import type { Person } from '../world/character';
import { toast } from '../ui/dom';

// The green room's sofas (flrnoh fork, see FORK.md "The Schallwerk"), as the bowling lounge's: nobody
// tells the office; E sits you down, walking gets you up, and every page sits down whoever stands
// still on a sofa's seat.

const SEATS = sofaSeats();
const SEAT_BY_KEY = new Map(SEATS.map((s) => [s.key, s]));
/** How close to a seat's spot someone must stand still to be sitting on it. */
const ON_SEAT = 0.25;
const SOFA_HIPS = 0.44;

export interface SofaHost {
  you(): string;
  people(): { id: string; x: number; y: number; z: number; moving: boolean; seated: boolean; person: Person | undefined }[];
  player: { seat: SeatPlace | null; sit(p: SeatPlace): void; stand(): void };
  me(): Person;
}

export class VenueSofas {
  private sitting = new Map<string, Person>();

  constructor(private host: SofaHost) {}

  /** Someone else is sitting there. */
  taken(key: string): boolean {
    const s = SEAT_BY_KEY.get(key);
    if (!s) return true;
    return this.host.people().some((p) => p.id !== this.host.you() && !p.moving && Math.abs(p.x - s.x) < ON_SEAT && Math.abs(p.z - s.z) < ON_SEAT);
  }

  /** E on a seat: down you sit (or up again, if it's yours). */
  sit(key: string) {
    if (this.host.player.seat?.seatId === key) return this.host.player.stand();
    const s = SEAT_BY_KEY.get(key);
    if (!s) return;
    if (this.taken(key)) return toast('Da sitzt schon jemand', 'warn');
    this.host.player.sit({ key, seatId: key, x: s.x, y: 0, z: s.z, rotY: s.rotY, hips: SOFA_HIPS, out: 0.75 });
    this.host.me().sit(SOFA_HIPS);
  }

  /** Each frame: everyone else standing still on a seat sits down on it, and gets up once they're off it. */
  pose() {
    const seen = new Set<string>();
    for (const p of this.host.people()) {
      if (p.id === this.host.you() || !p.person) continue;
      const s = !p.moving && !p.seated ? SEATS.find((q) => Math.abs(q.x - p.x) < ON_SEAT && Math.abs(q.z - p.z) < ON_SEAT && Math.abs(p.y) < 0.4) : undefined;
      if (!s) continue;
      seen.add(p.id);
      p.person.sit(SOFA_HIPS);
      p.person.root.rotation.y = s.rotY;
      this.sitting.set(p.id, p.person);
    }
    for (const [id, person] of this.sitting) {
      if (seen.has(id)) continue;
      person.sit(null);
      this.sitting.delete(id);
    }
  }

  /** Out of the venue: nobody's drawn sitting any more. */
  clear() {
    for (const person of this.sitting.values()) person.sit(null);
    this.sitting.clear();
  }
}

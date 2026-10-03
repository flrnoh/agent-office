import * as THREE from 'three';
import { LOUNGER_HIPS, THERMAL_POOL, WHIRLPOOLS } from '../../shared/therme-paradies';
import { BATHER_NAMES, BATHER_PLAN, BATHER_SUITS, NPC_LOUNGERS, batherAt, type BatherRole } from '../../shared/therme-bathers';
import type { Look } from '../../shared/avatar';
import { Person } from '../world/character';
import { seaPose } from '../features/beach/poses';
import { liePose } from '../features/lounging';

/*
 * The thermal baths' other bathers (flrnoh fork, see FORK.md "The thermal baths", phase 8): thirty
 * people who aren't anyone, so the place is never empty. Where each is comes from the office's clock
 * (like the waves), so every page sees the same bathers in the same places, and nothing goes over the
 * wire: swimmers doing lengths round the palm island, swimmers riding the waves, people sitting in
 * the whirlpools, lying on loungers (those loungers are taken), walking round the thermal pool,
 * floating round the lazy river. Only the nearest fourteen within 60 m move and are drawn.
 */

interface Bather {
  role: BatherRole;
  person: Person;
  phase: number;
  /** Which whirlpool or lounger, for those who stay put. */
  slot: number;
  posed: boolean;
}

export class Bathers {
  private all: Bather[] = [];

  constructor(group: THREE.Group) {
    let n = 0;
    for (const [role, count] of BATHER_PLAN)
      for (let k = 0; k < count; k++, n++) {
        const look: Look = { skin: (n * 3) % 8, hair: (n * 5) % 10, style: n % 6, ...(n % 7 === 3 ? { beard: 1 + (n % 3) } : {}) };
        const person = new Person(BATHER_NAMES[n % BATHER_NAMES.length], BATHER_SUITS[n % BATHER_SUITS.length], look);
        person.showLabel(false);
        person.root.visible = false;
        group.add(person.root);
        this.all.push({ role, person, phase: n * 1.7, slot: k, posed: false });
      }
  }

  /** Whether `seatId` is one of the bathers' loungers. */
  takes(seatId: string) {
    return NPC_LOUNGERS.includes(seatId);
  }

  /** Every frame: where each is by the office's clock (`now`, ms), only those within `reach` of you drawn. */
  update(now: number, t: number, dt: number, me: THREE.Vector3, reach = 60, most = 14) {
    // Only the nearest few are drawn (a person is a dozen draw calls): who they are changes as you walk.
    const where = this.all.map((b) => ({ b, at: batherAt(b.role, b.slot, b.phase, now) })).map((w) => ({ ...w, d: Math.hypot(w.at.x - me.x, w.at.z - me.z) }));
    const shown = new Set(where.filter((w) => w.d < reach).sort((a, b) => a.d - b.d).slice(0, most).map((w) => w.b));
    for (const { b, at } of where) {
      const near = shown.has(b);
      b.person.root.visible = near;
      if (!near) continue;
      b.person.root.position.set(at.x, at.y, at.z);
      b.person.root.rotation.y = at.rot;
      if (!b.posed) this.pose(b);
      b.person.update(dt, t, at.moving, false);
    }
  }

  private pose(b: Bather) {
    b.posed = true;
    const st = { moving: b.role === 'ring' || b.role === 'waves' };
    if (b.role === 'lounge') {
      b.person.sit(LOUNGER_HIPS);
      b.person.setWorkout((bones, _dt, tt) => liePose(bones, LOUNGER_HIPS, 'recline', tt, b.phase));
    } else if (b.role !== 'walk') {
      const sink = b.role === 'whirl' ? WHIRLPOOLS[0].sink : THERMAL_POOL.sink;
      b.person.setWorkout((bones, _dt, tt) => seaPose(bones, sink, st.moving, tt, b.phase));
    }
  }

  /** Where the ones near you are (for the sound: voices from where there are people). */
  count(me: THREE.Vector3, r = 25): number {
    return this.all.filter((b) => b.person.root.visible && Math.hypot(b.person.root.position.x - me.x, b.person.root.position.z - me.z) < r).length;
  }
}

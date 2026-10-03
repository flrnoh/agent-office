import { SEATING_BY_ID } from '../../../shared/layout';
import { seatIdOf } from '../../../shared/gym-rooms';
import { LIE_BACK, lieOn, type Lie } from '../../../shared/lounging';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import type { Bones, Person } from '../../world/character/person';
import { HIPS } from '../../world/character/rig';

/*
 * Lying down (flrnoh fork, see FORK.md "Lying down" and shared/lounging.ts): on a lounger or a water
 * bed you don't sit, you lie back, hands behind your head on a lounger, arms along your sides on a
 * water bed. The seat is an ordinary seat (E sits you down, W A S D gets you up); this only lays the
 * body over it each frame, yours and everyone else's who's on one (Person.setWorkout).
 */

export interface LoungingDeps {
  /** The people on your floor (or in your place), by id (see features/peers). */
  remotes(): ReadonlyMap<string, { person: Person }>;
}

/**
 * Lying back `back` radians from upright with the hips `hips` up on the cushion, turning about the
 * hips so they stay on it: the body leans back (−x turns it toward −z, behind), the legs stay out
 * straight in front, the head tips up a little to look down along the body.
 */
export function liePose(b: Bones, hips: number, lie: Lie, t: number, phase: number) {
  const back = LIE_BACK[lie];
  const th = -back;
  b.body.rotation.set(th, 0, 0);
  b.body.position.set(0, hips - HIPS * Math.cos(th), -HIPS * Math.sin(th));
  // Out straight in front, whatever the body's doing (the legs hang off it).
  const leg = -1.52 - th;
  b.legL.rotation.set(leg, 0, 0.07);
  b.legR.rotation.set(leg, 0, -0.07);
  if (lie === 'recline') {
    // Hands behind the head, elbows out.
    b.armL.rotation.set(-2.75, 0, 0.62);
    b.armR.rotation.set(-2.75, 0, -0.62);
  } else {
    b.armL.rotation.set(0.12, 0, 0.16);
    b.armR.rotation.set(0.12, 0, -0.16);
  }
  // Breathing, slow.
  b.head.rotation.set(back * 0.42 + Math.sin(t * 1.1 + phase) * 0.02, 0, 0);
}

export function installLounging(ctx: Ctx, deps: LoungingDeps) {
  const posed = new Map<Person, { lie: Lie; hips: number }>();
  const pose = (person: Person, seatId: string | undefined) => {
    const lie = lieOn(seatId);
    const cur = posed.get(person);
    if (!lie) {
      if (cur) {
        person.setWorkout(null);
        posed.delete(person);
      }
      return;
    }
    const hips = SEATING_BY_ID.get(seatId!)?.hips ?? 0.42;
    if (cur && cur.lie === lie && cur.hips === hips) return;
    const st = { lie, hips };
    posed.set(person, st);
    const phase = posed.size * 1.3;
    person.setWorkout((b, _dt, t) => liePose(b, st.hips, st.lie, t, phase));
  };

  ctx.ticks.add('others', () => {
    pose(ctx.me, ctx.player.seat?.seatId);
    const remotes = deps.remotes();
    const seen = new Set<Person>([ctx.me]);
    for (const [id, r] of remotes) {
      seen.add(r.person);
      pose(r.person, seatIdOf(store.peers.get(id)?.seat));
    }
    for (const person of [...posed.keys()])
      if (!seen.has(person)) {
        person.setWorkout(null);
        posed.delete(person);
      }
  });
}

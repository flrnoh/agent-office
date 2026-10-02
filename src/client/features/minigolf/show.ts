import type * as THREE from 'three';
import { HOLES, toRoom } from '../../../shared/minigolf-holes';
import { cardTotal, toPar, type MgEvent, type MgView } from '../../../shared/minigolf';
import type { BallEvent } from '../../../shared/minigolf-physics';
import type { OfficeSound } from '../../sound';
import type { Confetti } from '../../world/confetti';
import { toast } from '../../ui/dom';
import type { MinigolfSound } from './sound';

/*
 * What the mini golf makes of what happens (flrnoh fork, see FORK.md "Black-light mini golf"): the
 * sounds of a ball on its way (by what it hit and on which hole), and the office's news: toasts, the
 * fanfares, confetti over the cup for a hole in one or a finished round.
 */

/** What a stroke count is called against par. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole-in-One';
  const d = strokes - par;
  return d <= -3 ? 'Albatros' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Doppel-Bogey' : `+${d}`;
}

/** The sound of something a ball did on hole `hole`, or none. */
export function ballSound(e: BallEvent, hole: number): MinigolfSound | null {
  const theme = HOLES[hole - 1]?.theme;
  switch (e.k) {
    case 'hit':
      return e.speed < 0.08 ? null : e.tag === 'bumper' ? 'bumper' : (e.tag ?? 'rail');
    case 'kick':
      return theme === 'pinball' ? 'kick' : e.tag === 'bumper' ? 'bumper' : 'rubber';
    case 'cup':
      return 'cup';
    case 'lip':
      return 'lip';
    case 'land':
      return e.speed > 0.35 ? 'land' : null;
    case 'pipe':
      return 'pipe';
    case 'loop':
      return 'loop';
    case 'out':
      return theme === 'jump' ? 'sizzle' : theme === 'reef' ? 'splash' : 'land';
    default:
      return null;
  }
}

export interface ShowDeps {
  sound: OfficeSound;
  confetti: Confetti;
  /** You. */
  you(): string;
  /** A room point in the world. */
  toWorld(x: number, y: number, z: number): THREE.Vector3;
  /** Whether you're in the room (or near enough to see). */
  here(): boolean;
  /** Opens the scorecard. */
  openCard(): void;
}

/** The office's news about the mini golf: toasts, fanfares, confetti. */
export function showEvent(e: MgEvent, view: MgView, d: ShowDeps) {
  const you = d.you();
  const me = view.players.find((p) => p.id === you);
  const inMyGroup = (id: string) => !!me?.group && view.players.find((p) => p.id === id)?.group === me.group;
  const cupOf = (hole: number) => {
    const def = HOLES[hole - 1];
    const at = toRoom(def, def.course.cup.x, def.course.cup.z);
    return d.toWorld(at.x, def.base + 0.3, at.z);
  };
  switch (e.k) {
    case 'ace': {
      if (!d.here()) return;
      const at = cupOf(e.hole);
      d.confetti.burst(at.x, at.y + 0.6, at.z, 220, 1.1);
      d.sound.minigolf('ace');
      toast(e.id === you ? `🏆 HOLE-IN-ONE auf Bahn ${e.hole}!` : `🏆 ${e.name}: Hole-in-One auf Bahn ${e.hole}!`);
      return;
    }
    case 'holed': {
      const par = HOLES[e.hole - 1].par;
      if (e.id === you) {
        d.sound.minigolf('holed');
        toast(`⛳ Bahn ${e.hole} in ${e.strokes} – ${scoreName(e.strokes, par)}`);
      } else if (inMyGroup(e.id)) toast(`⛳ ${e.name}: Bahn ${e.hole} in ${e.strokes}`);
      return;
    }
    case 'plus':
      if (e.id === you) toast(`➕ Bahn ${e.hole}: „+“ – weiter zur nächsten`, 'warn');
      else if (inMyGroup(e.id)) toast(`➕ ${e.name}: „+“ auf Bahn ${e.hole}`);
      return;
    case 'round': {
      const p = view.players.find((x) => x.id === e.id);
      const par = p ? toPar(p.card) : '';
      if (e.id === you) {
        d.sound.minigolf('round');
        const at = cupOf(9);
        d.confetti.burst(at.x, at.y + 0.6, at.z, 160, 1);
        toast(`🏁 Runde fertig: ${e.total} Schläge${par ? ` (${par})` : ''}${e.best ? ' – persönlicher Rekord!' : e.week ? ' – Wochenbestwert!' : ''}`);
        d.openCard();
      } else if (d.here()) toast(`🏁 ${e.name}: Runde mit ${e.total}${e.best ? ' – Rekord!' : ''}`);
      return;
    }
    case 'group':
      if (d.here()) toast(e.names.length > 1 ? `👥 Neue Runde: ${e.names.join(', ')}` : `⛳ Neue Runde für ${e.names[0]}`);
      return;
    case 'turn':
      if (e.id === you) toast(`⛳ Du bist dran – Bahn ${e.hole}`);
      return;
  }
}

/** A line about how `id` stands (for hints). */
export function standing(view: MgView | null, id: string): string {
  const p = view?.players.find((x) => x.id === id);
  if (!p) return '';
  return `${cardTotal(p.card)} Schläge (${toPar(p.card)})`;
}

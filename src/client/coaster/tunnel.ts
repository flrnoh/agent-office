import { floorPalette } from '../../shared/floors';
import type { CoasterTypist } from '../../shared/coaster';
import type { FloorInfo } from '../../shared/protocol';
import { Worker } from '../world/character';
import type { World } from '../world/world';

// DER BRECHER's tube through the ground floor, as its riders see it (flrnoh fork, see FORK.md "Der
// Brecher"). Riders are up on the roof as far as the office goes (that's where the station is), and up
// there only the roof is in the scene: the floors are the tower's outside. But the office's own world
// is still there, hidden, laid out as the bottom floor's (core/travel.ts's syncStack has it at index 0
// on the roof). So while a rider can see into it (from the top of the first drop till over the top of
// the vertical lift) it's shown, lowered to where the ground floor is under the roof, painted and furnished the way the ground floor is, with the ground floor's workers
// (CoasterState.typists, as the train went) typing at their desks below; after that it's hidden
// again, put back where it was and painted the way the roof left it.

export interface TunnelDeps {
  world(): World;
  /** The bottom floor, for its paint and its interior. */
  bottom(): FloorInfo | undefined;
}

export class CoasterTunnel {
  private shown = false;
  private dressed = false;
  private workers: Worker[] = [];
  private typistsKey = '';

  constructor(private d: TunnelDeps) {}

  /** The ride's starting: the hidden world dressed as the ground floor (repainting is slow, so not mid-ride), its workers seated. */
  dress(typists: CoasterTypist[]) {
    const w = this.d.world();
    const f = this.d.bottom();
    if (!this.dressed) {
      w.setLook(floorPalette(f?.palette ?? 0));
      w.setInterior?.(f?.interior);
      this.dressed = true;
    }
    const key = typists.map((t) => `${t.desk}|${t.name}|${t.color}`).join(',');
    if (key === this.typistsKey) return;
    this.clearWorkers();
    this.typistsKey = key;
    for (const t of typists) {
      const desk = w.desks.get(t.desk);
      if (!desk) continue;
      const model = new Worker(t.name, t.color);
      model.setStatus('working', false);
      desk.seatAnchor.add(model.root);
      this.workers.push(model);
    }
  }

  /**
   * Each frame of the ride, `near` while the rider can see into the ground floor (from the top of the
   * first drop, past its windows and in at the south hole, till the vertical lift has them over the
   * top), the ground floor's floor `ground` down there: shows the floor all that while, so it's never
   * empty or see-through from the train, and doesn't pop in as they go in.
   */
  update(near: boolean, ground: number, dt: number, t: number) {
    const w = this.d.world();
    if (near !== this.shown) {
      this.shown = near;
      w.group.visible = near;
      w.group.position.y = near ? ground : 0;
      w.group.updateMatrixWorld(true);
    }
    if (near) for (const m of this.workers) m.update(dt, t);
  }

  /** The ride's over (or never was): the world hidden and put back, painted as the roof had it, the workers gone. */
  undress() {
    const w = this.d.world();
    if (this.shown) {
      w.group.visible = false;
      w.group.position.y = 0;
      w.group.updateMatrixWorld(true);
      this.shown = false;
    }
    if (this.dressed) {
      // The roof paints the hidden world as no floor at all (core/maps.ts: palette 0, no pick).
      w.setLook(floorPalette(0));
      w.setInterior?.(undefined);
      this.dressed = false;
    }
    this.clearWorkers();
  }

  private clearWorkers() {
    for (const m of this.workers) {
      m.root.removeFromParent();
      m.dispose();
    }
    this.workers = [];
    this.typistsKey = '';
  }
}

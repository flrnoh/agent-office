import * as THREE from 'three';
import { AUFGUSS_RUN, BUCKETS, ICE_FOUNTAIN, KNEIPP, RUHEHAUS, SAUNA_BY_ID, aufgussAt, aufgussPlan, inKneipp, inRuhehaus, saunaAt, type SaunaId } from '../../shared/therme-dorf';
import { SHOWERS, SHOWER_HEIGHT } from '../../shared/therme-pools';
import { waveBoard } from '../../shared/therme-waves';
import type { Interactable } from '../world/types';
import type { ThermeInterior } from '../world/therme';
import { toast } from '../ui/dom';
import { drawAufgussBoard, drawInfoBoard } from './dorf-ui';
import type { ThermeSounds } from './sound';

/*
 * The Saunadorf's goings-on, and the baths' small things to use (flrnoh fork, see shared/therme-
 * dorf.ts, shared/therme-pools.ts): the Aufguss plan as it runs (the Saunameister and the steam in
 * the sauna that has one, a word as it starts, the boards), the huts' walls lifting while you're in
 * one and the camera isn't, wading through the Kneipp trough, and E at a shower, a gush bucket or the
 * ice fountain.
 */

type Hint = { k: string; parts: (HTMLElement | string)[] };

export interface DorfLifeHost {
  camera: THREE.Camera;
  audio: ThermeSounds;
  /** Cold water over you (a shower, a bucket, the ice): the sweat washed off (sauna-feel.ts). */
  cool(): void;
}

export class DorfLife {
  /** The Aufguss slot the page last said was starting, and when it last drew the boards. */
  private aufgussFor = -1;
  private boardAt = 0;
  /** Wading the Kneipp trough: since when, how far along it you got, when your last step sloshed. */
  private wade: { minX: number; maxX: number; stepAt: number } | null = null;
  /** When each thing was last used (so E held down doesn't empty the buckets ten times). */
  private usedAt = new Map<string, number>();

  constructor(
    private room: ThermeInterior,
    private host: DorfLifeHost,
  ) {}

  update(me: THREE.Vector3, moving: boolean, now: number, t: number, dt: number) {
    const dorf = this.room.dorf;
    // The Aufguss plan (shared/therme-dorf.ts): the steam and the Saunameister in the sauna with one, a word as it starts.
    const a = aufgussAt(now);
    const into = now - a.start;
    const sauna = a.running ? SAUNA_BY_ID.get(a.sauna) ?? null : null;
    dorf.steam(sauna, sauna ? (into < 60_000 ? 1 : into < AUFGUSS_RUN - 20_000 ? 0.35 : 0.1) : 0, dt);
    if (a.running && a.slot !== this.aufgussFor) {
      if (this.aufgussFor !== -1 && into < 5000) toast(`${sauna?.emoji} Aufguss ${sauna?.inName}! ${saunaAt(me.x, me.y, me.z)?.id === a.sauna ? 'Bleib sitzen, gleich wird es heiß' : 'Jetzt rein, dann gibt es Energie zurück'}`);
      this.aufgussFor = a.slot;
    }
    // In a hut with the camera outside it (third person): its walls and roof lift away so you can see in.
    const hutIn = saunaAt(me.x, me.y, me.z)?.id ?? (inRuhehaus(me.x, me.z) ? 'ruhe' : null);
    const cam = this.host.camera.position;
    for (const [id, shell] of dorf.shells) {
      const def = id === 'ruhe' ? null : SAUNA_BY_ID.get(id as SaunaId)!;
      const box = def?.box ?? RUHEHAUS.box;
      const camIn = cam.x > box.minX && cam.x < box.maxX && cam.z > box.minZ && cam.z < box.maxZ && cam.y < (def?.height ?? RUHEHAUS.height);
      shell.visible = !(hutIn === id && !camIn);
    }
    if (t - this.boardAt > 1) {
      this.boardAt = t;
      drawAufgussBoard(dorf.board, aufgussPlan(now, 4), now);
      drawInfoBoard(this.room.lobby.board, waveBoard(now), aufgussPlan(now, 3));
    }
    this.kneipp(me, moving, t);
  }

  /** Through the Kneipp trough: a slosh a step, a word going in, another once you've waded its length. */
  private kneipp(me: THREE.Vector3, moving: boolean, t: number) {
    const inside = inKneipp(me.x, me.y, me.z);
    if (inside && !this.wade) {
      this.wade = { minX: me.x, maxX: me.x, stepAt: 0 };
      toast('🦶 Kneippbecken: im Storchengang hindurch, Knie hoch, Fuß ganz aus dem Wasser');
    }
    if (!this.wade) return;
    if (inside) {
      this.wade.minX = Math.min(this.wade.minX, me.x);
      this.wade.maxX = Math.max(this.wade.maxX, me.x);
      if (moving && t - this.wade.stepAt > 0.42) {
        this.wade.stepAt = t;
        this.host.audio.slosh({ x: me.x, y: 0, z: me.z });
      }
      return;
    }
    if (this.wade.maxX - this.wade.minX > (KNEIPP.maxX - KNEIPP.minX) * 0.75) toast('🦶 Kneippgang geschafft: die Füße kribbeln, der Kreislauf ist wach');
    this.wade = null;
  }

  /** E at a shower, a bucket or the ice fountain. */
  use(it: Interactable, key: string): boolean {
    if (it.kind !== 'thermeuse') return false;
    if (key !== 'E') return true;
    const what = `${it.thermeUse}-${it.thermeIndex ?? 0}`;
    const now = performance.now();
    if (now - (this.usedAt.get(what) ?? -1e9) < (it.thermeUse === 'shower' ? 4200 : 1800)) return true;
    this.usedAt.set(what, now);
    if (it.thermeUse === 'shower') {
      const s = SHOWERS[it.thermeIndex ?? 0];
      this.room.decor.pour(s.x, s.z + 0.5, SHOWER_HEIGHT - 0.15, false);
      this.host.audio.pour({ x: s.x, y: 2, z: s.z + 0.5 }, 4);
      this.host.cool();
      toast('🚿 Abgeduscht: warm von oben, jetzt darfst du ins Becken');
    } else if (it.thermeUse === 'bucket') {
      const i = it.thermeIndex ?? 0;
      const b = BUCKETS[i];
      this.room.garden.tip(i);
      window.setTimeout(() => this.room.decor.pour(b.x, b.z, 2.45, true), 280);
      this.host.audio.pour({ x: b.x, y: 2.5, z: b.z }, 1.3, true);
      this.host.cool();
      toast('🪣 Schwall! Ein Eimer eiskaltes Wasser über den Kopf');
    } else if (it.thermeUse === 'ice') {
      this.host.audio.crunch({ x: ICE_FOUNTAIN.x, y: 1, z: ICE_FOUNTAIN.z });
      this.host.cool();
      toast('🧊 Mit Crushed Ice abgerieben: herrlich frisch nach der Sauna');
    }
    return true;
  }

  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): Hint | null {
    if (it.kind !== 'thermeuse') return null;
    if (it.thermeUse === 'shower') return { k: 'therme-shower', parts: [title('🚿 Dusche'), aside('vor dem Baden abduschen'), key('E', 'Shower')] };
    if (it.thermeUse === 'bucket') return { k: 'therme-bucket', parts: [title('🪣 Schwalleimer'), aside('eiskalt · nach der Sauna'), key('E', 'Pull the rope')] };
    return { k: 'therme-ice', parts: [title('🧊 Eisbrunnen'), aside('Crushed Ice zum Abreiben'), key('E', 'Take some ice')] };
  }
}

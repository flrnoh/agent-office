import * as THREE from 'three';
import type { BowlingLights } from '../../../shared/bowling';

/*
 * The bowling centre's two lights (flrnoh fork, see FORK.md "The bowling centre"): `normal` (the house
 * lights up, bright and warm) and `cosmic` (the house lights down, the UV tubes on, everything that
 * glows glows). Whatever changes between the two registers here, and the room eases between them:
 * the house lights drop fast, then the black light swells in (and the other way round).
 */

/** A colour that's one thing with the house lights on and another in cosmic bowling. */
interface Tint {
  color: THREE.Color;
  normal: THREE.Color;
  cosmic: THREE.Color;
  /** Follows the house lights (they drop first) or the UV (it comes up after). */
  uv: boolean;
}

/** A number the same way: an emissive intensity, an opacity. */
interface Level {
  set(v: number): void;
  normal: number;
  cosmic: number;
  uv: boolean;
}

export class HouseLighting {
  /** 0 the house lights, 1 cosmic bowling, eased between. */
  k = 0;
  private want: BowlingLights = 'normal';
  private tints: Tint[] = [];
  private levels: Level[] = [];
  /** Shown only in cosmic bowling (the mirror ball's spots, the lasers). */
  private cosmicOnly: THREE.Object3D[] = [];
  /** What the switch says now. */
  get lights(): BowlingLights {
    return this.want;
  }

  /** A material's colour: `normal` with the house lights on, `cosmic` in the dark. */
  tint(color: THREE.Color, normal: THREE.ColorRepresentation, cosmic: THREE.ColorRepresentation, uv = false) {
    this.tints.push({ color, normal: new THREE.Color(normal), cosmic: new THREE.Color(cosmic), uv });
    color.copy(this.tints[this.tints.length - 1].normal);
  }

  /** A number (an emissive intensity, an opacity): `normal` and `cosmic`. */
  level(set: (v: number) => void, normal: number, cosmic: number, uv = true) {
    this.levels.push({ set, normal, cosmic, uv });
    set(normal);
  }

  /** Shown only while it's cosmic bowling. */
  onlyCosmic(o: THREE.Object3D) {
    o.visible = false;
    this.cosmicOnly.push(o);
  }

  /** Switch (eased over the next second), or straight there (`now`: coming in). */
  set(lights: BowlingLights, now = false) {
    this.want = lights;
    if (now) {
      this.k = lights === 'cosmic' ? 1 : 0;
      this.apply();
    }
  }

  update(dt: number) {
    const target = this.want === 'cosmic' ? 1 : 0;
    if (this.k === target) return;
    const step = dt / 1.1;
    this.k = target > this.k ? Math.min(1, this.k + step) : Math.max(0, this.k - step);
    this.apply();
  }

  /** The house lights' share (1 on, 0 off) and the UV's (0 off, 1 on) at k: the house drops in the first half, the UV swells in the second. */
  shares(k = this.k): { house: number; uv: number } {
    const house = 1 - smooth(Math.min(1, k * 2));
    const uv = smooth(Math.max(0, k * 1.6 - 0.6));
    return { house, uv };
  }

  private apply() {
    const { house, uv } = this.shares();
    for (const t of this.tints) t.color.copy(t.normal).lerp(t.cosmic, t.uv ? uv : 1 - house);
    for (const l of this.levels) l.set(l.normal + (l.cosmic - l.normal) * (l.uv ? uv : 1 - house));
    for (const o of this.cosmicOnly) o.visible = uv > 0.02;
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x);

import * as THREE from 'three';
import type { WallRect } from '../../../../shared/decor';
import { FLOOR_PALETTES, type FloorPalette } from '../../../../shared/floors';
import { INTERIORS, interiorFor, type InteriorStyle } from '../../../../shared/interiors';
import { DESKS, EXIT_DOOR, PLANTS, WALL_HEIGHT } from '../../../../shared/layout';
import { storeyPlan, type StoreyPlan } from '../../../../shared/storey';
import { toon } from '../../toon';
import type { Fixture } from '../fixture';
import { decor, type Decor } from './decor';
import { lamp } from './lamps';
import { paintCeiling, paintFloorFinish } from './paint';
import { rug } from './rugs';
import { wallFinish } from './walls';

// flrnoh fork (see FORK.md, "Each storey its own interior"): furnishing the floor you're on in its
// interior (shared/interiors.ts). The office is built once and every floor is shown in it, so on every
// change of floor (or of the floor's paint, or of the interior an admin picked for it) this paints the
// walls, the floor and the ceiling, recolors the desks, chairs, wood, couch and pots, lays the rugs,
// hangs the lamps, puts up the wall finish and brings out the decor. It's the last fixture on the
// floor's plan, so everything it recolors is built by then.

declare module '../../types' {
  interface OfficeHandles {
    /** Fork: what furnishes the office as the floor you're on (see world/office/interior/). */
    interior: Furnishing;
  }
}

export interface Furnishing {
  /** The floor's own palette (see FLOOR_PALETTES); the interior paints over what it has its own of. */
  setLook(p: FloorPalette): void;
  /** The interior an admin picked for the floor (FloorInfo.interior), or none: the one its place in the stack gives it. */
  setPicked(id: string | null | undefined): void;
  /** The interior the floor you're on is furnished in now. */
  style(): InteriorStyle;
}

/** The colors the office is built in that an interior has its own of, and which of its fields gives each. */
type Recolor = (s: InteriorStyle) => string;
const KLASSIK = INTERIORS[0];
const RECOLORS: [string, Recolor][] = [
  [KLASSIK.desk, (s) => s.desk],
  [KLASSIK.deskLeg, (s) => s.deskLeg],
  ['#8d99ae', (s) => s.deskLeg], // the desks' legs
  [KLASSIK.wood, (s) => s.wood],
  [KLASSIK.sofa, (s) => s.sofa],
  [KLASSIK.pot, (s) => s.pot],
  [KLASSIK.loungeRug, (s) => s.loungeRug],
  ...KLASSIK.chairs.map((c, i): [string, Recolor] => [c, (s) => s.chairs[i % s.chairs.length]]),
];

/** The meshes built in one of RECOLORS' colors, and how each takes its interior's. */
function recolorable(root: THREE.Object3D, skip: Set<THREE.Object3D>): { mesh: THREE.Mesh; base: THREE.Material; to: Recolor }[] {
  const by = new Map<THREE.Material, Recolor>(RECOLORS.map(([c, to]) => [toon(c), to]));
  const out: { mesh: THREE.Mesh; base: THREE.Material; to: Recolor }[] = [];
  const walk = (o: THREE.Object3D) => {
    if (skip.has(o) || o.userData.outdoors) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      const to = by.get(m.material);
      if (to) out.push({ mesh: m, base: m.material, to });
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return out;
}

/** What a storey's interior has put up, to take down again. */
interface Up {
  group: THREE.Group;
  decor: Decor;
  rects: WallRect[];
}

export const interior: Fixture<'interior'> = (site) => {
  const stack = site.get('stack');
  const pendants = site.get('pendants');
  const rugs = site.get('rugs');
  const plants = site.get('plants');
  const ceiling = stack.ceiling as THREE.MeshToonMaterial;

  const skip = new Set<THREE.Object3D>([pendants.group, ...rugs]);
  const recolor = recolorable(site.group, skip);

  // The interior's own lamps, in place of the cone pendants.
  const ownLamps = new THREE.Group();
  site.group.add(ownLamps);

  let palette = FLOOR_PALETTES[0];
  let picked: string | null = null;
  let index = 0;
  let current = KLASSIK;
  /** What's been done for which: the paint (palette + style), and the storey's things (style + storey). */
  let painted = '';
  let laid = '';
  let up: Up | null = null;

  const takeDown = (u: Up) => {
    site.group.remove(u.group);
    for (const d of u.decor.desks) d.obj.removeFromParent();
    // Their shapes are theirs alone, and so are the few materials made for them (a neon sign's texture);
    // the rest come from the toon cache and the finishes' own, kept for next time.
    for (const root of [u.group, ...u.decor.desks.map((d) => d.obj)]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.MeshBasicMaterial | undefined;
        if (mat?.userData?.own) {
          mat.map?.dispose();
          mat.dispose();
        }
      });
    }
    for (const r of u.rects) site.unwall(r);
  };

  /** The walls', floor's and ceiling's paint, and everything recolored. */
  const paint = (s: InteriorStyle) => {
    const p: FloorPalette = { ...palette, ...s.paint };
    site.looks.wall.color.set(p.wall);
    site.looks.trim.color.set(p.trim);
    for (const t of site.looks.planks) {
      paintFloorFinish(t.image as HTMLCanvasElement, p, s.floor);
      t.needsUpdate = true;
    }
    const tiles = ceiling.map as THREE.CanvasTexture | null;
    if (tiles) {
      paintCeiling(tiles.image as HTMLCanvasElement, s.ceiling);
      tiles.needsUpdate = true;
    }
    for (const r of recolor) {
      // Something else gave it another look in the meantime (a holiday, a highlight): leave it be.
      const want = toon(r.to(s));
      if (r.mesh.material !== r.base && r.mesh.userData.interior !== r.mesh.material) continue;
      r.mesh.material = want;
      r.mesh.userData.interior = want;
    }
    PLANTS.forEach((spot, i) => plants[i]?.scale.setScalar(spot[2] * s.plantScale));
  };

  /** The storey's rugs, lamps, wall finish and decor. */
  const lay = (s: InteriorStyle, plan: StoreyPlan) => {
    if (up) takeDown(up);
    // Rugs, in the storey's turn of the colors.
    rugs.forEach((holder, i) => {
      for (const c of [...holder.children]) {
        holder.remove(c);
        (c as THREE.Mesh).geometry?.dispose();
      }
      holder.add(rug(s.rugs.kind, s.rugs.colors[(i + plan.rugShift) % s.rugs.colors.length]));
    });
    // Lamps.
    pendants.group.visible = s.lamp === 'cone';
    for (const c of [...ownLamps.children]) {
      ownLamps.remove(c);
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    if (s.lamp !== 'cone') {
      pendants.at.forEach(([x, z], i) => {
        const l = lamp(s.lamp, WALL_HEIGHT - pendants.y, i);
        l.position.set(x, pendants.y, z);
        ownLamps.add(l);
      });
    }
    // The wall finish, round the storey's windows and doors, and the decor.
    const group = new THREE.Group();
    const holes = [...plan.windows, EXIT_DOOR, ...plan.balconies.map((b) => b.door)];
    const accent = plan.accent?.wall ?? 'west';
    group.add(wallFinish(s, accent, holes));
    const d = decor(s, { deskIds: DESKS.map((k) => k.id), accent }, pendants.at);
    group.add(d.room);
    for (const { id, obj } of d.desks) site.desks.get(id)?.group.add(obj);
    const rects = d.signs.map((g) => site.wall(g.wall, g.u, g.y, g.w, g.h));
    site.group.add(group);
    up = { group, decor: d, rects };
  };

  const apply = () => {
    const s = interiorFor(index, picked);
    current = s;
    const paintKey = `${s.id}|${palette.name}`;
    if (paintKey !== painted) {
      painted = paintKey;
      paint(s);
    }
    const layKey = `${s.id}|${index}`;
    if (layKey !== laid) {
      laid = layKey;
      lay(s, storeyPlan(index));
    }
  };

  const furnishing: Furnishing = {
    setLook: (p) => {
      palette = p;
      apply();
    },
    setPicked: (id) => {
      picked = id ?? null;
      apply();
    },
    style: () => current,
  };

  return {
    handle: { interior: furnishing },
    setLevel: (i) => {
      index = i;
      apply();
    },
    update: (t) => up?.decor.update?.(t),
  };
};

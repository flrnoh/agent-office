import * as THREE from 'three';
import { ASHTRAY, BALCONY, EXIT_STAIRS, SLAB, STREET_Y } from '../../../shared/layout';
import { balconyAt, balconyBox, localRect, type Balcony, type BalconyRect } from '../../../shared/balconies'; // flrnoh fork: each storey's balconies on their own walls
import { storeyPlan, type StoreyPlan } from '../../../shared/storey'; // flrnoh fork
import { bulb, type Lamp } from '../outside';
import { mergeByMaterial, mesh, roundedBox, textPlane, toon } from '../toon';
import type { Collider, Interactable } from '../types';
import type { Fixture } from './fixture';
import { PALETTE, box, floorTexture, glassPane } from './materials';
import { floorPlant, plant } from './props';
import { seatable } from './seats';

// Outside the office's walls: the smoking balcony, the posts under the bottom floor's, and the steps
// from the exit door down to the street. (flrnoh fork: each storey has its balconies on walls of its
// own, see shared/balconies.ts. Each is built in the bottom floor's balcony's frame, off the south
// wall, and turned onto its own: the furnished one's bench, table, stools, ashtray and sign once, the
// decks, railings and lights again for every floor.)

type Halo = { at: THREE.Vector3; size: number; color: string };

/** A sagging string of party bulbs from `a` to `b`, in `bulbs` (one per color), each with a halo in `halos` for the night. */
function stringLights(a: THREE.Vector3, b: THREE.Vector3, sag: number, bulbs: [string, THREE.Material][], halos: Halo[]): THREE.Group {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y -= sag * 2;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const g = new THREE.Group();
  g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.012, 4), toon(PALETTE.ink), 0, 0, 0, false));
  const n = Math.max(2, Math.round(curve.getLength() / 0.5));
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n);
    const [color, mat] = bulbs[i % bulbs.length];
    g.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), mat, p.x, p.y - 0.06, p.z, false));
    halos.push({ at: new THREE.Vector3(p.x, p.y - 0.06, p.z), size: 0.55, color });
  }
  return mergeByMaterial(g);
}

/** Turns `group`, built in the bottom floor's balcony's frame, onto balcony `b`'s wall. */
function place(group: THREE.Object3D, b: Balcony) {
  const p = balconyAt(b, 0, 0);
  group.position.set(p.x, 0, p.z);
  group.rotation.y = b.turn;
}

/**
 * A balcony's deck, in its own frame (`rect`): the slab, the planks, a glass railing on its three open
 * sides and a plant in two of its corners. Built again when you change floors (see `balcony` below).
 */
function buildDeck(group: THREE.Group, colliders: Collider[], rect: BalconyRect) {
  const { minX, maxX, minZ, maxZ } = rect;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const parts = new THREE.Group();
  parts.add(mesh(box(w, SLAB - 0.01, d), toon(PALETTE.wallTrim), cx, -SLAB / 2 - 0.005, cz));
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ map: floorTexture(w, d), color: '#d6a574', gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(cx, 0.002, cz);
  deck.receiveShadow = true;
  deck.userData.own = true; // its planks are its own: let go of with it
  group.add(deck);
  colliders.push({ minX, maxX, minZ, maxZ, bottom: -SLAB, top: 0 });

  // The railing: posts, a wooden top rail and glass between, on the three open sides.
  const railH = 1.05;
  const ink = toon(PALETTE.deskLeg);
  const wood = toon(PALETTE.wood);
  const inset = 0.06;
  const sides: [number, number, number, number][] = [
    [minX + inset, maxZ - inset, maxX - inset, maxZ - inset],
    [minX + inset, minZ, minX + inset, maxZ - inset],
    [maxX - inset, minZ, maxX - inset, maxZ - inset],
  ];
  for (const [x0, z0, x1, z1] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = z0 === z1;
    const n = Math.ceil(len / 1.6);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      parts.add(mesh(box(0.06, railH, 0.06), ink, x0 + (x1 - x0) * t, railH / 2, z0 + (z1 - z0) * t, false));
    }
    const rail = mesh(alongX ? box(len + 0.1, 0.07, 0.12) : box(0.12, 0.07, len + 0.1), wood, (x0 + x1) / 2, railH + 0.02, (z0 + z1) / 2);
    parts.add(rail);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const pane = glassPane(len / n - 0.1, railH - 0.2);
      pane.position.set(x0 + (x1 - x0) * t, (railH - 0.2) / 2 + 0.08, z0 + (z1 - z0) * t);
      pane.rotation.y = alongX ? 0 : Math.PI / 2;
      parts.add(pane);
    }
    colliders.push({ minX: Math.min(x0, x1) - 0.05, maxX: Math.max(x0, x1) + 0.05, minZ: Math.min(z0, z1) - 0.05, maxZ: Math.max(z0, z1) + 0.05, bottom: -SLAB, top: 99 });
  }
  // A plain balcony's shallow: both its plants stand by the rail, out of the way of its doors.
  const plain = d < 2.5;
  for (const [i, [px, pz, sc]] of [
    [maxX - 0.55, plain ? maxZ - 0.5 : minZ + 0.5, plain ? 0.8 : 1.1],
    [minX + 0.55, maxZ - 0.55, 0.9],
  ].entries()) {
    // Starting past the monstera, which spreads too wide for a spot this near the rail.
    const p = plant(floorPlant(i + 1), sc);
    p.position.set(px, 0, pz);
    parts.add(p);
    const r = 0.3 * sc;
    colliders.push({ minX: px - r, maxX: px + r, minZ: pz - r, maxZ: pz + r, top: 0.5 * sc });
  }
  group.add(mergeByMaterial(parts));
}

/** Where the smoke break sign hangs on the wall, and the string lights from just over it. */
const SIGN_X = -6.5;

/**
 * The lamp poles on the furnished deck's outer corners, string lights to them from the wall and
 * between them, and where the bulbs' halos are, in its own frame (`rect`). Built again with the deck.
 */
function buildLights(group: THREE.Group, rect: BalconyRect, bulbs: [string, THREE.Material][], halos: Halo[]) {
  const { minX, maxX, minZ, maxZ } = rect;
  const railH = 1.05;
  const inset = 0.06;
  const poleH = 2.7;
  const parts = new THREE.Group();
  const sw = new THREE.Vector3(minX + inset, poleH, maxZ - inset);
  const se = new THREE.Vector3(maxX - inset, poleH, maxZ - inset);
  for (const p of [sw, se]) parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, poleH - railH, 6), toon(PALETTE.deskLeg), p.x, (poleH + railH) / 2, p.z, false));
  const hook = new THREE.Vector3(SIGN_X, 3.5, minZ + 0.02);
  parts.add(stringLights(sw, se, 0.35, bulbs, halos));
  parts.add(stringLights(sw, hook, 0.3, bulbs, halos));
  parts.add(stringLights(hook, se, 0.35, bulbs, halos));
  group.add(mergeByMaterial(parts));
}

/** A soft round blob, each halo's glow (as the sky's halos have it). */
function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** The bulbs' halos, as points that glow at night (see NightParts.glows) and move with their deck. */
function haloPoints(halos: Halo[], mat: THREE.PointsMaterial): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(halos.flatMap((h) => [h.at.x, h.at.y, h.at.z]), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(halos.flatMap((h) => new THREE.Color(h.color).toArray()), 3));
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

/**
 * What stands on the furnished balcony, in the bottom floor's balcony's frame: a bench under the
 * window, a bistro table with two stools, the ashtray (where you take a smoke break) and the sign.
 */
export function buildBalcony(group: THREE.Group, colliders: Collider[], interactables: Interactable[]) {
  const { minZ, maxZ } = BALCONY;
  const cz = (minZ + maxZ) / 2;
  const ink = toon(PALETTE.deskLeg);
  const wood = toon(PALETTE.wood);
  // Everything that doesn't move and isn't textured goes in here, merged at the end.
  const parts = new THREE.Group();

  // A bench under the window, a bistro table with two stools, and plants.
  const bench = new THREE.Group();
  bench.add(mesh(roundedBox(2, 0.08, 0.46, 0.05), wood, 0, 0.45, 0));
  bench.add(mesh(box(2, 0.32, 0.06), wood, 0, 0.78, -0.2));
  for (const sx of [-0.85, 0.85]) bench.add(mesh(box(0.06, 0.45, 0.4), ink, sx, 0.22, 0));
  bench.position.set(-9, 0, minZ + 0.3);
  // Somewhere to sit, so not merged with the rest: its own meshes carry what E is about when you look at it.
  group.add(bench);
  colliders.push({ minX: -10, maxX: -8, minZ, maxZ: minZ + 0.55, top: 0.49 });
  seatable(bench, 'bench', 1.6, interactables);
  const tx = 0.2;
  const tz = cz + 0.2;
  const table = new THREE.Group();
  table.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), toon('#fffaf3'), 0, 0.74, 0));
  table.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), ink, 0, 0.37, 0));
  table.add(mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.04, 16), ink, 0, 0.02, 0));
  table.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), toon('#ef476f'), 0.15, 0.82, 0.05));
  table.position.set(tx, 0, tz);
  parts.add(table);
  colliders.push({ minX: tx - 0.4, maxX: tx + 0.4, minZ: tz - 0.4, maxZ: tz + 0.4, top: 0.77 });
  for (const sx of [-1, 1]) {
    const x = tx + sx * 0.8;
    const stool = new THREE.Group();
    stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), toon(sx < 0 ? '#5bc0eb' : '#ff8a5b'), 0, 0.46, 0));
    stool.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), ink, 0, 0.22, 0));
    stool.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 12), ink, 0, 0.015, 0));
    stool.position.set(x, 0, tz);
    group.add(stool);
    colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: tz - 0.2, maxZ: tz + 0.2, top: 0.49 });
    seatable(stool, sx < 0 ? 'stool-1' : 'stool-2', 0.9, interactables);
  }
  group.add(mergeByMaterial(parts));

  // The ashtray: a standing bin with a sand-filled bowl and a couple of butts in it.
  const tray = new THREE.Group();
  const steel = toon('#8d99ae');
  tray.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), steel, 0, 0.025, 0));
  tray.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 10), steel, 0, 0.45, 0));
  tray.add(mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.14, 16), steel, 0, 0.9, 0));
  tray.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), toon('#e9d8a6'), 0, 0.965, 0, false));
  for (const [bx, bz, a] of [
    [0.06, 0.02, 0.4],
    [-0.05, -0.06, 2.1],
    [-0.02, 0.08, 1.2],
  ]) {
    const butt = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 6).rotateZ(Math.PI / 2), toon(a > 1 ? '#fffaf3' : '#e9a03b'), bx, 0.98, bz, false);
    butt.rotation.y = a;
    tray.add(butt);
  }
  tray.position.set(ASHTRAY.x, 0, ASHTRAY.z);
  group.add(tray);
  colliders.push({ minX: ASHTRAY.x - 0.2, maxX: ASHTRAY.x + 0.2, minZ: ASHTRAY.z - 0.2, maxZ: ASHTRAY.z + 0.2, top: 1 });
  const it: Interactable = { kind: 'smoke', x: ASHTRAY.x, z: ASHTRAY.z, radius: 1.8 };
  interactables.push(it);
  tray.userData.interact = it;

  const sign = textPlane('🚬 Smoke break', { bg: '#2b2d42', color: '#fffaf3', size: 56, border: '#fffaf3' });
  sign.scale.multiplyScalar(0.8);
  sign.position.set(SIGN_X, 2.2, minZ + 0.02);
  group.add(sign);
}

/** Something built in the bottom floor's balcony's frame (`base`), and where it is on this storey's (`live`, the one the floor has). */
export interface Moved<T> {
  base: T;
  live: T;
}

/** Takes what's in the way and what there is to use, built in the bottom floor's balcony's frame, into the floor, to be turned onto each storey's. */
export function movable(cols: Collider[], its: Interactable[], into: { colliders: Collider[]; interactables: Interactable[] }): { colliders: Moved<Collider>[]; interactables: Moved<Interactable>[] } {
  into.colliders.push(...cols);
  into.interactables.push(...its);
  return { colliders: cols.map((c) => ({ base: { ...c }, live: c })), interactables: its.map((it) => ({ base: { ...it }, live: it })) };
}

/** Turns `group` and what's in `moved` onto balcony `b`. */
export function moveOnto(b: Balcony, group: THREE.Object3D, moved: ReturnType<typeof movable>) {
  place(group, b);
  for (const c of moved.colliders) Object.assign(c.live, balconyBox(b, c.base));
  for (const it of moved.interactables) Object.assign(it.live, balconyAt(b, it.base.x, it.base.z));
}

/** The balconies, out their glass doors (world/office/storey-walls.ts), each storey's where it has them (flrnoh fork). */
export const balcony: Fixture = (site) => {
  const night = site.get('night');
  // The furnished one's furniture: built once, in the bottom floor's frame, and turned onto each storey's.
  const furniture = new THREE.Group();
  furniture.userData.outdoors = true; // fork: no interior recolors it (world/office/interior/)
  site.group.add(furniture);
  const cols: Collider[] = [];
  const its: Interactable[] = [];
  buildBalcony(furniture, cols, its);
  const moved = movable(cols, its, site);

  // At night two lamps light the furnished deck, the table and whoever's out there: the sky places
  // them again whenever you change floors (Sky.placeLamps), and these move with the deck.
  const lamps: Lamp[] = [-3.2, 3.2].map(() => ({ x: 0, y: 2.4, z: 0, reach: 5.5, color: '#ffc9a6', power: 2.4 }));
  night.lamps.push(...lamps);
  const bulbs = ['#ffd166', '#ff8fa3', '#8ecae6', '#caffbf'].map((c): [string, THREE.Material] => [c, bulb(night, c, 0.4)]);
  const glow = new THREE.PointsMaterial({ size: 0.55, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  glow.visible = false;
  night.glows.push({ mat: glow, max: 0.85 });

  // The decks, their railings and plants, and the furnished one's lights: laid again for each storey.
  let decks: { group: THREE.Group; colliders: Collider[] } | null = null;
  const lay = (plan: StoreyPlan) => {
    if (decks) {
      site.group.remove(decks.group);
      decks.group.traverse((m) => {
        const o = m as THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
        o.geometry?.dispose();
        if (o.userData.own) o.material.map?.dispose(), o.material.dispose();
      });
      for (const c of decks.colliders) site.colliders.splice(site.colliders.indexOf(c), 1);
    }
    decks = { group: new THREE.Group(), colliders: [] };
    for (const b of plan.balconies) {
      const g = new THREE.Group();
      const local: Collider[] = [];
      const rect = localRect(b);
      buildDeck(g, local, rect);
      if (b.furnished) {
        const halos: Halo[] = [];
        buildLights(g, rect, bulbs, halos);
        g.add(haloPoints(halos, glow));
        const cx = (rect.minX + rect.maxX) / 2;
        const cz = (rect.minZ + rect.maxZ) / 2;
        lamps.forEach((l, i) => Object.assign(l, balconyAt(b, cx + (i ? 3.2 : -3.2), cz)));
      }
      place(g, b);
      decks.group.add(g);
      decks.colliders.push(...local.map((c) => balconyBox(b, c)));
    }
    site.group.add(decks.group);
    site.colliders.push(...decks.colliders);
    moveOnto(plan.balconies[0], furniture, moved);
  };
  let shown: StoreyPlan | null = null;
  return {
    setLevel: (index) => {
      const plan = storeyPlan(index);
      if (plan !== shown) lay((shown = plan));
    },
  };
};

/** The bottom floor's balcony stands on posts down to the street, at its outer corners (the ones above it hang off their walls). */
export function buildBalconyPosts(group: THREE.Group, colliders: Collider[]) {
  const { minX, maxX, maxZ } = BALCONY;
  const postH = -SLAB - STREET_Y;
  for (const x of [minX + 0.25, maxX - 0.25]) {
    group.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, postH, 12), toon('#e6e8ee'), x, STREET_Y + postH / 2, maxZ - 0.25));
    colliders.push({ minX: x - 0.14, maxX: x + 0.14, minZ: maxZ - 0.39, maxZ: maxZ - 0.11, bottom: STREET_Y, top: -SLAB });
  }
}

/**
 * Outside the exit: a concrete landing level with the office floor, and steps running south
 * along the west wall down to the street, with a railing on the open side.
 */
export function buildExitStairs(group: THREE.Group, colliders: Collider[]) {
  const { minX, maxX, landingZ0, landingZ1, steps, run } = EXIT_STAIRS;
  const width = maxX - minX;
  const rise = -STREET_Y / steps;
  const treads = steps - 1;
  const L = landingZ1 - landingZ0;
  // Side profile: x runs south from the landing's north end, y is height.
  const profile = new THREE.Shape();
  profile.moveTo(0, STREET_Y);
  profile.lineTo(0, 0);
  profile.lineTo(L, 0);
  for (let i = 1; i <= treads; i++) {
    profile.lineTo(L + (i - 1) * run, -i * rise);
    profile.lineTo(L + i * run, -i * rise);
  }
  profile.lineTo(L + treads * run, STREET_Y);
  profile.closePath();
  const block = mesh(new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false }), toon('#d3d6dd'), maxX, 0, landingZ0);
  block.rotation.y = -Math.PI / 2;
  group.add(block);
  const tread = toon('#b9bdc6');
  const cx = (minX + maxX) / 2;
  group.add(mesh(box(width, 0.04, L), tread, cx, -0.015, landingZ0 + L / 2, false));
  colliders.push({ minX, maxX, minZ: landingZ0, maxZ: landingZ1, bottom: STREET_Y, top: 0 });
  for (let i = 1; i <= treads; i++) {
    const z0 = landingZ1 + (i - 1) * run;
    group.add(mesh(box(width, 0.04, run + 0.02), tread, cx, -i * rise - 0.015, z0 + run / 2, false));
    colliders.push({ minX, maxX, minZ: z0, maxZ: z0 + run, bottom: STREET_Y, top: -i * rise });
  }

  // The railing: round the landing's open sides, then down the stairs.
  const ink = toon(PALETTE.deskLeg);
  const railX = minX + 0.06;
  const railH = 1.0;
  const post = (x: number, y: number, z: number) => group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, railH, 6), ink, x, y + railH / 2, z, false));
  const rail = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const r = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), ink, (x0 + x1) / 2, (y0 + y1) / 2 + railH, (z0 + z1) / 2, false);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
    group.add(r);
  };
  const nz = landingZ0 + 0.06;
  post(maxX - 0.05, 0, nz);
  post(railX, 0, nz);
  post(railX, 0, landingZ1);
  rail(maxX - 0.05, 0, nz, railX, 0, nz);
  rail(railX, 0, nz, railX, 0, landingZ1);
  const bottomZ = landingZ1 + (treads - 0.5) * run;
  for (let i = 2; i <= treads; i += 3) post(railX, -i * rise, landingZ1 + (i - 0.5) * run);
  post(railX, -treads * rise, bottomZ);
  rail(railX, 0, landingZ1, railX, -treads * rise, bottomZ);
  colliders.push({ minX: minX - 0.05, maxX: minX + 0.1, minZ: landingZ0, maxZ: bottomZ, bottom: STREET_Y, top: 99 });
  colliders.push({ minX, maxX, minZ: landingZ0 - 0.05, maxZ: landingZ0 + 0.1, bottom: STREET_Y, top: 99 });
}

import * as THREE from 'three';
import { STAGE_HEIGHT, VENUE_DOOR_INSIDE, VENUE_ROOM, WING_DOOR, ZONES } from '../../../shared/venue';
import { BACKSTAGE_DOOR, BACK_WALL, GALLERY, LOADING_DOOR, PILLARS_X, PILLAR_HALF, PILLAR_Z, STAGE_STAIRS } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow, neonSign } from '../casino/parts';
import { BOLD, SW, brickTexture, concreteTexture, corrugatedTexture, drawLogo, softDot } from './signs';
import type { Look } from './lighting';
import { noPick, pickBox } from './pick';

/*
 * The Schallwerk's hall (flrnoh fork, see FORK.md "The Schallwerk"): the shell the building builds the
 * first time anyone goes in. Polished dark concrete underfoot; raw brick walls, painted black up to
 * 3.5 m in the hall, with the old arched windows high up blacked out; acoustic panels over the bar and
 * along the wing's wall; the big riveted roof trusses under a dark ceiling, industrial pendants as the
 * house lights; the gallery over the foyer with its balcony rail facing the stage and SCHALLWERK on its
 * front; the wall to the rehearsal wing (its door into the foyer, the artists' door into backstage),
 * the hall's back wall behind the stage (the LED wall is the rig's) with the band's way up through it;
 * the doors back out under a green AUSGANG; emergency exit signs. Interior coordinates (shared/venue.ts).
 */

const R = VENUE_ROOM;
const H = R.height;
const T = 0.3;
const WING_X = ZONES.wing.maxX;
const WT = 0.2;

export interface VenueShell {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** The doors inside (E: back out onto the street). */
  exit: Interactable;
  update(look: Look, t: number): void;
}

export function buildVenueShell(): VenueShell {
  const group = new THREE.Group();
  group.name = 'venue-room';
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  /** What glows under the black light: materials whose emissive goes up with the UV. */
  const uvGlow: { mat: THREE.MeshToonMaterial; base: number }[] = [];
  const W = R.maxX - R.minX;
  const D = R.maxZ - R.minZ;

  // ---- The floor -----------------------------------------------------------------------------------
  const conc = concreteTexture('#3e3c3d');
  conc.repeat.set(W / 4, D / 4);
  const floor = mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: conc, gradientMap }), 0, 0, 0, false);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: -1, top: 0 });

  // ---- Walls -----------------------------------------------------------------------------------------
  const brickMats = new Map<string, THREE.MeshToonMaterial>();
  /** Brick for a wall `w` wide and `h` tall, sooty or painted over (`paint`: a colour washed over it). */
  const brick = (w: number, h: number, paint: string | null = null) => {
    const key = `${w.toFixed(1)}|${h.toFixed(1)}|${paint}`;
    let m = brickMats.get(key);
    if (!m) {
      const t = brickTexture(Math.round(w * 7 + h), 0.35);
      t.repeat.set(w / 1.6, h / 1.2);
      m = new THREE.MeshToonMaterial({ map: t, gradientMap, color: paint ?? '#ffffff' });
      brickMats.set(key, m);
    }
    return m;
  };
  const black = toon('#151418');
  /**
   * A wall face, from (a) to (b) along x or z at `at`, facing `facing` (+1: toward +x/+z), from `y0` to
   * `y1`: brick, or painted black below `paintTo` (the hall's), or a colour washed over the brick.
   */
  const face = (alongX: boolean, a: number, b: number, at: number, facing: 1 | -1, y0: number, y1: number, look: 'hall' | 'raw' | 'grey') => {
    const len = b - a;
    const mid = (a + b) / 2;
    const rot = alongX ? (facing > 0 ? 0 : Math.PI) : facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    const put = (from: number, to: number, mat: THREE.Material) => {
      if (to - from < 0.01) return;
      const m = mesh(new THREE.PlaneGeometry(len, to - from), mat, alongX ? mid : at + facing * 0.005, (from + to) / 2, alongX ? at + facing * 0.005 : mid, false);
      m.rotation.y = rot;
      group.add(m);
    };
    if (look === 'hall') {
      put(y0, Math.min(y1, 3.5), black);
      put(Math.max(y0, 3.5), y1, brick(len, y1 - Math.max(y0, 3.5)));
      if (y1 > 3.5 && y0 < 3.5) {
        // A steel angle where the paint stops.
        const trim = mesh(alongX ? box(len, 0.08, 0.06) : box(0.06, 0.08, len), toon('#2a2c33'), alongX ? mid : at + facing * 0.03, 3.5, alongX ? at + facing * 0.03 : mid, false);
        parts.add(trim);
      }
    } else put(y0, y1, brick(len, y1 - y0, look === 'grey' ? '#c9c4bd' : null));
  };
  /** A solid wall between two faces, and what you bump into. */
  const solid = (alongX: boolean, a: number, b: number, at: number, thick: number, y0 = 0, y1: number = H) => {
    parts.add(mesh(alongX ? box(b - a, y1 - y0, thick) : box(thick, y1 - y0, b - a), toon('#4a2a22'), alongX ? (a + b) / 2 : at, (y0 + y1) / 2, alongX ? at : (a + b) / 2, false));
    colliders.push(alongX ? { minX: a, maxX: b, minZ: at - thick / 2, maxZ: at + thick / 2, bottom: y0, top: y1 } : { minX: at - thick / 2, maxX: at + thick / 2, minZ: a, maxZ: b, bottom: y0, top: y1 });
  };

  // The outer walls. The north one has the doors (x ±1.6) and the gallery in front of it.
  const dHalf = VENUE_DOOR_INSIDE.width / 2;
  solid(true, R.minX - T, -dHalf, R.minZ - T / 2, T);
  solid(true, dHalf, R.maxX + T, R.minZ - T / 2, T);
  solid(true, -dHalf, dHalf, R.minZ - T / 2, T, 3.1, H);
  solid(true, R.minX - T, R.maxX + T, R.maxZ + T / 2, T);
  solid(false, R.minZ, R.maxZ, R.minX - T / 2, T);
  solid(false, R.minZ, R.maxZ, R.maxX + T / 2, T);
  face(true, WING_X + WT / 2, -dHalf, R.minZ, 1, 0, H, 'raw');
  face(true, dHalf, R.maxX, R.minZ, 1, 0, H, 'raw');
  face(true, -dHalf, dHalf, R.minZ, 1, 3.1, H, 'raw');
  face(true, R.minX, WING_X - WT / 2, R.minZ, 1, 0, H, 'grey');
  // East: the foyer's end raw, the hall's painted below, backstage grey.
  face(false, R.minZ, ZONES.foyer.maxZ, R.maxX, -1, 0, H, 'raw');
  face(false, ZONES.foyer.maxZ, BACK_WALL.z0, R.maxX, -1, 0, H, 'hall');
  face(false, BACK_WALL.z1, R.maxZ, R.maxX, -1, 0, H, 'grey');
  face(true, WING_X + WT / 2, R.maxX, R.maxZ, -1, 0, H, 'grey');
  // The wing's own outer walls (its rooms' insides are the rehearsal wing's).
  face(true, R.minX, WING_X - WT / 2, R.maxZ, -1, 0, H, 'grey');
  face(false, R.minZ, R.maxZ, R.minX, 1, 0, H, 'grey');

  // The wall to the rehearsal wing, with its door into the foyer and the artists' door into backstage.
  const gaps = [
    { z: WING_DOOR.z, w: WING_DOOR.width, h: 2.6 },
    { z: BACKSTAGE_DOOR.z, w: BACKSTAGE_DOOR.width, h: 2.4 },
  ].sort((a, b) => a.z - b.z);
  let from = R.minZ;
  for (const g of gaps) {
    solid(false, from, g.z - g.w / 2, WING_X, WT);
    solid(false, g.z - g.w / 2, g.z + g.w / 2, WING_X, WT, g.h, H);
    from = g.z + g.w / 2;
  }
  solid(false, from, R.maxZ, WING_X, WT);
  // Its faces on the hall's side: the foyer's raw, the hall's painted, backstage grey; and the wing's side grey.
  const hallSide = WING_X + WT / 2;
  const segs: [number, number, number][] = [];
  from = R.minZ;
  for (const g of gaps) {
    segs.push([from, g.z - g.w / 2, 0], [g.z - g.w / 2, g.z + g.w / 2, g.h]);
    from = g.z + g.w / 2;
  }
  segs.push([from, R.maxZ, 0]);
  for (const [a, b, y0] of segs) {
    const parts3: [number, number, 'raw' | 'hall' | 'grey'][] = [
      [a, Math.min(b, ZONES.foyer.maxZ), 'raw'],
      [Math.max(a, ZONES.foyer.maxZ), Math.min(b, BACK_WALL.z0), 'hall'],
      [Math.max(a, BACK_WALL.z1), b, 'grey'],
    ];
    for (const [p, q, look] of parts3) if (q - p > 0.01) face(false, p, q, hallSide, 1, y0, H, look);
    face(false, a, b, WING_X - WT / 2, -1, y0, H, 'grey');
  }
  // Steel door frames in both openings.
  const frameMat = toon('#2b2d33');
  for (const g of gaps) {
    for (const s of [-1, 1]) parts.add(mesh(box(WT + 0.08, g.h, 0.08), frameMat, WING_X, g.h / 2, g.z + s * (g.w / 2 + 0.02)));
    parts.add(mesh(box(WT + 0.08, 0.1, g.w + 0.12), frameMat, WING_X, g.h, g.z));
  }

  // The hall's back wall behind the stage, with the band's opening over the stairs' landing.
  const bz = (BACK_WALL.z0 + BACK_WALL.z1) / 2;
  const bt = BACK_WALL.z1 - BACK_WALL.z0;
  const open = { a: STAGE_STAIRS.minX, b: STAGE_STAIRS.maxX, y0: STAGE_HEIGHT, y1: STAGE_HEIGHT + 2.4 };
  solid(true, hallSide, open.a, bz, bt);
  solid(true, open.b, R.maxX, bz, bt);
  solid(true, open.a, open.b, bz, bt, open.y1, H);
  solid(true, open.a, open.b, bz, bt, 0, open.y0);
  face(true, hallSide, open.a, BACK_WALL.z0, -1, 0, H, 'hall');
  face(true, open.b, R.maxX, BACK_WALL.z0, -1, 0, H, 'hall');
  face(true, open.a, open.b, BACK_WALL.z0, -1, open.y1, H, 'hall');
  face(true, hallSide, open.a, BACK_WALL.z1, 1, 0, H, 'grey');
  face(true, open.b, R.maxX, BACK_WALL.z1, 1, 0, H, 'grey');
  face(true, open.a, open.b, BACK_WALL.z1, 1, open.y1, H, 'grey');
  // A black drape in the opening, tied back, and a frame.
  for (const s of [-1, 1]) {
    parts.add(mesh(box(0.08, open.y1 - open.y0 + 0.1, bt + 0.1), frameMat, (s < 0 ? open.a : open.b) - s * 0.04, (open.y0 + open.y1) / 2, bz));
    parts.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, open.y1 - open.y0, 8), toon('#0d0d10'), s < 0 ? open.a + 0.2 : open.b - 0.2, (open.y0 + open.y1) / 2, BACK_WALL.z0 - 0.1));
  }

  // ---- The gallery over the foyer, its balcony front toward the stage ----------------------------
  {
    const gx0 = hallSide;
    const gx1 = R.maxX;
    const gz0 = R.minZ;
    const gz1 = GALLERY.edgeZ;
    parts.add(mesh(box(gx1 - gx0, 0.3, gz1 - gz0), toon('#2a2729'), (gx0 + gx1) / 2, GALLERY.y + 0.15, (gz0 + gz1) / 2));
    colliders.push({ minX: gx0, maxX: gx1, minZ: gz0, maxZ: gz1, bottom: GALLERY.y, top: GALLERY.y + 0.3 });
    // Its underside: dark timber boards, warm downlights.
    const boards = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#4a3326';
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) {
        g.fillStyle = y % 32 ? '#553b2c' : '#41291e';
        g.fillRect(0, y, 128, 14);
      }
    });
    boards.wrapS = boards.wrapT = THREE.RepeatWrapping;
    boards.repeat.set((gx1 - gx0) / 2, (gz1 - gz0) / 2);
    group.add(mesh(new THREE.PlaneGeometry(gx1 - gx0, gz1 - gz0).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ map: boards, gradientMap }), (gx0 + gx1) / 2, GALLERY.y - 0.01, (gz0 + gz1) / 2, false));
    // The front: a black fascia with SCHALLWERK and a steel balustrade over it.
    const fascia = canvasTexture(2048, 64, (g) => {
      g.fillStyle = '#121114';
      g.fillRect(0, 0, 2048, 64);
      g.fillStyle = '#d8d0c2';
      g.font = `44px ${BOLD}`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      for (const x of [380, 1024, 1668]) g.fillText('· S C H A L L W E R K ·', x, 34);
    });
    const fm = new THREE.MeshToonMaterial({ map: fascia, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: fascia, emissiveIntensity: 0.15 });
    fm.userData.outlineParameters = { visible: false }; // (seen from the foyer behind it, the outline would draw it whole)
    uvGlow.push({ mat: fm, base: 0.15 });
    group.add(mesh(new THREE.PlaneGeometry(gx1 - gx0, 0.62), fm, (gx0 + gx1) / 2, GALLERY.y + 0.12, gz1 + 0.01, false));
    const rail = toon('#2b2d33');
    parts.add(mesh(box(gx1 - gx0, 0.08, 0.1), rail, (gx0 + gx1) / 2, GALLERY.y + 0.3 + GALLERY.rail, gz1 - 0.05));
    parts.add(mesh(box(gx1 - gx0, 0.05, 0.05), rail, (gx0 + gx1) / 2, GALLERY.y + 0.3 + GALLERY.rail / 2, gz1 - 0.05));
    for (let x = gx0 + 0.3; x < gx1; x += 1.2) parts.add(mesh(box(0.05, GALLERY.rail, 0.05), rail, x, GALLERY.y + 0.3 + GALLERY.rail / 2, gz1 - 0.05));
    // Up there: a few bar tables and stools in silhouette, as if anyone could get up there.
    for (const x of [-6, 0.5, 9, 16]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12), toon('#1d1c20'), x, GALLERY.y + 1.4, gz1 - 1.2));
      parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), toon('#1d1c20'), x, GALLERY.y + 0.85, gz1 - 1.2));
    }
    // The pillars holding it up.
    for (const x of PILLARS_X) {
      parts.add(mesh(box(PILLAR_HALF * 2, GALLERY.y, PILLAR_HALF * 2), toon('#24232a'), x, GALLERY.y / 2, PILLAR_Z));
      colliders.push({ minX: x - PILLAR_HALF, maxX: x + PILLAR_HALF, minZ: PILLAR_Z - PILLAR_HALF, maxZ: PILLAR_Z + PILLAR_HALF, bottom: 0, top: GALLERY.y });
    }
  }

  // ---- The ceiling, the roof trusses, the blacked-out windows -------------------------------------
  const ceiling = mesh(new THREE.PlaneGeometry(W + 2 * T, D + 2 * T).rotateX(Math.PI / 2), new THREE.MeshToonMaterial({ map: (() => {
    const c = corrugatedTexture('#1a1a1f');
    c.repeat.set(W / 2, 4);
    return c;
  })(), gradientMap }), 0, H, 0, false);
  group.add(ceiling);
  colliders.push({ minX: R.minX - T, maxX: R.maxX + T, minZ: R.minZ - T, maxZ: R.maxZ + T, bottom: H, top: H + 0.3 });
  const steel = toon('#3a3f4a');
  const rivet = toon('#262a32');
  const TRUSS_Y = 8.1;
  for (let z = -12; z <= 12; z += 6) {
    // A riveted Pratt truss across the hall (and on over the wing, where its rooms' ceilings hide it).
    parts.add(mesh(box(W, 0.22, 0.22), steel, 0, TRUSS_Y, z));
    parts.add(mesh(box(W, 0.18, 0.18), steel, 0, H - 0.12, z));
    for (let x = R.minX + 1; x < R.maxX; x += 2) {
      parts.add(mesh(box(0.1, H - TRUSS_Y - 0.1, 0.1), rivet, x, (TRUSS_Y + H) / 2, z));
      const d = mesh(box(0.08, 1.25, 0.08), rivet, x + 1, (TRUSS_Y + H) / 2, z);
      d.rotation.z = Math.round((x - R.minX) / 2) % 2 ? 0.95 : -0.95;
      parts.add(d);
    }
  }
  for (let x = R.minX + 4; x < R.maxX; x += 8) parts.add(mesh(box(0.12, 0.25, D), steel, x, H - 0.25, 0));
  // The old arched windows high in the hall's walls, blacked out, the night faintly through the cracks.
  const arch = new THREE.Shape();
  arch.moveTo(-1, 0);
  arch.lineTo(1, 0);
  arch.lineTo(1, 2.6);
  arch.absarc(0, 2.6, 1, 0, Math.PI, false);
  arch.lineTo(-1, 0);
  const archGeo = new THREE.ShapeGeometry(arch, 10);
  const winTex = canvasTexture(32, 64, (g) => {
    g.fillStyle = '#0b0d1c';
    g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#26305c';
    for (let x = 0; x < 32; x += 8) g.fillRect(x, 0, 1, 64);
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 32, 1);
  });
  const winMat = new THREE.MeshBasicMaterial({ map: winTex });
  winMat.userData.outlineParameters = { visible: false };
  const frame = toon('#3b1d16');
  for (const z of [7.6]) {
    // (only over the DJ booth: the acoustic panels have the wall over the bar)
    const w = mesh(archGeo, winMat, R.maxX - 0.02, 4.6, z, false);
    w.rotation.y = -Math.PI / 2;
    group.add(w);
    parts.add(mesh(box(0.08, 0.15, 2.4), frame, R.maxX - 0.05, 4.55, z));
  }
  for (let x = -6; x <= 18; x += 6) {
    const w = mesh(archGeo, winMat, x, 5.2, R.minZ + 0.02, false);
    group.add(w);
  }

  // ---- Acoustic panels over the bar and along the wing's wall --------------------------------------
  {
    const fabric = toon('#2c2b31');
    const wood = toon('#6b4a30');
    for (let z = -7.6; z < 2.6; z += 1.7)
      for (const y of [4.4, 5.8, 7.2]) {
        parts.add(mesh(box(0.12, 1.25, 1.5), fabric, R.maxX - 0.08, y, z + 0.8));
        parts.add(mesh(box(0.14, 1.31, 0.06), wood, R.maxX - 0.08, y, z + 0.05));
      }
    for (let z = -8.4; z < 3.6; z += 1.7)
      for (const y of [4.4, 5.8, 7.2]) {
        parts.add(mesh(box(0.12, 1.25, 1.5), fabric, hallSide + 0.08, y, z + 0.8));
        parts.add(mesh(box(0.14, 1.31, 0.06), wood, hallSide + 0.08, y, z + 0.05));
      }
  }

  // ---- House lights: enamel pendants in rows over the hall; the gallery's downlights ---------------
  const pendantLamp = glow(null, '#ffe2b0');
  const shade = toon('#1f3a33');
  const pendants = new THREE.Group();
  for (const z of [-7.5, -3, 1.5])
    for (let x = -8; x <= 18; x += 5.2) {
      pendants.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, H - 6.6, 4), toon('#111'), x, (H + 6.6) / 2, z, false));
      pendants.add(mesh(new THREE.ConeGeometry(0.42, 0.3, 16, 1, true), shade, x, 6.5, z, false));
      pendants.add(mesh(new THREE.CircleGeometry(0.36, 16).rotateX(Math.PI / 2), pendantLamp, x, 6.36, z, false));
    }
  group.add(mergeByMaterial(pendants));
  const downMat = glow(null, '#ffd9a0');
  const downs = new THREE.Group();
  for (let x = -9; x < R.maxX; x += 3.4)
    for (const z of [-14.2, -11.2]) downs.add(mesh(new THREE.CircleGeometry(0.14, 12).rotateX(Math.PI / 2), downMat, x, GALLERY.y - 0.02, z, false));
  group.add(mergeByMaterial(downs));
  // The pendants' pools of light on the floor, faint.
  const poolMat = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffcf8f', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  poolMat.userData.outlineParameters = { visible: false };
  const pools = new THREE.Group();
  for (const z of [-7.5, -3, 1.5]) for (let x = -8; x <= 18; x += 5.2) pools.add(mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), poolMat, x, 0.02, z, false));
  const poolMesh = mergeByMaterial(pools);
  noPick(poolMesh);
  group.add(poolMesh);

  // ---- The doors back out, AUSGANG over them, the loading door, the exit signs --------------------
  const dw = VENUE_DOOR_INSIDE.width;
  const dz = R.minZ + 0.04;
  const leafMat = toon('#2f3138');
  const exit: Interactable = { kind: 'venue', x: VENUE_DOOR_INSIDE.x, z: VENUE_DOOR_INSIDE.z, radius: 2 };
  interactables.push(exit);
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, 2.95, 0.06), leafMat, 0, 0, 0, false));
    leaf.add(mesh(box(0.5, 0.9, 0.02), toon('#ffcf8a', { emissive: '#ffb060' }), 0, 0.55, 0.035, false));
    leaf.add(mesh(box(dw / 2 - 0.3, 0.06, 0.08), toon('#c0392b'), 0, -0.25, 0.08, false));
    leaf.position.set(VENUE_DOOR_INSIDE.x + (s * dw) / 4, 1.5, dz);
    leaf.traverse((o) => (o.userData.interact = exit));
    group.add(leaf);
  }
  parts.add(mesh(box(dw + 0.3, 0.12, 0.12), frameMat, VENUE_DOOR_INSIDE.x, 3.04, dz));
  pickBox(group, exit, { minX: VENUE_DOOR_INSIDE.x - dw / 2, maxX: VENUE_DOOR_INSIDE.x + dw / 2, minZ: R.minZ, maxZ: R.minZ + 0.12 }, 0, 3.1);
  const ausgang = mesh(new THREE.PlaneGeometry(1.3, 0.38), glow(neonSign('AUSGANG', '#3dff8a', 512, 150, '#0c2a18')), VENUE_DOOR_INSIDE.x, 3.42, R.minZ + 0.05, false);
  ausgang.userData.interact = exit;
  group.add(ausgang);
  // The loading door in the east wall backstage: a roll-up door, shut.
  const roll = corrugatedTexture('#6d727a');
  roll.repeat.set(1, 5);
  roll.rotation = Math.PI / 2;
  const rd = mesh(new THREE.PlaneGeometry(LOADING_DOOR.width, LOADING_DOOR.height), new THREE.MeshToonMaterial({ map: roll, gradientMap }), R.maxX - 0.02, LOADING_DOOR.height / 2 + 0.05, LOADING_DOOR.z, false);
  rd.rotation.y = -Math.PI / 2;
  group.add(rd);
  // Green running-man exit signs over the ways out.
  const exitTex = canvasTexture(128, 48, (g) => {
    g.fillStyle = '#0b8a3e';
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = '#ffffff';
    g.fillRect(84, 8, 34, 32);
    g.fillStyle = '#0b8a3e';
    g.fillRect(90, 12, 22, 28);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(46, 12, 5, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.moveTo(36, 40);
    g.lineTo(46, 26);
    g.lineTo(58, 40);
    g.moveTo(46, 18);
    g.lineTo(46, 28);
    g.moveTo(34, 22);
    g.lineTo(58, 22);
    g.stroke();
  });
  const exitSign = glow(exitTex);
  for (const [x, y, z, rot] of [
    [hallSide + 0.03, 2.95, WING_DOOR.z, Math.PI / 2],
    [hallSide + 0.03, 2.75, BACKSTAGE_DOOR.z, Math.PI / 2],
    [R.maxX - 0.03, 3.8, LOADING_DOOR.z, -Math.PI / 2],
    [VENUE_DOOR_INSIDE.x + 2.4, 3.1, R.minZ + 0.03, 0],
  ] as const) {
    const m = mesh(new THREE.PlaneGeometry(0.6, 0.22), exitSign, x, y, z, false);
    m.rotation.y = rot;
    group.add(m);
  }
  // Signs to the wing and to backstage.
  const label = (text: string, sub: string) =>
    canvasTexture(512, 128, (g) => {
      g.fillStyle = '#16161a';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = SW.cream;
      g.font = `64px ${BOLD}`;
      g.textBaseline = 'middle';
      g.fillText(text, 24, 50, 470);
      g.fillStyle = SW.amber;
      g.font = `34px ${BOLD}`;
      g.fillText(sub, 26, 102, 470);
    });
  const wingSign = mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshToonMaterial({ map: label('PROBERÄUME · STUDIO', '→ Proberaum 1–3 · Studio · Backstage'), gradientMap }), hallSide + 0.02, 3.3, WING_DOOR.z, false);
  wingSign.rotation.y = Math.PI / 2;
  group.add(wingSign);
  const crewSign = mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshToonMaterial({ map: label('BACKSTAGE', 'Nur Crew & Bands'), gradientMap }), hallSide + 0.02, 3.0, BACKSTAGE_DOOR.z, false);
  crewSign.rotation.y = Math.PI / 2;
  group.add(crewSign);
  // And over the doors inside, the house's mark in white paint on the brick.
  const mark = mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 256, (g) => drawLogo(g, 128, 128, 230, 'rgba(240,232,220,0.85)')), transparent: true, depthWrite: false }), VENUE_DOOR_INSIDE.x, 6.4, R.minZ + 0.03, false);
  (mark.material as THREE.Material).userData.outlineParameters = { visible: false };
  group.add(mark);

  group.add(mergeByMaterial(parts));

  return {
    group,
    colliders,
    interactables,
    exit,
    update(look) {
      pendantLamp.color.setRGB(1, 0.89, 0.69).multiplyScalar(0.12 + look.house * 1.3);
      poolMat.opacity = look.house * 0.35;
      // The foyer stays lit (it's out of the show), a little lower in a club.
      downMat.color.setRGB(1, 0.85, 0.63).multiplyScalar(look.mode === 'club' ? 0.7 : 1);
      for (const g of uvGlow) g.mat.emissiveIntensity = g.base + look.uv * 0.9;
    },
  };
}

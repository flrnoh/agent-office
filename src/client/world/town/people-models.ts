import * as THREE from 'three';
import { HAIR_STYLES } from '../../../shared/avatar';
import { styleHair } from '../character/person-hair';
import { toon } from '../toon';

// flrnoh fork (see FORK.md): what the city's passers-by are made of (see town/people.ts). They're the
// office's chibi people (world/character/person.ts), cut down to a few parts each, and every part is
// one instanced mesh for all of them: a torso, a head, a face, hair (a mesh per style), legs, arms,
// hands, a shopping bag and an umbrella, and a dog with its legs and its lead. A few dozen draw
// calls for the whole street, however many are out.

/** How many people, and dogs, are drawn at most. */
export const MAX_PEOPLE = 190;
export const MAX_DOGS = 40;

/** A geometry with every vertex one color (multiplied by each instance's own color). */
function painted(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).clone();
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Puts painted geometries (position, normal, color) into one. */
function merged(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const norm: number[] = [];
  const col: number[] = [];
  for (const g of geos) {
    pos.push(...(g.getAttribute('position').array as Float32Array));
    norm.push(...(g.getAttribute('normal').array as Float32Array));
    col.push(...(g.getAttribute('color').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

/** A material that takes each instance's color times the vertices' own (shoes darker than the trousers, say). */
function tinted(): THREE.MeshToonMaterial {
  const base = toon('#ffffff');
  return new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: base.gradientMap, vertexColors: true });
}

export interface PeopleMeshes {
  torso: THREE.InstancedMesh;
  head: THREE.InstancedMesh;
  face: THREE.InstancedMesh;
  /** One per hair style (HAIR_STYLES), Bald's empty. */
  hair: THREE.InstancedMesh[];
  /** Two per person: their legs, their arms, their hands. */
  legs: THREE.InstancedMesh;
  arms: THREE.InstancedMesh;
  hands: THREE.InstancedMesh;
  bags: THREE.InstancedMesh;
  umbrellas: THREE.InstancedMesh;
  dogs: THREE.InstancedMesh;
  dogLegs: THREE.InstancedMesh;
  leads: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  all: THREE.Object3D[];
}

/** A leg hangs from its hip, an arm from its shoulder: down -y from the pivot, as the office's people's do. */
export const LEG_LEN = 0.22;
export const ARM_LEN = 0.24;

export function buildPeopleMeshes(): PeopleMeshes {
  const tint = tinted();
  const plain = toon('#ffffff');
  // Hair and umbrellas are open shells: both sides show.
  const hairTint = tinted();
  hairTint.side = THREE.DoubleSide;
  const shellTint = tinted();
  shellTint.side = THREE.DoubleSide;
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = false) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.count = 0;
    // Nobody aims at a passer-by.
    m.raycast = () => {};
    return m;
  };
  const N = MAX_PEOPLE;
  // The torso, a little coat hem at the bottom in the same color, darker.
  const torso = merged([painted(new THREE.CapsuleGeometry(0.26, 0.28, 4, 10), '#ffffff'), painted(at(new THREE.CylinderGeometry(0.27, 0.29, 0.08, 10), 0, -0.2, 0), '#c8c8c8')]);
  const head = new THREE.SphereGeometry(0.34, 12, 9);
  const face = merged([
    ...[-1, 1].map((sx) => painted(at(new THREE.SphereGeometry(0.055, 6, 5), sx * 0.12, 0.02, 0.3), '#1d1d1d')),
    ...[-1, 1].map((sx) => painted(at(new THREE.SphereGeometry(0.05, 6, 5), sx * 0.2, -0.08, 0.27), '#ff9f9f')),
    painted(at(new THREE.TorusGeometry(0.06, 0.015, 4, 8, Math.PI).rotateZ(Math.PI), 0, -0.08, 0.32), '#1d1d1d'),
  ]);
  // Hair, as the office's people wear it, a mesh per style.
  const hair = HAIR_STYLES.map((_, style) => {
    const g = new THREE.Group();
    styleHair(g, plain, style);
    g.updateMatrixWorld(true);
    // Curly hair is seventy little puffs: every other one, a little bigger, is plenty at a passer-by's distance.
    const curly = HAIR_STYLES[style] === 'Curly';
    const keep = g.children.filter((_, i) => !curly || i % 2 === 0);
    const parts = keep.map((c) => {
      if (curly) c.scale.setScalar(1.25);
      c.updateMatrixWorld(true);
      return painted((c as THREE.Mesh).geometry.clone().applyMatrix4(c.matrixWorld), '#ffffff');
    });
    for (const c of g.children) (c as THREE.Mesh).geometry.dispose();
    const geo = parts.length ? merged(parts) : new THREE.BufferGeometry();
    return inst(geo, hairTint, N);
  });
  const leg = merged([painted(at(new THREE.CapsuleGeometry(0.1, LEG_LEN, 3, 8), 0, -LEG_LEN / 2 - 0.05, 0), '#ffffff'), painted(at(new THREE.BoxGeometry(0.17, 0.09, 0.26), 0, -0.4, 0.04), '#3a3a3a')]);
  const arm = at(new THREE.CapsuleGeometry(0.08, ARM_LEN, 3, 8), 0, -ARM_LEN / 2 - 0.04, 0);
  const hand = at(new THREE.SphereGeometry(0.085, 8, 6), 0, -0.38, 0);
  // A paper bag with handles, and an umbrella: its canopy, its stick and its handle.
  const bag = merged([painted(at(new THREE.BoxGeometry(0.26, 0.3, 0.14), 0, -0.2, 0), '#ffffff'), painted(at(new THREE.TorusGeometry(0.06, 0.01, 4, 8, Math.PI), 0, -0.05, 0), '#3a3a3a')]);
  const umbrella = merged([
    painted(at(new THREE.ConeGeometry(0.72, 0.32, 10, 1, true), 0, 0.16, 0), '#ffffff'),
    painted(at(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 4), 0, -0.4, 0), '#2b2b2b'),
    painted(at(new THREE.SphereGeometry(0.03, 4, 3), 0, 0.33, 0), '#2b2b2b'),
  ]);
  // The dog: body, head and snout (its nose dark), ears and tail; its legs apart.
  const dog = merged([
    painted(new THREE.CapsuleGeometry(0.15, 0.4, 4, 8).rotateX(Math.PI / 2).translate(0, 0.42, 0), '#ffffff'),
    painted(at(new THREE.SphereGeometry(0.15, 10, 8), 0, 0.6, 0.34), '#ffffff'),
    painted(at(new THREE.BoxGeometry(0.12, 0.1, 0.14), 0, 0.56, 0.48), '#ffffff'),
    painted(at(new THREE.SphereGeometry(0.035, 5, 4), 0, 0.58, 0.56), '#1d1d1d'),
    ...[-1, 1].map((sx) => painted(at(new THREE.BoxGeometry(0.06, 0.14, 0.09).rotateZ(sx * 0.35), sx * 0.1, 0.68, 0.3), '#8a8a8a')),
    painted(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 5).rotateX(-0.9).translate(0, 0.55, -0.4), '#ffffff'),
    painted(at(new THREE.TorusGeometry(0.1, 0.02, 4, 10).rotateX(Math.PI / 2).rotateX(0.5), 0, 0.53, 0.25), '#d62828'),
  ]);
  const dogLeg = at(new THREE.CylinderGeometry(0.04, 0.035, 0.32, 5), 0, -0.16, 0);
  const leadGeo = new THREE.BufferGeometry();
  leadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DOGS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  leadGeo.setDrawRange(0, 0);
  const leads = new THREE.LineSegments(leadGeo, new THREE.LineBasicMaterial({ color: '#2b2b2b' }));
  leads.frustumCulled = false;
  leads.raycast = () => {};
  const out: Omit<PeopleMeshes, 'all'> = {
    torso: inst(torso, tint, N, true),
    head: inst(head, plain, N),
    face: inst(face, tint, N),
    hair,
    legs: inst(leg, tint, N * 2),
    arms: inst(arm, plain, N * 2),
    hands: inst(hand, plain, N * 2),
    bags: inst(bag, tint, N),
    umbrellas: inst(umbrella, shellTint, N),
    dogs: inst(dog, tint, MAX_DOGS, true),
    dogLegs: inst(dogLeg, plain, MAX_DOGS * 4),
    leads,
  };
  return { ...out, all: [out.torso, out.head, out.face, ...hair, out.legs, out.arms, out.hands, out.bags, out.umbrellas, out.dogs, out.dogLegs, leads] };
}

// ---- Who they are -----------------------------------------------------------------------------------

export const SHIRTS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#8338ec', '#3a86ff', '#ff006e', '#6a994e', '#bc6c25', '#f1faee', '#264653', '#ffb4a2', '#7f5539', '#adb5bd', '#1d3557'];
export const TROUSERS = ['#3d405b', '#22223b', '#4a4e69', '#6b705c', '#283618', '#5e503f', '#1b263b', '#9a8c98', '#7d8597'];
export const BAGS = ['#d4a373', '#f1faee', '#e63946', '#a8dadc', '#ffd166'];
export const UMBRELLAS = ['#1d3557', '#e63946', '#2a9d8f', '#ffd166', '#6d597a', '#222222', '#f4a261'];
export const DOGS = ['#c08552', '#f1e3c6', '#3b2f2f', '#8d6e63', '#d9b382', '#f5f5f5', '#5a5a5a'];

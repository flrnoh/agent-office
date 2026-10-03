import * as THREE from 'three';
import { thermeFixtures } from '../../../shared/therme-all';
import type { Collider, Interactable } from '../types';
import { mergeByColor } from '../toon';
import { buildWayIn } from './gang';
import type { ThermeParts } from './kit';
import { buildShell } from './shell';
import { buildParadies } from './paradies';
import { buildGrotto } from './grotto';
import { buildWavePool } from './waves';
import { buildSlides, type SlideWorld } from './slides';
import { buildDorf, type Dorf } from './dorf';
import { buildLagune } from './lagune';
import { buildLobby, type Lobby } from './lobby';
import { buildGarden, type Garden } from './garden';
import { buildPoolDecor, type PoolDecor } from './decor';
import { buildDetails, type Details } from './details';
import type { Person } from '../character';
import { softDot } from '../gym/textures';

/*
 * Inside the thermal baths (flrnoh fork, see FORK.md "The thermal baths"): a place of its own, built
 * the first time anyone goes in (client/therme/place.ts), in the baths' own coordinates (shared/
 * therme.ts, the floor at y 0): the shell under the glass dome, the passage from the gym with its
 * door back, the zones' doors that are shut for now, signs where each part is coming; the
 * Thermenparadies (paradies.ts, grotto.ts, palms.ts), and so on; what every pool has (decor.ts). Each
 * part is added here.
 */

export interface ThermeInterior {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  /** The way back to the gym (E at the passage's door). */
  exit: Interactable;
  /** The swim-up bar's counter, and who's behind it. */
  bar: Interactable;
  bartender: Person;
  /** The slides' curves, the board, the black hole's rings (world/therme/slides.ts). */
  slides: SlideWorld;
  /** The Saunadorf: its Saunameister, its board, the steam (world/therme/dorf.ts). */
  dorf: Dorf;
  /** The entrance hall (world/therme/lobby.ts). */
  lobby: Lobby;
  /** The sauna garden round the huts (world/therme/garden.ts): its buckets. */
  garden: Garden;
  /** What every pool has, and the showers (world/therme/decor.ts). */
  decor: PoolDecor;
  /** The finishing touches (world/therme/details.ts): its lights by the slides' gates go red for the one you're on. */
  details: Details;
  /** Every frame inside; `now` is the office's clock (the waves), `me` where you are (what's far off doesn't bubble), `dark` how dark it is outside (0 day … 1 night: the lanterns' halos). */
  update(t: number, dt: number, now: number, me: THREE.Vector3, cold: number, dark: number): void;
}

/** The lanterns' and torches' halos: soft additive dots, one draw call for all of them, showing after dark. */
function buildHalos(list: ThermeParts['halos']): { points: THREE.Points; mat: THREE.PointsMaterial } {
  const pos = new Float32Array(list.length * 3);
  const col = new Float32Array(list.length * 3);
  const c = new THREE.Color();
  list.forEach((h, i) => {
    pos.set([h.x, h.y, h.z], i * 3);
    c.set(h.color);
    col.set([c.r, c.g, c.b], i * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 3.2, map: softDot(), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  mat.toneMapped = false;
  const points = new THREE.Points(geo, mat);
  points.userData.noOutline = true;
  return { points, mat };
}

export function buildThermeInterior(): ThermeInterior {
  const group = new THREE.Group();
  group.name = 'therme';
  const still = new THREE.Group();
  const p: ThermeParts = { group, still, colliders: thermeFixtures().map(({ minX, maxX, minZ, maxZ, top, bottom }) => ({ minX, maxX, minZ, maxZ, top, bottom })), interactables: [], halos: [] };
  buildShell(p);
  const { exit } = buildWayIn(p);
  const paradies = buildParadies(p);
  const grotto = buildGrotto(p);
  const waves = buildWavePool(p);
  const slides = buildSlides(p);
  const dorf = buildDorf(p);
  const lagune = buildLagune(p);
  const lobby = buildLobby(p);
  const garden = buildGarden(p);
  const decor = buildPoolDecor(p);
  const details = buildDetails(p);
  group.add(mergeByColor(still));
  const halos = buildHalos(p.halos);
  group.add(halos.points);
  // No toon outline round what's marked so (water, glass, pick boxes, signs): it's the material that says (core/outline.ts).
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(o.userData.noOutline || m.geometry.userData.noOutline)) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.userData.outlineParameters = { visible: false };
  });
  return {
    group,
    colliders: p.colliders,
    interactables: p.interactables,
    pickables: [group],
    exit,
    bar: paradies.bar,
    bartender: paradies.bartender,
    slides,
    dorf,
    lobby,
    garden,
    decor,
    details,
    update: (t, dt, now, me, cold, dark) => {
      halos.mat.opacity = 0.85 * dark;
      halos.points.visible = dark > 0.02;
      garden.update(t, dt, cold, me);
      decor.update(t, dt);
      paradies.update(t, dt, me);
      grotto.update(t, dt, me);
      waves.update(t, dt, now, me);
      slides.update(t, dt);
      dorf.update(t, dt);
      lagune.update(t, dt, cold, me);
    },
  };
}

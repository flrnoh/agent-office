import * as THREE from 'three';
import { LIGHTHOUSE, shoreX } from '../../../shared/scenic';
import { LIGHT_TOUR, lighthouseSolids, moleAt, polar, stepAt, towerR } from '../../../shared/lighthouse';
import { bulb } from '../outside';
import { tilingCanvasTexture } from '../texture';
import { mesh, textPlane, toon, toonUnique } from '../toon';
import { boulder } from './flora';
import { G, box, type ScenicKit } from './kit';

// The lighthouse out on its rocky point (flrnoh fork, see FORK.md "A day at the beach": it was a
// landmark to look at, now you go up it). A stone mole runs out to it over the water between the
// rocks, steps up onto its plinth, and through the door at its foot a spiral stair winds up round a
// column (LIGHT_TOUR's steps, each one something to stand on) to the lantern room at the top, where
// the lamp turns; a glass door opens onto the gallery round the outside, railed, with the whole coast
// below. Its beam still goes round at night.

const L = LIGHTHOUSE;
const T = LIGHT_TOUR;

/** A cylinder's sides with a gap (the door) toward the land, `gap` radians wide. */
function walled(r0: number, r1: number, h: number, gap: number, segs = 28) {
  return new THREE.CylinderGeometry(r1, r0, h, segs, 1, true, Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
}

/** Builds the lighthouse into `kit.light` (merged and shown from afar) and its colliders; returns its beam, to turn. */
export function buildLighthouse(kit: ScenicKit): THREE.Group {
  const { rand, colliders, night, labels, root, around } = kit;
  // What you stand on and bump into is shared/lighthouse.ts's (the tests climb it too).
  colliders.push(...lighthouseSolids(G));
  const c = kit.light;
  const land = shoreX(L.z);
  const stone = toon('#cdc5b4');
  const paving = toon('#a9a29a');
  const white = toon('#f8f9fa');
  const red = toon('#d62828');
  const dark = toon('#3d405b');
  const wood = toon('#7f5539');

  // The rocks along the point, either side of the mole now (their numbers drawn as they always were).
  let side = 1;
  for (let x = land + 2; x > L.x; x -= 3.2) {
    const j = rand() - 0.5;
    const r = 1.8 + rand() * 1.4;
    const turn = rand() * 6;
    if (x < L.x + T.plinth) continue;
    boulder(c, x, L.z + side * (T.mole.width / 2 + r * 0.85 + 0.2) + j, r, turn, '#8d8a99');
    side = -side;
  }
  boulder(c, L.x - 4.5, L.z + 5.5, 3.6, 1.7, '#77738a');
  boulder(c, L.x - 6, L.z - 3.5, 3, 0.4, '#8d8a99');

  // The mole: stone, out over the water, steps up from the sand and up again onto the plinth.
  const m = T.mole;
  const { x0, x1, deckFrom, deckTo } = moleAt();
  c.add(mesh(box(deckFrom - deckTo, m.deck + 1.2, m.width), paving, (deckFrom + deckTo) / 2, G + (m.deck - 1.2) / 2, L.z));
  for (let k = 0; k < m.stairs; k++) {
    const top = ((k + 1) / (m.stairs + 1)) * m.deck;
    const xa = x0 - k * m.tread;
    c.add(mesh(box(m.tread, top, m.width), paving, xa - m.tread / 2, G + top / 2, L.z));
  }
  for (let k = 0; k < m.upSteps; k++) {
    const top = m.deck + ((k + 1) / m.upSteps) * (T.floor - m.deck);
    const xa = deckTo - k * m.tread;
    c.add(mesh(box(m.tread, top + 1.2, m.width), paving, xa - m.tread / 2, G + (top - 1.2) / 2, L.z));
  }
  // Bollards and a rope along the mole, and two lamps.
  for (let x = deckTo + 0.5; x < deckFrom - 0.3; x += 3) {
    for (const s of [-1, 1]) c.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 8), dark, x, G + m.deck + 0.35, L.z + s * (m.width / 2 - 0.15)));
  }
  for (const s of [-1, 1]) {
    c.add(mesh(box(deckFrom - deckTo, 0.04, 0.04), toon('#e9c46a'), (deckFrom + deckTo) / 2, G + m.deck + 0.62, L.z + s * (m.width / 2 - 0.15), false));
  }
  for (const x of [x0 - 1, deckTo + 1.5]) {
    c.add(mesh(box(0.1, 2.4, 0.1), dark, x, G + m.deck + 1.2, L.z - m.width / 2 + 0.15));
    c.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), bulb(night, '#ffe8a3', 0.1), x, G + m.deck + 2.45, L.z - m.width / 2 + 0.15, false));
    night.halos.push({ at: new THREE.Vector3(x, G + m.deck + 2.45, L.z - m.width / 2 + 0.15), size: 1.4, color: '#ffe8a3', ground: true });
  }
  const sign = textPlane(`🗼 Leuchtturm · ${T.steps} Stufen · Aussicht!`, { color: '#ffffff', bg: '#d62828', border: '#ffffff', size: 40 });
  sign.scale.setScalar(0.85);
  sign.position.set(x0 + 0.6, G + 2.4, L.z + m.width / 2 + 0.3);
  sign.rotation.y = Math.PI / 2;
  labels.add(sign);
  c.add(mesh(box(0.08, 2.2, 0.08), dark, x0 + 0.6, G + 1.1, L.z + m.width / 2 + 0.3));

  // The plinth the tower stands on, railed round its edge but where the mole comes up.
  c.add(mesh(new THREE.CylinderGeometry(T.plinth, T.plinth + 0.8, T.floor + 1.2, 24), stone, L.x, G + (T.floor - 1.2) / 2, L.z));
  c.add(mesh(new THREE.CylinderGeometry(T.plinth + 0.05, T.plinth + 0.05, 0.12, 24), toon('#e9e2d0'), L.x, G + T.floor - 0.05, L.z, false));
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.31) continue;
    const p = polar(T.plinth - 0.25, a);
    c.add(mesh(box(0.07, 1.0, 0.07), white, p.x, G + T.floor + 0.5, p.z, false));
  }
  const rail = mesh(new THREE.TorusGeometry(T.plinth - 0.25, 0.04, 6, 48, Math.PI * 2 - 0.62), white, L.x, G + T.floor + 1.0, L.z, false);
  rail.rotation.set(Math.PI / 2, 0, 0.31);
  c.add(rail);

  // The tower: red and white bands, hollow, the door at its foot toward the land.
  const base = G + T.floor;
  const H = T.top - T.floor;
  const bands = 6;
  const rAt = towerR;
  const lining = toonUnique('#efe6d2');
  lining.side = THREE.BackSide;
  for (let k = 0; k < bands; k++) {
    const y0 = (k / bands) * H;
    const y1 = ((k + 1) / bands) * H;
    const gap = k === 0 ? T.door : 0;
    const outer = gap ? walled(rAt(y0), rAt(y1), y1 - y0, gap) : new THREE.CylinderGeometry(rAt(y1), rAt(y0), y1 - y0, 28, 1, true);
    c.add(mesh(outer, k % 2 ? red : white, L.x, base + (y0 + y1) / 2, L.z));
    const inner = gap ? walled(rAt(y0) - T.wall, rAt(y1) - T.wall, y1 - y0, gap) : new THREE.CylinderGeometry(rAt(y1) - T.wall, rAt(y0) - T.wall, y1 - y0, 28, 1, true);
    c.add(mesh(inner, lining, L.x, base + (y0 + y1) / 2, L.z, false));
  }
  // The door's frame and lintel (the wall over the gap), and a little window here and there.
  const dr = T.r0 - 0.02;
  for (const s of [-1, 1]) {
    const p = polar(dr, (s * T.door) / 2);
    c.add(mesh(box(0.22, 2.3, 0.22), wood, p.x, base + 1.15, p.z));
  }
  const lintelTop = H / bands;
  const over = (r0: number, r1: number) => new THREE.CylinderGeometry(r1, r0, lintelTop - 2.3, 6, 1, true, Math.PI / 2 - T.door / 2, T.door);
  c.add(mesh(over(rAt(2.3), rAt(lintelTop)), white, L.x, base + (2.3 + lintelTop) / 2, L.z));
  c.add(mesh(over(rAt(2.3) - T.wall, rAt(lintelTop) - T.wall), lining, L.x, base + (2.3 + lintelTop) / 2, L.z, false));
  c.add(mesh(box(0.3, 0.12, T.door * T.r0 + 0.3), wood, polar(dr, 0).x, base + 2.36, L.z));
  for (const [y, a] of [
    [5.5, Math.PI],
    [9, Math.PI / 2],
    [12.5, -Math.PI / 2],
    [15.5, Math.PI * 0.8],
  ]) {
    const p = polar(rAt(y) + 0.01, a);
    const w = mesh(box(0.08, 0.7, 0.5), toon('#1d3557'), p.x, base + y, p.z, false);
    w.rotation.y = -a;
    c.add(w);
  }

  // The spiral stair round its column, a step at a time, and lamps on the column for the dark.
  const steps = new THREE.Group();
  const tread = toon('#8d6e63');
  for (let i = 0; i < T.steps; i++) {
    const s = stepAt(i);
    // Each tread from the column to the wall (the tower narrows as it goes up).
    const out = rAt(s.top - T.floor) - T.wall - 0.03;
    const p = polar((T.column + out) / 2, s.a);
    const g = mesh(box(out - T.column, 0.1, 0.5), tread, p.x, G + s.top - 0.05, p.z);
    g.rotation.y = -s.a;
    steps.add(g);
    const riser = mesh(box(out - T.column, 0.16, 0.06), toon('#6d4c41'), p.x, G + s.top - 0.18, p.z, false);
    riser.rotation.y = -s.a;
    steps.add(riser);
  }
  c.add(steps);
  c.add(mesh(new THREE.CylinderGeometry(T.column - 0.05, T.column - 0.05, T.top - T.floor + 0.8, 12), toon('#bfb6a3'), L.x, base + (H + 0.8) / 2, L.z));
  for (const y of [4.2, 9, 13.8]) {
    const p = polar(T.column, 0.4 + y);
    c.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), bulb(night, '#ffe8a3', 0.6), p.x, base + y, p.z, false));
  }

  // The top: the floor of the lantern room and the gallery round it (open where the stair comes up).
  const deck = G + T.top;
  const hatchFrom = stepAt(T.hatch).a;
  const hatchTo = stepAt(T.steps - 1).a + 0.3;
  const floorMat = toon('#5c677d');
  const disc = (r0: number, r1: number, a0: number, a1: number) => {
    // My angles (x = cos a, z = sin a) are the ring's, turned onto the floor: its θ is -a.
    const g = new THREE.RingGeometry(r0, r1, 40, 1, -a1, a1 - a0).rotateX(-Math.PI / 2);
    c.add(mesh(g, floorMat, L.x, deck + 0.01, L.z, false));
    // Seen from the stair below: turned the other way, so its θ is a.
    const under = new THREE.RingGeometry(r0, r1, 40, 1, a0, a1 - a0).rotateX(Math.PI / 2);
    c.add(mesh(under, toon('#efe6d2'), L.x, deck - 0.12, L.z, false));
  };
  disc(0.01, T.column, 0, Math.PI * 2);
  disc(T.column, T.lantern - 0.15, hatchTo, hatchFrom + Math.PI * 2);
  disc(T.lantern - 0.15, T.gallery, 0, Math.PI * 2);
  // The gallery's railing, all the way round.
  for (let i = 0; i < 32; i++) {
    const p = polar(T.gallery - 0.15, (i / 32) * Math.PI * 2);
    c.add(mesh(box(0.06, 1.0, 0.06), white, p.x, deck + 0.5, p.z, false));
  }
  const galleryRail = mesh(new THREE.TorusGeometry(T.gallery - 0.15, 0.045, 6, 56), white, L.x, deck + 1.02, L.z, false);
  galleryRail.rotation.x = Math.PI / 2;
  c.add(galleryRail);
  c.add(mesh(new THREE.CylinderGeometry(T.gallery, T.r1 + 0.1, 0.35, 32), dark, L.x, deck - 0.2, L.z));
  // The lantern room: glass round it (a door out to the gallery toward the land), mullions, the lamp on the column, the roof.
  const roomH = T.room;
  const glass = bulb(night, '#fff3b0', 0.35);
  const pane = new THREE.MeshToonMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  pane.userData.outlineParameters = { visible: false };
  c.add(new THREE.Mesh(walled(T.lantern, T.lantern, roomH, T.glassDoor), pane).translateX(L.x).translateY(deck + roomH / 2).translateZ(L.z));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const p = polar(T.lantern, a);
    c.add(mesh(box(0.07, roomH, 0.07), dark, p.x, deck + roomH / 2, p.z));
  }
  for (const s of [-1, 1]) {
    const p = polar(T.lantern, (s * T.glassDoor) / 2);
    c.add(mesh(box(0.1, roomH, 0.1), dark, p.x, deck + roomH / 2, p.z));
  }
  c.add(mesh(new THREE.CylinderGeometry(T.lantern + 0.05, T.lantern + 0.05, 0.12, 24), dark, L.x, deck + roomH, L.z));
  c.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.75, 16), glass, L.x, deck + T.lamp, L.z, false));
  c.add(mesh(new THREE.ConeGeometry(T.lantern + 0.35, 1.6, 16), red, L.x, deck + roomH + 0.8, L.z));
  c.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), dark, L.x, deck + roomH + 1.75, L.z));
  night.halos.push({ at: new THREE.Vector3(L.x, deck + T.lamp, L.z), size: 9, color: '#fff3b0', ground: true });

  // Two long cones of light, going round, brightest at the lamp and fading out along their length.
  const beam = new THREE.Group();
  const fade = tilingCanvasTexture(4, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
  });
  // Not wrapping round, or the faded end picks up the bright one.
  fade.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3b8', map: fade, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  mat.userData.outlineParameters = { visible: false };
  night.glows.push({ mat, max: 0.4 });
  for (const s of [-1, 1]) {
    // Starting a little out from the lamp, so it doesn't fill the room you're standing in.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 70, 16, 1, true).translate(0, -35 - 1.2, 0), mat);
    cone.rotation.z = (s * Math.PI) / 2;
    beam.add(cone);
  }
  beam.position.set(L.x, deck + T.lamp, L.z);
  root.add(beam);
  around(beam, L.x, L.z, 70, T.top + 8);
  return beam;
}

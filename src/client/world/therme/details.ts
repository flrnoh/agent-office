import * as THREE from 'three';
import { NORTH_BAND_Z, THERME_BOX, TWALL, ZONES } from '../../../shared/therme';
import { BAR_FLOOR, BACK_BAR, BAR_COUNTER, ISLAND, LOUNGERS } from '../../../shared/therme-paradies';
import { LIFEGUARDS, LIFEGUARD_SEAT, PLANT_BEDS } from '../../../shared/therme-furniture';
import { LEVELS, SLIDES, slideGate, type SlideId } from '../../../shared/therme-slides';
import { mesh, toon } from '../toon';
import { canvasTexture, FONT } from '../casino/parts';
import { Person } from '../character';
import { blk, glow, rand, type ThermeParts } from './kit';
import { mural } from './textures';
import { Planting } from './plants';

/*
 * The thermal baths' finishing touches (flrnoh fork, see shared/therme-furniture.ts): the planting in
 * every bed, the mural of a tropical shore along the dome hall's north wall and the slide hall's
 * supergraphic, lamps on the walls, a clock over the passage, the lifeguards in their high chairs,
 * little tables with drinks between the loungers, lights strung under the swim-up bar's thatch and
 * its menu, torches on the palm island, and a light by every slide's gate (red while you're on it).
 */

export interface Details {
  update(t: number, riding: SlideId | null): void;
}

/** A face for the slide hall's east wall: swooshes in every slide's colour and the hall's name. */
function supergraphic(): THREE.CanvasTexture {
  return canvasTexture(2048, 512, (g) => {
    g.fillStyle = '#e8f4f8';
    g.fillRect(0, 0, 2048, 512);
    SLIDES.forEach((s, i) => {
      g.strokeStyle = s.color;
      g.lineWidth = 46;
      g.lineCap = 'round';
      g.beginPath();
      const y = 80 + i * 52;
      g.moveTo(-40, y);
      g.bezierCurveTo(600, y - 120 + i * 30, 1300, y + 220 - i * 20, 2100, y + 40);
      g.stroke();
    });
    g.fillStyle = '#16324f';
    g.font = `900 190px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 24;
    g.strokeStyle = '#ffffff';
    g.strokeText('RUTSCHENWELT', 1024, 270);
    g.fillText('RUTSCHENWELT', 1024, 270);
  });
}

/** The clock's face: a white dial, twelve marks, the baths' name. */
function clockFace(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#16324f';
    g.lineWidth = 16;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 ? 8 : 16;
      g.beginPath();
      g.moveTo(256 + Math.sin(a) * 200, 256 - Math.cos(a) * 200);
      g.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236);
      g.stroke();
    }
    g.fillStyle = '#0f6e8c';
    g.font = `800 34px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('THERMENWELT', 256, 340);
  });
}

export function buildDetails(p: ThermeParts): Details {
  const r = rand(401);
  // The beds, planted.
  const plants = new Planting(403);
  for (const b of PLANT_BEDS) plants.bed(b, b.maxX - b.minX < 3 || b.maxZ - b.minZ < 3 ? 1.3 : 0.9);
  plants.done(p);
  // The mural along the north wall, above the doors (the passage's, the entrance's) and the grotto.
  const P = ZONES.paradies;
  const wall = NORTH_BAND_Z + TWALL / 2 + 0.02;
  const m = mural(405);
  const len = P.maxX - P.minX - 1;
  m.repeat.set(len / 24, 1);
  const muralMesh = mesh(new THREE.PlaneGeometry(len, 6), new THREE.MeshToonMaterial({ map: m, gradientMap: toon('#ffffff').gradientMap, emissive: '#ffffff', emissiveMap: m, emissiveIntensity: 0.25 }), (P.minX + P.maxX) / 2, 8.6, wall, false);
  p.group.add(muralMesh);
  blk(p, len + 0.2, 0.2, 0.16, '#cdb995', (P.minX + P.maxX) / 2, 5.5, wall);
  blk(p, len + 0.2, 0.2, 0.16, '#cdb995', (P.minX + P.maxX) / 2, 11.7, wall);
  // The slide hall's east wall: its name in swooshes.
  const R = ZONES.rutschen;
  const sg = mesh(new THREE.PlaneGeometry(80, 20), glow(supergraphic()), THERME_BOX.maxX - TWALL / 2 - 0.02, 14, (R.minZ + R.maxZ) / 2 - 10, false);
  sg.rotation.y = -Math.PI / 2;
  sg.userData.noOutline = true;
  p.group.add(sg);
  // Lamps on the walls: warm half-globes along the north wall, between the doors.
  const lamp = new THREE.MeshBasicMaterial({ color: '#ffe7b8' });
  lamp.toneMapped = false;
  const lamps = new THREE.Group();
  for (let x = 58; x < 140; x += 7) {
    if ((x > 94 && x < 106) || (x > 111 && x < 137)) continue;
    lamps.add(mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), lamp, x, 3.6, wall, false));
    blk(p, 0.5, 0.08, 0.2, '#b08d57', x, 3.25, wall + 0.08);
  }
  for (const c of lamps.children) c.userData.noOutline = true;
  p.group.add(lamps);
  // A clock over the passage's door, showing the time.
  const clock = new THREE.Group();
  clock.position.set(100, 4.5, wall + 0.06);
  clock.add(mesh(new THREE.CircleGeometry(0.9, 32), glow(clockFace()), 0, 0, 0.02, false));
  clock.add(mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.1, 32).rotateX(Math.PI / 2), toon('#16324f'), 0, 0, -0.03, false));
  const hand = (len2: number, w: number, color: string) => {
    const h = new THREE.Group();
    h.add(mesh(new THREE.BoxGeometry(w, len2, 0.02), toon(color), 0, len2 / 2 - 0.08, 0, false));
    h.position.z = 0.05;
    clock.add(h);
    return h;
  };
  const hours = hand(0.5, 0.07, '#16324f');
  const minutes = hand(0.72, 0.05, '#16324f');
  const seconds = hand(0.78, 0.015, '#e63946');
  clock.traverse((o) => (o.userData.noOutline = true));
  p.group.add(clock);
  // The lifeguards in their high chairs: white frames, a red seat, a red parasol, someone watching.
  const guards: Person[] = [];
  for (const [i, l] of LIFEGUARDS.entries()) {
    const g = new THREE.Group();
    for (const [sx, sz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const) g.add(mesh(new THREE.BoxGeometry(0.08, LIFEGUARD_SEAT, 0.08), toon('#f4f7f8'), sx, LIFEGUARD_SEAT / 2, sz, false));
    for (let y = 0.4; y < LIFEGUARD_SEAT; y += 0.38) g.add(mesh(new THREE.BoxGeometry(0.8, 0.05, 0.06), toon('#f4f7f8'), 0, y, -0.4, false));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), toon('#e63946'), 0, LIFEGUARD_SEAT, 0, false));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.08), toon('#e63946'), 0, LIFEGUARD_SEAT + 0.3, -0.42, false));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), toon('#f4f7f8'), 0.42, LIFEGUARD_SEAT + 1.1, -0.42, false));
    g.add(mesh(new THREE.ConeGeometry(1.2, 0.45, 10, 1, true), toon('#e63946'), 0.42, LIFEGUARD_SEAT + 2.25, -0.42, false));
    g.add(mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 14), toon('#ff7b00'), 0.47, 1.1, 0, false).rotateY(Math.PI / 2));
    g.position.set(l.x, 0, l.z);
    g.rotation.y = l.rotY;
    p.still.add(g);
    const guard = new Person(i ? 'Bademeisterin' : 'Bademeister', '#e63946', { skin: (i * 5 + 2) % 8, hair: i ? 6 : 3, style: i ? 4 : 1 });
    guard.showLabel(false);
    guard.sit(0.42);
    guard.root.position.set(l.x, LIFEGUARD_SEAT + 0.04 - 0.42, l.z);
    guard.root.rotation.y = l.rotY;
    p.group.add(guard.root);
    guards.push(guard);
  }
  // Little tables between the loungers round the thermal pool, a towel or a drink on each.
  for (const [i, l] of LOUNGERS.entries()) {
    if (i % 2 || l.id.includes('-i')) continue;
    const x = l.x + 1.3;
    const z = l.z + (l.rotY === 0 ? -0.55 : 0.55);
    p.still.add(mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.04, 12), toon('#f4f2ec'), x, 0.48, z, false));
    p.still.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.46, 6), toon('#d8d2c4'), x, 0.23, z, false));
    if (r() > 0.4) {
      const drink = ['#ff8fab', '#ffd166', '#90e0ef', '#f4a261'][i % 4];
      p.still.add(mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.16, 8), toon(drink), x - 0.06, 0.58, z, false));
      p.still.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4), toon('#ffffff'), x - 0.03, 0.66, z, false));
    } else p.still.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), toon(['#4fb0c6', '#f6c453', '#f28c6b'][i % 3]), x, 0.53, z, false));
  }
  // The swim-up bar: lights strung under its thatch, the menu over the back bar, glasses on the counter.
  const F = BAR_FLOOR;
  const bulbs: THREE.MeshBasicMaterial[] = ['#ffd166', '#ff6f91', '#7ae7ff', '#b9ff7a'].map((c) => {
    const b = new THREE.MeshBasicMaterial({ color: c });
    b.toneMapped = false;
    return b;
  });
  const cx = (F.minX + F.maxX) / 2 - 0.6;
  const cz = (F.minZ + F.maxZ) / 2;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const b = mesh(new THREE.SphereGeometry(0.08, 8, 6), bulbs[k % 4], cx + Math.cos(a) * 4.2, 3.28 + Math.sin(k * 1.7) * 0.05, cz + Math.sin(a) * 6.1, false);
    b.userData.noOutline = true;
    p.group.add(b);
  }
  const menu = mesh(new THREE.PlaneGeometry(2.8, 1.1), glow(canvasTexture(768, 300, (g) => {
    g.fillStyle = '#1f2a2e';
    g.fillRect(0, 0, 768, 300);
    g.fillStyle = '#ffe8a8';
    g.font = `900 52px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('🍹 COCKTAILS', 384, 70);
    g.fillStyle = '#ffffff';
    g.font = `700 34px ${FONT}`;
    ['Mai Tai · Mojito', 'Bier vom Fass · Wein', 'Wasser · alles aufs Haus'].forEach((t, i) => g.fillText(t, 384, 140 + i * 52));
  })), BACK_BAR.minX - 0.02, 2.4, (BACK_BAR.minZ + BACK_BAR.maxZ) / 2, false);
  menu.rotation.y = -Math.PI / 2;
  p.group.add(menu);
  for (let z = BAR_COUNTER.minZ + 0.7; z < BAR_COUNTER.maxZ; z += 1.6) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.18, 8), toon(['#ff8fab', '#ffd166', '#90e0ef'][Math.round(z) % 3]), BAR_COUNTER.minX + 0.3, BAR_COUNTER.top + 0.09, z, false));
    p.still.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), toon('#f4a261'), BAR_COUNTER.minX + 0.3, BAR_COUNTER.top + 0.2, z + 0.04, false));
  }
  // Torches on the palm island, by its loungers.
  const flame = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  flame.toneMapped = false;
  const torches: THREE.Mesh[] = [];
  for (const [x, z] of [[ISLAND.minX + 0.8, ISLAND.maxZ - 0.8], [ISLAND.maxX - 0.8, ISLAND.maxZ - 0.8], [ISLAND.maxX - 0.8, ISLAND.minZ + 0.8]] as const) {
    p.still.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), toon('#6b4b2e'), x, 0.8, z, false));
    p.still.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.22, 8), toon('#3b2a1c'), x, 1.7, z, false));
    const f = mesh(new THREE.ConeGeometry(0.1, 0.32, 7), flame, x, 1.96, z, false);
    f.userData.noOutline = true;
    p.group.add(f);
    torches.push(f);
  }
  // A light by every slide's gate: green to go, red while you're on that slide.
  const lights = new Map<SlideId, THREE.MeshBasicMaterial>();
  for (const s of SLIDES) {
    const gte = slideGate(s);
    const side = new THREE.Vector3(Math.cos(gte.rotY), 0, -Math.sin(gte.rotY)).multiplyScalar(s.lanes ? 3.6 : 0.95);
    const x = gte.x + side.x;
    const z = gte.z + side.z;
    const y = LEVELS[s.level];
    p.still.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.18), toon('#22303a'), x, y + 1.75, z, false));
    p.still.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), toon('#22303a'), x, y + 0.75, z, false));
    const mat = new THREE.MeshBasicMaterial({ color: '#3dff7a' });
    mat.toneMapped = false;
    const bulb = mesh(new THREE.SphereGeometry(0.075, 10, 8), mat, x, y + 1.75, z, false);
    bulb.userData.noOutline = true;
    p.group.add(bulb);
    lights.set(s.id, mat);
  }
  return {
    update: (t, riding) => {
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const min = d.getMinutes() + sec / 60;
      seconds.rotation.z = -(sec / 60) * Math.PI * 2;
      minutes.rotation.z = -(min / 60) * Math.PI * 2;
      hours.rotation.z = -(((d.getHours() % 12) + min / 60) / 12) * Math.PI * 2;
      for (const [k, f] of torches.entries()) f.scale.set(1 + Math.sin(t * 9 + k) * 0.12, 1 + Math.sin(t * 6.1 + k * 2) * 0.25, 1);
      for (const [id, mat] of lights) mat.color.set(riding === id ? '#ff3d3d' : '#3dff7a');
      for (const g of guards) g.update(1 / 60, t, false, false);
    },
  };
}


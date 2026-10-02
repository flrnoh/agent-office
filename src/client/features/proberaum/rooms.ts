import * as THREE from 'three';
import { DOOR_HEIGHT, WING_CEILING, doorOf, inner, midZ, solid, type Solid, type WingThing } from '../../../shared/proberaum-layout';
import type { RehearsalRoom, RehearsalRoomId } from '../../../shared/venue';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { board, type Board } from './boards';
import { BOLD, SANS, brickTexture, canvasTex, carpetTexture, fabricTexture, foamTexture, oakTexture, wallTexture } from './paint';
import { POSTERS, posterTexture, stickerTexture } from './posters';
import { bake, box, crates, fairyLights, flightCase, floorLamp, fridge, glow, lavaLamp, paTop, picture, plant, placed, rug, sofa } from './props';
import { planeX, planeZ } from './shell';

/*
 * The three rehearsal rooms inside their walls (flrnoh fork, see FORK.md "The rehearsal wing"), each a
 * vibe of its own round the same furniture (shared/proberaum-layout.ts): Proberaum 1 the classic
 * (grey egg-crate foam, a blue-grey carpet, posters, cold light), Proberaum 2 the cosy one (Persian
 * carpets on the walls and the floor, fairy lights, a lava lamp, a floor lamp and a plant, warm
 * light), Proberaum 3 the Metal-Keller (bare brick, black pyramid foam, a red LED strip, crates and
 * a flight case, red light). In each: the mixer with the little recorder, the beer fridge, the sofa,
 * the PA on stands, the setlist whiteboard. The instruments are the instruments part's.
 */

export interface RoomBuilt {
  id: RehearsalRoomId;
  group: THREE.Group;
  colliders: Collider[];
  /** What the crosshair finds for each thing to use in there (index.ts tags them). */
  tags: Partial<Record<WingThing, THREE.Object3D>>;
  setlist: Board;
  recorder: Board;
  /** The lava lamp's goo (Proberaum 2's). */
  lava?: (color: string) => void;
  update(t: number): void;
}

/** Each room's look. */
const VIBES = {
  probe1: { light: '#eef3ff', power: 2.0, floor: '#3b4252', sofa: '#6b4f3a', throw: undefined, poster: [0, 5] },
  probe2: { light: '#ffc98a', power: 2.1, floor: '', sofa: '#8a3b2a', throw: '#e9c46a', poster: [3, 7] },
  probe3: { light: '#ff3a2a', power: 2.4, floor: '#2b2b2e', sofa: '#1a1a1a', throw: '#5a0f14', poster: [1, 6] },
} as const;

export function buildRoom(r: RehearsalRoom): RoomBuilt {
  const id = r.id as Exclude<RehearsalRoomId, 'studio'>;
  const vibe = VIBES[id];
  const group = new THREE.Group();
  group.name = `proberaum-${r.id}`;
  const deco = new THREE.Group();
  const live = new THREE.Group();
  const colliders: Collider[] = [];
  const I = inner(r);
  const m = midZ(r);
  const H = WING_CEILING;
  const d = doorOf(r);
  const W = I.maxX - I.minX;
  const D = I.maxZ - I.minZ;
  const tags: RoomBuilt['tags'] = {};
  /** Something to use: its plain parts merged (fewer draw calls), into the room. */
  const keep = (o: THREE.Object3D) => {
    const b = bake(o);
    live.add(b);
    return b;
  };
  const updates: ((t: number) => void)[] = [];
  let lava: RoomBuilt['lava'];

  // ---- The floor ----
  const floorTex = id === 'probe2' ? oakTexture() : fabricTexture(vibe.floor);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((I.minX + I.maxX) / 2, 0.005, m);
  floor.receiveShadow = true;
  group.add(floor);
  // The drum rug: under the kit by the west wall (every room's), and more rugs in the cosy one.
  const drumRug = rug(carpetTexture(r.id.charCodeAt(5)), 2.6, 3.4, 0.009);
  drumRug.position.x = I.minX + 1.9;
  drumRug.position.z = m;
  group.add(drumRug);
  if (id === 'probe2') {
    const big = rug(carpetTexture(7), 3.6, 4.6, 0.008);
    big.position.set(-18.4, 0.008, m);
    big.rotation.z = Math.PI / 2;
    group.add(big);
  }

  // ---- The walls inside ----
  const lining = (tex: () => THREE.Texture, per: number) => {
    const doorZ0 = d.z - d.width / 2;
    const doorZ1 = d.z + d.width / 2;
    const L = (len: number) => {
      const t = tex();
      return { t, len: (len / per) * 2 };
    };
    let x = L(W);
    deco.add(planeZ(I.minZ + 0.006, I.minX, I.maxX, 0, H, 1, x.t, x.len));
    x = L(W);
    deco.add(planeZ(I.maxZ - 0.006, I.minX, I.maxX, 0, H, -1, x.t, x.len));
    x = L(D);
    deco.add(planeX(I.minX + 0.006, I.minZ, I.maxZ, 0, H, 1, x.t, x.len));
    x = L(doorZ0 - I.minZ);
    deco.add(planeX(I.maxX - 0.006, I.minZ, doorZ0, 0, H, -1, x.t, x.len));
    x = L(I.maxZ - doorZ1);
    deco.add(planeX(I.maxX - 0.006, doorZ1, I.maxZ, 0, H, -1, x.t, x.len));
    x = L(d.width);
    deco.add(planeX(I.maxX - 0.006, doorZ0, doorZ1, DOOR_HEIGHT, H, -1, x.t, x.len));
  };
  if (id === 'probe1') lining(() => foamTexture('#7d8086', false), 1);
  if (id === 'probe2') {
    lining(() => wallTexture('#b9875a', 21), 2);
    // Carpets hung all round, overlapping a little.
    const hang = (x: number, z: number, w: number, h: number, ry: number, seed: number) => {
      const c = picture(carpetTexture(seed, 512, 768), w, h);
      c.position.set(x, 0.25 + h / 2, z);
      c.rotation.y = ry;
      deco.add(c);
    };
    hang(I.minX + 0.012, m - 1.5, 2.0, 2.7, Math.PI / 2, 3);
    hang(I.minX + 0.014, m + 1.4, 2.0, 2.7, Math.PI / 2, 8);
    for (let i = 0; i < 3; i++) hang(I.minX + 1.4 + i * 2.6, I.minZ + 0.012, 2.2, 2.6, 0, 11 + i);
    for (let i = 0; i < 3; i++) hang(I.minX + 1.4 + i * 2.6, I.maxZ - 0.012, 2.2, 2.6, Math.PI, 21 + i);
  }
  if (id === 'probe3') {
    lining(() => brickTexture(), 1);
    // Black pyramid foam in big panels over the brick.
    const panel = (x: number, z: number, w: number, ry: number) => {
      const t = foamTexture('#2a2a2c', true);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(w * 2, 2.2 * 2);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), new THREE.MeshToonMaterial({ map: t }));
      p.position.set(x, 1.55, z);
      p.rotation.y = ry;
      deco.add(p);
    };
    panel(I.minX + 0.012, m, 3.4, Math.PI / 2);
    panel(-19.6, I.minZ + 0.012, 3.0, 0);
    panel(-19.6, I.maxZ - 0.012, 3.0, Math.PI);
    // A red LED strip along the top of the walls.
    const strip = glow('#ff1a1a');
    for (const [x0, x1, z0, z1] of [
      [I.minX, I.maxX, I.minZ + 0.03, I.minZ + 0.05],
      [I.minX, I.maxX, I.maxZ - 0.05, I.maxZ - 0.03],
      [I.minX + 0.03, I.minX + 0.05, I.minZ, I.maxZ],
    ])
      live.add(placed(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, z1 - z0), strip), (x0 + x1) / 2, H - 0.12, (z0 + z1) / 2));
    const graffiti = picture(stickerTexture(666, 0.6), 3.2, 1.2);
    graffiti.position.set(-15.1, 2.4, I.maxZ - 0.016);
    graffiti.rotation.y = Math.PI;
    deco.add(graffiti);
  }

  // ---- Posters ----
  for (const [k, pi] of vibe.poster.entries()) {
    const p = picture(posterTexture(POSTERS[pi], pi + 3), 0.7, 0.99);
    p.position.set(k === 0 ? -17.6 : -16.0, 1.75, k === 0 ? I.minZ + 0.03 : I.maxZ - 0.03);
    p.rotation.y = k === 0 ? 0 : Math.PI;
    p.rotation.z = k === 0 ? 0.03 : -0.02;
    deco.add(p);
  }

  // ---- The mixer table with the little recorder ----
  const mx = solid(`${r.id}-mixer`);
  const table = new THREE.Group();
  const tw = mx.maxX - mx.minX;
  const td = mx.maxZ - mx.minZ;
  table.add(box(tw, 0.04, td, id === 'probe3' ? '#1a1a1a' : '#6b4f3a', 0, 0.79, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(box(0.04, 0.79, 0.04, '#2b2b2b', sx * (tw / 2 - 0.05), 0, sz * (td / 2 - 0.05)));
  table.add(box(tw - 0.1, 0.03, td - 0.1, '#2b2b2b', 0, 0.25, 0));
  // The desk mixer: sloped, rows of knobs, faders.
  const desk = new THREE.Group();
  desk.add(box(0.62, 0.06, 0.42, '#2a2d33'));
  const face = picture(mixerFace(), 0.6, 0.4);
  face.rotation.x = -Math.PI / 2 + 0.12;
  face.position.y = 0.065;
  desk.add(face);
  desk.position.set(-0.22, 0.83, 0.02);
  desk.rotation.x = 0.12;
  table.add(desk);
  // The recorder: a little box with a display and a big red button.
  const recorder = board(256, 96);
  const rec = new THREE.Group();
  rec.add(box(0.26, 0.09, 0.18, '#1c1f24'));
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.065), new THREE.MeshBasicMaterial({ map: recorder.texture }));
  disp.position.set(-0.03, 0.06, 0.091);
  rec.add(disp);
  rec.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 14), glow('#ff2a2a')), 0.09, 0.1, 0.03));
  rec.position.set(0.32, 0.83, 0.05);
  table.add(rec);
  table.add(box(0.16, 0.26, 0.14, '#1c1c1c', 0.36, 0.83, -0.18)); // a monitor speaker
  table.position.set((mx.minX + mx.maxX) / 2, 0, (mx.minZ + mx.maxZ) / 2);
  tags.mixer = keep(table);
  if (id === 'probe2') {
    const lamp = lavaLamp('#ff5a1f');
    lamp.group.position.set(mx.maxX - 0.12, 0.81, mx.maxZ - 0.1);
    live.add(lamp.group);
    updates.push(lamp.update);
    tags.lava = lamp.group;
    lava = lamp.recolor;
  }

  // ---- The beer fridge ----
  const fr = solid(`${r.id}-fridge`);
  const fg = fridge(fr.maxX - fr.minX, fr.top, fr.maxZ - fr.minZ, id === 'probe3' ? '#2b2b2b' : '#e9edf0');
  fg.position.set((fr.minX + fr.maxX) / 2, 0, (fr.minZ + fr.maxZ) / 2);
  tags.fridge = keep(fg);

  // ---- The sofa, the PA, the extras ----
  const sf = solid(`${r.id}-sofa`);
  const so = sofa(sf.maxX - sf.minX, vibe.sofa, vibe.throw);
  so.position.set((sf.minX + sf.maxX) / 2, 0, (sf.minZ + sf.maxZ) / 2);
  so.rotation.y = Math.PI;
  deco.add(so);
  for (const which of ['pa-n', 'pa-s'] as const) {
    const s = solid(`${r.id}-${which}`);
    const pa = paTop(s.top);
    pa.position.set((s.minX + s.maxX) / 2, 0, (s.minZ + s.maxZ) / 2);
    pa.rotation.y = Math.atan2(-18 - pa.position.x, m - pa.position.z);
    deco.add(pa);
  }
  const extra = (s: Solid, o: THREE.Object3D) => {
    o.position.set((s.minX + s.maxX) / 2, 0, (s.minZ + s.maxZ) / 2);
    deco.add(o);
  };
  if (id === 'probe2') {
    const fl = floorLamp();
    extra(solid('probe2-lamp'), fl);
    extra(solid('probe2-plant'), plant());
    const fairy = fairyLights(
      [
        [I.minX + 0.1, I.minZ + 0.1],
        [I.maxX - 0.1, I.minZ + 0.1],
        [I.maxX - 0.1, I.maxZ - 0.1],
        [I.minX + 0.1, I.maxZ - 0.1],
        [I.minX + 0.1, I.minZ + 0.1],
      ].map(([x, z]) => new THREE.Vector3(x, H - 0.15, z)),
      ['#ffd27a', '#ff8fab', '#8fd3ff', '#b4f8a8'],
    );
    live.add(fairy.group);
    updates.push(fairy.update);
  }
  if (id === 'probe3') {
    extra(solid('probe3-crates'), crates(3));
    const c = solid('probe3-case');
    extra(c, flightCase(c.maxX - c.minX, c.top, c.maxZ - c.minZ));
  }
  if (id === 'probe1') {
    // Cable hooks on the north wall, coiled cables on them, a crate of empties under them.
    for (let i = 0; i < 4; i++) {
      deco.add(box(0.04, 0.04, 0.12, '#9aa0a6', -23.1 + i * 0.32, 1.9, I.minZ + 0.06));
      const coil = mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 18), toon(['#1d1d1d', '#c1121f', '#1d3557', '#e9c46a'][i]), -23.1 + i * 0.32, 1.75, I.minZ + 0.1);
      deco.add(coil);
    }
    extra(solid('probe1-crate'), crates(2));
    // The house rules, and a clock over the whiteboard.
    const rules = picture(canvasTex(384, 512, (g, w, h) => {
      g.fillStyle = '#fffdf4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c1121f';
      g.font = `900 40px ${BOLD}`;
      g.textAlign = 'center';
      g.fillText('PROBERAUM-REGELN', w / 2, 60);
      g.fillStyle = '#1d1d1d';
      g.textAlign = 'left';
      g.font = `600 26px ${SANS}`;
      ['1. Gehörschutz!', '2. Nicht am Pult drehen,', '    wenn’s nicht deins ist', '3. Leergut zurück', '4. Kabel aufrollen', '    (over-under!)', '5. Tür zu – Nachbarn', '    proben auch'].forEach((l, i) => g.fillText(l, 26, 120 + i * 44));
    }), 0.6, 0.8);
    rules.position.set(-22.4, 1.6, I.maxZ - 0.025);
    rules.rotation.y = Math.PI;
    deco.add(rules);
  }
  if (id === 'probe3') {
    // A black ceiling in the cellar.
    const black = mesh(new THREE.PlaneGeometry(W, D), toon('#141414'), (I.minX + I.maxX) / 2, H - 0.004, m, false);
    black.rotation.x = Math.PI / 2;
    deco.add(black);
  }
  // A clock over the whiteboard, stopped at a quarter past eleven (the last proper rehearsal).
  const clockFace = picture(canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#1d1d1d';
    g.beginPath();
    g.arc(w / 2, w / 2, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f7f2';
    g.beginPath();
    g.arc(w / 2, w / 2, 56, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1d1d1d';
    g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w / 2 + Math.sin(a) * 46, w / 2 - Math.cos(a) * 46);
      g.lineTo(w / 2 + Math.sin(a) * 52, w / 2 - Math.cos(a) * 52);
      g.stroke();
    }
    const hand = (a: number, len: number, lw: number) => {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(w / 2, w / 2);
      g.lineTo(w / 2 + Math.sin(a) * len, w / 2 - Math.cos(a) * len);
      g.stroke();
    };
    hand(((11.25 / 12) * Math.PI * 2), 30, 6);
    hand(Math.PI / 2, 44, 4);
  }), 0.3, 0.3);
  clockFace.rotation.y = -Math.PI / 2;
  clockFace.position.set(I.maxX - 0.012, 2.6, m + 1.7);
  deco.add(clockFace);

  // ---- The setlist whiteboard on the east wall, south of the door ----
  const setlist = board(512, 384);
  const wb = new THREE.Group();
  wb.add(box(0.03, 1.06, 1.42, '#b9bec4', 0, -0.53, 0));
  const face2 = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.0), new THREE.MeshToonMaterial({ map: setlist.texture }));
  face2.rotation.y = -Math.PI / 2;
  face2.position.x = -0.017;
  wb.add(face2);
  wb.add(box(0.06, 0.03, 0.6, '#9aa0a6', -0.04, -0.56, 0));
  for (let i = 0; i < 3; i++) wb.add(box(0.015, 0.015, 0.11, ['#c1121f', '#1d3557', '#111'][i], -0.05, -0.52, -0.2 + i * 0.14));
  wb.position.set(I.maxX - 0.02, 1.58, m + 1.7);
  tags.setlist = keep(wb);

  // ---- The ceiling lamp and the room's light ----
  deco.add(box(1.4, 0.05, 0.25, '#2b2b2b', -18.4, H - 0.05, m));
  live.add(placed(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.18), glow(vibe.light)), -18.4, H - 0.06, m));
  const light = new THREE.PointLight(vibe.light, vibe.power, 12, 1.3);
  light.position.set(-18.4, H - 0.5, m);
  group.add(light);

  for (const s of [mx, fr, sf, solid(`${r.id}-pa-n`), solid(`${r.id}-pa-s`)]) colliders.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, top: s.top });
  if (id === 'probe2') for (const k of ['probe2-lamp', 'probe2-plant']) colliders.push({ ...solid(k) });
  if (id === 'probe3') for (const k of ['probe3-crates', 'probe3-case']) colliders.push({ ...solid(k) });
  if (id === 'probe1') colliders.push({ ...solid('probe1-crate') });

  group.add(bake(deco), live);
  return { id: r.id, group, colliders, tags, setlist, recorder, lava, update: (t) => updates.forEach((u) => u(t)) };
}

/** A desk mixer's face: channel strips of knobs, faders at the bottom, a few LEDs. */
export function mixerFace(channels = 12): THREE.CanvasTexture {
  return canvasTex(384, 256, (g, w, h) => {
    g.fillStyle = '#2a2d33';
    g.fillRect(0, 0, w, h);
    const cw = (w - 40) / channels;
    for (let c = 0; c < channels; c++) {
      const x = 20 + c * cw + cw / 2;
      for (let k = 0; k < 5; k++) {
        g.fillStyle = ['#d0d4d8', '#e63946', '#2a9d8f', '#2a9d8f', '#ffd166'][k];
        g.beginPath();
        g.arc(x, 22 + k * 28, cw * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#111';
      g.fillRect(x - 2, 168, 4, 70);
      g.fillStyle = '#e8e8e8';
      g.fillRect(x - 7, 180 + ((c * 37) % 40), 14, 10);
      g.fillStyle = c % 3 ? '#39ff14' : '#ffcc00';
      g.fillRect(x - 3, 152, 6, 6);
    }
  });
}

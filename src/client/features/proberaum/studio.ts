import * as THREE from 'three';
import { STUDIO_GLASS, WING_CEILING, doorOf, inner, roomById, solid } from '../../../shared/proberaum-layout';
import type { WingThing } from '../../../shared/proberaum-layout';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { board, type Board } from './boards';
import { canvasTex, carpetTexture, fabricTexture, oakTexture } from './paint';
import { signTexture } from './posters';
import { bake, box, comboAmp, cyl, fridge, glow, picture, placed, rug, sofa } from './props';
import { mixerFace } from './rooms';
import { planeX, planeZ } from './shell';

/*
 * The studio (flrnoh fork, see FORK.md "The rehearsal wing"): the live room west of the glass (an oak
 * floor, absorbers in three colours, a wooden skyline diffuser behind the drums, clouds under the
 * ceiling, headphones on hooks) and the control room east of it: the big desk against the glass facing
 * the live room with its meter bridge, the screen with the session on it and the monitors, a rack of
 * outboard, a leather couch and a mini fridge with an espresso machine, the AUFNAHME light over the
 * glass. The desk's recorder is the room's (E at the desk). The instruments are the instruments part's.
 */

export interface StudioBuilt {
  group: THREE.Group;
  colliders: Collider[];
  tags: Partial<Record<WingThing, THREE.Object3D>>;
  /** The session screen over the desk (index.ts draws the take on it), and the recorder's display. */
  screen: Board;
  recorder: Board;
  /** The AUFNAHME light over the glass, on while recording. */
  onAir(on: boolean): void;
  update(t: number): void;
}

export function buildStudio(): StudioBuilt {
  const r = roomById('studio');
  const I = inner(r);
  const H = WING_CEILING;
  const G = STUDIO_GLASS;
  const group = new THREE.Group();
  group.name = 'proberaum-studio';
  const deco = new THREE.Group();
  const live = new THREE.Group();
  const colliders: Collider[] = [];
  const tags: StudioBuilt['tags'] = {};
  /** Something to use: its plain parts merged (fewer draw calls), into the studio. */
  const keep = (o: THREE.Object3D) => {
    const b = bake(o);
    live.add(b);
    return b;
  };
  const liveW = G.x - 0.1 - I.minX;
  const ctrlW = I.maxX - (G.x + 0.1);
  const D = I.maxZ - I.minZ;
  const mz = (I.minZ + I.maxZ) / 2;

  // ---- Floors: oak in the live room, a dark carpet in the control room ----
  const oak = oakTexture();
  oak.wrapS = oak.wrapT = THREE.RepeatWrapping;
  oak.repeat.set(liveW / 2, D / 2);
  const liveFloor = new THREE.Mesh(new THREE.PlaneGeometry(liveW, D), new THREE.MeshToonMaterial({ map: oak }));
  liveFloor.rotation.x = -Math.PI / 2;
  liveFloor.position.set(I.minX + liveW / 2, 0.005, mz);
  group.add(liveFloor);
  const carpet = fabricTexture('#2b2f3a');
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(ctrlW / 2, D / 2);
  const ctrlFloor = new THREE.Mesh(new THREE.PlaneGeometry(ctrlW, D), new THREE.MeshToonMaterial({ map: carpet }));
  ctrlFloor.rotation.x = -Math.PI / 2;
  ctrlFloor.position.set(G.x + 0.1 + ctrlW / 2, 0.005, mz);
  group.add(ctrlFloor);
  const drumRug = rug(carpetTexture(2), 2.6, 3.2, 0.009);
  drumRug.position.set(I.minX + 1.9, 0.009, mz);
  group.add(drumRug);

  // A dark ceiling over both rooms.
  const ceiling = mesh(new THREE.PlaneGeometry(I.maxX - I.minX, D), toon('#2e3036'), (I.minX + I.maxX) / 2, H - 0.004, mz, false);
  ceiling.rotation.x = Math.PI / 2;
  deco.add(ceiling);

  // ---- The walls inside: warm grey paint, then the treatment ----
  const paint = () => canvasTex(64, 64, (g) => ((g.fillStyle = '#9c968c'), g.fillRect(0, 0, 64, 64)));
  const d = doorOf(r);
  deco.add(planeZ(I.minZ + 0.006, I.minX, I.maxX, 0, H, 1, paint(), I.maxX - I.minX));
  deco.add(planeZ(I.maxZ - 0.006, I.minX, I.maxX, 0, H, -1, paint(), I.maxX - I.minX));
  deco.add(planeX(I.minX + 0.006, I.minZ, I.maxZ, 0, H, 1, paint(), D));
  deco.add(planeX(I.maxX - 0.006, I.minZ, d.z - d.width / 2, 0, H, -1, paint(), 1));
  deco.add(planeX(I.maxX - 0.006, d.z + d.width / 2, I.maxZ, 0, H, -1, paint(), 1));
  const COLORS = ['#3a3f4b', '#1f5f6b', '#6b2a3a'];
  let n = 0;
  /** An absorber: a fabric panel in a thin wooden frame, on a wall (ry the way it faces). */
  const absorber = (x: number, y: number, z: number, ry: number, w = 0.6, h = 1.2) => {
    const a = new THREE.Group();
    a.add(box(w + 0.04, h + 0.04, 0.1, '#8a6a46', 0, -(h + 0.04) / 2, 0));
    const f = picture(fabricTexture(COLORS[n++ % COLORS.length]), w, h);
    f.position.z = 0.052;
    a.add(f);
    a.position.set(x, y, z);
    a.rotation.y = ry;
    deco.add(a);
  };
  for (let i = 0; i < 4; i++) absorber(I.minX + 0.9 + i * 1.35, 1.6, I.minZ + 0.06, 0);
  for (let i = 0; i < 4; i++) absorber(I.minX + 0.9 + i * 1.35, 1.6, I.maxZ - 0.06, Math.PI);
  for (const z of [mz - 2.0, mz + 2.0]) absorber(I.minX + 0.06, 1.6, z, Math.PI / 2);
  // The skyline diffuser behind the drums: a grid of wooden blocks at different depths.
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon('#b08a5a'), 12 * 8);
  const m4 = new THREE.Matrix4();
  let b = 0;
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 8; j++) {
      const depth = 0.04 + (((i * 7 + j * 13) % 9) / 9) * 0.16;
      m4.compose(new THREE.Vector3(I.minX + depth / 2 + 0.01, 1.2 + j * 0.1 + 0.05, mz - 0.6 + i * 0.1 + 0.05), new THREE.Quaternion(), new THREE.Vector3(depth, 0.095, 0.095));
      blocks.setMatrixAt(b++, m4);
    }
  live.add(blocks);
  // Clouds under the ceiling.
  for (const [x, z] of [
    [-21.2, mz - 1.2],
    [-19.0, mz + 1.2],
  ]) {
    const c = box(1.2, 0.08, 1.6, '#e8e4dc', x, H - 0.45, z);
    deco.add(c);
    for (const sx of [-1, 1]) deco.add(box(0.01, 0.4, 0.01, '#666', x + sx * 0.5, H - 0.4, z));
  }
  // Headphones on hooks by the glass, a spare amp, a mic case.
  for (let i = 0; i < 4; i++) {
    const hp = new THREE.Group();
    hp.add(mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), toon('#1d1d1d')));
    for (const s of [-1, 1]) hp.add(cyl(0.045, 0.045, 0.04, i % 2 ? '#c1121f' : '#2b2b2b', s * 0.09, -0.04, 0).rotateZ(Math.PI / 2));
    hp.position.set(G.x - 0.6 - i * 0.32, 1.7, I.maxZ - 0.08);
    deco.add(hp);
  }
  const as = solid('studio-amp');
  const amp = comboAmp(as.maxX - as.minX - 0.04, as.top, 0.3, '#3a2a1f', '#d8c7a5');
  amp.position.set((as.minX + as.maxX) / 2, 0, (as.minZ + as.maxZ) / 2);
  amp.rotation.y = Math.PI;
  deco.add(amp);
  colliders.push({ ...as });

  // ---- The control room: the desk against the glass ----
  const ds = solid('studio-desk');
  const desk = new THREE.Group();
  const dw = ds.maxZ - ds.minZ;
  const dd = ds.maxX - ds.minX;
  desk.add(box(dw, 0.72, dd, '#3b2b20'));
  const surface = picture(mixerFace(32), dw - 0.1, dd - 0.15);
  surface.rotation.x = -Math.PI / 2 + 0.18;
  surface.position.set(0, 0.8, 0.02);
  desk.add(box(dw - 0.04, 0.1, dd - 0.1, '#23262c', 0, 0.72, 0));
  desk.add(surface);
  desk.add(box(dw, 0.05, 0.12, '#5a3b26', 0, 0.82, dd / 2 - 0.02)); // the armrest
  // The meter bridge with its VU meters, and the session screen over it.
  const meters = picture(canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#16181c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = '#f2e3b6';
      g.fillRect(8 + i * 31, 8, 26, h - 16);
      g.strokeStyle = '#c1121f';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(21 + i * 31, h - 10);
      g.lineTo(14 + i * 31 + ((i * 5) % 14), 14);
      g.stroke();
    }
  }), dw - 0.2, 0.12, true);
  desk.add(box(dw - 0.1, 0.16, 0.12, '#23262c', 0, 0.86, -dd / 2 + 0.1));
  meters.position.set(0, 0.95, -dd / 2 + 0.165);
  desk.add(meters);
  const screen = board(640, 360);
  const scr = new THREE.Group();
  scr.add(box(0.98, 0.58, 0.04, '#111'));
  const scrFace = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.52), new THREE.MeshBasicMaterial({ map: screen.texture }));
  scrFace.position.set(0, 0.29, 0.021);
  scr.add(scrFace);
  scr.add(box(0.06, 0.18, 0.06, '#222', 0, -0.18, -0.02));
  scr.position.set(0, 1.1, -dd / 2 + 0.12);
  desk.add(scr);
  // The near-fields on the desk's ends, angled in.
  for (const s of [-1, 1]) {
    const mon = new THREE.Group();
    mon.add(box(0.22, 0.34, 0.26, '#e8e8e8'));
    mon.add(mesh(new THREE.CircleGeometry(0.08, 18), toon('#1d1d1d'), 0, 0.12, 0.131));
    mon.add(mesh(new THREE.CircleGeometry(0.03, 12), toon('#333'), 0, 0.27, 0.131));
    mon.position.set(s * (dw / 2 - 0.25), 0.92, -dd / 2 + 0.2);
    mon.rotation.y = -s * 0.35;
    desk.add(mon);
  }
  // The recorder: the tape machine's display and transport on the desk's right end.
  const recorder = board(256, 96);
  const rec = new THREE.Group();
  rec.add(box(0.36, 0.08, 0.2, '#1c1f24'));
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshBasicMaterial({ map: recorder.texture }));
  disp.rotation.x = -Math.PI / 2 + 0.5;
  disp.position.set(-0.06, 0.09, 0);
  rec.add(disp);
  rec.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14), glow('#ff2a2a')), 0.12, 0.09, 0.02));
  rec.position.set(-dw / 2 + 0.3, 0.82, 0.18);
  desk.add(rec);
  desk.position.set((ds.minX + ds.maxX) / 2, 0, (ds.minZ + ds.maxZ) / 2);
  desk.rotation.y = Math.PI / 2;
  tags.mixer = keep(desk);
  // The engineer's chair, pushed back a little.
  const chair = new THREE.Group();
  chair.add(cyl(0.25, 0.25, 0.04, '#1d1d1d', 0, 0.06));
  chair.add(cyl(0.025, 0.025, 0.4, '#555', 0, 0.06));
  chair.add(box(0.48, 0.08, 0.46, '#1d1d1d', 0, 0.46));
  chair.add(box(0.46, 0.55, 0.07, '#1d1d1d', 0, 0.55, 0.22));
  chair.position.set(ds.maxX + 0.55, 0, 13.25);
  chair.rotation.y = -Math.PI / 2 - 0.4;
  deco.add(chair);

  // The rack of outboard, the couch, the mini fridge with the espresso machine.
  const rk = solid('studio-rack');
  const rack = new THREE.Group();
  rack.add(box(rk.maxX - rk.minX, rk.top, rk.maxZ - rk.minZ, '#16181c'));
  const units = picture(canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ['#c9ccd1', '#2b2d42', '#7a7f87', '#b08a5a'][i % 4];
      g.fillRect(6, 8 + i * 27, w - 12, 22);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = k === 4 ? (i % 2 ? '#39ff14' : '#ff3b3b') : '#1d1d1d';
        g.beginPath();
        g.arc(20 + k * 22, 19 + i * 27, k === 4 ? 3 : 6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }), rk.maxX - rk.minX - 0.06, rk.top - 0.1, true);
  units.position.set(0, rk.top / 2, (rk.maxZ - rk.minZ) / 2 + 0.002);
  rack.add(units);
  rack.position.set((rk.minX + rk.maxX) / 2, 0, (rk.minZ + rk.maxZ) / 2);
  deco.add(rack);
  const cs = solid('studio-couch');
  const couch = sofa(cs.maxX - cs.minX, '#5a3420', '#c9a227');
  couch.position.set((cs.minX + cs.maxX) / 2, 0, (cs.minZ + cs.maxZ) / 2);
  couch.rotation.y = Math.PI;
  deco.add(couch);
  const fs = solid('studio-fridge');
  const fr = fridge(fs.maxX - fs.minX, fs.top, fs.maxZ - fs.minZ, '#c8102e');
  fr.position.set((fs.minX + fs.maxX) / 2, 0, (fs.minZ + fs.maxZ) / 2);
  fr.rotation.y = -Math.PI / 2;
  const espresso = new THREE.Group();
  espresso.add(box(0.26, 0.3, 0.3, '#c9ccd1'));
  espresso.add(box(0.06, 0.05, 0.06, '#1d1d1d', 0, 0.12, 0.17));
  espresso.position.set((fs.minX + fs.maxX) / 2, fs.top, fs.minZ + 0.2);
  tags.fridge = keep(fr);
  deco.add(espresso);
  for (const s of [ds, rk, cs, fs]) colliders.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ, top: s.top });
  // Bass traps in the control room's corners, a gold record on the wall.
  for (const z of [I.minZ + 0.25, I.maxZ - 0.25]) deco.add(box(0.5, 2.6, 0.5, '#3a3f4b', I.maxX - 0.25, 0.2, z).rotateY(Math.PI / 4));
  const gold = new THREE.Group();
  gold.add(box(0.5, 0.62, 0.03, '#1d1d1d'));
  gold.add(placed(new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), toon('#d4af37')), 0, 0.36, 0.017));
  gold.position.set(I.maxX - 0.02, 1.4, 14.6);
  gold.rotation.y = -Math.PI / 2;
  deco.add(gold);

  // ---- AUFNAHME over the glass, both ways, and the soffit speakers ----
  const onTex = signTexture('● AUFNAHME', '#ffffff', '#c1121f', 512, 128);
  const offTex = signTexture('● AUFNAHME', '#5a2a2a', '#241012', 512, 128);
  const lampMats: THREE.MeshBasicMaterial[] = [];
  for (const s of [-1, 1]) {
    const mat = new THREE.MeshBasicMaterial({ map: offTex });
    lampMats.push(mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), mat);
    sign.position.set(G.x + s * 0.105, 2.75, mz + 0.6);
    sign.rotation.y = (s * Math.PI) / 2;
    live.add(sign);
  }
  for (const z of [11.6, 14.0]) {
    const sp = new THREE.Group();
    sp.add(box(0.05, 0.5, 0.36, '#1d1d1d'));
    sp.add(mesh(new THREE.CircleGeometry(0.12, 18), toon('#333'), 0.03, 0.25, 0).rotateY(Math.PI / 2));
    sp.position.set(G.x + 0.13, 2.45, z);
    deco.add(sp);
  }

  // The light: warm over the live room, a desk lamp's worth in the control room.
  const light = new THREE.PointLight('#ffe2b8', 2.2, 12, 1.3);
  light.position.set(-19.5, H - 0.5, mz);
  group.add(light);
  live.add(placed(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.18), glow('#ffe2b8')), -19.5, H - 0.06, mz));
  live.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.16), glow('#cfe3ff')), -14.9, H - 0.06, mz));
  const studioSign = picture(signTexture('STUDIO', '#f1faee', '#1d3557', 512, 128), 0.9, 0.22);
  studioSign.position.set(I.maxX - 0.015, 2.7, mz);
  studioSign.rotation.y = -Math.PI / 2;
  deco.add(studioSign);

  group.add(bake(deco), live);
  let lit = false;
  return {
    group,
    colliders,
    tags,
    screen,
    recorder,
    onAir(on) {
      if (on === lit) return;
      lit = on;
      for (const m of lampMats) {
        m.map = on ? onTex : offTex;
        m.needsUpdate = true;
      }
    },
    update() {},
  };
}

import * as THREE from 'three';
import { LOBBY, solid, type Solid, type WingThing } from '../../../shared/proberaum-layout';
import { mesh, toon } from '../../world/toon';
import type { Collider } from '../../world/types';
import { board, type Board } from './boards';
import { carpetTexture } from './paint';
import { POSTERS, flyerTexture, lockerTexture, posterTexture, signTexture, stringsTexture, vendingTexture } from './posters';
import { bake, bottle, box, brokenGuitar, comboAmp, cyl, flightCase, glow, picture, plant, placed, rug, sofa } from './props';

/*
 * The rehearsal wing's lobby (flrnoh fork, see FORK.md "The rehearsal wing"): the classic
 * Proberaumkomplex. The Belegungsplan by the way to the rooms, the Schwarzes Brett with its flyers
 * and the polaroid wall of every band that booked a room, the band name generator's chalkboard by
 * the door, a row of lockers, a drinks machine and a string machine, the backline counter with amps
 * and cables on the shelves behind and the tip jar on it, a worn sofa corner round a coffee table
 * with a smashed guitar over it.
 */

export interface LobbyBuilt {
  group: THREE.Group;
  colliders: Collider[];
  tags: Partial<Record<WingThing, THREE.Object3D>>;
  boards: { booking: Board; notes: Board; polaroids: Board; bandname: Board; tips: Board };
}

const at = (s: Solid) => new THREE.Vector3((s.minX + s.maxX) / 2, 0, (s.minZ + s.maxZ) / 2);

/** A board on a wall: its frame and its face (`face` the canvas), `w` × `h`, its middle at (x, y, z), facing `ry`. */
function wallBoard(face: Board, w: number, h: number, frame: string, x: number, y: number, z: number, ry: number, lit = false): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w + 0.08, h + 0.08, 0.04, frame, 0, -(h + 0.08) / 2, 0));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map: face.texture }) : new THREE.MeshToonMaterial({ map: face.texture }));
  m.position.z = 0.022;
  g.add(m);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

export function buildLobby(): LobbyBuilt {
  const group = new THREE.Group();
  group.name = 'proberaum-lobby';
  const deco = new THREE.Group();
  const live = new THREE.Group();
  const tags: LobbyBuilt['tags'] = {};
  /** Something to use: its plain parts merged (fewer draw calls), into the lobby. */
  const keep = (o: THREE.Object3D) => {
    const b = bake(o);
    live.add(b);
    return b;
  };
  const colliders: Collider[] = [];

  // ---- The boards ----
  const booking = board(1024, 640);
  const bk = wallBoard(booking, 2.3, 1.44, '#9aa0a6', -16.2, 1.58, LOBBY.maxZ - 0.03, Math.PI);
  tags.board = keep(bk);
  const notes = board(1024, 640);
  const nb = wallBoard(notes, 2.0, 1.25, '#6b4423', LOBBY.minX + 0.03, 1.55, -13.6, Math.PI / 2);
  tags.notes = keep(nb);
  // Flyers pinned round the board's edges.
  for (let i = 0; i < 5; i++) {
    const f = picture(flyerTexture(i), 0.21, 0.3);
    f.rotation.y = Math.PI / 2;
    f.rotation.x = (i % 2 ? 1 : -1) * 0.05;
    f.position.set(LOBBY.minX + 0.04, i < 3 ? 2.35 : 0.65, -14.45 + i * 0.42 - (i < 3 ? 0 : 1.1));
    deco.add(f);
  }
  const polaroids = board(640, 560);
  const pw = wallBoard(polaroids, 2.0, 1.75, '#1d1d1d', LOBBY.minX + 0.03, 1.95, -11.2, Math.PI / 2);
  tags.polaroids = keep(pw);
  const bandname = board(640, 384);
  const bn = wallBoard(bandname, 1.5, 0.9, '#6b4423', LOBBY.maxX - 0.03, 1.75, -14.6, -Math.PI / 2);
  tags.bandname = keep(bn);

  // ---- The lockers ----
  const lk = solid('lockers');
  const lockers = new THREE.Group();
  lockers.add(box(lk.maxX - lk.minX, lk.top, lk.maxZ - lk.minZ, '#56746a'));
  const lf = picture(lockerTexture(), lk.maxX - lk.minX - 0.02, lk.top - 0.08);
  lf.position.set(0, lk.top / 2, (lk.maxZ - lk.minZ) / 2 + 0.003);
  lockers.add(lf);
  lockers.add(flightCase(0.7, 0.32, 0.45).translateY(lk.top).translateX(-0.5));
  lockers.add(box(0.5, 0.16, 0.36, '#1d1d1d', 0.5, lk.top, 0)); // a pedalboard case
  lockers.position.copy(at(lk));
  tags.lockers = keep(lockers);

  // ---- The drinks machine and the string machine ----
  const vd = solid('vending');
  const vending = new THREE.Group();
  vending.add(box(vd.maxX - vd.minX, vd.top, vd.maxZ - vd.minZ, '#a50f1a'));
  const vf = picture(vendingTexture(), vd.maxX - vd.minX - 0.06, vd.top - 0.1, true);
  vf.position.set(0, vd.top / 2 + 0.02, (vd.maxZ - vd.minZ) / 2 + 0.003);
  vending.add(vf);
  vending.position.copy(at(vd));
  tags.vending = keep(vending);
  const st = solid('strings');
  const strings = new THREE.Group();
  strings.add(box(st.maxX - st.minX, 0.9, st.maxZ - st.minZ, '#1f3b57', 0, st.top - 0.9, 0));
  strings.add(box(0.06, st.top - 0.9, 0.06, '#30343a', 0, 0, 0));
  strings.add(box(0.4, 0.04, 0.3, '#30343a', 0, 0, 0));
  const sf = picture(stringsTexture(), st.maxX - st.minX - 0.06, 0.84, true);
  sf.position.set(0, st.top - 0.45, (st.maxZ - st.minZ) / 2 + 0.003);
  strings.add(sf);
  strings.position.copy(at(st));
  tags.strings = keep(strings);

  // ---- The backline counter: shelves of amps and cables behind it, the tip jar on it ----
  const ct = solid('counter');
  const cw = ct.maxX - ct.minX;
  const counter = new THREE.Group();
  const front = ct.maxZ - 0.6;
  counter.add(box(cw, ct.top, 0.6, '#3b2b20', 0, 0, front + 0.3 - at(ct).z));
  counter.add(box(cw + 0.06, 0.05, 0.68, '#7a5a3a', 0, ct.top - 0.05, front + 0.3 - at(ct).z));
  const sticker = picture(signTexture('BACKLINE · VERLEIH', '#ffd166', '#1d1d1d', 1024, 128), cw - 0.3, 0.2);
  sticker.position.set(0, 0.7, ct.maxZ - at(ct).z + 0.005);
  counter.add(sticker);
  // The shelf against the wall: amps, a snare, cables.
  const back = LOBBY.minZ + 0.25 - at(ct).z;
  counter.add(box(cw, 0.04, 0.45, '#5a4a3a', 0, 0.9, back));
  counter.add(box(cw, 0.04, 0.45, '#5a4a3a', 0, 1.7, back));
  for (const x of [-cw / 2 + 0.02, cw / 2 - 0.02]) counter.add(box(0.04, 2.2, 0.45, '#5a4a3a', x, 0, back));
  for (let i = 0; i < 4; i++) {
    const a = comboAmp(0.5, 0.45, 0.26, ['#1d1d1d', '#e6dcc5', '#1d1d1d', '#3a2a1f'][i], ['#bfa98a', '#3b3b3b', '#9a8a6a', '#d8c7a5'][i]);
    a.position.set(-cw / 2 + 0.45 + i * 0.8, 0.92, back);
    counter.add(a);
  }
  for (let i = 0; i < 5; i++) counter.add(mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 18), toon(['#1d1d1d', '#c1121f', '#1d3557', '#e9c46a', '#2a9d8f'][i]), -cw / 2 + 0.4 + i * 0.6, 1.88, back));
  const snare = cyl(0.18, 0.18, 0.14, '#c9ccd1', cw / 2 - 0.4, 1.74, back);
  counter.add(snare);
  counter.position.copy(at(ct));
  tags.rental = keep(counter);
  // The tip jar on the counter, its label, coins in it.
  const tips = board(256, 128);
  const jar = new THREE.Group();
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.22, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })).translateY(0.11));
  jar.add(cyl(0.075, 0.075, 0.05, '#c9a227', 0, 0.005));
  for (let i = 0; i < 3; i++) jar.add(cyl(0.022, 0.022, 0.006, '#d4af37', Math.sin(i * 2) * 0.03, 0.06 + i * 0.008, Math.cos(i * 2) * 0.03, 10));
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), new THREE.MeshToonMaterial({ map: tips.texture }));
  label.position.set(0, 0.11, 0.092);
  jar.add(label);
  jar.position.set(-15.35, ct.top, ct.maxZ - 0.3);
  tags.tip = keep(jar);
  colliders.push({ ...ct, minZ: LOBBY.minZ });

  // ---- The Kicker: a table football that's seen better days ----
  const kk = solid('kicker');
  const kicker = new THREE.Group();
  const kw = kk.maxX - kk.minX;
  const kd = kk.maxZ - kk.minZ;
  kicker.add(box(kw, 0.22, kd, '#3b2b20', 0, 0.68));
  kicker.add(box(kw - 0.08, 0.01, kd - 0.08, '#2f8a3a', 0, 0.8));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kicker.add(box(0.07, 0.68, 0.07, '#2b1d14', sx * (kw / 2 - 0.08), 0, sz * (kd / 2 - 0.08)));
  for (const sx of [-1, 1]) kicker.add(box(0.03, 0.08, 0.2, '#ffffff', sx * (kw / 2 - 0.03), 0.8, 0));
  for (let i = 0; i < 8; i++) {
    const x = -kw / 2 + 0.14 + i * ((kw - 0.28) / 7);
    const rod = cyl(0.008, 0.008, kd + 0.36, '#c9ccd1', x, 0.87, 0, 8);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(x, 0.87, 0);
    kicker.add(rod);
    const red = [0, 1, 3, 5].includes(i);
    kicker.add(box(0.05, 0.06, 0.08, '#1d1d1d', x, 0.86, (red ? -1 : 1) * (kd / 2 + 0.16)));
    const n = [1, 2, 5, 3, 3, 5, 2, 1][i];
    for (let k = 0; k < n; k++) kicker.add(box(0.035, 0.1, 0.03, red ? '#c1121f' : '#1d4ed8', x, 0.8, -kd / 2 + 0.08 + ((k + 0.5) * (kd - 0.16)) / n));
  }
  kicker.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), toon('#ffffff'), 0.1, 0.82, 0.05));
  kicker.position.copy(at(kk));
  tags.kicker = keep(kicker);

  // ---- The sofa corner ----
  const sfa = solid('sofa');
  const couch = sofa(sfa.maxX - sfa.minX, '#4a5d3a', '#c1121f');
  couch.position.copy(at(sfa));
  couch.rotation.y = Math.PI;
  deco.add(couch);
  const tb = solid('table');
  const table = new THREE.Group();
  table.add(box(tb.maxX - tb.minX, 0.04, tb.maxZ - tb.minZ, '#6b4f3a', 0, tb.top - 0.04));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(box(0.04, tb.top - 0.04, 0.04, '#3b2b20', sx * 0.55, 0, sz * 0.25));
  table.add(bottle('#6b3d12', -0.3, tb.top, 0.05), bottle('#3f7f3a', 0.25, tb.top, -0.08));
  table.add(box(0.3, 0.02, 0.22, '#e9e4d8', 0.02, tb.top, 0.08)); // a setlist from last week
  table.add(cyl(0.06, 0.05, 0.03, '#9aa0a6', 0.4, tb.top, 0.1)); // an ashtray full of plectrums
  table.position.copy(at(tb));
  deco.add(table);
  const r = rug(carpetTexture(4), 2.8, 2.0, 0.008);
  r.position.set(-21.6, 0.008, LOBBY.maxZ - 1.45);
  deco.add(r);
  const am = solid('amp');
  const amp = comboAmp(am.maxX - am.minX, am.top, am.maxZ - am.minZ);
  amp.position.copy(at(am));
  amp.rotation.y = Math.PI;
  deco.add(amp);
  deco.add(bottle('#6b3d12', at(am).x, am.top, at(am).z));
  const guitar = brokenGuitar();
  guitar.scale.setScalar(1.6);
  guitar.position.set(-21.8, 1.65, LOBBY.maxZ - 0.06);
  guitar.rotation.set(0, Math.PI, 0.25);
  deco.add(guitar);
  const caption = picture(signTexture('Gig 2019 – R.I.P.', '#1d1d1d', '#f2e3b6', 512, 96), 0.55, 0.1);
  caption.position.set(-21.8, 1.08, LOBBY.maxZ - 0.012);
  caption.rotation.y = Math.PI;
  deco.add(caption);
  const pl = plant();
  pl.position.set(LOBBY.minX + 0.35, 0, LOBBY.maxZ - 0.4);
  deco.add(pl);
  // Posters over the lockers and by the door.
  const p1 = picture(posterTexture(POSTERS[2], 9), 0.62, 0.88);
  p1.position.set(-14.1, 2.45, LOBBY.maxZ - 0.012);
  p1.rotation.y = Math.PI;
  deco.add(p1);
  const p2 = picture(posterTexture(POSTERS[4], 10), 0.62, 0.88);
  p2.position.set(-12.6, 1.6, LOBBY.maxZ - 0.012);
  p2.rotation.y = Math.PI;
  deco.add(p2);
  // A neon "OPEN 24/7"-ish sign over the counter: PROBEN BIS DER ARZT KOMMT.
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('PROBEN BIS DER ARZT KOMMT', '#ff4fd8', '#120612', 1024, 128), transparent: true }));
  neon.position.set(-16.5, 2.75, LOBBY.minZ + 0.02);
  live.add(neon);
  live.add(placed(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), glow('#ff4fd8', 0.08)), -16.5, 2.75, LOBBY.minZ + 0.012));

  for (const id of ['lockers', 'vending', 'strings', 'sofa', 'amp', 'table', 'plant', 'kicker'] as const) colliders.push({ ...solid(id) });
  group.add(bake(deco), live);
  return { group, colliders, tags, boards: { booking, notes, polaroids, bandname, tips } };
}

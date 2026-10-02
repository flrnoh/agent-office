// The rehearsal wing lab, for looking at the Schallwerk's wing by eye without the house round it (Vite
// dev only, it isn't built: http://localhost:5173/lab/wing.html). The wing is features/proberaum's own;
// round it only a floor and the building's outer walls in grey, and grey stand-ins where the
// instruments part puts its instruments (INSTRUMENT_SPOTS), to judge the clearances.
// Query params:
//   view=lobby|entry|corridor|probe1|probe2|probe3|studio|control|door|top   where the camera stands
//   booked=1     Proberaum 1 booked, knocked on, the studio recording, pins on the board, polaroids
//   open=1       the doors open
// Once it has drawn, window.__ready holds the draw calls and the triangles.

import * as THREE from 'three';
import { INSTRUMENT_SPOTS, VENUE_ROOM, ZONES, type RehearsalRoomId } from '../../shared/venue';
import type { ProbeView } from '../../shared/proberaum';
import { buildWing } from '../features/proberaum/world';
import { mesh, toon } from '../world/toon';
import { ready, stage } from './stage';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'lobby';
const booked = q.get('booked') === '1';
const open = q.get('open') === '1';
const { scene, camera, renderer, render, sun, floor } = stage(document.getElementById('c') as HTMLCanvasElement);
scene.background = new THREE.Color('#1c1a22');
(floor.material as THREE.MeshToonMaterial).color.set('#3a3640');
sun.intensity = 0.35;
for (const o of scene.children) if (o instanceof THREE.GridHelper) o.visible = false;
camera.fov = 62;
camera.near = 0.05;
camera.updateProjectionMatrix();

// The building's outer walls round the wing, and the foyer's floor beyond its door.
const W = ZONES.wing;
const grey = toon('#55505c');
scene.add(mesh(new THREE.BoxGeometry(0.3, 9, W.maxZ - W.minZ), grey, W.minX - 0.15, 4.5, 0));
scene.add(mesh(new THREE.BoxGeometry(W.maxX - W.minX + 6, 9, 0.3), grey, (W.minX + W.maxX) / 2 + 3, 4.5, VENUE_ROOM.minZ - 0.15));
scene.add(mesh(new THREE.BoxGeometry(W.maxX - W.minX + 6, 9, 0.3), grey, (W.minX + W.maxX) / 2 + 3, 4.5, VENUE_ROOM.maxZ + 0.15));
// The instruments part's stand-ins: a drum kit's footprint, a stand for the rest.
for (const s of INSTRUMENT_SPOTS) {
  if (s.room === 'hall') continue;
  const g = new THREE.Group();
  if (s.kind === 'drums') {
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 16), toon('#c0392b'), 0.55, 0.25, 0));
    for (const [x, z] of [[0.95, -0.35], [0.95, 0.35], [0.2, -0.55], [0.25, 0.6]]) g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 14), toon('#ecf0f1'), x, 0.65, z));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), toon('#222'), 0, 0.5, 0));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), toon('#222'), 0.35, 0.7, 0));
    if (s.kind !== 'mic') g.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 0.3), toon('#2b2b2b'), -0.6, 0.25, 0));
    if (s.kind === 'keys') g.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 1.2), toon('#111'), 0.4, 0.9, 0));
  }
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.rotY - Math.PI / 2;
  scene.add(g);
}

const wing = buildWing('proberaum' as never);
scene.add(wing.group);
const now = Date.UTC(2026, 9, 2, 19, 12);
const v: ProbeView = {
  now,
  rooms: (['probe1', 'probe2', 'probe3', 'studio'] as RehearsalRoomId[]).map((id) => ({
    id,
    door: open,
    booking: booked && (id === 'probe1' || id === 'studio') ? { band: id === 'studio' ? 'Velvet Feedback' : 'Die Fehlgriffe', by: 'Flo', since: now - 600_000, until: now + 3_000_000, members: ['Flo', 'Anna', 'Ben'] } : null,
    knocks: booked && id === 'probe1' ? [{ id: 'x', name: 'Cem' }] : [],
    rec: booked && id === 'studio' ? { by: 'Flo', byId: 'f', startAt: now - 42_000, bpm: 120, click: true, countIn: true, over: null } : null,
    playing: null,
    setlist: id === 'probe3' ? '1. Kadaverkrone\n2. Totenstill (laut!)\n3. Brennende Saiten\n4. Zugabe: Feedback' : id === 'probe1' ? '1. Intro (Drums allein)\n2. Der schnelle\n3. Ballade in D\n4. Jam' : '',
    setlistBy: 'Flo',
  })),
  takes: [],
  pins: booked
    ? [
        { id: 'a', text: 'Drummer sucht Band! Punk, gern laut.', by: 'Ben', at: now - 9e6, color: '#fff59d' },
        { id: 'b', text: 'Verkaufe Combo-Amp, 50 W, brummt nur ein bisschen', by: 'Anna', at: now - 5e6, color: '#90caf9' },
        { id: 'c', text: 'Wer hat mein rotes Kabel?!', by: 'Cem', at: now - 2e6, color: '#f48fb1' },
        { id: 'd', text: 'Mittwoch Jam-Session im Studio, alle willkommen', by: 'Flo', at: now - 1e6, color: '#a5d6a7' },
      ]
    : [],
  polaroids: booked ? ['Die Fehlgriffe', 'Velvet Feedback', 'Kabelsalat', 'Neon Lemmings', 'Brummschleife'].map((band, i) => ({ band, names: ['Flo', 'Anna', 'Ben', 'Cem'].slice(0, 2 + (i % 3)), room: 'probe1' as const, at: now - i * 86_400_000 })) : [],
  tips: 37,
};
wing.redraw(v, now, 'Static Pretzels');
wing.recorders(v, now, () => 'Take 3');
for (const [id, d] of wing.doors) {
  const r = v.rooms.find((x) => x.id === id)!;
  d.set(r.door, false);
  d.light(!!r.booking || !!r.rec);
  for (let i = 0; i < 60; i++) d.update(0.05);
}
wing.studio.onAir(booked);
wing.update(1, 0.016);

const ceilings: THREE.Object3D[] = [];
wing.group.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh && Math.abs(m.position.y - 3.3) < 0.01 && Math.abs(m.rotation.x - Math.PI / 2) < 0.01) ceilings.push(m);
});

const EYE = 1.6;
const views: Record<string, [number, number, number, number, number, number]> = {
  // [x, y, z, lookX, lookY, lookZ]
  entry: [-11.6, EYE, -12.4, -20, 1.4, -12.4],
  lobby: [-13.0, 2.2, -10.0, -21.5, 1.2, -14.0],
  lobby2: [-21.5, EYE, -12.2, -14.5, 1.3, -14.8],
  corridor: [-12.2, EYE, -8.5, -12.2, 1.2, 10],
  door: [-11.6, EYE, -4.2, -13.2, 1.5, -5.9],
  probe1: [-14.0, 2.1, -5.1, -22, 0.9, -6.2],
  probe2: [-14.0, 2.1, 1.1, -22, 0.9, -0.2],
  probe3: [-14.0, 2.1, 7.3, -22, 0.9, 6.0],
  back1: [-22.8, 2.0, -5.0, -13.5, 1.0, -6.6],
  studio: [-14.2, 2.0, 11.6, -22, 1.0, 13],
  control: [-20.5, 1.8, 11.0, -13.6, 1.1, 13.4],
  top: [-17, 26, 0.2, -17.2, 0, 0],
  north: [-12.4, 1.6, -8.0, -12.6, 1.4, -15.5],
};
const [x, y, z, lx, ly, lz] = views[view] ?? views.lobby;
camera.position.set(x, y, z);
camera.lookAt(lx, ly, lz);
if (view === 'top') {
  camera.fov = 70;
  camera.updateProjectionMatrix();
  for (const c of ceilings) c.visible = false;
  sun.intensity = 1.2;
}
render();
ready({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, colliders: wing.colliders.length, interactables: wing.interactables.length });
// How many meshes each part of the wing draws (to keep the draw calls down).
const meshes: Record<string, number> = {};
for (const part of wing.group.children) {
  let n = 0;
  part.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) n++;
  });
  meshes[part.name || part.type] = (meshes[part.name || part.type] ?? 0) + n;
}
(window as unknown as { __meshes: unknown }).__meshes = meshes;
// The studio's session screen, as the page draws it during a take.
import { drawSession } from '../features/proberaum/boards';
import { spotOf, type TakeEv } from '../../shared/proberaum';
const demo: TakeEv[] = [];
for (let t = 0; t < 40_000; t += 250) {
  demo.push([t, 'studio-drums', t % 1000 === 0 ? 36 : t % 500 === 0 ? 38 : 42, 0.8, 0]);
  if (t % 2000 === 0) demo.push([t, 'studio-guitar', 52 + ((t / 2000) % 4) * 2, 0.9, 1.5]);
}
drawSession(wing.studio.screen, '● REC · Flo', demo, (s) => spotOf(s)?.kind, 44_000, 42_000, true);
render();

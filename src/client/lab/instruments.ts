// The instruments lab, for checking the Schallwerk's stage, its backline and the rehearsal rooms'
// instruments by eye without the house around them (Vite dev only, it isn't built:
// http://localhost:5173/lab/instruments.html), and for hearing them (`audio=`). The stage, the
// stations and the players' poses are the feature's own (features/instruments).
// Query params:
//   view=stage|wide|kit|backline|guitar|keys|mics|room|room2|top   where the camera is
//   play=1                                  people at the instruments, mid-song
//   audio=guitar|clean|lead|drums|bass|band|keys-piano|keys-epiano|keys-organ|keys-lead|keys-pad
//                                           renders that take offline instead (see instruments-audio.ts)
// Once it has drawn, window.__ready holds the triangles and the draw calls (or the take's levels).

import * as THREE from 'three';
import { INSTRUMENT_SPOTS, REHEARSAL_ROOMS, STAGE_HEIGHT, ZONES } from '../../shared/venue';
import { DRUM_PIECES } from '../../shared/venue';
import type { DrumPiece } from '../../shared/instruments-play';
import { lookFromSeed } from '../../shared/avatar';
import { Person } from '../world/character';
import { toon } from '../world/toon';
import { buildStage } from '../features/instruments/stage';
import { buildStations } from '../features/instruments/stations';
import { Players, newPlaying, strike } from '../features/instruments/people';
import { renderTake } from './instruments-audio';
import { ready, stage } from './stage';

const q = new URLSearchParams(location.search);
const audio = q.get('audio');
const canvas = document.getElementById('c') as HTMLCanvasElement;
if (audio) void renderTake(audio, canvas).then((facts) => ready(facts));
else draw();

function draw() {
  const view = q.get('view') ?? 'stage';
  const play = q.get('play') === '1';
  const { scene, camera, renderer, render, sun, floor } = stage(canvas);
  scene.background = new THREE.Color('#15131c');
  (floor.material as THREE.MeshToonMaterial).color.set('#2a2730');
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 120 });
  sun.position.set(-4, 26, -14);
  sun.intensity = 1.5;
  camera.fov = 45;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  // A warm wash on the stage, as the house's lights would.
  const wash = new THREE.SpotLight('#ffd9a8', 60, 30, 0.6, 0.6);
  wash.position.set(2.5, 9, -2);
  wash.target.position.set(2.5, STAGE_HEIGHT, 7.5);
  scene.add(wash, wash.target);

  const built = buildStage();
  scene.add(built.group);
  const stations = buildStations();
  for (const s of stations) scene.add(s.group);
  // The rehearsal rooms' floors and walls, only so the rooms read as rooms here (the wing is the proberaum part's).
  for (const r of REHEARSAL_ROOMS) {
    const b = r.box;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ), toon(r.id === 'studio' ? '#5a4632' : '#3b3f4a'));
    f.rotation.x = -Math.PI / 2;
    f.position.set((b.minX + b.maxX) / 2, 0.003, (b.minZ + b.maxZ) / 2);
    f.receiveShadow = true;
    scene.add(f);
    for (const [x, z, w, d] of [
      [b.minX, (b.minZ + b.maxZ) / 2, 0.2, b.maxZ - b.minZ],
      [(b.minX + b.maxX) / 2, b.minZ, b.maxX - b.minX, 0.2],
    ] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), toon('#c9c3b8'));
      wall.position.set(x, 1.4, z);
      scene.add(wall);
    }
  }

  // Players, mid-song.
  const players = new Players(new THREE.Scene());
  if (play) {
    const cast: [string, string, string][] = [
      ['stage-drums', 'Flo', '#e05a3a'],
      ['stage-guitar1', 'Ann', '#3a8ee0'],
      ['stage-bass', 'Cem', '#9be03a'],
      ['stage-keys', 'Dora', '#c04ad6'],
      ['stage-mic1', 'Eli', '#f0b429'],
      ['probe1-drums', 'Gus', '#3ad1c0'],
      ['probe1-guitar', 'Hai', '#e0803a'],
    ];
    const holders = new Map<string, Parameters<Players['update']>[0] extends Map<string, infer V> ? V : never>();
    const now = performance.now() / 1000;
    for (const [id, name, color] of cast) {
      const st = stations.find((s) => s.spot.id === id)!;
      const person = new Person(name, color, lookFromSeed(name));
      person.root.position.set(st.spot.x, st.floorY, st.spot.z);
      person.root.rotation.y = st.spot.rotY;
      scene.add(person.root);
      const playing = newPlaying(st.spot.kind);
      holders.set(name, { person, kind: st.spot.kind, playing, finish: undefined });
      if (st.held) st.held.visible = false;
      // Strike something so the hands are mid-stroke.
      if (st.spot.kind === 'drums') {
        const pieces: DrumPiece[] = ['hihat', 'snare', 'kick'];
        for (const p of pieces) strike(playing, DRUM_PIECES[p], p, now - 0.02);
        st.kit?.hit('crash', 1);
      } else strike(playing, 52, null, now - 0.03);
      if (st.keys) for (const p of [60, 64, 67, 48]) st.keys.press(p, true);
    }
    players.update(holders, '', false);
    for (const h of holders.values()) h.person.update(1 / 60, 1, false, false);
  }
  for (let i = 0; i < 6; i++) for (const s of stations) {
    s.kit?.update(1 / 60, i / 60);
    s.keys?.update(1 / 30);
  }

  const P1 = REHEARSAL_ROOMS[0].box;
  const P1mid = { x: (P1.minX + P1.maxX) / 2, z: (P1.minZ + P1.maxZ) / 2 };
  const cams: Record<string, [number[], number[]]> = {
    stage: [[3, 3.2, -6.5], [3, 1.9, 7.5]],
    wide: [[2.5, 6.5, -9], [2.5, 1.2, 7]],
    kit: [[2.5, 2.9, 6.2], [2.5, 1.9, 8.8]],
    backline: [[14.5, 3.4, 5.2], [3, 1.9, 9]],
    guitar: [[-3.2, 2.5, 5.0], [-3.4, 1.7, 6.3]],
    keys: [[-7.0, 2.8, 5.6], [-7.5, 2.0, 7.3]],
    mics: [[2.2, 2.6, 2.5], [2.5, 2.1, 5.2]],
    room: [[P1.maxX - 0.8, 2.6, P1mid.z + 2.4], [P1mid.x - 1, 0.8, P1mid.z - 0.2]],
    room2: [[P1.minX + 1.0, 2.3, P1mid.z - 2.6], [P1mid.x + 1.2, 0.8, P1mid.z + 0.6]],
    top: [[2.5, 22, -6], [2.5, 0, 7]],
    steps: [[-8, 2.2, 1], [-10.4, 0.6, 5.2]],
  };
  const [p, l] = cams[view] ?? cams.stage;
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(l[0], l[1], l[2]);
  render();
  ready({ view, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, stations: stations.length, colliders: built.colliders.length + stations.reduce((n, s) => n + s.colliders.length, 0), spots: INSTRUMENT_SPOTS.length, zone: ZONES.stage });
}

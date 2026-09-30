// The padel lab, for checking the padel courts and a rally by eye without the hall around them (Vite
// dev only, it isn't built: http://localhost:5173/lab/padel.html). The courts and the figures are the
// office's own (hall/courts.ts), the game the office's own (shared/padel), four computer players.
// Query params:
//   view=play|watch|gallery|top   behind slot 0's player (as you'd play), high over the south end
//                                 (watching), from the gallery (north, 3.6 m up), or from above
//   t=<seconds>                   plays the match on at 60 fps up to t, then draws (default 6)
//   seed=<n>                      the match's random numbers (default 1)
//   live=1                        keeps playing and drawing after that
// Once it has drawn, window.__ready holds the score, the phase, the triangles and the draw calls.

import * as THREE from 'three';
import { COURTS, GALLERY } from '../../shared/hall';
import { fwd, teamOf, type Slot } from '../../shared/padel/court';
import { padel, type PadelState } from '../../shared/padel/game';
import { seeded } from '../../shared/tablegames/game';
import { buildCourts } from '../hall/courts';
import { ready, stage } from './stage';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'play';
const until = Number(q.get('t') ?? 6);
const rng = seeded(Number(q.get('seed') ?? 1));
const { scene, camera, renderer, render, sun } = stage(document.getElementById('c') as HTMLCanvasElement);
scene.background = new THREE.Color('#9fb7c9');
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 80 });
sun.position.set(-10, 30, 12);
camera.fov = 55;
camera.updateProjectionMatrix();

const courts = buildCourts(scene);
const court = COURTS[0];
const v = courts.views[court.id];
const s: PadelState = padel.init();
// A second court with a match on too, further along.
const s2: PadelState = padel.init();
v.cast([null, null, null, null]);
v.focus(view === 'play' ? 0 : null);
courts.views[COURTS[1].id].cast([null, null, null, null]);

function step(dt: number) {
  for (const st of [s, s2]) {
    for (const slot of [0, 1, 2, 3] as Slot[]) for (const a of padel.cpu(st, slot, rng)) padel.input(st, slot, a);
    padel.step(st, dt, [], rng);
  }
  v.draw(s, dt);
  v.board({ names: ['You & 🤖', '🤖 & 🤖'], s });
  courts.views[COURTS[1].id].draw(s2, dt);
  courts.views[COURTS[1].id].board({ names: ['🤖 & 🤖', '🤖 & 🤖'], s: s2 });
  v.aim(view === 'play', s.aim[0][0], s.aim[0][1]);
  place();
}

function place() {
  if (view === 'play') {
    const me = s.p[0];
    const back = -fwd(teamOf(0));
    camera.position.set(court.x + me[0] * 0.85, 3.1, court.z + me[1] + back * 4.6);
    camera.lookAt(court.x + me[0] * 0.45, 0.7, court.z + me[1] - back * 7);
  } else if (view === 'watch') {
    camera.position.set(court.x, 9, court.z + 15.8);
    camera.lookAt(court.x, 0, court.z - 2);
  } else if (view === 'gallery') {
    camera.position.set(0, GALLERY.y + 1.6, GALLERY.maxZ - 1);
    camera.lookAt(0, 0, 3);
  } else {
    camera.position.set(0, 34, 18);
    camera.lookAt(0, 0, 0);
  }
}

for (let i = 0; i < Math.round(until * 60); i++) step(1 / 60);
render();
ready({ games: s.games, points: s.points, phase: s.phase, hits: s.hits, ball: s.b.map((x) => Math.round(x * 100) / 100), triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
if (q.get('live') === '1') {
  let last = performance.now();
  const loop = (now: number) => {
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

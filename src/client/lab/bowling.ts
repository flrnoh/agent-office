// The bowling lab, for checking the lanes, the pins and a ball down a lane by eye without the bowling
// centre around them (Vite dev only, it isn't built: http://localhost:5173/lab/bowling.html). The lanes,
// machines, furniture, screens and playback are the game's own (features/bowlinggame), the throw the
// office's own simulation.
// Query params:
//   view=bowler|deck|seats|board|top|side   behind the approach, by the pins, from the benches, at the
//                                           league board, from above, or from the side of the lane
//   throw=strike|pocket|gutter|split|none   the ball bowled on lane 3 (default strike)
//   t=<seconds>                             how long after the bowler starts their steps to draw (default 2.4)
//   cosmic=1                                black light
// Once it has drawn, window.__ready holds the pins left, the triangles and the draw calls.

import * as THREE from 'three';
import { FOUL_LINE_Z, LANE_X } from '../../shared/bowling';
import { BALLS, LEAGUE_BOARD, PIT_D, boardU, type BowlingRoll, type LaneView, type LeagueBoard, type Roll } from '../../shared/bowling-game';
import { bowl, fullRack, maskOf } from '../../shared/bowling-sim';
import { leaveName } from '../../shared/bowling-score';
import { lookFromSeed } from '../../shared/avatar';
import { Person } from '../world/character';
import { buildLanes } from '../features/bowlinggame/lanes3d';
import { buildMachines } from '../features/bowlinggame/machine';
import { buildFurniture } from '../features/bowlinggame/furniture';
import { LanesView } from '../features/bowlinggame/view';
import { drawBoard, drawConsole, drawSheet } from '../features/bowlinggame/monitor';
import { cosmicProps } from '../features/bowlinggame/props';
import { ready, stage } from './stage';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'bowler';
const kind = q.get('throw') ?? 'strike';
const until = Number(q.get('t') ?? 2.4);
const cosmic = q.get('cosmic') === '1';
const { scene, camera, renderer, render, sun, floor } = stage(document.getElementById('c') as HTMLCanvasElement);
scene.background = new THREE.Color(cosmic ? '#07031a' : '#2a2433');
(floor.material as THREE.MeshToonMaterial).color.set(cosmic ? '#140c26' : '#5b4a5e');
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 90 });
sun.position.set(-6, 30, 14);
sun.intensity = cosmic ? 0.25 : 1.6;
camera.fov = 50;
camera.near = 0.05;
camera.updateProjectionMatrix();

const room = new THREE.Group();
scene.add(room);
const lanes = buildLanes(room);
const machines = buildMachines(room);
const furniture = buildFurniture(room);
const bowler = new Person('Flo', '#e05a3a', lookFromSeed('flo'));
room.add(bowler.root);
const lane = 2;
const players = [
  { id: 'flo', name: 'Flo', color: '#e05a3a', ball: 4, rolls: [10, 7, 3, 9, 0, 10, 10, 8, 1].map((pins): Roll => ({ pins })) },
  { id: 'ann', name: 'Ann', color: '#3a8ee0', ball: 1, rolls: [9, 1, 8, 1, 10, 6, 2, 7, 3].map((pins): Roll => ({ pins })).concat([{ pins: 8, left: (1 << 6) | (1 << 9) }]) },
  { id: 'cem', name: 'Cem', color: '#9be03a', ball: 7, rolls: [0, 0, 3, 5, 10, 10].map((pins): Roll => ({ pins })) },
];
const laneView = (l: number, up: string | null): LaneView => ({ lane: l, players: l === lane ? players : l === 4 ? players.slice(1, 2) : [], up, upSince: 0, pins: fullRack(), game: 1, over: false });
const views = [0, 1, 2, 3, 4, 5].map((l) => laneView(l, l === lane ? 'flo' : l === 4 ? 'ann' : null));
const screens = () => {
  for (let l = 0; l < 6; l++) {
    const m = furniture.monitors[l];
    drawSheet(m.g, lv.shown(l), { cosmic, party: lv.party(l), rolling: lv.rolling(l) ? 'x' : null });
    m.texture.needsUpdate = true;
    drawConsole(furniture.consoles[l].g, lv.shown(l), l, cosmic);
    furniture.consoles[l].texture.needsUpdate = true;
  }
};
const lv = new LanesView({
  root: room,
  machines,
  furniture,
  sound: () => {},
  rolling: () => {},
  person: (id) => (id === 'flo' ? bowler : undefined),
  confetti: () => {},
  changed: () => {},
});
lv.setAll(views);
const board: LeagueBoard = {
  week: '2026-09-28',
  table: [
    { name: 'Flo', avg: 187.3, games: 4, best: 213 },
    { name: 'Ann', avg: 171, games: 3, best: 190 },
    { name: 'Cem', avg: 92.7, games: 1, best: 278 },
  ],
  champion: { name: 'Ann', avg: 199.3 },
  crowned: [],
  high: [{ name: 'Cem', score: 278, at: 0, strikes: 9, spares: 2 }],
  average: [{ name: 'Flo', avg: 168.2, games: 23, best: 245 }],
  strikes: [{ name: 'Flo', strikes: 140 }],
  perfect: [],
};
drawBoard(furniture.board.g, board, cosmic);
furniture.board.texture.needsUpdate = true;
if (cosmic) {
  lanes.glow(1);
  machines.glow(1);
  cosmicProps(true);
}

// The throw on lane 3.
const THROWS: Record<string, { u: number; back: number; power: number; line: number; spin: number }> = {
  strike: { u: 0.2973, back: 4, power: 0.65, line: -0.005, spin: 0.8 },
  pocket: { u: boardU(11), back: 4, power: 0.62, line: -0.004, spin: 0.7 },
  gutter: { u: 0.47, back: 4, power: 0.6, line: 0.03, spin: 0 },
  split: { u: 0, back: 4, power: 0.7, line: 0, spin: 0 },
};
const params = THROWS[kind];
let left = '';
const t0 = performance.now();
if (params) {
  const res = bowl(params, BALLS[4].lbs, fullRack());
  left = leaveName(maskOf(res.standing)) || 'X';
  const after = res.knocked === 10 ? fullRack() : res.standing;
  const roll: BowlingRoll = {
    lane,
    by: 'flo',
    name: 'Flo',
    ball: 4,
    params,
    pins: fullRack(),
    roll: { pins: res.knocked, left: maskOf(res.standing) },
    after,
    foul: res.foul,
    secs: res.secs,
    view: { ...laneView(lane, 'flo'), players: players.map((p) => (p.id === 'flo' ? { ...p, rolls: [...p.rolls, { pins: res.knocked, left: maskOf(res.standing) }] } : p)), pins: after },
  };
  // Play it back on a fake clock: everything in view.ts reads performance.now().
  let fake = 0;

  performance.now = () => t0 + fake * 1000;
  lv.roll(roll, 0);
  const startX = LANE_X[lane] + params.u - 0.15;
  for (fake = 0; fake <= until; fake += 1 / 60) {
    lv.update();
    // The bowler walks their four steps to the line, as their page would move them.
    const k = Math.min(1, fake / 1.15);
    bowler.root.position.set(startX, 0.06, FOUL_LINE_Z + params.back - k * (params.back - 0.15));
    bowler.root.rotation.y = Math.PI;
    bowler.update(1 / 60, fake, false, false);
  }
  fake = until;
  screens();
} else {
  bowler.root.position.set(LANE_X[lane] + 0.1, 0.06, FOUL_LINE_Z + 3.6);
  bowler.root.rotation.y = Math.PI;
  lv.update();
  bowler.update(1 / 60, 0, false, false);
  screens();
}

const X = LANE_X[lane];
const cams: Record<string, [number[], number[]]> = {
  bowler: [[X + 0.6, 1.75, FOUL_LINE_Z + 6.2], [X, 0.3, FOUL_LINE_Z - 16]],
  deck: [[X + 0.55, 0.85, FOUL_LINE_Z - PIT_D + 4.2], [X, 0.25, FOUL_LINE_Z - PIT_D + 0.8]],
  seats: [[-14.5, 1.9, 10.3], [-14.2, 1.6, 2]],
  board: [[LEAGUE_BOARD.x + 5, 2.1, LEAGUE_BOARD.z + 0.5], [LEAGUE_BOARD.x, 2.1, LEAGUE_BOARD.z]],
  top: [[-14, 22, 14], [-14, 0, -4]],
  side: [[X + 2.2, 1.3, FOUL_LINE_Z + 1.5], [X, 0.6, FOUL_LINE_Z - 2]],
};
const [p, l] = cams[view] ?? cams.bowler;
camera.position.set(p[0], p[1], p[2]);
camera.lookAt(l[0], l[1], l[2]);
render();
ready({ left, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });

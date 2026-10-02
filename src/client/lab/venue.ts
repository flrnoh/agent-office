// The Schallwerk lab, for checking the venue's building by eye without the office around it (Vite dev
// only, it isn't built: http://localhost:5173/lab/venue.html). The outside and the inside are the
// office's own (world/venue/).
// Query params:
//   what=out|in          the building on the street, or the house inside (default out)
//   night=1              after dark (outside: the lamps, the neon; inside it's always night)
//   view=<name>          outside: front|corner|garden|dock|bus|far; inside: hall|stage|foyer|bar|foh|back|top
//   mode=konzert|club    inside: the house's mode (default konzert)
//   scene=<scene>        inside: the light desk's scene (auto, warm, rot, blau, uv, strobo, blackout)
//   fx=co2,konfetti,…    inside: effects fired just now
//   level=0..1           inside: how loud the music is (venueLevel), for auto
//   t=<seconds>          how long to run before drawing (default 2)
// Once it has drawn, window.__ready holds the triangles and draw calls.

import * as THREE from 'three';
import { STREET_Y } from '../../shared/layout';
import { VENUE_BOX } from '../../shared/venue';
import { isFx, isScene, MODE_LIGHTS } from '../../shared/venue-house';
import { buildVenueExterior } from '../world/venue/exterior';
import { ready, stage } from './stage';

const q = new URLSearchParams(location.search);
const what = q.get('what') ?? 'out';
const night = q.get('night') === '1';
const until = Number(q.get('t') ?? 2);
const { scene, camera, renderer, render, sun, floor } = stage(document.getElementById('c') as HTMLCanvasElement);
camera.fov = 50;
camera.near = 0.1;
camera.far = 600;
camera.updateProjectionMatrix();

if (what === 'out') {
  const lit = night ? 1 : 0;
  const nightParts = { bulbs: [] as { mat: THREE.MeshToonMaterial; day: number }[], halos: [] as { at: THREE.Vector3; size: number; color: string }[], lamps: [], street: 0, windows: [], clouds: new THREE.MeshToonMaterial(), wetGlass: new THREE.MeshBasicMaterial(), glows: [] as { mat: THREE.Material; max: number }[] };
  const group = new THREE.Group();
  group.position.y = -STREET_Y;
  scene.add(group);
  const ext = buildVenueExterior(group, [], [], nightParts as never);
  (floor.material as THREE.MeshToonMaterial).color.set('#7a8a5a');
  scene.background = new THREE.Color(night ? '#0b1026' : '#bfe3ff');
  sun.intensity = night ? 0.1 : 2.2;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 200 });
  sun.position.set(80, 60, 20);
  sun.target.position.set(113, 0, 52);
  scene.add(sun.target);
  for (const o of scene.children) if ((o as THREE.HemisphereLight).isHemisphereLight || (o as THREE.AmbientLight).isAmbientLight) (o as THREE.Light).intensity *= night ? 0.25 : 1;
  for (const b of nightParts.bulbs) b.mat.emissiveIntensity = b.day + (1 - b.day) * lit;
  for (const g of nightParts.glows) (g.mat as THREE.MeshBasicMaterial).opacity = g.max * lit;
  // The street in front, the loop's tarmac.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 8.6).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#4a4c55' }));
  road.position.set(113, 0.01, 27);
  scene.add(road);
  for (let t = 0; t < until; t += 1 / 30) ext.update(t);
  const B = VENUE_BOX;
  const views: Record<string, [number[], number[]]> = {
    front: [[113, 6, 10], [113, 6, 40]],
    corner: [[72, 14, 14], [113, 6, 50]],
    garden: [[94, 3, 28], [102, 2, 36]],
    bus: [[140, 4, 26], [125, 2, 34]],
    dock: [[150, 6, 56], [138, 2, 64]],
    far: [[40, 40, -40], [113, 5, 52]],
  };
  const [p, at] = views[q.get('view') ?? 'corner'] ?? views.corner;
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(at[0], at[1], at[2]);
  void B;
  render();
  ready({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
} else {
  const { buildVenueLab } = await import('./venue-in');
  buildVenueLab({ q, scene, camera, renderer, render, sun, floor, until, isFx, isScene, MODE_LIGHTS });
}

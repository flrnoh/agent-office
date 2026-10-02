import * as THREE from 'three';
import type { VenueMode } from '../../shared/venue';
import type { VenueFx, VenueLights, VenueScene } from '../../shared/venue-house';
import { buildVenueInterior } from '../world/venue/interior';
import { applyMood } from '../world/venue/lighting';
import { setVenueLevel } from '../world/venue/parts';
import { ready } from './stage';
import { Person } from '../world/character';
import { lookFromSeed } from '../../shared/avatar';
import { INSTRUMENT_SPOTS, STAGE_HEIGHT, ZONES } from '../../shared/venue';

// The Schallwerk lab's inside (see lab/venue.ts for the query params).

interface LabStage {
  q: URLSearchParams;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  render(): void;
  sun: THREE.DirectionalLight;
  floor: THREE.Mesh;
  until: number;
  isFx(v: unknown): v is VenueFx;
  isScene(v: unknown): v is VenueScene;
  MODE_LIGHTS: Record<VenueMode, VenueLights>;
}

export function buildVenueLab(s: LabStage) {
  const { q, scene, camera, renderer, render, sun, floor, until } = s;
  const mode: VenueMode = q.get('mode') === 'club' ? 'club' : 'konzert';
  const lights = { ...s.MODE_LIGHTS[mode] };
  const sc = q.get('scene');
  if (s.isScene(sc)) lights.scene = sc;
  if (q.has('laser')) lights.laser = q.get('laser') === '1';
  if (q.has('ball')) lights.ball = q.get('ball') === '1';
  const level = Number(q.get('level') ?? 0.6);
  floor.visible = false;
  for (const o of scene.children) if ((o as THREE.GridHelper).isLineSegments) o.visible = false;
  sun.intensity = 0;
  scene.background = new THREE.Color('#050508');
  const hemi = scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const ambient = scene.children.find((o) => (o as THREE.AmbientLight).isAmbientLight) as THREE.AmbientLight;
  const room = buildVenueInterior();
  scene.add(room.group);
  if (q.get('roof') === '0') room.group.traverse((o) => o.position.y > 8.9 && (o.visible = false));
  room.setLights(lights, mode);
  // Stand-ins for the other parts (not the building's): the riser, the band at its spots, a crowd.
  if (q.get('extras') !== '0') {
    const S = ZONES.stage;
    const riser = new THREE.Mesh(new THREE.BoxGeometry(S.maxX - S.minX, STAGE_HEIGHT, S.maxZ - S.minZ), new THREE.MeshToonMaterial({ color: '#1b1a1e' }));
    riser.position.set((S.minX + S.maxX) / 2, STAGE_HEIGHT / 2, (S.minZ + S.maxZ) / 2);
    scene.add(riser);
    const people: Person[] = [];
    INSTRUMENT_SPOTS.filter((sp) => sp.room === 'hall').forEach((sp, i) => {
      const p = new Person(`B${i}`, ['#e05a3a', '#3a8ee0', '#e0c83a', '#7a3ae0', '#3ae08e'][i % 5], lookFromSeed(`band${i}`));
      p.root.position.set(sp.x, sp.y, sp.z);
      p.root.rotation.y = sp.rotY;
      p.showLabel(false);
      scene.add(p.root);
      people.push(p);
    });
    for (let i = 0; i < 40; i++) {
      const p = new Person(`C${i}`, ['#e05a3a', '#3a8ee0', '#e0c83a', '#7a3ae0', '#3ae08e', '#ddd'][i % 6], lookFromSeed(`crowd${i}`));
      p.root.position.set(-8 + ((i * 37) % 25) + Math.sin(i) * 0.4, 0, -4.5 + ((i * 13) % 8) + Math.cos(i) * 0.4);
      p.root.rotation.y = 0;
      p.showLabel(false);
      scene.add(p.root);
      people.push(p);
    }
    for (const p of people) p.update(0.016, 0.5, false, false);
  }
  const fx = (q.get('fx') ?? '').split(',').filter((f): f is VenueFx => s.isFx(f));
  const dt = 1 / 30;
  const start = 1_000_000;
  const fxAt = Number(q.get('fxt') ?? 1.2);
  for (let t = 0; t < until; t += dt) {
    const now = start + t * 1000;
    // The music: a kick every half second, so auto has beats.
    setVenueLevel('lab', level * (0.55 + 0.45 * Math.max(0, Math.cos((t % 0.5) * Math.PI * 4))));
    if (Math.abs(t - Math.max(0, until - fxAt)) < dt / 2) for (const f of fx) room.fire(f, now);
    room.update(now, t, dt, level * (0.55 + 0.45 * Math.max(0, Math.cos((t % 0.5) * Math.PI * 4))), t === 0);
  }
  applyMood(room.show.look, hemi, ambient);
  const views: Record<string, [number[], number[]]> = {
    hall: [[3, 2.2, -8.6], [3, 3.2, 8]],
    stage: [[2.5, 4.5, -3], [2.5, 4, 11]],
    foyer: [[-6, 1.7, -10], [8, 1.5, -15]],
    entry: [[0, 1.7, -14.2], [0, 1.8, 0]],
    bar: [[14, 1.8, -6.5], [22, 1.6, 0]],
    foh: [[2.5, 1.8, -10.2], [2.5, 1.0, -6]],
    back: [[-8, 1.8, 12.4], [12, 1.2, 14]],
    stairs: [[14, 2.2, 15.2], [12.4, 1.2, 11]],
    top: [[4, 26, 2], [4, 0, 1.5]],
    side: [[-9, 6, 2], [14, 3, -1]],
    gallery: [[3, 1.7, -4], [3, 4.6, -9]],
    under: [[3, 1.7, -12], [3, 4.6, -8]],
  };
  const [p, at] = views[q.get('view') ?? 'hall'] ?? views.hall;
  camera.fov = q.get('view') === 'top' ? 75 : 62;
  camera.updateProjectionMatrix();
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(at[0], at[1], at[2]);
  render();
  ready({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, look: { house: room.show.look.house, stage: room.show.look.stageLevel } });
}

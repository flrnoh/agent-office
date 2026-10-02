import * as THREE from 'three';
import { BOWLING_ROOM, ZONES } from '../../../shared/bowling';
import { MIRROR_BALL } from '../../../shared/bowling-house';
import { canvasTexture } from '../casino/parts';
import { mesh, toon } from '../toon';
import type { HouseLighting } from './lighting';

/*
 * Cosmic bowling's show (flrnoh fork, see FORK.md "The bowling centre"): a mirror ball turning over
 * the lounge, throwing a swarm of coloured spots that sweep over the floor, the walls and the ceiling,
 * and laser beams fanning out from under it, all of it only while the lights are cosmic (it fades in
 * with the UV). The spots are one instanced mesh, laid where each of the ball's rays meets the room.
 */

const R = BOWLING_ROOM;
const SPOTS = 90;
const BEAMS = 8;
const COLORS = ['#ff3fb4', '#4cf2ff', '#ffe14d', '#9d5cff', '#7dff5c', '#ffffff'];

export interface CosmicShow {
  update(t: number, k: number): void;
}

/** The mini golf room is always black light, and has walls of its own: none of the show goes in there. */
const GOLF = ZONES.minigolf;
const inGolf = (p: THREE.Vector3) => p.x > GOLF.minX - 0.2 && p.z < GOLF.maxZ + 0.2;

/** Where a ray from `o` along `d` first meets the room's box (floor, ceiling or a wall), and that face's normal. */
function hit(o: THREE.Vector3, d: THREE.Vector3, at: THREE.Vector3, n: THREE.Vector3): number {
  let best = Infinity;
  const tryPlane = (t: number, nx: number, ny: number, nz: number) => {
    if (t > 0.01 && t < best) {
      best = t;
      n.set(nx, ny, nz);
    }
  };
  if (d.y < 0) tryPlane(-o.y / d.y, 0, 1, 0);
  if (d.y > 0) tryPlane((R.height - o.y) / d.y, 0, -1, 0);
  if (d.x < 0) tryPlane((R.minX - o.x) / d.x, 1, 0, 0);
  if (d.x > 0) tryPlane((R.maxX - o.x) / d.x, -1, 0, 0);
  if (d.z < 0) tryPlane((R.minZ - o.z) / d.z, 0, 0, 1);
  if (d.z > 0) tryPlane((R.maxZ - o.z) / d.z, 0, 0, -1);
  at.copy(o).addScaledVector(d, best);
  return best;
}

export function buildCosmic(group: THREE.Group, lighting: HouseLighting): CosmicShow {
  const o = new THREE.Vector3(MIRROR_BALL.x, MIRROR_BALL.y, MIRROR_BALL.z);

  // ---- The ball: a faceted sphere of little mirrors, on a rod from the ceiling, with a motor ---------
  const facets = canvasTexture(128, 64, (g) => {
    for (let y = 0; y < 64; y += 4)
      for (let x = 0; x < 128; x += 4) {
        const v = 150 + ((x * 13 + y * 7) % 100);
        g.fillStyle = `rgb(${v},${v},${v + 10})`;
        g.fillRect(x, y, 3, 3);
      }
  });
  const ballMat = new THREE.MeshBasicMaterial({ map: facets, color: '#9aa0b0' });
  ballMat.userData.outlineParameters = { visible: false };
  lighting.tint(ballMat.color, '#9aa0b0', '#ffffff', true);
  const ball = mesh(new THREE.SphereGeometry(0.42, 24, 16), ballMat, o.x, o.y, o.z, false);
  group.add(ball);
  group.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, R.height - o.y - 0.42, 6), toon('#8d99ae'), o.x, (R.height + o.y + 0.42) / 2, o.z, false));
  group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12), toon('#2b2d42'), o.x, R.height - 0.06, o.z, false));
  // Its sparkle: a soft star round it in the dark.
  const flare = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture(64, 64, (g) => {
        const grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,0.9)');
        grd.addColorStop(0.25, 'rgba(220,180,255,0.35)');
        grd.addColorStop(1, 'rgba(160,80,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
      }),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  flare.position.copy(o);
  flare.scale.setScalar(2.4);
  group.add(flare);
  lighting.onlyCosmic(flare);

  // ---- The spots ---------------------------------------------------------------------------------------
  const spotTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  const spotMat = new THREE.MeshBasicMaterial({ map: spotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4 });
  spotMat.userData.outlineParameters = { visible: false };
  const spots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), spotMat, SPOTS);
  spots.frustumCulled = false;
  const dirs: THREE.Vector3[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < SPOTS; i++) {
    // Evenly round the ball (a Fibonacci sphere), more of them downward.
    const y = 1 - ((i + 0.5) / SPOTS) * 1.6;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize());
    spots.setColorAt(i, color.set(COLORS[i % COLORS.length]));
  }
  group.add(spots);
  lighting.onlyCosmic(spots);

  // ---- The lasers: thin beams fanning out from under the ball ----------------------------------------
  const beams: { m: THREE.Mesh; phase: number }[] = [];
  const beamGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true).translate(0, 0.5, 0);
  for (let i = 0; i < BEAMS; i++) {
    const m = new THREE.MeshBasicMaterial({ color: COLORS[i % 4], transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
    m.userData.outlineParameters = { visible: false };
    const b = new THREE.Mesh(beamGeo, m);
    b.position.set(o.x, o.y - 0.5, o.z);
    group.add(b);
    lighting.onlyCosmic(b);
    beams.push({ m: b, phase: (i / BEAMS) * Math.PI * 2 });
  }
  // A little laser box under the ball they come out of.
  group.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), toon('#1d1d1d'), o.x, o.y - 0.5, o.z, false));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.Quaternion();
  const from = new THREE.Vector3(o.x, o.y - 0.5, o.z);

  return {
    update(t, k) {
      ball.rotation.y = t * 0.45;
      if (!spots.visible) return;
      const turn = t * 0.45;
      spin.setFromAxisAngle(yAxis, turn);
      for (let i = 0; i < SPOTS; i++) {
        d.copy(dirs[i]).applyQuaternion(spin);
        const dist = hit(o, d, at, n);
        // Further off, a bigger and fainter spot; a little off the face so it shows.
        at.addScaledVector(n, 0.02);
        q.setFromUnitVectors(up, n);
        const size = inGolf(at) ? 0 : 0.32 + dist * 0.04;
        s.set(size, size, 1);
        m4.compose(at, q, s);
        spots.setMatrixAt(i, m4);
      }
      spots.instanceMatrix.needsUpdate = true;
      spotMat.opacity = 0.9 * k;
      flare.material.opacity = k;
      for (const b of beams) {
        // Each beam swings down and round, crossing the others.
        // (swinging through the south and west of the room, never into the mini golf room to the north-east)
        const a = Math.PI * 0.6 + Math.sin(t * 0.5 + b.phase) * Math.PI * 0.5;
        const tilt = 0.9 + Math.sin(t * 0.8 + b.phase * 2) * 0.45;
        d.set(Math.cos(a) * Math.sin(tilt), -Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
        const len = hit(from, d, at, n);
        b.m.visible = !inGolf(at);
        b.m.quaternion.setFromUnitVectors(yAxis, d);
        b.m.scale.set(1, len, 1);
        (b.m.material as THREE.MeshBasicMaterial).opacity = 0.6 * k;
      }
    },
  };
}

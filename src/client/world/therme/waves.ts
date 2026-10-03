import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WELLENBAD } from '../../../shared/therme';
import { BEACH, DEEP, WAVE_BOARD, WAVE_WATER, beachSteps, waveBoard, waveStrength, waveSwell } from '../../../shared/therme-waves';
import { mesh, toon } from '../toon';
import { FONT } from '../casino/parts';
import { Cloud } from '../gym/particles';
import { mosaic, ripples } from '../gym/basement/textures';
import { blk, edgeWallsGeometry, rectsGeometry, tex, tiles, wrap, type ThermeParts } from './kit';
import { grate } from './textures';

/*
 * The wave pool (flrnoh fork, see shared/therme-waves.ts, phase 3): the beach stepping down into the
 * water, the deep basin in mosaic, the water's surface as a grid of vertices lifted each frame by the
 * same waves every page works out from the office's clock, foam where they break toward the beach,
 * the wave machine's grilles in the deep end's wall, a line of floats across where the beach drops
 * away (riding the waves too), and the board over the beach saying when the next waves come (or how
 * long they still run).
 */

export interface WavePool {
  update(t: number, dt: number, now: number, me: THREE.Vector3): void;
}

/** The board's face: big words and a line under them, redrawn when they change. */
function boardFace(): { tex: THREE.CanvasTexture; draw(big: string, small: string, hot: boolean): void } {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 376;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const g = c.getContext('2d')!;
  return {
    tex: t,
    draw: (big, small, hot) => {
      g.fillStyle = hot ? '#0b4f6c' : '#10303f';
      g.fillRect(0, 0, 1024, 376);
      g.strokeStyle = hot ? '#7ff3ff' : '#3fb6c9';
      g.lineWidth = 12;
      g.strokeRect(10, 10, 1004, 356);
      g.fillStyle = hot ? '#ffffff' : '#bff4ff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 112px ${FONT}`;
      g.fillText(big, 512, 150, 960);
      g.globalAlpha = 0.85;
      g.font = `600 56px ${FONT}`;
      g.fillText(small, 512, 280, 960);
      g.globalAlpha = 1;
      t.needsUpdate = true;
    },
  };
}

export function buildWavePool(p: ThermeParts): WavePool {
  const W = WELLENBAD;
  // The beach: its steps' tops in sand tiles, their risers, the deep floor and the walls in mosaic.
  const sand = wrap(tiles('#ead9b0', '#cdb98d', 4, 0.06, 91));
  const steps = beachSteps();
  const tops = mergeGeometries(steps.map((s) => rectsGeometry([s], s.top, 2)))!;
  p.group.add(mesh(tops, tex(sand), 0, 0, 0, false));
  for (const [i, s] of steps.entries()) {
    const above = i ? steps[i - 1].top : 0;
    blk(p, s.maxX - s.minX, above - s.top, 0.02, '#dcc89c', (s.minX + s.maxX) / 2, (above + s.top) / 2, s.minZ + 0.01);
  }
  const blue = wrap(mosaic('#3aa7c4', 16, 0.12, 97));
  p.group.add(mesh(rectsGeometry([DEEP], WAVE_WATER.floor + 0.002, 2), tex(blue), 0, 0, 0, false));
  const walls = [
    { axis: 'x' as const, at: DEEP.maxZ, from: W.minX, to: W.maxX, out: 1 as const },
    { axis: 'z' as const, at: W.minX, from: W.minZ, to: W.maxZ, out: -1 as const },
    { axis: 'z' as const, at: W.maxX, from: W.minZ, to: W.maxZ, out: 1 as const },
  ];
  const wallMat = tex(blue, '#ffffff', { emissive: '#3aa7c4', emissiveIntensity: 0.6 });
  p.group.add(mesh(edgeWallsGeometry(walls, WAVE_WATER.floor, 0, 2), wallMat, 0, 0, 0, false));
  // Where the beach ends, a drop into the deep: the last step's face.
  p.group.add(mesh(edgeWallsGeometry([{ axis: 'x', at: DEEP.minZ, from: W.minX, to: W.maxX, out: -1 }], WAVE_WATER.floor, BEACH.bottom, 2), wallMat, 0, 0, 0, false));
  // The surface: a grid over the water (from where the beach goes under), lifted by the waves each frame.
  const z0 = BEACH.minZ + 0.9;
  const nx = 60;
  const nz = 44;
  const geo = new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((W.minX + W.maxX) / 2, WAVE_WATER.surface, (z0 + W.maxZ) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const water = ripples('#3fb0d0', '#d8fbff', 47);
  const wm = tex(water, '#ffffff', { transparent: true, opacity: 0.82, depthWrite: false });
  const surface = mesh(geo, wm, 0, 0, 0, false);
  surface.userData.noOutline = true;
  surface.renderOrder = 1;
  surface.frustumCulled = false;
  p.group.add(surface);
  // The board over the top of the beach, on two posts.
  const B = WAVE_BOARD;
  const face = boardFace();
  const board = new THREE.Group();
  board.add(mesh(new THREE.BoxGeometry(B.w + 0.3, B.h + 0.3, 0.2), toon('#22303a'), 0, 0, 0, false));
  const f = new THREE.MeshBasicMaterial({ map: face.tex });
  f.toneMapped = false;
  for (const s of [1, -1]) {
    const m = mesh(new THREE.PlaneGeometry(B.w, B.h), f, 0, 0, s * 0.11, false);
    m.rotation.y = s > 0 ? 0 : Math.PI;
    board.add(m);
  }
  board.position.set(B.x, B.y, B.z);
  p.group.add(board);
  for (const s of [-1, 1]) p.still.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, B.y, 8), toon('#22303a'), B.x + (s * B.w) / 2, B.y / 2, B.z, false));
  // The wave machine's grilles, low in the deep end's wall.
  const grilles = new THREE.MeshToonMaterial({ map: grate(), color: '#9fb8c0', gradientMap: toon('#ffffff').gradientMap });
  for (const x of [72, 90, 108, 126]) {
    const g = mesh(new THREE.PlaneGeometry(9, 1.3), grilles, x, WAVE_WATER.floor + 1.0, W.maxZ - 0.02, false);
    g.rotation.y = Math.PI;
    p.group.add(g);
  }
  // A line of floats across, where the beach drops into the deep, red and white, riding the waves.
  const LINE_Z = BEACH.maxZ + 1.5;
  const n = Math.floor((W.maxX - W.minX - 1) / 0.7);
  const floats = [toon('#e63946'), toon('#ffffff')].map((m) => new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), m, Math.ceil(n / 2)));
  const rope = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const ropeLine = new THREE.Line(rope, new THREE.LineBasicMaterial({ color: '#f4f7f8' }));
  ropeLine.frustumCulled = false;
  p.group.add(ropeLine, ...floats);
  const fm = new THREE.Matrix4();
  const lay = (now: number) => {
    const rp = rope.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const x = W.minX + 0.5 + i * 0.7;
      const y = WAVE_WATER.surface + waveSwell(x, LINE_Z, now) + 0.04;
      rp.setXYZ(i, x, y, LINE_Z);
      floats[i % 2].setMatrixAt(i >> 1, fm.makeTranslation(x, y, LINE_Z));
    }
    rp.needsUpdate = true;
    for (const f of floats) f.instanceMatrix.needsUpdate = true;
  };
  lay(0);
  const foam = new Cloud(360, '#ffffff');
  foam.lift = 0.3;
  foam.drag = 1.6;
  p.group.add(foam.points);
  let said = '';
  let lastBoard = -1;
  const v = new THREE.Vector3();
  return {
    update: (t, dt, now, me) => {
      water.offset.x = (t * 0.03) % 1;
      water.offset.y = (t * 0.05) % 1;
      const strong = waveStrength(now);
      const near = Math.hypot(me.x - (W.minX + W.maxX) / 2, me.z - (W.minZ + W.maxZ) / 2) < 110;
      // The grid only moves while there are waves (and you're near enough to see it), and once more to lie flat after.
      if (near && (strong > 0 || surface.userData.moved)) {
        for (let i = 0; i < pos.count; i++) pos.setY(i, WAVE_WATER.surface + waveSwell(pos.getX(i), pos.getZ(i), now));
        pos.needsUpdate = true;
        surface.userData.moved = strong > 0;
        if (!strong) geo.computeVertexNormals();
        lay(now);
      }
      // Foam where they break, on the beach's last steps.
      if (near && strong > 0.2) {
        foam.emit(Math.ceil(dt * 120 * strong), { at: v.set((W.minX + W.maxX) / 2, WAVE_WATER.surface + 0.15, BEACH.maxZ - 1.5), spread: { x: (W.maxX - W.minX) / 2, y: 0.05, z: 2.5 }, vel: { x: 0, y: 0.4, z: -1.2 }, jitter: 0.4, life: 1.1, size0: 0.25, size1: 0.7, alpha: 0.6 });
      }
      foam.update(dt);
      if (t - lastBoard > 0.25) {
        lastBoard = t;
        const b = waveBoard(now);
        const key = `${b.big}|${b.small}`;
        if (key !== said) {
          said = key;
          face.draw(b.big, b.small, strong > 0);
        }
      }
    },
  };
}

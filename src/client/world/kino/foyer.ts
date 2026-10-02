import * as THREE from 'three';
import { FILMS, kinoAt, kinoComing } from '../../../shared/kino';
import { KINO_SNACKS } from '../../../shared/kino-snacks';
import { COUNTER, ENTRANCE, FOYER, HALL_DOORS, KINO, KT, POPCORN } from '../../../shared/kino-plan';
import { canvasTexture } from '../texture';
import { mesh, toon } from '../toon';
import { G, carpetTexture, fit, glowing, plane, sign, slab } from './kit';
import { posterTexture } from './posters';

// flrnoh fork (see FORK.md "The cinema"): the foyer: a patterned carpet, wood panelling, the counter
// (tickets and snacks) with the popcorn machine popping away on it, the menu and a fridge of drinks
// behind, the programme board between the halls' doors (live from the schedule), the halls' signs
// over their doors and posters on the wall. Its lights are always on, so it glows through the
// windows at night.

export interface Foyer {
  /** The programme board, redrawn when what's on changes (`now` on the office's clock). */
  programme(now: number): void;
  /** Each frame: the popcorn popping. */
  update(t: number, dt: number): void;
  /** The posters inside, in their cases. */
  posters: THREE.MeshBasicMaterial[];
}

/** A material for in here: toon-shaded, but lit from within too, so it doesn't go dark at night. */
function inside(color: string, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  const m = toon(color).clone();
  m.map = map;
  m.emissive = new THREE.Color(color).multiplyScalar(0.6);
  if (map) {
    m.emissiveMap = map;
    m.emissive = new THREE.Color('#999999');
  }
  return m;
}

export function buildFoyer(g: THREE.Group): Foyer {
  const first = g.children.length;
  const x0 = FOYER.minX + KT / 2;
  const x1 = FOYER.maxX - KT / 2;
  const z0 = KINO.minZ + KT / 2;
  const z1 = KINO.maxZ - KT / 2;
  const carpet = carpetTexture('#7a1020', '#d4a017', 64);
  carpet.repeat.set((x1 - x0) / 0.8, (z1 - z0) / 0.8);
  const floor = plane(g, inside('#ffffff', carpet), (x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = plane(g, inside('#f3e9d2'), (x0 + x1) / 2, FOYER.h, (z0 + z1) / 2, x1 - x0, z1 - z0, 0);
  ceiling.rotation.x = Math.PI / 2;
  // Recessed lights in the ceiling.
  const lamp = glowing('#fff4d6');
  for (let x = x0 + 2; x < x1 - 1; x += 3) for (let z = z0 + 2.5; z < z1 - 1; z += 4) slab(g, lamp, x - 0.25, x + 0.25, FOYER.h - 0.03, FOYER.h - 0.01, z - 0.25, z + 0.25);
  // Wood panelling round the walls, a brass rail over it, cream above.
  const wood = inside('#5b3a29');
  const brass = inside('#c9a227');
  const cream = inside('#efe3c8');
  /** The wood and brass stand this far off the walls and clear of the corners: flush, their backs and ends would share the cream's planes and flicker. */
  const IN = 0.01;
  // The back wall (the halls' front) has their doorways in it.
  const cuts = HALL_DOORS.map((d) => [d.z - d.w / 2 - 0.12, d.z + d.w / 2 + 0.12] as const).sort((a, b) => a[0] - b[0]);
  let from = z0;
  for (const [a, b] of [...cuts, [z1, z1] as const]) {
    if (a > from) {
      slab(g, cream, x0, x0 + 0.02, 0, FOYER.h, from, a);
      slab(g, wood, x0 + IN, x0 + 0.06, 0, 1.2, Math.max(from, z0 + IN), Math.min(a, z1 - IN));
      slab(g, brass, x0 + IN, x0 + 0.09, 1.2, 1.26, Math.max(from, z0 + IN), Math.min(a, z1 - IN));
    }
    if (b < z1) slab(g, cream, x0, x0 + 0.02, 2.6, FOYER.h, a, b);
    from = b;
  }
  for (const z of [z0, z1]) {
    const s = z === z0 ? 1 : -1;
    slab(g, cream, x0, x1, 0, FOYER.h, z, z + s * 0.02);
    slab(g, wood, x0 + IN, x1 - IN, 0, 1.2, z + s * IN, z + s * 0.06);
    slab(g, brass, x0 + IN, x1 - IN, 1.2, 1.26, z + s * IN, z + s * 0.09);
  }

  // The front wall's inside, round the windows (z from–to either side, and over them).
  const front = x1 - 0.02;
  const glazeZ0 = ENTRANCE.z - 6;
  const glazeZ1 = ENTRANCE.z + 6;
  slab(g, cream, front, x1, 0, FOYER.h, z0, glazeZ0);
  slab(g, cream, front, x1, 0, FOYER.h, glazeZ1, z1);
  slab(g, cream, front, x1, 3.4, FOYER.h, glazeZ0, glazeZ1);
  slab(g, wood, x1 - 0.06, x1 - IN, 0, 1.2, z0 + IN, glazeZ0);
  slab(g, wood, x1 - 0.06, x1 - IN, 0, 1.2, glazeZ1, z1 - IN);
  // Nothing in here takes the sun's shadows: it's lit from its own ceiling.
  for (const c of g.children.slice(first)) c.traverse((o) => (o.receiveShadow = false));

  // The counter: red front with a brass rail, a dark wooden top, and a back counter with the drinks fridge.
  const red = inside('#8d1b1b');
  const top = inside('#2b1b14');
  const c = COUNTER;
  slab(g, red, c.minX, c.maxX, 0, c.top - 0.06, c.minZ, c.maxZ, true);
  slab(g, top, c.minX - 0.05, c.maxX + 0.05, c.top - 0.06, c.top, c.minZ - 0.05, c.maxZ + 0.15);
  slab(g, brass, c.minX, c.maxX, 0.25, 0.3, c.maxZ, c.maxZ + 0.04);
  slab(g, brass, c.minX, c.maxX, 0.85, 0.9, c.maxZ, c.maxZ + 0.04);
  slab(g, inside('#3b2a20'), c.minX, c.maxX - 1.2, 0, 0.95, z0 + 0.05, z0 + 0.65, true);
  slab(g, inside('#2b1b14'), c.minX, c.maxX, 0, 0.3, KINO.minZ + 0.8, c.minZ);
  const fridge = glowing('#d9f3ff');
  slab(g, inside('#222831'), c.maxX - 1.1, c.maxX - 0.1, 0, 2.05, z0 + 0.05, z0 + 0.75);
  slab(g, fridge, c.maxX - 1.0, c.maxX - 0.2, 0.15, 1.95, z0 + 0.76, z0 + 0.78);
  for (let y = 0.5; y < 1.9; y += 0.45) {
    for (let x = c.maxX - 0.95; x < c.maxX - 0.25; x += 0.14) slab(g, toon(['#e63946', '#2a9d8f', '#f4a261', '#3b1f12'][Math.floor(x * 7 + y * 3) & 3]), x, x + 0.08, y, y + 0.22, z0 + 0.5, z0 + 0.58);
  }
  // A till and a bell on the counter.
  slab(g, inside('#3a3a3a'), c.maxX - 2.2, c.maxX - 1.7, c.top, c.top + 0.28, c.minZ + 0.15, c.minZ + 0.55);
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, c.maxX - 1.2, G + c.top, c.maxZ - 0.15, false));
  // The menu over the back counter.
  const menu = sign(1024, 384, (m) => {
    m.fillStyle = '#1a1a1a';
    m.fillRect(0, 0, 1024, 384);
    m.strokeStyle = '#c9a227';
    m.lineWidth = 8;
    m.strokeRect(8, 8, 1008, 368);
    m.textAlign = 'center';
    m.fillStyle = '#ffd166';
    fit(m, 'KASSE & SNACKS', 512, 78, 900, 60);
    m.font = '800 44px Nunito, ui-rounded, system-ui, sans-serif';
    KINO_SNACKS.forEach((s, i) => {
      m.fillStyle = '#ffffff';
      m.textAlign = 'left';
      m.fillText(`${s.emoji} ${s.name}`, 90, 160 + i * 66);
      m.textAlign = 'right';
      m.fillStyle = '#ffd166';
      m.fillText('aufs Haus', 934, 160 + i * 66);
    });
  });
  plane(g, glowing('#ffffff', menu), (c.minX + c.maxX) / 2 - 0.6, 2.9, z0 + 0.04, 4.2, 1.58, 0);

  // The popcorn machine on the counter: a red cart with a glass case (sunk a centimetre into the cart
  // and its lid), a kettle, a heap, kernels popping.
  const p = POPCORN;
  const glass = new THREE.MeshBasicMaterial({ color: '#fff8e1', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  slab(g, red, p.x - 0.4, p.x + 0.4, p.y, p.y + 0.25, p.z - 0.3, p.z + 0.3);
  slab(g, glass, p.x - 0.38, p.x + 0.38, p.y + 0.24, p.y + 1.01, p.z - 0.28, p.z + 0.28);
  slab(g, red, p.x - 0.42, p.x + 0.42, p.y + 1.0, p.y + 1.14, p.z - 0.32, p.z + 0.32);
  const popSign = sign(256, 64, (m) => {
    m.fillStyle = '#ffd23f';
    m.fillRect(0, 0, 256, 64);
    m.fillStyle = '#8d1b1b';
    m.textAlign = 'center';
    fit(m, 'POPCORN', 128, 50, 240, 50);
  });
  plane(g, glowing('#ffffff', popSign), p.x, p.y + 1.26, p.z + 0.33, 0.8, 0.2, 0);
  slab(g, red, p.x - 0.4, p.x + 0.4, p.y + 1.14, p.y + 1.36, p.z + 0.3, p.z + 0.32);
  const heap = mesh(new THREE.SphereGeometry(0.33, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), inside('#fff1b8'), p.x, G + p.y + 0.25, p.z, false);
  heap.scale.set(1, 0.5, 0.75);
  g.add(heap);
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.14, 12), inside('#b0b0b0'), p.x, G + p.y + 0.82, p.z, false));
  g.add(mesh(new THREE.SphereGeometry(0.12, 12, 6), glowing('#ffcf7a', null, { transparent: true, opacity: 0.35 }), p.x, G + p.y + 0.95, p.z, false));
  // The kernels: each flies up out of the kettle, tumbles and lands on the heap.
  const N = 26;
  const kernels = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), inside('#fffbe6'), N);
  const seeds = Array.from({ length: N }, (_, i) => ({ t: (i / N) * 1.4, a: i * 2.4, s: 0.6 + ((i * 37) % 10) / 20 }));
  kernels.frustumCulled = false;
  g.add(kernels);
  const m4 = new THREE.Matrix4();

  // The programme board between Saal 1's doors, and the halls' signs over their doors.
  const progCanvas = document.createElement('canvas');
  progCanvas.width = 1024;
  progCanvas.height = 640;
  const progTex = new THREE.CanvasTexture(progCanvas);
  progTex.colorSpace = THREE.SRGBColorSpace;
  progTex.anisotropy = 8;
  const boardZ = (HALL_DOORS[0].z + HALL_DOORS[1].z) / 2;
  slab(g, brass, x0 + IN, x0 + 0.08, 1.45, 4.35, boardZ - 2.6, boardZ + 2.6);
  plane(g, glowing('#ffffff', progTex), x0 + 0.09, 2.9, boardZ, 5, 2.8, Math.PI / 2);
  for (const d of HALL_DOORS) {
    const t = canvasTexture(256, 64, (m) => {
      m.fillStyle = '#1a0d0d';
      m.fillRect(0, 0, 256, 64);
      m.fillStyle = '#ffd166';
      m.textAlign = 'center';
      fit(m, `SAAL ${d.hall}`, 128, 48, 230, 44);
    });
    plane(g, glowing('#ffffff', t), x0 + 0.05, 2.95, d.z, 1.4, 0.35, Math.PI / 2);
  }
  // Posters along the south wall, lit.
  const posters: THREE.MeshBasicMaterial[] = [];
  for (const x of [x0 + 2.2, x0 + 5.2, x0 + 8.2]) {
    slab(g, brass, x - 0.85, x + 0.85, 0.95, 3.15, z1 - 0.12, z1 - IN);
    const mat = glowing('#ffffff', posterTexture(0));
    plane(g, mat, x, 2.05, z1 - 0.13, 1.45, 2.05, Math.PI);
    posters.push(mat);
  }

  let progKey = '';
  return {
    posters,
    programme(now) {
      const k = kinoAt(now);
      const coming = kinoComing(now, 5);
      const key = `${k.film}|${k.phase}|${new Date(k.startsAt).getMinutes()}`;
      if (key === progKey) return;
      progKey = key;
      const m = progCanvas.getContext('2d');
      if (!m) return;
      m.fillStyle = '#121212';
      m.fillRect(0, 0, 1024, 640);
      m.textAlign = 'center';
      m.fillStyle = '#ffd166';
      fit(m, 'HEUTE IM KINO · SAAL 1', 512, 70, 960, 56);
      const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const rows = [{ film: k.film, at: k.startsAt, now: true }, ...coming.map((c2) => ({ ...c2, now: false }))];
      rows.forEach((r, i) => {
        const y = 150 + i * 80;
        const f = FILMS[r.film];
        m.textAlign = 'left';
        m.fillStyle = r.now ? '#ff6b6b' : '#ffd166';
        m.font = '900 44px Nunito, ui-rounded, system-ui, sans-serif';
        m.fillText(r.now ? (k.phase === 'film' ? 'JETZT' : 'GLEICH') : clock(r.at), 40, y);
        m.fillStyle = '#ffffff';
        fit(m, `${f.title} (${f.year})`, 560, y, 640, 44, 800);
        m.textAlign = 'right';
        m.fillStyle = '#9aa5b1';
        m.font = '700 26px Nunito, ui-rounded, system-ui, sans-serif';
        m.fillText(f.licence, 990, y);
      });
      m.textAlign = 'center';
      m.fillStyle = '#9aa5b1';
      m.font = '700 26px Nunito, ui-rounded, system-ui, sans-serif';
      m.fillText('Saal 2: E am Pult · dein eigener Film für alle im Saal', 512, 615);
      progTex.needsUpdate = true;
    },
    update(t) {
      for (let i = 0; i < N; i++) {
        const s = seeds[i];
        const u = ((t * s.s + s.t) % 1.4) / 1.4;
        // Up out of the kettle and down onto the heap, in a little arc.
        const r = 0.05 + u * 0.22;
        const y = p.y + 0.85 + Math.sin(u * Math.PI) * 0.12 - u * 0.5;
        m4.makeRotationY(t * 3 + i).setPosition(p.x + Math.cos(s.a) * r, G + Math.max(p.y + 0.3, y), p.z + Math.sin(s.a) * r * 0.7);
        kernels.setMatrixAt(i, m4);
      }
      kernels.instanceMatrix.needsUpdate = true;
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Furniture } from '../../../shared/streetside';
import { canvasTexture } from '../texture';
import { mergeByMaterial, mesh, toon } from '../toon';
import type { Collider } from '../types';
import { G } from './kit';

// flrnoh fork (see FORK.md): advertising pillars (Litfaßsäulen) and newspaper boxes on the strip
// beside the city's sidewalks (shared/streetside.ts puts them in some of the bins' slots). The
// pillars are pasted all round with posters: what's on in town.

/** A pillar's height (the poster drum), its radius. */
const DRUM_H = 2.6;
const R = 0.55;

interface Poster {
  title: string;
  sub: string;
  bg: string;
  ink: string;
  accent: string;
}

const POSTERS: Poster[] = [
  { title: "SWALLOW'S ROSE", sub: 'LIVE · SA 21 UHR', bg: '#1d1d1f', ink: '#f4f1de', accent: '#e63946' },
  { title: 'SIGNAL & STILLE', sub: 'LESUNG · F. OBERMEIER', bg: '#f1faee', ink: '#1d3557', accent: '#457b9d' },
  { title: 'KULTUR AM REGEN', sub: 'SOMMERFEST', bg: '#14110f', ink: '#d4a017', accent: '#d4a017' },
  { title: 'NOSFERATU', sub: 'IM KINO · 1922', bg: '#2b2d42', ink: '#edf2f4', accent: '#8d99ae' },
  { title: 'FLOHMARKT', sub: 'SONNTAG AM PLATZ', bg: '#ffd166', ink: '#073b4c', accent: '#ef476f' },
  { title: 'TECHNO', sub: 'KELLER · BIS 6 UHR', bg: '#3a0ca3', ink: '#f72585', accent: '#4cc9f0' },
  { title: 'ZIRKUS', sub: 'NUR 3 TAGE', bg: '#d62828', ink: '#fcbf49', accent: '#ffffff' },
  { title: 'BUS KOMMT GLEICH', sub: 'DAS SPIEL', bg: '#ffb703', ink: '#023047', accent: '#219ebc' },
];

/** The drum's skin: four posters side by side round it, picked by where the pillar stands. */
function drumTexture(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 384;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#e9e4d6';
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 4; k++) {
      const p = POSTERS[(seed + k * 3) % POSTERS.length];
      const x = k * (W / 4) + 8;
      const w = W / 4 - 16;
      g.fillStyle = p.bg;
      g.fillRect(x, 14, w, H - 28);
      g.fillStyle = p.accent;
      g.fillRect(x, 14, w, 16);
      g.fillRect(x + 18, H - 90, w - 36, 6);
      g.fillStyle = p.ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // The title as big as fits, over two lines if it's long.
      const words = p.title.split(' ');
      const lines = p.title.length > 11 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [p.title];
      const size = lines.length > 1 ? 40 : 46;
      g.font = `900 ${size}px system-ui, sans-serif`;
      lines.forEach((l, i) => g.fillText(l, x + w / 2, 120 + i * (size + 8), w - 20));
      g.font = '600 20px system-ui, sans-serif';
      g.fillText(p.sub, x + w / 2, H - 56, w - 20);
      // A torn corner where the poster under it shows.
      g.fillStyle = '#d8d0bc';
      g.beginPath();
      g.moveTo(x + w, H - 14);
      g.lineTo(x + w - 26, H - 14);
      g.lineTo(x + w, H - 44);
      g.fill();
    }
  });
}

/** The pillars and the newspaper boxes in `items` (the others are drawn by town/furniture.ts). */
export function buildPillars(group: THREE.Group, colliders: Collider[], items: readonly Furniture[]) {
  const parts = new THREE.Group();
  const green = toon('#2f5d50');
  const cap = toon('#3b4a45');
  const boxes = [toon('#c1121f'), toon('#1d3557'), toon('#e9c46a')];
  const slot = toon('#22252c');
  const drums = new Map<number, THREE.BufferGeometry[]>();
  const drumGeo = new THREE.CylinderGeometry(R, R, DRUM_H, 24, 1, true);
  const baseGeo = new THREE.CylinderGeometry(R + 0.08, R + 0.12, 0.35, 24);
  const capGeo = new THREE.CylinderGeometry(R + 0.16, R + 0.06, 0.18, 24);
  const domeGeo = new THREE.SphereGeometry(R + 0.02, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const finial = new THREE.ConeGeometry(0.09, 0.35, 10);
  const boxGeo = new THREE.BoxGeometry(0.5, 1.0, 0.42);
  const windowGeo = new THREE.BoxGeometry(0.38, 0.3, 0.02);
  for (const f of items) {
    const { x, z, yaw } = f;
    if (f.kind === 'pillar') {
      const seed = Math.abs(Math.round(x * 5 + z * 11));
      const key = seed % POSTERS.length;
      const g = drumGeo.clone().rotateY(yaw + seed).translate(x, G + 0.35 + DRUM_H / 2, z);
      drums.set(key, [...(drums.get(key) ?? []), g]);
      parts.add(mesh(baseGeo, green, x, G + 0.175, z, false));
      parts.add(mesh(capGeo, cap, x, G + 0.35 + DRUM_H + 0.09, z, false));
      parts.add(mesh(domeGeo, green, x, G + 0.35 + DRUM_H + 0.18, z, false));
      parts.add(mesh(finial, cap, x, G + 0.35 + DRUM_H + 0.18 + R + 0.12, z, false));
      colliders.push({ minX: x - R, maxX: x + R, minZ: z - R, maxZ: z + R, bottom: G, top: G + DRUM_H + 1 });
    } else if (f.kind === 'papers') {
      // Two or three newspaper boxes in a row, their windows to the sidewalk, and a bin.
      const n = 2 + (Math.abs(Math.round(x + z)) % 2);
      for (let k = 0; k < n; k++) {
        const lx = (k - (n - 1) / 2) * 0.6;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const bx = x + lx * c;
        const bz = z - lx * s;
        const b = mesh(boxGeo, boxes[(k + n) % boxes.length], bx, G + 0.5, bz, false);
        b.rotation.y = yaw;
        parts.add(b);
        const w = mesh(windowGeo, slot, bx + Math.sin(yaw) * 0.22, G + 0.72, bz + Math.cos(yaw) * 0.22, false);
        w.rotation.y = yaw;
        parts.add(w);
      }
      colliders.push({ minX: x - n * 0.32, maxX: x + n * 0.32, minZ: z - n * 0.32, maxZ: z + n * 0.32, bottom: G, top: G + 1 });
    }
  }
  group.add(mergeByMaterial(parts));
  // The drums keep their posters' coordinates (mergeByMaterial would drop them): one mesh per poster set.
  for (const [key, geos] of drums) {
    const tex = drumTexture(key);
    const m = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshToonMaterial({ map: tex, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    group.add(m);
    for (const g of geos) g.dispose();
  }
}

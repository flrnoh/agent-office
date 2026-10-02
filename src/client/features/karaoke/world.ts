import * as THREE from 'three';
import { ZONES } from '../../../shared/bowling';
import { CHARTS, KARAOKE_BAR, KJ_DESK, STAGE, STAGE_MID_Z, TABLES } from '../../../shared/karaoke';
import { mergeByMaterial, mesh, roundedBox, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';

// ---- The karaoke bar's room (flrnoh fork, see FORK.md "Karaoke") --------------------------------------
// Everything in front of the stage: a little bar along the mini golf room's wall with stools, a back
// bar of bottles and a pink-and-cyan KARAOKE neon over it, bistro tables with high stools and a song
// book on each, the karaoke jockey's desk, an LED dance floor before the stage, warm pendants over
// the tables, and the week's karaoke kings on the wall. In cosmic bowling the pendants go out and the
// UV trim on the tables and the bar glows.

export interface Room {
  colliders: Collider[];
  interactables: Interactable[];
  /** Each frame: `level` 0–1 how loud, `beat` (NaN without a song), `show` 0–1 how much is going on. */
  update(t: number, level: number, beat: number, show: number): void;
  cosmic(on: boolean): void;
}

const Z = ZONES.karaoke;
const WOOD = '#4a2c22';
const glow = (color: THREE.ColorRepresentation, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) => {
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.toneMapped = false;
  return m;
};

/** The neon over the bar: KARAOKE in pink tubes, a cyan mic and notes, on a dark backing. */
function neonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 300;
  const g = c.getContext('2d')!;
  const tube = (draw: () => void, color: string, width: number) => {
    g.save();
    g.strokeStyle = color;
    g.shadowColor = color;
    for (const [blur, w, a] of [
      [40, width * 2.4, 0.35],
      [18, width * 1.4, 0.7],
      [0, width, 1],
    ] as const) {
      g.shadowBlur = blur;
      g.lineWidth = w;
      g.globalAlpha = a;
      draw();
    }
    g.restore();
    // The white-hot core of the tube.
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = width * 0.35;
    draw();
    g.restore();
  };
  g.lineCap = g.lineJoin = 'round';
  g.font = 'italic 900 150px Nunito, ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  tube(() => g.strokeText('KARAOKE', 560, 150), '#ff3fa4', 7);
  // The mic, left of the word.
  tube(
    () => {
      g.beginPath();
      g.arc(110, 110, 34, 0, Math.PI * 2);
      g.moveTo(110, 146);
      g.lineTo(110, 230);
      g.moveTo(70, 112);
      g.quadraticCurveTo(70, 170, 110, 172);
      g.quadraticCurveTo(150, 170, 150, 112);
      g.stroke();
    },
    '#4cf0ff',
    6,
  );
  // Two notes, right of it.
  tube(
    () => {
      g.beginPath();
      g.ellipse(930, 210, 18, 13, -0.4, 0, Math.PI * 2);
      g.moveTo(946, 205);
      g.lineTo(946, 90);
      g.lineTo(990, 110);
      g.stroke();
    },
    '#ffe14c',
    5,
  );
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The little song book's tent card on each table. */
function tentTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 160);
  grad.addColorStop(0, '#3a0ca3');
  grad.addColorStop(1, '#f72585');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = '900 54px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('🎤', 128, 66);
  g.font = '900 34px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('SONGBUCH', 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRoom(group: THREE.Group, charts: THREE.Texture): Room {
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const still = new THREE.Group();
  const uvMats: THREE.MeshBasicMaterial[] = [];
  const uv = (color: string) => {
    const m = glow(color, { transparent: true, opacity: 0 });
    uvMats.push(m);
    return m;
  };

  // ---- The bar along the mini golf room's wall --------------------------------------------------------
  const B = KARAOKE_BAR;
  const bw = B.maxX - B.minX;
  const bcx = (B.minX + B.maxX) / 2;
  const bcz = (B.minZ + B.maxZ) / 2;
  still.add(mesh(new THREE.BoxGeometry(bw, B.top - 0.05, B.maxZ - B.minZ), toon(WOOD), bcx, (B.top - 0.05) / 2, bcz));
  still.add(mesh(roundedBox(bw + 0.16, 0.05, B.maxZ - B.minZ + 0.18, 0.04), toon('#1b1a21'), bcx, B.top - 0.025, bcz + 0.04));
  // Padded front, a brass foot rail.
  still.add(mesh(new THREE.BoxGeometry(bw, 0.62, 0.05), toon('#7a1f4f'), bcx, 0.55, B.maxZ + 0.025));
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, bw, 8), toon('#d4a640'), bcx, 0.2, B.maxZ + 0.2, false);
  rail.rotation.z = Math.PI / 2;
  still.add(rail);
  const barGlow = glow('#ff3fa4');
  group.add(mesh(new THREE.BoxGeometry(bw, 0.03, 0.02), barGlow, bcx, B.top - 0.08, B.maxZ + 0.08, false));
  group.add(mesh(new THREE.BoxGeometry(bw, 0.02, 0.02), uv('#7b2cff'), bcx, 0.04, B.maxZ + 0.06, false));
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ + 0.08, top: B.top });
  // The back bar: shelves of bottles against the wall, a mirror behind them.
  const backZ = Z.minZ + 0.22;
  still.add(mesh(new THREE.BoxGeometry(bw, 0.95, 0.4), toon('#2b1a15'), bcx, 0.475, backZ));
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: Z.minZ, maxZ: backZ + 0.2, top: 0.95 });
  const mirror = mesh(new THREE.PlaneGeometry(bw - 0.4, 1.0), new THREE.MeshPhongMaterial({ color: '#8fa3c7', shininess: 90, specular: '#ffffff' }), bcx, 1.65, Z.minZ + 0.03, false);
  group.add(mirror);
  for (const y of [1.25, 1.75]) still.add(mesh(new THREE.BoxGeometry(bw - 0.3, 0.035, 0.24), toon('#c9a64a'), bcx, y, Z.minZ + 0.14, false));
  const bottleGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8);
  const BOTTLES = 44;
  const bottles = new THREE.InstancedMesh(bottleGeo, new THREE.MeshToonMaterial({ transparent: true, opacity: 0.9 }), BOTTLES);
  const m4 = new THREE.Matrix4();
  const hues = ['#2e8b57', '#c0392b', '#e1b12c', '#8e44ad', '#16a085', '#d35400', '#ecf0f1', '#6f4e37'];
  for (let i = 0; i < BOTTLES; i++) {
    const shelf = i % 2;
    const x = B.minX + 0.35 + ((i >> 1) / (BOTTLES / 2)) * (bw - 0.7);
    m4.makeTranslation(x, (shelf ? 1.75 : 1.25) + 0.15, Z.minZ + 0.13);
    bottles.setMatrixAt(i, m4);
    bottles.setColorAt(i, new THREE.Color(hues[(i * 5) % hues.length]));
  }
  group.add(bottles);
  // On the counter: a beer tap, glasses, a shaker.
  const tap = new THREE.Group();
  tap.position.set(B.minX + 1.2, B.top, bcz - 0.1);
  tap.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 10), toon('#c9ccd4'), 0, 0.2, 0, false));
  tap.add(mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), toon('#7a1f4f'), 0, 0.46, 0.06, false));
  still.add(tap);
  for (const [x, h] of [
    [B.minX + 2.6, 0.14],
    [B.minX + 2.75, 0.14],
    [B.minX + 4.4, 0.18],
    [B.maxX - 1.1, 0.12],
  ] as const) {
    still.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, h, 10), new THREE.MeshToonMaterial({ color: '#f0c050', transparent: true, opacity: 0.75 }), x, B.top + h / 2, bcz + 0.05, false));
  }
  still.add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 10), toon('#c9ccd4'), B.maxX - 0.6, B.top + 0.11, bcz, false));
  // Stools along it.
  for (let i = 0; i < 5; i++) stool(still, B.minX + 0.7 + i * ((bw - 1.4) / 4), B.maxZ + 0.62, '#c0234e');

  // The neon over it all, on the wall.
  const neon = glow('#ffffff', { map: neonTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sign = mesh(new THREE.PlaneGeometry(4.6, 1.35), neon, bcx, 3.35, Z.minZ + 0.04, false);
  group.add(sign);
  still.add(mesh(new THREE.BoxGeometry(4.8, 1.5, 0.03), toon('#141218'), bcx, 3.35, Z.minZ + 0.015, false));
  const barLight = new THREE.PointLight('#ff6fb5', 1.6, 7, 1.4);
  barLight.position.set(bcx, 2.6, B.maxZ + 0.8);
  group.add(barLight);

  // ---- Bistro tables, each with its song book ----------------------------------------------------
  const tent = new THREE.MeshBasicMaterial({ map: tentTexture() });
  const pendants: THREE.MeshBasicMaterial[] = [];
  const shadeMat = new THREE.MeshToonMaterial({ color: '#d4a640', side: THREE.DoubleSide });
  const lamps: THREE.PointLight[] = [];
  TABLES.forEach((tb, i) => {
    still.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), toon('#1b1a21'), tb.x, 1.04, tb.z));
    still.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.02, 8), toon('#c9ccd4'), tb.x, 0.51, tb.z, false));
    still.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 20), toon('#2a2733'), tb.x, 0.015, tb.z, false));
    group.add(mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 32).rotateX(Math.PI / 2), uv(i % 2 ? '#39ff9f' : '#ff3fa4'), tb.x, 1.04, tb.z, false));
    colliders.push({ minX: tb.x - 0.42, maxX: tb.x + 0.42, minZ: tb.z - 0.42, maxZ: tb.z + 0.42, top: 1.06 });
    // Its tent card, facing the way in.
    const card = new THREE.Group();
    card.position.set(tb.x, 1.06, tb.z);
    card.rotation.y = -Math.PI / 2 + (i % 2 ? 0.4 : -0.4);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.125), tent);
      p.position.set(0, 0.055, s * 0.02);
      p.rotation.set(s * -0.32, s > 0 ? 0 : Math.PI, 0);
      card.add(p);
    }
    group.add(card);
    const it: Interactable = { kind: 'karaokebook', x: tb.x, z: tb.z, radius: 0.85 };
    card.traverse((o) => (o.userData.interact = it));
    interactables.push(it);
    // High stools round it.
    for (const a of [0.6, 2.4, 4.3]) stool(still, tb.x + Math.cos(a + i) * 0.75, tb.z + Math.sin(a + i) * 0.75, i % 2 ? '#2b6fd6' : '#c0234e');
    // A warm pendant over it.
    still.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.6, 4), toon('#111'), tb.x, 5.0, tb.z, false));
    still.add(mesh(new THREE.ConeGeometry(0.2, 0.22, 16, 1, true), shadeMat, tb.x, 3.1, tb.z, false));
    const bulb = glow('#ffd59a');
    pendants.push(bulb);
    group.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), bulb, tb.x, 3.0, tb.z, false));
    if (i % 2 === 0) {
      const l = new THREE.PointLight('#ffcf8a', 1.4, 6, 1.5);
      l.position.set(tb.x + 1.6, 2.8, tb.z);
      group.add(l);
      lamps.push(l);
    }
  });

  // ---- The karaoke jockey's desk, with the big song book -----------------------------------------
  const desk = new THREE.Group();
  desk.position.set(KJ_DESK.x, 0, KJ_DESK.z);
  desk.add(mesh(new THREE.BoxGeometry(1.3, 1.0, 0.6), toon('#1b1a21'), 0, 0.5, 0));
  desk.add(mesh(new THREE.BoxGeometry(1.36, 0.04, 0.66), toon('#2c2a34'), 0, 1.02, 0));
  desk.add(mesh(new THREE.BoxGeometry(1.3, 0.05, 0.02), glow('#4cf0ff'), 0, 0.8, -0.31, false));
  // A laptop, open, and the binder.
  desk.add(mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), toon('#c9ccd4'), 0.3, 1.05, 0.05, false));
  const lid = mesh(new THREE.BoxGeometry(0.34, 0.22, 0.012), toon('#c9ccd4'), 0.3, 1.16, 0.17, false);
  lid.rotation.x = -0.25;
  desk.add(lid);
  const book = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), toon('#7a1f4f'), -0.25, 1.07, 0, false);
  book.rotation.y = 0.3;
  desk.add(book);
  const bookIt: Interactable = { kind: 'karaokebook', x: KJ_DESK.x, z: KJ_DESK.z, radius: 1.1 };
  desk.traverse((o) => (o.userData.interact = bookIt));
  interactables.push(bookIt);
  group.add(desk);
  colliders.push({ minX: KJ_DESK.x - 0.68, maxX: KJ_DESK.x + 0.68, minZ: KJ_DESK.z - 0.33, maxZ: KJ_DESK.z + 0.33, top: 1.04 });

  // ---- The week's kings on the east wall ---------------------------------------------------------
  const frame = mesh(new THREE.BoxGeometry(0.06, CHARTS.h + 0.12, CHARTS.w + 0.12), toon('#d4a640'), CHARTS.x - 0.02, CHARTS.y, CHARTS.z);
  still.add(frame);
  const board = mesh(new THREE.PlaneGeometry(CHARTS.w, CHARTS.h), glow('#ffffff', { map: charts }), CHARTS.x - 0.055, CHARTS.y, CHARTS.z, false);
  board.rotation.y = -Math.PI / 2;
  const boardIt: Interactable = { kind: 'karaokeboard', x: CHARTS.x - 0.5, z: CHARTS.z, radius: 1.2 };
  board.userData.interact = boardIt;
  interactables.push(boardIt);
  group.add(board);

  // ---- The LED dance floor before the stage -----------------------------------------------------
  const TILE = 0.8;
  const fx0 = STAGE.minX - 0.75 - 4 * TILE;
  const fz0 = STAGE_MID_Z - 4.5 * TILE;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE - 0.04, 0.02, TILE - 0.04), glow('#ffffff'), 36);
  const tileCol = new THREE.Color();
  for (let i = 0; i < 36; i++) {
    const cx = i % 4;
    const cz = Math.floor(i / 4);
    m4.makeTranslation(fx0 + (cx + 0.5) * TILE, 0.012, fz0 + (cz + 0.5) * TILE);
    tiles.setMatrixAt(i, m4);
    tiles.setColorAt(i, tileCol.setRGB(0.1, 0.1, 0.12));
  }
  tiles.receiveShadow = true;
  group.add(tiles);
  still.add(mesh(new THREE.BoxGeometry(4 * TILE + 0.08, 0.016, 9 * TILE + 0.08), toon('#0d0c12'), fx0 + 2 * TILE, 0.006, fz0 + 4.5 * TILE, false));

  group.add(mergeByMaterial(still));

  let cosmic = false;
  let frameNo = 0;
  return {
    colliders,
    interactables,
    cosmic(on) {
      cosmic = on;
      for (const m of uvMats) m.opacity = on ? 1 : 0;
      for (const p of pendants) p.color.set(on ? '#2a1a10' : '#ffd59a');
      for (const l of lamps) l.intensity = on ? 0 : 1.4;
      barLight.color.set(on ? '#8a4cff' : '#ff6fb5');
      barLight.intensity = on ? 2.4 : 1.6;
    },
    update(t, level, beat, show) {
      frameNo++;
      const flick = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 7.3);
      neon.opacity = (cosmic ? 1 : 0.85) * flick;
      barGlow.color.setHSL((t * 0.03) % 1, 1, 0.55);
      if (frameNo % 2) return;
      // The floor: a checkerboard that steps with the beat while a song's on, a slow drift without.
      const hasBeat = Number.isFinite(beat);
      const b = hasBeat ? Math.floor(beat) : Math.floor(t * 0.8);
      const pulse = hasBeat ? Math.pow(1 - (beat - Math.floor(beat)), 2) : 0.4;
      for (let i = 0; i < 36; i++) {
        const cx = i % 4;
        const cz = Math.floor(i / 4);
        const on = (cx + cz + b) % 2 === 0;
        const hue = ((cz * 0.07 + b * 0.13 + (on ? 0 : 0.5)) % 1 + 1) % 1;
        const v = (on ? 0.25 + 0.75 * pulse : 0.12) * (0.35 + 0.65 * Math.max(show, cosmic ? 0.6 : 0.2)) * (0.6 + level * 0.6);
        tileCol.setHSL(hue, 0.9, Math.min(0.5, v * 0.5));
        tiles.setColorAt(i, tileCol);
      }
      tiles.instanceColor!.needsUpdate = true;
    },
  };
}

/** A high stool: a chrome post, a footring and a round seat. */
function stool(g: THREE.Group, x: number, z: number, seat: string) {
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 16), toon('#2a2733'), x, 0.01, z, false));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8), toon('#c9ccd4'), x, 0.37, z, false));
  g.add(mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 16).rotateX(Math.PI / 2), toon('#c9ccd4'), x, 0.3, z, false));
  g.add(mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.07, 16), toon(seat), x, 0.76, z));
}

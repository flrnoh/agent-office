import * as THREE from 'three';
import { COASTER_NAME, STATION, type CoasterLeader } from '../../../shared/coaster';
import type { NightParts } from '../outside';
import { bulb } from '../outside';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';

// flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER's station, off the roof's north edge beside the
// DJ's stage: a steel platform at deck level through a gap in the railing under an entrance arch, a
// fence with gates along the track, a canopy on posts over platform and train with the name in lit
// letters on top (both ways: to the deck and out over the city), a board over the track saying what
// the train's doing, and at the platform's west end a totem with the ride photo's monitor and the
// leaderboard. Built in the roof's frame (the deck at y 0); world/coaster/index.ts adds it to the roof.

const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';
const INK = '#2b2d42';

export interface StationView {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** The monitor's canvas: the ride photo goes on it (see coaster/photo.ts). */
  monitor: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  /** The board over the track: what the train's doing. */
  setStatus(big: string, small: string, color: string): void;
  /** The leaderboard: the most rides, and the longest hands up through one, and all the rides there have been. */
  setLeaders(leaders: CoasterLeader[], rides: number): void;
  /** How dark it is (0 by day, 1 at night): the name lights up. */
  update(t: number, dark: number): void;
}

function canvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas: c, g: c.getContext('2d')!, texture };
}

function screen(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ map: tex });
  m.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** The name in big letters for the canopy's top: yellow neon on black, the rainbow underneath. */
function nameSign(): HTMLCanvasElement {
  const { canvas: c, g } = canvas(1024, 200);
  g.fillStyle = '#16161f';
  g.fillRect(0, 0, 1024, 200);
  const colors = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#8a5cff', '#f72585'];
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((1024 / colors.length) * i, 176, 1024 / colors.length + 1, 24);
  });
  g.font = `900 132px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ffd166';
  g.shadowBlur = 24;
  g.lineWidth = 6;
  g.strokeStyle = '#ff8a5b';
  g.strokeText(COASTER_NAME, 512, 92);
  g.fillStyle = '#fff3b0';
  g.fillText(COASTER_NAME, 512, 92);
  return c;
}

export function buildStation(night: NightParts): StationView {
  const group = new THREE.Group();
  group.name = 'coaster-station';
  const statics = new THREE.Group();
  const colliders: Collider[] = [];
  const { x0, x1, wallZ, edgeZ, farZ, trackZ, gap } = STATION;
  const steel = toon('#aeb6bf');
  const deck = toon('#7d8794');
  const dark = toon(INK);
  const yellow = toon('#ffd166');
  const pink = toon('#f72585');
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;

  // The platform: a steel deck level with the roof's, a yellow edge, and the brackets under it back to the facade.
  statics.add(mesh(new THREE.BoxGeometry(L, 0.24, wallZ - edgeZ), deck, cx, -0.12, (wallZ + edgeZ) / 2));
  statics.add(mesh(new THREE.BoxGeometry(L, 0.03, 0.22), yellow, cx, 0.012, edgeZ + 0.12, false));
  for (let x = x0 + 0.3; x < x1; x += 0.6) statics.add(mesh(new THREE.BoxGeometry(0.28, 0.031, 0.2), dark, x, 0.013, edgeZ + 0.12, false));
  colliders.push({ minX: x0, maxX: x1, minZ: edgeZ, maxZ: wallZ, bottom: -0.3, top: 0 });
  // The fence along the track, gates in it at every seat, and round the platform's ends.
  for (let x = x0 + 0.2; x <= x1 - 0.1; x += 1.23) statics.add(mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), steel, x, 0.55, edgeZ + 0.05));
  statics.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 8).rotateZ(Math.PI / 2), yellow, cx, 1.08, edgeZ + 0.05));
  statics.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8).rotateZ(Math.PI / 2), steel, cx, 0.6, edgeZ + 0.05));
  for (const x of [x0 + 0.05, x1 - 0.05]) {
    statics.add(mesh(new THREE.BoxGeometry(0.06, 1.1, wallZ - edgeZ), steel, x, 0.55, (wallZ + edgeZ) / 2));
    colliders.push({ minX: x - 0.08, maxX: x + 0.08, minZ: edgeZ, maxZ: wallZ, top: 99, fence: true });
  }
  colliders.push({ minX: x0, maxX: x1, minZ: edgeZ - 0.1, maxZ: edgeZ + 0.1, top: 99, fence: true });

  // The canopy: posts beyond the track and at the platform's back, a roof over both.
  const roofY = 3.7;
  for (const x of [x0 + 0.3, cx, x1 - 0.3]) {
    for (const z of [farZ + 0.2, wallZ - 0.25]) statics.add(mesh(new THREE.BoxGeometry(0.16, roofY, 0.16), steel, x, roofY / 2, z));
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: wallZ - 0.37, maxZ: wallZ - 0.13, top: 99 });
  }
  const span = wallZ - farZ + 0.6;
  statics.add(mesh(new THREE.BoxGeometry(L + 0.8, 0.14, span), toon('#3d405b'), cx, roofY + 0.07, (wallZ + farZ) / 2));
  statics.add(mesh(new THREE.BoxGeometry(L + 0.84, 0.18, 0.08), pink, cx, roofY + 0.04, farZ - 0.1));
  statics.add(mesh(new THREE.BoxGeometry(L + 0.84, 0.18, 0.08), pink, cx, roofY + 0.04, wallZ + 0.2));
  // Lights under it, warm at night.
  const glow = bulb(night, '#fff1c9', 0.15);
  for (let x = x0 + 1.2; x < x1; x += 2.4) statics.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 0.16), glow, x, roofY - 0.03, (wallZ + edgeZ) / 2, false));
  night.lamps.push({ x: cx, y: roofY - 0.5, z: (wallZ + trackZ) / 2, reach: 9, color: '#ffe2a8', power: 3 });

  // The name on top, both ways round, lit at night.
  const nameTex = new THREE.CanvasTexture(nameSign());
  nameTex.colorSpace = THREE.SRGBColorSpace;
  nameTex.anisotropy = 8;
  const nameMat = new THREE.MeshToonMaterial({ map: nameTex, emissive: '#ffffff', emissiveMap: nameTex, emissiveIntensity: 0.25 });
  nameMat.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat: nameMat, day: 0.25 });
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.9), nameMat);
    p.position.set(cx, roofY + 1.2, (wallZ + farZ) / 2 + side * 0.06);
    if (side < 0) p.rotation.y = Math.PI;
    group.add(p);
  }
  statics.add(mesh(new THREE.BoxGeometry(9.8, 2.0, 0.1), dark, cx, roofY + 1.2, (wallZ + farZ) / 2));
  for (const x of [cx - 3.5, cx + 3.5]) statics.add(mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), steel, x, roofY + 0.2, (wallZ + farZ) / 2));

  // The entrance arch over the gap in the roof's railing.
  const archY = 2.7;
  for (const x of [gap.x0 + 0.08, gap.x1 - 0.08]) {
    statics.add(mesh(new THREE.BoxGeometry(0.18, archY, 0.18), pink, x, archY / 2, wallZ + 0.1));
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: wallZ - 0.02, maxZ: wallZ + 0.22, top: 99 });
  }
  statics.add(mesh(new THREE.BoxGeometry(gap.x1 - gap.x0 + 0.2, 0.5, 0.2), dark, (gap.x0 + gap.x1) / 2, archY + 0.1, wallZ + 0.1));
  const arch = canvas(512, 96);
  arch.g.fillStyle = '#16161f';
  arch.g.fillRect(0, 0, 512, 96);
  arch.g.font = `900 52px ${FONT}`;
  arch.g.textAlign = 'center';
  arch.g.textBaseline = 'middle';
  arch.g.fillStyle = '#ffd166';
  arch.g.fillText('🎢 DER BRECHER', 256, 50);
  arch.texture.needsUpdate = true;
  const archMat = new THREE.MeshToonMaterial({ map: arch.texture, emissive: '#ffffff', emissiveMap: arch.texture, emissiveIntensity: 0.3 });
  archMat.userData.outlineParameters = { visible: false };
  night.bulbs.push({ mat: archMat, day: 0.3 });
  const archSign = new THREE.Mesh(new THREE.PlaneGeometry(gap.x1 - gap.x0, 0.46), archMat);
  archSign.position.set((gap.x0 + gap.x1) / 2, archY + 0.1, wallZ + 0.205);
  group.add(archSign);

  // The board over the track, under the canopy: what the train's doing.
  const status = canvas(640, 160);
  const statusScreen = screen(status.texture, 3.2, 0.8);
  statusScreen.position.set(cx + 2.4, roofY - 0.62, edgeZ + 0.02);
  statusScreen.rotation.y = Math.PI;
  group.add(statusScreen);
  statics.add(mesh(new THREE.BoxGeometry(3.34, 0.94, 0.08), dark, cx + 2.4, roofY - 0.62, edgeZ + 0.08));
  for (const x of [cx + 1.0, cx + 3.8]) statics.add(mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), steel, x, roofY - 0.08, edgeZ + 0.08));

  // The totem at the platform's west end: the ride photo's monitor over the leaderboard, facing along the platform.
  const tx = x0 + 0.55;
  const tz = (wallZ + edgeZ) / 2;
  statics.add(mesh(new THREE.BoxGeometry(0.22, 2.9, 1.95), dark, tx - 0.12, 1.45, tz));
  colliders.push({ minX: tx - 0.25, maxX: tx + 0.05, minZ: tz - 1, maxZ: tz + 1, top: 99 });
  const monitor = canvas(640, 400);
  const monitorScreen = screen(monitor.texture, 1.76, 1.1);
  monitorScreen.position.set(tx + 0.005, 2.18, tz);
  monitorScreen.rotation.y = Math.PI / 2;
  group.add(monitorScreen);
  const board = canvas(512, 420);
  const boardScreen = screen(board.texture, 1.76, 1.44);
  boardScreen.position.set(tx + 0.005, 0.85, tz);
  boardScreen.rotation.y = Math.PI / 2;
  group.add(boardScreen);

  group.add(mergeByMaterial(statics));
  group.traverse((o) => (o.receiveShadow = true));

  const interactables: Interactable[] = [
    { kind: 'coaster', x: STATION.boardAt.x, z: STATION.boardAt.z, radius: 3.6 },
    { kind: 'coasterphoto', x: tx + 0.9, z: tz, radius: 1.9 },
  ];
  // What the hint finds when you look at them: the station's the train's (the monitor, the photo's).
  group.userData.interact = interactables[0];
  monitorScreen.userData.interact = interactables[1];
  boardScreen.userData.interact = interactables[1];

  const drawMonitorIdle = () => {
    const g = monitor.g;
    g.fillStyle = '#16161f';
    g.fillRect(0, 0, 640, 400);
    g.textAlign = 'center';
    g.fillStyle = '#ffd166';
    g.font = `900 46px ${FONT}`;
    g.fillText('📸 Fahrtfoto', 320, 170);
    g.fillStyle = '#c9d1d9';
    g.font = `700 26px ${FONT}`;
    g.fillText('Unten am ersten Drop blitzt es:', 320, 228);
    g.fillText('hier hängt dann dein Foto.', 320, 264);
    monitor.texture.needsUpdate = true;
  };
  drawMonitorIdle();

  let statusKey = '';
  return {
    group,
    colliders,
    interactables,
    monitor: { canvas: monitor.canvas, texture: monitor.texture },
    setStatus(big, small, color) {
      const key = `${big}|${small}|${color}`;
      if (key === statusKey) return;
      statusKey = key;
      const g = status.g;
      g.fillStyle = '#101018';
      g.fillRect(0, 0, 640, 160);
      g.fillStyle = color;
      g.fillRect(0, 0, 14, 160);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.font = `900 64px ${FONT}`;
      g.fillText(big, 40, 62, 580);
      g.fillStyle = '#c9d1d9';
      g.font = `700 30px ${FONT}`;
      g.fillText(small, 42, 124, 580);
      status.texture.needsUpdate = true;
    },
    setLeaders(leaders, rides) {
      const g = board.g;
      g.fillStyle = '#16161f';
      g.fillRect(0, 0, 512, 420);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#ffd166';
      g.font = `900 38px ${FONT}`;
      g.fillText('🏆 Bestenliste', 26, 54);
      g.fillStyle = '#8d99ae';
      g.font = `700 20px ${FONT}`;
      g.fillText(`${rides} Fahrt${rides === 1 ? '' : 'en'} bisher · Fahrten · 🙌 Hände oben`, 28, 86);
      if (!leaders.length) {
        g.fillStyle = '#c9d1d9';
        g.font = `700 26px ${FONT}`;
        g.fillText('Noch niemand gefahren.', 28, 160);
      }
      leaders.slice(0, 6).forEach((l, i) => {
        const y = 140 + i * 46;
        g.fillStyle = i === 0 ? '#ffd166' : '#ffffff';
        g.font = `800 28px ${FONT}`;
        g.fillText(`${i + 1}. ${l.name}`.slice(0, 22), 28, y, 300);
        g.textAlign = 'right';
        g.fillStyle = '#4cc9f0';
        g.fillText(String(l.rides), 380, y);
        g.fillStyle = '#06d6a0';
        g.fillText(`${l.hands.toFixed(1)} s`, 490, y);
        g.textAlign = 'left';
      });
      board.texture.needsUpdate = true;
    },
    update(_t, dark) {
      archMat.emissiveIntensity = 0.3 + dark * 1.1;
    },
  };
}

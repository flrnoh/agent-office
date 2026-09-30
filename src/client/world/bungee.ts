import * as THREE from 'three';
import { ANCHOR, BUNGEE } from '../../shared/bungee';
import { FLOOR, WALL_T } from '../../shared/layout';
import type { Collider, Interactable } from './office';
import { mergeByMaterial, mesh, toon } from './toon';

// Bungee off the roof (flrnoh fork, see FORK.md and shared/bungee.ts): a narrow wooden jetty with
// railings from the deck out over the street-side edge, a steel platform at its end with a hazard edge
// and a gate, and a gantry over it whose arm holds the rope's anchor out past the edge. A sign on the
// gantry, and a board at the jetty's start with the day's jumps. The rope itself is drawn by
// client/bungee.ts.

/** The roof's south edge: the outside of the building's wall, where the facade drops to the street. */
const FACADE = FLOOR.maxZ + WALL_T;

export interface BungeeJetty {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  /** Opens the gate at the front edge (0 shut, 1 swung right out). */
  setGate(open: number): void;
  /** The board at the jetty's start: jumps since midnight. */
  setToday(n: number): void;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): { tex: THREE.CanvasTexture; redraw: (d: (g: CanvasRenderingContext2D) => void) => void } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return {
    tex,
    redraw: (d) => {
      d(g);
      tex.needsUpdate = true;
    },
  };
}

const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

/** A flat sign `w` × `h` meters, facing +z unless turned, showing `tex`. */
function sign(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ map: tex });
  m.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function buildBungeeJetty(): BungeeJetty {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  const platform = new THREE.Group();
  const colliders: Collider[] = [];
  const { x, halfWidth: hw, startZ, edgeZ, deckY, platformZ } = BUNGEE;
  const wood = toon('#a4714a');
  const woodDark = toon('#7a5234');
  const steel = toon('#5f6b78');
  const rail = toon('#c9ced6');
  const yellow = toon('#ffd23f');
  const black = toon('#1f1f24');
  const red = toon('#e63946');

  // The boards, crosswise, on two stringers; the part over the deck sits on it, the rest is cantilevered.
  const len = platformZ - startZ;
  statics.add(mesh(new THREE.BoxGeometry(hw * 2, 0.1, len), wood, x, deckY - 0.05, startZ + len / 2));
  for (let z = startZ + 0.2; z < platformZ; z += 0.3) statics.add(mesh(new THREE.BoxGeometry(hw * 2 + 0.02, 0.012, 0.025), woodDark, x, deckY + 0.001, z, false));
  for (const sx of [-1, 1]) statics.add(mesh(new THREE.BoxGeometry(0.12, 0.22, edgeZ - startZ), steel, x + sx * (hw - 0.12), deckY - 0.21, (startZ + edgeZ) / 2));
  // Struts from the facade up under the overhang.
  for (const sx of [-1, 1]) {
    const from = new THREE.Vector3(x + sx * (hw - 0.12), -2.4, FACADE + 0.05);
    const to = new THREE.Vector3(x + sx * (hw - 0.12), deckY - 0.3, edgeZ - 0.4);
    const d = to.clone().sub(from);
    const strut = mesh(new THREE.BoxGeometry(0.1, 0.1, d.length()), steel, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    strut.lookAt(to.x, to.y, to.z);
    strut.position.copy(from.clone().add(to).multiplyScalar(0.5));
    statics.add(strut);
    statics.add(mesh(new THREE.BoxGeometry(0.3, 0.4, 0.06), steel, from.x, from.y, FACADE + 0.03));
  }

  // The platform: steel grating, and a yellow-and-black edge at the front.
  const plen = edgeZ - platformZ;
  platform.add(mesh(new THREE.BoxGeometry(hw * 2, 0.1, plen), steel, x, deckY - 0.05, platformZ + plen / 2));
  for (let z = platformZ + 0.1; z < edgeZ - 0.3; z += 0.18) platform.add(mesh(new THREE.BoxGeometry(hw * 2, 0.01, 0.03), black, x, deckY + 0.001, z, false));
  const stripes = 10;
  const sw = (hw * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    const mat = i % 2 ? black : yellow;
    const sx = x - hw + sw * (i + 0.5);
    platform.add(mesh(new THREE.BoxGeometry(sw, 0.012, 0.3), mat, sx, deckY + 0.006, edgeZ - 0.15, false));
    platform.add(mesh(new THREE.BoxGeometry(sw, 0.1, 0.012), mat, sx, deckY - 0.05, edgeZ + 0.006, false));
  }

  // Railings down both sides, the platform's included; the front's open (the gate).
  for (const sx of [-1, 1]) {
    const rx = x + sx * (hw - 0.03);
    for (const [y, r] of [
      [1.05, 0.035],
      [0.55, 0.022],
    ] as const) {
      const bar = mesh(new THREE.CylinderGeometry(r, r, edgeZ - startZ, 8), rail, rx, deckY + y, (startZ + edgeZ) / 2, false);
      bar.rotation.x = Math.PI / 2;
      statics.add(bar);
    }
    for (let z = startZ; z <= edgeZ + 0.01; z += (edgeZ - startZ) / 8) statics.add(mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), rail, rx, deckY + 0.525, z, false));
    colliders.push({ minX: rx - 0.08, maxX: rx + 0.08, minZ: startZ, maxZ: edgeZ + 0.1, top: 99 });
  }

  // The gantry: a post either side at the front, a beam across, and an arm out to the anchor.
  const gz = edgeZ - 0.2;
  const beamY = ANCHOR.y + 0.45;
  for (const sx of [-1, 1]) platform.add(mesh(new THREE.BoxGeometry(0.14, beamY + 0.1 - deckY, 0.14), black, x + sx * (hw + 0.08), (beamY + 0.1 + deckY) / 2, gz));
  platform.add(mesh(new THREE.BoxGeometry(hw * 2 + 0.44, 0.2, 0.2), yellow, x, beamY, gz));
  const armLen = ANCHOR.z - gz + 0.15;
  platform.add(mesh(new THREE.BoxGeometry(0.16, 0.16, armLen), yellow, x, beamY, gz + armLen / 2));
  const brace = mesh(new THREE.BoxGeometry(0.08, 0.08, 1.3), black, x, beamY - 0.4, gz + 0.45);
  brace.rotation.x = -0.72;
  platform.add(brace);
  // The anchor: a shackle and a pulley block under the arm's tip.
  platform.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), black, ANCHOR.x, beamY - 0.16, ANCHOR.z));
  platform.add(mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12), steel, ANCHOR.x, ANCHOR.y + 0.1, ANCHOR.z));
  // A winch on the beam.
  platform.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 14).rotateZ(Math.PI / 2), red, x - hw + 0.1, beamY + 0.22, gz));
  platform.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), black, x - hw - 0.2, beamY + 0.2, gz));

  group.add(mergeByMaterial(statics));
  const plat = mergeByMaterial(platform);
  const jumpIt: Interactable = { kind: 'bungee', x, z: BUNGEE.standZ - 0.3, y: deckY, radius: 1.4 };
  plat.userData.interact = jumpIt;
  group.add(plat);

  // The gate across the front: a red-and-white bar on a hinge, swung out for a jump.
  const gate = new THREE.Group();
  gate.position.set(x - hw + 0.02, deckY + 0.9, edgeZ - 0.02);
  const gateBar = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.03, 0.03, (hw * 2) / 6, 8), i % 2 ? toon('#ffffff') : red, ((i + 0.5) * hw * 2) / 6, 0, 0, false);
    seg.rotation.z = Math.PI / 2;
    gateBar.add(seg);
  }
  gate.add(mergeByMaterial(gateBar));
  gate.userData.interact = jumpIt;
  group.add(gate);
  colliders.push({ minX: x - hw, maxX: x + hw, minZ: edgeZ - 0.05, maxZ: edgeZ + 0.15, top: 99 });

  // The jetty's boards and the platform to stand on.
  colliders.push({ minX: x - hw, maxX: x + hw, minZ: startZ, maxZ: edgeZ, bottom: -0.3, top: deckY });

  // "BUNGEE" over the gantry's beam, both ways.
  const big = canvasTexture(512, 128, (g) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#1f1f24';
    for (let i = -1; i < 18; i++) g.fillRect(i * 32, 0, 14, 12), g.fillRect(i * 32 + 8, 116, 14, 12);
    g.font = `900 78px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🪂 BUNGEE', 256, 66);
  });
  for (const face of [-1, 1]) {
    const s = sign(big.tex, 2.0, 0.5);
    s.position.set(x, beamY + 0.5, gz + face * 0.02);
    if (face < 0) s.rotation.y = Math.PI;
    s.userData.interact = jumpIt;
    group.add(s);
  }
  group.add(mesh(new THREE.BoxGeometry(2.04, 0.54, 0.03), black, x, beamY + 0.5, gz, false));

  // The day's jumps, on a board at the jetty's start, facing the deck.
  const board = canvasTexture(256, 160, () => {});
  const drawToday = (n: number) =>
    board.redraw((g) => {
      g.fillStyle = '#1f1f24';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 0, 256, 10);
      g.fillRect(0, 150, 256, 10);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 30px ${FONT}`;
      g.fillStyle = '#ffffff';
      g.fillText('Jumps today', 128, 42);
      g.font = `900 78px ${FONT}`;
      g.fillStyle = '#ffd23f';
      g.fillText(String(n), 128, 106);
    });
  drawToday(0);
  const bx = x + hw + 0.45;
  const bz = startZ + 0.2;
  const boardMesh = sign(board.tex, 0.62, 0.39);
  boardMesh.position.set(bx, 1.45, bz - 0.03);
  boardMesh.rotation.y = Math.PI;
  group.add(boardMesh);
  group.add(mesh(new THREE.BoxGeometry(0.66, 0.43, 0.04), black, bx, 1.45, bz));
  group.add(mesh(new THREE.BoxGeometry(0.06, 1.25, 0.06), black, bx, 0.62, bz + 0.03));
  colliders.push({ minX: bx - 0.1, maxX: bx + 0.1, minZ: bz - 0.1, maxZ: bz + 0.1, top: 99 });

  let today = -1;
  return {
    group,
    colliders,
    interactables: [jumpIt],
    setGate(open) {
      gate.rotation.y = -Math.min(1, Math.max(0, open)) * 1.6;
    },
    setToday(n) {
      if (n === today) return;
      today = n;
      drawToday(n);
    },
  };
}

import * as THREE from 'three';
import { BRAND, CANOPY, COLUMNS, ISLANDS, PUMPS, PUMP_HALF, priceParts, type Fuel } from '../../../shared/tankstelle';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import { FONT, G, INK, STEEL, TEAL, TEAL_DARK, WHITE, YELLOW, block, drawLogo, liveSign, signPlane, type LiveSign } from './kit';

// flrnoh fork (see FORK.md "The petrol station"): the forecourt's canopy on its columns, with LED
// downlights under it (bright at night, a pool of light on the asphalt), the two pump islands and
// the four pumps on them: a display either side that counts litres and euros while a car fills up,
// a hose and nozzle hanging either side, a number on top.

/** One side of a pump (east or west, toward the lane a car stands in): its nozzle hanging up, and where its hose comes out. */
export interface PumpSide {
  /** +1 east, -1 west. */
  face: 1 | -1;
  /** The hose hanging in its loop and the nozzle in its holster: hidden while that side's hose is out. */
  holstered: THREE.Object3D;
  /** Where the hose leaves the pump (in the station's frame). */
  outlet: THREE.Vector3;
}

export interface PumpView {
  index: number;
  sides: PumpSide[];
  /** Shows a fill on both displays: litres so far, euros, the fuel; or idle (null). */
  show(fill: { liters: number; euros: number; fuel: Fuel } | null): void;
}

/** A hose hanging from (x, y, z) down to a nozzle holstered `face` side, in a loop. */
function hangingHose(face: 1 | -1, x: number, z: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const rubber = toon('#1d1e24');
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x + face * 0.34, G + top, z + 0.4), new THREE.Vector3(x + face * 0.5, G + 0.5, z + 0.48), new THREE.Vector3(x + face * 0.46, G + 0.42, z + 0.3), new THREE.Vector3(x + face * 0.37, G + 0.95, z + 0.36)]);
  g.add(mesh(new THREE.TubeGeometry(curve, 18, 0.028, 6), rubber, 0, 0, 0, false));
  g.add(nozzle(new THREE.Vector3(x + face * 0.38, G + 1.02, z + 0.36), face, 'holster'));
  return g;
}

/** A nozzle: the grip, the trigger guard and the spout, at `at`, pointing `face` way and down (holstered) or ahead (in use). */
export function nozzle(at: THREE.Vector3, face: number, how: 'holster' | 'filling', fuel = '#e63946'): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.2, 0.06), toon(fuel), 0, 0, 0, false));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.08, 0.1), toon(INK), 0, -0.07, 0.05, false));
  const spout = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), toon(STEEL), 0, 0.12, 0.06, false);
  spout.rotation.x = 0.6;
  g.add(spout);
  g.position.copy(at);
  g.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (how === 'holster') g.rotation.z = face * 0.2;
  return g;
}

/** A pump on its island at (x, z): its displays east and west, its number on top, hoses either side. */
function pump(group: THREE.Group, solid: THREE.Group, index: number, n: number, x: number, z: number, night: NightParts): PumpView {
  const H = PUMP_HALF;
  const white = toon(WHITE);
  const teal = toon(TEAL);
  block(solid, H.x * 2 + 0.1, 0.12, H.z * 2 + 0.1, toon('#9aa0a8'), x, z, 0.18);
  block(solid, H.x * 2, 1.1, H.z * 2, white, x, z, 0.3);
  block(solid, H.x * 2 + 0.02, 0.18, H.z * 2 + 0.02, teal, x, z, 1.25);
  block(solid, H.x * 2 - 0.04, 0.42, H.z * 2 - 0.04, toon('#2f3340'), x, z, 1.43);
  // The head: lit, with its number and the brand's yellow stripe.
  const head = bulb(night, YELLOW, 0.25);
  block(solid, H.x * 2 + 0.04, 0.1, H.z * 2 + 0.04, head, x, z, 1.85);
  const numbers = signPlane(128, 128, 0.42, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = WHITE;
    g.font = `900 96px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 70);
  });
  const sides: PumpSide[] = [];
  const displays: LiveSign[] = [];
  for (const face of [1, -1] as const) {
    const num = numbers.clone();
    num.position.set(x + face * (H.x + 0.012), G + 1.62, z);
    num.rotation.y = (face * Math.PI) / 2;
    group.add(num);
    const d = liveSign(256, 192, 0.5);
    d.mesh.position.set(x + face * (H.x + 0.012), G + 0.95, z - face * 0.14);
    d.mesh.rotation.y = (face * Math.PI) / 2;
    group.add(d.mesh);
    displays.push(d);
    const holstered = hangingHose(face, x, z, 1.15);
    group.add(holstered);
    sides.push({ face, holstered, outlet: new THREE.Vector3(x + face * (H.x + 0.02), G + 1.15, z + 0.4) });
  }
  const view: PumpView = {
    index,
    sides,
    show(fill) {
      for (const d of displays)
        d.draw((g, w, h) => {
          g.fillStyle = '#0d1a14';
          g.fillRect(0, 0, w, h);
          g.font = `700 22px ${FONT}`;
          g.fillStyle = '#7fd1a8';
          g.textAlign = 'left';
          g.textBaseline = 'middle';
          g.fillText('EURO', 12, 30);
          g.fillText('LITER', 12, 90);
          g.font = `700 20px ${FONT}`;
          g.fillText(fill ? fill.fuel.name.toUpperCase() : 'BITTE TANKEN', 12, 140);
          g.textAlign = 'right';
          g.font = `800 40px ui-monospace, Menlo, monospace`;
          g.fillStyle = fill ? '#b9ff7a' : '#4f7a5e';
          g.fillText(fill ? fill.euros.toFixed(2).replace('.', ',') : '0,00', w - 12, 32);
          g.fillText(fill ? fill.liters.toFixed(2).replace('.', ',') : '0,00', w - 12, 92);
          if (fill) {
            const p = priceParts(fill.fuel.price);
            g.font = `700 24px ui-monospace, Menlo, monospace`;
            g.fillText(`${p.main}${p.nine} €/l`, w - 12, 172);
          }
        });
    },
  };
  view.show(null);
  return view;
}

/** The canopy and what's under it; hands back the pumps. */
export function buildCanopy(group: THREE.Group, night: NightParts, glow: THREE.Texture): PumpView[] {
  const solid = new THREE.Group();
  const C = CANOPY;
  const w = C.maxX - C.minX;
  const d = C.maxZ - C.minZ;
  const cx = (C.minX + C.maxX) / 2;
  const cz = (C.minZ + C.maxZ) / 2;
  // The deck: white underneath, a teal fascia all round with the brand's yellow band, lit a little.
  block(solid, w, C.deck, d, toon(WHITE), cx, cz, C.under);
  const band = bulb(night, YELLOW, 0.2);
  for (const [bw, bd, bx, bz] of [
    [w + 0.06, 0.06, cx, C.minZ],
    [w + 0.06, 0.06, cx, C.maxZ],
    [0.06, d + 0.06, C.minX, cz],
    [0.06, d + 0.06, C.maxX, cz],
  ]) {
    block(solid, bw, C.deck * 0.7, bd, toon(TEAL), bx, bz, C.under + C.deck * 0.15);
    block(solid, bw + 0.02, 0.14, bd + 0.02, band, bx, bz, C.under + C.deck * 0.55);
  }
  // The brand on the fascia, toward the street and toward the shop.
  for (const [z, rot] of [
    [C.maxZ + 0.05, 0],
    [C.minZ - 0.05, Math.PI],
  ]) {
    const s = signPlane(1024, 160, 8.5, (g) => {
      g.fillStyle = TEAL;
      g.fillRect(0, 0, 1024, 160);
      drawLogo(g, 90, 80, 56);
      g.fillStyle = WHITE;
      g.font = `900 104px ${FONT}`;
      g.textBaseline = 'middle';
      g.fillText(BRAND, 170, 86);
    });
    s.position.set(cx, G + C.under + C.deck * 0.5, z);
    s.rotation.y = rot;
    group.add(s);
  }
  // Its columns, clad in teal, on the islands' ends.
  for (const c of COLUMNS) {
    block(solid, 0.5, C.under, 0.5, toon(TEAL_DARK), c.x, c.z, 0);
    block(solid, 0.54, 0.3, 0.54, toon(STEEL), c.x, c.z, 0.18);
  }
  // The islands: a curb, a top of concrete, a bollard at each end.
  for (const r of ISLANDS) {
    block(solid, r.maxX - r.minX, 0.18, r.maxZ - r.minZ, toon('#c9c5bb'), (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0);
    for (const z of [r.minZ + 0.1, r.maxZ - 0.1]) {
      block(solid, 0.18, 0.95, 0.18, toon(YELLOW), (r.minX + r.maxX) / 2, z, 0.18);
      block(solid, 0.2, 0.12, 0.2, toon(INK), (r.minX + r.maxX) / 2, z, 0.85);
    }
  }
  // LED downlights in rows under the deck: glowing panels, a halo each at night, and a pool of light on the ground.
  const led = bulb(night, '#fffdf2', 0.35);
  const lights = new THREE.Group();
  for (let x = C.minX + 2.2; x < C.maxX - 1; x += 3.6) {
    for (let z = C.minZ + 2; z < C.maxZ - 1; z += 3.6) {
      lights.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), led, x, G + C.under - 0.02, z, false));
      night.halos.push({ at: new THREE.Vector3(x, G + C.under - 0.15, z), size: 2.2, color: '#fff7dc', ground: true });
    }
  }
  group.add(mergeByMaterial(lights));
  const pool = new THREE.MeshBasicMaterial({ map: glow, color: '#fff4cf', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
  pool.userData.outlineParameters = { visible: false };
  const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(w + 8, d + 8), pool);
  poolMesh.rotation.x = -Math.PI / 2;
  poolMesh.position.set(cx, G + 0.02, cz);
  poolMesh.raycast = () => {};
  group.add(poolMesh);
  night.glows.push({ mat: pool, max: 0.55 });

  const pumps = PUMPS.map((p, i) => pump(group, solid, i, p.n, p.x, p.z, night));
  group.add(mergeByMaterial(solid));
  return pumps;
}

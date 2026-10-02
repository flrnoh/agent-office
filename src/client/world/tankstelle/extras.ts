import * as THREE from 'three';
import { AIR, BINS, BRAND, FUELS, PLANTER, PYLON, VACUUM, priceParts } from '../../../shared/tankstelle';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon } from '../toon';
import { FONT, G, INK, STEEL, TEAL, TEAL_DARK, WHITE, YELLOW, block, drawLogo, signPlane } from './kit';

// flrnoh fork (see FORK.md "The petrol station"): round about the forecourt: the price pylon by the
// street (the brand on top, today's prices lit underneath), the air and water post, the vacuum
// station, and the bins.

/** The pylon's face: the brand, the four prices, the shop and the wash. */
function pylonFace(): THREE.Mesh {
  return signPlane(256, 736, PYLON.w - 0.2, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 256, 736);
    g.fillStyle = WHITE;
    g.fillRect(0, 0, 256, 170);
    drawLogo(g, 128, 66, 48);
    g.fillStyle = TEAL_DARK;
    g.font = `900 40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(BRAND, 128, 143);
    FUELS.forEach((f, i) => {
      const y = 200 + i * 110;
      g.fillStyle = '#0d1418';
      g.fillRect(12, y, 232, 96);
      g.fillStyle = f.id === 'diesel' ? '#ffd23f' : '#f1f1f1';
      g.font = `800 22px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(f.name.toUpperCase(), 22, y + 18);
      const p = priceParts(f.price);
      g.fillStyle = '#ffd23f';
      g.font = `800 58px ui-monospace, Menlo, monospace`;
      g.fillText(p.main, 30, y + 62);
      g.font = `800 30px ui-monospace, Menlo, monospace`;
      g.fillText(p.nine, 190, y + 50);
    });
    g.fillStyle = YELLOW;
    g.fillRect(0, 648, 256, 88);
    g.fillStyle = INK;
    g.font = `900 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('SHOP 24h', 128, 672);
    g.font = `800 24px ${FONT}`;
    g.fillText('🧽 WASCHSTRASSE', 128, 710);
  });
}

export function buildExtras(group: THREE.Group, night: NightParts) {
  const solid = new THREE.Group();
  // ---- The pylon, its faces east and west along the street, on a planter ----------------------------
  block(solid, PLANTER.maxX - PLANTER.minX - 0.2, 0.25, PLANTER.maxZ - PLANTER.minZ - 0.2, toon('#7cb867'), (PLANTER.minX + PLANTER.maxX) / 2, (PLANTER.minZ + PLANTER.maxZ) / 2, 0, false);
  block(solid, 0.5, PYLON.h, PYLON.w, toon(TEAL_DARK), PYLON.x, PYLON.z, 0);
  block(solid, 0.56, 0.18, PYLON.w + 0.06, toon(YELLOW), PYLON.x, PYLON.z, PYLON.h);
  for (const face of [1, -1]) {
    const s = pylonFace();
    s.position.set(PYLON.x + face * 0.26, G + PYLON.h - (PYLON.w - 0.2) * (736 / 256) / 2 - 0.15, PYLON.z);
    s.rotation.y = (face * Math.PI) / 2;
    group.add(s);
  }
  for (const [x, z] of [
    [-94.2, 17],
    [-91.8, 19.2],
  ])
    group.add(mesh(new THREE.SphereGeometry(0.55, 8, 6), toon('#4ea657'), x, G + 0.6, z));

  // ---- Air and water --------------------------------------------------------------------------------
  block(solid, 0.5, 1.4, 0.5, toon('#e63946'), AIR.x, AIR.z, 0);
  block(solid, 0.56, 0.12, 0.56, toon(INK), AIR.x, AIR.z, 1.4);
  const gauge = signPlane(128, 128, 0.36, (g) => {
    g.fillStyle = '#10151c';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#7cf5ff';
    g.font = `800 40px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.fillText('2,4', 64, 62);
    g.font = `700 22px ${FONT}`;
    g.fillText('bar · LUFT', 64, 100);
  });
  gauge.position.set(AIR.x - 0.26, G + 1.05, AIR.z);
  gauge.rotation.y = -Math.PI / 2;
  group.add(gauge);
  // A coiled hose on its hook, and a tap with a watering can for the screen wash.
  const coil = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18), toon('#1d1e24'), AIR.x - 0.28, G + 0.65, AIR.z, false);
  coil.rotation.y = Math.PI / 2;
  group.add(coil);
  block(solid, 0.2, 0.25, 0.2, toon('#2f6fd6'), AIR.x - 0.1, AIR.z + 0.55, 0);
  block(solid, 0.08, 0.5, 0.08, toon(STEEL), AIR.x, AIR.z + 0.55, 0.25);

  // ---- The vacuum: a post with two booms, hoses hanging down to the bays ------------------------------
  block(solid, 0.7, 2.4, 0.7, toon(YELLOW), VACUUM.x, VACUUM.z, 0);
  block(solid, 0.76, 0.2, 0.76, toon(TEAL), VACUUM.x, VACUUM.z, 2.4);
  const hoseMat = toon('#2b2d42');
  for (const side of [-1, 1]) {
    block(solid, 2.6, 0.14, 0.14, toon(STEEL), VACUUM.x + side * 1.3, VACUUM.z, 2.25);
    const end = new THREE.Vector3(VACUUM.x + side * 2.5, G + 2.2, VACUUM.z);
    const curve = new THREE.CatmullRomCurve3([end, new THREE.Vector3(end.x + side * 0.1, G + 1.2, end.z + 0.4), new THREE.Vector3(end.x, G + 0.5, end.z + 0.9), new THREE.Vector3(end.x - side * 0.1, G + 0.9, end.z + 1.2)]);
    group.add(mesh(new THREE.TubeGeometry(curve, 16, 0.05, 6), hoseMat, 0, 0, 0, false));
  }
  const vac = signPlane(256, 96, 0.68, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = WHITE;
    g.font = `900 52px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SAUGER', 128, 52);
  });
  vac.position.set(VACUUM.x, G + 1.8, VACUUM.z + 0.36);
  group.add(vac);

  // ---- The bins ---------------------------------------------------------------------------------------
  for (const b of BINS) {
    solid.add(mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 12), toon('#6c757d'), b.x, G + 0.425, b.z));
    solid.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12), toon(TEAL), b.x, G + 0.9, b.z));
  }
  // A lamp over the air post and the vacuum, for the night.
  const lamp = bulb(night, '#fff3d6', 0.1);
  for (const [x, z] of [
    [AIR.x, AIR.z - 1],
    [VACUUM.x, VACUUM.z + 0.2],
  ]) {
    block(solid, 0.1, 4, 0.1, toon(INK), x + 0.6, z, 0);
    block(solid, 0.5, 0.12, 0.3, lamp, x + 0.6, z, 4);
    night.halos.push({ at: new THREE.Vector3(x + 0.6, G + 3.95, z), size: 2.4, color: '#ffe6b0', ground: true });
  }
  group.add(mergeByMaterial(solid));
}

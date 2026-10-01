import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { SOCCER_BOX, SOCCER_DOOR, SOCCER_HEIGHT, SOCCER_STREET_SPOT, TEAM_COLOR, type Team } from '../../../shared/soccer';
import type { Collider, Interactable } from '../office';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture, glow, FONT } from '../casino/parts';

/*
 * The soccer hall's outside (flrnoh fork, see FORK.md "The soccer hall"), on the street between the
 * golf hole and the padel hall: a long, dark green sports hall with a band of milky polycarbonate
 * glazing under the eaves that glows at night, white SOCCER ARENA letters and a ball over a steel
 * canopy (a light strip along its edge, downlights under it), the club's red and blue banners down the
 * front, uplights washing the facade at night, a match poster by the glass doors that slide apart, and a
 * little practice goal on the lawn out front. E at the doors takes you inside (client/soccer/place.ts).
 * Built into the street, so it drops with it per floor. (The SCENIC LOOP billboard stands on its roof:
 * world/scenic.ts.)
 */

const G = STREET_Y;
const B = SOCCER_BOX;
const H = SOCCER_HEIGHT;
const W = B.maxX - B.minX;
const D = B.maxZ - B.minZ;
const CX = (B.minX + B.maxX) / 2;
const CZ = (B.minZ + B.maxZ) / 2;
const DX = SOCCER_DOOR.x;
/** The front face (north, toward the street). */
const FRONT = B.minZ;
/** The glazing band's bottom and top above the street. */
const GLAZE = [5.2, 7.6] as const;
/** SOCCER ARENA on the front: west of the doors and their canopy, under the glazing. */
const SIGN = { x: B.minX + 5.6, y: 4.2, w: 10 } as const;

/** A door that slides open as someone comes up (office.ts's Door). */
export interface SoccerDoor {
  x: number;
  y: number;
  z: number;
  open: number;
  show(open: number): void;
}

export interface SoccerExterior {
  door: SoccerDoor;
  interactable: Interactable;
  /** Your floor's street is `y` down (see streetBelow): the doors and their hint go with it. */
  setStreet(y: number): void;
}

/** Dark green trapezoid sheeting: vertical ribs. */
function sheetingTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#2f5d4a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(i * 16, 0, 5, 128);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(i * 16 + 5, 0, 2, 128);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Milky polycarbonate panels, the hall's light behind them. */
function glazingTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, '#f4f7ee');
    grd.addColorStop(1, '#cfe3d6');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = 'rgba(60,80,70,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 2, 64);
    g.fillRect(0, 0, 128, 2);
    g.fillRect(0, 62, 128, 2);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** SOCCER ARENA in white letters with a ball, on a transparent ground (for the front, and the roof from above). */
export function soccerSign(w = 1024, h = 256, bg: string | null = null): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    const r = h * 0.36;
    const bx = h * 0.5;
    const by = h * 0.5;
    // The ball: white, a black pentagon in the middle and bits of more round the edge.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1d1d1d';
    const pent = (cx: number, cy: number, s: number, rot: number) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = rot + (i * Math.PI * 2) / 5;
        g[i ? 'lineTo' : 'moveTo'](cx + Math.sin(a) * s, cy - Math.cos(a) * s);
      }
      g.closePath();
      g.fill();
    };
    pent(bx, by, r * 0.34, 0);
    g.save();
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.clip();
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 + Math.PI / 5;
      pent(bx + Math.sin(a) * r * 0.9, by - Math.cos(a) * r * 0.9, r * 0.3, a);
    }
    g.restore();
    g.strokeStyle = '#1d1d1d';
    g.lineWidth = h * 0.02;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.stroke();
    // The words.
    let px = h * 0.5;
    const text = 'SOCCER ARENA';
    g.font = `900 ${px}px ${FONT}`;
    while (g.measureText(text).width > w - h * 1.15 && px > 10) g.font = `900 ${(px -= 4)}px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.shadowColor = 'rgba(180,255,210,0.9)';
    g.shadowBlur = h * 0.08;
    g.fillStyle = '#ffffff';
    g.fillText(text, h * 1.02, h * 0.54);
  });
}

export function buildSoccerExterior(group: THREE.Group, colliders: Collider[], interactables: Interactable[], night: NightParts): SoccerExterior {
  const root = new THREE.Group();
  const parts = new THREE.Group();
  const sheet = sheetingTexture();
  const sheetMat = new THREE.MeshToonMaterial({ map: sheet, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  const plinth = toon('#6b7078');
  const steel = toon('#c9ced6');
  const dark = toon('#23272e');
  const white = toon('#f4f4f0');

  // The hall: sheeting on the long walls and the ends, a concrete plinth, a white fascia and a flat roof.
  const body = mesh(box(W, H, D), sheetMat, CX, G + H / 2, CZ);
  // Ribs every half meter along whichever way the face runs.
  sheet.repeat.set(W / 2, H / 4);
  root.add(body);
  parts.add(mesh(box(W + 0.2, 0.9, D + 0.2), plinth, CX, G + 0.45, CZ));
  parts.add(mesh(box(W + 0.5, 0.5, D + 0.5), white, CX, G + H + 0.05, CZ));
  parts.add(mesh(box(W - 0.4, 0.1, D - 0.4), toon('#8a9097'), CX, G + H + 0.32, CZ, false));

  // The glazing band under the eaves, all round: lit from inside, brighter at night.
  const glazeTex = glazingTexture();
  const glazeMat = toonUnique('#e8f2e4');
  glazeMat.map = glazeTex;
  glazeMat.emissive.set('#fff6d8');
  glazeMat.emissiveMap = glazeTex;
  night.bulbs.push({ mat: glazeMat, day: 0.18 });
  const gh = GLAZE[1] - GLAZE[0];
  const gy = G + (GLAZE[0] + GLAZE[1]) / 2;
  const faces: [number, number, number, number, number][] = [
    // [x, z, length, rotY, repeat]
    [CX, FRONT - 0.02, W - 1, Math.PI, W / 3],
    [CX, B.maxZ + 0.02, W - 1, 0, W / 3],
    [B.minX - 0.02, CZ, D - 1, -Math.PI / 2, D / 3],
    [B.maxX + 0.02, CZ, D - 1, Math.PI / 2, D / 3],
  ];
  for (const [x, z, len, rot, rep] of faces) {
    const tex = glazeTex.clone();
    tex.repeat.set(rep, 1);
    tex.needsUpdate = true;
    const m = glazeMat.clone();
    m.map = tex;
    m.emissiveMap = tex;
    night.bulbs.push({ mat: m, day: 0.18 });
    const p = mesh(new THREE.PlaneGeometry(len, gh), m, x, gy, z, false);
    p.rotation.y = rot;
    root.add(p);
  }
  // Steel columns down the long walls, between the sheeting.
  for (let z = B.minZ + 3; z < B.maxZ - 1; z += 6) {
    for (const x of [B.minX - 0.08, B.maxX + 0.08]) parts.add(mesh(box(0.25, H, 0.35), steel, x, G + H / 2, z));
  }

  // The front: SOCCER ARENA beside the canopy, lit at night.
  const sign = mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.w / 4), glow(soccerSign(), '#ffffff', { transparent: true }), SIGN.x, G + SIGN.y, FRONT - 0.05, false);
  sign.rotation.y = Math.PI;
  root.add(sign);

  // The doors: a steel frame, glass leaves sliding apart, the pitch's green glow behind.
  const dw = SOCCER_DOOR.width;
  const dh = SOCCER_DOOR.height;
  parts.add(mesh(box(dw + 0.5, 0.3, 0.3), dark, DX, G + dh + 0.15, FRONT - 0.1));
  for (const s of [-1, 1]) parts.add(mesh(box(0.25, dh, 0.3), dark, DX + s * (dw / 2 + 0.12), G + dh / 2, FRONT - 0.1));
  const glimpse = canvasTexture(128, 160, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 160);
    grd.addColorStop(0, '#fdfbe9');
    grd.addColorStop(0.5, '#c9d9c4');
    grd.addColorStop(0.62, '#3f9b4c');
    grd.addColorStop(1, '#2c7a3a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 118, 128, 3);
    g.fillRect(30, 72, 68, 4);
    g.fillRect(30, 72, 4, 30);
    g.fillRect(94, 72, 4, 30);
  });
  const inside = mesh(new THREE.PlaneGeometry(dw, dh), glow(glimpse), DX, G + dh / 2, FRONT - 0.03, false);
  inside.rotation.y = Math.PI;
  root.add(inside);
  const glass = new THREE.MeshToonMaterial({ color: '#2a3a36', transparent: true, opacity: 0.55 });
  const leaves = [-1, 1].map((s) => {
    const leaf = new THREE.Group();
    leaf.add(mesh(box(dw / 2 - 0.04, dh - 0.05, 0.05), glass, 0, 0, 0, false));
    leaf.add(mesh(box(0.05, 0.9, 0.08), steel, -s * (dw / 4 - 0.12), 0, -0.05, false));
    leaf.position.set(DX + (s * dw) / 4, G + dh / 2, FRONT - 0.12);
    root.add(leaf);
    return { leaf, s };
  });
  // The canopy over the doors on two steel posts, a light under it.
  const cw = dw + 3.2;
  const cz0 = FRONT - 2.6;
  parts.add(mesh(box(cw, 0.2, FRONT - cz0), dark, DX, G + dh + 0.6, (FRONT + cz0) / 2));
  // A light strip along its edge, downlights under it.
  const strip = bulb(night, '#35c46a', 0.45);
  root.add(mesh(box(cw + 0.1, 0.12, 0.12), strip, DX, G + dh + 0.55, cz0, false));
  const down = bulb(night, '#fff3d6', 0.2);
  for (const s of [-1, 0, 1]) {
    const d = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12), down, DX + s * 1.6, G + dh + 0.49, (FRONT + cz0) / 2, false);
    root.add(d);
  }
  for (const s of [-1, 1]) {
    const px = DX + s * (cw / 2 - 0.2);
    parts.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, dh + 0.6, 10), steel, px, G + (dh + 0.6) / 2, cz0 + 0.2));
    colliders.push({ minX: px - 0.12, maxX: px + 0.12, minZ: cz0 + 0.08, maxZ: cz0 + 0.32, bottom: G, top: G + dh + 0.6 });
  }
  night.halos.push({ at: new THREE.Vector3(DX, G + dh + 0.4, cz0 + 1), size: 2.2, color: '#fff3d6', ground: true });
  // Paving from the sidewalk to the doors.
  const pave = mesh(new THREE.PlaneGeometry(cw, FRONT - (SOCCER_STREET_SPOT.z - 1.6)), toon('#c9c3b5'), DX, G + 0.012, (FRONT + SOCCER_STREET_SPOT.z - 1.6) / 2, false);
  pave.rotation.x = -Math.PI / 2;
  pave.receiveShadow = true;
  root.add(pave);

  // A little practice goal on the lawn west of the doors, a ball in front of it.
  {
    const gx = B.minX + 4;
    const gz = FRONT - 1.4;
    for (const s of [-1, 1]) parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), white, gx + s * 0.9, G + 0.6, gz));
    const bar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), white, gx, G + 1.2, gz);
    bar.rotation.z = Math.PI / 2;
    parts.add(bar);
    const net = mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }), gx, G + 0.6, gz + 0.5, false);
    root.add(net);
    colliders.push({ minX: gx - 1, maxX: gx + 1, minZ: gz - 0.1, maxZ: gz + 0.55, bottom: G, top: G + 1.25 });
    parts.add(mesh(new THREE.SphereGeometry(0.12, 14, 10), white, gx + 0.4, G + 0.12, gz - 1.3));
  }

  // The club's banners down the front corners and the long walls by them: red to the west, blue to the east.
  {
    const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
    const banner = (team: Team) =>
      new THREE.MeshToonMaterial({
        gradientMap,
        map: canvasTexture(96, 384, (g) => {
          g.fillStyle = TEAM_COLOR[team];
          g.fillRect(0, 0, 96, 384);
          g.fillStyle = '#ffffff';
          g.fillRect(0, 22, 96, 8);
          g.fillRect(0, 354, 96, 8);
          g.beginPath();
          g.arc(48, 80, 26, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = TEAM_COLOR[team];
          g.beginPath();
          g.arc(48, 80, 10, 0, Math.PI * 2);
          g.fill();
          g.save();
          g.translate(48, 230);
          g.rotate(Math.PI / 2);
          g.fillStyle = '#ffffff';
          g.font = `900 40px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('FLOGGE FC', 0, 0);
          g.restore();
        }),
      });
    const hang = (mat: THREE.Material, x: number, z: number, rotY: number) => {
      const b = mesh(new THREE.PlaneGeometry(0.95, 3.8), mat, x, G + 3.1, z, false);
      b.rotation.y = rotY;
      root.add(b);
      parts.add(mesh(box(rotY === Math.PI ? 1.1 : 0.08, 0.08, rotY === Math.PI ? 0.08 : 1.1), dark, x, G + 5.05, z));
    };
    const red = banner('red');
    const blue = banner('blue');
    // (The sign fills the front west of the doors: red hangs round the corner.)
    hang(blue, B.maxX - 0.9, FRONT - 0.04, Math.PI);
    hang(red, B.minX - 0.04, FRONT + 1.2, -Math.PI / 2);
    hang(red, B.minX - 0.04, FRONT + 3.4, -Math.PI / 2);
    hang(blue, B.maxX + 0.04, FRONT + 1.2, Math.PI / 2);
  }
  // Uplights washing the facade under the sign at night.
  {
    const lens = bulb(night, '#fff1cf', 0.05);
    for (const x of [SIGN.x - 3.6, SIGN.x, SIGN.x + 3.6]) {
      parts.add(mesh(box(0.34, 0.16, 0.26), dark, x, G + 0.08, FRONT - 0.35));
      root.add(mesh(box(0.26, 0.02, 0.18), lens, x, G + 0.17, FRONT - 0.35, false));
      night.halos.push({ at: new THREE.Vector3(x, G + 0.4, FRONT - 0.3), size: 1.2, color: '#fff1cf', ground: true });
      const wash = new THREE.MeshBasicMaterial({
        map: canvasTexture(32, 128, (g) => {
          const grd = g.createLinearGradient(0, 128, 0, 0);
          grd.addColorStop(0, 'rgba(255,241,207,0.9)');
          grd.addColorStop(1, 'rgba(255,241,207,0)');
          g.fillStyle = grd;
          g.fillRect(0, 0, 32, 128);
        }),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      wash.userData.outlineParameters = { visible: false };
      night.glows.push({ mat: wash, max: 0.55 });
      const w = mesh(new THREE.PlaneGeometry(2.4, 4.6), wash, x, G + 2.4, FRONT - 0.03, false);
      w.rotation.y = Math.PI;
      root.add(w);
    }
  }
  // A match poster by the doors.
  {
    const poster = mesh(new THREE.PlaneGeometry(1.0, 1.4), glow(canvasTexture(200, 280, (g) => {
      g.fillStyle = '#1d3b2c';
      g.fillRect(0, 0, 200, 280);
      g.fillStyle = TEAM_COLOR.red;
      g.fillRect(0, 0, 100, 12);
      g.fillStyle = TEAM_COLOR.blue;
      g.fillRect(100, 0, 100, 12);
      g.fillStyle = '#ffd166';
      g.font = `900 30px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('HEUTE', 100, 58);
      g.fillStyle = '#ffffff';
      g.font = `900 40px ${FONT}`;
      g.fillText('5 gegen 5', 100, 108);
      g.font = `800 22px ${FONT}`;
      g.fillText('ROT  vs  BLAU', 100, 150);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(100, 205, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1d1d1d';
      g.beginPath();
      g.arc(100, 205, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b8f2c9';
      g.font = `800 18px ${FONT}`;
      g.fillText('FLOGGE FC · ARENA', 100, 262);
    })), DX - dw / 2 - 1.0, G + 1.5, FRONT - 0.04, false);
    poster.rotation.y = Math.PI;
    root.add(poster);
    parts.add(mesh(box(1.12, 1.52, 0.05), dark, DX - dw / 2 - 1.0, G + 1.5, FRONT - 0.01));
  }

  root.add(mergeByMaterial(parts));
  group.add(root);

  // In the way: the whole building (you go in by the doors, with E), coarse like the neighbours'.
  colliders.push({ minX: B.minX, maxX: B.maxX, minZ: B.minZ - 0.2, maxZ: B.maxZ, bottom: G, top: G + H + 0.5 });

  const interactable: Interactable = { kind: 'soccer', x: DX, z: FRONT - 1.1, y: G, radius: 2.4 };
  interactables.push(interactable);
  inside.userData.interact = interactable;
  sign.userData.interact = interactable;
  for (const { leaf } of leaves) leaf.userData.interact = interactable;

  const door: SoccerDoor = {
    x: DX,
    y: G,
    z: FRONT - 0.2,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const { leaf, s } of leaves) leaf.position.x = DX + (s * dw) / 4 + s * e * (dw / 2 - 0.1);
    },
  };

  return {
    door,
    interactable,
    setStreet(y) {
      door.y = y;
      interactable.y = y;
    },
  };
}

// ---- Seen from the roof (world/city.ts) ------------------------------------------------------------

/** Whether a lot of the roof's city (centered at x, z, w × d) would stand where the soccer hall does. */
export function onSoccerLot(x: number, z: number, w: number, d: number): boolean {
  return x + w / 2 > B.minX - 2 && x - w / 2 < B.maxX + 2 && z + d / 2 > B.minZ - 2 && z - d / 2 < B.maxZ + 2;
}

/** The soccer hall as the roof sees it, far below: its green block and the sign, on the city's street (y 0). */
export function citySoccer(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(W, H, D), toon('#2f5d4a'), CX, H / 2, CZ));
  g.add(mesh(box(W + 0.5, 0.5, D + 0.5), toon('#f4f4f0'), CX, H + 0.05, CZ));
  const sign = mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.w / 4), glow(soccerSign(), '#ffffff', { transparent: true }), SIGN.x, SIGN.y, FRONT - 0.2, false);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // A pitch painted on the roof, to be seen from above.
  const top = mesh(new THREE.PlaneGeometry(W - 3, D - 4), glow(canvasTexture(128, 256, (c) => {
    c.fillStyle = '#3f9b4c';
    c.fillRect(0, 0, 128, 256);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.strokeRect(6, 6, 116, 244);
    c.beginPath();
    c.moveTo(6, 128);
    c.lineTo(122, 128);
    c.stroke();
    c.beginPath();
    c.arc(64, 128, 20, 0, Math.PI * 2);
    c.stroke();
  })), CX, H + 0.32, CZ, false);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  return g;
}

import * as THREE from 'three';
import { ARCADES, COSMIC_SWITCH, JUKE_LIGHT, LOUNGE_TABLE, SOFAS, SOFA_DEPTH, sofaSeats, type Sofa } from '../../../shared/bowling-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, FONT, glow, neonSign } from '../casino/parts';
import type { HouseLighting } from './lighting';
import { RETRO, drawStar } from './signs';

/*
 * The bowling centre's lounge (flrnoh fork, see FORK.md "The bowling centre"), in ZONES.lounge: a
 * booth of teal vinyl sofas round a kidney table, one more sofa on the far side of the way to the mini
 * golf, two arcade cabinets playing their attract mode and a jukebox-style light against the mini golf
 * room's wall, an atomic floor lamp, plants, and the cosmic bowling switch: a big lever on a striped
 * pedestal under a COSMIC BOWLING sign. E on a sofa sits you down, E at the lever flips the lights
 * (client/bowling).
 */

export interface BowlingLounge {
  /** Each sofa seat's interactable, by its key. */
  seats: Map<string, Interactable>;
  lever: Interactable;
  /** Throws the lever (1 down: cosmic) over a moment. */
  throwLever(down: boolean): void;
  update(t: number, dt: number): void;
}

const PICK = new THREE.MeshBasicMaterial({ visible: false });

/** A sofa facing +z, `len` long, its seat's front at z +depth/2. */
function sofaModel(len: number, parts: THREE.Group) {
  const vinyl = toon(RETRO.teal);
  const piping = toon('#f4ead4');
  const chrome = toon('#d5dbe2');
  const d = SOFA_DEPTH;
  parts.add(mesh(box(len, 0.22, d - 0.1), vinyl, 0, 0.32, 0.05));
  parts.add(mesh(box(len, 0.56, 0.22), vinyl, 0, 0.66, -d / 2 + 0.11));
  // Tufted: rolls along the back, and piping along the seat's front.
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.8) parts.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 10), vinyl, x, 0.68, -d / 2 + 0.2));
  parts.add(mesh(box(len + 0.02, 0.04, 0.04), piping, 0, 0.43, d / 2 - 0.05, false));
  for (const s of [-1, 1]) {
    parts.add(mesh(box(0.14, 0.42, d - 0.05), vinyl, s * (len / 2 - 0.07), 0.5, 0.02));
    for (const z of [-d / 2 + 0.12, d / 2 - 0.12]) parts.add(mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.22, 8), chrome, s * (len / 2 - 0.12), 0.11, z));
  }
}

/** An arcade cabinet's attract mode: a little made-up space shooter (or pin game), redrawn now and then. */
function attract(g: CanvasRenderingContext2D, t: number, kind: number) {
  g.fillStyle = '#05030f';
  g.fillRect(0, 0, 128, 160);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = i % 4 ? '#6c6ca8' : '#ffffff';
    g.fillRect((i * 41) % 128, ((i * 67 + t * (20 + (i % 3) * 15)) % 160), 2, 2);
  }
  g.textAlign = 'center';
  g.font = `900 14px ${FONT}`;
  if (kind === 0) {
    g.fillStyle = '#ffe14d';
    g.fillText('STAR BLASTER', 64, 20);
    // Invaders marching, a ship firing.
    const off = Math.sin(t * 1.5) * 16;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++) {
        g.fillStyle = ['#ff3fb4', '#4cf2ff', '#7dff5c'][r];
        g.fillRect(24 + c * 18 + off, 34 + r * 14, 10, 7);
      }
    const sx = 64 + Math.sin(t * 2.3) * 40;
    g.fillStyle = '#4cf2ff';
    g.fillRect(sx - 7, 136, 14, 6);
    g.fillRect(sx - 2, 131, 4, 5);
    g.fillStyle = '#ffffff';
    g.fillRect(sx - 1, 120 - ((t * 120) % 80), 2, 6);
  } else {
    g.fillStyle = '#ff3fb4';
    g.fillText('PIN PANIC', 64, 20);
    // A ball rolling at ten pins, again and again.
    const k = (t * 0.6) % 1;
    for (let i = 0; i < 10; i++) {
      const row = i < 1 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3;
      const col = i - [0, 1, 3, 6][row];
      const x = 64 + (col - row / 2) * 14;
      const y = 40 + row * 12;
      g.fillStyle = k > 0.7 && (i * 7) % 3 !== 0 ? '#5a5a7a' : '#ffffff';
      g.fillRect(x - 2, y - (k > 0.7 ? (i % 3) * 3 : 0), 4, 9);
    }
    g.fillStyle = '#9d5cff';
    g.beginPath();
    g.arc(64 + Math.sin(k * 6) * 6, 150 - k * 100, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = Math.floor(t * 2) % 2 ? '#ffffff' : '#ff5a6e';
  g.font = `800 11px ${FONT}`;
  g.fillText('INSERT COIN', 64, 156);
}

export function buildLounge(group: THREE.Group, colliders: Collider[], interactables: Interactable[], lighting: HouseLighting): BowlingLounge {
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const chrome = toon('#d5dbe2');
  const dark = toon('#1e1b33');

  // ---- The sofas, and their seats ----------------------------------------------------------------------
  const place = (s: Sofa) => {
    const g = new THREE.Group();
    sofaModel(s.len, g);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    parts.add(g);
    const across = Math.abs(Math.sin(s.rotY)) > 0.5;
    const hx = across ? SOFA_DEPTH / 2 : s.len / 2;
    const hz = across ? s.len / 2 : SOFA_DEPTH / 2;
    colliders.push({ minX: s.x - hx, maxX: s.x + hx, minZ: s.z - hz, maxZ: s.z + hz, bottom: 0, top: 0.45, fence: true });
  };
  SOFAS.forEach(place);
  const seats = new Map<string, Interactable>();
  for (const s of sofaSeats()) {
    const it: Interactable = { kind: 'bowlingseat', x: s.x, z: s.z, radius: 0.7, seatId: s.key };
    seats.set(s.key, it);
    interactables.push(it);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), PICK);
    m.position.set(s.x, 0.45, s.z);
    m.userData.interact = it;
    group.add(m);
  }

  // ---- The kidney table: formica on hairpin legs, a bowl of popcorn, two glasses ------------------------
  {
    const t = LOUNGE_TABLE;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, t.r, t.r * 0.62, 0, Math.PI * 2, false, 0);
    const top = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2), toon('#f3e9d2'), t.x, 0.42, t.z);
    top.rotation.y = 0.5;
    parts.add(top);
    for (const [dx, dz] of [
      [-0.35, -0.15],
      [0.35, 0.15],
      [0.05, -0.3],
    ])
      parts.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), toon('#1d1d1d'), t.x + dx, 0.21, t.z + dz));
    parts.add(mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(RETRO.cherry), t.x - 0.1, 0.6, t.z, false));
    for (let i = 0; i < 9; i++) parts.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), toon('#fff3c4'), t.x - 0.1 + Math.cos(i * 2.4) * 0.07, 0.6, t.z + Math.sin(i * 2.4) * 0.07, false));
    const glassMat = new THREE.MeshToonMaterial({ color: '#f2b134', transparent: true, opacity: 0.8, gradientMap });
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.15, 10), glassMat, t.x + 0.25, 0.54, t.z - 0.1, false));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.15, 10), glassMat, t.x + 0.15, 0.54, t.z + 0.18, false));
    colliders.push({ minX: t.x - t.r * 0.8, maxX: t.x + t.r * 0.8, minZ: t.z - t.r * 0.7, maxZ: t.z + t.r * 0.7, bottom: 0, top: 0.46, fence: true });
  }

  // ---- Two arcade cabinets, their screens running ----------------------------------------------------
  const screens: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; kind: number }[] = [];
  ARCADES.forEach((a, i) => {
    const body = toon(i ? '#3a0ca3' : '#c1121f');
    parts.add(mesh(box(0.72, 1.8, 0.7), body, a.x, 0.9, a.z));
    parts.add(mesh(box(0.74, 0.1, 0.36), dark, a.x, 1.02, a.z + 0.3));
    // The control panel, sloping, with a stick and buttons.
    const panel = mesh(box(0.7, 0.05, 0.3), dark, a.x, 1.07, a.z + 0.42);
    panel.rotation.x = 0.35;
    parts.add(panel);
    parts.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), toon('#1d1d1d'), a.x - 0.15, 1.16, a.z + 0.4, false));
    parts.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(RETRO.cherry), a.x - 0.15, 1.23, a.z + 0.4, false));
    for (const [k, c] of ['#ffe14d', '#4cf2ff', '#7dff5c'].entries()) parts.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), toon(c), a.x + 0.03 + k * 0.09, 1.13, a.z + 0.44, false));
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 160;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    attract(g, 0, i);
    screens.push({ tex, g, kind: i });
    const scr = mesh(new THREE.PlaneGeometry(0.5, 0.62), glow(tex), a.x, 1.45, a.z + 0.355, false);
    scr.rotation.x = -0.12;
    group.add(scr);
    const marquee = mesh(new THREE.PlaneGeometry(0.66, 0.2), glow(neonSign(i ? 'PIN PANIC' : 'STAR BLASTER', i ? '#ff3fb4' : '#ffe14d', 512, 154, '#10081f')), a.x, 1.92, a.z + 0.36, false);
    group.add(marquee);
    parts.add(mesh(box(0.74, 0.26, 0.5), body, a.x, 1.92, a.z + 0.1));
    colliders.push({ minX: a.x - 0.38, maxX: a.x + 0.38, minZ: a.z - 0.38, maxZ: a.z + 0.5, bottom: 0, top: 2 });
  });

  // ---- The jukebox light: an arch of bubble tubes that run through the colours -------------------------
  const tubes: THREE.MeshBasicMaterial[] = [];
  {
    const j = JUKE_LIGHT;
    parts.add(mesh(box(0.86, 1.1, 0.5), toon('#6b3a1f'), j.x, 0.55, j.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.5, 24, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateY(0), toon('#6b3a1f'), j.x, 1.1, j.z));
    // The arch of light, and a grille.
    const arch = new THREE.TorusGeometry(0.36, 0.045, 8, 24, Math.PI);
    const left = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), glow(null, '#ff8a3d'), j.x - 0.36, 0.65, j.z + 0.26, false);
    const right = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), glow(null, '#ff3fb4'), j.x + 0.36, 0.65, j.z + 0.26, false);
    const top = mesh(arch, glow(null, '#ffe14d'), j.x, 1.1, j.z + 0.26, false);
    for (const m of [left, right, top]) {
      tubes.push(m.material as THREE.MeshBasicMaterial);
      group.add(m);
    }
    parts.add(mesh(box(0.5, 0.36, 0.02), toon('#d5c7a1'), j.x, 0.55, j.z + 0.26, false));
    for (let i = 0; i < 6; i++) parts.add(mesh(box(0.46, 0.012, 0.02), chrome, j.x, 0.42 + i * 0.05, j.z + 0.27, false));
    colliders.push({ minX: j.x - 0.45, maxX: j.x + 0.45, minZ: j.z - 0.28, maxZ: j.z + 0.3, bottom: 0, top: 1.5 });
  }

  // ---- An atomic floor lamp by the east sofa, plants in the corners -----------------------------------
  {
    const lx = 3.55;
    const lz = 8.7;
    for (let i = 0; i < 3; i++) {
      const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 5), toon('#1d1d1d'), lx + Math.cos(i * 2.1) * 0.12, 0.78, lz + Math.sin(i * 2.1) * 0.12);
      leg.rotation.set(Math.sin(i * 2.1) * 0.12, 0, -Math.cos(i * 2.1) * 0.12);
      parts.add(leg);
    }
    const shade = glow(null, '#ffd9a0');
    lighting.tint(shade.color, '#ffd9a0', '#5a3a6a');
    group.add(mesh(new THREE.ConeGeometry(0.26, 0.34, 16, 1, true), shade, lx, 1.68, lz, false));
    colliders.push({ minX: lx - 0.2, maxX: lx + 0.2, minZ: lz - 0.2, maxZ: lz + 0.2, bottom: 0, top: 1.8 });
    for (const [px, pz] of [
      [-4.6, 9.6],
      [-0.95, 9.65],
    ]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 12), toon('#f4ead4'), px, 0.21, pz));
      for (let k = 0; k < 7; k++) {
        const leaf = mesh(new THREE.ConeGeometry(0.05, 0.9 + (k % 3) * 0.2, 4), toon(k % 2 ? '#2d6a4f' : '#52b788'), px + Math.cos(k * 0.9) * 0.06, 0.85, pz + Math.sin(k * 0.9) * 0.06);
        leaf.rotation.set(Math.sin(k * 1.7) * 0.25, 0, Math.cos(k * 1.7) * 0.25);
        parts.add(leaf);
      }
      colliders.push({ minX: px - 0.24, maxX: px + 0.24, minZ: pz - 0.24, maxZ: pz + 0.24, bottom: 0, top: 1.3 });
    }
  }

  // ---- The cosmic bowling switch -----------------------------------------------------------------------
  const sw = COSMIC_SWITCH;
  const hazard = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#ffd60a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1d1d1d';
    for (let i = -64; i < 128; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 11, 0);
      g.lineTo(i + 11 - 64, 64);
      g.lineTo(i - 64, 64);
      g.fill();
    }
  });
  hazard.wrapS = hazard.wrapT = THREE.RepeatWrapping;
  const pedestal = new THREE.MeshToonMaterial({ map: hazard, gradientMap, emissive: new THREE.Color('#ffd60a'), emissiveMap: hazard });
  lighting.level((v) => (pedestal.emissiveIntensity = v), 0, 0.9);
  group.add(mesh(box(0.7, 1.0, 0.56), pedestal, sw.x, 0.5, sw.z));
  parts.add(mesh(box(0.76, 0.06, 0.62), toon('#2b2d42'), sw.x, 1.03, sw.z));
  // The lever: a chrome arm in a slotted box, a red knob; up is normal, down cosmic.
  parts.add(mesh(box(0.14, 0.12, 0.42), toon('#2b2d42'), sw.x + 0.16, 1.11, sw.z));
  const lever = new THREE.Group();
  lever.position.set(sw.x + 0.16, 1.12, sw.z);
  lever.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), chrome, 0, 0.25, 0, false));
  lever.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), toon(RETRO.cherry), 0, 0.52, 0, false));
  lever.rotation.x = -0.7;
  group.add(lever);
  // A big dome button beside it that lights up when it's cosmic.
  const dome = new THREE.MeshToonMaterial({ color: '#9d5cff', gradientMap, emissive: new THREE.Color('#c77dff') });
  lighting.level((v) => (dome.emissiveIntensity = v), 0.05, 1.6);
  group.add(mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome, sw.x - 0.17, 1.06, sw.z));
  // Labels: AUS up, COSMIC down, on the side toward the way.
  const label = mesh(new THREE.PlaneGeometry(0.4, 0.2), glow(canvasTexture(128, 64, (g) => {
    g.fillStyle = '#1d1d1d';
    g.fillRect(0, 0, 128, 64);
    g.font = `900 20px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.fillText('▲ LICHT', 64, 26);
    g.fillStyle = '#c77dff';
    g.fillText('▼ COSMIC', 64, 54);
  })), sw.x, 0.82, sw.z + 0.285, false);
  group.add(label);
  // The sign on a post over it.
  parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), chrome, sw.x + 0.3, 1.15 + 1.15, sw.z - 0.22));
  const sign = mesh(new THREE.PlaneGeometry(1.5, 0.5), glow(neonSign('COSMIC BOWLING', '#c77dff', 768, 256, '#12081f')), sw.x, 2.65, sw.z - 0.2, false);
  group.add(sign);
  const starT = canvasTexture(64, 64, (g) => drawStar(g, 32, 32, 30, 8, '#ffffff', 0.25));
  const sparkle = mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: starT, color: '#e0aaff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), sw.x + 0.75, 2.92, sw.z - 0.19, false);
  group.add(sparkle);
  colliders.push({ minX: sw.x - 0.36, maxX: sw.x + 0.36, minZ: sw.z - 0.3, maxZ: sw.z + 0.3, bottom: 0, top: 1.2 });
  const leverIt: Interactable = { kind: 'bowlingswitch', x: sw.x, z: sw.z + 0.6, radius: 1.8 };
  interactables.push(leverIt);
  for (const o of [lever, label, sign]) o.userData.interact = leverIt;
  const pk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.7), PICK);
  pk.position.set(sw.x, 0.8, sw.z);
  pk.userData.interact = leverIt;
  group.add(pk);

  group.add(mergeByMaterial(parts));

  let leverWant = -0.7;
  let clock = 0;
  const hue = new THREE.Color();
  return {
    seats,
    lever: leverIt,
    throwLever(down) {
      leverWant = down ? 0.7 : -0.7;
    },
    update(t, dt) {
      lever.rotation.x += (leverWant - lever.rotation.x) * Math.min(1, dt * 14);
      sparkle.rotation.z = t * 0.8;
      sparkle.scale.setScalar(0.8 + Math.sin(t * 3) * 0.2);
      tubes.forEach((m, i) => m.color.copy(hue.setHSL((t * 0.08 + i * 0.22) % 1, 0.95, 0.6)));
      clock += dt;
      if (clock > 0.12) {
        clock = 0;
        for (const s of screens) {
          attract(s.g, t, s.kind);
          s.tex.needsUpdate = true;
        }
      }
    },
  };
}

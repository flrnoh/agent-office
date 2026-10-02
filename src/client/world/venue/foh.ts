import * as THREE from 'three';
import { ZONES } from '../../../shared/venue';
import { FOH_RAIL, LIGHT_DESK, MIX_DESK, SCENE_NAMES } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture } from '../casino/parts';
import { BOLD } from './signs';
import type { Look } from './lighting';
import { pickBox } from './pick';

/*
 * Front of house (flrnoh fork, see FORK.md "The Schallwerk"), mid-hall in ZONES.foh: a low platform
 * with a steel rail round three sides, the sound desk (faders, a screen of level meters jumping with
 * the music) and the light desk (its screen showing the scene and the mode, its faders riding the
 * show), a gooseneck lamp each, a rack of outboard gear with blinking LEDs. E at the light desk opens
 * the Lichtpult, E at the sound desk the announcements (client/venue).
 */

export interface VenueFoh {
  update(look: Look, t: number): void;
}

export function buildFoh(group: THREE.Group, colliders: Collider[], interactables: Interactable[]): VenueFoh {
  const parts = new THREE.Group();
  const Z = ZONES.foh;
  const black = toon('#141317');
  const steel = toon('#2b2d33');
  // The platform, two steps up.
  parts.add(mesh(box(Z.maxX - Z.minX, 0.08, Z.maxZ - Z.minZ - 0.2), toon('#232227'), (Z.minX + Z.maxX) / 2, 0.04, (Z.minZ + Z.maxZ) / 2 + 0.1, false));
  // The rail round three sides, a black skirt under it with FOH stencilled.
  for (const r of FOH_RAIL) {
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    parts.add(mesh(box(w, 0.06, d), steel, cx, r.top, cz));
    parts.add(mesh(box(w, 0.6, d * 0.6), black, cx, 0.3, cz));
    const along = w > d;
    const len = along ? w : d;
    for (let u = -len / 2 + 0.1; u <= len / 2 - 0.05; u += 1) parts.add(mesh(box(0.05, r.top, 0.05), steel, along ? cx + u : cx, r.top / 2, along ? cz : cz + u));
    colliders.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, bottom: 0, top: r.top, fence: true });
  }
  const stencil = mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture(256, 64, (g) => {
    g.fillStyle = 'rgba(230,224,210,0.8)';
    g.font = `48px ${BOLD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('F · O · H', 128, 34);
  }) }), (Z.minX + Z.maxX) / 2, 0.35, Z.maxZ + 0.01, false);
  (stencil.material as THREE.Material).userData.outlineParameters = { visible: false };
  group.add(stencil);

  // ---- The desks ------------------------------------------------------------------------------------
  const deskAt = (D: typeof MIX_DESK) => {
    const cx = (D.minX + D.maxX) / 2;
    const cz = (D.minZ + D.maxZ) / 2;
    const w = D.maxX - D.minX;
    parts.add(mesh(box(w, D.top - 0.1, D.maxZ - D.minZ), black, cx, (D.top - 0.1) / 2, cz));
    // The sloping surface, its faders.
    const top = mesh(box(w, 0.06, D.maxZ - D.minZ + 0.1), toon('#2e3036'), cx, D.top, cz);
    top.rotation.x = -0.16;
    parts.add(top);
    colliders.push({ minX: D.minX, maxX: D.maxX, minZ: D.minZ, maxZ: D.maxZ, bottom: 0, top: D.top });
    return { cx, cz, w };
  };
  const mix = deskAt(MIX_DESK);
  const light = deskAt(LIGHT_DESK);
  const faderKnob = toon('#e8e8e8');
  const faders: { m: THREE.Mesh; base: THREE.Vector3; k: number; desk: 'mix' | 'light' }[] = [];
  const faderRow = (d: { cx: number; cz: number; w: number }, n: number, kind: 'mix' | 'light', z0: number) => {
    for (let i = 0; i < n; i++) {
      const x = d.cx - d.w / 2 + 0.12 + (i * (d.w - 0.24)) / (n - 1);
      parts.add(mesh(box(0.012, 0.005, 0.2), toon('#090909'), x, MIX_DESK.top + 0.035, z0, false));
      const m = mesh(box(0.035, 0.03, 0.025), faderKnob, x, MIX_DESK.top + 0.05, z0, false);
      group.add(m);
      faders.push({ m, base: m.position.clone(), k: i, desk: kind });
    }
  };
  faderRow(mix, 16, 'mix', MIX_DESK.minZ + 0.25);
  faderRow(light, 10, 'light', LIGHT_DESK.minZ + 0.25);
  // Knobs on the mix desk.
  for (let i = 0; i < 16; i++) for (let r = 0; r < 3; r++) parts.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), toon(['#c4121f', '#ffd166', '#2ee6ff'][r]), mix.cx - mix.w / 2 + 0.12 + (i * (mix.w - 0.24)) / 15, MIX_DESK.top + 0.06, MIX_DESK.minZ + 0.45 + r * 0.08, false));
  // The screens: the meters on the sound desk's, the scene on the light desk's.
  const screen = (d: { cx: number; cz: number }, w: number) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t });
    m.toneMapped = false;
    m.userData.outlineParameters = { visible: false };
    const s = mesh(new THREE.PlaneGeometry(w, w / 2), m, d.cx, MIX_DESK.top + 0.32, MIX_DESK.minZ + 0.06, false);
    s.rotation.x = -0.25;
    group.add(s);
    parts.add(mesh(box(w + 0.05, w / 2 + 0.05, 0.03), black, d.cx, MIX_DESK.top + 0.32, MIX_DESK.minZ + 0.03));
    return { g: c.getContext('2d')!, t };
  };
  const mixScreen = screen(mix, 0.6);
  const lightScreen = screen(light, 0.55);
  // Gooseneck lamps, and the outboard rack between the desks with its LEDs.
  for (const d of [mix, light]) {
    const neck = mesh(new THREE.TorusGeometry(0.18, 0.01, 4, 10, Math.PI / 2), steel, d.cx + d.w / 2 - 0.15, MIX_DESK.top + 0.2, MIX_DESK.minZ + 0.12);
    neck.rotation.y = Math.PI / 2;
    parts.add(neck);
    parts.add(mesh(new THREE.CircleGeometry(0.03, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe7b0' }), d.cx + d.w / 2 - 0.15, MIX_DESK.top + 0.36, MIX_DESK.minZ + 0.3, false));
  }
  parts.add(mesh(box(0.36, 0.95, 0.5), black, (MIX_DESK.maxX + LIGHT_DESK.minX) / 2, 0.475, Z.minZ + 1.0));
  const ledMat = new THREE.MeshBasicMaterial({ color: '#36ff7a' });
  ledMat.userData.outlineParameters = { visible: false };
  const leds = new THREE.Group();
  for (let i = 0; i < 12; i++) leds.add(mesh(new THREE.SphereGeometry(0.008, 4, 3), ledMat, (MIX_DESK.maxX + LIGHT_DESK.minX) / 2 - 0.12 + (i % 4) * 0.08, 0.3 + Math.floor(i / 4) * 0.25, Z.minZ + 1.0 - 0.255, false));
  group.add(mergeByMaterial(leds));
  colliders.push({ minX: MIX_DESK.maxX, maxX: LIGHT_DESK.minX, minZ: Z.minZ + 0.75, maxZ: Z.minZ + 1.25, bottom: 0, top: 0.95 });

  group.add(mergeByMaterial(parts));

  const lightIt: Interactable = { kind: 'venuelight', x: light.cx, z: LIGHT_DESK.minZ - 0.5, radius: 1.5 };
  const mixIt: Interactable = { kind: 'venuemix', x: mix.cx, z: MIX_DESK.minZ - 0.5, radius: 1.5 };
  interactables.push(lightIt, mixIt);
  pickBox(group, lightIt, LIGHT_DESK, 0, LIGHT_DESK.top + 0.55);
  pickBox(group, mixIt, MIX_DESK, 0, MIX_DESK.top + 0.55);

  let drawn = 0;
  const meters = new Array(16).fill(0);
  return {
    update(look, t) {
      for (const f of faders) {
        const k = f.desk === 'light' ? (f.k < 3 ? [look.house, look.stageLevel, look.beamLevel][f.k] : 0.4 + 0.4 * Math.sin(t * 0.3 + f.k)) : 0.5 + 0.25 * Math.sin(f.k * 1.7) + (look.level * 0.2 * ((f.k * 13) % 5)) / 5;
        f.m.position.z = f.base.z + 0.08 - Math.min(1, Math.max(0, k)) * 0.16;
      }
      ledMat.color.setHSL(0.35, 1, 0.35 + 0.25 * (Math.sin(t * 9) > 0 ? 1 : 0));
      if (t - drawn < 1 / 15) return;
      drawn = t;
      // The sound desk's meters.
      const g = mixScreen.g;
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 16; i++) {
        const want = Math.min(1, look.level * (0.6 + ((i * 7) % 5) * 0.12) + 0.04 * Math.sin(t * 13 + i));
        meters[i] = Math.max(want, meters[i] - 0.05);
        const h = meters[i] * 100;
        const grd = g.createLinearGradient(0, 118, 0, 18);
        grd.addColorStop(0, '#2bd96b');
        grd.addColorStop(0.7, '#ffd166');
        grd.addColorStop(1, '#ff3b3b');
        g.fillStyle = grd;
        g.fillRect(8 + i * 15, 118 - h, 10, h);
      }
      g.fillStyle = '#9aa0a8';
      g.font = '12px monospace';
      g.fillText('MAIN L/R', 8, 12);
      mixScreen.t.needsUpdate = true;
      // The light desk's screen: the mode, the scene, the beat.
      const l = lightScreen.g;
      l.fillStyle = '#0a0812';
      l.fillRect(0, 0, 256, 128);
      l.fillStyle = look.mode === 'club' ? '#c77dff' : '#ffb347';
      l.font = `30px ${BOLD}`;
      l.fillText(look.mode === 'club' ? 'CLUB' : 'KONZERT', 12, 38);
      l.fillStyle = '#e6e6ee';
      l.font = '18px sans-serif';
      l.fillText(SCENE_NAMES[look.scene].replace(/^\S+\s/, ''), 12, 70);
      l.fillStyle = `#${look.beam.getHexString()}`;
      l.fillRect(12, 86, 230 * Math.max(0.05, look.beat), 10);
      l.fillStyle = `#${look.stage.getHexString()}`;
      l.fillRect(12, 104, 230 * look.stageLevel, 10);
      lightScreen.t.needsUpdate = true;
    },
  };
}

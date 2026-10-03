import * as THREE from 'three';
import { DOORS, GANG_CEILING, GYM_DOOR, NORTH_BAND_Z, THERME_NAME, TWALL, WELLENBAD, ZONES, type TDoor } from '../../../shared/therme';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { blk, flat, glow, plane, sign, stripes, tex, tiles, wrap, type ThermeParts } from './kit';

/*
 * The thermal baths' way in and its signs (flrnoh fork, see shared/therme.ts): the tiled passage from
 * the gym's basement with the glass door back (E there goes back to the gym), the name over its mouth
 * into the hall, the zones' doors that are shut for now (a hoarding with what's coming behind it),
 * and stand signs where each part will be built, the wave pool's outline painted on the floor.
 */

const G = ZONES.gang;
const INNER = TWALL / 2;
const WARM = '#3b2412';
const AMBER = '#ffcf8a';

/** The passage: tiles on its floor, walls and ceiling, light strips, the glass door back to the gym. Returns the door's interactable. */
function passage(p: ThermeParts): Interactable {
  const len = NORTH_BAND_Z;
  const wide = G.maxX - G.minX - TWALL;
  const tl = tiles('#d8cbb6', '#b5a68e', 4, 0.06, 103);
  flat(p, { minX: G.minX + INNER, maxX: G.maxX - INNER, minZ: 0, maxZ: len }, tex(wrap(tl.clone(), wide / 1, len / 1)), 0.008);
  for (const [x, rot] of [
    [G.minX + INNER + 0.003, Math.PI / 2],
    [G.maxX - INNER - 0.003, -Math.PI / 2],
  ] as const)
    plane(p, len, GANG_CEILING, tex(wrap(tl.clone(), len, GANG_CEILING)), x, GANG_CEILING / 2, len / 2, rot);
  flat(p, { minX: G.minX + INNER, maxX: G.maxX - INNER, minZ: 0, maxZ: len }, tex(wrap(tiles('#f1ece2', '#d6cdbd', 4, 0.03, 107), wide / 2, len / 2)), GANG_CEILING - 0.003, true);
  // Two light strips down the ceiling, and a warm glow from the hall at the far end.
  const strip = new THREE.MeshBasicMaterial({ color: '#fff3dc' });
  strip.toneMapped = false;
  for (const x of [G.minX + 2.6, G.maxX - 2.6]) p.group.add(mesh(new THREE.BoxGeometry(0.18, 0.04, len - 2), strip, x, GANG_CEILING - 0.03, len / 2, false));

  // The glass door back, in the north wall, in its dark frame, with the way back over it.
  const z = GYM_DOOR.z + 0.01;
  const glass = mesh(new THREE.PlaneGeometry(GYM_DOOR.width, GYM_DOOR.height), toon('#9fd8e6', { transparent: true, opacity: 0.55 }), GYM_DOOR.x, GYM_DOOR.height / 2, z, false);
  glass.userData.noOutline = true;
  p.group.add(glass);
  // The middle stile and the push bars: what the crosshair lands on first, so they're the door too (not merged).
  const stile = mesh(new THREE.BoxGeometry(0.06, GYM_DOOR.height, 0.08), toon('#2a2f35'), GYM_DOOR.x, GYM_DOOR.height / 2, z + 0.04, false);
  const bars = [-1, 1].map((s) => mesh(new THREE.BoxGeometry(0.04, 0.9, 0.06), toon('#c9ccd0'), GYM_DOOR.x + s * 0.18, 1.05, z + 0.1, false));
  p.group.add(stile, ...bars);
  for (const s of [-1, 1]) blk(p, 0.12, GYM_DOOR.height + 0.12, 0.14, '#2a2f35', GYM_DOOR.x + (s * GYM_DOOR.width) / 2, GYM_DOOR.height / 2, z + 0.05);
  blk(p, GYM_DOOR.width + 0.24, 0.12, 0.14, '#2a2f35', GYM_DOOR.x, GYM_DOOR.height + 0.06, z + 0.05);
  plane(p, 2.4, 0.3, glow(sign('← GYM', 'Schwimmhalle · Fitness', '#0f3050', '#bfeaff', 512, 64)), GYM_DOOR.x, GANG_CEILING - 0.22, z + 0.02, 0);
  const it: Interactable = { kind: 'therme', x: GYM_DOOR.x, z: GYM_DOOR.z + 0.4, y: 0, radius: 3 };
  p.interactables.push(it);
  for (const m of [glass, stile, ...bars]) m.userData.interact = it;

  // The name, hanging in the passage near its mouth (facing you as you come in) and over the mouth on the hall's side.
  plane(p, 6.6, 1.0, glow(sign(THERME_NAME.toUpperCase(), 'Thermalbad · Rutschen · Saunadorf', WARM, AMBER, 1024, 160)), (G.minX + G.maxX) / 2, GANG_CEILING - 0.6, len - 1.2, Math.PI);
  for (const s of [-1, 1]) blk(p, 0.03, 0.08, 0.03, '#2a2f35', (G.minX + G.maxX) / 2 + s * 3, GANG_CEILING - 0.06, len - 1.2);
  plane(p, 14, 2.1, glow(sign(THERME_NAME.toUpperCase(), 'Willkommen im Thermalbad', WARM, AMBER, 1024, 154)), (G.minX + G.maxX) / 2, GANG_CEILING + 2.2, NORTH_BAND_Z + INNER + 0.02, 0);
  return it;
}

/** Where a door's opening is, which way it faces, and its middle. */
function doorAt(d: TDoor) {
  const c = d.at + (d.shift ?? 0);
  const mid = (d.from + d.to) / 2;
  return d.axis === 'x' ? { x: mid, z: c, rotY: 0, w: d.to - d.from } : { x: c, z: mid, rotY: Math.PI / 2, w: d.to - d.from };
}

/** A shut door: a timber hoarding filling its opening, what's coming on both sides, tape across. */
function hoarding(p: ThermeParts, d: TDoor) {
  const o = doorAt(d);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(o.w, d.height, 0.12), toon('#c9a66b'), 0, d.height / 2, 0, false));
  for (let x = -o.w / 2 + 1.2; x < o.w / 2; x += 2.4) g.add(mesh(new THREE.BoxGeometry(0.03, d.height, 0.14), toon('#a8844c'), x, d.height / 2, 0, false));
  g.position.set(o.x, 0, o.z);
  g.rotation.y = o.rotY;
  p.still.add(g);
  const [big, small] = (d.shut ?? '').split(' · ').length > 1 ? [d.shut!.split(' · ').slice(0, -1).join(' · ').toUpperCase(), d.shut!.split(' · ').at(-1)!] : [d.shut ?? '', ''];
  const face = glow(sign(big, `${small} · Hier entsteht die ${THERME_NAME}`, '#f4ead8', '#5a3b1c', 1024, 200));
  const sw = Math.min(o.w - 0.4, 6);
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.PlaneGeometry(sw, sw * 0.2), face, 0, 1.7, s * 0.075, false);
    m.rotation.y = s > 0 ? 0 : Math.PI;
    const h = new THREE.Group();
    h.add(m);
    const tape = mesh(new THREE.BoxGeometry(o.w - 0.2, 0.08, 0.02), tex(stripes()), 0, 0.9, s * 0.09, false);
    h.add(tape);
    h.position.set(o.x, 0, o.z);
    h.rotation.y = o.rotY;
    p.group.add(h);
  }
}

/** A sign on two posts, facing `rotY`. */
function standSign(p: ThermeParts, big: string, small: string, x: number, z: number, rotY: number) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), toon('#2a2f35'), s * 1.9, 1.6, 0, false));
  const face = glow(sign(big, small, WARM, AMBER, 1024, 256));
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.PlaneGeometry(4.2, 1.05), face, 0, 2.6, s * 0.03, false);
    m.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(m);
  }
  g.add(mesh(new THREE.BoxGeometry(4.3, 1.12, 0.05), toon('#2a2f35'), 0, 2.6, 0, false));
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  p.group.add(g);
}

/** The wave pool's outline, painted on the floor in dashes (a building plot, for now). */
function plot(p: ThermeParts) {
  const W = WELLENBAD;
  const paint = toon('#e0a526');
  const dash = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s + 1.2 <= len; s += 2) {
      const t = (s + 0.6) / len;
      const m = mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) > 0 ? 1.2 : 0.18, 0.01, Math.abs(z1 - z0) > 0 ? 1.2 : 0.18), paint, x0 + (x1 - x0) * t, 0.012, z0 + (z1 - z0) * t, false);
      p.still.add(m);
    }
  };
  dash(W.minX, W.minZ, W.maxX, W.minZ);
  dash(W.minX, W.maxZ, W.maxX, W.maxZ);
  dash(W.minX, W.minZ, W.minX, W.maxZ);
  dash(W.maxX, W.minZ, W.maxX, W.maxZ);
}

export function buildWayIn(p: ThermeParts): { exit: Interactable } {
  const exit = passage(p);
  for (const d of DOORS) if (d.shut) hoarding(p, d);
  const rut = ZONES.rutschen;
  standSign(p, 'WELLENBAD', 'Wellen alle 20 Minuten · demnächst', (WELLENBAD.minX + WELLENBAD.maxX) / 2, WELLENBAD.minZ - 4, Math.PI);
  standSign(p, 'RUTSCHENWELT', 'Rutschenturm · 30 m · acht Rutschen · demnächst', (rut.minX + rut.maxX) / 2, 40, -Math.PI / 2);
  plot(p);
  return { exit };
}

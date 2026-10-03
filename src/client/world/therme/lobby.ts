import * as THREE from 'three';
import { THERME_NAME, ZONES, STREET_DOOR } from '../../../shared/therme';
import { CASHIER, GATES, INFO_BOARD, KASSE, LOCKERS, TURNSTILE_Z } from '../../../shared/therme-street';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { Person } from '../character';
import { blk, flat, glow, plane, sign, tex, tiles, wrap, type ThermeParts } from './kit';

/*
 * The entrance hall (flrnoh fork, see shared/therme-street.ts, phase 7): the way in off the street.
 * Its glass doors in the north wall (E there goes back out onto the street), polished stone, the box
 * office with the cashier (it's all free), turnstiles whose arms turn as you pass, lockers, the info
 * board with the waves and the Aufgüsse, the name over the way into the baths.
 */

export interface Lobby {
  cashier: Person;
  /** The info board's face, redrawn every few seconds. */
  board: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
  update(t: number, dt: number, people: readonly { x: number; z: number }[]): void;
}

export function buildLobby(p: ThermeParts): Lobby {
  const L = ZONES.lobby;
  flat(p, { minX: L.minX + 0.2, maxX: L.maxX - 0.2, minZ: 0, maxZ: 15 }, tex(wrap(tiles('#d9d4cc', '#bdb6aa', 2, 0.04, 151), (L.maxX - L.minX) / 1.5, 10)), 0.009);
  // The street doors: glass leaves in a dark frame, ENTRANCE · EXIT over them.
  const D = STREET_DOOR;
  const glass = mesh(new THREE.PlaneGeometry(D.width, D.height), toon('#b9e2ee', { transparent: true, opacity: 0.5 }), D.x, D.height / 2, 0.012, false);
  glass.userData.noOutline = true;
  p.group.add(glass);
  for (const s of [-1, 1]) blk(p, 0.12, D.height + 0.1, 0.14, '#2a2f35', D.x + (s * D.width) / 2, D.height / 2, 0.06);
  blk(p, D.width + 0.24, 0.12, 0.14, '#2a2f35', D.x, D.height + 0.06, 0.06);
  plane(p, 3.4, 0.5, glow(sign('🚪 AUSGANG', 'zur Straße', '#16324f', '#ffe08a', 768, 112)), D.x, D.height + 0.5, 0.03, 0);
  const exit: Interactable = { kind: 'thermestreet', x: D.x, z: 0.5, y: 0, radius: 3 };
  p.interactables.push(exit);
  glass.userData.interact = exit;
  // The box office: a curved counter, a till, the price board (all free), the cashier.
  blk(p, KASSE.maxX - KASSE.minX, 1.1, KASSE.maxZ - KASSE.minZ, '#e8e2d6', (KASSE.minX + KASSE.maxX) / 2, 0.55, (KASSE.minZ + KASSE.maxZ) / 2);
  blk(p, KASSE.maxX - KASSE.minX + 0.2, 0.06, KASSE.maxZ - KASSE.minZ + 0.2, '#7a4f2a', (KASSE.minX + KASSE.maxX) / 2, 1.13, (KASSE.minZ + KASSE.maxZ) / 2);
  blk(p, 0.4, 0.3, 0.5, '#2a2f35', KASSE.maxX - 0.3, 1.3, 7.5);
  plane(p, 3.6, 1.6, glow(sign('KASSE', 'Eintritt frei · Thermenparadies · Wellenbad · Rutschen · Saunadorf · Lagune', '#0f4c5c', '#ffe8a8', 1024, 456)), L.minX + 0.22, 3.2, 7.5, Math.PI / 2);
  const cashier = new Person('Lena', '#2a9d8f', { skin: 2, hair: 6, style: 4 });
  cashier.root.position.set(CASHIER.x, 0, CASHIER.z);
  cashier.root.rotation.y = CASHIER.rotY;
  cashier.showLabel(false);
  p.group.add(cashier.root);
  // The turnstiles: posts between the gates, and an arm at each that turns as someone goes through.
  const arms: THREE.Group[] = [];
  let x = L.minX;
  for (const g of GATES) {
    if (g - 0.6 > x) blk(p, g - 0.6 - x, 1.05, 0.3, '#c9ccd0', (x + g - 0.6) / 2, 0.525, TURNSTILE_Z);
    const arm = new THREE.Group();
    arm.add(mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), toon('#8a9096'), 0.55, 0, 0, false));
    arm.position.set(g - 0.6, 0.9, TURNSTILE_Z);
    p.group.add(arm);
    arms.push(arm);
    x = g + 0.6;
  }
  blk(p, L.maxX - x, 1.05, 0.3, '#c9ccd0', (x + L.maxX) / 2, 0.525, TURNSTILE_Z);
  // The lockers along the east wall.
  const lockerTex = wrap(tiles('#5fa8c9', '#2f6f8f', 4, 0.04, 157), 3, 1);
  const lk = mesh(new THREE.BoxGeometry(LOCKERS.maxX - LOCKERS.minX, 2.1, LOCKERS.maxZ - LOCKERS.minZ), tex(lockerTex), (LOCKERS.minX + LOCKERS.maxX) / 2, 1.05, (LOCKERS.minZ + LOCKERS.maxZ) / 2, false);
  p.group.add(lk);
  // The info board, and the name over the way in.
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 460;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture });
  face.toneMapped = false;
  const B = INFO_BOARD;
  const bm = mesh(new THREE.PlaneGeometry(B.w, B.h), face, B.x, B.y, B.z, false);
  bm.rotation.y = -Math.PI / 2;
  p.group.add(bm);
  plane(p, 9, 1.3, glow(sign(THERME_NAME.toUpperCase(), 'viel Spaß beim Baden', '#3b2412', '#ffcf8a', 1024, 148)), (L.minX + L.maxX) / 2, 4.6, 15 - 0.22, Math.PI);
  const turns = GATES.map(() => 0);
  return {
    cashier,
    board: { canvas, texture },
    update: (t, dt, people) => {
      cashier.update(dt, t, false, false);
      GATES.forEach((g, i) => {
        const through = people.some((q) => Math.abs(q.x - g) < 0.6 && Math.abs(q.z - TURNSTILE_Z) < 0.6);
        turns[i] = through ? Math.min(Math.PI / 2, turns[i] + dt * 4) : Math.max(0, turns[i] - dt * 2);
        arms[i].rotation.y = turns[i];
      });
    },
  };
}

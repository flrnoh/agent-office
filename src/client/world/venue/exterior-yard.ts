import * as THREE from 'three';
import { STREET_Y } from '../../../shared/layout';
import { VENUE_BOX } from '../../../shared/venue';
import { BEER_GARDEN, DOCK, TOUR_BUS } from '../../../shared/venue-house';
import type { Collider } from '../types';
import { bulb, type NightParts } from '../outside';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';
import { box, canvasTexture } from '../casino/parts';
import { BOLD, concreteTexture, corrugatedTexture, softDot } from './signs';

/*
 * Round the Schallwerk outside (flrnoh fork, see FORK.md "The Schallwerk"): the smokers' beer garden
 * in front of the west half of the façade (beer benches, a fire bowl that flickers at night, string
 * lights from poles to the wall, a low steel fence, barrel planters, an ashtray post), the band's
 * nightliner parked along the east half (tinted windows, the destination display saying SCHALLWERK,
 * its upper deck's curtains glowing at night), and the loading dock against the east wall at the back
 * (a platform at truck height with rubber bumpers, the roll-up door, flight cases waiting, a dock
 * lamp). Street coordinates, the street at STREET_Y.
 */

const G = STREET_Y;

export interface VenueYard {
  /** `lit`: how dark it is (0 day … 1 night), the fire's flicker. */
  update(t: number, lit: number): void;
}

export function buildYard(group: THREE.Group, colliders: Collider[], night: NightParts): VenueYard {
  const root = new THREE.Group();
  root.name = 'venue-yard';
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const steel = toon('#24262c');
  const wood = toon('#a0703f');
  const woodDark = toon('#7a5230');

  // ---- The beer garden ------------------------------------------------------------------------
  const BG = BEER_GARDEN;
  {
    // Gravel underfoot.
    const gravel = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#a29a8c';
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = i % 3 ? 'rgba(80,72,64,0.35)' : 'rgba(230,224,210,0.4)';
        g.fillRect((i * 37) % 64, (i * 23) % 64, 2, 2);
      }
    });
    gravel.wrapS = gravel.wrapT = THREE.RepeatWrapping;
    gravel.repeat.set((BG.maxX - BG.minX) / 2, (BG.maxZ - BG.minZ) / 2);
    root.add(mesh(new THREE.PlaneGeometry(BG.maxX - BG.minX, BG.maxZ - BG.minZ).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: gravel, gradientMap }), (BG.minX + BG.maxX) / 2, G + 0.02, (BG.minZ + BG.maxZ) / 2, false));
    // The fence along the street side, with a gap at each end to walk in by.
    const fz = BG.minZ + 0.05;
    const fence = { from: BG.minX + 1.4, to: BG.maxX - 1.4 };
    parts.add(mesh(box(fence.to - fence.from, 0.06, 0.06), steel, (fence.from + fence.to) / 2, G + 1.0, fz));
    parts.add(mesh(box(fence.to - fence.from, 0.05, 0.05), steel, (fence.from + fence.to) / 2, G + 0.2, fz));
    for (let x = fence.from; x <= fence.to + 1e-6; x += 0.25) parts.add(mesh(box(0.025, 0.8, 0.025), steel, x, G + 0.6, fz, false));
    colliders.push({ minX: fence.from, maxX: fence.to, minZ: fz - 0.1, maxZ: fz + 0.1, bottom: G, top: G + 1.05, fence: true });
    // Three sets of beer benches along the wall, the fire bowl between the middle two.
    for (const x of [94.2, 102.8, 106.6]) {
      const z = 35.0;
      parts.add(mesh(box(2.2, 0.05, 0.6), wood, x, G + 0.76, z));
      for (const s of [-1, 1]) {
        parts.add(mesh(box(2.2, 0.05, 0.26), wood, x, G + 0.46, z + s * 0.55));
        for (const e of [-1, 1]) parts.add(mesh(box(0.04, 0.46, 0.22), steel, x + e * 0.9, G + 0.23, z + s * 0.55, false));
      }
      for (const e of [-1, 1]) parts.add(mesh(box(0.04, 0.74, 0.5), steel, x + e * 0.95, G + 0.37, z, false));
      colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.7, maxZ: z + 0.7, bottom: G, top: G + 0.8, fence: true });
    }
    // Barrel planters with tall grass, an ashtray post.
    const barrel = toon('#5b3a24');
    for (const x of [92.0, 97.0]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.8, 14), barrel, x, G + 0.4, 34.9));
      for (let k = 0; k < 9; k++) {
        const blade = mesh(new THREE.ConeGeometry(0.05, 0.9, 4), toon(k % 2 ? '#6a8f3a' : '#87a94a'), x + Math.sin(k * 2.1) * 0.22, G + 1.2, 34.9 + Math.cos(k * 2.1) * 0.22, false);
        blade.rotation.set(Math.cos(k) * 0.3, 0, Math.sin(k * 1.7) * 0.3);
        parts.add(blade);
      }
      colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: 34.45, maxZ: 35.35, bottom: G, top: G + 0.8 });
    }
    parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), steel, 104.7, G + 0.5, 35.7));
    parts.add(mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 12), toon('#9aa0a8'), 104.7, G + 1.05, 35.7));
    // RAUCHERBEREICH on an enamel sign on the wall.
    const sign = mesh(
      new THREE.PlaneGeometry(1.6, 0.5).rotateY(Math.PI),
      new THREE.MeshToonMaterial({
        gradientMap,
        map: canvasTexture(256, 80, (g) => {
          g.fillStyle = '#0f3d2e';
          g.fillRect(0, 0, 256, 80);
          g.strokeStyle = '#f4ead8';
          g.lineWidth = 5;
          g.strokeRect(6, 6, 244, 68);
          g.fillStyle = '#f4ead8';
          g.font = `40px ${BOLD}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('BIERGARTEN · RAUCHER', 128, 42, 230);
        }),
      }),
      100.4,
      G + 2.2,
      VENUE_BOX.minZ - 0.03,
      false,
    );
    root.add(sign);
  }

  // The fire bowl: a steel bowl on legs, logs, flames that flicker (and light the faces round it at night).
  const flames: THREE.Mesh[] = [];
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  fireMat.userData.outlineParameters = { visible: false };
  const FIRE = { x: 98.6, z: 35.0 } as const;
  {
    parts.add(mesh(new THREE.SphereGeometry(0.55, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#2d2a28'), FIRE.x, G + 0.62, FIRE.z));
    for (let k = 0; k < 3; k++) {
      const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), steel, FIRE.x + Math.cos((k * Math.PI * 2) / 3) * 0.3, G + 0.25, FIRE.z + Math.sin((k * Math.PI * 2) / 3) * 0.3);
      parts.add(leg);
    }
    for (let k = 0; k < 4; k++) {
      const log = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), woodDark, FIRE.x, G + 0.66, FIRE.z);
      log.rotation.set(Math.PI / 2, (k * Math.PI) / 4, 0.25);
      parts.add(log);
    }
    for (let k = 0; k < 5; k++) {
      const f = mesh(new THREE.ConeGeometry(0.16 - k * 0.015, 0.7, 8), fireMat, FIRE.x + Math.sin(k * 2.4) * 0.16, G + 0.95, FIRE.z + Math.cos(k * 2.4) * 0.16, false);
      root.add(f);
      flames.push(f);
    }
    colliders.push({ minX: FIRE.x - 0.6, maxX: FIRE.x + 0.6, minZ: FIRE.z - 0.6, maxZ: FIRE.z + 0.6, bottom: G, top: G + 0.8 });
  }
  const fireGlow = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ff8a30', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  fireGlow.userData.outlineParameters = { visible: false };
  const ground = mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), fireGlow, FIRE.x, G + 0.04, FIRE.z, false);
  root.add(ground);
  const wall = mesh(new THREE.PlaneGeometry(5, 4).rotateY(Math.PI), fireGlow, FIRE.x, G + 1.6, VENUE_BOX.minZ - 0.04, false);
  root.add(wall);

  // String lights: poles along the fence, bulbs sagging from each pole to the wall.
  {
    const bulbMat = bulb(night, '#ffdf9e', 0.2);
    const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const wire = toon('#1a1a1a');
    const strands = new THREE.Group();
    for (const x of [BG.minX + 1.3, 96.0, 100.4, 104.8, BG.maxX - 1.3]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.3, 8), steel, x, G + 1.65, BG.minZ + 0.2));
      const a = new THREE.Vector3(x, G + 3.2, BG.minZ + 0.2);
      const b = new THREE.Vector3(x + 1.2, G + 3.6, VENUE_BOX.minZ - 0.1);
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.45;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      strands.add(mesh(new THREE.TubeGeometry(curve, 12, 0.012, 4, false), wire, 0, 0, 0, false));
      for (let k = 1; k < 7; k++) {
        const p = curve.getPoint(k / 7);
        strands.add(mesh(bulbGeo, bulbMat, p.x, p.y, p.z, false));
      }
      night.halos.push({ at: curve.getPoint(0.5), size: 1.4, color: '#ffd28a' });
    }
    root.add(mergeByMaterial(strands));
  }

  // ---- The nightliner ---------------------------------------------------------------------------
  const TB = TOUR_BUS;
  const busLights: THREE.MeshToonMaterial[] = [];
  {
    const bus = new THREE.Group();
    const L = TB.maxX - TB.minX;
    const Wd = TB.maxZ - TB.minZ;
    const body = toon('#1b1c21');
    const glass = toon('#0b0d12');
    const red = toon('#c4121f');
    // The body (front east, its passenger door toward the house), a little off the ground on its wheels.
    bus.add(mesh(box(L, TB.h - 0.45, Wd), body, 0, 0.45 + (TB.h - 0.45) / 2, 0));
    // Rounded roof edge, a red stripe and the window bands.
    bus.add(mesh(box(L - 0.2, 0.12, Wd - 0.2), toon('#2a2c33'), 0, TB.h + 0.04, 0));
    for (const s of [-1, 1]) {
      bus.add(mesh(box(L - 1.6, 0.12, 0.02), red, -0.6, 1.25, s * (Wd / 2 + 0.01), false));
      bus.add(mesh(box(L - 3.2, 0.75, 0.02), glass, -1.0, 1.95, s * (Wd / 2 + 0.01), false));
      bus.add(mesh(box(L - 1.6, 0.6, 0.02), glass, -0.6, 3.3, s * (Wd / 2 + 0.01), false));
    }
    // The upper deck's curtains, lit from inside at night (the band's bunks).
    const bunk = toonUnique('#3a2030');
    bunk.emissive.set('#ff9a5a');
    busLights.push(bunk);
    for (let k = 0; k < 6; k++) bus.add(mesh(box(1.4, 0.4, 0.02), bunk, -L / 2 + 1.6 + k * 1.75, 3.3, Wd / 2 + 0.02, false));
    // The windscreen and the destination display over it.
    bus.add(mesh(box(0.02, 1.6, Wd - 0.3), glass, L / 2 + 0.01, 1.9, 0, false));
    const dest = canvasTexture(256, 40, (g) => {
      g.fillStyle = '#050505';
      g.fillRect(0, 0, 256, 40);
      g.fillStyle = '#ffb000';
      g.font = `30px ${BOLD}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SCHALLWERK ON TOUR', 128, 22, 240);
    });
    const destMat = new THREE.MeshToonMaterial({ map: dest, gradientMap, emissive: new THREE.Color('#ffffff'), emissiveMap: dest });
    night.bulbs.push({ mat: destMat, day: 0.6 });
    const d = mesh(new THREE.PlaneGeometry(Wd - 0.5, 0.3), destMat, L / 2 + 0.03, 3.0, 0, false);
    d.rotation.y = Math.PI / 2;
    bus.add(d);
    // Head- and taillights.
    const head = bulb(night, '#fffbe8', 0.2);
    const tail = bulb(night, '#ff2a2a', 0.3);
    for (const s of [-1, 1]) {
      bus.add(mesh(box(0.05, 0.16, 0.36), head, L / 2 + 0.03, 0.75, s * (Wd / 2 - 0.35), false));
      bus.add(mesh(box(0.05, 0.4, 0.16), tail, -L / 2 - 0.03, 1.0, s * (Wd / 2 - 0.2), false));
      // Mirrors on their arms.
      bus.add(mesh(box(0.1, 0.36, 0.08), body, L / 2 + 0.25, 2.3, s * (Wd / 2 + 0.25)));
    }
    // The passenger door (house side, +z), a step.
    bus.add(mesh(box(0.95, 2.1, 0.03), glass, L / 2 - 1.3, 1.4, Wd / 2 + 0.02, false));
    // Three axles of wheels.
    const tyre = toon('#121212');
    const hub = toon('#9aa0a8');
    for (const x of [L / 2 - 2.4, -L / 2 + 2.6, -L / 2 + 4.0])
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 16).rotateX(Math.PI / 2), tyre, x, 0.5, s * (Wd / 2 - 0.12));
        bus.add(w);
        bus.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12).rotateX(Math.PI / 2), hub, x, 0.5, s * (Wd / 2 - 0.12), false));
      }
    // Placed after merging: mergeByMaterial bakes the parts relative to `bus` itself, so a position on `bus` would be lost (and the bus stood in the office).
    const merged = mergeByMaterial(bus);
    merged.position.set((TB.minX + TB.maxX) / 2, G, (TB.minZ + TB.maxZ) / 2);
    root.add(merged);
    colliders.push({ minX: TB.minX, maxX: TB.maxX, minZ: TB.minZ, maxZ: TB.maxZ, bottom: G, top: G + TB.h });
  }

  // ---- The loading dock -------------------------------------------------------------------------
  {
    const DK = DOCK;
    const conc = concreteTexture('#7a7672');
    conc.repeat.set(1, 3);
    const concrete = new THREE.MeshToonMaterial({ map: conc, gradientMap });
    parts.add(mesh(box(DK.maxX - DK.minX, DK.top, DK.maxZ - DK.minZ), concrete, (DK.minX + DK.maxX) / 2, G + DK.top / 2, (DK.minZ + DK.maxZ) / 2));
    // Its yellow-black edge and the rubber bumpers.
    const hazard = canvasTexture(128, 16, (g) => {
      for (let x = -16; x < 144; x += 16) {
        g.fillStyle = (x / 16) % 2 ? '#111111' : '#ffcc00';
        g.beginPath();
        g.moveTo(x, 16);
        g.lineTo(x + 8, 0);
        g.lineTo(x + 16, 0);
        g.lineTo(x + 8, 16);
        g.fill();
      }
    });
    hazard.wrapS = THREE.RepeatWrapping;
    hazard.repeat.set(6, 1);
    const edge = mesh(new THREE.PlaneGeometry(DK.maxZ - DK.minZ, 0.2), new THREE.MeshToonMaterial({ map: hazard, gradientMap }), DK.maxX + 0.01, G + DK.top - 0.1, (DK.minZ + DK.maxZ) / 2, false);
    edge.rotation.y = Math.PI / 2;
    root.add(edge);
    for (const z of [62.2, 66.0]) parts.add(mesh(box(0.25, 0.6, 0.5), toon('#151515'), DK.maxX + 0.1, G + 0.7, z));
    // Steps down at its north end.
    for (let k = 0; k < 4; k++) {
      const top = 0.3 * (k + 1);
      parts.add(mesh(box(DK.maxX - DK.minX, top, 0.32), concrete, (DK.minX + DK.maxX) / 2, G + top / 2, DK.minZ - (3.5 - k) * 0.32));
    }
    // The roll-up door, the dock lamp over it.
    const roll = corrugatedTexture('#8a8f96');
    roll.repeat.set(1, 6);
    roll.rotation = Math.PI / 2;
    const door = mesh(new THREE.PlaneGeometry(3.2, 3.4), new THREE.MeshToonMaterial({ map: roll, gradientMap }), VENUE_BOX.maxX + 0.03, G + DK.top + 1.7, 65.5, false);
    door.rotation.y = Math.PI / 2;
    root.add(door);
    parts.add(mesh(box(0.3, 0.5, 3.6), toon('#3a3d44'), VENUE_BOX.maxX + 0.15, G + DK.top + 3.65, 65.5));
    const lamp = bulb(night, '#fff3d6', 0.1);
    parts.add(mesh(box(0.5, 0.2, 0.35), steel, VENUE_BOX.maxX + 0.35, G + DK.top + 4.1, 62.8));
    root.add(mesh(box(0.42, 0.03, 0.28), lamp, VENUE_BOX.maxX + 0.35, G + DK.top + 3.99, 62.8, false));
    night.halos.push({ at: new THREE.Vector3(VENUE_BOX.maxX + 1.2, G + DK.top + 0.1, 64), size: 3, color: '#fff3d6', ground: true });
    // ANLIEFERUNG over it.
    const sign = mesh(
      new THREE.PlaneGeometry(2.6, 0.45),
      new THREE.MeshToonMaterial({
        gradientMap,
        map: canvasTexture(256, 44, (g) => {
          g.fillStyle = '#f4ead8';
          g.fillRect(0, 0, 256, 44);
          g.fillStyle = '#16161a';
          g.font = `34px ${BOLD}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('ANLIEFERUNG · BÜHNE', 128, 24, 240);
        }),
      }),
      VENUE_BOX.maxX + 0.04,
      G + DK.top + 4.3,
      65.5,
      false,
    );
    sign.rotation.y = Math.PI / 2;
    root.add(sign);
    // Flight cases waiting on the platform.
    const caseMat = toon('#202126');
    const corner = toon('#b8bec6');
    for (const [z, y, w, h, d] of [
      [61.4, 0, 1.0, 0.9, 0.8],
      [61.4, 0.9, 0.8, 0.6, 0.7],
      [63.0, 0, 1.2, 1.1, 1.0],
    ] as const) {
      parts.add(mesh(box(d, h, w), caseMat, 138.3, G + DK.top + y + h / 2, z));
      parts.add(mesh(box(d + 0.04, 0.05, w + 0.04), corner, 138.3, G + DK.top + y + h - 0.03, z));
      parts.add(mesh(box(d + 0.04, 0.05, w + 0.04), corner, 138.3, G + DK.top + y + 0.03, z));
    }
    colliders.push({ minX: DK.minX, maxX: DK.maxX, minZ: DK.minZ, maxZ: DK.maxZ, bottom: G, top: G + DK.top });
    for (let k = 0; k < 4; k++) colliders.push({ minX: DK.minX, maxX: DK.maxX, minZ: DK.minZ - (4 - k) * 0.32, maxZ: DK.minZ - (3 - k) * 0.32, bottom: G, top: G + 0.3 * (k + 1) });
  }

  root.add(mergeByMaterial(parts));
  group.add(root);

  return {
    update(t, lit) {
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        const k = 0.75 + 0.25 * Math.sin(t * (7 + i * 1.3) + i * 2) + 0.1 * Math.sin(t * 17 + i);
        f.scale.set(1, k, 1);
        f.position.y = G + 0.82 + 0.35 * k;
      }
      fireMat.color.setHSL(0.07 + 0.02 * Math.sin(t * 5), 1, 0.55);
      const glow = (0.2 + 0.8 * lit) * (0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3));
      fireGlow.opacity = 0.55 * glow;
      for (const m of busLights) m.emissiveIntensity = 0.05 + lit * 0.7;
    },
  };
}

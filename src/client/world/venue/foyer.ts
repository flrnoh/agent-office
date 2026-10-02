import * as THREE from 'three';
import { VENUE_ROOM } from '../../../shared/venue';
import { COAT_RAILS, COAT_TAGS, FOTOBOX, GALLERY, GARDEROBE, HIGH_TABLES, KASSE, MERCH, MERCH_TABLE, MERCH_WALL, PILLARS_X, PILLAR_HALF, PILLAR_Z, type MerchItem } from '../../../shared/venue-house';
import type { Collider, Interactable } from '../types';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box, canvasTexture, glow, neonSign } from '../casino/parts';
import { BOLD, SW, drawLogo, posterTexture } from './signs';
import type { Look } from './lighting';
import { pickBox } from './pick';

/*
 * The Schallwerk's foyer (flrnoh fork, see FORK.md "The Schallwerk"), in ZONES.foyer under the
 * gallery: the box office (a glazed booth, the stamp pad on its counter), the cloakroom (a counter, the
 * rails behind it with everyone's coats on numbered hangers: a coat handed in hangs there in its
 * owner's colour), the merch stand (shirts and the hoodie on the wall, stacks on the table, posters in
 * a box), the photo booth (a cabin with a red curtain under a bulb sign), two high tables, gig posters
 * on the walls and the pillars. Its light is its own: warm, whatever the hall is doing.
 */

const R = VENUE_ROOM;

export interface VenueFoyer {
  /** The coats on the rails: each ticket's number and its owner's colour. */
  setCoats(coats: { tag: number; color: string }[]): void;
  update(look: Look, t: number): void;
}

/** A T-shirt (or a hoodie) seen flat from the front, the logo on its chest, on a see-through ground. */
export function shirtTexture(m: MerchItem): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = m.color;
    g.beginPath();
    const sleeve = m.hoodie ? 70 : 40;
    g.moveTo(84, 22);
    g.quadraticCurveTo(128, 44, 172, 22);
    g.lineTo(236, 52);
    g.lineTo(236 - 18, 52 + sleeve);
    g.lineTo(196, 50 + sleeve * 0.75);
    g.lineTo(196, 240);
    g.lineTo(60, 240);
    g.lineTo(60, 50 + sleeve * 0.75);
    g.lineTo(20 + 18, 52 + sleeve);
    g.lineTo(20, 52);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.stroke();
    if (m.hoodie) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(128, 34, 40, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(96, 196, 64, 30);
    }
    drawLogo(g, 128, 124, 112, m.ink);
  });
}

export function buildFoyer(group: THREE.Group, colliders: Collider[], interactables: Interactable[]): VenueFoyer {
  const parts = new THREE.Group();
  const gradientMap = (toon('#fff') as THREE.MeshToonMaterial).gradientMap;
  const dark = toon('#1c1b20');
  const steel = toon('#3a3d45');
  const wood = toon('#7b5636');
  const glass = new THREE.MeshToonMaterial({ color: '#cfe7ef', transparent: true, opacity: 0.25, gradientMap, depthWrite: false });
  glass.userData.outlineParameters = { visible: false };
  const solid = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, top: number, fence = false) => colliders.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, bottom: 0, top, ...(fence ? { fence: true } : {}) });
  const tex = (draw: (g: CanvasRenderingContext2D) => void, w = 512, h = 128) => canvasTexture(w, h, draw);
  const sign = (text: string, color: string, w: number, x: number, y: number, z: number, rotY = 0) => {
    const m = mesh(new THREE.PlaneGeometry(w, w / 4), glow(neonSign(text, color, 512, 128, '#121014')), x, y, z, false);
    m.rotation.y = rotY;
    group.add(m);
  };

  // ---- The box office -------------------------------------------------------------------------------
  {
    const K = KASSE;
    const cx = (K.minX + K.maxX) / 2;
    const w = K.maxX - K.minX;
    const d = K.maxZ - K.minZ;
    // The counter, its front in riveted black steel; the booth's sides and roof; glass over the counter.
    parts.add(mesh(box(w, K.top, 0.5), dark, cx, K.top / 2, K.maxZ - 0.25));
    parts.add(mesh(box(w + 0.1, 0.06, 0.62), wood, cx, K.top + 0.03, K.maxZ - 0.28));
    for (const s of [-1, 1]) parts.add(mesh(box(0.12, 2.7, d), dark, cx + s * (w / 2 - 0.06), 1.35, (K.minZ + K.maxZ) / 2));
    parts.add(mesh(box(w, 0.25, d + 0.1), dark, cx, 2.7, (K.minZ + K.maxZ) / 2));
    group.add(mesh(box(w - 0.24, 1.45, 0.03), glass, cx, K.top + 0.8, K.maxZ - 0.05, false));
    // The speaking hole and the slot under the glass.
    parts.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), steel, cx, K.top + 0.6, K.maxZ - 0.07));
    // The stamp pad, the stamp, a roll of tickets, the card reader.
    parts.add(mesh(box(0.22, 0.03, 0.14), toon('#2d2d6b'), cx - 0.6, K.top + 0.075, K.maxZ - 0.3));
    parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 8), toon('#8a5a2b'), cx - 0.3, K.top + 0.12, K.maxZ - 0.3));
    parts.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 14).rotateZ(Math.PI / 2), toon('#e9d8a6'), cx + 0.5, K.top + 0.12, K.maxZ - 0.35));
    parts.add(mesh(box(0.1, 0.03, 0.16), toon('#222'), cx + 0.9, K.top + 0.08, K.maxZ - 0.3));
    // Inside: shelves, a till, a lamp.
    parts.add(mesh(box(w - 0.4, 0.05, 0.4), wood, cx, 1.6, K.minZ + 0.25));
    parts.add(mesh(box(w - 0.4, 0.05, 0.4), wood, cx, 2.1, K.minZ + 0.25));
    sign('KASSE', '#ffb347', 2.6, cx, 3.15, K.maxZ + 0.02);
    // The board: what it costs (nothing) and what you get (a stamp).
    const price = mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshToonMaterial({ gradientMap, map: tex((g) => {
      g.fillStyle = '#121114';
      g.fillRect(0, 0, 512, 256);
      g.fillStyle = SW.cream;
      g.font = `60px ${BOLD}`;
      g.fillText('ABENDKASSE', 24, 70);
      g.font = '34px "Chalkboard SE", "Comic Sans MS", cursive';
      g.fillStyle = SW.amber;
      g.fillText('Eintritt: frei', 24, 130);
      g.fillText('Stempel gibt’s trotzdem ✋', 24, 180);
      g.fillStyle = '#9a9aa6';
      g.font = '24px "Chalkboard SE", "Comic Sans MS", cursive';
      g.fillText('Wiedereinlass nur mit Stempel', 24, 228);
    }, 512, 256) }), cx + w / 2 + 0.85, 1.9, R.minZ + 0.02, false);
    group.add(price);
    solid(K, 2.8);
    const it: Interactable = { kind: 'venuekasse', x: cx, z: K.maxZ + 0.3, radius: 1.8 };
    interactables.push(it);
    pickBox(group, it, { ...K, maxZ: K.maxZ + 0.1 }, 0, 2.7);
  }

  // ---- The cloakroom ------------------------------------------------------------------------------
  const coatGroup = new THREE.Group();
  group.add(coatGroup);
  const hangers: THREE.Vector3[] = [];
  {
    const C = GARDEROBE;
    const cx = (C.minX + C.maxX) / 2;
    const w = C.maxX - C.minX;
    parts.add(mesh(box(w, C.top, C.maxZ - C.minZ), wood, cx, C.top / 2, (C.minZ + C.maxZ) / 2));
    parts.add(mesh(box(w + 0.12, 0.06, C.maxZ - C.minZ + 0.12), dark, cx, C.top + 0.03, (C.minZ + C.maxZ) / 2));
    // The rails, two levels, chrome, on posts, the hangers.
    const RL = COAT_RAILS;
    const rx = (RL.minX + RL.maxX) / 2;
    const rz = (RL.minZ + RL.maxZ) / 2;
    for (const y of [1.15, 1.85]) parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, RL.maxX - RL.minX, 8).rotateZ(Math.PI / 2), toon('#c8cdd4'), rx, y, rz));
    for (const s of [-1, 1]) parts.add(mesh(box(0.05, 1.95, 0.05), steel, rx + (s * (RL.maxX - RL.minX)) / 2, 0.97, rz));
    for (let i = 0; i < 24; i++) {
      const x = RL.minX + 0.25 + (i % 12) * ((RL.maxX - RL.minX - 0.5) / 11);
      const y = i < 12 ? 1.85 : 1.15;
      hangers.push(new THREE.Vector3(x, y, rz));
      parts.add(mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 10, Math.PI).rotateY(Math.PI / 2), toon('#8a6a45'), x, y - 0.12, rz));
    }
    // A few strangers' coats always there.
    for (const [i, c] of [
      [2, '#3d405b'],
      [5, '#6b705c'],
      [9, '#22223b'],
      [14, '#7f5539'],
      [19, '#283618'],
    ] as const) parts.add(coat(hangers[i], c));
    sign('GARDEROBE', '#ffd27a', 3.2, cx, 3.15, C.minZ - 0.1);
    // The ticket board: numbered tags on hooks.
    const tags = mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshToonMaterial({ gradientMap, map: tex((g) => {
      g.fillStyle = '#2a2420';
      g.fillRect(0, 0, 384, 256);
      for (let i = 0; i < 24; i++) {
        const x = 20 + (i % 6) * 60;
        const y = 22 + Math.floor(i / 6) * 58;
        g.fillStyle = '#e9d8a6';
        g.fillRect(x, y, 44, 44);
        g.fillStyle = '#c4121f';
        g.font = `26px ${BOLD}`;
        g.textAlign = 'center';
        g.fillText(String(((i * 7) % COAT_TAGS) + 1), x + 22, y + 32);
      }
    }, 384, 256) }), C.minX - 0.75, 1.9, R.minZ + 0.02, false);
    group.add(tags);
    solid(C, C.top);
    solid(RL, RL.top, true);
    const it: Interactable = { kind: 'venuecoat', x: cx, z: C.maxZ + 0.3, radius: 1.9 };
    interactables.push(it);
    pickBox(group, it, { minX: C.minX, maxX: C.maxX, minZ: COAT_RAILS.minZ, maxZ: C.maxZ }, 0, 2.2);
  }

  // ---- The merch stand -----------------------------------------------------------------------------
  {
    const MW = MERCH_WALL;
    const T = MERCH_TABLE;
    const cx = (T.minX + T.maxX) / 2;
    // A pegboard wall with the shirts and the hoodie on it, a poster in the middle.
    parts.add(mesh(box(MW.maxX - MW.minX, MW.top - 0.4, 0.08), toon('#2c2a2e'), (MW.minX + MW.maxX) / 2, 0.4 + (MW.top - 0.4) / 2, R.minZ + 0.06));
    MERCH.forEach((m, i) => {
      const s = mesh(new THREE.PlaneGeometry(1.35, 1.35), new THREE.MeshToonMaterial({ map: shirtTexture(m), gradientMap, transparent: true, alphaTest: 0.1 }), MW.minX + 0.9 + i * 1.8 + (i > 0 ? 0.0 : 0), 2.25, R.minZ + 0.12, false);
      group.add(s);
    });
    const poster = mesh(new THREE.PlaneGeometry(0.7, 0.98), new THREE.MeshToonMaterial({ map: posterTexture(5), gradientMap }), MW.maxX - 0.5, 1.15, R.minZ + 0.12, false);
    group.add(poster);
    // The table: a black cloth, stacks of folded shirts in their colours, a box of rolled posters, a card reader.
    parts.add(mesh(box(T.maxX - T.minX, T.top, T.maxZ - T.minZ), toon('#141316'), cx, T.top / 2, (T.minZ + T.maxZ) / 2));
    MERCH.forEach((m, i) => {
      for (let k = 0; k < 4; k++) parts.add(mesh(box(0.42, 0.05, 0.34), toon(m.color), T.minX + 0.6 + i * 0.9, T.top + 0.03 + k * 0.055, (T.minZ + T.maxZ) / 2));
      const label = mesh(new THREE.PlaneGeometry(0.3, 0.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTexture(64, 64, (g) => drawLogo(g, 32, 32, 56, m.ink, false)), transparent: true }), T.minX + 0.6 + i * 0.9, T.top + 0.25, (T.minZ + T.maxZ) / 2, false);
      group.add(label);
    });
    parts.add(mesh(box(0.5, 0.4, 0.4), toon('#8a6a45'), T.maxX - 0.6, T.top + 0.2, (T.minZ + T.maxZ) / 2));
    for (let k = 0; k < 5; k++) parts.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), toon(['#f4ead8', '#ff2d3d', '#2ee6ff'][k % 3]), T.maxX - 0.75 + (k % 3) * 0.12, T.top + 0.5, (T.minZ + T.maxZ) / 2 - 0.1 + Math.floor(k / 3) * 0.15));
    sign('MERCH', '#ff2d3d', 2.6, cx, 3.45, R.minZ + 0.15);
    // The price list: everything's on the house.
    const price = mesh(new THREE.PlaneGeometry(0.8, 0.44), new THREE.MeshToonMaterial({ gradientMap, map: tex((g) => {
      g.fillStyle = '#f4ead8';
      g.fillRect(0, 0, 512, 284);
      g.fillStyle = '#16161a';
      g.font = `52px ${BOLD}`;
      MERCH.forEach((m, i) => g.fillText(`${m.name}`, 24, 70 + i * 66));
      g.fillStyle = '#c4121f';
      g.textAlign = 'right';
      MERCH.forEach((_, i) => g.fillText('0 €', 488, 70 + i * 66));
      g.textAlign = 'left';
      g.fillStyle = '#16161a';
      g.font = '30px "Chalkboard SE", "Comic Sans MS", cursive';
      g.fillText('Poster: nimm dir eins!', 24, 266);
    }, 512, 284) }), T.minX + 0.45, T.top + 0.2, T.maxZ - 0.08, false);
    (price.material as THREE.Material).userData.outlineParameters = { visible: false };
    price.rotation.x = -0.2;
    group.add(price);
    parts.add(mesh(box(0.92, 0.36, 0.02), toon('#141316'), T.minX + 0.45, T.top + 0.18, T.maxZ - 0.11));
    solid(T, T.top);
    solid(MW, MW.top, true);
    const it: Interactable = { kind: 'venuemerch', x: cx, z: T.maxZ + 0.3, radius: 2 };
    interactables.push(it);
    pickBox(group, it, { minX: MW.minX, maxX: MW.maxX, minZ: MW.minZ, maxZ: T.maxZ }, 0, 3.2);
  }

  // ---- The photo booth ----------------------------------------------------------------------------
  let boothBulbs: THREE.MeshBasicMaterial | null = null;
  {
    const F = FOTOBOX;
    const cx = (F.minX + F.maxX) / 2;
    const cz = (F.minZ + F.maxZ) / 2;
    const w = F.maxX - F.minX;
    const d = F.maxZ - F.minZ;
    const shell = toon('#b8261e');
    parts.add(mesh(box(w, F.top, 0.08), shell, cx, F.top / 2, F.minZ + 0.04));
    for (const s of [-1, 1]) parts.add(mesh(box(0.08, F.top, d), shell, cx + s * (w / 2 - 0.04), F.top / 2, cz));
    parts.add(mesh(box(w, 0.1, d), shell, cx, F.top, cz));
    // Its front: the curtain on the left half (velvet folds), the camera's window on the right panel.
    parts.add(mesh(box(w / 2, F.top - 0.4, 0.08), shell, cx + w / 4, (F.top - 0.4) / 2 + 0.4, F.maxZ - 0.04));
    const folds = new THREE.Group();
    for (let i = 0; i < 7; i++) folds.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, F.top - 0.45, 8), toon(i % 2 ? '#6d0f17' : '#8c1520'), F.minX + 0.12 + i * 0.2, (F.top - 0.45) / 2 + 0.15, F.maxZ - 0.08, false));
    parts.add(folds);
    parts.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, w / 2, 6).rotateZ(Math.PI / 2), toon('#c9a227'), F.minX + w / 4, F.top - 0.25, F.maxZ - 0.06));
    // The bench inside, the camera, a sample strip on the side.
    parts.add(mesh(box(w - 0.3, 0.45, 0.5), toon('#2a1d1d'), cx, 0.225, F.minZ + 0.4));
    group.add(mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: '#1a1a2e' }), cx + w / 4, 1.5, F.maxZ + 0.01, false));
    parts.add(mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), toon('#c9a227'), cx + w / 4, 1.5, F.maxZ + 0.01));
    const strip = mesh(new THREE.PlaneGeometry(0.22, 0.7), new THREE.MeshToonMaterial({ gradientMap, map: canvasTexture(64, 200, (g) => {
      g.fillStyle = '#fbfaf6';
      g.fillRect(0, 0, 64, 200);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#5a5a66', '#6b6b78', '#4f4f5a', '#62626e'][i];
        g.fillRect(6, 6 + i * 46, 52, 40);
        g.fillStyle = '#d9d9e0';
        g.beginPath();
        g.arc(32, 22 + i * 46, 9, 0, Math.PI * 2);
        g.fill();
      }
    }) }), cx + w / 4 + 0.35, 1.25, F.maxZ + 0.01, false);
    group.add(strip);
    // FOTOBOX in lights over it, the bulbs round the sign.
    const top = mesh(new THREE.PlaneGeometry(w - 0.2, 0.55), new THREE.MeshBasicMaterial({ map: canvasTexture(512, 96, (g) => {
      g.fillStyle = '#16161a';
      g.fillRect(0, 0, 512, 96);
      g.fillStyle = '#ffe9b0';
      g.font = `70px ${BOLD}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('FOTOBOX', 256, 52);
    }) }), cx, F.top - 0.15, F.maxZ + 0.02, false);
    (top.material as THREE.Material).userData.outlineParameters = { visible: false };
    group.add(top);
    boothBulbs = new THREE.MeshBasicMaterial({ color: '#ffe9b0' });
    boothBulbs.userData.outlineParameters = { visible: false };
    const bulbs = new THREE.Group();
    for (let x = -w / 2 + 0.15; x <= w / 2 - 0.1; x += 0.25) for (const y of [F.top + 0.13, F.top - 0.45]) bulbs.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), boothBulbs, cx + x, y, F.maxZ + 0.05, false));
    group.add(mergeByMaterial(bulbs));
    solid(F, F.top);
    const it: Interactable = { kind: 'venuebooth', x: cx, z: F.maxZ + 0.4, radius: 1.8 };
    interactables.push(it);
    pickBox(group, it, { ...F, maxZ: F.maxZ + 0.12 }, 0, F.top + 0.5);
  }

  // ---- High tables, posters on the walls and the pillars ----------------------------------------
  for (const t of HIGH_TABLES) {
    parts.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), toon('#2a2729'), t.x, 1.1, t.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.08, 8), steel, t.x, 0.54, t.z));
    parts.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.04, 16), steel, t.x, 0.02, t.z));
    colliders.push({ minX: t.x - 0.4, maxX: t.x + 0.4, minZ: t.z - 0.4, maxZ: t.z + 0.4, bottom: 0, top: 1.12, fence: true });
  }
  const frame = toon('#141316');
  const posterAt = (i: number, x: number, y: number, z: number, rotY: number, s = 1) => {
    const f = mesh(box(0.84 * s, 1.16 * s, 0.04), frame, x, y, z);
    f.rotation.y = rotY;
    parts.add(f);
    const p = mesh(new THREE.PlaneGeometry(0.74 * s, 1.04 * s), new THREE.MeshToonMaterial({ map: posterTexture(i), gradientMap }), x + Math.sin(rotY) * 0.03, y, z + Math.cos(rotY) * 0.03, false);
    p.rotation.y = rotY;
    group.add(p);
  };
  // Between the doors and the box office, the doors and the cloakroom.
  posterAt(0, -3.0, 1.9, R.minZ + 0.03, 0, 1.2);
  posterAt(1, 3.0, 1.9, R.minZ + 0.03, 0, 1.2);
  posterAt(2, 11.4, 1.9, R.minZ + 0.03, 0, 1.2);
  // Down the foyer's east wall.
  [3, 4, 5].forEach((k, i) => posterAt(k, R.maxX - 0.03, 1.9, -12.4 + i * 1.3, -Math.PI / 2));
  // On the pillars, facing the doors.
  PILLARS_X.forEach((x, i) => posterAt(i + 1, x, 1.9, PILLAR_Z - PILLAR_HALF - 0.02, Math.PI, 0.85));

  group.add(mergeByMaterial(parts));

  // The foyer's own warm light, under the gallery.
  const lamps = [-5, 9, 19].map((x) => {
    const l = new THREE.PointLight('#ffc98a', 5, 14, 1.3);
    l.position.set(x, GALLERY.y - 0.6, -12.6);
    group.add(l);
    return l;
  });

  return {
    setCoats(coats) {
      coatGroup.clear();
      for (const c of coats) {
        // The ticket's number says which hanger (the strangers' are taken).
        const free = [0, 1, 3, 4, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 22, 23];
        const at = hangers[free[(c.tag - 1) % free.length]];
        coatGroup.add(coat(at, c.color));
      }
    },
    update(look, t) {
      for (const l of lamps) l.intensity = look.mode === 'club' ? 3.8 : 5;
      if (boothBulbs) boothBulbs.color.setHSL(0.12, 0.9, 0.6 + 0.25 * Math.sin(t * 6));
    },
  };
}

/** A coat on its hanger: the body and the sleeves hanging, a collar, in the owner's colour. */
function coat(at: THREE.Vector3, color: string): THREE.Group {
  const g = new THREE.Group();
  const m = toon(color);
  g.add(mesh(box(0.42, 0.62, 0.16), m, 0, -0.45, 0));
  for (const s of [-1, 1]) g.add(mesh(box(0.09, 0.5, 0.12), m, s * 0.25, -0.42, 0));
  g.add(mesh(box(0.3, 0.06, 0.18), toon('#1d1d1d'), 0, -0.15, 0));
  g.position.copy(at);
  // Side on along the rail, as coats hang.
  g.rotation.y = Math.PI / 2;
  return g;
}

import * as THREE from 'three';
import { MERCH_BY_ID, type MerchId, type VenueWear } from '../../shared/venue-house';
import type { Person } from '../world/character';
import { canvasTexture } from '../world/casino/parts';
import { mesh, toon } from '../world/toon';
import { drawLogo, softDot } from '../world/venue/signs';

// What people have on from the Schallwerk (flrnoh fork, see FORK.md "The Schallwerk"): the office keeps
// it (server/venue/place.ts) and tells everyone; this page puts it on the people it can see, wherever
// they are (a merch shirt and an entry stamp go along with you, out of the venue and up to your desk):
// the shirt over the torso and the arms with the logo on the chest (and the tour dates on the back, or
// a hood), and the stamp glowing on the back of the right hand.

/** The torso is a capsule of 0.26 by 0.28 at y 0.72 of the body; an arm hangs from its shoulder pivot (see person-outfit.ts). */
const TORSO_Y = 0.72;

interface Worn {
  person: Person;
  key: string;
  parts: THREE.Object3D[];
}

const prints = new Map<MerchId, { front: THREE.MeshBasicMaterial; back: THREE.MeshBasicMaterial | null }>();
function printOf(id: MerchId) {
  let p = prints.get(id);
  if (!p) {
    const m = MERCH_BY_ID.get(id)!;
    const front = new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (g) => drawLogo(g, 64, 64, 118, m.ink)), transparent: true, depthWrite: false });
    front.userData.outlineParameters = { visible: false };
    let back: THREE.MeshBasicMaterial | null = null;
    if (id === 'tour') {
      back = new THREE.MeshBasicMaterial({
        map: canvasTexture(128, 128, (g) => {
          g.fillStyle = m.ink;
          g.font = 'bold 15px Impact, "Arial Narrow", sans-serif';
          g.textAlign = 'center';
          g.fillText('SCHALLWERK TOUR', 64, 18);
          g.font = '10px Impact, "Arial Narrow", sans-serif';
          ['09.10. MERGE-KONFLIKTE', '10.10. NULL POINTER SIS.', '15.10. KERNEL PANIK', '17.10. FEIERABEND ORCH.', '23.10. HEAP OVERFLOW', '31.10. GRÜNER BUILD'].forEach((l, i) => g.fillText(l, 64, 40 + i * 15));
        }),
        transparent: true,
        depthWrite: false,
      });
      back.userData.outlineParameters = { visible: false };
    }
    p = { front, back };
    prints.set(id, p);
  }
  return p;
}

let stampMat: THREE.MeshBasicMaterial | null = null;
let stampGlow: THREE.SpriteMaterial | null = null;

/** The shirt (or the hoodie) for one person: pieces for their body and each arm. */
function shirtParts(id: MerchId): { body: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D } {
  const m = MERCH_BY_ID.get(id)!;
  const cloth = toon(m.color);
  const body = new THREE.Group();
  const r = m.hoodie ? 0.285 : 0.272;
  body.add(mesh(new THREE.CylinderGeometry(r, r + 0.01, 0.44, 18, 1, true), cloth, 0, TORSO_Y - 0.06, 0, false));
  body.add(mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0.2 * Math.PI, 0.3 * Math.PI), cloth, 0, TORSO_Y + 0.14, 0, false));
  const p = printOf(id);
  const front = mesh(new THREE.PlaneGeometry(0.24, 0.24), p.front, 0, TORSO_Y + 0.02, r + 0.012, false);
  body.add(front);
  if (p.back) {
    const back = mesh(new THREE.PlaneGeometry(0.3, 0.3), p.back, 0, TORSO_Y, -r - 0.012, false);
    back.rotation.y = Math.PI;
    body.add(back);
  }
  if (m.hoodie) {
    // The hood lying on the shoulders at the back, the drawstrings, the pocket.
    const hood = mesh(new THREE.SphereGeometry(0.2, 14, 10), cloth, 0, TORSO_Y + 0.33, -0.17, false);
    hood.scale.set(1.25, 0.6, 0.8);
    body.add(hood);
    for (const s of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), toon('#f4ead8'), s * 0.06, TORSO_Y + 0.22, r + 0.005, false));
    body.add(mesh(box3(0.26, 0.09, 0.02), toon(shade(m.color)), 0, TORSO_Y - 0.17, r + 0.006));
  }
  const sleeve = () => {
    const len = m.hoodie ? 0.3 : 0.15;
    return mesh(new THREE.CylinderGeometry(0.097, 0.1, len, 10, 1, true), cloth, 0, -len / 2 + 0.02, 0, false);
  };
  return { body, armL: sleeve(), armR: sleeve() };
}

const box3 = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const shade = (hex: string) => `#${new THREE.Color(hex).multiplyScalar(0.8).getHexString()}`;

/** The stamp on the back of the right hand: a little glowing mark and its halo, the colour of the night's ink. */
function stampParts(): THREE.Object3D {
  if (!stampMat) {
    stampMat = new THREE.MeshBasicMaterial({
      map: canvasTexture(64, 64, (g) => {
        g.strokeStyle = '#7df9ff';
        g.fillStyle = '#7df9ff';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(32, 32, 26, 0, Math.PI * 2);
        g.stroke();
        drawLogo(g, 32, 34, 44, '#7df9ff', false);
      }),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    stampMat.toneMapped = false;
    stampMat.userData.outlineParameters = { visible: false };
    stampGlow = new THREE.SpriteMaterial({ map: softDot(), color: '#38e8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
  }
  const g = new THREE.Group();
  const s = mesh(new THREE.CircleGeometry(0.045, 16), stampMat, -0.084, -0.31, 0.01, false);
  s.rotation.y = -Math.PI / 2;
  g.add(s);
  const halo = new THREE.Sprite(stampGlow!);
  halo.position.set(-0.1, -0.31, 0.01);
  halo.scale.setScalar(0.16);
  g.add(halo);
  return g;
}

export class VenueWearing {
  /** Peer id → what they have on. */
  private wear = new Map<string, VenueWear>();
  private worn = new Map<string, Worn>();

  of(id: string): VenueWear {
    return this.wear.get(id) ?? {};
  }

  set(id: string, w: VenueWear) {
    if (Object.keys(w).length) this.wear.set(id, { ...w });
    else this.wear.delete(id);
  }

  /** Everyone's, as the office says (the house's own staff, `npc-…`, keep theirs). */
  reset(all: Record<string, VenueWear>) {
    const staff = [...this.wear].filter(([id]) => id.startsWith('npc-'));
    this.wear = new Map([...Object.entries(all), ...staff]);
  }

  /** Every cloakroom ticket handed out: its number and whose. */
  coats(): { id: string; tag: number }[] {
    return [...this.wear].filter(([, w]) => w.coat).map(([id, w]) => ({ id, tag: w.coat! }));
  }

  /** Each frame: the people this page draws (their bodies may come and go), dressed as the office says. */
  dress(people: { id: string; person: Person | undefined }[]) {
    const here = new Set<string>();
    for (const { id, person } of people) {
      if (!person) continue;
      here.add(id);
      const w = this.wear.get(id);
      const key = w ? `${w.shirt ?? ''}|${w.stamp ? 1 : 0}` : '';
      const was = this.worn.get(id);
      if (was && (was.person !== person || was.key !== key)) this.takeOff(id);
      if (key && key !== '|0' && !this.worn.has(id)) this.worn.set(id, { person, key, parts: putOn(person, w!) });
    }
    for (const id of [...this.worn.keys()]) if (!here.has(id)) this.takeOff(id);
  }

  private takeOff(id: string) {
    const w = this.worn.get(id);
    if (!w) return;
    for (const p of w.parts) p.removeFromParent();
    this.worn.delete(id);
  }
}

/** Dresses one Person (the photo booth's stand-ins too): what goes where, to take off again. */
export function putOn(person: Person, w: VenueWear): THREE.Object3D[] {
  const { body, armL, armR } = person.limbs();
  const out: THREE.Object3D[] = [];
  if (w.shirt && MERCH_BY_ID.has(w.shirt)) {
    const s = shirtParts(w.shirt);
    body.add(s.body);
    armL.add(s.armL);
    armR.add(s.armR);
    out.push(s.body, s.armL, s.armR);
  }
  if (w.stamp) {
    // The character's right arm is armL (person.ts: forward is +z, their left arm is the one on +x).
    const st = stampParts();
    armL.add(st);
    out.push(st);
  }
  return out;
}

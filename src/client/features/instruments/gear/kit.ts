import * as THREE from 'three';
import { mergeByColor, mesh, toon } from '../../../world/toon';
import type { DrumPiece } from '../../../../shared/instruments-play';

// ---- A drum kit (flrnoh fork, see FORK.md "The instruments") --------------------------------------------
// A five-piece rock kit in real sizes, for a right-handed drummer sitting at the origin facing +z: a
// 22" bass drum with its pedal and a printed front head, a 14" snare on its stand, 12" and 13" toms
// on the bass drum, a 16" floor tom on legs, hi-hats on the left, a crash over them, a 20" ride on
// the right, the throne. Shells, heads, hoops, lugs, tension rods, stands and felts; everything that
// doesn't move merged into one mesh, the cymbals and the hat's top, the beater and the drums that
// shake when hit kept apart for the kit to play (see KitLook). Built once per finish and cloned.

export interface KitFinish {
  /** The shells' wrap. */
  shell: string;
  /** What's printed on the bass drum's front head. */
  logo: string;
  /** The logo's colours. */
  ink: string;
  head: string;
}

export const FINISHES: Record<string, KitFinish> = {
  stage: { shell: '#141217', logo: 'SCHALLWERK', ink: '#e8b931', head: '#151318' },
  red: { shell: '#8e1b22', logo: 'PROBE 1', ink: '#f2ede2', head: '#efeadf' },
  blue: { shell: '#1d4a86', logo: 'PROBE 2', ink: '#f2ede2', head: '#efeadf' },
  pearl: { shell: '#e6e1d4', logo: 'PROBE 3', ink: '#25222b', head: '#efeadf' },
  wood: { shell: '#8a5a2e', logo: 'STUDIO', ink: '#f6e6c8', head: '#efeadf' },
};

const CHROME = '#c9ced8';
const STAND = '#2b2c33';
const BRASS = '#d4a640';
const FELT = '#7a2230';

/** Where each piece sits (its middle), in the drummer's frame. */
export const KIT_AT: Record<DrumPiece | 'throne', THREE.Vector3> = {
  throne: new THREE.Vector3(0, 0.52, -0.08),
  kick: new THREE.Vector3(0, 0.29, 0.62),
  snare: new THREE.Vector3(0.2, 0.64, 0.3),
  hihat: new THREE.Vector3(0.5, 0.95, 0.26),
  openhat: new THREE.Vector3(0.5, 0.95, 0.26),
  tomHi: new THREE.Vector3(0.14, 0.82, 0.58),
  tomMid: new THREE.Vector3(-0.19, 0.82, 0.6),
  tomLow: new THREE.Vector3(-0.46, 0.5, 0.32),
  crash: new THREE.Vector3(0.56, 1.32, 0.66),
  ride: new THREE.Vector3(-0.64, 1.18, 0.58),
};

/** The moving parts, by name in the kit's group (found again on every clone). */
const MOVING = ['crash', 'ride', 'hatTop', 'beater', 'snare', 'tomHi', 'tomMid', 'tomLow', 'kickDrum'] as const;
export type KitPart = (typeof MOVING)[number];

/** A drum: shell, both heads, hoops, lugs, rods; axis along y, batter head up (+y). */
function drum(r: number, depth: number, shell: THREE.Material, head: THREE.Material, lugs: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, depth, 32, 1, true), shell));
  const top = mesh(new THREE.CircleGeometry(r * 0.985, 32), toon('#efeadf'));
  top.rotation.x = -Math.PI / 2;
  top.position.y = depth / 2 + 0.002;
  const bottom = mesh(new THREE.CircleGeometry(r * 0.985, 32), head);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -depth / 2 - 0.002;
  g.add(top, bottom);
  const hoop = new THREE.TorusGeometry(r + 0.004, 0.009, 6, 36);
  for (const y of [depth / 2, -depth / 2]) {
    const h = mesh(hoop, toon(CHROME), 0, y, 0, false);
    h.rotation.x = Math.PI / 2;
    g.add(h);
  }
  const lug = new THREE.BoxGeometry(0.018, Math.min(0.07, depth * 0.45), 0.022);
  const rod = new THREE.CylinderGeometry(0.004, 0.004, depth * 0.48, 5);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    const x = Math.cos(a) * (r + 0.008);
    const z = Math.sin(a) * (r + 0.008);
    const l = mesh(lug, toon(CHROME), x, 0, z, false);
    l.rotation.y = -a;
    g.add(l);
    for (const s of [1, -1]) g.add(mesh(rod, toon(CHROME), x, (s * depth) / 4, z, false));
  }
  return g;
}

/** A cymbal: a shallow cone with its bell, on its own (its stand's tilt is the caller's). */
function cymbal(r: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bow = mesh(new THREE.CylinderGeometry(r * 0.16, r, r * 0.08, 40, 1, true), mat);
  bow.position.y = -r * 0.04;
  const under = mesh(new THREE.CircleGeometry(r, 40), mat);
  under.rotation.x = Math.PI / 2;
  under.position.y = -r * 0.08;
  const bell = mesh(new THREE.SphereGeometry(r * 0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  bell.scale.y = 0.55;
  g.add(bow, under, bell);
  // The grooves' sheen: a ring lighter than the rest.
  const ring = mesh(new THREE.RingGeometry(r * 0.55, r * 0.62, 40), toon('#f0cf74'), 0, -r * 0.035 + 0.001, 0, false);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  return g;
}

/** A tripod stand: legs from `y0` (where the legs meet the tube), the tube up to `top`. */
function stand(top: number, spread = 0.26, y0 = 0.28): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(STAND);
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, top - y0 + 0.05, 8), mat, 0, (top + y0) / 2, 0));
  const legLen = Math.hypot(spread, y0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = mesh(new THREE.CylinderGeometry(0.009, 0.009, legLen, 6), mat, (Math.cos(a) * spread) / 2, y0 / 2, (Math.sin(a) * spread) / 2);
    // Point the cylinder (along y) from the foot to the joint.
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a) * spread, y0, -Math.sin(a) * spread).normalize());
    g.add(leg);
    g.add(mesh(new THREE.SphereGeometry(0.014, 6, 4), toon('#111'), Math.cos(a) * spread, 0.008, Math.sin(a) * spread, false));
  }
  return g;
}

/** A canvas for the bass drum's front head: the band's (here the room's) name round a ring. */
function headTexture(f: KitFinish): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = f.head;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = f.ink;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 100, 0, Math.PI * 2);
  g.stroke();
  // The port hole, low and off-centre, as a real resonant head has.
  g.fillStyle = '#060507';
  g.beginPath();
  g.arc(168, 178, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = f.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${f.logo.length > 8 ? 30 : 40}px "Arial Black", Impact, sans-serif`;
  g.fillText(f.logo, 128, 112);
  g.font = '700 16px Arial, sans-serif';
  g.fillText('★ ROCK ★', 128, 146);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const templates = new Map<string, THREE.Group>();

/** A kit in `finish` (a clone of the one built for it: geometry and materials shared). */
export function drumKit(finish: keyof typeof FINISHES): THREE.Group {
  let t = templates.get(finish);
  if (!t) templates.set(finish, (t = buildKit(FINISHES[finish])));
  return t.clone();
}

function buildKit(f: KitFinish): THREE.Group {
  const kit = new THREE.Group();
  kit.name = 'drumkit';
  const still = new THREE.Group();
  const shell = toon(f.shell);
  const reso = toon(f.head);
  const chrome = toon(CHROME);
  const brass = toon(BRASS);

  // The bass drum, on its side, its front head toward the hall, on two spurs.
  const kick = drum(0.28, 0.42, shell, reso, 10);
  kick.rotation.x = -Math.PI / 2; // the batter head (its +y) to the drummer, the front head to the hall
  kick.position.copy(KIT_AT.kick);
  kick.name = 'kickDrum';
  const front = mesh(new THREE.CircleGeometry(0.276, 32), new THREE.MeshToonMaterial({ map: headTexture(f) }), 0, -0.214, 0, false);
  front.rotation.x = Math.PI / 2;
  kick.add(front);
  kit.add(kick);
  for (const s of [-1, 1]) {
    const spur = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), chrome, s * 0.3, 0.13, KIT_AT.kick.z + 0.08);
    spur.rotation.z = s * 0.65;
    still.add(spur);
  }
  // The pedal: its footboard, frame and the beater on its shaft.
  still.add(mesh(new THREE.BoxGeometry(0.09, 0.02, 0.26), toon('#3a3b42'), 0, 0.03, KIT_AT.kick.z - 0.36));
  still.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.025), chrome, 0, 0.12, KIT_AT.kick.z - 0.25));
  const beater = new THREE.Group();
  beater.name = 'beater';
  beater.position.set(0, 0.2, KIT_AT.kick.z - 0.25);
  beater.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 5), chrome, 0, 0.1, 0, false));
  beater.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), toon('#e9e4d8'), 0, 0.2, 0, false));
  beater.rotation.x = -0.45;
  kit.add(beater);

  // The snare on its stand, tipped a little toward the drummer, its snare throw-off on the side.
  still.add(stand(KIT_AT.snare.y - 0.08, 0.24, 0.24).translateX(KIT_AT.snare.x).translateZ(KIT_AT.snare.z));
  const snare = drum(0.178, 0.13, chrome, reso, 10);
  snare.position.copy(KIT_AT.snare);
  snare.rotation.x = -0.12;
  snare.rotation.z = -0.08;
  snare.name = 'snare';
  snare.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), toon('#111'), 0.19, 0, 0, false));
  kit.add(snare);

  // The toms on the bass drum, tipped toward the drummer, on their arms.
  for (const [name, r, depth] of [
    ['tomHi', 0.152, 0.2],
    ['tomMid', 0.165, 0.22],
  ] as const) {
    const at = KIT_AT[name];
    const tom = drum(r, depth, shell, reso, 6);
    tom.position.copy(at);
    tom.rotation.x = -0.42;
    tom.rotation.z = name === 'tomHi' ? -0.12 : 0.12;
    tom.name = name;
    kit.add(tom);
    const arm = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), chrome, at.x * 0.55, KIT_AT.kick.y + 0.36, at.z - 0.02);
    arm.rotation.z = -at.x * 1.6;
    still.add(arm);
  }
  still.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), chrome, 0, KIT_AT.kick.y + 0.27, KIT_AT.kick.z - 0.05));

  // The floor tom on its three legs.
  const floor = drum(0.2, 0.38, shell, reso, 8);
  floor.position.copy(KIT_AT.tomLow);
  floor.rotation.x = -0.05;
  floor.name = 'tomLow';
  kit.add(floor);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const leg = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.52, 5), chrome, KIT_AT.tomLow.x + Math.cos(a) * 0.23, 0.26, KIT_AT.tomLow.z + Math.sin(a) * 0.23);
    leg.rotation.z = Math.cos(a) * 0.12;
    leg.rotation.x = -Math.sin(a) * 0.12;
    still.add(leg);
  }

  // The hi-hat: its stand and pedal, the bottom cymbal still, the top one on the clutch.
  const hat = KIT_AT.hihat;
  still.add(stand(hat.y - 0.04, 0.3, 0.3).translateX(hat.x).translateZ(hat.z));
  still.add(mesh(new THREE.BoxGeometry(0.08, 0.02, 0.24), toon('#3a3b42'), hat.x, 0.03, hat.z - 0.22));
  const bottomHat = cymbal(0.18, brass);
  bottomHat.position.set(hat.x, hat.y - 0.02, hat.z);
  bottomHat.rotation.x = Math.PI; // upside down: the pair cups together
  still.add(bottomHat);
  const hatTop = cymbal(0.18, brass);
  hatTop.name = 'hatTop';
  hatTop.position.set(hat.x, hat.y + 0.012, hat.z);
  hatTop.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 5), chrome, 0, 0.06, 0, false));
  kit.add(hatTop);

  // Crash and ride on boom stands, tilted toward the drummer, on their felts.
  for (const [name, r, tiltX, tiltZ] of [
    ['crash', 0.23, -0.32, 0.22],
    ['ride', 0.27, -0.22, -0.18],
  ] as const) {
    const at = KIT_AT[name];
    const foot = new THREE.Vector3(at.x * 1.25, 0, at.z + 0.18);
    still.add(stand(at.y - 0.36, 0.3, 0.3).translateX(foot.x).translateZ(foot.z));
    const boom = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.46, 6), toon(STAND), (foot.x + at.x) / 2, at.y - 0.18, (foot.z + at.z) / 2);
    boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(at.x - foot.x, 0.36, at.z - foot.z).normalize());
    still.add(boom);
    const c = cymbal(r, brass);
    c.name = name;
    c.position.copy(at);
    c.rotation.set(tiltX, 0, tiltZ);
    c.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), toon(FELT), 0, 0.03, 0, false));
    kit.add(c);
  }

  // The throne: a round padded seat on a tripod.
  const th = KIT_AT.throne;
  still.add(stand(th.y - 0.06, 0.28, 0.24).translateX(th.x).translateZ(th.z));
  still.add(mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.08, 20), toon('#1a1a1f'), th.x, th.y - 0.02, th.z));
  still.add(mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 24), toon('#3b3c44'), th.x, th.y + 0.015, th.z).rotateX(Math.PI / 2));

  kit.add(mergeByColor(still));
  return kit;
}

/** What a kit's player moves: the cymbals swing, the hat opens and closes, the beater swings, the drums jump a little. */
export class KitLook {
  private parts = new Map<KitPart, { o: THREE.Object3D; base: THREE.Euler; y: number; k: number }>();
  private open = 0;
  private openWant = 0;

  constructor(kit: THREE.Object3D) {
    for (const name of MOVING) {
      const o = kit.getObjectByName(name);
      if (o) this.parts.set(name, { o, base: o.rotation.clone(), y: o.position.y, k: 0 });
    }
  }

  /** A piece was hit, `vel` 0..1. */
  hit(piece: DrumPiece, vel: number) {
    const part: KitPart = piece === 'hihat' || piece === 'openhat' ? 'hatTop' : piece === 'kick' ? 'beater' : piece;
    const p = this.parts.get(part);
    if (p) p.k = Math.min(1.4, p.k + 0.5 + vel * 0.7);
    if (piece === 'kick') {
      const d = this.parts.get('kickDrum');
      if (d) d.k = Math.min(1, d.k + vel * 0.6);
    }
    if (piece === 'openhat') this.openWant = 1;
    if (piece === 'hihat') this.openWant = 0;
  }

  update(dt: number, t: number) {
    this.open += (this.openWant - this.open) * Math.min(1, dt * 18);
    for (const [name, p] of this.parts) {
      p.k *= Math.exp(-dt * (name === 'crash' || name === 'ride' ? 2.2 : name === 'beater' ? 22 : 14));
      const k = p.k;
      if (name === 'crash' || name === 'ride') {
        p.o.rotation.x = p.base.x + Math.sin(t * 9) * k * 0.14;
        p.o.rotation.z = p.base.z + Math.cos(t * 7.3) * k * 0.1;
      } else if (name === 'hatTop') {
        p.o.position.y = p.y + this.open * 0.025 - k * 0.006;
        p.o.rotation.z = p.base.z + Math.sin(t * 30) * k * 0.05 * (0.3 + this.open);
      } else if (name === 'beater') {
        p.o.rotation.x = p.base.x + k * 0.7;
      } else {
        p.o.position.y = p.y - k * 0.008;
        p.o.rotation.x = p.base.x + Math.sin(t * 40) * k * 0.012;
      }
    }
  }
}

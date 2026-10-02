import * as THREE from 'three';
import { mergeByColor, mesh, toon } from '../../../world/toon';

// ---- Guitars and basses (flrnoh fork, see FORK.md "The instruments") ---------------------------------
// Solid-body electrics in real sizes: a double-cutaway body (its front in a finish of its own, a
// sunburst drawn on a canvas), a bolt-on neck with its fretboard, frets and inlays, the headstock with
// its tuners, pickguard, pickups, bridge, knobs and the strings. A guitar's 6 strings over a 25.5"
// neck, a bass's 4 over a 34" one. Each model stands upright at the origin (the body's middle),
// neck up (+y), its front to +z; built once per finish and cloned.

export type StringFinish = 'sunburst' | 'red' | 'white' | 'black' | 'goldtop' | 'blue' | 'natural';

const FINISH: Record<StringFinish, { body: string; edge: string; guard: string; board: string }> = {
  sunburst: { body: '#e3a43a', edge: '#2a120a', guard: '#f3efe6', board: '#3b2417' },
  red: { body: '#b3152a', edge: '#b3152a', guard: '#f3efe6', board: '#e2c08a' },
  white: { body: '#ece7da', edge: '#ece7da', guard: '#1c1b20', board: '#3b2417' },
  black: { body: '#16151a', edge: '#16151a', guard: '#f3efe6', board: '#3b2417' },
  goldtop: { body: '#d2b25a', edge: '#5a2c12', guard: '#2a1a12', board: '#3b2417' },
  blue: { body: '#2f5f9e', edge: '#2f5f9e', guard: '#f3efe6', board: '#e2c08a' },
  natural: { body: '#d9b27c', edge: '#8b5a2b', guard: '#1c1b20', board: '#3b2417' },
};

const CHROME = '#d3d7df';
const DEPTH = 0.042;

/** The body's outline (x across, y along the guitar): a double cutaway, the bass horn the longer. */
function bodyShape(s: number): THREE.Shape {
  const p = (x: number, y: number): [number, number] => [x * s, y * s];
  const sh = new THREE.Shape();
  sh.moveTo(...p(0, -0.23));
  sh.bezierCurveTo(...p(0.12, -0.235), ...p(0.172, -0.18), ...p(0.168, -0.085));
  sh.bezierCurveTo(...p(0.164, -0.01), ...p(0.112, 0.02), ...p(0.116, 0.08));
  sh.bezierCurveTo(...p(0.12, 0.14), ...p(0.152, 0.19), ...p(0.124, 0.232));
  sh.bezierCurveTo(...p(0.096, 0.27), ...p(0.06, 0.21), ...p(0.046, 0.15));
  sh.lineTo(...p(-0.046, 0.15));
  sh.bezierCurveTo(...p(-0.07, 0.24), ...p(-0.112, 0.31), ...p(-0.142, 0.272));
  sh.bezierCurveTo(...p(-0.172, 0.226), ...p(-0.122, 0.13), ...p(-0.122, 0.072));
  sh.bezierCurveTo(...p(-0.122, 0.0), ...p(-0.174, -0.04), ...p(-0.17, -0.1));
  sh.bezierCurveTo(...p(-0.166, -0.19), ...p(-0.1, -0.232), ...p(0, -0.23));
  return sh;
}

/** The front's finish: a sunburst (or a goldtop's, a natural wood's grain), on a canvas over the body's outline. */
function finishTexture(f: (typeof FINISH)[StringFinish], s: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 140, 20, 128, 128, 128);
  grad.addColorStop(0, f.body);
  grad.addColorStop(0.55, f.body);
  grad.addColorStop(0.8, f.edge === f.body ? f.body : '#8a3a12');
  grad.addColorStop(1, f.edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // The shape's coordinates are its UVs: map the body's box (±0.2·s across, -0.25·s…0.32·s along) onto the canvas.
  t.repeat.set(1 / (0.4 * s), 1 / (0.57 * s));
  t.offset.set(0.5, 0.25 / 0.57);
  return t;
}

const templates = new Map<string, THREE.Group>();

/** A guitar (`bass` false) or a bass in `finish`. */
export function stringed(bass: boolean, finish: StringFinish): THREE.Group {
  const key = `${bass ? 'bass' : 'guitar'}|${finish}`;
  let t = templates.get(key);
  if (!t) templates.set(key, (t = build(bass, finish)));
  return t.clone();
}

function build(bass: boolean, finish: StringFinish): THREE.Group {
  const f = FINISH[finish];
  const g = new THREE.Group();
  g.name = bass ? 'bass' : 'guitar';
  const still = new THREE.Group();
  const s = bass ? 1.12 : 1;
  const shape = bodyShape(s);
  // The body: its front and back in the finish, its sides in the edge's colour.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.007, bevelSegments: 2, curveSegments: 18 });
  geo.translate(0, 0, -DEPTH / 2);
  const front = new THREE.MeshToonMaterial({ map: finishTexture(f, s) });
  const body = mesh(geo, [front, toon(f.edge)] as unknown as THREE.Material);
  g.add(body);
  const top = DEPTH / 2 + 0.008;
  // The pickguard: the body's outline shrunk, on the lower half and round the neck.
  const guardShape = bodyShape(s * 0.7);
  const guard = mesh(new THREE.ShapeGeometry(guardShape, 12), toon(f.guard), 0.03 * s, -0.045 * s, top + 0.001);
  guard.scale.set(0.82, 1, 1);
  still.add(guard);
  // The neck, bolted on: maple at the back, the fretboard on its front.
  const scale = bass ? 0.86 : 0.648;
  const neckFrom = 0.15 * s - 0.04;
  const nut = neckFrom + scale * 0.74;
  const neckLen = nut - neckFrom;
  const w0 = bass ? 0.06 : 0.056;
  const w1 = bass ? 0.042 : 0.045;
  const neckGeo = new THREE.CylinderGeometry(w1 / 2, w0 / 2, neckLen, 4, 1);
  neckGeo.rotateY(Math.PI / 4);
  neckGeo.scale(1, 1, 0.42);
  still.add(mesh(neckGeo, toon('#e8c890'), 0, neckFrom + neckLen / 2, top - 0.006));
  const board = new THREE.BoxGeometry(1, neckLen, 0.006);
  // A tapering board: squeeze the top end.
  const pos = board.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (pos.getY(i) > 0 ? w1 : w0));
  still.add(mesh(board, toon(f.board), 0, neckFrom + neckLen / 2, top + 0.006));
  // Frets where a real one has them (from the nut, 12-tone), and the inlay dots.
  const frets = bass ? 20 : 22;
  for (let n = 1; n <= frets; n++) {
    const d = scale * (1 - Math.pow(2, -n / 12));
    const y = nut - d;
    if (y < neckFrom + 0.01) break;
    const w = w1 + ((w0 - w1) * (nut - y)) / neckLen;
    still.add(mesh(new THREE.BoxGeometry(w, 0.0025, 0.003), toon(CHROME), 0, y, top + 0.0095, false));
    if ([3, 5, 7, 9, 15, 17].includes(n) || n === 12) {
      const mid = y + (scale * (Math.pow(2, -(n - 1) / 12) - Math.pow(2, -n / 12))) / 2;
      for (const dx of n === 12 ? [-0.012, 0.012] : [0]) still.add(mesh(new THREE.CircleGeometry(0.0045, 10), toon('#f1ead8'), dx, mid, top + 0.0094, false));
    }
  }
  // The nut, the headstock (angled back a touch) and its tuners down one side.
  still.add(mesh(new THREE.BoxGeometry(w1, 0.005, 0.01), toon('#f1ead8'), 0, nut + 0.002, top + 0.007, false));
  const headLen = bass ? 0.21 : 0.18;
  const head = new THREE.Group();
  head.position.set(0, nut, top - 0.006);
  head.rotation.x = -0.12;
  const hs = new THREE.Shape();
  hs.moveTo(-w1 / 2, 0);
  hs.lineTo(w1 / 2, 0);
  hs.bezierCurveTo(w1 / 2 + 0.01, headLen * 0.4, w1 / 2 + 0.03, headLen * 0.9, w1 / 2 + 0.012, headLen);
  hs.bezierCurveTo(-0.01, headLen + 0.012, -0.04, headLen * 0.9, -w1 / 2 - 0.035, headLen * 0.78);
  hs.bezierCurveTo(-w1 / 2 - 0.02, headLen * 0.5, -w1 / 2, headLen * 0.25, -w1 / 2, 0);
  const headGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.014, bevelEnabled: false, curveSegments: 10 });
  head.add(mesh(headGeo, toon(finish === 'black' || finish === 'white' ? f.body : '#e8c890'), 0, 0, -0.007));
  const strings = bass ? 4 : 6;
  for (let i = 0; i < strings; i++) {
    const y = headLen * (0.22 + (0.7 * i) / strings);
    const peg = mesh(new THREE.CylinderGeometry(bass ? 0.009 : 0.006, bass ? 0.009 : 0.006, 0.03, 8), toon(CHROME), -w1 / 2 - 0.022, y, 0.012, false);
    peg.rotation.x = Math.PI / 2;
    head.add(peg);
    const key = mesh(new THREE.BoxGeometry(bass ? 0.03 : 0.022, 0.012, 0.006), toon(CHROME), -w1 / 2 - 0.048, y, -0.002, false);
    head.add(key);
  }
  still.add(head);
  // Pickups: three single coils on a guitar (two humbuckers on a goldtop), a split coil on a bass.
  const pick = toon(finish === 'goldtop' ? '#e9e2cf' : '#1b1a1f');
  if (bass) {
    still.add(mesh(new THREE.BoxGeometry(0.03, 0.022, 0.012), pick, -0.012 * s, -0.02 * s, top + 0.005));
    still.add(mesh(new THREE.BoxGeometry(0.03, 0.022, 0.012), pick, 0.012 * s, -0.04 * s, top + 0.005));
  } else if (finish === 'goldtop') {
    for (const y of [0.075, -0.08]) still.add(mesh(new THREE.BoxGeometry(0.07, 0.038, 0.014), pick, 0, y, top + 0.006));
  } else {
    for (const [y, r] of [
      [0.085, 0],
      [0.03, 0],
      [-0.055, 0.15],
    ] as const) {
      const pu = mesh(new THREE.BoxGeometry(0.068, 0.017, 0.012), pick, 0, y, top + 0.006);
      pu.rotation.z = r;
      still.add(pu);
    }
  }
  // The bridge, the knobs and the jack.
  const bridgeY = (bass ? -0.13 : -0.115) * s;
  still.add(mesh(new THREE.BoxGeometry(bass ? 0.07 : 0.07, 0.04, 0.01), toon(CHROME), 0, bridgeY, top + 0.004));
  for (const [x, y] of [
    [0.09, -0.11],
    [0.105, -0.155],
    [0.07, -0.185],
  ] as const) {
    const k = mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.014, 12), toon(bass ? '#1b1a1f' : '#f1ead8'), x * s, y * s, top + 0.009, false);
    k.rotation.x = Math.PI / 2;
    still.add(k);
  }
  // The strings, nut to bridge.
  const strMat = new THREE.MeshBasicMaterial({ color: '#e9eef5' });
  strMat.userData.outlineParameters = { visible: false };
  for (let i = 0; i < strings; i++) {
    const k = i / (strings - 1) - 0.5;
    const xa = k * (w1 - 0.012);
    const xb = k * (bass ? 0.05 : 0.054);
    const len = nut - bridgeY;
    const str = new THREE.Mesh(new THREE.BoxGeometry(bass ? 0.0018 : 0.001, len, bass ? 0.0018 : 0.001), strMat);
    str.position.set((xa + xb) / 2, (nut + bridgeY) / 2, top + 0.014);
    str.rotation.z = Math.atan2(xa - xb, len);
    g.add(str);
  }
  g.add(mergeByColor(still));
  return g;
}

/** An A-frame guitar stand: the neck rests in its yoke at `neckY`, the body on its padded arms. */
export function guitarStand(neckY: number): THREE.Group {
  const key = `stand|${neckY.toFixed(2)}`;
  let t = templates.get(key);
  if (!t) {
    t = new THREE.Group();
    const still = new THREE.Group();
    const mat = toon('#1d1d22');
    // The upright, leaning back a little, and its yoke.
    const up = mesh(new THREE.CylinderGeometry(0.01, 0.012, neckY, 8), mat, 0, neckY / 2, -0.09);
    up.rotation.x = 0.12;
    still.add(up);
    still.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), toon('#2b2b30'), 0, neckY + 0.01, -0.04).rotateX(Math.PI));
    // Two legs back, the cradle's two arms forward.
    for (const s of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 6), mat, s * 0.1, 0.1, -0.18);
      leg.rotation.set(-0.5, 0, s * 0.45);
      still.add(leg);
      const arm = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 6), mat, s * 0.09, 0.07, 0.04);
      arm.rotation.set(1.25, 0, s * 0.5);
      still.add(arm);
      still.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 8), toon('#8a1d23'), s * 0.12, 0.09, 0.12).rotateX(Math.PI / 2));
    }
    t.add(mergeByColor(still));
    templates.set(key, t);
  }
  return t.clone();
}

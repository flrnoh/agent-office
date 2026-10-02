import * as THREE from 'three';
import { BALLS, BALL_RADIUS, PIN_HEIGHT, type HouseBall } from '../../../shared/bowling-game';
import { canvasTexture } from '../../world/texture';
import { toonUnique } from '../../world/toon';

/*
 * The bowling game's props (flrnoh fork, see FORK.md "Bowling lanes"): the pin, turned on a lathe
 * from the real profile (15 inches, 4.77 at the belly, the neck down to 1.8) with its two red neck
 * stripes, and the house balls, each its own colours and finish (glitter, marble, pearl or swirl),
 * glossy, with three finger holes. Cosmic bowling makes both glow under the black light.
 */

const IN = 0.0254;
/** The pin's profile: height and diameter in inches, bottom to top. */
const PROFILE: [number, number][] = [
  [0, 2.03], [0.4, 2.6], [1.2, 3.25], [2.25, 3.85], [3.375, 4.45], [4.5, 4.77], [5.6, 4.6], [6.6, 4.05], [7.6, 3.2],
  [8.6, 2.35], [9.4, 1.95], [10, 1.8], [10.8, 1.9], [11.7, 2.2], [12.6, 2.45], [13.4, 2.5], [14.1, 2.3], [14.6, 1.8], [14.9, 1.05], [15, 0],
];

let pinGeo: THREE.LatheGeometry | null = null;
/** The pin, standing on its base at the origin; its uv's v runs up it (0 at the base, 1 at the crown). */
export function pinGeometry(): THREE.LatheGeometry {
  if (pinGeo) return pinGeo;
  const curve = new THREE.SplineCurve(PROFILE.map(([h, d]) => new THREE.Vector2((d / 2) * IN, h * IN)));
  const pts = curve.getSpacedPoints(46);
  pts[0].set((PROFILE[0][1] / 2) * IN, 0);
  pts.unshift(new THREE.Vector2(0, 0));
  pts[pts.length - 1].set(0, PIN_HEIGHT);
  const g = new THREE.LatheGeometry(pts, 22);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / PIN_HEIGHT);
  g.computeVertexNormals();
  return (pinGeo = g);
}

/** White up the pin, the two red stripes round the neck; `cosmic` paints them in neon. */
function pinTexture(cosmic: boolean): THREE.CanvasTexture {
  return canvasTexture(4, 512, (g) => {
    g.fillStyle = cosmic ? '#e9dcff' : '#fbfaf6';
    g.fillRect(0, 0, 4, 512);
    const band = (from: number, to: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(0, 512 - (to / 15) * 512, 4, ((to - from) / 15) * 512);
    };
    band(9.05, 9.5, cosmic ? '#ff2bd6' : '#c8102e');
    band(10.25, 10.7, cosmic ? '#ff2bd6' : '#c8102e');
  });
}

let pinMats: { normal: THREE.MeshToonMaterial; day: THREE.Texture; cosmic: THREE.Texture } | null = null;
/** The pins' material (one for all of them), and its black-light look. */
export function pinMaterial(): THREE.MeshToonMaterial {
  if (!pinMats) {
    const m = toonUnique('#ffffff');
    const day = pinTexture(false);
    m.map = day;
    m.emissive = new THREE.Color('#2a2a2a'); // the deck's lit from the masking unit: the pins shine
    pinMats = { normal: m, day, cosmic: pinTexture(true) };
  }
  return pinMats.normal;
}

// ---- Balls ---------------------------------------------------------------------------------------

/** A few sines on top of each other: turbulence enough for marble, and the same every time. */
const wave = (x: number, y: number) => Math.sin(x * 3.1 + Math.sin(y * 2.3) * 1.7) + 0.5 * Math.sin(y * 5.7 + Math.sin(x * 4.1) * 2.1) + 0.25 * Math.sin((x + y) * 11.3);

/** A ball's skin, round it (u) and pole to pole (v), with its three holes. */
function ballTexture(b: HouseBall): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  return canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    const c0 = new THREE.Color(b.colors[0]);
    const c1 = new THREE.Color(b.colors[1]);
    const c = new THREE.Color();
    let seed = b.id * 977 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x / W) * Math.PI * 2;
        const v = (y / H) * Math.PI;
        let k: number;
        if (b.finish === 'marble') k = 0.5 + 0.5 * Math.sin(u * 2 + v * 3 + wave(u, v) * 1.6);
        else if (b.finish === 'swirl') k = Math.pow(0.5 + 0.5 * Math.sin(u * 3 + v * 6 + Math.sin(v * 2 + u) * 2.4), 3);
        else if (b.finish === 'pearl') k = 0.35 + 0.3 * Math.sin(u * 1.5 + wave(u * 0.7, v) * 0.9);
        else k = 0.25 + 0.2 * Math.sin(u + v * 2);
        c.copy(c0).lerp(c1, Math.max(0, Math.min(1, k)));
        if (b.finish === 'glitter' && rnd() < 0.05) c.lerp(new THREE.Color('#ffffff'), 0.4 + rnd() * 0.5);
        const i = (y * W + x) * 4;
        img.data[i] = c.r * 255;
        img.data[i + 1] = c.g * 255;
        img.data[i + 2] = c.b * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // The finger holes, near the top of the ball, and the thumb hole below them.
    g.fillStyle = '#0b0b10';
    for (const [x, y, r] of [[W * 0.22, H * 0.3, 5], [W * 0.28, H * 0.3, 5], [W * 0.25, H * 0.44, 6]] as const) {
      g.beginPath();
      g.ellipse(x, y, r * 1.2, r, 0, 0, Math.PI * 2);
      g.fill();
    }
    // The weight in gold, like it's engraved.
    g.fillStyle = 'rgba(255,230,160,.85)';
    g.font = '700 9px Nunito, system-ui, sans-serif';
    g.fillText(`${b.lbs}`, W * 0.235, H * 0.62);
  });
}

/** Sparkles that catch the light as the ball turns (glitter), or a soft sheen (the rest). */
function sparkle(m: THREE.MeshPhongMaterial, amount: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.sparkle = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float sparkle;\nfloat bwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <opaque_fragment>',
        `#ifdef USE_MAP
        { vec2 cell = floor(vMapUv * vec2(420.0, 210.0));
          float h = bwHash(cell);
          float glint = step(0.93, h) * pow(max(0.0, dot(normalize(normal), normalize(vec3(0.3, 0.8, 0.6)))), 6.0);
          outgoingLight += vec3(glint * sparkle * (0.6 + 0.4 * sin(h * 40.0))); }
        #endif
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `bowl-sparkle-${amount}`;
}

const ballMats = new Map<number, THREE.MeshPhongMaterial>();
/** House ball `id`'s material (one per ball, shared by every one of it on the racks and lanes). */
export function ballMaterial(id: number): THREE.MeshPhongMaterial {
  let m = ballMats.get(id);
  if (!m) {
    const b = BALLS[id] ?? BALLS[0];
    m = new THREE.MeshPhongMaterial({ map: ballTexture(b), shininess: b.finish === 'pearl' ? 140 : 90, specular: new THREE.Color(b.finish === 'pearl' ? '#ffffff' : '#bbbbbb') });
    sparkle(m, b.finish === 'glitter' ? 1.4 : b.finish === 'pearl' ? 0.35 : 0.15);
    m.userData.cosmic = new THREE.Color(b.colors[0]).lerp(new THREE.Color(b.colors[1]), 0.5).multiplyScalar(0.9);
    ballMats.set(id, m);
  }
  return m;
}

let ballGeo: THREE.SphereGeometry | null = null;
export function ballGeometry(): THREE.SphereGeometry {
  return (ballGeo ??= new THREE.SphereGeometry(BALL_RADIUS, 28, 18));
}

/** A ball to put somewhere: its bottom at the origin's height + its radius (its middle at the origin). */
export function ballMesh(id: number): THREE.Mesh {
  const m = new THREE.Mesh(ballGeometry(), ballMaterial(id));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The black light: the pins glow violet-white with hot pink stripes, the balls in their own colours. */
export function cosmicProps(on: boolean) {
  const pin = pinMaterial();
  pin.map = on ? pinMats!.cosmic : pinMats!.day;
  pin.emissive.set(on ? '#bfaaff' : '#2a2a2a');
  pin.emissiveMap = on ? pinMats!.cosmic : null;
  pin.needsUpdate = true;
  for (const id of BALLS.map((b) => b.id)) {
    const m = ballMaterial(id);
    m.emissive.copy(on ? (m.userData.cosmic as THREE.Color) : new THREE.Color('#000000'));
    m.emissiveMap = on ? m.map : null;
    m.needsUpdate = true;
  }
}

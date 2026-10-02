import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HEART } from '../../../shared/coaster-route';
import type { CoasterTrack } from '../../../shared/coaster-track';
import { canvasTexture } from '../texture';
import { toon } from '../toon';
import { all, along, ribbon, tube, type Span } from './sweep';

// flrnoh fork (see FORK.md "Der Brecher"): DER BRECHER's track as it's drawn, built once per height of
// building: two tubular steel rails going round the rainbow (the facade's colors, a hue a few dozen
// metres) over a white spine, ties between them, a catwalk and a chain up the lift hill, the brakes'
// copper fins and the launch's blue ones under the spine, chase lights along both rails that race round
// at night, and the glass tube through the ground floor with its steel ribs.

/** The rails' and the spine's places across the track and down from the heartline. */
export const RAIL = { b: 0.55, n: -HEART, r: 0.07 } as const;
export const SPINE = { n: -HEART - 0.45, r: 0.18 } as const;
/** The tube through the ground floor: round, a little above the heartline. */
export const TUBE = { n: 0.1, r: 1.32 } as const;

export interface TrackView {
  group: THREE.Group;
  /** Each frame: `t` seconds on the page's clock, `dark` 0 by day to 1 at night, `chain` whether the chains run. */
  update(t: number, dark: number, dt: number): void;
  dispose(): void;
}

/** The facade's rainbow (world/facade/landmarks.ts), round and round the track. */
const RAINBOW = ['#ef476f', '#ff8a5b', '#ffd166', '#06d6a0', '#4cc9f0', '#8a5cff', '#f72585'].map((c) => new THREE.Color(c));
function rainbowAt(s: number, out: THREE.Color) {
  const k = (s / 26) % RAINBOW.length;
  const i = Math.floor(k);
  out.copy(RAINBOW[i]).lerp(RAINBOW[(i + 1) % RAINBOW.length], k - i);
}

/** The chase lights: a bulb every so often along both rails, racing round in the rainbow after dark. */
function chaseMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDark: { value: 0 } },
    vertexShader: `
      attribute float aAlong;
      varying float vAlong;
      void main() {
        vAlong = aAlong;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uDark;
      varying float vAlong;
      vec3 hue(float h) {
        vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return k;
      }
      void main() {
        // Bands of light racing round, the rainbow drifting the other way.
        float run = fract(vAlong / 9.0 - uTime * 1.6);
        float on = smoothstep(0.0, 0.08, run) * (1.0 - smoothstep(0.32, 0.5, run));
        vec3 c = mix(vec3(1.0), hue(fract(vAlong / 120.0 + uTime * 0.05)), 0.75);
        float lit = mix(0.25, 1.0, on);
        gl_FragColor = vec4(c * mix(0.55, 1.0, uDark) * mix(0.55, lit * 1.6, uDark), 1.0);
      }`,
  });
}

/** A chain's links for the lift hills, to scroll along as it runs. */
function chainTexture(): THREE.CanvasTexture {
  const t = canvasTexture(32, 64, (g) => {
    g.fillStyle = '#24262e';
    g.fillRect(0, 0, 32, 64);
    g.fillStyle = '#6c7280';
    for (let y = 0; y < 64; y += 16) {
      g.fillRect(9, y + 2, 14, 5);
      g.fillRect(13, y + 9, 6, 7);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}

/** The catwalk's grating. */
function gratingTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#9aa3ad';
    for (let x = 0; x <= 64; x += 8) g.fillRect(x - 1, 0, 2, 64);
    for (let y = 0; y <= 64; y += 16) g.fillRect(0, y - 2, 64, 4);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}

/** The kinds of zone that have a chain under them, and the ones with fins. */
const spansOf = (track: CoasterTrack, kinds: string[]): Span[] => track.zones.filter((z) => kinds.includes(z.kind)).map((z) => ({ from: z.from, to: z.to }));

export function buildTrack(track: CoasterTrack): TrackView {
  const group = new THREE.Group();
  group.name = 'coaster-track';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const add = (o: THREE.Object3D) => {
    o.traverse((m) => {
      (m as THREE.Mesh).castShadow = false;
      m.raycast = () => {};
    });
    group.add(o);
    return o;
  };
  const gradient = (toon('#ffffff') as THREE.MeshToonMaterial).gradientMap;
  const noOutline = (m: THREE.Material) => ((m.userData.outlineParameters = { visible: false }), m);

  // The rails, round the rainbow, and the spine.
  const railMat = keep(noOutline(new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: gradient })));
  const rails = keep(mergeGeometries([tube(track, all(track), -RAIL.b, RAIL.n, RAIL.r, 8, 0.5, rainbowAt), tube(track, all(track), RAIL.b, RAIL.n, RAIL.r, 8, 0.5, rainbowAt)]));
  add(new THREE.Mesh(rails, railMat));
  const steel = noOutline(toon('#eef1f5'));
  add(new THREE.Mesh(keep(tube(track, all(track), 0, SPINE.n, SPINE.r, 10, 0.5)), steel));
  // A tie every metre and a bit: across between the rails, and a web down to the spine.
  const tie = keep(
    mergeGeometries([
      new THREE.BoxGeometry(RAIL.b * 2, 0.07, 0.09).translate(0, RAIL.n - 0.02, 0),
      new THREE.BoxGeometry(0.08, SPINE.n - RAIL.n < 0 ? RAIL.n - SPINE.n : 0.4, 0.07).translate(0, (RAIL.n + SPINE.n) / 2, 0),
      new THREE.BoxGeometry(0.06, 0.4, 0.05).rotateZ(0.75).translate(0.24, (RAIL.n + SPINE.n) / 2 + 0.03, 0),
      new THREE.BoxGeometry(0.06, 0.4, 0.05).rotateZ(-0.75).translate(-0.24, (RAIL.n + SPINE.n) / 2 + 0.03, 0),
    ]),
  );
  add(along(track, [all(track)], 1.2, 0, 0, tie, steel));

  // Up the lift hill: the chain between the rails and a catwalk alongside with its railing.
  const lifts = spansOf(track, ['chain']);
  const chainTex = keep(chainTexture());
  const chainMat = keep(noOutline(new THREE.MeshBasicMaterial({ map: chainTex })));
  for (const sp of lifts) add(new THREE.Mesh(keep(ribbon(track, sp, 0, RAIL.n + 0.03, 0.2, 0.5)), chainMat));
  const walkway = lifts[0];
  if (walkway) {
    const grate = keep(noOutline(new THREE.MeshToonMaterial({ color: '#c3cad3', map: keep(gratingTexture()), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, gradientMap: gradient })));
    add(new THREE.Mesh(keep(ribbon(track, walkway, 1.12, RAIL.n - 0.12, 0.6, 0.5)), grate));
    add(new THREE.Mesh(keep(tube(track, walkway, 1.42, RAIL.n + 0.95, 0.035, 6, 0.5)), steel));
    add(new THREE.Mesh(keep(tube(track, walkway, 1.42, RAIL.n + 0.45, 0.025, 6, 0.5)), steel));
    add(along(track, [walkway], 1.6, 1.42, RAIL.n - 0.12, keep(new THREE.BoxGeometry(0.05, 1.07, 0.05).translate(0, 0.53, 0)), steel));
  }

  // Under the spine: the brakes' and trims' copper fins, the launch's blue ones.
  const fin = keep(new THREE.BoxGeometry(0.04, 0.3, 0.46).translate(0, SPINE.n - SPINE.r - 0.12, 0));
  add(along(track, spansOf(track, ['trim', 'brake', 'stop']), 0.55, 0, 0, fin, noOutline(toon('#c8773c'))));
  add(along(track, spansOf(track, ['boost', 'tires']), 0.55, 0, 0, fin, noOutline(toon('#3fa7ff', { emissive: '#1b6fd6' }))));

  // The chase lights, on the outside of both rails.
  const chase = keep(chaseMaterial());
  const bulb = keep(new THREE.SphereGeometry(0.055, 8, 6));
  const tunnel = track.zones.find((z) => z.kind === 'tunnel')!;
  const lightAt: Span[] = [
    { from: 0, to: tunnel.from },
    { from: tunnel.to, to: track.length },
  ];
  for (const side of [-1, 1]) {
    const m = along(track, lightAt, 1.4, side * (RAIL.b + 0.11), RAIL.n, bulb, chase);
    const n = m.count;
    const along_ = new Float32Array(n);
    let i = 0;
    for (const sp of lightAt) for (let s = sp.from; s < sp.to && i < n; s += 1.4) along_[i++] = s;
    m.geometry = bulb.clone();
    keep(m.geometry);
    m.geometry.setAttribute('aAlong', new THREE.InstancedBufferAttribute(along_, 1));
    m.frustumCulled = false;
    add(m);
  }

  // The glass tube through the ground floor, ribbed in steel every couple of metres.
  const glass = keep(new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
  noOutline(glass);
  const tubeSpan = { from: tunnel.from, to: tunnel.to };
  const shell = add(new THREE.Mesh(keep(tube(track, tubeSpan, 0, TUBE.n, TUBE.r, 24, 0.5)), glass));
  shell.renderOrder = 2;
  const rib = keep(new THREE.TorusGeometry(TUBE.r + 0.02, 0.035, 6, 28).translate(0, TUBE.n, 0));
  add(along(track, [tubeSpan], 2.2, 0, 0, rib, noOutline(toon('#d9dee5'))));
  // A rib at either end where it goes through the wall: the portals.
  const portal = keep(new THREE.TorusGeometry(TUBE.r + 0.12, 0.13, 8, 28).translate(0, TUBE.n, 0));
  add(along(track, [{ from: tunnel.from + 1.1, to: tunnel.from + 1.2 }, { from: track.marks.tunnelEnd - 0.05, to: track.marks.tunnelEnd + 0.05 }], 1, 0, 0, portal, noOutline(toon('#2b2d42'))));

  return {
    group,
    update(t, dark, dt) {
      chase.uniforms.uTime.value = t;
      chase.uniforms.uDark.value = dark;
      chainTex.offset.y -= dt * 1.2;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
    },
  };
}

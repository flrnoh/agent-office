import * as THREE from 'three';
import { MICS, PROMPTER, SCREEN, STAGE, STAGE_MID_Z, STAGE_STEP } from '../../../shared/karaoke';
import { mergeByMaterial, mesh, toon } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';

// ---- The karaoke stage (flrnoh fork, see FORK.md "Karaoke") -------------------------------------------
// A black riser against the east wall with a running LED edge and a step up, a sparkling velvet
// backdrop, the big lyrics screen over it, a prompter at its front edge for whoever's singing, two
// mic stands, PA stacks and floor wedges, and a truss with moving heads and par cans whose beams
// sweep and pulse with the music (and go wild in cosmic bowling).

export interface StageLook {
  /** Each frame: `level` 0–1 how loud it is, `beat` where in the music (beats; NaN without a song), `show` 0–1 how much of a show to put on. */
  update(t: number, dt: number, level: number, beat: number, show: number): void;
  cosmic(on: boolean): void;
}

export interface Stage {
  colliders: Collider[];
  interactables: Interactable[];
  /** The big screen and the prompter: where the lyrics canvas goes, and the quads a video is laid over. */
  screen: THREE.Mesh;
  screenVideo: THREE.Mesh;
  prompter: THREE.Mesh;
  prompterVideo: THREE.Mesh;
  /** The mic on each stand (hidden while someone has it). */
  micsOnStands: THREE.Object3D[];
  look: StageLook;
}

const BLACK = '#17151d';
const STEEL = '#8d93a0';

/** A mic: a black handle and a silver grille (about 22 cm, its grille at the top). */
export function micModel(): THREE.Group {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.16, 10), toon('#232129'), 0, 0.08, 0, false);
  const ring = mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.018, 12), toon('#c9a64a'), 0, 0.165, 0, false);
  const grille = mesh(new THREE.SphereGeometry(0.032, 12, 10), toon('#c9ccd4'), 0, 0.19, 0, false);
  g.add(handle, ring, grille);
  return g;
}

/** A canvas texture of soft round sparkles' sprite. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A light beam's falloff: bright at the lamp (the top of the cone), gone by its end. */
function beamTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#7a7a7a');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/** The LED edge's colors: a rainbow it runs along. */
function ledTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = `hsl(${(x / 256) * 360}, 100%, ${x % 16 ? 45 : 62}%)`;
    g.fillRect(x, 0, 7, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

const glow = (color: THREE.ColorRepresentation, opts: Partial<THREE.MeshBasicMaterialParameters> = {}) => {
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.toneMapped = false;
  return m;
};

export function buildStage(group: THREE.Group, lyrics: THREE.Texture): Stage {
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  const still = new THREE.Group();
  const w = STAGE.maxX - STAGE.minX;
  const d = STAGE.maxZ - STAGE.minZ;
  const cx = (STAGE.minX + STAGE.maxX) / 2;

  // ---- The riser and its step --------------------------------------------------------------------
  still.add(mesh(new THREE.BoxGeometry(w, STAGE.top - 0.03, d), toon(BLACK), cx, (STAGE.top - 0.03) / 2, STAGE_MID_Z));
  still.add(mesh(new THREE.BoxGeometry(w, 0.03, d), toon('#2a2733'), cx, STAGE.top - 0.015, STAGE_MID_Z));
  colliders.push({ minX: STAGE.minX, maxX: STAGE.maxX, minZ: STAGE.minZ, maxZ: STAGE.maxZ, top: STAGE.top });
  const sw = STAGE_STEP.maxX - STAGE_STEP.minX;
  const sd = STAGE_STEP.maxZ - STAGE_STEP.minZ;
  still.add(mesh(new THREE.BoxGeometry(sw, STAGE_STEP.top, sd), toon('#24212c'), (STAGE_STEP.minX + STAGE_STEP.maxX) / 2, STAGE_STEP.top / 2, (STAGE_STEP.minZ + STAGE_STEP.maxZ) / 2));
  colliders.push({ ...STAGE_STEP });
  // The LED edge along the front, and along the step's nose.
  const led = ledTexture();
  const ledMat = glow('#ffffff', { map: led });
  const edge = mesh(new THREE.BoxGeometry(0.02, 0.06, d), ledMat, STAGE.minX - 0.011, STAGE.top - 0.05, STAGE_MID_Z, false);
  const stepEdge = mesh(new THREE.BoxGeometry(0.02, 0.04, sd), ledMat, STAGE_STEP.minX - 0.011, STAGE_STEP.top - 0.035, (STAGE_STEP.minZ + STAGE_STEP.maxZ) / 2, false);
  group.add(edge, stepEdge);
  for (const z of [STAGE.minZ, STAGE.maxZ]) group.add(mesh(new THREE.BoxGeometry(w, 0.06, 0.02), ledMat, cx, STAGE.top - 0.05, z + (z === STAGE.minZ ? -0.011 : 0.011), false));

  // ---- The backdrop: dark velvet in folds, with sparkles ------------------------------------------
  const wallX = STAGE.maxX - 0.04;
  const curtain = new THREE.PlaneGeometry(d, 6.4, 90, 1);
  const pos = curtain.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
  curtain.computeVertexNormals();
  const velvet = mesh(curtain, toon('#2a1446'), wallX - 0.06, STAGE.top + 3.2, STAGE_MID_Z, false);
  velvet.rotation.y = -Math.PI / 2;
  group.add(velvet);
  const STARS = 420;
  const starPos = new Float32Array(STARS * 3);
  const starCol = new Float32Array(STARS * 3);
  const starPhase = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) {
    const z = STAGE.minZ + 0.1 + Math.random() * (d - 0.2);
    const y = STAGE.top + 0.2 + Math.random() * 6.0;
    // Not behind the screen.
    const behind = Math.abs(z - SCREEN.z) < SCREEN.w / 2 + 0.15 && Math.abs(y - SCREEN.y) < SCREEN.h / 2 + 0.15;
    starPos.set([wallX - 0.13 - Math.sin(z * 9) * 0.05, behind ? -10 : y, z], i * 3);
    starPhase[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.09, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(stars);

  // ---- The big screen over it, and the prompter ----------------------------------------------------
  still.add(mesh(new THREE.BoxGeometry(0.14, SCREEN.h + 0.24, SCREEN.w + 0.24), toon('#0d0c12'), SCREEN.x + 0.02, SCREEN.y, SCREEN.z));
  const screenMat = glow('#ffffff', { map: lyrics });
  const screen = mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat, SCREEN.x - 0.055, SCREEN.y, SCREEN.z, false);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);
  // Where a video goes on it: 16:9 at the top, the "next up" strip below it stays the canvas's.
  const vw = SCREEN.w * 0.84;
  const vh = (vw * 9) / 16;
  const screenVideo = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), new THREE.MeshBasicMaterial());
  screenVideo.visible = false;
  screenVideo.position.set(SCREEN.x - 0.06, SCREEN.y + SCREEN.h / 2 - 0.07 - vh / 2, SCREEN.z);
  screenVideo.rotation.y = -Math.PI / 2;
  group.add(screenVideo);
  // The prompter: a wedge on the stage's front edge, its screen tilted up at the singer.
  const wedge = new THREE.Group();
  wedge.position.set(PROMPTER.x, STAGE.top, PROMPTER.z);
  wedge.add(mesh(new THREE.BoxGeometry(0.42, 0.16, PROMPTER.w + 0.12), toon('#1e1c25'), 0, 0.08, 0));
  // Leaning back, its face toward the singer (east) and up.
  const tilt = new THREE.Group();
  tilt.position.set(0.1, 0.16, 0);
  tilt.rotation.z = 0.85;
  wedge.add(tilt);
  tilt.add(mesh(new THREE.BoxGeometry(0.04, PROMPTER.h + 0.08, PROMPTER.w + 0.08), toon('#0d0c12'), -0.025, PROMPTER.h / 2, 0, false));
  const prompter = mesh(new THREE.PlaneGeometry(PROMPTER.w, PROMPTER.h), screenMat, 0.001, PROMPTER.h / 2, 0, false);
  prompter.rotation.y = Math.PI / 2;
  tilt.add(prompter);
  const pw = PROMPTER.w * 0.84;
  const prompterVideo = new THREE.Mesh(new THREE.PlaneGeometry(pw, (pw * 9) / 16), new THREE.MeshBasicMaterial());
  prompterVideo.visible = false;
  prompterVideo.position.set(0.003, PROMPTER.h - 0.02 - (pw * 9) / 32, 0);
  prompterVideo.rotation.y = Math.PI / 2;
  tilt.add(prompterVideo);
  group.add(wedge);
  colliders.push({ minX: PROMPTER.x - 0.22, maxX: PROMPTER.x + 0.22, minZ: PROMPTER.z - PROMPTER.w / 2 - 0.06, maxZ: PROMPTER.z + PROMPTER.w / 2 + 0.06, top: STAGE.top + 0.6 });

  // ---- The mic stands ------------------------------------------------------------------------------
  const micsOnStands: THREE.Object3D[] = [];
  MICS.forEach((m, i) => {
    const stand = new THREE.Group();
    stand.position.set(m.x, STAGE.top, m.z);
    stand.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.025, 20), toon('#1d1b22'), 0, 0.013, 0));
    stand.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.38, 8), toon(STEEL), 0, 0.7, 0, false));
    const clip = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.035), toon('#1d1b22'), -0.02, 1.4, 0, false);
    stand.add(clip);
    const mic = micModel();
    mic.position.set(-0.035, 1.33, 0);
    mic.rotation.z = 0.5; // tilted toward the singer (west)
    stand.add(mic);
    micsOnStands.push(mic);
    // A coloured band on the stand: mic 1 gold, mic 2 cyan.
    stand.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.04, 8), toon(i === 0 ? '#e9b949' : '#4cc9f0'), 0, 1.12, 0, false));
    const it: Interactable = { kind: 'karaokemic', x: m.x, z: m.z, y: STAGE.top, radius: 0.55 };
    stand.traverse((o) => (o.userData.interact = it));
    interactables.push(it);
    group.add(stand);
  });

  // ---- PA stacks, floor wedges -------------------------------------------------------------------
  const cab = (x: number, z: number, y: number, s = 1) => {
    still.add(mesh(new THREE.BoxGeometry(0.62 * s, 0.7 * s, 0.6 * s), toon('#121117'), x, y + 0.35 * s, z));
    const cone = mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.02, 20), toon('#2c2b33'), x - 0.31 * s - 0.005, y + 0.38 * s, z, false);
    cone.rotation.z = Math.PI / 2;
    still.add(cone);
  };
  for (const z of [STAGE.minZ + 0.45, STAGE.maxZ - 0.45]) {
    cab(STAGE.maxX - 0.5, z, STAGE.top);
    cab(STAGE.maxX - 0.5, z, STAGE.top + 0.7);
    cab(STAGE.maxX - 0.5, z, STAGE.top + 1.4, 0.8);
    colliders.push({ minX: STAGE.maxX - 0.85, maxX: STAGE.maxX, minZ: z - 0.32, maxZ: z + 0.32, top: STAGE.top + 2 });
  }
  for (const z of [STAGE_MID_Z - 2.3, STAGE_MID_Z + 2.3]) {
    const wg = mesh(new THREE.BoxGeometry(0.42, 0.3, 0.55), toon('#121117'), STAGE.minX + 0.35, STAGE.top + 0.15, z);
    wg.rotation.z = 0.35;
    still.add(wg);
  }

  // ---- The truss and its lights ---------------------------------------------------------------------
  const trussX = STAGE.minX + 0.5;
  const trussY = 6.3;
  const tz0 = STAGE.minZ - 0.6;
  const tz1 = STAGE.maxZ + 0.6;
  const steel = toon(STEEL);
  const bar = (len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z') => {
    const m = mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), steel, x, y, z, false);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    still.add(m);
  };
  // Four chords along it, laced every half metre; a tower at each end down to the floor.
  for (const [dy, dx] of [
    [0.15, 0.15],
    [0.15, -0.15],
    [-0.15, 0.15],
    [-0.15, -0.15],
  ])
    bar(tz1 - tz0, trussX + dx, trussY + dy, (tz0 + tz1) / 2, 'z');
  for (let z = tz0; z <= tz1 + 1e-6; z += 0.5) {
    bar(0.3, trussX, trussY + 0.15, z, 'x');
    bar(0.3, trussX, trussY - 0.15, z, 'x');
    bar(0.3, trussX + 0.15, trussY, z, 'y');
    bar(0.3, trussX - 0.15, trussY, z, 'y');
  }
  for (const z of [tz0, tz1]) {
    for (const [dx, dz] of [
      [0.15, 0.15],
      [0.15, -0.15],
      [-0.15, 0.15],
      [-0.15, -0.15],
    ])
      bar(trussY, trussX + dx, trussY / 2, z + dz, 'y');
    for (let y = 0.5; y < trussY; y += 0.6) {
      bar(0.3, trussX, y, z + 0.15, 'x');
      bar(0.3, trussX, y, z - 0.15, 'x');
    }
    still.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.6), toon('#1d1b22'), trussX, 0.02, z));
    colliders.push({ minX: trussX - 0.3, maxX: trussX + 0.3, minZ: z - 0.3, maxZ: z + 0.3, top: trussY });
  }

  // Moving heads under the truss, each with its beam.
  const beamTex = beamTexture();
  const HEADS = 4;
  const heads: { yoke: THREE.Group; tilt: THREE.Group; beam: THREE.Mesh; mat: THREE.MeshBasicMaterial; lens: THREE.MeshBasicMaterial; hue: number }[] = [];
  for (let i = 0; i < HEADS; i++) {
    const z = tz0 + 1.2 + (i * (tz1 - tz0 - 2.4)) / (HEADS - 1);
    const yoke = new THREE.Group();
    yoke.position.set(trussX, trussY - 0.2, z);
    yoke.add(mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), toon('#1d1b22'), 0, 0, 0, false));
    const arms = new THREE.Group();
    arms.add(mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04), toon('#1d1b22'), 0, -0.15, 0.13, false), mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04), toon('#1d1b22'), 0, -0.15, -0.13, false));
    yoke.add(arms);
    const tilt = new THREE.Group();
    tilt.position.y = -0.24;
    arms.add(tilt);
    tilt.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.26, 12), toon('#26232e'), 0, 0, 0, false));
    const lens = glow('#ffffff');
    tilt.add(mesh(new THREE.CircleGeometry(0.085, 16).rotateX(Math.PI / 2), lens, 0, -0.132, 0, false));
    const mat = glow('#ffffff', { alphaMap: beamTex, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamGeo = new THREE.CylinderGeometry(0.07, 0.9, 7, 20, 1, true).translate(0, -3.5 - 0.13, 0);
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.raycast = () => {};
    tilt.add(beam);
    group.add(yoke);
    heads.push({ yoke: arms, tilt, beam, mat, lens, hue: i / HEADS });
  }
  // Par cans on the truss's front, washing the stage.
  const PARS = 6;
  const pars: { lens: THREE.MeshBasicMaterial; hue: number }[] = [];
  for (let i = 0; i < PARS; i++) {
    const z = tz0 + 0.7 + (i * (tz1 - tz0 - 1.4)) / (PARS - 1);
    const can = new THREE.Group();
    can.position.set(trussX - 0.22, trussY - 0.05, z);
    can.rotation.z = -0.9;
    can.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.22, 12), toon('#1d1b22'), 0, 0, 0, false));
    const lens = glow('#ff3fa4');
    can.add(mesh(new THREE.CircleGeometry(0.075, 14).rotateX(Math.PI / 2), lens, 0, -0.112, 0, false));
    group.add(can);
    pars.push({ lens, hue: (i % 3) / 3 });
  }
  // What lights the stage: two coloured washes from the truss, a warm one on the singers.
  const washes = [STAGE.minZ + 1.6, STAGE.maxZ - 1.6].map((z) => {
    const l = new THREE.PointLight('#ff3fa4', 2, 11, 1.3);
    l.position.set(trussX + 0.6, trussY - 1, z);
    group.add(l);
    return l;
  });
  const front = new THREE.PointLight('#ffe3c2', 2.2, 8, 1.4);
  front.position.set(STAGE.minX - 1.2, 3.6, STAGE_MID_Z);
  group.add(front);

  group.add(mergeByMaterial(still));

  let cosmic = false;
  let tick = 0;
  const col = new THREE.Color();
  const look: StageLook = {
    cosmic(on) {
      cosmic = on;
    },
    update(t, dt, level, beat, show) {
      tick++;
      const hasBeat = Number.isFinite(beat);
      const b = hasBeat ? beat : t * 2;
      const pulse = hasBeat ? Math.pow(1 - (beat - Math.floor(beat)), 3) : 0;
      const energy = Math.min(1, 0.25 + level * 0.9) * show;
      const spin = cosmic ? 0.12 : 0.06;
      led.offset.x = (t * (0.08 + level * 0.3)) % 1;
      ledMat.color.setScalar(0.55 + 0.45 * show + pulse * 0.3);
      // Moving heads: slow figures of eight, faster and wider with the music.
      heads.forEach((h, i) => {
        const ph = t * (0.5 + level) + i * 1.7;
        h.yoke.rotation.y = Math.sin(ph * 0.7) * (0.6 + show * 0.5);
        h.tilt.rotation.z = -0.55 + Math.sin(ph * 1.1 + i) * 0.35 * show;
        h.tilt.rotation.x = Math.cos(ph * 0.9) * 0.3 * show;
        const hue = (h.hue + b * (show > 0.5 ? 0.0625 : 0.01) + t * spin * 0.1) % 1;
        col.setHSL(hue, 1, cosmic ? 0.55 : 0.6);
        h.mat.color.copy(col);
        h.lens.color.copy(col).multiplyScalar(0.6 + energy);
        h.mat.opacity = (cosmic ? 0.2 : 0.1) * (0.35 + energy + pulse * 0.5 * show);
        h.beam.visible = show > 0.05 || cosmic;
      });
      pars.forEach((p, i) => {
        const on = hasBeat ? (Math.floor(b) + i) % 3 === 0 : true;
        col.setHSL((p.hue + Math.floor(b / 4) * 0.17) % 1, 1, 0.55);
        p.lens.color.copy(col).multiplyScalar(on ? 0.5 + energy + pulse : 0.25);
      });
      washes.forEach((l, i) => {
        col.setHSL((i * 0.5 + b * 0.03) % 1, 0.9, 0.55);
        l.color.copy(col);
        l.intensity = (cosmic ? 3 : 1.6) * (0.35 + energy + pulse * 0.6 * show);
      });
      front.intensity = (cosmic ? 1.2 : 2.2) * (0.5 + 0.5 * show);
      // The backdrop's sparkles twinkle (a few times a second is plenty).
      if (tick % 3 === 0) {
        const base = cosmic ? 0.9 : 0.55;
        for (let i = 0; i < STARS; i++) {
          const k = 0.5 + 0.5 * Math.sin(t * (2 + (i % 5)) + starPhase[i]);
          const v = base * (0.2 + 0.8 * k * k) * (0.7 + level * 0.6);
          starCol[i * 3] = v * (cosmic ? 0.8 : 1);
          starCol[i * 3 + 1] = v * (cosmic ? 0.7 : 0.92);
          starCol[i * 3 + 2] = v;
        }
        starGeo.attributes.color.needsUpdate = true;
      }
      void dt;
    },
  };
  return { colliders, interactables, screen, screenVideo, prompter, prompterVideo, micsOnStands, look };
}

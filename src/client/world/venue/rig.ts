import * as THREE from 'three';
import { STAGE_HEIGHT, VENUE_ROOM, ZONES } from '../../../shared/venue';
import { BACK_WALL, GALLERY } from '../../../shared/venue-house';
import { mergeByMaterial, mesh, toon } from '../toon';
import { box } from '../casino/parts';
import { beamTexture, hazeTexture, softDot } from './signs';
import { LedWall } from './led';
import type { Look } from './lighting';

/*
 * The Schallwerk's rig (flrnoh fork, see FORK.md "The Schallwerk"): everything that hangs from the
 * roof over the stage and the hall, all of it above 6 m (the building's): three box trusses over the
 * stage and two over the hall on chain hoists; moving heads on them whose beams sweep the stage and
 * the crowd and show in the haze; PAR washes and the real lights that colour the stage; blinders that
 * hit the crowd on the big beats; UV bars; the LED wall on the back wall over the backline (led.ts);
 * a mirror ball with its pin spot throwing a swarm of spots round the hall; a laser unit fanning beams
 * out over everyone's heads; and the haze itself. It all follows the Look (lighting.ts).
 */

const R = VENUE_ROOM;
/** The hall the show lights, for the mirror ball's spots and the lasers: from the wing's wall to the bar's, the gallery's front to the back wall. */
const HALL = { minX: ZONES.wing.maxX + 0.1, maxX: R.maxX, minZ: GALLERY.edgeZ, maxZ: BACK_WALL.z0, height: R.height } as const;
export const MIRROR_BALL = { x: 4, y: 7.0, z: -2 } as const;
const LASER = { x: 2.5, y: 6.9, z: 4.5 } as const;

interface Head {
  /** The yoke turns (pan), the head in it tilts; the beam goes from the lens. */
  yoke: THREE.Group;
  head: THREE.Group;
  beam: THREE.Mesh;
  lens: THREE.MeshBasicMaterial;
  at: THREE.Vector3;
  phase: number;
  /** Over the stage (aims at the band) or the hall (sweeps the crowd). */
  over: 'stage' | 'hall';
}

export interface VenueRig {
  update(look: Look, t: number, dt: number): void;
  /** Where the lights are for the place's mood (the colour the room's air takes). */
  led: LedWall;
}

/** Where a ray from `o` along `d` meets the hall's box. */
function hit(o: THREE.Vector3, d: THREE.Vector3, at: THREE.Vector3, n: THREE.Vector3): number {
  let best = Infinity;
  const tryPlane = (t: number, nx: number, ny: number, nz: number) => {
    if (t > 0.01 && t < best) {
      best = t;
      n.set(nx, ny, nz);
    }
  };
  if (d.y < 0) tryPlane(-o.y / d.y, 0, 1, 0);
  if (d.y > 0) tryPlane((HALL.height - o.y) / d.y, 0, -1, 0);
  if (d.x < 0) tryPlane((HALL.minX - o.x) / d.x, 1, 0, 0);
  if (d.x > 0) tryPlane((HALL.maxX - o.x) / d.x, -1, 0, 0);
  if (d.z < 0) tryPlane((HALL.minZ - o.z) / d.z, 0, 0, 1);
  if (d.z > 0) tryPlane((HALL.maxZ - o.z) / d.z, 0, 0, -1);
  at.copy(o).addScaledVector(d, best);
  return best;
}

const additive = (map: THREE.Texture | null, color = '#ffffff', opacity = 1) => {
  const m = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.userData.outlineParameters = { visible: false };
  m.toneMapped = false;
  return m;
};

export function buildRig(group: THREE.Group): VenueRig {
  const parts = new THREE.Group();
  const black = toon('#16161a');
  const alu = toon('#9aa1ab');

  // ---- The trusses, on chain hoists -----------------------------------------------------------------
  const truss = (x0: number, x1: number, y: number, z: number) => {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    for (const dy of [0, 0.4]) for (const dz of [-0.2, 0.2]) parts.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6).rotateZ(Math.PI / 2), alu, cx, y + dy, z + dz, false));
    for (let x = x0; x < x1; x += 0.5) {
      for (const dz of [-0.2, 0.2]) {
        const d = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.64, 4), alu, x + 0.25, y + 0.2, z + dz, false);
        d.rotation.z = Math.round((x - x0) / 0.5) % 2 ? 0.9 : -0.9;
        parts.add(d);
      }
      parts.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4).rotateX(Math.PI / 2), alu, x, y, z, false));
    }
    // The hoists: a chain up to the roof's truss, the motor in its black box.
    for (const x of [x0 + 1.5, cx, x1 - 1.5]) {
      parts.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, R.height - y - 0.9, 4), toon('#55585f'), x, (R.height + y + 0.9) / 2, z, false));
      parts.add(mesh(box(0.3, 0.45, 0.3), black, x, y + 0.75, z));
    }
  };
  const FRONT_Z = 4.6;
  truss(-10, 15, 7.3, FRONT_Z);
  truss(-10, 15, 7.6, 7.8);
  truss(-9, 14, 8.55, 10.2);
  truss(-10, 19, 7.5, -4.6);
  truss(-10, 19, 7.5, 0.6);

  // ---- Moving heads ---------------------------------------------------------------------------------
  const beamTex = beamTexture();
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.95, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2); // along +z from the lens, length 1
  const heads: Head[] = [];
  const headAt = (x: number, y: number, z: number, over: Head['over'], phase: number) => {
    const yoke = new THREE.Group();
    yoke.position.set(x, y, z);
    yoke.add(mesh(box(0.34, 0.12, 0.3), black, 0, 0.0, 0, false));
    yoke.add(mesh(box(0.06, 0.32, 0.12), black, -0.2, -0.2, 0, false));
    yoke.add(mesh(box(0.06, 0.32, 0.12), black, 0.2, -0.2, 0, false));
    const head = new THREE.Group();
    head.position.y = -0.3;
    head.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 14).rotateX(Math.PI / 2), black, 0, 0, -0.02, false));
    const lens = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    lens.userData.outlineParameters = { visible: false };
    lens.toneMapped = false;
    head.add(mesh(new THREE.CircleGeometry(0.12, 14), lens, 0, 0, 0.2, false));
    const beam = new THREE.Mesh(beamGeo, additive(beamTex, '#ffffff', 0.3));
    beam.position.z = 0.2;
    beam.frustumCulled = false;
    head.add(beam);
    yoke.add(head);
    group.add(yoke);
    heads.push({ yoke, head, beam, lens, at: new THREE.Vector3(x, y - 0.3, z), phase, over });
  };
  [-8, -4, 0, 5, 9, 13].forEach((x, i) => headAt(x, 7.15, FRONT_Z, i % 2 ? 'hall' : 'stage', i * 0.9));
  [-6, -1, 6, 11].forEach((x, i) => headAt(x, 7.45, 7.8, 'stage', 3 + i * 1.3));
  [-6, 0, 8, 15].forEach((x, i) => headAt(x, 7.35, 0.6, 'hall', 7 + i * 1.1));

  // ---- PAR washes on the hall trusses, aimed at the stage; blinders on the front truss; UV bars -----
  const parLens = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  parLens.userData.outlineParameters = { visible: false };
  parLens.toneMapped = false;
  const pars = new THREE.Group();
  for (let x = -8; x <= 17; x += 2.5) {
    const can = new THREE.Group();
    can.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.4, 12).rotateX(Math.PI / 2), black, 0, 0, 0, false));
    can.add(mesh(new THREE.CircleGeometry(0.12, 12), parLens, 0, 0, 0.205, false));
    can.position.set(x, 7.25, -4.6);
    can.lookAt(x * 0.6 + 1, STAGE_HEIGHT + 1, 8);
    pars.add(can);
  }
  group.add(mergeByMaterial(pars));
  const blinderMat = new THREE.MeshBasicMaterial({ color: '#2a1d10' });
  blinderMat.userData.outlineParameters = { visible: false };
  blinderMat.toneMapped = false;
  const blinders = new THREE.Group();
  for (const x of [-7, -2, 7, 12]) {
    blinders.add(mesh(box(0.7, 0.7, 0.2), black, x, 6.8, FRONT_Z - 0.35, false));
    for (const dx of [-0.17, 0.17]) for (const dy of [-0.17, 0.17]) blinders.add(mesh(new THREE.CircleGeometry(0.13, 12).rotateY(Math.PI), blinderMat, x + dx, 6.8 + dy, FRONT_Z - 0.46, false));
  }
  group.add(mergeByMaterial(blinders));
  const uvMat = new THREE.MeshBasicMaterial({ color: '#1a0b2a' });
  uvMat.userData.outlineParameters = { visible: false };
  uvMat.toneMapped = false;
  const uvBars = new THREE.Group();
  for (const z of [-4.6, 0.6]) for (let x = -7; x <= 16; x += 5.5) uvBars.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).rotateZ(Math.PI / 2), uvMat, x, 7.4, z - 0.3, false));
  group.add(mergeByMaterial(uvBars));

  // The real lights: three washes on the stage from the front truss, the front light from the hall,
  // a colour over the floor, the strobe.
  const washes = [-6, 2.5, 11].map((x) => {
    const s = new THREE.SpotLight('#ffffff', 0, 16, 0.75, 0.7, 1.2);
    s.position.set(x, 7.1, FRONT_Z - 0.3);
    s.target.position.set(x, STAGE_HEIGHT, 8);
    group.add(s, s.target);
    return s;
  });
  const front = new THREE.SpotLight('#fff0d8', 0, 22, 0.45, 0.6, 1.1);
  front.position.set(2.5, 7.2, -4.6);
  front.target.position.set(2.5, STAGE_HEIGHT + 1, 7);
  group.add(front, front.target);
  const floorLight = new THREE.PointLight('#8a2bff', 0, 16, 1.3);
  floorLight.position.set(4, 6, -1);
  group.add(floorLight);
  const strobe = new THREE.PointLight('#ffffff', 0, 30, 1.2);
  strobe.position.set(3, 7, 3);
  group.add(strobe);

  // ---- The LED wall on the back wall, over the backline -----------------------------------------------
  const led = new LedWall(group, { x: 2.5, y: STAGE_HEIGHT + 3.5 + 2.0, z: BACK_WALL.z0 - 0.06, w: 20, h: 3.9 });

  // ---- The mirror ball, its pin spot, its spots ------------------------------------------------------
  const ball = new THREE.Vector3(MIRROR_BALL.x, MIRROR_BALL.y, MIRROR_BALL.z);
  const facets = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 64; y += 4)
      for (let x = 0; x < 128; x += 4) {
        const v = 140 + ((x * 13 + y * 7) % 110);
        g.fillStyle = `rgb(${v},${v},${v + 10})`;
        g.fillRect(x, y, 3, 3);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ballMat = new THREE.MeshBasicMaterial({ map: facets, color: '#8a8f9c' });
  ballMat.userData.outlineParameters = { visible: false };
  const ballMesh = mesh(new THREE.SphereGeometry(0.6, 28, 18), ballMat, ball.x, ball.y, ball.z, false);
  group.add(ballMesh);
  parts.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, R.height - ball.y - 0.6, 6), toon('#8d99ae'), ball.x, (R.height + ball.y + 0.6) / 2, ball.z, false));
  parts.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), black, ball.x, ball.y + 0.7, ball.z, false));
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#e9d6ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  flare.position.copy(ball);
  flare.scale.setScalar(3);
  group.add(flare);
  const pin = new THREE.Mesh(beamGeo, additive(beamTex, '#ffffff', 0));
  pin.position.set(MIRROR_BALL.x - 3, 7.35, 0.6);
  pin.lookAt(ball);
  pin.scale.set(0.15, 0.15, pin.position.distanceTo(ball));
  pin.frustumCulled = false;
  group.add(pin);
  const SPOTS = 140;
  const spotMat = new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  spotMat.userData.outlineParameters = { visible: false };
  const spots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), spotMat, SPOTS);
  spots.frustumCulled = false;
  const dirs: THREE.Vector3[] = [];
  const tint = new THREE.Color();
  for (let i = 0; i < SPOTS; i++) {
    const y = 1 - ((i + 0.5) / SPOTS) * 1.7;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize());
    spots.setColorAt(i, tint.set(i % 7 === 0 ? '#ffd9f5' : '#ffffff'));
  }
  group.add(spots);

  // ---- The laser unit and its beams ----------------------------------------------------------------
  const BEAMS = 14;
  const laserOrigin = new THREE.Vector3(LASER.x, LASER.y, LASER.z);
  parts.add(mesh(box(0.5, 0.25, 0.4), black, LASER.x, LASER.y + 0.15, LASER.z, false));
  const laserGeo = new THREE.CylinderGeometry(0.012, 0.03, 1, 5, 1, true).translate(0, 0.5, 0);
  const lasers: THREE.Mesh[] = [];
  for (let i = 0; i < BEAMS; i++) {
    const b = new THREE.Mesh(laserGeo, additive(null, '#00ff88', 0));
    b.position.copy(laserOrigin);
    b.frustumCulled = false;
    group.add(b);
    lasers.push(b);
  }
  // A sheet: the beams' fan as a see-through plane in the haze, now and then.
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const sheet = new THREE.Mesh(sheetGeo, additive(null, '#00ff88', 0));
  sheet.frustumCulled = false;
  group.add(sheet);

  // ---- The haze: big soft clouds through the hall's air --------------------------------------------
  const hazeTex = hazeTexture();
  const clouds: { s: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    const base = new THREE.Vector3(-8 + ((i * 7) % 10) * 2.8, 3 + (i % 3) * 1.5, -7 + ((i * 3) % 6) * 3);
    s.position.copy(base);
    s.scale.set(16, 8, 1);
    group.add(s);
    clouds.push({ s, base, phase: i * 1.7 });
  }

  group.add(mergeByMaterial(parts));

  const tmp = new THREE.Vector3();
  const at = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.Quaternion();
  const laserColors = [new THREE.Color('#00ff66'), new THREE.Color('#00e5ff'), new THREE.Color('#ff1744')];
  const white = new THREE.Color('#ffffff');
  let ledAt = 0;

  return {
    led,
    update(look, t, dt) {
      const haze = 0.25 + 0.75 * look.haze;
      // The moving heads: each aims at a point that wanders over the stage or the crowd.
      const sp = look.beamSpeed;
      for (const h of heads) {
        const k = t * sp + h.phase;
        if (h.over === 'stage') tmp.set(h.at.x * 0.7 + 1 + Math.sin(k * 1.3) * 3, STAGE_HEIGHT + 0.2, 7.2 + Math.cos(k * 0.9) * 2.4);
        else tmp.set(3 + Math.sin(k * 0.8 + h.phase) * 11, look.mode === 'club' ? 0.5 + Math.sin(k * 1.7) * 0.5 : 0.8, -3 + Math.cos(k * 1.1) * 5);
        // Pan: the yoke turns about y toward it; tilt: the head pitches down to it.
        d.copy(tmp).sub(h.at);
        h.yoke.rotation.y = Math.atan2(d.x, d.z);
        h.head.rotation.x = Math.atan2(-d.y, Math.hypot(d.x, d.z));
        const len = Math.max(1, d.length());
        h.beam.scale.set(1, 1, len);
        const mat = h.beam.material as THREE.MeshBasicMaterial;
        mat.color.copy(look.beam).lerp(white, look.flash * 0.7);
        mat.opacity = Math.min(0.9, look.beamLevel * 0.55 * haze + look.flash * 0.3);
        h.beam.visible = mat.opacity > 0.01;
        h.lens.color.copy(look.beam).multiplyScalar(0.3 + look.beamLevel * 1.4);
      }
      parLens.color.copy(look.stage).multiplyScalar(0.25 + look.stageLevel * 1.2);
      blinderMat.color.setRGB(1, 0.75, 0.45).multiplyScalar(0.08 + look.flash * 2.2 + (look.mode === 'konzert' ? look.beat * look.level * 1.2 : 0));
      uvMat.color.setRGB(0.55, 0.25, 1).multiplyScalar(0.05 + look.uv * 1.6);
      // The real lights.
      for (const w of washes) {
        w.color.copy(look.stage);
        w.intensity = 70 * look.stageLevel + look.flash * 40;
      }
      front.color.set(look.mode === 'club' ? '#c7b3ff' : '#fff0d8');
      front.intensity = (look.mode === 'club' ? 8 : 45) * Math.min(1, look.stageLevel) * (look.scene === 'blackout' || look.scene === 'strobo' ? 0 : 1);
      floorLight.color.copy(look.accent);
      floorLight.intensity = (look.mode === 'club' ? 5 + look.beat * 8 : 1.5 + look.beat * 2) * (look.scene === 'blackout' ? 0 : 1) + look.uv * 3;
      strobe.intensity = look.flash * 60;

      // The LED wall, twenty times a second.
      if (t - ledAt > 0.05) {
        ledAt = t;
        led.draw(look, t);
      }

      // The mirror ball turns; its spots land where its rays meet the hall.
      ballMesh.rotation.y = t * 0.5;
      const b = look.ball;
      spots.visible = b > 0.01;
      (pin.material as THREE.MeshBasicMaterial).opacity = 0.25 * b * haze;
      flare.material.opacity = b * (0.6 + 0.4 * Math.sin(t * 3));
      ballMat.color.set('#8a8f9c').lerp(white, b);
      if (spots.visible) {
        spin.setFromAxisAngle(yAxis, t * 0.5);
        for (let i = 0; i < SPOTS; i++) {
          d.copy(dirs[i]).applyQuaternion(spin);
          const dist = hit(ball, d, at, n);
          at.addScaledVector(n, 0.02);
          q.setFromUnitVectors(up, n);
          const size = 0.25 + dist * 0.035;
          sc.set(size, size, 1);
          m4.compose(at, q, sc);
          spots.setMatrixAt(i, m4);
        }
        spots.instanceMatrix.needsUpdate = true;
        spotMat.opacity = 0.75 * b;
      }

      // The lasers fan out over the crowd's heads toward the back, sweeping, stepping colour on the beat.
      const L = look.laser;
      const lc = laserColors[look.beats % laserColors.length];
      for (let i = 0; i < BEAMS; i++) {
        const b2 = lasers[i];
        const mat = b2.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.75 * L * haze;
        b2.visible = mat.opacity > 0.01;
        if (!b2.visible) continue;
        const spread = (i / (BEAMS - 1) - 0.5) * 1.6 + Math.sin(t * 0.7) * 0.5;
        const drop = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.4));
        d.set(Math.sin(spread), -drop, -Math.cos(spread)).normalize();
        const len = hit(laserOrigin, d, at, n);
        b2.quaternion.setFromUnitVectors(yAxis, d);
        b2.scale.set(1, len, 1);
        mat.color.copy(lc);
      }
      const sheetOn = L > 0.01 && Math.sin(t * 0.45) > 0.55;
      const sm = sheet.material as THREE.MeshBasicMaterial;
      sm.opacity = sheetOn ? 0.12 * L * haze : 0;
      sheet.visible = sm.opacity > 0.005;
      if (sheet.visible) {
        sm.color.copy(lc);
        const pos = sheetGeo.attributes.position as THREE.BufferAttribute;
        const tilt = 0.12 + 0.1 * Math.sin(t * 2.1);
        pos.setXYZ(0, laserOrigin.x, laserOrigin.y, laserOrigin.z);
        pos.setXYZ(1, HALL.minX + 1, laserOrigin.y - tilt * 13, HALL.minZ + 0.2);
        pos.setXYZ(2, HALL.maxX - 1, laserOrigin.y - tilt * 13, HALL.minZ + 0.2);
        pos.needsUpdate = true;
      }

      // The haze drifts, lit by the rig's colour.
      for (const c of clouds) {
        c.s.position.set(c.base.x + Math.sin(t * 0.05 + c.phase) * 2, c.base.y + Math.sin(t * 0.08 + c.phase) * 0.4, c.base.z + Math.cos(t * 0.04 + c.phase) * 1.5);
        const cm = c.s.material;
        cm.opacity = look.haze * 0.22 * (0.5 + 0.5 * Math.max(look.beamLevel, look.stageLevel * 0.6, look.uv));
        cm.color.copy(look.beam).lerp(white, 0.4);
      }
      void dt;
    },
  };
}

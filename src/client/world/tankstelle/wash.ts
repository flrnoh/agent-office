import * as THREE from 'three';
import { CAR } from '../../../shared/garage';
import { BRAND, WASH } from '../../../shared/tankstelle';
import { gantryZ, type WashMoment } from '../../../shared/tankstelle-play';
import { bulb, type NightParts } from '../outside';
import { canvasTexture } from '../texture';
import { mergeByMaterial, mesh, toon } from '../toon';
import { FONT, G, INK, STEEL, TEAL, TEAL_DARK, WHITE, YELLOW, block, drawLogo, liveSign, signPlane, type LiveSign } from './kit';
import { WashFx } from './washfx';

// flrnoh fork (see FORK.md "The petrol station"): the car wash: a hall you drive through northward,
// glass down its east side so you see in, and in it the gantry that runs along the car on rails:
// two tall brushes and one across the top that spin and press against the car (squashing as they
// do), the spray arch for water and the three-coloured foam, and the dryer. Over the doors a sign
// says "Bitte vorfahren", "Bitte warten" or "Ausfahrt frei", and a light at the way out goes red or
// green. The feature (features/tankstelle) says where the programme is and which car's in there.

/** The car in the wash, as the gantry needs it: where it stands, how high it comes up, whether anyone's in it (the roof's off). */
export interface WashCar {
  pose: { x: number; z: number; rotY: number };
  body: number;
  roof: number;
  /** The Bulli's roof is all along it; a supercar's cabin is short and toward the back. */
  van: boolean;
  occupied: boolean;
}

export type WashSign = 'idle' | 'wait' | 'go';

export interface WashView {
  fx: WashFx;
  /** Each frame: the programme `m` (null when none is going) on car `car`, and what the signs say. */
  update(dt: number, t: number, m: WashMoment | null, car: WashCar | null, sign: WashSign): void;
}

/** A brush's bristles: bands of colour round it, so you see it spin. */
function bristles(): THREE.MeshToonMaterial {
  const tex = canvasTexture(256, 64, (g) => {
    const bands = ['#2f80ed', '#e63946', '#2f80ed', '#ffd23f', '#2f80ed', '#e63946', '#2f80ed', '#06d6a0'];
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(i * 32, 0, 32, 64);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let k = 0; k < 6; k++) g.fillRect(i * 32 + k * 5, 0, 1.5, 64);
    });
  });
  tex.wrapS = THREE.RepeatWrapping;
  const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  return m;
}

function drawSign(sign: LiveSign, state: WashSign, name: string) {
  sign.draw((g, w, h) => {
    g.fillStyle = '#0c0f14';
    g.fillRect(0, 0, w, h);
    const [text, color] = state === 'wait' ? ['BITTE WARTEN', '#ff4d4d'] : state === 'go' ? ['AUSFAHRT FREI', '#58ff8a'] : ['BITTE VORFAHREN', '#ffd23f'];
    g.fillStyle = color;
    g.font = `900 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, state === 'wait' ? h * 0.38 : h / 2);
    if (state === 'wait') {
      g.font = `700 36px ${FONT}`;
      g.fillStyle = '#ffffff';
      g.fillText(name, w / 2, h * 0.76);
    }
  });
}

export function buildWash(group: THREE.Group, night: NightParts): WashView {
  const H = WASH.hall;
  const t = WASH.wall;
  const solid = new THREE.Group();
  const cz = (H.minZ + H.maxZ) / 2;
  const len = H.maxZ - H.minZ;
  const wall = toon('#eef1f4');
  // West wall: solid, a teal band at its foot. East wall: solid to the sill, then glass, then a band.
  block(solid, t, WASH.h, len, wall, H.minX + t / 2, cz);
  block(solid, t, 1.1, len, wall, H.maxX - t / 2, cz);
  block(solid, t, WASH.h - 3.7, len, wall, H.maxX - t / 2, cz, 3.7);
  for (const x of [H.minX + t / 2, H.maxX - t / 2]) block(solid, t + 0.04, 0.45, len + 0.04, toon(TEAL_DARK), x, cz, 0);
  const glass = new THREE.MeshToonMaterial({ color: '#cfe9f2', transparent: true, opacity: 0.25, depthWrite: false, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  glass.userData.outlineParameters = { visible: false };
  group.add(mesh(new THREE.BoxGeometry(0.04, 2.6, len), glass, H.maxX - t / 2, G + 2.4, cz, false));
  for (let z = H.minZ + 0.2; z <= H.maxZ; z += len / 8) block(solid, t + 0.02, 2.6, 0.1, toon(STEEL), H.maxX - t / 2, Math.min(H.maxZ - 0.05, z), 1.1);
  // The ends: the wall either side of each door, and over it, a roll-up door rolled up in its drum.
  const dw = WASH.door.w;
  const side = (H.maxX - H.minX - dw) / 2;
  for (const z of [H.minZ, H.maxZ]) {
    block(solid, side, WASH.h, t, wall, H.minX + side / 2, z);
    block(solid, side, WASH.h, t, wall, H.maxX - side / 2, z);
    block(solid, dw, WASH.h - WASH.door.h, t, toon(TEAL), WASH.lane, z, WASH.door.h);
    // A hair short of the door's width, so its ends don't share a plane with the posts' sides.
    const drum = mesh(new THREE.CylinderGeometry(0.22, 0.22, dw - 0.02, 12), toon(STEEL), WASH.lane, G + WASH.door.h - 0.2, z + (z < cz ? 0.3 : -0.3), false);
    drum.rotation.z = Math.PI / 2;
    solid.add(drum);
    for (const sx of [-1, 1]) block(solid, 0.12, WASH.door.h, 0.12, toon(YELLOW), WASH.lane + sx * (dw / 2 - 0.06), z + (z < cz ? 0.2 : -0.2), 0);
  }
  // The roof, and the brand down its side and over the way in.
  block(solid, H.maxX - H.minX + 0.4, 0.3, len + 0.4, toon('#cfd3d8'), (H.minX + H.maxX) / 2, cz, WASH.h);
  const name = signPlane(1024, 128, 9, (g) => {
    g.fillStyle = TEAL;
    g.fillRect(0, 0, 1024, 128);
    drawLogo(g, 70, 64, 46);
    g.fillStyle = WHITE;
    g.font = `900 78px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(`${BRAND} CAR WASH`, 135, 68);
  });
  name.position.set(H.maxX + 0.03, G + 4.1, cz); // clear of the window posts' faces (H.maxX + 0.01)
  name.rotation.y = Math.PI / 2;
  group.add(name);
  const over = signPlane(512, 128, 3.6, (g) => {
    g.fillStyle = YELLOW;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = INK;
    g.font = `900 64px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🧽 WASCHSTRASSE', 256, 68);
  });
  over.position.set(WASH.lane, G + WASH.h - 0.25, H.maxZ + t / 2 + 0.01);
  group.add(over);
  // Tube lights down the ceiling.
  const tube = bulb(night, '#f2fbff', 0.5);
  for (const x of [WASH.lane - 2.6, WASH.lane + 2.6]) block(solid, 0.12, 0.08, len - 2, tube, x, cz, WASH.h - 0.15, false);
  night.halos.push({ at: new THREE.Vector3(WASH.lane, G + 3.8, H.maxZ + 0.8), size: 3, color: '#e9f6ff', ground: true });
  // The gantry's rails along the floor by the walls.
  for (const x of [H.minX + t + 0.35, H.maxX - t - 0.35]) block(solid, 0.14, 0.08, len - 1, toon(STEEL), x, cz, 0, false);

  // The signs: over the way in (facing out, toward the queue) and inside over the way out (facing the driver).
  const outer = liveSign(512, 160, 2.6);
  outer.mesh.position.set(WASH.lane, G + WASH.door.h + 0.42, H.maxZ + t / 2 + 0.02);
  group.add(outer.mesh);
  const inner = liveSign(512, 160, 2.6);
  inner.mesh.position.set(WASH.lane, G + WASH.door.h + 0.42, H.minZ + t / 2 + 0.02);
  group.add(inner.mesh);
  // The light at the way out: red while it washes, green when you may go.
  const lightBox = new THREE.Group();
  lightBox.add(mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), toon(INK), 0, 0, 0, false));
  const red = new THREE.MeshBasicMaterial({ color: '#4a1010' });
  const green = new THREE.MeshBasicMaterial({ color: '#0f3a1c' });
  for (const m of [red, green]) m.userData.outlineParameters = { visible: false };
  lightBox.add(mesh(new THREE.SphereGeometry(0.12, 12, 8), red, 0, 0.18, 0.08, false), mesh(new THREE.SphereGeometry(0.12, 12, 8), green, 0, -0.18, 0.08, false));
  lightBox.position.set(WASH.lane + dw / 2 + 0.4, G + 2.6, H.minZ + t / 2 + 0.15);
  group.add(lightBox);
  // The pay terminal by the way in.
  const term = WASH.terminal;
  block(solid, 0.5, 1.3, 0.4, toon(TEAL), term.x, term.z, 0);
  block(solid, 0.55, 0.12, 0.45, toon(YELLOW), term.x, term.z, 1.3);
  const screen = signPlane(256, 192, 0.36, (g) => {
    g.fillStyle = '#0c0f14';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = YELLOW;
    g.font = `900 34px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('PROGRAMM', 128, 52);
    g.fillStyle = '#ffffff';
    g.font = `800 30px ${FONT}`;
    g.fillText('✨ GLANZ', 128, 104);
    g.fillStyle = '#58ff8a';
    g.fillText('E = START', 128, 154);
  });
  screen.position.set(term.x + 0.26, G + 1.0, term.z);
  screen.rotation.y = Math.PI / 2;
  group.add(screen);
  group.add(mergeByMaterial(solid));

  // ---- The gantry ------------------------------------------------------------------------------------
  const gantry = new THREE.Group();
  const frame = toon('#dfe3e8');
  const inX = [H.minX + t + 0.35, H.maxX - t - 0.35];
  const span = inX[1] - inX[0];
  for (const x of inX) {
    gantry.add(mesh(new THREE.BoxGeometry(0.3, 3.6, 0.5), frame, x, G + 1.8, 0));
    gantry.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.7), toon(TEAL), x, G + 0.15, 0));
  }
  gantry.add(mesh(new THREE.BoxGeometry(span + 0.3, 0.35, 0.6), frame, WASH.lane, G + 3.55, 0));
  gantry.add(mesh(new THREE.BoxGeometry(span + 0.32, 0.12, 0.62), toon(TEAL), WASH.lane, G + 3.32, 0));
  // The spray arch, a little ahead of the brushes, with its nozzles; and the dryer's hood behind them.
  const arch = toon('#9aa3ad');
  for (const x of [WASH.lane - 1.9, WASH.lane + 1.9]) gantry.add(mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), arch, x, G + 2.1, 0.55));
  gantry.add(mesh(new THREE.BoxGeometry(3.88, 0.08, 0.08), arch, WASH.lane, G + 3.38, 0.55));
  gantry.add(mesh(new THREE.BoxGeometry(2.4, 0.3, 0.5), toon(YELLOW), WASH.lane, G + 3.2, -0.6));
  gantry.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.12), toon(INK), WASH.lane, G + 3.04, -0.6, false));
  const brushMat = bristles();
  const brushGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.1, 20, 1);
  const topGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.4, 20, 1).rotateZ(Math.PI / 2);
  const sides = [-1, 1].map((s) => {
    const holder = new THREE.Group();
    const brush = mesh(brushGeo, brushMat, 0, 0, 0, false);
    holder.add(brush);
    holder.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 6), toon(STEEL), 0, 1.65, 0, false));
    holder.position.set(WASH.lane + s * 2.9, G + 1.2, 0);
    gantry.add(holder);
    return { s, holder, brush };
  });
  const top = mesh(topGeo, brushMat, WASH.lane, G + 2.8, 0, false);
  gantry.add(top);
  gantry.position.z = WASH.from;
  group.add(gantry);

  const fx = new WashFx();
  group.add(fx.group);

  let shown: WashSign | null = null;
  let shownName = '';
  let spin = 0;
  let sideIn = 0;
  let topDown = 0;
  let washing = false;

  return {
    fx,
    update(dt, tt, m, car, sign) {
      const name = m && m.phase !== 'done' ? m.name : '';
      if (sign !== shown || name !== shownName) {
        shown = sign;
        shownName = name;
        drawSign(outer, sign, name);
        drawSign(inner, sign, name);
        red.color.set(sign === 'wait' ? '#ff3030' : '#4a1010');
        green.color.set(sign === 'go' ? '#30ff6a' : '#0f3a1c');
      }
      const going = !!m && m.phase !== 'done' && !!car;
      if (going && !washing) fx.clearFoam();
      washing = going;
      // The gantry runs along the car; with no programme it waits at the way in.
      const want = going ? gantryZ(m!) : WASH.from;
      gantry.position.z += (want - gantry.position.z) * Math.min(1, dt * (going ? 12 : 1.5));
      const gz = gantry.position.z;
      const brushing = going && m!.phase === 'brush';
      const drying = going && m!.phase === 'dry';
      spin += dt * (brushing ? 14 : going ? 2 : 0);
      sideIn += ((brushing ? 1 : 0) - sideIn) * Math.min(1, dt * 3);
      // Where along the car the gantry is (its own frame), and how high the car comes up there.
      const along = car ? (gz - car.pose.z) * Math.sign(Math.cos(car.pose.rotY) || 1) : 0;
      const half = { w: CAR.width / 2, l: CAR.length / 2 };
      const over = car && Math.abs(along) < half.l + 0.2;
      const cabin = car && (car.van ? Math.abs(along) < half.l - 0.3 : along > -1.3 && along < 0.4);
      const height = !car ? 0 : Math.max(over ? (cabin ? car.roof : car.body) : 0, car.occupied ? 1.75 : 0);
      topDown += ((brushing && over ? 1 : 0) - topDown) * Math.min(1, dt * 4);
      // The tall brushes come in to the car's sides and press on them; the top one comes down onto it.
      for (const b of sides) {
        const rest = WASH.lane + b.s * 2.9;
        const touch = (car?.pose.x ?? WASH.lane) + b.s * (half.w + 0.55 * 0.82);
        b.holder.position.x = rest + (touch - rest) * sideIn * (over ? 1 : 0.6);
        b.brush.rotation.y = spin * b.s;
        const squash = sideIn * (over ? 1 : 0) * (0.2 + 0.04 * Math.sin(tt * 31 + b.s));
        b.brush.scale.set(1 - squash, 1, 1 + squash * 0.6);
      }
      const press = 0.5 * 0.8;
      top.position.y = G + 2.8 + (G + height + press - (G + 2.8)) * topDown;
      top.rotation.x = -spin;
      const sq = topDown * (0.18 + 0.04 * Math.sin(tt * 27));
      top.scale.set(1, 1 - sq, 1 + sq * 0.5);
      // Spray, foam and air off the gantry.
      if (going && car) {
        const ph = m!.phase;
        const frame = Math.min(dt, 0.05) * 60;
        if (ph === 'prewash' || ph === 'rinse') {
          for (const s of [-1, 1]) fx.spray(WASH.lane + s * 1.9, G + 0.5 + Math.random() * 2.4, gz + 0.55, -s, -0.1, 0, Math.round(2 * frame), 'water');
          fx.spray(WASH.lane + (Math.random() - 0.5) * 3.4, G + 3.35, gz + 0.55, 0, -1, 0, Math.round(3 * frame), 'water');
          if (ph === 'rinse') fx.rinse(along);
        } else if (ph === 'foam') {
          for (const s of [-1, 1]) fx.spray(WASH.lane + s * 1.9, G + 0.6 + Math.random() * 2.2, gz + 0.55, -s, 0.05, 0, Math.round(2 * frame), 'foam');
          fx.spray(WASH.lane + (Math.random() - 0.5) * 3.4, G + 3.35, gz + 0.55, 0, -1, 0, Math.round(2 * frame), 'foam');
          if (over && Math.random() < 0.9) fx.foam(along, Math.round(frame), half, height || car.body);
        } else if (ph === 'brush') {
          if (over && Math.random() < 0.6) fx.spray(car.pose.x + (Math.random() - 0.5) * 2.6, G + 0.4 + Math.random() * height, gz, 0, 0.6, 0, 1, 'water');
        } else if (drying) {
          fx.spray(WASH.lane + (Math.random() - 0.5) * 2, G + 2.95, gz - 0.6, 0, -1.2, Math.random() < 0.5 ? 0.4 : -0.4, Math.round(2 * frame), 'air');
        }
      } else if (!going && fx.foamCount && !car) fx.clearFoam();
      fx.update(dt, tt, car?.pose ?? null, brushing ? 1 : 0);
    },
  };
}

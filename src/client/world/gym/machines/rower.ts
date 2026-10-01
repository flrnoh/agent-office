import * as THREE from 'three';
import { rowStroke } from '../../../../shared/gym-motion';
import { C, beam, box, cable, discX, led, pad, rbox, ringX, screen, setGlow, tube, rigid, type Machine, type V3 } from './kit';

/*
 * An air rower (flrnoh fork, see kit.ts): a long rail on a front and a rear leg, a seat on rollers
 * that slides along it, angled footplates with straps, the fan cage up front with its blades
 * whirring behind the grille, a monitor on its arm, and the handle on its chain. Rowing, the seat
 * runs back and forth, the rower leans and pulls the handle in to the ribs, and the fan spins up on
 * every drive.
 */

const RAIL_Y = 0.2;
const SEAT_Y = 0.29;
const CATCH_Z = 0.33;
const FINISH_Z = 0.1;
const FAN: V3 = [0, 0.34, 0.98];
const FOOT_Z = 0.56;

export function rower(): Machine {
  const statics = new THREE.Group();
  const live = new THREE.Group();
  // The rail on its legs.
  statics.add(box(0.12, 0.05, 1.9, C.frame, 0, RAIL_Y, -0.05));
  statics.add(box(0.13, 0.012, 1.8, C.chrome, 0, RAIL_Y + 0.03, -0.08));
  statics.add(box(0.5, 0.05, 0.08, C.frame, 0, 0.03, -0.96));
  statics.add(beam([0, 0.05, -0.96], [0, RAIL_Y - 0.02, -0.95], 0.06));
  for (const s of [-1, 1]) statics.add(box(0.07, 0.04, 0.1, C.rubber, s * 0.22, 0.02, -0.96));
  statics.add(box(0.56, 0.06, 0.1, C.frame, 0, 0.03, 0.92));
  // The footplates, angled back at the rower, with lime heel cups and straps.
  for (const s of [-1, 1]) {
    const plateG = new THREE.Group();
    plateG.position.set(s * 0.12, RAIL_Y + 0.06, FOOT_Z);
    plateG.rotation.x = -0.75;
    plateG.add(rbox(0.1, 0.02, 0.24, C.frame2, 0, 0, 0, 0.03));
    plateG.add(box(0.1, 0.04, 0.02, C.lime, 0, 0.02, -0.12));
    plateG.add(box(0.11, 0.025, 0.05, C.rubber, 0, 0.025, 0.02));
    statics.add(plateG);
  }
  statics.add(box(0.36, 0.08, 0.14, C.frame, 0, RAIL_Y, FOOT_Z));
  // The fan cage: a drum with a grille, and the monitor arm up to the screen.
  statics.add(discX(0.26, 0.2, C.frame2, ...FAN, 28));
  for (const s of [-1, 1]) statics.add(ringX(0.24, 0.012, C.steel, s * 0.1, FAN[1], FAN[2]));
  statics.add(box(0.2, 0.1, 0.14, C.frame, 0, 0.12, 0.98));
  statics.add(tube([0, 0.5, 0.9], [0, 0.78, 0.72], 0.018, C.frame));
  statics.add(box(0.05, 0.05, 0.04, C.frame, 0, 0.44, 0.84));
  // Where the handle rests when nobody's rowing.
  statics.add(box(0.4, 0.03, 0.04, C.frame, 0, 0.4, 0.8));

  // Live: the fan (behind the grille, lit lime), the seat, the handle and its chain, the screen.
  const fan = new THREE.Group();
  fan.position.set(...FAN);
  for (let i = 0; i < 6; i++) fan.add(box(0.03, 0.4, 0.07, C.steel).rotateX((i * Math.PI) / 6));
  fan.add(discX(0.06, 0.12, C.lime, 0, 0, 0, 12));
  live.add(rigid(fan));
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshToonMaterial({ color: '#0e1316', transparent: true, opacity: 0.45 }));
  for (const s of [-1, 1]) {
    const g = grille.clone();
    g.rotation.y = (s * Math.PI) / 2;
    g.position.set(s * 0.104, FAN[1], FAN[2]);
    live.add(g);
  }
  const seat = new THREE.Group();
  seat.add(pad(0.3, 0.07, 0.26, 0, SEAT_Y, 0));
  seat.add(box(0.2, 0.05, 0.2, C.frame2, 0, RAIL_Y + 0.05, 0));
  for (const s of [-1, 1]) seat.add(discX(0.025, 0.02, C.rubber, s * 0.07, RAIL_Y + 0.03, 0.06, 10), discX(0.025, 0.02, C.rubber, s * 0.07, RAIL_Y + 0.03, -0.06, 10));
  live.add(rigid(seat));
  const handle = new THREE.Group();
  handle.add(tube([-0.24, 0, 0], [0.24, 0, 0], 0.014, C.frame, 8));
  for (const s of [-1, 1]) handle.add(tube([s * 0.24, 0, 0], [s * 0.14, 0, 0], 0.022, C.grip, 8));
  handle.add(box(0.03, 0.03, 0.03, C.chrome));
  live.add(rigid(handle));
  const chain = cable(C.steel, 0.008);
  live.add(chain.mesh);
  const scrG = new THREE.Group();
  scrG.position.set(0, 0.82, 0.7);
  scrG.rotation.set(0.35, Math.PI, 0);
  const scr = screen(0.16, 0.13, 112);
  scr.mesh.position.z = 0.016;
  scrG.add(rbox(0.2, 0.17, 0.03, C.frame, 0, 0, 0, 0.02).rotateX(Math.PI / 2), scr.mesh);
  live.add(scrG);
  const glowStrip = led(0.008, 0.02, 1.6, '#a3e635', 0, RAIL_Y - 0.03, -0.08);
  glowStrip.position.x = 0.064;
  live.add(glowStrip);
  const chainFrom = new THREE.Vector3(0, 0.36, 0.78);
  const at = new THREE.Vector3();
  let spin = 0;

  const stroke = (s: { running: boolean; phase: number }) => (s.running ? rowStroke(s.phase) : { seat: 0.35, handle: 0, lean: 0.3 });
  const handleAt = (st: { seat: number; handle: number; lean: number }, on: boolean): V3 => {
    if (!on) return [0, 0.43, 0.8];
    const hz = THREE.MathUtils.lerp(0.62, FINISH_Z + 0.2, st.handle); // in to the ribs at the finish
    return [0, THREE.MathUtils.lerp(0.36, 0.58, st.handle), hz];
  };
  return {
    statics,
    live,
    spot: [0, 0, 0.2],
    off: [-0.85, 0.1],
    size: { w: 0.62, d: 2.05, top: 0.9, cz: 0 },
    cam: { eye: [1.9, 1.7, -0.9], look: [0, 0.15, 0.3], first: 0.12 },
    update(s, dt) {
      const st = stroke(s);
      seat.position.z = THREE.MathUtils.lerp(CATCH_Z, FINISH_Z, st.seat);
      at.set(...handleAt(st, s.on));
      handle.position.copy(at);
      chain.set(chainFrom, at);
      // The fan: kicked on the drive, freewheeling down on the recovery.
      const drive = s.running ? (st.handle > 0.02 && st.handle < 0.98 ? 1 : 0.5) : 0;
      spin = THREE.MathUtils.lerp(spin, s.hz * 14 * drive + (s.running ? 4 : 0), Math.min(1, dt * 3));
      fan.rotation.x -= spin * dt;
      setGlow(glowStrip, s.running ? 0.6 + 0.5 * st.handle : s.on ? 0.7 : 0.35 + 0.1 * Math.sin(s.t * 0.9 + 1));
      scr.show(s.lines, s.running ? '#a3e635' : '#35e0d0');
    },
    pose(p, s) {
      const st = stroke(s);
      const hz = THREE.MathUtils.lerp(CATCH_Z, FINISH_Z, st.seat);
      // Leaning forward at the catch, back past upright at the finish.
      p.hips([0, SEAT_Y + 0.07, hz], THREE.MathUtils.lerp(0.5, -0.25, st.lean));
      const h = handleAt(st, true);
      for (const side of [-1, 1] as const) {
        p.foot(side, [side * 0.12, RAIL_Y + 0.1, FOOT_Z - 0.02]);
        p.hand(side, [side * 0.17, h[1], h[2]]);
      }
      p.head(THREE.MathUtils.lerp(-0.1, 0.15, st.lean));
    },
  };
}


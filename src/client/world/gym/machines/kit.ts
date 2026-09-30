import * as THREE from 'three';
import { mergeByColor, mesh, roundedBox, toon } from '../../toon';
import { canvasTexture, glow } from '../parts';
import type { Bones } from '../../character';
import { barPlates, type SetMotion } from '../../../../shared/gym-motion';

/*
 * The gym's cardio and strength equipment (flrnoh fork, see FORK.md "The gym" → Equipment): the parts
 * every machine is built from (tubes, pads, plates, bars, weight stacks, pulleys, cables, glowing
 * consoles), the one shape a machine has for equipment.ts, and the Poser that puts a person on it.
 * Every machine is built in its own frame: its user stands (or sits, or lies) at `spot`, facing +z.
 */

// ---- The look: dark powder-coated frames, chrome, black rubber, the gym's lime ------------------

export const C = {
  frame: toon('#252c32'),
  frame2: toon('#3a444d'),
  chrome: toon('#d9e1e7'),
  steel: toon('#8f9ba6'),
  rubber: toon('#15181b'),
  grip: toon('#2b3035'),
  lime: toon('#a3e635'),
  pad: toon('#22272c'),
  padTop: toon('#2c3238'),
  red: toon('#d64541'),
  white: toon('#eef2f4'),
  wood: toon('#b98a55'),
  deck: toon('#2f363c'),
  iron: toon('#30363c'),
};

/** Plates by weight: bumper colours (red 25, blue 20, yellow 15, green 10, white 5 and under). */
const BUMPER: Record<string, string> = { '25': '#d64541', '20': '#3b7dd8', '15': '#f2c230', '10': '#3fae5a' };

export type V3 = [number, number, number];
const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const UP = new THREE.Vector3(0, 1, 0);

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

export function rbox(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0.04): THREE.Mesh {
  return mesh(roundedBox(w, h, d, r), mat, x, y, z);
}

/** A round tube from `a` to `b`. */
export function tube(a: V3, b: V3, r: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  const pa = v(a);
  const pb = v(b);
  const len = pa.distanceTo(pb);
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(pa).add(pb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, pb.clone().sub(pa).normalize());
  return m;
}

/** A square steel section from `a` to `b` (frames are box tubing). */
export function beam(a: V3, b: V3, s: number, mat: THREE.Material = C.frame): THREE.Mesh {
  const pa = v(a);
  const pb = v(b);
  const len = pa.distanceTo(pb);
  const m = mesh(new THREE.BoxGeometry(s, len, s), mat);
  m.position.copy(pa).add(pb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, pb.clone().sub(pa).normalize());
  return m;
}

/** A disc on the x axis (a plate, a wheel seen side-on from the user). */
export function discX(r: number, thick: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(r, r, thick, seg).rotateZ(Math.PI / 2), mat, x, y, z);
}

/** A ring on the x axis (a flywheel's rim, a plate's lip). */
export function ringX(r: number, tube: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(new THREE.TorusGeometry(r, tube, 8, 28).rotateY(Math.PI / 2), mat, x, y, z);
}

/** A weight plate on the x axis: a coloured bumper, or cast iron with a chrome hub, sized by its weight. */
export function plate(kg: number, bumper: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = bumper ? (kg >= 10 ? 0.225 : 0.16 + kg * 0.008) : 0.08 + Math.sqrt(kg) * 0.03;
  const t = bumper ? 0.03 + kg * 0.0018 : 0.022 + kg * 0.0008;
  const mat = bumper ? toon(BUMPER[String(kg)] ?? '#e9edf0') : C.iron;
  g.add(discX(r, t, mat));
  g.add(ringX(r - 0.012, 0.012, bumper ? C.rubber : C.frame2));
  g.add(discX(0.05, t + 0.012, C.chrome, 0, 0, 0, 14));
  if (!bumper) g.add(ringX(r * 0.62, 0.008, C.frame2));
  g.userData.thick = t;
  g.userData.r = r;
  return g;
}

/** An Olympic barbell along x (2.2 m), with `plates` (kg, biggest first) on each sleeve. */
export function barbell(plates: number[], bumper: boolean, length = 2.2): THREE.Group {
  const g = new THREE.Group();
  const half = length / 2;
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, length - 0.8, 10).rotateZ(Math.PI / 2), C.steel));
  // Knurled grips, a centre knurl, and the collars.
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 10).rotateZ(Math.PI / 2), C.grip, s * 0.28, 0, 0));
    g.add(discX(0.034, 0.04, C.chrome, s * (half - 0.43), 0, 0, 14));
    g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.42, 12).rotateZ(Math.PI / 2), C.chrome, s * (half - 0.21), 0, 0));
    let x = half - 0.4;
    for (const kg of plates) {
      const p = plate(kg, bumper);
      const t = p.userData.thick as number;
      p.position.x = s * (x + t / 2);
      x += t + 0.004;
      g.add(p);
    }
    if (plates.length) g.add(discX(0.035, 0.03, C.lime, s * (x + 0.015), 0, 0, 12));
  }
  return mergeByColor(g);
}

/** A barbell whose plates follow the weight loaded (rebuilt only when that changes the plates). */
export function loadedBar(bumper: boolean): { group: THREE.Group; load(weight: number): void } {
  const group = new THREE.Group();
  let key = '';
  return {
    group,
    load(weight) {
      const plates = barPlates(weight);
      const k = plates.join(',');
      if (k === key) return;
      key = k;
      for (const c of [...group.children]) {
        group.remove(c);
        c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
      }
      group.add(barbell(plates, bumper));
    },
  };
}

/** A hex dumbbell along x: rubber heads sized by weight on a chrome handle. */
export function dumbbell(kg: number): THREE.Group {
  const g = new THREE.Group();
  const r = 0.045 + Math.sqrt(kg) * 0.012;
  const len = 0.03 + kg * 0.0022;
  g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8).rotateZ(Math.PI / 2), C.chrome));
  for (const s of [-1, 1]) {
    const head = mesh(new THREE.CylinderGeometry(r, r, len, 6).rotateZ(Math.PI / 2), C.rubber, s * (0.08 + len / 2), 0, 0);
    g.add(head);
    g.add(discX(0.022, 0.012, C.chrome, s * (0.08 + len + 0.004), 0, 0, 10));
  }
  g.userData.half = 0.08 + len;
  return g;
}

/** A pulley wheel turning in the x = const plane, with its bracket. */
export function pulley(r = 0.055): THREE.Group {
  const g = new THREE.Group();
  g.add(discX(r, 0.03, C.frame2, 0, 0, 0, 16));
  g.add(discX(r * 0.4, 0.036, C.chrome, 0, 0, 0, 10));
  for (const s of [-1, 1]) g.add(box(0.01, r * 2.4, r * 1.3, C.frame, s * 0.024, 0, 0));
  return g;
}

/** A pad with a lime seam round it: seats, back rests, knee rollers. */
export function pad(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(w, h, d, C.pad, 0, 0, 0, Math.min(0.06, w / 3, d / 3)));
  g.add(rbox(w + 0.008, 0.012, d + 0.008, C.lime, 0, -h / 2 + 0.02, 0, Math.min(0.06, w / 3, d / 3)));
  g.position.set(x, y, z);
  return g;
}

/** A roller pad along x (a knee or ankle roller). */
export function roller(len: number, r: number, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, len, 14).rotateZ(Math.PI / 2), C.pad, 0, 0, 0));
  for (const s of [-1, 1]) g.add(discX(r * 0.45, 0.02, C.lime, s * (len / 2 + 0.005), 0, 0, 10));
  g.position.set(x, y, z);
  return g;
}

/** A foot on the floor: a rubber-capped stabiliser bar along x. */
export function foot(w: number, x = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.06, 0.08, C.frame, 0, 0.04, 0));
  for (const s of [-1, 1]) g.add(box(0.06, 0.04, 0.1, C.rubber, s * (w / 2 - 0.03), 0.02, 0));
  g.position.set(x, 0, z);
  return g;
}

// ---- Live parts ---------------------------------------------------------------------------------

/** A glowing strip whose brightness breathes (see setGlow). */
export function led(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glow(null, color));
  m.position.set(x, y, z);
  m.userData.base = new THREE.Color(color);
  return m;
}

/** Brightness `k` (0…1.2) of a strip made by led(). */
export function setGlow(m: THREE.Mesh, k: number) {
  const base = m.userData.base as THREE.Color | undefined;
  if (base) (m.material as THREE.MeshBasicMaterial).color.copy(base).multiplyScalar(k);
}

/** A console's glowing screen, redrawn only when what it says changes. */
export interface Screen {
  mesh: THREE.Mesh;
  show(lines: string[], accent?: string): void;
}

export function screen(w: number, h: number, px = 160): Screen {
  const cw = px;
  const ch = Math.max(32, Math.round((px * h) / w));
  let canvas: HTMLCanvasElement | null = null;
  const tex = canvasTexture(cw, ch, (g) => {
    canvas = g.canvas;
    g.fillStyle = '#071512';
    g.fillRect(0, 0, cw, ch);
  });
  const mat = glow(tex);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let said = '';
  return {
    mesh: m,
    show(lines, accent = '#a3e635') {
      const key = `${accent}|${lines.join('\n')}`;
      if (key === said || !canvas) return;
      said = key;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#071512';
      g.fillRect(0, 0, cw, ch);
      // Faint scanlines and a lime frame, like an LCD.
      g.fillStyle = 'rgba(163,230,53,0.06)';
      for (let y = 0; y < ch; y += 3) g.fillRect(0, y, cw, 1);
      g.strokeStyle = accent;
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      g.strokeRect(2, 2, cw - 4, ch - 4);
      g.globalAlpha = 1;
      const n = Math.max(1, lines.length);
      const size = Math.floor((ch - 8) / n) * 0.78;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      lines.forEach((line, i) => {
        g.font = `${i === 0 ? 900 : 700} ${Math.round(i === 0 ? size * 1.05 : size * 0.85)}px ui-monospace, Menlo, monospace`;
        g.fillStyle = i === 0 ? accent : '#bff5e8';
        g.fillText(line, cw / 2, 4 + (ch - 8) * ((i + 0.5) / n));
      });
      tex.needsUpdate = true;
    },
  };
}

/** A cable (or chain, or strap) between two points, moved every frame with set(). */
export function cable(mat: THREE.Material = C.rubber, r = 0.006): { mesh: THREE.Mesh; set(a: THREE.Vector3, b: THREE.Vector3): void } {
  const m = mesh(new THREE.CylinderGeometry(r, r, 1, 6), mat, 0, 0, 0, false);
  const dir = new THREE.Vector3();
  return {
    mesh: m,
    set(a, b) {
      dir.copy(b).sub(a);
      const len = Math.max(0.001, dir.length());
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
      m.scale.set(1, len, 1);
    },
  };
}

/**
 * A selectorized weight stack between two guide rods: `plates` slabs, the pin through the ones the
 * weight picks, and those (with the top plate and the selector rod) riding up when set() lifts them.
 * Its bottom stands at the frame's origin; it's `w` wide (x) and `d` deep (z).
 */
export interface Stack {
  group: THREE.Group;
  /** Picks up `n` of the plates (from the top) and lifts them `lift` metres. */
  set(n: number, lift: number): void;
  /** Where the cable pulls on the top plate (in the stack's frame), for its cable. */
  top: THREE.Vector3;
}

export function weightStack(plates = 12, w = 0.3, d = 0.14, slab = 0.045): Stack {
  const g = new THREE.Group();
  const base = 0.08;
  const pitch = slab + 0.004;
  const height = base + plates * pitch + 0.8;
  // Guide rods and the rubber foot.
  const frame = new THREE.Group();
  for (const s of [-1, 1]) frame.add(tube([s * (w / 2 - 0.035), 0, 0], [s * (w / 2 - 0.035), height, 0], 0.012, C.chrome));
  frame.add(box(w + 0.06, base, d + 0.06, C.rubber, 0, base / 2, 0));
  g.add(mergeByColor(frame));
  const topY = base + plates * pitch;
  // What rides up: the plates the pin picks (rebuilt when the weight changes), the top plate, the selector rod, the pin.
  const riding = new THREE.Group();
  const lift = new THREE.Group();
  const cap = new THREE.Group();
  cap.add(box(w, 0.035, d, C.steel, 0, topY + 0.02, 0));
  cap.add(tube([0, base, 0], [0, topY + 0.1, 0], 0.01, C.chrome));
  lift.add(rigid(cap));
  const pin = new THREE.Group();
  pin.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, d + 0.08, 8).rotateX(Math.PI / 2), C.red, 0, 0, 0.03));
  pin.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), C.red, 0, 0, d / 2 + 0.07));
  lift.add(rigid(pin));
  riding.add(lift);
  g.add(riding);
  let rest: THREE.Object3D | null = null;
  let picked: THREE.Object3D | null = null;
  let chosen = -1;
  /** The plates from `from` to `to` (indices, bottom up) as one mesh. */
  const slabs = (from: number, to: number): THREE.Object3D => {
    const t = new THREE.Group();
    for (let i = from; i < to; i++) {
      const y = base + slab / 2 + i * pitch;
      t.add(box(w, slab, d, i % 2 ? C.iron : C.frame2, 0, y, 0));
      t.add(box(0.03, slab * 0.35, 0.004, C.lime, w / 2 - 0.04, y, d / 2 + 0.002));
      t.add(box(0.03, slab * 0.35, 0.004, C.white, -w / 2 + 0.04, y, d / 2 + 0.002));
    }
    return t.children.length ? mergeByColor(t) : t;
  };
  const drop = (o: THREE.Object3D | null) => o?.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
  const set = (n: number, up: number) => {
    const k = Math.max(1, Math.min(plates, Math.round(n)));
    if (k !== chosen) {
      chosen = k;
      if (rest) g.remove(rest);
      if (picked) riding.remove(picked);
      drop(rest);
      drop(picked);
      rest = slabs(0, plates - k);
      picked = slabs(plates - k, plates);
      g.add(rest);
      riding.add(picked);
      pin.position.y = base + slab / 2 + (plates - k) * pitch;
    }
    riding.position.y = Math.max(0, up);
  };
  set(Math.ceil(plates / 3), 0);
  return { group: g, set, top: new THREE.Vector3(0, topY + 0.1, 0) };
}

// ---- The one shape of a machine -------------------------------------------------------------------

/** How a machine is doing this frame (equipment.ts works it out from the station's view). */
export interface MachineState {
  /** Someone is on it. */
  on: boolean;
  /** A cardio session is going / a set is under way. */
  running: boolean;
  /** Cardio: metres a second right now (eased), and how far through its cycle (whole turns count up). */
  speed: number;
  phase: number;
  /** Cardio: cycles a second. */
  hz: number;
  /** Strength: where the set is (null between sets). */
  set: SetMotion | null;
  /** Strength: the weight loaded, and the most the station takes. */
  weight: number;
  max: number;
  /** The console's lines (cardio: pace, distance…). */
  lines: string[];
  /** Seconds the gym has been open on this page (for idle glows). */
  t: number;
}

export interface Machine {
  /** Parts that never move: merged with every other machine's into a handful of draw calls. */
  statics: THREE.Object3D;
  /** Parts that move or glow, kept as they are. */
  live: THREE.Object3D;
  /** Where the person's feet (their root) go while they're on it, facing +z. */
  spot: V3;
  /**
   * How far the whole machine stands off its station's point (its own x, z): the cable crossover and
   * the dumbbell rack are wider than the gap their stations have east of them (the spa's glass), so
   * they sit a little to the west. The station itself (GYM_STATIONS) doesn't move.
   */
  shift?: [number, number];
  /** Where you step off onto the floor (y 0). */
  off: [number, number];
  /** What you bump into: a box `w` × `d` round (cx, cz), `top` high. */
  size: { w: number; d: number; top: number; cx?: number; cz?: number };
  /** Your camera while you're on it: from `eye` looking at `look`. `first`: in first person, look out from your eyes, pitched this far down. */
  cam: { eye: V3; look: V3; first?: number };
  /** Moves its parts. */
  update(s: MachineState, dt: number): void;
  /** Puts the person on it. */
  pose(p: Poser, s: MachineState): void;
  /** Kit the person wears while they're on it (the boxing gloves): puts it on, and returns what takes it off. */
  gear?(b: Bones): () => void;
}

// ---- Putting a person on a machine ------------------------------------------------------------------

const HIPS_Y = 0.42;
const SHOULDER: V3 = [0.33, 0.9, 0];
const HIP: V3 = [0.12, HIPS_Y, 0];
const ARM = 0.38;
const LEG = 0.42;
const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * Poses a person on a machine: where their hips go and how their torso leans, then a hand or foot
 * at a time onto a point of the machine (a grip, a pedal, the bar). Points are in the machine's frame.
 * Arms and legs have no elbows or knees, so a limb reaching a nearer point shortens along its length,
 * which from any distance reads as a bend.
 */
export class Poser {
  private b!: Bones;
  private frame!: THREE.Object3D;
  private spot = new THREE.Vector3();

  /** Starts a pose: `b` on the machine whose frame is `frame`, standing at `spot`. */
  begin(b: Bones, frame: THREE.Object3D, spot: V3) {
    this.b = b;
    this.frame = frame;
    this.spot.set(spot[0], spot[1], spot[2]);
    frame.updateMatrixWorld();
    frame.localToWorld(b.root.position.copy(this.spot));
    b.root.quaternion.copy(frame.getWorldQuaternion(q));
    b.root.rotation.setFromQuaternion(b.root.quaternion, 'XYZ');
    b.root.updateMatrixWorld();
    b.body.position.set(0, 0, 0);
    b.body.rotation.set(0, 0, 0);
    b.head.rotation.set(0, 0, 0);
    return this;
  }

  /** Hips at `at`, the torso pitched `lean` forward (negative: back; -π/2 lying on their back), turned `turn` and rolled `roll`. */
  hips(at: V3, lean = 0, turn = 0, roll = 0) {
    const { body, root } = this.b;
    body.rotation.set(lean, turn, roll, 'YXZ');
    // Put the hip joint (0, HIPS, 0 in the body) at the point.
    this.frame.localToWorld(tmp.set(at[0], at[1], at[2]));
    root.worldToLocal(tmp);
    tmp2.set(0, HIPS_Y, 0).applyEuler(body.rotation);
    body.position.copy(tmp).sub(tmp2);
    body.updateMatrixWorld();
    return this;
  }

  /** Aims a limb at a point of the machine's, stretching it to reach (between `min` and a hair over its length). */
  private reach(limb: THREE.Object3D, pivot: V3, side: number, len: number, at: V3, min: number) {
    this.frame.localToWorld(tmp.set(at[0], at[1], at[2]));
    this.b.body.worldToLocal(tmp);
    tmp.sub(tmp2.set(side * pivot[0], pivot[1], pivot[2]));
    const d = tmp.length();
    limb.quaternion.setFromUnitVectors(DOWN, tmp.divideScalar(Math.max(1e-4, d)));
    limb.scale.set(1, Math.max(min, Math.min(1.1, d / len)), 1);
  }

  /** The hand on `side` (-1 their right, +1 their left) onto a point. */
  hand(side: -1 | 1, at: V3) {
    this.reach(side < 0 ? this.b.armR : this.b.armL, SHOULDER, side, ARM, at, 0.45);
    return this;
  }

  /** The foot on `side` onto a point. */
  foot(side: -1 | 1, at: V3) {
    this.reach(side < 0 ? this.b.legR : this.b.legL, HIP, side, LEG, at, 0.5);
    return this;
  }

  /** An arm swung by angles instead (forward x, out z), at full length: running, guarding. */
  arm(side: -1 | 1, x: number, z: number) {
    const a = side < 0 ? this.b.armR : this.b.armL;
    a.quaternion.setFromEuler(e.set(x, 0, -side * z));
    a.scale.set(1, 1, 1);
    return this;
  }

  /** A leg swung by angles (forward x, out z). */
  leg(side: -1 | 1, x: number, z = 0) {
    const l = side < 0 ? this.b.legR : this.b.legL;
    l.quaternion.setFromEuler(e.set(x, 0, -side * z));
    l.scale.set(1, 1, 1);
    return this;
  }

  /** Nods the head (down +) and turns it. */
  head(pitch: number, yaw = 0) {
    this.b.head.rotation.set(pitch, yaw, 0);
    return this;
  }

  /** Where a point of the body (its own frame: the head's centre is 0, 1.32, 0) is in the machine's frame. */
  bodyPoint(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    this.b.body.updateMatrixWorld();
    this.b.body.localToWorld(out.set(x, y, z));
    return this.frame.worldToLocal(out);
  }
}

/** A point along the way from `a` to `b`. */
export function lerp3(a: V3, b: V3, k: number): V3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** A part that moves as one piece (a flywheel, a bar, a handle): its meshes merged into a draw call or two, the group kept to move. */
export function rigid<T extends THREE.Object3D>(g: T): T {
  const inner = new THREE.Group();
  for (const c of [...g.children]) inner.add(c);
  g.add(mergeByColor(inner));
  return g;
}

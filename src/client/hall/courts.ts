import * as THREE from 'three';
import type { Look } from '../../shared/avatar';
import { lookFromSeed } from '../../shared/avatar';
import { COURTS, type CourtId } from '../../shared/hall';
import { DOOR, FENCE_TOP, GLASS_H, HALF_L, HALF_W, SERVICE, SIDE_FENCE_H, SIDE_GLASS_FROM, SLOTS, teamOf, type Slot } from '../../shared/padel/court';
import { PADEL, PHASE, type PadelState } from '../../shared/padel/game';
import { pointCall, golden } from '../../shared/padel/rules';
import { Person } from '../world/character';
import type { Collider, Interactable } from '../world/types';
import { mergeByMaterial, mesh, toon } from '../world/toon';

/*
 * The two padel courts in the padel hall (flrnoh fork, see FORK.md "Padel"), in the office's
 * cartoon style: a blue court with white lines, the net on its posts, glass back walls (3 m) with the
 * wire fence on top to 4 m, side glass 2 m out from each back wall and fence between, with an opening
 * on each side of the net to walk on, lights overhead and a scoreboard over each court for the
 * gallery. The players (people and the computer) with rackets, and the ball, are drawn here too.
 *
 * THE HOOK for the hall's building (src/client/world/hall/...), once, when it builds the room:
 *
 *   const courts = buildCourts(interior.group);   // adds the courts to the hall's interior
 *   colliders.push(...courts.colliders);          // glass, fence and net: walkers only get on through the openings
 *   interactables.push(...courts.interactables);  // kind 'padel' (with `court`), at each court's openings
 *
 * Nothing per frame: hall/padel.ts (PadelPlay, made in main.ts) finds them with currentCourts() and
 * draws the game on them (it calls `update`).
 */

const INK = '#2b2d42';
const COURT_W = HALF_W * 2;
const COURT_L = HALF_L * 2;
const METAL = '#27323f';
/** Each team's color: team 0 (the south half) coral, team 1 teal. */
export const TEAM_COLORS = ['#ef476f', '#06a6a6'] as const;

/** Who's on a slot, to draw them: a person (their look and color) or the computer. */
export interface Cast {
  id: string;
  name: string;
  color: string;
  look: Look;
  cpu: boolean;
}

export interface CourtView {
  id: CourtId;
  /** The court's own frame, placed in the hall (its x across, z along, y up). */
  root: THREE.Group;
  /** Draws a moment of the game (null: nobody's on the court, it stands empty). */
  draw(s: PadelState | null, dt: number): void;
  /** Who plays which slot (the figures follow). */
  cast(list: readonly (Cast | null)[]): void;
  /** The scoreboard: the teams' names, games and points (null: blank). */
  board(b: { names: [string, string]; s: PadelState } | null): void;
  /** Where your next shot's aimed, on the court (only on the aiming page). */
  aim(on: boolean, x: number, z: number): void;
  /** A slot's figure, for the camera to follow. */
  figure(slot: Slot): THREE.Object3D;
  /** Whose figure the camera's behind (their name tag would be in the way), or nobody's. */
  focus(slot: Slot | null): void;
}

export interface PadelCourtsView {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  views: Record<CourtId, CourtView>;
  /** Called by PadelPlay each frame (the building needn't). */
  update(dt: number): void;
}

let current: PadelCourtsView | null = null;
/** The courts the hall has built, if it has (see buildCourts). */
export function currentCourts(): PadelCourtsView | null {
  return current;
}

// ---- Textures ----------------------------------------------------------------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let wireTex: THREE.CanvasTexture | null = null;
/** The fence's wire: a square mesh, see-through between the wires (repeated 1 per 0.5 m). */
function wire(): THREE.CanvasTexture {
  if (wireTex) return wireTex;
  wireTex = canvasTexture(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = '#3a4656';
    g.lineWidth = 3;
    for (const p of [1.5, 33.5]) {
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, 64);
      g.moveTo(0, p);
      g.lineTo(64, p);
      g.stroke();
    }
  });
  wireTex.wrapS = wireTex.wrapT = THREE.RepeatWrapping;
  return wireTex;
}

let netTex: THREE.CanvasTexture | null = null;
function netPattern(): THREE.CanvasTexture {
  if (netTex) return netTex;
  netTex = canvasTexture(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = '#1d232b';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 31, 31);
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  return netTex;
}

/** A see-through panel of wire (or net), `w` wide and `h` high, facing +z. */
function meshPanel(tex: THREE.Texture, w: number, h: number, cell: number): THREE.Mesh {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / cell, h / cell);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: true });
  m.userData.outlineParameters = { visible: false };
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  return p;
}

const glassMat = (() => {
  const m = new THREE.MeshToonMaterial({ color: '#cdeeff', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide });
  m.userData.outlineParameters = { visible: false };
  return m;
})();

// ---- The racket --------------------------------------------------------------------------------

/** A padel racket: a solid perforated head on a short grip, the head pointing along +z from the fist. */
export function racket(color: string): THREE.Group {
  const g = new THREE.Group();
  const grip = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 8), toon('#1d1d1d'), 0, 0.08, 0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20), toon(color));
  head.scale.set(1, 1, 1.15);
  head.rotation.x = Math.PI / 2;
  head.position.y = 0.3;
  head.castShadow = true;
  const face = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.034, 20), toon('#f4f1e8'), 0, 0.3, 0, false);
  face.scale.set(1, 1, 1.15);
  face.rotation.x = Math.PI / 2;
  const throat = mesh(new THREE.BoxGeometry(0.05, 0.08, 0.03), toon(color), 0, 0.17, 0);
  g.add(grip, head, face, throat);
  // Scaled up a little, like everything else a chibi holds.
  g.scale.setScalar(1.25);
  g.rotation.x = Math.PI / 2;
  g.position.set(0, -0.4, 0.02);
  return g;
}

// ---- A court -----------------------------------------------------------------------------------

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

function buildStructure(): THREE.Group {
  const g = new THREE.Group();
  const metal = toon(METAL);
  const white = toon('#fbfbf7');
  // The court: blue, on a darker slab a little wider.
  const slab = mesh(new THREE.BoxGeometry(COURT_W + 0.6, 0.04, COURT_L + 0.6), toon('#1f4a80'), 0, 0.02, 0, false);
  slab.receiveShadow = true;
  const turf = mesh(new THREE.PlaneGeometry(COURT_W, COURT_L).rotateX(-Math.PI / 2), toon('#2f74c0'), 0, 0.042, 0, false);
  turf.receiveShadow = true;
  g.add(slab, turf);
  // The lines: the service lines across, the middle line between them (a little past each).
  const LW = 0.05;
  for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(COURT_W, 0.004, LW), white, 0, 0.045, sz * SERVICE, false));
  g.add(mesh(new THREE.BoxGeometry(LW, 0.004, SERVICE * 2 + 0.4), white, 0, 0.045, 0, false));
  // Posts: every corner, the ends of the side glass, both sides of each opening, and between.
  const post = (x: number, z: number, h: number) => g.add(box(0.08, h, 0.08, metal, x, h / 2, z));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(sx * HALF_W, sz * HALF_L, FENCE_TOP);
      post(sx * HALF_W, sz * SIDE_GLASS_FROM, FENCE_TOP);
      post(sx * HALF_W, sz * DOOR.to, SIDE_FENCE_H);
      post(sx * HALF_W, sz * DOOR.from, SIDE_FENCE_H);
      post(sx * HALF_W, sz * (DOOR.to + SIDE_GLASS_FROM) / 2, SIDE_FENCE_H);
      for (const x of [-2.5, 0, 2.5]) post(x, sz * HALF_L, FENCE_TOP);
    }
  }
  // The side rails over each fence stretch (between an opening and the side glass), and over the middle bit.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const len = SIDE_GLASS_FROM - DOOR.to;
      g.add(box(0.06, 0.06, len, metal, sx * HALF_W, SIDE_FENCE_H, sz * (DOOR.to + len / 2)));
      g.add(box(0.06, 0.06, HALF_L - SIDE_GLASS_FROM, metal, sx * HALF_W, FENCE_TOP, sz * (SIDE_GLASS_FROM + (HALF_L - SIDE_GLASS_FROM) / 2)));
      g.add(box(0.06, 0.05, HALF_L - SIDE_GLASS_FROM, metal, sx * HALF_W, GLASS_H, sz * (SIDE_GLASS_FROM + (HALF_L - SIDE_GLASS_FROM) / 2)));
    }
    g.add(box(0.06, 0.06, DOOR.from * 2, metal, sx * HALF_W, SIDE_FENCE_H, 0));
  }
  for (const sz of [-1, 1]) {
    g.add(box(COURT_W, 0.06, 0.06, metal, 0, FENCE_TOP, sz * HALF_L));
    g.add(box(COURT_W, 0.05, 0.06, metal, 0, GLASS_H, sz * HALF_L));
  }
  // The net's posts and its white tape.
  for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.95, 10), metal, sx * (HALF_W + 0.02), 0.475, 0));
  g.add(box(COURT_W, 0.05, 0.025, white, 0, 0.88 - 0.025, 0));
  // The lights: four long fittings high over the court, glowing.
  const lamp = toon('#fff8dc', { emissive: '#fff3c4' });
  const housing = toon('#3b4452');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // (Casting no shadows: they'd lie across the court in stripes.)
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 3.6), housing, sx * 2.6, 8.4, sz * 5, false));
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 3.4), lamp, sx * 2.6, 8.33, sz * 5, false));
      for (const k of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.02, 1.6, 0.02), housing, sx * 2.6, 9.2, sz * 5 + k * 1.5, false));
    }
  }
  const merged = mergeByMaterial(g);
  merged.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.receiveShadow = true) : null));
  return merged;
}

/** The glass, the wire and the net: see-through, so not merged with the rest. */
function buildPanels(): THREE.Group {
  const g = new THREE.Group();
  const T = 0.025;
  for (const sz of [-1, 1]) {
    // Back glass, and the wire over it.
    g.add(mesh(new THREE.BoxGeometry(COURT_W, GLASS_H, T), glassMat, 0, GLASS_H / 2, sz * (HALF_L + T / 2), false));
    const top = meshPanel(wire(), COURT_W, FENCE_TOP - GLASS_H, 0.5);
    top.position.set(0, (GLASS_H + FENCE_TOP) / 2, sz * HALF_L);
    g.add(top);
    for (const sx of [-1, 1]) {
      // Side glass at the ends, the wire over it.
      const sideLen = HALF_L - SIDE_GLASS_FROM;
      g.add(mesh(new THREE.BoxGeometry(T, GLASS_H, sideLen), glassMat, sx * (HALF_W + T / 2), GLASS_H / 2, sz * (SIDE_GLASS_FROM + sideLen / 2), false));
      const over = meshPanel(wire(), sideLen, FENCE_TOP - GLASS_H, 0.5);
      over.rotation.y = Math.PI / 2;
      over.position.set(sx * HALF_W, (GLASS_H + FENCE_TOP) / 2, sz * (SIDE_GLASS_FROM + sideLen / 2));
      g.add(over);
      // Side fence between the opening and the glass.
      const len = SIDE_GLASS_FROM - DOOR.to;
      const f = meshPanel(wire(), len, SIDE_FENCE_H, 0.5);
      f.rotation.y = Math.PI / 2;
      f.position.set(sx * HALF_W, SIDE_FENCE_H / 2, sz * (DOOR.to + len / 2));
      g.add(f);
    }
  }
  // The bit of fence round the net's post, between the two openings.
  for (const sx of [-1, 1]) {
    const f = meshPanel(wire(), DOOR.from * 2, SIDE_FENCE_H, 0.5);
    f.rotation.y = Math.PI / 2;
    f.position.set(sx * HALF_W, SIDE_FENCE_H / 2, 0);
    g.add(f);
  }
  const net = meshPanel(netPattern(), COURT_W, 0.84, 0.06);
  net.position.set(0, 0.44, 0);
  g.add(net);
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

/** The scoreboard hanging over the court's north end, readable from the gallery (and from the south). */
function buildBoard(root: THREE.Group, name: string): (b: { names: [string, string]; s: PadelState } | null) => void {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.userData.outlineParameters = { visible: false };
  const W = 3;
  const H = 1.5;
  const holder = new THREE.Group();
  holder.position.set(0, 5.4, -HALF_L - 0.3);
  const frame = mesh(new THREE.BoxGeometry(W + 0.14, H + 0.14, 0.1), toon(INK), 0, 0, 0);
  // Two faces: one toward the gallery (north), one toward the court (south).
  const north = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  north.rotation.y = Math.PI;
  north.position.z = -0.051;
  const south = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  south.position.z = 0.051;
  holder.add(frame, north, south);
  for (const sx of [-1, 1]) holder.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 10 - 5.4 - H / 2, 6), toon(METAL), sx * (W / 2 - 0.2), (10 - 5.4) / 2 + H / 4, 0, false));
  holder.traverse((o) => (o.raycast = () => {}));
  root.add(holder);
  let shown = '';
  return (b) => {
    const s = b?.s;
    const key = b && s ? `${b.names.join('|')}|${s.games.join()}|${s.points.join()}|${s.win}|${s.server}` : '-';
    if (key === shown) return;
    shown = key;
    const g = c.getContext('2d')!;
    g.fillStyle = '#14171f';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#8fa3b8';
    g.font = '800 30px Nunito, ui-rounded, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(`🎾 ${name.toUpperCase()}`, 22, 34);
    if (!b || !s) {
      g.textAlign = 'center';
      g.fillStyle = '#5c6b7c';
      g.font = '800 34px Nunito, ui-rounded, system-ui, sans-serif';
      g.fillText('Free · E at the court to play', 256, 150);
      tex.needsUpdate = true;
      return;
    }
    g.textAlign = 'right';
    g.fillStyle = '#ffd166';
    g.fillText(s.win !== -1 ? 'MATCH' : golden(s) ? 'GOLDEN POINT' : 'GAMES   PTS', 490, 34);
    for (const team of [0, 1] as const) {
      const y = 104 + team * 84;
      g.fillStyle = TEAM_COLORS[team];
      g.fillRect(22, y - 30, 10, 60);
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      let px = 38;
      g.font = `800 ${px}px Nunito, ui-rounded, system-ui, sans-serif`;
      const text = `${teamOf(s.server) === team && s.win === -1 ? '● ' : ''}${b.names[team]}`;
      while (g.measureText(text).width > 290 && px > 18) g.font = `800 ${--px}px Nunito, ui-rounded, system-ui, sans-serif`;
      g.fillText(text, 44, y);
      g.textAlign = 'right';
      g.font = '900 56px Nunito, ui-rounded, system-ui, sans-serif';
      g.fillStyle = s.win === team ? '#06d6a0' : '#fff';
      g.fillText(String(s.games[team]), 400, y);
      g.fillStyle = '#ffd166';
      g.font = '900 44px Nunito, ui-rounded, system-ui, sans-serif';
      if (s.win === -1) g.fillText(pointCall(s.points[team]), 490, y);
    }
    tex.needsUpdate = true;
  };
}

/** A figure on the court: a person with a racket, easing toward where the game has them. */
class Figure {
  person: Person;
  private who = '';
  private swung = false;
  private moving = false;
  labelled = true;
  constructor(
    readonly root: THREE.Group,
    private slot: Slot,
  ) {
    this.person = this.make({ id: '', name: '🤖', color: TEAM_COLORS[teamOf(slot)], look: lookFromSeed(`padel-cpu-${slot}`), cpu: true });
  }

  private make(c: Cast): Person {
    const p = new Person(c.name, c.color, c.look);
    p.setLabel(c.cpu ? `🤖 ${c.name === '🤖' ? 'CPU' : c.name}` : c.name, null);
    p.wear(racket(TEAM_COLORS[teamOf(this.slot)]), 'hand');
    p.root.visible = false;
    p.root.traverse((o) => (o.userData.outlineParameters = { visible: false }));
    this.root.add(p.root);
    return p;
  }

  cast(c: Cast | null) {
    const who = c ? `${c.id}|${c.name}|${c.color}|${JSON.stringify(c.look)}` : `cpu-${this.slot}`;
    if (who === this.who) return;
    this.who = who;
    const was = this.person.root;
    this.root.remove(was);
    this.person = this.make(c ?? { id: '', name: '🤖', color: TEAM_COLORS[teamOf(this.slot)], look: lookFromSeed(`padel-cpu-${this.slot}`), cpu: true });
    this.person.showLabel(this.labelled);
    this.person.root.position.copy(was.position);
    this.person.root.rotation.copy(was.rotation);
  }

  draw(s: PadelState | null, dt: number, t: number) {
    const r = this.person.root;
    if (!s) {
      r.visible = false;
      return;
    }
    const p = s.p[this.slot];
    const k = 1 - Math.exp(-dt * 18);
    if (!r.visible || Math.hypot(r.position.x - p[0], r.position.z - p[1]) > 2.5) r.position.set(p[0], 0.04, p[1]);
    else r.position.set(r.position.x + (p[0] - r.position.x) * k, 0.04, r.position.z + (p[1] - r.position.z) * k);
    r.visible = true;
    // Swinging: the racket arm comes through, and the body turns into it.
    const sw = p[4];
    if (sw > 0 && !this.swung) this.person.reach();
    this.swung = sw > 0;
    const into = sw > 0 ? Math.sin((1 - sw / PADEL.swing) * Math.PI) * 0.9 : 0;
    const face = p[5] - into;
    let d = face - r.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.rotation.y += d * Math.min(1, dt * 14);
    const speed = Math.hypot(p[2], p[3]);
    this.moving = speed > (this.moving ? 0.25 : 0.6);
    this.person.update(dt, t, this.moving, false, Math.max(1, speed / 2.2));
  }
}

function buildCourt(def: (typeof COURTS)[number]): CourtView {
  const root = new THREE.Group();
  root.name = `padel-${def.id}`;
  root.position.set(def.x, 0, def.z);
  root.add(buildStructure(), buildPanels());
  const board = buildBoard(root, def.name);
  board(null);
  // The ball, and its shadow on the court.
  const ball = mesh(new THREE.SphereGeometry(0.065, 14, 10), toon('#e3f542', { emissive: '#3d4400' }), 0, -5, 0);
  ball.userData.outlineParameters = { thickness: 0.004 };
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
  shadowMat.userData.outlineParameters = { visible: false };
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16).rotateX(-Math.PI / 2), shadowMat);
  shadow.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8, depthWrite: false }));
  ring.material.userData.outlineParameters = { visible: false };
  ring.position.y = 0.055;
  ring.visible = false;
  for (const o of [ball, shadow, ring]) o.raycast = () => {};
  root.add(ball, shadow, ring);
  const figures = SLOTS.map((slot) => new Figure(root, slot));
  let t = 0;
  return {
    id: def.id,
    root,
    draw(s, dt) {
      t += dt;
      for (const f of figures) f.draw(s, dt, t);
      const b = s?.b;
      const up = !!b && b[1] > -1 && !(s!.phase === PHASE.dead && s!.win !== -1);
      ball.visible = shadow.visible = up;
      if (up) {
        ball.position.set(b[0], b[1] + 0.03, b[2]);
        shadow.position.set(b[0], 0.05, b[2]);
        const k = Math.max(0.35, 1 - b[1] / 6);
        shadow.scale.setScalar(0.6 + b[1] * 0.25);
        shadowMat.opacity = 0.35 * k;
      }
    },
    cast(list) {
      figures.forEach((f, i) => f.cast(list[i] ?? null));
    },
    board,
    aim(on, x, z) {
      ring.visible = on;
      if (on) ring.position.set(x, 0.055, z);
    },
    figure: (slot) => figures[slot].person.root,
    focus(slot) {
      figures.forEach((f, i) => {
        const on = i !== slot;
        if (f.labelled !== on) f.person.showLabel((f.labelled = on));
      });
    },
  };
}

/** Colliders round a court (the hall's coordinates): glass and fence all round but the openings, and the net. */
function courtColliders(cx: number, cz: number): Collider[] {
  const T = 0.08;
  const out: Collider[] = [];
  const top = FENCE_TOP;
  for (const sz of [-1, 1]) out.push({ minX: cx - HALF_W - T, maxX: cx + HALF_W + T, minZ: cz + sz * HALF_L - T, maxZ: cz + sz * HALF_L + T, top, fence: true });
  for (const sx of [-1, 1]) {
    const x = cx + sx * HALF_W;
    for (const [a, b] of [
      [-HALF_L, -DOOR.to],
      [-DOOR.from, DOOR.from],
      [DOOR.to, HALF_L],
    ]) out.push({ minX: x - T, maxX: x + T, minZ: cz + a, maxZ: cz + b, top, fence: true });
  }
  out.push({ minX: cx - HALF_W, maxX: cx + HALF_W, minZ: cz - 0.05, maxZ: cz + 0.05, top: 0.95, fence: true });
  return out;
}

/**
 * Builds both courts into `parent` (the hall's interior, whose coordinates the courts' positions in
 * shared/hall.ts are in). Returns the courts' colliders and interactables for the hall to add to its
 * own, and makes them the ones currentCourts() hands PadelPlay.
 */
export function buildCourts(parent?: THREE.Object3D): PadelCourtsView {
  const group = new THREE.Group();
  group.name = 'padel-courts';
  const views = {} as Record<CourtId, CourtView>;
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  for (const def of COURTS) {
    const v = buildCourt(def);
    views[def.id] = v;
    group.add(v.root);
    colliders.push(...courtColliders(def.x, def.z));
    // E at either opening on either side of the court.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const it: Interactable = { kind: 'padel', court: def.id, x: def.x + sx * HALF_W, z: def.z + sz * (DOOR.from + DOOR.to) / 2, radius: 1.5 };
        interactables.push(it);
      }
    }
    // Clicking the court (its posts and slab) is E at it too.
    const it = interactables[interactables.length - 1];
    v.root.children[0].traverse((o) => (o.userData.interact = it));
  }
  // A light over each court, besides the hall's own.
  for (const def of COURTS) {
    const l = new THREE.PointLight('#fff4d6', 30, 26, 1.6);
    l.position.set(def.x, 7.8, def.z);
    group.add(l);
  }
  parent?.add(group);
  const view: PadelCourtsView = { group, colliders, interactables, views, update: () => {} };
  current = view;
  return view;
}

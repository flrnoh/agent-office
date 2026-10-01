import * as THREE from 'three';
import { HOCKEY, type HockeyState } from '../../shared/tablegames/hockey';
import { KICKER, RODS, manV, type KickerState } from '../../shared/tablegames/kicker';
import { PONG, PHASE, type PongState } from '../../shared/tablegames/pingpong';
import { POCKETS, POOL, POOL_PHASE, type PoolState } from '../../shared/tablegames/pool';
import { TABLES, type TableDef, type TableId } from '../../shared/tablegames/tables';
import type { GameState } from '../../shared/tablegames/game';
import type { Collider, Interactable } from '../world/types';
import { mergeByMaterial, mesh, roundedBox, toon } from '../world/toon';

// The four tables on the roof (flrnoh fork, see shared/tablegames): a pool table, a kicker, an air
// hockey table and a table tennis table, in the roof's cartoon style, and what's on them moving as
// the game goes. Each table is drawn in its own frame: x along its length (u), z across (v), y up
// from the roof, so the games' numbers go straight onto it.

const INK = '#2b2d42';
/** Each side's color, the same at every table: side 0 red, side 1 blue. */
export const SIDE_COLORS = ['#ef476f', '#4895ef'] as const;

export interface TableView {
  def: TableDef;
  root: THREE.Group;
  /** Draws a game state on the table (the mine: what your own hand is doing right now, drawn over it). */
  draw(s: GameState, dt: number): void;
  /** The scoreboard over the table: who's playing, and the score (null: nobody's playing). */
  board(text: string | null): void;
  /** Out of the way while the camera's over the table (it hangs where the camera goes). */
  boardAway(away: boolean): void;
  /** Only for the one aiming: a guide line from the cue ball (pool), or nothing. */
  guide?(on: boolean, u: number, v: number, angle: number): void;
  /** Where the cue ball in hand would go (pool), while placing it. */
  ghost?(on: boolean, u: number, v: number, ok: boolean): void;
}

export interface RoofTablesView {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  views: Record<TableId, TableView>;
}

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

/** A toon material with a picture on it, and no outline. */
function toonMap(map: THREE.Texture): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: (toon('#fff') as THREE.MeshToonMaterial).gradientMap });
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** A flat picture lying on the table at height y, `l` long and `w` wide. */
function surface(map: THREE.Texture, l: number, w: number, y: number): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(l, w).rotateX(-Math.PI / 2), toonMap(map), 0, y, 0, false);
  m.receiveShadow = true;
  return m;
}

/** Four legs under a top `l` by `w`, `h` tall. */
function legs(g: THREE.Object3D, l: number, w: number, h: number, mat: THREE.Material, r = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(r * 2, h, r * 2), mat, sx * (l / 2 - r * 2), h / 2, sz * (w / 2 - r * 2)));
}

/** The scoreboard sprite over a table: redrawn only when what it says changes. */
function scoreboard(root: THREE.Object3D, y: number): { board: (text: string | null) => void; boardAway: (away: boolean) => void } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.6, 0.3, 1);
  sprite.position.y = y;
  sprite.visible = false;
  sprite.renderOrder = 10;
  sprite.raycast = () => {};
  root.add(sprite);
  let shown: string | null = null;
  let away = false;
  const boardAway = (a: boolean) => {
    away = a;
    sprite.visible = !!shown && !away;
  };
  const board = (text: string | null) => {
    if (text === shown) return;
    shown = text;
    sprite.visible = !!text && !away;
    if (!text) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 96);
    g.fillStyle = 'rgba(43, 45, 66, 0.85)';
    g.beginPath();
    g.roundRect(4, 8, 504, 80, 24);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let px = 40;
    g.font = `900 ${px}px Nunito, ui-rounded, system-ui, sans-serif`;
    while (g.measureText(text).width > 470 && px > 16) g.font = `900 ${--px}px Nunito, ui-rounded, system-ui, sans-serif`;
    g.fillText(text, 256, 50);
    tex.needsUpdate = true;
  };
  return { board, boardAway };
}

/** Moves a mesh toward a spot smoothly (snapshots come a couple of dozen times a second). */
function ease(o: THREE.Object3D, x: number, y: number, z: number, dt: number, rate = 30) {
  const k = dt <= 0 ? 1 : 1 - Math.exp(-dt * rate);
  // A jump (a new game, a ball back on the spot): straight there.
  if (Math.abs(o.position.x - x) + Math.abs(o.position.z - z) > 0.6) o.position.set(x, y, z);
  else o.position.set(o.position.x + (x - o.position.x) * k, o.position.y + (y - o.position.y) * k, o.position.z + (z - o.position.z) * k);
}

function place(def: TableDef): THREE.Group {
  const root = new THREE.Group();
  root.position.set(def.x, 0, def.z);
  root.rotation.y = def.rotY;
  return root;
}

function collider(def: TableDef, top: number): Collider {
  const turned = Math.abs(Math.sin(def.rotY)) > 0.5;
  const hl = (turned ? def.outerWidth : def.outerLength) / 2;
  const hw = (turned ? def.outerLength : def.outerWidth) / 2;
  return { minX: def.x - hl, maxX: def.x + hl, minZ: def.z - hw, maxZ: def.z + hw, top };
}

// ---- Pool -------------------------------------------------------------------------------------------

const BALL_COLORS = ['#fffdf5', '#f6c700', '#1d4ed8', '#d62828', '#6a1b9a', '#f77f00', '#2a9d8f', '#7f1d1d', '#111111'];

/** A pool ball's face: its color (a band of it on white for a stripe) and its number in a white spot. */
function ballTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(128, 64, (g) => {
    const color = BALL_COLORS[n > 8 ? n - 8 : n];
    g.fillStyle = n > 8 ? '#fffdf5' : color;
    g.fillRect(0, 0, 128, 64);
    if (n > 8) {
      g.fillStyle = color;
      g.fillRect(0, 18, 128, 28);
    }
    if (n === 0) return;
    for (const cx of [32, 96]) {
      g.fillStyle = '#fffdf5';
      g.beginPath();
      g.arc(cx, 32, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = '900 15px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), cx, 33);
    }
  });
}

function buildPool(def: TableDef): TableView {
  const root = place(def);
  const P = POOL;
  const statics = new THREE.Group();
  const wood = toon('#5a3420');
  const woodLight = toon('#7a4a2c');
  const felt = '#1f7a58';
  const top = def.top;
  const L = def.outerLength;
  const W = def.outerWidth;
  // The body, the legs and the rails.
  statics.add(mesh(roundedBox(L - 0.1, 0.22, W - 0.1, 0.05), wood, 0, top - 0.14, 0));
  legs(statics, L - 0.3, W - 0.3, top - 0.24, woodLight, 0.07);
  const rail = 0.16;
  const railH = 0.045;
  const feltMat = toon('#26946a');
  for (const s of [-1, 1]) {
    statics.add(mesh(new THREE.BoxGeometry(L, railH + 0.02, rail), wood, 0, top + railH / 2 - 0.01, s * (W / 2 - rail / 2)));
    statics.add(mesh(new THREE.BoxGeometry(rail, railH + 0.02, W), wood, s * (L / 2 - rail / 2), top + railH / 2 - 0.01, 0));
    // The green cushions on the inside edge.
    statics.add(mesh(new THREE.BoxGeometry(P.halfL * 2, railH, 0.03), feltMat, 0, top + railH / 2, s * (P.halfW + 0.015), false));
    statics.add(mesh(new THREE.BoxGeometry(0.03, railH, P.halfW * 2), feltMat, s * (P.halfL + 0.015), top + railH / 2, 0, false));
  }
  // The diamonds on the rails.
  const pearl = toon('#f4f1ea');
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    for (const s of [-1, 1]) statics.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 8), pearl, -P.halfL + (i * P.halfL) / 4, top + railH + 0.012, s * (W / 2 - rail / 2), false));
  }
  root.add(mergeByMaterial(statics));
  // The cloth: the head string and the foot spot marked on it.
  const cloth = canvasTexture(1024, 512, (g) => {
    g.fillStyle = felt;
    g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(256, 0);
    g.lineTo(256, 512);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(768, 256, 6, 0, Math.PI * 2);
    g.fill();
  });
  root.add(surface(cloth, P.halfL * 2 + 0.06, P.halfW * 2 + 0.06, top + 0.001));
  // The pockets: black holes with a leather rim.
  const hole = toon('#111111');
  for (const p of POCKETS) {
    const r = p.r * 0.95;
    root.add(mesh(new THREE.CylinderGeometry(r, r, 0.012, 20), hole, p.u + Math.sign(p.u) * 0.012, top + 0.003, p.v + Math.sign(p.v) * 0.012, false));
  }
  // The balls.
  const geo = new THREE.SphereGeometry(P.ball, 20, 14);
  const balls = Array.from({ length: 16 }, (_, n) => {
    const b = mesh(geo, toonMap(ballTexture(n)), 0, top + P.ball, 0, true);
    b.rotation.z = Math.PI / 2;
    root.add(b);
    return b;
  });
  // The cue, and the guide line for whoever's aiming.
  const cue = new THREE.Group();
  const stick = new THREE.Group();
  stick.add(mesh(new THREE.CylinderGeometry(0.006, 0.013, 1.45, 10).rotateZ(Math.PI / 2), toon('#d9b27c'), -0.725 - 0.04, 0, 0, false));
  stick.add(mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.4, 10).rotateZ(Math.PI / 2), toon(INK), -1.3, 0, 0, false));
  stick.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.015, 10).rotateZ(Math.PI / 2), toon('#4895ef'), -0.045, 0, 0, false));
  stick.rotation.z = -0.08;
  cue.add(stick);
  cue.visible = false;
  root.add(cue);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.7 }));
  line.computeLineDistances();
  line.visible = false;
  line.raycast = () => {};
  root.add(line);
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 });
  const ghostBall = mesh(geo, ghostMat, 0, top + P.ball, 0, false);
  ghostBall.visible = false;
  root.add(ghostBall);
  const sb = scoreboard(root, 2.2);
  return {
    def,
    root,
    ...sb,
    draw(state, dt) {
      const s = state as PoolState;
      s.balls.forEach((b, n) => {
        const m = balls[n];
        m.visible = !!b[4];
        if (!b[4]) return;
        const was = m.position.clone();
        ease(m, b[0], top + P.ball, b[1], dt, 40);
        // Rolling: turned by how far it went.
        const dx = m.position.x - was.x;
        const dz = m.position.z - was.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-5) m.rotateOnWorldAxis(new THREE.Vector3(dz / d, 0, -dx / d).applyQuaternion(root.quaternion), d / P.ball);
      });
      const c = s.balls[0];
      cue.visible = s.phase === POOL_PHASE.aim && s.win === -1 && !!c[4];
      if (cue.visible) {
        cue.position.set(balls[0].position.x, top + P.ball + 0.01, balls[0].position.z);
        cue.rotation.y = -s.aim[0];
        stick.position.x = -0.02 - s.aim[1] * 0.25;
      }
    },
    guide(on, u, v, angle) {
      line.visible = on;
      if (!on) return;
      line.position.set(u, top + P.ball, v);
      line.rotation.y = -angle;
      line.scale.x = 0.9;
    },
    ghost(on, u, v, ok) {
      ghostBall.visible = on;
      if (!on) return;
      // Putting the cue ball down: no cue yet.
      cue.visible = false;
      ghostBall.position.set(u, top + P.ball, v);
      ghostMat.color.set(ok ? '#ffffff' : '#ff5d5d');
    },
  };
}

// ---- Kicker -----------------------------------------------------------------------------------------

function buildKicker(def: TableDef): TableView {
  const root = place(def);
  const K = KICKER;
  const top = def.top;
  const L = def.outerLength;
  const W = def.outerWidth;
  const statics = new THREE.Group();
  const body = toon('#2b2d42');
  const trim = toon('#ffd166');
  // The box: sides up round the field, legs, and a goal slot at each end.
  const wallH = 0.12;
  statics.add(mesh(roundedBox(L, 0.14, W, 0.03), body, 0, top - 0.07, 0));
  for (const s of [-1, 1]) {
    statics.add(mesh(new THREE.BoxGeometry(L, wallH, 0.05), body, 0, top + wallH / 2, s * (W / 2 - 0.025)));
    for (const g of [-1, 1]) statics.add(mesh(new THREE.BoxGeometry(0.1, wallH, (W - K.goal * 2) / 2 - 0.05), body, s * (L / 2 - 0.05), top + wallH / 2, g * (K.goal + ((W - K.goal * 2) / 2 - 0.05) / 2)));
    statics.add(mesh(new THREE.BoxGeometry(0.1, 0.04, K.goal * 2), body, s * (L / 2 - 0.05), top + wallH - 0.02, 0));
    statics.add(mesh(new THREE.BoxGeometry(L + 0.01, 0.02, 0.055), trim, 0, top + wallH + 0.01, s * (W / 2 - 0.025), false));
  }
  legs(statics, L - 0.1, W - 0.1, top - 0.14, body, 0.05);
  // A cross brace low between the legs, and a bar on it for your drink.
  statics.add(mesh(new THREE.BoxGeometry(L - 0.3, 0.05, 0.05), body, 0, 0.18, 0, false));
  root.add(mergeByMaterial(statics));
  // The field: green stripes, the lines, the goals' boxes.
  const field = canvasTexture(1024, 580, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#3a9d4a' : '#43ad53';
      g.fillRect(i * 128, 0, 128, 580);
    }
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 5;
    g.strokeRect(6, 6, 1012, 568);
    g.beginPath();
    g.moveTo(512, 0);
    g.lineTo(512, 580);
    g.stroke();
    g.beginPath();
    g.arc(512, 290, 80, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(6, 180, 90, 220);
    g.strokeRect(928, 180, 90, 220);
  });
  root.add(surface(field, K.halfL * 2, K.halfW * 2, top + 0.001));
  // The goals' dark mouths.
  for (const s of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.02, 0.06, K.goal * 2), toon('#111'), s * (K.halfL + 0.02), top + 0.03, 0, false));
  // The rods, each side's men on them, and the handles out the side you stand at.
  const steel = toon('#c9d1d9');
  const rodY = top + 0.085;
  const rods = RODS.map((r) => {
    const g = new THREE.Group();
    g.position.set(r.u, rodY, 0);
    const len = W + 0.36;
    // Side 0 stands at -v: its handles come out that way.
    const out = r.side === 0 ? -1 : 1;
    const bar = mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 8).rotateX(Math.PI / 2), steel, 0, 0, out * 0.12, false);
    g.add(bar);
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10).rotateX(Math.PI / 2), toon(INK), 0, 0, out * (len / 2 + 0.07), false));
    const men = new THREE.Group();
    const shirt = toon(SIDE_COLORS[r.side]);
    const skin = toon('#f1c27d');
    for (let i = 0; i < r.men; i++) {
      const man = new THREE.Group();
      man.position.z = manV(r, i, 0);
      man.add(mesh(new THREE.BoxGeometry(0.022, 0.045, 0.034), shirt, 0, 0.0, 0, false));
      man.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), skin, 0, 0.035, 0, false));
      man.add(mesh(new THREE.BoxGeometry(0.018, 0.05, 0.03), toon('#f4f1ea'), 0, -0.045, 0, false));
      man.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), toon(INK), 0.005, -0.072, 0, false));
      men.add(man);
    }
    g.add(men);
    root.add(g);
    return { rod: r, men, g };
  });
  const ball = mesh(new THREE.SphereGeometry(K.ball, 16, 12), toon('#fffdf5'), 0, top + K.ball, 0, true);
  root.add(ball);
  const sb = scoreboard(root, 1.9);
  return {
    def,
    root,
    ...sb,
    draw(state, dt) {
      const s = state as KickerState;
      ease(ball, s.b[0], top + K.ball, s.b[1], dt, 45);
      ball.visible = s.pause <= 0 || s.pause < KICKER.pause - 0.35;
      rods.forEach(({ rod, men, g }, k) => {
        g.position.z = s.off[k];
        // A kick: the men swing their feet through toward the far goal, and back.
        const t = s.kick[rod.side];
        const phase = t > 0 ? 1 - t / KICKER.kick : 0;
        men.rotation.z = (rod.side === 0 ? 1 : -1) * Math.sin(phase * Math.PI) * 1.2;
      });
    },
  };
}

// ---- Air hockey -------------------------------------------------------------------------------------

function buildHockey(def: TableDef): TableView {
  const root = place(def);
  const H = HOCKEY;
  const top = def.top;
  const L = def.outerLength;
  const W = def.outerWidth;
  const statics = new THREE.Group();
  const shell = toon('#1d3557');
  const railMat = toon('#e9ecef');
  statics.add(mesh(roundedBox(L, 0.24, W, 0.06), shell, 0, top - 0.12, 0));
  // Its base: a solid pedestal either end, as on the arcade ones.
  for (const s of [-1, 1]) statics.add(mesh(new THREE.BoxGeometry(0.4, top - 0.24, W - 0.2), shell, s * (L / 2 - 0.35), (top - 0.24) / 2, 0));
  statics.add(mesh(new THREE.BoxGeometry(L - 1.1, 0.12, 0.2), shell, 0, 0.35, 0, false));
  const railH = 0.035;
  const rw = (W - H.halfW * 2) / 2;
  for (const s of [-1, 1]) {
    statics.add(mesh(new THREE.BoxGeometry(L, railH, rw), railMat, 0, top + railH / 2, s * (H.halfW + rw / 2)));
    // The ends, with the goal's slot in the middle.
    const side = (H.halfW - H.goal) / 1;
    for (const g of [-1, 1]) statics.add(mesh(new THREE.BoxGeometry((L - H.halfL * 2) / 2, railH, side), railMat, s * (H.halfL + (L - H.halfL * 2) / 4), top + railH / 2, g * (H.goal + side / 2)));
    statics.add(mesh(new THREE.BoxGeometry((L - H.halfL * 2) / 2, 0.01, H.goal * 2), toon('#0b0b12'), s * (H.halfL + (L - H.halfL * 2) / 4), top + 0.002, 0, false));
  }
  root.add(mergeByMaterial(statics));
  // The playing surface: pale blue with its air holes, the center line and circles, the goal creases.
  const face = canvasTexture(1024, 512, (g) => {
    g.fillStyle = '#e8f4ff';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(29, 53, 87, 0.18)';
    for (let x = 12; x < 1024; x += 24) for (let y = 12; y < 512; y += 24) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    g.strokeStyle = '#ef476f';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(512, 0);
    g.lineTo(512, 512);
    g.stroke();
    g.beginPath();
    g.arc(512, 256, 70, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#4895ef';
    for (const x of [0, 1024]) {
      g.beginPath();
      g.arc(x, 256, 110, 0, Math.PI * 2);
      g.stroke();
    }
  });
  root.add(surface(face, H.halfL * 2, H.halfW * 2, top + 0.001));
  const puck = mesh(new THREE.CylinderGeometry(H.puck, H.puck, 0.012, 24), toon('#ff5d2b'), 0, top + 0.006, 0, true);
  root.add(puck);
  const mallets = SIDE_COLORS.map((c) => {
    const m = new THREE.Group();
    m.add(mesh(new THREE.CylinderGeometry(H.mallet, H.mallet, 0.025, 24), toon(c), 0, 0.0125, 0, true));
    m.add(mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.05, 14), toon(c), 0, 0.05, 0, false));
    m.add(mesh(new THREE.SphereGeometry(0.024, 12, 8), toon(c), 0, 0.078, 0, false));
    m.position.y = top;
    root.add(m);
    return m;
  });
  const sb = scoreboard(root, 2.0);
  return {
    def,
    root,
    ...sb,
    draw(state, dt) {
      const s = state as HockeyState;
      puck.visible = s.pause < HOCKEY.pause - 0.4 || s.pause <= 0;
      ease(puck, s.p[0], top + 0.006, s.p[1], dt, 45);
      s.m.forEach((m, i) => ease(mallets[i], m[0], top, m[1], dt, 45));
    },
  };
}

// ---- Table tennis -----------------------------------------------------------------------------------

function buildPingpong(def: TableDef): TableView {
  const root = place(def);
  const P = PONG;
  const top = def.top;
  const statics = new THREE.Group();
  const frame = toon('#3d405b');
  statics.add(mesh(new THREE.BoxGeometry(P.halfL * 2, 0.03, P.halfW * 2), toon('#14507a'), 0, top - 0.015, 0));
  // Legs folded in under each half, on wheels.
  for (const s of [-1, 1]) {
    for (const z of [-1, 1]) statics.add(mesh(new THREE.BoxGeometry(0.05, top - 0.03, 0.05), frame, s * (P.halfL - 0.35), (top - 0.03) / 2, z * (P.halfW - 0.2)));
    statics.add(mesh(new THREE.BoxGeometry(0.05, 0.05, P.halfW * 2 - 0.4), frame, s * (P.halfL - 0.35), 0.25, 0, false));
  }
  // The net across the middle, on a post either side.
  for (const z of [-1, 1]) statics.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, P.net + 0.03, 8), frame, 0, top + (P.net + 0.03) / 2, z * (P.halfW + 0.08), false));
  root.add(mergeByMaterial(statics));
  const lines = canvasTexture(1024, 570, (g) => {
    g.fillStyle = '#1b6aa0';
    g.fillRect(0, 0, 1024, 570);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 1016, 562);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 285);
    g.lineTo(1024, 285);
    g.stroke();
  });
  root.add(surface(lines, P.halfL * 2, P.halfW * 2, top + 0.001));
  const netTex = canvasTexture(256, 32, (g) => {
    g.clearRect(0, 0, 256, 32);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1;
    for (let x = 0; x < 256; x += 5) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 32);
      g.stroke();
    }
    for (let y = 0; y < 32; y += 5) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 256, 4);
  });
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const net = mesh(new THREE.PlaneGeometry(P.halfW * 2 + 0.16, P.net).rotateY(Math.PI / 2), netMat, 0, top + P.net / 2, 0, false);
  root.add(net);
  const ball = mesh(new THREE.SphereGeometry(P.ball, 14, 10), toon('#ff9f1c'), 0, top + 0.3, 0, true);
  root.add(ball);
  const shadow = mesh(new THREE.CircleGeometry(P.ball, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }), 0, top + 0.003, 0, false);
  shadow.raycast = () => {};
  root.add(shadow);
  const paddles = SIDE_COLORS.map((c, i) => {
    const g = new THREE.Group();
    const face = new THREE.Group();
    face.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 20).rotateZ(Math.PI / 2), toon(c), 0, 0.1, 0, false));
    face.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.028), toon('#b08968'), 0, 0.02, 0, false));
    g.add(face);
    g.position.set(i === 0 ? -P.halfL - 0.25 : P.halfL + 0.25, top + 0.05, 0);
    root.add(g);
    return { g, face };
  });
  const sb = scoreboard(root, 2.1);
  return {
    def,
    root,
    ...sb,
    draw(state, dt) {
      const s = state as PongState;
      ease(ball, s.b[0], top + s.b[2], s.b[1], dt, 50);
      const onTable = Math.abs(ball.position.x) <= P.halfL && Math.abs(ball.position.z) <= P.halfW && ball.position.y > top - 0.02;
      shadow.visible = onTable && s.phase !== PHASE.dead;
      shadow.position.set(ball.position.x, top + 0.003, ball.position.z);
      s.pad.forEach((p, i) => {
        const { g, face } = paddles[i];
        ease(g, p[0], top + 0.05, p[1], dt, 40);
        // A swing: the paddle sweeps forward through the ball.
        const sw = s.sw[i];
        const k = sw > 0 ? 1 - sw / PONG.swing : 0;
        face.rotation.z = (i === 0 ? -1 : 1) * (sw > 0 ? Math.sin(k * Math.PI) * 0.9 : 0.15);
      });
    },
  };
}

/** All four tables, placed on the roof, with their colliders and where to press E. */
export function buildRoofTables(): RoofTablesView {
  const group = new THREE.Group();
  const views: Record<TableId, TableView> = { pool: buildPool(TABLES.pool), kicker: buildKicker(TABLES.kicker), hockey: buildHockey(TABLES.hockey), pingpong: buildPingpong(TABLES.pingpong) };
  const colliders: Collider[] = [];
  const interactables: Interactable[] = [];
  for (const v of Object.values(views)) {
    group.add(v.root);
    colliders.push(collider(v.def, v.def.top));
    const it: Interactable = { kind: 'table', table: v.def.id, x: v.def.x, z: v.def.z, radius: Math.max(v.def.outerLength, v.def.outerWidth) / 2 + 1 };
    interactables.push(it);
    v.root.traverse((o) => (o.userData.interact = it));
  }
  return { group, colliders, interactables, views };
}

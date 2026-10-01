import * as THREE from 'three';
import { GOAL, PITCH, PITCH_CX, TEAM_COLOR, defends, type Team } from '../../shared/soccer';
import type { Celebration } from '../../shared/soccer-stats';
import type { Person } from '../world/character';
import { FONT } from '../world/casino/parts';

/*
 * The soccer hall's players (flrnoh fork, see FORK.md "The soccer hall"): their kit and how they move
 * beyond walking. The kit is a team-coloured shirt over the body and arms with the
 * player's short name and number on the back and the number small on the chest, shorts and socks in
 * the team's colours. The moves are laid over each body's pose after Person.update has done its
 * frame (Person.limbs hands them over): a kick (the right leg swings through), celebrations after
 * a goal (arms up, a knee slide, the aeroplane, jumping), teammates' high fives, a goalkeeper's dive
 * when the ball flies past someone in their own penalty area, and the run in a replay.
 */

type Rig = ReturnType<Person['limbs']>;

/** Seconds a kick's swing takes, a celebration lasts at most, and a dive. */
export const KICK_S = 0.5;
export const DIVE_S = 0.8;
const DIVE_GAP_S = 1.4;

/** A name as the back of a shirt has it: upper case, the first word, at most 10 letters. */
export function shirtName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.toUpperCase().slice(0, 10);
}

/** A team's shorts: the shirt's colour, darker. */
const SHORTS: Record<Team, string> = { red: '#8f1d27', blue: '#16457f' };

/** The print on the back: the name over the number, white with a dark edge. */
function backPrint(name: string, number: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const label = shirtName(name);
  let size = 44;
  g.font = `900 ${size}px ${FONT}`;
  while (size > 18 && g.measureText(label).width > 220) {
    size -= 2;
    g.font = `900 ${size}px ${FONT}`;
  }
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.strokeText(label, 128, 40);
  g.fillStyle = '#ffffff';
  g.fillText(label, 128, 40);
  g.font = `900 170px ${FONT}`;
  g.lineWidth = 12;
  g.strokeText(String(number), 128, 158);
  g.fillText(String(number), 128, 158);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function chestPrint(number: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 72px ${FONT}`;
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.strokeText(String(number), 64, 68);
  g.fillStyle = '#ffffff';
  g.fillText(String(number), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const noOutline = (m: THREE.Material) => {
  m.userData.outlineParameters = { visible: false };
  return m;
};

/** A kit on someone: what was put on them (to take it off again), and whose. */
export interface Kit {
  team: Team;
  name: string;
  number: number;
  parts: THREE.Object3D[];
  textures: THREE.Texture[];
}

/** Dresses `rig` in `team`'s kit with `name` and `number` on the back. */
export function dress(rig: Rig, team: Team, name: string, number: number): Kit {
  const parts: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];
  const shirt = new THREE.MeshToonMaterial({ color: TEAM_COLOR[team] });
  const shorts = new THREE.MeshToonMaterial({ color: SHORTS[team] });
  const white = new THREE.MeshToonMaterial({ color: '#f4f4f0' });
  const add = (to: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.userData.soccerKit = true;
    to.add(m);
    parts.push(m);
    return m;
  };
  // The shirt, a little bigger than the body; a white collar.
  const torso = add(rig.body, new THREE.CapsuleGeometry(0.274, 0.27, 4, 16), shirt, 0, 0.72, 0);
  torso.scale.set(1, 1, 0.98);
  const collar = add(rig.body, new THREE.TorusGeometry(0.15, 0.025, 6, 20), white, 0, 1.02, 0);
  collar.rotation.x = Math.PI / 2;
  // The back: name and number on a band round the shirt's back (u runs left to right seen from behind).
  const back = backPrint(name, number);
  textures.push(back);
  const backMat = noOutline(new THREE.MeshBasicMaterial({ map: back, transparent: true, depthWrite: false }));
  (backMat as THREE.MeshBasicMaterial).toneMapped = false;
  add(rig.body, new THREE.CylinderGeometry(0.281, 0.281, 0.3, 16, 1, true, Math.PI - 0.8, 1.6), backMat, 0, 0.74, 0);
  const chest = chestPrint(number);
  textures.push(chest);
  const chestMat = noOutline(new THREE.MeshBasicMaterial({ map: chest, transparent: true, depthWrite: false }));
  add(rig.body, new THREE.CylinderGeometry(0.281, 0.281, 0.1, 8, 1, true, 0.3, 0.45), chestMat, 0, 0.84, 0);
  // Sleeves, down to the wrist.
  for (const arm of [rig.armL, rig.armR]) add(arm, new THREE.CapsuleGeometry(0.088, 0.24, 4, 10), shirt, 0, -0.16, 0);
  // Shorts, and socks up to the knee with a white band.
  for (const leg of [rig.legL, rig.legR]) {
    add(leg, new THREE.CapsuleGeometry(0.125, 0.07, 4, 10), shorts, 0, -0.05, 0);
    add(leg, new THREE.CylinderGeometry(0.107, 0.107, 0.14, 12), shirt, 0, -0.27, 0);
    add(leg, new THREE.CylinderGeometry(0.109, 0.109, 0.025, 12), white, 0, -0.2, 0);
  }
  return { team, name, number, parts, textures };
}

/** Takes a kit off again. */
export function undress(k: Kit) {
  for (const p of k.parts) {
    p.removeFromParent();
    const m = p as THREE.Mesh;
    m.geometry?.dispose();
  }
  for (const t of k.textures) t.dispose();
  k.parts.length = 0;
}

// ---- The goalkeeper's dive ------------------------------------------------------------------------

/**
 * Whether someone of `team` at (px, pz) dives for the ball, and to which side (world x: -1 or 1, 0 not):
 * they stand in their own penalty area, the ball comes fast at their goal and will pass them within
 * reach but not right at them, soon.
 */
export function diveSide(team: Team, px: number, pz: number, b: { x: number; y: number; z: number; vx: number; vz: number }): -1 | 0 | 1 {
  const north = defends(team) === 'north';
  const lineZ = north ? PITCH.minZ : PITCH.maxZ;
  if (Math.abs(pz - lineZ) > 5 || Math.abs(px - PITCH_CX) > GOAL.width / 2 + 2.5) return 0;
  const toward = north ? -b.vz : b.vz;
  if (toward < 5 || b.y > 2.2) return 0;
  // Still in front of them (between the ball and their goal line, it hasn't passed).
  const t = (pz - b.z) / b.vz;
  if (!(t > 0) || t > 0.6) return 0;
  const off = b.x + b.vx * t - px;
  if (Math.abs(off) < 0.4 || Math.abs(off) > 2.2) return 0;
  return off > 0 ? 1 : -1;
}

// ---- The moves ------------------------------------------------------------------------------------

interface Moves {
  kickT: number;
  celebrate: { kind: Celebration; t: number } | null;
  highFive: number;
  dive: { side: number; t: number } | null;
  diveGap: number;
  run: number;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = THREE.MathUtils.lerp;

export class SoccerMoves {
  private all = new Map<string, Moves>();

  private of(id: string): Moves {
    let m = this.all.get(id);
    if (!m) this.all.set(id, (m = { kickT: -1, celebrate: null, highFive: -1, dive: null, diveGap: 0, run: 0 }));
    return m;
  }

  kick(id: string) {
    this.of(id).kickT = 0;
  }

  celebrate(id: string, kind: Celebration) {
    this.of(id).celebrate = { kind, t: 0 };
  }

  highFive(id: string) {
    this.of(id).highFive = 0;
  }

  /** A dive to world side `side` (-1/1) for someone facing `rotY`. Not again straight away. */
  dive(id: string, side: number, rotY: number): boolean {
    const m = this.of(id);
    if (m.dive || m.diveGap > 0) return false;
    // Their own left or right: their local x in the world is (cos, -sin) of their facing.
    const local = Math.sign(side * Math.cos(rotY)) || side;
    m.dive = { side: local, t: 0 };
    return true;
  }

  /** The goal's celebrations are over (the kickoff). */
  calmDown() {
    for (const m of this.all.values()) {
      m.celebrate = null;
      m.highFive = -1;
    }
  }

  isCelebrating(id: string): Celebration | null {
    return this.all.get(id)?.celebrate?.kind ?? null;
  }

  forget(id: string) {
    this.all.delete(id);
  }

  clear() {
    this.all.clear();
  }

  /**
   * Lays `id`'s moves over their pose this frame. `replaySpeed` (m/s): in a replay, running at that
   * speed (the live pose is whatever they do now, not then); `live` false holds celebrations back.
   */
  apply(id: string, rig: Rig, dt: number, opts: { replaySpeed?: number; live?: boolean } = {}) {
    const m = this.all.get(id);
    const replay = opts.replaySpeed !== undefined;
    if (replay) {
      // Running in the replay: a walk cycle at their speed then.
      const s = Math.min(1, opts.replaySpeed! / 3);
      const mm = this.of(id);
      mm.run += dt * 11 * (0.4 + s);
      const swing = Math.sin(mm.run) * 0.8 * s;
      rig.legL.rotation.x = swing;
      rig.legR.rotation.x = -swing;
      rig.armL.rotation.x = -swing;
      rig.armR.rotation.x = swing;
      rig.armL.rotation.z = -0.1;
      rig.armR.rotation.z = 0.1;
      rig.body.rotation.set(s * 0.12, 0, 0);
      rig.body.position.y = Math.abs(Math.sin(mm.run)) * 0.06 * s;
    }
    if (!m) return;
    if (m.diveGap > 0) m.diveGap -= dt;

    if (m.kickT >= 0) {
      m.kickT += dt;
      const t = m.kickT;
      // Back (0..0.12 s), through (..0.24 s), and down again (..KICK_S).
      const leg = t < 0.12 ? lerp(0, 0.85, ease(t / 0.12)) : t < 0.24 ? lerp(0.85, -1.45, ease((t - 0.12) / 0.12)) : lerp(-1.45, 0, ease(Math.min(1, (t - 0.24) / (KICK_S - 0.24))));
      rig.legL.rotation.x = leg;
      rig.legR.rotation.x = Math.max(rig.legR.rotation.x, 0.1);
      // The other arm out for balance, leaning back a touch as the leg comes through.
      const k = Math.sin(Math.min(1, t / KICK_S) * Math.PI);
      rig.armR.rotation.z = lerp(rig.armR.rotation.z, 1.1, k);
      rig.armL.rotation.x = lerp(rig.armL.rotation.x, -0.7, k);
      rig.body.rotation.x = -0.14 * k;
      if (t >= KICK_S) m.kickT = -1;
    }

    if (m.dive) {
      m.dive.t += dt;
      const p = Math.min(1, m.dive.t / DIVE_S);
      // Out fast, held, and back up.
      const k = p < 0.35 ? ease(p / 0.35) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3);
      const s = m.dive.side;
      rig.body.rotation.z = -s * 1.15 * k;
      rig.body.position.y = Math.sin(Math.min(1, p / 0.5) * Math.PI) * 0.25;
      rig.armL.rotation.set(-0.3 * k, 0, lerp(rig.armL.rotation.z, -2.6, k));
      rig.armR.rotation.set(-0.3 * k, 0, lerp(rig.armR.rotation.z, 2.6, k));
      rig.legL.rotation.z = -0.25 * k;
      rig.legR.rotation.z = 0.25 * k;
      if (p >= 1) {
        m.dive = null;
        m.diveGap = DIVE_GAP_S;
        rig.legL.rotation.z = rig.legR.rotation.z = 0;
      }
    }

    if (replay || opts.live === false) return;

    if (m.celebrate) {
      const c = m.celebrate;
      c.t += dt;
      const t = c.t;
      const on = Math.min(1, t / 0.25);
      switch (c.kind) {
        case 'arms':
          // Both arms up, waving, bouncing on the toes.
          rig.armL.rotation.set(0, 0, lerp(-0.1, -2.8 + Math.sin(t * 10) * 0.25, on));
          rig.armR.rotation.set(0, 0, lerp(0.1, 2.8 - Math.sin(t * 10) * 0.25, on));
          rig.body.position.y = Math.abs(Math.sin(t * 8)) * 0.1;
          break;
        case 'slide':
          // On the knees, leaning back, arms wide.
          rig.body.position.y = -0.3 * on;
          rig.body.rotation.x = -0.35 * on;
          rig.legL.rotation.x = rig.legR.rotation.x = 1.25 * on;
          rig.armL.rotation.set(-0.4 * on, 0, -1.9 * on);
          rig.armR.rotation.set(-0.4 * on, 0, 1.9 * on);
          rig.head.rotation.x = -0.3 * on;
          break;
        case 'plane':
          // The aeroplane: arms out, banking.
          rig.armL.rotation.set(0, 0, -1.5 * on);
          rig.armR.rotation.set(0, 0, 1.5 * on);
          rig.body.rotation.z = Math.sin(t * 3) * 0.3 * on;
          break;
        case 'jump': {
          // Jumping, a fist pumping the air.
          const up = Math.abs(Math.sin(t * 6));
          rig.body.position.y = up * 0.35;
          rig.armL.rotation.set(0, 0, -2.9 + Math.sin(t * 12) * 0.2);
          rig.armR.rotation.set(-0.8, 0, 0.3);
          rig.legL.rotation.x = rig.legR.rotation.x = -0.5 * up;
          break;
        }
      }
    } else if (m.highFive >= 0) {
      m.highFive += dt;
      // A hand up for the scorer.
      const on = Math.min(1, m.highFive / 0.3);
      rig.armL.rotation.set(0, 0, -2.7 * on + Math.sin(m.highFive * 9) * 0.15 * on);
    }
  }
}

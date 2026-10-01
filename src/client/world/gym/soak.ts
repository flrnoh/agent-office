import * as THREE from 'three';
import type { WellnessView } from '../../../shared/gym-wellness';
import { JACUZZI, MASSAGE_TABLES, MASSAGE_TOP, MASSEURS, PLUNGE, PLUNGE_WATER, isSoak, soakOff, soakPlace, type SoakPlace } from '../../../shared/gym-rooms';
import type { Interactable } from '../types';
import { Person, type Bones } from '../character';
import { mesh, textPlane, toon } from '../toon';
import { blk, type GymParts } from './kit';
import { Poser } from './machines/kit';
import { water } from './textures';

/*
 * Getting into the spa (flrnoh fork, see FORK.md "Rooms, spa and detail"): the jacuzzi, the cold
 * plunge and the massage tables are places you get into, not things you stand in front of. Whoever's
 * in one (by the office's WellnessView.slots, so every page agrees) is posed there every frame: sat
 * back in the jacuzzi's water with their arms along the rim, crouched neck-deep and shivering in the
 * plunge's ice, or face down on a massage table while the masseur beside it kneads their back. The
 * masseurs stand by their tables all the time, hands folded, until someone lies down. Also builds the
 * plunge itself: an open steel tub of ice water you can see down into, not a lid. Where you're held
 * while you're in, where you step out, and the camera's framing are here too (client/gym.ts).
 */

type V3 = [number, number, number];
type Spot = { x: number; y: number; z: number; rotY: number };
export type Body = { name: string; person: Person };

export interface Soak {
  /** Whether station `id` is one you get into. */
  has(id: string): boolean;
  setStation(id: string, state: unknown): void;
  /** Where `name` is held while they're in station `id` (their place in it), or null. */
  spot(id: string, name: string): Spot | null;
  /** Where you step out of station `id`. */
  off(id: string): Spot | null;
  /** Your camera while you're in station `id`. */
  frame(id: string, name: string, camera: THREE.PerspectiveCamera, dt: number): void;
  /** You got out: the next framing starts from wherever the camera is. */
  unframe(): void;
  /** Poses everyone who's in, works the masseurs, ripples the plunge. */
  update(t: number, dt: number, who: { people: Body[]; you: Body | null }): void;
}

const poser = new Poser();
const v = new THREE.Vector3();
const w = new THREE.Vector3();

/** The masseurs' looks: white tunics. */
const MASSEUR_LOOKS = [
  { name: 'Masseur Jonas', look: { skin: 1, hair: 2, style: 3 } },
  { name: 'Masseurin Lea', look: { skin: 4, hair: 0, style: 1 } },
] as const;

export function buildSoak(p: GymParts): Soak {
  const views = new Map<string, WellnessView>();
  // A frame per place: where it is and which way it faces (the pose's points are in it).
  const frames = new Map<string, { frame: THREE.Object3D; place: SoakPlace }>();
  const frameOf = (id: string, slot: number) => {
    const key = `${id}:${slot}`;
    let f = frames.get(key);
    if (!f) {
      const place = soakPlace(id, slot)!;
      const frame = new THREE.Object3D();
      frame.position.set(place.x, 0, place.z);
      frame.rotation.y = place.rotY;
      p.group.add(frame);
      f = { frame, place };
      frames.set(key, f);
    }
    return f;
  };
  const slotOf = (id: string, name: string): number => {
    const view = views.get(id);
    const at = view?.slots?.indexOf(name) ?? -1;
    if (at >= 0) return at;
    // Not in yet as far as the office has said: the first free place.
    return Math.max(0, view?.slots?.indexOf('') ?? 0);
  };

  // ---- The cold plunge: an open steel tub, ice water a hand below its rim, a ladder ----------------
  const P = PLUNGE;
  const side = P.half * 2;
  const steelMat = toon('#aeb9c0');
  const frostMat = toon('#eef6f8');
  // Its walls and rim stay their own meshes (not merged), so looking at any of it is looking at the plunge.
  const tubParts: THREE.Object3D[] = [];
  const part = (w0: number, h0: number, d0: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = mesh(new THREE.BoxGeometry(w0, h0, d0), mat, x, y, z, false);
    p.group.add(m);
    tubParts.push(m);
  };
  for (const [w0, d0, x, z] of [
    [side, 0.08, P.x, P.z - P.half + 0.04],
    [side, 0.08, P.x, P.z + P.half - 0.04],
    [0.08, side, P.x - P.half + 0.04, P.z],
    [0.08, side, P.x + P.half - 0.04, P.z],
  ] as const)
    part(w0, P.rim, d0, steelMat, x, P.rim / 2, z);
  // A frosty rim round the top: a frame, not a cover.
  for (const [w0, d0, x, z] of [
    [side + 0.08, 0.12, P.x, P.z - P.half],
    [side + 0.08, 0.12, P.x, P.z + P.half],
    [0.12, side + 0.08, P.x - P.half, P.z],
    [0.12, side + 0.08, P.x + P.half, P.z],
  ] as const)
    part(w0, 0.05, d0, frostMat, x, P.rim + 0.02, z);
  // Inside: a pale tiled bottom and walls, so you see down into it.
  blk(p, side - 0.16, 0.04, side - 0.16, '#cfe9f2', P.x, 0.02, P.z);
  const iceTex = water('#7fd0ea', 'rgba(255,255,255,0.65)', 111);
  const iceMat = new THREE.MeshBasicMaterial({ map: iceTex, transparent: true, opacity: 0.72, toneMapped: false, depthWrite: false });
  iceMat.userData.outlineParameters = { visible: false };
  const iceWater = mesh(new THREE.PlaneGeometry(side - 0.16, side - 0.16), iceMat, P.x, PLUNGE_WATER, P.z, false);
  iceWater.rotation.x = -Math.PI / 2;
  iceWater.renderOrder = 2;
  p.group.add(iceWater);
  const cubes: THREE.Mesh[] = [];
  const iceCube = toon('#e8fbff', { opacity: 0.85 });
  for (let i = 0; i < 11; i++) {
    const c = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), iceCube, P.x - 0.45 + (i % 4) * 0.3 + ((i * 37) % 10) / 60, PLUNGE_WATER + 0.02, P.z - 0.45 + Math.floor(i / 4) * 0.42 + ((i * 53) % 10) / 70, false);
    c.rotation.y = i * 0.7;
    p.group.add(c);
    cubes.push(c);
  }
  const steel = toon('#c9d1d6');
  for (const dx of [-0.2, 0.2]) {
    const pts = [new THREE.Vector3(P.x + dx, 0, P.z - P.half - 0.25), new THREE.Vector3(P.x + dx, 1.05, P.z - P.half - 0.25), new THREE.Vector3(P.x + dx, 1.1, P.z - P.half + 0.05), new THREE.Vector3(P.x + dx, P.rim - 0.3, P.z - P.half + 0.12)];
    p.still.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.02, 6), steel, 0, 0, 0, false));
  }
  const cold = textPlane('🧊 4 °C', { bg: '#12303a', color: '#cdeefd', size: 40 });
  cold.position.set(P.x, 0.5, P.z + P.half + 0.01);
  cold.scale.setScalar(0.6);
  p.group.add(cold);
  const plungeIt: Interactable = { kind: 'gymstation', gymStation: 'coldplunge', x: P.x, z: P.z, y: 0, radius: P.half + 1.2 };
  p.interactables.push(plungeIt);
  for (const o of [iceWater, ...cubes, ...tubParts]) o.userData.interact = plungeIt;

  // ---- The masseurs, one by each table ------------------------------------------------------------
  const masseurs = MASSEURS.map((m, i) => {
    const who = MASSEUR_LOOKS[i % MASSEUR_LOOKS.length];
    const person = new Person(who.name, '#f4f4ee', { ...who.look });
    person.setLabel(who.name, null);
    const frame = new THREE.Object3D();
    frame.position.set(m.x, 0, m.z);
    frame.rotation.y = m.rotY;
    p.group.add(frame, person.root);
    const table = MASSAGE_TABLES.find((t) => t.id === m.table)!;
    // Clicking the masseur is asking for a massage.
    const it = p.interactables.find((x) => x.kind === 'gymstation' && x.gymStation === m.table);
    if (it) person.root.traverse((o) => (o.userData.interact = it));
    return { person, frame, table, phase: i * 1.7, client: false };
  });

  /** A masseur's hands on the back of whoever's on the table (or folded in front, waiting). */
  const workMasseur = (m: (typeof masseurs)[number], b: Bones, t: number) => {
    poser.begin(b, m.frame, [0, 0, 0]);
    if (!m.client) {
      poser.hips([0, 0.42, 0], 0.04).hand(-1, [-0.06, 0.62, 0.24]).hand(1, [0.06, 0.62, 0.24]).head(0.25 + Math.sin(t * 0.4 + m.phase) * 0.05);
      return;
    }
    // Kneading up and down the back, the hands taking turns, leaning into each press.
    const u = t * 1.7 + m.phase;
    const press = Math.max(0, Math.sin(u * 2));
    poser.hips([0, 0.42, 0], 0.5 + press * 0.08);
    const back = MASSAGE_TOP + 0.5;
    for (const [hand, off] of [
      [-1, 0],
      [1, Math.PI],
    ] as const) {
      const along = 0.15 + 0.22 * (0.5 + 0.5 * Math.sin(u + off));
      v.set(m.table.x + along, back - 0.03 * press, m.table.z + hand * 0.09);
      m.frame.worldToLocal(v);
      poser.hand(hand, [v.x, v.y, v.z]);
    }
    poser.head(0.55);
  };
  for (const m of masseurs) m.person.setWorkout((b, _dt, t) => workMasseur(m, b, t));

  // ---- Who's in, posed ----------------------------------------------------------------------------

  /** Sat back on the jacuzzi's bench, up to the chest, arms along the rim. */
  const tub = (t: number, k: number) => {
    poser.hips([0, 0.06 + Math.sin(t * 1.3 + k) * 0.012, 0.02], -0.32);
    for (const s of [-1, 1] as const) {
      poser.foot(s, [s * 0.17, 0.04, 0.62]);
      poser.hand(s, [s * 0.62, JACUZZI.rim - 0.02, -0.2]);
    }
    poser.head(-0.12, Math.sin(t * 0.3 + k) * 0.25);
  };
  /** Crouched neck-deep in the ice, hugging the knees, shivering. */
  const plunge = (t: number) => {
    poser.hips([0, 0.1, 0], 0.22, 0, Math.sin(t * 41) * 0.03);
    for (const s of [-1, 1] as const) {
      poser.foot(s, [s * 0.14, 0.03, 0.36]);
      poser.hand(s, [s * 0.12, 0.38, 0.3]);
    }
    poser.head(0.12, Math.sin(t * 29) * 0.05);
  };
  /** Face down along the table, head in the face rest, arms hanging off the sides, pressed with each knead. */
  const massage = (t: number, worked: boolean) => {
    const press = worked ? Math.max(0, Math.sin((t * 1.7 + 0) * 2)) : 0;
    poser.hips([0, MASSAGE_TOP + 0.26 - press * 0.015, -0.12], Math.PI / 2);
    for (const s of [-1, 1] as const) {
      poser.foot(s, [s * 0.12, MASSAGE_TOP + 0.2, -0.95]);
      poser.hand(s, [s * 0.45, MASSAGE_TOP - 0.15, 0.45]);
    }
    poser.head(0);
  };

  /** Who's posed in each place now (so they're let go when they get out). */
  const posed = new Map<string, Person>();
  let framing: string | null = null;
  const camAt = new THREE.Vector3();

  return {
    has: isSoak,
    setStation(id, state) {
      const view = state as WellnessView | null;
      if (view?.kind === 'wellness' && isSoak(id)) views.set(id, view);
    },
    spot(id, name) {
      if (!isSoak(id)) return null;
      const place = soakPlace(id, slotOf(id, name));
      return place ? { x: place.x, y: 0, z: place.z, rotY: place.rotY } : null;
    },
    off(id) {
      const o = soakOff(id);
      return o ? { x: o.x, y: 0, z: o.z, rotY: o.rotY } : null;
    },
    unframe() {
      framing = null;
    },
    frame(id, name, camera, dt) {
      const place = soakPlace(id, slotOf(id, name));
      if (!place) return;
      // Across the jacuzzi from your place, beside the plunge, from the table's foot.
      const fx = Math.sin(place.rotY);
      const fz = Math.cos(place.rotY);
      if (place.pose === 'tub') {
        v.set(place.x + fx * 2.9 + fz * 0.6, 1.65, place.z + fz * 2.9 - fx * 0.6);
        w.set(place.x, 0.75, place.z);
      } else if (place.pose === 'plunge') {
        v.set(place.x - 1.5, 1.9, place.z + 1.4);
        w.set(place.x, 0.6, place.z);
      } else {
        // From above the table's other side, looking down across your back at the masseur's hands.
        const by = Math.sign((MASSEURS.find((m) => m.table === id)?.z ?? place.z + 1) - place.z);
        v.set(place.x - 0.5, 2.5, place.z - by * 0.85);
        w.set(place.x + 0.2, MASSAGE_TOP + 0.25, place.z + by * 0.15);
      }
      if (framing !== id) {
        framing = id;
        camAt.copy(camera.position);
      }
      camAt.lerp(v, Math.min(1, dt * 4));
      camera.position.copy(camAt);
      camera.lookAt(w);
    },
    update(t, dt, who) {
      const everyone = who.you ? [who.you, ...who.people] : who.people;
      const now = new Map<string, Person>();
      for (const [id, view] of views) {
        const slots = view.slots ?? [];
        slots.forEach((name, slot) => {
          if (!name) return;
          const { frame, place } = frameOf(id, slot);
          // The one by that name nearest the place (they're held there, so they're right on it).
          let best = 3;
          let person: Person | null = null;
          for (const b of everyone) {
            if (b.name !== name) continue;
            const d = Math.hypot(b.person.root.position.x - place.x, b.person.root.position.z - place.z);
            if (d < best) {
              best = d;
              person = b.person;
            }
          }
          if (!person) return;
          const key = `${id}:${slot}`;
          now.set(key, person);
          const k = slot * 1.9;
          const worked = place.pose === 'massage';
          const pose = (b: Bones, _dt: number, tt: number) => {
            poser.begin(b, frame, [0, 0, 0]);
            if (place.pose === 'tub') tub(tt, k);
            else if (place.pose === 'plunge') plunge(tt);
            else massage(tt, worked);
          };
          if (posed.get(key) !== person) {
            posed.get(key)?.setWorkout(null);
            person.setWorkout(pose);
          }
          // Posed after their own update this frame.
          poser.begin(person.bones, frame, [0, 0, 0]);
          if (place.pose === 'tub') tub(t, k);
          else if (place.pose === 'plunge') plunge(t);
          else massage(t, worked);
        });
      }
      for (const [key, person] of posed) if (now.get(key) !== person && ![...now.values()].includes(person)) person.setWorkout(null);
      posed.clear();
      for (const [key, person] of now) posed.set(key, person);
      // The masseurs: at work while someone's on their table.
      for (const m of masseurs) {
        m.client = !!views.get(m.table.id)?.slots?.some((n) => n);
        m.person.update(dt, t, false, false);
      }
      // The plunge's ice bobs.
      iceTex.offset.set(Math.sin(t * 0.3) * 0.02, t * 0.005);
      cubes.forEach((c, i) => {
        c.position.y = PLUNGE_WATER + 0.02 + Math.sin(t * 1.6 + i) * 0.012;
        c.rotation.y += dt * 0.05 * (i % 2 ? 1 : -1);
      });
    },
  };
}

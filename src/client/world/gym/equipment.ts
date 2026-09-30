import * as THREE from 'three';
import type { GymStationDef } from '../../../shared/gym';
import type { CardioView } from '../../../shared/gym-cardio';
import { EXERCISES, type StrengthView } from '../../../shared/gym-strength';
import { REP_PEAK, cardioHz, ease, setAttempts, setMotion, type SetMotion } from '../../../shared/gym-motion';
import type { Collider, Interactable } from '../office';
import type { Bones, Person } from '../character';
import { mergeByColor } from '../toon';
import { Poser, type Machine, type MachineState } from './machines/kit';
import { treadmill } from './machines/treadmill';
import { bike } from './machines/bike';
import { rower } from './machines/rower';
import { elliptical } from './machines/elliptical';
import { bench } from './machines/bench';
import { squat } from './machines/squat';
import { deadlift } from './machines/deadlift';
import { legpress } from './machines/legpress';
import { latpull } from './machines/latpull';
import { shoulder } from './machines/shoulder';
import { cableCross } from './machines/cable';
import { dumbbells } from './machines/dumbbells';
import { bag } from './machines/bag';

/*
 * The gym's cardio and strength equipment, alive (flrnoh fork, see FORK.md "The gym" → Equipment):
 * builds every machine at its station (machines/*.ts), merges their still parts into a handful of
 * draw calls, and every frame turns each station's view from the office into motion — a belt's
 * speed, a pedal stroke, where a set's reps are — for the machine and for whoever's on it, everyone's
 * page alike. The person on a station is found by the name in its view (you, when it's yours), put on
 * the machine and posed there; step off and they're let go. It also frames your camera while you're
 * on one, and says where you stand on it and where you step off.
 */

export type MachineSound = 'step' | 'whirr' | 'whoosh' | 'clank' | 'thud' | 'punch';

const BUILDERS: Record<string, () => Machine> = {
  treadmill,
  bike,
  rower,
  elliptical,
  bench,
  squat,
  deadlift,
  legpress,
  latpull,
  shoulder,
  cable: cableCross,
  dumbbell: dumbbells,
  bag,
};

/** Barbells thud when a rep lands; the stacks clank; the bag gets punched. */
/** When in a combo each punch lands (see machines/bag.ts). */
const BAG_PEAKS = [0.18, 0.42, 0.7];
const REP_SOUND: Record<string, MachineSound> = { bench: 'thud', squat: 'thud', deadlift: 'thud', dumbbell: 'thud', legpress: 'clank', latpull: 'clank', shoulder: 'clank', cable: 'clank', bag: 'punch' };

interface Station {
  def: GymStationDef;
  machine: Machine;
  frame: THREE.Group;
  kind: 'cardio' | 'strength';
  view: CardioView | StrengthView | null;
  state: MachineState;
  /** A set under way: when it started (office clock) and how it goes. */
  set: { since: number; attempts: number; failed: boolean } | null;
  /** Who's posed on it now, and what takes their kit off again. */
  on: { person: Person; ungear: (() => void) | null } | null;
  /** For sounds: the last half-stride / stroke / rep peak heard. */
  beat: number;
}

/** Everyone in the gym with you, by the name the office knows them by. */
export interface Occupants {
  people: { name: string; person: Person }[];
  you: { name: string; person: Person } | null;
  /** The station you're on (your window's open there and the office has you on it), or null. */
  mine: string | null;
}

export interface Equipment {
  /** A station's view from the office. */
  setStation(id: string, state: unknown): boolean;
  /** Moves every machine and poses everyone on one. `now` is the office's clock (ms). */
  update(t: number, dt: number, now: number, who: Occupants, sound: (kind: MachineSound, at: THREE.Vector3) => void): void;
  /** Where you stand on a station (world), facing its way, and where you step off. */
  spot(id: string): { x: number; y: number; z: number; rotY: number } | null;
  off(id: string): { x: number; y: number; z: number; rotY: number } | null;
  /** Your camera on station `id`: framed on you, or (first person on cardio) out from your eyes. Returns whether it's first person. */
  frame(id: string, camera: THREE.PerspectiveCamera, dt: number, firstPerson: boolean, head: THREE.Vector3 | null): boolean;
  /** Whether station `id`'s camera looks out from your eyes in first person. */
  firstPerson(id: string): boolean;
  /** You got off: the next framing starts from wherever the camera is then. */
  unframe(): void;
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** What a cardio console says. */
function cardioLines(machine: string, view: CardioView | null, speed: number, hz: number, t: number): string[] {
  if (!view?.player) return ['OFFICE FIT', ['·  ', '·· ', '···'][Math.floor(t) % 3]];
  if (!view.running) return ['READY', view.player.slice(0, 14)];
  const dist = view.meters >= 1000 ? `${(view.meters / 1000).toFixed(2)} km` : `${view.meters} m`;
  let main: string;
  if (machine === 'bike') main = `${Math.round(hz * 60)} rpm`;
  else if (machine === 'rower') main = speed > 0.1 ? `${fmtTime(500 / speed)} /500m` : '-:-- /500m';
  else if (machine === 'elliptical') main = `${Math.round(hz * 120)} spm`;
  else main = `${(speed * 3.6).toFixed(1)} km/h`;
  return [main, `${dist} · ${fmtTime(view.secs)}`];
}

export function buildEquipment(parent: THREE.Group, defs: readonly GymStationDef[], colliders: Collider[], interactables: Interactable[]): Equipment {
  const stations = new Map<string, Station>();
  const poser = new Poser();
  for (const def of defs) {
    if (def.kind !== 'cardio' && def.kind !== 'strength') continue;
    const build = BUILDERS[def.machine];
    if (!build) continue;
    const machine = build();
    const frame = new THREE.Group();
    // At the station, or nudged off it along the floor where the machine asks (see Machine.shift).
    const [sx, sz] = machine.shift ?? [0, 0];
    frame.position.set(def.x + sx * Math.cos(def.rotY) + sz * Math.sin(def.rotY), 0, def.z - sx * Math.sin(def.rotY) + sz * Math.cos(def.rotY));
    frame.rotation.y = def.rotY;
    // Its still parts merged into a draw call or two, beside the parts that move.
    const still = new THREE.Group();
    still.add(machine.statics);
    frame.add(mergeByColor(still), machine.live);
    parent.add(frame);
    // What you bump into: the machine's footprint, turned with it (axis-aligned round it).
    const { w: sw, d: sd, top, cx = 0, cz = 0 } = machine.size;
    const c = Math.abs(Math.cos(def.rotY));
    const s = Math.abs(Math.sin(def.rotY));
    const hx = (sw / 2) * c + (sd / 2) * s;
    const hz = (sw / 2) * s + (sd / 2) * c;
    const ox = frame.position.x + cx * Math.cos(def.rotY) + cz * Math.sin(def.rotY);
    const oz = frame.position.z - cx * Math.sin(def.rotY) + cz * Math.cos(def.rotY);
    colliders.push({ minX: ox - hx, maxX: ox + hx, minZ: oz - hz, maxZ: oz + hz, bottom: 0, top });
    const it: Interactable = { kind: 'gym-station', gymStation: def.id, x: ox, z: oz, y: 0, radius: Math.max(hx, hz) + 1.1 };
    frame.userData.interact = it;
    interactables.push(it);
    const ex = EXERCISES[def.machine];
    stations.set(def.id, {
      def,
      machine,
      frame,
      kind: def.kind,
      view: null,
      state: { on: false, running: false, speed: 0, phase: 0, hz: 0, set: null, weight: ex ? ex.base : 0, max: ex ? ex.max : 1, lines: [], t: 0 },
      set: null,
      on: null,
      beat: 0,
    });
    machine.update(stations.get(def.id)!.state, 0);
  }

  const release = (st: Station) => {
    if (!st.on) return;
    st.on.ungear?.();
    st.on.person.setWorkout(null);
    st.on = null;
  };

  const posePerson = (st: Station, b: Bones) => {
    poser.begin(b, st.frame, st.machine.spot);
    st.machine.pose(poser, st.state);
  };

  const toWorld = (st: Station, x: number, y: number, z: number) => st.frame.localToWorld(v.set(x, y, z));
  /** Your framed camera: which station it's on, and where it's got to. */
  let framing: string | null = null;
  const camAt = new THREE.Vector3();

  return {
    setStation(id, state) {
      const st = stations.get(id);
      if (!st || !state || typeof state !== 'object') return false;
      const view = state as CardioView | StrengthView;
      if (view.kind !== st.kind) return false;
      st.view = view;
      if (view.kind === 'strength') {
        st.state.weight = view.weight;
        if (view.working && view.last) {
          const since = view.since ?? Date.now();
          if (!st.set || st.set.since !== since) st.set = { since, attempts: setAttempts(view.last), failed: view.last.failed };
        }
      }
      return true;
    },

    update(t, dt, now, who, sound) {
      for (const st of stations.values()) {
        const s = st.state;
        const view = st.view;
        s.t = t;
        s.on = !!view?.player;
        if (st.kind === 'cardio') {
          const cv = view as CardioView | null;
          s.running = !!cv?.running;
          s.speed = ease(s.speed, s.running ? (cv?.speed ?? 0) : 0, dt, 2.2);
          if (s.speed < 0.01 && !s.running) s.speed = 0;
          s.hz = cardioHz(st.def.machine, s.speed);
          s.phase += s.hz * dt;
          s.lines = cardioLines(st.def.machine, cv, s.speed, s.hz, t);
          // A footfall on every half stride; a whirr or a whoosh on every turn or stroke.
          const per = st.def.machine === 'treadmill' || st.def.machine === 'elliptical' ? 2 : 1;
          const beat = Math.floor(s.phase * per);
          if (beat !== st.beat) {
            st.beat = beat;
            if (s.running && s.speed > 0.3) {
              const at = toWorld(st, 0, 0.3, 0);
              const m = st.def.machine;
              sound(m === 'rower' ? 'whoosh' : m === 'bike' ? 'whirr' : 'step', at);
            }
          }
        } else {
          if (!s.on) st.set = null;
          let motion: SetMotion | null = null;
          if (st.set) {
            motion = setMotion(st.def.machine, (now - st.set.since) / 1000, st.set.attempts, st.set.failed);
            if (motion.stage === 'done') st.set = null;
          }
          s.set = motion && motion.stage !== 'done' ? motion : null;
          s.running = !!s.set;
          // Each rep's far point: a thud, a clank, or (the bag) each punch of the combo. Your own
          // set's reps are already heard from its window, all but the punches.
          if (s.set && s.set.stage === 'rep') {
            const peaks = st.def.machine === 'bag' ? BAG_PEAKS : [REP_PEAK];
            const u = s.set.u;
            const beat = s.set.rep * peaks.length + peaks.filter((p) => u >= p).length;
            if (beat !== st.beat) {
              const crossed = st.beat >= 0 && beat > st.beat;
              st.beat = beat;
              const mine = who.mine === st.def.id && st.def.machine !== 'bag';
              if (crossed && !mine) sound(REP_SOUND[st.def.machine] ?? 'clank', toWorld(st, 0, 1, 0.3));
            }
          } else st.beat = -1;
        }

        // Who's on it: you, or someone in here by that name standing at it.
        let person: Person | null = null;
        if (s.on && view?.player) {
          if (who.mine === st.def.id && who.you) person = who.you.person;
          else {
            const spot = toWorld(st, ...st.machine.spot).clone();
            let best = 3;
            for (const p of who.people) {
              if (p.name !== view.player) continue;
              const d = Math.hypot(p.person.root.position.x - spot.x, p.person.root.position.z - spot.z);
              if (d < best) {
                best = d;
                person = p.person;
              }
            }
          }
        }
        if (st.on && st.on.person !== person) release(st);
        if (person && !st.on) {
          st.on = { person, ungear: st.machine.gear ? st.machine.gear(person.bones) : null };
          person.setWorkout((b) => posePerson(st, b));
        }
        // Posed after everything else this frame (their own update ran before), then the machine follows.
        if (st.on) posePerson(st, st.on.person.bones);
        st.machine.update(s, dt);
      }
    },

    spot(id) {
      const st = stations.get(id);
      if (!st) return null;
      const p = toWorld(st, ...st.machine.spot);
      return { x: p.x, y: p.y, z: p.z, rotY: st.def.rotY };
    },

    off(id) {
      const st = stations.get(id);
      if (!st) return null;
      const p = toWorld(st, st.machine.off[0], 0, st.machine.off[1]);
      // Facing the machine as you step off it.
      const rotY = Math.atan2(st.frame.position.x - p.x, st.frame.position.z - p.z);
      return { x: p.x, y: 0, z: p.z, rotY };
    },

    unframe() {
      framing = null;
    },

    firstPerson(id) {
      return stations.get(id)?.machine.cam.first !== undefined;
    },

    frame(id, camera, dt, firstPerson, head) {
      const st = stations.get(id);
      if (!st) return false;
      const cam = st.machine.cam;
      if (firstPerson && cam.first !== undefined && head) {
        framing = null;
        // Out from your eyes, straight ahead along the machine, looking down at the console.
        const yaw = st.def.rotY + Math.PI;
        camera.position.copy(head).add(w.set(Math.sin(st.def.rotY), 0, Math.cos(st.def.rotY)).multiplyScalar(0.14));
        camera.rotation.set(-cam.first, yaw, 0, 'YXZ');
        return true;
      }
      // Glides over to its framing from wherever the camera was when you got on (its own position:
      // the player's camera pulls the real one back toward you every frame).
      const eye = toWorld(st, ...cam.eye);
      if (framing !== id) {
        framing = id;
        camAt.copy(camera.position);
      }
      camAt.lerp(eye, Math.min(1, dt * 4));
      camera.position.copy(camAt);
      camera.lookAt(toWorld(st, ...cam.look));
      return false;
    },
  };
}

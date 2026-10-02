import * as THREE from 'three';
import type { InstrumentKind } from '../../../shared/venue';
import type { DrumPiece } from '../../../shared/instruments-play';
import type { Bones, Person } from '../../world/character';
import { mesh, toon } from '../../world/toon';
import { stringed, type StringFinish } from './gear/strings';

// ---- The players at their instruments (flrnoh fork, see FORK.md "The instruments") ----------------------
// Whoever plays something is posed at it (Person.setWorkout) and moves with what they play, for
// everyone to see: the drummer sits on the throne, sticks in both hands, the hand that hit a piece
// coming down on it and the right foot on the pedal; a guitarist or bassist has the instrument
// strapped on, the picking arm strumming with every stroke, the other hand up the neck, shifting
// with the chords; a keyboarder's hands go down as keys do, left for the low notes, right for the
// high; a singer has a hand on the mic at their mouth, nodding along. In first person you see your
// own sticks or guitar (the hands' scene).

/** Which hand plays each drum piece (a right-handed drummer: hats with the right hand crossed over). */
const HAND: Record<DrumPiece, 'L' | 'R' | 'foot'> = { kick: 'foot', snare: 'L', hihat: 'R', openhat: 'R', tomHi: 'L', tomMid: 'R', tomLow: 'R', crash: 'L', ride: 'R' };
/** Where each piece pulls the arm: how far forward (x, negative is forward) and out (z) it reaches. */
const REACH: Record<DrumPiece, [number, number]> = { kick: [0, 0], snare: [-0.85, 0.12], hihat: [-0.95, -0.42], openhat: [-0.95, -0.42], tomHi: [-1.2, 0.05], tomMid: [-1.2, 0.05], tomLow: [-0.75, -0.42], crash: [-1.75, 0.35], ride: [-1.45, -0.55] };

/** What one player is doing, as their pose reads it. */
export interface Playing {
  kind: InstrumentKind;
  /** Seconds (performance clock) of the last stroke of each hand, and what the stroke reached for. */
  hitL: number;
  hitR: number;
  hitFoot: number;
  reachL: [number, number];
  reachR: [number, number];
  /** Where the fretting hand is up the neck (0 the nut … 1 the body), eased toward `fretWant`. */
  fret: number;
  fretWant: number;
  /** A chord's strum going down (1) or up (-1). */
  dir: number;
  voice: number;
}

export const newPlaying = (kind: InstrumentKind): Playing => ({ kind, hitL: -9, hitR: -9, hitFoot: -9, reachL: [-0.85, 0.12], reachR: [-0.95, -0.42], fret: 0.4, fretWant: 0.4, dir: 1, voice: 0 });

/** A note was played: the hands go to it. `pitch` the note (a drum's piece for the drums). */
export function strike(p: Playing, pitch: number, piece: DrumPiece | null, now: number) {
  if (p.kind === 'drums' && piece) {
    const h = HAND[piece];
    if (h === 'foot') p.hitFoot = now;
    else if (h === 'L') {
      p.hitL = now;
      p.reachL = REACH[piece];
    } else {
      p.hitR = now;
      p.reachR = REACH[piece];
    }
    return;
  }
  if (p.kind === 'keys') {
    if (pitch < 60) p.hitL = now;
    else p.hitR = now;
    return;
  }
  // Guitar and bass: the picking hand strokes; a stroke that comes close after the last goes back up.
  p.dir = now - p.hitR < 0.25 ? -p.dir : 1;
  if (now - p.hitR > 0.03) p.hitR = now;
  const low = p.kind === 'bass' ? 28 : 40;
  p.fretWant = Math.max(0.05, Math.min(0.85, 1 - ((pitch - low) % 12) / 14 - 0.1));
}

/** How a stroke `ago` seconds back moves the arm: down hard at once, back up over a tenth of a second. */
const stroke = (ago: number) => (ago < 0 ? 0 : ago < 0.035 ? ago / 0.035 : Math.max(0, 1 - (ago - 0.035) / 0.12));

/** The pose for someone playing (Person.setWorkout): read `p` and the clock every frame. */
export function playPose(p: Playing): (b: Bones, dt: number, t: number) => void {
  return (b, dt, t) => {
    const now = performance.now() / 1000;
    if (p.kind === 'drums') {
      // Sat on the throne, thighs forward, the right foot on the pedal.
      b.body.position.y = 0.1;
      const foot = stroke(now - p.hitFoot);
      b.legR.rotation.set(-1.3 + foot * 0.12, 0, 0.12);
      b.legL.rotation.set(-1.25, 0, -0.18);
      const l = stroke(now - p.hitL);
      const r = stroke(now - p.hitR);
      b.armL.rotation.set(p.reachL[0] + 0.25 - l * 0.32, 0, -p.reachL[1]);
      b.armR.rotation.set(p.reachR[0] + 0.25 - r * 0.32, 0, p.reachR[1]);
      b.head.rotation.x = 0.08 + Math.sin(t * 5) * 0.02;
      return;
    }
    if (p.kind === 'guitar' || p.kind === 'bass') {
      p.fret += (p.fretWant - p.fret) * Math.min(1, dt * 10);
      const s = stroke(now - p.hitR);
      // The picking hand across the body to the strings over the pickups.
      b.armR.rotation.set(-0.55 - s * 0.28 * p.dir, 0, 0.62 + s * 0.05);
      // The fretting hand up the neck: further out toward the headstock low on the neck.
      b.armL.rotation.set(-0.8 - p.fret * 0.15, 0.15, 0.32 + (1 - p.fret) * 0.38);
      b.head.rotation.x = 0.12 + Math.max(0, Math.sin(t * 6)) * 0.04 * Math.min(1, s * 3);
      b.body.rotation.x = 0.03;
      return;
    }
    if (p.kind === 'keys') {
      const l = stroke(now - p.hitL);
      const r = stroke(now - p.hitR);
      b.armL.rotation.set(-1.18 + l * 0.12, 0, -0.18);
      b.armR.rotation.set(-1.18 + r * 0.12, 0, 0.18);
      b.head.rotation.x = 0.22;
      return;
    }
    // The mic: right hand up at the mouth, nodding with the voice.
    b.armR.rotation.set(-2.05, 0, 0.32);
    b.armL.rotation.set(-0.15, 0, 0.12);
    b.head.rotation.x = -0.05 + p.voice * 0.25;
  };
}

/** A drumstick: hickory, its tip, about 40 cm. */
function stick(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.0075, 0.0065, 0.4, 6), toon('#d8b27a'), 0, 0.2, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.009, 6, 4), toon('#e9d2a6'), 0, 0.4, 0, false));
  return g;
}

interface Held {
  person: Person;
  kind: InstrumentKind;
  items: THREE.Object3D[];
}

/** Who plays what as everyone sees it: poses, and the instrument on them. */
export class Players {
  private held = new Map<string, Held>();
  private readonly fp: Record<'drums' | 'guitar' | 'bass', THREE.Group>;
  private fpSticks: THREE.Object3D[] = [];
  private fpPick: Partial<Record<'guitar' | 'bass', THREE.Object3D>> = {};

  constructor(handsScene: THREE.Scene) {
    // First person: your own sticks, or the guitar seen from above, its neck out to your left.
    const sticks = new THREE.Group();
    for (const s of [-1, 1]) {
      const st = stick();
      st.position.set(s * 0.17, -0.3, -0.25);
      st.rotation.set(-1.25, 0, s * 0.18);
      sticks.add(st);
      this.fpSticks.push(st);
    }
    const guitar = (bass: boolean, finish: StringFinish) => {
      const g = new THREE.Group();
      const m = stringed(bass, finish);
      m.scale.setScalar(0.4);
      m.position.set(0.13, -0.215, -0.4);
      m.rotation.set(-1.05, 0, 1.3);
      g.add(m);
      const pick = mesh(new THREE.SphereGeometry(0.026, 10, 8), toon('#f0c9a5'), 0.16, -0.14, -0.36, false);
      g.add(pick);
      this.fpPick[bass ? 'bass' : 'guitar'] = pick;
      return g;
    };
    this.fp = { drums: sticks, guitar: guitar(false, 'sunburst'), bass: guitar(true, 'black') };
    for (const g of Object.values(this.fp)) {
      g.visible = false;
      handsScene.add(g);
    }
  }

  /**
   * Each frame: who plays what (`holders` by id: their body, the kind, what they're doing, the finish
   * of their guitar). `you` your id; `firstPerson` whether you see your own instrument in your hands.
   */
  update(holders: Map<string, { person: Person; kind: InstrumentKind; playing: Playing; finish?: StringFinish }>, you: string, firstPerson: boolean) {
    for (const [id, h] of this.held) {
      const now = holders.get(id);
      if (now && now.person === h.person && now.kind === h.kind) continue;
      this.drop(h);
      this.held.delete(id);
    }
    for (const [id, w] of holders) {
      if (this.held.has(id)) continue;
      const items: THREE.Object3D[] = [];
      if (w.kind === 'drums') {
        for (const on of ['hand', 'offhand'] as const) {
          const s = stick();
          s.position.set(0, -0.4, 0.02);
          s.rotation.x = Math.PI / 2 - 0.25;
          w.person.wear(s, on);
          items.push(s);
        }
      } else if (w.kind === 'guitar' || w.kind === 'bass') {
        const g = stringed(w.kind === 'bass', w.finish ?? 'black');
        const strap = new THREE.Group();
        strap.add(g);
        g.scale.setScalar(w.kind === 'bass' ? 0.74 : 0.8);
        strap.position.set(0.04, 0.62, 0.3);
        strap.rotation.set(0, 0, -1.2);
        w.person.wear(strap, 'body');
        items.push(strap);
      }
      w.person.setWorkout(playPose(w.playing));
      this.held.set(id, { person: w.person, kind: w.kind, items });
    }
    const mine = holders.get(you);
    const kind = mine && firstPerson ? mine.kind : null;
    for (const [k, g] of Object.entries(this.fp)) g.visible = k === kind;
    if (mine && kind === 'drums') {
      const now = performance.now() / 1000;
      // Your sticks come down with your hands.
      this.fpSticks[0].rotation.x = -1.25 + stroke(now - mine.playing.hitL) * 0.45;
      this.fpSticks[1].rotation.x = -1.25 + stroke(now - mine.playing.hitR) * 0.45;
    }
    const pick = kind === 'guitar' || kind === 'bass' ? this.fpPick[kind] : undefined;
    if (mine && pick) pick.position.y = -0.14 - stroke(performance.now() / 1000 - mine.playing.hitR) * 0.05 * mine.playing.dir;
  }

  private drop(h: Held) {
    for (const o of h.items) o.removeFromParent();
    h.person.setWorkout(null);
  }

  clear() {
    for (const h of this.held.values()) this.drop(h);
    this.held.clear();
    for (const g of Object.values(this.fp)) g.visible = false;
  }
}

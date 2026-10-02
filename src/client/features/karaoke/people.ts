import * as THREE from 'three';
import type { Person } from '../../world/character';
import { micModel } from './stage';

// ---- Mics in hands (flrnoh fork, see FORK.md "Karaoke") -------------------------------------------------
// Whoever holds one of the karaoke bar's mics has it in their right hand: up at the mouth while
// they're on the stage, held low walking about. In first person you see it in your own hand. Someone
// singing without voice chat still mouths the words (their name tag's mouth moves with the lyrics).

const toBody = new THREE.Quaternion();
const tiltBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.55);

interface Held {
  person: Person;
  holder: THREE.Group;
}

export class MicHands {
  private held = new Map<string, Held>();
  /** The mic in your own hand, in first person. */
  private mine: THREE.Group;

  constructor(handsScene: THREE.Scene) {
    this.mine = micModel();
    this.mine.scale.setScalar(1.1);
    this.mine.position.set(0.15, -0.2, -0.36);
    this.mine.rotation.set(0.5, 0, -0.25);
    this.mine.visible = false;
    handsScene.add(this.mine);
  }

  /**
   * Each frame, after everyone's moved: `holders` who has a mic (by id, with their body), and for
   * each whether they're up on the stage. `firstPerson`: you see your own mic in your hand.
   */
  update(holders: Map<string, { person: Person; onStage: boolean; mouth: number | null }>, you: string, firstPerson: boolean) {
    for (const [id, h] of this.held) {
      const now = holders.get(id);
      if (now && now.person === h.person) continue;
      h.holder.removeFromParent();
      this.held.delete(id);
    }
    for (const [id, w] of holders) {
      let h = this.held.get(id);
      if (!h) {
        const holder = new THREE.Group();
        holder.add(micModel());
        w.person.wear(holder, 'hand');
        h = { person: w.person, holder };
        this.held.set(id, h);
      }
      const { armL } = w.person.limbs();
      // Up at the mouth on the stage; held low, ready, off it.
      armL.rotation.x = w.onStage ? -2.45 : -0.95;
      armL.rotation.z = w.onStage ? 0.5 : 0.15;
      // Upright in their fist whatever the arm does, its head tipped toward their face.
      h.holder.position.set(0, -0.36, 0.02);
      h.holder.quaternion.copy(toBody.copy(armL.quaternion).invert()).multiply(tiltBack);
      if (w.mouth !== null) w.person.setVoiceLevel(w.mouth);
    }
    this.mine.visible = firstPerson && holders.has(you);
  }

  clear() {
    for (const h of this.held.values()) h.holder.removeFromParent();
    this.held.clear();
    this.mine.visible = false;
  }
}

import * as THREE from 'three';
import { BIKES, ON_SHOULDER, type BikeKind } from '../../../shared/ride';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { bikeModel, disposeBike, ridingPose, type BikeModel } from '../../world/bike';
import type { Person } from '../../world/character';
import { mesh, toon } from '../../world/toon';
import type { Booze } from '../bar/booze';
import type { Rider } from './rider';

// Everyone on a bike (flrnoh fork, see FORK.md "Shops to walk into"): you on yours (the bike follows
// you, in first person too) and everyone else on theirs (PeerInfo.bike, kept up to date by bike.rode):
// up on the saddle, pedalling as fast as they go, the wheels turning; their bell. And the budgie from
// the pet shop on the shoulder of whoever holds it (it's held like a drink: PeerInfo.drink).

export interface RidersDeps {
  rider: Rider;
  personOf(id: string): Person | undefined;
  booze(): Booze;
}

interface OnBike {
  kind: BikeKind;
  model: BikeModel;
  person: Person;
  meters: number;
  last: THREE.Vector3;
}

/** A budgie, sitting: forward is +z. */
function budgie(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.06, 10, 8), toon('#80b918'), 0, 0.06, 0, false);
  body.scale.set(0.9, 1, 1.1);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), toon('#ffd60a'), 0, 0.13, 0.03, false));
  g.add(mesh(new THREE.ConeGeometry(0.015, 0.03, 6).rotateX(Math.PI / 2), toon('#f4a261'), 0, 0.12, 0.08, false));
  for (const x of [-0.025, 0.025]) g.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), toon('#1d1d1d'), x, 0.145, 0.065, false));
  const tail = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.015), toon('#2d6a4f'), 0, 0.02, -0.07, false);
  tail.rotation.x = -0.7;
  g.add(tail);
  return g;
}

export function ridersOnBikes(ctx: Ctx, deps: RidersDeps) {
  const on = new Map<string, OnBike>();
  const birds = new Map<string, { person: Person; bird: THREE.Group }>();
  /** Your own bike, in the scene where you are. */
  let mine: BikeModel | null = null;
  let mineKind: BikeKind | null = null;
  const v = new THREE.Vector3();

  function off(id: string) {
    const o = on.get(id);
    if (!o) return;
    disposeBike(o.model);
    o.person.setWorkout(null);
    on.delete(id);
  }

  ctx.messages.on('bike.rode', (msg) => {
    const p = store.peers.get(msg.id);
    if (!p) return;
    if (msg.bike) p.bike = msg.bike;
    else delete p.bike;
  });
  ctx.messages.on('bike.bell', (msg) => {
    const p = store.peers.get(msg.id);
    if (p) ctx.sound.ride('bell', { x: p.x, y: p.y + 0.9, z: p.z });
  });

  /** Who holds the budgie, and the person to put it on. */
  function shoulders(): Map<string, Person> {
    const out = new Map<string, Person>();
    const t = performance.now() / 1000;
    if (ON_SHOULDER.has(deps.booze().holding(t)?.id ?? '') && store.you) out.set(store.you, ctx.me);
    for (const p of store.peers.values()) {
      if (p.id === store.you || !p.drink || !ON_SHOULDER.has(p.drink)) continue;
      const person = deps.personOf(p.id);
      if (person) out.set(p.id, person);
    }
    return out;
  }

  let chirpIn = 4;
  ctx.ticks.add('others', ({ dt, t }) => {
    // Everyone else on a bike.
    const seen = new Set<string>();
    for (const p of store.peers.values()) {
      if (p.id === store.you || !p.bike || !store.onMyFloor(p)) continue;
      const person = deps.personOf(p.id);
      if (!person) continue;
      seen.add(p.id);
      let o = on.get(p.id);
      if (o && (o.kind !== p.bike || o.person !== person)) {
        off(p.id);
        o = undefined;
      }
      if (!o) {
        const model = bikeModel(p.bike);
        person.root.add(model.group);
        const made: OnBike = { kind: p.bike, model, person, meters: 0, last: person.root.position.clone() };
        person.setWorkout(ridingPose(p.bike, () => made.meters * BIKES[made.kind].cadence * Math.PI * 2));
        on.set(p.id, made);
        o = made;
      }
      // As far as they've come since last frame, the wheels and the pedals go round.
      const step = Math.hypot(person.root.position.x - o.last.x, person.root.position.z - o.last.z);
      if (step < 3) o.meters += step;
      o.last.copy(person.root.position);
      o.model.roll(o.meters, 0);
    }
    for (const id of [...on.keys()]) if (!seen.has(id)) off(id);
    // The budgies.
    const want = shoulders();
    for (const [id, b] of birds)
      if (want.get(id) !== b.person) {
        b.bird.removeFromParent();
        b.bird.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
        birds.delete(id);
      }
    for (const [id, person] of want) {
      let b = birds.get(id);
      if (!b) {
        const bird = budgie();
        // On the right shoulder (the character's right is -x), facing ahead.
        bird.position.set(-0.3, 0.6, -0.02);
        person.bones.body.add(bird);
        birds.set(id, (b = { person, bird }));
      }
      // Bobbing its head and turning to look about.
      b.bird.rotation.y = Math.sin(t * 0.7 + id.length) > 0.6 ? 0.9 : Math.sin(t * 0.5) < -0.7 ? -0.7 : 0;
      b.bird.position.y = 0.6 + Math.max(0, Math.sin(t * 9)) * (Math.sin(t * 1.3) > 0.8 ? 0.02 : 0);
    }
    if (want.has(store.you ?? '') && (chirpIn -= dt) < 0) {
      chirpIn = 5 + Math.random() * 8;
      const p = ctx.player.pos;
      ctx.sound.ride('chirp', { x: p.x, y: p.y + 1, z: p.z });
    }
    // Yours, under you.
    if (mine && mineKind) {
      const p = ctx.player;
      mine.group.position.copy(v.set(p.pos.x, p.pos.y, p.pos.z));
      mine.group.rotation.set(0, p.facing, -deps.rider.steer * Math.min(1, Math.abs(deps.rider.speed) / 6) * 0.4);
      mine.roll(deps.rider.meters, deps.rider.steer);
    }
  });

  // What you were just handed: the budgie hops up, the goldfish's bag sloshes.
  let held = '';
  ctx.ticks.add('hud', () => {
    const id = deps.booze().holding(performance.now() / 1000)?.id ?? '';
    if (id === held) return;
    held = id;
    const p = ctx.player.pos;
    if (id === 'wellensittich') {
      ctx.sound.ride('chirp', { x: p.x, y: p.y + 1, z: p.z });
      toast('🦜 Pepe hops onto your shoulder. He’ll stay a few minutes');
    } else if (id === 'goldfisch') ctx.sound.ride('slosh', { x: p.x, y: p.y + 1, z: p.z });
  });

  return {
    /** You got on bike `k`, or off (null). */
    mine(k: BikeKind | null) {
      if (mine) disposeBike(mine);
      mine = null;
      mineKind = k;
      if (k) {
        mine = bikeModel(k);
        ctx.scene.add(mine.group);
        ctx.me.setWorkout(ridingPose(k, () => deps.rider.meters * BIKES[k].cadence * Math.PI * 2));
      } else ctx.me.setWorkout(null);
    },
  };
}

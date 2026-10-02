import * as THREE from 'three';
import { AISLES, CASHIER, CHECKOUTS, HALL, INSIDE, RACKS } from '../../../shared/baumarkt';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import { store } from '../../state';
import { Person } from '../../world/character';
import { G } from '../../world/town/kit';
import type { Interactable } from '../../world/types';
import { ORANGE, box } from '../../world/baumarkt/kit';

// The people who work at the Baumarkt (flrnoh fork, see FORK.md "The Baumarkt"): Gabi at Kasse 1, who
// rings you up for nothing (E at her checkout), and Kalle in his orange apron, doing his rounds of the
// aisles. His rounds go by the office's clock, so everyone sees him in the same aisle; he has a word
// for whoever comes near.

declare module '../../world/types' {
  interface InteractKinds {
    checkout: true;
  }
}

/** Kalle's rounds: where he stops (and for how long, seconds), walking between at 1.1 m/s. */
const FRONT = HALL.maxZ - 5.6;
const BACK = HALL.minZ + 1.6;
const aisle = (k: number) => AISLES[k].x;
const ROUNDS: readonly { x: number; z: number; wait: number }[] = [
  { x: aisle(1), z: FRONT, wait: 3 },
  { x: aisle(1), z: (RACKS[0].z0 + RACKS[0].z1) / 2, wait: 6 },
  { x: aisle(1), z: BACK, wait: 1 },
  { x: aisle(2), z: BACK, wait: 1 },
  { x: aisle(2), z: RACKS[0].z0 + 3, wait: 5 },
  { x: aisle(2), z: FRONT, wait: 2 },
  { x: aisle(3), z: FRONT, wait: 1 },
  { x: aisle(3), z: RACKS[0].z1 - 2, wait: 7 },
  { x: aisle(3), z: BACK, wait: 1 },
  { x: aisle(4), z: BACK, wait: 2 },
  { x: INSIDE.maxX - 1.6, z: HALL.minZ + 7, wait: 8 },
  { x: aisle(4), z: FRONT + 1, wait: 4 },
];
const SPEED = 1.1;
const LEGS = ROUNDS.map((a, i) => {
  const b = ROUNDS[(i + 1) % ROUNDS.length];
  return { from: a, to: b, walk: Math.hypot(b.x - a.x, b.z - a.z) / SPEED };
});
const LOOP = LEGS.reduce((s, l) => s + l.from.wait + l.walk, 0);

/** Where Kalle is at `secs` on the office's clock, which way he faces, and whether he's walking. */
export function kalleAt(secs: number): { x: number; z: number; rotY: number; walking: boolean; stop: number } {
  let t = ((secs % LOOP) + LOOP) % LOOP;
  for (let i = 0; i < LEGS.length; i++) {
    const l = LEGS[i];
    const rotY = Math.atan2(l.to.x - l.from.x, l.to.z - l.from.z);
    if (t < l.from.wait) return { x: l.from.x, z: l.from.z, rotY: i % 2 ? Math.PI / 2 : -Math.PI / 2, walking: false, stop: i };
    t -= l.from.wait;
    if (t < l.walk) {
      const k = t / l.walk;
      return { x: l.from.x + (l.to.x - l.from.x) * k, z: l.from.z + (l.to.z - l.from.z) * k, rotY, walking: true, stop: -1 };
    }
    t -= l.walk;
  }
  return { x: ROUNDS[0].x, z: ROUNDS[0].z, rotY: 0, walking: false, stop: 0 };
}

const KALLE_SAYS = ['Kann ich helfen?', 'Schrauben? Gang 5, ganz hinten.', 'Der Stapler ist nur für Profis… und für dich.', 'Heute alles aufs Haus!', 'Moin! Suchen Sie was Bestimmtes?', 'Die Kettensäge? Bitte nur ausprobieren.', 'Achtung, frisch gewischt!'];
const GABI_SAYS = ['Das macht null Euro, heute alles aufs Haus!', 'Haben Sie eine Kundenkarte? Egal!', 'Bon dazu? Ach, nehmen Sie ihn mit.', 'Schönen Tag noch, und viel Spaß beim Heimwerken!'];

export function baumarktStaff(ctx: Ctx, deps: { onStreet(): boolean; group(): THREE.Group | null }) {
  let gabi: Person | null = null;
  let kalle: Person | null = null;
  let said = 0;
  let gabiLine = 0;
  const till: Interactable = { kind: 'checkout', x: CHECKOUTS[0].maxX + 0.2, z: (CHECKOUTS[0].minZ + CHECKOUTS[0].maxZ) / 2, y: 0, radius: 2.2 };
  ctx.usables.add({ usable: () => (deps.onStreet() ? [Object.assign(till, { y: ctx.player.street })] : []) });

  function apron(p: Person) {
    const g = new THREE.Group();
    g.add(box(0.46, 0.58, 0.03, new THREE.MeshToonMaterial({ color: ORANGE }), 0, 0.36, 0.25, false));
    g.add(box(0.36, 0.04, 0.03, new THREE.MeshToonMaterial({ color: '#ffffff' }), 0, 0.84, 0.25, false));
    p.wear(g, 'body');
  }

  function make(): boolean {
    const group = deps.group();
    if (!group) return false;
    if (gabi && kalle) return true;
    gabi = new Person('Gabi', '#1d4e89', { skin: 1, hair: 4, style: 2 });
    kalle = new Person('Kalle', '#3d405b', { skin: 3, hair: 1, style: 0 });
    for (const p of [gabi, kalle]) {
      apron(p);
      p.showLabel(false);
      noOutline(p.root);
      group.add(p.root);
    }
    gabi.root.position.set(CASHIER.x, G, CASHIER.z);
    gabi.root.rotation.y = CASHIER.rotY;
    return true;
  }

  ctx.interactions.define('checkout', {
    reach: 2.4,
    hint: () => ({ k: 'checkout', parts: [hintTitle('🧾 Kasse 1'), aside('Gabi’s on the till'), key('E', 'Pay')] }),
    use: onE(() => {
      const at = { x: till.x, y: ctx.player.street + 1, z: till.z };
      for (let i = 0; i < 3; i++) window.setTimeout(() => ctx.sound.baumarkt('scan', at), i * 260);
      gabi?.reach();
      gabi?.say(GABI_SAYS[gabiLine++ % GABI_SAYS.length], 3.5);
    }),
  });

  ctx.ticks.add('others', ({ dt, t }) => {
    if (!deps.onStreet()) return;
    const me = ctx.player.pos;
    const far = Math.hypot(me.x - (HALL.minX + HALL.maxX) / 2, me.z - (HALL.minZ + HALL.maxZ) / 2);
    if (far > 140 && !gabi) return;
    if (!make() || !gabi || !kalle) return;
    gabi.root.visible = kalle.root.visible = far < 140;
    if (far >= 140) return;
    // Gabi turns a little toward whoever's at her till.
    const look = Math.hypot(me.x - CASHIER.x, me.z - CASHIER.z) < 6 ? Math.atan2(me.x - CASHIER.x, me.z - CASHIER.z) : CASHIER.rotY;
    const turn = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(look - CASHIER.rotY), Math.cos(look - CASHIER.rotY))));
    gabi.root.rotation.y += Math.atan2(Math.sin(CASHIER.rotY + turn - gabi.root.rotation.y), Math.cos(CASHIER.rotY + turn - gabi.root.rotation.y)) * Math.min(1, dt * 3);
    gabi.update(dt, t, false, false);
    // Kalle on his rounds, by the office's clock.
    const k = kalleAt(store.officeNow() / 1000);
    kalle.root.position.set(k.x, G, k.z);
    const want = k.walking ? k.rotY : Math.atan2(me.x - k.x, me.z - k.z);
    const near = Math.hypot(me.x - k.x, me.z - k.z);
    const face = k.walking || near < 5 ? want : k.rotY;
    kalle.root.rotation.y += Math.atan2(Math.sin(face - kalle.root.rotation.y), Math.cos(face - kalle.root.rotation.y)) * Math.min(1, dt * 5);
    kalle.update(dt, t, k.walking, false);
    if (near < 3.2 && !k.walking && t - said > 12) {
      said = t;
      kalle.say(KALLE_SAYS[Math.floor(t) % KALLE_SAYS.length], 3.2);
    }
  });

  return { gabi: () => gabi, kalle: () => kalle, till };
}

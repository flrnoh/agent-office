import * as THREE from 'three';
import { MARKET_GOOD_BY_ID, TROLLEY_MAX } from '../../../shared/trolley';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import type { Person } from '../../world/character';
import { mesh, toon } from '../../world/toon';

// flrnoh fork (see FORK.md "Shops to walk into", food round 2): the supermarket's shopping trolley
// (shared/trolley.ts). Yours and everyone else's on your floor, pushed in front of whoever has it,
// with what's in it in the basket; the trolley bay's empty ones are the same model (decor-food.ts).
// It's only drawn: it goes where its pusher goes, through the door and out onto the sidewalk.

/** How far in front of its pusher the trolley's handle is. */
const AHEAD = 0.42;

/** A shopping trolley, its handle at z = 0 and its basket out along +z, standing on y = 0. */
export function trolleyModel(): THREE.Group {
  const g = new THREE.Group();
  const steel = toon('#c9ced6');
  const dark = toon('#343a40');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = mesh(geo, mat, x, y, z, false);
    g.add(m);
    return m;
  };
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number, mat = steel) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // The basket: a frame of bars, wire sides, a floor.
  const W = 0.5;
  const z0 = 0.12;
  const z1 = 0.95;
  const y0 = 0.42;
  const y1 = 0.9;
  for (const x of [-W / 2, W / 2]) {
    bar(0.02, 0.02, z1 - z0, x, y1, (z0 + z1) / 2);
    bar(0.02, 0.02, z1 - z0, x, y0, (z0 + z1) / 2);
    for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / 6) bar(0.012, y1 - y0, 0.012, x, (y0 + y1) / 2, z);
  }
  for (const z of [z0, z1]) {
    bar(W, 0.02, 0.02, 0, y1, z);
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += W / 5) bar(0.012, y1 - y0, 0.012, x, (y0 + y1) / 2, z);
  }
  bar(W, 0.015, z1 - z0, 0, y0, (z0 + z1) / 2, toon('#adb5bd'));
  // The handle, red plastic, and the frame down to the wheels.
  add(new THREE.CylinderGeometry(0.02, 0.02, W + 0.06, 10).rotateZ(Math.PI / 2), toon('#e63946'), 0, 1.0, 0);
  for (const x of [-W / 2, W / 2]) {
    bar(0.02, 0.02, 0.16, x, 0.96, 0.06);
    bar(0.025, 0.42, 0.025, x, 0.21, z0 + 0.02);
    bar(0.025, 0.025, z1 - z0 - 0.05, x, 0.12, (z0 + z1) / 2 - 0.02);
    bar(0.025, 0.3, 0.025, x, 0.27, z1 - 0.06);
  }
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03])
    for (const z of [z0 + 0.02, z1 - 0.06]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12).rotateZ(Math.PI / 2), dark, x, 0.05, z);
  return g;
}

/** What's in a trolley, in its basket: a little box, can, bottle, bag or round thing each. */
function fill(basket: THREE.Group, items: readonly string[]) {
  for (const c of [...basket.children]) {
    basket.remove(c);
    (c as THREE.Mesh).geometry?.dispose();
  }
  items.forEach((id, i) => {
    const good = MARKET_GOOD_BY_ID.get(id);
    if (!good) return;
    const col = i % 3;
    const row = Math.floor(i / 3) % 4;
    const layer = Math.floor(i / 12);
    const x = -0.15 + col * 0.15;
    const z = 0.25 + row * 0.18;
    const y = 0.43 + layer * 0.15;
    const mat = toon(good.color);
    const geo =
      good.shape === 'bottle' ? new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10)
      : good.shape === 'can' ? new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12)
      : good.shape === 'round' ? new THREE.SphereGeometry(0.06, 10, 8)
      : good.shape === 'bag' ? new THREE.BoxGeometry(0.12, 0.16, 0.08)
      : good.shape === 'tray' ? new THREE.BoxGeometry(0.12, 0.05, 0.1)
      : new THREE.BoxGeometry(0.1, 0.18, 0.07);
    geo.computeBoundingBox();
    const h = geo.boundingBox!.max.y - geo.boundingBox!.min.y;
    basket.add(mesh(geo, mat, x, y + h / 2, z, false));
  });
}

interface Drawn {
  root: THREE.Group;
  basket: THREE.Group;
  sig: string;
}

export interface TrolleyDeps {
  personOf(id: string): Person | undefined;
  /** Down on the street of the office (not up on a floor, nor in a car, the elevator or a place). */
  onStreet(): boolean;
}

export type Trolleys = ReturnType<typeof trolleyCarts>;

/** Your trolley (taking, filling, ringing up, letting go of it) and everyone's on your floor, drawn. */
export function trolleyCarts(ctx: Ctx, deps: TrolleyDeps) {
  let mine: string[] | null = null;
  const drawn = new Map<string, Drawn>();
  const send = () => ctx.net.send({ t: 'trolley.set', items: mine ? [...mine] : null });

  function draw(id: string, items: readonly string[]): Drawn {
    let d = drawn.get(id);
    if (!d) {
      const root = new THREE.Group();
      root.add(trolleyModel());
      const basket = new THREE.Group();
      root.add(basket);
      ctx.scene.add(root);
      drawn.set(id, (d = { root, basket, sig: '' }));
    }
    const sig = items.join(',');
    if (sig !== d.sig) {
      fill(d.basket, items);
      d.sig = sig;
    }
    return d;
  }
  function drop(id: string) {
    const d = drawn.get(id);
    if (!d) return;
    d.root.removeFromParent();
    d.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    drawn.delete(id);
  }
  /** Puts `d` in front of someone at (x, y, z) facing `rotY`. */
  const place = (d: Drawn, x: number, y: number, z: number, rotY: number) => {
    d.root.position.set(x + Math.sin(rotY) * AHEAD, y, z + Math.cos(rotY) * AHEAD);
    d.root.rotation.y = rotY;
  };

  // Back after a reconnect: the office forgot it, so tell it again.
  ctx.messages.on('welcome', () => mine && send());

  const v = new THREE.Vector3();
  ctx.ticks.add('others', ({ dt }) => {
    const p = ctx.player;
    // Out of reach of the street (up a floor, in a car, the elevator, sitting down): you let go of it.
    if (mine && (!deps.onStreet() || p.rig || p.seat || p.pos.y > p.street + 2.5)) letGo(true);
    const want = new Set<string>();
    if (mine) {
      want.add(store.you);
      place(draw(store.you, mine), p.pos.x, p.street, p.pos.z, p.facing);
    }
    for (const [id, items] of store.trolleys) {
      if (id === store.you) continue;
      const person = deps.personOf(id);
      const peer = store.peers.get(id);
      if (!person || !peer || !store.onMyFloor(peer)) continue;
      want.add(id);
      person.root.getWorldPosition(v);
      place(draw(id, items), v.x, v.y, v.z, person.root.rotation.y);
    }
    for (const id of [...drawn.keys()]) if (!want.has(id)) drop(id);
    void dt;
  });

  function letGo(quiet = false) {
    if (!mine) return;
    mine = null;
    send();
    if (!quiet) ctx.sound.shop('trolley', { x: ctx.player.pos.x, y: ctx.player.street + 0.5, z: ctx.player.pos.z });
  }

  return {
    /** Whether you're pushing one. */
    have: () => mine !== null,
    items: (): readonly string[] => mine ?? [],
    /** Takes one from the trolley bay. */
    take() {
      if (mine) return;
      mine = [];
      send();
      ctx.sound.shop('trolley', { x: ctx.player.pos.x, y: ctx.player.street + 0.5, z: ctx.player.pos.z });
    },
    /** Puts `id` in, if there's room; whether it went in. */
    add(id: string): boolean {
      if (!mine || mine.length >= TROLLEY_MAX || !MARKET_GOOD_BY_ID.has(id)) return false;
      mine = [...mine, id];
      send();
      return true;
    },
    /** Takes everything out at the checkout: what was in it. */
    empty(): string[] {
      const was = mine ?? [];
      if (mine) {
        mine = [];
        send();
      }
      return was;
    },
    letGo,
  };
}

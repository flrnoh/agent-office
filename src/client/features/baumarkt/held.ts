import * as THREE from 'three';
import { ENTRANCE, MIXER, TOOL_WALL, inHall, onBaumarkt } from '../../../shared/baumarkt';
import { MIX_MS, PAINTS, TOOL_BY_ID, paintOf, type HeldId, type ToolId } from '../../../shared/baumarkt-play';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { modalOpen, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import { paintCanModel, toolModel } from '../../world/baumarkt/models';
import type { Interactable } from '../../world/types';
import { openPaints, openToolWall } from './ui';

// What's in your hand at the Baumarkt (flrnoh fork, see FORK.md "The Baumarkt"): a tool off the tool
// wall (E there), which a click sets going: the drill whirring and its chuck spinning, the
// screwdriver ratcheting, the hammer knocking, the chainsaw rasping; or a can of paint from the shaker (E at
// the paint counter: pick a colour, it shakes the can loudly, and it's yours). Everyone on the floor
// sees what everyone holds and hears them use it. Q puts it back; tools stay in the hall (the gate by
// the door beeps), a can stays on the block.

declare module '../../world/types' {
  interface InteractKinds {
    toolwall: true;
    paintmixer: true;
  }
}

/** One person's thing in hand: its model, and how far into a use it is. */
interface Holding {
  item: HeldId;
  holder: THREE.Group;
  spin: THREE.Object3D | null;
  /** Seconds left of the last use (0: still). */
  using: number;
}

const USE_SECONDS: Record<ToolId, number> = { drill: 1.1, screwdriver: 0.7, hammer: 0.75, chainsaw: 1.6 };

function modelOf(item: HeldId): { group: THREE.Group; spin: THREE.Object3D | null } {
  const paint = paintOf(item);
  if (paint >= 0) return { group: paintCanModel(PAINTS[paint].color), spin: null };
  return toolModel(item as ToolId);
}

export interface HeldDeps {
  onStreet(): boolean;
  /** Everyone else's bodies, by id. */
  remotes(): Map<string, { person: Person }>;
  /** The shaker's can (world/baumarkt), shaken while it mixes. */
  shaker(): { shaker: THREE.Group; shakerCan: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> } | null;
}

export function heldThings(ctx: Ctx, deps: HeldDeps) {
  let mine: HeldId | null = null;
  /** In front of your eyes (first person), and in your character's hand (third). */
  let view: Holding | null = null;
  const bodies = new Map<string, Holding & { person: Person }>();
  let mixingUntil = 0;
  let mixingPaint = -1;
  const timers: number[] = [];

  const wall: Interactable = { kind: 'toolwall', x: TOOL_WALL.x - 1, z: (TOOL_WALL.z0 + TOOL_WALL.z1) / 2, y: 0, radius: 3.6 };
  const mixer: Interactable = { kind: 'paintmixer', x: MIXER.x - 1.2, z: MIXER.z, y: 0, radius: 2.4 };
  ctx.usables.add({
    usable: () => {
      if (!deps.onStreet()) return [];
      wall.y = mixer.y = ctx.player.street;
      return [wall, mixer];
    },
  });

  const at = (x: number, z: number, y = 1.2) => ({ x, y: ctx.player.street + y, z });

  /** Takes `item` in hand (null: puts it back), and tells the office. */
  function hold(item: HeldId | null, say = true) {
    if (item === mine) return;
    mine = item;
    if (view) {
      view.holder.removeFromParent();
      view = null;
    }
    if (item) {
      const m = modelOf(item);
      const holder = new THREE.Group();
      holder.add(m.group);
      view = { item, holder, spin: m.spin, using: 0 };
      ctx.hands.scene.add(holder);
    }
    ctx.net.send({ t: 'bm.hold', item });
    if (say && item && paintOf(item) < 0) {
      const t = TOOL_BY_ID.get(item as ToolId)!;
      toast(`${t.emoji} ${t.name} in hand: click to ${t.verb.toLowerCase()}, Q puts it back`);
    }
    ctx.hint.invalidate();
  }

  /** A click with a tool in hand: off it goes, for everyone. */
  function use() {
    if (!mine || !view) return;
    const paint = paintOf(mine);
    if (paint >= 0) return toast(`🎨 A can of ${PAINTS[paint].name}. Q puts it down`);
    if (view.using > 0.15) return;
    const tool = mine as ToolId;
    view.using = USE_SECONDS[tool];
    ctx.me.reach();
    if (tool !== 'hammer') ctx.sound.baumarkt(tool, at(ctx.player.pos.x, ctx.player.pos.z));
    if (tool === 'chainsaw') ctx.shake(0.2);
    ctx.net.send({ t: 'bm.use' });
  }

  // The mouse button uses what you hold, before anything else it would do.
  const click = ctx.player.onClick;
  ctx.player.onClick = (ndc) => {
    if (mine && !modalOpen() && !ctx.activities.any('takesCamera')) return use();
    click?.(ndc);
  };
  ctx.keys.add('activity', (e) => {
    if (e.code !== 'KeyQ' || !mine || e.repeat) return false;
    toast(paintOf(mine) >= 0 ? '🎨 You set the can down' : '🔧 Back on the wall it goes');
    hold(null);
    return true;
  });

  ctx.interactions.define('toolwall', {
    reach: 3.6,
    hint: () => ({ k: `tools|${mine ?? ''}`, parts: [hintTitle('🔨 Werkzeugwand'), aside('try before you buy'), key('E', mine && paintOf(mine) < 0 ? 'Swap tools' : 'Take a tool')] }),
    use: onE(() => {
      ctx.sound.baumarkt('rattle', at(TOOL_WALL.x, wall.z, 1.5), 0.5);
      openToolWall({ holding: mine && paintOf(mine) < 0 ? (mine as ToolId) : null, pick: (id) => hold(id), putBack: () => hold(null) });
    }),
  });
  ctx.interactions.define('paintmixer', {
    reach: 2.6,
    hint: () => {
      const busy = performance.now() < mixingUntil;
      return { k: `mixer|${busy}`, parts: [hintTitle('🎨 Farbmischmaschine'), aside(busy ? 'shaking a can…' : 'any colour you like, shaken while you wait'), ...(busy ? [] : [key('E', 'Mix a colour')])] };
    },
    use: onE(() => {
      if (performance.now() < mixingUntil) return toast('🎨 Wait a moment, it’s still shaking a can', 'warn');
      openPaints({ mix: (i) => ctx.net.send({ t: 'bm.mix', paint: i }) });
    }),
  });

  /** Someone put a can in the shaker: it shakes for everyone, and the one who mixed it gets the can. */
  ctx.messages.on('bm.mixing', (msg) => {
    mixingUntil = performance.now() + MIX_MS;
    mixingPaint = msg.paint;
    ctx.sound.baumarkt('shake', at(MIXER.x, MIXER.z, 1.4));
    ctx.hint.invalidate();
    if (msg.id !== store.you) return;
    const p = PAINTS[msg.paint];
    toast(`🎨 ${p.name} goes in the shaker… rattle rattle`);
    timers.push(
      window.setTimeout(() => {
        if (!deps.onStreet() || !onBaumarkt(ctx.player.pos.x, ctx.player.pos.z, 2)) return;
        hold(`paint${msg.paint}`, false);
        ctx.me.reach();
        toast(`🎨 A can of ${p.name}, freshly shaken. Q puts it down`);
      }, MIX_MS),
    );
  });
  ctx.messages.on('bm.used', (msg) => {
    const b = bodies.get(msg.id);
    const tool = msg.item as ToolId;
    if (!TOOL_BY_ID.has(tool)) return;
    if (b) b.using = USE_SECONDS[tool];
    b?.person.reach();
    const p = store.peers.get(msg.id);
    if (p && tool !== 'hammer') ctx.sound.baumarkt(tool, at(p.x, p.z));
  });
  ctx.messages.onAny((msg) => {
    if (msg.t === 'welcome' || msg.t === 'floor.enter') {
      // The office put back whatever you held on the floor you left.
      mine = null;
      view?.holder.removeFromParent();
      view = null;
    }
  });

  /**
   * `dt` on into a use of what `h` is: a drill's chuck turning, the chainsaw's chain, the hammer's knock
   * at the bottom of each of its three swings (at x, z). Hands back how far the hammer's swung (0-1) and
   * how hard the thing buzzes in the hand.
   */
  function animate(h: Holding, dt: number, x: number, z: number): { swing: number; buzz: number } {
    const tool = paintOf(h.item) >= 0 ? null : (h.item as ToolId);
    if (h.using <= 0 || !tool) return { swing: 0, buzz: 0 };
    const total = USE_SECONDS[tool];
    const was = total - h.using;
    h.using = Math.max(0, h.using - dt);
    const t = total - h.using;
    if (tool === 'hammer') {
      const phase = (t / total) * 3;
      const before = (was / total) * 3;
      if ([0.5, 1.5, 2.5].some((k) => before < k && phase >= k)) ctx.sound.baumarkt('hammer', at(x, z));
      return { swing: Math.max(0, Math.sin(phase * Math.PI)), buzz: 0 };
    }
    if (h.spin) {
      if (tool === 'chainsaw') h.spin.position.z = -0.3 + ((t * 9) % 0.055);
      else h.spin.rotation.z += dt * 60;
    }
    return { swing: 0, buzz: tool === 'chainsaw' ? 0.012 : 0.005 };
  }

  const swingQ = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  ctx.ticks.add('others', ({ dt }) => {
    const here = deps.onStreet();
    // You: put back what can't leave, and the thing in front of your eyes.
    if (mine) {
      const p = ctx.player.pos;
      const tool = paintOf(mine) < 0;
      if (!here || (tool && !inHall(p.x, p.z, 0.4))) {
        if (here && tool) {
          ctx.sound.baumarkt('gate', at(ENTRANCE.x, ENTRANCE.z - 1.3, 1));
          toast(`🚨 Piep piep piep! The ${TOOL_BY_ID.get(mine as ToolId)?.name} stays in the store: back on the wall it goes`, 'warn');
        }
        hold(null);
      } else if (!onBaumarkt(p.x, p.z, 1)) {
        toast('🎨 You leave the can by the car park for later');
        hold(null);
      }
    }
    let mineSwing = 0;
    if (view) {
      const first = ctx.player.view === 'first';
      view.holder.visible = first;
      const { swing, buzz } = animate(view, dt, ctx.player.pos.x, ctx.player.pos.z);
      mineSwing = swing;
      // Low in your right hand, its business end ahead; the hammer swings down in front of you.
      const paint = paintOf(view.item) >= 0;
      view.holder.position.set(0.27 + (Math.random() - 0.5) * buzz, (paint ? -0.27 : -0.21) + (Math.random() - 0.5) * buzz, -0.56);
      view.holder.rotation.set(0.05 - swing * 1.1, -0.12, 0);
      view.holder.scale.setScalar(0.6);
    }
    // Everyone's hand, you too in third person.
    const want = new Map<string, { person: Person; item: HeldId }>();
    if (here) {
      if (mine && ctx.player.view !== 'first') want.set('', { person: ctx.me, item: mine });
      for (const [id, r] of deps.remotes()) {
        const item = store.baumarkt.held[id];
        if (item) want.set(id, { person: r.person, item });
      }
    }
    for (const [id, b] of bodies) {
      const w = want.get(id);
      if (w && w.person === b.person && w.item === b.item) continue;
      b.holder.removeFromParent();
      bodies.delete(id);
    }
    for (const [id, w] of want) {
      let b = bodies.get(id);
      if (!b) {
        const m = modelOf(w.item);
        const holder = new THREE.Group();
        // In the right fist (the arm on -x), turned to face ahead whatever the arm's doing.
        m.group.rotation.y = Math.PI;
        m.group.position.set(0, -0.02, 0.06);
        holder.add(m.group);
        holder.scale.setScalar(1.35);
        w.person.wear(holder, 'hand');
        b = { item: w.item, holder, spin: m.spin, using: 0, person: w.person };
        bodies.set(id, b);
      }
      const p = id === '' ? ctx.player.pos : store.peers.get(id);
      const { swing, buzz } = id === '' ? { swing: mineSwing, buzz: 0 } : animate(b, dt, p?.x ?? 0, p?.z ?? 0);
      const arm = b.holder.parent;
      if (arm) b.holder.quaternion.copy(arm.quaternion).invert();
      b.holder.quaternion.multiply(swingQ.setFromAxisAngle(X, swing * 1.1));
      b.holder.position.set((Math.random() - 0.5) * buzz, -0.38, 0);
    }
    // The shaker, while it shakes.
    const s = deps.shaker();
    if (s) {
      const left = mixingUntil - performance.now();
      s.shakerCan.visible = left > -2500 && mixingPaint >= 0;
      if (mixingPaint >= 0) s.shakerCan.material.color.set(PAINTS[mixingPaint].color);
      const k = left > 0 ? 1 : 0;
      s.shaker.position.x = MIXER.x - 0.12 + Math.sin(performance.now() * 0.09) * 0.025 * k;
      s.shaker.rotation.z = Math.sin(performance.now() * 0.07) * 0.08 * k;
    }
  });

  return {
    interactables: { wall, mixer },
    held: () => mine,
    hold,
    use,
    /** The shaker's busy until (performance.now()). */
    mixingUntil: () => mixingUntil,
  };
}

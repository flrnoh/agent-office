/**
 * flrnoh fork (see FORK.md "Hörkreise"): voice carries as far as each speaker's own circle. Whoever
 * stands in your circle hears you; outside it, nobody does, because your mic isn't even sent to them
 * (Voice.setSending), so two people with small circles can talk unter vier Augen while the rest of
 * the floor stays in the same voice chat. , makes yours smaller, . bigger, the top bar's ◯ button
 * goes through the sizes (hud.ts). Your circle shows on the floor while you talk or change it;
 * anyone else's while they talk, bright when you're in it (you hear them), faint when you're not.
 * How loud someone in range is: shared/voicerange.ts, used by features/peers.
 */
import * as THREE from 'three';
import { sendsVoice, stepVoiceRange, voiceRangeOf, voiceRangeWord } from '../../../shared/voicerange';
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { Ring } from './rings';
import { hearers, myVoiceRange, onMyVoiceRange, setMyVoiceRange } from './state';
import { voiceWalled } from './walls';

export interface VoiceRangeDeps {
  /** Where everyone else stands as drawn (features/peers), for their circles. */
  bodies: () => ReadonlyMap<string, { person: { root: THREE.Object3D } }>;
}

/** How often who gets your voice is worked out (ms). An interval, so it keeps up while the tab's in the background. */
const GATE_MS = 200;
/** How long your circle stays up after you changed it (ms). */
const SHOW_AFTER_CHANGE = 2500;
/** A voice level that counts as talking. */
const TALKING = 0.03;

export function installVoiceRange(ctx: Ctx, deps: VoiceRangeDeps) {
  const { voice, scene, player } = ctx;
  const myColor = () => store.peers.get(store.you)?.color ?? '#7dd3fc';
  const rangeOf = (id: string) => voiceRangeOf(store.peers.get(id)?.voiceRange);

  // ---- Your circle, to the office -----------------------------------------------------------------
  let sendTimer = 0;
  let changedAt = 0;
  let toastEl: HTMLElement | null = null;
  const tell = () => ctx.net.send({ t: 'voice.range', range: myVoiceRange() });
  onMyVoiceRange((r) => {
    changedAt = performance.now();
    // Once it's settled: holding , or . goes through a few steps.
    clearTimeout(sendTimer);
    sendTimer = window.setTimeout(tell, 150);
    toastEl?.remove();
    toastEl = toast(`◯ Hörkreis: ${voiceRangeWord(r)}`);
    gate();
    ctx.hud.refresh();
  });
  // A new connection starts at the default: say yours again.
  ctx.messages.on('welcome', () => tell());
  ctx.messages.on('voice.ranged', (msg) => {
    const p = store.peers.get(msg.id);
    if (p) p.voiceRange = msg.range;
  });

  ctx.keys.bind({
    code: ['Comma', 'Period'],
    when: () => voice.inVoice,
    preventDefault: true,
    run: (e) => setMyVoiceRange(stepVoiceRange(myVoiceRange(), e.code === 'Period' ? 1 : -1)),
  });

  // ---- Who gets your voice ------------------------------------------------------------------------
  let hearKey = '';
  function gate() {
    const names: string[] = [];
    for (const id of voice.conns.keys()) {
      const p = store.peers.get(id);
      const here = !!p && store.onMyFloor(p) && !p.lite;
      const d = here ? Math.hypot(p!.x - player.pos.x, p!.z - player.pos.z) : Infinity;
      // A wall in between (a rehearsal room's, walls.ts): not even the PA gets through.
      const walled = here && voiceWalled({ floor: store.floor, x: player.pos.x, z: player.pos.z }, p!);
      const on = here && !walled && (voice.selfOnPa || sendsVoice(d, myVoiceRange(), voice.sendingTo(id)));
      voice.setSending(id, on);
      if (on && p!.voice && voice.inVoice) names.push(p!.name);
    }
    hearers.names = names.sort((a, b) => a.localeCompare(b));
    const key = hearers.names.join('|');
    if (key !== hearKey) {
      hearKey = key;
      ctx.hud.refresh();
    }
  }
  setInterval(gate, GATE_MS);
  ctx.messages.on('peer.join', gate);
  ctx.messages.on('peer.leave', gate);

  // ---- The circles on the floor -------------------------------------------------------------------
  const mine = new Ring(myColor());
  scene.add(mine.root);
  const theirs = new Map<string, Ring>();

  ctx.ticks.add('world', ({ dt, now }) => {
    // Yours: while you talk, and a moment after you changed it.
    const talking = voice.inVoice && !voice.muted && voice.localLevel > TALKING;
    mine.setColor(myColor());
    mine.setRadius(myVoiceRange());
    mine.place(player.pos.x, player.pos.y, player.pos.z);
    mine.want(voice.inVoice && (talking || now - changedAt < SHOW_AFTER_CHANGE));
    mine.update(dt);

    // Theirs: while they talk; bright if you're in it.
    const bodies = deps.bodies();
    for (const [id, body] of bodies) {
      const p = store.peers.get(id);
      if (!p) continue;
      let ring = theirs.get(id);
      if (!ring) {
        ring = new Ring(p.color);
        scene.add(ring.root);
        theirs.set(id, ring);
      }
      const at = body.person.root.position;
      const r = rangeOf(id);
      const inside = Math.hypot(at.x - player.pos.x, at.z - player.pos.z) <= r;
      ring.setColor(p.color);
      ring.setRadius(r);
      ring.place(at.x, at.y, at.z);
      ring.want(!!p.voice && !p.muted && voice.levelOf(id) > TALKING, inside);
      ring.update(dt);
    }
    for (const [id, ring] of theirs) {
      if (bodies.has(id)) continue;
      ring.dispose();
      theirs.delete(id);
    }
  });

  // For the tests (and a look in the console): who gets your voice, and the circles.
  return { voice, hearers, mine, theirs, gate };
}

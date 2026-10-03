/**
 * flrnoh fork (see FORK.md "Dancing on the roof"): Florian's wish, "auf der Tanzfläche eigene fancy
 * coole Dancemoves, dauerhaft, im Takt". Up on the roof B starts dancing, for as long as you like:
 * thirteen moves (shared/dance.ts) and Freestyle, which follows the music by itself, all of them on
 * the beat of whatever's on, the house DJ or a set someone put on at the booth.
 *
 * - You: B starts (with the move you danced last), 1–9 and 0 pick one, Q and E go through them all,
 *   F is Freestyle, B again stops; so does walking off, sitting down, or going downstairs. While you
 *   dance it's an activity (ctx.activities), with its own hint bar, and the picker over it (ui.ts)
 *   takes clicks. On the dance floor, not dancing yet, a small pill says B is for dancing.
 * - Everyone else: the office keeps each person's move (`dance` on the peer, server/fork/dance.ts) and
 *   says when it changes (`dance.moved`); whoever comes up later has it in the peer list. Each page
 *   poses them itself (setWorkout, as the gym and the pool do), from the same beat count off the
 *   office's clock, so they're in step with the music and with each other on every screen. Freestyle's
 *   choices go by their id (danceSeed), so it picks the same moves everywhere too.
 * - Only while they stand on the roof's floor: walking, sitting, a car, the pool or the air (the
 *   coaster, the bungee) let go of the pose, and only of ours (another feature's pose is left alone).
 * - In first person the dance comes to you: the view rides your hips and head, and your hands do the
 *   move's arms in front of your eyes (firstperson.ts).
 * - On the dance floor a soft spot of light pulses under each dancer in the track's colour (glow.ts).
 */
import { DANCE_BY_ID, DANCE_MOVES, DANCE_SEND_MS, danceSeed, isDance, type DanceId } from '../../../shared/dance';
import { inPoolAt } from '../../../shared/roofpool';
import type { Ctx } from '../../core/context';
import { key } from '../../core/hint';
import type { DjFrame } from '../../dnb';
import { groundAt } from '../../player';
import { store } from '../../state';
import { $, h, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Bones } from '../../world/character/person-bones';
import { Glows, onDanceFloor } from './glow';
import { danceInFirstPerson } from './firstperson';
import { Dancer } from './poses';
import { DANCE_KEYS, DancePanel } from './ui';

export interface DanceDeps {
  /** What the roof moves to now (features/rooftop: the set that's on, else the house DJ). */
  frame(): DjFrame;
  /** The people up here with you, by id (see features/peers). */
  remotes(): ReadonlyMap<string, { person: Person }>;
}

/** Where the move you danced last is kept, for the next B. */
const LAST = 'dance-move';
/** All you can pick, in the order Q and E go through them. */
const ORDER: readonly DanceId[] = ['freestyle', ...DANCE_MOVES.map((m) => m.id)];

/** Someone being danced: their body, how it moves, and the pose we gave it (so we only ever take back our own). */
interface Posed {
  person: Person;
  dancer: Dancer;
  dance: DanceId;
  fn: (b: Bones, dt: number) => void;
}

export function installDance(ctx: Ctx, deps: DanceDeps) {
  const { player } = ctx;
  let last: DanceId = 'freestyle';
  try {
    const saved = localStorage.getItem(LAST);
    if (isDance(saved)) last = saved;
  } catch {
    // no storage: Freestyle it is
  }
  /** What you dance now, or null. */
  let mine: DanceId | null = null;
  /** What the roof's music is at this frame (only worked out up there). */
  let frame: DjFrame | null = null;
  const motion = () => !ctx.reduceMotion.matches;

  // ---- Telling the office ------------------------------------------------------------------------
  let sendTimer = 0;
  let sent: DanceId | null = null;
  const tell = (now = false) => {
    clearTimeout(sendTimer);
    const go = () => {
      if (sent === mine) return;
      sent = mine;
      ctx.net.send({ t: 'dance.set', move: mine });
    };
    // Going through a few moves with Q and E: only the one you stop on goes out.
    if (now) go();
    else sendTimer = window.setTimeout(go, DANCE_SEND_MS);
  };
  // A new connection knows nothing of it: say it again.
  ctx.messages.on('welcome', () => {
    sent = null;
    if (mine) tell(true);
  });
  ctx.messages.on('dance.moved', (msg) => {
    const p = store.peers.get(msg.id);
    if (!p) return;
    if (msg.move) p.dance = msg.move;
    else delete p.dance;
  });

  // ---- You ---------------------------------------------------------------------------------------
  const panel = new DancePanel((id) => choose(id));
  $('hud').append(panel.el);

  /** Why you can't start dancing just now, or null if you can. */
  function cantDance(): string | null {
    if (!ctx.upTop()) return 'Getanzt wird oben auf dem Dach';
    if (player.seat || player.rig) return 'Erst aufstehen, dann tanzen';
    return null;
  }

  /** The move for the next B, kept in this browser. */
  function remember(id: DanceId): DanceId {
    last = id;
    try {
      localStorage.setItem(LAST, id);
    } catch {
      // only for next time
    }
    return id;
  }

  function start(id: DanceId = last) {
    const why = cantDance();
    if (why) {
      toast(`🕺 ${why}`, 'warn');
      return;
    }
    // Whatever else you were at stops (it's the dance floor's turn), and you stop walking over to someone.
    ctx.activities.stopAll('start', ['dance']);
    player.stopWalking();
    mine = remember(id);
    tell(true);
    ctx.hint.invalidate();
  }

  function choose(id: DanceId) {
    if (!mine) return start(id);
    mine = remember(id);
    tell();
    ctx.hint.invalidate();
  }

  /** Stops dancing; `walked`: by walking off, which the toast says how to undo. */
  function stop(walked = false) {
    if (!mine) return;
    mine = null;
    tell(true);
    ctx.hint.invalidate();
    if (walked) toast('🕺 Tanzpause · B tanzt weiter');
  }

  const step = (dir: 1 | -1) => choose(ORDER[(ORDER.indexOf(mine ?? last) + dir + ORDER.length) % ORDER.length]);

  ctx.activities.add({
    id: 'dance',
    active: () => mine !== null,
    stop: () => stop(),
    key: (e) => {
      if (e.code === 'KeyB' || e.code === 'Escape') {
        if (!e.repeat) stop();
        return true;
      }
      if (e.code === 'KeyF') {
        choose('freestyle');
        return true;
      }
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        if (!e.repeat) step(e.code === 'KeyE' ? 1 : -1);
        return true;
      }
      const n = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (!n) return false;
      const i = (Number(n[1]) + 9) % 10; // 1 is the first move, 0 the tenth
      choose(DANCE_MOVES[i].id);
      return true;
    },
    hint: (el) => {
      const m = mine ? DANCE_BY_ID.get(mine) : undefined;
      const move = m ? `${m.emoji} ${m.label}` : '';
      ctx.hint.draw(el, `dance|${mine}`, () => [
        h('span.title', {}, move),
        key('1–0', 'Move'),
        key('Q E', 'Wechseln'),
        key(DANCE_KEYS.get('freestyle')!, 'Freestyle'),
        key('B', 'Stopp'),
      ]);
    },
  });

  // B up on the roof: start dancing. Before the office's own keys (B at a desk opens a shell; there are no desks up here).
  ctx.keys.add('emote', (e) => {
    if (e.code !== 'KeyB' || mine || !ctx.upTop()) return false;
    if (!e.repeat) start();
    return true;
  });

  // ---- Everyone's poses ----------------------------------------------------------------------------
  const posed = new Map<string, Posed>();
  /** Gives `person` our pose for `dance`, or takes ours back (null); never anyone else's. */
  const pose = (id: string, person: Person, dance: DanceId | null) => {
    const cur = posed.get(id);
    if (cur && (!dance || cur.person !== person)) {
      cur.person.setWorkout(null);
      posed.delete(id);
    }
    if (!dance) return;
    const had = posed.get(id);
    if (had) {
      had.dance = dance;
      return;
    }
    const dancer = new Dancer(danceSeed(id || store.you));
    const st: Posed = { person, dancer, dance, fn: (b, dt) => frame && dancer.pose(b, dt, frame, st.dance, motion()) };
    posed.set(id, st);
    person.setWorkout(st.fn);
  };

  const glows = new Glows();
  ctx.scene.add(glows.group);
  const spots: { x: number; y: number; z: number }[] = [];
  const seeds: number[] = [];

  // Before your character and everyone else are drawn ('me', 'others'): the beat for this frame, and who dances.
  ctx.ticks.add('moved', () => {
    const up = ctx.upTop();
    frame = up ? deps.frame() : null;
    if (mine) {
      if (!up) stop();
      else if (player.moving) stop(true);
      else if (player.seat || player.rig || ctx.activities.current((a) => a.id !== 'dance')) stop();
    }
    // You: posed while your feet are on the floor (a jump and you're back at it when you land).
    pose('', ctx.me, mine && player.grounded ? mine : null);
    spots.length = seeds.length = 0;
    if (mine && player.grounded) {
      spots.push(player.pos);
      seeds.push(danceSeed(store.you));
    }
    const remotes = deps.remotes();
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      const on = !!p && up && !!p.dance && !p.moving && !p.seat && !store.carOf(id) && !inPoolAt(p.x, p.y, p.z) && p.y <= groundAt(player.colliders, p.x, p.z, p.y) + 0.08;
      pose(id, r.person, on ? p!.dance! : null);
      if (on) {
        spots.push(r.person.root.position);
        seeds.push(danceSeed(id));
      }
    }
    for (const [id, st] of posed) if (id && !remotes.has(id)) (st.person.setWorkout(null), posed.delete(id));
    if (frame && spots.length) glows.update(spots, frame, (i) => seeds[i]);
    else glows.hide();
    // The pill on the dance floor, or the picker while you dance.
    const idle = up && !mine && !ctx.activities.busy() && onDanceFloor(player.pos.x, player.pos.z);
    panel.show(mine ? 'dancing' : idle ? 'invite' : 'off', mine, posed.get('')?.dancer.pick ?? null);
  });

  danceInFirstPerson(ctx, () => (mine && player.grounded ? (posed.get('')?.dancer ?? null) : null));

  // For the tests and the console: what you dance, who's posed, and the controls.
  return { mine: () => mine, posed, start, stop, choose, glows };
}

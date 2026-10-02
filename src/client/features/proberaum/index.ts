/**
 * The Schallwerk's rehearsal wing (flrnoh fork, see FORK.md "The rehearsal wing"): its lobby, the
 * corridor, three rehearsal rooms and the studio, built into the venue through addVenuePart; the
 * doors and booking, knocking and letting in, the recorders and their takes played back for everyone
 * in a room, the boards, the machines, and sound kept in: nobody outside a room hears the voices in
 * it (a voice wall, features/voicerange/walls.ts), only a thump of the drums through its door.
 */
import * as THREE from 'three';
import { bandName, muffleFor, soundApart, spotOf, type ProbeView, type ProbeYou, type Take } from '../../../shared/proberaum';
import { CORRIDOR_FLOOR, LOBBY, WING_WALL, doorOf, inner, roomById, wingPartAt } from '../../../shared/proberaum-layout';
import { VENUE, venueRoomAt, type InstrumentNote, type RehearsalRoomId, type VenueRoomId } from '../../../shared/venue';
import type { Drink } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import type { Room } from '../../player/camera';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import type { Interactable } from '../../world/types';
import { addVenuePart, venueSynth, type VenuePart, type VenueRoom } from '../../world/venue/parts';
import type { Booze } from '../bar/booze';
import { addVoiceWall } from '../voicerange/walls';
import { wingActions } from './actions';
import { drawSession } from './boards';
import { Playback } from './playback';
import { RecorderUi } from './recui';
import type { ProberaumSound } from './sound';
import { ProbeUi } from './ui';
import { buildWing, type Wing } from './world';

declare module '../../world/types' {
  interface InteractKinds {
    proberaum: true;
  }
}

export interface ProberaumDeps {
  /** The bar's booze, and your hand reaching out: for what the fridges and the machine hand over. */
  booze(): Booze;
  reach(): void;
}

const IDEA_KEY = 'agent-office.proberaum.band';
const LAVA = ['#ff5a1f', '#39ff14', '#ff2bd6', '#36e7ff', '#ffd400'];
/** A room's red light stays on this long after the last note played in it (ms). */
const PLAYING_MS = 4000;

export function installProberaum(ctx: Ctx, deps: ProberaumDeps) {
  let view: ProbeView | null = null;
  let you: ProbeYou = { booked: null, band: [], takes: [], pins: [] };
  let wing: Wing | null = null;
  /** Takes the office has sent this page (to play back), by id: the timeline shows their notes. */
  const takes = new Map<string, Take>();
  const lastNote = new Map<RehearsalRoomId, number>();
  let idea = (() => {
    try {
      return localStorage.getItem(IDEA_KEY) || bandName(Date.now());
    } catch {
      return bandName(Date.now());
    }
  })();
  let lavaK = 0;
  let camSaved: Room | null = null;
  let thumps = 0;
  let thumpAt = 0;

  const inVenue = () => store.floor === VENUE;
  const tmp = new THREE.Vector3();
  /** Where you are in the venue's interior coordinates. */
  const me = () => (wing ? wing.group.worldToLocal(tmp.copy(ctx.player.pos)) : tmp.copy(ctx.player.pos));
  const myRoom = (): VenueRoomId => (inVenue() ? venueRoomAt(me().x, me().z) : 'hall');
  const room = (id: RehearsalRoomId) => view?.rooms.find((r) => r.id === id);
  const inside = (id: RehearsalRoomId) => myRoom() === id;
  const member = (id: RehearsalRoomId) => you.band.includes(id);
  const presentIn = (id: RehearsalRoomId) => [...store.peers.values()].filter((p) => p.floor === VENUE && venueRoomAt(p.x, p.z) === id).map((p) => ({ id: p.id, name: p.name }));
  const mayUse = (id: RehearsalRoomId) => inside(id) && (!room(id)?.booking || member(id));
  const sound = (kind: ProberaumSound, at?: { x: number; y: number; z: number }, strength = 0.6, delay = 0, pitch = 48) => ctx.sound.proberaum(kind, at && wing ? wing.group.localToWorld(new THREE.Vector3(at.x, at.y, at.z)) : at, strength, delay, pitch);
  const doorAt = (id: RehearsalRoomId) => {
    const d = doorOf(roomById(id));
    return { x: d.x, y: 1.2, z: d.z };
  };
  const setIdea = (name: string) => {
    idea = name;
    try {
      localStorage.setItem(IDEA_KEY, name);
    } catch {
      // private mode: kept for this visit
    }
  };

  const playback = new Playback({
    now: () => store.officeNow(),
    myRoom,
    note: (n, at) => venueSynth()?.play(n, at),
    click: (accent, delay) => sound(accent ? 'clickhi' : 'click', undefined, 0.8, delay),
  });
  const api = {
    view: () => view,
    you: () => you,
    me: () => store.you,
    inside: presentIn,
    send: (m: Parameters<typeof ctx.net.send>[0]) => ctx.net.send(m),
    bandIdea: () => idea,
    setBandIdea: setIdea,
    sound: (k: 'dice' | 'pin' | 'marker') => sound(k),
  };
  const ui = new ProbeUi(api);
  const rec = new RecorderUi({
    ...api,
    mayUse,
    position: (id) => playback.position(id),
    recording: (id) => playback.recording(id),
    now: () => store.officeNow(),
    notesOf: (id) => takes.get(id)?.evs ?? null,
  });
  const actions = wingActions(
    ctx,
    {
      room,
      inside,
      member,
      at: (it: Interactable) => (it.probe?.what === 'door' || it.probe?.what === 'doorin') && it.probe.room ? doorAt(it.probe.room) : { x: it.x, y: 1.2, z: it.z },
      sound,
      served: (d: Drink) => {
        deps.booze().drink(d, performance.now() / 1000);
        deps.reach();
        ctx.sound.opener(d.glass === 'can' ? 'can' : 'bottle');
        if (ctx.player.view === 'first') ctx.hands.sip();
        toast(`${d.emoji} ${d.name}. ${(d as Drink & { says?: string }).says ?? 'Prost!'}`);
      },
      cutOff: () => deps.booze().cutOff(performance.now() / 1000),
      roll: () => {
        setIdea(bandName(Math.floor(Math.random() * 1e9)));
        sound('dice');
        return idea;
      },
      bandIdea: () => idea,
      lava: () => wing?.rooms.get('probe2')?.lava?.(LAVA[++lavaK % LAVA.length]),
    },
    ui,
    rec,
  );

  // ---- Sound kept in: no voice through a rehearsal room's walls ----------------------------------------
  addVoiceWall((a, b) => soundApart(a, b));

  // ---- Built into the venue ------------------------------------------------------------------------------
  function build(r: VenueRoom) {
    if (wing) return;
    wing = buildWing('proberaum');
    r.group.add(wing.group);
    r.colliders.push(...wing.colliders);
    r.interactables.push(...wing.interactables);
    wing.redraw(view, store.officeNow(), idea);
    wing.recorders(view, store.officeNow(), takeName);
  }
  const takeName = (id: string) => view?.takes.find((t) => t.id === id)?.name ?? null;

  /** The camera keeps to the room you're in (the lobby, the corridor, a rehearsal room); out of the wing it's the venue's again. */
  function camera() {
    const part = inVenue() && wing ? wingPartAt(me().x, me().z) : null;
    if (!part) {
      if (camSaved) ctx.player.room = camSaved;
      camSaved = null;
      return;
    }
    if (!camSaved) camSaved = ctx.player.room;
    const box = part === 'lobby' ? LOBBY : part === 'corridor' ? CORRIDOR_FLOOR : inner(roomById(part));
    const want: Room = { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ, wall: WING_WALL, enclosed: true };
    const cur = ctx.player.room;
    if (cur.minX !== want.minX || cur.maxX !== want.maxX || cur.minZ !== want.minZ || cur.maxZ !== want.maxZ) ctx.player.room = want;
  }

  let screenAt = 0;
  function update(t: number, dt: number) {
    if (!wing) return;
    const now = store.officeNow();
    for (const [id, door] of wing.doors) {
      const r = room(id);
      door.set(!!r?.door, !!r?.booking && !member(id) && !inside(id));
      door.light(!!r?.booking || !!r?.rec || !!r?.playing || now - (lastNote.get(id) ?? -Infinity) < PLAYING_MS);
    }
    wing.studio.onAir(!!room('studio')?.rec);
    wing.update(t, dt);
    playback.tick();
    camera();
    wing.redraw(view, now, idea);
    if (performance.now() - screenAt > 250) {
      screenAt = performance.now();
      if (view?.rooms.some((r) => r.rec || r.playing)) wing.recorders(view, now, takeName);
      session(now);
    }
  }

  /** The studio's session screen: the take being recorded, or playing, or the last one. */
  function session(now: number) {
    if (!wing) return;
    const r = room('studio');
    const kind = (s: string) => spotOf(s)?.kind;
    const live = r?.rec ? playback.recording('studio') : null;
    if (r?.rec && live) {
      const t = now - r.rec.startAt;
      drawSession(wing.studio.screen, t < 0 ? '● Einzählen …' : `● REC · ${r.rec.by}`, live.evs, kind, Math.max(8000, t + 2000), Math.max(0, t), true);
      return;
    }
    const pos = playback.position('studio');
    if (pos) {
      drawSession(wing.studio.screen, `▶ ${takeName(pos.take.id) ?? ''}`, pos.take.evs, kind, pos.take.dur, pos.at, false);
      return;
    }
    const last = view?.takes.filter((x) => x.room === 'studio').at(-1);
    drawSession(wing.studio.screen, last ? last.name : 'Schallwerk Studio · neue Session', takes.get(last?.id ?? '')?.evs ?? [], kind, last?.dur ?? 0, -1, false);
  }

  /** A note played in a rehearsal room, heard outside it: a thump through the door (louder with it open). */
  function through(spot: string, note: InstrumentNote) {
    const s = spotOf(spot);
    if (!s || s.room === 'hall' || !inVenue()) return;
    lastNote.set(s.room, store.officeNow());
    const mine = myRoom();
    if (mine === s.room) return;
    const at = doorAt(s.room);
    const p = me();
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d > 10) return;
    // At most a couple of dozen a second, whatever's played.
    const sec = Math.floor(performance.now() / 1000);
    if (sec !== thumpAt) {
      thumpAt = sec;
      thumps = 0;
    }
    if (++thumps > 24) return;
    const m = muffleFor(mine, s.room, !!room(s.room)?.door);
    const level = Math.min(1, m.gain * 6 * (1 - d / 10) * (0.4 + note.vel * 0.6));
    if (note.kind === 'drums') {
      if (note.pitch === 42 || note.pitch === 46 || note.pitch === 49 || note.pitch === 51) return; // the cymbals don't get through
      sound('thump', at, level, 0, note.pitch);
    } else sound('tone', at, level * 0.6, 0, note.pitch);
  }

  // ---- The office's news -----------------------------------------------------------------------------
  ctx.messages.on('probe', (msg) => {
    const was = view;
    const wasYou = you;
    view = msg.view;
    you = msg.you;
    playback.rooms(view.rooms);
    if (inVenue()) news(was, wasYou);
    ui.refresh();
    rec.refresh();
    ctx.hint.invalidate();
  });
  ctx.messages.on('probe.playing', (msg) => {
    if (msg.take) takes.set(msg.take.id, msg.take);
    playback.set(msg.room, msg.take, msg.startAt, msg.loop);
    rec.refresh();
  });
  ctx.messages.on('probe.knocked', (msg) => {
    if (!inVenue()) return;
    const at = doorAt(msg.room);
    const p = me();
    if (inside(msg.room)) {
      sound('knock', at, 0.9);
      if (member(msg.room)) toast(`🚪 ${msg.name} klopft – E an der Tür: reinlassen`);
    } else if (Math.hypot(p.x - at.x, p.z - at.z) < 8 && msg.name !== store.peers.get(store.you)?.name) sound('knock', at, 0.6);
  });
  ctx.messages.on('probe.tipped', (msg) => {
    if (!inVenue()) return;
    const jar = wing?.interactables.find((it) => it.probe?.what === 'tip');
    if (jar && msg.name !== store.peers.get(store.you)?.name) sound('coin', { x: jar.x, y: 1.1, z: jar.z }, 0.5);
  });

  /** What changed for you: a door near you, a take starting where you are, your booking, being let in. */
  function news(was: ProbeView | null, wasYou: ProbeYou) {
    const p = me();
    for (const r of view?.rooms ?? []) {
      const before = was?.rooms.find((x) => x.id === r.id);
      if (!before) continue;
      const at = doorAt(r.id);
      if (before.door !== r.door && Math.hypot(p.x - at.x, p.z - at.z) < 12) sound(r.door ? 'open' : 'shut', at, 0.7);
      if (inside(r.id) && !!before.rec !== !!r.rec) sound(r.rec ? 'recstart' : 'recstop');
    }
    if (wasYou.booked && !you.booked && was) toast(`🎸 ${roomById(wasYou.booked).name} ist wieder frei`);
    for (const id of you.band) {
      if (wasYou.band.includes(id) || you.booked === id) continue;
      toast(`🎸 Willkommen bei „${room(id)?.booking?.band ?? 'der Band'}“!`);
    }
  }

  const part: VenuePart = {
    build,
    use: (it, k) => actions.use(it, k),
    hint: (it) => actions.hint(it),
    onMessage: (msg) => {
      const m = msg as unknown as { t: string; spot?: unknown; note?: unknown };
      if (m.t !== 'instr.note' || typeof m.spot !== 'string' || !m.note) return;
      playback.heard(m.spot, m.note as InstrumentNote);
      through(m.spot, m.note as InstrumentNote);
    },
    update,
    place: (inside) => {
      if (inside) ctx.net.send({ t: 'probe.look' });
      else {
        ui.close();
        rec.close();
        if (camSaved) ctx.player.room = camSaved;
        camSaved = null;
      }
    },
  };
  addVenuePart(part);
  ctx.interactions.define('proberaum', {
    reach: 3.2,
    hint: (it) => actions.hint(it) ?? { k: '', parts: [] },
    use: (it, k) => void actions.use(it, k),
  });

  return {
    /** For the console and the tests: the wing as the office says, yours, the built wing. */
    get view() {
      return view;
    },
    get you() {
      return you;
    },
    wing: () => wing,
    part,
    ui,
    rec,
    playback,
    /** E at a thing (`what`, in `room`), as if you were facing it, and what the hint says there. */
    act: (what: string, roomId?: RehearsalRoomId) => {
      const it = wing?.interactables.find((x) => x.probe?.what === what && x.probe.room === roomId);
      return it ? actions.use(it, 'E') : false;
    },
    hintAt: (what: string, roomId?: RehearsalRoomId) => {
      const it = wing?.interactables.find((x) => x.probe?.what === what && x.probe.room === roomId);
      const h = it && actions.hint(it);
      return h ? h.parts.map((x) => (typeof x === 'string' ? x : x.textContent)).join(' · ') : null;
    },
    myRoom,
    /** Whether `room`'s door is open (for muffleFor's `doorOpen`). */
    doorOpen: (id: RehearsalRoomId) => !!room(id)?.door,
  };
}

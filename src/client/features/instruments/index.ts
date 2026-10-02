/**
 * flrnoh fork (see FORK.md "The instruments"): the Schallwerk's instruments. The stage across the
 * back of the hall with its backline (stage.ts), and an instrument at every spot of INSTRUMENT_SPOTS,
 * on the stage and in the rehearsal rooms (stations.ts, gear/). E at one takes it (one player each;
 * the office keeps who plays what): you're held at it, your keys play it (play.ts, the key map on
 * screen: overlay.ts) and everyone in the venue gets your notes, each page sounding them at the
 * instrument (sound/), heard only in its room. Others see you play (people.ts). A mic puts your voice
 * on its room's PA. It joins the house through the building's seam (world/venue/parts.ts), and sets
 * the two seams there: the synth (the studio's recorder plays takes back on it) and the stage's level
 * (the light show and the crowd move with the band).
 */
import { INSTRUMENT_SPOTS, VENUE, venueRoomAt, type InstrumentNote, type InstrumentSpot, type VenueRoomId } from '../../../shared/venue';
import { JAM_ROOMS, KIND_NAMES, NO_JAM, ROOM_NAMES, SPOT_BY_ID, beatAt, heardIn, isRelease, micsOnPa, toneOf, type InstrumentsClientMsg, type Jam, type JamChange, type Tone } from '../../../shared/instruments';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { $, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { addVenuePart, setVenueLevel, setVenueSynth } from '../../world/venue/parts';
import { PIECE_OF } from './sound/drums';
import { Overlay } from './overlay';
import { Players, newPlaying, strike, type Playing } from './people';
import { Musician } from './play';
import { buildStage } from './stage';
import { buildStations, stringFinishOf, type Station } from './stations';

// The kind of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    instrument: true;
  }
}

export interface InstrumentsDeps {
  /** Someone else in the venue, as you see them. */
  personOf(id: string): Person | undefined;
}

/** How long (s) the stage's loudness takes to fall away after the band stops. */
const LEVEL_FALL = 0.45;
/** How far ahead (s) the click and the count-in are scheduled. */
const CLICK_AHEAD = 0.15;

export function installInstruments(ctx: Ctx, deps: InstrumentsDeps) {
  let players: Record<string, string> = {};
  const jams: Partial<Record<VenueRoomId, Jam>> = {};
  let tones: Record<string, string> = {};
  let here = false;
  let stations: Station[] | null = null;
  const byId = new Map<string, Station>();
  const byIt = new Map<Interactable, Station>();
  const poses = new Map<string, Playing>();
  /** The spot you've asked for and not yet been given. */
  let pending: string | null = null;
  let level = 0;
  let paKey = '';
  let paAt = 0;
  /** The click's next beat scheduled, by grid; the count-ins already sounded, by room. */
  const clickNext = { grid: '', beat: 0 };
  const countedIn = new Map<VenueRoomId, number>();
  /** For checks from the console and the e2e test: notes received, and how many of them were heard here. */
  const stats = { received: 0, audible: 0, played: 0 };

  const me = () => store.you;
  const send = (m: InstrumentsClientMsg) => ctx.net.send(m);
  const engine = () => ctx.sound.instruments.get();
  const jamOf = (room: VenueRoomId) => jams[room] ?? NO_JAM;
  const toneAt = (spot: InstrumentSpot) => toneOf(spot, tones);
  const name = (id: string) => (id === me() ? 'dir' : (store.peers.get(id)?.name ?? 'jemand'));
  const myPos = () => ctx.player.pos;
  const overlay = new Overlay(() => stopPlaying(true));
  $('hud').append(overlay.el);
  const people = new Players(ctx.hands.scene);

  /** The stations, built the first time anything needs them (the house, or playing before it's up). */
  function ensureStations(): Station[] {
    if (stations) return stations;
    stations = buildStations();
    for (const s of stations) {
      byId.set(s.spot.id, s);
      byIt.set(s.interactable, s);
    }
    return stations;
  }
  const poseOf = (id: string, kind: InstrumentSpot['kind']) => {
    let p = poses.get(id);
    if (!p || p.kind !== kind) poses.set(id, (p = newPlaying(kind)));
    return p;
  };

  // ---- Hearing a note --------------------------------------------------------------------------------
  /**
   * A note played at `spotId` by `who` (you, or someone through the office): sounded at its
   * instrument (heard in its room, see the rooms' levels in the tick), the instrument and its player
   * move, and the stage's loudness goes up. `due` (performance clock, ms) when it's for later.
   */
  function hear(spotId: string, note: InstrumentNote, who: string, due = 0) {
    const spot = SPOT_BY_ID.get(spotId);
    if (!spot || spot.kind !== note.kind) return;
    const delay = Math.max(0, due - performance.now());
    const e = here ? engine() : null;
    if (e) e.play(spot, toneAt(spot), note, e.ctx.currentTime + delay / 1000);
    const show = () => {
      if (here && heardIn(myPos().x, myPos().z, spot.room).gain > 0) stats.audible++;
      if (isRelease(note)) {
        byId.get(spotId)?.keys?.press(note.pitch, false);
        return;
      }
      const st = byId.get(spotId);
      const piece = note.kind === 'drums' ? (PIECE_OF.get(note.pitch) ?? null) : null;
      if (piece) st?.kit?.hit(piece, note.vel);
      if (note.kind === 'keys') {
        st?.keys?.press(note.pitch, true);
        // A key let go of sends its own release; one with a length comes up by itself.
        if (note.len !== undefined) setTimeout(() => st?.keys?.press(note.pitch, false), note.len * 1000);
      }
      strike(poseOf(who, spot.kind), note.pitch, piece, performance.now() / 1000);
      if (spot.room === 'hall') level = Math.max(level, note.kind === 'drums' ? 0.45 + note.vel * 0.55 : 0.3 + note.vel * 0.5);
    };
    if (delay > 8) setTimeout(show, delay);
    else show();
  }

  // ---- Playing ---------------------------------------------------------------------------------------
  const musician = new Musician({
    note: (n, due) => {
      const st = musician.station;
      if (!st) return;
      stats.played++;
      hear(st.spot.id, n, me(), due);
      const delay = due ? due - performance.now() : 0;
      const out = () => send({ t: 'instr.note', spot: st.spot.id, note: n });
      if (delay > 8) setTimeout(out, delay);
      else out();
    },
    jam: () => jamOf(musician.station?.spot.room ?? 'hall'),
    setJam: (change: JamChange) => {
      const room = musician.station?.spot.room;
      if (room) send({ t: 'instr.jam', room, change });
    },
    tone: () => (musician.station ? toneAt(musician.station.spot) : 'drive'),
    setTone: (tone: Tone) => {
      const st = musician.station;
      if (!st) return;
      tones = { ...tones, [st.spot.id]: tone };
      send({ t: 'instr.tone', spot: st.spot.id, tone });
    },
    officeNow: () => store.officeNow(),
    leave: () => stopPlaying(true),
    changed: () => {},
  });

  /** At the instrument: held at its spot, looking at it, the key map up. */
  function startPlaying(st: Station) {
    ctx.activities.stopAll('start', ['instrument']);
    musician.start(st);
    const p = ctx.player;
    p.stopWalking();
    p.rig = () => {
      p.pos.set(st.spot.x, st.floorY, st.spot.z);
      p.facing = st.spot.rotY;
      p.moving = false;
    };
    p.rig(0);
    p.eyeDrop = st.spot.kind === 'drums' ? 0.1 : 0;
    if (p.view === 'first') {
      p.camYaw = st.spot.rotY - Math.PI;
      p.lookPitch = st.spot.kind === 'drums' ? -0.42 : st.spot.kind === 'keys' ? -0.55 : st.spot.kind === 'mic' ? -0.12 : -0.3;
    }
    overlay.show(st.spot.kind, st.spot.room);
    ctx.hint.invalidate();
  }

  /** Away from it: on your feet where you stood, and (`tell`) the office told it's free. */
  function stopPlaying(tell: boolean) {
    const st = musician.station;
    if (!st) return;
    musician.stop();
    ctx.player.rig = null;
    ctx.player.eyeDrop = 0;
    overlay.show(null);
    if (tell) {
      send({ t: 'instr.leave' });
      // Off it here at once: the office says so to everyone else.
      const { [st.spot.id]: _gone, ...rest } = players;
      players = rest;
    }
    pending = null;
    ctx.hint.invalidate();
  }

  ctx.activities.add({
    id: 'instrument',
    active: () => !!musician.station,
    // Whatever stops it (another floor, a trip, a walk somewhere), you put the instrument down.
    stop: () => stopPlaying(true),
    key: (e) => musician.keyDown(e),
    hint: (el) => {
      const kind = musician.kind ?? 'drums';
      ctx.hint.draw(el, `instrument|${kind}`, () => [hintTitle(KIND_NAMES[kind]), aside('die Tasten stehen links unten'), key(kind === 'keys' ? 'Esc' : 'E', kind === 'mic' ? 'Mikro zurück' : 'Aufhören')]);
    },
    hidesHands: true,
    bothHands: true,
  });
  window.addEventListener('keyup', (e) => musician.keyUp(e));
  window.addEventListener('blur', () => musician.releaseAll());

  // ---- What you can use ------------------------------------------------------------------------------
  function use(it: Interactable) {
    const st = byIt.get(it);
    if (!st) return;
    const holder = players[st.spot.id];
    if (holder === me()) return stopPlaying(true);
    if (holder) return toast(`🎶 ${KIND_NAMES[st.spot.kind]}: da spielt gerade ${name(holder)}`, 'warn');
    pending = st.spot.id;
    send({ t: 'instr.take', spot: st.spot.id });
  }
  ctx.interactions.define('instrument', {
    reach: 3.2,
    hint: (it) => {
      const st = byIt.get(it);
      if (!st) return { k: 'instrument|?', parts: [] };
      const holder = players[st.spot.id];
      const title = hintTitle(KIND_NAMES[st.spot.kind]);
      if (holder === me()) return { k: `instrument|${st.spot.id}|mine`, parts: [title, key('E', 'Aufhören')] };
      if (holder) return { k: `instrument|${st.spot.id}|${holder}`, parts: [title, aside(`spielt ${name(holder)}`)] };
      return { k: `instrument|${st.spot.id}|free`, parts: [title, aside(ROOM_NAMES[st.spot.room]), key('E', st.spot.kind === 'mic' ? 'Ans Mikro' : 'Spielen')] };
    },
    use: onE(use),
  });

  // ---- What the office says --------------------------------------------------------------------------
  ctx.messages.on('instr.state', (msg) => {
    players = msg.players;
    const mine = Object.keys(players).find((s) => players[s] === me());
    if (musician.station && musician.station.spot.id !== mine) {
      // Taken off it (walked off, another floor): it's back on its stand.
      stopPlaying(false);
      toast('🎶 Das Instrument ist wieder frei');
    }
    if (!musician.station && mine && mine === pending) {
      ensureStations();
      const st = byId.get(mine);
      if (st) startPlaying(st);
    }
    if (pending && mine !== pending && players[pending] && players[pending] !== me()) pending = null;
    // Whoever put theirs down stops sounding and posing.
    for (const id of [...poses.keys()]) if (!Object.values(players).includes(id)) poses.delete(id);
    ctx.hint.invalidate();
  });
  ctx.messages.on('instr.note', (msg) => {
    if (msg.id === me()) return;
    stats.received++;
    hear(msg.spot, msg.note, msg.id);
  });
  ctx.messages.on('instr.jam', (msg) => Object.assign(jams, msg.jams));
  ctx.messages.on('instr.tones', (msg) => (tones = { ...msg.tones, ...(musician.station ? { [musician.station.spot.id]: toneAt(musician.station.spot) } : {}) }));
  // A fresh connection is a fresh client to the office: nothing's yours any more, say hello again.
  ctx.messages.on('welcome', () => {
    stopPlaying(false);
    here = false;
    players = {};
  });

  // ---- The seams: the recorder's synth, the stage's level ------------------------------------------------
  setVenueSynth({
    play(note, at) {
      const e = engine();
      if (!e || !here) return;
      const room = venueRoomAt(at.x, at.z);
      // It sounds as the nearest instrument of its kind in that room does (its sound), from `at`.
      const near = INSTRUMENT_SPOTS.filter((s) => s.kind === note.kind && s.room === room).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
      const spot: InstrumentSpot = near ?? { id: `synth-${note.kind}-${room}`, kind: note.kind, room, x: at.x, y: at.y, z: at.z, rotY: 0 };
      e.play(spot, toneAt(spot), note, e.ctx.currentTime, { pos: at });
      if (room === 'hall' && !isRelease(note)) level = Math.max(level, 0.3 + note.vel * 0.5);
    },
  });

  // ---- Every frame ------------------------------------------------------------------------------------
  ctx.ticks.add('world', ({ t, dt }) => {
    const inside = store.floor === VENUE;
    if (inside !== here) {
      here = inside;
      if (here) send({ t: 'instr.hello' });
      else leaveVenue();
    }
    level *= Math.exp(-dt / LEVEL_FALL);
    setVenueLevel('stage', here ? level : 0);
    if (!here) return;
    const pos = myPos();
    const myRoom = venueRoomAt(pos.x, pos.z);
    const e = engine();
    if (e) {
      for (const room of JAM_ROOMS) {
        const h = heardIn(pos.x, pos.z, room);
        e.hear(room, h.gain, h.muffled);
      }
      schedule(e, myRoom);
    }
    musician.update();
    // The PA: the mics of the room you're in, at full volume wherever you stand in it.
    const pa = micsOnPa(myRoom, players).filter((id) => id !== me());
    const key = `${myRoom}|${pa.join('|')}`;
    if (key !== paKey || t - paAt > 1) {
      paKey = key;
      paAt = t;
      ctx.voice.setPa(pa);
    }
    const mic = musician.station?.spot.kind === 'mic' ? musician.station.spot : null;
    ctx.voice.selfOnPa = !!mic && mic.room === 'hall';
    // Who plays what, as everyone sees it.
    if (stations) {
      const holders = new Map<string, Parameters<Players['update']>[0] extends Map<string, infer V> ? V : never>();
      for (const [spotId, id] of Object.entries(players)) {
        const st = byId.get(spotId);
        const person = id === me() ? ctx.me : deps.personOf(id);
        if (!st || !person) continue;
        const playing = poseOf(id, st.spot.kind);
        if (st.spot.kind === 'mic') playing.voice = Math.min(1, ctx.voice.levelOf(id) * 6);
        holders.set(id, { person, kind: st.spot.kind, playing, finish: stringFinishOf(st.spot.id) });
      }
      people.update(holders, me(), ctx.player.view === 'first');
      for (const st of stations) {
        if (st.held) st.held.visible = !players[st.spot.id];
        st.kit?.update(dt, t);
        st.keys?.update(dt);
      }
    }
    if (musician.station) {
      const st = musician.station;
      overlay.update({
        kind: st.spot.kind,
        room: st.spot.room,
        jam: jamOf(st.spot.room),
        tone: toneAt(st.spot),
        beat: musician.beat(),
        groove: musician.groove,
        chord: musician.chord,
        power: musician.power,
        octave: musician.octave,
        down: musician.down,
        voice: st.spot.kind === 'mic' ? { on: ctx.voice.inVoice, muted: ctx.voice.muted, level: ctx.voice.localLevel } : undefined,
      });
    }
  });

  /** The click in your ear (playing in a room with it on), and the drummer's sticks counting in (everyone in the room). */
  function schedule(e: NonNullable<ReturnType<typeof engine>>, myRoom: VenueRoomId) {
    const now = store.officeNow();
    const toAudio = (office: number) => e.ctx.currentTime + (office - now) / 1000;
    const jam = jamOf(myRoom);
    const beatMs = 60000 / jam.bpm;
    if (jam.click && jam.at && musician.station?.spot.room === myRoom) {
      const grid = `${myRoom}|${jam.at}|${jam.bpm}`;
      if (grid !== clickNext.grid) {
        clickNext.grid = grid;
        clickNext.beat = Math.ceil(beatAt(jam, now));
      }
      for (; jam.at + clickNext.beat * beatMs <= now + CLICK_AHEAD * 1000; clickNext.beat++) {
        const at = jam.at + clickNext.beat * beatMs;
        if (at >= now - 20) e.click(toAudio(at), ((clickNext.beat % 4) + 4) % 4 === 0);
      }
    }
    if (jam.countIn && countedIn.get(myRoom) !== jam.countIn && jam.countIn + beatMs * 4 > now) {
      countedIn.set(myRoom, jam.countIn);
      const drums = INSTRUMENT_SPOTS.find((s) => s.room === myRoom && s.kind === 'drums');
      if (drums) for (let k = 0; k < 4; k++) if (jam.countIn + k * beatMs >= now - 20) e.sticks(drums, toAudio(jam.countIn + k * beatMs), k === 0);
    }
  }

  /** Out of the venue: not playing, nobody on the PA, nothing heard. */
  function leaveVenue() {
    stopPlaying(false);
    players = {};
    poses.clear();
    people.clear();
    paKey = '';
    ctx.voice.setPa([]);
    ctx.voice.selfOnPa = false;
    const e = engine();
    if (e) for (const room of JAM_ROOMS) e.hear(room, 0, false);
    if (stations) for (const st of stations) if (st.held) st.held.visible = true;
  }

  // ---- Into the house -----------------------------------------------------------------------------------
  addVenuePart({
    build(room) {
      const stage = buildStage();
      room.group.add(stage.group);
      room.colliders.push(...stage.colliders);
      for (const st of ensureStations()) {
        room.group.add(st.group);
        room.colliders.push(...st.colliders);
        room.interactables.push(st.interactable);
      }
    },
  });

  return {
    /** For quick checks from the console and the e2e test. */
    stats: () => ({ ...stats }),
    players: () => players,
    jams: () => jams,
    playing: () => musician.station?.spot.id ?? null,
    /** Who's on your PA (your room and their ids), and whether you are (a stage mic). */
    pa: () => ({ on: paKey, self: ctx.voice.selfOnPa }),
    /** Takes `spot` as E at it would. */
    take: (spot: string) => {
      ensureStations();
      const st = byId.get(spot);
      if (st) use(st.interactable);
    },
    musician,
  };
}

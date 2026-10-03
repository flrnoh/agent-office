/**
 * flrnoh fork (see FORK.md "The show"): the SCHALLWERK's show, its part of the concert venue (zones
 * `floor` and `djbooth` in shared/venue.ts). The crowd on the floor and what you do in it (pogo, a
 * pit, crowd-surfing off the stage, lighters, applause, "Zugabe!", a Wall of Death, beach balls in
 * club mode, a concert photo), the DJ booth (a set from YouTube, SoundCloud or Mixcloud, or the
 * generated house mix, for the whole house), and the gig calendar: its poster wall, the programme
 * window, the banner on every floor when a gig starts, your ticket stubs. It joins the house through
 * the building's seam (world/venue/parts.ts); what the office keeps is server/venue/show.ts'.
 */
import * as THREE from 'three';
import { VENUE, type VenueMode } from '../../../shared/venue';
import { ZONES } from '../../../shared/venue';
import { DJ_SPOT, atDecks, type CrowdAct, type VenueShowClientMsg, type VenueShowState } from '../../../shared/venueshow';
import { HANDS, HIT_REACH } from '../../../shared/venueshow-balls';
import type { Ctx, Hint } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { $, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Interactable } from '../../world/types';
import { addVenuePart } from '../../world/venue/parts';
import { NO_DJ, VenueDj } from './dj';
import { liveGig, onGigsChanged, setGigs, upcomingGigs } from './gigs';
import { glowTexture } from './crowd';
import { ShowHouse, onTheFloor } from './house';
import { gigDate } from './posters';
import { framePhoto, keepPhoto, keepTicket } from './souvenirs';
import { Surf, onStageTop } from './surf';
import { GigBanner, crowdKeys, openDjDesk, openProgramme, photoPop } from './ui';

declare module '../../world/types' {
  interface InteractKinds {
    venuedj: true;
    venueposter: true;
    venuedive: true;
    venueball: true;
  }
}

export interface VenueShowDeps {
  /** Someone else in the house, as you see them. */
  personOf(id: string): Person | undefined;
}

const KINDS = new Set(['venuedj', 'venueposter', 'venuedive', 'venueball']);
const EMPTY: VenueShowState = { dj: NO_DJ, surfers: [], lights: [], balls: [], wodAt: 0 };

export function installVenueShow(ctx: Ctx, deps: VenueShowDeps) {
  let show: VenueShowState = EMPTY;
  let mode: VenueMode = 'konzert';
  let inside = false;
  let built = false;
  let myLight = false;
  let wantPhoto = false;
  let deskWanted = false;
  let liveSince = 0;
  /** You walked off the decks: their giving back is on its way. */
  let leaving = false;
  const send = (m: VenueShowClientMsg) => ctx.net.send(m);
  const sound = ctx.sound.venueShow;
  const watchers = new Set<() => void>();
  const changed = () => watchers.forEach((fn) => fn());
  const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));
  const dj = new VenueDj({ now: () => store.officeNow(), volume: () => sound.embedVolume(house.hearing(), show.dj.volume), toast, changed });
  const surf = new Surf(ctx.player, {
    ended: (how) => {
      send({ t: 'show.surf', on: false });
      if (how === 'down') toast('🙌 Sicher abgesetzt. Was für ein Ritt!');
    },
    landed: () => {
      sound.play('thud', undefined, 1);
      ctx.shake(0.6, true);
      toast('🤕 Autsch: da war keiner, der dich auffängt', 'warn');
    },
  });
  const house = new ShowHouse({ ctx, personOf: deps.personOf, show: () => show, mode: () => mode, dj, sound, surf, lit: (id) => (id === store.you ? myLight : show.lights.includes(id)), live: () => !!liveGig() });
  const banner = new GigBanner();
  const keys = crowdKeys();
  $('hud').append(banner.el, keys.el);
  const me = () => store.you;
  // Your lighter in your own hand, in first person.
  const myFlame = firstPersonFlame();
  ctx.hands.scene.add(myFlame);
  const amDj = () => show.dj.dj?.id === me();

  // ---- What the office says ---------------------------------------------------------------------------
  // A fresh connection is a fresh client to the office: out, and back in (and hello again) once the house is there.
  ctx.messages.on('welcome', () => {
    if (inside) place(false);
    show = EMPTY;
    dj.set(NO_DJ);
    send({ t: 'gig.list' });
  });
  ctx.messages.on('gigs', (msg) => {
    setGigs(msg.gigs, msg.live);
    changed();
  });
  ctx.messages.on('gig.started', (msg) => {
    banner.show(msg.gig, store.floor === VENUE, () => {
      if (store.floor !== VENUE) ctx.net.send({ t: 'floor.go', floor: VENUE });
    });
    if (inside) {
      sound.play('roar', undefined, 1);
      house.cheer = 1;
      house.confetti.rain({ minX: -9, maxX: 15, minZ: -4, maxZ: 3 }, 700, 5, () => 8.5);
    }
  });
  ctx.messages.on('show', (msg) => {
    show = msg.state;
    msg.state.balls.forEach((b, i) => house.setBall(i, b));
    dj.set(show.dj);
  });
  ctx.messages.on('venuedj', (msg) => {
    const was = amDj();
    show = { ...show, dj: msg.state };
    if (!amDj()) leaving = false;
    dj.set(msg.state);
    if (amDj() && !was) {
      // At the decks: in your place behind them, facing the floor.
      ctx.player.pos.set(DJ_SPOT.x, DJ_SPOT.y, DJ_SPOT.z);
      ctx.player.facing = DJ_SPOT.rotY;
      ctx.player.camYaw = 0;
      if (deskWanted) desk();
    }
    deskWanted = false;
    ctx.hint.invalidate();
  });
  ctx.messages.on('venuedj.horn', (msg) => {
    if (house.hearing() !== 'off') sound.play('horn', { x: DJ_SPOT.x, y: 2.5, z: DJ_SPOT.z }, 1);
    if (msg.id !== me() && inside) toast(`📯 ${msg.by} am Airhorn!`);
  });
  ctx.messages.on('show.act', (msg) => act(msg.act, msg.id, msg.x, msg.z));
  ctx.messages.on('show.surf', (msg) => {
    show = { ...show, surfers: msg.on ? [...new Set([...show.surfers, msg.id])] : show.surfers.filter((s) => s !== msg.id) };
    if (msg.on && inside) sound.play('roar', undefined, 0.6);
  });
  ctx.messages.on('show.ball', (msg) => {
    house.setBall(msg.i, msg.ball);
    if (inside && msg.by !== me()) sound.play('ball', { x: msg.ball.x, y: msg.ball.y, z: msg.ball.z }, 0.7);
  });
  ctx.messages.on('show.wod', (msg) => {
    show = { ...show, wodAt: msg.at };
    if (!inside) return;
    toast(`💀 ${msg.by}: WALL OF DEATH! Die Crowd teilt sich …`);
    sound.play('roar', undefined, 0.7);
    setTimeout(() => inside && sound.play('roar', undefined, 1), 3500);
  });
  onGigsChanged(() => house.floor?.hang(upcomingGigs()));

  /** Something someone did in the crowd: seen and heard here. */
  function act(a: CrowdAct, id: string, x: number, z: number) {
    if (!inside) return;
    const at = { x, y: 1.5, z };
    const person = id === me() ? ctx.me : deps.personOf(id);
    if (a === 'pogo') house.jumps.push({ id, x, z, at: store.officeNow() });
    else if (a === 'clap') {
      person?.emote('clap');
      sound.play('clap', at, 1);
    } else if (a === 'zugabe') {
      person?.emote('wave');
      house.zugabe(0.9);
    } else if (a === 'light' || a === 'unlight') show = { ...show, lights: a === 'light' ? [...new Set([...show.lights, id])] : show.lights.filter((l) => l !== id) };
    else if (a === 'flash') {
      house.flashAt(x, z);
      sound.play('flash', at, 0.8);
    }
  }

  /** You do something in the crowd: here at once, for everyone else through the office. */
  function doAct(a: CrowdAct) {
    const p = ctx.player.pos;
    act(a, me(), p.x, p.z);
    send({ t: 'show.act', act: a });
  }

  // ---- What you can use ------------------------------------------------------------------------------------
  function desk() {
    openDjDesk({ state: () => show.dj, you: me(), title: () => dj.player.titleNow(), phase: () => PHASES[dj.player.phase()] ?? '', send, watch, tap, player: dj.player, host: !store.me.guest });
  }
  function useDecks() {
    if (show.dj.dj && !amDj()) return desk();
    if (amDj()) return desk();
    deskWanted = true;
    send({ t: 'venuedj.take' });
  }
  function programme(souvenirs = false) {
    openProgramme({ gigs: () => upcomingGigs(), live: liveGig, team: !store.me.guest, send, watch, souvenirs });
  }
  function dive() {
    if (surf.active) return;
    const caught = house.crowd.present >= 22;
    if (caught) send({ t: 'show.surf', on: true });
    surf.start(caught);
    if (caught) toast('🙌 Stagedive! Die Crowd trägt dich nach hinten');
  }
  function hitBall(it: Interactable) {
    const i = house.floor?.balls.findIndex((b) => b.it === it) ?? -1;
    if (i < 0) return;
    const q = house.ballPos(i);
    const p = ctx.player.pos;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > HIT_REACH || q.y - p.y > 3.4) return toast('🏐 Zu weit weg', 'warn');
    // Away from you, and the way you look.
    const look = new THREE.Vector3();
    ctx.camera.getWorldDirection(look);
    const vx = (d > 0.1 ? (dx / d) * 2 : 0) + look.x * 1.6;
    const vz = (d > 0.1 ? (dz / d) * 2 : 0) + look.z * 1.6;
    const now = store.officeNow();
    house.setBall(i, { x: q.x, y: Math.max(q.y, 0.42), z: q.z, vx, vy: 6.2, vz, at: now, n: q.hit.n + 1 });
    sound.play('ball', { x: q.x, y: q.y, z: q.z }, 1);
    ctx.me.reach();
    send({ t: 'show.ball', i, vx, vy: 6.2, vz });
  }
  const hints: Record<string, (it: Interactable) => Hint> = {
    venuedj: () => {
      const d = show.dj.dj;
      const what = show.dj.set ? `🎶 ${dj.player.titleNow()}` : `Hausmix`;
      if (amDj()) return { k: `dj|me|${what}`, parts: [hintTitle('🎧 DJ-Pult'), aside(what), key('E', 'Pult'), key('H', 'Airhorn'), key('Q', 'Abgeben')] };
      if (d) return { k: `dj|${d.id}|${what}`, parts: [hintTitle('🎧 DJ-Pult'), aside(`${d.name} legt auf · ${what}`), key('E', 'Ansehen')] };
      return { k: 'dj|free', parts: [hintTitle('🎧 DJ-Pult'), aside('frei'), key('E', 'Übernehmen')] };
    },
    venueposter: () => {
      const next = upcomingGigs()[0];
      return { k: `poster|${next?.id ?? ''}`, parts: [hintTitle('🎸 Programm'), aside(next ? `als Nächstes: ${next.title}, ${gigDate(next.start).day} ${gigDate(next.start).date}` : 'noch nichts geplant'), key('E', 'Ansehen')] };
    },
    venuedive: () => ({ k: 'dive', parts: [hintTitle('🤘 Bühnenkante'), aside(house.crowd.present >= 22 ? 'die Crowd wartet' : 'da unten ist kaum wer …'), key('E', 'Stagedive')] }),
    venueball: () => ({ k: 'ball', parts: [hintTitle('🏐 Wasserball'), key('E', 'Anstoßen')] }),
  };
  const uses: Record<string, (it: Interactable) => void> = { venuedj: useDecks, venueposter: () => programme(), venuedive: dive, venueball: hitBall };
  ctx.interactions.define('venuedj', { reach: 3, hint: (it) => hints.venuedj(it), use: onE((it) => uses.venuedj(it)) });
  ctx.interactions.define('venueposter', { reach: 4, hint: (it) => hints.venueposter(it), use: onE((it) => uses.venueposter(it)) });
  ctx.interactions.define('venuedive', { reach: 2.5, hint: (it) => hints.venuedive(it), use: onE((it) => uses.venuedive(it)) });
  ctx.interactions.define('venueball', { reach: 4.2, hint: (it) => hints.venueball(it), use: onE((it) => uses.venueball(it)) });

  // ---- Keys --------------------------------------------------------------------------------------------------
  const taps: number[] = [];
  let tapTimer = 0;
  function tap(): number | null {
    const now = store.officeNow();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 12) taps.shift();
    clearTimeout(tapTimer);
    if (taps.length < 4) return null;
    const bpm = Math.round(((60_000 * (taps.length - 1)) / (now - taps[0])) * 10) / 10;
    if (bpm < 60 || bpm > 200) return null;
    tapTimer = window.setTimeout(() => send({ t: 'venuedj.tap', bpm, at: now }), 1200);
    return bpm;
  }
  ctx.keys.add('activity', (e) => {
    if (e.code === 'Enter' && banner.goNow()) return true;
    if (!inside || surf.active) return false;
    const p = ctx.player.pos;
    if (e.code === 'Space') {
      // A jump in the crowd is a pogo (the jump itself is the office's own).
      if (!e.repeat && onTheFloor(p.x, p.z) && p.y < 0.4 && ctx.player.grounded) {
        doAct('pogo');
        // Into a ball over your head: a header.
        house.floor?.balls.forEach((b) => {
          if (b.mesh.visible && Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z) < 1.3 && b.mesh.position.y - p.y < HANDS + 0.9) hitBall(b.it);
        });
      }
      return false;
    }
    if (amDj() && atDecks(p.x, p.z, p.y)) {
      if (e.code === 'KeyH') {
        if (!e.repeat) send({ t: 'venuedj.fx', fx: 'horn' });
        return true;
      }
      if (e.code === 'KeyQ') {
        send({ t: 'venuedj.leave' });
        return true;
      }
    }
    // Up on the stage: X calls a Wall of Death (the office checks you're up there).
    if (e.code === 'KeyX' && onStageTop(p.y) && p.z >= ZONES.stage.minZ - 0.3) {
      if (!e.repeat) send({ t: 'show.wod' });
      return true;
    }
    if (!onTheFloor(p.x, p.z)) return false;
    if (e.code === 'KeyB') {
      if (!e.repeat) {
        doAct(e.shiftKey ? 'zugabe' : 'clap');
        if (ctx.player.view === 'first') ctx.hands.emote(e.shiftKey ? 'wave' : 'clap');
      }
      return true;
    }
    if (e.code === 'KeyL') {
      if (!e.repeat && !myLight) {
        myLight = true;
        doAct('light');
      }
      return true;
    }
    if (e.code === 'KeyK') {
      if (!e.repeat) photo();
      return true;
    }
    return false;
  });
  // Letting go of L puts the lighter away.
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'KeyL' || !myLight) return;
    myLight = false;
    if (inside) doAct('unlight');
  });
  window.addEventListener('blur', () => {
    if (!myLight) return;
    myLight = false;
    if (inside) doAct('unlight');
  });

  /** K: a photo with the flash, everyone sees the flash; yours to keep. */
  let lastPhoto = 0;
  function photo() {
    if (performance.now() - lastPhoto < 1800) return;
    lastPhoto = performance.now();
    doAct('flash');
    const el = document.createElement('div');
    el.className = 'vs-flash';
    document.body.append(el);
    setTimeout(() => el.remove(), 500);
    wantPhoto = true;
  }
  ctx.ticks.add('render', () => {
    if (!wantPhoto) return;
    wantPhoto = false;
    // Straight after the frame's drawn, before the browser lets go of it.
    const src = ctx.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = Math.round((640 * src.height) / Math.max(1, src.width));
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    const live = liveGig();
    const d = gigDate(Date.now());
    const caption = `${live ? live.title : mode === 'club' ? 'Clubnacht' : 'Schallwerk'} · ${d.day} ${d.date}`;
    const url = framePhoto(c, caption);
    keepPhoto({ url, at: Date.now(), caption });
    photoPop(url, caption);
    changed();
  });

  // ---- Every frame in the house ---------------------------------------------------------------------------------
  function update(t: number, dt: number) {
    house.update(t, dt);
    myFlame.visible = myLight && ctx.player.view === 'first';
    if (myFlame.visible) myFlame.children[1].scale.setScalar(0.07 + 0.012 * Math.sin(t * 23));
    const p = ctx.player.pos;
    // The keys along the bottom: what you can do where you are.
    keys.show(
      surf.active ? [['🙌', 'Crowdsurfen …']]
      : amDj() && atDecks(p.x, p.z, p.y) ? [['E', 'Pult'], ['H', 'Airhorn'], ['Q', 'Pult abgeben']]
      : onStageTop(p.y) && p.z >= ZONES.stage.minZ - 0.3 && p.x < ZONES.stage.maxX ? [['E', 'Stagedive (vorne an der Kante)'], ['X', 'Wall of Death']]
      : onTheFloor(p.x, p.z) && p.y < 0.6 ? [['Leertaste', 'Pogo'], ['B', 'Applaus'], ['⇧B', 'Zugabe!'], ['L halten', mode === 'club' ? 'Handylicht' : 'Feuerzeug'], ['K', 'Foto']]
      : null,
    );
    // At a gig for a while: the ticket's yours.
    const live = liveGig();
    if (live && p.z > ZONES.floor.minZ - 7) {
      liveSince += dt;
      if (liveSince > 20 && keepTicket(live)) toast(`🎟️ Ticket für „${live.title}“ eingesteckt (Andenken: E am Programm-Plakat)`);
    } else liveSince = 0;
    // The decks don't walk away with you: step off the booth and they're free again (the set plays on).
    if (amDj() && !leaving && Math.hypot(p.x - DJ_SPOT.x, p.z - DJ_SPOT.z) > 4.5) {
      leaving = true;
      send({ t: 'venuedj.leave' });
    }
  }

  function place(here: boolean) {
    if (here === inside) return;
    inside = here;
    dj.setIn(here);
    if (here) {
      house.crowd.snap = true;
      send({ t: 'show.hello' });
      house.floor?.hang(upcomingGigs());
      return;
    }
    surf.stop();
    if (myLight) myLight = false;
    myFlame.visible = false;
    house.leave();
    keys.show(null);
  }

  // ---- Into the house -------------------------------------------------------------------------------------------
  addVenuePart({
    build(room) {
      house.build(room);
      house.floor?.hang(upcomingGigs());
      built = true;
    },
    use(it, k) {
      if (!KINDS.has(it.kind)) return false;
      if (k === 'E') uses[it.kind](it);
      return true;
    },
    hint(it) {
      return KINDS.has(it.kind) ? hints[it.kind](it) : null;
    },
    update,
    place,
    mode(m) {
      mode = m;
    },
  });
  // Until the building says (and after a reload straight into the house): in the house is in the house.
  ctx.ticks.add('world', () => {
    if (built && (store.floor === VENUE) !== inside) place(store.floor === VENUE);
  });

  return {
    /** For quick checks from the console and the end-to-end tests. */
    state: () => show,
    mode: (m?: VenueMode) => (m ? (mode = m) : mode),
    house,
    dj,
    surf,
    programme,
    desk,
    update,
    place,
    act: doAct,
  };
}

/** A lighter held up in your right hand, its flame flickering (in the hands' own scene). */
function firstPersonFlame(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.018), new THREE.MeshBasicMaterial({ color: '#e63946' }));
  g.add(body);
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb347', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flame = new THREE.Sprite(mat);
  flame.position.y = 0.06;
  flame.scale.setScalar(0.07);
  g.add(flame);
  g.position.set(0.16, -0.02, -0.42);
  g.visible = false;
  return g;
}

const PHASES: Record<string, string> = {
  loading: 'startet …',
  playing: '🔊 läuft',
  blocked: '🖱️ klick irgendwo, um es zu hören',
  failed: 'spielt hier nicht, du hörst den Hausmix',
  ended: 'zu Ende, du hörst den Hausmix',
  away: 'pausiert, solange du nicht im Haus bist',
};

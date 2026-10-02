/**
 * flrnoh fork (see FORK.md "The cinema"): the cinema on its block behind the office (world/kino/).
 * Saal 1 runs real films back to back on the office's clock (shared/kino.ts, film.ts here): the
 * house lights go down and the curtain opens as one starts, everyone in there sees the same moment.
 * Saal 2 plays a link someone put on at its lectern, like the office TV. Outside, the marquee says
 * what's on and next and its bulbs chase at night; inside, the doors slide open, the counter hands
 * out popcorn, nachos and cola (held like the fridge's things), and the seats are for sitting in.
 */
import * as THREE from 'three';
import { FILMS, kinoAt } from '../../../shared/kino';
import { CASHIER, ENTRANCE, KINO, POPCORN, SCREEN1, inHall, inKino } from '../../../shared/kino-plan';
import type { KinoSnack } from '../../../shared/kino-snacks';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { TvStreams } from '../../tv';
import { openTvBig } from '../../ui/tv';
import { toast } from '../../ui/dom';
import type { SettingsPane } from '../../ui/settings';
import { Person } from '../../world/character';
import { G } from '../../world/kino/kit';
import { posterTexture } from '../../world/kino/posters';
import type { Interactable } from '../../world/types';
import type { Booze } from '../bar/booze';
import { FilmScreen, curtainOpen, houseLevel } from './film';
import { kinoSeats } from './seats';
import { openCounter, openProgramme, openSaal2 } from './ui';

declare module '../../world/types' {
  interface InteractKinds {
    kinocounter: true;
    kinobooth: true;
    kinoscreen: true;
  }
}

export interface KinoDeps {
  booze(): Booze;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  reach(): void;
  showSettings(pane?: SettingsPane): void;
}

/** Within this of the cinema's middle, it's near: the film's video is made, the cashier stands there. */
const NEAR = 70;
const CENTER = { x: (KINO.minX + KINO.maxX) / 2, z: (KINO.minZ + KINO.maxZ) / 2 };

export function installKino(ctx: Ctx, parts: Pick<Parts, 'places' | 'peers'>, deps: KinoDeps) {
  const kino = () => ctx.office.kino;
  /** Down on your floor's street, where the cinema is (not up on the roof, in a place, or between floors). */
  const onStreet = () => ctx.inOffice() && !ctx.upTop() && !ctx.trip() && !parts.places.active();
  const at = (x: number, y: number, z: number) => ({ x, y: ctx.player.street + y, z });
  /** A hall's sound fills it: as loud anywhere in there as the TV is up close (your music and master volume). */
  const hallVolume = () => ctx.sound.tvVolume({ x: ctx.player.pos.x, y: ctx.player.pos.y + 1.6, z: ctx.player.pos.z });

  // ---- Saal 1: the programme ------------------------------------------------------------------------
  const film = new FilmScreen(
    {
      now: () => store.officeNow(),
      volume: () => (inHall(1, ctx.player.pos.x, ctx.player.pos.z) ? hallVolume() : 0),
      toast,
    },
    kino().saal1.screen,
    kino().saal1.plaque,
  );

  // ---- Saal 2: your own film, like the office TV --------------------------------------------------
  const watchers = new Set<() => void>();
  const watch = (fn: () => void) => (watchers.add(fn), () => void watchers.delete(fn));
  const saal2 = new TvStreams(
    {
      now: () => store.officeNow(),
      volume: () => (onStreet() && inHall(2, ctx.player.pos.x, ctx.player.pos.z) ? hallVolume() : 0),
      toast,
      changed: () => watchers.forEach((fn) => fn()),
    },
    ctx.canvas,
    { id: 'kino-saal2', icon: '🎬', name: 'Saal 2', on: 'In Saal 2' },
  );
  const idle2 = idleCard();
  ctx.messages.on('welcome', (msg) => saal2.set(msg.kino ?? { set: null, startedAt: 0, elapsed: 0 }));
  ctx.messages.on('floor.enter', (msg) => saal2.set(msg.kino ?? { set: null, startedAt: 0, elapsed: 0 }));
  ctx.messages.on('kino', (msg) => saal2.set(msg.state));

  const seats = kinoSeats(ctx, parts, kino);
  /** Near the cinema now (see NEAR), worked out each frame. */
  let near = false;

  // ---- The cashier ------------------------------------------------------------------------------------
  let cashier: Person | null = null;
  function vendor(): Person {
    if (cashier) return cashier;
    const p = new Person('Heike', '#e63946', { skin: 1, hair: 6, style: 2 });
    // On a step behind the counter, so she sees over it.
    p.root.position.set(CASHIER.x, G + 0.3, CASHIER.z);
    p.root.rotation.y = CASHIER.rotY;
    p.showLabel(false);
    noOutline(p.root);
    kino().group.add(p.root);
    return (cashier = p);
  }

  function order(d: KinoSnack) {
    const bell = at(CASHIER.x, 1.1, CASHIER.z + 1);
    ctx.sound.kino('bell', bell);
    if (d.id === 'kinocola') ctx.sound.kino('pour', bell);
    cashier?.reach();
    cashier?.say(d.says, 3);
    window.setTimeout(() => {
      deps.booze().drink(d, performance.now() / 1000);
      deps.reach();
      ctx.sound.opener(d.id === 'kinocola' ? 'can' : 'bite');
      if (ctx.player.view === 'first') ctx.hands.sip();
      toast(`${d.emoji} ${d.name}. ${d.says}`);
    }, 650);
  }

  ctx.interactions.define('kinocounter', {
    reach: 3,
    hint: () => {
      const k = kinoAt(store.officeNow());
      const f = FILMS[k.film];
      return { k: `counter|${k.film}|${k.phase}`, parts: [hintTitle('🎟️ Kasse & Snacks'), aside(`${k.phase === 'film' ? 'Saal 1: now' : 'Saal 1: next'} ${f.title} · popcorn, nachos, cola`), key('E', 'Order')] };
    },
    use: onE(() => {
      ctx.sound.kino('bell', at(CASHIER.x, 1.1, CASHIER.z + 1));
      openCounter({ now: () => store.officeNow(), order });
    }),
  });

  ctx.interactions.define('kinobooth', {
    reach: 3,
    hint: () => {
      const on = saal2.showing() ? saal2.titleNow() : '';
      return { k: `booth|${on}`, parts: [hintTitle('🎬 Saal 2'), aside(on || 'put on a YouTube or Twitch link for everyone in here'), key('E', on ? 'Change or stop it' : 'Put on a film')] };
    },
    use: onE(() => openSaal2({ net: ctx.net, screen: saal2, watchBig: () => openTvBig(saal2, watch), openVolume: () => deps.showSettings('sound'), watch })),
  });

  ctx.interactions.define('kinoscreen', {
    reach: 40,
    hint: (it) => {
      if (it === kino().screens[1]) {
        const on = saal2.showing();
        return { k: `screen2|${on}|${saal2.titleNow()}`, parts: [hintTitle('🎬 Saal 2'), aside(on ? saal2.titleNow() : 'E at the lectern by the door puts on a film'), ...(on ? [key('E', 'Watch full screen')] : [])] };
      }
      const k = kinoAt(store.officeNow());
      const f = FILMS[k.film];
      const left = Math.max(0, Math.round((k.endsAt - store.officeNow()) / 60000));
      return { k: `screen1|${k.film}|${k.phase}|${left}`, parts: [hintTitle(`🎬 ${f.title} (${f.year})`), aside(k.phase === 'film' ? `${left} min to go · ${f.licence}` : `starts in ${Math.ceil(-k.offset)} s · ${f.licence}`), key('E', 'Programme')] };
    },
    use: onE((it) => {
      if (it === kino().screens[1]) {
        if (saal2.showing()) openTvBig(saal2, watch);
        return;
      }
      openProgramme(store.officeNow());
    }),
  });

  // ---- What there is to use, near the cinema --------------------------------------------------------
  const usable: Interactable[] = [];
  ctx.usables.add({
    usable: () => {
      usable.length = 0;
      if (!near) return usable;
      const k = kino();
      for (const it of [k.counter, k.booth, ...k.screens]) it.y = ctx.player.street;
      usable.push(k.counter, k.booth, ...seats.nearSeats());
      return usable;
    },
  });

  // ---- Each frame -----------------------------------------------------------------------------------
  let shown = '';
  let level1 = 1;
  let curtain = 0;
  let level2 = 1;
  let popT = 0;
  let wasFilm = false;
  ctx.ticks.add('env', ({ t, dt }) => {
    const k0 = kino();
    const street = onStreet();
    const p = ctx.player.pos;
    const dist = Math.hypot(p.x - CENTER.x, p.z - CENTER.z);
    near = street && dist < NEAR;
    const in1 = near && inHall(1, p.x, p.z);
    const in2 = near && inHall(2, p.x, p.z);

    // The marquee and the posters follow the programme; its bulbs chase at night, seen from all round.
    const k = film.update(near, in1);
    const key2 = `${k.film}|${k.phase}`;
    if (key2 !== shown) {
      shown = key2;
      const when = k.phase === 'film' ? 'JETZT IN SAAL 1' : `UM ${new Date(k.startsAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} IN SAAL 1`;
      k0.marquee.setTitles(FILMS[k.film].title, FILMS[k.next].title, when);
      k0.posters.forEach((m, i) => {
        m.map = posterTexture((k.film + i) % FILMS.length);
        m.needsUpdate = true;
      });
    }
    if (street || ctx.upTop()) k0.marquee.update(t, ctx.sky.lampsOn);
    saal2.setOn(in2);
    if (!near) return;

    // The house lights, the curtain and the beam in Saal 1; a gong as the lights go down.
    const ease = Math.min(1, dt * 1.5);
    level1 += (houseLevel(k) - level1) * ease;
    curtain += (curtainOpen(k) - curtain) * ease;
    const playing = film.phase() === 'playing';
    k0.saal1.lights.set(level1, playing ? 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 2.1) : 0);
    k0.saal1.curtains(curtain);
    if (k0.saal1.beam) {
      k0.saal1.beam.visible = playing && in1;
      (k0.saal1.beam.material as THREE.MeshBasicMaterial).opacity = 0.018 + 0.006 * Math.sin(t * 23) * Math.sin(t * 5);
    }
    const startsSoon = k.phase === 'break' && k.offset > -8;
    if (startsSoon && !wasFilm && in1) ctx.sound.kino('gong', at(SCREEN1.x, 3, SCREEN1.z));
    wasFilm = startsSoon || k.phase === 'film';

    // Saal 2: its link plays while you're in there (laid over its screen after the frame's drawn, see
    // below); its lights go down while it does.
    const map = saal2.showing() ? saal2.card() : idle2;
    if (k0.saal2.screen.material.map !== map) {
      k0.saal2.screen.material.map = map;
      k0.saal2.screen.material.needsUpdate = true;
    }
    level2 += ((saal2.phase() === 'playing' ? 0.2 : 1) - level2) * ease;
    k0.saal2.lights.set(level2);

    // The doors slide open for anyone coming up to them.
    const people = [p, ...[...parts.peers.remotes.values()].map((r) => r.person.root.position)];
    for (const d of k0.doors) {
      const want = people.some((q) => Math.abs(q.y - ctx.player.street) < 2 && Math.hypot(q.x - d.x, q.z - d.z) < 3.2) ? 1 : 0;
      d.open += (want - d.open) * Math.min(1, dt * 5);
      d.show(d.open);
    }

    // The foyer: the programme board, the popcorn popping (and heard close by), the cashier.
    k0.foyer.programme(store.officeNow());
    if (inKino(p.x, p.z)) {
      k0.foyer.update(t, dt);
      popT -= dt;
      if (popT <= 0 && Math.hypot(p.x - POPCORN.x, p.z - POPCORN.z) < 8) {
        popT = 0.08 + Math.random() * 0.35;
        ctx.sound.kino('pop', at(POPCORN.x, POPCORN.y + 0.6, POPCORN.z));
      }
    }
    const c = vendor();
    const look = Math.hypot(p.x - CASHIER.x, p.z - CASHIER.z) < 8 ? Math.atan2(p.x - CASHIER.x, p.z - CASHIER.z) : CASHIER.rotY;
    c.root.rotation.y += Math.atan2(Math.sin(look - c.root.rotation.y), Math.cos(look - c.root.rotation.y)) * Math.min(1, dt * 3);
    c.update(dt, t, false, false);

    seats.poseOthers(true);
  });

  // Saal 2's player, laid over its screen once the scene's drawn (as the office TV's is), or hidden.
  ctx.ticks.add('render', () => {
    const p = ctx.player.pos;
    const in2 = near && inHall(2, p.x, p.z);
    saal2.frame(in2 ? { camera: ctx.camera, screen: kino().saal2.screen, boxes: kino().walls } : null);
  });

  // Away from the cinema: nobody's posed as sitting in it any more.
  ctx.ticks.add('others', () => {
    if (!near) seats.poseOthers(false);
  });

  return {
    film,
    saal2,
    /** Where the entrance is, for screenshots and checks. */
    entrance: { x: ENTRANCE.x + 3, z: ENTRANCE.z },
    near: () => near,
  };
}

/** Saal 2's screen while nothing's on. */
function idleCard(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0, '#0b1026');
  grad.addColorStop(1, '#3a0ca3');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1280, 720);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = '900 96px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('🎬 Saal 2', 640, 320);
  g.font = '700 44px Nunito, ui-rounded, system-ui, sans-serif';
  g.fillText('E at the lectern by the door: put on a film for everyone in here', 640, 420);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

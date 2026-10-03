/**
 * flrnoh fork (see FORK.md): the places across the street, each a place of its own like the roof:
 * the casino (casino.ts), the gym (gym.ts), the padel hall with its café and courts (hall.ts,
 * hall/padel.ts), the soccer hall (soccer/place.ts), the bowling centre (client/bowling), the Schallwerk (client/venue) and the thermal baths behind the gym
 * (client/therme). Their doors are on the office's street (the baths' in the gym's basement); inside,
 * only what's in there is there to use.
 */
import { setMirrorSelf } from '../../world/venue/mirror'; // fork: the Schallwerk's mirror
import type * as THREE from 'three';
import type { CafeItem } from '../../../shared/cafe';
import { CASINO } from '../../../shared/casino';
import { GYM } from '../../../shared/gym';
import { HALL } from '../../../shared/hall';
import { SOCCER } from '../../../shared/soccer';
import { BOWLING } from '../../../shared/bowling';
import { VENUE } from '../../../shared/venue';
import { THERME } from '../../../shared/therme';
import type { Drink } from '../../../shared/rooftop';
import type { ServerMsg } from '../../../shared/protocol';
import type { Ctx, Hint } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import { builtFloors } from '../../core/floors';
import { aside, hintTitle, key } from '../../core/hint';
import { noOutline } from '../../core/outline';
import type { Parts } from '../../core/parts';
import { CasinoPlace } from '../../casino';
import { GymPlace } from '../../gym';
import { HallPlace } from '../../hall';
import { buildCourts } from '../../hall/courts';
import { PadelPlay } from '../../hall/padel';
import { SoccerPlace } from '../../soccer/place';
import { soccerLook } from '../../world/soccer/look';
import { BowlingPlace } from '../../bowling/place';
import { VenuePlace } from '../../venue/place';
import { ThermePlace } from '../../therme/place';
import type { Booze } from '../bar/booze';
import { toast } from '../../ui/dom';
import { store } from '../../state';
import type { DeskKey } from '../../interaction';
import type { Interactable } from '../../world/types';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    casino: true;
    casinotable: true;
    gym: true;
    gymstation: true;
    hall: true;
    cafe: true;
    padel: true;
    soccer: true;
    soccerpitch: true;
    bowling: true;
    bowlingcounter: true;
    bowlingshoes: true;
    bowlingswitch: true;
    bowlingseat: true;
    bowlingpart: true;
    venue: true;
    venuekasse: true;
    venuedock: true;
    venuecoat: true;
    venuemerch: true;
    venuebooth: true;
    venuebar: true;
    venuerider: true;
    venuelight: true;
    venuemix: true;
    venueseat: true;
    venuepart: true;
    therme: true;
    thermeseat: true;
    thermebar: true;
    thermeslide: true;
    thermelift: true;
    thermeboard: true;
  }
}

export interface PlacesDeps {
  /** Handed over the padel hall café's counter (see features/fridge). */
  served(d: CafeItem): void;
  /** The bar's booze, and your hand reaching out: for what the bowling centre's counter hands over. */
  booze(): Booze;
  reach(): void;
}

export type PlacesParts = Pick<Parts, 'stage' | 'worlds' | 'place' | 'travel' | 'peers' | 'confetti'>;

export function installPlaces(ctx: Ctx, core: CoreState, parts: PlacesParts, deps: PlacesDeps) {
  const { scene, player, net, camera, canvas } = ctx;
  const { inOffice, plan } = parts.worlds;
  /** What every place needs of the office around it. */
  const host = {
    scene,
    send: (m: Parameters<typeof net.send>[0]) => net.send(m),
    floor: () => store.floor,
    floors: () => builtFloors(),
    inOffice: () => inOffice(),
    player,
    showOffice: (on: boolean) => {
      ctx.world().group.visible = on && !core.upTop;
      parts.stage.holiday.group.visible = on && !core.upTop && inOffice();
    },
    officeColliders: () => ctx.world().colliders,
    officeRoom: () => ({ ...plan().bounds, ...ctx.world().room }),
    setIndoors: (on: boolean) => {
      ctx.sky.setIndoors(on || ctx.world().room.enclosed);
      // Inside a place, all of it is indoors to the sound (they're bigger than the office, whose walls
      // it'd go by): the rain's only a patter on the roof, not a downpour by the outer walls.
      ctx.sound.setHall(on ? { bounds: { minX: -1e4, maxX: 1e4, minZ: -1e4, maxZ: 1e4 }, gong: null, windows: [{ x: 0, y: 12, z: 0 }] } : null);
    },
    trip: (floor: string, at?: { x: number; y: number; z: number; rotY: number }) => parts.travel.placeTrip(floor, at),
    placeAt: (at: { x: number; y: number; z: number; rotY: number }) => parts.place.placeAt(at),
    noOutline: (o: THREE.Object3D) => noOutline(o),
  };
  const casino = new CasinoPlace({ ...host, sound: (k) => ctx.sound.casino(k) });
  const gym = new GymPlace({
    ...host,
    sound: (k) => ctx.sound.gym(k),
    spaPeople: () => [...store.peers.values()].filter((p) => p.id !== store.you && store.onMyFloor(p)).map((p) => ({ x: p.x, y: p.y, z: p.z })),
    ambience: (level) => ctx.sound.gymSpa(level),
    radio: (url, reach, volume) => ctx.sound.gymRadio.set(url, reach, volume), // fork: Gym FM (shared/gym-radio.ts)
    thunder: () => ctx.sound.gym('thunder'), // fork: the basement's storm shower
    people: () => [...parts.peers.remotes].map(([id, r]) => ({ name: store.peers.get(id)?.name ?? '', person: r.person })),
    you: () => ({ name: store.peers.get(store.you)?.name ?? '', person: ctx.me }),
    now: () => store.officeNow(),
    camera,
    soundAt: (k, at) => ctx.sound.gymAt(k, at),
  });
  const hall = new HallPlace({ ...host, sound: (k) => ctx.sound.padelHall(k), served: (d) => deps.served(d) });
  const soccer = new SoccerPlace({
    ...host,
    canvas,
    you: () => store.you,
    body: (id) => (id === store.you ? ctx.me.root : parts.peers.remotes.get(id)?.person.root),
    sound: (k, at, s) => ctx.sound.soccer(k, at, s),
    confetti: (x, y, z) => parts.confetti.burst(x, y, z, 160, 0.8),
    person: (id) => (id === store.you ? ctx.me : parts.peers.remotes.get(id)?.person), // kits and moves (soccer/show.ts)
    camera, // the goal's replay
  });
  // The soccer hall's crowd grows with the people in there (you too).
  soccerLook.bind({ sound: ctx.sound, people: () => 1 + [...store.peers.values()].filter((p) => p.floor === SOCCER && p.id !== store.you).length });
  // The padel courts, built into the hall's interior when it's first built (hall/courts.ts).
  hall.add({
    build: (room) => {
      const courts = buildCourts(room.group);
      room.colliders.push(...courts.colliders);
      room.interactables.push(...courts.interactables);
    },
  });
  const padel = new PadelPlay({ net, camera, canvas, player, sound: ctx.sound });
  // The bowling centre next door (client/bowling): its house, and the lanes, karaoke and mini golf as its parts.
  const bowling = new BowlingPlace({
    ...host,
    player,
    sound: (k) => ctx.sound.bowling(k),
    ambience: (level, cosmic) => ctx.sound.setBowling(level, cosmic),
    served: (d: Drink) => {
      deps.booze().drink(d, performance.now() / 1000);
      deps.reach();
      ctx.sound.opener(d.glass === 'pint' ? 'bottle' : d.glass === 'fries' || d.glass === 'currywurst' || d.glass === 'nachos' ? 'bite' : 'can');
      if (ctx.player.view === 'first') ctx.hands.sip();
      toast(`${d.emoji} ${d.name}. ${(d as Drink & { says?: string }).says ?? 'Bitteschön!'}`); // (the fridge's, kiosk's, cinema's and shops' things all say something)
    },
    cutOff: () => deps.booze().cutOff(performance.now() / 1000),
    you: () => store.you,
    people: () => {
      const list = [...store.peers.values()].filter((p) => p.floor === BOWLING);
      return list.map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, moving: p.moving, seated: !!p.seat, person: p.id === store.you ? ctx.me : parts.peers.remotes.get(p.id)?.person }));
    },
    me: () => ctx.me,
  });
  // The Schallwerk across the street (client/venue): its house, and the instruments, the rehearsal wing and the show as its parts.
  const peerLook = (id: string) => store.peers.get(id);
  setMirrorSelf(() => ctx.me.root); // the green room's mirror shows you, in first person too
  const venue = new VenuePlace({
    ...host,
    player,
    sound: (k) => ctx.sound.venue.play(k),
    ambience: (crowd, foyer, bar) => ctx.sound.venue.ambience(crowd, foyer, bar),
    served: (d: Drink) => {
      deps.booze().drink(d, performance.now() / 1000);
      deps.reach();
      ctx.sound.opener(d.glass === 'pint' || d.glass === 'bottle' ? 'bottle' : 'can');
      if (ctx.player.view === 'first') ctx.hands.sip();
      toast(`${d.emoji} ${d.name}. ${(d as Drink & { says?: string }).says ?? 'Prost!'}`);
    },
    cutOff: () => deps.booze().cutOff(performance.now() / 1000),
    you: () => store.you,
    people: () =>
      [...store.peers.values()]
        .filter((p) => p.floor === VENUE)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, look: p.look, x: p.x, y: p.y, z: p.z, moving: p.moving, seated: !!p.seat, person: p.id === store.you ? ctx.me : parts.peers.remotes.get(p.id)?.person })),
    everyone: () => [{ id: store.you, person: ctx.me }, ...[...parts.peers.remotes].filter(([id]) => peerLook(id)).map(([id, r]) => ({ id, person: r.person }))],
    me: () => ctx.me,
    now: () => store.officeNow(),
    emote: (id) => {
      ctx.me.emote(id);
      ctx.net.send({ t: 'emote', emote: id });
    },
  });
  // The thermal baths behind the gym (client/therme): through the glass door at the end of its basement's passage.
  const therme = new ThermePlace({
    ...host,
    sound: (k) => (k === 'whoosh' ? ctx.sound.gym('whoosh') : k === 'beep' || k === 'ding' || k === 'photo' ? ctx.sound.gym('ding') : k === 'go' ? ctx.sound.gym('buzzer') : k === 'horn' ? ctx.sound.soccerCrowd('horn', 0.9) : k === 'door' ? ctx.sound.padelHall('door') : k === 'pour' ? ctx.sound.padelHall('pour') : k === 'stroke' ? ctx.sound.gym('whoosh') : ctx.sound.gym('splash')),
    daylight: () => ctx.sky.daylight,
    now: () => store.officeNow(),
    you: () => store.you,
    people: () =>
      [...store.peers.values()]
        .filter((p) => p.floor === THERME)
        .map((p) => (p.id === store.you ? { id: p.id, x: player.pos.x, y: player.pos.y, z: player.pos.z, moving: player.moving, person: ctx.me } : { id: p.id, x: p.x, y: p.y, z: p.z, moving: p.moving, person: parts.peers.remotes.get(p.id)?.person })),
    me: () => ctx.me,
    served: (d: Drink) => {
      deps.booze().drink(d, performance.now() / 1000);
      deps.reach();
      ctx.sound.opener(d.glass === 'pint' || d.glass === 'bottle' ? 'bottle' : 'can');
      if (ctx.player.view === 'first') ctx.hands.sip();
      toast(`${d.emoji} ${d.name}. ${(d as Drink & { says?: string }).says ?? 'Zum Wohl!'}`);
    },
    cutOff: () => deps.booze().cutOff(performance.now() / 1000),
    renderer: ctx.renderer,
    name: () => store.peers.get(store.you)?.name ?? '',
  });
  // The baths last: going back to the gym, they put you by their door after the gym has had its say.
  const all = [casino, gym, hall, soccer, bowling, venue, therme] as const;

  /** The place you're in, if any. */
  const inside = () => all.find((p) => p.active) ?? null;

  ctx.messages.onAny((msg: ServerMsg) => {
    for (const p of all) p.onMessage(msg);
    soccerLook.onMessage(msg); // the soccer hall's crowd, boards and announcer
  });
  // Once the office's own arriving is done (see core/arrival.ts): into a place, or back out of one.
  ctx.messages.on('welcome', () => all.forEach((p) => p.arrived()));
  ctx.messages.on('floor.enter', () => all.forEach((p) => p.arrived()));

  const title = (text: string) => hintTitle(text);
  const none: Hint = { k: '', parts: [] };
  /** E (or another key) at something of a place's: whether it did anything. */
  const use = (it: Interactable, k: DeskKey) => void all.some((p) => p.use(it, k));
  /** What a place's hint bar says about `it`. */
  const hintIn = (place: (typeof all)[number]) => (it: Interactable) => place.hint(it, title, key, aside) ?? none;
  // Their doors on the street, and what's inside each.
  ctx.interactions.define('casino', { reach: 4, hint: hintIn(casino), use });
  ctx.interactions.define('casinotable', { reach: 3.5, hint: hintIn(casino), use });
  ctx.interactions.define('gym', { reach: 4, hint: hintIn(gym), use });
  ctx.interactions.define('gymstation', { reach: 3.5, hint: hintIn(gym), use });
  ctx.interactions.define('hall', { reach: 4, hint: hintIn(hall), use });
  ctx.interactions.define('cafe', { reach: 3.5, hint: hintIn(hall), use });
  ctx.interactions.define('soccer', { reach: 4, hint: hintIn(soccer), use });
  ctx.interactions.define('soccerpitch', { reach: 3.5, hint: hintIn(soccer), use });
  ctx.interactions.define('bowling', { reach: 4, hint: hintIn(bowling), use });
  ctx.interactions.define('bowlingcounter', { reach: 3.5, hint: hintIn(bowling), use });
  ctx.interactions.define('bowlingshoes', { reach: 3.5, hint: hintIn(bowling), use });
  ctx.interactions.define('bowlingswitch', { reach: 3, hint: hintIn(bowling), use });
  ctx.interactions.define('bowlingseat', { reach: 3, hint: hintIn(bowling), use });
  // Anything of the lanes', the karaoke bar's or the mini golf's that has no kind of its own: its part's use and hint (world/bowling/parts.ts).
  ctx.interactions.define('bowlingpart', { reach: 3.5, hint: hintIn(bowling), use });
  // The Schallwerk: its doors, the foyer's stands, the bar, the rider, the green room's sofas, the desks; anything of its parts' without a kind of its own (world/venue/parts.ts).
  ctx.interactions.define('venue', { reach: 4, hint: hintIn(venue), use });
  ctx.interactions.define('venuedock', { reach: 4, hint: hintIn(venue), use });
  ctx.interactions.define('venuekasse', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuecoat', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuemerch', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuebooth', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuebar', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuerider', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuelight', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuemix', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venuepart', { reach: 3.5, hint: hintIn(venue), use });
  ctx.interactions.define('venueseat', { reach: 3, hint: hintIn(venue), use });
  // The glass door between the gym's basement and the baths, from either side.
  ctx.interactions.define('therme', { reach: 3.5, hint: hintIn(therme), use });
  // The baths' loungers and the swim-up bar (client/therme).
  ctx.interactions.define('thermeseat', { reach: 2.5, hint: hintIn(therme), use });
  ctx.interactions.define('thermebar', { reach: 4, hint: hintIn(therme), use });
  // The slides' gates, the tower's lift, the kiosk with the boards.
  ctx.interactions.define('thermeslide', { reach: 3, hint: hintIn(therme), use });
  ctx.interactions.define('thermelift', { reach: 3, hint: hintIn(therme), use });
  ctx.interactions.define('thermeboard', { reach: 3.5, hint: hintIn(therme), use });
  ctx.interactions.define('padel', {
    reach: 5,
    hint: (it) => {
      if (!it.court) return none;
      const t = padel.hint(it.court);
      return { k: `${t.aside}|${t.action}`, parts: [hintTitle(t.title), aside(t.aside), key('E', t.action)] };
    },
    use: (it, k) => {
      if (k === 'E' && it.court) padel.use(it.court);
    },
  });

  // Fork: swimming in the gym basement's lap pool (client/gym-pool.ts): the keys and the hint bar while you're in.
  const lap = gym.pool;
  ctx.activities.add({
    id: 'gympool',
    active: () => lap.swimming,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') lap.leave();
    },
    key: (e) => {
      if (e.code === 'KeyE' && lap.atEdge) {
        if (!e.repeat) lap.climbOut();
        return true;
      }
      if (e.code === 'Space') {
        if (!e.repeat) ctx.sound.gym('splash');
        return true;
      }
      return false;
    },
    hint: (el) => ctx.hint.draw(el, `gympool|${lap.atEdge}`, () => [hintTitle('🏊 Lap pool'), aside('wall to wall: a timed length'), key('W A S D', 'Swim'), key('Shift', 'Faster'), key('Space', 'Splash'), ...(lap.atEdge ? [key('E', 'Climb out')] : [])]),
    hidesHands: true,
  });

  // Fork: swimming in the thermal baths' pools (client/swim/, client/therme): the keys and the hint bar while you're in.
  const bath = therme.swim;
  ctx.activities.add({
    id: 'thermeswim',
    active: () => bath.swimming,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') bath.leave();
    },
    key: (e) => {
      if (e.code === 'KeyE' && therme.atBar) {
        if (!e.repeat) therme.bar();
        return true;
      }
      if (e.code === 'KeyE' && bath.atEdge) {
        if (!e.repeat) bath.climbOut();
        return true;
      }
      if (e.code === 'Space') {
        if (!e.repeat) ctx.sound.gym('splash');
        return true;
      }
      return false;
    },
    hint: (el) =>
      ctx.hint.draw(el, `thermeswim|${bath.atEdge}|${therme.atBar}|${bath.pool?.id}`, () => [
        hintTitle(bath.pool?.id.startsWith('therme-whirl') ? '🫧 Whirlpool' : bath.pool?.id === 'therme-grotto' ? '💎 Grotte' : bath.pool?.id === 'therme-waves' ? '🌊 Wellenbad' : bath.pool?.id === 'therme-landing' ? '🛝 Landebecken' : '🌊 Thermalbecken'),
        aside(bath.pool?.id === 'therme-thermal' ? '34 °C' : bath.pool?.id === 'therme-waves' ? '30 °C · Wellen alle 8 Minuten' : bath.pool?.id === 'therme-landing' ? 'Bestzeiten am Kiosk' : '36 °C'),
        key('W A S D', 'Swim'),
        key('Shift', 'Faster'),
        key('Space', 'Splash'),
        ...(therme.atBar ? [key('E', 'Order at the bar')] : bath.atEdge ? [key('E', 'Climb out')] : []),
      ]),
    hidesHands: true,
  });

  // Fork: down one of the baths' slides (client/therme/slides.ts): nothing to steer, the hint says how fast.
  ctx.activities.add({
    id: 'thermeslide',
    active: () => !!therme.rider.riding,
    stop: (why) => {
      if (why !== 'walk' && why !== 'errand') therme.rider.stop();
    },
    key: () => true,
    hint: (el) => ctx.hint.draw(el, `thermeslide|${Math.round((therme.rider.riding?.t ?? 0) * 10)}`, () => [hintTitle(therme.rider.hint())]),
    hidesHands: true,
  });

  ctx.ticks.add('play', ({ dt }) => padel.update(dt));
  ctx.ticks.add('world', ({ t, dt }) => all.forEach((p) => p.update(t, dt)));
  // Each place lights itself, after the sky's had its say (see updateSky in core/loop.ts).
  ctx.ticks.add('env', () => {
    const { sun, hemi, ambient } = parts.stage;
    for (const p of all) p.mood({ sun, hemi, ambient, scene });
    soccerLook.mood({ hemi, ambient }, ctx.sky.daylight); // the soccer hall's floodlights, the night in its windows
  });
  // With the camera on a court or at a gym station, the game has the screen: no hands drawn over it.
  ctx.view.add({ covers: () => padel.zoomed || gym.zoomed || soccer.replaying });

  return {
    /** In one of the places. */
    active: () => !!inside(),
    /** What there is to use in the place you're in; null outside them (see usable in input/pointer.ts). */
    usable: (): Interactable[] | null => inside()?.interactables ?? null,
    /** What the aim can land on in the place you're in; null outside them. */
    pickables: (): THREE.Object3D[] | null => inside()?.pickables ?? null,
    /** In or out of each place, as the floor you're on says (see setPlace in core/travel.ts). */
    // The ones you left first, then the one you're in: from one place straight to another (the gym and its baths), the one left mustn't hand you the office's walls after the new one gave you its own.
    setPlace: () => {
      for (const p of all) if (store.floor !== placeOf(p)) p.setPlace(false);
      for (const p of all) if (store.floor === placeOf(p)) p.setPlace(true);
    },
    /** The building changed maps: still in a place (or off to a floor, on a map without one). */
    refresh: () => all.forEach((p) => p.refresh()),
    /** The project corner's name and line, in a place. */
    title: (): { name: string; meta: string } | null => inside()?.title() ?? null,
    /** On a padel court, the court draws them (see features/peers). */
    hides: (id: string) => padel.hides(id),
    /** Whether you show as yourself (the gym's camera), or not at all (on a court): undefined when it's the office's call. */
    seesYou: (): boolean | undefined => (padel.zoomed ? false : gym.showsYou ? true : gym.zoomed ? false : undefined),
    casino,
    gym,
    hall,
    soccer,
    padel,
    bowling,
    venue,
    therme,
  };
}

/** The floor id each place is. */
function placeOf(p: CasinoPlace | GymPlace | HallPlace | SoccerPlace | BowlingPlace | VenuePlace | ThermePlace): string {
  return p instanceof ThermePlace ? THERME : p instanceof CasinoPlace ? CASINO : p instanceof GymPlace ? GYM : p instanceof HallPlace ? HALL : p instanceof BowlingPlace ? BOWLING : p instanceof VenuePlace ? VENUE : SOCCER;
}

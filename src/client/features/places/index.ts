/**
 * flrnoh fork (see FORK.md): the places across the street, each a place of its own like the roof:
 * the casino (casino.ts), the gym (gym.ts), the padel hall with its café and courts (hall.ts,
 * hall/padel.ts) and the soccer hall (soccer/place.ts). Their doors are on the office's street; inside,
 * only what's in there is there to use.
 */
import type * as THREE from 'three';
import type { CafeItem } from '../../../shared/cafe';
import { CASINO } from '../../../shared/casino';
import { GYM } from '../../../shared/gym';
import { HALL } from '../../../shared/hall';
import { SOCCER } from '../../../shared/soccer';
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
  }
}

export interface PlacesDeps {
  /** Handed over the padel hall café's counter (see features/fridge). */
  served(d: CafeItem): void;
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
    setIndoors: (on: boolean) => ctx.sky.setIndoors(on || ctx.world().room.enclosed),
    trip: (floor: string, at?: { x: number; y: number; z: number; rotY: number }) => parts.travel.placeTrip(floor, at),
    placeAt: (at: { x: number; y: number; z: number; rotY: number }) => parts.place.placeAt(at),
    noOutline: (o: THREE.Object3D) => noOutline(o),
  };
  const casino = new CasinoPlace({ ...host, sound: (k) => ctx.sound.casino(k) });
  const gym = new GymPlace({
    ...host,
    sound: (k) => ctx.sound.gym(k),
    spaPeople: () => [...store.peers.values()].filter((p) => p.id !== store.you && store.onMyFloor(p)).map((p) => ({ x: p.x, z: p.z })),
    ambience: (level) => ctx.sound.gymSpa(level),
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
  const all = [casino, gym, hall, soccer] as const;

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
    setPlace: () => all.forEach((p) => p.setPlace(store.floor === placeOf(p))),
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
  };
}

/** The floor id each place is. */
function placeOf(p: CasinoPlace | GymPlace | HallPlace | SoccerPlace): string {
  return p instanceof CasinoPlace ? CASINO : p instanceof GymPlace ? GYM : p instanceof HallPlace ? HALL : SOCCER;
}

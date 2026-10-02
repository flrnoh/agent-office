/**
 * Office sounds, synthesized with Web Audio so there are no audio files to ship: the room's air and a
 * humming fridge, workers typing while they work, footsteps, the coffee machine, birds outside the
 * windows by day and crickets at night, rain and thunder, the odd rustle, the gong, the dog
 * barking, and the dings when a worker needs you. And the lounge jukebox, whose tunes are in music.ts,
 * and up on the roof, the wind, the city far below and the DJ's drum and bass (../dnb.ts).
 *
 * Everything goes through one master gain that Settings turns down or mutes. Voice chat doesn't, and
 * the jukebox has a volume of its own.
 *
 * OfficeSound is all the rest of the office sees. What every sound shares (the context, the buses,
 * where your ears are, what runs every frame) is AudioCore in core.ts; each sound is a recipe in a
 * file of its own, beside this one (weather.ts, steps.ts and so on) or in its feature's folder
 * (features/golf/sound.ts, features/dog/sound.ts and so on), and this class only hands them the core.
 */
import type { GongWhy } from '../../shared/protocol';
import type { CarKind } from '../../shared/garage'; // flrnoh fork
import type { RaceEvent } from '../../shared/racing'; // flrnoh fork
import { birdsong, Fridge, nightCrickets, startRoomTone, startWind } from './ambience';
import { ding } from './alerts';
import { arcade } from '../features/cabinet/sound';
import { ball, type BallSound } from '../features/basketball/sound';
import { Dj, hiccup, pour } from '../features/bar/sound';
import { carDoor, crash, honk, Motors, type Engine } from '../features/cars/sound';
import { bonk, hatch, poleLanding, rung, slide, twirl } from '../features/climbing/sound';
import { coffee } from '../features/coffee/sound';
import { AudioCore, type Hall, type Listener } from './core';
import { bark, yip } from '../features/dog/sound';
import { cellDoor, thud } from '../features/workers/sound';
import { golf, type GolfSound } from '../features/golf/sound';
import { gong } from '../features/gong/sound';
import { Jukebox, type JukeboxPlay } from '../features/jukebox/sound';
import { needsYou } from '../features/needsyou/sound';
import type { Pos } from './places';
import { Footsteps, pageTurn, paper } from './steps';
import { toss, type TossSound } from '../features/bargames/sound';
import { fidgeting, Typing } from './typing';
import { Rain, thunder } from './weather';
// flrnoh fork (see FORK.md): the fork's own sounds, a recipe file each.
import { bulliHorn } from './bulli';
import { beach, Outboards, type BeachSound, type Outboard } from '../features/beach/sound';
import { baumarktSound, ForkliftHum, type BaumarktSound } from '../features/baumarkt/sound';
import { kino, type KinoSound } from '../features/kino/sound'; // fork: the cinema
import { Headphones, shopSound, type ShopSound } from '../features/shops/sound';
import { rideSound, type RideSound } from '../features/ride/sound'; // fork: bikes, pets, laundry
import { bungee, BungeeWind } from './bungee';
import { casino, type CasinoSound } from './casino';
import { doorbell } from './doorbell';
import { fridgeDoor, opener } from './fridge';
import { gym, gymAt, GymSpa, type GymMachineSound, type GymSound } from './gym';
import { padelHall, type PadelHallSound } from './hall';
import { padel, type PadelSound } from './padel';
import { passerbyChat, passerbyStep } from './passersby';
import { rig } from './rig';
import { djSetVolume, tvVolume } from './screens';
import { soccer, type SoccerSound } from './soccer';
import { SoccerMurmur, soccerCrowd, type SoccerCrowdSound } from './soccercrowd';
import { tableGame, type TableGameSound } from './tablegames';
import { StationLoops, tankstelle, type StationNoise, type TankSound } from '../features/tankstelle/sound';
import { BusEngines, busDoorHiss } from '../features/citybus/sound'; // fork: the city bus
import { CitySound, type CityScene } from './city'; // fork: the sounds of the city
import { bells, siren, type SirenPass } from './citybells';

// What the rest of the client imports from here.
export type { Hall, Listener } from './core';
export type { Pos } from './places';
export type { JukeboxPlay } from '../features/jukebox/sound';
export type { Engine } from '../features/cars/sound';

export class OfficeSound {
  private readonly a: AudioCore = new AudioCore({ start: (ctx) => this.start(ctx), touched: () => this.music.touched() });
  private readonly music = new Jukebox(
    this.a,
    (text) => this.onMusicError?.(text),
    () => this.onMusicBlocked?.(), // fork
  );
  private readonly dj = new Dj(this.a);
  private readonly typing = new Typing(this.a);
  private readonly feet = new Footsteps(this.a);
  private readonly motors = new Motors(this.a);
  private readonly fridge = new Fridge(this.a);
  private readonly rain = new Rain(this.a);
  private readonly birds = birdsong(this.a);
  private readonly crickets = nightCrickets(this.a);
  private readonly fidgets = fidgeting(this.a, this.typing);
  private readonly spa = new GymSpa(this.a); // fork
  private readonly bungeeAir = new BungeeWind(this.a); // fork
  private readonly outboards = new Outboards(this.a); // fork
  private readonly forkliftHum = new ForkliftHum(this.a); // fork
  private readonly headset = new Headphones(this.a); // fork
  private readonly station = new StationLoops(this.a); // fork
  private readonly busEngines = new BusEngines(this.a); // fork: the city bus
  private readonly city = new CitySound(this.a); // fork
  /** A stream that won't play here. */
  onMusicError?: (text: string) => void;
  /** Fork: a stream the browser won't start before you click (autoplay rules). */
  onMusicBlocked?: () => void;
  /** How many of each sound have played, for quick checks from the console. */
  readonly played: Record<string, number> = this.a.played;

  constructor() {
    // What the room does every frame, in this order (it's the order the random numbers are drawn in).
    this.a.every((now) => this.music.hearJukebox(now));
    this.a.every((now) => this.typing.scheduleTyping(now));
    this.a.every((now) => this.fridge.tickFridge(now));
    this.a.every((now) => this.birds.tick(now));
    this.a.every((now) => this.crickets.tick(now));
    this.a.every((now) => this.rain.tickRain(now));
    this.a.every((now) => this.fidgets.tick(now));
    this.a.every((now) => this.city.tick(now)); // fork
  }

  /** Audio has just started (see AudioCore.unlock): the jukebox and the DJ join the graph, and the room starts up. */
  private start(ctx: AudioContext) {
    this.music.connect(ctx);
    this.dj.connect(this.music.musicBus);
    this.a.applyVolume();
    this.music.applyMusicVolume();
    this.music.applyJukebox();
    this.a.applyVisibility();
    startRoomTone(this.a);
    this.fridge.startFridge();
    startWind(this.a);
    this.a.applyOutdoors();
    this.dj.applyDj();
    const now = ctx.currentTime;
    this.birds.start(now);
    this.crickets.start(now);
    this.fidgets.start(now);
  }

  // ---- The room and you ---------------------------------------------------------------------------

  /** Volume is 0–1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.a.setVolume(volume, muted);
  }

  /** The weather outside (see world/sky.ts), every frame. */
  setWeather(rain: number, night: number) {
    this.a.setWeather(rain, night);
  }

  /** Output level (RMS) right now, for headless checks. */
  level(): number {
    return this.a.level();
  }

  /** The jukebox's level (RMS) where you stand, after your music volume. A stream doesn't show here. */
  musicLevel(): number {
    return this.music.musicLevel();
  }

  get state(): AudioContextState | 'locked' {
    return this.a.state;
  }

  /** How many rows the floor's back office is built out: in there you're indoors too. */
  get wing(): number {
    return this.a.wing;
  }

  set wing(level: number) {
    this.a.wing = level;
  }

  /** Moves your ears and schedules whatever the room does next. */
  update(l: Listener) {
    this.a.update(l);
  }

  /** On a map of its own, `hall` (see Hall); null back in the office. */
  setHall(hall: Hall | null) {
    this.a.hall = hall;
  }

  /** Up on the roof (true), or inside on a floor: the office's hum gives way to the wind and the city. */
  setOutdoors(on: boolean) {
    this.a.setOutdoors(on);
  }

  // ---- Workers, footsteps and paper (typing.ts, steps.ts) ---------------------------------------

  /** The worker at desk (x, z) types while `on`. */
  setTyping(id: string, x: number, z: number, on: boolean) {
    this.typing.setTyping(id, x, z, on);
  }

  removeTypist(id: string) {
    this.typing.removeTypist(id);
  }

  /** One of your own footsteps, with your feet at `feet`: `pace` is 0 at a walk, 1 at a run. */
  step(feet: Pos, pace = 0) {
    this.feet.step(feet, pace);
  }

  /** Landing a jump, `hard` from 0 (a hop) to 1 (off the loft). */
  land(feet: Pos, hard = 0.5) {
    this.feet.land(feet, hard);
  }

  paper() {
    paper(this.a);
  }

  pageTurn() {
    pageTurn(this.a);
  }

  /** Someone else's footstep, on the office floor unless `y` says where else. */
  stepAt(x: number, z: number, y = 0, pace = 0) {
    this.feet.stepAt({ x, y, z }, pace);
  }

  // ---- The ladder, the fire poles and the dungeon (features/climbing, features/workers) ------------

  rung(soft = false) {
    rung(this.a, soft);
  }

  hatch(at: Pos, open: boolean) {
    hatch(this.a, at, open);
  }

  cellDoor(at: Pos, open: boolean) {
    cellDoor(this.a, at, open);
  }

  thud(at: Pos) {
    thud(this.a, at);
  }

  bonk() {
    bonk(this.a);
  }

  slide(seconds = 1.6) {
    slide(this.a, seconds);
  }

  twirl() {
    twirl(this.a);
  }

  poleLanding(speed: number, at?: Pos) {
    poleLanding(this.a, speed, at);
  }

  // ---- Games (features/golf, bargames, basketball and cabinet) -------------------------------------

  golf(kind: GolfSound, at?: Pos, speed = 5) {
    golf(this.a, kind, at, speed);
  }

  toss(kind: TossSound, at: Pos) {
    toss(this.a, kind, at);
  }

  ball(kind: BallSound, at: Pos, speed: number) {
    ball(this.a, kind, at, speed);
  }

  arcade(kind: 'land' | 'clear' | 'over', lines = 1) {
    arcade(this.a, kind, lines);
  }

  // ---- The cars in the garage (features/cars) -----------------------------------------------------

  setEngines(running: Engine[]) {
    this.motors.setEngines(running);
  }

  /** A car's horn: a Lambo's higher than a Ferrari's; fork: the Bulli's is its own (bulli.ts). */
  honk(at: Pos, kind: CarKind) {
    if (kind === 'bulli') return bulliHorn(this.a, at); // flrnoh fork
    honk(this.a, at, kind === 'lambo');
  }

  carDoor(at: Pos) {
    carDoor(this.a, at);
  }

  crash(at: Pos, speed: number) {
    crash(this.a, at, speed);
  }

  // ---- The kitchen, the dog, the weather, the gong, the dings --------------------------------------

  coffee() {
    coffee(this.a);
  }

  bark(x: number, z: number, times: number) {
    bark(this.a, x, z, times);
  }

  yip(x: number, z: number) {
    yip(this.a, x, z);
  }

  thunder(delay: number, loud: number) {
    thunder(this.a, delay, loud);
  }

  gong(why: GongWhy) {
    gong(this.a, why);
  }

  ding(kind: 'done' | 'needs_input') {
    ding(this.a, kind);
  }

  /** The alarm for a worker that needs you, or (`again`) the soft reminder while it still does. */
  needsYou(again = false) {
    needsYou(this.a, again);
  }

  // ---- The rooftop bar (features/bar) -------------------------------------------------------------

  /** The DJ's set on the roof, `clock` saying how far into it it is (see djTime); null stops it. */
  setDj(clock: (() => number) | null) {
    this.dj.setDj(clock);
  }

  horn() {
    this.dj.horn();
  }

  pour(at: Pos) {
    pour(this.a, at);
  }

  hiccup() {
    hiccup(this.a);
  }

  // ---- The jukebox (features/jukebox) -------------------------------------------------------------

  /** What the jukebox on your floor plays, or null for nothing. It starts once the browser allows audio. */
  setJukebox(play: JukeboxPlay | null) {
    this.music.setJukebox(play);
  }

  /** Your own jukebox volume, 0–1, apart from the office sounds'. */
  setMusicVolume(volume: number, muted: boolean) {
    this.music.setMusicVolume(volume, muted);
  }

  /** 1 on each beat of the tune, falling to 0 before the next, for the jukebox's lights. */
  beat(): number {
    return this.music.beat();
  }

  // ---- flrnoh fork (see FORK.md): the fork's own sounds, each in a file of its own beside this one ----

  /** Your own speaker volume, 0–1, apart from the jukebox's. Muting the music mutes them too (speakers.ts). */
  setSpeakerVolume(volume: number, muted: boolean) {
    this.music.setSpeakerVolume(volume, muted);
  }

  /** Your floor's speakers: `wing` is how far its back office is built out, `on` whether they're switched on there; null where there are none. */
  setSpeakerRoom(room: { wing: number; on: boolean } | null) {
    this.music.speakers.room = room;
  }

  /** The speakers' level where you stand (0–1, before your speaker volume), for quick checks. */
  get speakerLevel(): number {
    return this.music.speakers.level;
  }

  /** How loud a DJ set in an embedded player (client/djset.ts) is where you stand, 0–1 (screens.ts). */
  djSetVolume(): number {
    return djSetVolume(this.a, this.music.musicGain());
  }

  /** How loud a stream on the office TV (client/tv.ts) at `at` is where you stand, 0–1 (screens.ts). */
  tvVolume(at: Pos): number {
    return tvVolume(this.a, at, this.music.musicGain());
  }

  bungee(kind: 'count' | 'go' | 'twang', at?: Pos) {
    bungee(this.a, kind, at);
  }

  /** The wind past your ears on the rope: 0 (still) to 1 (flat out). */
  bungeeWind(level: number) {
    this.bungeeAir.set(level);
  }

  doorbell() {
    doorbell(this.a);
  }

  /** The city's passers-by close to you: a footstep, or two of them talking (passersby.ts). */
  passerby(kind: 'step' | 'chat', at: Pos) {
    (kind === 'step' ? passerbyStep : passerbyChat)(this.a, at);
  }

  /** A day at the beach: splashes, strokes, the kiosk's bell and fryer, a gull, the boats' horns (features/beach/sound.ts). */
  beach(kind: BeachSound, at: Pos, strength = 1) {
    beach(this.a, kind, at, strength);
  }

  /** The cinema: the popcorn machine, the counter's bell, the gong before a film (features/kino/sound.ts). */
  kino(kind: KinoSound, at: Pos) {
    kino(this.a, kind, at);
  }

  /** The city's shops: the door's bell, the till, scissors, the tattoo machine, the toys (features/shops/sound.ts). */
  shop(kind: ShopSound, at: Pos) {
    shopSound(this.a, kind, at);
  }

  /** Bikes, pets and laundry: a bell, a budgie, a washing machine (features/ride/sound.ts). */
  ride(kind: RideSound, at: Pos) {
    rideSound(this.a, kind, at);
  }

  /** A record on the record shop's headphones, for you alone; null takes them off. */
  headphones(rec: { tune: string; seed: number } | null) {
    this.headset.play(rec);
  }

  /** The boats' outboards running now, every frame (an empty list lets them die away). */
  setOutboards(list: Outboard[]) {
    this.outboards.set(list);
  }

  /** The Baumarkt: tools, the paint shaker, the forklift's beep and horn, the scanner, the gate, the PA (features/baumarkt/sound.ts). */
  baumarkt(kind: BaumarktSound, at: Pos, strength = 1) {
    baumarktSound(this.a, kind, at, strength);
  }

  /** The forklift's motor and hydraulics, every frame (null: off). */
  setForklift(s: Parameters<ForkliftHum['set']>[0]) {
    this.forkliftHum.set(s);
  }

  /** The petrol station: the nozzle, the pump's cut-off, the shop's till, the wash's chime (features/tankstelle/sound.ts). */
  tankstelle(kind: TankSound, at: Pos) {
    tankstelle(this.a, kind, at);
  }

  /** The station's pumps and car wash running now, every frame. */
  setStation(noise: StationNoise) {
    this.station.set(noise);
  }

  /** The city buses' engines in earshot, every frame, and their doors' hiss (features/citybus/sound.ts). */
  setBuses(list: Parameters<BusEngines['set']>[0]) {
    this.busEngines.set(list);
  }
  busDoors(at: Pos, opening: boolean) {
    busDoorHiss(this.a, at, opening);
  }

  casino(kind: CasinoSound) {
    casino(this.a, kind);
  }

  gym(kind: GymSound) {
    gym(this.a, kind);
  }

  /** The gym's spa, every frame: 0 outside it, up to 1 in the sauna or the steam room. */
  gymSpa(level: number) {
    this.spa.set(level);
  }

  gymAt(kind: GymMachineSound, at: Pos) {
    gymAt(this.a, kind, at);
  }

  padelHall(kind: PadelHallSound) {
    padelHall(this.a, kind);
  }

  rig(kind: RaceEvent) {
    rig(this.a, kind);
  }

  fridgeDoor(open: boolean) {
    fridgeDoor(this.a, open);
  }

  opener(kind: 'bottle' | 'can' | 'bite') {
    opener(this.a, kind);
  }

  tableGame(kind: TableGameSound, at: Pos) {
    tableGame(this.a, kind, at);
  }

  padel(kind: PadelSound, at: Pos) {
    padel(this.a, kind, at);
  }

  soccer(kind: SoccerSound, at: Pos, strength = 1) {
    soccer(this.a, kind, at, strength);
  }

  private readonly soccerMurmur = new SoccerMurmur(this.a);
  /**
   * The soccer hall's crowd, every frame while you're in there: `level` 0..1 how full the stands are,
   * `intensity` 0..1 how exciting it is on the pitch right now. It fades away by itself without a call.
   */
  setSoccerCrowd(level: number, intensity: number) {
    this.soccerMurmur.set(level, intensity);
  }

  /** The soccer hall's crowd and stadium: the horn, the roar of a goal, the "oooh" of a near miss, applause, a chant. */
  soccerCrowd(kind: SoccerCrowdSound, strength = 1) {
    soccerCrowd(this.a, kind, strength);
  }

  /** The city round the office, every frame (sound/city.ts): where the street is, the cars, the setting; null: quiet. */
  setCity(scene: CityScene | null) {
    this.city.set(scene);
  }

  /** What the city's loops came to where you stand, for quick checks. */
  get cityLevels() {
    return this.city.probe();
  }

  /** The church bell at `at` strikes the hour (sound/citybells.ts). */
  cityBell(at: Pos, strikes: number) {
    if (this.city.out) bells(this.a, this.city.out, at, strikes);
  }

  /** A siren going by far off (sound/citybells.ts). */
  citySiren(pass: SirenPass) {
    if (this.city.out) siren(this.a, this.city.out, pass);
  }
}

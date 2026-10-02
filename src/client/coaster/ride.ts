import * as THREE from 'three';
import { NO_COASTER, SEATS, STATION, carOffset, seatCar, seatSide, SEAT_SIDE, type CoasterState } from '../../shared/coaster';
import { HEART, routeStoreys } from '../../shared/coaster-route';
import { coasterSupports } from '../../shared/coaster-supports';
import { DS, coasterTrack, poseAt, sAtTime, speedAt, type CoasterTrack, type TrackPose } from '../../shared/coaster-track';
import type { ClientMsg, FloorInfo, ServerMsg } from '../../shared/protocol';
import type { Look } from '../../shared/avatar';
import type { PlayerController } from '../player';
import type { CoasterFrame, CoasterSoundKind } from '../sound/coaster';
import type { NightParts } from '../world/outside';
import type { World } from '../world/world';
import type { Collider, Interactable } from '../world/types';
import { buildTrack, type TrackView } from '../world/coaster/track';
import { buildSupports, type SupportsView } from '../world/coaster/supports';
import { buildTrain, type TrainView } from '../world/coaster/train';
import { buildStation, type StationView } from '../world/coaster/station';
import { Riders } from './riders';
import { CoasterTunnel } from './tunnel';
import { openPhoto, showOnMonitor, takePhoto, type RidePhoto } from './photo';

// DER BRECHER, the roller coaster round the office tower (flrnoh fork, see FORK.md "Der Brecher"): the
// page's side. The track, its supports, the station and the train are one group in the scene, drawn in
// the roof's frame and lifted to wherever the roof is over the floor you're on (so the street, every
// floor's windows and balconies, and the ground floor's room, which the tube runs through, all see it),
// hidden in the places across the street. The train is where its clock says (shared/coaster-track.ts):
// at the station till it goes, then round from the moment it went. In it, a figure for every rider.
//
// Riding (you're in a seat): your body waits on the platform (held there, so a reload finds you there)
// and your eyes are in your seat: free to look round with the mouse, shaken a little, pressed down in
// the dips and lifted on the hills, the view widening as it picks up speed; through the ground floor
// the floor's own room is borrowed (coaster/tunnel.ts). H (or Space) puts your hands up for everyone to
// see. Off only back in the station. At the bottom of the first drop a camera flashes: every page up on
// the roof takes the picture (coaster/photo.ts) and puts it on the station's monitor.

export interface CoasterDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  player: PlayerController;
  me: THREE.Object3D;
  night: NightParts;
  you(): string;
  officeNow(): number;
  /** The roof's deck over your floor (0 up on the roof), or null where the coaster isn't to be seen. */
  lift(): number | null;
  upTop(): boolean;
  /** How many storeys the building has now. */
  storeys(): number;
  /** The roof, once it's built: the station's colliders and what to use go into it. */
  roof(): { colliders: Collider[]; interactables: Interactable[]; pickables: THREE.Object3D[] } | null;
  bodyOf(id: string): THREE.Object3D | undefined;
  lookOf(id: string): Look | undefined;
  noOutline(o: THREE.Object3D): void;
  world(): World;
  bottom(): FloorInfo | undefined;
  send(msg: ClientMsg): void;
  toast(text: string, level?: 'info' | 'warn'): void;
  firstPerson(): boolean;
  dark(): number;
  reduceMotion(): boolean;
  sound: { coaster(kind: CoasterSoundKind, at?: { x: number; y: number; z: number }, pitch?: number): void; setCoaster(f: CoasterFrame | null): void; update(l: { x: number; y: number; z: number; fx: number; fz: number }): void };
}

interface Built {
  storeys: number;
  track: CoasterTrack;
  view: TrackView;
  supports: SupportsView;
  /** Where the photo's taken from, of what, and when the train's middle gets there. */
  photo: { from: THREE.Vector3; to: THREE.Vector3; s: number };
  /** Where the riders scream: down the drop, through the loop, in the tube. */
  screams: number[];
}

const EYE = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0);
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** A number 0..1 from someone's id, for their scream's pitch. */
const hash01 = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

export class CoasterRide {
  state: CoasterState = { ...NO_COASTER };
  readonly group = new THREE.Group();
  private built: Built | null = null;
  private train: TrainView;
  private riders: Riders;
  readonly station: StationView;
  private tunnel: CoasterTunnel;
  private flash: THREE.Sprite;
  private flashAt = -1;
  private attached = false;
  /** Your seat while you're in, and the hold keeping your body on the platform. */
  private seat = -1;
  private hold: ((dt: number) => void) | null = null;
  private yaw0 = 0;
  private lastS = 0;
  private lastRide = -1;
  private lastPhase: CoasterState['phase'] = 'load';
  private lastBeep = -1;
  private lastAt = 0;
  private fovKick = 0;
  private squash = 0;
  private shakeT = 0;
  private photo: RidePhoto | null = null;
  private screen: HTMLDivElement | null = null;
  private pose: TrackPose = { x: 0, y: 0, z: 0, t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0] };
  private lastBoard = 0;

  constructor(private d: CoasterDeps) {
    this.group.name = 'der-brecher';
    this.group.visible = false;
    d.scene.add(this.group);
    this.train = buildTrain(d.night);
    this.group.add(this.train.group);
    this.riders = new Riders(this.train.seats, { lookOf: d.lookOf, noOutline: d.noOutline });
    this.station = buildStation(d.night);
    this.group.add(this.station.group);
    this.tunnel = new CoasterTunnel({ world: d.world, bottom: d.bottom });
    const flashMat = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.scale.setScalar(6);
    this.flash.visible = false;
    this.group.add(this.flash);
    d.noOutline(this.group);
  }

  /** You're in the train (in the station, or riding). */
  get riding(): boolean {
    return this.seat >= 0;
  }

  /** Out on the ride (not just sitting in the station). */
  get out(): boolean {
    return this.seat >= 0 && this.state.phase === 'ride';
  }

  onMessage(msg: ServerMsg) {
    if (msg.t === 'coaster') this.setState(msg.state);
    else if (msg.t === 'welcome' || msg.t === 'floor.enter') this.setState(msg.coaster ?? { ...NO_COASTER });
  }

  private setState(s: CoasterState) {
    const was = this.state;
    this.state = s;
    if (s.halted && s.halted !== was.halted && was.phase === 'ride') this.d.toast('🎢 Der Turm hat sich verändert: DER BRECHER ist sicher zurück in der Station');
    if (s.phase !== 'ride' && was.phase === 'ride') this.tunnel.undress();
    this.station.setLeaders(s.leaders, s.rides);
  }

  /**
   * The track for the building as it is, built when that changes. A ride's laid for the height it went
   * at, which is the building's as long as it's out (else the office brings it straight back: see update).
   */
  private ensure(): Built {
    const n = this.d.storeys();
    const b = this.built;
    if (b && b.storeys === routeStoreys(n)) return b;
    if (b) {
      this.group.remove(b.view.group, b.supports.group);
      b.view.dispose();
      b.supports.dispose();
    }
    const track = coasterTrack(n);
    const view = buildTrack(track);
    const supports = buildSupports(coasterSupports(track));
    this.group.add(view.group, supports.group);
    this.d.noOutline(view.group);
    // The photo: from the camera by the U-turn, as the front car comes at it.
    const at = poseAt(track, track.marks.photo);
    const from = new THREE.Vector3(-15, at.y + 2.6, 19.75);
    let s = track.marks.photo;
    for (let k = track.marks.photo - 6; k < track.marks.photo + 14; k += 0.25) if (Math.abs(poseAt(track, k + carOffset(0)).x - -9.6) < Math.abs(poseAt(track, s + carOffset(0)).x - -9.6)) s = k;
    const mid = poseAt(track, s + carOffset(1));
    const to = new THREE.Vector3(mid.x, mid.y + 0.4, mid.z);
    const screams = [track.marks.dropFrom + 6, track.marks.loop + 14, track.marks.tunnel + 6];
    this.built = { storeys: track.storeys, track, view, supports, photo: { from, to, s }, screams };
    this.flash.position.copy(from);
    return this.built;
  }

  /** E at the station: in (anywhere free), or out again before it goes. */
  use(target: Interactable, key: string) {
    if (key !== 'E') return;
    if (target.kind === 'coasterphoto') return openPhoto(this.photo, this.state.leaders, this.state.rides);
    if (target.kind !== 'coaster') return;
    if (this.seat >= 0) {
      if (this.state.phase !== 'ride') this.d.send({ t: 'coaster.leave' });
      return;
    }
    if (this.state.phase === 'ride') return this.d.toast(`🎢 Der Zug ist unterwegs: zurück in ${Math.ceil(this.left())} s`, 'warn');
    if (performance.now() - this.lastBoard < 800) return;
    this.lastBoard = performance.now();
    this.d.send({ t: 'coaster.board' });
  }

  /** Seconds till the train's back in the station. */
  private left(): number {
    const b = this.built ?? this.ensure();
    return Math.max(0, b.track.duration - (this.d.officeNow() - this.state.at) / 1000);
  }

  /** The hint at the station. */
  hint(title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement, kind: string): { k: string; parts: (HTMLElement | string)[] } {
    if (kind === 'coasterphoto') return { k: `photo|${this.photo?.ride}`, parts: [title('📸 Fahrtfoto & Bestenliste'), aside(this.photo ? `Fahrt #${this.photo.ride}` : 'noch kein Foto'), key('E', 'Ansehen')] };
    const s = this.state;
    const free = s.seats.filter((x) => !x).length;
    if (this.seat >= 0 && s.phase !== 'ride') return { k: `in|${s.phase}`, parts: [title('🎢 DER BRECHER'), aside(s.phase === 'count' ? `Abfahrt in ${this.countdown()} s` : 'gleich geht’s los'), key('E', 'Aussteigen')] };
    if (s.phase === 'ride') return { k: `out|${Math.ceil(this.left())}`, parts: [title('🎢 DER BRECHER'), aside(`unterwegs · zurück in ${Math.ceil(this.left())} s`)] };
    if (!free) return { k: 'full', parts: [title('🎢 DER BRECHER'), aside('voll: der nächste Zug')] };
    const about = s.phase === 'count' ? `Abfahrt in ${this.countdown()} s · ${free} frei` : `${free} Plätze frei · ${s.rides} Fahrten bisher`;
    return { k: `free|${about}`, parts: [title('🎢 DER BRECHER'), aside(about), key('E', 'Einsteigen')] };
  }

  private countdown(): number {
    return Math.max(0, Math.ceil((this.state.at - this.d.officeNow()) / 1000));
  }

  /** Keys while you're in the train: H or Space your hands up (and down), E (in the station) out; the rest held off. */
  key(e: KeyboardEvent): boolean {
    if (this.seat < 0) return false;
    if (e.code === 'KeyH' || e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && this.state.phase === 'ride') this.d.send({ t: 'coaster.hands', up: !this.state.seats[this.seat]?.hands });
      return true;
    }
    if (e.code === 'KeyE') {
      if (!e.repeat && this.state.phase !== 'ride') this.d.send({ t: 'coaster.leave' });
      return true;
    }
    return /^Key[A-Z]$/.test(e.code) && !['KeyM', 'KeyT', 'KeyV', 'KeyJ'].includes(e.code) ? true : /^(?:Digit|Numpad)\d$/.test(e.code);
  }

  /** The field of view as the ride has it: wider as it picks up speed. */
  fov(f: number): number {
    return this.seat >= 0 ? f + this.fovKick - this.squash * 3 : f;
  }

  /** Something else wants you (a trip, the map changing): out of the train, if it's still in the station. */
  stop() {
    if (this.seat >= 0 && this.state.phase !== 'ride') this.d.send({ t: 'coaster.leave' });
  }

  /** Each frame, after everyone's been moved. */
  update(dt: number, t: number) {
    const lift = this.d.lift();
    const up = this.d.upTop();
    this.attach();
    if (lift === null) {
      this.group.visible = false;
      this.d.sound.setCoaster(null);
      if (this.seat >= 0) this.getOut(false);
      return;
    }
    const b = this.ensure();
    const tr = b.track;
    this.group.visible = true;
    this.group.position.y = lift;
    const s0 = this.state;
    const now = this.d.officeNow();
    const since = (now - s0.at) / 1000;
    // A floor came or went while it's out: the office brings it straight back (server/coaster.ts); till
    // it says so, it waits in the station here rather than running round a track that's no longer the tower's.
    const fits = s0.phase !== 'ride' || routeStoreys(this.d.storeys()) === s0.storeys;
    const going = s0.phase === 'ride' && fits && since > 0 && since < tr.duration;
    const s = going ? sAtTime(tr, since) : 0;
    const v = going ? speedAt(tr, s) : 0;
    const bars = s0.phase === 'ride' ? (since < tr.duration - 1.2 ? 1 : 1 - smooth((since - tr.duration + 1.2) / 1.2)) : s0.phase === 'count' ? smooth(1 - (s0.at - now - 300) / 1500) : 0;
    this.train.place(tr, s, bars);
    b.view.update(t, this.d.dark(), dt);
    this.station.update(t, this.d.dark());

    // Who's in, and is it you.
    const me = this.d.you();
    const mine = s0.seats.findIndex((r) => r?.id === me);
    if (mine >= 0 && up && this.seat < 0) this.getIn(mine);
    else if ((mine < 0 || !up) && this.seat >= 0) this.getOut(up);
    if (mine >= 0) this.seat = mine;
    const firstPerson = this.d.firstPerson();
    this.riders.update(s0.seats, this.seat >= 0 && firstPerson ? me : null, dt, t);
    // Up on the roof, the riders' own bodies wait on the platform: out of sight.
    if (up) for (const r of s0.seats) if (r && r.id !== me) this.d.bodyOf(r.id)?.traverse((o) => (o.visible = false));

    this.status(tr, s, v, now);
    this.events(b, s, v, going, now, lift, up);
    // What it sounds like: from the train, or riding, in your ears.
    const p = poseAt(tr, s, this.pose);
    const chain = tr.zones.some((z) => z.kind === 'chain' && s >= z.from && s < z.to);
    const tube = tr.zones.some((z) => z.kind === 'tunnel' && s >= z.from && s < z.to);
    this.d.sound.setCoaster(going ? { riding: this.out, at: { x: p.x, y: p.y + lift, z: p.z }, speed: v, chain, tube } : null);
    if (this.seat >= 0) this.ride(tr, s, v, dt, firstPerson, up, lift);
  }

  /** The station's colliders and what to use there go into the roof once it's built. */
  private attach() {
    if (this.attached) return;
    const roof = this.d.roof();
    if (!roof) return;
    roof.colliders.push(...this.station.colliders);
    roof.interactables.push(...this.station.interactables);
    roof.pickables.push(this.station.group, this.train.group);
    this.train.group.userData.interact = this.station.interactables[0];
    this.attached = true;
  }

  /** The board over the track: what the train's doing. */
  private status(tr: CoasterTrack, s: number, v: number, now: number) {
    const st = this.state;
    const free = st.seats.filter((x) => !x).length;
    if (st.phase === 'count') this.station.setStatus(`Abfahrt in ${Math.max(0, Math.ceil((st.at - now) / 1000))}`, `${SEATS - free} an Bord · ${free} frei · E zum Einsteigen`, '#ffd166');
    else if (st.phase === 'ride' && s > 0) this.station.setStatus(`${Math.round(v * 3.6)} km/h`, `Fahrt #${st.ride} · zurück in ${Math.ceil(this.left())} s`, '#f72585');
    else this.station.setStatus('Einsteigen!', `${free} Plätze frei · ${st.rides} Fahrten bisher`, '#06d6a0');
    void tr;
  }

  /** The bell as it goes, the countdown's beeps, the bars, screams, the photo's flash, the brakes. */
  private events(b: Built, s: number, v: number, going: boolean, now: number, lift: number, up: boolean) {
    const st = this.state;
    const tr = b.track;
    const stationAt = { x: STATION.stopX, y: lift + 1.2, z: STATION.trackZ };
    if (st.phase !== this.lastPhase || st.at !== this.lastAt) {
      if (st.phase === 'ride' && this.lastPhase === 'count' && up) this.d.sound.coaster('bell', this.out ? undefined : stationAt);
      if (st.phase === 'load' && this.lastPhase === 'ride' && up) this.d.sound.coaster('bars', this.riding ? undefined : stationAt);
      this.lastPhase = st.phase;
      this.lastAt = st.at;
    }
    // The last three seconds, for whoever's in.
    if (st.phase === 'count' && this.seat >= 0) {
      const left = Math.ceil((st.at - now) / 1000);
      if (left !== this.lastBeep && left <= 3 && left >= 1) {
        this.lastBeep = left;
        this.d.sound.coaster('count');
        if (left === 2) this.d.sound.coaster('bars');
      }
    } else this.lastBeep = -1;
    if (st.ride !== this.lastRide) {
      this.lastRide = st.ride;
      this.lastS = going ? s : 0;
      return;
    }
    if (!going) {
      this.lastS = 0;
      return;
    }
    const passed = (mark: number) => this.lastS < mark && s >= mark;
    const at = (q: TrackPose) => ({ x: q.x, y: q.y + lift, z: q.z });
    // Screams from the cars as they go over the drop, through the loop and into the tube (and more with hands up).
    for (const m of b.screams)
      if (passed(m))
        st.seats.forEach((r, i) => {
          if (!r) return;
          const q = poseAt(tr, s + carOffset(seatCar(i)));
          window.setTimeout(() => this.d.sound.coaster('scream', r.id === this.d.you() ? undefined : at(q), hash01(r.id + i)), 80 + hash01(r.id) * 400);
        });
    if (tr.zones.some((z) => z.kind === 'brake' && passed(z.from + 0.5))) this.d.sound.coaster('brakes', this.out ? undefined : at(poseAt(tr, s)));
    // The photo: a flash for everyone who can see it, and up on the roof the picture taken.
    if (passed(b.photo.s)) {
      this.flashAt = performance.now();
      this.d.sound.coaster('flash', this.out ? undefined : { x: b.photo.from.x, y: b.photo.from.y + lift, z: b.photo.from.z });
      if (up) this.snap(b);
      if (this.out) this.whiteout();
    }
    const f = this.flashAt < 0 ? 1 : (performance.now() - this.flashAt) / 180;
    this.flash.visible = f < 1;
    (this.flash.material as THREE.SpriteMaterial).opacity = f < 1 ? 1 - f : 0;
    this.lastS = s;
    void v;
  }

  /** The ride photo: the scene from the camera as the train passes, everyone in it shown (you too). */
  private snap(b: Built) {
    const st = this.state;
    const me = this.d.me;
    const meWas = me.visible;
    me.visible = false;
    this.riders.showAll(true, st.seats);
    this.group.updateMatrixWorld(true);
    const names = st.seats.filter((r) => r).map((r) => (r!.hands ? `🙌 ${r!.name}` : r!.name));
    this.photo = takePhoto(this.d.renderer, this.d.scene, b.photo.from, b.photo.to, { ride: st.ride, names, at: this.d.officeNow() });
    showOnMonitor(this.photo, this.station.monitor);
    me.visible = meWas;
  }

  /** The flash in your face, riding. */
  private whiteout() {
    if (!this.screen) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:29;opacity:0;transition:opacity .45s ease-out';
      document.body.appendChild(el);
      this.screen = el;
    }
    const el = this.screen;
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .5s ease-out';
      el.style.opacity = '0';
    });
  }

  /** Into seat `i`: your body held on the platform beside it, your eyes in the seat. */
  private getIn(i: number) {
    const p = this.d.player;
    this.seat = i;
    p.stopWalking();
    this.hold = () => {};
    p.rig = this.hold;
    p.pos.set(STATION.stopX + carOffset(seatCar(i)), 0, STATION.edgeZ + 0.55);
    p.vy = 0;
    p.facing = Math.PI;
    p.camYaw = this.yaw0 = 0;
    p.lookPitch = -0.05;
  }

  /** Out of the train: on your feet on the platform by your seat (unless you've left the roof meanwhile). */
  private getOut(up: boolean) {
    const p = this.d.player;
    const i = this.seat;
    this.seat = -1;
    if (p.rig === this.hold) p.rig = null;
    this.hold = null;
    this.fovKick = 0;
    this.squash = 0;
    this.tunnel.undress();
    if (up && i >= 0) {
      p.pos.set(STATION.stopX + carOffset(seatCar(i)) + (seatSide(i) < 0 ? -0.4 : 0.4), 0, STATION.edgeZ + 0.7);
      p.vy = 0;
      p.camYaw = 0;
      p.facing = Math.PI;
      p.lookPitch = -0.1;
      p.updateCamera(true);
    }
    this.d.me.visible = true;
  }

  /** Your eyes in your seat, wherever the train's got to, looking round as the mouse has it. */
  private ride(tr: CoasterTrack, s: number, v: number, dt: number, firstPerson: boolean, up: boolean, lift: number) {
    const i = this.seat;
    const cam = this.d.camera;
    const car = poseAt(tr, s + carOffset(seatCar(i)), this.pose);
    const k = Math.max(0, Math.min(tr.n - 1, Math.round((((s + carOffset(seatCar(i))) % tr.length) + tr.length) % tr.length / DS)));
    const gN = this.out ? tr.gN[k] : 1;
    // Pressed into the seat in the dips, lifted out of it on the hills; the view wider the faster it goes.
    this.squash += ((this.out ? Math.max(-1, Math.min(2.5, gN - 1)) : 0) - this.squash) * Math.min(1, dt * 6);
    this.fovKick += ((this.out ? Math.max(0, Math.min(1, (v - 7) / 10)) * 14 : 0) - this.fovKick) * Math.min(1, dt * 3);
    const side = seatSide(i) * SEAT_SIDE;
    const eyeUp = HEART - 0.75 + 1.32 - this.squash * 0.035;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(car.n[1] * car.t[2] - car.n[2] * car.t[1], car.n[2] * car.t[0] - car.n[0] * car.t[2], car.n[0] * car.t[1] - car.n[1] * car.t[0]), new THREE.Vector3(...car.n), new THREE.Vector3(...car.t));
    EYE.set(car.x + car.b[0] * side + car.n[0] * eyeUp, car.y + car.b[1] * side + car.n[1] * eyeUp + lift, car.z + car.b[2] * side + car.n[2] * eyeUp);
    const p = this.d.player;
    const yaw = THREE.MathUtils.clamp(p.camYaw - this.yaw0, -2.3, 2.3);
    const pitch = THREE.MathUtils.clamp(p.lookPitch, -1.3, 1.2);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    // Looking ahead along the track: a camera looks down its -z.
    q.multiply(new THREE.Quaternion().setFromAxisAngle(Y_UP, Math.PI + yaw));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    if (firstPerson) {
      cam.position.copy(EYE);
      cam.quaternion.copy(q);
    } else {
      // Third person: behind and over the car, looking at it.
      const back = new THREE.Vector3(...car.t).multiplyScalar(-6.5).addScaledVector(new THREE.Vector3(...car.n), 2.8);
      cam.position.set(car.x, car.y + lift, car.z).add(back.applyAxisAngle(new THREE.Vector3(...car.n), yaw));
      cam.lookAt(car.x, car.y + lift + 0.6, car.z);
    }
    // A rumble through the seat, harder the faster it goes (none for those who'd rather not).
    if (this.out && !this.d.reduceMotion()) {
      this.shakeT += dt * (18 + v * 2);
      const a = Math.min(1, v / 16) * 0.004 + Math.max(0, Math.abs(gN - 1) - 1.2) * 0.003;
      cam.rotateX(Math.sin(this.shakeT * 1.7) * a);
      cam.rotateZ(Math.sin(this.shakeT * 1.13 + 1) * a);
    }
    cam.updateMatrixWorld();
    this.d.me.visible = false;
    // Your ears go with you.
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    this.d.sound.update({ x: EYE.x, y: EYE.y, z: EYE.z, fx: dir.x, fz: dir.z });
    // Through the ground floor: its room is borrowed while your eyes are in it.
    if (up && this.out) this.tunnel.dress(this.state.typists);
    if (up && this.out) this.tunnel.update({ x: EYE.x, y: EYE.y - lift, z: EYE.z }, tr.ground, dt, performance.now() / 1000);
    else if (!this.out) this.tunnel.undress();
  }

}

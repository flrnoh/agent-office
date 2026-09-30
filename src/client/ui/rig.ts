import * as THREE from 'three';
import { MAX_SPEED, Race, type Controls, type RaceEvent, type RaceFrame } from '../../shared/racing';
import { RIG, RIG_GAME, type RigFrame } from '../../shared/rig';
import type { Net } from '../net';
import { store } from '../state';
import type { RigModel } from '../world/rig';
import { ScreenZoom } from './arcade';
import { h, openModal, toast, type Modal } from './dom';
import { H, W, paintRig, type RigScreenView } from './rigscreen';

// The racing rig in the lounge (flrnoh fork, see FORK.md). Press E there: you sit down in the bucket
// seat, the camera glides up to its TV and you race OFFICE GP (shared/racing.ts) on the arrows or
// WASD, or on a gamepad or a wheel. Everyone else on the floor sees your race on the rig's TV, and can
// press E there to watch it up close. One driver at a time; Esc (or ✕) gets you out.

/** Your race goes out to everyone watching this often (ms). */
const FRAME_MS = 100;
/** The race runs in steps this long (s), however fast the page draws. */
const STEP = 1 / 60;
/** How often (fps) the TV in the office is redrawn while someone races, near it and far off. */
const NEAR_FPS = 30;
const FAR_FPS = 4;

type Key = 'left' | 'right' | 'gas' | 'brake' | 'boost' | 'again';
const KEYS: Record<string, Key> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'boost',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  Enter: 'again',
  KeyR: 'again',
};

export interface RigHooks {
  /** Sits you down in the rig's seat: false if you can't (someone's in it). */
  sit(): boolean;
  /** Gets you up out of it. */
  stand(): void;
  /** Still in the seat. */
  seated(): boolean;
  sound(e: RaceEvent): void;
}

export class RacingRig {
  private mode: 'drive' | 'watch' | null = null;
  private modal: Modal | null = null;
  private readonly view: ScreenZoom;
  private race: Race | null = null;
  private held = new Set<Key>();
  private steer = 0;
  private acc = 0;
  private sentAt = 0;
  private sentPhase = '';
  /** Your last race's laps went in to the office. */
  private finished = false;
  /** A button on a gamepad held last time we looked, so a press counts once. */
  private padAgain = false;
  /** The last frame from whoever's racing, and when it came. */
  private heard: { frame: RigFrame; at: number } | null = null;
  private watching = '';
  /** Whose frames `heard` is. */
  private heardFrom = '';
  private readonly picture = document.createElement('canvas');
  private readonly texture = new THREE.CanvasTexture(this.picture);
  private board: HTMLCanvasElement | null = null;
  private paintedAt = 0;
  private blink = -1;
  private dirty = true;
  private wheelTurn = 0;
  private readonly at = new THREE.Vector3();
  /** How hard you're on the gas, for the engine's note. */
  private gas = 0;

  constructor(
    private readonly model: RigModel,
    private readonly net: Net,
    private readonly hooks: RigHooks,
  ) {
    this.view = new ScreenZoom(model.screen);
    this.picture.width = 512;
    this.picture.height = 288;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = model.screen.material as THREE.MeshBasicMaterial;
    mat.map = this.texture;
    mat.color.set('#ffffff');
    void document.fonts.ready.then(() => (this.dirty = true));
    store.on('rig', () => this.onState());
    store.on('rigFrame', () => this.onFrame());
    // Clicked off into another window: let go of everything.
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Anywhere between your view and the screen: your first-person hands would cover it. */
  get zoomed(): boolean {
    return this.view.zoomed;
  }

  /** Racing (or watching) up at the screen. */
  get active(): boolean {
    return !!this.modal;
  }

  /** Gets you out, if you're in (the building changed maps under you). */
  stop() {
    this.modal?.close();
  }

  /** E at the rig: get in and race, or watch whoever's at the wheel. */
  play() {
    if (this.modal || !store.floor) return;
    const d = store.rig.driver;
    if (d && d.id !== store.you) return this.open('watch');
    if (!this.hooks.sit()) return;
    this.net.send({ t: 'rig.play' });
    this.newRace();
    this.open('drive');
  }

  /** The engine's note: whoever's racing on it, and how hard. Null when nobody is. */
  engine(): { at: { x: number; y: number; z: number }; speed: number; gas: number } | null {
    const f = this.race && this.mode === 'drive' ? this.race.frame() : this.remote();
    if (!f || f.phase === 'done') return null;
    const at = { x: RIG.x, y: 0.8, z: RIG.screen.z };
    // In the garage cars' units (m/s), which is what the engine note is tuned for.
    const speed = (f.speed / MAX_SPEED) * 24;
    return { at, speed, gas: this.race && this.mode === 'drive' ? this.gas : Math.min(1, f.speed / MAX_SPEED) * 0.6 };
  }

  /** Runs your race, sends it out, keeps the screens drawn and the wheel turned, and moves the camera. */
  update(camera: THREE.PerspectiveCamera, dt: number) {
    const now = performance.now();
    if (this.mode === 'drive' && this.race) {
      if (!this.hooks.seated()) {
        // Pulled out of the seat some other way: out of the race too.
        this.modal?.close();
      } else {
        this.drive(dt, now);
      }
    }
    const f = this.mode === 'drive' && this.race ? this.race.frame() : this.remote();
    this.wheelTurn += ((f && f.phase !== 'done' ? f.steer : 0) * 1.7 - this.wheelTurn) * Math.min(1, dt * 12);
    this.model.wheel.rotation.z = -this.wheelTurn;

    const blink = Math.floor((now / 1000) * 1.6) % 2;
    if (blink !== this.blink) {
      this.blink = blink;
      this.dirty = true;
    }
    if (this.board) {
      // Up close: every frame.
      this.paint(this.board, now);
    } else if (f) {
      this.model.screen.getWorldPosition(this.at);
      const fps = camera.position.distanceTo(this.at) < 14 ? NEAR_FPS : FAR_FPS;
      if (now - this.paintedAt >= 1000 / fps) this.paint(this.picture, now);
    } else if (this.dirty) {
      this.paint(this.picture, now);
    }
    this.view.update(camera, dt, !!this.modal);
  }

  private newRace() {
    this.race = new Race();
    this.acc = 0;
    this.finished = false;
    this.sentPhase = '';
    this.sentAt = 0;
    this.held.clear();
  }

  /** What you're pressing: the keys, and any gamepad (a wheel shows up as one). */
  private controls(dt: number): Controls & { again: boolean } {
    const k = this.held;
    const want = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    this.steer += (want - this.steer) * Math.min(1, dt * 9);
    const c = { steer: this.steer, gas: k.has('gas') ? 1 : 0, brake: k.has('brake') ? 1 : 0, boost: k.has('boost'), again: k.has('again') };
    let again = false;
    for (const p of navigator.getGamepads?.() ?? []) {
      if (!p || !p.connected) continue;
      const b = (i: number) => p.buttons[i];
      const ax = p.axes[0] ?? 0;
      if (Math.abs(ax) > 0.08) c.steer = Math.max(-1, Math.min(1, ax));
      // Standard mapping: right trigger or A for gas, left trigger or B for the brake, X or a bumper for the boost, Start again.
      c.gas = Math.max(c.gas, b(7)?.value ?? 0, b(0)?.pressed ? 1 : 0);
      c.brake = Math.max(c.brake, b(6)?.value ?? 0, b(1)?.pressed ? 1 : 0);
      c.boost ||= !!(b(2)?.pressed || b(5)?.pressed || b(4)?.pressed);
      again ||= !!b(9)?.pressed;
    }
    c.again ||= again && !this.padAgain;
    this.padAgain = again;
    return c;
  }

  private drive(dt: number, now: number) {
    const race = this.race!;
    const c = this.controls(dt);
    this.gas = c.gas;
    if (race.phase === 'done' && c.again) {
      this.held.delete('again');
      this.newRace();
      return;
    }
    this.acc = Math.min(this.acc + dt, STEP * 10);
    while (this.acc >= STEP) {
      race.step(STEP, c);
      this.acc -= STEP;
    }
    for (const e of race.drain()) {
      this.hooks.sound(e);
      if (e === 'finish' && !this.finished) {
        this.finished = true;
        this.sendFrame(now);
        this.net.send({ t: 'rig.finish', result: { laps: [...race.laps] } });
      }
    }
    if (race.phase !== this.sentPhase || now - this.sentAt >= FRAME_MS) this.sendFrame(now);
  }

  private sendFrame(now: number) {
    if (!this.race) return;
    const frame = this.race.frame();
    this.sentAt = now;
    this.sentPhase = frame.phase;
    this.net.send({ t: 'rig.frame', frame });
  }

  /** Someone else's race, carried on from their last frame for the moment since it came. */
  private remote(): RaceFrame | null {
    const d = store.rig.driver;
    const heard = this.heard;
    if (!d || d.id === store.you || !heard) return null;
    const f = heard.frame;
    if (f.phase !== 'race') return f;
    const ahead = Math.min(0.25, (performance.now() - heard.at) / 1000);
    const cars = f.cars.slice();
    for (let i = 0; i < cars.length; i += 3) cars[i] += cars[i + 2] * ahead;
    return { ...f, t: f.t + ahead * 1000, dist: f.dist + f.speed * ahead, cars };
  }

  private open(mode: 'drive' | 'watch') {
    this.mode = mode;
    this.watching = mode === 'watch' ? (store.rig.driver?.name ?? '') : '';
    const board = h('canvas', { 'aria-label': mode === 'drive' ? RIG_GAME : `${this.watching} racing ${RIG_GAME}` });
    const stop = h('button.btn', { type: 'button' }, mode === 'drive' ? '✕ Get out' : '✕ Stop watching');
    const tip = mode === 'drive' ? '← → steer · ↑ gas · ↓ brake · Space boost · R restart · 🎮 works too' : `👀 Watching ${this.watching}`;
    const box = h('div.arcade.rig', { role: 'dialog', 'aria-label': RIG_GAME }, h('div.arcade-screen', {}, board), h('div.arcade-bar', {}, h('span', {}, `🏎️ ${RIG_GAME}`), h('span.tip', {}, tip), stop));
    const fit = () => {
      const { width, height } = this.view.box();
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      board.width = Math.round(width * devicePixelRatio);
      board.height = Math.round(height * devicePixelRatio);
      this.dirty = true;
    };
    const onKey = (e: KeyboardEvent) => this.key(e, true);
    const onKeyUp = (e: KeyboardEvent) => this.key(e, false);
    this.board = board;
    fit();
    window.addEventListener('resize', fit);
    if (mode === 'drive') {
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKeyUp, true);
    }
    this.modal = openModal(box, {
      backdropCloses: false,
      doing: mode === 'drive' ? `🏎️ racing ${RIG_GAME}` : undefined,
      onClose: () => {
        window.removeEventListener('resize', fit);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('keyup', onKeyUp, true);
        this.closed();
      },
    });
    this.modal.backdrop.classList.add('clear');
    stop.addEventListener('click', () => this.modal?.close());
    if (mode === 'drive') this.sendFrame(performance.now());
  }

  /** Out of the seat (or done watching): the TV goes back to the tables. */
  private closed() {
    const was = this.mode;
    this.mode = null;
    this.modal = this.board = null;
    this.watching = '';
    this.held.clear();
    this.dirty = true;
    if (was !== 'drive') return;
    this.race = null;
    this.gas = 0;
    this.net.send({ t: 'rig.leave' });
    this.hooks.stand();
  }

  private key(e: KeyboardEvent, down: boolean) {
    const k = KEYS[e.code];
    if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (!down) return void this.held.delete(k);
    if (k === 'again' && !e.repeat && this.race) {
      // R any time, Enter once the flag's down.
      if (e.code === 'KeyR' || this.race.phase === 'done') this.newRace();
      return;
    }
    this.held.add(k);
  }

  /** Who's at the wheel changed. */
  private onState() {
    const d = store.rig.driver;
    if (!d || d.id !== this.heardFrom) this.heard = null;
    this.heardFrom = d?.id ?? '';
    if (this.mode === 'drive') {
      if (d && d.id !== store.you) {
        // Someone else got in first: watch them instead.
        toast(`${d.name} got to the rig first`, 'warn');
        this.modal?.close();
        this.open('watch');
      } else if (!d) {
        // The office forgot (a dropped connection): still here.
        this.net.send({ t: 'rig.play' });
      }
    } else if (this.mode === 'watch' && (!d || d.id === store.you || d.name !== this.watching)) {
      if (!d) toast(`${this.watching} got out of the rig`);
      this.modal?.close();
    }
    this.dirty = true;
  }

  /** Someone else's race moved on. */
  private onFrame() {
    const f = store.rigFrame;
    const was = this.heard?.frame;
    this.heard = f ? { frame: f, at: performance.now() } : null;
    this.dirty = true;
    if (!f || !was || this.mode === 'drive') return;
    // Watching up close: hear the lights, the laps and the flag.
    if (this.mode !== 'watch') return;
    if (f.phase === 'race' && was.phase === 'count') this.hooks.sound('go');
    else if (f.phase === 'done' && was.phase !== 'done') this.hooks.sound('finish');
    else if (f.laps.length > was.laps.length) this.hooks.sound('lap');
  }

  /** What the screen shows: your race, someone else's, or the tables. */
  private screen(t: number): RigScreenView {
    const r = store.rig;
    const me = store.profile.name;
    if (this.mode === 'drive' && this.race) {
      const f = this.race.frame();
      const total = this.race.total;
      const ranks = f.phase === 'done' ? { race: r.scores.races.findIndex((s) => s.name === me && s.ms === total) + 1, lap: r.scores.laps.findIndex((s) => s.name === me && s.ms === this.race!.best) + 1 } : undefined;
      return { frame: f, driver: { name: me, color: r.driver?.color ?? store.profile.color }, scores: r.scores, mine: me, ranks, prompt: 'ENTER: RACE AGAIN · ESC: GET OUT', t };
    }
    const f = this.remote();
    if (r.driver && r.driver.id !== store.you) {
      return { frame: f, driver: r.driver, scores: r.scores, prompt: f ? undefined : `▶ ${r.driver.name.toUpperCase()} IS GETTING IN`, t };
    }
    return { frame: null, scores: r.scores, mine: me, prompt: 'PRESS E TO RACE', t };
  }

  private paint(canvas: HTMLCanvasElement, now: number) {
    this.dirty = false;
    this.paintedAt = now;
    const g = canvas.getContext('2d')!;
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    paintRig(g, this.screen(now / 1000));
    if (canvas === this.picture) this.texture.needsUpdate = true;
  }
}

import * as THREE from 'three';
import { FOUL_LINE_Z, LANE_X } from '../../../shared/bowling';
import { BALLS, HEAD_PIN_D, LIMITS, RELEASE_S, laneName, slideEnd, uBoard, type ThrowParams } from '../../../shared/bowling-game';
import { isTyping, type PlayerController } from '../../player';
import { $, h, modalOpen } from '../../ui/dom';
import { SURF } from './lanes3d';
import type { LanesView } from './view';

/*
 * Bowling a ball (flrnoh fork, see FORK.md "Bowling lanes"). E on your lane's approach when you're
 * up: the camera drops in behind you, looking down the lane at the arrows. A and D slide you across
 * the approach, W and S move your start up or back (too far up with too much pace and your slide
 * crosses the foul line: a foul), the mouse sets the line (a guide runs out to the arrows). Hold Space
 * (or the mouse button): the power meter runs up and down, and the mouse (or A and D) now winds in
 * the hook. Let go: four steps and a slide, the ball's laid down at the line and the camera follows
 * it to the pins. Once the pinsetter's done you're back on your mark for your next ball, or off the
 * approach when your frame's over. E or Esc steps off it.
 */

/** The power meter runs from nothing to full in this long, then back down again. */
const METER = 1.45;
/** Let go under this and you didn't mean it. */
const MIN_POWER = 0.06;
/** A and D across the approach (m/s), W and S along it. */
const SLIDE_SPEED = 0.55;
const WALK_SPEED = 1.1;
/** How much a turn of the mouse moves the line, and winds in the hook. */
const LINE_PER_RAD = 0.32;
const SPIN_PER_RAD = 1.6;
/** The ball hangs this far to the right of your body (your right hand). */
const HAND = 0.17;

export type BowlStage = 'aim' | 'charge' | 'steps' | 'watch';

export interface BowlerHooks {
  /** The ball's away: off to the office. */
  bowl(lane: number, p: ThrowParams): void;
  /** Whether you're up on `lane`. */
  up(lane: number): boolean;
  /** Your ball's weight. */
  lbs(): number;
  /** How many pins stand for your ball, which frame and ball it is. */
  where(lane: number): string;
  /** The hint bar needs drawing again. */
  changed(): void;
}

const lookAt = new THREE.Matrix4();
const want = new THREE.Vector3();
const target = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Bowler {
  lane = -1;
  private stageNow: BowlStage | null = null;
  /** Where the ball is across the lane, how far back you start, the line, the hook. */
  u = 0.12;
  back = 4.2;
  line = 0;
  spin = 0;
  private chargeAt = 0;
  private power = 0;
  private lastYaw = 0;
  private stepsAt = 0;
  private sent: ThrowParams | null = null;
  private waitUntil = 0;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private readonly panel: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly hook: HTMLElement;
  private readonly info: HTMLElement;
  private readonly title: HTMLElement;
  private shown = '';
  /** The guide on the lane: from the ball's spot out along the line to the arrows. */
  readonly guide: THREE.Mesh;

  constructor(
    private readonly player: PlayerController,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly view: () => LanesView | null,
    private readonly hooks: BowlerHooks,
  ) {
    this.fill = h('span.bowl-fill');
    this.hook = h('span.bowl-hook-dot');
    this.info = h('div.bowl-info');
    this.title = h('div.bowl-title', {}, '🎳');
    this.panel = h(
      'div.bowl-aim.panel.hidden',
      { 'aria-label': 'Bowling' },
      this.title,
      h('div.bowl-row', {}, h('span.bowl-label', {}, 'Kraft'), h('div.bowl-meter', {}, this.fill)),
      h('div.bowl-row', {}, h('span.bowl-label', {}, 'Drall'), h('div.bowl-hook', {}, h('span.bowl-hook-mid'), this.hook)),
      this.info,
    );
    $('hud').append(this.panel);
    const geo = new THREE.PlaneGeometry(0.035, 1);
    geo.translate(0, 0.5, 0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#7af7ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    this.guide = new THREE.Mesh(geo, mat);
    this.guide.visible = false;
    this.guide.renderOrder = 3;
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('mousedown', (e) => e.button === 0 && this.press(true, e));
    window.addEventListener('mouseup', (e) => e.button === 0 && this.press(false, e));
    window.addEventListener('blur', () => this.stageNow === 'charge' && this.letGo(true));
  }

  get active(): boolean {
    return this.stageNow !== null;
  }
  get stage(): BowlStage | null {
    return this.stageNow;
  }

  /** Onto the approach of `lane`, on your mark. */
  start(lane: number) {
    if (this.stageNow) return;
    this.lane = lane;
    this.stageNow = 'aim';
    const p = this.player;
    // Where you stand now, if it's on this approach; else your mark from last time.
    const u = p.pos.x - LANE_X[lane] + HAND;
    const back = p.pos.z - FOUL_LINE_Z;
    if (Math.abs(u) < LIMITS.u && back > LIMITS.backMin && back < LIMITS.backMax) {
      this.u = u;
      this.back = back;
    }
    this.u = clamp(this.u, -LIMITS.u, LIMITS.u);
    this.back = clamp(this.back, LIMITS.backMin, LIMITS.backMax);
    this.spin = 0;
    p.rig = () => this.stand();
    this.stand();
    this.lastYaw = p.camYaw;
    this.camPos.copy(this.camera.position);
    this.camQuat.copy(this.camera.quaternion);
    this.panel.classList.remove('hidden');
    this.guide.visible = true;
    this.shown = '';
    this.hooks.changed();
  }

  /** Off the approach. */
  stop() {
    if (!this.stageNow) return;
    this.stageNow = null;
    this.sent = null;
    const p = this.player;
    this.stand();
    p.rig = null;
    p.camYaw = Math.PI * 2;
    p.lookPitch = -0.12;
    this.panel.classList.add('hidden');
    this.guide.visible = false;
    this.hooks.changed();
  }

  /** Every frame, once the player has moved. */
  update(dt: number) {
    if (!this.stageNow) return;
    const p = this.player;
    const now = performance.now();
    // The mouse turned the view: that's the line (aiming) or the hook (winding up); the camera's ours.
    const turn = wrap(p.camYaw - this.lastYaw);
    p.camYaw = this.lastYaw;
    if (this.stageNow === 'aim') {
      this.line = clamp(this.line - turn * LINE_PER_RAD, -LIMITS.line, LIMITS.line);
      if (p.holding('KeyA', 'ArrowLeft')) this.u -= SLIDE_SPEED * dt;
      if (p.holding('KeyD', 'ArrowRight')) this.u += SLIDE_SPEED * dt;
      if (p.holding('KeyW', 'ArrowUp')) this.back -= WALK_SPEED * dt;
      if (p.holding('KeyS', 'ArrowDown')) this.back += WALK_SPEED * dt;
      this.u = clamp(this.u, -LIMITS.u, LIMITS.u);
      this.back = clamp(this.back, LIMITS.backMin, LIMITS.backMax);
      if (!this.hooks.up(this.lane) && !this.view()?.busy(this.lane)) return this.stop();
    } else if (this.stageNow === 'charge') {
      this.spin = clamp(this.spin + turn * SPIN_PER_RAD, -1, 1);
      if (p.holding('KeyA', 'ArrowLeft')) this.spin = clamp(this.spin + 1.2 * dt, -1, 1);
      if (p.holding('KeyD', 'ArrowRight')) this.spin = clamp(this.spin - 1.2 * dt, -1, 1);
      const k = ((now - this.chargeAt) / 1000 / METER) % 2;
      this.power = k > 1 ? 2 - k : k;
    } else if (this.stageNow === 'steps') {
      if (now > this.waitUntil && !this.view()?.rolling(this.lane)) {
        // The office didn't take it (not your turn after all): back on your mark.
        this.stageNow = 'aim';
        this.hooks.changed();
      } else if ((now - this.stepsAt) / 1000 > RELEASE_S + 0.2) this.stageNow = 'watch';
    } else if (this.stageNow === 'watch') {
      const v = this.view();
      if (v && !v.busy(this.lane)) {
        if (this.hooks.up(this.lane)) {
          this.stageNow = 'aim';
          this.spin = 0;
          this.sent = null;
          this.hooks.changed();
        } else return this.stop();
      }
    }
    this.placeCamera(dt);
    this.placeGuide();
    this.render();
  }

  /** Where you stand: on your mark, walking your steps, or in your slide. */
  private stand() {
    const p = this.player;
    let back = this.back;
    if ((this.stageNow === 'steps' || this.stageNow === 'watch') && this.sent) {
      const k = Math.min(1, (performance.now() - this.stepsAt) / 1000 / RELEASE_S);
      const end = -slideEnd(this.sent.back, this.sent.power);
      back = THREE.MathUtils.lerp(this.sent.back, end, k * k * (2.2 - 1.2 * k));
    }
    p.pos.set(LANE_X[this.lane] + this.u - HAND, SURF, FOUL_LINE_Z + back);
    p.facing = Math.PI;
    p.moving = this.stageNow === 'steps';
  }

  private key(e: KeyboardEvent, down: boolean) {
    if (!this.stageNow || e.code !== 'Space') return;
    if (down && (e.repeat || isTyping(e) || modalOpen() || e.metaKey || e.ctrlKey || e.altKey)) return;
    this.press(down);
  }

  private press(down: boolean, e?: MouseEvent) {
    if (!this.stageNow) return;
    if (e && (modalOpen() || !document.pointerLockElement)) return;
    if (down && this.stageNow === 'aim') {
      if (!this.hooks.up(this.lane) || this.view()?.busy(this.lane)) return;
      this.stageNow = 'charge';
      this.chargeAt = performance.now();
      this.spin = 0;
      this.hooks.changed();
    } else if (!down && this.stageNow === 'charge') this.letGo(false);
  }

  /** The button's up: the ball's away (or, barely moved, it wasn't meant). */
  private letGo(cancel: boolean) {
    if (cancel || this.power < MIN_POWER) {
      this.stageNow = 'aim';
      this.hooks.changed();
      return;
    }
    const params: ThrowParams = { u: this.u, back: this.back, power: this.power, line: this.line, spin: this.spin };
    this.sent = params;
    this.stepsAt = performance.now();
    this.waitUntil = this.stepsAt + 2500;
    this.stageNow = 'steps';
    this.hooks.bowl(this.lane, params);
    this.hooks.changed();
  }

  /** Behind you on the approach, looking down the lane; then after the ball. */
  private placeCamera(dt: number) {
    const x = LANE_X[this.lane];
    const ball = this.view()?.ballAt(this.lane);
    const p = this.player.pos;
    if (this.stageNow === 'watch' && ball && !ball.done) {
      // Behind the ball and above it, closer to the lane as it nears the pins.
      const near = Math.min(1, Math.max(0, (ball.d - 6) / 10));
      want.set(x + (ball.pos.x - x) * 0.6, SURF + 1.25 - near * 0.35, ball.pos.z + 3.6 - near * 0.8);
      target.set(x + (ball.pos.x - x) * 0.4, SURF + 0.15, Math.min(ball.pos.z - 4, FOUL_LINE_Z - HEAD_PIN_D + 0.1));
    } else if (this.stageNow === 'watch') {
      // The pins: from a little way up the lane.
      want.set(x + 0.15, SURF + 0.8, FOUL_LINE_Z - HEAD_PIN_D + 4.2);
      target.set(x, SURF + 0.2, FOUL_LINE_Z - HEAD_PIN_D - 0.4);
    } else {
      // Over your right shoulder, high enough to see the arrows past your head.
      want.set(p.x + 0.62, SURF + 2.05, p.z + 2.15);
      target.set(x + this.u + this.line * HEAD_PIN_D * 0.6, SURF, FOUL_LINE_Z - HEAD_PIN_D * 0.62);
    }
    const k = 1 - Math.exp(-dt * (this.stageNow === 'watch' ? 4.5 : 6));
    this.camPos.lerp(want, k);
    lookAt.lookAt(this.camPos, target, UP);
    this.camQuat.slerp(new THREE.Quaternion().setFromRotationMatrix(lookAt), k);
    this.camera.position.copy(this.camPos);
    this.camera.quaternion.copy(this.camQuat);
  }

  /** The aim guide out to the arrows, only while aiming. */
  private placeGuide() {
    const g = this.guide;
    g.visible = this.stageNow === 'aim' || this.stageNow === 'charge';
    if (!g.visible) return;
    const len = 4.8 + this.back;
    g.position.set(LANE_X[this.lane] + this.u, SURF + 0.006, FOUL_LINE_Z + this.back);
    g.rotation.y = -Math.atan(this.line);
    g.scale.set(1, 1, len);
  }

  /** The meters, and where you're aiming. */
  private render() {
    const charging = this.stageNow === 'charge';
    this.fill.style.width = `${(charging ? this.power : this.stageNow === 'aim' ? 0 : (this.sent?.power ?? 0)) * 100}%`;
    this.hook.style.left = `${50 - this.spin * 46}%`;
    const board = Math.round(uBoard(this.u));
    const arrow = uBoard(this.u + this.line * 4.6);
    const foul = slideEnd(this.back, 1) > 0 ? ' · ⚠️ nah an der Linie' : '';
    const text = `Bahn ${laneName(this.lane)} · ${this.hooks.where(this.lane)} · Brett ${board} → ${Math.round(arrow)} am Pfeil · ${BALLS.find((b) => b.lbs === this.hooks.lbs())?.lbs ?? 12} lbs${foul}`;
    if (text !== this.shown) {
      this.shown = text;
      this.info.textContent = text;
    }
    this.title.textContent = charging ? '🎳 Loslassen zum Werfen!' : this.stageNow === 'aim' ? '🎳 Dein Wurf' : '🎳 …';
  }
}

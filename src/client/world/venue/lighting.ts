import * as THREE from 'three';
import type { VenueMode } from '../../../shared/venue';
import { MODE_LIGHTS, type VenueLights, type VenueScene } from '../../../shared/venue-house';

/*
 * The Schallwerk's light show (flrnoh fork, see FORK.md "The Schallwerk"): what the light desk says
 * (concert or club, a scene, the lasers, the mirror ball, the haze) turned into a look for every frame
 * that the house lights, the rig, the LED wall and the room's air all follow. `auto` goes with the
 * music (venueLevel in world/venue/parts.ts): on a beat the colours step on and the blinders hit, and
 * the louder it is the faster the moving heads sweep; with nothing playing a concert sits warm and still
 * and a club drifts slowly through its colours. Everyone inside sees the same, because the time it
 * runs on is the office's clock and the state comes from the office.
 */

/** Everything that's lit, this frame. Levels are 0..1. */
export interface Look {
  mode: VenueMode;
  scene: VenueScene;
  /** The house lights: the hall's pendants, the gallery's downlights, how bright the air is. */
  house: number;
  /** The stage's wash: its colour and how bright. */
  stage: THREE.Color;
  stageLevel: number;
  /** The moving heads: their colour, how bright, how fast they move. */
  beam: THREE.Color;
  beamLevel: number;
  beamSpeed: number;
  /** A second colour for the other half of the rig (the washes on the hall trusses, the LED wall's accents). */
  accent: THREE.Color;
  /** Black light. */
  uv: number;
  /** The strobe and the blinders, right now. */
  flash: number;
  ball: number;
  laser: number;
  /** How thick the air is (beams show in it). */
  haze: number;
  /** The music: how loud, and a pulse on each beat that fades. */
  level: number;
  beat: number;
  /** How many beats have gone by (colours step on with them). */
  beats: number;
}

const C = (c: string) => new THREE.Color(c);
/** The colours the rig steps through in auto: a concert's (warmer) and a club's (deep). */
const KONZERT_COLORS = ['#ffb36b', '#ff4d5e', '#ffd27a', '#ff7a3d', '#e04bff', '#ffe9c4'].map(C);
const CLUB_COLORS = ['#8a2bff', '#2ee6ff', '#ff2db4', '#3d5bff', '#00ffa6', '#ff3d3d'].map(C);
/** A concert's stage in auto: warm white, a little colour drifting through it. */
const WARM_WHITE = C('#ffe2b8');
const SCENE_COLOR: Partial<Record<VenueScene, THREE.Color>> = { warm: C('#ffcf94'), rot: C('#ff1e2d'), blau: C('#2a4dff'), uv: C('#7a2bff') };

const ease = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

export class ShowLighting {
  private lights: VenueLights = { ...MODE_LIGHTS.konzert };
  private mode: VenueMode = 'konzert';
  readonly look: Look = {
    mode: 'konzert',
    scene: 'auto',
    house: 0.6,
    stage: C('#ffcf94'),
    stageLevel: 0.8,
    beam: C('#ffcf94'),
    beamLevel: 0.3,
    beamSpeed: 0.2,
    accent: C('#ff4d5e'),
    uv: 0,
    flash: 0,
    ball: 0,
    laser: 0,
    haze: 0.15,
    level: 0,
    beat: 0,
    beats: 0,
  };
  /** The haze machine: when it was last fired (office clock, ms). */
  private nebelAt = -Infinity;
  private smooth = 0;
  private lastBeatAt = -Infinity;
  private stageTarget = new THREE.Color();
  private beamTarget = new THREE.Color();
  private accentTarget = new THREE.Color();

  set(lights: VenueLights, mode: VenueMode) {
    this.lights = { ...lights };
    this.mode = mode;
  }

  get state(): { lights: VenueLights; mode: VenueMode } {
    return { lights: { ...this.lights }, mode: this.mode };
  }

  /** The haze machine went off at `at` (office clock): the air thickens and slowly clears over 45 s. */
  nebel(at: number) {
    this.nebelAt = at;
  }

  /**
   * One frame: `now` the office's clock (ms), `level` the music (0..1). `snap` jumps straight to the
   * look (coming in) instead of easing there.
   */
  update(now: number, dt: number, level: number, snap = false) {
    const L = this.look;
    const club = this.mode === 'club';
    const scene = this.lights.scene;
    L.mode = this.mode;
    L.scene = scene;
    const r = snap ? 1e6 : 1;
    // The beat: the level jumping over its own running average.
    this.smooth = ease(this.smooth, level, 3, dt);
    const t = now / 1000;
    if (level > 0.12 && level - this.smooth > 0.1 && t - this.lastBeatAt > 0.22) {
      this.lastBeatAt = t;
      L.beat = 1;
      L.beats++;
    }
    // With no music the rig still breathes: a slow beat of its own every 2 s in a club.
    if (level < 0.05 && club && Math.floor(t / 2) !== Math.floor((t - dt) / 2)) L.beats++;
    L.beat = Math.max(0, L.beat - dt * 3.5);
    L.level = ease(L.level, level, 8, dt);

    const palette = club ? CLUB_COLORS : KONZERT_COLORS;
    const step = L.beats;
    let house = club ? 0.04 : 0.24;
    let stageLevel = club ? 0.35 : 0.85;
    let beamLevel = club ? 0.75 : 0.35 + 0.4 * L.level;
    let beamSpeed = club ? 0.35 + L.level * 1.2 : 0.12 + L.level * 0.6;
    let uv = club ? 0.35 : 0;
    let flash = 0;
    if (scene === 'auto') {
      this.stageTarget.copy(club ? palette[step % palette.length] : WARM_WHITE).lerp(palette[(step + 2) % palette.length], club ? 0 : 0.25 + 0.2 * Math.sin(t * 0.2));
      this.beamTarget.copy(palette[(step + 1) % palette.length]);
      this.accentTarget.copy(palette[(step + 3) % palette.length]);
      flash = L.beat > 0.85 && L.level > 0.45 ? 1 : 0;
    } else if (scene === 'strobo') {
      this.stageTarget.set('#ffffff');
      this.beamTarget.set('#ffffff');
      this.accentTarget.set('#ffffff');
      // Five flashes a second, short ones.
      flash = (t * 5) % 1 < 0.22 ? 1 : 0;
      house = 0;
      stageLevel = 0.05;
      beamLevel = 0.1;
      uv = 0;
    } else if (scene === 'blackout') {
      house = 0;
      stageLevel = 0;
      beamLevel = 0;
      uv = 0;
    } else {
      const c = SCENE_COLOR[scene]!;
      this.stageTarget.copy(c);
      this.beamTarget.copy(c);
      this.accentTarget.copy(c).offsetHSL(scene === 'warm' ? 0.03 : 0.06, 0, -0.05);
      if (scene === 'uv') {
        uv = 1;
        house = 0;
        stageLevel = 0.25;
        beamLevel = 0.35;
      } else if (scene === 'warm') {
        stageLevel = 1;
        beamLevel = club ? 0.4 : 0.25;
        beamSpeed *= 0.5;
      } else {
        stageLevel = 0.9;
        beamLevel = 0.7;
      }
    }
    const rate = 4 * r;
    L.house = ease(L.house, house, 2 * r, dt);
    L.stage.lerp(this.stageTarget, Math.min(1, 1 - Math.exp(-rate * dt)));
    L.beam.lerp(this.beamTarget, Math.min(1, 1 - Math.exp(-rate * dt)));
    L.accent.lerp(this.accentTarget, Math.min(1, 1 - Math.exp(-rate * dt)));
    L.stageLevel = ease(L.stageLevel, stageLevel + (scene === 'auto' ? L.beat * 0.25 : 0), 6 * r, dt);
    L.beamLevel = ease(L.beamLevel, beamLevel, 4 * r, dt);
    L.beamSpeed = ease(L.beamSpeed, beamSpeed, 1.5 * r, dt);
    L.uv = ease(L.uv, uv, 2 * r, dt);
    L.flash = flash;
    L.ball = ease(L.ball, this.lights.ball && scene !== 'blackout' ? 1 : 0, 2 * r, dt);
    L.laser = ease(L.laser, this.lights.laser && scene !== 'blackout' ? 1 : 0, 3 * r, dt);
    const since = (now - this.nebelAt) / 1000;
    const fog = since >= 0 && since < 45 ? Math.min(1, since / 2) * (1 - since / 45) : 0;
    L.haze = ease(L.haze, (club ? 0.35 : 0.15) + fog * 0.65, 1.5 * r, dt);
  }
}

const HOUSE_SKY = new THREE.Color('#ffe2bf');
const HOUSE_GROUND = new THREE.Color('#5a4434');
const DARK_SKY = new THREE.Color('#2a2440');
const DARK_GROUND = new THREE.Color('#0c0a14');
const UV_SKY = new THREE.Color('#6a2cff');
const sky = new THREE.Color();
const ground = new THREE.Color();

/**
 * The air in the hall for the scene's hemisphere and ambient light: warm with the house lights up, near
 * dark with them down, tinted by the stage's colour, violet under black light, white on the strobe.
 */
export function applyMood(look: Look, hemi: THREE.HemisphereLight, ambient: THREE.AmbientLight) {
  sky.copy(DARK_SKY).lerp(HOUSE_SKY, look.house).lerp(look.stage, 0.25 * look.stageLevel).lerp(UV_SKY, look.uv * 0.6);
  ground.copy(DARK_GROUND).lerp(HOUSE_GROUND, look.house);
  if (look.flash > 0) sky.lerp(new THREE.Color(1, 1, 1), look.flash * 0.8);
  hemi.color.copy(sky);
  hemi.groundColor.copy(ground);
  hemi.intensity = 0.22 + look.house * 0.8 + look.flash * 1.5 + look.uv * 0.25;
  ambient.color.copy(sky);
  ambient.intensity = 0.1 + look.house * 0.3 + look.flash * 0.6;
}

import * as THREE from 'three';
import type { DjFrame } from '../../dnb';
import { videoTurn } from './videoturn';

/*
 * The LED wall behind the DJ (flrnoh fork, see FORK.md): a wall of round LEDs playing visuals to
 * the music, all drawn on the graphics card. Eight programs (a tunnel, a kaleidoscope, a spectrum,
 * a synthwave sun, a warp, a checkerboard, rings and a plasma) take turns by the set's parts and
 * bars, cross-fading on the beat, with words over them now and then (FLOGGE OFFICE as a drop lands,
 * GET READY and a countdown through a build, the set's title and its tempo). Everything goes by
 * the frame (DjFrame), so it's the same on every screen on the roof. A YouTube set's own video comes
 * on now and then too (videoturn.ts), LED by LED, once the office has a copy (features/djset/video.ts).
 */

/** What the wall knows beyond the frame: the set's tempo and title (see features/djset/frame.ts). */
export interface WallInfo {
  bpm?: number;
  title?: string;
  /** The set's video, while there's one to show (features/djset/video.ts). */
  video?: WallVideo;
}

/** A set's video for the wall: its texture, how wide its picture is, and whether it has a picture in step right now. */
export interface WallVideo {
  texture: THREE.Texture;
  aspect: number;
  on: boolean;
}

export interface LedWall {
  mesh: THREE.Mesh;
  /** Moves it on to now. `calm`: the slow plasma only, for anyone who'd rather nothing flashed; `dark`: 0 by day to 1 at night. */
  update(f: DjFrame & WallInfo, t: number, calm: boolean, dark: number): void;
}

const P = { tunnel: 0, kaleido: 1, bars: 2, sun: 3, warp: 4, checker: 5, rings: 6, plasma: 7, video: 8 } as const;
type Prog = keyof typeof P;
/** Which programs take turns in each part, and every how many beats the next one comes on. */
const PLAYLIST: Record<DjFrame['part'], { every: number; progs: Prog[] }> = {
  intro: { every: 64, progs: ['bars', 'sun', 'rings', 'kaleido', 'checker'] },
  build: { every: 1e9, progs: ['tunnel'] },
  drop: { every: 32, progs: ['warp', 'bars', 'kaleido', 'checker', 'rings', 'tunnel'] },
  breakdown: { every: 64, progs: ['plasma', 'sun', 'kaleido'] },
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime, uBeats, uBeat, uKick, uSnare, uEnergy, uRise, uHue, uDark;
uniform float uProgA, uProgB, uMix, uFlash;
uniform vec2 uGrid;
uniform sampler2D uText;
uniform float uTextOn, uTextY;
uniform vec3 uTextTint;
uniform sampler2D uVideo;
uniform float uVideoOn;
uniform vec2 uVideoFit;

#define PI 3.14159265
vec3 hsl(float h, float s, float l) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (k - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// Each program: the color at p (x -2..2 across the wall, y -1..1 up it).
vec3 tunnel(vec2 p) {
  // A checkered tube rushing at you, quicker as a build rises.
  float r = length(p), a = atan(p.y, p.x) + uBeats * PI / 16.0;
  float speed = 0.5 + 2.5 * uRise + 1.0 * uEnergy;
  float z = 0.6 / max(r, 0.05) + uBeats * speed * 0.5;
  float c = mod(floor(a / PI * 8.0) + floor(z * 2.0), 2.0);
  float l = (0.07 + 0.5 * c) * smoothstep(0.05, 0.9, r) + 0.3 * uKick * smoothstep(0.7, 0.0, r);
  return hsl(uHue + floor(z * 2.0) * 0.05 + c * 0.5, 0.9, clamp(l, 0.0, 0.75));
}
vec3 kaleido(vec2 p) {
  // Eight mirrored slices of stripes and dots, turning slowly, stripes running out on the beat.
  float r = length(p), a = atan(p.y, p.x) + uBeats * PI / 32.0;
  float seg = PI / 4.0;
  a = abs(mod(a, 2.0 * seg) - seg);
  vec2 q = vec2(cos(a), sin(a)) * r * (2.6 - 0.5 * uKick);
  float d1 = abs(fract(q.x - uBeats * 0.25) - 0.5);
  float d2 = abs(fract((q.x + q.y) * 0.7 + uBeats * 0.125) - 0.5);
  float shape = smoothstep(0.13, 0.06, min(d1, d2));
  float dots = smoothstep(0.2, 0.12, length(fract(q * 1.5) - 0.5));
  float l = 0.05 + 0.5 * shape + 0.35 * dots * (0.4 + 0.6 * uBeat);
  return hsl(uHue + r * 0.15 + shape * 0.3, 0.95, clamp(l, 0.0, 0.75));
}
vec3 bars(vec2 p) {
  // A spectrum, mirrored out from the middle both ways, jumping with the kick.
  float x = abs(p.x) / 2.0;
  float bin = floor(x * 24.0);
  float beat = floor(uBeats * 2.0);
  float h = 0.08 + uEnergy * (0.3 + 0.55 * hash(vec2(bin, beat))) * (0.5 + 0.5 * uKick) * (1.0 - 0.6 * x);
  h += 0.25 * uSnare * hash(vec2(bin, beat + 0.5)) * x;
  float y = abs(p.y - 0.15);
  float on = step(y, h) * step(0.15, fract(x * 24.0)) * step(0.12, fract(y * 18.0));
  float peak = step(abs(y - h - 0.06), 0.025) * step(0.15, fract(x * 24.0));
  vec3 c = hsl(uHue + y * 0.5 - x * 0.2, 0.95, 0.5) * on + vec3(1.0) * peak * 0.8;
  return c + hsl(uHue + 0.5, 0.8, 0.05) * (1.0 - on);
}
vec3 sun(vec2 p) {
  vec3 sky = mix(hsl(uHue + 0.75, 0.8, 0.12), hsl(uHue + 0.92, 0.9, 0.35), smoothstep(0.9, 0.0, p.y));
  vec2 c = p - vec2(0.0, 0.3);
  float r = length(c);
  float stripes = step(0.35, fract((c.y + uTime * 0.05) * 9.0)) + step(0.0, c.y);
  vec3 col = sky;
  float sunOn = smoothstep(0.72, 0.7, r) * min(stripes, 1.0);
  // The sun's always a sun: yellow at the top to magenta at the bottom, whatever the set's color.
  col = mix(col, mix(hsl(0.13, 1.0, 0.6), hsl(0.92, 1.0, 0.55), smoothstep(0.7, -0.7, c.y)), sunOn);
  col += hsl(uHue + 0.95, 1.0, 0.5) * 0.35 * smoothstep(1.1, 0.7, r) * (0.6 + 0.4 * uBeat);
  if (p.y < -0.25) {
    float d = -0.25 - p.y;
    float z = 0.25 / d;
    float gx = abs(fract(p.x * z * 0.5) - 0.5);
    float gz = abs(fract(z + uBeats * 0.5) - 0.5);
    float line = smoothstep(0.06 * z, 0.0, min(gx, gz));
    col = mix(hsl(uHue + 0.8, 0.8, 0.04), hsl(uHue + 0.55, 1.0, 0.6), clamp(line, 0.0, 1.0) * (0.5 + 0.5 * uKick));
  }
  return col;
}
vec3 warp(vec2 p) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float lane = floor(a * 40.0 / PI);
  float speed = 0.4 + 1.6 * uEnergy;
  float pos = fract(hash(vec2(lane, 1.0)) + uTime * speed * (0.5 + hash(vec2(lane, 2.0))));
  float streak = smoothstep(0.25, 0.0, abs(r / 2.2 - pos)) * step(0.55, fract(a * 40.0 / PI));
  vec3 c = hsl(uHue + hash(vec2(lane, 3.0)) * 0.3, 0.8, 0.65) * streak * (0.4 + 1.4 * r / 2.2);
  return c + hsl(uHue, 0.9, 0.5) * uKick * 0.35 * smoothstep(0.7, 0.0, r);
}
vec3 checker(vec2 p) {
  float ang = uBeats * PI / 16.0;
  vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p * (2.5 + 1.5 * sin(uBeats * PI / 8.0) - uKick * 0.6);
  float c = mod(floor(q.x) + floor(q.y) + floor(uBeats), 2.0);
  if (uSnare > 0.5) c = 1.0 - c;
  return hsl(uHue + c * 0.5 + length(p) * 0.1, 0.95, 0.12 + 0.45 * c * (0.5 + 0.5 * uBeat));
}
vec3 rings(vec2 p) {
  float r = length(p);
  float b = fract(uBeats);
  float l = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = b + float(i);
    float rad = age * 0.75;
    l += smoothstep(0.09, 0.0, abs(r - rad)) * (1.0 - age / 4.0);
  }
  float a = atan(p.y, p.x);
  float sweep = pow(0.5 + 0.5 * cos(a - uBeats * PI * 0.5), 18.0) * smoothstep(2.0, 0.2, r);
  return hsl(uHue + r * 0.12 - floor(uBeats) * 0.05, 0.95, clamp(0.06 + 0.55 * l + 0.4 * sweep, 0.0, 0.8));
}
vec3 plasma(vec2 p) {
  float t = uTime * 0.25;
  float v = sin(p.x * 2.1 + t) + sin(p.y * 3.3 - t * 1.3) + sin((p.x + p.y) * 1.7 + t * 0.7) + sin(length(p * 2.5) - t);
  return hsl(uHue + v * 0.08, 0.85, 0.22 + 0.12 * sin(v * PI) + 0.06 * uBeat);
}
vec3 video(vec2 p) {
  // The set's own video, letterboxed (uVideoFit: how much of the wall it fills across and up), one
  // sample per LED, a little punchier than it is, pulsing with the kick; a dim glow round it.
  vec2 uv = vec2(p.x / 4.0, p.y / 2.0) / uVideoFit + 0.5;
  vec3 bg = hsl(uHue, 0.7, 0.025 + 0.03 * uBeat);
  if (uVideoOn < 0.5 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return bg;
  vec3 c = texture2D(uVideo, uv).rgb;
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.35);
  c = (c - 0.5) * 1.15 + 0.5;
  return clamp(c, 0.0, 1.0) * (0.65 + 0.25 * uKick);
}
vec3 program(float id, vec2 p) {
  if (id < 0.5) return tunnel(p);
  if (id < 1.5) return kaleido(p);
  if (id < 2.5) return bars(p);
  if (id < 3.5) return sun(p);
  if (id < 4.5) return warp(p);
  if (id < 5.5) return checker(p);
  if (id < 6.5) return rings(p);
  if (id < 7.5) return plasma(p);
  return video(p);
}

void main() {
  vec2 cells = vUv * uGrid;
  vec2 cell = floor(cells);
  vec2 cuv = (cell + 0.5) / uGrid;
  vec2 p = vec2((cuv.x - 0.5) * 4.0, (cuv.y - 0.5) * 2.0);
  vec3 col = program(uProgA, p);
  if (uMix > 0.001) col = mix(col, program(uProgB, p), uMix);
  // Words over it, LED by LED.
  if (uTextOn > 0.001) {
    // A band a little above the middle: the DJ and the decks are in front of the bottom of it.
    vec2 tuv = vec2(cuv.x, (cuv.y - 0.6) * uTextY + 0.5);
    float a = 0.0;
    if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) a = texture2D(uText, tuv).a;
    col = mix(col * (1.0 - 0.6 * uTextOn), uTextTint * (1.1 + 0.6 * uKick), a * uTextOn);
  }
  col += vec3(uFlash);
  // Round LEDs with dark gaps; from far off (an LED smaller than a pixel) just the glow, so nothing shimmers.
  vec2 f = fract(cells) - 0.5;
  float led = smoothstep(0.5, 0.3, length(f));
  float px = max(fwidth(cells.x), fwidth(cells.y));
  led = mix(led, 0.72, smoothstep(0.35, 0.9, px));
  col *= 0.12 + 1.15 * led;
  // Brighter at night, washed out a bit in the sun.
  col *= 0.85 + 0.35 * uDark;
  gl_FragColor = vec4(col, 1.0);
}`;

const NO_VIDEO = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
NO_VIDEO.needsUpdate = true;

/** A program to keep on the wall, from the console (window.__ledWall.force('video'); .now() says what's on), for looking at one; null: back to the playlist. */
let forced: Prog | null = null;

/** A wall `w` × `h` meters, `cols` LEDs across. */
export function buildLedWall(w: number, h: number, cols = 192): LedWall {
  const rows = Math.round((cols * h) / w);
  const text = document.createElement('canvas');
  text.width = 1024;
  text.height = 128;
  const tg = text.getContext('2d')!;
  const textTex = new THREE.CanvasTexture(text);
  textTex.minFilter = THREE.LinearFilter;
  textTex.generateMipmaps = false;
  const u = {
    uTime: { value: 0 },
    uBeats: { value: 0 },
    uBeat: { value: 0 },
    uKick: { value: 0 },
    uSnare: { value: 0 },
    uEnergy: { value: 0 },
    uRise: { value: 0 },
    uHue: { value: 0 },
    uDark: { value: 0 },
    uProgA: { value: 7 },
    uProgB: { value: 7 },
    uMix: { value: 0 },
    uFlash: { value: 0 },
    uGrid: { value: new THREE.Vector2(cols, rows) },
    uText: { value: textTex },
    uTextOn: { value: 0 },
    // The words' canvas is 8:1; the wall isn't: so many of its heights to the canvas'.
    uTextY: { value: (h / w) * 8 },
    uTextTint: { value: new THREE.Color('#ffffff') },
    // The set's video: a black dot while there's none (or it isn't on the wall), so nothing's uploaded for it then.
    uVideo: { value: NO_VIDEO as THREE.Texture },
    uVideoOn: { value: 0 },
    uVideoFit: { value: new THREE.Vector2(1, 1) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

  /** What the words canvas holds now, so it's only drawn again when they change. */
  let drawn = '';
  const write = (words: string) => {
    if (words === drawn) return;
    drawn = words;
    tg.clearRect(0, 0, text.width, text.height);
    if (!words) return;
    // As big as fits across, down to a size the LEDs still read; longer than that, squeezed.
    let px = 100;
    const font = () => `900 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    for (; px > 60; px -= 4) {
      tg.font = font();
      if (tg.measureText(words).width <= text.width - 24) break;
    }
    tg.font = font();
    tg.textAlign = 'center';
    tg.textBaseline = 'middle';
    tg.fillStyle = '#ffffff';
    tg.fillText(words, text.width / 2, text.height / 2 + 4, text.width - 24);
    textTex.needsUpdate = true;
  };

  const progOf = (part: DjFrame['part'], n: number): number => {
    const list = PLAYLIST[part].progs;
    return P[list[((n % list.length) + list.length) % list.length]];
  };
  /** The program on before this one, and when this one came on: they cross-fade over a beat. */
  let shown = { prog: P.plasma as number, from: P.plasma as number, at: -1e9 };
  const tmp = new THREE.Color();
  (window as unknown as { __ledWall?: unknown }).__ledWall = {
    force: (p: string | null) => (forced = p && p in P ? (p as Prog) : null),
    now: () => ({ prog: Object.keys(P)[shown.prog], video: u.uVideoOn.value > 0 }),
  };

  return {
    mesh,
    update(f, t, calm, dark) {
      const beats = f.beats;
      u.uTime.value = t;
      u.uDark.value = dark;
      u.uHue.value = f.hue;
      // The house DJ counts beats from 1970: the graphics card's floats only keep a few thousand exactly.
      u.uBeats.value = calm ? (t * 0.5) % 1024 : beats % 1024;
      u.uBeat.value = calm ? 0.3 : f.beat;
      u.uKick.value = calm ? 0 : f.kick;
      u.uSnare.value = calm ? 0 : f.snare;
      u.uEnergy.value = calm ? 0.3 : f.energy;
      u.uRise.value = f.rise;
      // Which program: the set's video now and then, once there's one; else the part's list, the next
      // one every so many beats (and a new part starts its own).
      const v = f.video;
      const want =
        forced && (forced !== 'video' || v) ? P[forced]
        : v && videoTurn(f, calm) ? P.video
        : calm ? P.plasma
        : progOf(f.part, Math.floor(beats / PLAYLIST[f.part].every) + f.track);
      if (want !== shown.prog) shown = { prog: want, from: shown.prog, at: beats };
      const fade = calm ? 1 : Math.min(1, Math.max(0, beats - shown.at));
      u.uProgA.value = shown.from;
      u.uProgB.value = shown.prog;
      u.uMix.value = fade;
      // The video's texture only while it's on the wall (fading in or out), so it's only uploaded then.
      const showing = !!v && (shown.prog === P.video || (shown.from === P.video && fade < 1));
      u.uVideo.value = showing ? v.texture : NO_VIDEO;
      u.uVideoOn.value = showing && v.on ? 1 : 0;
      if (showing) {
        const wall = w / h;
        u.uVideoFit.value.set(v.aspect > wall ? 1 : v.aspect / wall, v.aspect > wall ? wall / v.aspect : 1);
      }
      // A white flash as the drop lands, and on the last beats of a build.
      u.uFlash.value = calm ? 0 : f.sinceDrop < 0.5 ? 0.6 * (1 - f.sinceDrop / 0.5) : f.part === 'build' && f.rise > 7 / 8 ? 0.25 * f.beat : 0;

      // The words.
      let words = '';
      const bar = Math.floor(beats / 4);
      if (calm) words = '';
      else if (f.sinceDrop < 8) words = Math.floor(beats * 2) % 2 || f.sinceDrop < 2 ? 'FLOGGE OFFICE' : '';
      else if (f.part === 'build') words = f.rise > 7 / 8 ? String(4 - (Math.floor(beats) % 4)) : bar % 2 ? 'GET READY' : '';
      // The set's title, a bar at a time through a breakdown.
      else if (f.part === 'breakdown' && f.title) words = bar % 4 < 2 ? f.title.toUpperCase().slice(0, 40) : '';
      else if (bar % 16 === 15 && f.bpm) words = `${Math.round(f.bpm)} BPM`;
      else if (bar % 32 === 7) words = 'FLOGGE OFFICE';
      write(words);
      u.uTextOn.value = words ? 1 : 0;
      u.uTextTint.value.copy(tmp.setHSL((f.hue + 0.5) % 1, 0.6, 0.85));
    },
  };
}

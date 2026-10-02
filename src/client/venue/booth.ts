import * as THREE from 'three';
import { EMOTES, type EmoteId } from '../../shared/emotes';
import type { Look } from '../../shared/avatar';
import type { VenueWear } from '../../shared/venue-house';
import { h, openModal } from '../ui/dom';
import { Person } from '../world/character';
import { canvasTexture } from '../world/casino/parts';
import { drawLogo } from '../world/venue/signs';
import { putOn } from './wear';
import './ui.css';

// flrnoh fork (see FORK.md "The Schallwerk"): the foyer's photo booth. A camera in the booth sees you
// and whoever's standing with you in front of it (up to four, drawn in a little renderer of its own as
// they look now, merch shirts and stamps and all) against the booth's red curtain with the house's
// neon mark: four shots, a countdown before each (pick a pose: everyone in the booth's picture strikes
// it), the flash, each shot its own look (colour, black and white, sepia, neon), and out comes the strip
// as a PNG to download (and the strip in your hand). ✕ or Esc closes it.

export interface Sitter {
  name: string;
  color: string;
  look: Look;
  wear: VenueWear;
}

export interface VenueBoothOptions {
  /** You first, then whoever's with you. */
  sitters: Sitter[];
  /** Your character strikes the pose out in the foyer too, for everyone to see. */
  pose(id: EmoteId): void;
  shutter(): void;
  /** The strip's out. */
  done(png: string): void;
}

const PW = 360;
const PH = 300;
const SHOTS = 4;
const COUNT = 3;
const FILTERS = ['saturate(1.25) contrast(1.05)', 'grayscale(1) contrast(1.2)', 'sepia(0.75) contrast(1.05)', 'saturate(1.8) hue-rotate(-25deg) contrast(1.15)'];

export function openVenueBooth(o: VenueBoothOptions) {
  const view = h('canvas', { width: PW, height: PH }) as HTMLCanvasElement;
  const flash = h('div.vn-flash', {});
  const big = h('div.vn-count', {}, '');
  const poses = h('div.vn-poses', {});
  const status = h('p.vn-status', {}, 'Vorhang zu… Pose wählen!');
  const close = h('button.btn.close', { 'aria-label': 'Schließen' }, '✕');
  const el = h('div.modal.vn-booth', { role: 'dialog', 'aria-label': 'Fotobox' }, h('header', {}, h('h2', {}, '📸 Fotobox'), close), h('div.body', {}, h('div.booth-stage', {}, view, flash, big), status, poses));
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(PW, PH, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a0a10');
  scene.add(new THREE.HemisphereLight('#ffffff', '#553333', 1.5));
  const key = new THREE.DirectionalLight('#fff2e0', 2.2);
  key.position.set(0.6, 2.2, 3);
  scene.add(key);
  // The curtain behind: velvet folds, and the house's mark glowing on it.
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 3),
    new THREE.MeshLambertMaterial({
      map: canvasTexture(512, 300, (g) => {
        for (let x = 0; x < 512; x += 32) {
          const grd = g.createLinearGradient(x, 0, x + 32, 0);
          grd.addColorStop(0, '#5a0d16');
          grd.addColorStop(0.5, '#8c1520');
          grd.addColorStop(1, '#5a0d16');
          g.fillStyle = grd;
          g.fillRect(x, 0, 32, 300);
        }
      }),
    }),
  );
  curtain.position.set(0, 1.3, -0.9);
  scene.add(curtain);
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      map: canvasTexture(256, 256, (g) => {
        g.shadowColor = '#ff2d3d';
        g.shadowBlur = 18;
        drawLogo(g, 128, 128, 220, '#ff5a66');
      }),
    }),
  );
  neon.position.set(0, 1.95, -0.85);
  scene.add(neon);
  // Everyone in the picture, side by side, a little stagger.
  const people = o.sitters.slice(0, 4).map((s, i, all) => {
    const p = new Person(s.name, s.color, s.look);
    p.showLabel(false);
    putOn(p, s.wear);
    const n = all.length;
    p.root.position.set((i - (n - 1) / 2) * 0.62, 0, i % 2 ? -0.18 : 0);
    p.root.rotation.y = -((i - (n - 1) / 2) * 0.12);
    scene.add(p.root);
    return p;
  });
  const n = people.length;
  const cam = new THREE.PerspectiveCamera(n > 2 ? 40 : 32, PW / PH, 0.1, 20);
  cam.position.set(0, 1.3, n > 2 ? 2.9 : 2.6);
  cam.lookAt(0, 1.05, 0);
  let raf = 0;
  let last = performance.now() / 1000;
  let shot = 0;
  let left = COUNT + 1.5;
  let finished = false;
  const taken: HTMLCanvasElement[] = [];
  const modal = openModal(el, {
    doing: '📸 in the photo booth',
    onClose: () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.forceContextLoss();
      scene.traverse((x) => (x as THREE.Mesh).isMesh && (x as THREE.Mesh).geometry.dispose());
    },
  });
  close.addEventListener('click', () => modal.close());
  const pick = (id: EmoteId | null) => {
    if (finished) return;
    if (id) {
      for (const p of people) p.emote(id);
      o.pose(id);
    }
    poses.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === (id ?? 'smile'))));
  };
  poses.append(h('button.btn', { type: 'button', 'data-pose': 'smile', onclick: () => pick(null) }, '😊 Lächeln'), ...EMOTES.map((e) => h('button.btn', { type: 'button', 'data-pose': e.id, onclick: () => pick(e.id) }, `${e.emoji} ${e.label}`)));

  function snap() {
    o.shutter();
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
    renderer.render(scene, cam);
    const c = document.createElement('canvas');
    c.width = PW;
    c.height = PH;
    const g = c.getContext('2d')!;
    g.filter = FILTERS[taken.length % FILTERS.length];
    g.drawImage(view, 0, 0);
    taken.push(c);
  }

  /** The classic strip: four frames down a white card, the house's name and the date at the bottom. */
  function strip(): string {
    const pad = 16;
    const w = PW / 2 + pad * 2;
    const ph = PH / 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = ph * SHOTS + pad * (SHOTS + 1) + 54;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, c.width, c.height);
    taken.forEach((t, i) => g.drawImage(t, pad, pad + i * (ph + pad), PW / 2, ph));
    drawLogo(g, w / 2 - 50, c.height - 28, 40, '#c4121f', false);
    g.fillStyle = '#1b1b2f';
    g.font = 'bold 16px Impact, "Arial Narrow", sans-serif';
    g.textAlign = 'left';
    g.fillText('SCHALLWERK', w / 2 - 28, c.height - 30);
    g.font = '11px Georgia, serif';
    g.fillText(new Date().toLocaleDateString('de-DE'), w / 2 - 28, c.height - 14);
    return c.toDataURL('image/png');
  }

  function finish() {
    finished = true;
    const png = strip();
    const a = h('a.btn.primary', { href: png, download: 'schallwerk-fotostreifen.png' }, '⬇️ Fotostreifen herunterladen');
    status.textContent = 'Fertig! Noch ein bisschen feucht.';
    poses.replaceChildren(a);
    big.textContent = '';
    view.replaceWith(h('img.vn-strip', { src: png, alt: 'Fotostreifen' }));
    o.done(png);
  }

  function frame() {
    const now = performance.now() / 1000;
    const real = now - last;
    const dt = Math.min(0.1, real);
    last = now;
    for (const p of people) p.update(dt, now, false, false);
    if (!finished) {
      left -= real;
      big.textContent = left <= COUNT && left > 0 ? String(Math.ceil(left)) : '';
      status.textContent = `Foto ${shot + 1} von ${SHOTS}${left > COUNT ? ': Pose wählen!' : ''}${n > 1 ? ` · ${n} im Bild` : ''}`;
      if (left <= 0) {
        snap();
        shot++;
        left = COUNT + 1.5;
        if (shot >= SHOTS) finish();
      }
      if (!finished) renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return modal;
}

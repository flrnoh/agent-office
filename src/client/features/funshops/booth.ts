import * as THREE from 'three';
import { EMOTES, type EmoteId } from '../../../shared/emotes';
import type { Look } from '../../../shared/avatar';
import { h, openModal } from '../../ui/dom';
import { Person } from '../../world/character';
import './ui.css';

// flrnoh fork (see FORK.md "Shops to walk into"): the photo booth in the Spielhalle. The curtain
// closes, and a camera in the booth sees you (your character as you look now, drawn in a little
// renderer of its own): pick a pose from the office's emotes before each of four shots, the countdown,
// the flash, and out comes the classic strip of four as a PNG to download. ✕ or Esc closes it.

export interface BoothOptions {
  name: string;
  color: string;
  look: Look;
  /** Your character strikes the pose in the shop too, for everyone to see. */
  pose(id: EmoteId): void;
  shutter(): void;
  /** The strip is out: into your hand. */
  done(png: string): void;
  closed(): void;
}

const PW = 300;
const PH = 360;
const SHOTS = 4;
const COUNT = 3;

export function openBooth(o: BoothOptions) {
  const view = h('canvas.booth-view', {
    width: PW,
    height: PH,
  }) as HTMLCanvasElement;
  const flash = h('div.booth-flash', {});
  const big = h('div.booth-count', {}, '');
  const poses = h('div.booth-poses', {});
  const shots = h('div.booth-shots', {});
  const status = h('p.booth-status', {}, 'Vorhang zu… Wähl eine Pose!');
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h(
    'div.modal.booth-modal',
    { role: 'dialog', 'aria-label': 'Fotoautomat' },
    h('header', {}, h('h2', {}, '📸 Fotoautomat'), close),
    h('div.body', {}, h('div.booth-stage', {}, view, flash, big), status, poses, shots),
  );
  // A little renderer of its own: you on a stool before the booth's curtain, lit from the front.
  const renderer = new THREE.WebGLRenderer({
    canvas: view,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(PW, PH, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9b2226');
  scene.add(new THREE.HemisphereLight('#ffffff', '#553333', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(0.5, 2, 3);
  scene.add(key);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshLambertMaterial({ color: '#7d1a1f' }));
  wall.position.set(0, 1.2, -0.8);
  scene.add(wall);
  const me = new Person(o.name, o.color, o.look);
  me.showLabel(false);
  scene.add(me.root);
  const cam = new THREE.PerspectiveCamera(32, PW / PH, 0.1, 20);
  cam.position.set(0, 1.25, 3.1);
  cam.lookAt(0, 0.98, 0);
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
      o.closed();
    },
  });
  close.addEventListener('click', () => modal.close());
  const pick = (id: EmoteId | null) => {
    if (finished) return;
    if (id) {
      me.emote(id);
      o.pose(id);
    }
    poses.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pose === (id ?? 'smile'))));
  };
  poses.append(
    h('button.btn', { type: 'button', 'data-pose': 'smile', onclick: () => pick(null) }, '😊 Lächeln'),
    ...EMOTES.map((e) => h('button.btn', { type: 'button', 'data-pose': e.id, onclick: () => pick(e.id) }, `${e.emoji} ${e.label}`)),
  );

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
    // A photo booth's black and white, warmed a touch.
    g.filter = 'grayscale(1) contrast(1.15) sepia(.18)';
    g.drawImage(view, 0, 0);
    taken.push(c);
    shots.append(
      h('img.booth-thumb', {
        src: c.toDataURL('image/png'),
        alt: `Foto ${taken.length}`,
      }),
    );
  }

  function strip(): string {
    const pad = 18;
    const c = document.createElement('canvas');
    c.width = PW / 2 + pad * 2;
    c.height = (PH / 2) * SHOTS + pad * (SHOTS + 1) + 40;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, c.width, c.height);
    taken.forEach((t, i) => g.drawImage(t, pad, pad + i * (PH / 2 + pad), PW / 2, PH / 2));
    g.fillStyle = '#3d405b';
    g.font = 'italic 14px Georgia, serif';
    g.textAlign = 'center';
    g.fillText(`Spielhalle · ${new Date().toLocaleDateString()}`, c.width / 2, c.height - 18);
    return c.toDataURL('image/png');
  }

  function finish() {
    finished = true;
    const png = strip();
    const a = h('a.btn.primary', { href: png, download: 'fotostreifen.png' }, '⬇️ PNG herunterladen');
    status.textContent = 'Fertig! Der Streifen ist noch ein bisschen feucht.';
    poses.replaceChildren(a);
    big.textContent = '';
    view.replaceWith(h('img.booth-strip', { src: png, alt: 'Fotostreifen' }));
    shots.replaceChildren();
    o.done(png);
  }

  function frame() {
    const now = performance.now() / 1000;
    const real = now - last;
    const dt = Math.min(0.1, real);
    last = now;
    me.update(dt, now, false, false);
    if (!finished) {
      left -= real; // the countdown goes by the clock, however slowly the page draws
      big.textContent = left <= COUNT && left > 0 ? String(Math.ceil(left)) : '';
      status.textContent = `Foto ${shot + 1} von ${SHOTS}${left > COUNT ? ': Pose wählen!' : ''}`;
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

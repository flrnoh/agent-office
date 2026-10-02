import * as THREE from 'three';
import { COASTER_NAME, type CoasterLeader } from '../../shared/coaster';
import { h, openModal } from '../ui/dom';

// DER BRECHER's ride photo (flrnoh fork, see FORK.md "Der Brecher"). At the bottom of the first drop a
// camera by the U-turn flashes as the train comes at it; every page up on the roof (riders and
// whoever's watching) draws that moment from there, the whole train with everyone in it, hands up or
// not, the same on every page because the train's where its clock says. The picture goes on the
// station's monitor, and E there opens it big, to save.

const W = 960;
const H = 600;
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';

export interface RidePhoto {
  canvas: HTMLCanvasElement;
  ride: number;
  names: string[];
  at: number;
}

/** Draws the scene from `from` looking at `to` into a picture with the ride's caption on it. */
export function takePhoto(renderer: THREE.WebGLRenderer, scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, caption: { ride: number; names: string[]; at: number }): RidePhoto {
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 900);
  cam.position.copy(from);
  cam.lookAt(to);
  cam.updateMatrixWorld();
  const target = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const was = renderer.getRenderTarget();
  const clear = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
  renderer.setRenderTarget(was);
  renderer.autoClear = clear;
  target.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(W, H);
  // Upside down out of the render target: the rows the right way up.
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  g.putImageData(img, 0, 0);
  // The flash's bloom, a frame, and the caption.
  const glow = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, W * 0.7);
  glow.addColorStop(0, 'rgba(255,255,255,0.14)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.lineWidth = 14;
  g.strokeStyle = '#16161f';
  g.strokeRect(7, 7, W - 14, H - 14);
  g.fillStyle = 'rgba(22,22,31,0.82)';
  g.fillRect(14, H - 78, W - 28, 64);
  g.font = `900 34px ${FONT}`;
  g.fillStyle = '#ffd166';
  g.textBaseline = 'middle';
  g.fillText(`🎢 ${COASTER_NAME}`, 32, H - 46);
  g.font = `700 22px ${FONT}`;
  g.fillStyle = '#ffffff';
  g.textAlign = 'right';
  const when = new Date(caption.at);
  const stamp = `Fahrt #${caption.ride} · ${when.toLocaleDateString('de-DE')} ${when.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  g.fillText(stamp, W - 32, H - 58);
  g.fillStyle = '#c9d1d9';
  g.fillText(caption.names.join(' · ').slice(0, 70) || 'Leerfahrt', W - 32, H - 32);
  g.textAlign = 'left';
  return { canvas, ...caption };
}

/** Puts the picture on the station's monitor. */
export function showOnMonitor(photo: RidePhoto, monitor: { canvas: HTMLCanvasElement; texture: THREE.Texture }) {
  const g = monitor.canvas.getContext('2d')!;
  g.drawImage(photo.canvas, 0, 0, monitor.canvas.width, monitor.canvas.height);
  monitor.texture.needsUpdate = true;
}

/** The photo big, with a button to save it, and the leaderboard under it (✕ or Esc back to the roof). */
export function openPhoto(photo: RidePhoto | null, leaders: CoasterLeader[] = [], rides = 0) {
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close' }, '✕');
  const body = h('div.body', { style: 'display:flex;flex-direction:column;gap:12px;align-items:center' });
  if (photo) {
    const img = h('img', { src: photo.canvas.toDataURL('image/jpeg', 0.92), alt: `Fahrtfoto ${photo.ride}`, style: 'max-width:min(80vw,960px);width:100%;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35)' });
    const save = h('a.btn.primary', { download: `der-brecher-fahrt-${photo.ride}.jpg`, href: img.getAttribute('src')! }, '💾 Foto speichern');
    body.append(img, h('div', { style: 'opacity:.8' }, photo.names.join(' · ') || 'Leerfahrt'), save);
  } else body.append(h('p', { style: 'margin:24px 8px;max-width:420px;text-align:center' }, 'Noch kein Foto hier. Unten am ersten Drop blitzt es: fahr mit (oder schau zu, hier oben auf dem Dach), dann hängt es auf dem Monitor.'));
  const rows = leaders.map((l, i) => h('tr', {}, h('td', {}, `${i + 1}. ${l.name}`), h('td', { style: 'text-align:right' }, String(l.rides)), h('td', { style: 'text-align:right' }, `${l.hands.toFixed(1)} s`)));
  body.append(
    h('h3', { style: 'margin:8px 0 0' }, `🏆 Bestenliste · ${rides} Fahrt${rides === 1 ? '' : 'en'} bisher`),
    leaders.length
      ? h('table', { style: 'min-width:min(80vw,420px);border-spacing:12px 4px' }, h('tr', {}, h('th', { style: 'text-align:left' }, 'Wer'), h('th', {}, 'Fahrten'), h('th', {}, '🙌 Hände oben')), ...rows)
      : h('p', {}, 'Noch niemand gefahren.'),
  );
  const el = h('div.modal', { role: 'dialog', 'aria-label': 'Ride photo', style: 'max-width:min(92vw,1020px)' }, h('header', {}, h('h2', {}, `📸 ${COASTER_NAME} · Fahrtfoto`), close), body);
  const modal = openModal(el, { doing: '📸 looking at the ride photo' });
  close.addEventListener('click', () => modal.close());
}

import * as THREE from 'three';
import { canvasTexture } from '../casino/parts';

// Bits the gym's outside and inside share (flrnoh fork, see FORK.md). The generic helpers (box, the
// neon sign, glowing materials, the chaser bulbs) are the casino's; the gym adds its own surfaces.

export { box, canvasTexture, glow, neonSign, FONT, chaser } from '../casino/parts';

/** Black rubber gym flooring: dark tiles flecked with grey and a hint of colour, tiling every metre. */
export function rubberFloor(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#20262b';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 240; i++) {
      const x = Math.floor((i * 53) % 128);
      const y = Math.floor((i * 97) % 128);
      const c = i % 11 === 0 ? '#7fbf6a' : i % 7 === 0 ? '#5a6570' : '#3a434c';
      g.fillStyle = c;
      g.fillRect(x, y, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A rubber gym mat in a colour, with a soft border: the stretch studio and the free-weights zone. */
export function matTexture(color: string, border = '#a3e635'): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = border;
    g.lineWidth = 4;
    g.strokeRect(3, 3, 58, 58);
  });
}

/** A wall of mirrors: a cool sheen with faint vertical seams between the panels. */
export function mirrorTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#cfe8ef');
    grd.addColorStop(0.5, '#aac6d2');
    grd.addColorStop(1, '#c3dbe4');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 128);
      g.stroke();
    }
    // A soft diagonal glare.
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(0, 40);
    g.lineTo(90, 0);
    g.lineTo(150, 0);
    g.lineTo(20, 128);
    g.lineTo(0, 128);
    g.closePath();
    g.fill();
  });
}

import * as THREE from 'three';
import { SMOOTHIES } from '../../../shared/gym';
import { FONT, canvasTexture } from './parts';

/*
 * The gym's painted surfaces (flrnoh fork, see FORK.md "Rooms, spa and detail"): floors for each
 * zone, the sauna's planks and the steam room's mosaic, the windows' view, posters, the class
 * timetable, the juice bar's menu, and the TV's workout video. All canvases, drawn once (the TV
 * redraws a few times a second).
 */

const repeat = (t: THREE.CanvasTexture, x: number, y: number) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
};

/** A small seeded random, so the speckles look the same every time. */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Square tiles with grout: the spa's warm stone, the steam room's mosaic, the showers'. */
export function tiles(base: string, grout: string, n: number, vary = 0.06, seed = 7): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = grout;
    g.fillRect(0, 0, 256, 256);
    const s = 256 / n;
    const c = new THREE.Color(base);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const k = 1 + (r() - 0.5) * vary * 2;
        g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
        g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
      }
  });
}

/** Wooden planks running along the texture's x (the sauna's walls and benches, the juice bar). */
export function planks(base: string, rows = 8, seed = 3): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(256, 256, (g) => {
    const c = new THREE.Color(base);
    const h = 256 / rows;
    for (let i = 0; i < rows; i++) {
      g.fillStyle = `#${c.clone().multiplyScalar(0.9 + r() * 0.2).getHexString()}`;
      g.fillRect(0, i * h, 256, h);
      // grain
      g.strokeStyle = 'rgba(60,30,10,0.18)';
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const y = i * h + 3 + r() * (h - 6);
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + (r() - 0.5) * 4, 170, y + (r() - 0.5) * 4, 256, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,20,5,0.45)';
      g.fillRect(0, i * h + h - 2, 256, 2);
      // a butt joint somewhere along each plank
      const x = r() * 256;
      g.fillRect(x, i * h, 2, h);
    }
  });
}

/** Artificial turf: green with mown stripes, a white line down each side. */
export function turf(): THREE.CanvasTexture {
  return canvasTexture(512, 128, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#2f7d3a' : '#338a40';
      g.fillRect(i * 64, 0, 64, 128);
    }
    const r = rand(11);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(20,60,25,0.5)' : 'rgba(120,200,110,0.35)';
      g.fillRect(r() * 512, r() * 128, 1.5, 3);
    }
    g.fillStyle = '#f3f6ee';
    g.fillRect(0, 4, 512, 5);
    g.fillRect(0, 119, 512, 5);
    // yard marks every "10 m"
    for (let i = 1; i < 8; i++) g.fillRect(i * 64 - 2, 12, 4, 14);
    g.font = `800 20px ${FONT}`;
    g.fillStyle = 'rgba(243,246,238,0.8)';
    g.textAlign = 'center';
    for (let i = 1; i < 8; i++) g.fillText(`${i * 2}`, i * 64, 44);
  });
}

/** A zone of rubber: a colour, flecks, and a lime line round it. */
export function zoneRubber(base: string, fleck: string, border = '#a3e635', w = 512, h = 256): THREE.CanvasTexture {
  const r = rand(5);
  return canvasTexture(w, h, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 90; i++) {
      g.fillStyle = r() > 0.8 ? fleck : 'rgba(0,0,0,0.25)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.strokeStyle = border;
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
}

/** Square rubber tiles with a lime seam (the free-weights floor). */
export function weightTiles(): THREE.CanvasTexture {
  const r = rand(9);
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#1b1f23';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = r() > 0.85 ? '#4d5b66' : '#2b3238';
      g.fillRect(r() * 128, r() * 128, 2, 2);
    }
    g.strokeStyle = '#0c0f11';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
  });
}

/** A lifting platform: a wooden middle with black rubber either side and a lime frame. */
export function platform(): THREE.CanvasTexture {
  return canvasTexture(256, 192, (g) => {
    g.fillStyle = '#15191c';
    g.fillRect(0, 0, 256, 192);
    const wood = planks('#b98a55', 6, 21).image as HTMLCanvasElement;
    g.drawImage(wood, 64, 8, 128, 176);
    g.strokeStyle = '#a3e635';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 186);
  });
}

/** Polished concrete for the lobby. */
export function concrete(): THREE.CanvasTexture {
  const r = rand(13);
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#8d9296';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      const s = 1 + r() * 3;
      g.fillRect(r() * 256, r() * 256, s, s);
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
  });
}

/** The entrance mat with the gym's barbell and name. */
export function entranceMat(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#1a1f22';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#a3e635';
    g.lineWidth = 10;
    g.strokeRect(12, 12, 488, 232);
    g.fillStyle = '#a3e635';
    g.fillRect(150, 72, 212, 16);
    g.fillRect(160, 44, 26, 72);
    g.fillRect(326, 44, 26, 72);
    g.font = `900 64px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('WELCOME', 256, 196);
  });
}

/** What you see through the big windows: sky, the street's far side, a tree or two. Drawn once. */
export function windowView(w = 1024, h = 320, seed = 17): THREE.CanvasTexture {
  const r = rand(seed);
  return canvasTexture(w, h, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#a9d4f5');
    sky.addColorStop(0.65, '#e3f1fb');
    sky.addColorStop(1, '#f4f7f2');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // the office block across the street, and its neighbours
    let x = 0;
    while (x < w) {
      const bw = 90 + r() * 170;
      const bh = h * (0.35 + r() * 0.35);
      g.fillStyle = ['#c9c2b8', '#b8bfc6', '#d6cbbd', '#aab4bb'][Math.floor(r() * 4)];
      g.fillRect(x, h - bh, bw - 6, bh);
      g.fillStyle = 'rgba(80,110,140,0.45)';
      for (let yy = h - bh + 12; yy < h - 30; yy += 26) for (let xx = x + 10; xx < x + bw - 22; xx += 22) g.fillRect(xx, yy, 12, 14);
      x += bw;
    }
    // trees along the pavement
    for (let i = 0; i < 6; i++) {
      const tx = (i + 0.5 + (r() - 0.5) * 0.4) * (w / 6);
      g.fillStyle = '#5b4a36';
      g.fillRect(tx - 4, h - 70, 8, 60);
      g.fillStyle = i % 2 ? '#6aa84f' : '#7cbf5a';
      g.beginPath();
      g.arc(tx, h - 86, 34, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9aa3a8';
    g.fillRect(0, h - 14, w, 14);
    // a soft reflection over the glass
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.moveTo(w * 0.1, 0);
    g.lineTo(w * 0.3, 0);
    g.lineTo(w * 0.15, h);
    g.lineTo(0, h);
    g.closePath();
    g.fill();
  });
}

/** A motivational poster: a bold line, a small one, and a colour block. */
export function poster(big: string, small: string, bg: string, fg: string, accent = '#a3e635'): THREE.CanvasTexture {
  return canvasTexture(256, 360, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 360);
    g.fillStyle = accent;
    g.beginPath();
    g.moveTo(0, 250);
    g.lineTo(256, 170);
    g.lineTo(256, 360);
    g.lineTo(0, 360);
    g.closePath();
    g.fill();
    g.fillStyle = fg;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const words = big.split(' ');
    let y = 26;
    for (const word of words) {
      let px = 62;
      g.font = `900 ${px}px ${FONT}`;
      while (g.measureText(word).width > 220 && px > 20) g.font = `900 ${(px -= 3)}px ${FONT}`;
      g.fillText(word, 18, y);
      y += px * 0.95;
    }
    g.font = `700 20px ${FONT}`;
    g.fillStyle = bg;
    g.fillText(small, 18, 318);
    g.strokeStyle = '#111';
    g.lineWidth = 8;
    g.strokeRect(0, 0, 256, 360);
  });
}

/** The class timetable by the stretch area. */
export function timetable(): THREE.CanvasTexture {
  const days = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  const slots = ['07:00', '12:15', '18:00', '19:30'];
  const classes = [
    ['Spinning', 'Yoga', 'HIIT', 'Pilates', 'Spinning', 'Yoga'],
    ['Core 30', 'Boxen', 'Core 30', 'Boxen', 'Stretch', '—'],
    ['Zirkel', 'Spinning', 'Kettlebell', 'Zirkel', 'Aufguss 🧖', 'Aufguss 🧖'],
    ['Yoga', 'Functional', 'Yoga', 'Functional', 'Party-Cardio', '—'],
  ];
  const colors: Record<string, string> = { Spinning: '#35e0d0', Yoga: '#c9a0ff', HIIT: '#ff6b6b', Pilates: '#ffd36b', Boxen: '#ff8c42', Zirkel: '#a3e635', Kettlebell: '#a3e635', Functional: '#a3e635' };
  return canvasTexture(768, 480, (g) => {
    g.fillStyle = '#12181c';
    g.fillRect(0, 0, 768, 480);
    g.strokeStyle = '#a3e635';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 760, 472);
    g.fillStyle = '#a3e635';
    g.font = `900 40px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('KURSPLAN · CLASSES', 26, 44);
    const x0 = 110;
    const cw = (768 - x0 - 20) / days.length;
    g.font = `800 24px ${FONT}`;
    g.fillStyle = '#f0f4f2';
    g.textAlign = 'center';
    days.forEach((d, i) => g.fillText(d, x0 + cw * (i + 0.5), 96));
    slots.forEach((s, j) => {
      const y = 140 + j * 84;
      g.textAlign = 'left';
      g.fillStyle = '#9fb0a8';
      g.font = `700 22px ${FONT}`;
      g.fillText(s, 20, y + 22);
      classes[j].forEach((c, i) => {
        const x = x0 + cw * i + 4;
        const col = colors[c.split(' ')[0]] ?? '#5b6b73';
        g.fillStyle = c === '—' ? 'rgba(255,255,255,0.05)' : `${col}33`;
        g.fillRect(x, y, cw - 8, 70);
        g.fillStyle = c === '—' ? '#555' : col;
        g.fillRect(x, y, 6, 70);
        g.fillStyle = '#eef3f0';
        g.font = `700 ${c.length > 9 ? 16 : 19}px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(c, x + (cw - 8) / 2 + 3, y + 35);
      });
    });
  });
}

/** The juice bar's menu board: the smoothies the bar pours (shared/gym.ts SMOOTHIES). */
export function juiceMenu(): THREE.CanvasTexture {
  return canvasTexture(768, 384, (g) => {
    g.fillStyle = '#1e2a1f';
    g.fillRect(0, 0, 768, 384);
    g.strokeStyle = '#8a6a44';
    g.lineWidth = 16;
    g.strokeRect(8, 8, 752, 368);
    g.fillStyle = '#a3e635';
    g.font = `900 48px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('JUICE BAR', 384, 58);
    g.font = `700 26px ${FONT}`;
    SMOOTHIES.forEach((s, i) => {
      const y = 130 + i * 58;
      g.textAlign = 'left';
      g.fillStyle = '#f4f1e8';
      g.fillText(`${s.icon}  ${s.name}`, 48, y);
      g.fillStyle = '#ffd6a5';
      g.font = `500 20px ${FONT}`;
      g.fillText(s.note, 360, y);
      g.textAlign = 'right';
      g.fillStyle = '#a3e635';
      g.font = `800 24px ${FONT}`;
      g.fillText(`+${s.energy} ⚡`, 730, y);
      g.font = `700 26px ${FONT}`;
    });
  });
}

/** The logo wall behind reception: the barbell and the name, lime on dark. */
export function logoPanel(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#1b2227';
    g.fillRect(0, 0, 512, 256);
    g.shadowColor = '#a3e635';
    g.shadowBlur = 18;
    g.fillStyle = '#a3e635';
    g.fillRect(156, 60, 200, 14);
    g.fillRect(166, 34, 24, 66);
    g.fillRect(322, 34, 24, 66);
    g.fillRect(196, 44, 14, 46);
    g.fillRect(302, 44, 14, 46);
    g.font = `900 70px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FITNESS', 256, 162);
    g.shadowBlur = 0;
    g.font = `700 24px ${FONT}`;
    g.fillStyle = '#cfd8d3';
    g.fillText('train · recover · repeat', 256, 216);
  });
}

/** A bank of lockers: doors with vents, numbers and a lime lock light. */
export function lockerFront(cols = 4, rows = 2, start = 1): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#2d3a44';
    g.fillRect(0, 0, 256, 256);
    const w = 256 / cols;
    const h = 256 / rows;
    let n = start;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * w;
        const y = j * h;
        g.fillStyle = (i + j) % 2 ? '#3b4d5a' : '#37495a';
        g.fillRect(x + 3, y + 3, w - 6, h - 6);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (let k = 0; k < 4; k++) g.fillRect(x + 12, y + 14 + k * 8, w - 24, 3);
        g.fillStyle = '#e6ecef';
        g.font = `800 16px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(n++), x + w / 2, y + h * 0.62);
        g.fillStyle = '#a3e635';
        g.fillRect(x + w - 16, y + h / 2 - 3, 6, 6);
      }
  });
}

/** A frosted glass pane with a soft band (the spa's partition above its wood). */
export function frosted(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(230,245,250,0.55)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(230,245,250,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A soft round puff, for steam, mist and bubbles (the particles' sprite). */
export function softDot(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Water seen from above: a colour with light ripples (the jacuzzi, the plunge); scroll its offset to move it. */
export function water(base: string, light: string, seed = 23): THREE.CanvasTexture {
  const r = rand(seed);
  const t = canvasTexture(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = light;
    g.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const x = r() * 128;
      const y = r() * 128;
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 14, 2 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
      g.stroke();
    }
  });
  return repeat(t, 2, 2);
}

/** A curtain's folds, light and shade. */
export function curtain(base: string): THREE.CanvasTexture {
  return canvasTexture(128, 64, (g) => {
    const c = new THREE.Color(base);
    for (let x = 0; x < 128; x++) {
      const k = 0.78 + 0.22 * Math.sin((x / 128) * Math.PI * 10);
      g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
      g.fillRect(x, 0, 1, 64);
    }
  });
}

/**
 * The TV's workout video: a trainer on a studio floor doing a loop of moves (jumping jacks, squats,
 * high knees), a timer and a caption. `draw(t)` paints the frame for time t (seconds).
 */
export class WorkoutVideo {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private last = -1;
  constructor(
    private w = 320,
    private h = 180,
  ) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.g = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0);
  }

  /** Repaints for time `t`, at most ~12 times a second. */
  update(t: number) {
    const frame = Math.floor(t * 12);
    if (frame === this.last) return;
    this.last = frame;
    this.draw(t);
    this.texture.needsUpdate = true;
  }

  private draw(t: number) {
    const { g, w, h } = this;
    const moves = ['JUMPING JACKS', 'SQUATS', 'HIGH KNEES'];
    const cycle = t % 30;
    const move = Math.floor(cycle / 10);
    const sec = 10 - Math.floor(cycle % 10);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, move === 1 ? '#23364a' : move === 2 ? '#3a2340' : '#1f3b33');
    bg.addColorStop(1, '#0d1417');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // the studio floor
    g.fillStyle = '#2a2f33';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#a3e635';
    g.fillRect(0, h * 0.78, w, 2);
    // the trainer
    const beat = (t * 2.2) % 1;
    const s = Math.sin(beat * Math.PI * 2);
    const cx = w * 0.38;
    const floor = h * 0.8;
    let hip = floor - 46;
    let armA = 0.4;
    let legA = 0.12;
    let knee = 0;
    if (move === 0) {
      armA = 0.35 + (s * 0.5 + 0.5) * 2.4;
      legA = 0.1 + (s * 0.5 + 0.5) * 0.35;
      hip -= Math.abs(s) * 6;
    } else if (move === 1) {
      const d = s * 0.5 + 0.5;
      hip += d * 20;
      armA = 1.5;
      legA = 0.2 + d * 0.3;
    } else {
      knee = s;
      armA = 0.6 + s * 0.4;
    }
    g.lineCap = 'round';
    g.strokeStyle = '#f5d7b8';
    g.lineWidth = 7;
    const shoulder = hip - 34;
    const limb = (x0: number, y0: number, a: number, len: number, side: number) => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + Math.sin(a) * len * side, y0 + Math.cos(a) * len);
      g.stroke();
    };
    // legs
    g.strokeStyle = '#1d1d1f';
    for (const side of [-1, 1]) {
      if (move === 2 && (side > 0 ? knee > 0 : knee < 0)) {
        const up = Math.abs(knee);
        g.beginPath();
        g.moveTo(cx, hip);
        g.lineTo(cx + side * 6, hip + 22 - up * 20);
        g.lineTo(cx + side * 8, hip + 44 - up * 22);
        g.stroke();
      } else limb(cx, hip, legA, floor - hip, side);
    }
    // body
    g.strokeStyle = '#a3e635';
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(cx, hip);
    g.lineTo(cx, shoulder);
    g.stroke();
    // arms
    g.strokeStyle = '#f5d7b8';
    g.lineWidth = 6;
    for (const side of [-1, 1]) limb(cx, shoulder + 3, Math.PI - armA, 28, side);
    // head
    g.fillStyle = '#f5d7b8';
    g.beginPath();
    g.arc(cx, shoulder - 12, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a2a1e';
    g.fillRect(cx - 9, shoulder - 22, 18, 6);
    // the caption and timer
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(w * 0.58, 16, w * 0.38, 70);
    g.fillStyle = '#a3e635';
    g.font = `900 36px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`0:${String(sec).padStart(2, '0')}`, w * 0.77, 38);
    g.fillStyle = '#ffffff';
    g.font = `800 13px ${FONT}`;
    g.fillText(moves[move], w * 0.77, 70);
    // progress bar
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(12, h - 12, w - 24, 5);
    g.fillStyle = '#a3e635';
    g.fillRect(12, h - 12, (w - 24) * ((cycle % 10) / 10), 5);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `700 11px ${FONT}`;
    g.textAlign = 'left';
    g.fillText('● LIVE  FIT TV', 12, 16);
  }
}

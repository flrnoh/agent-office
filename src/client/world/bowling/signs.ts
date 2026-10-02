import * as THREE from 'three';
import { canvasTexture, FONT } from '../casino/parts';

/*
 * The bowling centre's pictures (flrnoh fork, see FORK.md "The bowling centre"): its neon on the roof,
 * the posters by the doors, the lobby seen through the curved glass, the mural on the wall facing the
 * office, the giant pin's paint and the ball's swirl, the starbursts. All drawn here, no images, no
 * logos of anybody's: a made-up 50s bowling alley's look.
 */

/** The retro palette: teal, cherry red, cream, mustard, the night's violet. */
export const RETRO = { teal: '#2a9d8f', tealDark: '#1d6f66', cherry: '#e63946', cream: '#fdf3dc', mustard: '#f4b942', ink: '#1b1b2f', violet: '#7b2cbf', pink: '#ff4fa3', aqua: '#4cf2ff' } as const;

/** A starburst: `points` long rays and short ones between, from the middle out. */
export function drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number, color: string, inner = 0.18) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** A sparkle on a see-through ground: an atomic-age starburst. */
export function starTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    drawStar(g, 64, 64, 62, 8, color, 0.16);
    drawStar(g, 64, 64, 34, 8, '#ffffff', 0.3);
  });
}

/** Chunky slanted letters with a neon tube round each: the word on the roof. */
export function roofSign(text = 'BOWLING'): THREE.CanvasTexture {
  const w = 2048;
  const h = 420;
  return canvasTexture(w, h, (g) => {
    let px = 330;
    g.font = `italic 900 ${px}px ${FONT}`;
    while (g.measureText(text).width > w * 0.84 && px > 40) g.font = `italic 900 ${(px -= 6)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const y = h * 0.54;
    // The sign's body behind the letters: a cream panel each, with a red edge.
    g.lineJoin = 'round';
    g.strokeStyle = RETRO.cherry;
    g.lineWidth = px * 0.2;
    g.strokeText(text, w / 2, y);
    g.strokeStyle = RETRO.cream;
    g.lineWidth = px * 0.11;
    g.strokeText(text, w / 2, y);
    // The letters: cherry, with the neon's white-hot core and its glow.
    g.shadowColor = '#ff5a6e';
    g.shadowBlur = px * 0.12;
    g.fillStyle = RETRO.cherry;
    g.fillText(text, w / 2, y);
    g.shadowBlur = 0;
    g.lineWidth = Math.max(3, px * 0.025);
    g.strokeStyle = 'rgba(255,240,240,0.95)';
    g.strokeText(text, w / 2, y);
    // Stars at either end.
    drawStar(g, w * 0.04, h * 0.3, h * 0.2, 8, RETRO.mustard);
    drawStar(g, w * 0.965, h * 0.72, h * 0.16, 8, RETRO.aqua);
  });
}

/** The fascia over the entrance: BOWLING CENTER in a teal script, two stars. */
export function fasciaSign(): THREE.CanvasTexture {
  const w = 1024;
  const h = 160;
  return canvasTexture(w, h, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 800 92px ${FONT}`;
    g.shadowColor = RETRO.aqua;
    g.shadowBlur = 18;
    g.fillStyle = '#c9fbff';
    g.fillText('Bowling Center', w / 2, h * 0.55);
    g.shadowBlur = 0;
    drawStar(g, 70, h / 2, 46, 8, RETRO.mustard);
    drawStar(g, w - 70, h / 2, 46, 8, RETRO.mustard);
  });
}

export type PosterKind = 'cosmic' | 'karaoke' | 'minigolf' | 'counter';

/** The lit posters by the doors: what's on in there. */
export function posterTexture(kind: PosterKind): THREE.CanvasTexture {
  return canvasTexture(240, 340, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 340);
    const [a, b] = kind === 'cosmic' ? ['#1a0a3d', '#5a189a'] : kind === 'karaoke' ? ['#3d0a2a', '#c9184a'] : kind === 'minigolf' ? ['#04151f', '#0b4f6c'] : [RETRO.cream, '#f6dcae'];
    bg.addColorStop(0, a);
    bg.addColorStop(1, b);
    g.fillStyle = bg;
    g.fillRect(0, 0, 240, 340);
    g.textAlign = 'center';
    const title = (t: string, y: number, color: string, size = 34) => {
      g.font = `italic 900 ${size}px ${FONT}`;
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.fillStyle = '#ffffff';
      g.fillText(t, 120, y);
      g.shadowBlur = 0;
    };
    const line = (t: string, y: number, color: string, size = 17, weight = 800) => {
      g.font = `${weight} ${size}px ${FONT}`;
      g.fillStyle = color;
      g.fillText(t, 120, y);
    };
    if (kind === 'cosmic') {
      for (let i = 0; i < 26; i++) drawStar(g, (i * 97) % 240, (i * 53) % 340, 3 + (i % 4), 4, i % 2 ? RETRO.aqua : RETRO.pink, 0.3);
      title('COSMIC', 70, RETRO.pink, 44);
      title('BOWLING', 112, RETRO.aqua, 40);
      // A glowing pin and ball.
      g.fillStyle = '#e0fbff';
      g.beginPath();
      g.ellipse(95, 215, 18, 44, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = RETRO.pink;
      g.fillRect(80, 186, 30, 6);
      g.fillStyle = '#9d4edd';
      g.beginPath();
      g.arc(150, 240, 30, 0, Math.PI * 2);
      g.fill();
      line('Schwarzlicht · Nebel · Disco', 300, '#e0c3fc', 15);
      line('FR + SA ab 20 Uhr', 322, '#ffffff', 16, 900);
    } else if (kind === 'karaoke') {
      title('KARAOKE', 72, RETRO.pink, 40);
      line('Bühne frei!', 110, '#ffd6e0', 20, 900);
      // A mic.
      g.fillStyle = '#d9d9d9';
      g.beginPath();
      g.arc(120, 180, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6c757d';
      g.fillRect(112, 205, 16, 70);
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.beginPath();
        g.arc(120, 180, 30, Math.PI * (0.15 + i * 0.15), Math.PI * (0.22 + i * 0.15));
        g.stroke();
      }
      line('jeden Abend an der Bar', 306, '#ffffff', 16);
      line('Mikro an, Licht aus', 326, '#ffd6e0', 15);
    } else if (kind === 'minigolf') {
      title('SCHWARZLICHT', 66, RETRO.aqua, 30);
      title('MINIGOLF', 104, '#b5ff3c', 38);
      // A neon hole and a ball.
      g.strokeStyle = '#b5ff3c';
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(120, 220, 70, 22, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = RETRO.pink;
      g.beginPath();
      g.arc(150, 214, 10, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = RETRO.aqua;
      g.beginPath();
      g.moveTo(80, 150);
      g.lineTo(140, 210);
      g.stroke();
      line('9 Bahnen im UV-Licht', 300, '#d8fbff', 16);
      line('drinnen, hinten links', 322, '#ffffff', 15);
    } else {
      g.fillStyle = RETRO.cherry;
      g.fillRect(0, 0, 240, 64);
      title('HEUTE', 44, '#ffffff', 34);
      line('6 Bahnen · Schuhverleih', 104, RETRO.ink, 18, 900);
      line('Bier vom Fass', 150, RETRO.tealDark, 18);
      line('Pommes rot-weiß', 178, RETRO.tealDark, 18);
      line('Currywurst · Nachos', 206, RETRO.tealDark, 18);
      line('Spezi · Cola · Radler', 234, RETRO.tealDark, 18);
      drawStar(g, 120, 290, 30, 8, RETRO.mustard);
      line('täglich bis spät', 330, RETRO.ink, 15);
    }
  });
}

/** What you see of the lobby through the curved glass: a carpet, a counter's glow and the lanes going away under the lights. */
export function lobbyTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 300;
  return canvasTexture(w, h, (g) => {
    const wall = g.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, '#3a1f52');
    wall.addColorStop(0.55, '#5b2a6e');
    wall.addColorStop(1, '#2a1238');
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    // The lanes, going away in the middle: an opening into the hall.
    const ox = w * 0.3;
    const ow = w * 0.4;
    g.fillStyle = '#120a1c';
    g.fillRect(ox, h * 0.18, ow, h * 0.62);
    const vy = h * 0.5;
    // The masking units over the pins, a neon strip along them.
    g.fillStyle = '#2a1840';
    g.fillRect(ox, h * 0.18, ow, h * 0.25);
    g.fillStyle = RETRO.pink;
    g.fillRect(ox, h * 0.42, ow, 3);
    for (let i = 0; i < 6; i++) {
      const x0 = ox + (i / 6) * ow;
      const x1 = ox + ((i + 1) / 6) * ow;
      const mx = w / 2;
      g.fillStyle = i % 2 ? '#d9a066' : '#e8b37a';
      g.beginPath();
      g.moveTo(x0 + 3, h * 0.8);
      g.lineTo(x1 - 3, h * 0.8);
      g.lineTo(mx + (x1 - mx) * 0.18, vy);
      g.lineTo(mx + (x0 - mx) * 0.18, vy);
      g.closePath();
      g.fill();
      // The pins far off.
      g.fillStyle = '#ffffff';
      for (let p = 0; p < 4; p++) g.fillRect(mx + ((x0 + x1) / 2 - mx) * 0.18 - 6 + p * 4, vy - 10, 2, 9);
    }
    // Lights over the lanes, and the neon round the opening.
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(255,248,220,0.9)';
      g.fillRect(ox + 10 + i * (ow / 7), h * 0.21, ow / 10, 5);
    }
    g.strokeStyle = RETRO.aqua;
    g.shadowColor = RETRO.aqua;
    g.shadowBlur = 16;
    g.lineWidth = 5;
    g.strokeRect(ox, h * 0.18, ow, h * 0.62);
    g.shadowBlur = 0;
    // The counter's glow on the left, a row of shoes; the arcade's on the right.
    g.fillStyle = RETRO.cherry;
    g.fillRect(w * 0.04, h * 0.58, w * 0.2, h * 0.22);
    g.fillStyle = RETRO.cream;
    g.fillRect(w * 0.04, h * 0.56, w * 0.2, h * 0.035);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? RETRO.cherry : RETRO.teal;
      g.fillRect(w * 0.05 + i * 18, h * 0.3, 12, 9);
      g.fillRect(w * 0.05 + i * 18, h * 0.4, 12, 9);
    }
    g.fillStyle = '#20123a';
    g.fillRect(w * 0.8, h * 0.36, w * 0.06, h * 0.44);
    g.fillRect(w * 0.88, h * 0.36, w * 0.06, h * 0.44);
    g.fillStyle = '#56f0ff';
    g.fillRect(w * 0.81, h * 0.42, w * 0.04, h * 0.1);
    g.fillStyle = '#ff6bd6';
    g.fillRect(w * 0.89, h * 0.42, w * 0.04, h * 0.1);
    // The carpet along the bottom: dark, with neon squiggles.
    g.fillStyle = '#16123a';
    g.fillRect(0, h * 0.8, w, h * 0.2);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = [RETRO.aqua, RETRO.pink, RETRO.mustard][i % 3];
      g.lineWidth = 3;
      g.beginPath();
      const x = (i * 131) % w;
      const y = h * 0.84 + ((i * 37) % 40);
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 8, x + 20, y);
      g.stroke();
    }
  });
}

/** The wall facing the office: a big painted mural, a ball rolling into the pins under a starburst, and STRIKE! */
export function muralTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 400;
  return canvasTexture(w, h, (g) => {
    g.fillStyle = RETRO.cream;
    g.fillRect(0, 0, w, h);
    // Sun-faded stripes across.
    g.fillStyle = RETRO.teal;
    g.fillRect(0, h * 0.78, w, h * 0.06);
    g.fillStyle = RETRO.cherry;
    g.fillRect(0, h * 0.86, w, h * 0.025);
    // Boomerangs and dots, the 50s way.
    for (let i = 0; i < 14; i++) {
      g.save();
      g.translate(80 + i * 145, 60 + (i % 3) * 30);
      g.rotate((i % 4) * 0.7);
      g.fillStyle = [RETRO.mustard, RETRO.teal, RETRO.pink][i % 3];
      g.beginPath();
      g.moveTo(-26, 0);
      g.quadraticCurveTo(0, -24, 26, 0);
      g.quadraticCurveTo(0, -10, -26, 0);
      g.fill();
      g.restore();
    }
    // The pins on the right, the ball rolling in from the left.
    const pin = (x: number, y: number, s: number, tilt: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      g.scale(s, s);
      g.fillStyle = '#ffffff';
      g.strokeStyle = RETRO.ink;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, -95);
      g.bezierCurveTo(22, -95, 22, -60, 12, -48);
      g.bezierCurveTo(38, -20, 40, 30, 22, 60);
      g.lineTo(-22, 60);
      g.bezierCurveTo(-40, 30, -38, -20, -12, -48);
      g.bezierCurveTo(-22, -60, -22, -95, 0, -95);
      g.fill();
      g.stroke();
      g.fillStyle = RETRO.cherry;
      g.fillRect(-14, -52, 28, 6);
      g.fillRect(-15, -42, 30, 6);
      g.restore();
    };
    drawStar(g, w * 0.72, h * 0.42, h * 0.4, 12, RETRO.mustard, 0.45);
    pin(w * 0.68, h * 0.55, 1.15, -0.5);
    pin(w * 0.75, h * 0.5, 1.2, 0.35);
    pin(w * 0.8, h * 0.6, 1.1, 0.9);
    pin(w * 0.71, h * 0.62, 1.05, -1.1);
    // The ball, with speed lines.
    g.strokeStyle = RETRO.teal;
    g.lineWidth = 10;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(w * 0.36, h * (0.48 + i * 0.08));
      g.lineTo(w * 0.52, h * (0.48 + i * 0.08));
      g.stroke();
    }
    const grd = g.createRadialGradient(w * 0.585, h * 0.52, 10, w * 0.6, h * 0.56, 90);
    grd.addColorStop(0, '#8e7dff');
    grd.addColorStop(1, '#2b1a6e');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(w * 0.6, h * 0.56, 80, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#120a33';
    for (const [dx, dy] of [
      [-20, -30],
      [5, -36],
      [-6, -10],
    ])
      g.fill(new Path2D(`M ${w * 0.6 + dx + 9} ${h * 0.56 + dy} a 9 9 0 1 0 0.1 0`));
    // STRIKE! in a sunburst on the left, and the house's name.
    drawStar(g, w * 0.17, h * 0.45, h * 0.36, 16, RETRO.cherry, 0.6);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 900 120px ${FONT}`;
    g.lineWidth = 12;
    g.strokeStyle = RETRO.ink;
    g.strokeText('STRIKE!', w * 0.17, h * 0.46);
    g.fillStyle = '#ffffff';
    g.fillText('STRIKE!', w * 0.17, h * 0.46);
    g.font = `italic 900 70px ${FONT}`;
    g.fillStyle = RETRO.tealDark;
    g.fillText('Bowling · Karaoke · Minigolf', w * 0.38, h * 0.93 - 40);
  });
}

/** The giant pin's paint, round it (u) and up it (v): white, two cherry stripes at the neck. */
export function pinTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 512, (g) => {
    g.fillStyle = '#fbfbf6';
    g.fillRect(0, 0, 64, 512);
    // v runs bottom (0) to top (1); the canvas top is v 1. The neck is at about 0.68–0.74 up.
    g.fillStyle = RETRO.cherry;
    g.fillRect(0, 512 * (1 - 0.735), 64, 512 * 0.022);
    g.fillRect(0, 512 * (1 - 0.7), 64, 512 * 0.022);
  });
}

/** The pin's outline, bottom to top, for a lathe (x out, y up; a 1 m tall pin). */
export function pinProfile(): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0, 0],
    [0.1, 0],
    [0.14, 0.06],
    [0.18, 0.18],
    [0.19, 0.3],
    [0.17, 0.42],
    [0.12, 0.54],
    [0.075, 0.64],
    [0.065, 0.7],
    [0.075, 0.78],
    [0.095, 0.86],
    [0.09, 0.93],
    [0.06, 0.985],
    [0, 1],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
}

/** The ball's swirl: marbled violet and blue. */
export function ballTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 128, (g) => {
    g.fillStyle = '#2b1a6e';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = i % 3 === 0 ? 'rgba(160,120,255,0.55)' : i % 3 === 1 ? 'rgba(60,200,255,0.4)' : 'rgba(255,255,255,0.18)';
      g.lineWidth = 2 + (i % 5);
      g.beginPath();
      const y = (i * 29) % 128;
      g.moveTo(0, y);
      g.bezierCurveTo(64, y - 30 + (i % 7) * 8, 160, y + 30 - (i % 5) * 9, 256, y);
      g.stroke();
    }
  });
}

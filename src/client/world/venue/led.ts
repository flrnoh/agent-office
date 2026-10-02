import * as THREE from 'three';
import { mesh, toon } from '../toon';
import { box } from '../casino/parts';
import { BOLD, drawLogo } from './signs';
import { billTonight } from './bill';
import type { Look } from './lighting';

/*
 * The LED wall over the stage (flrnoh fork, see FORK.md "The Schallwerk"): a canvas drawn twenty times
 * a second, shown on a black-framed screen on the hall's back wall above the backline. In a concert
 * tonight's act (world/venue/bill.ts) in big letters over slow colour, a level bar breathing with the
 * music; in a club a spectrum of bars, rings going out on the beat and the house's mark flickering
 * through; white on the strobe, black on a blackout.
 */

const CW = 768;
const CH = 150;

export class LedWall {
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private bars = new Array(32).fill(0);
  private rings: { born: number; hue: number }[] = [];
  private lastBeat = 0;

  constructor(group: THREE.Group, at: { x: number; y: number; z: number; w: number; h: number }) {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    this.g = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex });
    mat.toneMapped = false;
    mat.userData.outlineParameters = { visible: false };
    const screen = mesh(new THREE.PlaneGeometry(at.w, at.h), mat, at.x, at.y, at.z, false);
    screen.rotation.y = Math.PI;
    group.add(screen);
    // The frame, and the panels' seams.
    group.add(mesh(box(at.w + 0.3, at.h + 0.3, 0.12), toon('#0d0d10'), at.x, at.y, at.z + 0.08, false));
  }

  draw(look: Look, t: number) {
    const g = this.g;
    const off = look.scene === 'blackout' || look.stageLevel + look.beamLevel < 0.02;
    g.fillStyle = '#000';
    g.fillRect(0, 0, CW, CH);
    if (!off) {
      if (look.flash > 0.5) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, CW, CH);
      } else if (look.mode === 'club') this.club(look, t);
      else this.concert(look, t);
    }
    // The LED panels' grid over it all.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < CW; x += 48) g.fillRect(x, 0, 2, CH);
    for (let y = 0; y < CH; y += 50) g.fillRect(0, y, CW, 2);
    this.tex.needsUpdate = true;
  }

  private concert(look: Look, t: number) {
    const g = this.g;
    const grd = g.createLinearGradient(0, 0, CW, CH);
    const a = `#${look.stage.getHexString()}`;
    const b = `#${look.accent.getHexString()}`;
    grd.addColorStop(0, a);
    grd.addColorStop(0.5 + 0.3 * Math.sin(t * 0.3), '#120814');
    grd.addColorStop(1, b);
    g.globalAlpha = 0.55;
    g.fillStyle = grd;
    g.fillRect(0, 0, CW, CH);
    g.globalAlpha = 1;
    const text = billTonight();
    let px = 96;
    g.font = `${px}px ${BOLD}`;
    while (g.measureText(text).width > CW * 0.86 && px > 20) g.font = `${(px -= 4)}px ${BOLD}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = a;
    g.shadowBlur = 24 + look.beat * 30;
    g.fillStyle = '#ffffff';
    g.fillText(text, CW / 2, CH * 0.5);
    g.shadowBlur = 0;
    // A thin level line under it.
    g.fillStyle = b;
    const w = CW * (0.1 + look.level * 0.8);
    g.fillRect((CW - w) / 2, CH - 16, w, 5);
  }

  private club(look: Look, t: number) {
    const g = this.g;
    if (look.beats !== this.lastBeat) {
      this.lastBeat = look.beats;
      this.rings.push({ born: t, hue: (look.beats * 47) % 360 });
      if (this.rings.length > 6) this.rings.shift();
    }
    // Rings going out from the middle.
    for (const r of this.rings) {
      const age = t - r.born;
      if (age > 2) continue;
      g.strokeStyle = `hsla(${r.hue},100%,60%,${1 - age / 2})`;
      g.lineWidth = 10;
      g.beginPath();
      g.ellipse(CW / 2, CH / 2, age * 380, age * 120, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // The spectrum.
    const n = this.bars.length;
    for (let i = 0; i < n; i++) {
      const want = Math.max(0.05, look.level * (0.5 + 0.5 * Math.sin(t * (3 + (i % 5)) + i)) * (1 - Math.abs(i - n / 2) / n));
      this.bars[i] = Math.max(want, this.bars[i] - 0.06);
      const h = this.bars[i] * CH * 0.9 + 6;
      g.fillStyle = `hsl(${(i * 9 + t * 40) % 360},100%,55%)`;
      g.fillRect(i * (CW / n) + 3, CH - h, CW / n - 6, h);
    }
    // The mark, flickering through now and then.
    if (Math.sin(t * 0.9) > 0.3 || look.beat > 0.6) {
      g.globalAlpha = 0.85;
      drawLogo(g, CW / 2, CH / 2 + 4, CH * 0.95, '#ffffff');
      g.globalAlpha = 1;
    }
  }
}

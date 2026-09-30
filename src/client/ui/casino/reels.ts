import { REELS, REEL_STOPS, SLOT_EMOJI } from '../../../shared/casino-slots';

/*
 * Three slot reels turning and landing on the stops the office drew (flrnoh fork, see
 * shared/casino-slots.ts): the machine window and the slot machines' screens in the room both
 * run one of these. Each reel spins a few whole turns and eases into its stop, left to right.
 */
export class Reels {
  /** Where each reel stands, in stops (fractional while turning). */
  pos = [0, 0, 0];
  private from = [0, 0, 0];
  private dist = [0, 0, 0];
  private start = 0;
  private ends = [1, 1, 1];
  /** Which reels have landed since the last update, for a clunk each. */
  landed: number[] = [];

  constructor(stops: readonly number[] = [0, 0, 0]) {
    this.snap(stops);
  }

  get spinning(): boolean {
    return this.dist.some((d) => d > 0);
  }

  /** Straight to `stops`, no turning. */
  snap(stops: readonly number[]) {
    this.pos = stops.map((s) => ((s % REEL_STOPS) + REEL_STOPS) % REEL_STOPS);
    this.dist = [0, 0, 0];
    this.ends = [0, 0, 0];
  }

  /** Spins to `stops`, the last reel landing `ms` from `now`. */
  spin(stops: readonly number[], ms: number, now: number) {
    this.start = now;
    this.from = this.pos.map((p) => p % REEL_STOPS);
    this.dist = stops.map((s, i) => (i + 2) * REEL_STOPS + ((((s - this.from[i]) % REEL_STOPS) + REEL_STOPS) % REEL_STOPS));
    this.ends = [0.55, 0.78, 1].map((k) => now + ms * k);
    this.landed = [];
  }

  /** Where the reels are at `now`; true while any is still turning. */
  update(now: number): boolean {
    this.landed = [];
    let turning = false;
    for (let i = 0; i < 3; i++) {
      if (!this.dist[i]) continue;
      const u = Math.min(1, (now - this.start) / (this.ends[i] - this.start));
      // Quick to get going, then a long ease out, with a little settle past the stop and back.
      const e = u < 1 ? 1 - Math.pow(1 - u, 3) + Math.sin(u * Math.PI) * 0.004 * (1 - u) : 1;
      this.pos[i] = (this.from[i] + this.dist[i] * e) % REEL_STOPS;
      if (u >= 1) {
        this.dist[i] = 0;
        this.landed.push(i);
      } else turning = true;
    }
    return turning;
  }
}

/**
 * Draws the reels into `g` (a `w` × `h` window): three columns of symbols, the payline across the
 * middle. `dim` greys it out (nobody's at the machine).
 */
export function drawReels(g: CanvasRenderingContext2D, reels: Reels, w: number, h: number, opts: { dim?: boolean; win?: boolean } = {}) {
  const col = w / 3;
  const cell = h / 2.4;
  g.fillStyle = '#12060c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const x0 = i * col;
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#bdb3a4');
    grd.addColorStop(0.5, '#fffaf0');
    grd.addColorStop(1, '#bdb3a4');
    g.fillStyle = grd;
    g.fillRect(x0 + col * 0.05, 0, col * 0.9, h);
    g.save();
    g.beginPath();
    g.rect(x0 + col * 0.05, 0, col * 0.9, h);
    g.clip();
    g.font = `${Math.floor(cell * 0.72)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const p = reels.pos[i];
    const base = Math.floor(p);
    for (let s = base - 2; s <= base + 2; s++) {
      const y = h / 2 + (p - s) * cell;
      if (y < -cell || y > h + cell) continue;
      const sym = REELS[i][((s % REEL_STOPS) + REEL_STOPS) % REEL_STOPS];
      g.fillText(SLOT_EMOJI[sym], x0 + col / 2, y);
    }
    g.restore();
  }
  // Shading top and bottom, like a drum.
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(0.3, 'rgba(0,0,0,0)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  g.fillStyle = opts.win ? '#ffd36b' : '#e63946';
  g.fillRect(0, h / 2 - Math.max(1, h * 0.012), w, Math.max(2, h * 0.024));
  if (opts.dim) {
    g.fillStyle = 'rgba(10,4,8,0.35)';
    g.fillRect(0, 0, w, h);
  }
}

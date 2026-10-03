import { AUFGUSS_RUN, aufgussAt, saunaAt, TIER, type SaunaDef } from '../../shared/therme-dorf';
import './sauna.css';

/*
 * How a sauna feels from in front of the screen (flrnoh fork, see shared/therme-dorf.ts): sitting in
 * one, how hot it is (the sauna's own heat, more the higher the tier, a surge with an Aufguss) and
 * how damp (a dry Finnish sauna, the herbal one's mild steam, the steam bath's fog; the Aufguss's
 * wave of steam) work out what you see: the screen's edges glow with the heat, steam drifts across
 * it and fills the room (the scene's own fog, ThermePlace.mood), the steam bath blurs it, sweat beads
 * and runs down it the longer you sit, and a little card says how hot and how damp. Cold water (the
 * pond, the plunge pool, a bucket, the ice, a shower) washes the sweat off. The stove crackles,
 * the stones hiss as the Saunameister pours (client/therme/sound.ts).
 */

/** How damp each kind of sauna is, by its look (%). */
const DAMP: Record<SaunaDef['look'], number> = { wood: 12, log: 15, earth: 8, salt: 40, herbs: 50, tile: 100 };

export interface Feel {
  /** 0 not in a sauna … 1 as hot as it gets. */
  heat: number;
  /** 0 clear … 1 thick steam. */
  steam: number;
  /** The sauna you're in, if any, and what it's like there now. */
  sauna: SaunaDef | null;
  temp: number;
  damp: number;
  /** An Aufguss is pouring onto the stones right now (0..1, strongest as it starts). */
  pour: number;
}

const ease = (x: number, to: number, dt: number, secs: number) => x + (to - x) * Math.min(1, dt / secs);

export class SaunaFeel {
  readonly feel: Feel = { heat: 0, steam: 0, sauna: null, temp: 20, damp: 50, pour: 0 };
  /** How sweaty you are (0..1): it builds in the heat, dries off slowly, and cold water washes it away. */
  private sweat = 0;
  private root: HTMLDivElement;
  private heatEl: HTMLDivElement;
  private steamEl: HTMLDivElement;
  private dropsEl: HTMLDivElement;
  private card: HTMLDivElement;
  private drops = 0;
  private cardText = '';
  private shown = false;

  constructor(private canvas: HTMLCanvasElement | null) {
    const el = (cls: string, parent: HTMLElement) => {
      const d = document.createElement('div');
      d.className = cls;
      parent.appendChild(d);
      return d;
    };
    this.root = document.createElement('div');
    this.root.className = 'therme-sauna';
    this.root.setAttribute('aria-hidden', 'true');
    this.heatEl = el('therme-sauna-heat', this.root);
    this.steamEl = el('therme-sauna-steam', this.root);
    for (let i = 0; i < 4; i++) el(`therme-sauna-cloud therme-sauna-cloud-${i}`, this.steamEl);
    this.dropsEl = el('therme-sauna-drops', this.root);
    this.card = el('therme-sauna-card', this.root);
    // Right over the 3D view, under everything drawn on top of it (the hint, the map, the chat).
    if (canvas?.parentElement) canvas.insertAdjacentElement('afterend', this.root);
    else document.body.appendChild(this.root);
  }

  /** Cold water over you: the sweat's gone. */
  cool() {
    this.sweat = 0;
    this.dropsEl.replaceChildren();
    this.drops = 0;
  }

  /** Every frame in the baths: where you are (feet), the office's clock, whether you're in cold water. */
  update(x: number, y: number, z: number, now: number, dt: number, cold: boolean) {
    const s = saunaAt(x, y, z) ?? null;
    const f = this.feel;
    let temp = 26;
    let damp = 55;
    let pour = 0;
    if (s) {
      // Higher up is hotter: the floor's a good deal cooler than the top tier.
      const tier = Math.max(0, Math.round(y / TIER.rise));
      temp = s.temp * (0.78 + 0.07 * Math.min(4, tier));
      damp = DAMP[s.look];
      const a = aufgussAt(now);
      if (a.running && a.sauna === s.id) {
        const into = now - a.start;
        // The first minute it's poured on in waves; then it eases off over the rest.
        pour = into < 60_000 ? 0.65 + 0.35 * Math.max(0, Math.sin(into / 1300)) : Math.max(0, 0.35 * (1 - (into - 60_000) / (AUFGUSS_RUN - 60_000)));
        temp += 16 * pour;
        damp = Math.min(100, damp + 45 * pour);
      }
    }
    f.sauna = s;
    f.pour = pour;
    f.temp = ease(f.temp, temp, dt, s ? 3 : 1.5);
    f.damp = ease(f.damp, damp, dt, 2.5);
    const heat = s ? Math.max(0, Math.min(1, (f.temp - 40) / 70)) : 0;
    const steam = s ? Math.max(0, Math.min(1, (f.damp - 10) / 90)) * (s.look === 'tile' ? 1 : 0.7) + pour * 0.35 : 0;
    f.heat = ease(f.heat, heat, dt, s ? 2.5 : 1);
    f.steam = ease(f.steam, Math.min(1, steam), dt, s ? 2 : 0.8);
    if (cold) this.cool();
    this.sweat = Math.max(0, Math.min(1, this.sweat + (s ? (dt * f.heat) / 70 : -dt / 160)));
    this.draw(s);
  }

  private draw(s: SaunaDef | null) {
    const f = this.feel;
    const on = f.heat > 0.01 || f.steam > 0.01 || this.drops > 0;
    if (on !== this.shown) {
      this.shown = on;
      this.root.classList.toggle('on', on);
    }
    if (!on) {
      if (this.canvas && this.canvas.style.filter) this.canvas.style.filter = '';
      return;
    }
    this.heatEl.style.opacity = (f.heat * 0.95).toFixed(3);
    this.steamEl.style.opacity = (f.steam * 0.5).toFixed(3);
    // The steam bath's fog softens everything; a dry sauna's air only shimmers a little.
    if (this.canvas) {
      const blur = Math.max(0, f.steam - 0.5) * 2;
      const warm = f.heat * 0.18;
      const want = blur > 0.05 || warm > 0.01 ? `blur(${blur.toFixed(2)}px) saturate(${(1 + warm).toFixed(2)}) sepia(${(warm * 0.6).toFixed(2)})` : '';
      if (this.canvas.style.filter !== want) this.canvas.style.filter = want;
    }
    // Sweat: beads that run down the screen, more the longer you sit.
    const want = Math.round(this.sweat * 14);
    if (want > this.drops && Math.random() < 0.04) {
      const d = document.createElement('div');
      d.className = 'therme-sauna-drop';
      d.style.left = `${4 + Math.random() * 92}%`;
      d.style.top = `${Math.random() * 55}%`;
      d.style.setProperty('--run', `${5 + Math.random() * 7}s`);
      d.style.setProperty('--size', `${7 + Math.random() * 9}px`);
      d.addEventListener('animationend', () => {
        d.remove();
        this.drops = Math.max(0, this.drops - 1);
      });
      this.dropsEl.appendChild(d);
      this.drops++;
    }
    const text = s ? `${s.emoji} ${s.name} · 🌡️ ${Math.round(f.temp)} °C · 💧 ${Math.round(f.damp)} %${f.pour > 0.2 ? ' · 🔥 Aufguss!' : ''}` : '';
    if (text !== this.cardText) {
      this.cardText = text;
      this.card.textContent = text;
      this.card.classList.toggle('on', !!text);
    }
  }

  /** Leaving the baths: all of it off. */
  clear() {
    this.cool();
    this.feel.heat = this.feel.steam = this.feel.pour = 0;
    this.feel.sauna = null;
    this.draw(null);
  }
}


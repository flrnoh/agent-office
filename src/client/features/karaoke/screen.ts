import * as THREE from 'three';
import { SONG_BY_ID } from '../../../shared/karaoke-songs';
import { timeline, type LyricLine, type SongDef } from '../../../shared/karaoke-music';
import { pickTitle, singersOf, type KaraokeBoard, type KaraokeState } from '../../../shared/karaoke';

// ---- The karaoke screens (flrnoh fork, see FORK.md "Karaoke") -----------------------------------------
// The big screen over the stage (and the prompter, which shows the same): who's up and what's next,
// and while one of the bar's own songs is sung, its words lighting up syllable by syllable in time
// with the band, the next line under it, dots counting in. A video brings its own words: then the
// screen says what's on round YouTube's player. After a song, the rating; on the wall, the week's kings.

const W = 1280;
const H = 720;
const STRIP = 78;
const FONT = 'Nunito, ui-rounded, system-ui, sans-serif';
const INK = '#ffffff';
const SUNG = ['#4cf0ff', '#ff3fa4'] as const;

export interface Rated {
  name: string;
  title: string;
  avg: number;
  votes: number;
  king: boolean;
  /** When it came in (performance.now()). */
  at: number;
}

export interface ScreenView {
  state: KaraokeState;
  /** The office's clock (ms). */
  now: number;
  name(id: string): string;
  rated: Rated | null;
  /** How the video's doing on this page ("playing", "blocked"…), while one's on. */
  video: string;
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g, tex };
}

/** Shortens `text` with an ellipsis until it fits `max` px in the current font. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export class LyricsScreen {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private key = '';
  private lastDraw = 0;

  constructor() {
    const { g, tex } = canvas(W, H);
    this.g = g;
    this.texture = tex;
    this.draw({ state: { queue: [], turn: null, mics: [null, null], board: { week: '', top: [] } }, now: 0, name: () => '', rated: null, video: '' });
  }

  /** Draws what's on, if anything's changed (the words while they're sung: up to 30 times a second). */
  draw(v: ScreenView) {
    const t = v.state.turn;
    const song = t?.phase === 'singing' && t.pick.kind === 'song' ? SONG_BY_ID.get(t.pick.id) : undefined;
    const rated = v.rated && performance.now() - v.rated.at < 5000 ? v.rated : null;
    const live = !!song || t?.phase === 'up' || t?.phase === 'rating';
    const key = JSON.stringify([v.state, rated?.at, v.video, live ? Math.floor(v.now / (song ? 33 : 500)) : 0]);
    if (key === this.key) return;
    const p = performance.now();
    if (song && p - this.lastDraw < 30) return;
    this.key = key;
    this.lastDraw = p;
    const g = this.g;
    this.backdrop(t?.phase === 'singing' ? (song ? '#1a0b33' : '#0b0b14') : '#2a0b4a');
    if (rated) this.rated(rated);
    else if (!t) this.idle(v);
    else if (t.phase === 'up') this.up(v);
    else if (t.phase === 'rating') this.rating(v);
    else if (song) this.lyrics(v, song);
    else this.video(v);
    this.strip(v);
    void g;
    this.texture.needsUpdate = true;
  }

  private backdrop(color: string) {
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#090812');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Faint diagonal stage-light streaks.
    g.save();
    g.globalAlpha = 0.07;
    g.fillStyle = '#ff3fa4';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(140 + i * 260, 0);
      g.lineTo(260 + i * 260, 0);
      g.lineTo(i * 260 - 80, H);
      g.lineTo(i * 260 - 200, H);
      g.fill();
    }
    g.restore();
  }

  private text(s: string, x: number, y: number, size: number, color = INK, weight = 900, align: CanvasTextAlign = 'center', max = W - 120) {
    const g = this.g;
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(fit(g, s, max), x, y);
  }

  /** A bar running out: how long is left of a phase. */
  private timer(from: number, until: number, now: number, y: number) {
    const g = this.g;
    const k = Math.max(0, Math.min(1, (until - now) / Math.max(1, until - from)));
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(240, y, 800, 10);
    g.fillStyle = '#ffe14c';
    g.fillRect(240, y, 800 * k, 10);
  }

  private idle(v: ScreenView) {
    const g = this.g;
    g.save();
    g.shadowColor = '#ff3fa4';
    g.shadowBlur = 30;
    this.text('KARAOKE', W / 2, 150, 150, '#ffd0ec', 900);
    g.restore();
    this.text('Song aussuchen: E am Songbuch (an den Tischen und am Pult)', W / 2, 270, 38, 'rgba(255,255,255,.85)', 800);
    const q = v.state.queue;
    if (!q.length) {
      this.text('Die Bühne ist frei. Wer traut sich?', W / 2, 380, 46, '#4cf0ff', 900);
      if (v.state.mics.some(Boolean)) this.text(`🎤 ${v.state.mics.filter(Boolean).map((id) => v.name(id!)).join(' & ')} am Mikro`, W / 2, 460, 36, '#ffe14c', 800);
      return;
    }
    this.text('Auf der Liste', W / 2, 360, 34, '#ffe14c', 900);
    q.slice(0, 4).forEach((e, i) => this.text(`${i + 1}. ${e.name}: ${pickTitle(e.pick)}`, W / 2, 420 + i * 52, 38, INK, 800));
  }

  private up(v: ScreenView) {
    const t = v.state.turn!;
    this.text('JETZT DRAN', W / 2, 120, 64, '#ffe14c', 900);
    this.g.save();
    this.g.shadowColor = '#4cf0ff';
    this.g.shadowBlur = 24;
    this.text(t.name, W / 2, 240, 110, INK, 900);
    this.g.restore();
    this.text(pickTitle(t.pick), W / 2, 350, 50, '#ffd0ec', 800);
    this.text('Ab auf die Bühne und ein Mikro schnappen!', W / 2, 450, 40, 'rgba(255,255,255,.85)', 800);
    this.timer(t.startedAt, t.until, v.now, 530);
  }

  private rating(v: ScreenView) {
    const t = v.state.turn!;
    this.text('Wie war’s?', W / 2, 110, 84, INK, 900);
    this.text(`${t.name}: ${pickTitle(t.pick)}`, W / 2, 205, 40, '#ffd0ec', 800);
    this.flames(t.avg ?? 0, 330, 90);
    this.text(t.votes ? `${(t.avg ?? 0).toFixed(1).replace('.', ',')} 🔥 · ${t.votes} ${t.votes === 1 ? 'Stimme' : 'Stimmen'}` : 'Noch keine Stimmen', W / 2, 430, 40, '#ffe14c', 900);
    this.text('Drück 1 bis 5 (oder klick die Flammen)', W / 2, 495, 34, 'rgba(255,255,255,.8)', 800);
    this.timer(t.startedAt, t.until, v.now, 555);
  }

  private rated(r: Rated) {
    this.text(r.votes ? 'Das Urteil' : 'Applaus!', W / 2, 110, 64, '#ffe14c', 900);
    this.text(`${r.name}: ${r.title}`, W / 2, 200, 42, '#ffd0ec', 800);
    if (r.votes) {
      this.flames(r.avg, 320, 100);
      this.text(`${r.avg.toFixed(1).replace('.', ',')} von 5 · ${r.votes} ${r.votes === 1 ? 'Stimme' : 'Stimmen'}`, W / 2, 430, 48, INK, 900);
    }
    if (r.king) {
      this.g.save();
      this.g.shadowColor = '#ffe14c';
      this.g.shadowBlur = 30;
      this.text('👑 Neue Spitze der Woche!', W / 2, 530, 58, '#ffe14c', 900);
      this.g.restore();
    }
  }

  /** Five flames, lit up to `avg`. */
  private flames(avg: number, y: number, size: number) {
    const g = this.g;
    g.font = `${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 5; i++) {
      const x = W / 2 + (i - 2) * size * 1.25;
      const k = Math.max(0, Math.min(1, avg - i));
      g.globalAlpha = 0.18;
      g.fillText('🔥', x, y);
      if (k > 0) {
        g.save();
        g.globalAlpha = 1;
        g.beginPath();
        g.rect(x - size / 2, y - size, size * k, size * 2);
        g.clip();
        g.fillText('🔥', x, y);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  private video(v: ScreenView) {
    const t = v.state.turn!;
    const names = singersOf(v.state).map(v.name).join(' & ') || t.name;
    this.text(`🎤 ${names}`, W / 2, 200, 64, INK, 900);
    this.text(pickTitle(t.pick), W / 2, 300, 46, '#ffd0ec', 800);
    const how: Record<string, string> = {
      loading: 'Video startet…',
      blocked: 'Klick irgendwo, um es zu hören',
      failed: 'Das Video spielt hier nicht',
      ended: 'Vorbei!',
      away: '',
    };
    this.text(how[v.video] ?? 'Der Text läuft im Video mit: schau auf den Bildschirm', W / 2, 400, 36, 'rgba(255,255,255,.75)', 800);
  }

  private lyrics(v: ScreenView, song: SongDef) {
    const t = v.state.turn!;
    const tl = timeline(song);
    const beat = ((v.now - t.startedAt) / 1000) * (song.bpm / 60);
    const names = singersOf(v.state).map(v.name).join(' & ') || t.name;
    this.text(`♪ ${song.title}`, 60, 52, 38, '#ffd0ec', 900, 'left', 700);
    this.text(song.artist, 60, 96, 26, 'rgba(255,255,255,.6)', 800, 'left', 700);
    this.text(`🎤 ${names}`, W - 60, 60, 38, '#ffe14c', 900, 'right', 480);
    let i = tl.lines.findIndex((l) => beat < l.end);
    if (i < 0) i = tl.lines.length;
    const line = tl.lines[i];
    const next = tl.lines[i + 1];
    if (!line) {
      this.text('Danke! 👏', W / 2, 330, 90, INK, 900);
    } else {
      const first = line.syllables[0];
      const until = first ? first.at - beat : 0;
      // Before the first line: the count-in.
      if (i === 0 && until > 0) this.text('Gleich geht’s los…', W / 2, 200, 44, '#4cf0ff', 900);
      // After a pause of a bar or more (and before the first line), dots count the last beats in.
      const prev = tl.lines[i - 1]?.syllables.at(-1);
      const gap = first ? first.at - (prev ? prev.at + prev.len : -Infinity) : 0;
      if (until > 0 && until <= 4 && gap >= 3) this.dots(Math.ceil(until), 250);
      if (line.section === 'chorus') this.pill('REFRAIN', 160, 250);
      this.sing(line, beat, 340, 66);
      if (next) this.sing(next, -Infinity, 440, 44, 'rgba(255,255,255,.55)');
    }
    // How far through the song.
    const g = this.g;
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(60, 580, W - 120, 8);
    g.fillStyle = SUNG[0];
    g.fillRect(60, 580, (W - 120) * Math.max(0, Math.min(1, beat / tl.beats)), 8);
  }

  private pill(text: string, x: number, y: number) {
    const g = this.g;
    g.font = `900 24px ${FONT}`;
    const w = g.measureText(text).width + 28;
    g.fillStyle = 'rgba(255,63,164,.85)';
    g.beginPath();
    g.roundRect(x - w / 2, y - 18, w, 36, 18);
    g.fill();
    this.text(text, x, y + 1, 24, INK, 900);
  }

  /** Counting in: `n` dots (up to four), going out one a beat. */
  private dots(n: number, y: number) {
    const g = this.g;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k < n ? '#ffe14c' : 'rgba(255,255,255,.15)';
      g.beginPath();
      g.arc(W / 2 + (k - 1.5) * 44, y, 12, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** A line of words, the ones sung (up to `beat`) filled with colour, the syllable being sung filling as it's held. */
  private sing(line: LyricLine, beat: number, y: number, size: number, rest = INK) {
    const g = this.g;
    let px = size;
    g.font = `900 ${px}px ${FONT}`;
    const widthAt = () => line.syllables.reduce((s, sy) => s + g.measureText(sy.text + (sy.space ? ' ' : '')).width, 0);
    while (widthAt() > W - 120 && px > 28) g.font = `900 ${(px -= 2)}px ${FONT}`;
    const total = widthAt();
    let x = (W - total) / 2;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const grad = g.createLinearGradient(0, y - px / 2, 0, y + px / 2);
    grad.addColorStop(0, SUNG[0]);
    grad.addColorStop(1, SUNG[1]);
    for (const sy of line.syllables) {
      const s = sy.text + (sy.space ? ' ' : '');
      const w = g.measureText(s).width;
      const tw = g.measureText(sy.text).width;
      g.lineWidth = px * 0.14;
      g.strokeStyle = 'rgba(10,6,20,.9)';
      g.strokeText(sy.text, x, y);
      g.fillStyle = rest;
      g.fillText(sy.text, x, y);
      const k = Math.max(0, Math.min(1, (beat - sy.at) / Math.max(0.05, sy.len)));
      if (k > 0) {
        g.save();
        g.beginPath();
        g.rect(x - 2, y - px, tw * k + 2, px * 2);
        g.clip();
        g.shadowColor = SUNG[1];
        g.shadowBlur = 16;
        g.fillStyle = grad;
        g.fillText(sy.text, x, y);
        g.restore();
      }
      x += w;
    }
  }

  /** Along the bottom: who's next, and the week's king or queen. */
  private strip(v: ScreenView) {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.72)';
    g.fillRect(0, H - STRIP, W, STRIP);
    g.fillStyle = '#ff3fa4';
    g.fillRect(0, H - STRIP, W, 3);
    const next = v.state.queue[0];
    const king = v.state.board.top[0];
    this.text(next ? `Als Nächstes: ${next.name} · ${pickTitle(next.pick)}` : 'Als Nächstes: du? E am Songbuch', 40, H - STRIP / 2 + 2, 32, INK, 800, 'left', king ? 760 : W - 80);
    if (king) this.text(`👑 ${king.name} · ${king.points.toFixed(1).replace('.', ',')} 🔥`, W - 40, H - STRIP / 2 + 2, 30, '#ffe14c', 900, 'right', 420);
  }
}

/** The week's karaoke kings, on the wall. */
export class ChartsBoard {
  readonly texture: THREE.CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private key = '';

  constructor() {
    const { g, tex } = canvas(1024, 725);
    this.g = g;
    this.texture = tex;
    this.draw({ week: '', top: [] });
  }

  draw(b: KaraokeBoard) {
    const key = JSON.stringify(b);
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, 0, 725);
    grad.addColorStop(0, '#2a0b4a');
    grad.addColorStop(1, '#120720');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 725);
    const t = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', max = 900) => {
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = align;
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(fit(g, s, max), x, y);
    };
    t('👑 Karaoke-König(in) der Woche', 512, 66, 52, '#ffe14c', 'center', 960);
    t(b.week ? `Woche ${b.week.split('-W')[1]}` : '', 512, 124, 30, 'rgba(255,255,255,.6)', 'center');
    if (!b.top.length) t('Noch niemand. Das Mikro wartet!', 512, 360, 44, '#ffd0ec', 'center');
    b.top.forEach((l, i) => {
      const y = 200 + i * 92;
      g.fillStyle = i === 0 ? 'rgba(255,225,76,.16)' : 'rgba(255,255,255,.05)';
      g.beginPath();
      g.roundRect(40, y - 38, 944, 76, 16);
      g.fill();
      t(i === 0 ? '👑' : `${i + 1}.`, 80, y, 44, i === 0 ? '#ffe14c' : INK, 'center');
      t(l.name, 140, y, 44, INK, 'left', 430);
      t(`${l.songs} ${l.songs === 1 ? 'Song' : 'Songs'} · Ø ${l.avg.toFixed(1).replace('.', ',')}`, 700, y, 30, 'rgba(255,255,255,.7)', 'right', 200);
      t(`${l.points.toFixed(1).replace('.', ',')} 🔥`, 960, y, 42, '#ff9fd4', 'right', 240);
    });
    if (b.last) t(`Letzte Woche: ${b.last.name} (${b.last.points.toFixed(1).replace('.', ',')} 🔥)`, 512, 690, 30, 'rgba(255,255,255,.7)', 'center', 960);
    this.texture.needsUpdate = true;
  }
}

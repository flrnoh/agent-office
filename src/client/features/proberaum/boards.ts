import * as THREE from 'three';
import { roomName, type PinView, type Polaroid, type ProbeView, type RoomView } from '../../../shared/proberaum';
import { REHEARSAL_ROOMS, type RehearsalRoomId } from '../../../shared/venue';
import { BOLD, HAND, SANS, rng } from './paint';
import { fit } from './posters';

/*
 * The rehearsal wing's boards that change (flrnoh fork, see FORK.md "The rehearsal wing"), drawn
 * again whenever the wing does: the Belegungsplan in the lobby, the screens beside the doors, the
 * Schwarzes Brett, the polaroid wall, the setlists on the rooms' whiteboards, the band name
 * generator's chalkboard, the tip jar's label, the recorders' little displays.
 */

export interface Board {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

export function board(w: number, h: number): Board {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

/** A time of day ("21:30"), Berlin's. */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
/** How long a take is ("1:05"). */
export const mmss = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

const draw = (b: Board, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
  const g = b.canvas.getContext('2d')!;
  g.save();
  fn(g, b.canvas.width, b.canvas.height);
  g.restore();
  b.texture.needsUpdate = true;
};

/** The screen beside a room's door: its number, FREI or the band till when, a knock waiting, REC. */
export function drawPanel(b: Board, r: RoomView, now: number) {
  draw(b, (g, w, h) => {
    const booked = !!r.booking;
    g.fillStyle = '#0b1016';
    g.fillRect(0, 0, w, h);
    g.fillStyle = booked ? '#ff4d4d' : '#3ddc84';
    g.fillRect(0, 0, w, 44);
    g.fillStyle = '#0b1016';
    g.font = `900 24px ${SANS}`;
    g.textAlign = 'left';
    g.fillText(r.id === 'studio' ? 'STUDIO' : `RAUM ${r.id.slice(-1)}`, 12, 32);
    g.textAlign = 'right';
    g.fillText(booked ? 'BELEGT' : 'FREI', w - 12, 32);
    g.textAlign = 'left';
    g.fillStyle = '#e6edf3';
    if (r.booking) {
      fit(g, r.booking.band, w - 24, 30, SANS, 800);
      g.fillText(r.booking.band, 12, 84);
      g.font = `600 22px ${SANS}`;
      g.fillStyle = '#9fb1c3';
      g.fillText(`bis ${clock(r.booking.until)} · ${Math.max(0, Math.ceil((r.booking.until - now) / 60_000))} Min.`, 12, 116);
    } else {
      g.font = `700 24px ${SANS}`;
      g.fillText('Komm rein, mach Lärm.', 12, 88);
      g.font = `600 20px ${SANS}`;
      g.fillStyle = '#9fb1c3';
      g.fillText('E hier: buchen', 12, 118);
    }
    if (r.knocks.length) {
      g.fillStyle = '#ffd166';
      g.font = `800 20px ${SANS}`;
      g.fillText(`🚪 ${r.knocks.map((k) => k.name).join(', ')} klopft`, 12, 150);
    }
    if (r.rec) {
      g.fillStyle = '#ff3b3b';
      g.beginPath();
      g.arc(w - 26, 160, 10, 0, Math.PI * 2);
      g.fill();
      g.font = `900 18px ${SANS}`;
      g.textAlign = 'right';
      g.fillText('REC', w - 42, 167);
    } else if (r.playing) {
      g.fillStyle = '#36e7ff';
      g.font = `900 18px ${SANS}`;
      g.textAlign = 'right';
      g.fillText('▶ PLAY', w - 14, 167);
    }
  });
}

/** The Belegungsplan: a whiteboard with a row a room, magnets in red (booked) and green (free), written in marker. */
export function drawBookingBoard(b: Board, v: ProbeView | null, now: number) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#f7f7f2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d3557';
    g.font = `700 54px ${HAND}`;
    g.textAlign = 'left';
    g.fillText('Belegungsplan', 28, 66);
    g.font = `500 26px ${HAND}`;
    g.fillStyle = '#457b9d';
    g.textAlign = 'right';
    g.fillText(`heute · ${clock(now)}`, w - 30, 62);
    g.textAlign = 'left';
    g.strokeStyle = '#1d3557';
    g.lineWidth = 3;
    const top = 92;
    const rowH = (h - top - 40) / REHEARSAL_ROOMS.length;
    REHEARSAL_ROOMS.forEach((room, i) => {
      const y = top + i * rowH;
      const r = v?.rooms.find((x) => x.id === room.id);
      g.beginPath();
      g.moveTo(20, y);
      g.lineTo(w - 20, y);
      g.stroke();
      g.fillStyle = '#1d1d1d';
      g.font = `700 36px ${HAND}`;
      g.fillText(room.name, 30, y + 46);
      // The magnet.
      g.fillStyle = r?.booking ? '#e63946' : '#2a9d8f';
      g.beginPath();
      g.arc(w * 0.36, y + rowH / 2, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(w * 0.36 - 6, y + rowH / 2 - 6, 6, 0, Math.PI * 2);
      g.fill();
      if (r?.booking) {
        g.fillStyle = '#c1121f';
        fit(g, r.booking.band, w * 0.55, 38, HAND, 700);
        g.fillText(r.booking.band, w * 0.4, y + 42);
        g.font = `500 24px ${HAND}`;
        g.fillStyle = '#333';
        const who = r.booking.members.slice(0, 5).join(', ') + (r.booking.members.length > 5 ? ' …' : '');
        g.fillText(`bis ${clock(r.booking.until)} – ${who}`, w * 0.4, y + 74);
      } else {
        g.fillStyle = '#2a9d8f';
        g.font = `700 36px ${HAND}`;
        g.fillText('frei', w * 0.4, y + 48);
      }
      if (r?.rec || r?.playing) {
        g.fillStyle = r.rec ? '#e63946' : '#118ab2';
        g.font = `800 22px ${SANS}`;
        g.textAlign = 'right';
        g.fillText(r.rec ? '● REC' : '▶ läuft', w - 30, y + 46);
        g.textAlign = 'left';
      }
    });
    g.font = `500 22px ${HAND}`;
    g.fillStyle = '#6c757d';
    g.fillText('E: buchen · 30 / 60 / 120 Min. · ein Raum pro Person', 30, h - 14);
  });
}

/** The Schwarzes Brett: cork, everyone's notes pinned at a slant, the paper's colour, who and when. */
export function drawPins(b: Board, pins: readonly PinView[]) {
  draw(b, (g, w, h) => {
    const r = rng(17);
    g.fillStyle = '#b5835a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '90,55,30' : '220,180,130'},0.25)`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.fillStyle = '#4a2f1a';
    g.font = `900 34px ${BOLD}`;
    g.textAlign = 'center';
    g.fillText('SCHWARZES BRETT', w / 2, 40);
    const cols = 4;
    const cw = (w - 30) / cols;
    const ch = (h - 60) / 3;
    pins.slice(-12).forEach((p, i) => {
      const cx = 15 + cw * (i % cols) + cw / 2;
      const cy = 56 + ch * Math.floor(i / cols) + ch / 2;
      const rr = rng(p.id.length * 131 + p.at);
      g.save();
      g.translate(cx + (rr() - 0.5) * 14, cy + (rr() - 0.5) * 10);
      g.rotate((rr() - 0.5) * 0.18);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-cw / 2 + 10, -ch / 2 + 10, cw - 14, ch - 12);
      g.fillStyle = p.color;
      g.fillRect(-cw / 2 + 6, -ch / 2 + 6, cw - 14, ch - 12);
      g.fillStyle = '#1d1d1d';
      g.textAlign = 'left';
      g.font = `600 19px ${HAND}`;
      wrap(g, p.text, -cw / 2 + 14, -ch / 2 + 32, cw - 30, 22, 5);
      g.font = `500 14px ${HAND}`;
      g.fillStyle = '#555';
      g.fillText(`– ${p.by}`, -cw / 2 + 14, ch / 2 - 14);
      g.fillStyle = '#d62828';
      g.beginPath();
      g.arc(0, -ch / 2 + 10, 7, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
    if (!pins.length) {
      g.fillStyle = '#fff7c2';
      g.fillRect(w / 2 - 150, h / 2 - 50, 300, 100);
      g.fillStyle = '#1d1d1d';
      g.font = `600 22px ${HAND}`;
      g.fillText('E: Zettel anpinnen', w / 2, h / 2 + 8);
    }
  });
}

/** Text wrapped into `maxW`, at most `lines` lines (… when cut). */
export function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, lines: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  out.slice(0, lines).forEach((l, i) => g.fillText(i === lines - 1 && out.length > lines ? `${l} …` : l, x, y + i * lh));
}

const SHIRTS = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#9b5de5', '#264653', '#ffb703', '#6d6875'];

/** The polaroid wall: every band that booked a room, a snapshot each (the band, cartoon), its name and the day in pen. */
export function drawPolaroids(b: Board, list: readonly Polaroid[]) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#edf2f4';
    g.font = `700 30px ${HAND}`;
    g.textAlign = 'center';
    g.fillText('Hier haben geprobt:', w / 2, 36);
    const cols = 4;
    const pw = 118;
    const ph = 140;
    const shown = list.slice(-12).reverse();
    shown.forEach((p, i) => {
      const r = rng(p.at % 100000 + i);
      const x = 30 + (i % cols) * ((w - 60) / cols) + ((w - 60) / cols - pw) / 2;
      const y = 52 + Math.floor(i / cols) * (ph + 18);
      g.save();
      g.translate(x + pw / 2, y + ph / 2);
      g.rotate((r() - 0.5) * 0.2);
      g.fillStyle = '#fbfbf8';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      // The snapshot: a dim room, the band in a row.
      g.fillStyle = ['#3d2b3a', '#1f2f3a', '#3a2a1f', '#262626'][i % 4];
      g.fillRect(-pw / 2 + 7, -ph / 2 + 7, pw - 14, pw - 18);
      const n = Math.max(1, Math.min(5, p.names.length));
      for (let k = 0; k < n; k++) {
        const bx = -pw / 2 + 7 + ((pw - 14) * (k + 0.5)) / n;
        const by = -ph / 2 + 7 + (pw - 18) * 0.7;
        g.fillStyle = SHIRTS[Math.floor(r() * SHIRTS.length)];
        g.beginPath();
        g.ellipse(bx, by + 12, 12, 16, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ['#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#ffdbac'][Math.floor(r() * 5)];
        g.beginPath();
        g.arc(bx, by - 8, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ['#2b1a10', '#e6c35c', '#7a3b1e', '#111', '#b5651d'][Math.floor(r() * 5)];
        g.fillRect(bx - 8, by - 17, 16, 6);
      }
      // A flash's glare.
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(-pw / 2 + 30, -ph / 2 + 30, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1d1d1d';
      fit(g, p.band, pw - 12, 15, HAND, 700);
      g.textAlign = 'center';
      g.fillText(p.band, 0, ph / 2 - 20);
      g.font = `500 11px ${HAND}`;
      g.fillStyle = '#555';
      g.fillText(new Date(p.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Berlin' }), 0, ph / 2 - 6);
      // Tape.
      g.fillStyle = 'rgba(240,230,200,0.7)';
      g.fillRect(-18, -ph / 2 - 6, 36, 12);
      g.restore();
    });
    if (!shown.length) {
      g.fillStyle = '#8d99ae';
      g.font = `500 22px ${HAND}`;
      g.fillText('Noch keiner. Buch einen Raum!', w / 2, h / 2);
    }
  });
}

/** A room's whiteboard: SETLIST and what's on it, in marker. */
export function drawSetlist(b: Board, text: string, by: string, room: RehearsalRoomId) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,140,170,0.12)';
    g.fillRect(20, 60, w * 0.7, 12);
    g.fillStyle = '#c1121f';
    g.font = `700 40px ${HAND}`;
    g.textAlign = 'left';
    g.fillText('SETLIST', 22, 46);
    g.fillStyle = '#1d3557';
    const lines = text ? text.split('\n') : ['', '(E: Setlist schreiben)'];
    const lh = Math.min(34, (h - 90) / Math.max(1, lines.length));
    g.font = `600 ${Math.round(lh * 0.85)}px ${HAND}`;
    lines.forEach((l, i) => g.fillText(l, 26, 90 + i * lh, w - 40));
    if (by) {
      g.font = `500 16px ${HAND}`;
      g.fillStyle = '#6c757d';
      g.textAlign = 'right';
      g.fillText(`– ${by}`, w - 16, h - 12);
    }
    // A doodle in the corner, each room its own.
    g.strokeStyle = room === 'probe3' ? '#111' : '#2a9d8f';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w - 50, 40, 18, 0, Math.PI * 2);
    g.moveTo(w - 50, 22);
    g.lineTo(w - 50, -6);
    g.stroke();
  });
}

/** The band name generator's chalkboard: today's suggestion. */
export function drawBandname(b: Board, name: string) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#2f3b33';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 20; i++) g.fillRect(Math.random() * w, Math.random() * h, 60, 2);
    g.fillStyle = '#f1f1e6';
    g.textAlign = 'center';
    g.font = `700 30px ${HAND}`;
    g.fillText('BANDNAME-GENERATOR', w / 2, 44);
    g.font = `500 20px ${HAND}`;
    g.fillStyle = '#c9d6c3';
    g.fillText('Keine Idee? Würfel dir einen:', w / 2, 80);
    g.fillStyle = '#ffe28a';
    fit(g, `„${name}“`, w - 40, 46, HAND, 700);
    g.fillText(`„${name}“`, w / 2, h * 0.62);
    g.font = `500 20px ${HAND}`;
    g.fillStyle = '#c9d6c3';
    g.fillText('E: neu würfeln', w / 2, h - 20);
  });
}

/** The tip jar's label. */
export function drawTips(b: Board, tips: number) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#fff7c2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d1d1d';
    g.textAlign = 'center';
    g.font = `700 30px ${HAND}`;
    g.fillText('TRINKGELD', w / 2, 40);
    g.font = `600 22px ${HAND}`;
    g.fillText('für neue Saiten', w / 2, 70);
    g.font = `700 34px ${HAND}`;
    g.fillStyle = '#2a9d8f';
    g.fillText(`${tips} €`, w / 2, 112);
  });
}

/** A recorder's little display: STOP, REC with the time, or PLAY with the take. */
export function drawRecorder(b: Board, r: RoomView | undefined, takeName: string | null, now: number) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#081208';
    g.fillRect(0, 0, w, h);
    g.font = `700 30px "Courier New", monospace`;
    g.textAlign = 'left';
    if (r?.rec) {
      const t = now - r.rec.startAt;
      g.fillStyle = '#ff4040';
      g.fillText(t < 0 ? `● ${Math.ceil(-t / (60_000 / r.rec.bpm))}…` : `● REC ${mmss(t)}`, 12, 44);
    } else if (r?.playing) {
      g.fillStyle = '#7dffb0';
      g.fillText(`▶ ${mmss(Math.max(0, now - r.playing.startAt))}`, 12, 44);
      g.font = `600 18px "Courier New", monospace`;
      g.fillText((takeName ?? '').slice(0, 22), 12, 76);
    } else {
      g.fillStyle = '#5fbf7f';
      g.fillText('■ BEREIT', 12, 44);
    }
  });
}

const LANE_COLORS: Record<string, string> = { drums: '#ffd166', bass: '#06d6a0', guitar: '#ef476f', keys: '#118ab2' };

/** The studio's session screen: a DAW's tracks with the take's notes on them, and where it's at. */
export function drawSession(b: Board, title: string, evs: readonly [number, string, number, number, number][], kindOf: (spot: string) => string | undefined, dur: number, head: number, rec: boolean) {
  draw(b, (g, w, h) => {
    g.fillStyle = '#1b1f27';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a303c';
    g.fillRect(0, 0, w, 34);
    g.fillStyle = rec ? '#ff4d4d' : '#cfd8e3';
    g.font = `800 20px ${SANS}`;
    g.textAlign = 'left';
    g.fillText(title.slice(0, 48), 12, 24);
    const lanes = ['drums', 'bass', 'guitar', 'keys'];
    const top = 44;
    const lh = (h - top - 10) / lanes.length;
    lanes.forEach((k, i) => {
      g.fillStyle = i % 2 ? '#20252f' : '#232935';
      g.fillRect(90, top + i * lh, w - 96, lh - 4);
      g.fillStyle = LANE_COLORS[k];
      g.fillRect(6, top + i * lh, 78, lh - 4);
      g.fillStyle = '#10141c';
      g.font = `800 15px ${SANS}`;
      g.fillText(k.toUpperCase(), 12, top + i * lh + lh / 2 + 2);
    });
    if (dur <= 0) return;
    for (const ev of evs) {
      const k = kindOf(ev[1]);
      const i = lanes.indexOf(k ?? '');
      if (i < 0) continue;
      const x = 90 + (ev[0] / dur) * (w - 96);
      const p = k === 'drums' ? (ev[2] - 35) / 20 : (ev[2] - 28) / 70;
      const y = top + i * lh + (lh - 10) * (1 - Math.max(0, Math.min(1, p))) + 2;
      g.fillStyle = LANE_COLORS[k!];
      g.fillRect(x, y, Math.max(3, ((ev[4] * 1000) / dur) * (w - 96)), 5);
    }
    if (head >= 0) {
      g.fillStyle = rec ? '#ff4d4d' : '#7dffb0';
      g.fillRect(90 + (Math.min(head, dur) / dur) * (w - 96), top - 6, 2, h - top);
    }
  });
}

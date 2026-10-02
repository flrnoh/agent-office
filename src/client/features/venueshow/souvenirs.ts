import { GIG_KINDS, POSTER_COLORS, type Gig } from '../../../shared/venueshow';
import { gigDate } from './posters';

// What you take home from the SCHALLWERK (flrnoh fork, see FORK.md "The show"): the ticket stub of
// every gig you were at (kept in this browser), and the concert photos you took from the crowd (K,
// kept while the page is open), each to look at in the programme window and save as a PNG.

export type Ticket = Pick<Gig, 'id' | 'title' | 'kind' | 'start' | 'color' | 'text'> & { no: number };
export interface Photo {
  url: string;
  at: number;
  caption: string;
}

const KEY = 'agent-office.venue.tickets';
const MAX_TICKETS = 40;
const MAX_PHOTOS = 12;

export function tickets(): Ticket[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.start === 'number') as Ticket[]) : [];
  } catch {
    return [];
  }
}

/** A stub for `gig`, once: false when you had it already. */
export function keepTicket(gig: Gig): boolean {
  const all = tickets();
  if (all.some((t) => t.id === gig.id)) return false;
  const t: Ticket = { id: gig.id, title: gig.title, kind: gig.kind, start: gig.start, color: gig.color, ...(gig.text ? { text: gig.text } : {}), no: 1 + Math.floor(Math.random() * 999) };
  try {
    localStorage.setItem(KEY, JSON.stringify([t, ...all].slice(0, MAX_TICKETS)));
  } catch {
    return false;
  }
  return true;
}

const photos: Photo[] = [];
export const myPhotos = (): readonly Photo[] => photos;
export function keepPhoto(p: Photo) {
  photos.unshift(p);
  photos.length = Math.min(photos.length, MAX_PHOTOS);
}

/** A ticket stub: the gig, the date, a perforated tear-off with its number. */
export function drawTicket(t: Ticket, w = 520): HTMLCanvasElement {
  const h = Math.round(w * 0.38);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const accent = POSTER_COLORS[t.color] ?? POSTER_COLORS[0];
  const k = w / 520;
  g.scale(k, k);
  const W = 520;
  const H = h / k;
  g.fillStyle = '#fbf6e9';
  g.beginPath();
  g.roundRect(2, 2, W - 4, H - 4, 12);
  g.fill();
  g.fillStyle = accent;
  g.fillRect(2, 2, 26, H - 4);
  // The tear-off, perforated.
  g.setLineDash([4, 6]);
  g.strokeStyle = '#8a8170';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(W - 120, 10);
  g.lineTo(W - 120, H - 10);
  g.stroke();
  g.setLineDash([]);
  const when = gigDate(t.start);
  g.fillStyle = '#1d1d1d';
  g.textAlign = 'left';
  g.font = 'bold 14px Arial, sans-serif';
  g.fillText(`SCHALLWERK · ${GIG_KINDS[t.kind].toUpperCase()}`, 44, 34);
  g.font = 'bold 30px "Arial Black", Arial, sans-serif';
  g.fillText(t.title.toUpperCase().slice(0, 22), 44, 76, W - 180);
  g.font = '16px Arial, sans-serif';
  if (t.text) g.fillText(t.text.slice(0, 40), 44, 102, W - 180);
  g.font = 'bold 18px Arial, sans-serif';
  g.fillText(when.long, 44, H - 46, W - 180);
  g.font = '13px Arial, sans-serif';
  g.fillStyle = '#6b6457';
  g.fillText('Stehplatz · Eintritt frei · Keine Rückgabe', 44, H - 22, W - 180);
  g.save();
  g.translate(W - 60, H / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.fillStyle = accent;
  g.font = 'bold 26px "Arial Black", Arial, sans-serif';
  g.fillText(`Nº ${String(t.no).padStart(3, '0')}`, 0, -6);
  g.fillStyle = '#1d1d1d';
  g.font = 'bold 13px Arial, sans-serif';
  g.fillText('ADMIT ONE', 0, 20);
  g.restore();
  return c;
}

/** A photo off the screen, framed like a print, with its caption under it (a data URL). */
export function framePhoto(src: HTMLCanvasElement, caption: string): string {
  const w = 560;
  const ih = Math.round((w - 40) * (src.height / src.width));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = ih + 90;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 20, 20, w - 40, ih);
  g.fillStyle = '#2b2d42';
  g.font = 'bold 22px "Comic Sans MS", "Bradley Hand", cursive';
  g.textAlign = 'center';
  g.fillText(caption, w / 2, ih + 62, w - 40);
  return c.toDataURL('image/jpeg', 0.86);
}

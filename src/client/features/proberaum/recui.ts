import { BPM_MAX, BPM_MIN, TAKE_NAME_MAX, roomName, spotOf, type TakeEv, type TakeMeta } from '../../../shared/proberaum';
import type { RehearsalRoomId } from '../../../shared/venue';
import { h, openModal, type Modal } from '../../ui/dom';
import { mmss } from './boards';
import type { ProbeApi } from './ui';

/*
 * The recorder's window (flrnoh fork, see FORK.md "The rehearsal wing"): E at a room's mixer (the
 * studio's desk). Start a take (a click at a tempo, counted in, over an earlier take if you like),
 * stop it (keep it under a name, or throw it away), and the room's takes: play one for everyone in
 * the room, round and round (jam over it), rename or delete your own. The timeline shows the take's
 * notes, a lane an instrument, and where playback is.
 */

export interface RecApi extends ProbeApi {
  /** Whether you may use this room's recorder (you're in it; in its band while it's booked). */
  mayUse(room: RehearsalRoomId): boolean;
  /** What the room plays back and how far in, and the take being recorded as this page heard it. */
  position(room: RehearsalRoomId): { take: { id: string; dur: number; evs: TakeEv[] }; at: number } | null;
  recording(room: RehearsalRoomId): { startAt: number; evs: TakeEv[] } | null;
  /** The office's clock. */
  now(): number;
  /** A take's notes, if the page has them (once it's been played back here). */
  notesOf(id: string): TakeEv[] | null;
}

const LANES = ['drums', 'bass', 'guitar', 'keys'] as const;
const LANE_COLORS: Record<string, string> = { drums: '#ffd166', bass: '#06d6a0', guitar: '#ef476f', keys: '#118ab2' };
const LANE_NAMES: Record<string, string> = { drums: 'Drums', bass: 'Bass', guitar: 'Gitarre', keys: 'Keys' };
const keepKeys = (el: HTMLElement) => el.addEventListener('keydown', (e) => e.key !== 'Escape' && e.stopPropagation());

export class RecorderUi {
  private modal: Modal | null = null;
  private room: RehearsalRoomId | null = null;
  private selected: string | null = null;
  private raf = 0;
  private drawList: (() => void) | null = null;

  constructor(private readonly api: RecApi) {}

  get open() {
    return !!this.modal;
  }

  /** The wing changed: the window follows. */
  refresh() {
    this.drawList?.();
  }

  close() {
    this.modal?.close();
  }

  show(room: RehearsalRoomId) {
    const { api } = this;
    this.close();
    this.room = room;
    const bpm = h('input', { type: 'number', min: BPM_MIN, max: BPM_MAX, value: 100, class: 'pb-bpm', title: 'Tempo (BPM)' });
    keepKeys(bpm);
    const click = h('input', { type: 'checkbox', checked: true });
    const countIn = h('input', { type: 'checkbox', checked: true });
    const over = h('input', { type: 'checkbox' });
    const name = h('input', { type: 'text', maxlength: TAKE_NAME_MAX, placeholder: 'Name der Aufnahme (sonst „Take n“)' });
    keepKeys(name);
    const status = h('div.pb-rec-status');
    const transport = h('div.pb-row');
    const list = h('ul.pb-takes');
    const canvas = h('canvas.pb-timeline', { width: 640, height: 168 });
    const note = h('p.setting-note');
    const el = h(
      'div.modal.pb-window.pb-recorder',
      { role: 'dialog', 'aria-label': 'Aufnahme' },
      h('header', {}, h('h2', {}, `🎚️ Aufnahme · ${roomName(room)}`)),
      h(
        'div.body',
        {},
        status,
        canvas,
        h('div.pb-row.pb-opts', {}, h('label.pb-inline', {}, 'Tempo ', bpm, ' BPM'), h('label.pb-inline', {}, click, ' Klick'), h('label.pb-inline', {}, countIn, ' Einzählen'), h('label.pb-inline', { title: 'Die gewählte Aufnahme läuft mit und landet in der neuen' }, over, ' über die gewählte Aufnahme')),
        h('div.pb-row', {}, name),
        transport,
        note,
        h('h3', {}, 'Aufnahmen hier'),
        list,
      ),
      h('footer', {}, h('span.grow', {}, 'Nimmt alles auf, was auf den Instrumenten im Raum gespielt wird. Abspielen hören alle im Raum.')),
    );

    const draw = () => {
      const v = api.view();
      const r = v?.rooms.find((x) => x.id === room);
      const may = api.mayUse(room);
      const takes = (v?.takes ?? []).filter((t) => t.room === room).reverse();
      if (this.selected && !takes.some((t) => t.id === this.selected)) this.selected = null;
      const mine = new Set(api.you().takes);
      note.textContent = may ? '' : api.view()?.rooms.find((x) => x.id === room)?.booking ? 'Der Raum ist gebucht: aufnehmen und abspielen darf hier nur die Band.' : `Dafür musst du in ${roomName(room)} sein.`;
      // The transport.
      const b = (label: string, cls: string, fn: () => void, on = true) => {
        const x = h('button', { type: 'button', class: `btn ${cls}` }, label);
        x.disabled = !may || !on;
        x.addEventListener('click', fn);
        return x;
      };
      if (r?.rec) {
        transport.replaceChildren(
          b('■ Stopp & behalten', 'danger', () => api.send({ t: 'probe.recstop', room, keep: true, name: name.value })),
          b('Verwerfen', '', () => api.send({ t: 'probe.recstop', room, keep: false })),
        );
      } else {
        transport.replaceChildren(
          b('● Aufnahme', 'danger', () => {
            const n = Number(bpm.value);
            api.send({ t: 'probe.rec', room, bpm: Number.isFinite(n) ? n : 100, click: click.checked, countIn: countIn.checked, over: over.checked ? this.selected : null });
          }),
          r?.playing ? b('⏹ Wiedergabe stoppen', '', () => api.send({ t: 'probe.halt', room })) : '',
        );
      }
      list.replaceChildren(
        ...(takes.length
          ? takes.map((t) => this.row(t, room, may, mine.has(t.id), r?.playing?.take === t.id, r?.playing?.loop ?? false))
          : [h('li.empty', {}, 'Noch keine Aufnahme. Spielt was ein!')]),
      );
    };
    this.drawList = draw;
    const modal = openModal(el, {
      doing: '🎚️ at the recorder',
      onClose: () => {
        cancelAnimationFrame(this.raf);
        if (this.modal === modal) {
          this.modal = null;
          this.drawList = null;
          this.room = null;
        }
      },
    });
    this.modal = modal;
    draw();
    const frame = () => {
      this.timeline(canvas, status);
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }

  private row(t: TakeMeta, room: RehearsalRoomId, may: boolean, mine: boolean, playing: boolean, looping: boolean): HTMLElement {
    const { api } = this;
    const li = h('li', { class: `${this.selected === t.id ? 'sel' : ''} ${playing ? 'playing' : ''}`, tabindex: 0 });
    li.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.selected = this.selected === t.id ? null : t.id;
      this.refresh();
    });
    const kinds = t.kinds.map((k) => LANE_NAMES[k] ?? k).join(', ');
    const play = h('button', { type: 'button', class: 'btn primary', title: 'Für alle im Raum abspielen' }, playing ? '↺' : '▶');
    play.disabled = !may;
    play.addEventListener('click', () => api.send({ t: 'probe.play', room, take: t.id, loop: false }));
    const loop = h('button', { type: 'button', class: `btn ${playing && looping ? 'on' : ''}`, title: 'Endlos: jammt drüber' }, '🔁');
    loop.disabled = !may;
    loop.addEventListener('click', () => (playing && looping ? api.send({ t: 'probe.halt', room }) : api.send({ t: 'probe.play', room, take: t.id, loop: true })));
    li.append(h('div.svc-main', {}, h('div.svc-title', {}, t.name), h('div.svc-meta', {}, `${mmss(t.dur)} · ${t.notes} Noten · ${kinds || '–'} · ${t.by}`)), play, loop);
    if (mine) {
      const ren = h('button', { type: 'button', class: 'btn', title: 'Umbenennen' }, '✏️');
      ren.addEventListener('click', () => {
        // In place: the name becomes a field, Enter keeps it.
        const title = li.querySelector('.svc-title')!;
        const input = h('input', { type: 'text', maxlength: TAKE_NAME_MAX, value: t.name });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && input.value.trim()) api.send({ t: 'probe.take', take: t.id, name: input.value });
          if (e.key === 'Enter' || e.key === 'Escape') this.refresh();
        });
        title.replaceChildren(input);
        input.focus();
        input.select();
      });
      const del = h('button', { type: 'button', class: 'btn danger', title: 'Löschen' }, '🗑');
      del.addEventListener('click', () => {
        // Twice: once to ask, once to mean it.
        if (del.dataset.sure) api.send({ t: 'probe.take', take: t.id, del: true });
        else {
          del.dataset.sure = '1';
          del.textContent = 'Wirklich?';
        }
      });
      li.append(ren, del);
    }
    return li;
  }

  /** The timeline: what's being recorded (live), or what plays, or the selected take; a lane an instrument. */
  private timeline(canvas: HTMLCanvasElement, status: HTMLElement) {
    const room = this.room;
    if (!room) return;
    const { api } = this;
    const g = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const now = api.now();
    const r = api.view()?.rooms.find((x) => x.id === room);
    let evs: TakeEv[] = [];
    let dur = 0;
    let head = -1;
    let label = '';
    const rec = r?.rec ? api.recording(room) : null;
    const pos = api.position(room);
    if (r?.rec && rec) {
      evs = rec.evs;
      const t = now - r.rec.startAt;
      dur = Math.max(8000, t + 2000);
      head = Math.max(0, t);
      label = t < 0 ? `● Einzählen … ${Math.ceil(-t / (60_000 / r.rec.bpm))}` : `● AUFNAHME ${mmss(t)} · ${r.rec.bpm} BPM${r.rec.click ? ' · Klick' : ''} · ${r.rec.by}`;
    } else if (pos) {
      evs = pos.take.evs;
      dur = pos.take.dur;
      head = pos.at;
      label = `▶ ${api.view()?.takes.find((x) => x.id === pos.take.id)?.name ?? ''} · ${mmss(pos.at)} / ${mmss(pos.take.dur)}${r?.playing?.loop ? ' · 🔁' : ''}`;
    } else if (this.selected) {
      const meta = api.view()?.takes.find((x) => x.id === this.selected);
      evs = api.notesOf(this.selected) ?? [];
      dur = meta?.dur ?? 0;
      label = meta ? `${meta.name} · ${mmss(meta.dur)}${evs.length ? '' : ' (einmal abspielen, dann siehst du die Noten)'}` : '';
    } else label = '■ Bereit';
    status.textContent = label;
    status.className = `pb-rec-status ${r?.rec ? 'rec' : pos ? 'play' : ''}`;
    g.fillStyle = '#10141c';
    g.fillRect(0, 0, W, H);
    const left = 70;
    const lh = (H - 16) / LANES.length;
    LANES.forEach((k, i) => {
      const y = 8 + i * lh;
      g.fillStyle = i % 2 ? '#161b25' : '#131822';
      g.fillRect(left, y, W - left, lh);
      g.fillStyle = LANE_COLORS[k];
      g.font = '700 13px Nunito, sans-serif';
      g.fillText(LANE_NAMES[k], 8, y + lh / 2 + 4);
    });
    if (dur > 0) {
      // Seconds along the top.
      g.fillStyle = '#3a4252';
      const step = dur > 60_000 ? 10_000 : dur > 20_000 ? 5000 : 1000;
      for (let t = 0; t < dur; t += step) g.fillRect(left + (t / dur) * (W - left), 0, 1, H);
      for (const ev of evs) {
        const kind = spotOf(ev[1])?.kind;
        const lane = LANES.indexOf(kind as (typeof LANES)[number]);
        if (lane < 0) continue;
        const x = left + (ev[0] / dur) * (W - left);
        const y0 = 8 + lane * lh;
        // Pitch within the lane (the drums by piece).
        const p = kind === 'drums' ? (ev[2] - 35) / 20 : (ev[2] - 28) / 70;
        const y = y0 + lh - 4 - Math.max(0, Math.min(1, p)) * (lh - 8);
        const w = Math.max(2, ((ev[4] * 1000) / dur) * (W - left));
        g.globalAlpha = 0.4 + ev[3] * 0.6;
        g.fillStyle = LANE_COLORS[kind!];
        g.fillRect(x, y - 2, w, 4);
      }
      g.globalAlpha = 1;
      if (head >= 0) {
        g.fillStyle = r?.rec ? '#ff4040' : '#7dffb0';
        g.fillRect(left + (Math.min(head, dur) / dur) * (W - left) - 1, 0, 2, H);
      }
    }
  }
}

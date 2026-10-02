import type { InstrumentKind, VenueRoomId } from '../../../shared/venue';
import { KIND_NAMES, ROOM_NAMES, TONE_NAMES, type Jam, type Tone } from '../../../shared/instruments';
import { GROOVES, KEYS_KEYS, LEAD_HOME, NOTE_NAMES, chordOf, leadPitch } from '../../../shared/instruments-play';
import { h } from '../../ui/dom';
import './overlay.css';

// ---- The key map while you play (flrnoh fork, see FORK.md "The instruments") ------------------------------
// A compact panel at the bottom left: which key plays what on your instrument, its keys lighting up
// as you press them, and how the room's jam stands (tempo and the beat, the click, the key and its
// chords, the groove, the sound). Keycaps are labelled as your keyboard has them (a German one's
// Y and Z, Ö and Ä), where the browser says. Not a window: it never takes the mouse; ✕ stops playing.

/** What the panel shows that changes while you play. */
export interface OverlayState {
  kind: InstrumentKind;
  room: VenueRoomId;
  jam: Jam;
  tone: Tone;
  /** The beat of the bar (1..4), 0 with no grid running. */
  beat: number;
  groove: number;
  chord: number;
  power: boolean;
  octave: number;
  down: ReadonlySet<string>;
  /** At a mic: whether you're in voice chat, unmuted, and how loud you are. */
  voice?: { on: boolean; muted: boolean; level: number };
}

// ---- Keycap labels ---------------------------------------------------------------------------------------

const GERMAN: Record<string, string> = { KeyZ: 'Y', KeyY: 'Z', Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Ü', BracketRight: '+', Slash: '-', Equal: '´', Minus: 'ß' };
const NAMED: Record<string, string> = { Space: 'Leer', Escape: 'Esc', Backspace: '⌫', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Comma: ',', Period: '.', ShiftLeft: '⇧' };
let layout: Map<string, string> | null = null;
let layoutAsked = false;
/** The label on a key's cap, as this keyboard has it. */
export function capLabel(code: string): string {
  if (!layoutAsked) {
    layoutAsked = true;
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    void kb?.getLayoutMap?.().then((m) => (layout = m), () => {});
  }
  if (NAMED[code]) return NAMED[code];
  const l = layout?.get(code);
  if (l) return l.toUpperCase();
  if (navigator.language.startsWith('de') && GERMAN[code]) return GERMAN[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

const cap = (code: string) => h('span.ins-cap', { 'data-code': code }, capLabel(code));
const row = (codes: string[], label: string) => h('div.ins-row', {}, h('span.ins-caps', {}, ...codes.map(cap)), h('span.ins-what', {}, label));
const span = (from: string, to: string, label: string) => h('div.ins-row', {}, h('span.ins-caps', {}, cap(from), h('span.ins-dots', {}, '…'), cap(to)), h('span.ins-what', {}, label));

const UPPER = /^(?:Key[QWERTYUIOP]|Digit|Bracket|Equal)/;
const isBlackSemi = (s: number) => [1, 3, 6, 8, 10].includes(s % 12);

/** A little piano for one row of the typing keyboard: its white keys with their caps, the black ones over them. */
function piano(upper: boolean): HTMLElement {
  const keys = Object.entries(KEYS_KEYS)
    .filter(([c]) => UPPER.test(c) === upper)
    .sort((a, b) => a[1] - b[1]);
  const whites = keys.filter(([, s]) => !isBlackSemi(s));
  const el = h('div.ins-piano', { style: `--n:${whites.length}` });
  whites.forEach(([code, s]) => el.append(h('span.ins-cap.ins-wk', { 'data-code': code, title: NOTE_NAMES[s % 12] }, capLabel(code))));
  for (const [code, s] of keys) {
    if (!isBlackSemi(s)) continue;
    // Between the white key below it and the next.
    const i = whites.findIndex(([, w]) => w === s - 1);
    el.append(h('span.ins-cap.ins-bk', { 'data-code': code, style: `--i:${i + 1}` }, capLabel(code)));
  }
  return el;
}

/** The map of each instrument (what doesn't change while you play). */
function keyMap(kind: InstrumentKind): HTMLElement[] {
  const leave = row(kind === 'keys' ? ['Escape', 'Backspace'] : ['KeyE', 'Escape'], kind === 'mic' ? 'Mikro zurück' : 'Aufhören');
  if (kind === 'drums')
    return [
      row(['Space', 'KeyV'], 'Bassdrum'),
      row(['KeyF', 'KeyJ'], 'Snare'),
      row(['KeyX'], 'Snare leise'),
      row(['KeyD', 'KeyK'], 'Hi-Hat zu'),
      row(['KeyS', 'KeyL'], 'Hi-Hat offen'),
      row(['Comma'], 'Hi-Hat leise'),
      row(['KeyR', 'KeyT'], 'Tom 1 · Tom 2'),
      row(['KeyG', 'KeyH'], 'Standtom'),
      row(['KeyQ', 'KeyP'], 'Crash'),
      row(['KeyW', 'KeyO'], 'Ride'),
      row(['ShiftLeft'], 'Akzent (laut)'),
      span('Digit1', 'Digit5', `Groove: ${GROOVES.map((g) => g.name).join(', ')}`),
      row(['Digit0'], 'Groove aus'),
      row(['ArrowUp', 'ArrowDown'], 'Tempo (mit ⇧ ±1)'),
      row(['KeyN'], 'Klick an/aus'),
      row(['KeyB'], 'Einzählen'),
      leave,
    ];
  if (kind === 'guitar' || kind === 'bass')
    return [
      span('Digit1', 'Digit8', kind === 'bass' ? 'Grundton der Akkorde' : 'Akkord anschlagen'),
      ...(kind === 'guitar' ? [row(['Space'], 'Abschlag'), row(['KeyB'], 'Aufschlag')] : []),
      span('KeyQ', 'KeyP', 'eine Oktave höher (ohne E)'),
      row(['ShiftLeft'], 'Abdämpfen (Palm Mute)'),
      ...(kind === 'guitar' ? [row(['KeyV'], 'Verzerrer an/aus'), row(['KeyC'], 'Powerchords / volle Akkorde')] : []),
      row(['ArrowLeft', 'ArrowRight'], 'Tonart (für den ganzen Raum)'),
      row(['KeyM'], 'Dur / Moll'),
      leave,
    ];
  if (kind === 'keys')
    return [
      h('div.ins-what', {}, 'obere Oktave'),
      piano(true),
      h('div.ins-what', {}, 'untere Oktave'),
      piano(false),
      row(['Space'], 'Haltepedal'),
      row(['ShiftLeft'], 'laut'),
      row(['ArrowLeft', 'ArrowRight'], 'Oktave'),
      row(['ArrowUp', 'ArrowDown'], 'Klang'),
      leave,
    ];
  return [row(['KeyV'], 'Sprachchat (drücken / halten)'), row(['KeyM'], 'stumm an/aus'), leave];
}

export class Overlay {
  readonly el = h('div.ins-panel.hidden', { 'aria-live': 'polite' });
  private kind: InstrumentKind | null = null;
  private status = h('div.ins-status');
  private chords = h('div.ins-chords');
  /** The lead row's notes in the room's key (guitar and bass). */
  private lead = h('div.ins-lead');
  private beats = h('div.ins-beats', {}, ...[1, 2, 3, 4].map(() => h('span')));
  private caps: HTMLElement[] = [];
  private shown = '';

  constructor(private readonly close: () => void) {}

  /** Up for `kind` in `room`, or down (null). */
  show(kind: InstrumentKind | null, room: VenueRoomId = 'hall') {
    if (kind === this.kind) return;
    this.kind = kind;
    this.shown = '';
    this.el.classList.toggle('hidden', !kind);
    if (!kind) return this.el.replaceChildren();
    const x = h('button.ins-x', { type: 'button', title: 'Aufhören (Esc)', 'aria-label': 'Aufhören', onclick: () => this.close() }, '✕');
    const where = kind === 'mic' ? (room === 'hall' ? 'auf der Bühne' : `im ${ROOM_NAMES[room]}`) : ROOM_NAMES[room];
    this.el.className = `ins-panel ins-${kind}`;
    const map = h('div.ins-map', {}, ...keyMap(kind));
    this.el.replaceChildren(h('div.ins-head', {}, h('span.ins-title', {}, `${KIND_NAMES[kind]} · ${where}`), x), this.beats, this.status, this.chords, this.lead, map);
    this.caps = [...this.el.querySelectorAll<HTMLElement>('.ins-cap')];
  }

  /** Every frame while you play: the parts that change. */
  update(s: OverlayState) {
    for (const c of this.caps) c.classList.toggle('on', s.down.has(c.dataset.code ?? '') || (c.dataset.code === 'ShiftLeft' && (s.down.has('ShiftLeft') || s.down.has('ShiftRight'))));
    const beat = s.beat;
    [...this.beats.children].forEach((b, i) => b.classList.toggle('on', i + 1 === beat));
    this.beats.classList.toggle('hidden', !s.jam.at);
    const keyName = `${NOTE_NAMES[s.jam.key]}-${s.jam.minor ? 'Moll' : 'Dur'}`;
    const parts: string[] = [];
    if (s.kind !== 'mic') parts.push(`♩ ${s.jam.bpm}`, s.jam.click ? 'Klick an' : 'Klick aus');
    if (s.kind === 'guitar' || s.kind === 'bass') parts.push(`Tonart ${keyName}`);
    if (s.kind === 'guitar') parts.push(s.power ? 'Powerchords' : 'Akkorde', TONE_NAMES[s.tone]);
    if (s.kind === 'keys') parts.push(TONE_NAMES[s.tone], `Oktave C${Math.floor(s.octave / 12) - 1}`);
    if (s.kind === 'drums') parts.push(s.groove >= 0 ? `Groove: ${GROOVES[s.groove].name}` : 'Groove aus');
    if (s.kind === 'mic' && s.voice) parts.push(!s.voice.on ? '🔇 Sprachchat ist aus: V' : s.voice.muted ? '🔇 stumm: M' : `🎙️ ${'▮'.repeat(Math.min(8, Math.round(s.voice.level * 40)))}`);
    const text = parts.join(' · ');
    const chordKey = s.kind === 'guitar' || s.kind === 'bass' ? `${s.jam.key}|${s.jam.minor}|${s.chord}` : '';
    const key = `${text}|${chordKey}`;
    if (key === this.shown) return;
    this.shown = key;
    this.status.textContent = s.kind === 'mic' ? `${s.room === 'hall' ? 'Alle im Saal hören dich' : `Nur ${ROOM_NAMES[s.room]} hört dich`} · ${text}` : text;
    if (!chordKey) {
      this.chords.replaceChildren();
      this.lead.replaceChildren();
      return;
    }
    const kind = s.kind as 'guitar' | 'bass';
    this.lead.replaceChildren(
      h('div.ins-what', {}, 'Pentatonik'),
      h('div.ins-strip', {}, ...LEAD_HOME.map((code) => h('span.ins-note', {}, cap(code), h('small', {}, NOTE_NAMES[(leadPitch(kind, code, s.jam.key, s.jam.minor) ?? 0) % 12])))),
    );
    this.caps = [...this.el.querySelectorAll<HTMLElement>('.ins-cap')];
    this.chords.replaceChildren(...[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => h(`span.ins-chord${slot === s.chord ? '.on' : ''}`, {}, h('b', {}, String(slot + 1)), chordOf(s.jam.key, s.jam.minor, slot).name)));
  }
}

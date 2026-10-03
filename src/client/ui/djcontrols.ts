import { PARTY_VOLUME_MAX, djSetSeekable, setClock } from '../../shared/djset';
import type { DjSetPlayer } from '../djset';
import { store } from '../state';
import { h } from './dom';

/*
 * The controls both DJ desks share (flrnoh fork, see FORK.md): the roof's booth (djbooth.ts) and the
 * Schallwerk's (features/venueshow/ui.ts). Skipping through the set that's on, for everyone at once
 * (the office moves when it started, every page's player jumps), and the party's volume for everyone
 * there, the team's to set. Each window says it in its own language: the roof's English, the
 * Schallwerk's German.
 */

type Lang = 'en' | 'de';

const SKIP_TEXT = {
  en: { back: 'Back 30 seconds', ahead: (s: string) => `Ahead ${s}`, slider: 'Where in the set', note: 'Skips for everyone, all at once.', playlist: "A SoundCloud set only plays from its top: it can't be skipped through.", unknown: 'How long it is shows once it plays here.' },
  de: { back: '30 Sekunden zurück', ahead: (s: string) => `${s} vor`, slider: 'Stelle im Set', note: 'Spult für alle gleichzeitig.', playlist: 'Ein SoundCloud-Set läuft nur von vorn, da lässt sich nicht spulen.', unknown: 'Die Länge zeigt sich, sobald es hier läuft.' },
} as const;

/** The skips the buttons do (s). */
const SKIPS = [-30, 30, 120, 300] as const;
const skipLabel = (s: number) => (s < 0 ? `⏪ ${-s} s` : s < 60 ? `⏩ ${s} s` : `⏩ ${s / 60} min`);

export interface SkipOptions {
  player: DjSetPlayer;
  lang: Lang;
  /** Sends where in the set to go (s). */
  seek(at: number): void;
}

/**
 * Where the set is (4:05 / 58:12), a slider over its length once the player knows it, and buttons:
 * 30 s back, 30 s, 2 and 5 minutes ahead. `render` when the set changes; it keeps its clock running
 * by itself till `stop`.
 */
export function skipControls(o: SkipOptions) {
  const t = SKIP_TEXT[o.lang];
  const clock = h('span.vol-pct', { style: 'min-width:0;font-variant-numeric:tabular-nums' });
  const slider = h('input', { type: 'range', min: 0, max: 1, step: 1, value: 0, 'aria-label': t.slider }) as HTMLInputElement;
  const note = h('p.setting-note');
  /** While you drag the slider, the clock shows where you're dragging to. */
  let dragging = false;
  /** Where you asked to go, till the office's answer comes (so the clock doesn't jump back for a moment). */
  let asked: { at: number; when: number } | null = null;
  const go = (at: number) => {
    const len = o.player.length();
    const to = Math.max(0, Math.round(len ? Math.min(at, len - 2) : at));
    asked = { at: to, when: Date.now() };
    o.seek(to);
    paint();
  };
  const buttons = SKIPS.map((s) => h('button.btn', { type: 'button', title: s < 0 ? t.back : t.ahead(skipLabel(s).slice(2)), onclick: () => go(where() + s) }, skipLabel(s)));
  slider.addEventListener('input', () => ((dragging = true), paint()));
  slider.addEventListener('change', () => {
    dragging = false;
    go(Number(slider.value));
  });
  const el = h('div', {}, h('div.volume', {}, slider, clock), h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:6px' }, ...buttons), note);

  /** Where everyone is in the set now (s). */
  function where(): number {
    const since = asked ? Date.now() - asked.when : Infinity;
    if (asked && since < 1500) return asked.at + since / 1000;
    asked = null;
    return o.player.expectedAt(store.officeNow());
  }

  function paint() {
    const set = o.player.current().set;
    el.classList.toggle('hidden', !set);
    if (!set) return;
    const can = djSetSeekable(set);
    const len = o.player.length();
    for (const b of buttons) b.disabled = !can;
    slider.disabled = !can || !len;
    slider.classList.toggle('hidden', !len);
    if (len) slider.max = String(Math.floor(len));
    const at = dragging ? Number(slider.value) : Math.min(where(), len ?? Infinity);
    if (!dragging && len) slider.value = String(Math.floor(at));
    slider.style.setProperty('--fill', len ? `${((100 * at) / len).toFixed(1)}%` : '0%');
    clock.textContent = len ? `${setClock(at)} / ${setClock(len)}` : setClock(at);
    note.textContent = !can ? t.playlist : len ? t.note : `${t.note} ${t.unknown}`;
  }

  const timer = window.setInterval(paint, 500);
  paint();
  return { el, render: paint, stop: () => clearInterval(timer) };
}

const VOLUME_TEXT = {
  en: { label: 'Party volume, for everyone', silent: 'Silent', silence: '🔇 Silence', on: '🔊 Back on', disco: '🪩 Disco!', normal: '↩︎ Back to normal', discoTitle: 'As loud as it goes, for everyone' },
  de: { label: 'Lautstärke für alle', silent: 'Stumm', silence: '🔇 Stumm', on: '🔊 Wieder an', disco: '🪩 Disco!', normal: '↩︎ Wieder normal', discoTitle: 'So laut es geht, für alle' },
} as const;

export interface PartyVolumeOptions {
  lang: Lang;
  /** Whether you may set it (the team); guests only see it. */
  host: boolean;
  /** Sends the volume (0–2, 2 is Disco) for everyone. */
  setVolume(v: number): void;
}

/**
 * The party's volume for everyone there: a slider to 200 %, silence, and Disco (as loud as it goes;
 * again, back to where it was). `paint(level)` with the office's level; it doesn't move under your
 * hand while you drag it.
 */
export function partyVolumeControls(o: PartyVolumeOptions) {
  const t = VOLUME_TEXT[o.lang];
  const off = o.host ? {} : { disabled: '' };
  const party = h('input', { type: 'range', min: 0, max: PARTY_VOLUME_MAX * 100, step: 1, 'aria-label': t.label, ...off }) as HTMLInputElement;
  const pct = h('span.vol-pct');
  const mute = h('button.btn', { type: 'button', ...off });
  const disco = h('button.btn', { type: 'button', title: t.discoTitle, ...off });
  /** Where it was before Disco, and before silence, to go back to. */
  let beforeDisco = 1;
  let unmuted = 1;
  /** While you drag it (and a moment after), the office's echo doesn't move it under your hand. */
  let handsOnUntil = 0;
  let sentAt = 0;
  let trailing = 0;
  const send = (v: number) => {
    handsOnUntil = Date.now() + 800;
    clearTimeout(trailing);
    const wait = 120 - (Date.now() - sentAt);
    if (wait <= 0) {
      sentAt = Date.now();
      o.setVolume(v);
    } else trailing = window.setTimeout(() => ((sentAt = Date.now()), o.setVolume(v)), wait);
  };
  const show = (v: number) => {
    const n = Math.round(v * 100);
    party.value = String(n);
    party.style.setProperty('--fill', `${(n / PARTY_VOLUME_MAX).toFixed(1)}%`);
    pct.textContent = n ? `${n}%${n > 100 ? ' 🔥' : ''}` : t.silent;
    mute.textContent = n ? t.silence : t.on;
    const full = v >= PARTY_VOLUME_MAX;
    disco.textContent = full ? t.normal : t.disco;
    disco.classList.toggle('primary', !full);
    // Past 100% the slider glows hot.
    if (v > 1) party.style.setProperty('--accent', '#ff3d81');
    else party.style.removeProperty('--accent');
  };
  const set = (v: number) => {
    if (v > 0) unmuted = v;
    show(v);
    send(v);
  };
  disco.addEventListener('click', () => {
    const now = Number(party.value) / 100;
    if (now < PARTY_VOLUME_MAX) beforeDisco = now || 1;
    set(now >= PARTY_VOLUME_MAX ? Math.min(1, beforeDisco) : PARTY_VOLUME_MAX);
  });
  party.addEventListener('input', () => set(Number(party.value) / 100));
  mute.addEventListener('click', () => set(Number(party.value) > 0 ? 0 : unmuted || 1));
  return {
    /** The label's row with Disco, and the slider's. */
    head: (label: string) => h('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:16px' }, h('label', { style: 'flex:1;margin:0' }, label), disco),
    row: h('div.volume', {}, mute, party, pct),
    paint(level: number) {
      if (level > 0) unmuted = level;
      if (Date.now() > handsOnUntil) show(level);
    },
  };
}

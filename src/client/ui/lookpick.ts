import type * as THREE from 'three';
import { BEARD_STYLES, BEARD_STYLES_DE, type Look } from '../../shared/avatar';
import { h } from './dom';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): the pickers the character window
// (character.ts), the barber's chair (barber.ts) and the tattoo studio (inkstudio.ts) share.

/** A round color button in a radiogroup. */
export function swatch(color: string, label: string, on: boolean, choose: () => void): HTMLElement {
  return h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(on), style: `background:${color}`, class: on ? 'sel' : '', 'aria-label': label, title: label, onclick: choose });
}

/** A row of buttons, one picked (`on`), in a radiogroup. */
export function segButtons(labels: string[], on: number, choose: (i: number) => void, titles?: string[]): HTMLElement[] {
  return labels.map((name, i) =>
    h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(i === on), class: i === on ? 'on' : '', title: titles?.[i], onclick: () => choose(i) }, name),
  );
}

/** The beard row: BEARD_STYLES, "None" first. `de` labels them in German (the barber's). */
export function beardPicker(current: () => number, choose: (i: number) => void, de = false): { el: HTMLElement; paint(): void } {
  const el = h('div.seg', { role: 'radiogroup', 'aria-label': 'Beard' });
  const paint = () => el.replaceChildren(...segButtons(de ? BEARD_STYLES_DE : BEARD_STYLES, current(), choose, de ? BEARD_STYLES : BEARD_STYLES_DE));
  paint();
  return { el, paint };
}

/** "🖋️ 2 tattoos · 💍 3 piercings": what a look has of them, or '' for none. */
export function marksSummary(look: Look): string {
  const t = look.tattoos?.length ?? 0;
  const p = look.piercings?.length ?? 0;
  const parts = [t ? `🖋️ ${t} tattoo${t === 1 ? '' : 's'}` : '', p ? `💍 ${p} piercing${p === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.join(' · ');
}

/** For the character window: what you have, read-only (they're changed at the studio in town). */
export function marksNote(look: Look): HTMLElement {
  const have = marksSummary(look);
  return h('p.setting-note', {}, have ? `${have}, change them at the tattoo studio in town.` : '🖋️ Tattoos and 💍 piercings: at the tattoo studio in town.');
}

/** Points a preview's camera (character.ts' Preview) at the whole character, or close up at the head. */
export function framePreview(camera: THREE.Camera, at: 'body' | 'head') {
  if (at === 'head') {
    camera.position.set(0, 1.42, 2.1);
    camera.lookAt(0, 1.27, 0);
  } else {
    camera.position.set(0, 1.35, 4.6);
    camera.lookAt(0, 0.95, 0);
  }
}

import './character.css';
import './lookshop.css';
import {
  MAX_PIERCINGS,
  MAX_TATTOOS,
  METALS,
  PIERCING_KINDS,
  TATTOO_MOTIFS,
  TATTOO_SPOTS,
  canPierce,
  canTattoo,
  motifOf,
  piercingKindOf,
  sanitizeLook,
  spotOf,
  withPiercing,
  withTattoo,
  withoutPiercing,
  withoutTattoo,
  type Look,
  type Metal,
} from '../../shared/avatar';
import { Preview } from './character';
import { h, openModal } from './dom';
import { framePreview, segButtons } from './lookpick';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): the tattoo and piercing studio in town.
// Three tabs: a tattoo (a motif on a spot), a piercing (where, and silver or gold), and the laser
// (taking any of them off again). What you pick shows on the turntable first; "Stechen!" (or a
// laser button) hands the new look to the shop (onSave) and the window stays open for the next one.

export type InkWork = 'tattoo' | 'piercing' | 'laser';

export interface InkStudioOptions {
  /** How you look now. */
  look: Look;
  /** Your shirt, for the preview. */
  color: string;
  /** A tattoo or piercing done, or one lasered off: the new look, and which it was. */
  onSave(look: Look, what: InkWork): void;
  /** Closed, by ✕ or Esc. */
  onClose?(): void;
}

const METAL_DE: Record<Metal, string> = { silver: '🥈 Silber', gold: '🥇 Gold' };

export function openInkStudio(opts: InkStudioOptions) {
  /** What you have (after everything done in here so far). */
  let look = sanitizeLook(opts.look, opts.look);
  let tab: InkWork = 'tattoo';
  let motif = TATTOO_MOTIFS[0].id;
  let spot = TATTOO_SPOTS[0].id;
  let kind = PIERCING_KINDS[0].id;
  let metalPick: Metal = 'silver';
  let done = '';

  const canvas = h('canvas', { 'aria-label': 'Du im Spiegel, drag to spin' }) as HTMLCanvasElement;
  const preview = new Preview(canvas, { name: '', color: opts.color, look });
  const tabs = h('div.tabs', { role: 'tablist' });
  const pane = h('div.charsel-opts');
  const doneNote = h('span.grow.done');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, '✕');

  /** The look as it would be with what's picked on this tab, for the turntable. */
  const trying = (): Look => (tab === 'tattoo' ? withTattoo(look, { motif, spot }) : tab === 'piercing' ? withPiercing(look, { kind, metal: metalPick }) : look);

  const commit = (next: Look, what: InkWork, note: string) => {
    look = next;
    done = note;
    opts.onSave(look, what);
    preview.cheer();
    paint();
  };

  const capLine = (n: number, max: number, what: string) => h(`p.cap${n >= max ? '.full' : ''}`, {}, `${n} / ${max} ${what}${n >= max ? ': voll, erst was weglasern' : ''}`);

  const tattooPane = (): (HTMLElement | null)[] => {
    const have = look.tattoos ?? [];
    const there = have.find((t) => t.spot === spot);
    const fits = canTattoo(look, spot);
    const same = there?.motif === motif;
    const go = h('button.btn.primary', { type: 'button', disabled: !fits || same }, there ? 'Drüberstechen! 🖋️' : 'Stechen! 🖋️');
    go.addEventListener('click', () => commit(withTattoo(look, { motif, spot }), 'tattoo', `🖋️ ${motifOf(motif)?.de} auf ${spotOf(spot)?.de}. Frisch gestochen, nicht kratzen!`));
    return [
      h('label', {}, 'Motiv'),
      h(
        'div.motifs',
        { role: 'radiogroup', 'aria-label': 'Motif' },
        ...TATTOO_MOTIFS.map((m) =>
          h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(m.id === motif), class: m.id === motif ? 'on' : '', title: m.en, onclick: () => ((motif = m.id), paint()) }, h('span.emo', {}, m.emoji), m.de),
        ),
      ),
      h('label', {}, 'Stelle'),
      h('div.seg', { role: 'radiogroup', 'aria-label': 'Spot' }, ...segButtons(TATTOO_SPOTS.map((s) => s.de), TATTOO_SPOTS.findIndex((s) => s.id === spot), (i) => ((spot = TATTOO_SPOTS[i].id), paint()), TATTOO_SPOTS.map((s) => s.en))),
      capLine(have.length, MAX_TATTOOS, 'Tattoos'),
      there && !same ? h('p.setting-note', {}, `Da ist schon ${motifOf(there.motif)?.emoji} ${motifOf(there.motif)?.de}: das neue kommt drüber.`) : null,
      same ? h('p.setting-note', {}, 'Genau das hast du da schon.') : null,
      h('div', { style: 'margin-top:10px' }, go),
    ];
  };

  const piercingPane = (): (HTMLElement | null)[] => {
    const have = look.piercings ?? [];
    const there = have.find((p) => p.kind === kind);
    const fits = canPierce(look, kind);
    const same = there?.metal === metalPick;
    const go = h('button.btn.primary', { type: 'button', disabled: !fits || same }, there ? 'Tauschen! 💍' : 'Stechen! 💍');
    go.addEventListener('click', () => commit(withPiercing(look, { kind, metal: metalPick }), 'piercing', `💍 ${piercingKindOf(kind)?.de} in ${METAL_DE[metalPick].slice(3)}. Schick!`));
    const group = (g: 'ear' | 'face') => {
      const kinds = PIERCING_KINDS.filter((k) => k.group === g);
      return h('div.seg', { role: 'radiogroup', 'aria-label': g === 'ear' ? 'Ear' : 'Face' }, ...segButtons(kinds.map((k) => k.de), kinds.findIndex((k) => k.id === kind), (i) => ((kind = kinds[i].id), paint()), kinds.map((k) => k.en)));
    };
    return [
      h('label', {}, 'Ohr'),
      group('ear'),
      h('label', {}, 'Gesicht'),
      group('face'),
      h('label', {}, 'Metall'),
      h('div.seg', { role: 'radiogroup', 'aria-label': 'Metal' }, ...segButtons(METALS.map((m) => METAL_DE[m]), METALS.indexOf(metalPick), (i) => ((metalPick = METALS[i]), paint()))),
      capLine(have.length, MAX_PIERCINGS, 'Piercings'),
      same ? h('p.setting-note', {}, 'Genau das hast du da schon.') : null,
      h('div', { style: 'margin-top:10px' }, go),
    ];
  };

  const laserPane = (): HTMLElement[] => {
    const tattoos = look.tattoos ?? [];
    const piercings = look.piercings ?? [];
    const row = (text: string, button: string, act: () => void) => h('li', {}, h('span.grow', {}, text), h('button.btn.danger', { type: 'button', onclick: act }, button));
    return [
      h('label', {}, 'Tattoos'),
      tattoos.length
        ? h(
            'ul.laser',
            {},
            ...tattoos.map((t) =>
              row(`${motifOf(t.motif)?.emoji} ${motifOf(t.motif)?.de} · ${spotOf(t.spot)?.de}`, '✕ Weglasern', () => commit(withoutTattoo(look, t.spot), 'laser', `🔦 ${motifOf(t.motif)?.de} ist weg. Tat kaum weh.`)),
            ),
          )
        : h('p.empty', {}, 'Keine Tattoos. Noch nicht.'),
      h('label', {}, 'Piercings'),
      piercings.length
        ? h(
            'ul.laser',
            {},
            ...piercings.map((p) =>
              row(`💍 ${piercingKindOf(p.kind)?.de} · ${METAL_DE[p.metal]}`, '✕ Rausnehmen', () => commit(withoutPiercing(look, p.kind), 'laser', `💍 ${piercingKindOf(p.kind)?.de} ist raus.`)),
            ),
          )
        : h('p.empty', {}, 'Keine Piercings.'),
    ];
  };

  const paint = () => {
    tabs.replaceChildren(
      ...(
        [
          ['tattoo', '🖋️ Tattoo'],
          ['piercing', '💍 Piercing'],
          ['laser', '🔦 Laser'],
        ] as const
      ).map(([id, label]) =>
        h('button.btn', { type: 'button', role: 'tab', 'aria-selected': String(id === tab), class: id === tab ? 'on' : '', onclick: () => ((tab = id), (done = ''), paint()) }, label),
      ),
    );
    pane.replaceChildren(tabs, ...(tab === 'tattoo' ? tattooPane() : tab === 'piercing' ? piercingPane() : laserPane()).filter((x): x is HTMLElement => !!x));
    doneNote.textContent = done || 'Steril, sauber, mit Liebe gestochen.';
    // Close up on the face for piercings and a neck tattoo; the whole of you for arms and hands.
    framePreview(preview.camera, tab === 'piercing' || (tab === 'tattoo' && spot === 'neck') ? 'head' : 'body');
    preview.person.setLook(trying());
  };
  paint();

  const el = h(
    'div.modal.charsel.lookshop',
    { role: 'dialog', 'aria-label': 'Tattoo & Piercing' },
    h('header', {}, h('h2', {}, '🖋️ Tattoo & Piercing'), close),
    h('div.body', {}, h('div.charsel-stage', {}, canvas, h('span.tip', {}, 'Drag to spin')), pane),
    h('footer', {}, doneNote),
  );
  const modal = openModal(el, {
    doing: '🖋️ im Tattoostudio',
    onClose: () => {
      preview.dispose();
      opts.onClose?.();
    },
  });
  close.addEventListener('click', () => modal.close());
}

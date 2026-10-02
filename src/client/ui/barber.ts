import './character.css';
import './lookshop.css';
import { HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_STYLES, sameLook, sanitizeLook, withBeard, type Look } from '../../shared/avatar';
import { Preview } from './character';
import { h, openModal } from './dom';
import { beardPicker, framePreview, segButtons, swatch } from './lookpick';

// flrnoh fork (see FORK.md "Beards, tattoos and piercings"): the barber's chair in town. Pick a hair
// style, a color and a beard on a turntable close up, and "Schneiden!" hands the new look to the shop
// (onSave), which saves it as yours. Tattoos and piercings stay as they are.

/** HAIR_STYLES in German, for the chair. */
const STYLES_DE = ['Kurz', 'Lang', 'Dutt', 'Stachelig', 'Locken', 'Pferdeschwanz', 'Glatze'];

export interface BarberOptions {
  /** How you look now. */
  look: Look;
  /** Your shirt, for the preview. */
  color: string;
  /** "Schneiden!": the new look (the window closes after). */
  onSave(look: Look): void;
  /** Closed: after a cut, or by ✕ or Esc without one. */
  onClose?(): void;
}

export function openBarber(opts: BarberOptions) {
  const was = sanitizeLook(opts.look, opts.look);
  let look: Look = { ...was };
  const canvas = h('canvas', { 'aria-label': 'Du im Spiegel, drag to spin' }) as HTMLCanvasElement;
  const preview = new Preview(canvas, { name: '', color: opts.color, look });
  framePreview(preview.camera, 'head');

  const styleRow = h('div.seg', { role: 'radiogroup', 'aria-label': 'Frisur' });
  const hairRow = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Haarfarbe' });
  const beard = beardPicker(() => look.beard ?? 0, (i) => change(withBeard(look, i)), true);
  const save = h('button.btn.primary', { type: 'submit' }, 'Schneiden! ✂️');
  const undo = h('button.btn', { type: 'button', title: 'Back to how you came in' }, '↺ Wie vorher');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, '✕');

  const change = (next: Look) => {
    look = next;
    preview.person.setLook(look);
    preview.cheer();
    paint();
  };
  const paint = () => {
    styleRow.replaceChildren(...segButtons(STYLES_DE, look.style, (i) => change({ ...look, style: i }), HAIR_STYLES));
    hairRow.replaceChildren(...HAIR_COLORS.map((c, i) => swatch(c, HAIR_COLOR_NAMES[i], i === look.hair, () => change({ ...look, hair: i }))));
    beard.paint();
    const same = sameLook(look, was);
    (save as HTMLButtonElement).disabled = same;
    (undo as HTMLButtonElement).disabled = same;
  };
  undo.addEventListener('click', () => change({ ...was }));
  paint();

  const form = h(
    'form.modal.charsel.lookshop',
    { role: 'dialog', 'aria-label': 'Friseur' },
    h('header', {}, h('h2', {}, '💈 Friseur'), close),
    h(
      'div.body',
      {},
      h('div.charsel-stage', {}, canvas, h('span.tip', {}, 'Drag to spin')),
      h('div.charsel-opts', {}, h('label', {}, 'Frisur'), styleRow, h('label', {}, 'Haarfarbe'), hairRow, h('label', {}, 'Bart'), beard.el),
    ),
    h('footer', {}, undo, h('span.grow', {}, 'Waschen, schneiden, föhnen. Der Bart kriegt die Haarfarbe.'), save),
  ) as HTMLFormElement;

  const modal = openModal(form, {
    doing: '💈 beim Friseur',
    onClose: () => {
      preview.dispose();
      opts.onClose?.();
    },
  });
  close.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sameLook(look, was)) return;
    opts.onSave(sanitizeLook(look, was));
    modal.close();
  });
}

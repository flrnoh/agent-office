import './character.css';
import './lookshop.css';
import {
  GLASSES,
  GLASSES_DE,
  HEADWEAR,
  HEADWEAR_DE,
  LEG_COLORS,
  LEG_COLOR_NAMES,
  TINTS,
  TINTS_DE,
  OWNER_TOP,
  TOP_COLORS,
  TOP_STYLES,
  TOP_STYLES_DE,
  sameLook,
  sanitizeLook,
  withOutfit,
  type Look,
  type LookOutfit,
} from '../../shared/avatar';
import { store } from '../state';
import { Preview } from './character';
import { h, openModal } from './dom';
import { framePreview, segButtons, swatch } from './lookpick';

// flrnoh fork (see FORK.md "Shops to walk into", the boutique and the optician): the clothes window
// at the boutique's racks and cubicles, and the optician's mirror. Both are the character window's
// frame with you on a turntable; what you pick goes on at once, "Nehm ich!" keeps it (onSave saves it
// as yours), ✕ or Esc goes back to how you came in. The top's color is your shirt color (the profile's).

export interface WardrobeOptions {
  /** How you look now, and your shirt color. */
  look: Look;
  color: string;
  /** "Nehm ich!": the new look and shirt color (the window closes after). */
  onSave(look: Look, color: string): void;
  onClose?(): void;
}

/** One picker row: a label and a row of buttons or swatches, repainted on every change. */
interface Row {
  label: string;
  el: HTMLElement;
  paint(): void;
}

/**
 * The outfit's rows, for the boutique, the optician and the character window: `which` says which.
 * `get` is the look and color as they are now, `set` changes them.
 */
export function outfitRows(which: ('top' | 'color' | 'legs' | 'hat' | 'specs' | 'tint')[], get: () => { look: Look; color: string }, set: (change: LookOutfit, color?: string) => void, de = true): Row[] {
  const tops = () => (store.me.admin ? TOP_STYLES.length : OWNER_TOP);
  const seg = (label: string, names: string[], other: string[], cur: () => number, pick: (i: number) => void): Row => {
    const el = h('div.seg', { role: 'radiogroup', 'aria-label': label });
    return { label, el, paint: () => el.replaceChildren(...segButtons(de ? names : other, cur(), pick, de ? other : names)) };
  };
  const swatches = (label: string, colors: string[], names: string[], on: (c: string, i: number) => boolean, pick: (c: string, i: number) => void): Row => {
    const el = h('div.swatches', { role: 'radiogroup', 'aria-label': label });
    return { label, el, paint: () => el.replaceChildren(...colors.map((c, i) => swatch(c, names[i] ?? c, on(c, i), () => pick(c, i)))) };
  };
  const rows: Record<string, () => Row> = {
    // The smoking jacket (OWNER_TOP, last) is only on offer to the office's admins; the server keeps it theirs too.
    top: () => seg(de ? 'Oberteil' : 'Top', TOP_STYLES_DE.slice(0, tops()), TOP_STYLES.slice(0, tops()), () => get().look.top ?? 0, (i) => set({ top: i })),
    color: () => swatches(de ? 'Farbe oben' : 'Top color', TOP_COLORS, [], (c) => c.toLowerCase() === get().color.toLowerCase(), (c) => set({}, c)),
    legs: () => swatches(de ? 'Hose' : 'Trousers', LEG_COLORS, LEG_COLOR_NAMES, (_c, i) => i === (get().look.legs ?? 0), (_c, i) => set({ legs: i })),
    hat: () => seg(de ? 'Auf dem Kopf' : 'On your head', HEADWEAR_DE, HEADWEAR, () => get().look.hat ?? 0, (i) => set({ hat: i })),
    specs: () => seg(de ? 'Gestell' : 'Glasses', GLASSES_DE, GLASSES, () => get().look.specs ?? 0, (i) => set({ specs: i })),
    tint: () => seg(de ? 'Gläser' : 'Lenses', TINTS_DE, TINTS, () => get().look.tint ?? 0, (i) => set({ tint: i, specs: get().look.specs || 1 })),
  };
  return which.map((k) => rows[k]());
}

function openWardrobe(kind: 'boutique' | 'optiker', opts: WardrobeOptions) {
  const was = sanitizeLook(opts.look, opts.look);
  const wasColor = opts.color;
  let look: Look = { ...was };
  let color = wasColor;
  const canvas = h('canvas', { 'aria-label': 'Du im Spiegel, drag to spin' }) as HTMLCanvasElement;
  const preview = new Preview(canvas, { name: '', color, look });
  framePreview(preview.camera, kind === 'optiker' ? 'head' : 'body');

  const save = h('button.btn.primary', { type: 'submit' }, kind === 'optiker' ? 'Die nehm ich! 👓' : 'Nehm ich! 🛍️');
  const undo = h('button.btn', { type: 'button', title: 'Back to how you came in' }, '↺ Wie vorher');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, '✕');
  const rows = outfitRows(
    kind === 'optiker' ? ['specs', 'tint'] : ['top', 'color', 'legs', 'hat'],
    () => ({ look, color }),
    (change, c) => {
      look = withOutfit(look, change);
      if (c) color = c;
      preview.person.setLook(look);
      preview.person.setColor(color);
      preview.cheer();
      paint();
    },
  );
  const paint = () => {
    for (const r of rows) r.paint();
    const same = sameLook(look, was) && color === wasColor;
    (save as HTMLButtonElement).disabled = same;
    (undo as HTMLButtonElement).disabled = same;
  };
  undo.addEventListener('click', () => {
    look = { ...was };
    color = wasColor;
    preview.person.setLook(look);
    preview.person.setColor(color);
    paint();
  });
  paint();

  const title = kind === 'optiker' ? '👓 Optiker' : '👗 Umkleide';
  const note = kind === 'optiker' ? 'Aufsetzen, in den Spiegel schauen. Pilotenbrillen kommen dunkel.' : 'Anprobieren kostet nix. Die Farbe oben ist dein Shirt.';
  const form = h(
    'form.modal.charsel.lookshop',
    { role: 'dialog', 'aria-label': kind === 'optiker' ? 'Optiker' : 'Boutique' },
    h('header', {}, h('h2', {}, title), close),
    h('div.body', {}, h('div.charsel-stage', {}, canvas, h('span.tip', {}, 'Drag to spin')), h('div.charsel-opts', {}, ...rows.flatMap((r) => [h('label', {}, r.label), r.el]))),
    h('footer', {}, undo, h('span.grow', {}, note), save),
  ) as HTMLFormElement;

  const modal = openModal(form, {
    doing: kind === 'optiker' ? '👓 beim Optiker' : '👗 in der Umkleide',
    onClose: () => {
      preview.dispose();
      opts.onClose?.();
    },
  });
  close.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sameLook(look, was) && color === wasColor) return;
    opts.onSave(sanitizeLook(look, was), color);
    modal.close();
  });
}

/** The boutique's clothes window: the top, its color, the trousers, something on your head. */
export const openBoutique = (opts: WardrobeOptions) => openWardrobe('boutique', opts);
/** The optician's: frames and lenses. */
export const openOptiker = (opts: WardrobeOptions) => openWardrobe('optiker', opts);

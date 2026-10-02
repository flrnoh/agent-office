import type { FloorInfo } from '../../shared/protocol';
import { INTERIORS, defaultInterior, interiorFor } from '../../shared/interiors';
import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import './floor-interior.css';

// Each storey its own interior (flrnoh fork, see FORK.md): the elevator says how every floor is
// furnished, and an admin picks another interior for a floor from the list beside it (or "· auto", the
// one its place in the stack gives it). The server's `floors` settles it for everyone.

/** Floor `f`'s interior, `index` storeys up (0 is the bottom one), in a word and its emoji: "🏭 Industrie-Loft". */
export function interiorLabel(f: FloorInfo, index: number): string {
  const s = interiorFor(index, f.interior);
  return `${s.emoji} ${s.name}`;
}

/** The interior list beside floor `f`'s button for admins, `index` storeys up; none for anyone else or a floor still being cloned. */
export function interiorPicker(net: Net, f: FloorInfo, index: number): HTMLElement | null {
  if (!store.me.admin || f.cloning) return null;
  const auto = defaultInterior(index);
  const select = h(
    'select.floor-interior',
    { title: `How ${f.name} is furnished`, 'aria-label': `Interior of ${f.name}` },
    h('option', { value: '', title: `The one its place in the building gives it: ${auto.blurb}` }, `${auto.emoji} ${auto.name} · auto`),
    ...INTERIORS.map((s) => h('option', { value: s.id, title: s.blurb }, `${s.emoji} ${s.name}`)),
  ) as HTMLSelectElement;
  select.value = f.interior ?? '';
  select.addEventListener('change', () => {
    const interior = select.value || null;
    if (interior === (f.interior ?? null)) return;
    // Straight away here; the server's list replaces it in a moment.
    store.floors = store.floors.map((x) => (x.id === f.id ? { ...x, interior: interior ?? undefined } : x));
    store.emit('floors');
    net.send({ t: 'floor.interior', id: f.id, interior });
  });
  // Picking from the list isn't riding to the floor.
  select.addEventListener('click', (e) => e.stopPropagation());
  return select;
}

/**
 * Whether an interior list in `list` has the focus (it's open, or about to be): drawing the list again
 * now would snap it shut. `rerender` draws it once the list lets go of the focus.
 */
export function picking(list: HTMLElement, rerender: () => void): boolean {
  const open = document.activeElement;
  if (!(open instanceof HTMLSelectElement) || !open.classList.contains('floor-interior') || !list.contains(open)) return false;
  if (!open.dataset.owed) {
    open.dataset.owed = '1';
    open.addEventListener('blur', () => requestAnimationFrame(rerender), { once: true });
  }
  return true;
}

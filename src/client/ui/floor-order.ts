import type { FloorInfo } from '../../shared/protocol';
import { moveId } from '../../shared/floor-order';
import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import './floor-order.css';

// Floors in any order (flrnoh fork, see FORK.md): in the elevator an admin drags a floor by its ⠿
// grip to another place in the stack, or moves it a floor up or down with ↑ and ↓ (the keyboard's
// way). The numbers change at once; the server's `floors` settles it. The roof, the garage and floors
// still being cloned don't move.

export interface FloorOrder {
  /** Admin controls around a floor's row (grip, ↑ ↓), or the row as it is when it can't move. */
  row(row: HTMLElement, f: FloorInfo): HTMLElement;
  /** A floor is being dragged: re-rendering the list now would drop it mid-air. */
  dragging(): boolean;
}

/** The built floors' ids, bottom floor first, as the server keeps them. */
const builtIds = (): string[] => store.floors.filter((f) => !f.cloning).map((f) => f.id);

/**
 * Drag and drop for one elevator panel. `list` holds the rows; `rerender` draws them again once a
 * drag that held re-rendering back is over.
 */
export function floorOrder(net: Net, list: HTMLElement, rerender: () => void): FloorOrder {
  let dragId: string | null = null;
  /** Re-rendering was asked for mid-drag. */
  let owed = false;
  /** The ↑/↓ button that has the focus, to give it back each time the list is drawn again. */
  let keep: { id: string; dir: string } | null = null;
  list.addEventListener('focusin', (e) => {
    const b = e.target as HTMLElement;
    const id = b.closest<HTMLElement>('[data-floor]')?.dataset.floor;
    keep = b.dataset.move && id ? { id, dir: b.dataset.move } : null;
  });
  list.addEventListener('focusout', (e) => {
    // Gone with the old list is not gone (the browser blurs a button as it's taken out): only the
    // person moving the focus away is, and then the button is still there.
    const b = e.target as HTMLElement;
    setTimeout(() => {
      if (b.isConnected && !list.contains(document.activeElement)) keep = null;
    }, 0);
  });
  const giveFocusBack = () => {
    if (!keep || list.contains(document.activeElement)) return;
    const b = list.querySelector<HTMLButtonElement>(`[data-floor="${CSS.escape(keep.id)}"] [data-move="${keep.dir}"]`);
    // At the end of the building the other way is the one left.
    const other = list.querySelector<HTMLButtonElement>(`[data-floor="${CSS.escape(keep.id)}"] [data-move="${keep.dir === 'up' ? 'down' : 'up'}"]`);
    (b && !b.disabled ? b : other)?.focus();
  };

  const send = (ids: string[]) => {
    const now = builtIds();
    if (ids.join('\n') === now.join('\n')) return;
    // Straight away here, cloning floors still on top; the server's list replaces it in a moment.
    const byId = new Map(store.floors.map((f) => [f.id, f] as const));
    store.floors = [...ids.map((id) => byId.get(id)!).filter(Boolean), ...store.floors.filter((f) => f.cloning)];
    store.emit('floors');
    net.send({ t: 'floor.order', ids });
  };

  const clearMarks = () => {
    for (const el of list.querySelectorAll('.drop-above, .drop-below, .dragging')) el.classList.remove('drop-above', 'drop-below', 'dragging');
  };

  const endDrag = () => {
    dragId = null;
    clearMarks();
    if (owed) {
      owed = false;
      rerender();
    }
  };

  /** Whether the pointer is over the top half of `el`, which on the panel is the floor above. */
  const upperHalf = (el: HTMLElement, e: DragEvent) => {
    const r = el.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  };

  const row = (el: HTMLElement, f: FloorInfo): HTMLElement => {
    const ids = builtIds();
    const i = ids.indexOf(f.id);
    if (!store.me.admin || f.cloning || i < 0 || ids.length < 2) return el;
    el.classList.add('orderable');
    el.dataset.floor = f.id;

    const grip = h('span.floor-grip', { title: `Drag to move ${f.name} up or down the building`, 'aria-hidden': 'true' }, '⠿');
    const up = h('button.btn.floor-move', { type: 'button', 'data-move': 'up', title: 'Move a floor up', 'aria-label': `Move ${f.name} a floor up`, disabled: i === ids.length - 1 }, '↑');
    const down = h('button.btn.floor-move', { type: 'button', 'data-move': 'down', title: 'Move a floor down', 'aria-label': `Move ${f.name} a floor down`, disabled: i === 0 }, '↓');
    const step = (dir: 'up' | 'down') => {
      // Safari doesn't focus a button that's clicked.
      keep = { id: f.id, dir };
      send(moveId(builtIds(), f.id, builtIds().indexOf(f.id) + (dir === 'up' ? 1 : -1)));
    };
    up.addEventListener('click', () => step('up'));
    down.addEventListener('click', () => step('down'));
    el.prepend(grip);
    el.append(h('span.floor-moves', {}, up, down));
    // Once the new list is in the page.
    if (keep?.id === f.id) requestAnimationFrame(giveFocusBack);

    // Only the grip starts a drag, so clicking the floor still rides there.
    grip.addEventListener('pointerdown', () => (el.draggable = true));
    el.addEventListener('pointerup', () => (el.draggable = false));
    el.addEventListener('dragstart', (e) => {
      if (!el.draggable) return e.preventDefault();
      dragId = f.id;
      e.dataTransfer?.setData('text/plain', f.name);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      // After the browser has taken its picture of the row.
      requestAnimationFrame(() => el.classList.add('dragging'));
    });
    el.addEventListener('dragend', () => {
      el.draggable = false;
      endDrag();
    });
    el.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const above = upperHalf(el, e);
      if (el.classList.contains(above ? 'drop-above' : 'drop-below')) return;
      clearMarks();
      list.querySelector(`[data-floor="${CSS.escape(dragId)}"]`)?.classList.add('dragging');
      if (dragId !== f.id) el.classList.add(above ? 'drop-above' : 'drop-below');
    });
    el.addEventListener('dragleave', (e) => {
      if (!el.contains(e.relatedTarget as Node | null)) el.classList.remove('drop-above', 'drop-below');
    });
    el.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const moving = dragId;
      const above = upperHalf(el, e);
      endDrag();
      if (moving === f.id) return;
      // The panel lists the top floor first: over a row is a floor higher than it.
      const rest = builtIds().filter((id) => id !== moving);
      const at = rest.indexOf(f.id);
      if (at >= 0) send(moveId(builtIds(), moving, above ? at + 1 : at));
    });
    return el;
  };

  return {
    row,
    dragging: () => {
      if (dragId) owed = true;
      return !!dragId;
    },
  };
}

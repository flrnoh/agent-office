import { h } from './dom';

/**
 * flrnoh fork: a setting that's on or off, as a pair of buttons (the page turns at the bookshelf, the
 * sounds of the city). `get` says which it is now; `set` is called with the other when it's clicked.
 */
export function onOffRow(label: string, onLabel: string, get: () => boolean, set: (on: boolean) => void): HTMLDivElement {
  const row = h('div.seg', { role: 'radiogroup', 'aria-label': label });
  const paint = () =>
    row.replaceChildren(
      ...(
        [
          [true, onLabel],
          [false, 'Off'],
        ] as const
      ).map(([on, text]) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(get() === on),
            class: get() === on ? 'on' : '',
            onclick: () => {
              if (get() === on) return;
              set(on);
              paint();
            },
          },
          text,
        ),
      ),
    );
  paint();
  return row;
}

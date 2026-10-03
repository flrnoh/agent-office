import type { SlideBoards, SlideId } from './therme-slides.js';

/*
 * The thermal baths' messages (flrnoh fork, see FORK.md "The thermal baths"): what a page tells the
 * office about the slides (the office clocks every ride itself, from when it hears the start to when
 * it hears the finish), and what it hears back: the boards for everyone in the baths, your ride for you.
 */

export type ThermeClientMsg =
  /** Off down `slide` (lane `lane` of the racer), or just landed at its bottom. */
  { t: 'therme.slide'; slide: SlideId; phase: 'start' | 'finish'; lane?: number };

export type ThermeServerMsg =
  /** Every slide's best rides (to everyone in the baths, on arriving and whenever one changes). */
  | { t: 'therme.slides'; boards: SlideBoards }
  /** Your ride, as the office clocked it: its time, where it went on the board (0: not on it), your best. */
  | { t: 'therme.ride'; slide: SlideId; ms: number; rank: number; best: number; lane?: number };

/*
 * flrnoh fork (see FORK.md "Dancing on the roof"): the dance picker over the hint bar. On the dance
 * floor, not dancing yet, it's a small "B · Tanzen" pill; while you dance, a row of every move with
 * its key (click one, or press it), the one you dance lit up, and with Freestyle on, which move it's
 * at just now.
 */
import { DANCE_MOVES, FREESTYLE, type DanceId, type FreestylePick } from '../../../shared/dance';
import { h } from '../../ui/dom';
import './ui.css';

/** The keys the picker shows, by move: 1–9 and 0 the first ten, F Freestyle; the rest by Q and E (or a click). */
export const DANCE_KEYS: ReadonlyMap<DanceId, string> = new Map<DanceId, string>([
  ['freestyle', 'F'],
  ...DANCE_MOVES.slice(0, 10).map((m, i) => [m.id, String((i + 1) % 10)] as [DanceId, string]),
]);

/** What the extras Freestyle dances besides the moves look like in the picker. */
const EXTRAS: Record<Exclude<FreestylePick, DanceId>, string> = { sway: '🌅 Sway', rise: '⏫ Build-up', jump: '💥 Drop!' };

export class DancePanel {
  readonly el = h('div.dance-panel.hidden', { 'aria-live': 'polite' });
  private shown = '';

  constructor(private readonly choose: (id: DanceId) => void) {
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-move]');
      if (b) this.choose(b.dataset.move as DanceId);
    });
    // A click on the picker doesn't go through to the office (no mouse-look grab, no walking there).
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Nothing, the pill (`invite`), or the picker with `dance` lit and Freestyle's `pick`. */
  show(mode: 'off' | 'invite' | 'dancing', dance: DanceId | null = null, pick: FreestylePick | null = null) {
    const k = `${mode}|${dance}|${dance === 'freestyle' ? pick : ''}`;
    if (k === this.shown) return;
    this.shown = k;
    this.el.classList.toggle('hidden', mode === 'off');
    this.el.classList.toggle('invite', mode === 'invite');
    if (mode === 'off') return this.el.replaceChildren();
    if (mode === 'invite') return this.el.replaceChildren(h('span.key', {}, 'B'), h('span', {}, '🕺 Tanzen'));
    const chip = (id: DanceId, emoji: string, label: string, about: string) =>
      h(
        'button.dance-move',
        { type: 'button', 'data-move': id, class: id === dance ? 'on' : '', title: `${label}: ${about}`, 'aria-pressed': String(id === dance) },
        h('span.emoji', {}, emoji),
        h('span.name', {}, label),
        DANCE_KEYS.has(id) ? h('span.num', {}, DANCE_KEYS.get(id)!) : '',
      );
    const now = dance === 'freestyle' && pick ? (pick in EXTRAS ? EXTRAS[pick as keyof typeof EXTRAS] : DANCE_MOVES.find((m) => m.id === pick)?.label) : '';
    this.el.replaceChildren(
      h('div.dance-row', {}, chip('freestyle', FREESTYLE.emoji, FREESTYLE.label, FREESTYLE.about), ...DANCE_MOVES.map((m) => chip(m.id, m.emoji, m.label, m.about))),
      h('div.dance-now', {}, now ? `✨ Freestyle tanzt gerade: ${now}` : 'Im Takt, solange du willst · W A S D oder B hört auf'),
    );
  }
}

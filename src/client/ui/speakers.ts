import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import { SPEAKER_STEPS, speakerStep } from '../speakers';
import './speakers.css';

// flrnoh fork: the speakers all over the office (see ../speakers.ts), in the jukebox's window: your
// own speaker volume in four steps, and for the team a switch for the whole floor.

/** Reading and setting your own speaker volume (kept with the other settings). */
export interface SpeakerControl {
  get(): { speakers: number; speakersMuted: boolean };
  set(speakers: number, muted: boolean): void;
}

/** The row in the jukebox's window, and a `render` to call when the jukebox changes. */
export function speakerRow(net: Net, control: SpeakerControl): { el: HTMLElement; render(): void } {
  const steps = h('div.seg.jb-speakers', { role: 'radiogroup', 'aria-label': 'Speaker volume' });
  const floor = h('button.btn', { type: 'button' });
  floor.addEventListener('click', () => net.send({ t: 'jukebox.speakers', on: !!store.jukebox.speakersOff }));
  const el = h('div.jb-speakers-row', {}, h('span.jb-speakers-label', {}, '🔈 Speakers'), steps, floor);
  const render = () => {
    const off = !!store.jukebox.speakersOff;
    const { speakers, speakersMuted } = control.get();
    const at = speakerStep(speakers, speakersMuted);
    steps.replaceChildren(
      ...SPEAKER_STEPS.map((s, i) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            title: i === 0 ? 'Mute the speakers for you' : `${s.label} (${Math.round(s.level * 100)}%) for you`,
            'aria-label': s.label,
            'aria-checked': String(i === at),
            class: i === at ? 'on' : '',
            onclick: () => {
              // Off mutes, keeping the level you had; a step sets it and unmutes.
              if (i === 0) control.set(speakers, true);
              else control.set(s.level, false);
              render();
            },
          },
          s.bars,
        ),
      ),
    );
    steps.classList.toggle('muted', off);
    // Switching them for the whole floor is the team's (the server says no to guests).
    floor.hidden = !!store.me.guest;
    floor.textContent = off ? '🔊 On for everyone' : '🔇 Off for everyone';
    floor.title = off ? 'The speakers are off on this floor for everyone: switch them back on' : 'Switch the speakers off on this floor for everyone (the jukebox plays on)';
    floor.classList.toggle('danger', off);
  };
  render();
  return { el, render };
}

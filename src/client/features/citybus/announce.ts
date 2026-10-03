/**
 * flrnoh fork (see FORK.md "Traffic lights and the city bus"): what you hear riding a city bus. As it
 * pulls away from a stop: the gong, and the next stop called out ("Nächster Halt: Kino"); as it comes
 * in: the stop's name, and "Endhaltestelle" at the end of its round (its first stop, where it waits).
 * The voice is the browser's own speech in German, at the office sounds' volume; without one, the gong
 * and the display still say it.
 */
import { BUS_RUNS, nextStop, type BusPose } from '../../../shared/citybus';
import type { Settings } from '../../state/persist';

/** A German voice, if the browser has one. */
function germanVoice(): SpeechSynthesisVoice | undefined {
  const all = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  return all.find((v) => v.lang === 'de-DE' && /anna|petra|helena|google/i.test(v.name)) ?? all.find((v) => v.lang.startsWith('de'));
}

export class Announcer {
  /** The bus and stop we called last ("run:stop:at"), so each is called once. */
  private last = '';

  constructor(
    private readonly settings: Settings,
    private readonly gong: () => void,
  ) {}

  /** Each frame you ride bus `run`: calls the next stop as it leaves one, the stop as it comes in. */
  update(run: number, pose: BusPose) {
    const line = BUS_RUNS[run].line;
    const next = nextStop(line, pose);
    // Coming in: once the doors open. Pulling away: once it's moving again.
    const at = next.at && pose.doors > 0.5;
    if (!at && pose.speed < 1) return;
    const key = `${run}:${next.i}:${at}`;
    if (key === this.last) return;
    const first = !this.last;
    this.last = key;
    // Not the moment you get on: only from the next change.
    if (first) return;
    const name = line.stops[next.i].name;
    if (at) this.say(next.i === 0 ? `${name}. Endhaltestelle, bitte alle aussteigen.` : name);
    else {
      this.gong();
      window.setTimeout(() => this.say(`Nächster Halt: ${name}`), 1300);
    }
  }

  /** Off the bus: the next one starts afresh. */
  reset() {
    this.last = '';
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private say(text: string) {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const { volume, muted } = this.settings;
    if (muted || volume <= 0 || document.hidden) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const voice = germanVoice();
    if (voice) u.voice = voice;
    u.rate = 1.02;
    u.volume = Math.min(1, volume * 0.9);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

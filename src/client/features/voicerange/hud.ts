/*
 * flrnoh fork (see FORK.md "Hörkreise"): the top bar's button while you're in voice: how far your
 * voice carries and how many hear you. A click goes to the next size (Flüstern, Gespräch, Raum,
 * Rufen, Megafon); , and . make it smaller or bigger step by step.
 */
import { nextVoicePreset, voiceRangeWord } from '../../../shared/voicerange';
import type { HudAction } from '../../ui/menu';
import type { Voice } from '../../voice';
import { hearers, myVoiceRange, setMyVoiceRange } from './state';

export function voiceRangeAction(voice: Voice): HudAction {
  const who = () => {
    const n = hearers.names;
    return n.length ? `Hört dich: ${n.join(', ')}` : 'Niemand in deinem Kreis hört dich gerade';
  };
  return {
    id: 'voicerange',
    icon: '◯',
    label: () => `Hörkreis: ${voiceRangeWord(myVoiceRange())}`,
    section: 'Together',
    key: ', .',
    shown: () => voice.inVoice,
    status: () => voice.inVoice,
    chip: () => `${voiceRangeWord(myVoiceRange()).split(' · ')[1]} · 👂 ${hearers.names.length}`,
    title: () => `Hörkreis ${voiceRangeWord(myVoiceRange())}: nur wer drinsteht, hört dich. Klick für die nächste Größe, , kleiner, . größer. ${who()}`,
    run: () => setMyVoiceRange(nextVoicePreset(myVoiceRange())),
  };
}

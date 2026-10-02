/*
 * flrnoh fork (see FORK.md "Karaoke"): the PA. Whoever's on it (the singers on the karaoke stage, see
 * features/karaoke) is heard at full volume wherever you stand, not fading with distance as voice
 * otherwise does, with a little room reverb mixed in. Voice (voice.ts) asks it for each peer's volume
 * and hands it each peer's audio as it comes; who's on it is the karaoke bar's to say (Voice.setPa).
 */

/** What the PA needs of one voice connection. */
export interface PaConn {
  audio: HTMLAudioElement;
  /** The peer's voice in Voice's audio context, once it's there. */
  src?: MediaStreamAudioSourceNode;
  /** Its send into the reverb. */
  wet?: GainNode;
}

/** How much reverb a voice on the PA gets. */
const WET = 0.28;

export class VoicePa {
  private on = new Set<string>();
  private verb: AudioNode | null = null;

  constructor(private ctx: () => AudioContext | null) {}

  has(id: string): boolean {
    return this.on.has(id);
  }

  /** Who's on the PA now (everyone else comes off it). */
  set(ids: Iterable<string>, conns: ReadonlyMap<string, PaConn>) {
    const next = new Set(ids);
    for (const [id, c] of conns) {
      const now = next.has(id);
      if (now) c.audio.volume = 1;
      if (now !== this.on.has(id) || (now && !c.wet)) this.send(c, now);
    }
    this.on = next;
  }

  /** A peer's audio has come (or come again): back on the PA if they're on it. */
  joined(id: string, c: PaConn) {
    c.wet = undefined;
    if (this.on.has(id)) this.send(c, true);
  }

  private send(c: PaConn, on: boolean) {
    const ctx = this.ctx();
    if (!ctx || !c.src) return;
    if (!c.wet) {
      if (!on) return;
      c.wet = ctx.createGain();
      c.wet.gain.value = 0;
      c.src.connect(c.wet).connect(this.reverb(ctx));
    }
    c.wet.gain.setTargetAtTime(on ? WET : 0, ctx.currentTime, 0.08);
  }

  /** A small hall: a second and a half of decaying noise as the impulse. */
  private reverb(ctx: AudioContext): AudioNode {
    if (this.verb) return this.verb;
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 220 ? i / 220 : 1);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const tone = ctx.createBiquadFilter();
    tone.type = 'highpass';
    tone.frequency.value = 220;
    conv.connect(tone).connect(ctx.destination);
    this.verb = conv;
    return conv;
  }
}

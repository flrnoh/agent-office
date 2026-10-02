/**
 * flrnoh fork (see FORK.md "Karaoke"): the bowling centre's karaoke bar. A stage against the east
 * wall with two mics, a big lyrics screen over it, a bar, bistro tables with song books, an LED dance
 * floor and the week's karaoke kings (stage.ts, world.ts); the bar's own songs with their synthesized
 * band (band.ts) and karaoke words (screen.ts), or a YouTube karaoke video on the screen (client/tv.ts's
 * player); the queue, the mics, the rating and the board are the office's (server/bowling/karaoke.ts).
 * Singers on the stage with a mic are on the PA: everyone in the centre hears them at full volume
 * (voice-pa.ts). It joins the centre through the building's seam (world/bowling/parts.ts).
 */
import * as THREE from 'three';
import { BOWLING } from '../../../shared/bowling';
import { SONG_BY_ID } from '../../../shared/karaoke-songs';
import { timeline } from '../../../shared/karaoke-music';
import { MICS, NO_KARAOKE, STAGE_MID_Z, inKaraoke, onStage, pickTitle, singersOf, type CheerKind, type KaraokeClientMsg, type KaraokeState } from '../../../shared/karaoke';
import type { TvState } from '../../../shared/tv';
import type { Ctx, Hint } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { TV_OFF, TvStreams } from '../../tv';
import { $, toast } from '../../ui/dom';
import type { Person } from '../../world/character';
import type { Collider, Interactable } from '../../world/types';
import { addBowlingPart } from '../../world/bowling/parts';
import { MicHands } from './people';
import { ChartsBoard, LyricsScreen, type Rated } from './screen';
import { buildStage, type Stage } from './stage';
import { KaraokePanel, openSongBook } from './ui';
import { buildRoom, type Room } from './world';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    karaokebook: true;
    karaokemic: true;
    karaokeboard: true;
  }
}

export interface KaraokeDeps {
  /** Someone else in the centre, as you see them. */
  personOf(id: string): Person | undefined;
}

const KINDS = new Set(['karaokebook', 'karaokemic', 'karaokeboard']);
/** Which mic a stand is (by where it stands). */
const micAt = (it: Interactable) => (it.z < STAGE_MID_Z ? 0 : 1);

export function installKaraoke(ctx: Ctx, deps: KaraokeDeps) {
  let st: KaraokeState = NO_KARAOKE;
  let built: { stage: Stage; room: Room; colliders: Collider[] } | null = null;
  let here = false;
  let rated: Rated | null = null;
  /** Your vote in the rating now going (by its turn's number). */
  let vote = { turn: -1, stars: 0 };
  /** The turn whose video's end this page has already reported. */
  let doneFor = -1;
  let paKey = '';
  const screen = new LyricsScreen();
  const charts = new ChartsBoard();
  const watchers = new Set<() => void>();
  const panel = new KaraokePanel((n) => rate(n));
  $('hud').append(panel.el);
  const hands = new MicHands(ctx.hands.scene);
  const send = (m: KaraokeClientMsg) => ctx.net.send(m);
  const band = ctx.sound.karaoke.band;
  const name = (id: string) => (id === store.you ? (store.peers.get(id)?.name ?? store.profile.name) : (store.peers.get(id)?.name ?? 'Jemand'));
  const me = () => store.you;
  const myPos = () => ctx.player.pos;

  // A YouTube karaoke video plays in YouTube's own player, laid over the big screen (or over the
  // prompter while you're up on the stage), as the office TV's does (client/tv.ts).
  const video = new TvStreams(
    { now: () => store.officeNow(), volume: () => (here ? ctx.sound.karaoke.paVolume() : 0), toast, changed: () => videoChanged() },
    ctx.canvas,
    { id: 'karaoke-stream', icon: '🎤', name: 'Karaoke', on: 'Karaoke' },
  );
  function videoChanged() {
    const t = st.turn;
    const phase = video.phase();
    // The singer's page says when their video's over (or won't play), so the next can come up.
    if (t && t.who === me() && t.phase === 'singing' && t.pick.kind === 'video' && doneFor !== t.id && (phase === 'ended' || phase === 'failed')) {
      doneFor = t.id;
      send({ t: 'karaoke.done', ...(phase === 'failed' ? { failed: true } : {}) });
    }
  }

  // ---- What the office says ---------------------------------------------------------------------------
  ctx.messages.on('karaoke', (msg) => {
    const before = st;
    st = msg.state;
    const was = before.turn;
    const now = st.turn;
    // A song's over: the bar claps.
    if (here && was?.phase === 'singing' && !(now?.id === was.id && now.phase === 'singing')) ctx.sound.karaoke.applause(Math.min(1, 0.3 + peopleHere() * 0.12));
    // A mic coming off its stand, or going back.
    if (here) for (let i = 0; i < 2; i++) if (before.mics[i] !== st.mics[i] && (st.mics[i] || before.mics[i])) ctx.sound.karaoke.mic(!!st.mics[i], !!st.mics[i] && Math.random() < 0.2);
    video.set(videoState());
    charts.draw(st.board);
    ctx.hint.invalidate();
    watchers.forEach((fn) => fn());
  });
  ctx.messages.on('karaoke.cheer', (msg) => {
    if (!here) return;
    const p = store.peers.get(msg.id);
    deps.personOf(msg.id)?.emote(msg.kind === 'clap' ? 'clap' : 'wave');
    if (p) ctx.sound.karaoke.cheer(msg.kind, { x: p.x, y: 1.5, z: p.z });
  });
  ctx.messages.on('karaoke.rated', (msg) => {
    rated = { ...msg, at: performance.now() };
    if (!here) return;
    ctx.sound.karaoke.rated(msg.king);
    const avg = msg.avg.toFixed(1).replace('.', ',');
    toast(msg.votes ? `🔥 ${msg.name}: ${avg} von 5 (${msg.votes} ${msg.votes === 1 ? 'Stimme' : 'Stimmen'})${msg.king ? ' · 👑 Spitze der Woche!' : ''}` : `👏 Applaus für ${msg.name}!`);
  });
  // Someone clapping (the emote) in the bar is heard too.
  ctx.messages.on('peer.emote', (msg) => {
    const p = store.peers.get(msg.id);
    if (here && msg.emote === 'clap' && p && inKaraoke(p.x, p.z, 2)) ctx.sound.karaoke.cheer('clap', { x: p.x, y: 1.5, z: p.z });
  });
  // A fresh connection is a fresh client to the office: say hello again once you're in.
  ctx.messages.on('welcome', () => {
    here = false;
    st = NO_KARAOKE;
  });

  /** What the video player should play: the turn's video while it's sung, else nothing. */
  function videoState(): TvState {
    const t = st.turn;
    if (!t || t.phase !== 'singing' || t.pick.kind !== 'video') return TV_OFF;
    return { set: t.pick.video, by: t.name, startedAt: t.startedAt, elapsed: 0 };
  }
  const peopleHere = () => [...store.peers.values()].filter((p) => p.floor === BOWLING).length;

  // ---- Doing things -----------------------------------------------------------------------------------
  function cheer(kind: CheerKind) {
    const p = myPos();
    ctx.me.emote(kind === 'clap' ? 'clap' : 'wave');
    ctx.hands.emote(kind === 'clap' ? 'clap' : 'wave');
    ctx.sound.karaoke.cheer(kind, { x: p.x, y: 1.5, z: p.z });
    send({ t: 'karaoke.cheer', kind });
  }
  function canRate(): boolean {
    const t = st.turn;
    return here && t?.phase === 'rating' && t.who !== me() && !st.mics.includes(me());
  }
  function rate(stars: number) {
    if (!canRate()) return;
    vote = { turn: st.turn!.id, stars };
    send({ t: 'karaoke.rate', stars });
  }
  function openBook(charts = false) {
    openSongBook({ state: () => st, you: me, name, send, watch: (fn) => (watchers.add(fn), () => void watchers.delete(fn)), charts });
  }
  function useMic(it: Interactable) {
    const i = micAt(it);
    const holder = st.mics[i];
    if (holder === me()) return send({ t: 'karaoke.mic', mic: i, take: false });
    if (holder) return toast(`🎤 Das Mikro hat gerade ${name(holder)}`, 'warn');
    send({ t: 'karaoke.mic', mic: i, take: true });
  }

  // ---- What you can use -----------------------------------------------------------------------------
  const status = (): string => {
    const t = st.turn;
    if (!t) return st.queue.length ? `${st.queue.length} auf der Liste` : 'Bühne frei';
    if (t.phase === 'up') return `${t.who === me() ? 'Du bist' : `${t.name} ist`} dran`;
    if (t.phase === 'singing') return `${t.name} singt ${pickTitle(t.pick)}`;
    return 'Bewertung läuft';
  };
  const hints: Record<string, (it: Interactable) => Hint> = {
    karaokebook: () => ({ k: `book|${status()}`, parts: [hintTitle('🎤 Songbuch'), aside(status()), key('E', 'Song aussuchen')] }),
    karaokemic: (it) => {
      const i = micAt(it);
      const holder = st.mics[i];
      const label = i === 0 ? '🎤 Mikro 1' : '🎤 Mikro 2 · Duett';
      const up = st.turn?.phase === 'up' && st.turn.who === me();
      if (holder === me()) return { k: `mic|${i}|mine`, parts: [hintTitle(label), key('E', 'Zurückstellen')] };
      if (holder) return { k: `mic|${i}|${holder}`, parts: [hintTitle(label), aside(`hat ${name(holder)}`)] };
      return { k: `mic|${i}|free|${up}`, parts: [hintTitle(label), ...(up ? [aside('Du bist dran!')] : []), key('E', up ? 'Nehmen und los' : 'Nehmen')] };
    },
    karaokeboard: () => ({ k: 'board', parts: [hintTitle('👑 Karaoke-Charts'), aside(st.board.top[0] ? `vorne: ${st.board.top[0].name}` : 'noch leer'), key('E', 'Ansehen')] }),
  };
  const uses: Record<string, (it: Interactable) => void> = {
    karaokebook: () => openBook(),
    karaokemic: useMic,
    karaokeboard: () => openBook(true),
  };
  ctx.interactions.define('karaokebook', { reach: 3, hint: (it) => hints.karaokebook(it), use: onE((it) => uses.karaokebook(it)) });
  ctx.interactions.define('karaokemic', { reach: 2.6, hint: (it) => hints.karaokemic(it), use: onE((it) => uses.karaokemic(it)) });
  ctx.interactions.define('karaokeboard', { reach: 4.5, hint: (it) => hints.karaokeboard(it), use: onE((it) => uses.karaokeboard(it)) });

  // ---- Keys: B claps (Shift+B cheers), 1–5 rate --------------------------------------------------------
  ctx.keys.add('activity', (e) => {
    if (!here) return false;
    const n = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (n && canRate()) {
      if (!e.repeat) rate(Number(n[1]));
      return true;
    }
    if (e.code !== 'KeyB') return false;
    const p = myPos();
    if (!inKaraoke(p.x, p.z, 3) && st.turn?.phase !== 'singing') return false;
    if (!e.repeat) cheer(e.key === 'B' ? 'whoo' : 'clap');
    return true;
  });

  // ---- Every frame in the centre ------------------------------------------------------------------------
  ctx.ticks.add('world', ({ t, dt }) => {
    const inside = !!built && store.floor === BOWLING;
    if (inside !== here) {
      here = inside;
      if (here) send({ t: 'karaoke.hello' });
      else leaveBar();
    }
    if (!here || !built) return;
    const now = store.officeNow();
    const turn = st.turn;
    const song = turn?.phase === 'singing' && turn.pick.kind === 'song' ? SONG_BY_ID.get(turn.pick.id) : undefined;
    band.play(song ?? null, turn?.startedAt ?? 0);
    band.tick(now);
    video.setOn(true);
    // The PA: whoever holds a mic and stands on the stage.
    const pos = (id: string) => (id === me() ? myPos() : store.peers.get(id));
    const pa = st.mics.filter((id): id is string => !!id && id !== me() && store.peers.get(id)?.floor === BOWLING && !!pos(id) && onStage(pos(id)!.x, pos(id)!.z));
    const key = pa.join('|');
    if (key !== paKey) {
      paKey = key;
      ctx.voice.setPa(pa);
    }
    // You on the stage with a mic: the whole centre hears you, whatever your Hörkreis (features/voicerange).
    ctx.voice.selfOnPa = st.mics.includes(me()) && onStage(myPos().x, myPos().z);
    // Mics in hands, and mouths moving with the words for whoever sings without voice chat.
    const beat = song ? ((now - turn!.startedAt) / 1000) * (song.bpm / 60) : NaN;
    const mouth = song && Number.isFinite(beat) ? (timeline(song).lines.some((l) => l.syllables.some((s) => beat >= s.at && beat < s.at + s.len)) ? 0.18 + Math.random() * 0.12 : 0) : null;
    const holders = new Map<string, { person: Person; onStage: boolean; mouth: number | null }>();
    st.mics.forEach((id) => {
      if (!id) return;
      const person = id === me() ? ctx.me : deps.personOf(id);
      const p = pos(id);
      if (!person || !p) return;
      const peer = store.peers.get(id);
      const stage = onStage(p.x, p.z);
      holders.set(id, { person, onStage: stage, mouth: stage && peer && !(peer.voice && !peer.muted) ? mouth : null });
    });
    hands.update(holders, me(), ctx.player.view === 'first');
    built.stage.micsOnStands.forEach((m, i) => (m.visible = !st.mics[i]));
    // Walked off with a mic, out of the bar: it goes back on its stand.
    const mine = st.mics.indexOf(me());
    if (mine >= 0 && !inKaraoke(myPos().x, myPos().z, 2.5)) {
      send({ t: 'karaoke.mic', mic: mine, take: false });
      toast('🎤 Das Mikro bleibt in der Bar: zurück auf den Ständer');
      st = { ...st, mics: st.mics.map((m) => (m === me() ? null : m)) as KaraokeState['mics'] };
    }
    // The lights and the floor, with the music (a video's beat is guessed at 120 a minute).
    const vbeat = turn?.phase === 'singing' && turn.pick.kind === 'video' ? ((now - turn.startedAt) / 1000) * 2 : NaN;
    const level = Math.min(1, band.level() + pa.reduce((s, id) => s + ctx.voice.levelOf(id) * 3, 0) + (Number.isFinite(vbeat) ? 0.45 : 0));
    const show = turn?.phase === 'singing' ? 1 : turn?.phase === 'rating' ? 0.6 : turn?.phase === 'up' ? 0.4 : st.mics.some(Boolean) ? 0.3 : 0.12;
    const b = Number.isFinite(beat) ? beat : vbeat;
    built.stage.look.update(t, dt, level, b, show);
    built.room.update(t, level, b, show);
    screen.draw({ state: st, now, name, rated, video: video.phase() });
    // The panel: your turn, your mic, the rating.
    const tt = st.turn;
    if (tt?.phase === 'up' && tt.who === me()) panel.show({ kind: 'up', title: pickTitle(tt.pick), secs: Math.max(0, Math.ceil((tt.until - now) / 1000)) });
    else if (canRate()) panel.show({ kind: 'rate', who: singersOf({ ...st, turn: { ...tt!, phase: 'singing' } }).map(name).join(' & ') || tt!.name, voted: vote.turn === tt!.id ? vote.stars : 0 });
    else if (mine >= 0) panel.show({ kind: 'mic', mic: mine, onStage: onStage(myPos().x, myPos().z), singing: tt?.phase === 'singing' });
    else panel.show(null);
  });
  ctx.ticks.add('render', () => {
    if (!built || !here) return video.frame(null);
    const p = myPos();
    video.frame({ camera: ctx.camera, screen: onStage(p.x, p.z) ? built.stage.prompterVideo : built.stage.screenVideo, boxes: built.colliders });
  });

  /** Out of the centre: quiet, nothing in anyone's hands, nobody on the PA. */
  function leaveBar() {
    band.play(null);
    video.setOn(false);
    video.frame(null);
    hands.clear();
    paKey = '';
    ctx.voice.setPa([]);
    ctx.voice.selfOnPa = false;
    panel.show(null);
  }

  // ---- Into the bowling centre ------------------------------------------------------------------------
  const mineKind = (it: Interactable) => KINDS.has(it.kind);
  addBowlingPart({
    build(room) {
      const group = new THREE.Group();
      group.name = 'karaoke';
      const stage = buildStage(group, screen.texture);
      const bar = buildRoom(group, charts.texture);
      room.group.add(group);
      room.colliders.push(...stage.colliders, ...bar.colliders);
      room.interactables.push(...stage.interactables, ...bar.interactables);
      built = { stage, room: bar, colliders: room.colliders };
      charts.draw(st.board);
    },
    use(it, k) {
      if (!mineKind(it)) return false;
      if (k === 'E') uses[it.kind](it);
      return true;
    },
    hint(it) {
      return mineKind(it) ? hints[it.kind](it) : null;
    },
    lights(l) {
      built?.stage.look.cosmic(l === 'cosmic');
      built?.room.cosmic(l === 'cosmic');
    },
  });

  return {
    /** For quick checks from the console. */
    state: () => st,
    band,
    video,
    openBook,
    micAt: (i: number) => MICS[i],
  };
}


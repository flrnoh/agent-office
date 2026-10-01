/**
 * The office TV: the screen someone on the floor is sharing, or its idle card while nobody is. What's
 * shared, and watching it full screen, is features/voice's.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { toast } from '../../ui/dom';
import { TV_AT, TV_OFF, TvStreams } from '../../tv'; // flrnoh fork: streams on the office TV
import { openTvBig, openTvMenu } from '../../ui/tv';
import type { SettingsPane } from '../../ui/settings';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    tv: true;
  }
}

export interface TvDeps {
  /** The screens shared on this floor, by who's sharing them (see features/voice). */
  shares(): [string, MediaStream][];
  /** Watches what's on the TV full screen, or shares your screen when nobody's sharing (see features/voice). */
  watch(): void;
  /** flrnoh fork: share your screen, or stop (see features/voice). */
  toggleShare(): void;
  /** flrnoh fork: Settings, open at `pane` (the TV's volume is under Sound). */
  showSettings(pane?: SettingsPane): void;
}

export function installTv(ctx: Ctx, deps: TvDeps) {
  // TV
  const tvVideo = document.createElement('video');
  tvVideo.muted = true;
  tvVideo.playsInline = true;
  tvVideo.autoplay = true;
  const tvTexture = new THREE.VideoTexture(tvVideo);
  tvTexture.colorSpace = THREE.SRGBColorSpace;
  const tvIdle = (() => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 720;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#3a0ca3');
    grad.addColorStop(1, '#4cc9f0');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = '900 88px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText('📺 Office TV', 640, 330);
    g.font = '700 44px Nunito, ui-rounded, system-ui, sans-serif';
    g.fillText('Press E: put on a stream or share your screen', 640, 420); // fork: streams on the TV
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const tvMat = ctx.office.tvScreen.material as THREE.MeshBasicMaterial;
  tvMat.color.set('#ffffff');
  tvMat.map = tvIdle;
  tvMat.toneMapped = false;
  ctx.interactions.define('tv', {
    reach: 10,
    hint: () => {
      const any = deps.shares().length > 0;
      // flrnoh fork: a stream on it, and E for the TV's menu.
      const on = !any && tvStreams.showing() ? tvStreams.titleNow() : '';
      return { k: `${any}|${on}`, parts: [hintTitle('📺 Office TV'), ...(on ? [aside(on)] : []), key('E', any ? 'Watch or put on a stream' : 'Stream or share your screen')] };
    },
    use: onE(() => showTv()),
  });

  // flrnoh fork: a YouTube or Twitch stream on the floor's TV, laid over the TV itself (see client/tv.ts).
  const tvWatchers = new Set<() => void>();
  const tvStreams = new TvStreams({ now: () => store.officeNow(), volume: () => (ctx.inOffice() && !ctx.upTop() ? ctx.sound.tvVolume(TV_AT) : 0), toast, changed: () => (tvPicture(), tvWatchers.forEach((fn) => fn())) }, ctx.canvas);
  /** The TV's picture: a shared screen, else the stream's card (under its player), else the idle screen. */
  function tvPicture() {
    const map = tvStream ? tvTexture : tvStreams.showing() ? tvStreams.card() : tvIdle;
    if (tvMat.map === map) return;
    tvMat.map = map;
    tvMat.needsUpdate = true;
  }
  ctx.messages.on('welcome', (msg) => tvStreams.set(msg.tv ?? TV_OFF));
  ctx.messages.on('floor.enter', (msg) => tvStreams.set(msg.tv ?? TV_OFF));
  ctx.messages.on('tv', (msg) => tvStreams.set(msg.state));
  // The TV's stream plays while you're on its floor and nobody's sharing a screen, drawn after the frame.
  ctx.ticks.add('render', () => {
    const here = !!store.floor && ctx.inOffice() && !ctx.upTop();
    tvStreams.setOn(here && !tvStream);
    tvStreams.frame(here && !tvStream ? { camera: ctx.camera, screen: ctx.office.tvScreen, boxes: ctx.world().colliders } : null);
  });
  /** E at the TV: watch a share, put on a stream or stop it, share your screen (ui/tv.ts). */
  function showTv() {
    const sharer = () => deps.shares().find(([who]) => who !== 'You')?.[0];
    openTvMenu({ net: ctx.net, tv: tvStreams, sharer, sharing: () => ctx.voice.sharing, watchShare: deps.watch, toggleShare: deps.toggleShare, watchBig, openVolume: () => deps.showSettings('sound'), watch: tvWatch });
  }
  function watchBig() {
    openTvBig(tvStreams, tvWatch);
  }
  function tvWatch(fn: () => void) {
    tvWatchers.add(fn);
    return () => void tvWatchers.delete(fn);
  }

  let tvStream: MediaStream | null = null;
  /** Puts `stream` up on the TV, or the idle card when there's none. */
  function show(stream: MediaStream | null) {
    if (stream !== tvStream) {
      tvStream = stream;
      tvVideo.srcObject = stream;
      if (stream) void tvVideo.play().catch(() => {});
      tvPicture(); // fork: or the stream on it
    }
  }

  /** Shares came or went through voice (see features/voice): the TV's window follows those too. */
  const voiceChanged = () => tvWatchers.forEach((fn) => fn());

  return { show, streams: tvStreams, watchBig, voiceChanged }; // streams, watchBig, voiceChanged: flrnoh fork
}

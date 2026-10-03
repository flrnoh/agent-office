import * as THREE from 'three';
import { GYM_CHANNEL_BY_ID, GYM_DEFAULT_CHANNEL, GYM_DEFAULT_VOLUME, GYM_RADIO, type GymRadioView } from '../../../shared/gym-radio';
import type { Interactable } from '../types';
import { mesh, toon } from '../toon';
import { blk, type GymParts } from './kit';
import { FONT, canvasTexture, glow } from './parts';

/*
 * Gym FM's sound system on the reception counter (flrnoh fork, see shared/gym-radio.ts): a black
 * receiver with a display showing the station, a dial, and a row of level bars that dance while it
 * plays. E at it tunes the next station for everyone in the gym (client/gym.ts sends it).
 */

export interface GymRadioSet {
  setStation(state: unknown): void;
  /** The station playing now (its id), and the speakers' volume for everyone. */
  channel(): string;
  volume(): number;
  update(t: number): void;
}

export function buildGymRadio(p: GymParts): GymRadioSet {
  const { x, z, top } = GYM_RADIO;
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.16, 0.56), toon('#14181b'), x, top + 0.08, z, false));
  g.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.56), toon('#a3e635'), x - 0.17, top + 0.155, z, false));
  const dial = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), toon('#c3ccd1'), x - 0.175, top + 0.08, z + 0.19, false);
  dial.rotation.z = Math.PI / 2;
  g.add(dial);
  // The display, facing the lobby (west).
  const canvas = canvasTexture(256, 64, () => {});
  const screen = mesh(new THREE.PlaneGeometry(0.3, 0.075), glow(canvas), x - 0.172, top + 0.115, z - 0.05, false);
  screen.rotation.y = -Math.PI / 2;
  g.add(screen);
  const bars: THREE.Mesh[] = [];
  const barMat = glow(null, '#a3e635');
  for (let i = 0; i < 7; i++) {
    const b = mesh(new THREE.BoxGeometry(0.01, 0.01, 0.018), barMat, x - 0.175, top + 0.03, z - 0.17 + i * 0.026, false);
    bars.push(b);
    g.add(b);
  }
  p.group.add(g);
  blk(p, 0.03, 0.03, 0.03, '#a3e635', x - 0.172, top + 0.15, z + 0.24);
  const it: Interactable = { kind: 'gymstation', gymStation: GYM_RADIO.id, x, z, y: 0, radius: 1.6 };
  p.interactables.push(it);
  g.traverse((o) => (o.userData.interact = it));

  let channel = GYM_DEFAULT_CHANNEL;
  let volume = GYM_DEFAULT_VOLUME;
  const draw = () => {
    const c = GYM_CHANNEL_BY_ID.get(channel);
    const img = canvas.image as HTMLCanvasElement;
    const ctx = img.getContext('2d')!;
    ctx.fillStyle = '#0b1a10';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#a3e635';
    ctx.textBaseline = 'middle';
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText('GYM FM', 10, 18);
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(c?.url ? c.name : '— off —', 10, 44, 236);
    canvas.needsUpdate = true;
  };
  draw();

  return {
    setStation(state) {
      const v = state as GymRadioView | null;
      if (!v || v.kind !== 'radio') return;
      volume = typeof v.volume === 'number' ? v.volume : volume;
      if (v.channel === channel) return;
      channel = v.channel;
      draw();
    },
    channel: () => channel,
    volume: () => volume,
    update(t) {
      const on = !!GYM_CHANNEL_BY_ID.get(channel)?.url && volume > 0;
      bars.forEach((b, i) => {
        const k = on ? 0.35 + 0.65 * Math.abs(Math.sin(t * (5 + i * 1.3) + i * 1.7) * Math.sin(t * 2.1 + i)) : 0.15;
        // From the bottom of the front up, never into the display.
        b.scale.y = k * 5;
        b.position.y = top + 0.012 + 0.025 * k;
      });
    },
  };
}

import { CHUTE, PLUSH_BY_ID, clawAim, clawPile, type PlushId } from '../../../shared/funshops';
import { h, openModal } from '../../ui/dom';
import { CLAW_HOME, CLAW_RUN_SECONDS, clawAimAt, clawPose, clawRuns, type ClawRun } from './motion';
import './ui.css';

// flrnoh fork (see FORK.md "Shops to walk into"): the claw machine's window. You look in through the
// glass: arrows or WASD move the claw over the pile, Space drops it (or the clock runs out and it
// drops by itself). The office rolls whether it holds (shared/funshops.ts); the claw in the shop
// moves the same for everyone near (motion.ts). A plush that comes up goes down the chute and into
// your hand. ✕ or Esc closes it, straight back to the game.

export interface ClawOptions {
  shop: number;
  /** Sends the drop to the office. */
  drop(x: number, z: number): void;
  /** It came down the chute: into your hand. */
  won(id: PlushId): void;
  sound(kind: 'move' | 'drop' | 'win' | 'miss'): void;
}

const W = 520;
const H = 440;
const TIME = 20;

/** Where (x, z) of the field is on the canvas, and how big things there are (further back, smaller and higher). */
function project(x: number, z: number, y = 0): { px: number; py: number; s: number } {
  const s = 1 - z * 0.35;
  const px = W / 2 + (x - 0.5) * 400 * s;
  const py = 380 - z * 150 - y * 220 * s;
  return { px, py, s };
}

export function openClaw(o: ClawOptions) {
  const canvas = h('canvas', {
    width: W,
    height: H,
    style: 'width:100%;max-width:520px;border-radius:12px;display:block;margin:0 auto',
  }) as HTMLCanvasElement;
  const status = h('div.claw-status', {}, '');
  const close = h('button.btn.close', { 'aria-label': 'Close' }, '✕');
  const el = h(
    'div.modal.claw-modal',
    { role: 'dialog', 'aria-label': 'Greifautomat' },
    h('header', {}, h('h2', {}, '🕹️ Greifautomat'), close),
    h('div.body', {}, canvas, status),
    h('footer', {}, h('span.grow', {}, '← → ↑ ↓ / W A S D: move · Space: drop · Esc: back')),
  );
  const pile = clawPile(o.shop);
  let x = CLAW_HOME.x;
  let z = CLAW_HOME.z;
  const held = { l: false, r: false, u: false, d: false };
  let left = TIME;
  let run: ClawRun | null = null;
  let handed = false;
  let raf = 0;
  let last = performance.now() / 1000;
  const g = canvas.getContext('2d')!;
  const modal = openModal(el, {
    doing: '🕹️ at the claw machine',
    onClose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      clawAimAt.delete(o.shop);
    },
  });
  close.addEventListener('click', () => modal.close());

  function dropNow() {
    if (run) return;
    const now = performance.now() / 1000;
    run = { x, z, fromX: x, fromZ: z, t0: now };
    clawRuns.set(o.shop, run);
    handed = false;
    o.drop(x, z);
    o.sound('drop');
  }
  /** The office's answer to your drop. */
  function answered(won: PlushId | null) {
    if (run) run.won = won;
  }
  const keyOf = (e: KeyboardEvent) =>
    ({
      ArrowLeft: 'l',
      KeyA: 'l',
      ArrowRight: 'r',
      KeyD: 'r',
      ArrowUp: 'u',
      KeyW: 'u',
      ArrowDown: 'd',
      KeyS: 'd',
    })[e.code] as keyof typeof held | undefined;
  function onKey(e: KeyboardEvent) {
    const k = keyOf(e);
    if (k) held[k] = true;
    else if (e.code === 'Space') {
      if (run && clawPose(run, performance.now() / 1000).done) [run, left] = [null, TIME];
      else dropNow();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
  function onKeyUp(e: KeyboardEvent) {
    const k = keyOf(e);
    if (k) held[k] = false;
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);

  function frame() {
    const now = performance.now() / 1000;
    const real = now - last;
    const dt = Math.min(0.25, real);
    last = now;
    if (!run) {
      const sp = 0.45 * dt;
      const nx = Math.max(0.05, Math.min(0.95, x + (Number(held.r) - Number(held.l)) * sp));
      const nz = Math.max(0.05, Math.min(0.95, z + (Number(held.u) - Number(held.d)) * sp));
      if (nx !== x || nz !== z) o.sound('move');
      [x, z] = [nx, nz];
      clawAimAt.set(o.shop, { x, z });
      left -= real;
      if (left <= 0) dropNow();
    }
    const pose = run ? clawPose(run, now) : { x, z, down: 0, shut: 0, carrying: false, done: false };
    if (run && pose.done && !handed) {
      handed = true;
      if (run.won) {
        o.won(run.won);
        o.sound('win');
      } else o.sound('miss');
    }
    if (run && now - run.t0 > CLAW_RUN_SECONDS + 6 && pose.done) [run, left] = [null, TIME];
    draw(pose, now);
    raf = requestAnimationFrame(frame);
  }

  function draw(pose: ReturnType<typeof clawPose>, now: number) {
    // The back of the machine, its glass, the floor of the pile.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a0a4a');
    bg.addColorStop(1, '#0b0b1a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const c = (xx: number, zz: number) => project(xx, zz);
    const corners = [c(0, 0), c(1, 0), c(1, 1), c(0, 1)];
    g.fillStyle = '#3c1361';
    g.beginPath();
    corners.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py)));
    g.fill();
    // The chute.
    const ch = c(CHUTE.x, CHUTE.z);
    g.fillStyle = '#05050c';
    g.beginPath();
    g.ellipse(ch.px, ch.py, 46 * ch.s, 18 * ch.s, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd60a';
    g.font = 'bold 12px system-ui';
    g.textAlign = 'center';
    g.fillText('AUSGABE', ch.px, ch.py + 32 * ch.s);
    // Where it'd come down: the shadow, and what it would grab.
    const aim = clawAim(pile, pose.x, pose.z);
    // The pile, back to front, minus the one it carries.
    const runAim = run ? clawAim(pile, run.x, run.z).plush : null;
    for (const p of [...pile].sort((a, b) => b.z - a.z)) {
      if (pose.carrying && p === runAim) continue;
      const q = c(p.x, p.z);
      const def = PLUSH_BY_ID.get(p.id)!;
      g.font = `${Math.round(p.r * 520 * q.s)}px system-ui`;
      g.textBaseline = 'middle';
      g.fillText(def.emoji, q.px, q.py - 10 * q.s);
    }
    const sh = c(pose.x, pose.z);
    g.fillStyle = aim.plush && !run ? 'rgba(124,255,0,.35)' : 'rgba(0,0,0,.35)';
    g.beginPath();
    g.ellipse(sh.px, sh.py, 28 * sh.s, 10 * sh.s, 0, 0, Math.PI * 2);
    g.fill();
    // The rail across the top, the cable and the claw.
    const top = project(pose.x, pose.z, 1.25);
    const tip = project(pose.x, pose.z, 1.2 - pose.down * 1.08);
    g.strokeStyle = '#adb5bd';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(project(0, pose.z, 1.25).px, top.py);
    g.lineTo(project(1, pose.z, 1.25).px, top.py);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(top.px, top.py);
    g.lineTo(tip.px, tip.py);
    g.stroke();
    const s = tip.s;
    g.fillStyle = '#c0c0c0';
    g.fillRect(tip.px - 14 * s, tip.py - 6 * s, 28 * s, 12 * s);
    g.strokeStyle = '#e9ecef';
    g.lineWidth = 4 * s;
    const spread = (1 - pose.shut) * 22 + 6;
    for (const side of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(tip.px + side * 8 * s, tip.py + 4 * s);
      g.quadraticCurveTo(tip.px + side * spread * s, tip.py + 22 * s, tip.px + side * (spread - 10) * s, tip.py + 38 * s);
      g.stroke();
    }
    if (pose.carrying && runAim) {
      g.font = `${Math.round(runAim.r * 480 * s)}px system-ui`;
      g.fillText(PLUSH_BY_ID.get(runAim.id)!.emoji, tip.px, tip.py + 44 * s);
    }
    // The glass's shine, and the frame.
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.beginPath();
    g.moveTo(40, 0);
    g.lineTo(120, 0);
    g.lineTo(60, H);
    g.lineTo(0, H);
    g.fill();
    g.strokeStyle = '#ff2e88';
    g.lineWidth = 8;
    g.strokeRect(4, 4, W - 8, H - 8);
    // The clock and what's happening.
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = 'bold 22px ui-monospace, monospace';
    g.fillStyle = left < 6 && !run ? (Math.sin(now * 10) > 0 ? '#ff2e63' : '#ffd60a') : '#00f0ff';
    g.fillText(run ? '' : `⏱ ${Math.ceil(left)}`, 18, 16);
    const msg = !run
      ? aim.plush
        ? `${PLUSH_BY_ID.get(aim.plush.id)!.emoji} ${Math.round(aim.chance * 100)}% · Space!`
        : 'Over the pile, then Space'
      : pose.done
        ? run.won
          ? `🎉 Gewonnen: ${PLUSH_BY_ID.get(run.won)!.name}! Space: again`
          : '😩 Daneben… Space: again'
        : pose.down < 1 && !pose.shut
          ? 'Runter…'
          : 'Hält… hält…';
    status.textContent = msg;
  }
  raf = requestAnimationFrame(frame);
  return { answered, close: () => modal.close() };
}

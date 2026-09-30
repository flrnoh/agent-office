import { POCKETS, REDS, SPIN_MS, WHEEL, type RouletteView } from '../../../shared/casino-roulette';

/*
 * The roulette wheel's motion (flrnoh fork, see shared/casino-roulette.ts), shared by the table's
 * window and the wheel in the room (world/casino/interior.ts). It works in angles on the wheel's
 * face: pocket i of WHEEL spans [i, i + 1] × (2π / 37), turned by the wheel's own angle. While the
 * wheel spins, the ball runs the other way round the rim and slows until it drops into the pocket
 * of the number the office drew; between spins it rides in the last number's pocket.
 */

const A = (Math.PI * 2) / POCKETS;
/** How fast the wheel turns on its own (rad/s). */
const IDLE = 0.35;
/** Extra turns the wheel makes during a spin (whole turns, so it ends where idling would be), and the ball's laps against it. */
const WHEEL_EXTRA = Math.PI * 4;
const BALL_LAPS = Math.PI * 6;
/** Where the ball runs (the rim) and where it rests (in a pocket), as fractions of the wheel's radius. */
export const BALL_RIM = 1.1;
export const BALL_POCKET = 0.76;

/** The middle of `n`'s pocket, on the face. */
export const pocketAngle = (n: number) => (WHEEL.indexOf(n as (typeof WHEEL)[number]) + 0.5) * A;

export interface WheelPose {
  /** The wheel's turn (rad). */
  wheel: number;
  /** The ball's angle (rad, same frame as the pockets on a face turned by `wheel`), or null: no ball to show. */
  ball: number | null;
  /** How far out the ball is (fraction of the radius). */
  ballR: number;
  /** 0..1 through the spin, 1 once it has landed (and between spins). */
  progress: number;
}

/** Follows a table's view and says where the wheel and the ball are at any moment. */
export class WheelClock {
  private view: RouletteView | null = null;
  /** The office's clock minus ours (performance.now), as of the last view. */
  private offset = 0;

  set(view: RouletteView, perfNow = performance.now()) {
    this.view = view;
    this.offset = view.now - perfNow;
  }

  /** The office's clock, now. */
  serverNow(perfNow = performance.now()) {
    return perfNow + this.offset;
  }

  /** Ms left in the phase, by the office's clock. */
  left(perfNow = performance.now()) {
    const v = this.view;
    return v?.endsAt ? Math.max(0, v.endsAt - this.serverNow(perfNow)) : 0;
  }

  pose(perfNow = performance.now()): WheelPose {
    const base = (IDLE * perfNow) / 1000;
    const v = this.view;
    if (v?.phase === 'spinning' && v.number !== undefined && v.endsAt) {
      const p = Math.min(1, Math.max(0, (this.serverNow(perfNow) - (v.endsAt - SPIN_MS)) / SPIN_MS));
      const q = 1 - p;
      const wheel = base + WHEEL_EXTRA * (1 - q * q);
      const ball = pocketAngle(v.number) + BALL_LAPS * q * q;
      // On the rim, then down into the pockets over the last third, with a hop or two.
      const drop = p < 0.65 ? 0 : Math.min(1, (p - 0.65) / 0.3);
      const hop = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 3)) * (1 - drop) * 0.12 : 0;
      return { wheel, ball, ballR: BALL_RIM + (BALL_POCKET - BALL_RIM) * drop + hop, progress: p };
    }
    const n = v?.phase === 'payout' ? v.number : v?.history[0];
    return { wheel: base, ball: n === undefined ? null : pocketAngle(n), ballR: BALL_POCKET, progress: 1 };
  }
}

/** A wheel drawn flat (the window's): the pockets with their numbers, turned by the pose, and the ball. */
export function drawWheel(g: CanvasRenderingContext2D, size: number, pose: WheelPose, font: string) {
  const c = size / 2;
  const r = size * 0.4;
  g.clearRect(0, 0, size, size);
  g.save();
  g.translate(c, c);
  // The bowl.
  g.fillStyle = '#5a3418';
  g.beginPath();
  g.arc(0, 0, size * 0.49, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d4a24c';
  g.lineWidth = size * 0.012;
  g.stroke();
  g.fillStyle = '#3a200e';
  g.beginPath();
  g.arc(0, 0, r * 1.14, 0, Math.PI * 2);
  g.fill();
  g.rotate(pose.wheel);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.max(7, Math.round(size * 0.05))}px ${font}`;
  WHEEL.forEach((n, i) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, i * A, (i + 1) * A);
    g.closePath();
    g.fillStyle = n === 0 ? '#157a3c' : REDS.has(n) ? '#b3122e' : '#141414';
    g.fill();
    g.save();
    g.rotate((i + 0.5) * A);
    g.translate(r * 0.88, 0);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#fff';
    g.fillText(String(n), 0, 0);
    g.restore();
  });
  g.strokeStyle = 'rgba(212,162,76,0.8)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#6b3e1f';
  g.beginPath();
  g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d4a24c';
  g.beginPath();
  g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  g.fill();
  if (pose.ball !== null) {
    const br = r * Math.min(pose.ballR, 1.08);
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(Math.cos(pose.ball) * br, Math.sin(pose.ball) * br, size * 0.028, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

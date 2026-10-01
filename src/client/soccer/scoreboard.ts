import { TEAM_COLOR, clockText, type SoccerView, type Team } from '../../shared/soccer';
import type { SoccerGoalRec, SoccerLeader, SoccerStats } from '../../shared/soccer-stats';
import { FONT } from '../world/casino/parts';

/*
 * What the soccer hall's boards show (flrnoh fork, see FORK.md "The soccer hall"): the big
 * scoreboards over each end (world/soccer/interior.ts draws its canvas with drawScoreboard) and the
 * Hall of Fame on the north wall (show.ts, drawHallOfFame). During a match: RED n : m BLUE, the
 * clock and what's going on, the goal scorers under each team with the minute, and a possession bar;
 * at full time the results: the final score, the man of the match and the two teams side by side.
 */

const MONO = 'ui-monospace, Menlo, monospace';
const AMBER = '#ffd166';
const PAPER = '#e9f5ec';
const DIM = '#8fa39a';

/** A scoreboard's key: redraw only when something on it changes. */
export function scoreboardKey(v: SoccerView | null, clockMs: number, flash: number): string {
  const s = v?.stats;
  const st = s ? `${s.goals.length}|${s.teams.red.possession}|${s.teams.red.shots}|${s.teams.blue.shots}|${s.teams.red.onTarget}|${s.teams.blue.onTarget}|${s.teams.red.passes}|${s.teams.blue.passes}|${s.teams.red.saves}|${s.teams.blue.saves}|${s.mvp?.name}` : '';
  return `${v?.phase}|${v?.score.red}|${v?.score.blue}|${clockText(clockMs)}|${v?.players.length}|${v?.kickoff}|${v?.winner}|${flash > 0 ? Math.floor(flash * 8) % 2 : -1}|${st}`;
}

/** Who scored the last goal (for the flash), from the view: the conceding team kicks off. */
const goalFor = (v: SoccerView | null, flash: number): Team | null => (flash > 0 && v?.phase === 'goal' ? (v.kickoff === 'red' ? 'blue' : 'red') : null);

/** Fits `text` into `max` px wide at `size`, shrinking the font if it has to. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number, family = FONT) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 8 && g.measureText(text).width > max) {
    s -= 2;
    g.font = `${weight} ${s}px ${family}`;
  }
}

/** A scorer's line: "⚽ Ann 3'" (an own goal: "⚽ Ann (OG) 3'"). */
export function scorerLine(gl: SoccerGoalRec): string {
  const who = gl.scorer ?? '?';
  return `⚽ ${who}${gl.own ? ' (OG)' : ''} ${gl.minute}'`;
}

/** The phase along the scoreboard's middle. */
export function phaseText(v: SoccerView | null): string {
  if (!v || v.phase === 'waiting') return v?.players.length ? 'WAITING FOR THE OTHER TEAM' : 'JOIN AT THE HALFWAY LINE';
  switch (v.phase) {
    case 'kickoff':
      return `KICKOFF · ${v.kickoff === 'blue' ? 'BLUE' : 'RED'}`;
    case 'play':
      return 'PLAY';
    case 'goal':
      return 'GOAL';
    case 'paused':
      return 'PAUSED · A TEAM IS EMPTY';
    case 'over':
      return 'FULL TIME';
  }
}

function frame(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#0d1115';
  g.fillRect(0, 0, w, h);
  // A fine LED grid.
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1);
  g.strokeStyle = '#3b444f';
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
}

/** Draws a scoreboard onto `g` (w × h): the match, or at full time the results. */
export function drawScoreboard(g: CanvasRenderingContext2D, w: number, h: number, v: SoccerView | null, clockMs: number, flash: number) {
  frame(g, w, h);
  const scored = goalFor(v, flash);
  if (scored && Math.floor(flash * 8) % 2 === 0) {
    g.fillStyle = TEAM_COLOR[scored];
    g.globalAlpha = 0.5;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  if (v?.phase === 'over' && v.stats) return drawResults(g, w, h, v, v.stats);

  const score = v?.score ?? { red: 0, blue: 0 };
  const stats = v?.stats;
  // The teams and their scores, either side.
  for (const [team, cx] of [
    ['red', w * 0.17],
    ['blue', w * 0.83],
  ] as const) {
    g.font = `900 ${h * 0.1}px ${FONT}`;
    g.fillStyle = TEAM_COLOR[team];
    g.fillText(team === 'red' ? 'RED' : 'BLUE', cx, h * 0.1);
    g.font = `900 ${h * 0.34}px ${FONT}`;
    g.shadowColor = '#ffb703';
    g.shadowBlur = 16;
    g.fillStyle = AMBER;
    g.fillText(String(score[team]), cx, h * 0.34);
    g.shadowBlur = 0;
  }
  // The clock and the phase, in the middle.
  g.font = `800 ${h * 0.2}px ${MONO}`;
  g.shadowColor = '#ff4d4d';
  g.shadowBlur = 14;
  g.fillStyle = '#ff6b6b';
  g.fillText(clockText(clockMs), w * 0.5, h * 0.17);
  g.shadowBlur = 0;
  const last = stats?.goals.at(-1);
  const middle = scored ? `⚽ GOAL${last?.scorer ? ` · ${last.scorer.toUpperCase()}` : '!'}` : phaseText(v);
  fit(g, middle, 900, h * 0.085, w * 0.4);
  g.fillStyle = scored ? '#ffffff' : v?.phase === 'play' ? '#7ee2a8' : PAPER;
  g.fillText(middle, w * 0.5, h * 0.36);
  g.font = `900 ${h * 0.2}px ${FONT}`;
  g.fillStyle = AMBER;
  g.fillText(':', w * 0.5, h * 0.5);

  // The scorers under each team: "⚽ Ann 3'".
  g.fillStyle = '#243039';
  g.fillRect(w * 0.03, h * 0.555, w * 0.94, 2);
  for (const [team, x, align] of [
    ['red', w * 0.05, 'left'],
    ['blue', w * 0.95, 'right'],
  ] as const) {
    const list = (stats?.goals ?? []).filter((gl) => gl.team === team);
    // The latest two (and how many before them), big enough to read from the other end.
    const shown = list.slice(-2);
    g.textAlign = align;
    shown.forEach((gl, i) => {
      fit(g, scorerLine(gl), 800, h * 0.095, w * 0.34);
      g.fillStyle = PAPER;
      g.fillText(scorerLine(gl), x, h * (0.625 + i * 0.1));
    });
    if (list.length > 2) {
      g.font = `700 ${h * 0.05}px ${FONT}`;
      g.fillStyle = DIM;
      g.fillText(`+${list.length - 2} before`, x, h * 0.8);
    }
  }
  g.textAlign = 'center';
  // Shots, small, in the middle under the scorers' line.
  if (stats && (stats.teams.red.shots || stats.teams.blue.shots)) {
    g.font = `700 ${h * 0.055}px ${FONT}`;
    g.fillStyle = DIM;
    g.fillText(`SHOTS ${stats.teams.red.shots} · ${stats.teams.blue.shots}`, w * 0.5, h * 0.64);
    g.fillText(`ON TARGET ${stats.teams.red.onTarget} · ${stats.teams.blue.onTarget}`, w * 0.5, h * 0.72);
  }
  // The possession bar along the bottom.
  possessionBar(g, w * 0.05, h * 0.855, w * 0.9, h * 0.075, stats?.teams.red.possession ?? 50, h);
}

function possessionBar(g: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, red: number, h: number) {
  const r = Math.max(0, Math.min(100, red)) / 100;
  g.fillStyle = TEAM_COLOR.red;
  g.fillRect(x, y, bw * r, bh);
  g.fillStyle = TEAM_COLOR.blue;
  g.fillRect(x + bw * r, y, bw * (1 - r), bh);
  g.strokeStyle = '#0d1115';
  g.lineWidth = 3;
  g.strokeRect(x, y, bw, bh);
  g.font = `900 ${bh * 0.8}px ${FONT}`;
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.fillText(`${Math.round(r * 100)}%`, x + 10, y + bh / 2 + 1);
  g.textAlign = 'right';
  g.fillText(`${100 - Math.round(r * 100)}%`, x + bw - 10, y + bh / 2 + 1);
  g.textAlign = 'center';
  g.font = `800 ${h * 0.045}px ${FONT}`;
  g.fillStyle = PAPER;
  g.fillText('POSSESSION', x + bw / 2, y - h * 0.035);
}

/** Full time: the final score, the man of the match, and the teams side by side. */
function drawResults(g: CanvasRenderingContext2D, w: number, h: number, v: SoccerView, s: SoccerStats) {
  g.font = `900 ${h * 0.085}px ${FONT}`;
  g.fillStyle = PAPER;
  g.fillText(v.winner === 'draw' ? 'FULL TIME · DRAW' : `FULL TIME · ${v.winner === 'blue' ? 'BLUE' : 'RED'} WIN`, w * 0.5, h * 0.09);
  g.font = `900 ${h * 0.17}px ${FONT}`;
  g.fillStyle = TEAM_COLOR.red;
  g.textAlign = 'right';
  g.fillText('RED', w * 0.3, h * 0.25);
  g.fillStyle = TEAM_COLOR.blue;
  g.textAlign = 'left';
  g.fillText('BLUE', w * 0.7, h * 0.25);
  g.textAlign = 'center';
  g.shadowColor = '#ffb703';
  g.shadowBlur = 14;
  g.fillStyle = AMBER;
  g.fillText(`${v.score.red} : ${v.score.blue}`, w * 0.5, h * 0.25);
  g.shadowBlur = 0;
  const mvp = s.mvp ? `★ MVP  ${s.mvp.name}` : '★ MVP  —';
  fit(g, mvp, 900, h * 0.08, w * 0.8);
  g.fillStyle = s.mvp ? TEAM_COLOR[s.mvp.team] : DIM;
  g.fillText(mvp, w * 0.5, h * 0.4);
  const rows: [string, number, number, boolean][] = [
    ['POSSESSION %', s.teams.red.possession, s.teams.blue.possession, true],
    ['SHOTS', s.teams.red.shots, s.teams.blue.shots, false],
    ['ON TARGET', s.teams.red.onTarget, s.teams.blue.onTarget, false],
    ['PASSES', s.teams.red.passes, s.teams.blue.passes, false],
    ['SAVES', s.teams.red.saves, s.teams.blue.saves, false],
  ];
  rows.forEach(([label, a, b], i) => {
    const y = h * (0.52 + i * 0.095);
    const total = a + b || 1;
    const half = w * 0.28;
    // Bars out from the middle toward each side, by each team's share.
    g.fillStyle = TEAM_COLOR.red;
    g.globalAlpha = 0.55;
    g.fillRect(w * 0.5 - w * 0.12 - half * (a / total), y - h * 0.03, half * (a / total), h * 0.06);
    g.fillStyle = TEAM_COLOR.blue;
    g.fillRect(w * 0.5 + w * 0.12, y - h * 0.03, half * (b / total), h * 0.06);
    g.globalAlpha = 1;
    g.font = `900 ${h * 0.065}px ${FONT}`;
    g.fillStyle = '#ffffff';
    g.textAlign = 'right';
    g.fillText(String(a), w * 0.1, y);
    g.textAlign = 'left';
    g.fillText(String(b), w * 0.9, y);
    g.textAlign = 'center';
    g.font = `800 ${h * 0.05}px ${FONT}`;
    g.fillStyle = PAPER;
    g.fillText(label, w * 0.5, y);
  });
}

/** The Hall of Fame board: the all-time top five (goals, assists, wins, man-of-the-match awards). */
export function drawHallOfFame(g: CanvasRenderingContext2D, w: number, h: number, rows: SoccerLeader[]) {
  g.fillStyle = '#10150f';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9a227';
  g.lineWidth = 12;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.lineWidth = 2;
  g.strokeRect(20, 20, w - 40, h - 40);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.font = `900 ${h * 0.11}px ${FONT}`;
  g.shadowColor = '#ffb703';
  g.shadowBlur = 12;
  g.fillStyle = '#ffd166';
  g.fillText('🏆 HALL OF FAME', w / 2, h * 0.13);
  g.shadowBlur = 0;
  g.font = `700 ${h * 0.045}px ${FONT}`;
  g.fillStyle = DIM;
  g.fillText('ALL-TIME · SOCCER HALL', w / 2, h * 0.225);
  const cols: [string, number][] = [
    ['GP', 0.56],
    ['W', 0.65],
    ['G', 0.74],
    ['A', 0.83],
    ['MVP', 0.92],
  ];
  const y0 = h * 0.31;
  g.font = `800 ${h * 0.045}px ${FONT}`;
  g.fillStyle = DIM;
  g.textAlign = 'left';
  g.fillText('#  PLAYER', w * 0.07, y0);
  g.textAlign = 'center';
  for (const [c, x] of cols) g.fillText(c, w * x, y0);
  if (!rows.length) {
    g.font = `800 ${h * 0.06}px ${FONT}`;
    g.fillStyle = PAPER;
    g.fillText('Play a match to get up here', w / 2, h * 0.6);
    return;
  }
  const medal = ['#ffd166', '#d9d9d9', '#d08c4f', PAPER, PAPER];
  rows.slice(0, 5).forEach((r, i) => {
    const y = h * (0.42 + i * 0.115);
    if (i % 2 === 0) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(w * 0.05, y - h * 0.05, w * 0.9, h * 0.1);
    }
    g.textAlign = 'left';
    g.font = `900 ${h * 0.065}px ${FONT}`;
    g.fillStyle = medal[i];
    g.fillText(String(i + 1), w * 0.07, y);
    const name = `${r.name}${r.number ? `  #${r.number}` : ''}`;
    fit(g, name, 800, h * 0.062, w * 0.38);
    g.fillStyle = PAPER;
    g.fillText(name, w * 0.12, y);
    g.textAlign = 'center';
    g.font = `800 ${h * 0.06}px ${MONO}`;
    const vals = [r.matches, r.wins, r.goals, r.assists, r.mvp];
    cols.forEach(([, x], k) => {
      g.fillStyle = k === 2 ? '#ffd166' : PAPER;
      g.fillText(String(vals[k]), w * x, y);
    });
  });
}

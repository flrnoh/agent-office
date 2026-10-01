import * as THREE from 'three';
import { SOCCER_ROOM, TEAM_COLOR, TEAM_NAME, clockText, type SoccerServerMsg, type SoccerView, type Team } from '../../shared/soccer';
import { REPLAY, hashOf, pickCelebration, type SoccerLeader, type SoccerStats } from '../../shared/soccer-stats';
import type { Person } from '../world/character';
import type { SoccerInterior } from '../world/soccer/interior';
import { glow } from '../world/casino/parts';
import { h } from '../ui/dom';
import { isTyping } from '../player';
import { SoccerMoves, diveSide, dress, undress, type Kit } from './kit';
import { ReplayBuffer, ReplayRun, sampleClip } from './replay';
import { drawHallOfFame, scorerLine } from './scoreboard';
import './stats.css';

/*
 * The soccer hall's show (flrnoh fork, see FORK.md "The soccer hall"): everything about a match that
 * isn't playing it, on this page. SoccerPlace (place.ts) hands it the office's messages and calls it
 * every frame; it does:
 *
 * - the kits (kit.ts) on everyone on the pitch, and their moves: kicks, the scorer's celebration and
 *   teammates' high fives, goalkeepers' dives;
 * - the instant replay after a goal: the last seconds it saw (ReplayBuffer), played back on everyone's
 *   screen from a TV camera, the end in slow motion, a REPLAY badge; Space or Esc skips it;
 * - the stats panel (Tab: the match's numbers and the all-time leaderboard) and a line under the
 *   score bar (the last goal);
 * - the Hall of Fame board on the north wall.
 */

export interface ShowHost {
  you(): string;
  body(id: string): THREE.Object3D | undefined;
  /** Someone's Person (you too), for their kit and moves. */
  person?(id: string): Person | undefined;
  /** The view's camera, for the replay. */
  camera?: THREE.Camera;
}

const fmtPos = (n: number) => `${n}%`;

export class SoccerShow {
  private moves = new SoccerMoves();
  private kits = new Map<string, { kit: Kit; person: Person }>();
  private buffer = new ReplayBuffer();
  private run: ReplayRun | null = null;
  private runT = 0;
  private pending: { goalAt: number; startAt: number } | null = null;
  private lastLocalKick = -1e9;
  private active = false;
  private view: SoccerView | null = null;
  private room: SoccerInterior | null = null;
  private panel: HTMLElement | null = null;
  private panelOpen = false;
  private panelKey = '';
  private badge: HTMLElement | null = null;
  private sub: HTMLElement | null = null;
  private subKey = '';
  private fame: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string } | null = null;
  private cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fresh: true };
  private lastBall = { x: 0, z: 0 };

  constructor(private host: ShowHost) {
    // Before the hall's own keys (SoccerPlace makes this first): Tab, and Space or Esc during a replay.
    window.addEventListener('keydown', (e) => this.key(e), true);
  }

  /** A replay is on screen (main.ts keeps the first-person hands out of it). */
  get replaying(): boolean {
    return !!this.run;
  }

  /** The hall's room, once it's built: the Hall of Fame goes up on its north wall. */
  setRoom(room: SoccerInterior) {
    if (this.room === room) return;
    this.room = room;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.fame = { canvas, tex, key: '' };
    const z = SOCCER_ROOM.minZ;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), glow(tex));
    board.position.set(-6.2, 3.1, z + 0.07);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.16, 2.16, 0.06), new THREE.MeshToonMaterial({ color: '#1b1f1c' }));
    back.position.set(-6.2, 3.1, z + 0.03);
    board.name = 'soccer-hall-of-fame';
    room.group.add(back, board);
    this.drawFame([]);
  }

  private drawFame(rows: SoccerLeader[]) {
    const f = this.fame;
    if (!f) return;
    const key = JSON.stringify(rows);
    if (key === f.key) return;
    f.key = key;
    drawHallOfFame(f.canvas.getContext('2d')!, f.canvas.width, f.canvas.height, rows);
    f.tex.needsUpdate = true;
  }

  /** In the hall or not. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (on && !this.panel) {
      this.panel = h('div.soccer-stats', { role: 'dialog', 'aria-label': 'Match stats' });
      this.badge = h('div.soccer-replay');
      this.sub = h('div.soccer-bug-sub', { 'aria-live': 'polite' });
      document.body.append(this.panel, this.badge, this.sub);
    }
    if (!on) {
      this.endReplay();
      this.pending = null;
      this.panelOpen = false;
      for (const [id] of this.kits) this.unkit(id);
      this.moves.clear();
      this.buffer.clear();
      this.view = null;
    }
    if (this.panel) this.panel.hidden = !on || !this.panelOpen;
    if (this.badge) this.badge.hidden = true;
    if (this.sub) this.sub.hidden = !on;
  }

  // ---- The office's news ------------------------------------------------------------------------

  onMessage(m: SoccerServerMsg) {
    const now = performance.now();
    if (m.t === 'soccer.ball') {
      if (m.hit === 'kick' && m.by) {
        const mine = m.by === this.host.you() && now - this.lastLocalKick < 700;
        if (!mine) {
          this.moves.kick(m.by);
          this.buffer.kick(now, m.by);
        }
      }
      return;
    }
    this.view = m.state;
    this.drawFame(m.state.leaders ?? []);
    const ev = m.event;
    if (!ev) return;
    if (ev.kind === 'goal' && ev.team) {
      this.goal(ev.team, m.state, now);
    }
    if (ev.kind === 'kickoff' || ev.kind === 'play' || ev.kind === 'start' || ev.kind === 'reset') {
      this.moves.calmDown();
      if (ev.kind !== 'start') {
        this.pending = null;
        this.endReplay();
      }
    }
  }

  /** Your own kick, as your page sends it (the leg goes at once). */
  kicked(id: string) {
    const now = performance.now();
    this.lastLocalKick = now;
    this.moves.kick(id);
    this.buffer.kick(now, id);
  }

  private goal(team: Team, v: SoccerView, now: number) {
    // The scorer celebrates (not after an own goal), teammates near them put a hand up.
    const rec = v.stats?.goals.at(-1);
    if (rec && !rec.own && rec.scorer && rec.team === team) {
      const scorer = v.players.find((p) => p.team === team && p.name === rec.scorer);
      if (scorer) {
        this.moves.celebrate(scorer.id, pickCelebration(scorer.name, v.stats!.goals.length));
        const at = this.host.body(scorer.id)?.position;
        if (at) {
          for (const p of v.players) {
            if (p.id === scorer.id || p.team !== team) continue;
            const b = this.host.body(p.id)?.position;
            if (b && Math.hypot(b.x - at.x, b.z - at.z) < 4.5) this.moves.highFive(p.id);
          }
        }
      }
    }
    this.pending = { goalAt: now, startAt: now + REPLAY.startAfterMs };
  }

  // ---- Keys ---------------------------------------------------------------------------------------

  /** A key in the hall: Tab for the stats, Space or Esc skips a replay, Esc closes the stats. True when it was ours. */
  key(e: KeyboardEvent): boolean {
    if (!this.active || isTyping(e)) return false;
    if (this.run && (e.code === 'Space' || e.code === 'Escape')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.endReplay();
      return true;
    }
    if (e.code === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey && !document.querySelector('.backdrop')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.togglePanel();
      return true;
    }
    if (e.code === 'Escape' && this.panelOpen) {
      // Closing it leaves mouse-look as it was (the panel never takes the mouse).
      e.preventDefault();
      e.stopImmediatePropagation();
      this.togglePanel(false);
      return true;
    }
    return false;
  }

  togglePanel(open = !this.panelOpen) {
    this.panelOpen = open;
    this.panelKey = '';
    if (this.panel) this.panel.hidden = !this.active || !open;
    this.renderPanel();
  }

  // ---- Every frame ----------------------------------------------------------------------------------

  /** After the hall's frame (bodies posed, the ball placed): kits, moves, recording, the replay. */
  update(dt: number, view: SoccerView | null, ball: { shown: { x: number; y: number; z: number }; b: { x: number; y: number; z: number; vx: number; vz: number } }, clockMs: number) {
    if (!this.active) return;
    this.view = view;
    const now = performance.now();
    const players = view?.players ?? [];
    this.syncKits(players);

    if (this.pending && now >= this.pending.startAt) {
      const g = this.pending.goalAt;
      this.pending = null;
      const clip = this.buffer.clip(g - REPLAY.backMs, g + REPLAY.afterMs);
      if (clip && view && (view.phase === 'goal' || view.phase === 'over')) this.startReplay(new ReplayRun(clip, now));
    }

    if (this.run) this.replayFrame(dt, now);
    else {
      // Recording what's shown, for the next replay.
      const s = ball.shown;
      this.buffer.record(
        now,
        [s.x, s.y, s.z],
        players.flatMap((p) => {
          const b = this.host.body(p.id);
          return b ? [[p.id, b.position.x, b.position.z, b.rotation.y] as [string, number, number, number]] : [];
        }),
      );
      // Live moves: dives, kicks, celebrations.
      for (const p of players) {
        const person = this.host.person?.(p.id);
        const body = this.host.body(p.id);
        if (!person || !body) continue;
        if (view?.phase === 'play' || view?.phase === 'waiting' || view?.phase === 'paused') {
          const side = diveSide(p.team, body.position.x, body.position.z, ball.b);
          if (side) this.moves.dive(p.id, side, body.rotation.y);
        }
        this.moves.apply(p.id, person.rig(), dt);
      }
    }
    this.renderSub();
    if (this.panelOpen) this.renderPanel(clockMs);
  }

  private syncKits(players: SoccerView['players']) {
    const want = new Set<string>();
    for (const p of players) {
      const person = this.host.person?.(p.id);
      if (!person) continue;
      want.add(p.id);
      const number = p.number ?? (hashOf(p.name) % 99) + 1;
      const k = this.kits.get(p.id);
      if (k && k.person === person && k.kit.team === p.team && k.kit.name === p.name && k.kit.number === number) continue;
      if (k) this.unkit(p.id);
      this.kits.set(p.id, { kit: dress(person.rig(), p.team, p.name, number), person });
    }
    for (const id of [...this.kits.keys()]) if (!want.has(id)) this.unkit(id);
  }

  private unkit(id: string) {
    const k = this.kits.get(id);
    if (!k) return;
    undress(k.kit);
    this.kits.delete(id);
    this.moves.forget(id);
  }

  // ---- The replay -----------------------------------------------------------------------------------

  private startReplay(run: ReplayRun) {
    this.run = run;
    this.runT = run.clip.from;
    this.cam.fresh = true;
    if (this.badge) {
      this.badge.hidden = false;
      this.badge.replaceChildren(
        h('div.bar.top'),
        h('div.bar.bottom'),
        h('div.tag', {}, h('i.dot'), 'REPLAY', h('small.slow', {}, 'SLOW-MO')),
        h('div.progress', {}, h('i')),
        h('div.skip', {}, h('kbd', {}, 'Space'), ' / ', h('kbd', {}, 'Esc'), ' skip'),
      );
    }
  }

  private endReplay() {
    if (!this.run) return;
    this.run = null;
    if (this.badge) this.badge.hidden = true;
  }

  private replayFrame(dt: number, now: number) {
    const run = this.run!;
    const at = run.at(now);
    const v = this.view;
    if (!at || !v || v.phase === 'kickoff' || v.phase === 'play') return this.endReplay();
    const s = sampleClip(run.clip, at.t);
    // Kicks in the stretch just played.
    for (const k of run.clip.kicks) if (k.t > this.runT && k.t <= at.t) this.moves.kick(k.id);
    const step = at.slow ? dt * REPLAY.slowRate : dt;
    for (const [id, p] of s.players) {
      const body = this.host.body(id);
      if (!body) continue;
      body.position.set(p.x, 0, p.z);
      body.rotation.y = p.rotY;
      body.visible = true;
      const person = this.host.person?.(id);
      if (person) this.moves.apply(id, person.rig(), step, { replaySpeed: p.speed });
    }
    this.runT = at.t;
    // The ball, rolled by how far it went.
    this.room?.setBall(s.ball.x, s.ball.y, s.ball.z, s.ball.x - this.lastBall.x, s.ball.z - this.lastBall.z);
    this.lastBall = { x: s.ball.x, z: s.ball.z };
    this.tvCamera(s.ball, at.progress, at.slow, dt);
    if (this.badge) {
      this.badge.classList.toggle('slow', at.slow);
      const bar = this.badge.querySelector('.progress i') as HTMLElement | null;
      if (bar) bar.style.width = `${Math.round(at.progress * 100)}%`;
    }
  }

  /** A TV camera: up in the east stand, following the ball and swinging slowly round it; lower and closer for the slow motion. */
  private tvCamera(ball: { x: number; y: number; z: number }, p: number, slow: boolean, dt: number) {
    const cam = this.host.camera;
    if (!cam) return;
    const R = SOCCER_ROOM;
    const angle = -0.55 + p * 1.1;
    const r = slow ? 4.6 : 8;
    const up = slow ? 1.7 : 4.2;
    const want = new THREE.Vector3(
      THREE.MathUtils.clamp(ball.x + Math.cos(angle) * r, R.minX + 0.5, R.maxX - 0.5),
      Math.min(R.height - 0.6, ball.y + up),
      THREE.MathUtils.clamp(ball.z + Math.sin(angle) * r, R.minZ + 0.5, R.maxZ - 0.5),
    );
    const look = new THREE.Vector3(ball.x, ball.y + 0.4, ball.z);
    if (this.cam.fresh) {
      this.cam.pos.copy(want);
      this.cam.look.copy(look);
      this.cam.fresh = false;
    } else {
      const k = 1 - Math.exp(-dt * 3.5);
      this.cam.pos.lerp(want, k);
      this.cam.look.lerp(look, 1 - Math.exp(-dt * 8));
    }
    cam.position.copy(this.cam.pos);
    cam.lookAt(this.cam.look);
  }

  // ---- What it says -------------------------------------------------------------------------------

  /** The line under the score bar: the last goal, and Tab for the stats. */
  private renderSub() {
    const el = this.sub;
    if (!el) return;
    const last = this.view?.stats?.goals.at(-1);
    const key = `${last ? scorerLine(last) + last.team + (last.assist ?? '') : ''}|${!!this.view?.players.length}`;
    if (key === this.subKey) return;
    this.subKey = key;
    el.replaceChildren(
      ...(last ? [h(`span.goal.${last.team}`, {}, scorerLine(last), ...(last.assist ? [h('small', {}, ` (${last.assist})`)] : []))] : []),
      h('span.tab', {}, h('kbd', {}, 'Tab'), ' stats'),
    );
  }

  private renderPanel(clockMs = this.view?.clockMs ?? 0) {
    const el = this.panel;
    if (!el || !this.panelOpen) return;
    const v = this.view;
    const s: SoccerStats | undefined = v?.stats;
    const key = JSON.stringify([v?.score, v?.phase, clockText(clockMs), s, v?.leaders, v?.players]);
    if (key === this.panelKey) return;
    this.panelKey = key;
    const score = v?.score ?? { red: 0, blue: 0 };
    const t = s?.teams;
    const row = (label: string, a: number, b: number, fmt = (n: number) => String(n)) => {
      const total = a + b || 1;
      return h(
        'div.cmp',
        {},
        h('b.a', {}, fmt(a)),
        h('div.bars', {}, h('i.red', { style: `width:${(a / total) * 100}%` }), h('i.blue', { style: `width:${(b / total) * 100}%` })),
        h('span', {}, label),
        h('b.b', {}, fmt(b)),
      );
    };
    const goals = (team: Team) =>
      h(
        `ul.goals.${team}`,
        {},
        ...(s?.goals.filter((g) => g.team === team) ?? []).map((g) => h('li', {}, scorerLine(g), ...(g.assist ? [h('small', {}, ` assist ${g.assist}`)] : []))),
      );
    // Everyone on the pitch, with their numbers now; those without a touch yet at nothing.
    const players = [...(s?.players ?? [])].map((l) => ({ ...l, number: v?.players.find((p) => p.name === l.name && p.team === l.team)?.number ?? l.number }));
    for (const p of v?.players ?? []) if (!players.some((l) => l.name === p.name && l.team === p.team)) players.push({ name: p.name, team: p.team, number: p.number, goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, saves: 0 });
    players.sort((a, b) => (a.team === b.team ? 0 : a.team === 'red' ? -1 : 1));
    el.replaceChildren(
      h('button.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Tab or Esc)', onclick: () => this.togglePanel(false) }, '✕'),
      h(
        'header',
        {},
        h('span.team.red', {}, TEAM_NAME.red),
        h('b.score', {}, `${score.red} : ${score.blue}`),
        h('span.team.blue', {}, TEAM_NAME.blue),
        h('span.clock', {}, `${clockText(clockMs)} · ${v?.phase === 'over' ? 'full time' : (v?.phase ?? 'waiting')}`),
      ),
      h('div.scorers', {}, goals('red'), goals('blue')),
      ...(s?.mvp ? [h('p.mvp', { style: `color:${TEAM_COLOR[s.mvp.team]}` }, `★ Man of the match: ${s.mvp.name} (${s.mvp.score} pts)`)] : []),
      h(
        'section.compare',
        {},
        row('Possession', t?.red.possession ?? 50, t?.blue.possession ?? 50, fmtPos),
        row('Shots', t?.red.shots ?? 0, t?.blue.shots ?? 0),
        row('On target', t?.red.onTarget ?? 0, t?.blue.onTarget ?? 0),
        row('Passes', t?.red.passes ?? 0, t?.blue.passes ?? 0),
        row('Saves', t?.red.saves ?? 0, t?.blue.saves ?? 0),
      ),
      h(
        'table.players',
        {},
        h('thead', {}, h('tr', {}, ...['#', 'Player', 'G', 'A', 'Sh', 'OT', 'Pa', 'Sv'].map((c) => h('th', {}, c)))),
        h(
          'tbody',
          {},
          ...(players.length
            ? players.map((p) => h(`tr.${p.team}`, {}, h('td', {}, p.number ? String(p.number) : '–'), h('td.name', {}, p.name), ...[p.goals, p.assists, p.shots, p.onTarget, p.passes, p.saves].map((n) => h('td', {}, String(n)))))
            : [h('tr', {}, h('td.empty', { colspan: '8' }, 'No match yet: E at the halfway boards to play'))]),
        ),
      ),
      h('h3', {}, '🏆 Hall of Fame'),
      h(
        'ol.leaders',
        {},
        ...((v?.leaders ?? []).length
          ? v!.leaders!.map((r) => h('li', {}, h('span.name', {}, `${r.name}${r.number ? ` #${r.number}` : ''}`), h('span.nums', {}, `${r.goals} G · ${r.assists} A · ${r.wins}/${r.matches} W · ${r.mvp} MVP`)))
          : [h('li.empty', {}, 'Nobody yet: finish a match to get on it')]),
      ),
      h('p.foot', {}, h('kbd', {}, 'Tab'), ' closes this · MVP = goals×3 + assists×2 + shots on target + saves'),
    );
  }
}

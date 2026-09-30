import * as THREE from 'three';
import { BOSS_DESK } from '../../shared/layout';
import type { WorkerInfo } from '../../shared/protocol';
import { isAsleep } from '../../shared/status';
import { store } from '../state';
import { paintScreen } from '../world/laptop';
import { h, openModal, STATUS_LABEL, type Modal } from './dom';

// Fork: working at the boss's desk up in the loft (see FORK.md, "Working at the boss desk").
//
// The boss's chair is yours: a worker or shell hired at the boss desk isn't drawn sitting there (it
// would take the chair from under you). It's your own terminal instead, playing on the boss's monitor
// the way a worker's plays on its laptop, and Minesweeper's board comes back once it's gone home.
// Sitting in the boss's chair, E opens a little chooser: hire a Claude worker, open a shell, or play.

/** What the chooser does, from main.ts (the same things a desk does). */
export interface BossDeskActions {
  /** The hire prompt, with the provider choice, as at an empty desk. */
  hire(deskId: string): void;
  /** A shell at the desk. */
  shell(deskId: string): void;
  terminal(workerId: string): void;
  resume(w: WorkerInfo): void;
  /** Send it home, asking first. */
  sendHome(workerId: string): void;
  /** Minesweeper (ui/arcade.ts). */
  play(): void;
}

/** The monitor's canvas: 16:9 like the monitor (0.8 × 0.45), with a strip along the top saying whose terminal it is. */
const W = 1280;
const H = 720;
const STRIP = 54;

let styled = false;
/** Its few styles, kept here rather than in style.css so upstream's changes there never conflict with it. */
function addStyles() {
  if (styled) return;
  styled = true;
  document.head.append(
    h(
      'style',
      {},
      `.modal.bossdesk { width: min(420px, 100%); }
.bossdesk .body { display: flex; flex-direction: column; gap: 10px; }
.bossdesk .boss-pick { justify-content: flex-start; width: 100%; padding: 10px 14px; font-size: 16px; white-space: normal; text-align: left; }
.bossdesk .boss-pick small { display: block; font-size: 12px; font-weight: 700; color: var(--muted); }
.bossdesk .boss-pick.primary small, .bossdesk .boss-pick.danger small { color: inherit; opacity: .9; }`,
    ),
  );
}

/** The one at the boss's desk on this floor. */
export function bossWorker(): WorkerInfo | undefined {
  if (store.me.party) return undefined; // fork: a party guest's boss PC is just Minesweeper (party.ts)
  return store.workerAtDesk(BOSS_DESK.id);
}

export class BossDesk {
  private modal: Modal | null = null;
  private readonly mat: THREE.MeshBasicMaterial;
  /** Minesweeper's picture of the monitor (ui/arcade.ts put it there first). */
  private readonly game: THREE.Texture | null;
  private readonly canvas = document.createElement('canvas');
  private readonly texture = new THREE.CanvasTexture(this.canvas);
  /** What's painted: the worker, its screen's version and the strip's text, so it only repaints on a change. */
  private drawn = '';
  private paintedAt = 0;

  constructor(
    screen: THREE.Mesh,
    private readonly act: BossDeskActions,
  ) {
    this.mat = screen.material as THREE.MeshBasicMaterial;
    this.game = this.mat.map;
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  /** Closes the chooser, if it's open (the building changed maps under you). */
  stop() {
    this.modal?.close();
  }

  /** What E does in the boss's chair, for the hint. */
  useLabel(): string {
    const w = bossWorker();
    if (store.me.guest) return w ? 'Watch or play' : 'Play Minesweeper';
    return w ? 'Terminal or play' : 'Work or play';
  }

  /** What's on the monitor, for the hint as you walk up. */
  aside(): string {
    const w = bossWorker();
    return w ? `${w.kind === 'shell' ? '💻' : '🧠'} ${w.name}'s terminal on the monitor` : '💣 Minesweeper on the monitor';
  }

  /** E in the boss's chair: what to do at the boss's PC. A guest with nothing to watch just plays. */
  open() {
    if (this.modal) return;
    const w = bossWorker();
    const guest = !!store.me.guest;
    if (guest && !w) return this.act.play();
    addStyles();
    const pick = (icon: string, title: string, note: string, run: () => void, cls = '') => {
      const b = h(`button.btn.boss-pick${cls}`, { type: 'button' }, h('span', {}, `${icon} `), h('span', {}, title, h('small', {}, note)));
      b.addEventListener('click', () => {
        this.modal?.close();
        run();
      });
      return b;
    };
    const picks: HTMLElement[] = [];
    if (w && guest) {
      picks.push(pick('👀', `Watch ${w.name}'s terminal`, 'Guests watch, the team types', () => this.act.terminal(w.id)));
    } else if (w) {
      const what = w.kind === 'shell' ? 'your shell' : `${w.name}, your Claude worker`;
      if (w.lost) picks.push(pick('🌿', 'Fix its worktree', 'It was deleted outside the office', () => this.act.resume(w)));
      else if (isAsleep(w.status)) picks.push(pick('💤', `Wake ${w.name} up`, w.kind === 'shell' ? 'Start the shell again' : 'Carry on where it left off', () => this.act.resume(w)));
      picks.push(pick('🖥️', 'Open terminal', `Work with ${what}`, () => this.act.terminal(w.id), '.primary'));
    } else {
      picks.push(
        pick('🧠', 'Claude worker', 'Hire an agent at your desk, with a first task if you like', () => this.act.hire(BOSS_DESK.id), '.primary'),
        pick('💻', 'Shell', 'A terminal of your own in the project', () => this.act.shell(BOSS_DESK.id)),
      );
    }
    picks.push(pick('💣', 'Minesweeper', 'A round on the monitor', () => this.act.play()));
    if (w && !guest) picks.push(pick('👋', 'Send home', `Stops ${w.kind === 'shell' ? 'the shell' : w.name} and frees the desk`, () => this.act.sendHome(w.id), '.danger'));
    const el = h('div.modal.bossdesk', { role: 'dialog', 'aria-label': "The boss's PC" }, h('header', {}, h('h2', {}, "👑 The boss's PC")), h('div.body', {}, ...picks));
    this.modal = openModal(el, { doing: "👑 at the boss's PC", onClose: () => (this.modal = null) });
    setTimeout(() => (picks.find((p) => p.classList.contains('primary')) ?? picks[0]).focus(), 30);
  }

  /** Every frame: the boss desk's terminal on the monitor while someone's there, else Minesweeper. */
  update() {
    const w = bossWorker();
    if (!w) {
      if (this.mat.map !== this.game) this.mat.map = this.game;
      this.drawn = '';
      return;
    }
    if (this.mat.map !== this.texture) this.mat.map = this.texture;
    const screen = store.screens.get(w.id);
    const strip = `${w.kind === 'shell' ? '💻' : '🧠'} ${w.name} · ${stateOf(w)}`;
    const key = `${w.id}|${screen?.version ?? -1}|${strip}`;
    const now = performance.now();
    if (key === this.drawn || now - this.paintedAt < 150) return;
    this.drawn = key;
    this.paintedAt = now;
    const g = this.canvas.getContext('2d')!;
    g.save();
    g.translate(0, STRIP);
    paintScreen(g, W, H - STRIP, screen, placeholderOf(w), 14);
    g.restore();
    g.fillStyle = w.color;
    g.fillRect(0, 0, W, STRIP);
    g.fillStyle = '#fff';
    g.font = '800 32px Nunito, ui-rounded, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(strip, 20, STRIP / 2 + 2);
    this.texture.needsUpdate = true;
  }
}

function stateOf(w: WorkerInfo): string {
  return w.lost ? 'worktree deleted' : (STATUS_LABEL[w.status] ?? w.status);
}

function placeholderOf(w: WorkerInfo): string {
  if (w.lost) return `🌿 ${w.name}'s worktree was deleted`;
  if (w.status === 'offline') return `💤 ${w.name} is asleep`;
  if (w.status === 'exited') return `${w.name} exited`;
  return 'booting…';
}

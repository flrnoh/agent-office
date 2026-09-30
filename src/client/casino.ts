import * as THREE from 'three';
import { CASINO, CASINO_ENTRY, CASINO_NAME, CASINO_ROOM, CASINO_STREET_SPOT, CASINO_TABLE_BY_ID, START_CHIPS, type CasinoServerMsg } from '../shared/casino';
import type { ClientMsg, FloorInfo, ServerMsg } from '../shared/protocol';
import { streetBelow } from '../shared/layout';
import type { Collider, Interactable } from './world/office';
import { buildCasinoInterior, type CasinoInterior } from './world/casino/interior';
import { h, openModal, toast } from './ui/dom';
import { casinoUiFor, chipText, type CasinoSoundKind, type CasinoUi } from './ui/casino/registry';
import { openComingSoon, TABLE_ICON } from './ui/casino/soon';
import './ui/casino/slots'; // registers the slot machines' window
import './ui/casino/casino.css';

/*
 * The casino across the street (flrnoh fork, see FORK.md), on this page: going in and out, the
 * room inside (a place of its own like the roof, built the first time you go in), your chips, and
 * the game windows at its tables. main.ts hooks it in with a few lines; everything else is here.
 */

/** Where you stand, to be put somewhere: main.ts's placeAt. */
type Spot = { x: number; y: number; z: number; rotY: number };

export interface CasinoHost {
  scene: THREE.Scene;
  send(msg: ClientMsg): void;
  /** The floor you're on (store.floor): CASINO while inside. */
  floor(): string | null;
  /** The building's floors, bottom first (builtFloors). */
  floors(): FloorInfo[];
  /** On the office's map (the casino is only on its street). */
  inOffice(): boolean;
  player: { pos: THREE.Vector3; colliders: Collider[]; room: { minX: number; maxX: number; minZ: number; maxZ: number; wall: number; enclosed: boolean } };
  /** Hides the office and everything round it while you're inside, and shows it again after. */
  showOffice(on: boolean): void;
  /** What the player walks into and keeps the camera within, back in the office. */
  officeColliders(): Collider[];
  officeRoom(): CasinoHost['player']['room'];
  /** In the casino there's no rain, and the hall lights itself (see mood). */
  setIndoors(on: boolean): void;
  /** Off to floor `floor` (or the casino), faded, landing `at`: main.ts's trip. */
  trip(floor: string, at?: Spot): void;
  placeAt(at: Spot): void;
  sound(kind: CasinoSoundKind): void;
  noOutline(o: THREE.Object3D): void;
}

const FROM_KEY = 'agent-office.casino.from';

export class CasinoPlace {
  private room: CasinoInterior | null = null;
  /** In the casino now (setPlace). */
  active = false;
  private chips = START_CHIPS;
  private nextTopUpAt: number | undefined;
  private tables = new Map<string, unknown>();
  /** The window open at a table, and which. */
  private open: { table: string; ui: CasinoUi } | null = null;
  private hud: HTMLElement | null = null;
  /** Out through the doors: where to put you once your floor's street is back. */
  private outside: Spot | null = null;
  /** In through the doors: put you just inside them. */
  private arriving = false;
  private warm = new THREE.Color('#ffd9a8');
  private warmGround = new THREE.Color('#5a1427');

  constructor(private host: CasinoHost) {}

  private theRoom(): CasinoInterior {
    if (!this.room) {
      this.room = buildCasinoInterior();
      this.room.group.visible = false;
      this.host.scene.add(this.room.group);
      for (const [id, s] of this.tables) this.room.setTable(id, s);
    }
    return this.room;
  }

  get interactables(): Interactable[] {
    return this.active && this.room ? this.room.interactables : [];
  }

  get pickables(): THREE.Object3D[] {
    return this.active && this.room ? this.room.pickables : [];
  }

  /** The floor you came in from (kept over a reload), else the bottom one. */
  private from(): string | undefined {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(FROM_KEY);
    } catch {
      // private mode: the bottom floor it is
    }
    const floors = this.host.floors();
    return (floors.find((f) => f.id === id) ?? floors[0])?.id;
  }

  /** E at the doors on the street: in you go. */
  go() {
    const here = this.host.floor();
    if (!here || here === CASINO) return;
    try {
      sessionStorage.setItem(FROM_KEY, here);
    } catch {
      // fine
    }
    this.arriving = true;
    this.host.trip(CASINO);
  }

  /** E at the doors inside: back out onto your floor's street, in front of the casino. */
  leave() {
    const to = this.from();
    if (!to) return toast('There is no floor to go back to', 'warn');
    const i = this.host.floors().findIndex((f) => f.id === to);
    const at = { x: CASINO_STREET_SPOT.x, y: streetBelow(Math.max(0, i)), z: CASINO_STREET_SPOT.z, rotY: CASINO_STREET_SPOT.rotY };
    this.outside = at;
    this.closeUi();
    this.host.trip(to, at);
  }

  /**
   * You arrived somewhere (setPlace, from main.ts's): in the casino, its room is what you see and
   * walk in; anywhere else, the office is back.
   */
  setPlace(inside: boolean) {
    if (inside && !this.host.inOffice()) {
      // The building's on a map of its own now: no street, no casino. Back to a floor.
      const to = this.from();
      if (to) this.host.trip(to);
      return;
    }
    if (inside === this.active) return;
    this.active = inside;
    if (inside) {
      const r = this.theRoom();
      r.group.visible = true;
      this.host.showOffice(false);
      this.host.player.colliders = r.colliders;
      this.host.player.room = { minX: CASINO_ROOM.minX, maxX: CASINO_ROOM.maxX, minZ: CASINO_ROOM.minZ, maxZ: CASINO_ROOM.maxZ, wall: 0.3, enclosed: true };
      this.host.setIndoors(true);
      this.showHud(true);
    } else {
      if (this.room) this.room.group.visible = false;
      this.closeUi();
      this.host.showOffice(true);
      this.host.player.colliders = this.host.officeColliders();
      this.host.player.room = this.host.officeRoom();
      this.host.setIndoors(false);
      this.showHud(false);
    }
  }

  /**
   * The building's map changed while you're inside (main.ts put its world back): on the office's,
   * the room is still what you see and walk in; on a map of its own there's no casino, so back to a floor.
   */
  refresh() {
    if (!this.active || !this.room) return;
    if (!this.host.inOffice()) {
      const to = this.from();
      if (to) this.host.trip(to);
      return;
    }
    this.host.showOffice(false);
    this.host.player.colliders = this.room.colliders;
    this.host.player.room = { minX: CASINO_ROOM.minX, maxX: CASINO_ROOM.maxX, minZ: CASINO_ROOM.minZ, maxZ: CASINO_ROOM.maxZ, wall: 0.3, enclosed: true };
    // (it may have put you in the office's elevator meanwhile)
    const p = this.host.player.pos;
    if (!(p.x > CASINO_ROOM.minX && p.x < CASINO_ROOM.maxX && p.z > CASINO_ROOM.minZ && p.z < CASINO_ROOM.maxZ)) this.host.placeAt({ x: CASINO_ENTRY.x, y: 0, z: CASINO_ENTRY.z, rotY: CASINO_ENTRY.rotY });
  }

  /** After a welcome or a trip: where you stand, now the place you're in is set up. */
  arrived() {
    if (this.active) {
      const p = this.host.player.pos;
      const inside = p.x > CASINO_ROOM.minX && p.x < CASINO_ROOM.maxX && p.z > CASINO_ROOM.minZ && p.z < CASINO_ROOM.maxZ && Math.abs(p.y) < 1;
      if (this.arriving || !inside) this.host.placeAt({ x: CASINO_ENTRY.x, y: 0, z: CASINO_ENTRY.z, rotY: CASINO_ENTRY.rotY });
      this.arriving = false;
      this.outside = null;
      // Back after a reconnect with a window open: sit down at it again.
      if (this.open) this.host.send({ t: 'casino.sit', table: this.open.table });
      return;
    }
    this.arriving = false;
    if (this.outside) {
      this.host.placeAt(this.outside);
      this.outside = null;
    }
  }

  // ---- At the tables ----------------------------------------------------------------------------

  /** E at something of the casino's: the doors (in or out), a table, the cashier. True when it was ours. */
  use(it: Interactable, key: string): boolean {
    if (it.kind === 'casino') {
      if (key === 'E') {
        if (this.active) this.leave();
        else this.go();
      }
      return true;
    }
    if (it.kind !== 'casino-table') return false;
    if (key !== 'E' || !it.table) return true;
    if (it.table === 'cashier') this.cashier();
    else this.sitAt(it.table);
    return true;
  }

  private sitAt(id: string) {
    const def = CASINO_TABLE_BY_ID.get(id);
    if (!def || !this.active) return;
    this.closeUi();
    this.host.send({ t: 'casino.sit', table: id });
    const open = casinoUiFor(def.kind) ?? openComingSoon;
    let ui: CasinoUi | null = null;
    ui = open({
      table: def,
      state: this.tables.get(id) ?? null,
      chips: this.chips,
      nextTopUpAt: this.nextTopUpAt,
      act: (action, data) => this.host.send({ t: 'casino.act', table: id, action, ...(data !== undefined ? { data } : {}) }),
      sound: (k) => this.host.sound(k),
      toast: (text, level) => toast(text, level),
      closed: () => {
        if (this.open?.ui !== ui) return;
        this.open = null;
        this.host.send({ t: 'casino.stand' });
      },
    });
    this.open = { table: id, ui };
  }

  private closeUi() {
    const o = this.open;
    if (!o) return;
    o.ui.close();
    // (closed() sends the stand and clears it; if the window didn't call it, do it here.)
    if (this.open === o) {
      this.open = null;
      this.host.send({ t: 'casino.stand' });
    }
  }

  private cashier() {
    const when = this.nextTopUpAt ? new Date(this.nextTopUpAt).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : null;
    const el = h(
      'div.modal.casino-modal',
      { role: 'dialog', 'aria-label': 'Cashier' },
      h('header', {}, h('h2', {}, '💰 Cashier'), h('span.casino-chips', {}, `🪙 ${chipText(this.chips)}`)),
      h(
        'div.body',
        {},
        h('p', { style: 'margin:0;font-weight:800;font-size:16px' }, `You have ${chipText(this.chips)} chips.`),
        h('p.casino-note', {}, `Everything here is play money. Nothing can be bought, and chips are worth nothing outside these walls. Everyone starts with ${chipText(START_CHIPS)}, and once a day anyone below that is topped back up to ${chipText(START_CHIPS)}.`),
        h('p.casino-note', {}, when ? `Your next top-up: ${when}.` : `You're at ${chipText(START_CHIPS)} or more: no top-up needed.`),
      ),
      h('footer', {}, h('span.grow', {}, 'Play for fun. If gambling stops being fun, stop.')),
    );
    this.host.sound('chip');
    openModal(el, { doing: 'at the cashier' });
  }

  // ---- The office's news ------------------------------------------------------------------------

  /** A message from the office: the casino's own, or a note that you're somewhere else now. */
  onMessage(msg: ServerMsg) {
    if (!msg.t.startsWith('casino.')) return;
    const m = msg as CasinoServerMsg;
    switch (m.t) {
      case 'casino.wallet': {
        const up = m.chips !== this.chips;
        this.chips = m.chips;
        this.nextTopUpAt = m.nextTopUpAt;
        this.renderHud(up);
        this.open?.ui.wallet(m.chips, m.nextTopUpAt);
        break;
      }
      case 'casino.table':
        this.tables.set(m.table, m.state);
        this.room?.setTable(m.table, m.state);
        if (this.open?.table === m.table) this.open.ui.table(m.state);
        break;
      case 'casino.result': {
        if (this.open && this.open.table === m.table && this.open.ui.result(m.text, m.delta, m.data)) break;
        // Turned away from a table you just walked up to: the window closes.
        if (this.open && this.open.table === m.table && /playing that one|table is full/.test(m.text)) this.closeUi();
        toast(m.text);
        break;
      }
    }
  }

  // ---- What it says -----------------------------------------------------------------------------

  /** The hint bar over something of the casino's. */
  hint(it: Interactable, title: (t: string) => HTMLElement, key: (k: string, label: string) => HTMLElement, aside: (t: string) => HTMLElement): { k: string; parts: (HTMLElement | string)[] } {
    if (it.kind === 'casino') return this.active ? { k: 'casino-out', parts: [title('🚪 Street'), key('E', 'Go out')] } : { k: 'casino-in', parts: [title(`🎰 ${CASINO_NAME}`), aside('play chips only'), key('E', 'Go in')] };
    if (it.table === 'cashier') return { k: `cashier${this.chips}`, parts: [title('💰 Cashier'), aside(`🪙 ${chipText(this.chips)}`), key('E', 'Chips')] };
    const def = it.table ? CASINO_TABLE_BY_ID.get(it.table) : undefined;
    if (!def) return { k: '', parts: [] };
    const state = this.tables.get(def.id) as { player?: string; soon?: boolean; seated?: string[] } | undefined;
    const icon = TABLE_ICON[def.kind];
    if (def.kind === 'slots') {
      const busy = state?.player;
      return { k: `${def.id}|${busy ?? ''}`, parts: [title(`${icon} ${def.name}`), ...(busy ? [aside(`${busy} is playing`)] : []), key('E', 'Play')] };
    }
    const n = state?.seated?.length ?? 0;
    return { k: `${def.id}|${n}`, parts: [title(`${icon} ${def.name}`), aside(`${state?.soon ? 'coming soon · ' : ''}${n}/${def.seats} seated`), key('E', 'Sit down')] };
  }

  /** The top bar's title, inside. */
  title(): { name: string; meta: string } {
    return { name: `🎰 ${CASINO_NAME}`, meta: `🪙 ${chipText(this.chips)} chips · play money only` };
  }

  private showHud(on: boolean) {
    if (on && !this.hud) {
      this.hud = h('div.casino-hud', { 'aria-live': 'polite' });
      document.body.append(this.hud);
    }
    if (this.hud) this.hud.hidden = !on;
    this.renderHud(false);
  }

  private renderHud(bump: boolean) {
    const el = this.hud;
    if (!el || el.hidden) return;
    el.replaceChildren(`🪙 ${chipText(this.chips)}`, h('small', {}, 'chips'));
    if (bump) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  // ---- Every frame ------------------------------------------------------------------------------

  update(t: number, dt: number) {
    if (this.active && this.room) this.room.update(t, dt);
  }

  /** Inside, the hall lights itself: warm, no sun through the ceiling, no haze across the room. */
  mood(lights: { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; ambient: THREE.AmbientLight; scene: THREE.Scene }) {
    if (!this.active) return;
    lights.sun.intensity = 0;
    lights.hemi.color.copy(this.warm);
    lights.hemi.groundColor.copy(this.warmGround);
    lights.hemi.intensity = 1.25;
    lights.ambient.color.copy(this.warm);
    lights.ambient.intensity = 0.75;
    const fog = lights.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = 400;
      fog.far = 500;
    }
  }
}

import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { BAG_SLOTS, PLACED_PER_FLOOR, PLACED_PER_OWNER, keepable, type PlacedView, type Spot } from '../../shared/bag.js';
import type { ShopItemId } from '../../shared/shopwares.js';

// flrnoh fork (see FORK.md "The rucksack"): everyone's rucksack, kept per person (account or name, see
// fork/office.ts owner), and what's been put down where (by floor, roof or place), kept for good. Both
// in bags.json, saved a moment after a change.

/** Something put down, as the office keeps it. */
export interface Placed extends Spot {
  id: string;
  item: ShopItemId;
  owner: string;
  by: string;
  at: number;
}

export class Bags {
  private bags = new Map<string, ShopItemId[]>();
  private placed = new Map<string, Placed[]>();
  private file: string | null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir?: string) {
    this.file = dataDir ? path.join(dataDir, 'bags.json') : null;
    this.load();
  }

  /** What's in `owner`'s rucksack. */
  of(owner: string): ShopItemId[] {
    return [...(this.bags.get(owner) ?? [])];
  }

  /** Puts `item` in the rucksack (at `slot`, else at the end): false when it's full. */
  put(owner: string, item: ShopItemId, slot?: number): boolean {
    const bag = this.bags.get(owner) ?? [];
    if (bag.length >= BAG_SLOTS) return false;
    bag.splice(slot ?? bag.length, 0, item);
    this.bags.set(owner, bag);
    this.changed();
    return true;
  }

  /** Takes `slot` out of the rucksack. */
  take(owner: string, slot: number): ShopItemId | undefined {
    const bag = this.bags.get(owner);
    const item = bag?.[slot];
    if (!bag || !item) return undefined;
    bag.splice(slot, 1);
    if (!bag.length) this.bags.delete(owner);
    this.changed();
    return item;
  }

  /** What stands on `floor`, as `owner` sees it. */
  on(floor: string, owner: string): PlacedView[] {
    return (this.placed.get(floor) ?? []).map((p) => this.view(p, owner));
  }

  view(p: Placed, owner: string): PlacedView {
    return { id: p.id, item: p.item, by: p.by, mine: p.owner === owner, x: p.x, y: p.y, z: p.z, rotY: p.rotY };
  }

  /** Why `owner` can't put anything else down on `floor` (too much of theirs, or of everyone's), or null. */
  full(floor: string, owner: string): string | null {
    let mine = 0;
    for (const list of this.placed.values()) for (const p of list) if (p.owner === owner) mine++;
    if (mine >= PLACED_PER_OWNER) return `You've put ${PLACED_PER_OWNER} things down around the building already: pick some up first`;
    if ((this.placed.get(floor)?.length ?? 0) >= PLACED_PER_FLOOR) return 'There’s no room for anything else here';
    return null;
  }

  /** Puts `item` down at `spot` on `floor`. */
  place(floor: string, owner: string, by: string, item: ShopItemId, spot: Spot, now = Date.now()): Placed {
    const p: Placed = { id: randomUUID().slice(0, 12), item, owner, by, ...spot, at: now };
    const list = this.placed.get(floor) ?? [];
    list.push(p);
    this.placed.set(floor, list);
    this.changed();
    return p;
  }

  /** Picks `id` up off `floor` again, if it's `owner`'s. */
  pick(floor: string, id: string, owner: string): Placed | undefined {
    const list = this.placed.get(floor);
    const i = list?.findIndex((p) => p.id === id) ?? -1;
    if (!list || i < 0 || list[i].owner !== owner) return undefined;
    const [p] = list.splice(i, 1);
    if (!list.length) this.placed.delete(floor);
    this.changed();
    return p;
  }

  /** Who `id` on `floor` belongs to, by name, if it's there. */
  find(floor: string, id: string): Placed | undefined {
    return this.placed.get(floor)?.find((p) => p.id === id);
  }

  private changed() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 500);
    this.saveTimer.unref?.();
  }

  /** Writes bags.json now (a pending save is folded in). */
  save() {
    if (!this.file) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const data = { bags: Object.fromEntries(this.bags), placed: Object.fromEntries(this.placed) };
    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(data) + '\n', { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, this.file);
    } catch (err) {
      console.error(`agent-office: couldn't write ${this.file}: ${(err as Error).message}`);
    }
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { bags?: Record<string, unknown>; placed?: Record<string, unknown> };
      for (const [owner, v] of Object.entries(raw.bags ?? {})) {
        const items = Array.isArray(v) ? v.filter(keepable).slice(0, BAG_SLOTS) : [];
        if (items.length) this.bags.set(owner, items);
      }
      for (const [floor, v] of Object.entries(raw.placed ?? {})) {
        const list = (Array.isArray(v) ? v : []).filter(isPlaced).slice(0, PLACED_PER_FLOOR);
        if (list.length) this.placed.set(floor, list);
      }
    } catch (err) {
      console.error(`agent-office: couldn't read ${this.file}: ${(err as Error).message}`);
    }
  }
}

function isPlaced(v: unknown): v is Placed {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  const n = (k: string) => typeof p[k] === 'number' && Number.isFinite(p[k]);
  return typeof p.id === 'string' && keepable(p.item) && typeof p.owner === 'string' && typeof p.by === 'string' && n('x') && n('y') && n('z') && n('rotY') && n('at');
}

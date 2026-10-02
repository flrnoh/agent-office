import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isInterior } from '../shared/interiors.js';

// flrnoh fork (see FORK.md, "Each storey its own interior"): the interiors admins picked for floors in
// the elevator, by floor id, in .agent-office/interiors.json. A floor nobody picked one for is
// furnished the way its place in the stack furnishes it (shared/interiors.ts), so it isn't in here. A
// floor taken off the building keeps its pick, for when it's added again.

export class Interiors {
  private file: string;
  private picks = new Map<string, string>();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'interiors.json');
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [id, interior] of Object.entries(saved)) if (isInterior(interior)) this.picks.set(id, interior);
      }
    } catch {
      // none picked yet
    }
  }

  /** The interior picked for floor `id`, if any. */
  of(id: string): string | undefined {
    return this.picks.get(id);
  }

  /** Furnishes floor `id` in `interior`, or with null the way its place does. Whether anything changed (an unknown interior doesn't). */
  set(id: string, interior: unknown): boolean {
    if (interior !== null && !isInterior(interior)) return false;
    if ((this.picks.get(id) ?? null) === interior) return false;
    if (interior === null) this.picks.delete(id);
    else this.picks.set(id, interior);
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.picks), null, 2) + '\n', { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      console.error(`agent-office: couldn't save the floors' interiors: ${(err as Error).message}`);
    }
    return true;
  }
}

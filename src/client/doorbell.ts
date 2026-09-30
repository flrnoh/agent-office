import type { PeerInfo } from '../shared/protocol';

/**
 * The doorbell (flrnoh fork, see FORK.md): a ding-dong for everyone when a person comes into the
 * office. Only people ring it: workers aren't peers. A reload, a dropped connection coming back or a
 * second tab of someone already here doesn't ring, and a crowd arriving at once rings once.
 */

/** Someone gone for less than this and back is a reload or a blip, not an arrival. */
export const BACK_MS = 90_000;
/** At most one ring this often, however many come in. */
export const RING_GAP_MS = 4_000;

export class Doorbell {
  /** Who's in the office now, by connection. */
  private names = new Map<string, string>();
  /** When each name was last seen leaving. */
  private leftAt = new Map<string, number>();
  private rangAt = -Infinity;

  constructor(
    private ring: () => void,
    private note: (text: string) => void,
  ) {}

  /** The people already here when you arrive (welcome, a floor's people): they don't ring. */
  know(peers: Iterable<PeerInfo>) {
    for (const p of peers) this.names.set(p.id, p.name);
  }

  /** Someone connected. Rings (and says who) unless it's you, a return or another tab of theirs. */
  joined(p: PeerInfo, you: string, now = Date.now()): boolean {
    const here = [...this.names].some(([id, name]) => name === p.name && id !== p.id);
    this.names.set(p.id, p.name);
    if (p.id === you || here) return false;
    const left = this.leftAt.get(p.name);
    if (left !== undefined && now - left < BACK_MS) return false;
    this.note(`🔔 ${p.name} came in`);
    if (now - this.rangAt >= RING_GAP_MS) {
      this.rangAt = now;
      this.ring();
    }
    return true;
  }

  left(id: string, now = Date.now()) {
    const name = this.names.get(id);
    this.names.delete(id);
    if (name !== undefined && ![...this.names.values()].includes(name)) this.leftAt.set(name, now);
  }
}

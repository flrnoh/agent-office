import * as THREE from 'three';
import { JETTY } from '../../../shared/beach';
import type { Collider } from '../types';
import { mesh, textPlane, toon } from '../toon';
import { G, box } from './kit';

// The far end of the pier, made for swimming (flrnoh fork, see FORK.md "A day at the beach"): its end
// left open to jump off, a diving board out over the water, and a swim ladder down its south side
// through a gap in the rail, to climb back up (features/beach/swim.ts).

/** How far along the south rail from the pier's end the gap for the ladder reaches (m). */
export const LADDER_GAP = 2.3;

export function buildJettyFun(into: THREE.Group, colliders: Collider[], labels: THREE.Group) {
  const steel = toon('#d8dde3');
  const { x1, z, deck, board, ladder } = JETTY;
  // The diving board: a blue plank on a block at the end of the deck, its tip out over the water.
  const len = board.x1 - board.x0;
  into.add(mesh(box(len, 0.08, board.width), toon('#118ab2'), (board.x0 + board.x1) / 2, G + board.top - 0.04, z));
  into.add(mesh(box(0.06, 0.02, board.width + 0.01), toon('#ffd166'), board.x0 + 0.05, G + board.top + 0.005, z));
  into.add(mesh(box(0.7, board.top - deck, board.width + 0.1), toon('#7f5539'), board.x1 - 0.35, G + deck + (board.top - deck) / 2, z));
  colliders.push({ minX: board.x0, maxX: board.x1, minZ: z - board.width / 2, maxZ: z + board.width / 2, bottom: G + board.top - 0.12, top: G + board.top });
  // The swim ladder: two steel rails down into the water, rungs, and grab handles curling over the deck.
  for (const s of [-1, 1]) {
    into.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), steel, ladder.x + s * 0.28, G - 0.6, ladder.z));
    const handle = mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 12, Math.PI), steel, ladder.x + s * 0.28, G + deck + 0.4, ladder.z - 0.32);
    handle.rotation.y = Math.PI / 2;
    into.add(handle);
  }
  for (let y = -1.5; y < 0.2; y += 0.3) into.add(mesh(box(0.56, 0.04, 0.06), steel, ladder.x, G + y, ladder.z));
  // A sign at the end: jumping allowed.
  into.add(mesh(box(0.08, 1.6, 0.08), toon('#3d405b'), x1 + 0.4, G + deck + 0.8, z - JETTY.width / 2 + 0.15));
  const sign = textPlane('🏊 Springen erlaubt!', { color: '#ffffff', bg: '#118ab2', border: '#ffffff', size: 44 });
  sign.scale.setScalar(0.8);
  sign.position.set(x1 + 0.4, G + deck + 1.75, z - JETTY.width / 2 + 0.15);
  sign.rotation.y = Math.PI / 2;
  labels.add(sign);
}

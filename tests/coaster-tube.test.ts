import test from 'node:test';
import assert from 'node:assert/strict';
import { coasterTrack, poseAt } from '../src/shared/coaster-track.js';
import { CARS, CAR_LENGTH, SEAT_SIDE, TUBE_PORTALS, TUBE_RADIUS, TUBE_RING, TUBE_UP, carOffset } from '../src/shared/coaster.js';
import { HEART } from '../src/shared/coaster-route.js';
import { levels } from '../src/shared/coaster-keepout.js';
import { FLOOR, WALL_HEIGHT, WALL_T } from '../src/shared/layout.js';

// flrnoh fork (see FORK.md "Der Brecher"): through the ground floor in the glass tube, nobody bumps
// their head: every rider's actual figure (the same Person the page draws, sat in the seat, hands in the
// lap or flung up and waving), in every seat, along the track with its banking, keeps a good margin to
// the glass, the ceiling and the edges of the holes in the walls.

const STOREYS = Array.from({ length: 20 }, (_, i) => i + 1);
/** How much room every rider keeps: to the glass, and to the ceiling and the holes' edges. */
const GLASS = 0.25;
const ROOM = 0.3;

type P2 = [number, number];

/** The convex hull of points (x, y), anticlockwise. */
function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const hi: P2[] = [];
  for (const q of p.reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/**
 * A rider seen end on, in their seat's frame (x across, y up from their feet), every look we try, hands
 * down and up (as world/coaster riders.ts raises them, waving either way), and how far they reach along
 * the track.
 */
async function riderProfile(): Promise<{ outline: P2[]; along: [number, number] }> {
  const THREE = await import('three');
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) }) }) };
  const { Person } = await import('../src/client/world/character/person.js');
  const { SEAT_PAN } = await import('../src/client/world/coaster/train.js');
  const { lookFromSeed } = await import('../src/shared/avatar.js');
  const pts: P2[] = [];
  let zMin = 0;
  let zMax = 0;
  const v = new THREE.Vector3();
  for (let seed = 0; seed < 24; seed++) {
    for (const pose of ['down', 'up-', 'up+'] as const) {
      const p = new Person('Rider', '#4f86f7', lookFromSeed(`rider-${seed}`));
      p.sit(SEAT_PAN);
      p.update(0.016, 0, false, false);
      if (pose !== 'down') {
        const wave = pose === 'up+' ? 0.14 : -0.14;
        const { armL, armR } = p.limbs();
        armL.rotation.x = armR.rotation.x = -0.35;
        armL.rotation.z = -2.55 + wave;
        armR.rotation.z = 2.55 - wave;
      }
      p.root.updateMatrixWorld(true);
      p.root.traverseVisible((o) => {
        const m = o as import('three').Mesh;
        if (!m.isMesh || (o as unknown as { isSprite?: boolean }).isSprite) return;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          pts.push([v.x, v.y]);
          zMin = Math.min(zMin, v.z);
          zMax = Math.max(zMax, v.z);
        }
      });
    }
  }
  return { outline: hull(pts), along: [zMin, zMax] };
}

test('coaster tube: every rider’s head and raised hands clear the glass, the ceiling and the walls’ holes, in every seat', async () => {
  const rider = await riderProfile();
  // The seat's feet in the car's frame (world/coaster/train.ts: the floor over the rails, the heartline at 0).
  const FEET = -HEART + 0.35;
  const SEAT_Z = -0.06;
  // The cars themselves too: the tub's sides and its high back.
  const tub: P2[] = [
    [-0.73, FEET - 0.16],
    [0.73, FEET - 0.16],
    [-0.73, FEET + 0.97],
    [0.73, FEET + 0.97],
  ];
  const tallest = Math.max(...rider.outline.map((q) => q[1]));
  assert.ok(tallest > 1.5 && tallest < 2.2, `a seated rider ${tallest.toFixed(2)} m from their feet up`);
  for (const N of STOREYS) {
    const track = coasterTrack(N);
    const { ground } = levels(N);
    const tun = track.zones.find((z) => z.kind === 'tunnel')!;
    const bad = new Set<string>();
    let checked = 0;
    for (let s = tun.from - 4; s < tun.to + 4; s += 0.25) {
      for (let car = 0; car < CARS; car++) {
        // Along the car: its seats' riders, and the tub end to end.
        const parts: { at: number; pts: P2[] }[] = [];
        for (const side of [-1, 1]) for (const dz of [rider.along[0], 0, rider.along[1]]) parts.push({ at: SEAT_Z + dz, pts: rider.outline.map(([x, y]) => [side * SEAT_SIDE + x, FEET + y]) });
        for (const dz of [-CAR_LENGTH / 2, CAR_LENGTH / 2]) parts.push({ at: dz, pts: tub });
        for (const { at, pts } of parts) {
          const sc = s + carOffset(car) + at;
          const p = poseAt(track, sc);
          const inTube = sc > tun.from + 0.3 && sc < tun.to - 0.3;
          for (const [x, y] of pts) {
            const w = [p.x + p.b[0] * x + p.n[0] * y, p.y + p.b[1] * x + p.n[1] * y, p.z + p.b[2] * x + p.n[2] * y];
            const fy = w[1] - ground;
            const inRoom = w[0] > FLOOR.minX - WALL_T && w[0] < FLOOR.maxX + WALL_T && w[2] > FLOOR.minZ - WALL_T && w[2] < FLOOR.maxZ + WALL_T;
            if (inTube) {
              checked++;
              // Inside the glass, a good margin off it.
              const r = Math.hypot(x, y - TUBE_UP);
              if (r > TUBE_RADIUS - GLASS) bad.add(`against the glass at ${sc.toFixed(1)} m (${(TUBE_RADIUS - r).toFixed(2)} m to spare)`);
            }
            if (!inRoom) continue;
            // Under the ceiling with room to spare.
            if (fy > WALL_HEIGHT - ROOM) bad.add(`under the ceiling at ${sc.toFixed(1)} m (${(WALL_HEIGHT - fy).toFixed(2)} m to spare)`);
            // Going through a wall: well inside its hole.
            const inSouth = w[2] > FLOOR.maxZ;
            const inNorth = w[2] < FLOOR.minZ;
            if (inSouth || inNorth) {
              const o = TUBE_PORTALS[inSouth ? 0 : 1];
              if (Math.abs(w[0] - o.u) > o.width / 2 - ROOM || fy < o.y0 + ROOM || fy > o.y1 - ROOM) bad.add(`at the ${o.wall} wall's hole edge at ${sc.toFixed(1)} m`);
            }
          }
        }
      }
    }
    assert.ok(checked > 10000, `${N}: ${checked} points checked in the tube`);
    assert.deepEqual([...bad].slice(0, 12), [], `${N} storeys`);
  }
});

test('coaster tube: the glass and its rings go through the walls’ holes and stay under the ceiling', () => {
  for (const N of STOREYS) {
    const track = coasterTrack(N);
    const { ground } = levels(N);
    const tun = track.zones.find((z) => z.kind === 'tunnel')!;
    const bad = new Set<string>();
    // The glass all along, and the rings round it where it goes through the walls (world/coaster/track.ts).
    const rings = [tun.from + 1.15, track.marks.tunnelEnd];
    const at: number[] = [];
    for (let s = tun.from; s <= tun.to; s += 0.25) at.push(s);
    for (const s of [...at, ...rings]) {
      const R = TUBE_RADIUS + (rings.includes(s) ? TUBE_RING : 0);
      const p = poseAt(track, s);
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * 2 * Math.PI;
        const x = R * Math.cos(a);
        const y = TUBE_UP + R * Math.sin(a);
        const w = [p.x + p.b[0] * x + p.n[0] * y, p.y + p.b[1] * x + p.n[1] * y, p.z + p.b[2] * x + p.n[2] * y];
        const fy = w[1] - ground;
        const inRoom = w[0] > FLOOR.minX - WALL_T && w[0] < FLOOR.maxX + WALL_T && w[2] > FLOOR.minZ - WALL_T && w[2] < FLOOR.maxZ + WALL_T;
        if (!inRoom) continue;
        if (fy > WALL_HEIGHT - 0.02) bad.add(`the ceiling at ${s.toFixed(1)} m`);
        const inSouth = w[2] > FLOOR.maxZ;
        const inNorth = w[2] < FLOOR.minZ;
        if (inSouth || inNorth) {
          const o = TUBE_PORTALS[inSouth ? 0 : 1];
          if (Math.abs(w[0] - o.u) > o.width / 2 - 0.02 || fy < o.y0 + 0.02 || fy > o.y1 - 0.02) bad.add(`the ${o.wall} wall at ${s.toFixed(1)} m`);
        }
      }
    }
    assert.deepEqual([...bad], [], `${N} storeys`);
  }
});
